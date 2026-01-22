import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ViewType, QuizResult, QuizQuestion, Flashcard, QuizProgress, ChatSession, AnalysisResult, FlashcardsProgress, GeneratedQuestion } from './types';
import Sidebar from './components/Sidebar';
import HomeView from './components/HomeView';
import QuizView from './components/QuizView';
import FlashcardsView from './components/FlashcardsView';
import ExamView from './components/ExamView';
import ChatView from './components/ChatView';
import ChatWidget from './components/SideChat';
import LoginView from './components/LoginView';
import SupportView from './components/SupportView';
import AdminView from './components/AdminView';
import GeneratedQuestionsView from './components/GeneratedQuestionsView';
import { fetchGeneratedQuestions } from './services/generatedQuestionsService';
import { CloseIcon, MenuIcon } from './components/icons';
import { documentContent } from './studyMaterial';
import { generateQuiz, generateFlashcards, createChatSession, generateTargetedFlashcards, generateTargetedQuiz, generateQuizWithTopicDistribution, analyzeProgress } from './services/aiService';
import { generateQuizFromPdfs, generateFlashcardsFromPdfs } from './services/geminiService';
import { getDbQuestionsAsQuiz } from './services/supabaseService';
import { getRandomFlashcards } from './services/flashcardBank';
import { getCurrentUser, onAuthStateChange, signOut as authSignOut, User } from './services/authService';
import { saveUserStats, saveUserSession, saveUserAnalysis, getLatestUserAnalysis, getUserStats, UserStats } from './services/userStatsService';
import { categorizeQuestionsByTopic, calculateTopicProgress, getWeakAndStrongTopics, saveTopicProgress, getTopicProgress } from './services/topicTrackingService';
import { isAdmin } from './services/adminService';
import { checkPaymentStatus } from './services/paymentService';
import PaymentBanner from './components/PaymentBanner';
// Book references are now fetched on-demand when user reaches each question in QuizView

