import React, { useState } from 'react';
import { GoogleIcon } from './icons';
import { signInWithEmail, signUpWithEmail, signInWithGoogle, resendConfirmationEmail } from '../services/authService';

interface LoginViewProps {
    onLogin: (user: { id: string; email?: string; name?: string }) => void;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        setIsLoading(true);

        try {
            if (isSignUp) {
                const { user, error: signUpError } = await signUpWithEmail(email, password, name);
                if (signUpError) {
                    setError(signUpError.message || 'שגיאה בהרשמה');
                } else {
                    // Signup successful - user needs to confirm email before logging in
                    setSuccessMessage('הרשמה הצליחה! אימייל אישור נשלח לכתובת שלך. אנא בדוק את תיבת הדואר שלך ואישור את האימייל לפני ההתחברות.');
                    // Clear form
                    setEmail('');
                    setPassword('');
                    setName('');
                    // Switch to sign in mode
                    setIsSignUp(false);
                }
            } else {
                const { user, error: signInError } = await signInWithEmail(email, password);
                if (signInError) {
                    // Check if it's an email confirmation error
                    const errorCode = (signInError as any).code;
                    if (errorCode === 'email_not_confirmed' || 
                        (signInError.message && (signInError.message.toLowerCase().includes('email') && 
                         (signInError.message.toLowerCase().includes('confirm') || 
                          signInError.message.toLowerCase().includes('verify') || 
                          signInError.message.toLowerCase().includes('not confirmed'))))) {
                        // Email not confirmed - show message with option to resend
                        setError('האימייל שלך לא אושר. אנא בדוק את תיבת הדואר שלך או לחץ על "שלח שוב" כדי לקבל אימייל אישור חדש.');
                        // Store email for resend functionality
                        setEmail(email);
                    } else {
                        // Error message is already in Hebrew from authService
                        setError(signInError.message || 'שגיאה בהתחברות');
                    }
                } else if (user) {
                    // Successful login - email is confirmed
                    onLogin(user);
                }
            }
        } catch (err) {
            setError('שגיאה לא צפויה');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setError(null);
        setIsLoading(true);
        const { error: googleError } = await signInWithGoogle();
        if (googleError) {
            setError(googleError.message || 'שגיאה בהתחברות עם גוגל');
            setIsLoading(false);
        }
        // Google OAuth redirects, so we don't need to handle success here
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-100">
            <div className="w-full max-w-md p-8 space-y-6 bg-slate-700 rounded-2xl shadow-lg">
                <div className="text-center mb-6">
                    <div className="flex flex-col items-center justify-center gap-2 mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 512 512" className="flex-shrink-0">
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
                        <h1 className="text-2xl font-bold text-white">RealMind</h1>
                    </div>
                    <h2 className="text-2xl font-bold text-white">ברוך הבא</h2>
                    <p className="mt-2 text-slate-300">
                        {isSignUp ? 'הירשם כדי להתחיל ללמוד' : 'התחבר כדי להתחיל ללמוד'}
                    </p>
                </div>

                {error && (
                    <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl">
                        <div className="flex items-start gap-2">
                            <span className="flex-grow">{error}</span>
                            {error.includes('אימייל') && error.includes('לא אושר') && email && (
                                <button
                                    onClick={async () => {
                                        setIsLoading(true);
                                        setError(null);
                                        const { error: resendError } = await resendConfirmationEmail(email);
                                        if (resendError) {
                                            setError('שגיאה בשליחת אימייל אישור. נסה שוב מאוחר יותר.');
                                        } else {
                                            setSuccessMessage('אימייל אישור נשלח! אנא בדוק את תיבת הדואר שלך.');
                                        }
                                        setIsLoading(false);
                                    }}
                                    disabled={isLoading}
                                    className="text-xs underline hover:no-underline disabled:opacity-50 whitespace-nowrap"
                                >
                                    שלח שוב
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {successMessage && (
                    <div className="p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl">
                        {successMessage}
                    </div>
                )}

                <form onSubmit={handleEmailLogin} className="space-y-4">
                    {isSignUp && (
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1">
                                שם מלא
                            </label>
                            <input
                                id="name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-600 border border-slate-500 text-white rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 placeholder:text-slate-400"
                                placeholder="הכנס שם מלא"
                            />
                        </div>
                    )}

                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
                            אימייל
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full px-3 py-2 bg-slate-600 border border-slate-500 text-white rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 placeholder:text-slate-400"
                            placeholder="הכנס אימייל"
                        />
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
                            סיסמה
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                            className="w-full px-3 py-2 bg-slate-600 border border-slate-500 text-white rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 placeholder:text-slate-400"
                            placeholder="הכנס סיסמה (מינימום 6 תווים)"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex items-center justify-center px-4 py-3 border border-transparent rounded-xl shadow-sm text-base font-medium text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            isSignUp ? 'הירשם' : 'התחבר'
                        )}
                    </button>
                </form>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-600"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-slate-700 text-slate-400">או</span>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center px-4 py-3 border border-slate-600 rounded-xl shadow-sm text-base font-medium text-white bg-slate-600 hover:bg-slate-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {isLoading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <>
                            <GoogleIcon className="w-5 h-5 ml-3" />
                            התחבר עם גוגל
                        </>
                    )}
                </button>

                <div className="text-center">
                    <button
                        type="button"
                        onClick={() => {
                            setIsSignUp(!isSignUp);
                            setError(null);
                            setSuccessMessage(null);
                        }}
                        className="text-sm text-sky-400 hover:text-sky-300"
                    >
                        {isSignUp ? 'כבר יש לך חשבון? התחבר' : 'אין לך חשבון? הירשם'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LoginView;
