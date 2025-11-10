import React, { useMemo, useState, useEffect } from 'react';
import { QuizResult, ViewType, AnalysisResult } from '../types';
import { SparklesIcon, QuizIcon, FlashcardsIcon, ExamIcon } from './icons';
import { resendConfirmationEmail } from '../services/authService';
import { UserStats, getUserSessions } from '../services/userStatsService';
import { supabase } from '../services/authService';

interface HomeViewProps {
  quizHistory: QuizResult[];
  examHistory: QuizResult[];
  setView: (view: ViewType) => void;
  analysis: AnalysisResult | null;
  isAnalyzing: boolean;
  createTargetedFlashcards: (weaknesses: string[]) => Promise<void>;
  createTargetedQuiz: (weaknesses: string[]) => Promise<void>;
  emailConfirmed?: boolean;
  userEmail?: string;
  userStats?: UserStats | null; // Add DB stats
  userName?: string; // User's name for personalization
}

const StatCard: React.FC<{ title: string; value: string | number; description: string }> = ({ title, value, description }) => (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <p className="text-sm text-slate-500">{title}</p>
        <p className="text-3xl font-bold text-slate-700 mt-1">{value}</p>
        <p className="text-xs text-slate-500 mt-2">{description}</p>
    </div>
);

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

interface ExamReadinessBarProps {
    quizPassFail: { passed: number; failed: number };
    totalQuizzes: number;
    averageScore: number;
}