const App: React.FC = () => {
  const location = useLocation(); // Get location early for redirect handling
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true); // Track initial auth check
  const [isAdminUser, setIsAdminUser] = useState(false); // Track admin status
  const [currentView, setCurrentView] = useState<ViewType>('home');
  const [appError, setAppError] = useState<string | null>(null);
  const [sideChatContext, setSideChatContext] = useState('');
  const [isChatWidgetOpen, setIsChatWidgetOpen] = useState(false);
  const [quizHistory, setQuizHistory] = useState<QuizResult[]>([]);
  const [examHistory, setExamHistory] = useState<QuizResult[]>([]);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isExamInProgress, setIsExamInProgress] = useState(false);
  const [showReinforcementQuizReadyToast, setShowReinforcementQuizReadyToast] = useState(false);
  const [hasValidPayment, setHasValidPayment] = useState(false);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[] | null>(null);
  const [reinforcementQuizQuestions, setReinforcementQuizQuestions] = useState<QuizQuestion[] | null>(null);
  const [examQuestions, setExamQuestions] = useState<QuizQuestion[] | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[] | null>(null);
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);

  const [quizProgress, setQuizProgress] = useState<QuizProgress>({
    currentQuestionIndex: 0,
    selectedAnswer: null,
    showAnswer: false,
    score: 0,
    isFinished: false,
  });

  const [reinforcementQuizProgress, setReinforcementQuizProgress] = useState<QuizProgress>({
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
    'reinforcement-quiz': { generating: false },
    exam: { generating: false },
    flashcards: { generating: false },
  });
  const targetedQuizAttemptedRef = useRef(false); // Track if targeted quiz was attempted
  const targetedReinforcementQuizAttemptedRef = useRef(false); // Track if targeted reinforcement quiz was attempted

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedHistoryCount, setAnalyzedHistoryCount] = useState(0);
  const [examAnalysis, setExamAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzingExam, setIsAnalyzingExam] = useState(false);
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
  const reinforcementQuizProgressRef = useRef(reinforcementQuizProgress); // Keep ref in sync with reinforcement quiz progress
  const reinforcementQuizQuestionsRef = useRef(reinforcementQuizQuestions); // Keep ref in sync with reinforcement quiz questions
  const statsSavedForQuizRef = useRef(false); // Track if stats have been saved for current quiz
  const statsSavedForReinforcementQuizRef = useRef(false); // Track if stats have been saved for current reinforcement quiz
  const recentlyShownQuestionsRef = useRef<string[]>([]); // Track last 50 questions shown to avoid repeats
  const toastShownForQuizRef = useRef<string>(''); // Track which quiz we've shown toast for (by questions length)
  const chatSessionInitializedRef = useRef(false); // Track if chat session has been initialized
  const isCheckingAdminRef = useRef(false); // Track if admin check is in progress
  const lastCheckedUserIdRef = useRef<string | null>(null); // Track last checked user ID
  
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

  useEffect(() => {
    reinforcementQuizProgressRef.current = reinforcementQuizProgress;
  }, [reinforcementQuizProgress]);

  useEffect(() => {
    reinforcementQuizQuestionsRef.current = reinforcementQuizQuestions;
  }, [reinforcementQuizQuestions]);


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

  // Check for OAuth errors in URL on mount
  useEffect(() => {
    const checkOAuthError = () => {
      // Check both query params and hash params
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      
      const error = urlParams.get('error') || hashParams.get('error');
      const errorDescription = urlParams.get('error_description') || hashParams.get('error_description');
      const errorCode = urlParams.get('error_code') || hashParams.get('error_code');
      
      if (error) {
        // Decode the error description
        let decodedDescription = errorDescription || '';
        try {
          decodedDescription = decodeURIComponent(decodedDescription.replace(/\+/g, ' '));
        } catch (e) {
          // If decoding fails, use the original
          decodedDescription = errorDescription || '';
        }
        
        // Check if it's an OAuth exchange error
        if (errorCode === 'unexpected_failure' || decodedDescription.includes('Unable to exchange external code')) {
          setAppError('שגיאה בהתחברות עם גוגל. אנא ודא שההגדרות ב-Supabase נכונות. ראה את קובץ GOOGLE_OAUTH_SETUP.md להנחיות.');
        } else if (decodedDescription) {
          // Use the decoded error description
          setAppError(decodedDescription);
        } else {
          setAppError('שגיאה בהתחברות עם גוגל. נסה שוב מאוחר יותר.');
        }
        
        // Clear error from URL
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    };
    
    checkOAuthError();
  }, []);

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
      setAnalysis(null); // Clear old analysis to show only loading state
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
            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for DB consistency
            const { stats: updatedStats, error: statsReloadError } = await getUserStats(currentUser.id);
            if (!statsReloadError && updatedStats) {
              setUserStats(updatedStats);
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

  const resetReinforcementQuizProgress = () => {
    setReinforcementQuizProgress({
        currentQuestionIndex: 0,
        selectedAnswer: null,
        showAnswer: false,
        score: 0,
        isFinished: false,
    });
    // Reset stats saved flag when starting a new reinforcement quiz
    statsSavedForReinforcementQuizRef.current = false;
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
    const saveFinalQuizStats = async () => {
      if (quizProgress.isFinished && quizQuestions && quizHistory.length > 0 && currentUser && !statsSavedForQuizRef.current) {
        statsSavedForQuizRef.current = true; // Mark as saved to prevent duplicate saves
        
        // Use quizProgress.score if available (more reliable, especially for test button)
        // Otherwise calculate from quizHistory
        const score = quizProgress.score !== undefined && quizProgress.score !== null 
          ? quizProgress.score 
          : quizHistory.filter(r => r.isCorrect).length;
        const correctAnswers = score; // Use score as correctAnswers for consistency
        const totalQuestions = quizQuestions.length; // Use quizQuestions length, not quizHistory length
        
        // Get current stats to calculate cumulative totals
        const { stats: currentStats } = await getUserStats(currentUser.id);
        
        // Calculate cumulative totals (current stats + this quiz)
        const cumulativeTotalQuestions = (currentStats?.total_questions_answered || 0) + totalQuestions;
        const cumulativeCorrectAnswers = (currentStats?.total_correct_answers || 0) + correctAnswers;
        
        // Final stats save to ensure consistency (stats are already saved incrementally)
        // Use isIncremental=true to SET the cumulative values, not ADD to them
        const { error: statsError } = await saveUserStats(
          currentUser.id,
          'quiz',
          score,
          cumulativeTotalQuestions, // Pass cumulative total, not just this quiz
          cumulativeCorrectAnswers, // Pass cumulative correct, not just this quiz
          true // isIncremental - SET cumulative values, don't ADD
        );
        
        if (statsError) {
          console.error('Error saving final quiz stats:', statsError);
          statsSavedForQuizRef.current = false; // Reset on error so we can retry
        } else {
          // Add a small delay to ensure database write is complete
          await new Promise(resolve => setTimeout(resolve, 200));
          // Reload stats from database to update UI in real time
          const { stats: updatedStats, error: reloadError } = await getUserStats(currentUser.id);
          if (!reloadError && updatedStats) {
            setUserStats(updatedStats);
          } else if (reloadError) {
            console.error('Error reloading stats after quiz completion:', reloadError);
          } else {
            console.warn('No stats returned from getUserStats after quiz completion');
          }
        }
        
        // Save session
        const { error: sessionError } = await saveUserSession(
          currentUser.id,
          'quiz',
          quizQuestions,
          quizHistory,
          score
        );
        
        if (sessionError) {
          console.error('Error saving quiz session:', sessionError);
        }
      } else if (!quizProgress.isFinished) {
        // Reset the flag when quiz is not finished (new quiz started)
        statsSavedForQuizRef.current = false;
      }
    };
    
    saveFinalQuizStats();
  }, [quizProgress.isFinished, quizQuestions, quizHistory, currentUser]);

  // Helper function to add timeout to question generation
  const generateWithTimeout = async (
    generateFn: () => Promise<QuizQuestion[]>,
    timeoutMs: number = 60000 // 1 minute default
  ): Promise<QuizQuestion[] | null> => {
    try {
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
      });
      
      const result = await Promise.race([generateFn(), timeoutPromise]);
      return result;
    } catch (error) {
      console.error('Error in generateWithTimeout:', error);
      return null;
    }
  };

  const regenerateQuiz = useCallback(async () => {
    // Check payment status - don't generate quizzes if user hasn't paid
    if (!hasValidPayment && !isAdminUser) {
      setAppError('לשימוש בפלטפורמה יש להשלים תשלום. אנא השלם את התשלום כדי להמשיך.');
      return;
    }

    // CRITICAL: Don't regenerate if user is actively answering a question
    // This prevents disrupting their current question
    // EXCEPTION: If quiz is finished, always allow regeneration (user clicked "עשה בוחן נוסף")
    // Use refs to get the most current values
    const currentProgress = quizProgressRef.current;
    const currentIndex = currentProgress.currentQuestionIndex;
    const currentSelectedAnswer = currentProgress.selectedAnswer;
    const isQuizFinished = currentProgress.isFinished;
    
    // If quiz is finished, always allow regeneration - reset progress first
    if (isQuizFinished) {
    resetQuizProgress();
      // After reset, the ref should be updated, but we explicitly set it to ensure consistency
      quizProgressRef.current = {
        currentQuestionIndex: 0,
        selectedAnswer: null,
        showAnswer: false,
        score: 0,
        isFinished: false,
      };
      // Reset chat history when starting a new quiz
      if (chatSession) {
        setChatSession(prev => prev ? { ...prev, history: [] } : null);
      }
      // Continue with regeneration below
    } else {
      // Quiz is not finished - check if user is actively answering
      const userIsActive = currentIndex > 0 || currentSelectedAnswer !== null || currentProgress.showAnswer;
      
      if (userIsActive && quizQuestions && quizQuestions.length > 0) {
        return;
      }
    }
    
    // Capture the initial state - user should not have started when we begin
    // After reset, this should be 0 and null
    const resetProgress = quizProgressRef.current;
    const userHasStartedAtStart = resetProgress.currentQuestionIndex > 0 || resetProgress.selectedAnswer !== null;
    
    // Use a ref to track if user becomes active during generation
    const userBecameActiveRef = { current: false };
    
    setGenerationStatus(prev => ({ ...prev, quiz: { generating: true } }));
    setAppError(null);

    try {
        // Only reset progress if user hasn't started yet
        if (!userHasStartedAtStart) {
          resetQuizProgress();
        }
        
        // Regular quiz uses random questions from database (not AI-generated)
        // Only the "create specific quiz" button generates questions
        let dbQuestions: QuizQuestion[] = [];
        
        try {
          // Fetch random questions from database
          dbQuestions = await getDbQuestionsAsQuiz(TOTAL_QUESTIONS, documentContent);
          
          if (dbQuestions.length === 0) {
            console.warn('No questions found in database');
            setAppError("לא נמצאו שאלות במסד הנתונים. אנא נסה שוב מאוחר יותר.");
            return;
          }
          
          // Randomize options for all questions
          const randomizedQuestions = dbQuestions.map(q => {
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
          quizQuestionsRef.current = randomizedQuestions;
          
          // Book references will be fetched on-demand when user reaches each question
          
          // Reset targeted quiz flag when regular quiz is successfully generated
          targetedQuizAttemptedRef.current = false;
          
        } catch (error) {
          console.error('Error fetching questions from database:', error);
          if (error instanceof Error) setAppError(error.message);
          else setAppError("נכשל בטעינת שאלות מהמסד נתונים.");
        } finally {
          setGenerationStatus(prev => ({ ...prev, quiz: { generating: false } }));
        }
        
    } catch (error) {
        if (error instanceof Error) setAppError(error.message);
        else setAppError("נכשל ביצירת שאר שאלות הבוחן.");
    } finally {
        setGenerationStatus(prev => ({ ...prev, quiz: { ...prev.quiz, generating: false } }));
    }
  }, [documentContent, hasValidPayment, isAdminUser]); // Removed topicProgress to prevent excessive re-renders

  const regenerateReinforcementQuiz = useCallback(async () => {
    // Check payment status - don't generate quizzes if user hasn't paid
    if (!hasValidPayment && !isAdminUser) {
      setAppError('לשימוש בפלטפורמה יש להשלים תשלום. אנא השלם את התשלום כדי להמשיך.');
      return;
    }

    // CRITICAL: Don't regenerate if user is actively answering a question
    // This prevents disrupting their current question
    // EXCEPTION: If quiz is finished, always allow regeneration (user clicked "עשה בוחן נוסף")
    // Use refs to get the most current values
    const currentProgress = reinforcementQuizProgressRef.current;
    const currentIndex = currentProgress.currentQuestionIndex;
    const currentSelectedAnswer = currentProgress.selectedAnswer;
    const isQuizFinished = currentProgress.isFinished;
    
    // If quiz is finished, always allow regeneration - reset progress first
    if (isQuizFinished) {
      resetReinforcementQuizProgress();
      // After reset, the ref should be updated, but we explicitly set it to ensure consistency
      reinforcementQuizProgressRef.current = {
        currentQuestionIndex: 0,
        selectedAnswer: null,
        showAnswer: false,
        score: 0,
        isFinished: false,
      };
      // Reset chat history when starting a new quiz
      if (chatSession) {
        setChatSession(prev => prev ? { ...prev, history: [] } : null);
      }
      // Continue with regeneration below
    } else {
      // Quiz is not finished - check if user is actively answering
      const userIsActive = currentIndex > 0 || currentSelectedAnswer !== null || currentProgress.showAnswer;
      
      // Use ref to get current questions to avoid stale closure issues
      const currentQuestions = reinforcementQuizQuestionsRef.current;
      if (userIsActive && currentQuestions && currentQuestions.length > 0) {
        return;
      }
    }
    
    // Capture the initial state - user should not have started when we begin
    // After reset, this should be 0 and null
    const resetProgress = reinforcementQuizProgressRef.current;
    const userHasStartedAtStart = resetProgress.currentQuestionIndex > 0 || resetProgress.selectedAnswer !== null;
    
    setGenerationStatus(prev => ({ ...prev, 'reinforcement-quiz': { generating: true } }));
    setAppError(null);

    try {
        // Only reset progress if user hasn't started yet
        if (!userHasStartedAtStart) {
          resetReinforcementQuizProgress();
        }
        
        // Reinforcement quiz always uses AI generation
        setGenerationStatus(prev => ({ ...prev, 'reinforcement-quiz': { generating: true } }));
        setAppError(null);
        
        try {
          // Generate questions in batches: first 5 questions immediately, then the rest
          const FIRST_BATCH_SIZE = 5;
          const REMAINING_COUNT = TOTAL_QUESTIONS - FIRST_BATCH_SIZE;
          
          // Generate first batch of 10 questions
          const firstBatchQuestions = await generateQuizFromPdfs(FIRST_BATCH_SIZE);
          
          if (!firstBatchQuestions || firstBatchQuestions.length === 0) {
            throw new Error('No questions generated from PDFs');
          }
          
          // Randomize options for first batch
          const randomizedFirstBatch = firstBatchQuestions.map(q => {
            const correctAnswerText = q.options[q.correctAnswerIndex];
            const shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);
            const correctAnswerIndex = shuffledOptions.indexOf(correctAnswerText);
            
            return {
              ...q,
              options: shuffledOptions,
              correctAnswerIndex: correctAnswerIndex !== -1 ? correctAnswerIndex : 0
            };
          });
          
          // Show first batch immediately
          setReinforcementQuizQuestions(randomizedFirstBatch);
          reinforcementQuizQuestionsRef.current = randomizedFirstBatch;
          
          // Toast will be shown by useEffect when exactly 5 questions are ready
          
          // Reset targeted quiz flag when first batch is successfully generated
          targetedReinforcementQuizAttemptedRef.current = false;
          
          // Generate remaining questions in the background
          if (REMAINING_COUNT > 0) {
            // Keep generation status as true while loading remaining questions
            generateQuizFromPdfs(REMAINING_COUNT)
              .then(remainingQuestions => {
                if (remainingQuestions && remainingQuestions.length > 0) {
                  // Randomize options for remaining questions
                  const randomizedRemaining = remainingQuestions.map(q => {
                    const correctAnswerText = q.options[q.correctAnswerIndex];
                    const shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);
                    const correctAnswerIndex = shuffledOptions.indexOf(correctAnswerText);
                    
                    return {
                      ...q,
                      options: shuffledOptions,
                      correctAnswerIndex: correctAnswerIndex !== -1 ? correctAnswerIndex : 0
                    };
                  });
                  
                  // Append remaining questions to the existing ones
                  setReinforcementQuizQuestions(prev => {
                    const combined = [...(prev || []), ...randomizedRemaining];
                    reinforcementQuizQuestionsRef.current = combined;
                    
                    // Don't show toast here - only show when first batch is ready
                    
                    return combined;
                  });
                }
              })
              .catch(error => {
                console.error('Error generating remaining questions:', error);
                // Don't throw - user already has first batch, can continue
                setAppError('חלק מהשאלות לא נטענו. תוכל להמשיך עם השאלות הקיימות.');
              })
              .finally(() => {
                // Mark generation as complete when remaining questions are done
                setGenerationStatus(prev => ({ ...prev, 'reinforcement-quiz': { generating: false } }));
              });
          } else {
            // If no remaining questions, mark as complete
            setGenerationStatus(prev => ({ ...prev, 'reinforcement-quiz': { generating: false } }));
          }
          
          // Book references will be fetched on-demand when user reaches each question
          
          // Reset targeted quiz flag when reinforcement quiz is successfully generated
          targetedReinforcementQuizAttemptedRef.current = false;
          
        } catch (error) {
          console.error('Error generating reinforcement quiz questions:', error);
          if (error instanceof Error) setAppError(error.message);
          else setAppError("נכשל ביצירת שאלות הבוחן.");
        } finally {
          setGenerationStatus(prev => ({ ...prev, 'reinforcement-quiz': { generating: false } }));
        }
        
    } catch (error) {
        if (error instanceof Error) setAppError(error.message);
        else setAppError("נכשל ביצירת שאר שאלות הבוחן.");
    } finally {
        setGenerationStatus(prev => ({ ...prev, 'reinforcement-quiz': { ...prev['reinforcement-quiz'], generating: false } }));
    }
  }, [documentContent, chatSession, hasValidPayment, isAdminUser]);
  
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
  
  // Helper function to deduplicate questions and filter out recently shown ones
  const deduplicateQuestions = (questions: QuizQuestion[]): QuizQuestion[] => {
    const seen = new Set<string>();
    const unique: QuizQuestion[] = [];
    const recentlyShown = recentlyShownQuestionsRef.current;
    
    for (const q of questions) {
      const normalized = q.question.toLowerCase().trim();
      
      // Check if this question was shown recently (within last 50 questions)
      let wasRecentlyShown = false;
      for (const recentQuestion of recentlyShown) {
        if (normalized === recentQuestion || 
            (normalized.length > 20 && recentQuestion.length > 20 && calculateSimilarity(normalized, recentQuestion) > 0.85)) {
          wasRecentlyShown = true;
          break;
        }
      }
      
      if (wasRecentlyShown) {
        continue; // Skip this question - it was shown recently
      }
      
      // Check if we've seen a very similar question in the current batch
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
  
  // Helper function to add a question to recently shown list (keeps only last 50)
  const addToRecentlyShown = (question: string) => {
    const normalized = question.toLowerCase().trim();
    const recentlyShown = recentlyShownQuestionsRef.current;
    
    // Remove if already exists (to avoid duplicates in the list)
    const index = recentlyShown.findIndex(q => q === normalized || 
      (normalized.length > 20 && q.length > 20 && calculateSimilarity(normalized, q) > 0.85));
    
    if (index !== -1) {
      recentlyShown.splice(index, 1);
    }
    
    // Add to the beginning of the list
    recentlyShown.unshift(normalized);
    
    // Keep only the last 50 questions
    if (recentlyShown.length > 50) {
      recentlyShown.splice(50);
    }
  };
  
  const regenerateFlashcards = useCallback(async () => {
    // Check payment status - don't generate flashcards if user hasn't paid
    if (!hasValidPayment && !isAdminUser) {
      setAppError('לשימוש בפלטפורמה יש להשלים תשלום. אנא השלם את התשלום כדי להמשיך.');
      return;
    }

    setGenerationStatus(prev => ({ ...prev, flashcards: { generating: true } }));
    setAppError(null);
    
    try {
      // Regular flashcards use DB questions (same as regular quiz)
      // Only the "create specific flashcards" button generates questions with AI
      const dbQuestions = await getDbQuestionsAsQuiz(TOTAL_FLASHCARDS, documentContent);
      
      if (dbQuestions.length === 0) {
        console.warn('No questions found in database, falling back to PDF-based generation');
        // Fallback to PDF-based generation if no DB questions available
        const aiFlashcards = await generateFlashcardsFromPdfs(TOTAL_FLASHCARDS);
        setFlashcards(aiFlashcards);
        return;
      }
      
      // Convert quiz questions to flashcards format
      const dbFlashcards: Flashcard[] = dbQuestions.map(q => {
        // Use explanation if available, otherwise use the correct answer text
        const answer = q.explanation && q.explanation.trim() 
          ? q.explanation 
          : q.options[q.correctAnswerIndex] || 'לא צוין הסבר';
        
        return {
          question: q.question,
          answer: answer,
          bookReference: q.bookReference // Preserve book reference if available
        };
      });
      
      // Shuffle flashcards for variety
      const shuffledFlashcards = [...dbFlashcards].sort(() => Math.random() - 0.5);
      setFlashcards(shuffledFlashcards);
    } catch (error) {
      if (error instanceof Error) setAppError(error.message);
      else setAppError("נכשל ביצירת כרטיסיות.");
    } finally {
      setGenerationStatus(prev => ({ ...prev, flashcards: { ...prev.flashcards, generating: false } }));
    }
  }, [documentContent, hasValidPayment, isAdminUser]);
  
  const regenerateExam = useCallback(async () => {
    // Check payment status - don't generate exam if user hasn't paid
    if (!hasValidPayment && !isAdminUser) {
      setAppError('לשימוש בפלטפורמה יש להשלים תשלום. אנא השלם את התשלום כדי להמשיך.');
      return;
    }

    setGenerationStatus(prev => ({ ...prev, exam: { generating: true } }));

    setAppError(null);
    try {
      // Exam uses random questions from database (not AI-generated)
      const dbQuestions = await getDbQuestionsAsQuiz(TOTAL_QUESTIONS, documentContent);
      
      if (dbQuestions.length === 0) {
        setAppError("לא נמצאו שאלות במסד הנתונים. אנא נסה שוב מאוחר יותר.");
        return;
      }
      
      // Randomize options for all questions
      const randomizedQuestions = dbQuestions.map(q => {
        const correctAnswerText = q.options[q.correctAnswerIndex];
        const shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);
        const correctAnswerIndex = shuffledOptions.indexOf(correctAnswerText);
        
        return {
          ...q,
          options: shuffledOptions,
          correctAnswerIndex: correctAnswerIndex !== -1 ? correctAnswerIndex : 0
        };
      });
      
      setExamQuestions(randomizedQuestions);
      
      // Book references will be fetched on-demand when user reaches each question
    } catch (error) {
      if (error instanceof Error) {
        setAppError(error.message);
      } else {
        setAppError("נכשל בטעינת שאלות מהמסד נתונים.");
      }
    } finally {
      setGenerationStatus(prev => ({ ...prev, exam: { generating: false } }));
    }
  }, [documentContent, hasValidPayment, isAdminUser]);

  const handleLoginSuccess = useCallback(async (user: User) => {
    setCurrentUser(user);
    // Only regenerate if user has valid payment (or is admin)
    if (hasValidPayment || isAdminUser) {
      regenerateFlashcards();
      regenerateQuiz();
    }
    
    // Only create chat session if user has valid payment
    if (hasValidPayment) {
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
    } else {
      // Set payment message if user hasn't paid
      const paymentMessage = 'היי, אני דניאל, המורה הפרטי שלך. לצערי, אני לא יכול לענות על שאלות עד שתשלים את התשלום לפלטפורמה. אנא השלם את התשלום כדי להמשיך.';
      setChatSession({
        chat: null as any,
        history: [{ role: 'model', text: paymentMessage }],
      });
    }

  }, [regenerateFlashcards, regenerateQuiz, documentContent]);

  const handleLogout = async () => {
    try {
      const { error } = await authSignOut();
      if (error) {
        console.error('Logout error:', error);
        setAppError(error.message || 'שגיאה בהתנתקות');
      } else {
        // Explicitly reset state in case auth listener doesn't fire immediately
        setCurrentUser(null);
        setCurrentView('home');
        setHasValidPayment(false);
        setIsAdminUser(false);
      }
    } catch (err) {
      console.error('Exception during logout:', err);
      setAppError('שגיאה בהתנתקות');
    }
    // The auth state change listener will handle the rest
  };

  // Check for existing session on mount and listen to auth state changes
  // Check admin status when user changes (with guard to prevent loops)
  useEffect(() => {
    const checkAdminStatus = async () => {
      // Prevent multiple simultaneous checks
      if (isCheckingAdminRef.current) {
        return;
      }
      
      // Skip if we already checked this user
      if (currentUser && lastCheckedUserIdRef.current === currentUser.id) {
        return;
      }
      
      if (currentUser) {
        isCheckingAdminRef.current = true;
        lastCheckedUserIdRef.current = currentUser.id;
        try {
          const adminStatus = await isAdmin(currentUser.id);
          setIsAdminUser(adminStatus);
        } catch (error) {
          console.error('Error checking admin status:', error);
          setIsAdminUser(false);
        } finally {
          isCheckingAdminRef.current = false;
        }
      } else {
        setIsAdminUser(false);
        lastCheckedUserIdRef.current = null;
      }
    };
    checkAdminStatus();
  }, [currentUser]);

  // Check payment status when user and admin status are available
  useEffect(() => {
    if (currentUser) {
      if (isAdminUser) {
        // Admins have free access
        setHasValidPayment(true);
      } else {
        // Check payment status for regular users
        checkUserPaymentStatus(currentUser.id);
        
        // Periodically re-check payment status (every 10 seconds) to catch revocations immediately
        const paymentCheckInterval = setInterval(() => {
          checkUserPaymentStatus(currentUser.id);
        }, 10000); // Check every 10 seconds
        
        return () => clearInterval(paymentCheckInterval);
      }
    } else {
      setHasValidPayment(false);
    }
  }, [currentUser, isAdminUser]);

  // Also check payment status on route changes to catch revocations immediately
  useEffect(() => {
    if (currentUser && !isAdminUser) {
      checkUserPaymentStatus(currentUser.id);
    }
  }, [location.pathname, currentUser, isAdminUser]);

  useEffect(() => {
    let isInitialized = false;
    let currentUserForInit: User | null = null;

    // Helper function to initialize app state
    const initializeAppState = async (user: User | null) => {
      if (!isInitialized && user) {
        isInitialized = true;
        currentUserForInit = user;
        // Only regenerate if user has valid payment (or is admin)
        if (hasValidPayment || isAdminUser) {
          // Only regenerate if not already generated
          if (!flashcards) {
            regenerateFlashcards();
          }
          // Only regenerate if not already generating and no targeted quiz was attempted
          // This prevents triggering regenerateQuiz() when targeted quiz generation fails
          if (!quizQuestions && !generationStatus.quiz.generating && !targetedQuizAttemptedRef.current) {
            regenerateQuiz();
          }
          // Don't auto-generate reinforcement quiz - only generate when user clicks the button
          // if (!reinforcementQuizQuestions && !generationStatus['reinforcement-quiz'].generating && !targetedReinforcementQuizAttemptedRef.current) {
          //   regenerateReinforcementQuiz();
          // }
          if (!examQuestions) {
            regenerateExam();
          }
        }
        // Only initialize chat session if it hasn't been initialized yet (preserve existing history)
        if (!chatSessionInitializedRef.current) {
          chatSessionInitializedRef.current = true;
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
            chatSessionInitializedRef.current = false; // Reset on error so it can retry
          }
        }
      }
    };

    // Check for existing session immediately on mount (handles OAuth callback)
    const checkInitialSession = async () => {
      try {
        // Wait a bit for OAuth callback to process (if it's an OAuth redirect)
        // Check if there are OAuth callback parameters in the URL
        const hasOAuthParams = window.location.search.includes('code=') || 
                               window.location.hash.includes('access_token=') ||
                               window.location.hash.includes('code=') ||
                               window.location.hash.includes('type=recovery');
        
        if (hasOAuthParams) {
          // OAuth callback detected - wait longer for Supabase to process hash fragments
          // Wait longer for hash fragment processing
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Clear hash from URL after Supabase processes it
          if (window.location.hash) {
            // Remove hash but keep the path
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        }
        
        // Try multiple times to get the user (in case OAuth callback is still processing)
        let user = null;
        for (let i = 0; i < 5; i++) {
          user = await getCurrentUser();
          if (user) {
            break;
          }
          // Wait a bit before retrying (longer waits for OAuth)
          if (i < 4) {
            const waitTime = hasOAuthParams ? 500 : 300;
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
        
        if (user) {
          setCurrentUser(user);
          // Initialize app state for initial session
          const isNewUserSession = lastLoadedUserIdRef.current !== user.id;
          if (isNewUserSession && !isLoadingUserDataRef.current) {
            isLoadingUserDataRef.current = true;
            lastLoadedUserIdRef.current = user.id;
            
            // Load all user data in parallel
            const [analysisData, topicData, statsData] = await Promise.all([
              getLatestUserAnalysis(user.id),
              getTopicProgress(user.id),
              getUserStats(user.id)
            ]);
            
            if (!analysisData.error) {
              if (analysisData.analysis) {
                setAnalysis(analysisData.analysis);
              }
              const loadedQuizHistory = Array.isArray(analysisData.quizHistory) ? analysisData.quizHistory : [];
              const loadedExamHistory = Array.isArray(analysisData.examHistory) ? analysisData.examHistory : [];
              setQuizHistory(loadedQuizHistory);
              setExamHistory(loadedExamHistory);
            }
            
            if (!statsData.error && statsData.stats) {
              setUserStats(statsData.stats);
            }
            
            if (!topicData.error && topicData.topicProgress.size > 0) {
              setTopicProgress(topicData.topicProgress);
            }
            
            isLoadingUserDataRef.current = false;
          }
          await initializeAppState(user);
          
          // Payment status will be checked in useEffect after admin status is determined
        }
      } catch (error) {
        console.error('Error checking initial session:', error);
      } finally {
        setIsCheckingAuth(false);
      }
    };
    
    // Check initial session immediately
    checkInitialSession();

    // Listen to auth state changes (this will handle both initial load and subsequent changes)
    const { data: { subscription } } = onAuthStateChange(async (user) => {
      if (user) {
        // User found - always update
        setCurrentUser(user);
        setIsCheckingAuth(false);
        
        // Initialize app state for new session
        const isNewUserSession = lastLoadedUserIdRef.current !== user.id;
        if (isNewUserSession && !isLoadingUserDataRef.current) {
          isLoadingUserDataRef.current = true;
          lastLoadedUserIdRef.current = user.id;
          
          // Load all user data in parallel
          const [analysisData, topicData, statsData] = await Promise.all([
            getLatestUserAnalysis(user.id),
            getTopicProgress(user.id),
            getUserStats(user.id)
          ]);
          
          if (!analysisData.error) {
            if (analysisData.analysis) {
              setAnalysis(analysisData.analysis);
            }
            const loadedQuizHistory = Array.isArray(analysisData.quizHistory) ? analysisData.quizHistory : [];
            const loadedExamHistory = Array.isArray(analysisData.examHistory) ? analysisData.examHistory : [];
            setQuizHistory(loadedQuizHistory);
            setExamHistory(loadedExamHistory);
          }
          
          if (!statsData.error && statsData.stats) {
            setUserStats(statsData.stats);
          }
          
          if (!topicData.error && topicData.topicProgress.size > 0) {
            setTopicProgress(topicData.topicProgress);
          }
          
          isLoadingUserDataRef.current = false;
        }
        
        await initializeAppState(user);
      } else {
        // No user - only update if we're done checking initial session
        // Don't clear user during initial check to avoid race conditions
        if (!isCheckingAuth) {
    setCurrentUser(null);
          // User logged out - reset app state
    setCurrentView('home');
    setQuizHistory([]);
    setExamHistory([]);
    setQuizQuestions(null);
    setExamQuestions(null);
    setFlashcards(null);
    setChatSession(null);
          chatSessionInitializedRef.current = false; // Reset initialization flag on logout
    setIsExamInProgress(false);
    resetQuizProgress();
    resetFlashcardsProgress();
    setAnalysis(null);
    setIsAnalyzing(false);
    setAnalyzedHistoryCount(0);
          isInitialized = false;
          isLoadingUserDataRef.current = false;
          lastLoadedUserIdRef.current = null;
          setHasValidPayment(false);
        }
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

  // Check user payment status
  const checkUserPaymentStatus = async (userId: string) => {
    setIsCheckingPayment(true);
    try {
      const { hasValidPayment: isValid, payment, error } = await checkPaymentStatus(userId);
      if (error) {
        console.error('Error checking payment status:', error);
        setHasValidPayment(false);
      } else {
        setHasValidPayment(isValid);
      }
    } catch (error) {
      console.error('Error checking payment status:', error);
      setHasValidPayment(false);
    } finally {
      setIsCheckingPayment(false);
    }
  };

  // Handle payment success (called after redirect from Stripe)
  const handlePaymentSuccess = async () => {
    if (currentUser) {
      // Recheck payment status
      await checkUserPaymentStatus(currentUser.id);
    }
  };

  const handleQuestionAnswered = async (result: QuizResult) => {
    // Track this question as recently shown (to avoid repeats within 50 questions)
    addToRecentlyShown(result.question);
    
    // Don't categorize here - let the useEffect batch all categorizations together
    // Just add result to history and update local topic progress
    setQuizHistory(prev => [...prev, result]);
    
    // Update topic progress locally (don't save to DB yet - wait for batch)
    if (result.topic) {
      setTopicProgress(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(result.topic!) as { totalQuestions: number; correctAnswers: number; incorrectAnswers: number; accuracy: number } | undefined;
        const current = existing || { totalQuestions: 0, correctAnswers: 0, incorrectAnswers: 0, accuracy: 0 };
        const updated = {
          totalQuestions: current.totalQuestions + 1,
          correctAnswers: result.isCorrect ? current.correctAnswers + 1 : current.correctAnswers,
          incorrectAnswers: result.isCorrect ? current.incorrectAnswers : current.incorrectAnswers + 1,
          accuracy: 0
        };
        updated.accuracy = updated.totalQuestions > 0 
          ? (updated.correctAnswers / updated.totalQuestions) * 100 
          : 0;
        newMap.set(result.topic!, updated);
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
          // Add a small delay to ensure database write is complete
          await new Promise(resolve => setTimeout(resolve, 200));
          // Reload stats from database to update UI in real time
          const { stats: updatedStats, error: reloadError } = await getUserStats(currentUser.id);
          if (!reloadError && updatedStats) {
            setUserStats(updatedStats);
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
    // Track all exam questions as recently shown (to avoid repeats within 50 questions)
    results.forEach(result => {
      addToRecentlyShown(result.question);
    });
    
    // Don't categorize here - let the useEffect batch all categorizations together
    // Just add results to history - the useEffect will handle categorization and saving
    setExamHistory(prev => [...prev, ...results]);
    
    // Generate exam-specific analysis (only for this exam, not general history)
    setIsAnalyzingExam(true);
    setExamAnalysis(null); // Clear old analysis to show only loading state
    try {
      const userName = currentUser?.name || currentUser?.email?.split('@')[0] || undefined;
      const examSpecificAnalysis = await analyzeProgress(results, documentContent, userName);
      setExamAnalysis(examSpecificAnalysis);
    } catch (error) {
      console.error('Error generating exam-specific analysis:', error);
      setExamAnalysis(null);
    } finally {
      setIsAnalyzingExam(false);
    }
    
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
        // Add a small delay to ensure database write is complete
        await new Promise(resolve => setTimeout(resolve, 100));
        // Reload stats from database to update UI in real time
        const { stats: updatedStats, error: reloadError } = await getUserStats(currentUser.id);
        if (!reloadError && updatedStats) {
          setUserStats(updatedStats);
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
    
    // Don't clear questions or reset progress when switching between quiz types - preserve everything
    // Each quiz type maintains its own independent progress state
    if (currentView === 'quiz' && view === 'reinforcement-quiz') {
      // Switching from regular quiz to reinforcement quiz - preserve both progress states
      targetedQuizAttemptedRef.current = false;
      // Don't reset progress - preserve where user left off in each quiz
    } else if (currentView === 'reinforcement-quiz' && view === 'quiz') {
      // Switching from reinforcement quiz to regular quiz - preserve both progress states
      targetedReinforcementQuizAttemptedRef.current = false;
      // Don't reset progress - preserve where user left off in each quiz
    } else if ((view === 'quiz' || view === 'reinforcement-quiz') && currentView !== view) {
      // Switching to a quiz type from a different view (not from another quiz type)
      // Only clear questions if quiz is finished - preserve questions and progress if quiz is in progress
      if (currentView !== 'quiz' && currentView !== 'reinforcement-quiz') {
        // Coming from home or other non-quiz view
        // Only clear questions if quiz is finished (user completed it)
        if (view === 'quiz') {
          const isQuizFinished = quizProgress.isFinished;
          if (isQuizFinished) {
            // Quiz is finished - clear for fresh start
            setQuizQuestions(null);
            resetQuizProgress();
            try {
              sessionStorage.removeItem('quiz_regenerated_regular');
            } catch (error) {
              // Ignore sessionStorage errors
            }
          }
          // If quiz is not finished, preserve questions and progress
        } else if (view === 'reinforcement-quiz') {
          const isReinforcementQuizFinished = reinforcementQuizProgress.isFinished;
          if (isReinforcementQuizFinished) {
            // Quiz is finished - clear for fresh start
            setReinforcementQuizQuestions(null);
            resetReinforcementQuizProgress();
            try {
              sessionStorage.removeItem('quiz_regenerated_reinforcement');
            } catch (error) {
              // Ignore sessionStorage errors
            }
          }
          // If quiz is not finished, preserve questions and progress
        }
      }
    }
    
    // Reset chat history when starting a new quiz (only if coming from a different view AND quiz is finished)
    if ((view === 'quiz' || view === 'reinforcement-quiz') && currentView !== view && chatSession) {
      const isQuizFinished = view === 'quiz' ? quizProgress.isFinished : reinforcementQuizProgress.isFinished;
      if (isQuizFinished) {
        setChatSession(prev => prev ? { ...prev, history: [] } : null);
      }
    }
    
    // Don't reset targeted quiz flag when navigating away - preserve it so quiz doesn't regenerate
    // Only reset when quiz is finished
    
    // Dismiss toast when navigating to reinforcement quiz
    if (view === 'reinforcement-quiz') {
      setShowReinforcementQuizReadyToast(false);
    }
    
    setCurrentView(view);
    setIsMobileSidebarOpen(false);
    
    // Stats are automatically refreshed when quizzes/exams finish (in handleQuestionAnswered and handleExamFinished)
    // No need to refresh stats on every navigation to home
  }, [currentUser, chatSession, currentView]);
  
  // Show toast when first batch of reinforcement quiz is ready (exactly 5 questions, only once)
  useEffect(() => {
    const questionCount = reinforcementQuizQuestions?.length || 0;
    const FIRST_BATCH_SIZE = 5;
    const isFirstBatchReady = questionCount === FIRST_BATCH_SIZE; // Exactly 5, not more
    
    // Show toast only when first batch is exactly ready (5 questions) and user is not currently viewing the quiz
    // Only show once per quiz generation
    if (isFirstBatchReady && currentView !== 'reinforcement-quiz') {
      const firstBatchKey = `first_batch_ready`;
      // Only show if we haven't shown it yet for this quiz generation
      if (toastShownForQuizRef.current !== firstBatchKey) {
        setShowReinforcementQuizReadyToast(true);
        toastShownForQuizRef.current = firstBatchKey;
      }
    }
    
    // Hide toast when user navigates to reinforcement quiz
    if (currentView === 'reinforcement-quiz') {
      setShowReinforcementQuizReadyToast(false);
    }
    
    // Reset toast tracking when quiz is cleared or regenerated
    if (questionCount === 0) {
      toastShownForQuizRef.current = '';
      setShowReinforcementQuizReadyToast(false);
    }
  }, [reinforcementQuizQuestions?.length, currentView]);
  
  const handleCreateTargetedFlashcards = useCallback(async (weaknesses: string[]) => {
    // Check payment status - don't generate flashcards if user hasn't paid
    if (!hasValidPayment && !isAdminUser) {
      setAppError('לשימוש בפלטפורמה יש להשלים תשלום. אנא השלם את התשלום כדי להמשיך.');
      return;
    }
      setCurrentView('flashcards');
      setFlashcards(null);
      resetFlashcardsProgress();
      setGenerationStatus(prev => ({ ...prev, flashcards: { generating: true } }));
      setAppError(null);
      try {
          // Targeted flashcards use AI generation (for specific weaknesses)
          const flashcards = await generateTargetedFlashcards(weaknesses, documentContent, TOTAL_FLASHCARDS);
          setFlashcards(flashcards);
      } catch (error) {
          if (error instanceof Error) setAppError(error.message);
          else setAppError("נכשל ביצירת כרטיסיות ממוקדות.");
      } finally {
          setGenerationStatus(prev => ({ ...prev, flashcards: { ...prev.flashcards, generating: false } }));
      }
  }, [documentContent]);

  const handleCreateTargetedQuiz = useCallback(async (weaknesses: string[]) => {
      // Check payment status - don't generate quiz if user hasn't paid
      if (!hasValidPayment && !isAdminUser) {
        setAppError('לשימוש בפלטפורמה יש להשלים תשלום. אנא השלם את התשלום כדי להמשיך.');
        return;
      }

      // Always navigate to reinforcement quiz view when clicking "צור בוחן חיזוק"
      setCurrentView('reinforcement-quiz');
      
      // Mark that targeted quiz was attempted - this prevents regenerateReinforcementQuiz() from being called
      targetedReinforcementQuizAttemptedRef.current = true;
      
      // Don't clear questions here - keep old questions until new ones are generated
      // This prevents triggering regenerateReinforcementQuiz() which uses AI generation
      // Don't clear quiz history - it's cumulative across sessions
      // Only reset progress for the current quiz attempt
      resetReinforcementQuizProgress();
      setGenerationStatus(prev => ({ ...prev, 'reinforcement-quiz': { generating: true } }));
      setAppError(null);
      try {
          // Generate all targeted questions in a single API call
          const questions = await generateTargetedQuiz(weaknesses, documentContent, TOTAL_QUESTIONS);
          
          if (!questions || questions.length === 0) {
            throw new Error('No questions generated');
          }
          
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
          
          setReinforcementQuizQuestions(randomizedQuestions);
          
          // Book references will be fetched on-demand when user reaches each question
      } catch (error) {
          console.error('handleCreateTargetedQuiz: Error generating targeted quiz:', error);
          if (error instanceof Error) setAppError(error.message);
          else setAppError("נכשל ביצירת בוחן ממוקד.");
          // Don't set questions to null on error - keep existing questions
          // This prevents triggering regenerateReinforcementQuiz() which uses AI generation
      } finally {
          setGenerationStatus(prev => ({ ...prev, 'reinforcement-quiz': { ...prev['reinforcement-quiz'], generating: false } }));
      }
  }, [documentContent]);


  const renderView = () => {
    switch (currentView) {
      case 'home':
        return (
          <div className="flex-1 overflow-y-auto">
            <HomeView 
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
              userName={currentUser?.name || currentUser?.email?.split('@')[0]}
              hasValidPayment={hasValidPayment || isAdminUser}
            />
            {generatedQuestions.length > 0 && (
              <GeneratedQuestionsView questions={generatedQuestions} />
            )}
          </div>
        );
      case 'quiz':
        if (!currentUser?.email_confirmed) {
          return (
            <div className="flex-grow p-4 md:p-8 overflow-y-auto flex items-center justify-center">
              <div className="bg-white border border-yellow-200 rounded-2xl shadow-sm p-8 max-w-md text-center">
                <svg className="h-12 w-12 text-yellow-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">אימות אימייל נדרש</h3>
                <p className="text-sm text-yellow-700 mb-4">
                  אנא בדוק את תיבת הדואר הנכנס שלך וצור קשר עם האימייל ששלחנו כדי לאמת את החשבון שלך.
                </p>
                <button 
                  onClick={() => handleSetView('home')}
                  className="px-4 py-2 bg-sky-600 text-white rounded-2xl hover:bg-sky-700 transition-colors"
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
            isTargetedQuizGenerating={generationStatus.quiz.generating || targetedQuizAttemptedRef.current}
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
            chatSession={chatSession}
            setChatSession={setChatSession}
            quizType="regular"
            hasValidPayment={hasValidPayment || isAdminUser}
        />;
      case 'reinforcement-quiz':
        if (!currentUser?.email_confirmed) {
          return (
            <div className="flex-grow p-4 md:p-8 overflow-y-auto flex items-center justify-center">
              <div className="bg-white border border-yellow-200 rounded-2xl shadow-sm p-8 max-w-md text-center">
                <svg className="h-12 w-12 text-yellow-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">אימות אימייל נדרש</h3>
                <p className="text-sm text-yellow-700 mb-4">
                  אנא בדוק את תיבת הדואר הנכנס שלך וצור קשר עם האימייל ששלחנו כדי לאמת את החשבון שלך.
                </p>
                <button 
                  onClick={() => handleSetView('home')}
                  className="px-4 py-2 bg-sky-600 text-white rounded-2xl hover:bg-sky-700 transition-colors"
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
            questions={reinforcementQuizQuestions}
            isLoading={generationStatus['reinforcement-quiz'].generating}
            isTargetedQuizGenerating={generationStatus['reinforcement-quiz'].generating || targetedReinforcementQuizAttemptedRef.current}
            regenerateQuiz={regenerateReinforcementQuiz}
            totalQuestions={TOTAL_QUESTIONS}
            quizProgress={reinforcementQuizProgress}
            setQuizProgress={setReinforcementQuizProgress}
            setView={handleSetView}
            createTargetedFlashcards={handleCreateTargetedFlashcards}
            createTargetedQuiz={handleCreateTargetedQuiz}
            userName={currentUser?.name || currentUser?.email?.split('@')[0]}
            analysis={analysis}
            isAnalyzing={isAnalyzing}
            chatSession={chatSession}
            setChatSession={setChatSession}
            quizType="reinforcement"
            hasValidPayment={hasValidPayment || isAdminUser}
        />;
      case 'exam':
        if (!currentUser?.email_confirmed) {
          return (
            <div className="flex-grow p-4 md:p-8 overflow-y-auto flex items-center justify-center">
              <div className="bg-white border border-yellow-200 rounded-2xl shadow-sm p-8 max-w-md text-center">
                <svg className="h-12 w-12 text-yellow-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">אימות אימייל נדרש</h3>
                <p className="text-sm text-yellow-700 mb-4">
                  אנא בדוק את תיבת הדואר הנכנס שלך וצור קשר עם האימייל ששלחנו כדי לאמת את החשבון שלך.
                </p>
                <button 
                  onClick={() => handleSetView('home')}
                  className="px-4 py-2 bg-sky-600 text-white rounded-2xl hover:bg-sky-700 transition-colors"
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
            analysis={examAnalysis}
            isAnalyzing={isAnalyzingExam}
            hasValidPayment={hasValidPayment || isAdminUser}
        />;
      case 'flashcards':
        if (!currentUser?.email_confirmed) {
          return (
            <div className="flex-grow p-4 md:p-8 overflow-y-auto flex items-center justify-center">
              <div className="bg-white border border-yellow-200 rounded-2xl shadow-sm p-8 max-w-md text-center">
                <svg className="h-12 w-12 text-yellow-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">אימות אימייל נדרש</h3>
                <p className="text-sm text-yellow-700 mb-4">
                  אנא בדוק את תיבת הדואר הנכנס שלך וצור קשר עם האימייל ששלחנו כדי לאמת את החשבון שלך.
                </p>
                <button 
                  onClick={() => handleSetView('home')}
                  className="px-4 py-2 bg-sky-600 text-white rounded-2xl hover:bg-sky-700 transition-colors"
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
            hasValidPayment={hasValidPayment || isAdminUser}
        />;
      case 'chat':
        if (!currentUser?.email_confirmed) {
          return (
            <div className="flex-grow p-4 md:p-8 overflow-y-auto flex items-center justify-center">
              <div className="bg-white border border-yellow-200 rounded-2xl shadow-sm p-8 max-w-md text-center">
                <svg className="h-12 w-12 text-yellow-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">אימות אימייל נדרש</h3>
                <p className="text-sm text-yellow-700 mb-4">
                  אנא בדוק את תיבת הדואר הנכנס שלך וצור קשר עם האימייל ששלחנו כדי לאמת את החשבון שלך.
                </p>
                <button 
                  onClick={() => handleSetView('home')}
                  className="px-4 py-2 bg-sky-600 text-white rounded-2xl hover:bg-sky-700 transition-colors"
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
            hasValidPayment={hasValidPayment || isAdminUser}
        />;
      case 'support':
        return <SupportView currentUser={currentUser} />;
      case 'admin':
        if (!isAdminUser) {
          return (
            <div className="flex-grow p-4 md:p-8 overflow-y-auto flex items-center justify-center">
              <div className="bg-white border border-red-200 rounded-2xl shadow-sm p-8 max-w-md text-center">
                <svg className="h-12 w-12 text-red-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-semibold text-red-800 mb-2">גישה נדחתה</h3>
                <p className="text-sm text-red-700 mb-4">
                  אין לך הרשאות מנהל לגשת לדף זה.
                </p>
                <button 
                  onClick={() => handleSetView('home')}
                  className="px-4 py-2 bg-sky-600 text-white rounded-2xl hover:bg-sky-700 transition-colors"
                >
                  חזור לדף הבית
                </button>
              </div>
            </div>
          );
        }
        return <AdminView currentUser={currentUser} />;
      default:
        return null;
    }
  };

  // Handle redirect back from Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paymentStatus = params.get('payment');
    
    if (paymentStatus === 'success' && currentUser) {
      // Remove query param from URL
      window.history.replaceState({}, '', window.location.pathname);
      // Wait a moment for webhook to process, then recheck payment status
      setTimeout(() => {
        checkUserPaymentStatus(currentUser.id);
      }, 2000); // Wait 2 seconds for webhook to process
      // Show success message
      setAppError(null);
    } else if (paymentStatus === 'canceled') {
      // Remove query param from URL
      window.history.replaceState({}, '', window.location.pathname);
      setAppError('התשלום בוטל. ניתן לנסות שוב בכל עת.');
    }
  }, [location.search, currentUser]);

  
  if (isCheckingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">בודק התחברות...</p>
        </div>
      </div>
    );
  }

  // If on login route, show login view
  if (location.pathname === '/login') {
    if (currentUser) {
      // User is logged in, redirect to home
      return <Navigate to="/" replace />;
    }
    return <LoginView onLogin={handleLoginSuccess} />;
  }

  // If not logged in and not on login route, redirect to login
  if (!currentUser) {
    return <Navigate to="/login" replace />;
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
          isAdmin={isAdminUser}
          hasValidPayment={hasValidPayment || isAdminUser}
        />
      )}

      {isMobileSidebarOpen && !isExamInProgress && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        ></div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Payment Banner - show when user is logged in but hasn't paid */}
        {currentUser && !hasValidPayment && !isAdminUser && (
          <PaymentBanner 
            userId={currentUser.id}
            userEmail={currentUser.email || ''}
          />
        )}

        {!isExamInProgress && (
          <button 
            onClick={() => setIsMobileSidebarOpen(true)} 
            className="md:hidden fixed top-4 right-4 z-30 p-2 bg-slate-700/20 backdrop-blur-xl rounded-xl border border-white/20 shadow-lg"
            aria-label="פתח תפריט"
          >
            <MenuIcon className="h-6 w-6 text-slate-700" />
          </button>
        )}

        {appError && (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 max-w-md w-11/2 p-4 bg-red-100 border border-red-300 text-red-700 rounded-2xl shadow-lg flex items-center justify-between z-50 animate-fade-in">
                <span>{appError}</span>
                <button onClick={() => setAppError(null)} className="p-1 rounded-full hover:bg-red-200 mr-2">
                    <CloseIcon className="h-5 w-5" />
                </button>
            </div>
        )}
        
        {/* Toast notification when reinforcement quiz is ready */}
        {showReinforcementQuizReadyToast && (
          <div className="fixed bottom-24 left-4 z-[9999] max-w-sm w-[calc(100vw-2rem)] animate-fade-in">
            <div 
              onClick={() => {
                setShowReinforcementQuizReadyToast(false);
                handleSetView('reinforcement-quiz');
              }}
              className="bg-gradient-to-r from-sky-500 to-blue-600 text-white p-4 rounded-2xl shadow-xl cursor-pointer hover:from-sky-600 hover:to-blue-700 transition-all duration-200 border-2 border-white/20"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl">🎉</span>
                    <h3 className="font-semibold text-lg">הבוחן החיזוק מוכן!</h3>
                  </div>
                  <p className="text-sm text-white/90 leading-relaxed">
                    סיימנו להכין את הבוחן המותאם אישית שלך. לחץ כדי להתחיל!
                  </p>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowReinforcementQuizReadyToast(false);
                  }}
                  className="p-1 rounded-full hover:bg-white/20 transition-colors mr-2 flex-shrink-0"
                  aria-label="סגור"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
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
                hasValidPayment={hasValidPayment || isAdminUser}
            />
        )}
      </main>
    </div>
  );
};

export default App;