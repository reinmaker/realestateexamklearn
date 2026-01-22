import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { QuizQuestion, QuizResult, QuizProgress, AnalysisResult, ViewType, ChatSession, ChatMessage } from '../types';
import { SparklesIcon, FlashcardsIcon, QuizIcon, CheckIcon, CloseIcon, SpeakerIcon } from './icons';
import { generateSpeech, generateTeacherReaction } from '../services/aiService';
import { getCachedBookReference, setCachedBookReference, hasCachedBookReference } from '../services/bookReferenceCache';


const ProgressCircle: React.FC<{ percentage: number }> = ({ percentage }) => {
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
        <div className="relative w-40 h-40">
            <svg className="w-full h-full" viewBox="0 0 120 120">
                <circle className="text-slate-200" strokeWidth="10" stroke="currentColor" fill="transparent" r={radius} cx="60" cy="60" />
                <circle
                    className="text-sky-500"
                    strokeWidth="10"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx="60"
                    cy="60"
                    transform="rotate(-90 60 60)"
                    style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold text-slate-800">{percentage.toFixed(0)}%</span>
            </div>
        </div>
    );
};


interface QuizViewProps {
  userName?: string;
  documentContent: string;
  setAppError: (error: string | null) => void;
  openSideChat: (context: string) => void;
  onQuestionAnswered: (result: QuizResult) => void;
  questions: QuizQuestion[] | null;
  isLoading: boolean;
  isTargetedQuizGenerating?: boolean; // Indicates if a targeted quiz is being generated or was attempted
  regenerateQuiz: () => void;
  totalQuestions: number;
  quizProgress: QuizProgress;
  setQuizProgress: React.Dispatch<React.SetStateAction<QuizProgress>>;
  setView: (view: ViewType) => void;
  createTargetedFlashcards: (weaknesses: string[]) => Promise<void>;
  createTargetedQuiz: (weaknesses: string[]) => Promise<void>;
  analysis: AnalysisResult | null;
  isAnalyzing: boolean;
  chatSession: ChatSession | null;
  setChatSession: React.Dispatch<React.SetStateAction<ChatSession | null>>;
  quizType?: 'regular' | 'reinforcement'; // Distinguish between regular quiz (DB) and reinforcement quiz (AI)
  hasValidPayment?: boolean;
}

