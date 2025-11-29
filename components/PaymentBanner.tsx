import React from 'react';

interface PaymentBannerProps {
  onPayClick: () => void;
}

const PaymentBanner: React.FC<PaymentBannerProps> = ({ onPayClick }) => {
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
            onClick={onPayClick}
            className="flex-shrink-0 bg-white text-amber-600 font-bold px-6 py-2 rounded-lg hover:bg-amber-50 transition-colors shadow-md"
          >
            שלם עכשיו
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentBanner;

