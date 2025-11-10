import React, { useState } from 'react';
import { PricingQuote } from '../types';
import { deleteQuote } from '../services/quoteService';
import { downloadQuotePDF } from '../services/pdfService';
import { sendQuoteEmail } from '../services/emailService';
import { CloseIcon, PencilIcon, TrashIcon, DocumentIcon, MailIcon, UserIcon } from './icons';
import QuoteForm from './QuoteForm';

interface QuoteDetailProps {
  quote: PricingQuote;
  currentUser: { id: string; email?: string; name?: string } | null;
  onEdit: (quote: PricingQuote) => void;
  onDelete: () => void;
  onClose: () => void;
}

const QuoteDetail: React.FC<QuoteDetailProps> = ({ quote, currentUser, onEdit, onDelete, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'לא זמין';
    return new Date(dateString).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const { error: deleteError } = await deleteQuote(quote.id);
      if (deleteError) {
        setError(deleteError.message || 'שגיאה במחיקת ההצעה');
        setIsDeleting(false);
      } else {
        onDelete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה לא צפויה');
      setIsDeleting(false);
    }
  };

  const handleExportPDF = async () => {
    await downloadQuotePDF(quote);
  };

  const handleSendEmail = async () => {
    if (!quote.user_email) {
      setError('אין אימייל ללקוח');
      return;
    }

    setIsSendingEmail(true);
    setError(null);

    try {
      const { success, error: emailError } = await sendQuoteEmail(quote, quote.user_email);
      if (!success) {
        setError(emailError?.message || 'שגיאה בשליחת האימייל');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה לא צפויה');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const statusText = {
    draft: 'טיוטה',
    sent: 'נשלח',
    accepted: 'אושר',
    rejected: 'נדחה',
    expired: 'פג תוקף',
  }[quote.status] || quote.status;

  const statusColor = {
    draft: 'bg-slate-100 text-slate-800',
    sent: 'bg-blue-100 text-blue-800',
    accepted: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    expired: 'bg-amber-100 text-amber-800',
  }[quote.status] || 'bg-slate-100 text-slate-800';

  if (isEditing) {
    return (
      <QuoteForm
        currentUser={currentUser}
        quote={quote}
        onSave={() => {
          setIsEditing(false);
          onClose();
        }}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-700">פרטי הצעת מחיר</h2>
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-slate-100 transition-colors"
        >
          <CloseIcon className="h-6 w-6 text-slate-600" />
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-300 text-red-700 rounded-xl">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Header Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">מספר הצעה</label>
            <p className="text-slate-900 font-mono">{quote.quote_number}</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">סטטוס</label>
            <span className={`inline-block px-3 py-1 rounded-lg text-sm font-semibold ${statusColor}`}>
              {statusText}
            </span>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">תאריך הצעה</label>
            <p className="text-slate-900">{formatDate(quote.quote_date)}</p>
          </div>
          {quote.valid_until && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">תוקף עד</label>
              <p className="text-slate-900">{formatDate(quote.valid_until)}</p>
            </div>
          )}
        </div>

        {/* Customer Info */}
        {(quote.user_name || quote.user_email) && (
          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <UserIcon className="h-5 w-5 text-slate-700" />
              פרטי לקוח
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {quote.user_name && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">שם</label>
                  <p className="text-slate-900">{quote.user_name}</p>
                </div>
              )}
              {quote.user_email && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">אימייל</label>
                  <p className="text-slate-900">{quote.user_email}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Line Items */}
        {quote.line_items && quote.line_items.length > 0 && (
          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-lg font-semibold text-slate-700 mb-4">פריטים</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">פריט</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">תיאור</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">כמות</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">מחיר יחידה</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">סה"כ</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.line_items.map((item, index) => (
                    <tr key={index} className="border-b border-slate-100">
                      <td className="py-3 px-4 text-sm text-slate-900">{item.name}</td>
                      <td className="py-3 px-4 text-sm text-slate-600">{item.description || '-'}</td>
                      <td className="py-3 px-4 text-sm text-slate-900">{item.quantity}</td>
                      <td className="py-3 px-4 text-sm text-slate-900">₪{item.unit_price.toFixed(2)}</td>
                      <td className="py-3 px-4 text-sm font-semibold text-slate-900">₪{item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="border-t border-slate-200 pt-6">
          <div className="bg-slate-50 p-4 rounded-xl max-w-md mr-auto">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-slate-600">סה"כ לפני מע"מ:</span>
              <span className="text-sm font-semibold text-slate-700">₪{quote.subtotal.toFixed(2)}</span>
            </div>
            {quote.tax_rate > 0 && (
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-slate-600">מע"מ ({quote.tax_rate}%):</span>
                <span className="text-sm font-semibold text-slate-700">₪{quote.tax_amount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-slate-300">
              <span className="text-base font-bold text-slate-700">סה"כ כולל מע"מ:</span>
              <span className="text-lg font-bold text-slate-700">₪{quote.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Terms */}
        {quote.terms && (
          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-lg font-semibold text-slate-700 mb-2">תנאים</h3>
            <p className="text-slate-900 whitespace-pre-wrap">{quote.terms}</p>
          </div>
        )}

        {/* Notes */}
        {quote.notes && (
          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-lg font-semibold text-slate-700 mb-2">הערות</h3>
            <p className="text-slate-900 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-6 border-t border-slate-200">
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-sky-600 text-white font-semibold rounded-xl hover:bg-sky-700 transition-colors"
          >
            <PencilIcon className="h-5 w-5" />
            ערוך
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 transition-colors"
          >
            <DocumentIcon className="h-5 w-5" />
            ייצא PDF
          </button>
          {quote.user_email && (
            <button
              onClick={handleSendEmail}
              disabled={isSendingEmail}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {isSendingEmail ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  שולח...
                </>
              ) : (
                <>
                  <MailIcon className="h-5 w-5" />
                  שלח אימייל
                </>
              )}
            </button>
          )}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors"
          >
            <TrashIcon className="h-5 w-5" />
            מחק
          </button>
        </div>
      </div>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-700 mb-4">מחיקת הצעה</h2>
              <p className="text-slate-600 mb-6">
                האם אתה בטוח שברצונך למחוק את הצעת המחיר {quote.quote_number}? פעולה זו לא ניתנת לביטול.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-300 transition-colors disabled:opacity-50"
                >
                  ביטול
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      מוחק...
                    </>
                  ) : (
                    'מחק'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuoteDetail;


