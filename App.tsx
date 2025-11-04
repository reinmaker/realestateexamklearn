import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ViewType, QuizResult, QuizQuestion, Flashcard, QuizProgress, ChatSession, AnalysisResult, FlashcardsProgress } from './types';
import Sidebar from './components/Sidebar';
import HomeView from './components/HomeView';
import QuizView from './components/QuizView';
import FlashcardsView from './components/FlashcardsView';
import ExamView from './components/ExamView';
import ChatView from './components/ChatView';
import ChatWidget from './components/SideChat';
import LoginView from './components/LoginView';
import { CloseIcon, MenuIcon } from './components/icons';
import { documentContent } from './studyMaterial';
import { generateQuiz, generateFlashcards, createChatSession, generateTargetedFlashcards, generateTargetedQuiz, generateQuizWithTopicDistribution, analyzeProgress } from './services/aiService';
import { getDbQuestionsAsQuiz } from './services/supabaseService';
import { getRandomFlashcards } from './services/flashcardBank';
import { getCurrentUser, onAuthStateChange, signOut as authSignOut, User } from './services/authService';
import { saveUserStats, saveUserSession, saveUserAnalysis, getLatestUserAnalysis, getUserStats, UserStats } from './services/userStatsService';
import { categorizeQuestionsByTopic, calculateTopicProgress, getWeakAndStrongTopics, saveTopicProgress, getTopicProgress } from './services/topicTrackingService';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('home');
  const [appError, setAppError] = useState<string | null>(null);
  const [sideChatContext, setSideChatContext] = useState('');
  const [isChatWidgetOpen, setIsChatWidgetOpen] = useState(false);
  const [quizHistory, setQuizHistory] = useState<QuizResult[]>([]);
  const [examHistory, setExamHistory] = useState<QuizResult[]>([]);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isExamInProgress, setIsExamInProgress] = useState(false);
  
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[] | null>(null);
  const [examQuestions, setExamQuestions] = useState<QuizQuestion[] | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[] | null>(null);
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);

  const [quizProgress, setQuizProgress] = useState<QuizProgress>({
    currentQuestionIndex: 0,
    selectedAnswer: null,
    showAnswer: false,
    score: 0,
    isFinished: false,
  });

  const [flashcardsProgress, setFlashcardsProgress] = useState<FlashcardsProgress>({
    currentIndex: 0,
    userAnswers: [],
  });
  
  const [generationStatus, setGenerationStatus] = useState({
    quiz: { generating: false },
    exam: { generating: false },
    flashcards: { generating: false },
  });

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedHistoryCount, setAnalyzedHistoryCount] = useState(0);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const analysisRef = useRef<AnalysisResult | null>(null);
  const [topicProgress, setTopicProgress] = useState<Map<string, { totalQuestions: number; correctAnswers: number; incorrectAnswers: number; accuracy: number }>>(new Map());
  const isCategorizingRef = useRef(false);
  const isAnalyzingRef = useRef(false);
  const isLoadingUserDataRef = useRef(false);
  const isUpdatingTopicsRef = useRef(false); // Track when we're just updating topics, not adding new results
  const lastLoadedUserIdRef = useRef<string | null>(null);
  const quizProgressRef = useRef(quizProgress); // Keep ref in sync with quiz progress
  const quizQuestionsRef = useRef(quizQuestions); // Keep ref in sync with quiz questions
  const statsSavedForQuizRef = useRef(false); // Track if stats have been saved for current quiz
  
  // Keep refs in sync with state
  useEffect(() => {
    analysisRef.current = analysis;
  }, [analysis]);
  
  useEffect(() => {
    quizProgressRef.current = quizProgress;
  }, [quizProgress]);
  
  useEffect(() => {
    quizQuestionsRef.current = quizQuestions;
  }, [quizQuestions]);

  const fileName = "דיני מתווכים במקרקעין";
  
  const TOTAL_QUESTIONS = 25;
  const QUESTIONS_FROM_DB = 15; // Show first 15 from DB
  const AI_GENERATED_QUESTIONS = 10; // Generate remaining 10 via AI
  const QUIZ_AI_BATCH_SIZE = 5; // Smaller batch size for faster generation

  const TOTAL_FLASHCARDS = 15;
  const FLASHCARDS_FROM_BANK = 3; // Use all available flashcards from bank (3 available)
  const FLASHCARDS_AI_GENERATED = 12; // Generate 12 flashcards to reach 15 total
  const INITIAL_FLASHCARDS_FROM_BANK = 1;
  const FLASHCARD_AI_BATCH_SIZE = 8;


  useEffect(() => {
    // CRITICAL: Skip if we're just updating topics (not adding new results)
    // This prevents infinite loops when we update history with topics
    if (isUpdatingTopicsRef.current) {
      return;
    }
    
    const totalHistory = quizHistory.length + examHistory.length;
    
    // Don't run analysis if:
    // 1. Already analyzing
    // 2. Questions are being generated
    // 3. No new history to analyze
    const isGenerating = generationStatus.quiz.generating || generationStatus.exam.generating;
    const hasNewHistory = totalHistory > 0 && totalHistory > analyzedHistoryCount;
    
    if (hasNewHistory && !isGenerating && !isAnalyzingRef.current) {
      isAnalyzingRef.current = true;
      setIsAnalyzing(true);
      setAppError(null);
      const userName = currentUser?.name || currentUser?.email?.split('@')[0] || undefined;
      
      // Categorize questions by topic and update topic progress
      // Prevent multiple simultaneous categorizations
      if (!isCategorizingRef.current) {
        isCategorizingRef.current = true;
        (async () => {
          try {
            const allResults = [...quizHistory, ...examHistory];
            const uncategorized = allResults.filter(r => !r.topic);
            
            if (uncategorized.length > 0) {
              const questionsToCategorize = uncategorized.map(r => r.question);
              const questionTopics = await categorizeQuestionsByTopic(questionsToCategorize, documentContent);
              
              // Mark that we're updating topics (not adding new results)
              isUpdatingTopicsRef.current = true;
              
              // Update results with topics
              const updatedQuizHistory = quizHistory.map(r => {
                const qt = questionTopics.find(qt => qt.question === r.question);
                return qt ? { ...r, topic: qt.topic } : r;
              });
              const updatedExamHistory = examHistory.map(r => {
                const qt = questionTopics.find(qt => qt.question === r.question);
                return qt ? { ...r, topic: qt.topic } : r;
              });
              
              // Update history with topics (this will trigger the useEffect again, but we'll skip it)
              setQuizHistory(updatedQuizHistory);
              setExamHistory(updatedExamHistory);
              
              // Reset the flag after a short delay to allow state to update
              setTimeout(() => {
                isUpdatingTopicsRef.current = false;
              }, 100);
              
              // Calculate topic progress
              const allResultsWithTopics = [...updatedQuizHistory, ...updatedExamHistory];
              const questionTopicsMap = allResultsWithTopics.map(r => ({ question: r.question, topic: r.topic || 'נושא כללי' }));
              const calculatedProgress = calculateTopicProgress(allResultsWithTopics, questionTopicsMap);
              setTopicProgress(calculatedProgress);
            } else {
              // Calculate progress from existing topics
              const questionTopicsMap = allResults.map(r => ({ question: r.question, topic: r.topic || 'נושא כללי' }));
              const calculatedProgress = calculateTopicProgress(allResults, questionTopicsMap);
              setTopicProgress(calculatedProgress);
            }
          } catch (error) {
            console.error('Error categorizing questions:', error);
          } finally {
            isCategorizingRef.current = false;
          }
        })();
      }
      
      analyzeProgress([...quizHistory, ...examHistory], documentContent, userName)
        .then(async (newAnalysis) => {
          setAnalysis(newAnalysis);
          setAnalyzedHistoryCount(totalHistory);
          
          // Save analysis and topic progress together (batch save)
          if (currentUser) {
            // Calculate topic progress from current history (may have been updated during categorization)
            const allResults = [...quizHistory, ...examHistory];
            const questionTopicsMap = allResults.map(r => ({ question: r.question, topic: r.topic || 'נושא כללי' }));
            const calculatedProgress = calculateTopicProgress(allResults, questionTopicsMap);
            
            // Save both analysis and topic progress in parallel
            const [analysisError, topicError] = await Promise.all([
              saveUserAnalysis(
                currentUser.id,
                newAnalysis,
                quizHistory,
                examHistory
              ).then(r => r.error),
              saveTopicProgress(currentUser.id, calculatedProgress).then(r => r.error)
            ]);
            
            if (analysisError) {
              console.error('Error saving analysis:', analysisError);
            }
            if (topicError) {
              console.error('Error saving topic progress:', topicError);
            }
            
            // Reload stats to ensure UI is up to date (stats might have been updated by quiz/exam completion)
            // This ensures stats are always current even if analysis and stats save happen in different orders
            console.log('Analysis completed, reloading stats...');
            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for DB consistency
            const { stats: updatedStats, error: statsReloadError } = await getUserStats(currentUser.id);
            if (!statsReloadError && updatedStats) {
              console.log('Reloaded stats from DB after analysis:', updatedStats);
              setUserStats(updatedStats);
              console.log('Updated userStats state after analysis');
            } else if (statsReloadError) {
              console.error('Error reloading stats after analysis:', statsReloadError);
            } else {
              console.warn('No stats returned from getUserStats after analysis');
            }
          }
        })
        .catch(err => {
          if (err instanceof Error) setAppError(err.message);
          else setAppError("An unexpected error occurred during analysis.");
        })
        .finally(() => {
          setIsAnalyzing(false);
          isAnalyzingRef.current = false;
        });
    } else if (totalHistory === 0 && analyzedHistoryCount > 0) {
      setAnalysis(null);
      setAnalyzedHistoryCount(0);
    }
  }, [quizHistory, examHistory, analyzedHistoryCount, currentUser, documentContent, generationStatus]);
  
  useEffect(() => {
    if (flashcards) {
        setFlashcardsProgress(prev => {
            if (prev.userAnswers.length !== flashcards.length) {
                const newAnswers = [...prev.userAnswers];
                newAnswers.length = flashcards.length;
                // Fill new spots with empty strings
                for (let i = prev.userAnswers.length; i < flashcards.length; i++) {
                    newAnswers[i] = '';
                }
                
                // Ensure currentIndex is not out of bounds
                const newCurrentIndex = Math.max(0, Math.min(prev.currentIndex, flashcards.length - 1));

                return {
                    currentIndex: newCurrentIndex,
                    userAnswers: newAnswers,
                };
            }
            return prev; // No change needed if lengths match
        });
    }
}, [flashcards]);

  const resetQuizProgress = () => {
    setQuizProgress({
        currentQuestionIndex: 0,
        selectedAnswer: null,
        showAnswer: false,
        score: 0,
        isFinished: false,
    });
    // Reset stats saved flag when starting a new quiz
    statsSavedForQuizRef.current = false;
  };

  const resetFlashcardsProgress = () => {
    setFlashcardsProgress({
      currentIndex: 0,
      userAnswers: [],
    });
  };

  // Save quiz session when quiz is finished (final save to ensure consistency)
  // Note: Stats are now saved incrementally after each answer, so this is just a final check
  useEffect(() => {
    if (quizProgress.isFinished && quizQuestions && quizHistory.length > 0 && currentUser && !statsSavedForQuizRef.current) {
      console.log('Quiz finished, performing final stats save...', {
        isFinished: quizProgress.isFinished,
        quizHistoryLength: quizHistory.length,
        hasUser: !!currentUser
      });
      
      statsSavedForQuizRef.current = true; // Mark as saved to prevent duplicate saves
      
      const correctAnswers = quizHistory.filter(r => r.isCorrect).length;
      const score = correctAnswers;
      const totalQuestions = quizHistory.length;
      
      console.log('Final quiz stats save:', {
        userId: currentUser.id,
        sessionType: 'quiz',
        score,
        totalQuestions,
        correctAnswers
      });
      
      // Final stats save to ensure consistency (stats are already saved incrementally)
      saveUserStats(
        currentUser.id,
        'quiz',
        score,
        totalQuestions,
        correctAnswers
      ).then(async ({ error: statsError }) => {
        if (statsError) {
          console.error('Error saving final quiz stats:', statsError);
          statsSavedForQuizRef.current = false; // Reset on error so we can retry
        } else {
          console.log('Final quiz stats saved successfully, reloading stats...');
          // Add a small delay to ensure database write is complete
          await new Promise(resolve => setTimeout(resolve, 200));
          // Reload stats from database to update UI in real time
          const { stats: updatedStats, error: reloadError } = await getUserStats(currentUser.id);
          if (!reloadError && updatedStats) {
            console.log('Reloaded stats from DB after quiz completion:', updatedStats);
            setUserStats(updatedStats);
            console.log('Updated userStats state, should trigger HomeView re-render');
          } else if (reloadError) {
            console.error('Error reloading stats after quiz completion:', reloadError);
          } else {
            console.warn('No stats returned from getUserStats after quiz completion');
          }
        }
      });
      
      // Save session
      saveUserSession(
        currentUser.id,
        'quiz',
        quizQuestions,
        quizHistory,
        score
      ).then(({ error: sessionError }) => {
        if (sessionError) {
          console.error('Error saving quiz session:', sessionError);
        }
      });
    } else if (!quizProgress.isFinished) {
      // Reset the flag when quiz is not finished (new quiz started)
      statsSavedForQuizRef.current = false;
    }
  }, [quizProgress.isFinished, quizQuestions, quizHistory, currentUser]);

  const regenerateQuiz = useCallback(async () => {
    // CRITICAL: Don't regenerate if user is actively answering a question
    // This prevents disrupting their current question
    const currentIndex = quizProgress.currentQuestionIndex;
    const currentSelectedAnswer = quizProgress.selectedAnswer;
    const userIsActive = currentIndex > 0 || currentSelectedAnswer !== null || quizProgress.showAnswer;
    
    if (userIsActive && quizQuestions && quizQuestions.length > 0) {
      console.log('User is actively answering - skipping quiz regeneration to preserve current question');
      return;
    }
    
    // Capture the initial state - user should not have started when we begin
    const userHasStartedAtStart = currentIndex > 0 || currentSelectedAnswer !== null;
    
    // Use a ref to track if user becomes active during generation
    const userBecameActiveRef = { current: false };
    
    setGenerationStatus(prev => ({ ...prev, quiz: { generating: true } }));
    setAppError(null);

    try {
        // Only reset progress if user hasn't started yet
        if (!userHasStartedAtStart) {
          resetQuizProgress();
        }
        
        // Check if we have enough data to determine weak/strong topics
        // Need at least 10 questions answered across different topics to have meaningful data
        const totalQuestionsAnswered = Array.from(topicProgress.values())
          .reduce((sum, tp) => sum + tp.totalQuestions, 0);
        const hasEnoughData = totalQuestionsAnswered >= 10 && topicProgress.size >= 3;
        
        console.log('Quiz generation:', {
          totalQuestionsAnswered,
          topicCount: topicProgress.size,
          hasEnoughData,
          topicProgressMap: Array.from(topicProgress.entries())
        });

        let dbQuestions: QuizQuestion[];
        let aiQuestions: QuizQuestion[] = [];

        if (!hasEnoughData) {
          // Not enough data yet - use all DB questions (25 questions)
          console.log('Not enough progress data - using all DB questions');
          dbQuestions = await getDbQuestionsAsQuiz(
            TOTAL_QUESTIONS, 
            documentContent,
            (dbQuestions) => {
              // Progress callback for loading bar
              const currentProgress = quizProgressRef.current;
              const currentState = currentProgress.currentQuestionIndex > 0 || currentProgress.selectedAnswer !== null;
              
              if (!currentState) {
                console.log('Progress update: Setting DB questions, length:', dbQuestions.length);
                // Force React to update by creating a new array reference
                const newQuestions = Array.from(dbQuestions);
                setQuizQuestions(newQuestions);
                // Update ref immediately so next iteration sees the latest
                quizQuestionsRef.current = newQuestions;
              } else {
                console.log('User started - stopping DB progress updates');
                userBecameActiveRef.current = true;
              }
            }
          );
          // No AI questions needed when using all DB questions
          aiQuestions = [];
        } else {
          // Enough data - generate ALL questions using AI based on weak/strong topics (25 questions, 70% weak, 30% strong)
          console.log('Enough progress data - generating ALL questions using AI based on weak/strong topics');
          
          // No DB questions - generate all 25 questions with AI
          dbQuestions = [];
          
          // Generate all AI questions based on topic progress - 70% weak, 30% strong
          const { weakTopics, strongTopics } = getWeakAndStrongTopics(topicProgress);
          
          console.log('Topic analysis:', {
            weakTopics: weakTopics.length,
            strongTopics: strongTopics.length,
            weakTopicsList: weakTopics,
            strongTopicsList: strongTopics
          });
          
          // Generate questions in batches to show progress during generation
          const batchSize = 5; // Generate 5 questions at a time
          const totalBatches = Math.ceil(TOTAL_QUESTIONS / batchSize);
          aiQuestions = [];
          
          // Show initial progress (5%)
          const currentProgress = quizProgressRef.current;
          const currentState = currentProgress.currentQuestionIndex > 0 || currentProgress.selectedAnswer !== null;
          if (!currentState) {
            setQuizQuestions([]);
            console.log('Starting AI generation - showing initial progress');
          }
          
          for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            // Check if user started - if so, stop updating progress
            const progressCheck = quizProgressRef.current;
            const stateCheck = progressCheck.currentQuestionIndex > 0 || progressCheck.selectedAnswer !== null;
            if (stateCheck) {
              console.log('User started - stopping AI generation progress updates');
              userBecameActiveRef.current = true;
              break;
            }
            
            const remainingQuestions = TOTAL_QUESTIONS - aiQuestions.length;
            const questionsInThisBatch = Math.min(batchSize, remainingQuestions);
            
            console.log(`Generating batch ${batchIndex + 1}/${totalBatches}: ${questionsInThisBatch} questions`);
            
            // Show progress based on batches completed (before generation)
            const batchProgress = Math.round(((batchIndex + 1) / totalBatches) * 0.9 * 100); // 90% for generation, 10% for finalization
            if (!stateCheck) {
              // Show current progress based on questions already generated
              const currentProgressPercent = Math.round((aiQuestions.length / TOTAL_QUESTIONS) * 100);
              console.log(`Starting batch ${batchIndex + 1}/${totalBatches}: Current progress ${currentProgressPercent}% (${aiQuestions.length}/${TOTAL_QUESTIONS} questions)`);
            }
            
            let batchQuestions: QuizQuestion[] = [];
            
            try {
              if (weakTopics.length > 0 || strongTopics.length > 0) {
                // Calculate how many questions to generate from weak vs strong topics
                const weakCount = Math.round(questionsInThisBatch * 0.7);
                const strongCount = questionsInThisBatch - weakCount;
                
                // Generate weak topic questions
                if (weakCount > 0 && weakTopics.length > 0) {
                  const weakBatch = await generateTargetedQuiz(weakTopics, documentContent, weakCount);
                  batchQuestions.push(...weakBatch);
                } else if (weakCount > 0) {
                  const generalBatch = await generateQuiz(documentContent, weakCount);
                  batchQuestions.push(...generalBatch);
                }
                
                // Generate strong topic questions
                if (strongCount > 0 && strongTopics.length > 0) {
                  const strongBatch = await generateTargetedQuiz(strongTopics, documentContent, strongCount);
                  batchQuestions.push(...strongBatch);
                } else if (strongCount > 0) {
                  const generalBatch = await generateQuiz(documentContent, strongCount);
                  batchQuestions.push(...generalBatch);
                }
              } else {
                // Generate general questions if no topics identified
                batchQuestions = await generateQuiz(documentContent, questionsInThisBatch);
              }
              
              // Randomize options for AI-generated questions
              const randomizedBatch = batchQuestions.map(q => {
                const correctAnswerText = q.options[q.correctAnswerIndex];
                const shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);
                const correctAnswerIndex = shuffledOptions.indexOf(correctAnswerText);
                
                return {
                  ...q,
                  options: shuffledOptions,
                  correctAnswerIndex: correctAnswerIndex !== -1 ? correctAnswerIndex : 0
                };
              });
              
              aiQuestions.push(...randomizedBatch);
              
              // Update progress with actual questions
              if (!stateCheck) {
                setQuizQuestions([...aiQuestions]);
                quizQuestionsRef.current = [...aiQuestions];
                console.log(`Batch ${batchIndex + 1} complete: ${aiQuestions.length}/${TOTAL_QUESTIONS} questions generated`);
              }
              
            } catch (error) {
              console.error(`Error generating batch ${batchIndex + 1}:`, error);
              // Continue with next batch even if one fails
            }
          }
          
          // After all batches are complete, set the final shuffled questions
          // But only if user hasn't started
          const finalProgress = quizProgressRef.current;
          const finalState = finalProgress.currentQuestionIndex > 0 || finalProgress.selectedAnswer !== null;
          if (!finalState && aiQuestions.length > 0) {
            // Shuffle all AI questions for final display
            const shuffledAiQuestions = [...aiQuestions].sort(() => Math.random() - 0.5);
            setQuizQuestions(shuffledAiQuestions);
            quizQuestionsRef.current = shuffledAiQuestions;
            console.log('Final: Setting all AI questions (shuffled), length:', shuffledAiQuestions.length);
          } else if (finalState) {
            console.log('User started - skipping final shuffle update');
          }
        }
        
        // Deduplicate questions if we have both DB and AI questions
        let finalAiQuestions = aiQuestions;
        let finalDbQuestions = dbQuestions;
        
        if (aiQuestions.length > 0 && dbQuestions.length > 0) {
          // CRITICAL: Deduplicate questions before combining
          // Remove AI questions that are too similar to DB questions
          const dbQuestionTexts = new Set(dbQuestions.map(q => q.question.toLowerCase().trim()));
          const uniqueAiQuestions = aiQuestions.filter(aiQ => {
            const aiText = aiQ.question.toLowerCase().trim();
            // Check if AI question is too similar to any DB question
            // Compare first 50 characters to catch similar questions
            const aiPrefix = aiText.substring(0, 50);
            return !Array.from(dbQuestionTexts).some(dbText => {
              const dbPrefix = dbText.substring(0, 50);
              // If questions share significant overlap, consider them duplicates
              return aiPrefix === dbPrefix || 
                     (aiText.includes(dbPrefix) || dbText.includes(aiPrefix)) ||
                     // Also check if questions are very similar (80% overlap)
                     (aiText.length > 20 && dbText.length > 20 && 
                      (aiText.length < dbText.length * 1.2 && dbText.length < aiText.length * 1.2) &&
                      calculateSimilarity(aiText, dbText) > 0.8);
            });
          });
          
          // If we lost some AI questions due to deduplication, generate more if needed
          finalAiQuestions = uniqueAiQuestions;
          if (uniqueAiQuestions.length < aiQuestions.length && hasEnoughData) {
            const needed = aiQuestions.length - uniqueAiQuestions.length;
            console.log(`Generating ${needed} additional unique AI questions to replace duplicates`);
            try {
              const { weakTopics, strongTopics } = getWeakAndStrongTopics(topicProgress);
              let additionalQuestions: QuizQuestion[];
              if (weakTopics.length > 0 || strongTopics.length > 0) {
                additionalQuestions = await generateQuizWithTopicDistribution(
                  weakTopics,
                  strongTopics,
                  documentContent,
                  needed
                );
              } else {
                additionalQuestions = await generateQuiz(documentContent, needed);
              }
              
              // Deduplicate additional questions too
              const allExistingTexts = new Set([
                ...dbQuestionTexts,
                ...uniqueAiQuestions.map(q => q.question.toLowerCase().trim())
              ]);
              const uniqueAdditional = additionalQuestions.filter(q => {
                const qText = q.question.toLowerCase().trim();
                return !Array.from(allExistingTexts).some(existing => {
                  const qPrefix = qText.substring(0, 50);
                  const existingPrefix = existing.substring(0, 50);
                  return qPrefix === existingPrefix || 
                         (qText.includes(existingPrefix) || existing.includes(qPrefix)) ||
                         (qText.length > 20 && existing.length > 20 && 
                          (qText.length < existing.length * 1.2 && existing.length < qText.length * 1.2) &&
                          calculateSimilarity(qText, existing) > 0.8);
                });
              });
              
              finalAiQuestions = [...uniqueAiQuestions, ...uniqueAdditional.slice(0, needed)];
            } catch (error) {
              console.error('Error generating additional unique questions:', error);
              // Use what we have if generation fails
            }
          }
        } else if (aiQuestions.length > 0 && dbQuestions.length === 0) {
          // All AI questions - just deduplicate among themselves
          finalAiQuestions = deduplicateQuestions(aiQuestions);
        } else {
          // All DB questions - no deduplication needed
          finalAiQuestions = [];
        }
        
        // Only combine and set final questions if we have DB questions (not pure AI)
        // If we generated all AI questions, they were already set progressively above
        if (finalDbQuestions.length > 0) {
          // We have DB questions - need to combine with AI questions
          // CRITICAL: Check again if user has become active during generation
          const currentProgress = quizProgressRef.current;
          const currentStateAfterGeneration = currentProgress.currentQuestionIndex > 0 || currentProgress.selectedAnswer !== null || userBecameActiveRef.current;
          
          // CRITICAL: Check if we already have all questions
          const currentQuestions = quizQuestionsRef.current;
          const hasAllQuestions = currentQuestions && currentQuestions.length >= TOTAL_QUESTIONS;
          
          // CRITICAL: If user has started answering AND we already have all questions, DON'T update
          // But if we don't have all questions yet, we need to update to add the AI questions
          if (!currentStateAfterGeneration && !userHasStartedAtStart && !hasAllQuestions) {
            // User hasn't started and we don't have all questions - safe to set new questions
            // Combine DB and AI questions
            const allQuestions = [...finalDbQuestions, ...finalAiQuestions];
            // Deduplicate again to be safe
            const uniqueQuestions = deduplicateQuestions(allQuestions);
            const shuffledAllQuestions = [...uniqueQuestions].sort(() => Math.random() - 0.5);
            setQuizQuestions(shuffledAllQuestions);
          } else if (currentStateAfterGeneration && !hasAllQuestions) {
            // User has started but we don't have all questions yet
            // We need to add the AI questions, but preserve the user's current position
            const allQuestions = [...finalDbQuestions, ...finalAiQuestions];
            // Deduplicate again to be safe
            const uniqueQuestions = deduplicateQuestions(allQuestions);
            const shuffledAllQuestions = [...uniqueQuestions].sort(() => Math.random() - 0.5);
            
            // Try to preserve the user's current question if possible
            if (currentQuestions && currentQuestions.length > 0 && currentProgress.currentQuestionIndex < currentQuestions.length) {
              const currentQuestion = currentQuestions[currentProgress.currentQuestionIndex];
              // Try to find the same question in the new array
              const questionIndexInNewArray = shuffledAllQuestions.findIndex(q => 
                q.question === currentQuestion.question ||
                (q.question.includes(currentQuestion.question.substring(0, 50)) && 
                 currentQuestion.question.includes(q.question.substring(0, 50)))
              );
              
              if (questionIndexInNewArray !== -1 && questionIndexInNewArray !== currentProgress.currentQuestionIndex) {
                // Found the same question - move it to the current index position
                const preservedQuestion = shuffledAllQuestions[questionIndexInNewArray];
                shuffledAllQuestions.splice(questionIndexInNewArray, 1);
                shuffledAllQuestions.splice(currentProgress.currentQuestionIndex, 0, preservedQuestion);
              }
            }
            
            setQuizQuestions(shuffledAllQuestions);
          } else if (hasAllQuestions) {
            // We already have all questions - don't update to avoid disrupting user
            console.log('Already have all questions - skipping question update to preserve current position');
          } else {
            // User is actively answering and we have all questions - don't update
            console.log('User is on a question and we have all questions - skipping question update');
          }
        } else {
          // All AI questions - already set progressively above, just ensure final shuffle was applied
          console.log('All AI questions generated - final set should already be in place');
        }

    } catch (error) {
        if (error instanceof Error) setAppError(error.message);
        else setAppError("נכשל ביצירת שאר שאלות הבוחן.");
    } finally {
        setGenerationStatus(prev => ({ ...prev, quiz: { ...prev.quiz, generating: false } }));
    }
  }, [documentContent, topicProgress]); // Removed quizProgress and quizQuestions to prevent excessive re-renders
  
  // Helper function to calculate similarity between two strings
  const calculateSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1.0;
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  };
  
  // Helper function to calculate Levenshtein distance
  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix: number[][] = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  };
  
  // Helper function to deduplicate questions
  const deduplicateQuestions = (questions: QuizQuestion[]): QuizQuestion[] => {
    const seen = new Set<string>();
    const unique: QuizQuestion[] = [];
    
    for (const q of questions) {
      const normalized = q.question.toLowerCase().trim();
      // Check if we've seen a very similar question
      let isDuplicate = false;
      for (const seenText of seen) {
        if (normalized === seenText || 
            (normalized.length > 20 && seenText.length > 20 && calculateSimilarity(normalized, seenText) > 0.85)) {
          isDuplicate = true;
          break;
        }
      }
      
      if (!isDuplicate) {
        seen.add(normalized);
        unique.push(q);
      }
    }
    
    return unique;
  };
  
  const regenerateFlashcards = useCallback(async () => {
      setGenerationStatus(prev => ({ ...prev, flashcards: { generating: true } }));
      resetFlashcardsProgress();

      setAppError(null);
      try {
          // Flashcards always use DB questions - convert quiz questions to flashcards
          console.log('Generating flashcards - using DB questions');
          
          // Fetch DB questions and convert them to flashcards
          const dbQuestions = await getDbQuestionsAsQuiz(TOTAL_FLASHCARDS, documentContent);
          
          // Convert quiz questions to flashcards format
          // Use the question text as the flashcard question
          // Use the explanation or correct answer text as the flashcard answer
          const dbFlashcards: Flashcard[] = dbQuestions.map(q => {
            // Use explanation if available, otherwise use the correct answer text
            const answer = q.explanation && q.explanation.trim() 
              ? q.explanation 
              : q.options[q.correctAnswerIndex] || 'לא צוין הסבר';
            
            return {
              question: q.question,
              answer: answer
            };
          });
          
          // Shuffle flashcards for variety
          const shuffledFlashcards = [...dbFlashcards].sort(() => Math.random() - 0.5);
          
          // Set the shuffled flashcards
          setFlashcards(shuffledFlashcards);
      } catch (error) {
          if (error instanceof Error) setAppError(error.message);
          else setAppError("נכשל ביצירת כרטיסיות.");
      } finally {
          setGenerationStatus(prev => ({ ...prev, flashcards: { ...prev.flashcards, generating: false } }));
      }
  }, [documentContent]);
  
  const regenerateExam = useCallback(async () => {
    setGenerationStatus(prev => ({ ...prev, exam: { generating: true } }));

    setAppError(null);
    setIsExamInProgress(false);
    setExamHistory([]);
    resetExamProgress();
    setExamQuestions(null);

    try {
        // Exam always uses all DB questions (no AI generation)
        console.log('Generating exam - using all DB questions');
        const dbQuestions = await getDbQuestionsAsQuiz(
          TOTAL_QUESTIONS, 
          documentContent
        );
        
        // Shuffle the questions (both questions and answers are already randomized)
        const shuffledAllQuestions = [...dbQuestions].sort(() => Math.random() - 0.5);
        
        // Set the final shuffled questions
        setExamQuestions(shuffledAllQuestions);

    } catch (error) {
        if (error instanceof Error) setAppError(error.message);
        else setAppError("נכשל ביצירת שאר שאלות המבחן.");
    } finally {
        setGenerationStatus(prev => ({ ...prev, exam: { ...prev.exam, generating: false } }));
    }
  }, [documentContent, topicProgress]);

  const handleLoginSuccess = useCallback(async (user: User) => {
    setCurrentUser(user);
    regenerateFlashcards();
    regenerateQuiz();
    
    try {
      // Use the user parameter directly since currentUser state might not be updated yet
      const userName = user?.name || user?.email?.split('@')[0] || undefined;
      const newChat = await createChatSession(documentContent, userName);
      const greeting = userName 
        ? `היי ${userName}, אני דניאל, המורה הפרטי שלך. במה אוכל לעזור?`
        : 'היי, אני דניאל, המורה הפרטי שלך. במה אוכל לעזור?';
      setChatSession({
        chat: newChat,
        history: [{ role: 'model', text: greeting }],
      });
    } catch (error) {
      if (error instanceof Error) setAppError(error.message);
      else setAppError("נכשל באתחול סשן הצ\'אט.");
    }

  }, [regenerateFlashcards, regenerateQuiz, documentContent]);

  const handleLogout = async () => {
    const { error } = await authSignOut();
    if (error) {
      setAppError(error.message || 'שגיאה בהתנתקות');
    }
    // The auth state change listener will handle the rest
  };

  // Check for existing session on mount and listen to auth state changes
  useEffect(() => {
    let isInitialized = false;
    let currentUserForInit: User | null = null;

    // Helper function to initialize app state
    const initializeAppState = async (user: User | null) => {
      if (!isInitialized && user) {
        isInitialized = true;
        currentUserForInit = user;
        // Only regenerate if not already generated
        if (!flashcards) {
          regenerateFlashcards();
        }
        if (!quizQuestions) {
          regenerateQuiz();
        }
        try {
          const userName = user?.name || user?.email?.split('@')[0] || undefined;
          const newChat = await createChatSession(documentContent, userName);
          const greeting = userName 
            ? `היי ${userName}, אני דניאל, המורה הפרטי שלך. במה אוכל לעזור?`
            : 'היי, אני דניאל, המורה הפרטי שלך. במה אוכל לעזור?';
          setChatSession({
            chat: newChat,
            history: [{ role: 'model', text: greeting }],
          });
        } catch (error) {
          console.error('Failed to initialize chat session:', error);
        }
      }
    };

    // Listen to auth state changes (this will handle both initial load and subsequent changes)
    const { data: { subscription } } = onAuthStateChange(async (user) => {
      setCurrentUser(user);
      if (!user) {
        // User logged out - reset app state
    setCurrentView('home');
    setQuizHistory([]);
    setExamHistory([]);
    setQuizQuestions(null);
    setExamQuestions(null);
    setFlashcards(null);
    setChatSession(null);
    setIsExamInProgress(false);
    resetQuizProgress();
    resetFlashcardsProgress();
    setAnalysis(null);
    setIsAnalyzing(false);
    setAnalyzedHistoryCount(0);
        isInitialized = false;
        isLoadingUserDataRef.current = false;
        lastLoadedUserIdRef.current = null;
      } else {
        // User logged in - only load data if this is a new user session (user ID changed)
        const isNewUserSession = lastLoadedUserIdRef.current !== user.id;
        const needsDataLoad = isNewUserSession && !isLoadingUserDataRef.current;
        
        if (needsDataLoad) {
          // New user session - load user data once
          isLoadingUserDataRef.current = true;
          lastLoadedUserIdRef.current = user.id;
          
          // Load all user data in parallel (batch to reduce calls)
          const [analysisData, topicData, statsData] = await Promise.all([
            getLatestUserAnalysis(user.id),
            getTopicProgress(user.id),
            getUserStats(user.id)
          ]);
          
          // Set analysis and history (always set, even if empty, to ensure UI reflects current state)
          if (!analysisData.error) {
            if (analysisData.analysis) {
              setAnalysis(analysisData.analysis);
            }
            // Always set history arrays (even if empty) so stats are calculated correctly
            const loadedQuizHistory = Array.isArray(analysisData.quizHistory) ? analysisData.quizHistory : [];
            const loadedExamHistory = Array.isArray(analysisData.examHistory) ? analysisData.examHistory : [];
            
            console.log('Setting history from DB:', {
              quizHistory: loadedQuizHistory.length,
              examHistory: loadedExamHistory.length
            });
            
            setQuizHistory(loadedQuizHistory);
            setExamHistory(loadedExamHistory);
          } else {
            console.error('Error loading analysis:', analysisData.error);
          }
          
          // Set stats from database
          if (!statsData.error && statsData.stats) {
            setUserStats(statsData.stats);
            console.log('Loaded user stats from DB:', statsData.stats);
          } else if (!statsData.error && !statsData.stats) {
            // New user - no stats yet
            setUserStats(null);
          } else {
            console.error('Error loading stats:', statsData.error);
          }
          
          // Set topic progress
          if (!topicData.error && topicData.topicProgress.size > 0) {
            setTopicProgress(topicData.topicProgress);
          }
          
          // Stats are loaded but not directly displayed - HomeView computes from history
          // This ensures stats are available if needed
          
          isLoadingUserDataRef.current = false;
        }
        
        // Always initialize app state (for both new and existing sessions)
        initializeAppState(user);
      }
    });

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [documentContent, regenerateFlashcards, regenerateQuiz, flashcards, quizQuestions]);

  const handleOpenSideChat = (context: string) => {
    setSideChatContext(context);
    setIsChatWidgetOpen(true);
  };
  
  const handleOpenMainChat = () => {
    setIsChatWidgetOpen(true);
    setIsMobileSidebarOpen(false);
  };

  const handleCloseSideChat = () => {
    setSideChatContext('');
  };

  const handleQuestionAnswered = async (result: QuizResult) => {
    // Don't categorize here - let the useEffect batch all categorizations together
    // Just add result to history and update local topic progress
    setQuizHistory(prev => [...prev, result]);
    
    // Update topic progress locally (don't save to DB yet - wait for batch)
    if (result.topic) {
      setTopicProgress(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(result.topic!) || { totalQuestions: 0, correctAnswers: 0, incorrectAnswers: 0, accuracy: 0 };
        existing.totalQuestions++;
        if (result.isCorrect) {
          existing.correctAnswers++;
        } else {
          existing.incorrectAnswers++;
        }
        existing.accuracy = existing.totalQuestions > 0 
          ? (existing.correctAnswers / existing.totalQuestions) * 100 
          : 0;
        newMap.set(result.topic!, existing);
        return newMap;
      });
    }
    
    // Update stats incrementally after each answer
    if (currentUser) {
      try {
        // Calculate current stats from history
        const currentHistory = [...quizHistory, result];
        const correctAnswers = currentHistory.filter(r => r.isCorrect).length;
        const totalQuestions = currentHistory.length;
        const score = correctAnswers;
        
        console.log('Updating stats incrementally after answer:', {
          userId: currentUser.id,
          isCorrect: result.isCorrect,
          correctAnswers,
          totalQuestions,
          score
        });
        
        // Save stats incrementally (add 1 question, add 1 correct/incorrect)
        // Pass isIncremental=true to prevent quiz_count from incrementing
        const { error: statsError } = await saveUserStats(
          currentUser.id,
          'quiz',
          score,
          totalQuestions,
          correctAnswers,
          true // isIncremental - don't increment quiz_count
        );
        
        if (statsError) {
          console.error('Error saving incremental stats:', statsError);
        } else {
          console.log('Incremental stats saved successfully, reloading stats...');
          // Add a small delay to ensure database write is complete
          await new Promise(resolve => setTimeout(resolve, 200));
          // Reload stats from database to update UI in real time
          const { stats: updatedStats, error: reloadError } = await getUserStats(currentUser.id);
          if (!reloadError && updatedStats) {
            console.log('Reloaded stats from DB after answer:', updatedStats);
            setUserStats(updatedStats);
            console.log('Updated userStats state, should trigger HomeView re-render');
          } else if (reloadError) {
            console.error('Error reloading stats after answer:', reloadError);
          }
        }
      } catch (error) {
        console.error('Error updating stats incrementally:', error);
        // Don't block the UI if stats update fails
      }
    }
  };

  const handleExamFinished = async (results: QuizResult[]) => {
    // Don't categorize here - let the useEffect batch all categorizations together
    // Just add results to history - the useEffect will handle categorization and saving
    setExamHistory(prev => [...prev, ...results]);
    
    // Save exam session stats (separate from analysis - this is just for tracking)
    if (currentUser && examQuestions) {
      const correctAnswers = results.filter(r => r.isCorrect).length;
      const score = correctAnswers;
      const totalQuestions = results.length;
      
      // Save stats (this is a separate call for session tracking, not the main analysis)
      const { error: statsError } = await saveUserStats(
        currentUser.id,
        'exam',
        score,
        totalQuestions,
        correctAnswers
      );
      if (statsError) {
        console.error('Error saving exam stats:', statsError);
      } else {
        console.log('Exam stats saved successfully, reloading stats...');
        // Add a small delay to ensure database write is complete
        await new Promise(resolve => setTimeout(resolve, 100));
        // Reload stats from database to update UI in real time
        const { stats: updatedStats, error: reloadError } = await getUserStats(currentUser.id);
        if (!reloadError && updatedStats) {
          console.log('Reloaded stats from DB:', updatedStats);
          setUserStats(updatedStats);
          console.log('Updated userStats state, should trigger HomeView re-render');
        } else if (reloadError) {
          console.error('Error reloading stats:', reloadError);
        } else {
          console.warn('No stats returned from getUserStats');
        }
      }
      
      // Save session
      const { error: sessionError } = await saveUserSession(
        currentUser.id,
        'exam',
        examQuestions,
        results,
        score
      );
      if (sessionError) {
        console.error('Error saving exam session:', sessionError);
      }
    }
  };

  const handleSetView = useCallback(async (view: ViewType) => {
    if(isExamInProgress && view !== 'exam') return;
    setCurrentView(view);
    setIsMobileSidebarOpen(false);
    
    // When navigating to home, refresh stats to ensure they're up to date
    if (view === 'home' && currentUser) {
      const { stats: refreshedStats, error: refreshError } = await getUserStats(currentUser.id);
      if (!refreshError && refreshedStats) {
        setUserStats(refreshedStats);
        console.log('Refreshed stats when navigating to home:', refreshedStats);
      } else if (refreshError) {
        console.error('Error refreshing stats on home navigation:', refreshError);
      }
    }
  }, [currentUser]);
  
  const handleCreateTargetedFlashcards = useCallback(async (weaknesses: string[]) => {
      setCurrentView('flashcards');
      setFlashcards(null);
      resetFlashcardsProgress();
      setGenerationStatus(prev => ({ ...prev, flashcards: { generating: true } }));
      setAppError(null);
      try {
          // Targeted flashcards also use DB questions (same as regular flashcards)
          console.log('Generating targeted flashcards - using DB questions');
          
          // Fetch DB questions and convert them to flashcards
          const dbQuestions = await getDbQuestionsAsQuiz(TOTAL_FLASHCARDS, documentContent);
          
          // Convert quiz questions to flashcards format
          const dbFlashcards: Flashcard[] = dbQuestions.map(q => {
            // Use explanation if available, otherwise use the correct answer text
            const answer = q.explanation && q.explanation.trim() 
              ? q.explanation 
              : q.options[q.correctAnswerIndex] || 'לא צוין הסבר';
            
            return {
              question: q.question,
              answer: answer
            };
          });
          
          // Shuffle flashcards for variety
          const shuffledFlashcards = [...dbFlashcards].sort(() => Math.random() - 0.5);
          setFlashcards(shuffledFlashcards);
      } catch (error) {
          if (error instanceof Error) setAppError(error.message);
          else setAppError("נכשל ביצירת כרטיסיות ממוקדות.");
      } finally {
          setGenerationStatus(prev => ({ ...prev, flashcards: { ...prev.flashcards, generating: false } }));
      }
  }, [documentContent]);

  const handleCreateTargetedQuiz = useCallback(async (weaknesses: string[]) => {
      setCurrentView('quiz');
      setQuizQuestions(null);
      // Don't clear quiz history - it's cumulative across sessions
      // Only reset progress for the current quiz attempt
      resetQuizProgress();
      setGenerationStatus(prev => ({ ...prev, quiz: { generating: true } }));
      setAppError(null);
      try {
          // Generate all targeted questions in a single API call
          const questions = await generateTargetedQuiz(weaknesses, documentContent, TOTAL_QUESTIONS);
          
          // Randomize options for all questions
          const randomizedQuestions = questions.map(q => {
            const correctAnswerText = q.options[q.correctAnswerIndex];
            const shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);
            const correctAnswerIndex = shuffledOptions.indexOf(correctAnswerText);
            
            return {
              ...q,
              options: shuffledOptions,
              correctAnswerIndex: correctAnswerIndex !== -1 ? correctAnswerIndex : 0
            };
          });
          
          setQuizQuestions(randomizedQuestions);
      } catch (error) {
          if (error instanceof Error) setAppError(error.message);
          else setAppError("נכשל ביצירת בוחן ממוקד.");
      } finally {
          setGenerationStatus(prev => ({ ...prev, quiz: { ...prev.quiz, generating: false } }));
      }
  }, [documentContent]);


  const renderView = () => {
    switch (currentView) {
      case 'home':
        return <HomeView 
          quizHistory={quizHistory} 
          examHistory={examHistory} 
          setView={handleSetView} 
          analysis={analysis}
          isAnalyzing={isAnalyzing}
          createTargetedFlashcards={handleCreateTargetedFlashcards}
          createTargetedQuiz={handleCreateTargetedQuiz}
            emailConfirmed={currentUser?.email_confirmed ?? false}
            userEmail={currentUser?.email}
            userStats={userStats}
        />;
      case 'quiz':
        if (!currentUser?.email_confirmed) {
          return (
            <div className="flex-grow p-4 md:p-8 overflow-y-auto flex items-center justify-center">
              <div className="bg-white border border-yellow-200 rounded-lg shadow-sm p-8 max-w-md text-center">
                <svg className="h-12 w-12 text-yellow-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">אימות אימייל נדרש</h3>
                <p className="text-sm text-yellow-700 mb-4">
                  אנא בדוק את תיבת הדואר הנכנס שלך וצור קשר עם האימייל ששלחנו כדי לאמת את החשבון שלך.
                </p>
                <button 
                  onClick={() => handleSetView('home')}
                  className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
                >
                  חזור לדף הבית
                </button>
              </div>
            </div>
          );
        }
        return <QuizView 
            documentContent={documentContent} 
            setAppError={setAppError} 
            openSideChat={handleOpenSideChat} 
            onQuestionAnswered={handleQuestionAnswered}
            questions={quizQuestions}
            isLoading={generationStatus.quiz.generating}
            regenerateQuiz={regenerateQuiz}
            totalQuestions={TOTAL_QUESTIONS}
            quizProgress={quizProgress}
            setQuizProgress={setQuizProgress}
            setView={handleSetView}
            createTargetedFlashcards={handleCreateTargetedFlashcards}
            createTargetedQuiz={handleCreateTargetedQuiz}
            userName={currentUser?.name || currentUser?.email?.split('@')[0]}
            analysis={analysis}
            isAnalyzing={isAnalyzing}
        />;
      case 'exam':
        if (!currentUser?.email_confirmed) {
          return (
            <div className="flex-grow p-4 md:p-8 overflow-y-auto flex items-center justify-center">
              <div className="bg-white border border-yellow-200 rounded-lg shadow-sm p-8 max-w-md text-center">
                <svg className="h-12 w-12 text-yellow-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">אימות אימייל נדרש</h3>
                <p className="text-sm text-yellow-700 mb-4">
                  אנא בדוק את תיבת הדואר הנכנס שלך וצור קשר עם האימייל ששלחנו כדי לאמת את החשבון שלך.
                </p>
                <button 
                  onClick={() => handleSetView('home')}
                  className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
                >
                  חזור לדף הבית
                </button>
              </div>
            </div>
          );
        }
        return <ExamView
            questions={examQuestions}
            isLoading={generationStatus.exam.generating}
            regenerateExam={regenerateExam}
            setIsExamInProgress={setIsExamInProgress}
            setView={handleSetView}
            totalQuestions={TOTAL_QUESTIONS}
            documentContent={documentContent}
            setAppError={setAppError}
            onExamFinished={handleExamFinished}
            createTargetedFlashcards={handleCreateTargetedFlashcards}
            createTargetedQuiz={handleCreateTargetedQuiz}
            userName={currentUser?.name || currentUser?.email?.split('@')[0]}
            analysis={analysis}
            isAnalyzing={isAnalyzing}
        />;
      case 'flashcards':
        if (!currentUser?.email_confirmed) {
          return (
            <div className="flex-grow p-4 md:p-8 overflow-y-auto flex items-center justify-center">
              <div className="bg-white border border-yellow-200 rounded-lg shadow-sm p-8 max-w-md text-center">
                <svg className="h-12 w-12 text-yellow-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">אימות אימייל נדרש</h3>
                <p className="text-sm text-yellow-700 mb-4">
                  אנא בדוק את תיבת הדואר הנכנס שלך וצור קשר עם האימייל ששלחנו כדי לאמת את החשבון שלך.
                </p>
                <button 
                  onClick={() => handleSetView('home')}
                  className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
                >
                  חזור לדף הבית
                </button>
              </div>
            </div>
          );
        }
        return <FlashcardsView 
            documentContent={documentContent} 
            setAppError={setAppError} 
            openSideChat={handleOpenSideChat}
            flashcards={flashcards}
            isLoading={generationStatus.flashcards.generating}
            regenerateFlashcards={regenerateFlashcards}
            totalFlashcards={TOTAL_FLASHCARDS}
            flashcardsProgress={flashcardsProgress}
            setFlashcardsProgress={setFlashcardsProgress}
            userName={currentUser?.name || currentUser?.email?.split('@')[0]}
        />;
      case 'chat':
        if (!currentUser?.email_confirmed) {
          return (
            <div className="flex-grow p-4 md:p-8 overflow-y-auto flex items-center justify-center">
              <div className="bg-white border border-yellow-200 rounded-lg shadow-sm p-8 max-w-md text-center">
                <svg className="h-12 w-12 text-yellow-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">אימות אימייל נדרש</h3>
                <p className="text-sm text-yellow-700 mb-4">
                  אנא בדוק את תיבת הדואר הנכנס שלך וצור קשר עם האימייל ששלחנו כדי לאמת את החשבון שלך.
                </p>
                <button 
                  onClick={() => handleSetView('home')}
                  className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
                >
                  חזור לדף הבית
                </button>
              </div>
            </div>
          );
        }
        return <ChatView
            setAppError={setAppError}
            chatSession={chatSession}
            setChatSession={setChatSession}
        />;
      default:
        return null;
    }
  };

  if (!currentUser) {
    return <LoginView onLogin={handleLoginSuccess} />;
  }

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900 font-sans overflow-hidden">
      {!isExamInProgress && (
        <Sidebar 
          currentView={currentView}
          setView={handleSetView}
          fileName={fileName}
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
          currentUser={currentUser}
          onLogout={handleLogout}
          isExamInProgress={isExamInProgress}
          openMainChat={handleOpenMainChat}
        />
      )}

      {isMobileSidebarOpen && !isExamInProgress && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        ></div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {!isExamInProgress && (
          <button 
            onClick={() => setIsMobileSidebarOpen(true)} 
            className="md:hidden fixed top-4 right-4 z-30 p-2 bg-white/80 backdrop-blur-sm rounded-md border border-slate-200"
            aria-label="פתח תפריט"
          >
            <MenuIcon className="h-6 w-6" />
          </button>
        )}

        {appError && (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 max-w-md w-11/2 p-4 bg-red-100 border border-red-300 text-red-700 rounded-lg shadow-lg flex items-center justify-between z-50 animate-fade-in">
                <span>{appError}</span>
                <button onClick={() => setAppError(null)} className="p-1 rounded-full hover:bg-red-200 mr-2">
                    <CloseIcon className="h-5 w-5" />
                </button>
            </div>
        )}
        
        <div className="flex-1 flex flex-col overflow-y-auto">
          {renderView()}
        </div>
        
        {!isExamInProgress && currentView !== 'chat' && (
            <ChatWidget
                isOpen={isChatWidgetOpen}
                setIsOpen={setIsChatWidgetOpen}
                context={sideChatContext}
                onContextClose={handleCloseSideChat}
                documentContent={documentContent}
                setAppError={setAppError}
                chatSession={chatSession}
                setChatSession={setChatSession}
                userName={currentUser?.name || currentUser?.email?.split('@')[0]}
            />
        )}
      </main>
    </div>
  );
};

export default App;