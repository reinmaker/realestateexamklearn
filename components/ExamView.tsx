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

  const handleStartExam = () => {
    if (attemptsLeft > 0) {
      // Always regenerate exam to get a fresh random mix from the full DB pool
      regenerateExam();
      setExamState('running');
      setIsExamInProgress(true);
    }
  };

  useEffect(() => {
    if (questions && questions.length >= totalQuestions && examState === 'running') {
        // Only initialize exam when we have all questions loaded
        setUserAnswers(new Array(questions.length).fill(null));
        setCurrentQuestionIndex(0);
    }
  }, [questions, examState, totalQuestions]);


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
  }, [questions, userAnswers, setIsExamInProgress, onExamFinished, attemptsLeft]);

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
            <div className="text-center max-w-2xl bg-white p-8 rounded-lg border border-slate-200 shadow-sm">
                <ExamIcon className="mx-auto h-16 w-16 text-sky-500 bg-sky-100 p-3 rounded-full" />
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
                    className="w-full sm:w-auto px-10 py-3 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed text-lg"
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
               <button onClick={() => setView('home')} className="mt-8 px-6 py-2 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 transition-colors">
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
                
                <div className="my-8 flex flex-col items-center justify-center bg-white p-6 rounded-lg border border-slate-200 shadow-sm text-center">
                    <h3 className={`text-3xl font-bold ${passed ? 'text-green-600' : 'text-red-600'}`}>
                        {passed ? 'עברת את המבחן!' : 'נכשלת במבחן'}
                    </h3>
                    {timeLeft === 0 && <p className="text-lg text-amber-600 mt-2">הזמן אזל.</p>}
                    <div className="flex items-center justify-center gap-6 sm:gap-12 my-6">
                        <div className="text-center">
                            <p className="text-sm sm:text-base text-slate-500 font-medium">הציון שלך</p>
                            <p className="text-5xl sm:text-6xl font-bold text-sky-600">{score}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-sm sm:text-base text-slate-500 font-medium">ציון מעבר</p>
                            <p className="text-5xl sm:text-6xl font-bold text-slate-400">15</p>
                        </div>
                    </div>
                    <p className="text-lg text-slate-600">
                        מתוך סך הכל {questions.length} שאלות
                    </p>
                </div>
                
                <div className="my-8">
                    <h3 className="text-2xl font-bold mb-4 flex items-center text-slate-900">
                        <SparklesIcon className="h-6 w-6 text-sky-500 ml-2" /> ניתוח AI
                    </h3>
                    {isAnalyzing && (
                        <div className="bg-white border border-slate-200 p-6 rounded-lg text-center">
                            <div className="w-8 h-8 border-4 border-dashed rounded-full animate-spin border-sky-500 mx-auto"></div>
                            <p className="mt-4 text-slate-500">מנתח את תוצאות המבחן...</p>
                        </div>
                    )}
                    {analysis && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                            <div className="bg-white border border-slate-200 p-6 rounded-lg shadow-sm">
                                <h4 className="text-lg font-semibold text-green-600 mb-3">נושאים חזקים</h4>
                                <ul className="space-y-2 list-disc list-inside text-slate-600">
                                    {analysis.strengths.map((item, index) => <li key={index}>{item}</li>)}
                                </ul>
                            </div>
                            <div className="bg-white border border-slate-200 p-6 rounded-lg shadow-sm">
                                <h4 className="text-lg font-semibold text-amber-600 mb-3">נושאים לשיפור</h4>
                                <ul className="space-y-2 list-disc list-inside text-slate-600">
                                    {analysis.weaknesses.map((item, index) => <li key={index}>{item}</li>)}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-8 pt-6 border-t border-slate-300 flex flex-col items-center gap-4">
                    {!passed && analysis && (
                        <div className="w-full max-w-2xl text-center p-6 bg-amber-50 border border-amber-200 rounded-lg">
                            <h4 className="text-lg font-semibold text-amber-800 mb-3">בוא נחזק את הנקודות החלשות</h4>
                            <p className="text-amber-700 mb-4">ה-AI זיהה את הנושאים שבהם אתה מתקשה. בחר אחת מהאפשרויות הבאות כדי להתמקד ולשפר את הביצועים שלך.</p>
                            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                <button onClick={handleCreateTargetedFlashcards} disabled={isGeneratingTargeted !== null} className="flex-1 flex items-center justify-center px-4 py-2 bg-amber-100 text-amber-800 text-sm font-semibold rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-50 disabled:cursor-wait">
                                    {isGeneratingTargeted === 'flashcards' ? <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div> : <><FlashcardsIcon className="h-5 w-5 ml-2" /> צור כרטיסיות ממוקדות</>}
                                </button>
                                <button onClick={handleCreateTargetedQuiz} disabled={isGeneratingTargeted !== null} className="flex-1 flex items-center justify-center px-4 py-2 bg-amber-100 text-amber-800 text-sm font-semibold rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-50 disabled:cursor-wait">
                                    {isGeneratingTargeted === 'quiz' ? <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div> : <><QuizIcon className="h-5 w-5 ml-2" /> צור בוחן חיזוק</>}
                                </button>
                            </div>
                        </div>
                    )}
                    {passed && (
                        <button onClick={handleRestartExam} className="px-8 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors text-lg">
                            עשה מבחן נוסף
                        </button>
                    )}
                    <button onClick={() => setView('home')} className="px-6 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg transition-colors">
                        חזור לדף הבית
                    </button>
                </div>

                <div className="my-8">
                    <h3 className="text-2xl font-bold mb-4 text-slate-900">סקירת שאלות</h3>
                    <div className="space-y-4">
                        {questions.map((q, index) => {
                            const userAnswerIndex = userAnswers[index];
                            return (
                                <div key={index} className="bg-white p-5 rounded-lg border border-slate-200">
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
                                                className="p-2 rounded-full bg-sky-100 text-sky-800 hover:bg-sky-200 transition-colors disabled:opacity-50 disabled:cursor-wait shrink-0"
                                                aria-label="הקרא הסבר"
                                            >
                                                {isAudioLoading === 'explanation' ? (
                                                    <div className="w-5 h-5 border-2 border-sky-600 border-t-transparent rounded-full animate-spin"></div>
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
            <h2 className="text-xl font-semibold text-sky-600">מבחן תיווך</h2>
            <div className="flex items-center gap-6">
                <div className={`flex items-center gap-2 text-sm font-medium ${timeLeft < 60 ? 'text-red-600' : 'text-slate-600'}`}>
                    <ClockIcon className="h-5 w-5" />
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
        <div className="w-full bg-slate-200 rounded-full h-2.5 mb-4">
            <div
                className="bg-sky-500 h-2.5 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressInExam}%` }}
            ></div>
        </div>
        <div className="bg-white border border-slate-200 p-6 rounded-lg shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-6">
            <p className="text-lg font-semibold text-slate-900 flex-1">{currentQuestion.question}</p>
            <button
                onClick={() => handlePlayAudio(currentQuestion.question, 'question')}
                disabled={!!isAudioLoading}
                className="p-2 rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors disabled:opacity-50 disabled:cursor-wait shrink-0"
                aria-label="הקרא שאלה"
            >
                {isAudioLoading === 'question' ? (
                    <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
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
                className={`p-4 rounded-lg border transition-all duration-300 flex items-baseline gap-3 text-right ${getButtonClass(index)}`}
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
                className="w-auto px-6 py-2 bg-white border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                השאלה הקודמת
            </button>
            <button
                onClick={calculateScoreAndFinish}
                className="w-auto px-8 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors"
            >
                סיים מבחן
            </button>
        </div>
      </div>
    </div>
  );
};

export default ExamView;