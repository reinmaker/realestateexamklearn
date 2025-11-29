import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, ChatSession } from '../types';
import { continueChat, createChatSession } from '../services/aiService';
import { AIAvatarIcon, UserIcon } from './icons';
import { documentContent } from '../studyMaterial';

interface ChatViewProps {
  setAppError: (error: string | null) => void;
  chatSession: ChatSession | null;
  setChatSession: React.Dispatch<React.SetStateAction<ChatSession | null>>;
  hasValidPayment?: boolean;
}

const ChatView: React.FC<ChatViewProps> = ({ setAppError, chatSession, setChatSession, hasValidPayment = true }) => {
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasInitializedRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatSession?.history]);

  // Initialize chat session with welcome message if it's null or empty
  useEffect(() => {
    if (!hasInitializedRef.current && (!chatSession || chatSession.history.length === 0)) {
      hasInitializedRef.current = true;
      // Set a welcome message immediately - include payment notice if needed
      let welcomeMessage = 'היי, אני דניאל, המורה הפרטי שלך. במה אוכל לעזור?';
      if (!hasValidPayment) {
        welcomeMessage = 'היי, אני דניאל, המורה הפרטי שלך. לצערי, אני לא יכול לענות על שאלות עד שתשלים את התשלום לפלטפורמה. אנא השלם את התשלום כדי להמשיך.';
      }
      if (!chatSession) {
        // If chatSession is null, we need to create it first
        // This will be handled by App.tsx, but we can set a temporary message
        setChatSession({
          chat: null as any, // Will be set by App.tsx
          history: [{ role: 'model', text: welcomeMessage }],
        });
      } else {
        // If chatSession exists but history is empty, add welcome message
        setChatSession(prev => prev ? { ...prev, history: [{ role: 'model', text: welcomeMessage }] } : null);
      }
    }
  }, [chatSession, setChatSession, hasValidPayment]);
  
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || isLoading) return;

    // Ensure chat session is initialized
    let currentSession = chatSession;
    if (!currentSession || !currentSession.chat) {
      setIsLoading(true);
      setAppError(null);
      try {
        const newChat = await createChatSession(documentContent);
        const welcomeMessage = 'היי, אני דניאל, המורה הפרטי שלך. במה אוכל לעזור?';
        currentSession = {
          chat: newChat,
          history: [{ role: 'model', text: welcomeMessage }],
        };
        setChatSession(currentSession);
      } catch (error) {
        if (error instanceof Error) {
          setAppError(error.message);
        } else {
          setAppError("נכשל באתחול סשן הצ'אט.");
        }
        setIsLoading(false);
        return;
      } finally {
        setIsLoading(false);
      }
    }

    if (!currentSession) return;

    const newUserMessage: ChatMessage = { role: 'user', text: userInput };
    setChatSession(prev => prev ? { ...prev, history: [...prev.history, newUserMessage] } : null);
    setUserInput('');
    setIsLoading(true);
    setAppError(null);

    try {
      const modelResponse = await continueChat(currentSession.chat, userInput, currentSession.history);
      const modelMessage: ChatMessage = { role: 'model', text: modelResponse };
      setChatSession(prev => prev ? { ...prev, history: [...prev.history, modelMessage] } : null);
    } catch (error) {
        if (error instanceof Error) {
            setAppError(error.message);
        } else {
            setAppError("אירעה שגיאה במהלך הצ'אט.");
        }
        setChatSession(prev => prev ? { ...prev, history: prev.history.slice(0, -1)}: null); // remove user message on error
    } finally {
      setIsLoading(false);
    }
  };

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
              onClick={() => window.location.href = '/'}
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
    <div className="flex-grow flex flex-col p-4 md:p-8 h-full overflow-hidden">
        <h2 className="text-xl font-semibold text-slate-700 mb-4 px-4 hidden md:block">המורה הפרטי שלך</h2>
      <div className="flex-grow bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shadow-sm">
        <div className="flex-grow p-4 space-y-4 overflow-y-auto">
          {chatSession?.history.map((message, index) => (
            <div key={index} className={`flex items-end gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
               {message.role === 'model' && (
                <AIAvatarIcon className="h-8 w-8 flex-shrink-0" />
               )}
              <div className={`max-w-xs md:max-w-md lg:max-w-2xl rounded-2xl px-4 py-2 ${message.role === 'user' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                <p className="whitespace-pre-wrap">{message.text}</p>
              </div>
              {message.role === 'user' && (
                <UserIcon className="h-8 w-8 text-white bg-slate-700 rounded-full p-1.5 flex-shrink-0" />
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-end gap-2 justify-start">
              <AIAvatarIcon className="h-8 w-8 flex-shrink-0" />
              <div className="max-w-xs md:max-w-md lg:max-w-2xl rounded-2xl px-4 py-2 bg-slate-100 text-slate-800">
                <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200">
          <div className="flex items-center bg-slate-100 rounded-2xl">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="שאל שאלה על המסמך..."
              className="w-full bg-white px-4 py-3 text-slate-900 focus:outline-none rounded-2xl"
              disabled={isLoading || !chatSession}
            />
            <button
              type="submit"
              disabled={isLoading || !userInput.trim() || !chatSession}
              className="px-4 py-3 text-sky-600 hover:text-sky-500 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatView;