import React, { useState } from 'react';
import { supabase } from '../services/authService';

interface SupportViewProps {
  currentUser: { id: string; email?: string; name?: string } | null;
}

const SupportView: React.FC<SupportViewProps> = ({ currentUser }) => {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const { data, error: insertError } = await supabase
        .from('support_tickets')
        .insert([
          {
            user_id: currentUser.id,
            user_email: currentUser.email || '',
            user_name: currentUser.name || '',
            subject: subject.trim(),
            description: description.trim(),
            priority: priority,
            status: 'open',
            created_at: new Date().toISOString(),
          }
        ])
        .select();

      if (insertError) {
        console.error('Error submitting ticket:', insertError);
        setError('שגיאה בשליחת הכרטיס. אנא נסה שוב.');
      } else {
        setSuccess(true);
        setSubject('');
        setDescription('');
        setPriority('medium');
        setTimeout(() => {
          setSuccess(false);
        }, 3000);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      setError('שגיאה בלתי צפויה. אנא נסה שוב.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-grow p-4 md:p-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-700 mb-2">כרטיס תמיכה</h1>
          <p className="text-slate-600 mb-6">נשמח לעזור לך! מלא את הטופס ונחזור אליך בהקדם.</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-100 border border-red-300 text-red-700 rounded-xl">
                {error}
              </div>
            )}

            {success && (
              <div className="p-4 bg-green-100 border border-green-300 text-green-700 rounded-xl">
                הכרטיס נשלח בהצלחה! נחזור אליך בהקדם.
              </div>
            )}

            <div>
              <label htmlFor="subject" className="block text-sm font-semibold text-slate-700 mb-2">
                נושא
              </label>
              <input
                type="text"
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900"
                placeholder="מה הנושא של הבעיה?"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label htmlFor="priority" className="block text-sm font-semibold text-slate-700 mb-2">
                עדיפות
              </label>
              <select
                id="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900"
                disabled={isSubmitting}
              >
                <option value="low">נמוכה</option>
                <option value="medium">בינונית</option>
                <option value="high">גבוהה</option>
              </select>
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-semibold text-slate-700 mb-2">
                תיאור מפורט
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={10}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900 resize-none"
                placeholder="תאר את הבעיה או השאלה שלך בפירוט..."
                disabled={isSubmitting}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={isSubmitting || !subject.trim() || !description.trim()}
                className="flex-1 px-6 py-3 bg-sky-600 text-white font-semibold rounded-xl hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    שולח...
                  </>
                ) : (
                  'שלח כרטיס'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SupportView;

