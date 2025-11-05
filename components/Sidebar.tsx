import React from 'react';
import { ViewType } from '../types';
import { HomeIcon, QuizIcon, FlashcardsIcon, ChatIcon, UserIcon, LogoutIcon, CloseIcon, ExamIcon } from './icons';

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
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, fileName, isMobileOpen, onMobileClose, currentUser, onLogout, isExamInProgress, openMainChat }) => {
  const emailConfirmed = currentUser?.email_confirmed ?? false;
  
  const learningTools = [
    { id: 'home', label: 'בית', icon: HomeIcon, disabled: false },
    { id: 'quiz', label: 'בוחן אימון', icon: QuizIcon, disabled: !emailConfirmed },
    { id: 'flashcards', label: 'כרטיסיות', icon: FlashcardsIcon, disabled: !emailConfirmed },
    { id: 'chat', label: 'המורה הפרטי שלך', icon: ChatIcon, disabled: !emailConfirmed },
  ];

  const examTool = { id: 'exam', label: 'מבחן תיווך', icon: ExamIcon, disabled: !emailConfirmed };

  return (
    <aside className={`w-64 bg-white p-6 flex flex-col border-l border-slate-200
      fixed md:relative inset-y-0 right-0 z-50
      transition-transform duration-300 ease-in-out
      ${isMobileOpen ? 'translate-x-0' : 'translate-x-full'} md:translate-x-0
    `}>
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-xl font-bold text-sky-600">RealMind</h1>
        <button onClick={onMobileClose} className="md:hidden p-1 text-slate-500 hover:text-slate-800">
            <CloseIcon className="h-6 w-6" />
        </button>
      </div>
      <p className="text-xs text-slate-600 font-medium mb-6 border-b border-slate-200 pb-4">
        הדרך שלך להצלחה
      </p>
      <nav className="flex-grow">
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
                className={`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors duration-200 ${
                  currentView === item.id
                    ? 'bg-sky-100 text-sky-600'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                } ${isExamInProgress || item.disabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                title={item.disabled ? 'אימות אימייל נדרש' : ''}
              >
                <item.icon className="h-5 w-5 ml-3" />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-6 pt-6 border-t border-slate-200">
          <p className="px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">בחינה רשמית</p>
          <ul>
            <li>
                <button
                    onClick={() => setView(examTool.id as ViewType)}
                    disabled={examTool.disabled}
                    className={`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors duration-200 shadow-sm border ${
                    currentView === examTool.id
                        ? 'bg-gradient-to-br from-sky-600 to-sky-700 text-white font-bold border-sky-500 shadow-md'
                        : 'bg-gradient-to-br from-sky-500 to-sky-600 text-white border-sky-400 hover:from-sky-600 hover:to-sky-700 hover:shadow-lg'
                    } ${examTool.disabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                    title={examTool.disabled ? 'אימות אימייל נדרש' : ''}
                >
                    <examTool.icon className={`h-5 w-5 ml-3 ${examTool.disabled ? '' : 'text-white'}`} />
                    {examTool.label}
                </button>
            </li>
          </ul>
        </div>
      </nav>
      <div className="pt-4 border-t border-slate-200">
          <div className="px-4 py-2.5 flex items-center">
              <UserIcon className="h-8 w-8 text-slate-500 bg-slate-100 rounded-full p-1.5 ml-3" />
              <div className="flex-grow">
                <p className="text-sm font-semibold text-slate-800 capitalize">
                  {currentUser?.name || currentUser?.email || 'משתמש'}
                </p>
                <p className="text-xs text-slate-500">משתמש פעיל</p>
              </div>
          </div>
          <button
            onClick={onLogout}
            disabled={isExamInProgress}
            className="w-full flex items-center mt-2 px-4 py-2.5 text-sm font-medium rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <LogoutIcon className="h-5 w-5 ml-3" />
            התנתק
          </button>
      </div>
    </aside>
  );
};

export default Sidebar;