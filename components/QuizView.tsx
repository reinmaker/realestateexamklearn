import React, { useState, useEffect, useCallback, useRef } from 'react';
import { QuizQuestion, QuizResult, QuizProgress, AnalysisResult, ViewType } from '../types';
import { SparklesIcon, FlashcardsIcon, QuizIcon, CheckIcon, CloseIcon, SpeakerIcon } from './icons';
import { generateSpeech } from '../services/aiService';


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
  regenerateQuiz: () => void;
  totalQuestions: number;
  quizProgress: QuizProgress;
  setQuizProgress: React.Dispatch<React.SetStateAction<QuizProgress>>;
  setView: (view: ViewType) => void;
  createTargetedFlashcards: (weaknesses: string[]) => Promise<void>;
  createTargetedQuiz: (weaknesses: string[]) => Promise<void>;
  analysis: AnalysisResult | null;
  isAnalyzing: boolean;
}

const QuizView: React.FC<QuizViewProps> = ({
  userName, documentContent, setAppError, openSideChat, onQuestionAnswered, questions, isLoading, regenerateQuiz, totalQuestions, quizProgress, setQuizProgress, setView, createTargetedFlashcards, createTargetedQuiz, analysis, isAnalyzing }) => {
  
  const hebrewLetters = ['א', 'ב', 'ג', 'ד'];
  
  const { currentQuestionIndex, selectedAnswer, showAnswer, score, isFinished } = quizProgress;
  const isFullyLoaded = questions && questions.length >= totalQuestions;
  
  const [userAnswers, setUserAnswers] = useState<(number | null)[]>([]);
  
  // Preserve current question index when questions array changes
  // Only adjust if the current index is truly out of bounds
  useEffect(() => {
    if (questions && questions.length > 0 && currentQuestionIndex >= questions.length) {
      // If current index is out of bounds, adjust it to the last available question
      // But don't change if we're just waiting for more questions to load
      const newIndex = Math.max(0, Math.min(currentQuestionIndex, questions.length - 1));
      if (newIndex !== currentQuestionIndex) {
        setQuizProgress(prev => ({
          ...prev,
          currentQuestionIndex: newIndex,
        }));
      }
    }
  }, [questions?.length, currentQuestionIndex]); // Only depend on length, not the full array
  const [isGeneratingTargeted, setIsGeneratingTargeted] = useState<'flashcards' | 'quiz' | null>(null);
  const [progress, setProgress] = useState(0);
  const progressIntervalRef = useRef<number | null>(null);
  const progressStartTimeRef = useRef<number | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState<'question' | 'explanation' | null>(null);

  useEffect(() => {
    // If loading, start animated progress from 0% to 100% over 60 seconds
    if (isLoading && (!questions || questions.length === 0)) {
      // Reset and start animation
      setProgress(0);
      progressStartTimeRef.current = Date.now();
      
      // Clear any existing interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      
      // Update progress every 100ms for smooth animation
      progressIntervalRef.current = window.setInterval(() => {
        if (progressStartTimeRef.current) {
          const elapsed = Date.now() - progressStartTimeRef.current;
          const duration = 60000; // 60 seconds (1 minute)
          const newProgress = Math.min(Math.round((elapsed / duration) * 100), 100);
          setProgress(newProgress);
          
          // Stop animation when reaching 100%
          if (newProgress >= 100) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
          }
        }
      }, 100);
      
      return () => {
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
      
      // If questions are available, use actual progress
      if (questions && questions.length > 0) {
        const realProgress = Math.min(Math.round((questions.length / totalQuestions) * 100), 100);
        setProgress(realProgress);
      } else {
        setProgress(0);
      }
    }
  }, [questions?.length, totalQuestions, isLoading]); // Use questions.length instead of questions to detect changes

  // Use ref to prevent excessive calls
  const hasRegeneratedRef = useRef(false);
  
  useEffect(() => {
    // Only regenerate if no questions AND user hasn't started answering
    // Don't regenerate if user is on a question (currentQuestionIndex > 0 or has selected answer)
    const userHasStarted = currentQuestionIndex > 0 || selectedAnswer !== null;
    if (!questions && !isLoading && !userHasStarted && !hasRegeneratedRef.current) {
        hasRegeneratedRef.current = true;
        regenerateQuiz().finally(() => {
          // Reset after a delay to allow regeneration if needed later
          setTimeout(() => {
            hasRegeneratedRef.current = false;
          }, 2000);
        });
    }
  }, [questions, isLoading, regenerateQuiz, currentQuestionIndex, selectedAnswer]);

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


  const handleAnswerSelect = (index: number) => {
    if (showAnswer || !questions) return;
    const currentQuestion = questions[currentQuestionIndex];
    const isCorrect = index === currentQuestion.correctAnswerIndex;
    
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestionIndex] = index;
    setUserAnswers(newAnswers);
    
    let newScore = score;
    if (isCorrect) {
      newScore = score + 1;
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
  };

  const handleNextQuestion = () => {
    if (!questions) return;
    if (currentQuestionIndex < questions.length - 1) {
        setQuizProgress(prev => ({
            ...prev,
            currentQuestionIndex: prev.currentQuestionIndex + 1,
            selectedAnswer: null,
            showAnswer: false,
        }));
    } else {
      if (isFullyLoaded) {
        setQuizProgress(prev => ({ ...prev, isFinished: true }));
      }
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
      return 'bg-green-50 border-green-400 text-green-800 font-semibold';
    }
    if (selectedAnswer === index && !isCorrect) {
      return 'bg-red-50 border-red-400 text-red-800 font-semibold';
    }
    return 'bg-slate-50 border-slate-200 text-slate-500';
  };

  if (!questions || questions.length === 0) {
      const displayProgress = Math.min(Math.round(progress), 100);
      // Ensure minimum width so the bar is visible even at 0%
      const barWidth = Math.max(displayProgress, isLoading ? 1 : 0);
      return (
          <div className="flex-grow flex items-center justify-center p-4 md:p-8">
              <div className="text-center max-w-md w-full">
                  <h2 className="text-2xl font-semibold text-slate-800">מכין לך בוחן חכם...</h2>
                  <p className="text-slate-500 mt-2 mb-6">הבינה המלאכותית מנתחת את חומר הלימוד כדי ליצור סט ייחודי של שאלות עבורך. תהליך זה עשוי להימשך מספר רגעים.</p>
                  <div className="w-full bg-slate-200 rounded-full h-3 shadow-inner overflow-hidden">
                      <div 
                          className="h-full rounded-full transition-all duration-300 ease-linear bg-gradient-to-r from-sky-500 to-blue-600" 
                          style={{ width: `${barWidth}%`, minWidth: barWidth > 0 ? '2px' : '0' }}
                      ></div>
                  </div>
                  <p className="text-center text-sm font-semibold text-slate-600 mt-3">{displayProgress}%</p>
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
                
                <div className="my-8 flex flex-col items-center justify-center bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <ProgressCircle percentage={percentage} />
                    <p className="text-2xl font-bold mt-4 text-slate-800">הציון שלך: {score} מתוך {questions.length}</p>
                    <p className={`text-2xl font-bold mt-2 ${passed ? 'text-green-600' : 'text-red-600'}`}>
                        {passed ? 'עברת את הבוחן!' : 'לא עברת את הבוחן'}
                    </p>
                </div>

                <div className="my-8">
                    <h3 className="text-2xl font-bold mb-4 flex items-center text-slate-900">
                        <SparklesIcon className="h-6 w-6 text-sky-500 ml-2" /> ניתוח AI
                    </h3>
                    {isAnalyzing && (
                        <div className="bg-white border border-slate-200 p-6 rounded-lg text-center">
                            <div className="w-8 h-8 border-4 border-dashed rounded-full animate-spin border-sky-500 mx-auto"></div>
                            <p className="mt-4 text-slate-500">מנתח את התקדמותך...</p>
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
                                <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col sm:flex-row gap-3">
                                    <button onClick={handleCreateTargetedFlashcards} disabled={isGeneratingTargeted !== null} className="flex-1 flex items-center justify-center px-4 py-2 bg-amber-100 text-amber-800 text-sm font-semibold rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-50 disabled:cursor-wait">
                                        {isGeneratingTargeted === 'flashcards' ? <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div> : <><FlashcardsIcon className="h-5 w-5 ml-2" /> צור כרטיסיות ממוקדות</>}
                                    </button>
                                    <button onClick={handleCreateTargetedQuiz} disabled={isGeneratingTargeted !== null} className="flex-1 flex items-center justify-center px-4 py-2 bg-amber-100 text-amber-800 text-sm font-semibold rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-50 disabled:cursor-wait">
                                        {isGeneratingTargeted === 'quiz' ? <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div> : <><QuizIcon className="h-5 w-5 ml-2" /> צור בוחן חיזוק</>}
                                    </button>
                                </div>
                            </div>
                            <div className="lg:col-span-2 bg-white border border-slate-200 p-6 rounded-lg shadow-sm">
                                <h4 className="text-lg font-semibold text-sky-600 mb-3">המלצות להמשך</h4>
                                <p className="text-slate-600 whitespace-pre-wrap">{analysis.recommendations}</p>
                            </div>
                        </div>
                    )}
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
                                        <p className="text-sm text-slate-600"><strong className="font-semibold text-slate-800">הסבר:</strong> {q.explanation}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-300 flex flex-col sm:flex-row justify-center gap-4">
                    <button onClick={regenerateQuiz} className="px-8 py-3 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700 transition-colors text-lg">
                        עשה בוחן נוסף
                    </button>
                    <button onClick={() => setView('home')} className="px-6 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg transition-colors">
                        חזור לדף הבית
                    </button>
                </div>
            </div>
        </div>
    );
  }
  
  const currentQuestion = questions[currentQuestionIndex];
  if (!currentQuestion) {
     if (!isFullyLoaded && !isLoading) {
        return (
            <div className="flex-grow flex items-center justify-center p-4 md:p-8 text-center">
                <div>
                    <h2 className="text-2xl font-semibold text-red-600">יצירת הבוחן נכשלה</h2>
                    <p className="text-slate-500 mt-2">לא ניתן היה ליצור בוחן מלא. אנא נסה שוב.</p>
                    <button onClick={regenerateQuiz} className="mt-6 px-6 py-2 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 transition-colors">
                        נסה שוב
                    </button>
                </div>
            </div>
        );
    }
    return null; // Should not happen if questions array is not empty
  }
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const isWaitingForQuestions = showAnswer && isLastQuestion && isLoading && !isFullyLoaded;
  const progressInQuiz = questions ? ((currentQuestionIndex + 1) / totalQuestions) * 100 : 0;


  return (
    <div className="flex-grow p-4 md:p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-4">
            <h2 className="text-xl font-semibold text-sky-600">בוחן אימון</h2>
            <div className="flex items-center gap-6">
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
                style={{ width: `${progressInQuiz}%` }}
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
                disabled={showAnswer}
                className={`p-4 rounded-lg border transition-all duration-300 flex items-baseline gap-3 text-right ${getButtonClass(index)} ${!showAnswer ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span className="font-bold">{hebrewLetters[index]}.</span>
                <span className="flex-1">{option}</span>
              </button>
            ))}
          </div>
        </div>
        {showAnswer && (
          <div className="mt-6 p-4 rounded-lg bg-slate-50 border border-slate-200 animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div className='flex-grow'>
                    <div className="flex items-center justify-between gap-4 mb-2">
                        <h3 className="font-bold text-lg text-slate-800">הסבר קצר</h3>
                        <button
                            onClick={() => handlePlayAudio(currentQuestion.explanation, 'explanation')}
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
                    <p className="text-slate-600">{currentQuestion.explanation}</p>
                </div>
                <button 
                    onClick={handleFurtherExplanation}
                    className="flex items-center justify-center w-full sm:w-auto px-4 py-2 bg-sky-100 text-sky-700 text-sm font-semibold rounded-lg hover:bg-sky-200 transition-colors shrink-0 self-end sm:self-center">
                    <SparklesIcon className="h-4 w-4 ml-1" />
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
                  className="w-full sm:w-auto px-6 py-2 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 transition-colors"
                >
                  {isLastQuestion && isFullyLoaded ? 'סיים בוחן' : 'השאלה הבאה'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuizView;