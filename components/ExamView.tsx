import React, { useState, useEffect, useCallback, useRef } from 'react';
import { QuizQuestion, ViewType, AnalysisResult, QuizResult } from '../types';
import { ClockIcon, ExamIcon, CheckIcon, CloseIcon, SparklesIcon, FlashcardsIcon, QuizIcon, SpeakerIcon } from './icons';
import { generateSpeech } from '../services/aiService';

interface ExamViewProps {
  userName?: string;
  questions: QuizQuestion[] | null;
  isLoading: boolean;
  regenerateExam: () => void;
  setIsExamInProgress: (inProgress: boolean) => void;
  setView: (view: ViewType) => void;
  totalQuestions: number;
  documentContent: string;
  setAppError: (error: string | null) => void;
  onExamFinished: (results: QuizResult[]) => void;
  createTargetedFlashcards: (weaknesses: string[]) => Promise<void>;
  createTargetedQuiz: (weaknesses: string[]) => Promise<void>;
  analysis: AnalysisResult | null;
  isAnalyzing: boolean;
}

const getTodayKey = () => {
    const d = new Date();
    return `examAttempts_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const ExamView: React.FC<ExamViewProps> = ({
  userName, questions, isLoading, regenerateExam, setIsExamInProgress, setView, totalQuestions, documentContent, setAppError, onExamFinished, createTargetedFlashcards, createTargetedQuiz, analysis, isAnalyzing }) => {
  const [examState, setExamState] = useState<'intro' | 'running' | 'finished'>('intro');
  const [attemptsLeft, setAttemptsLeft] = useState(2);
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<(number | null)[]>([]);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120 * 60);
  const userClickedStartRef = useRef(false); // Track if user clicked "התחל את המבחן"
  
  // Check if exam was already finished when component mounts
  // If questions match and we have exam history, restore finished state
  useEffect(() => {
    if (questions && questions.length >= totalQuestions && examState === 'intro') {
      // Check if there's a recent exam session that matches current questions
      // This happens when user navigates back after exam finished
      // We'll check localStorage for exam completion state
      try {
        const examFinishedKey = 'exam_finished_state';
        const savedState = localStorage.getItem(examFinishedKey);
        if (savedState) {
          const parsed = JSON.parse(savedState);
          // Check if saved state matches current questions (same count)
          if (parsed.questionsCount === questions.length && parsed.finished) {
            setExamState('finished');
            setScore(parsed.score || 0);
            setUserAnswers(parsed.userAnswers || []);
            setTimeLeft(parsed.timeLeft || 0);
            setIsExamInProgress(false);
            // Don't restore to running state - keep it finished
            return;
          }
        }
      } catch (error) {
        console.warn('Could not restore exam state:', error);
      }
    }
  }, [questions, examState, totalQuestions, setIsExamInProgress]);
  
  const [isGeneratingTargeted, setIsGeneratingTargeted] = useState<'flashcards' | 'quiz' | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isAudioLoading, setIsAudioLoading] = useState<'question' | 'explanation' | null>(null);

  const loadingMessages = [
    'מנתח את מבנה הבחינות הרשמיות...',
    'בונה שאלות במגוון רמות קושי...',
    'מוודא כיסוי רחב של כל נושאי הלימוד...',
    'מכין את סביבת המבחן המדמה תנאי אמת...'
  ];
  const hebrewLetters = ['א', 'ב', 'ג', 'ד'];
  const isFullyLoaded = questions && questions.length >= totalQuestions;

  useEffect(() => {
    const realProgress = questions ? Math.round((questions.length / totalQuestions) * 100) : 0;
    setProgress(realProgress);
  }, [questions, totalQuestions]);

  useEffect(() => {
    let interval: number | undefined;
    if ((isLoading || !isFullyLoaded) && (!questions || questions.length < totalQuestions)) {
        setLoadingMessageIndex(0);
        interval = window.setInterval(() => {
            setLoadingMessageIndex(prevIndex => (prevIndex + 1) % loadingMessages.length);
        }, 2500);
    }
    return () => {
        if (interval) clearInterval(interval);
    };
  }, [isLoading, isFullyLoaded, loadingMessages.length, questions]);

  useEffect(() => {
    try {
      const todayKey = getTodayKey();
      const attempts = localStorage.getItem(todayKey);
      if (attempts === null) {
        localStorage.setItem(todayKey, '2');
        setAttemptsLeft(2);
      } else {
        setAttemptsLeft(parseInt(attempts, 10));
      }
    } catch (error) {
      console.warn("Could not access localStorage. Exam attempts will not be tracked.", error);
      setAttemptsLeft(2);
    }
  }, []);

  const handleStartExam = async () => {
    if (attemptsLeft > 0) {
      // Mark that user clicked start
      userClickedStartRef.current = true;
      
      // Clear any saved finished state when starting a new exam
      try {
        const examFinishedKey = 'exam_finished_state';
        localStorage.removeItem(examFinishedKey);
      } catch (error) {
        console.warn('Could not clear exam finished state:', error);
      }
      
      // Reset exam state first
      setCurrentQuestionIndex(0);
      setUserAnswers([]);
      setScore(0);
      setTimeLeft(120 * 60);
      
      // If questions are already loaded, start the exam immediately
      if (questions && questions.length >= totalQuestions) {
        setExamState('running');
        setIsExamInProgress(true);
        setUserAnswers(new Array(questions.length).fill(null));
        setCurrentQuestionIndex(0);
        setScore(0);
        setTimeLeft(120 * 60);
        userClickedStartRef.current = false; // Reset after starting
      } else {
        // If questions aren't loaded yet, regenerate them
        // The useEffect will handle starting the exam when questions are ready
        await regenerateExam();
      }
    }
  };

  useEffect(() => {
    // If we have all questions and exam state is intro, check if exam was already finished
    // Do NOT automatically start the exam - wait for user to click "התחל את המבחן"
    if (questions && questions.length >= totalQuestions && examState === 'intro' && !isLoading) {
      // First check if exam was already finished (restored from localStorage)
      try {
        const examFinishedKey = 'exam_finished_state';
        const savedState = localStorage.getItem(examFinishedKey);
        if (savedState) {
          const parsed = JSON.parse(savedState);
          // Check if saved state matches current questions (same count)
          if (parsed.questionsCount === questions.length && parsed.finished) {
            // Restore finished state (in case first useEffect didn't run or didn't complete)
            setExamState('finished');
            setScore(parsed.score || 0);
            setUserAnswers(parsed.userAnswers || []);
            setTimeLeft(parsed.timeLeft || 0);
            setIsExamInProgress(false);
            userClickedStartRef.current = false; // Reset
            return;
          }
        }
      } catch (error) {
        console.warn('Could not check exam finished state:', error);
      }
      
      // Only start the exam if user clicked "התחל את המבחן"
      if (userClickedStartRef.current) {
        setExamState('running');
        setIsExamInProgress(true);
        setUserAnswers(new Array(questions.length).fill(null));
        setCurrentQuestionIndex(0);
        setScore(0);
        setTimeLeft(120 * 60);
        userClickedStartRef.current = false; // Reset after starting
      }
      // Otherwise, keep showing intro screen until user clicks "התחל את המבחן"
    }
  }, [questions, examState, totalQuestions, isLoading, setIsExamInProgress]); // Include questions in dependencies to trigger when questions are loaded


  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (examState === 'running') {
        e.preventDefault();
        e.returnValue = 'יציאה תבטל את את המבחן הנוכחי. האם אתה בטוח?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [examState]);
  
  const isExamActive = examState === 'running' && isFullyLoaded;

  const calculateScoreAndFinish = useCallback(() => {
    if (!questions) return;
    const finalScore = userAnswers.reduce((acc, answer, index) => {
        if (answer !== null && questions[index].correctAnswerIndex === answer) {
            return acc + 1;
        }
        return acc;
    }, 0);

    const passed = finalScore >= 15;
    if (!passed) {
        // Decrement only on failure
        if (attemptsLeft > 0) {
            try {
                const newAttempts = attemptsLeft - 1;
                localStorage.setItem(getTodayKey(), newAttempts.toString());
                setAttemptsLeft(newAttempts);
            } catch (error) {
                console.warn("Could not write to localStorage. Updating attempts in-memory only.", error);
                setAttemptsLeft(prev => prev - 1);
            }
        }
    }
    
    const results: QuizResult[] = questions.map((q, i) => ({
        question: q.question,
        isCorrect: userAnswers[i] === q.correctAnswerIndex,
        explanation: q.explanation,
    }));
    onExamFinished(results);

    setScore(finalScore);
    setExamState('finished');
    setIsExamInProgress(false);
    
    // Save finished state to localStorage so it persists across navigation
    try {
      const examFinishedKey = 'exam_finished_state';
      localStorage.setItem(examFinishedKey, JSON.stringify({
        finished: true,
        score: finalScore,
        userAnswers: userAnswers,
        timeLeft: timeLeft,
        questionsCount: questions.length,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('Could not save exam finished state:', error);
    }
  }, [questions, userAnswers, setIsExamInProgress, onExamFinished, attemptsLeft, timeLeft]);

  useEffect(() => {
    if (isExamActive) {
      const timer = setInterval(() => {
        setTimeLeft(prevTime => {
          if (prevTime <= 1) {
            clearInterval(timer);
            calculateScoreAndFinish();
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [isExamActive, calculateScoreAndFinish]);



  const handleAnswerSelect = (index: number) => {
    if (!questions) return;
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestionIndex] = index;
    setUserAnswers(newAnswers);

    if (currentQuestionIndex < questions.length - 1) {
      setTimeout(() => setCurrentQuestionIndex(prev => prev + 1), 300);
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };
  
  const handleCreateTargetedFlashcards = async () => {
    if (!analysis?.weaknesses) return;
    setIsGeneratingTargeted('flashcards');
    await createTargetedFlashcards(analysis.weaknesses);
    setIsGeneratingTargeted(null);
  };
  
  const handleCreateTargetedQuiz = async () => {
    if (!analysis?.weaknesses) return;
    setIsGeneratingTargeted('quiz');
    await createTargetedQuiz(analysis.weaknesses);
    setIsGeneratingTargeted(null);
  };

  const handleRestartExam = () => {
    // Reload attempts from localStorage to get updated value
    try {
      const todayKey = getTodayKey();
      const attempts = localStorage.getItem(todayKey);
      if (attempts !== null) {
        setAttemptsLeft(parseInt(attempts, 10));
      }
    } catch (error) {
      console.warn('Could not reload attempts from localStorage:', error);
    }
    
    // Clear any saved finished state when restarting
    try {
      const examFinishedKey = 'exam_finished_state';
      localStorage.removeItem(examFinishedKey);
    } catch (error) {
      console.warn('Could not clear exam finished state:', error);
    }
    
    regenerateExam();
    setExamState('intro');
    setCurrentQuestionIndex(0);
    setUserAnswers([]);
    setScore(0);
    setTimeLeft(120 * 60);
  };


  const getButtonClass = (index: number) => {
    if (userAnswers[currentQuestionIndex] === index) {
      return 'bg-sky-100 border-sky-500 text-sky-700 font-semibold';
    }
    return 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700';
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

  if (examState === 'intro') {
    return (
        <div className="flex-grow flex items-center justify-center p-4 md:p-8">
            <div className="text-center max-w-2xl bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <ExamIcon className="mx-auto h-16 w-16 text-white bg-slate-700 p-3 rounded-full" />
                <h2 className="text-3xl font-bold mt-4 text-slate-800">סימולציית מבחן תיווך</h2>
                <p className="text-slate-600 mt-4 mb-6">
                    זהו מבחן המדמה את מבחן התיווך האמיתי. עליך לענות על 25 שאלות ב-120 דקות.
                    כדי לעבור, יש לענות נכון על 15 שאלות לפחות.
                </p>
                <ul className="text-right list-disc list-inside space-y-2 mb-8 text-slate-600">
                    <li>לא ניתן לצאת מהמבחן לאחר שהתחיל.</li>
                    <li>הציון הסופי יוצג בסיום המבחן.</li>
                    <li>ניתן להיכשל במבחן עד 2 פעמים ביום.</li>
                </ul>
                <p className="font-semibold text-slate-700 mb-4">נותרו לך {attemptsLeft} נסיונות כושלים להיום.</p>
                <button 
                    onClick={handleStartExam}
                    disabled={attemptsLeft <= 0}
                    className="w-full sm:w-auto px-10 py-3 bg-sky-600 text-white font-bold rounded-2xl hover:bg-sky-700 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed text-lg"
                >
                    {attemptsLeft > 0 ? 'התחל את המבחן' : 'מיצית את כל נסיונות הכשלון להיום'}
                </button>
            </div>
        </div>
    );
  }
  
  if (isLoading || !questions || questions.length < totalQuestions) {
    const displayProgress = Math.min(Math.round(progress), 100);
    return (
      <div className="flex-grow flex items-center justify-center p-4 md:p-8">
          <div className="text-center max-w-md w-full">
              <h2 className="text-2xl font-semibold text-slate-800">מכין לך מבחן...</h2>
              <p className="text-slate-500 mt-2 mb-6 h-10 flex items-center justify-center">
                  {loadingMessages[loadingMessageIndex]}
              </p>
              <div className="w-full bg-slate-200 rounded-full h-3 shadow-inner">
                  <div 
                      className="h-3 rounded-full transition-all duration-500 ease-out progress-gradient-animated" 
                      style={{ width: `${displayProgress}%` }}
                  ></div>
              </div>
              <p className="text-center text-sm font-semibold text-slate-600 mt-3">{displayProgress}%</p>
          </div>
      </div>
    );
  }

  if (!isFullyLoaded && !isLoading) {
    return (
      <div className="flex-grow flex items-center justify-center p-4 md:p-8 text-center">
          <div>
              <h2 className="text-2xl font-semibold text-red-600">יצירת המבחן נכשלה</h2>
              <p className="text-slate-500 mt-2">לא ניתן היה ליצור מבחן מלא. נסה לחזור לדף הבית ולנסות שוב.</p>
               <button onClick={() => setView('home')} className="mt-8 px-6 py-2 bg-sky-600 text-white font-semibold rounded-2xl hover:bg-sky-700 transition-colors">
                  חזור לדף הבית
                </button>
          </div>
      </div>
    );
  }

  if (examState === 'finished') {
    const passed = score >= 15;
    return (
        <div className="flex-grow p-4 md:p-8 overflow-y-auto bg-slate-50">
            <div className="max-w-4xl mx-auto">
                <h2 className="text-3xl font-bold text-slate-800 text-center">המבחן הסתיים</h2>
                
                <div className="my-8 flex flex-col items-center justify-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center animate-bounce-in">
                    <h3 className={`text-3xl font-bold animate-fade-in ${passed ? 'text-green-600' : 'text-red-600'}`} style={{ animationDelay: '0.2s' }}>
                        {passed ? 'עברת את המבחן!' : 'נכשלת במבחן'}
                    </h3>
                    {timeLeft === 0 && <p className="text-lg text-amber-600 mt-2 animate-fade-in" style={{ animationDelay: '0.3s' }}>הזמן אזל.</p>}
                    <div className="flex items-center justify-center gap-6 sm:gap-12 my-6">
                        <div className="text-center animate-scale-in" style={{ animationDelay: '0.4s' }}>
                            <p className="text-sm sm:text-base text-slate-500 font-medium">הציון שלך</p>
                            <p className="text-5xl sm:text-6xl font-bold text-sky-600">{score}</p>
                        </div>
                        <div className="text-center animate-scale-in" style={{ animationDelay: '0.5s' }}>
                            <p className="text-sm sm:text-base text-slate-500 font-medium">ציון מעבר</p>
                            <p className="text-5xl sm:text-6xl font-bold text-slate-400">15</p>
                        </div>
                    </div>
                    <p className="text-lg text-slate-600 animate-fade-in" style={{ animationDelay: '0.6s' }}>
                        מתוך סך הכל {questions.length} שאלות
                    </p>
                </div>
                
                <div className="my-8">
                    <h3 className="text-2xl font-bold mb-4 flex items-center text-slate-900">
                        <SparklesIcon className="h-6 w-6 text-slate-700 ml-2" /> ניתוח AI
                    </h3>
                    {isAnalyzing ? (
                        <div className="bg-white border border-slate-200 p-6 rounded-2xl text-center">
                            <div className="w-8 h-8 border-4 border-dashed rounded-full animate-spin border-sky-500 mx-auto"></div>
                            <p className="mt-4 text-slate-500">מנתח את תוצאות המבחן...</p>
                        </div>
                    ) : analysis ? (
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
                            {analysis.weaknesses && analysis.weaknesses.length > 0 && (
                                <div className="lg:col-span-2 mt-4 pt-4 border-t border-slate-200 flex flex-col sm:flex-row gap-3">
                                    <button onClick={handleCreateTargetedFlashcards} disabled={isGeneratingTargeted !== null} className="flex-1 flex items-center justify-center px-6 py-3 bg-gradient-to-br from-amber-500 to-amber-600 text-white text-sm font-semibold rounded-2xl hover:from-amber-600 hover:to-amber-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-wait disabled:hover:shadow-md">
                                        {isGeneratingTargeted === 'flashcards' ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><FlashcardsIcon className="h-5 w-5 ml-2 text-white" /> צור כרטיסיות ממוקדות</>}
                                    </button>
                                    <button onClick={handleCreateTargetedQuiz} disabled={isGeneratingTargeted !== null} className="flex-1 flex items-center justify-center px-6 py-3 bg-gradient-to-br from-purple-500 to-purple-600 text-white text-sm font-semibold rounded-2xl hover:from-purple-600 hover:to-purple-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-wait disabled:hover:shadow-md">
                                        {isGeneratingTargeted === 'quiz' ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><QuizIcon className="h-5 w-5 ml-2 text-white" /> צור בוחן חיזוק</>}
                                    </button>
                                </div>
                            )}
                            {analysis.recommendations && (
                                <div className="lg:col-span-2 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                                    <h4 className="text-lg font-semibold text-slate-700 mb-3">המלצות להמשך</h4>
                                    <p className="text-slate-600 whitespace-pre-wrap">{analysis.recommendations}</p>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>

                <div className="mt-8 pt-6 border-t border-slate-300 flex flex-col items-center gap-4">
                    {/* Show practice options if failed and no attempts left */}
                    {!passed && attemptsLeft === 0 && (
                        <div className="w-full max-w-2xl text-center p-6 bg-red-50 border border-red-200 rounded-2xl mb-4">
                            <h4 className="text-lg font-semibold text-red-800 mb-3">מיצית את כל נסיונות הכשלון להיום</h4>
                            <p className="text-red-700 mb-4">
                                ניסית להיבחן פעמיים היום ונכשלת בשתיהן. לפי כללי המבחן, ניתן להיכשל עד 2 פעמים ביום.
                                כדי לשפר את הביצועים שלך ולהתכונן למבחן הבא, מומלץ לך לתרגל את הנושאים שבהם אתה מתקשה.
                            </p>
                            <p className="text-red-700 font-semibold mb-4">
                                תוכל לנסות שוב מחר או להתמקד בתרגול עם האפשרויות הבאות:
                            </p>
                        </div>
                    )}
                    
                    {/* Show practice options if failed but still have attempts */}
                    {!passed && attemptsLeft > 0 && (
                        <div className="w-full max-w-2xl text-center p-6 bg-amber-50 border border-amber-200 rounded-2xl mb-4">
                            <h4 className="text-lg font-semibold text-amber-800 mb-3">בוא נחזק את הנקודות החלשות</h4>
                            <p className="text-amber-700 mb-4">ה-AI זיהה את הנושאים שבהם אתה מתקשה. בחר אחת מהאפשרויות הבאות כדי להתמקד ולשפר את הביצועים שלך.</p>
                        </div>
                    )}
                    
                    {/* Show "Start Another Exam" button if user passed OR if they have attempts left */}
                    {(passed || attemptsLeft > 0) && (
                        <button onClick={handleRestartExam} className="px-8 py-3 bg-sky-600 text-white font-bold rounded-2xl hover:bg-sky-700 transition-colors text-lg">
                            {passed ? 'עשה מבחן נוסף' : `נסה שוב (נותרו ${attemptsLeft} נסיונות)`}
                        </button>
                    )}
                    
                    <button onClick={() => setView('home')} className="px-6 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-2xl transition-colors">
                        חזור לדף הבית
                    </button>
                </div>

                <div className="my-8">
                    <h3 className="text-2xl font-bold mb-4 text-slate-900">סקירת שאלות</h3>
                    <div className="space-y-4">
                        {questions.map((q, index) => {
                            const userAnswerIndex = userAnswers[index];
                            return (
                                <div key={index} className="bg-white p-5 rounded-2xl border border-slate-200">
                                    <p className="font-semibold text-slate-800 mb-4">{index + 1}. {q.question}</p>
                                    <div className="space-y-2 text-sm">
                                        {q.options.map((option, optIndex) => {
                                            const isCorrectForQuestion = userAnswerIndex === q.correctAnswerIndex;
                                            const isUserAnswer = userAnswerIndex === optIndex;
                                            const isCorrectAnswer = q.correctAnswerIndex === optIndex;
                                            const isSelectedAndWrong = isUserAnswer && !isCorrectForQuestion;
                                            const isSelectedAndCorrect = isUserAnswer && isCorrectForQuestion;
                                            
                                            let styles = "border-slate-200 bg-slate-50 text-slate-700";
                                            if (isCorrectAnswer) {
                                                styles = "border-green-300 bg-green-50 text-green-800 font-semibold";
                                            }
                                            if (isSelectedAndWrong) {
                                                styles = "border-red-300 bg-red-50 text-red-800";
                                            }

                                            return (
                                                <div key={optIndex} className={`p-3 border rounded-md flex justify-between items-center gap-4 ${styles}`}>
                                                    <span className={`flex-grow ${isSelectedAndWrong ? 'line-through' : ''}`}>
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
                                                            <span>התשובה שלך</span>
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
                                        <div className="flex items-center justify-between gap-4">
                                            <p className="text-sm text-slate-600 flex-1"><strong className="font-semibold text-slate-800">הסבר:</strong> {q.explanation}</p>
                                            <button
                                                onClick={() => handlePlayAudio(q.explanation, 'explanation')}
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
  
  const currentQuestion = questions[currentQuestionIndex];
  if (!currentQuestion) {
    return null; // Should not happen
  }
  const progressInExam = questions ? ((currentQuestionIndex + 1) / totalQuestions) * 100 : 0;


  return (
    <div className="flex-grow p-4 md:p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-4">
            <h2 className="text-xl font-semibold text-slate-700">מבחן תיווך</h2>
            <div className="flex items-center gap-6">
                <div className={`flex items-center gap-2 text-sm font-medium ${timeLeft < 60 ? 'text-red-600' : 'text-slate-600'}`}>
                    <ClockIcon className="h-5 w-5 text-slate-700" />
                    <span className="font-mono text-base">{formatTime(timeLeft)}</span>
                </div>
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
                style={{ width: `${progressInExam}%` }}
            >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
            </div>
        </div>
        <div key={currentQuestionIndex} className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm animate-slide-in-right">
          <div className="flex items-center justify-between gap-4 mb-6">
            <p className="text-lg font-semibold text-slate-900 flex-1">{currentQuestion.question}</p>
            <button
                onClick={() => handlePlayAudio(currentQuestion.question, 'question')}
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
            {currentQuestion.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleAnswerSelect(index)}
                className={`p-4 rounded-2xl border transition-all duration-300 flex items-baseline gap-3 text-right ${getButtonClass(index)} hover:scale-[1.02] active:scale-[0.98] animate-scale-in`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <span className="font-bold">{hebrewLetters[index]}.</span>
                <span className="flex-1">{option}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-8 flex justify-between items-center">
            <button
                onClick={handlePreviousQuestion}
                disabled={currentQuestionIndex === 0}
                className="w-auto px-6 py-2 bg-white border border-slate-300 text-slate-700 font-semibold rounded-2xl hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                השאלה הקודמת
            </button>
            <button
                onClick={calculateScoreAndFinish}
                className="w-auto px-8 py-2 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 transition-colors"
            >
                סיים מבחן
            </button>
        </div>
      </div>
    </div>
  );
};

export default ExamView;