const ExamReadinessBar: React.FC<ExamReadinessBarProps> = ({ quizPassFail, totalQuizzes, averageScore }) => {
    // Calculate readiness stage (1-4)
    // Stage 1: Beginner (0-2 quizzes or <50% pass rate)
    // Stage 2: Learning (3-5 quizzes and 50-65% pass rate)
    // Stage 3: Practicing (6-10 quizzes and 66-75% pass rate or 10+ quizzes with 50-75%)
    // Stage 4: Ready (10+ quizzes and >75% pass rate and >70% average score)
    
    const passRate = totalQuizzes > 0 ? (quizPassFail.passed / totalQuizzes) * 100 : 0;
    
    let stage = 1;
    let stageName = 'מתחיל';
    let stageDescription = 'התחל ללמוד ולענות על בוחנים';
    let progress = 0;
    
    if (totalQuizzes === 0) {
        stage = 1;
        progress = 0;
    } else if (totalQuizzes <= 2 || passRate < 50) {
        stage = 1;
        stageName = 'מתחיל';
        stageDescription = 'התחל ללמוד ולענות על בוחנים';
        progress = Math.min(25, (totalQuizzes / 2) * 25);
    } else if (totalQuizzes <= 5 && passRate >= 50 && passRate < 66) {
        stage = 2;
        stageName = 'לומד';
        stageDescription = 'אתה מתקדם! המשך לתרגל';
        progress = 25 + Math.min(25, ((totalQuizzes - 2) / 3) * 25);
    } else if ((totalQuizzes <= 10 && passRate >= 66 && passRate <= 75) || (totalQuizzes > 10 && passRate >= 50 && passRate <= 75)) {
        stage = 3;
        stageName = 'מתאמן';
        stageDescription = 'ביצועים טובים! המשך להתאמן';
        progress = 50 + Math.min(25, ((totalQuizzes - 5) / 5) * 25);
    } else if (totalQuizzes >= 10 && passRate > 75 && averageScore >= 70) {
        stage = 4;
        stageName = 'מוכן למבחן';
        stageDescription = 'אתה מוכן למבחן התיווך!';
        progress = 100;
    } else if (totalQuizzes > 5 && passRate > 75) {
        stage = 3;
        stageName = 'מתאמן';
        stageDescription = 'ביצועים טובים! המשך להתאמן';
        progress = 75;
    } else {
        stage = 2;
        stageName = 'לומד';
        stageDescription = 'אתה מתקדם! המשך לתרגל';
        progress = 50;
    }
    
    const stageColors = [
        { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', fill: 'bg-red-500' },
        { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300', fill: 'bg-yellow-500' },
        { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', fill: 'bg-blue-500' },
        { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', fill: 'bg-green-500' },
    ];
    
    const currentColor = stageColors[stage - 1];
    
    return (
        <div className="bg-white border border-slate-200 shadow-sm p-6 rounded-2xl">
            <div className="mb-4">
                <h3 className="text-lg font-semibold text-slate-800 mb-1">רמת מוכנות למבחן</h3>
                <p className={`text-sm font-medium ${currentColor.text}`}>{stageName}</p>
                <p className="text-xs text-slate-600 mt-1">{stageDescription}</p>
            </div>
            
            {/* Progress Bar */}
            <div className="relative">
                <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div 
                        className={`h-full ${currentColor.fill} transition-all duration-500 ease-out`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
                
                {/* Stage Markers */}
                <div className="flex justify-between mt-2">
                    {[1, 2, 3, 4].map((s) => (
                        <div key={s} className="flex flex-col items-center flex-1">
                            <div 
                                className={`w-3 h-3 rounded-full border-2 transition-all duration-300 ${
                                    s <= stage 
                                        ? `${stageColors[s - 1].fill} ${stageColors[s - 1].border}` 
                                        : 'bg-slate-200 border-slate-300'
                                }`}
                            />
                            <span className={`text-xs mt-1 ${s <= stage ? 'text-slate-700 font-semibold' : 'text-slate-400'}`}>
                                {s === 1 ? 'מתחיל' : s === 2 ? 'לומד' : s === 3 ? 'מתאמן' : 'מוכן'}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
            
            {/* Quiz Pass/Fail Statistics - Merged */}
            <div className="mt-6 pt-4 border-t border-slate-200">
                <h4 className="text-sm font-semibold text-slate-700 mb-3 text-center">סטטיסטיקת בוחנים</h4>
                <div className="flex items-center justify-center gap-8">
                    <div className="text-center">
                        <div className="text-4xl font-bold text-green-600">{quizPassFail.passed}</div>
                        <div className="text-sm text-slate-600 mt-1">בוחנים שעברו</div>
                    </div>
                    <div className="h-16 w-px bg-slate-200"></div>
                    <div className="text-center">
                        <div className="text-4xl font-bold text-red-600">{quizPassFail.failed}</div>
                        <div className="text-sm text-slate-600 mt-1">בוחנים שנכשלו</div>
                    </div>
                </div>
            </div>
            
            {/* Stats Summary */}
            <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between text-xs text-slate-600">
                <span>בוחנים: {totalQuizzes}</span>
                <span>אחוז הצלחה: {passRate.toFixed(0)}%</span>
                <span>ציון ממוצע: {averageScore.toFixed(0)}%</span>
            </div>
        </div>
    );
};

const ActionCard: React.FC<{ title: string; description: string; icon: React.ReactElement<{ className?: string }>; onClick: () => void; disabled?: boolean; prominent?: boolean }> = ({ title, description, icon, onClick, disabled = false, prominent = false }) => (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`${prominent ? 'bg-gradient-to-br from-sky-500 to-sky-600 text-white border-sky-400' : 'bg-white text-slate-800 border-slate-200'} p-3 md:p-6 rounded-2xl border shadow-sm text-right transition-all duration-300 flex flex-col items-start h-full w-full focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 ${
        disabled 
          ? 'opacity-50 cursor-not-allowed grayscale' 
          : prominent 
            ? 'hover:from-sky-600 hover:to-sky-700 hover:shadow-lg' 
            : 'hover:border-sky-400 hover:shadow-md'
      }`}
    >
        <div className={`p-2 md:p-3 rounded-full mb-2 md:mb-4 ${disabled ? 'bg-slate-100' : prominent ? 'bg-white/20' : 'bg-slate-700'}`}>
            {React.cloneElement(icon, { className: `h-4 w-4 md:h-6 md:w-6 ${disabled ? 'text-slate-400' : prominent ? 'text-white' : 'text-white'}` })}
        </div>
        <h3 className={`text-base md:text-lg font-bold mb-1 md:mb-2 ${disabled ? 'text-slate-400' : prominent ? 'text-white' : 'text-slate-800'}`}>{title}</h3>
        <p className={`text-xs md:text-sm flex-grow ${disabled ? 'text-slate-400' : prominent ? 'text-white/90' : 'text-slate-600'}`}>{description}</p>
        <span className={`text-xs md:text-sm font-semibold mt-2 md:mt-4 self-end ${disabled ? 'text-slate-400' : prominent ? 'text-white' : 'text-sky-600'}`}>
          {disabled ? 'אימות נדרש' : 'בצע פעולה ←'}
        </span>
    </button>
);


const HomeView: React.FC<HomeViewProps> = ({ quizHistory, examHistory, setView, analysis, isAnalyzing, createTargetedFlashcards, createTargetedQuiz, emailConfirmed = true, userEmail, userStats, userName }) => {
  const allHistory = useMemo(() => [...quizHistory, ...examHistory], [quizHistory, examHistory]);
  const [isGeneratingTargeted, setIsGeneratingTargeted] = useState<'flashcards' | 'quiz' | null>(null);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [quizPassFail, setQuizPassFail] = useState<{ passed: number; failed: number }>({ passed: 0, failed: 0 });
  
  // Fetch quiz sessions to calculate pass/fail counts
  useEffect(() => {
    const fetchQuizSessions = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setQuizPassFail({ passed: 0, failed: 0 });
          return;
        }
        
        const { sessions, error } = await getUserSessions(user.id, 1000); // Get all sessions
        if (error) {
          console.error('Error fetching quiz sessions:', error);
          setQuizPassFail({ passed: 0, failed: 0 });
          return;
        }
        
        // Filter only quiz sessions (not exams)
        const quizSessions = sessions.filter(s => s.session_type === 'quiz');
        
        // Calculate passed (>= 60%) and failed (< 60%)
        // Ensure percentage is a number (handle string/number conversion)
        const passed = quizSessions.filter(s => {
          const percentage = typeof s.percentage === 'number' ? s.percentage : parseFloat(s.percentage as any) || 0;
          return percentage >= 60;
        }).length;
        const failed = quizSessions.filter(s => {
          const percentage = typeof s.percentage === 'number' ? s.percentage : parseFloat(s.percentage as any) || 0;
          return percentage < 60;
        }).length;
        
        setQuizPassFail({ passed, failed });
      } catch (error) {
        console.error('Error in fetchQuizSessions:', error);
        setQuizPassFail({ passed: 0, failed: 0 });
      }
    };
    
    fetchQuizSessions();
  }, [quizHistory, examHistory]); // Re-fetch when history changes
  
  // Use DB stats if available, otherwise calculate from history
  // Force recalculation when userStats changes by using JSON.stringify for deep comparison
  const stats = useMemo(() => {
    if (userStats) {
      // Use stats from database (source of truth)
      const total = userStats.total_questions_answered || 0;
      const correct = userStats.total_correct_answers || 0;
      const percentage = Math.round(userStats.average_score || 0);
      
      return { total, correct, percentage };
    } else {
      // Fallback to calculating from history if no DB stats
      const total = allHistory?.length || 0;
      // Handle both boolean and string formats for isCorrect
      const correct = allHistory?.filter(r => {
        const isCorrect = r?.isCorrect;
        // Check for boolean true, string "true", or 1
        return isCorrect === true || isCorrect === 'true' || isCorrect === 1 || isCorrect === '1';
      }).length || 0;
      const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
      
      return { total, correct, percentage };
    }
  }, [allHistory, userStats, JSON.stringify(userStats)]); // Add JSON.stringify to force recalculation

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
  
  // Calculate exam readiness data
  const totalQuizzes = quizPassFail.passed + quizPassFail.failed;
  const averageScore = stats.percentage;

  return (
    <div className="flex-grow p-4 md:p-8 overflow-y-auto flex flex-col">
        {!emailConfirmed && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-2xl shadow-sm order-1 animate-slide-up" style={{ animationDelay: '0s', animationFillMode: 'both' }}>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-grow">
                <h3 className="text-lg font-semibold text-yellow-800 mb-1">אימות אימייל נדרש</h3>
                <p className="text-sm text-yellow-700 mb-2">
                  אנא בדוק את תיבת הדואר הנכנס שלך וצור קשר עם האימייל ששלחנו כדי לאמת את החשבון שלך. לאחר האימות תוכל להשתמש בכל הפיצ'רים.
                </p>
                {resendMessage && (
                  <p className={`text-xs mb-2 ${resendMessage.includes('נשלח') ? 'text-green-700' : 'text-red-700'}`}>
                    {resendMessage}
                  </p>
                )}
                {userEmail && (
                  <button
                    onClick={async () => {
                      setIsResendingEmail(true);
                      setResendMessage(null);
                      const { error } = await resendConfirmationEmail(userEmail);
                      if (error) {
                        setResendMessage('שגיאה בשליחת אימייל אישור. נסה שוב מאוחר יותר.');
                      } else {
                        setResendMessage('אימייל אישור נשלח בהצלחה! אנא בדוק את תיבת הדואר שלך.');
                      }
                      setIsResendingEmail(false);
                    }}
                    disabled={isResendingEmail}
                    className="text-xs text-yellow-700 underline hover:no-underline disabled:opacity-50 mt-1"
                  >
                    {isResendingEmail ? 'שולח...' : 'שלח אימייל אישור שוב'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Quick Actions - Show at top on mobile (order-2), bottom on desktop (md:order-5) */}
        <div className="mb-6 md:mb-10 mt-4 md:mt-12 order-2 md:order-5 animate-fade-in" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
            <h2 className="text-lg md:text-2xl font-bold mb-2 md:mb-4 text-slate-800">פעולות מהירות</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
                <div className="animate-scale-in" style={{ animationDelay: '0.5s', animationFillMode: 'both' }}>
                    <ActionCard 
                        title="בוחן אימון" 
                        description="תרגל עם שאלות מבוססות AI ללא הגבלה וללא לחץ זמן." 
                        icon={<QuizIcon />}
                        onClick={() => setView('quiz')} 
                        disabled={!emailConfirmed}
                    />
                </div>
                <div className="animate-scale-in" style={{ animationDelay: '0.6s', animationFillMode: 'both' }}>
                    <ActionCard 
                        title="מבחן תיווך" 
                        description="בדוק את מוכנותך עם סימולציית מבחן מלאה בתנאים אמיתיים." 
                        icon={<ExamIcon />}
                        onClick={() => setView('exam')} 
                        disabled={!emailConfirmed}
                    />
                </div>
                <div className="animate-scale-in" style={{ animationDelay: '0.7s', animationFillMode: 'both' }}>
                    <ActionCard 
                        title="כרטיסיות לימוד" 
                        description="שנן מושגי מפתח וחוקים עם כרטיסיות חכמות." 
                        icon={<FlashcardsIcon />}
                        onClick={() => setView('flashcards')} 
                        disabled={!emailConfirmed}
                    />
                </div>
            </div>
        </div>
        
        {/* Exam Readiness Bar - Now above AI analysis */}
        <div className="mb-6 order-3 md:order-1 animate-fade-in" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
            <ExamReadinessBar 
                quizPassFail={quizPassFail}
                totalQuizzes={totalQuizzes}
                averageScore={averageScore}
            />
        </div>
        
        {/* AI Analysis - Now below exam readiness */}
        <div className="mb-8 order-4 md:order-2 animate-fade-in" style={{ animationDelay: '0.15s', animationFillMode: 'both' }}>
            <h2 className="text-xl md:text-2xl font-bold mb-4 flex items-center text-slate-900"><SparklesIcon className="h-5 w-5 md:h-6 md:w-6 text-slate-700 ml-2" /> ניתוח AI</h2>
            {allHistory.length === 0 ? (
                <div className="bg-white border border-slate-200 p-8 rounded-2xl text-center">
                    <SparklesIcon className="mx-auto h-12 w-12 text-slate-700 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-800">ניתוח הביצועים שלך יופיע כאן</h3>
                    <p className="text-slate-500 mt-2 max-w-md mx-auto">השלם בוחן אימון או מבחן כדי לקבל תובנות מבוססות AI על נקודות החוזק והחולשה שלך והמלצות מותאמות אישית.</p>
                </div>
            ) : (
                <>
                    {isAnalyzing && (
                        <div className="bg-white border border-slate-200 p-6 rounded-2xl text-center">
                            <div className="w-8 h-8 border-4 border-dashed rounded-full animate-spin border-sky-500 mx-auto"></div>
                            <p className="mt-4 text-slate-500">מנתח את התקדמותך...</p>
                        </div>
                    )}
                    {analysis && !isAnalyzing && (
                         <>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                                <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                                    <h3 className="text-lg font-semibold text-green-600 mb-3">נושאים חזקים</h3>
                                    <ul className="space-y-2 list-disc list-inside text-slate-600">
                                        {analysis.strengths.map((item, index) => <li key={index}>{item}</li>)}
                                    </ul>
                                </div>
                                <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                                    <h3 className="text-lg font-semibold text-amber-600 mb-3">נושאים לשיפור</h3>
                                    <ul className="space-y-2 list-disc list-inside text-slate-600">
                                        {analysis.weaknesses.map((item, index) => <li key={index}>{item}</li>)}
                                    </ul>
                                </div>
                            </div>
                            {analysis.weaknesses && analysis.weaknesses.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col sm:flex-row gap-3 animate-fade-in">
                                    <button onClick={handleCreateTargetedFlashcards} disabled={isGeneratingTargeted !== null} className="flex-1 flex items-center justify-center px-6 py-3 bg-gradient-to-br from-amber-500 to-amber-600 text-white text-sm font-semibold rounded-2xl hover:from-amber-600 hover:to-amber-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-wait disabled:hover:shadow-md">
                                        {isGeneratingTargeted === 'flashcards' ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><FlashcardsIcon className="h-5 w-5 ml-2 text-white" /> צור כרטיסיות ממוקדות</>}
                                    </button>
                                    <button onClick={handleCreateTargetedQuiz} disabled={isGeneratingTargeted !== null} className="flex-1 flex items-center justify-center px-6 py-3 bg-gradient-to-br from-purple-500 to-purple-600 text-white text-sm font-semibold rounded-2xl hover:from-purple-600 hover:to-purple-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-wait disabled:hover:shadow-md">
                                        {isGeneratingTargeted === 'quiz' ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><QuizIcon className="h-5 w-5 ml-2 text-white" /> צור בוחן חיזוק</>}
                                    </button>
                                </div>
                            )}
                            <div className="mt-6 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm animate-fade-in">
                                <h3 className="text-lg font-semibold text-slate-700 mb-3">המלצות להמשך</h3>
                                <p className="text-slate-600 whitespace-pre-wrap">{analysis.recommendations}</p>
                            </div>
                         </>
                    )}
                </>
            )}
        </div>
        
        {/* Stat cards - Now below AI analysis */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 order-5 md:order-3 animate-fade-in" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
            <StatCard title="שאלות שנענו" value={stats.total} description="סך כל השאלות שענית עליהן." />
            <StatCard title="תשובות נכונות" value={stats.correct} description="מספר התשובות הנכונות שלך." />
            <StatCard title="תשובות שגויות" value={stats.total - stats.correct} description="מספר התשובות השגויות שלך." />
        </div>
    </div>
  );
};

export default HomeView;