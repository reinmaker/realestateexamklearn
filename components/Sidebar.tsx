import React from 'react';
import { ViewType } from '../types';
import { HomeIcon, QuizIcon, FlashcardsIcon, ChatIcon, UserIcon, LogoutIcon, CloseIcon, ExamIcon, SupportIcon, AdminIcon, AIIcon } from './icons';
import ExamCountdown from './ExamCountdown';

interface SidebarProps {
  currentView: ViewType;
  setView: (view: ViewType) => void;
  fileName: string;
  isMobileOpen: boolean;
  onMobileClose: () => void;
  currentUser: { id: string; email?: string; name?: string; email_confirmed?: boolean } | null;
  onLogout: () => void;
  isExamInProgress: boolean;
  openMainChat: () => void;
  isAdmin: boolean;
  hasValidPayment: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, fileName, isMobileOpen, onMobileClose, currentUser, onLogout, isExamInProgress, openMainChat, isAdmin, hasValidPayment }) => {
  const emailConfirmed = currentUser?.email_confirmed ?? false;
  
  // Payment is required for quiz, flashcards, exam, and chat (not for home or support)
  const learningTools = [
    { id: 'home', label: 'בית', icon: HomeIcon, disabled: false },
    { id: 'quiz', label: 'בוחן אימון', icon: QuizIcon, disabled: !emailConfirmed || !hasValidPayment },
    { id: 'reinforcement-quiz', label: 'בוחן חיזוק', icon: AIIcon, disabled: !emailConfirmed || !hasValidPayment },
    { id: 'flashcards', label: 'כרטיסיות', icon: FlashcardsIcon, disabled: !emailConfirmed || !hasValidPayment },
    { id: 'chat', label: 'המורה הפרטי שלך', icon: ChatIcon, disabled: !emailConfirmed || !hasValidPayment },
  ];

  const examTool = { id: 'exam', label: 'מבחן תיווך', icon: ExamIcon, disabled: !emailConfirmed || !hasValidPayment };

  return (
    <aside className={`w-64 bg-slate-700 border-l border-slate-600 p-6 flex flex-col h-screen overflow-y-auto
      fixed md:relative inset-y-0 right-0 z-50
      transition-transform duration-300 ease-in-out
      ${isMobileOpen ? 'translate-x-0' : 'translate-x-full'} md:translate-x-0
    `}>
      <div className="relative mb-2 pb-2">
        <div className="flex flex-col items-center justify-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 512 512" className="flex-shrink-0">
            <defs>
              <style>
                {`.logo-stroke { stroke: white; fill: none; stroke-width: 22; stroke-linecap: round; stroke-linejoin: round; }
                  .logo-fill { fill: white; }`}
              </style>
            </defs>
            {/* Graduation cap outline */}
            <polygon className="logo-stroke" points="256,86 88,154 256,222 424,154 256,86"/>
            <polyline className="logo-stroke" points="228,200 228,244 256,256 284,244 284,200"/>
            {/* Tassel */}
            <line className="logo-stroke" x1="356" y1="161" x2="356" y2="233"/>
            <circle className="logo-fill" cx="356" cy="256" r="14"/>
            {/* House outline */}
            <polyline className="logo-stroke" points="96,308 256,196 416,308"/>
            <rect className="logo-stroke" x="120" y="308" width="272" height="148" rx="12" ry="12"/>
            {/* Windows */}
            <rect className="logo-stroke" x="212" y="354" width="40" height="40" rx="3" ry="3"/>
            <rect className="logo-stroke" x="260" y="354" width="40" height="40" rx="3" ry="3"/>
            <rect className="logo-stroke" x="212" y="402" width="40" height="40" rx="3" ry="3"/>
            <rect className="logo-stroke" x="260" y="402" width="40" height="40" rx="3" ry="3"/>
          </svg>
          <h1 className="text-xl font-bold text-white">RealMind</h1>
        </div>
        <button onClick={onMobileClose} className="absolute top-0 left-0 md:hidden p-1 text-slate-300 hover:text-white">
            <CloseIcon className="h-6 w-6" />
        </button>
      </div>
      <ExamCountdown />
      <nav className="flex-grow mt-6">
        <p className="px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">כלי לימוד</p>
        <ul className="space-y-2">
          {learningTools.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => {
                    if (item.id === 'chat') {
                        openMainChat();
                    } else {
                        setView(item.id as ViewType);
                    }
                }}
                disabled={isExamInProgress || item.disabled}
                className={`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-colors duration-200 ${
                  currentView === item.id
                    ? 'border-2 border-sky-500 text-sky-500'
                    : 'text-slate-300 hover:bg-slate-600 hover:text-white'
                } ${isExamInProgress || item.disabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                title={item.disabled ? (!emailConfirmed ? 'אימות אימייל נדרש' : !hasValidPayment ? 'תשלום נדרש' : '') : ''}
              >
                <item.icon className={`h-5 w-5 ml-3 ${currentView === item.id ? 'text-sky-500' : ''}`} />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-6 pt-6 border-t border-slate-600">
          <p className="px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">בחינה רשמית</p>
          <ul>
            <li>
                <button
                    onClick={() => setView(examTool.id as ViewType)}
                    disabled={examTool.disabled}
                    className={`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                    currentView === examTool.id
                        ? 'bg-gradient-to-r from-purple-500 to-purple-700 text-white font-bold border-2 border-purple-400 shadow-lg shadow-purple-500/50'
                        : 'text-slate-300 hover:bg-slate-600 hover:text-white border-2 border-purple-500'
                    } ${examTool.disabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                    title={examTool.disabled ? (!emailConfirmed ? 'אימות אימייל נדרש' : !hasValidPayment ? 'תשלום נדרש' : '') : ''}
                >
                    <examTool.icon className={`h-5 w-5 ml-3 ${currentView === examTool.id ? 'text-white' : ''}`} />
                    {examTool.label}
                </button>
            </li>
          </ul>
        </div>
        {isAdmin && (
          <div className="mt-6 pt-6 border-t border-slate-600">
            <p className="px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">ניהול</p>
            <ul>
              <li>
                <button
                  onClick={() => setView('admin')}
                  disabled={isExamInProgress}
                  className={`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-colors duration-200 ${
                    currentView === 'admin'
                      ? 'border-2 border-sky-500 text-sky-500'
                      : 'text-slate-300 hover:bg-slate-600 hover:text-white'
                  } ${isExamInProgress ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                >
                  <AdminIcon className={`h-5 w-5 ml-3 ${currentView === 'admin' ? 'text-sky-500' : ''}`} />
                  ניהול משתמשים
                </button>
              </li>
            </ul>
          </div>
        )}
      </nav>
      <div className="pt-4 border-t border-slate-600">
          <div className="px-4 py-2.5 flex items-center">
            <UserIcon className="h-8 w-8 text-slate-300 bg-slate-600 rounded-full p-1.5 ml-3" />
            <div className="flex-grow">
              <p className="text-sm font-semibold text-white capitalize">
                {currentUser?.name || currentUser?.email || 'משתמש'}
              </p>
              <p className="text-xs text-slate-400">משתמש פעיל</p>
            </div>
          </div>
          <button
            onClick={() => setView('support')}
            disabled={isExamInProgress}
            className="w-full flex items-center mt-2 px-4 py-2.5 text-sm font-medium rounded-xl text-slate-300 hover:bg-slate-600 hover:text-white transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SupportIcon className="h-5 w-5 ml-3" />
            תמיכה
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onLogout();
            }}
            disabled={isExamInProgress}
            className="w-full flex items-center mt-2 px-4 py-2.5 text-sm font-medium rounded-xl text-slate-300 hover:bg-slate-600 hover:text-white transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <LogoutIcon className="h-5 w-5 ml-3" />
            התנתק
          </button>
      </div>
    </aside>
  );
};

export default Sidebar;