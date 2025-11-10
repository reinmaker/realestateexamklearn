import React, { useState, useEffect } from 'react';
import { QuoteLineItem, PricingQuote } from '../types';
import { createQuote, updateQuote, calculateTotals } from '../services/quoteService';
import { getAllUsers, AdminUser } from '../services/adminService';
import { downloadQuotePDF } from '../services/pdfService';
import { sendQuoteEmail } from '../services/emailService';
import { CloseIcon, PlusIcon, MinusIcon, CalendarIcon, DocumentIcon, MailIcon } from './icons';

interface QuoteFormProps {
  currentUser: { id: string; email?: string; name?: string } | null;
  quote?: PricingQuote | null;
  onSave: () => void;
  onCancel: () => void;
}

const QuoteForm: React.FC<QuoteFormProps> = ({ currentUser, quote, onSave, onCancel }) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [customerInputMode, setCustomerInputMode] = useState<'select' | 'manual'>('select');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [manualCustomerName, setManualCustomerName] = useState<string>('');
  const [manualCustomerEmail, setManualCustomerEmail] = useState<string>('');
  const [showPriceSummary, setShowPriceSummary] = useState<boolean>(true);
  const [quoteDate, setQuoteDate] = useState<string>(
    quote?.quote_date || new Date().toISOString().split('T')[0]
  );
  const [validUntil, setValidUntil] = useState<string>(
    quote?.valid_until ? new Date(quote.valid_until).toISOString().split('T')[0] : ''
  );
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>(
    quote?.line_items || [{ name: '', description: '', quantity: 1, unit_price: 0, total: 0 }]
  );
  const [taxRate, setTaxRate] = useState<number>(quote?.tax_rate || 17);
  const [terms, setTerms] = useState<string>(quote?.terms || '');
  const [notes, setNotes] = useState<string>(quote?.notes || '');
  const [status, setStatus] = useState<'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'>(
    quote?.status || 'draft'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
    if (quote?.user_id) {
      setSelectedUserId(quote.user_id);
      setCustomerInputMode('select');
    } else if (quote?.user_name || quote?.user_email) {
      // If quote has manual customer details but no user_id, use manual mode
      setManualCustomerName(quote.user_name || '');
      setManualCustomerEmail(quote.user_email || '');
      setCustomerInputMode('manual');
    }
    // Check if quote has show_price_summary field (if we add it to the database)
    if (quote && 'show_price_summary' in quote) {
      setShowPriceSummary((quote as any).show_price_summary !== false);
    }
  }, [quote]);

  const loadUsers = async () => {
    const { users: fetchedUsers } = await getAllUsers();
    setUsers(fetchedUsers);
  };

  // Note: Line item totals are calculated in handleLineItemChange
  // This useEffect is not needed as totals are already calculated when items change

  const handleAddLineItem = () => {
    setLineItems([...lineItems, { name: '', description: '', quantity: 1, unit_price: 0, total: 0 }]);
  };

  const handleRemoveLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const handleLineItemChange = (index: number, field: keyof QuoteLineItem, value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    
    // Recalculate line total
    if (field === 'quantity' || field === 'unit_price') {
      updated[index].total = updated[index].quantity * updated[index].unit_price;
    }
    
    setLineItems(updated);
  };

  const handleSave = async () => {
    if (!currentUser) {
      setError('משתמש לא מחובר');
      return;
    }

    if (lineItems.some(item => !item.name || item.quantity <= 0 || item.unit_price < 0)) {
      setError('אנא מלא את כל פרטי הפריטים');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let userName: string | null = null;
      let userEmail: string | null = null;
      let userId: string | null = null;

      if (customerInputMode === 'select') {
        const selectedUser = users.find(u => u.id === selectedUserId);
        userId = selectedUserId || null;
        userName = selectedUser?.name || null;
        userEmail = selectedUser?.email || null;
      } else {
        // Manual mode
        userId = null;
        userName = manualCustomerName.trim() || null;
        userEmail = manualCustomerEmail.trim() || null;
      }

      const quoteData = {
        user_id: userId,
        user_name: userName,
        user_email: userEmail,
        quote_date: new Date(quoteDate).toISOString(),
        valid_until: validUntil ? new Date(validUntil).toISOString() : null,
        line_items: lineItems,
        tax_rate: taxRate,
        terms: terms || null,
        notes: notes || null,
        status: status,
        show_price_summary: showPriceSummary,
      };

      if (quote) {
        // Update existing quote
        const { error: updateError } = await updateQuote(quote.id, quoteData);
        if (updateError) {
          setError(updateError.message || 'שגיאה בעדכון ההצעה');
        } else {
          onSave();
        }
      } else {
        // Create new quote
        const { quote: newQuote, error: createError } = await createQuote(
          selectedUserId || null,
          quoteData,
          currentUser.id
        );
        if (createError) {
          setError(createError.message || 'שגיאה ביצירת ההצעה');
        } else if (newQuote) {
          onSave();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה לא צפויה');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!quote) {
      setError('אין הצעה לייצוא');
      return;
    }
    await downloadQuotePDF(quote);
  };

  const handleSendEmail = async () => {
    if (!quote) {
      setError('אין הצעה לשליחה');
      return;
    }
    if (!quote.user_email) {
      setError('אין אימייל ללקוח');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { success, error: emailError } = await sendQuoteEmail(quote, quote.user_email);
      if (!success) {
        setError(emailError?.message || 'שגיאה בשליחת האימייל');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה לא צפויה');
    } finally {
      setIsLoading(false);
    }
  };

  const { subtotal, taxAmount, total } = calculateTotals(lineItems, taxRate);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-700">
          {quote ? 'ערוך הצעת מחיר' : 'צור הצעת מחיר חדשה'}
        </h2>
        <button
          onClick={onCancel}
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
        {/* Customer Input Mode Selection */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            פרטי לקוח
          </label>
          <div className="flex gap-4 mb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="customer-mode"
                value="select"
                checked={customerInputMode === 'select'}
                onChange={(e) => setCustomerInputMode(e.target.value as 'select' | 'manual')}
                className="w-4 h-4 text-sky-600 focus:ring-sky-500"
              />
              <span className="text-sm text-slate-700">בחר מרשימה</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="customer-mode"
                value="manual"
                checked={customerInputMode === 'manual'}
                onChange={(e) => setCustomerInputMode(e.target.value as 'select' | 'manual')}
                className="w-4 h-4 text-sky-600 focus:ring-sky-500"
              />
              <span className="text-sm text-slate-700">הזן ידנית</span>
            </label>
          </div>

          {customerInputMode === 'select' ? (
            <select
              id="user-select"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900"
            >
              <option value="">-- בחר לקוח --</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name || user.email} {user.email ? `(${user.email})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <div className="space-y-3">
              <div>
                <label htmlFor="manual-customer-name" className="block text-sm font-medium text-slate-600 mb-1">
                  שם לקוח
                </label>
                <input
                  id="manual-customer-name"
                  type="text"
                  value={manualCustomerName}
                  onChange={(e) => setManualCustomerName(e.target.value)}
                  placeholder="הזן שם לקוח"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="manual-customer-email" className="block text-sm font-medium text-slate-600 mb-1">
                  אימייל לקוח
                </label>
                <input
                  id="manual-customer-email"
                  type="email"
                  value={manualCustomerEmail}
                  onChange={(e) => setManualCustomerEmail(e.target.value)}
                  placeholder="הזן אימייל לקוח"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900"
                />
              </div>
            </div>
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="quote-date" className="block text-sm font-semibold text-slate-700 mb-1">
              תאריך הצעה
            </label>
            <div className="relative">
              <input
                id="quote-date"
                type="date"
                value={quoteDate}
                onChange={(e) => setQuoteDate(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900"
              />
              <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label htmlFor="valid-until" className="block text-sm font-semibold text-slate-700 mb-1">
              תוקף עד (אופציונלי)
            </label>
            <div className="relative">
              <input
                id="valid-until"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900"
              />
              <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-semibold text-slate-700">פריטים</label>
            <button
              onClick={handleAddLineItem}
              className="flex items-center gap-2 px-3 py-1.5 bg-sky-600 text-white rounded-xl hover:bg-sky-700 transition-colors text-sm"
            >
              <PlusIcon className="h-4 w-4" />
              הוסף פריט
            </button>
          </div>
          <div className="space-y-3">
            {lineItems.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-start p-3 bg-slate-50 rounded-xl">
                <div className="col-span-12 md:col-span-4">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => handleLineItemChange(index, 'name', e.target.value)}
                    placeholder="שם הפריט"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900 text-sm"
                  />
                </div>
                <div className="col-span-12 md:col-span-4">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                    placeholder="תיאור"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900 text-sm"
                  />
                </div>
                <div className="col-span-4 md:col-span-1">
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => handleLineItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                    placeholder="כמות"
                    min="0"
                    step="1"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900 text-sm"
                  />
                </div>
                <div className="col-span-4 md:col-span-1">
                  <input
                    type="number"
                    value={item.unit_price}
                    onChange={(e) => handleLineItemChange(index, 'unit_price', parseFloat(e.target.value) || 0)}
                    placeholder="מחיר יחידה"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900 text-sm"
                  />
                </div>
                <div className="col-span-3 md:col-span-1 flex items-center justify-end">
                  <span className="text-sm font-semibold text-slate-700">₪{item.total.toFixed(2)}</span>
                </div>
                <div className="col-span-1 flex items-center justify-center">
                  <button
                    onClick={() => handleRemoveLineItem(index)}
                    disabled={lineItems.length === 1}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <MinusIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tax Rate */}
        <div>
          <label htmlFor="tax-rate" className="block text-sm font-semibold text-slate-700 mb-1">
            אחוז מע"מ
          </label>
          <input
            id="tax-rate"
            type="number"
            value={taxRate}
            onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
            min="0"
            max="100"
            step="0.01"
            className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900"
          />
        </div>

        {/* Show Price Summary Toggle */}
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
          <input
            type="checkbox"
            id="show-price-summary"
            checked={showPriceSummary}
            onChange={(e) => setShowPriceSummary(e.target.checked)}
            className="w-5 h-5 text-sky-600 focus:ring-sky-500 rounded"
          />
          <label htmlFor="show-price-summary" className="text-sm font-semibold text-slate-700 cursor-pointer">
            הצג סיכום מחיר ב-PDF
          </label>
        </div>

        {/* Totals (always shown in form, but controlled in PDF) */}
        {showPriceSummary && (
          <div className="bg-slate-50 p-4 rounded-xl">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-slate-600">סה"כ לפני מע"מ:</span>
              <span className="text-sm font-semibold text-slate-700">₪{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-slate-600">מע"מ ({taxRate}%):</span>
              <span className="text-sm font-semibold text-slate-700">₪{taxAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-300">
              <span className="text-base font-bold text-slate-700">סה"כ כולל מע"מ:</span>
              <span className="text-lg font-bold text-slate-700">₪{total.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Terms */}
        <div>
          <label htmlFor="terms" className="block text-sm font-semibold text-slate-700 mb-1">
            תנאים
          </label>
          <textarea
            id="terms"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900"
            placeholder="הכנס תנאי הצעה..."
          />
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="block text-sm font-semibold text-slate-700 mb-1">
            הערות (אופציונלי)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900"
            placeholder="הכנס הערות..."
          />
        </div>

        {/* Status */}
        <div>
          <label htmlFor="status" className="block text-sm font-semibold text-slate-700 mb-1">
            סטטוס
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900"
          >
            <option value="draft">טיוטה</option>
            <option value="sent">נשלח</option>
            <option value="accepted">אושר</option>
            <option value="rejected">נדחה</option>
            <option value="expired">פג תוקף</option>
          </select>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-300 transition-colors disabled:opacity-50"
          >
            ביטול
          </button>
          {quote && (
            <>
              <button
                onClick={handleExportPDF}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 transition-colors disabled:opacity-50"
                title="ייצא PDF"
              >
                <DocumentIcon className="h-5 w-5" />
                PDF
              </button>
              <button
                onClick={handleSendEmail}
                disabled={isLoading || !quote.user_email}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50"
                title="שלח אימייל"
              >
                <MailIcon className="h-5 w-5" />
                אימייל
              </button>
            </>
          )}
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-sky-600 text-white font-semibold rounded-xl hover:bg-sky-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                שומר...
              </>
            ) : (
              'שמור'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuoteForm;


