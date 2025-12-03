import React, { useState, useEffect } from 'react';
import { createCheckoutSession } from '../services/stripeService';
import { getCurrentExamPeriod } from '../services/paymentService';
import { CloseIcon, CheckIcon } from './icons';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userEmail: string;
  onPaymentSuccess: () => void;
}

const PaymentForm: React.FC<{
  userId: string;
  userEmail: string;
  onPaymentSuccess: () => void;
  onClose: () => void;
}> = ({ userId, userEmail, onPaymentSuccess, onClose }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentExam, setCurrentExam] = useState<{ name: string; date: Date } | null>(null);

  useEffect(() => {
    const exam = getCurrentExamPeriod();
    setCurrentExam(exam);
  }, []);

  const handlePay = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // Get current exam period
      const exam = getCurrentExamPeriod();
      if (!exam) {
        throw new Error('לא נמצא מועד בחינה פעיל');
      }

      // Create checkout session
      const { checkoutUrl, error: sessionError } = await createCheckoutSession(
        16900, // 169 NIS in agorot
        'ils',
        userId,
        userEmail,
        exam.name
      );

      if (sessionError || !checkoutUrl) {
        throw sessionError || new Error('נכשל ביצירת סשן תשלום');
      }

      // Redirect to Stripe Checkout
      window.location.href = checkoutUrl;
    } catch (err) {
      setIsProcessing(false);
      setError(err instanceof Error ? err.message : 'שגיאה לא ידועה');
    }
  };

  const features = [
    'גישה מלאה לכל הסימולטורים',
    'אימון מותאם אישית עם AI',
    'הסברים מפורטים לכל שאלה',
    'מעקב אחר התקדמות',
    'חומרי לימוד מקיפים',
    'תמיכה טכנית',
    'עדכונים שוטפים',
    currentExam ? `גישה בלתי מוגבלת עד ${currentExam.name}` : 'גישה בלתי מוגבלת עד המועד הקרוב'
  ];

  return (
    <div className="space-y-6">
      {/* Pricing Card */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        {/* Blue Header */}
        <div className="bg-sky-600 px-6 py-4">
          <h2 className="text-white text-xl font-bold text-center">תשלום גישה לפלטפורמה</h2>
        </div>

        {/* Price Section */}
        <div className="px-6 pt-8 pb-4 text-center">
          <div className="text-5xl font-bold text-slate-900 mb-2">₪169</div>
          <div className="text-sm text-slate-600">תשלום חד פעמי</div>
        </div>

        {/* Features List */}
        <div className="px-6 pb-6 space-y-3">
          {features.map((feature, index) => (
            <div key={index} className="flex items-start gap-3">
              <CheckIcon className="h-5 w-5 text-sky-600 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-slate-700">{feature}</span>
            </div>
          ))}
        </div>

        {/* Purchase Button */}
        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={handlePay}
            disabled={isProcessing}
            className="w-full px-6 py-4 bg-sky-600 text-white font-semibold rounded-xl hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <span>{isProcessing ? 'מעבד...' : 'לרכישה'}</span>
            {!isProcessing && (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onClose}
          disabled={isProcessing}
          className="px-6 py-2 text-slate-600 hover:text-slate-800 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ביטול
        </button>
      </div>
    </div>
  );
};

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, userId, userEmail, onPaymentSuccess }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-end">
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="סגור"
          >
            <CloseIcon className="h-5 w-5 text-slate-600" />
          </button>
        </div>

        <div className="p-6">
          <PaymentForm
            userId={userId}
            userEmail={userEmail}
            onPaymentSuccess={onPaymentSuccess}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;

