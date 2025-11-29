import React, { useState, useEffect } from 'react';
import { createCheckoutSession } from '../services/stripeService';
import { getCurrentExamPeriod } from '../services/paymentService';
import { CloseIcon } from './icons';

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

  const handlePay = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // Get current exam period
      const currentExam = getCurrentExamPeriod();
      if (!currentExam) {
        throw new Error('לא נמצא מועד בחינה פעיל');
      }

      // Create checkout session
      const { checkoutUrl, error: sessionError } = await createCheckoutSession(
        16900, // 169 NIS in agorot
        'ils',
        userId,
        userEmail,
        currentExam.name
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

  return (
    <div className="space-y-6">
      <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-slate-800 mb-2">פרטי תשלום</h3>
          <p className="text-sm text-slate-600">סכום לתשלום: <span className="font-bold text-slate-900">169 ₪</span></p>
          <p className="text-xs text-slate-500 mt-2">
            תועבר לדף התשלום המאובטח של Stripe להשלמת התשלום
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={isProcessing}
          className="flex-1 px-4 py-3 bg-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ביטול
        </button>
        <button
          type="button"
          onClick={handlePay}
          disabled={isProcessing}
          className="flex-1 px-4 py-3 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? 'מעבד...' : 'המשך לתשלום'}
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
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">תשלום גישה לפלטפורמה</h2>
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

