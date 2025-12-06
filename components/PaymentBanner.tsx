import React, { useState } from 'react';
import { createCheckoutSession } from '../services/stripeService';
import { getCurrentExamPeriod } from '../services/paymentService';

interface PaymentBannerProps {
  userId: string;
  userEmail: string;
}

const PaymentBanner: React.FC<PaymentBannerProps> = ({ userId, userEmail }) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePay = async () => {
    setIsProcessing(true);

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
      console.error('Error creating checkout session:', err);
      alert(err instanceof Error ? err.message : 'שגיאה לא ידועה');
    }
  };

  return (
    <div className="bg-amber-500 border-b-2 border-amber-600 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-white font-semibold text-sm md:text-base">
              לשימוש בפלטפורמה יש להשלים תשלום
            </p>
          </div>
          <button
            onClick={handlePay}
            disabled={isProcessing}
            className="flex-shrink-0 bg-white text-amber-600 font-bold px-6 py-2 rounded-lg hover:bg-amber-50 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? 'מעבד...' : 'שלם עכשיו'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentBanner;

