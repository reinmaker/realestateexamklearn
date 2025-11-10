import React, { useState, useEffect } from 'react';
import { PricingQuote } from '../types';
import { getAllQuotes } from '../services/quoteService';
import { downloadQuotePDF } from '../services/pdfService';
import { sendQuoteEmail } from '../services/emailService';
import { UserIcon, SearchIcon, DocumentIcon, MailIcon, PencilIcon, TrashIcon, EyeIcon } from './icons';
import QuoteDetail from './QuoteDetail';

interface QuoteListProps {
  currentUser: { id: string; email?: string; name?: string } | null;
  onEdit: (quote: PricingQuote) => void;
  onRefresh: () => void;
}

const QuoteList: React.FC<QuoteListProps> = ({ currentUser, onEdit, onRefresh }) => {
  const [quotes, setQuotes] = useState<PricingQuote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedQuote, setSelectedQuote] = useState<PricingQuote | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState<string | null>(null);

  useEffect(() => {
    loadQuotes();
  }, []);

  // Refresh when onRefresh is called (via key change in parent)
  useEffect(() => {
    loadQuotes();
  }, [onRefresh]);

  const loadQuotes = async () => {
    setIsLoading(true);
    setError(null);
    const { quotes: fetchedQuotes, error: fetchError } = await getAllQuotes();
    if (fetchError) {
      setError(fetchError.message || 'שגיאה בטעינת ההצעות');
    } else {
      setQuotes(fetchedQuotes);
    }
    setIsLoading(false);
  };

  const handleViewDetails = (quote: PricingQuote) => {
    setSelectedQuote(quote);
  };

  const handleDelete = () => {
    setSelectedQuote(null);
    loadQuotes();
    onRefresh();
  };

  const handleExportPDF = async (quote: PricingQuote) => {
    await downloadQuotePDF(quote);
  };

  const handleSendEmail = async (quote: PricingQuote) => {
    if (!quote.user_email) {
      setError('אין אימייל ללקוח');
      return;
    }

    setIsSendingEmail(quote.id);
    setError(null);

    try {
      const { success, error: emailError } = await sendQuoteEmail(quote, quote.user_email);
      if (!success) {
        setError(emailError?.message || 'שגיאה בשליחת האימייל');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה לא צפויה');
    } finally {
      setIsSendingEmail(null);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'לא זמין';
    return new Date(dateString).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const filteredQuotes = quotes.filter(quote => {
    const matchesSearch = 
      quote.quote_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.user_email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || quote.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const statusText = {
    draft: 'טיוטה',
    sent: 'נשלח',
    accepted: 'אושר',
    rejected: 'נדחה',
    expired: 'פג תוקף',
  };

  const statusColor = {
    draft: 'bg-slate-100 text-slate-800',
    sent: 'bg-blue-100 text-blue-800',
    accepted: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    expired: 'bg-amber-100 text-amber-800',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">טוען הצעות...</p>
        </div>
      </div>
    );
  }

  if (selectedQuote) {
    return (
      <QuoteDetail
        quote={selectedQuote}
        currentUser={currentUser}
        onEdit={onEdit}
        onDelete={handleDelete}
        onClose={() => setSelectedQuote(null)}
      />
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-700 mb-2">הצעות מחיר</h2>
        <p className="text-slate-600">נהל את כל הצעות המחיר במערכת</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-300 text-red-700 rounded-xl">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="חפש לפי מספר הצעה, שם לקוח או אימייל..."
            className="w-full pr-10 pl-4 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900"
          />
        </div>
        <div className="w-full md:w-48">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900"
          >
            <option value="all">כל הסטטוסים</option>
            <option value="draft">טיוטה</option>
            <option value="sent">נשלח</option>
            <option value="accepted">אושר</option>
            <option value="rejected">נדחה</option>
            <option value="expired">פג תוקף</option>
          </select>
        </div>
        <div className="text-sm text-slate-600 flex items-center">
          סה"כ: {filteredQuotes.length} הצעות
        </div>
      </div>

      {/* Quotes Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">מספר הצעה</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">לקוח</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">תאריך</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">סה"כ</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">סטטוס</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filteredQuotes.map((quote) => (
              <tr key={quote.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-3 px-4 text-sm text-slate-900 font-mono">{quote.quote_number}</td>
                <td className="py-3 px-4 text-sm text-slate-900">
                  {quote.user_name || quote.user_email || 'ללא לקוח'}
                </td>
                <td className="py-3 px-4 text-sm text-slate-600">{formatDate(quote.quote_date)}</td>
                <td className="py-3 px-4 text-sm font-semibold text-slate-900">₪{quote.total.toFixed(2)}</td>
                <td className="py-3 px-4 text-sm">
                  <span className={`inline-block px-2 py-1 rounded-lg text-xs font-semibold ${statusColor[quote.status]}`}>
                    {statusText[quote.status]}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => handleViewDetails(quote)}
                      className="p-2 text-sky-600 hover:bg-sky-50 rounded-xl transition-colors"
                      title="צפה בפרטים"
                    >
                      <EyeIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => onEdit(quote)}
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                      title="ערוך"
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleExportPDF(quote)}
                      className="p-2 text-amber-600 hover:bg-amber-50 rounded-xl transition-colors"
                      title="ייצא PDF"
                    >
                      <DocumentIcon className="h-5 w-5" />
                    </button>
                    {quote.user_email && (
                      <button
                        onClick={() => handleSendEmail(quote)}
                        disabled={isSendingEmail === quote.id}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-xl transition-colors disabled:opacity-50"
                        title="שלח אימייל"
                      >
                        {isSendingEmail === quote.id ? (
                          <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <MailIcon className="h-5 w-5" />
                        )}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredQuotes.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-600">לא נמצאו הצעות מחיר</p>
        </div>
      )}
    </div>
  );
};

export default QuoteList;

