import React, { useState, useEffect, useRef } from 'react';
import { Flashcard, FlashcardsProgress } from '../types';
import { SparklesIcon, LightbulbIcon, SpeakerIcon } from './icons';
import { generateHint, generateSpeech } from '../services/aiService';

// Standalone audio decoding functions
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}


interface FlashcardsViewProps {
  userName?: string;
  documentContent: string;
  setAppError: (error: string | null) => void;
  openSideChat: (context: string) => void;
  flashcards: Flashcard[] | null;
  isLoading: boolean;
  regenerateFlashcards: () => void;
  totalFlashcards: number;
  flashcardsProgress: FlashcardsProgress;
  setFlashcardsProgress: React.Dispatch<React.SetStateAction<FlashcardsProgress>>;
}

const FlashcardsView: React.FC<FlashcardsViewProps> = ({
  userName, documentContent, setAppError, openSideChat, flashcards, isLoading, regenerateFlashcards, totalFlashcards, flashcardsProgress, setFlashcardsProgress }) => {
  const { currentIndex, userAnswers } = flashcardsProgress;
  
  const [isFlipped, setIsFlipped] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [isHintLoading, setIsHintLoading] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const [isAudioLoading, setIsAudioLoading] = useState<'question' | 'answer' | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const loadingMessages = [
    'סורק את חומר הלימוד ומזהה נושאי ליבה...',
    'מזקק הגדרות וכללים משפטיים חשובים...',
    'מנסח שאלות ותשובות תמציתיות לשינון...',
    'כמעט מוכן! מכין את הכרטיסיות האחרונות...'
  ];
  
  useEffect(() => {
    const realProgress = flashcards ? Math.round((flashcards.length / totalFlashcards) * 100) : 0;
    setProgress(realProgress);
  }, [flashcards, totalFlashcards]);

  useEffect(() => {
    let interval: number | undefined;
    if (isLoading && (!flashcards || flashcards.length < totalFlashcards)) {
      setLoadingMessageIndex(0);
      interval = window.setInterval(() => {
        setLoadingMessageIndex(prevIndex => (prevIndex + 1) % loadingMessages.length);
      }, 2500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoading, totalFlashcards, loadingMessages.length, flashcards]);

  useEffect(() => {
    if (!flashcards && !isLoading) {
      regenerateFlashcards();
    }
  }, [flashcards, isLoading, regenerateFlashcards]);

  useEffect(() => {
    // When the card changes (e.g., user navigates), reset the transient state like flip and hint.
    setIsFlipped(false);
    setHint(null);
  }, [currentIndex]);

  const handleNext = () => {
    if (!flashcards || flashcards.length === 0) return;
    const isLastCard = currentIndex === flashcards.length - 1;

    if (!isLastCard) {
      setTimeout(() => setFlashcardsProgress((prev) => ({...prev, currentIndex: prev.currentIndex + 1})), 150);
    } else if (isLastCard && !isLoading) {
      setTimeout(() => setFlashcardsProgress((prev) => ({...prev, currentIndex: 0})), 150);
    }
    // If on last card and more are loading, do nothing (button will be disabled)
  };

  const handlePrev = () => {
    if (!flashcards || flashcards.length === 0) return;
    setTimeout(() => setFlashcardsProgress((prev) => ({...prev, currentIndex: (prev.currentIndex - 1 + flashcards.length) % flashcards.length})), 150);
  };
  
  const handleFurtherExplanation = () => {
    if (!flashcards) return;
    const currentCard = flashcards[currentIndex];
    const context = `שאלה: ${currentCard.question}\n\nתשובה: ${currentCard.answer}`;
    openSideChat(context);
  };

  const handleGetHint = async () => {
    if (!flashcards) return;
    const currentCard = flashcards[currentIndex];
    setIsHintLoading(true);
    setAppError(null);
    try {
        const generatedHint = await generateHint(currentCard.question, currentCard.answer, documentContent, userName);
        setHint(generatedHint);
    } catch (error) {
        if (error instanceof Error) setAppError(error.message);
        else setAppError("נכשל ביצירת רמז.");
    } finally {
        setIsHintLoading(false);
    }
  };

  const handlePlayAudio = async (text: string, type: 'question' | 'answer') => {
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
  
  if (!flashcards || flashcards.length === 0) {
    const displayProgress = Math.min(Math.round(progress), 100);
    if (isLoading) {
      return (
        <div className="flex-grow flex items-center justify-center p-4 md:p-8">
          <div className="text-center max-w-md w-full">
              <h2 className="text-2xl font-semibold text-slate-800">מכין לך כרטיסיות חכמות...</h2>
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
    // Finished loading, but still no cards.
    return (
        <div className="flex-grow flex items-center justify-center p-4 md:p-8 text-center">
          <div>
              <h2 className="text-2xl font-semibold text-red-600">יצירת הכרטיסיות נכשלה</h2>
              <p className="text-slate-500 mt-2">לא ניתן היה ליצור סט כרטיסיות.</p>
              <button onClick={regenerateFlashcards} className="mt-6 px-6 py-2 bg-sky-600 text-white font-semibold rounded-2xl hover:bg-sky-700 transition-colors">
                  נסה שוב
              </button>
          </div>
        </div>
      );
  }
  
  const currentCard = flashcards[currentIndex];
  if(!currentCard) return null; // Safety check

  const progressInDeck = (flashcards.length > 0)
    ? ((currentIndex + 1) / flashcards.length) * 100
    : 0;
    
  const isLastCard = currentIndex === flashcards.length - 1;

  const handleCreateNewSet = () => {
    setFlashcardsProgress({ currentIndex: 0, userAnswers: [] });
    regenerateFlashcards();
  };

  return (
    <div className="flex-grow p-4 md:p-8 flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-slate-700">מצב כרטיסיות</h2>
        <button 
          onClick={handleCreateNewSet}
          disabled={isLoading}
          className="px-4 py-2 bg-sky-600 text-white font-semibold rounded-2xl hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>יוצר...</span>
            </>
          ) : (
            <span>צור סט חדש</span>
          )}
        </button>
      </div>
      <div className="w-full max-w-2xl mb-6" style={{ perspective: '1000px' }}>
        <div 
          className="relative w-full transition-transform duration-500"
          style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          {/* Front of card */}
          <div className="w-full rounded-2xl bg-amber-50 text-slate-900 flex flex-col justify-center p-6 sm:p-8 text-center border border-amber-200 shadow-md" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
            <div className="flex items-center justify-center gap-2 mb-4 flex-shrink-0">
                <p className="text-xl sm:text-2xl font-bold">{currentCard.question}</p>
                <button
                    onClick={() => handlePlayAudio(currentCard.question, 'question')}
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
            <div className="relative h-40">
                <textarea
                    value={userAnswers[currentIndex] || ''}
                    onChange={(e) => {
                        const newAnswerValue = e.target.value;
                        const answerIndex = currentIndex; // Capture the index for this card's render
                        setFlashcardsProgress(prev => {
                            const newAnswers = [...prev.userAnswers];
                            if (answerIndex < newAnswers.length) {
                                newAnswers[answerIndex] = newAnswerValue;
                            }
                            return {
                                ...prev,
                                userAnswers: newAnswers,
                            };
                        });
                    }}
                    placeholder="כתוב את תשובתך כאן..."
                    className="absolute inset-0 w-full h-full p-3 rounded-md border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition text-sm bg-white resize-none"
                    disabled={isFlipped}
                />
            </div>
            <div className="mt-4 flex-shrink-0">
                <button
                    onClick={handleGetHint}
                    disabled={isHintLoading || !!hint}
                    className="flex items-center justify-center mx-auto px-4 py-2 bg-amber-100 text-amber-800 text-sm font-semibold rounded-2xl hover:bg-amber-200 transition-colors disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                    {isHintLoading ? (
                        <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                       <> <LightbulbIcon className="h-4 w-4 ml-1 text-slate-700" />קבל רמז</>
                    )}
                </button>
                {hint && (
                    <p className="mt-3 text-sm text-slate-600 bg-amber-100 p-3 rounded-md animate-fade-in">{hint}</p>
                )}
            </div>
            <button onClick={() => setIsFlipped(true)} className="w-full mt-4 py-2 bg-sky-600 text-white font-semibold rounded-2xl hover:bg-sky-700 transition-colors">
                הצג תשובה
            </button>
          </div>
          
          {/* Back of card */}
          <div className="absolute w-full h-full top-0 left-0 rounded-2xl bg-sky-50 text-slate-900 flex flex-col justify-center items-center p-6 sm:p-8 text-center border border-sky-200 shadow-md" style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
             <div className="flex items-center justify-center gap-2 mb-4">
                <p className="text-lg font-semibold text-slate-500">{currentCard.question}</p>
            </div>
            <div className="flex items-center justify-center gap-2 flex-grow">
                <p className="text-xl sm:text-2xl font-bold">{currentCard.answer}</p>
                 <button
                    onClick={() => handlePlayAudio(currentCard.answer, 'answer')}
                    disabled={!!isAudioLoading}
                    className="p-2 rounded-full bg-slate-700 border-2 border-slate-600 text-white hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-wait shrink-0"
                    aria-label="הקרא תשובה"
                >
                    {isAudioLoading === 'answer' ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <SpeakerIcon className="h-5 w-5" />
                    )}
                </button>
            </div>
            <div className="mt-4 w-full flex flex-col items-center gap-3">
                 <button 
                    onClick={handleFurtherExplanation}
                    className="flex items-center justify-center px-4 py-2 bg-sky-100 text-sky-700 text-sm font-semibold rounded-2xl hover:bg-sky-200 transition-colors">
                    <SparklesIcon className="h-4 w-4 ml-1 text-slate-700" />
                    שאל את המורה
                </button>
                <button onClick={() => setIsFlipped(false)} className="w-full py-2 bg-slate-200 text-slate-800 font-semibold rounded-2xl hover:bg-slate-300 transition-colors">
                    הסתר תשובה
                </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <div className="w-full max-w-2xl flex items-center justify-between">
        <button onClick={handlePrev} className="px-6 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-2xl transition-colors">
          הקודם
        </button>
        <div className="flex-grow text-center text-sm font-medium text-slate-500">
          כרטיסייה {currentIndex + 1} מתוך {flashcards.length}
          {isLoading && !isLastCard && (
            <div className="inline-block align-middle w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mr-2"></div>
          )}
        </div>
        <button onClick={handleNext} disabled={isLastCard && isLoading} className="px-6 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-2xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          הבא
        </button>
      </div>
       <div className="w-full max-w-2xl bg-slate-200 rounded-full h-1.5 mt-4">
            <div
                className="bg-sky-500 h-1.5 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressInDeck}%` }}
            ></div>
        </div>
    </div>
  );
};

export default FlashcardsView;