const QuizView: React.FC<QuizViewProps> = ({
  userName, documentContent, setAppError, openSideChat, onQuestionAnswered, questions, isLoading, isTargetedQuizGenerating = false, regenerateQuiz, totalQuestions, quizProgress, setQuizProgress, setView, createTargetedFlashcards, createTargetedQuiz, analysis, isAnalyzing, chatSession, setChatSession, quizType = 'regular', hasValidPayment = true }) => {
  
  const hebrewLetters = ['א', 'ב', 'ג', 'ד'];
  
  const { currentQuestionIndex, selectedAnswer, showAnswer, score, isFinished } = quizProgress;
  const isFullyLoaded = questions && questions.length >= totalQuestions;
  
  const [userAnswers, setUserAnswers] = useState<(number | null)[]>([]);
  
  // Track the last questions length to detect actual length changes (not just reference changes)
  const lastQuestionsLengthRef = useRef<number>(0);
  const userHasStartedRef = useRef<boolean>(false);
  
  // Reset internal state when quiz type changes (switching between regular and reinforcement quiz)
  useEffect(() => {
    // Reset internal state when quiz type changes
    setUserAnswers([]);
    lastQuestionsLengthRef.current = 0;
    userHasStartedRef.current = false;
    // Reset stable question refs to ensure correct question is shown for new quiz type
    stableCurrentQuestionRef.current = null;
    stableCurrentQuestionIndexRef.current = -1;
    lastQuestionTextRef.current = '';
    stableBookReferenceRef.current = null;
    lastBookReferenceRef.current = null;
  }, [quizType]);
  
  // Mark that user has started once they interact with the quiz
  useEffect(() => {
    if (currentQuestionIndex > 0 || selectedAnswer !== null || isFinished) {
      userHasStartedRef.current = true;
    }
  }, [currentQuestionIndex, selectedAnswer, isFinished]);
  
  // Preserve current question index when questions array changes
  // Only adjust if the current index is truly out of bounds AND we're not loading more questions
  useEffect(() => {
    // Never adjust if user has started - preserve their position
    if (userHasStartedRef.current) {
      return;
    }
    
    // Don't adjust if we're still loading questions (questions are being added progressively)
    if (isLoading || !isFullyLoaded) {
      return; // Wait for questions to finish loading
    }
    
    // Only adjust if length actually changed (not just array reference)
    const currentLength = questions?.length || 0;
    if (currentLength === lastQuestionsLengthRef.current) {
      return; // Length hasn't changed, just reference update (e.g., from preFetchBookReferences)
    }
    
    lastQuestionsLengthRef.current = currentLength;
    
    // Only adjust if index is out of bounds after loading is complete
    if (questions && questions.length > 0 && currentQuestionIndex >= questions.length) {
      const newIndex = Math.max(0, questions.length - 1);
      if (newIndex !== currentQuestionIndex) {
        setQuizProgress(prev => ({
          ...prev,
          currentQuestionIndex: newIndex,
        }));
      }
    }
  }, [questions?.length, currentQuestionIndex, isLoading, isFullyLoaded]); // Include loading state
  const [isGeneratingTargeted, setIsGeneratingTargeted] = useState<'flashcards' | 'quiz' | null>(null);
  const [progress, setProgress] = useState(0);
  const progressIntervalRef = useRef<number | null>(null);
  const progressStartTimeRef = useRef<number | null>(null);
  
  // Rotating funny and informative messages while loading
  const loadingMessages = useMemo(() => [
    "הבינה המלאכותית מנתחת את חומר הלימוד כדי ליצור סט ייחודי של שאלות עבורך. תהליך זה עשוי להימשך מספר רגעים.",
    "📚 קורא את כל החוקים והתקנות... (כן, גם את הקטנים!)",
    "🧠 מחפש את הנושאים הכי חשובים במבחן הרישוי...",
    "💡 יוצר שאלות שיעזרו לך באמת להבין את החומר...",
    "📖 בודק את כל ההפניות לספרים - כל שאלה תהיה מדויקת!",
    "⚖️ מנתח פסקי דין רלוונטיים... (הבינה המלאכותית קוראת הרבה!)",
    "🎯 בוחר שאלות מגוונות מכל חלקי הספר - לא רק מההתחלה!",
    "🔍 מחפש את הנושאים הכי נפוצים במבחנים...",
    "✨ יוצר שאלות ייחודיות רק עבורך - לא תמצא אותן בשום מקום אחר!",
    "📝 בודק שהשאלות ברורות ומובנות...",
    "🎓 מתכונן להכין לך את הבוחן הכי טוב שיהיה!",
    "💪 הבינה המלאכותית עובדת קשה כדי שתוכל לעבור את המבחן!",
    "📊 מנתח אלפי שאלות קודמות כדי להבין מה באמת חשוב...",
    "🔎 מחפש את כל הפרטים הקטנים שחשובים במבחן...",
    "🌟 טוען שאלות נוספות ברקע... תוכל להתחיל כבר עכשיו!",
    "⚡ השאלות הראשונות מוכנות! שאר השאלות נטענות ברקע...",
  ], []);
  
  // Persist progress state across component remounts (e.g., when switching tabs)
  // Use a unique key based on quiz type to avoid conflicts
  const progressStorageKey = useMemo(() => `quiz_progress_${quizType || 'regular'}`, [quizType]);
  
  // Load persisted progress on mount or when loading state changes
  useEffect(() => {
    // Only restore if we're loading and don't have questions yet
    if (isLoading && (!questions || questions.length === 0)) {
      try {
        const savedStartTime = sessionStorage.getItem(`${progressStorageKey}_startTime`);
        if (savedStartTime && !progressStartTimeRef.current) {
          const startTime = parseInt(savedStartTime, 10);
          const elapsed = Date.now() - startTime;
          const duration = 90000; // 90 seconds (1:30)
          const calculatedProgress = Math.min(Math.round((elapsed / duration) * 100), 100);
          
          // Only restore if loading is still in progress and progress is valid
          if (calculatedProgress < 100 && elapsed < duration && elapsed >= 0) {
            setProgress(calculatedProgress);
            progressStartTimeRef.current = startTime;
          } else {
            // Clear stale progress
            sessionStorage.removeItem(progressStorageKey);
            sessionStorage.removeItem(`${progressStorageKey}_startTime`);
          }
        }
      } catch (error) {
        console.warn('Failed to restore progress from sessionStorage:', error);
      }
    }
  }, [isLoading, questions?.length, progressStorageKey]); // Restore when loading starts
  const [isAudioLoading, setIsAudioLoading] = useState<'question' | 'explanation' | null>(null);
  const [teacherMessage, setTeacherMessage] = useState<string | null>(null);
  const [showTeacherMessage, setShowTeacherMessage] = useState(false);
  const [teacherMessageQuestion, setTeacherMessageQuestion] = useState<QuizQuestion | null>(null); // Store question context for chat
  const recentStreakRef = useRef<number>(0); // Track recent correct/incorrect streak
  const [showBookReference, setShowBookReference] = useState(false); // State for showing/hiding book reference
  const [displayBookReference, setDisplayBookReference] = useState<string | null>(null); // Converted book reference for display
  const [isLoadingBookReference, setIsLoadingBookReference] = useState(false); // State for loading book reference
  
  // Store stable reference to current question to prevent jumps when questions array reference changes
  const stableCurrentQuestionRef = useRef<QuizQuestion | null>(null);
  const stableCurrentQuestionIndexRef = useRef<number>(-1);

  // Convert book reference to new format when question changes
  // Use a ref to track the last question text to avoid re-running when questions array updates
  const lastQuestionTextRef = useRef<string>('');
  const stableBookReferenceRef = useRef<string | null>(null);
  const lastBookReferenceRef = useRef<string | null>(null);
  
  // Effect 1: Handle book reference when question index changes (using stable question)
  useEffect(() => {
    // Always use question from array directly to ensure we have the correct question for current index
    const questionFromArray = questions && questions.length > 0 && currentQuestionIndex >= 0 && currentQuestionIndex < questions.length
      ? questions[currentQuestionIndex]
      : null;
    
    // If no question available, clear display
    if (!questionFromArray) {
      if (!questions || questions.length === 0 || currentQuestionIndex >= questions.length) {
        setDisplayBookReference(null);
        setIsLoadingBookReference(false);
        stableBookReferenceRef.current = null;
        lastBookReferenceRef.current = null;
        return;
      }
      // Wait for question to be available
      return;
    }
    
    const questionText = questionFromArray.question || '';
    
    // Verify we have a valid question text
    if (!questionText || questionText.trim().length === 0) {
      console.warn('QuizView: Empty question text at index', currentQuestionIndex);
      return;
    }
    
    // Only run if the question text actually changed (index changed)
    if (questionText === lastQuestionTextRef.current) {
      // Same question - use stable book reference if available
      if (stableBookReferenceRef.current !== null) {
        setDisplayBookReference(stableBookReferenceRef.current);
        setIsLoadingBookReference(false);
      }
      return; // Same question, don't reload book reference
    }
    
    // Question changed - reset and load new reference
    lastQuestionTextRef.current = questionText;
    const questionKey = questionText; // Use question text as cache key
    
    // Check module-level cache first
    if (hasCachedBookReference(questionKey)) {
      const cachedRef = getCachedBookReference(questionKey);
      setDisplayBookReference(cachedRef || null);
      stableBookReferenceRef.current = cachedRef || null;
      lastBookReferenceRef.current = cachedRef || null;
      setIsLoadingBookReference(false);
      return;
    }
    
    // Reset loading state when question changes
    setIsLoadingBookReference(true);
    setShowBookReference(false);
    
    // Check if book reference exists (from database or previous fetch)
    const bookReference = questionFromArray?.bookReference;
    
    if (bookReference) {
      // Check if it's already new format
      if (bookReference.includes('מופיע בעמ') || bookReference.includes('מתחילות בעמ')) {
        setDisplayBookReference(bookReference);
        stableBookReferenceRef.current = bookReference;
        lastBookReferenceRef.current = bookReference;
        setCachedBookReference(questionKey, bookReference);
        setIsLoadingBookReference(false);
      } else {
        // Convert old format to new format
        import('../services/bookReferenceService').then(({ convertOldFormatToNew }) => {
          const converted = convertOldFormatToNew(bookReference, questionText);
          setDisplayBookReference(converted);
          stableBookReferenceRef.current = converted;
          lastBookReferenceRef.current = converted;
          setCachedBookReference(questionKey, converted);
          setIsLoadingBookReference(false);
        });
      }
    } else {
      // Try to generate book reference if missing
      import('../services/bookReferenceService').then(({ getBookReferenceByAI }) => {
        getBookReferenceByAI(questionText, undefined, documentContent)
          .then((generatedRef) => {
            setDisplayBookReference(generatedRef);
            stableBookReferenceRef.current = generatedRef;
            lastBookReferenceRef.current = generatedRef;
            setCachedBookReference(questionKey, generatedRef);
            setIsLoadingBookReference(false);
          })
          .catch((error) => {
            console.warn('QuizView: Failed to generate bookReference:', error);
            setDisplayBookReference(null);
            stableBookReferenceRef.current = null;
            lastBookReferenceRef.current = null;
            setIsLoadingBookReference(false);
          });
      });
    }
  }, [currentQuestionIndex, questions]); // Fetch book reference when user reaches each question

  useEffect(() => {
    // If loading, start animated progress from 0% to 100% over 90 seconds (1:30)
    if (isLoading && (!questions || questions.length === 0)) {
      // Only reset and start animation if not already in progress
      // Check both ref and sessionStorage to prevent reset when switching tabs
      if (!progressStartTimeRef.current) {
        // Check sessionStorage first
        try {
          const savedStartTime = sessionStorage.getItem(`${progressStorageKey}_startTime`);
          if (savedStartTime) {
            const startTime = parseInt(savedStartTime, 10);
            const elapsed = Date.now() - startTime;
            const duration = 90000; // 90 seconds (1:30)
            
            // Only use saved time if it's still valid (less than duration)
            if (elapsed < duration && elapsed >= 0) {
              progressStartTimeRef.current = startTime;
              const currentProgress = Math.min(Math.round((elapsed / duration) * 100), 100);
              setProgress(currentProgress);
            } else {
              // Start fresh if saved time is stale
              progressStartTimeRef.current = Date.now();
              sessionStorage.setItem(`${progressStorageKey}_startTime`, progressStartTimeRef.current.toString());
              setProgress(0);
            }
          } else {
            // Start fresh
            progressStartTimeRef.current = Date.now();
            sessionStorage.setItem(`${progressStorageKey}_startTime`, progressStartTimeRef.current.toString());
            setProgress(0);
          }
        } catch (error) {
          // Fallback if sessionStorage fails
          progressStartTimeRef.current = Date.now();
          setProgress(0);
        }
      } else {
        // Ensure start time is saved to sessionStorage
        try {
          sessionStorage.setItem(`${progressStorageKey}_startTime`, progressStartTimeRef.current.toString());
        } catch (error) {
          // Ignore sessionStorage errors
        }
      }
      
      // Clear any existing interval before creating a new one
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      
      // Handle page visibility to prevent progress reset when switching tabs
      const handleVisibilityChange = () => {
        if (!document.hidden && progressStartTimeRef.current) {
          // Tab became active - recalculate progress based on actual elapsed time
          // This ensures progress continues from where it should be, not reset
          const elapsed = Date.now() - progressStartTimeRef.current;
          const duration = 90000; // 90 seconds (1:30)
          const currentProgress = Math.min((elapsed / duration) * 100, 100);
          
          // Update progress immediately when tab becomes visible
          setProgress(Math.round(currentProgress));
          
          // Persist to sessionStorage
          try {
            sessionStorage.setItem(progressStorageKey, Math.round(currentProgress).toString());
          } catch (error) {
            // Ignore sessionStorage errors
          }
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      // Update progress every 100ms for smooth animation
      progressIntervalRef.current = window.setInterval(() => {
        if (progressStartTimeRef.current) {
          const elapsed = Date.now() - progressStartTimeRef.current;
          const duration = 90000; // 90 seconds (1:30)
          const newProgress = Math.min(Math.round((elapsed / duration) * 100), 100);
          setProgress(newProgress);
          
          // Persist progress to sessionStorage
          try {
            sessionStorage.setItem(progressStorageKey, newProgress.toString());
          } catch (error) {
            // Ignore sessionStorage errors
          }
          
          // Stop animation when reaching 100%
          if (newProgress >= 100) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
            progressStartTimeRef.current = null;
            // Clear persisted progress
            try {
              sessionStorage.removeItem(progressStorageKey);
              sessionStorage.removeItem(`${progressStorageKey}_startTime`);
            } catch (error) {
              // Ignore sessionStorage errors
            }
          }
        }
      }, 100);
      
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        // Don't clear progressStartTimeRef here - keep it so progress doesn't reset
        // Only clear the interval
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
      };
    } else if (!isLoading || (questions && questions.length > 0)) {
      // Stop animation if loading is complete or questions are available
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      // Reset start time only when loading completes
      progressStartTimeRef.current = null;
      
      // Clear persisted progress when loading completes
      try {
        sessionStorage.removeItem(progressStorageKey);
        sessionStorage.removeItem(`${progressStorageKey}_startTime`);
      } catch (error) {
        // Ignore sessionStorage errors
      }
      
      // If questions are available, use actual progress
      if (questions && questions.length > 0) {
        const realProgress = Math.min(Math.round((questions.length / totalQuestions) * 100), 100);
        setProgress(realProgress);
      } else {
        setProgress(0);
      }
    }
  }, [questions?.length, totalQuestions, isLoading, progressStorageKey]); // Include progressStorageKey in dependencies

  // Use ref to prevent excessive calls
  const hasRegeneratedRef = useRef(false);
  // Track if regeneration was initiated to prevent duplicate calls
  const regenerationInProgressRef = useRef(false);
  // Persist regeneration state across tab switches
  const regenerationStorageKey = useMemo(() => `quiz_regenerated_${quizType || 'regular'}`, [quizType]);
  
  // Load persisted regeneration state on mount
  useEffect(() => {
    try {
      const hasRegenerated = sessionStorage.getItem(regenerationStorageKey);
      if (hasRegenerated === 'true') {
        hasRegeneratedRef.current = true;
      }
    } catch (error) {
      // Ignore sessionStorage errors
    }
  }, [regenerationStorageKey]);
  
  useEffect(() => {
    // For reinforcement quizzes, don't auto-generate - only generate when user explicitly clicks a button
    if (quizType === 'reinforcement' && !questions) {
      return; // Don't auto-generate reinforcement quiz
    }
    
    // Only regenerate if:
    // 1. Quiz is finished (user completed it) - allow regeneration for new quiz
    // 2. No questions exist AND user hasn't started - initial load (only for regular quiz)
    // Don't regenerate if quiz is in progress (user has questions and hasn't finished)
    const userHasStarted = currentQuestionIndex > 0 || selectedAnswer !== null;
    const quizIsFinished = isFinished;
    
    // CRITICAL: If questions exist and quiz is not finished, NEVER regenerate
    // This preserves the quiz state when navigating away and back
    if (questions && questions.length > 0 && !quizIsFinished) {
      return; // Don't regenerate - preserve existing quiz
    }
    
    // Check sessionStorage to prevent regeneration on tab switch
    let hasRegeneratedStored = false;
    try {
      hasRegeneratedStored = sessionStorage.getItem(regenerationStorageKey) === 'true';
    } catch (error) {
      // Ignore sessionStorage errors
    }
    
    // Only regenerate if:
    // - Quiz is finished (completed), OR
    // - No questions AND user hasn't started AND hasn't regenerated yet (only for regular quiz)
    const shouldRegenerate = (quizIsFinished || (!questions && !userHasStarted)) && 
                             !isLoading && 
                             !hasRegeneratedRef.current && 
                             !hasRegeneratedStored &&
                             !isTargetedQuizGenerating &&
                             !regenerationInProgressRef.current;
    
    if (shouldRegenerate) {
        hasRegeneratedRef.current = true;
        regenerationInProgressRef.current = true;
        
        // Persist regeneration state
        try {
          sessionStorage.setItem(regenerationStorageKey, 'true');
        } catch (error) {
          // Ignore sessionStorage errors
        }
        
        regenerateQuiz().finally(() => {
          regenerationInProgressRef.current = false;
          // Keep regeneration state persisted - don't reset immediately
          // Only reset when quiz finishes (for next regeneration)
        });
    }
  }, [questions, isLoading, isTargetedQuizGenerating, regenerateQuiz, currentQuestionIndex, selectedAnswer, regenerationStorageKey, isFinished, quizType]);
  
  // Reset regeneration flag only when quiz finishes (allows regeneration for next quiz)
  useEffect(() => {
    if (isFinished) {
      // Quiz is finished - reset flags so user can start a new quiz
      hasRegeneratedRef.current = false;
      regenerationInProgressRef.current = false;
      // Clear persisted regeneration state so new quiz can be generated
      try {
        sessionStorage.removeItem(regenerationStorageKey);
      } catch (error) {
        // Ignore sessionStorage errors
      }
    }
  }, [isFinished, regenerationStorageKey]);

  useEffect(() => {
    if (questions) {
      setUserAnswers(prev => {
        // Only extend the array if questions length increased, don't reset existing answers
        if (prev.length < questions.length) {
          const newAnswers = [...prev];
          // Add null entries for new questions only
          while (newAnswers.length < questions.length) {
            newAnswers.push(null);
          }
          return newAnswers;
        }
        // If questions length decreased or stayed same, keep existing answers
        return prev;
      });
    }
  }, [questions]);

  // Update stable ref only when index changes, not when questions array reference changes
  // MUST be before any early returns to follow Rules of Hooks
  useEffect(() => {
    if (questions && questions.length > 0 && currentQuestionIndex >= 0 && currentQuestionIndex < questions.length) {
      // Force update when quizType changes (switching between quiz types)
      // Check if the current question is different from what's stored
      const currentQuestionFromArray = questions[currentQuestionIndex];
      const isQuestionDifferent = !stableCurrentQuestionRef.current || 
                                   stableCurrentQuestionIndexRef.current !== currentQuestionIndex ||
                                   (stableCurrentQuestionRef.current && 
                                    currentQuestionFromArray.question !== stableCurrentQuestionRef.current.question);
      
      if (isQuestionDifferent) {
        // Update to new question
        stableCurrentQuestionRef.current = currentQuestionFromArray;
        stableCurrentQuestionIndexRef.current = currentQuestionIndex;
        // Reset book reference refs when question changes
        stableBookReferenceRef.current = null;
        lastBookReferenceRef.current = null;
        lastQuestionTextRef.current = ''; // Reset to trigger book reference fetch
      } else {
        // Index and question text are the same, but questions array might have been updated (e.g., book references added)
        // Update the stable ref with the latest question data
        if (currentQuestionFromArray) {
          stableCurrentQuestionRef.current = currentQuestionFromArray;
        }
      }
    } else {
      // No valid question - clear refs
      stableCurrentQuestionRef.current = null;
      stableCurrentQuestionIndexRef.current = -1;
    }
  }, [currentQuestionIndex, questions, quizType]); // Include quizType to force update when switching quiz types


  const handleAnswerSelect = async (index: number) => {
    if (showAnswer || !questions) return;
    const currentQuestion = questions[currentQuestionIndex];
    const isCorrect = index === currentQuestion.correctAnswerIndex;
    
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestionIndex] = index;
    setUserAnswers(newAnswers);
    
    let newScore = score;
    if (isCorrect) {
      newScore = score + 1;
      // Update streak (positive for correct)
      recentStreakRef.current = recentStreakRef.current > 0 ? recentStreakRef.current + 1 : 1;
    } else {
      // Update streak (negative for incorrect)
      recentStreakRef.current = recentStreakRef.current < 0 ? recentStreakRef.current - 1 : -1;
    }

    setQuizProgress(prev => ({
        ...prev,
        selectedAnswer: index,
        showAnswer: true,
        score: newScore,
    }));

    onQuestionAnswered({
        question: currentQuestion.question,
        isCorrect: isCorrect,
        explanation: currentQuestion.explanation,
    });
    
    // Generate teacher reaction message only on milestones (not every question)
    const totalAnswered = currentQuestionIndex + 1;
    const percentage = totalAnswered > 0 ? Math.round((newScore / totalAnswered) * 100) : 0;
    
    // Show teacher reaction only on milestones:
    // 1. Every 5 questions
    // 2. Significant streaks (3+ correct or 3+ incorrect)
    // 3. Percentage milestones (25%, 50%, 75%, 100%)
    // 4. First question
    const shouldShowReaction = 
      totalAnswered === 1 || // First question
      totalAnswered % 5 === 0 || // Every 5 questions
      Math.abs(recentStreakRef.current) >= 3 || // Significant streak
      (percentage === 25 || percentage === 50 || percentage === 75 || percentage === 100) || // Percentage milestones
      (totalAnswered === 10 || totalAnswered === 15 || totalAnswered === 20 || totalAnswered === 25); // Question count milestones
    
    if (shouldShowReaction) {
      const selectedAnswerText = currentQuestion.options[index];
      const correctAnswerText = currentQuestion.options[currentQuestion.correctAnswerIndex];
      
      generateTeacherReaction(
        isCorrect,
        newScore,
        totalAnswered,
        recentStreakRef.current,
        userName,
        currentQuestion.question,
        selectedAnswerText,
        correctAnswerText,
        currentQuestion.explanation
      ).then((reaction) => {
        setTeacherMessage(reaction);
        setTeacherMessageQuestion(currentQuestion); // Store question for chat
        setShowTeacherMessage(true);
        
        // Add teacher reaction to chat history during the quiz
        if (chatSession && setChatSession) {
          const teacherMessage: ChatMessage = { role: 'model', text: reaction };
          setChatSession(prev => prev ? { ...prev, history: [...prev.history, teacherMessage] } : null);
        }
        
        // Auto-hide after 6 seconds (longer for more detailed messages)
        setTimeout(() => {
          setShowTeacherMessage(false);
        }, 6000);
      }).catch((error) => {
        console.error('Error generating teacher reaction:', error);
        // Show a fallback message if API fails
        const fallbackMessage = isCorrect 
          ? `${userName || 'אתה'}, תשובה נכונה! מעולה! המשך כך.`
          : `${userName || 'אתה'}, לא נורא. כל שגיאה היא הזדמנות ללמוד.`;
        setTeacherMessage(fallbackMessage);
        setTeacherMessageQuestion(currentQuestion); // Store question for chat
        setShowTeacherMessage(true);
        
        // Add fallback teacher reaction to chat history during the quiz
        if (chatSession && setChatSession) {
          const teacherMessage: ChatMessage = { role: 'model', text: fallbackMessage };
          setChatSession(prev => prev ? { ...prev, history: [...prev.history, teacherMessage] } : null);
        }
        
        // Auto-hide after 6 seconds
        setTimeout(() => {
          setShowTeacherMessage(false);
        }, 6000);
      });
    }
  };

  const handleNextQuestion = () => {
    if (!questions) return;
    
    // Hide teacher message when moving to next question
    setShowTeacherMessage(false);
    
    // If we're on the last loaded question, check if we can continue
    if (currentQuestionIndex >= questions.length - 1) {
      // Only finish if we have all 25 questions loaded
      if (isFullyLoaded || questions.length >= totalQuestions) {
        setQuizProgress(prev => ({ ...prev, isFinished: true }));
      }
    } else {
      // Move to next question
      setShowBookReference(false); // Reset book reference visibility
      setDisplayBookReference(null); // Reset converted reference
      setQuizProgress(prev => ({
          ...prev,
          currentQuestionIndex: prev.currentQuestionIndex + 1,
          selectedAnswer: null,
          showAnswer: false,
      }));
    }
  };
  
  const handleFurtherExplanation = () => {
    if (!questions) return;
    const currentQuestion = questions[currentQuestionIndex];
    const context = `שאלה: ${currentQuestion.question}\n\nאפשרויות:\n${currentQuestion.options.map((o, i) => `${hebrewLetters[i]}. ${o}`).join('\n')}\n\nתשובה נכונה: ${currentQuestion.options[currentQuestion.correctAnswerIndex]}\n\nהסבר קצר: ${currentQuestion.explanation}`;
    openSideChat(context);
  };
  
  const handleCreateTargetedFlashcards = async () => {
    if (!analysis?.weaknesses) return;
    if (!hasValidPayment) {
      setAppError('לשימוש בפלטפורמה יש להשלים תשלום. אנא השלם את התשלום כדי להמשיך.');
      return;
    }
    setIsGeneratingTargeted('flashcards');
    await createTargetedFlashcards(analysis.weaknesses);
    setIsGeneratingTargeted(null);
  };
  
  const handleCreateTargetedQuiz = async () => {
    if (!analysis?.weaknesses) return;
    if (!hasValidPayment) {
      setAppError('לשימוש בפלטפורמה יש להשלים תשלום. אנא השלם את התשלום כדי להמשיך.');
      return;
    }
    setIsGeneratingTargeted('quiz');
    await createTargetedQuiz(analysis.weaknesses);
    setIsGeneratingTargeted(null);
  };

  const handlePlayAudio = async (text: string, type: 'question' | 'explanation') => {
    if (isAudioLoading) return;
    
    setIsAudioLoading(type);
    setAppError(null);

    try {
        const audioResult = await generateSpeech(text);
        
        // Check if browser TTS was used (special marker)
        if (audioResult === 'browser-tts-success') {
            // Browser TTS already handled the speech
            setIsAudioLoading(null);
            return;
        }
        
        // OpenAI TTS - decode and play base64 MP3 audio
        // Decode base64 to binary
        const binaryString = atob(audioResult);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Create blob from MP3 data
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        
        // Create audio element to play MP3
        const audio = new Audio(url);
        audio.onended = () => {
            URL.revokeObjectURL(url);
            setIsAudioLoading(null);
        };
        audio.onerror = (error) => {
            console.error('Audio playback error:', error);
            URL.revokeObjectURL(url);
            setAppError("נכשל בניגון השמע.");
            setIsAudioLoading(null);
        };
        
        // Play audio
        await audio.play();
    } catch (error) {
        console.error("Error playing audio:", error);
        if (error instanceof Error) setAppError(error.message);
        else setAppError("נכשל בניגון השמע.");
        setIsAudioLoading(null);
    }
  };

  const getButtonClass = (index: number) => {
    if (!showAnswer || !questions) {
      return 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700';
    }
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700';

    const isCorrect = index === currentQuestion.correctAnswerIndex;
    if (isCorrect) {
      return 'bg-green-50 border-green-400 text-green-800 font-semibold animate-scale-in';
    }
    if (selectedAnswer === index && !isCorrect) {
      return 'bg-red-50 border-red-400 text-red-800 font-semibold animate-scale-in';
    }
    return 'bg-slate-50 border-slate-200 text-slate-500';
  };

  // Show loading screen only if we have no questions at all AND we're actively loading
  // For regular quiz, don't show loading screen - questions load quickly from DB
  // For reinforcement quiz, show loading screen since it takes ~1:30 to generate
  if ((!questions || questions.length === 0) && quizType === 'reinforcement' && isLoading) {
      const displayProgress = Math.min(Math.round(progress), 100);
      // Ensure minimum width so the bar is visible even at 0%
      const barWidth = Math.max(displayProgress, isLoading ? 1 : 0);
      
      // Rotate messages based on progress to keep it interesting
      // Change message every ~6-7% progress
      const messageIndex = Math.min(
        Math.floor((displayProgress / 7) % loadingMessages.length),
        loadingMessages.length - 1
      );
      const currentMessage = loadingMessages[messageIndex];
      
      // Suggestions for what user can do while waiting
      const suggestions = [
        "☕ לך להכין קפה - זה ייקח קצת זמן",
        "📚 תוכל לתרגל בוחן אימון רגיל בינתיים",
        "🎴 או לעבור על כרטיסיות הזיכרון",
        "🤔 או פשוט לחשוב על משמעות הקיום האנושי...",
        "💭 או לחלום על הבית הבא שתמכור",
        "🧘 או לעשות מדיטציה קצרה",
        "📖 או לקרוא משהו מעניין",
        "🎵 או להאזין למוזיקה מרגיעה"
      ];
      
      return (
          <div className="flex-grow flex items-center justify-center p-4 md:p-8">
              <div className="text-center max-w-md w-full">
                  <h2 className="text-2xl font-semibold text-slate-800 mb-2">מכין לך בוחן חכם...</h2>
                  <p className="text-slate-600 mt-4 mb-2 min-h-[3rem] flex items-center justify-center text-base leading-relaxed">
                    {currentMessage}
                  </p>
                  <p className="text-slate-500 text-sm mb-4">
                    ⏱️ תהליך זה אורך כ-1:30 דקות. אנא המתן...
                  </p>
                  <div className="w-full bg-slate-200 rounded-full h-3 shadow-inner overflow-hidden">
                      <div 
                          className="h-full rounded-full transition-all duration-300 ease-linear bg-gradient-to-r from-sky-500 to-blue-600" 
                          style={{ width: `${barWidth}%`, minWidth: barWidth > 0 ? '2px' : '0' }}
                      ></div>
                  </div>
                  <p className="text-center text-sm font-semibold text-slate-600 mt-3">{displayProgress}%</p>
                  
                  {/* Suggestions section */}
                  <div className="mt-8 pt-6 border-t border-slate-200">
                    <p className="text-sm font-medium text-slate-700 mb-3">💡 בינתיים, תוכל:</p>
                    <div className="space-y-2 mb-4">
                      {suggestions.slice(0, 4).map((suggestion, idx) => (
                        <p key={idx} className="text-sm text-slate-600 leading-relaxed">
                          {suggestion}
                        </p>
                      ))}
                    </div>
                    <div className="mt-4 p-3 bg-sky-50 border border-sky-200 rounded-xl">
                      <p className="text-sm text-sky-800 font-medium leading-relaxed">
                        🔔 <strong>לא צריך להמתין כאן!</strong> נשלח לך הודעה כשהבוחן יהיה מוכן. תוכל לחזור בכל עת.
                      </p>
                    </div>
                  </div>
              </div>
          </div>
      );
  }

  if (!isFullyLoaded && !isLoading) {
    // This case will now only be reached if generation finishes but fails to produce enough questions.
    // The main quiz UI will be shown while questions are still loading.
  }


  if (isFinished) {
    const percentage = questions.length > 0 ? (score / questions.length) * 100 : 0;
    const passed = percentage >= 60;
    return (
        <div className="flex-grow p-4 md:p-8 overflow-y-auto bg-slate-50">
            <div className="max-w-4xl mx-auto">
                <h2 className="text-3xl font-bold text-slate-800 text-center">הבוחן הושלם!</h2>
                
                <div className="my-8 flex flex-col items-center justify-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-bounce-in">
                    <ProgressCircle percentage={percentage} />
                    <p className="text-2xl font-bold mt-4 text-slate-800 animate-fade-in" style={{ animationDelay: '0.3s' }}>הציון שלך: {score} מתוך {questions.length}</p>
                    <p className={`text-2xl font-bold mt-2 animate-fade-in ${passed ? 'text-green-600' : 'text-red-600'}`} style={{ animationDelay: '0.4s' }}>
                        {passed ? 'עברת את הבוחן!' : 'לא עברת את הבוחן'}
                    </p>
                </div>

                <div className="my-8 pt-6 border-t border-slate-300 flex flex-col sm:flex-row justify-center gap-4">
                    <button onClick={regenerateQuiz} className="px-8 py-3 bg-sky-600 text-white font-bold rounded-2xl hover:bg-sky-700 transition-colors text-lg">
                        עשה בוחן נוסף
                    </button>
                    <button onClick={() => setView('home')} className="px-6 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-2xl transition-colors">
                        חזור לדף הבית
                    </button>
                </div>

                <div className="my-8">
                    <h3 className="text-2xl font-bold mb-4 flex items-center text-slate-900">
                        <SparklesIcon className="h-6 w-6 text-slate-700 ml-2" /> ניתוח AI
                    </h3>
                    {isAnalyzing ? (
                        <div className="bg-white border border-slate-200 p-6 rounded-2xl text-center">
                            <div className="w-8 h-8 border-4 border-dashed rounded-full animate-spin border-sky-500 mx-auto"></div>
                            <p className="mt-4 text-slate-500">מנתח את התקדמותך...</p>
                        </div>
                    ) : analysis ? (
                        <>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                                <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                                    <h4 className="text-lg font-semibold text-green-600 mb-3">נושאים חזקים</h4>
                                    <ul className="space-y-2 list-disc list-inside text-slate-600">
                                        {analysis.strengths.map((item, index) => <li key={index}>{item}</li>)}
                                    </ul>
                                </div>
                                <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                                    <h4 className="text-lg font-semibold text-amber-600 mb-3">נושאים לשיפור</h4>
                                    <ul className="space-y-2 list-disc list-inside text-slate-600">
                                        {analysis.weaknesses.map((item, index) => <li key={index}>{item}</li>)}
                                    </ul>
                                </div>
                            </div>
                            {analysis.weaknesses && analysis.weaknesses.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col sm:flex-row gap-3">
                                    <button 
                                        onClick={handleCreateTargetedFlashcards} 
                                        disabled={isGeneratingTargeted !== null || !hasValidPayment} 
                                        className="flex-1 flex items-center justify-center px-6 py-3 bg-gradient-to-br from-amber-500 to-amber-600 text-white text-sm font-semibold rounded-2xl hover:from-amber-600 hover:to-amber-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md"
                                        title={!hasValidPayment ? 'תשלום נדרש' : ''}
                                    >
                                        {isGeneratingTargeted === 'flashcards' ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><FlashcardsIcon className="h-5 w-5 ml-2 text-white" /> צור כרטיסיות ממוקדות</>}
                                    </button>
                                    <button 
                                        onClick={handleCreateTargetedQuiz} 
                                        disabled={isGeneratingTargeted !== null || !hasValidPayment} 
                                        className="flex-1 flex items-center justify-center px-6 py-3 bg-gradient-to-br from-purple-500 to-purple-600 text-white text-sm font-semibold rounded-2xl hover:from-purple-600 hover:to-purple-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md"
                                        title={!hasValidPayment ? 'תשלום נדרש' : ''}
                                    >
                                        {isGeneratingTargeted === 'quiz' ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><QuizIcon className="h-5 w-5 ml-2 text-white" /> צור בוחן חיזוק</>}
                                    </button>
                                </div>
                            )}
                            <div className="mt-6 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                                <h4 className="text-lg font-semibold text-slate-700 mb-3">המלצות להמשך</h4>
                                <p className="text-slate-600 whitespace-pre-wrap">{analysis.recommendations}</p>
                            </div>
                        </>
                    ) : null}
                </div>

                <div className="my-8">
                    <h3 className="text-2xl font-bold mb-4 text-slate-900">סקירת שאלות</h3>
                    <div className="space-y-4">
                        {questions.map((q, index) => {
                            const userAnswerIndex = userAnswers[index] ?? null;
                            const isQuestionCorrect = userAnswerIndex !== null && userAnswerIndex === q.correctAnswerIndex;
                            const hasUserAnswer = userAnswerIndex !== null;
                            const isQuestionWrong = hasUserAnswer && !isQuestionCorrect;
                            
                            return (
                                <div key={index} className={`bg-white p-5 rounded-2xl border-2 ${isQuestionCorrect ? 'border-green-300' : hasUserAnswer ? 'border-red-400' : 'border-slate-200'}`}>
                                    <div className="flex items-center justify-between mb-4">
                                        <p className="font-semibold text-slate-800">{index + 1}. {q.question}</p>
                                        {hasUserAnswer && (
                                            <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${isQuestionCorrect ? 'bg-green-100 text-green-800' : 'bg-red-200 text-red-900 font-bold'}`}>
                                                {isQuestionCorrect ? (
                                                    <>
                                                        <CheckIcon className="h-4 w-4" />
                                                        <span>נכון</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <CloseIcon className="h-4 w-4" />
                                                        <span>שגוי</span>
                                                    </>
                                                )}
                                            </span>
                                        )}
                                    </div>
                                    <div className="space-y-2 text-sm">
                                        {q.options.map((option, optIndex) => {
                                            const isUserAnswer = userAnswerIndex === optIndex;
                                            const isCorrectAnswer = q.correctAnswerIndex === optIndex;
                                            const isSelectedAndWrong = isUserAnswer && !isCorrectAnswer;
                                            const isSelectedAndCorrect = isUserAnswer && isCorrectAnswer;
                                            
                                            let styles = "border-slate-200 bg-slate-50 text-slate-700";
                                            if (isCorrectAnswer) {
                                                styles = "border-green-400 bg-green-50 text-green-900 font-semibold";
                                            }
                                            if (isSelectedAndWrong) {
                                                // Make wrong answers very prominent with darker red
                                                styles = "border-red-500 bg-red-100 text-red-900 font-bold";
                                            }
                                            if (isSelectedAndCorrect) {
                                                styles = "border-green-500 bg-green-100 text-green-900 font-bold";
                                            }

                                            return (
                                                <div key={optIndex} className={`p-3 border-2 rounded-xl flex justify-between items-center gap-4 ${styles}`}>
                                                    <span className="flex-grow">
                                                        {hebrewLetters[optIndex]}. {option}
                                                    </span>
                                                    
                                                    <div className="flex items-center text-xs font-bold flex-shrink-0">
                                                        {isSelectedAndCorrect && (
                                                            <span className="flex items-center gap-1.5 bg-green-200 text-green-900 px-2 py-1 rounded-full">
                                                                <CheckIcon className="h-3.5 w-3.5" />
                                                                <span>התשובה שלך</span>
                                                            </span>
                                                        )}
                                                        {isSelectedAndWrong && (
                                                            <span className="flex items-center gap-1.5 bg-red-200 text-red-900 px-2 py-1 rounded-full">
                                                                <CloseIcon className="h-3 w-3" />
                                                                <span>התשובה שלך (שגוי)</span>
                                                            </span>
                                                        )}
                                                        {isCorrectAnswer && !isUserAnswer && (
                                                            <span className="flex items-center gap-1.5 bg-green-200 text-green-900 px-2 py-1 rounded-full">
                                                                <CheckIcon className="h-3.5 w-3.5" />
                                                                <span>תשובה נכונה</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-slate-200">
                                        <p className="text-sm text-slate-600"><strong className="font-semibold text-slate-800">הסבר:</strong> {q.explanation}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

            </div>
        </div>
    );
  }
  
  // Get current question - use stable ref if available, otherwise get from array
  const currentQuestion = questions && questions.length > 0 && currentQuestionIndex >= 0 && currentQuestionIndex < questions.length
    ? questions[currentQuestionIndex]
    : null;
  
  // Use stable ref for rendering to prevent jumps when array reference changes
  const displayQuestion = stableCurrentQuestionRef.current || currentQuestion;
  
  if (!displayQuestion) {
     if (!isFullyLoaded && !isLoading) {
        // For reinforcement quiz, show a message prompting user to generate it
        if (quizType === 'reinforcement' && !questions) {
          return (
            <div className="flex-grow flex items-center justify-center p-4 md:p-8 text-center">
              <div>
                <h2 className="text-2xl font-semibold text-slate-800 mb-4">בוחן חיזוק</h2>
                <p className="text-slate-600 mt-2 mb-6">לחץ על הכפתור כדי ליצור בוחן חיזוק מותאם אישית</p>
                <button onClick={regenerateQuiz} className="px-8 py-3 bg-sky-600 text-white font-bold rounded-2xl hover:bg-sky-700 transition-colors text-lg">
                  צור בוחן חיזוק
                </button>
              </div>
            </div>
          );
        }
        // For regular quiz, show error message
        return (
            <div className="flex-grow flex items-center justify-center p-4 md:p-8 text-center">
                <div>
                    <h2 className="text-2xl font-semibold text-red-600">יצירת הבוחן נכשלה</h2>
                    <p className="text-slate-500 mt-2">לא ניתן היה ליצור בוחן מלא. אנא נסה שוב.</p>
                    <button onClick={regenerateQuiz} className="mt-6 px-6 py-2 bg-sky-600 text-white font-semibold rounded-2xl hover:bg-sky-700 transition-colors">
                        נסה שוב
                    </button>
                </div>
            </div>
        );
    }
    return null; // Should not happen if questions array is not empty
  }
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  // Show "waiting for questions" if we're on the last loaded question and don't have all 25 questions yet
  // Only allow proceeding if we have all 25 questions loaded
  const canProceedFromLastQuestion = isFullyLoaded || questions.length >= totalQuestions;
  const isWaitingForQuestions = showAnswer && isLastQuestion && !canProceedFromLastQuestion && questions.length < totalQuestions;
  const progressInQuiz = questions ? ((currentQuestionIndex + 1) / totalQuestions) * 100 : 0;


  // Show payment required overlay if payment is not valid
  if (!hasValidPayment) {
    return (
      <div className="flex-grow p-4 md:p-8 overflow-y-auto relative">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md text-center mx-4">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">תשלום נדרש</h3>
            <p className="text-slate-600 mb-6">
              לשימוש בפלטפורמה יש להשלים תשלום. אנא השלם את התשלום כדי להמשיך.
            </p>
            <button
              onClick={() => setView('home')}
              className="px-6 py-3 bg-sky-600 text-white font-semibold rounded-xl hover:bg-sky-700 transition-colors"
            >
              חזור לדף הבית
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow p-4 md:p-8 overflow-y-auto relative">
      {/* Teacher message popup - positioned near ChatWidget (bottom left) */}
      {showTeacherMessage && teacherMessage && (
        <div className="fixed bottom-24 left-4 z-[9999] max-w-sm w-[calc(100vw-2rem)] animate-fade-in">
          <div 
            onClick={() => {
              // Open chat with question context when toast is clicked
              if (teacherMessageQuestion) {
                const context = `שאלה: ${teacherMessageQuestion.question}\n\nאפשרויות:\n${teacherMessageQuestion.options.map((o, i) => `${hebrewLetters[i]}. ${o}`).join('\n')}\n\nתשובה נכונה: ${teacherMessageQuestion.options[teacherMessageQuestion.correctAnswerIndex]}\n\nהסבר קצר: ${teacherMessageQuestion.explanation}`;
                openSideChat(context);
                setShowTeacherMessage(false); // Close toast when opening chat
              }
            }}
            className="bg-slate-700 border-2 border-slate-600 text-white rounded-2xl shadow-lg p-4 flex items-start gap-3 cursor-pointer hover:bg-slate-600 transition-colors"
          >
            <div className="flex-shrink-0 mt-0.5">
              <SparklesIcon className="h-5 w-5 text-slate-700" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white leading-relaxed">{teacherMessage}</p>
              <p className="text-xs text-slate-300 mt-2">לחץ כדי לפתוח שיחה על הנושא</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation(); // Prevent triggering the parent onClick
                setShowTeacherMessage(false);
              }}
              className="flex-shrink-0 p-1 rounded-full hover:bg-slate-500 transition-colors"
              aria-label="סגור"
            >
              <CloseIcon className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>
      )}
      
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-4">
            <h2 className="text-xl font-semibold text-slate-700">{quizType === 'reinforcement' ? 'בוחן חיזוק' : 'בוחן אימון'}</h2>
            <div className="flex items-center gap-6">
                <div className="text-sm font-medium text-slate-600 flex items-center gap-2">
                    שאלה {currentQuestionIndex + 1} מתוך {totalQuestions}
                    {isLoading && !isFullyLoaded && (
                      <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                    )}
                </div>
            </div>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-2.5 mb-4 overflow-hidden rounded-full">
            <div
                className="bg-sky-500 h-2.5 rounded-full transition-all duration-500 ease-out relative"
                style={{ width: `${progressInQuiz}%` }}
            >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
            </div>
        </div>
        <div key={currentQuestionIndex} className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm animate-slide-in-right">
          <div className="flex items-center justify-between gap-4 mb-6">
            <p className="text-lg font-semibold text-slate-900 flex-1">{displayQuestion.question}</p>
            <button
                onClick={() => handlePlayAudio(displayQuestion.question, 'question')}
                disabled={!!isAudioLoading}
                className="p-2 rounded-full bg-slate-700 border-2 border-slate-600 text-white hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-wait shrink-0"
                aria-label="הקרא שאלה"
            >
                {isAudioLoading === 'question' ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                    <SpeakerIcon className="h-5 w-5" />
                )}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {displayQuestion.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleAnswerSelect(index)}
                disabled={showAnswer}
                className={`p-4 rounded-2xl border transition-all duration-300 flex items-baseline gap-3 text-right ${getButtonClass(index)} ${!showAnswer ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]' : 'cursor-default'} animate-scale-in`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <span className="font-bold">{hebrewLetters[index]}.</span>
                <span className="flex-1">{option}</span>
              </button>
            ))}
          </div>
        </div>
        {showAnswer && (
          <div className="mt-6 p-4 rounded-2xl bg-slate-50 border border-slate-200 animate-slide-up">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div className='flex-grow'>
                    <div className="flex items-center justify-between gap-4 mb-2">
                        <h3 className="font-bold text-lg text-slate-800">הסבר קצר</h3>
                        <button
                            onClick={() => handlePlayAudio(displayQuestion.explanation, 'explanation')}
                            disabled={!!isAudioLoading}
                            className="p-2 rounded-full bg-slate-700 border-2 border-slate-600 text-white hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-wait shrink-0"
                            aria-label="הקרא הסבר"
                        >
                            {isAudioLoading === 'explanation' ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <SpeakerIcon className="h-5 w-5" />
                            )}
                        </button>
                    </div>
                    <p className="text-slate-600">{displayQuestion.explanation}</p>
                </div>
                <button 
                    onClick={handleFurtherExplanation}
                    className="flex items-center justify-center w-full sm:w-auto px-4 py-2 bg-sky-100 text-sky-700 text-sm font-semibold rounded-2xl hover:bg-sky-200 transition-colors shrink-0 self-end sm:self-center">
                    <SparklesIcon className="h-4 w-4 ml-1 text-slate-700" />
                    שאל את המורה
                </button>
            </div>
            <div className="mt-4 flex justify-end">
             {isWaitingForQuestions ? (
                <div className="flex items-center gap-3 p-2 font-semibold text-slate-600">
                  <div className="w-5 h-5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent"></div>
                  <span>יוצר שאלות נוספות...</span>
                </div>
              ) : (
                <button
                  onClick={handleNextQuestion}
                  className="w-full sm:w-auto px-6 py-2 bg-sky-600 text-white font-semibold rounded-2xl hover:bg-sky-700 transition-colors"
                >
                  {isLastQuestion && isFullyLoaded ? 'סיים בוחן' : 'השאלה הבאה'}
                </button>
              )}
            </div>
          </div>
        )}
        
        {/* Book Reference Card - Always Visible */}
        <div className="mt-6">
          <div
            onClick={() => !isLoadingBookReference && displayBookReference && setShowBookReference(!showBookReference)}
            className={`bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl shadow-lg transition-all duration-300 ease-in-out overflow-hidden ${
              isLoadingBookReference 
                ? 'cursor-wait opacity-75' 
                : displayBookReference 
                  ? 'cursor-pointer hover:shadow-xl hover:scale-[1.01] hover:border-blue-300' 
                  : 'cursor-default opacity-60'
            } ${
              showBookReference && displayBookReference
                ? 'shadow-xl scale-[1.02] border-blue-400' 
                : ''
            }`}
          >
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center transition-transform duration-300 ${
                  showBookReference && displayBookReference ? 'rotate-180' : ''
                }`}>
                  {isLoadingBookReference ? (
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span className="text-2xl">📖</span>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-blue-900">הפניה לספר</h3>
                  {isLoadingBookReference ? (
                    <p className="text-sm text-blue-600">טוען הפניה...</p>
                  ) : displayBookReference ? (
                    <p className="text-sm text-blue-600">לחץ כדי להציג את ההפניה</p>
                  ) : (
                    <p className="text-sm text-blue-500">אין הפניה זמינה</p>
                  )}
                </div>
              </div>
              {displayBookReference && !isLoadingBookReference && (
                <div className={`transition-transform duration-300 ${showBookReference ? 'rotate-180' : ''}`}>
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              )}
            </div>
            
            {displayBookReference && (
              <div 
                className={`transition-all duration-500 ease-in-out ${
                  showBookReference 
                    ? 'max-h-96 opacity-100 translate-y-0' 
                    : 'max-h-0 opacity-0 -translate-y-4'
                }`}
              >
                <div className="px-4 pb-4 border-t border-blue-200 pt-4">
                  <div className="bg-white rounded-xl p-4 shadow-inner border border-blue-100">
                    <p className="text-base text-blue-900 leading-relaxed font-medium">
                      {displayBookReference.replace(/בקובץ\.?/g, '').trim()}
                    </p>
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <p className="text-xs text-blue-600 italic leading-relaxed">
                        💡 אני בדרך כלל צודק, אבל לפעמים גם אני מתבלבל. אם זה קורה, פשוט תשאלו את המורה.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuizView;