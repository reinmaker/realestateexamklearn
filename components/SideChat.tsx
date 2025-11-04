import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chat } from '@google/genai';
import { ChatMessage, ChatSession } from '../types';
import { createExplanationChatSession, continueChat } from '../services/aiService';
import { CloseIcon, SparklesIcon, AIAvatarIcon, UserIcon } from './icons';

interface ChatWidgetProps {
  userName?: string;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  context: string;
  onContextClose: () => void;
  documentContent: string;
  setAppError: (error: string | null) => void;
  chatSession: ChatSession | null;
  setChatSession: React.Dispatch<React.SetStateAction<ChatSession | null>>;
}

const ChatWidget: React.FC<ChatWidgetProps> = ({ isOpen, setIsOpen, context, onContextClose, documentContent, setAppError, chatSession, setChatSession, userName }) => {
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(chatSession);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isContextual, setIsContextual] = useState(false);
  const [headerTitle, setHeaderTitle] = useState('המורה הפרטי שלך');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  
  useEffect(() => {
    if (!isContextual) {
      setCurrentSession(chatSession);
    }
  }, [chatSession, isContextual]);

  useEffect(() => {
    const initializeExplanationChat = async () => {
        if (!context) return;
        
        setAppError(null);
        setCurrentSession(null);
        setIsLoading(true);
        setIsContextual(true);
        setHeaderTitle('הסבר נוסף');

        try {
            const newChat = await createExplanationChatSession(documentContent, context, userName);
            // Handle both OpenAI and Gemini chat sessions
            const initialResponse = newChat.type === 'openai' 
              ? await continueChat(newChat, "אנא הסבר את הנושא לעומק.", [])
              : await newChat.sendMessage({ message: "אנא הסבר את הנושא לעומק." });
            const newSession: ChatSession = {
                chat: newChat,
                history: [{ role: 'model', text: typeof initialResponse === 'string' ? initialResponse : initialResponse.text }],
            };
            setCurrentSession(newSession);
        } catch (error) {
            if (error instanceof Error) setAppError(error.message);
            else setAppError("נכשל באתחול סשן צ'אט ההסבר.");
            handleClose();
        } finally {
            setIsLoading(false);
        }
    };
    
    initializeExplanationChat();
  }, [context, documentContent, setAppError]);

  useEffect(() => {
    scrollToBottom();
  }, [currentSession?.history]);
  
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || !currentSession || isLoading) return;

    const newUserMessage: ChatMessage = { role: 'user', text: userInput };
    
    const sessionWithUserMessage = { ...currentSession, history: [...currentSession.history, newUserMessage] };
    
    setCurrentSession(sessionWithUserMessage);
    if (!isContextual) {
        setChatSession(sessionWithUserMessage);
    }

    const messageToSend = userInput;
    setUserInput('');
    setIsLoading(true);
    setAppError(null);

    try {
      const modelResponse = await continueChat(currentSession.chat, messageToSend, currentSession.history);
      const modelMessage: ChatMessage = { role: 'model', text: modelResponse };
      
      const updateWithModelResponse = (prev: ChatSession | null) => prev ? { ...prev, history: [...prev.history, modelMessage] } : null;

      setCurrentSession(updateWithModelResponse);
      if (!isContextual) {
        setChatSession(updateWithModelResponse);
      }
    } catch (error) {
        if (error instanceof Error) setAppError(error.message);
        else setAppError("אירעה שגיאה במהלך הצ'אט.");

        const revertUserMessage = (prev: ChatSession | null) => prev ? { ...prev, history: prev.history.slice(0, -1) } : null;

        setCurrentSession(revertUserMessage);
        if (!isContextual) {
          setChatSession(revertUserMessage);
        }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    if (isContextual) {
        setCurrentSession(chatSession);
        setIsContextual(false);
        setHeaderTitle('המורה הפרטי שלך');
        onContextClose();
    }
  }

  return (
    <>
        <div className={`fixed bottom-20 left-4 z-50 w-96 max-w-[calc(100vw-2rem)] h-[500px] bg-slate-100/95 backdrop-blur-md shadow-2xl rounded-xl flex flex-col transform transition-all duration-300 origin-bottom-left ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200 flex-shrink-0">
                <div className="flex items-center">
                    {isContextual ? <SparklesIcon className="h-6 w-6 text-sky-600 ml-3" /> : <AIAvatarIcon className="h-8 w-8 ml-2"/> }
                    <h2 className="text-lg font-semibold text-sky-600">{headerTitle}</h2>
                </div>
                <button onClick={handleClose} className="p-2 rounded-full hover:bg-slate-200">
                    <CloseIcon className="h-6 w-6" />
                </button>
            </div>
            <div className="flex-grow flex flex-col overflow-hidden">
                <div className="flex-grow p-4 space-y-4 overflow-y-auto">
                    {currentSession?.history.map((message, index) => (
                        <div key={index} className={`flex items-end gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {message.role === 'model' && (
                                <AIAvatarIcon className="h-8 w-8 flex-shrink-0" />
                            )}
                            <div className={`max-w-md lg:max-w-lg rounded-lg px-4 py-2 ${message.role === 'user' ? 'bg-sky-600 text-white' : 'bg-white text-slate-800'}`}>
                                <p className="whitespace-pre-wrap">{message.text}</p>
                            </div>
                            {message.role === 'user' && (
                                <UserIcon className="h-8 w-8 text-slate-500 bg-slate-200 rounded-full p-1.5 flex-shrink-0" />
                            )}
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex items-end gap-2 justify-start">
                            <AIAvatarIcon className="h-8 w-8 flex-shrink-0" />
                            <div className="max-w-md lg:max-w-lg rounded-lg px-4 py-2 bg-white text-slate-800">
                                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></div>
                                </div>
                            </div>
                        </div>
                    )}
                    {!currentSession && isLoading && (
                         <div className="flex-grow flex items-center justify-center p-8">
                            <div className="text-center">
                                <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-sky-500 mx-auto"></div>
                                <h2 className="text-xl font-semibold mt-4 text-slate-800">מכין לך הסבר...</h2>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 flex-shrink-0">
                    <div className="flex items-center bg-white rounded-lg">
                        <input
                            type="text"
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            placeholder="שאל שאלה..."
                            className="w-full bg-white px-4 py-3 text-slate-900 focus:outline-none rounded-lg"
                            disabled={isLoading || !currentSession}
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !userInput.trim() || !currentSession}
                            className="px-4 py-3 text-sky-600 hover:text-sky-500 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                            aria-label="שלח שאלה"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                            </svg>
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <button 
            onClick={() => setIsOpen(!isOpen)}
            className="fixed bottom-4 left-4 z-40 w-16 h-16 bg-sky-600 text-white rounded-full shadow-lg flex items-center justify-center transform transition-all duration-300 hover:bg-sky-700 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500"
            aria-label={isOpen ? "סגור צ'אט" : "פתח צ'אט עם המורה"}
        >
            {isOpen ? <CloseIcon className="w-8 h-8" /> : <AIAvatarIcon className="h-14 w-14" />}
        </button>
    </>
  );
};

export default ChatWidget;