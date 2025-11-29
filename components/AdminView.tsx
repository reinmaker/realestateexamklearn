import React, { useState, useEffect } from 'react';
import { AdminUser, UserDetails, PricingQuote } from '../types';
import { getAllUsers, getUserDetails, deleteUser, updateUser, resetUserProgress, togglePaymentBypass } from '../services/adminService';
import { CloseIcon, UserIcon, TrashIcon, PencilIcon, SearchIcon, DocumentIcon, PlusIcon } from './icons';
import QuoteList from './QuoteList';
import QuoteForm from './QuoteForm';

interface AdminViewProps {
  currentUser: { id: string; email?: string; name?: string } | null;
}

const AdminView: React.FC<AdminViewProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'quotes'>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState<UserDetails | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', is_admin: false });
  const [isSaving, setIsSaving] = useState(false);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [editingQuote, setEditingQuote] = useState<PricingQuote | null>(null);
  const [quoteRefreshKey, setQuoteRefreshKey] = useState(0);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);
    const { users: fetchedUsers, error: fetchError } = await getAllUsers();
    if (fetchError) {
      setError(fetchError.message || 'שגיאה בטעינת המשתמשים');
    } else {
      setUsers(fetchedUsers);
    }
    setIsLoading(false);
  };

  const handleViewDetails = async (userId: string) => {
    const { details, error: detailsError } = await getUserDetails(userId);
    if (detailsError) {
      setError(detailsError.message || 'שגיאה בטעינת פרטי המשתמש');
    } else if (details) {
      setSelectedUser(details);
    }
  };

  const handleDelete = async (userId: string) => {
    setIsSaving(true);
    const { error: deleteError } = await deleteUser(userId);
    if (deleteError) {
      setError(deleteError.message || 'שגיאה במחיקת המשתמש');
      setIsSaving(false);
    } else {
      setShowDeleteConfirm(null);
      await loadUsers();
      if (selectedUser?.id === userId) {
        setSelectedUser(null);
      }
      setIsSaving(false);
    }
  };

  const handleResetProgress = async (userId: string) => {
    setIsSaving(true);
    const { error: resetError } = await resetUserProgress(userId);
    if (resetError) {
      setError(resetError.message || 'שגיאה באיפוס התקדמות המשתמש');
      setIsSaving(false);
    } else {
      setShowResetConfirm(null);
      // Reload user details if viewing this user
      if (selectedUser?.id === userId) {
        const { details } = await getUserDetails(userId);
        if (details) {
          setSelectedUser(details);
        }
      }
      setIsSaving(false);
    }
  };

  const handleEdit = (user: AdminUser) => {
    setEditForm({
      name: user.name || '',
      email: user.email || '',
      is_admin: user.is_admin,
    });
    // Get full details for editing
    getUserDetails(user.id).then(({ details }) => {
      if (details) {
        setShowEditModal(details);
      }
    });
  };

  const handleSaveEdit = async () => {
    if (!showEditModal) return;

    setIsSaving(true);
    const { error: updateError } = await updateUser(showEditModal.id, {
      name: editForm.name || undefined,
      email: editForm.email || undefined,
      is_admin: editForm.is_admin,
    });

    if (updateError) {
      setError(updateError.message || 'שגיאה בעדכון המשתמש');
      setIsSaving(false);
    } else {
      setShowEditModal(null);
      await loadUsers();
      if (selectedUser?.id === showEditModal.id) {
        const { details } = await getUserDetails(showEditModal.id);
        if (details) {
          setSelectedUser(details);
        }
      }
      setIsSaving(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const search = searchTerm.toLowerCase();
    return (
      user.email?.toLowerCase().includes(search) ||
      user.name?.toLowerCase().includes(search) ||
      user.id.toLowerCase().includes(search)
    );
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'לא זמין';
    return new Date(dateString).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="flex-grow p-4 md:p-8 overflow-y-auto flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">טוען משתמשים...</p>
        </div>
      </div>
    );
  }

  const handleQuoteSave = () => {
    setShowQuoteForm(false);
    setEditingQuote(null);
    handleQuoteRefresh();
  };

  const handleQuoteEdit = (quote: PricingQuote) => {
    setEditingQuote(quote);
    setShowQuoteForm(true);
  };

  const handleQuoteRefresh = () => {
    setQuoteRefreshKey(prev => prev + 1);
  };

  if (showQuoteForm) {
    return (
      <div className="flex-grow p-4 md:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <QuoteForm
            currentUser={currentUser}
            quote={editingQuote || undefined}
            onSave={handleQuoteSave}
            onCancel={() => {
              setShowQuoteForm(false);
              setEditingQuote(null);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow p-4 md:p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-700 mb-2">ניהול מערכת</h1>
          <p className="text-slate-600">נהל משתמשים והצעות מחיר</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-6 py-3 font-semibold rounded-t-xl transition-colors ${
              activeTab === 'users'
                ? 'bg-sky-600 text-white border-b-2 border-sky-600'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            משתמשים
          </button>
          <button
            onClick={() => setActiveTab('quotes')}
            className={`px-6 py-3 font-semibold rounded-t-xl transition-colors ${
              activeTab === 'quotes'
                ? 'bg-sky-600 text-white border-b-2 border-sky-600'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            הצעות מחיר
          </button>
        </div>

        {activeTab === 'quotes' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-700">הצעות מחיר</h2>
              <button
                onClick={() => {
                  setEditingQuote(null);
                  setShowQuoteForm(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white font-semibold rounded-xl hover:bg-sky-700 transition-colors"
              >
                <PlusIcon className="h-5 w-5" />
                צור הצעת מחיר
              </button>
            </div>
            <QuoteList
              key={quoteRefreshKey}
              currentUser={currentUser}
              onEdit={handleQuoteEdit}
              onRefresh={handleQuoteRefresh}
            />
          </div>
        )}

        {activeTab === 'users' && (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-700 mb-2">ניהול משתמשים</h2>
              <p className="text-slate-600">נהל את כל המשתמשים במערכת</p>
            </div>

            {error && (
              <div className="mb-4 p-4 bg-red-100 border border-red-300 text-red-700 rounded-2xl">
                {error}
                <button onClick={() => setError(null)} className="float-left ml-2">
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>
            )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="חפש לפי אימייל, שם או מזהה..."
                className="w-full pr-10 pl-4 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900"
              />
            </div>
            <div className="text-sm text-slate-600 flex items-center">
              סה"כ: {filteredUsers.length} משתמשים
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">אימייל</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">שם</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">תאריך הרשמה</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">כניסה אחרונה</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">סטטוס</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">גישה לפלטפורמה</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-sm text-slate-900">{user.email || 'ללא אימייל'}</td>
                    <td className="py-3 px-4 text-sm text-slate-900">
                      {user.name || 'ללא שם'}
                      {user.is_admin && (
                        <span className="mr-2 px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 rounded-lg">
                          מנהל
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">{formatDate(user.created_at)}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">{formatDate(user.last_sign_in_at)}</td>
                    <td className="py-3 px-4 text-sm">
                      {user.email_confirmed ? (
                        <span className="text-green-600 font-semibold">מאומת</span>
                      ) : (
                        <span className="text-amber-600 font-semibold">לא מאומת</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={async () => {
                          const newBypassStatus = !user.payment_bypassed;
                          const { error } = await togglePaymentBypass(user.id, newBypassStatus);
                          if (error) {
                            setError(`שגיאה בעדכון גישה: ${error.message}`);
                          } else {
                            // Reload users to reflect the change
                            loadUsers();
                          }
                        }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          user.payment_bypassed
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-red-100 text-red-800 hover:bg-red-200'
                        }`}
                        title={user.payment_bypassed ? 'לחץ לסגירת גישה' : 'לחץ לפתיחת גישה'}
                      >
                        {user.payment_bypassed ? 'גישה פתוחה' : 'גישה סגורה'}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => handleViewDetails(user.id)}
                          className="p-2 text-sky-600 hover:bg-sky-50 rounded-xl transition-colors"
                          title="צפה בפרטים"
                        >
                          <UserIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleEdit(user)}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                          title="ערוך"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => setShowResetConfirm(user.id)}
                          className="p-2 text-amber-600 hover:bg-amber-50 rounded-xl transition-colors"
                          title="איפוס התקדמות"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(user.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                          title="מחק"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* User Details Modal */}
        {selectedUser && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSelectedUser(null)}>
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                <h2 className="text-2xl font-bold text-slate-700">פרטי משתמש</h2>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-2 rounded-full hover:bg-slate-100 transition-colors"
                >
                  <CloseIcon className="h-6 w-6 text-slate-600" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">אימייל</label>
                    <p className="text-slate-900">{selectedUser.email || 'ללא אימייל'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">שם</label>
                    <p className="text-slate-900">{selectedUser.name || 'ללא שם'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">תאריך הרשמה</label>
                    <p className="text-slate-900">{formatDate(selectedUser.created_at)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">כניסה אחרונה</label>
                    <p className="text-slate-900">{formatDate(selectedUser.last_sign_in_at)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">סטטוס אימייל</label>
                    <p className={selectedUser.email_confirmed ? 'text-green-600 font-semibold' : 'text-amber-600 font-semibold'}>
                      {selectedUser.email_confirmed ? 'מאומת' : 'לא מאומת'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">תפקיד</label>
                    <p className={selectedUser.is_admin ? 'text-amber-600 font-semibold' : 'text-slate-600'}>
                      {selectedUser.is_admin ? 'מנהל' : 'משתמש רגיל'}
                    </p>
                  </div>
                </div>

                {/* Statistics */}
                {selectedUser.stats && (
                  <div className="border-t border-slate-200 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-slate-700">סטטיסטיקות</h3>
                      <button
                        onClick={() => setShowResetConfirm(selectedUser.id)}
                        className="px-4 py-2 bg-amber-100 text-amber-700 font-semibold rounded-xl hover:bg-amber-200 transition-colors text-sm"
                      >
                        איפוס התקדמות
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-slate-50 p-4 rounded-xl">
                        <p className="text-sm text-slate-600 mb-1">בוחנים</p>
                        <p className="text-2xl font-bold text-slate-700">{selectedUser.stats.quiz_count || 0}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl">
                        <p className="text-sm text-slate-600 mb-1">מבחנים</p>
                        <p className="text-2xl font-bold text-slate-700">{selectedUser.stats.exam_count || 0}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl">
                        <p className="text-sm text-slate-600 mb-1">ציון ממוצע</p>
                        <p className="text-2xl font-bold text-slate-700">
                          {selectedUser.stats.average_score ? `${selectedUser.stats.average_score.toFixed(1)}%` : '0%'}
                        </p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl">
                        <p className="text-sm text-slate-600 mb-1">שאלות נענו</p>
                        <p className="text-2xl font-bold text-slate-700">{selectedUser.stats.total_questions_answered || 0}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recent Sessions */}
                {selectedUser.sessions && selectedUser.sessions.length > 0 && (
                  <div className="border-t border-slate-200 pt-6">
                    <h3 className="text-lg font-semibold text-slate-700 mb-4">סשנים אחרונים</h3>
                    <div className="space-y-2">
                      {selectedUser.sessions.slice(0, 10).map((session: any, index: number) => (
                        <div key={index} className="bg-slate-50 p-4 rounded-xl">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-slate-900">
                                {session.session_type === 'quiz' ? 'בוחן אימון' : 'מבחן תיווך'}
                              </p>
                              <p className="text-sm text-slate-600">
                                {formatDate(session.completed_at)} • {session.score}/{session.total_questions} ({session.percentage.toFixed(1)}%)
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Support Tickets */}
                {selectedUser.support_tickets && selectedUser.support_tickets.length > 0 && (
                  <div className="border-t border-slate-200 pt-6">
                    <h3 className="text-lg font-semibold text-slate-700 mb-4">כרטיסי תמיכה</h3>
                    <div className="space-y-2">
                      {selectedUser.support_tickets.map((ticket: any) => (
                        <div key={ticket.id} className="bg-slate-50 p-4 rounded-xl">
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-semibold text-slate-900">{ticket.subject}</p>
                            <span className={`px-2 py-1 text-xs font-semibold rounded-lg ${
                              ticket.status === 'open' ? 'bg-blue-100 text-blue-800' :
                              ticket.status === 'in_progress' ? 'bg-amber-100 text-amber-800' :
                              ticket.status === 'resolved' ? 'bg-green-100 text-green-800' :
                              'bg-slate-100 text-slate-800'
                            }`}>
                              {ticket.status === 'open' ? 'פתוח' :
                               ticket.status === 'in_progress' ? 'בטיפול' :
                               ticket.status === 'resolved' ? 'נפתר' : 'סגור'}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600">{ticket.description.substring(0, 100)}...</p>
                          <p className="text-xs text-slate-500 mt-2">{formatDate(ticket.created_at)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowEditModal(null)}>
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                <h2 className="text-2xl font-bold text-slate-700">ערוך משתמש</h2>
                <button
                  onClick={() => setShowEditModal(null)}
                  className="p-2 rounded-full hover:bg-slate-100 transition-colors"
                >
                  <CloseIcon className="h-6 w-6 text-slate-600" />
                </button>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }} className="p-6 space-y-4">
                <div>
                  <label htmlFor="edit-name" className="block text-sm font-semibold text-slate-700 mb-1">
                    שם
                  </label>
                  <input
                    id="edit-name"
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900"
                  />
                </div>

                <div>
                  <label htmlFor="edit-email" className="block text-sm font-semibold text-slate-700 mb-1">
                    אימייל
                  </label>
                  <input
                    id="edit-email"
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-900"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="edit-admin"
                    type="checkbox"
                    checked={editForm.is_admin}
                    onChange={(e) => setEditForm({ ...editForm, is_admin: e.target.checked })}
                    className="w-4 h-4 text-sky-600 border-slate-300 rounded focus:ring-sky-500"
                  />
                  <label htmlFor="edit-admin" className="text-sm font-semibold text-slate-700">
                    מנהל
                  </label>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(null)}
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-300 transition-colors disabled:opacity-50"
                  >
                    ביטול
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 bg-sky-600 text-white font-semibold rounded-xl hover:bg-sky-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        שומר...
                      </>
                    ) : (
                      'שמור'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Reset Progress Confirmation */}
        {showResetConfirm && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowResetConfirm(null)}>
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <h2 className="text-2xl font-bold text-slate-700 mb-4">איפוס התקדמות משתמש</h2>
               <p className="text-slate-600 mb-6">
                 האם אתה בטוח שברצונך לאפס את התקדמות המשתמש? פעולה זו תמחק את כל הנתונים הבאים:
                 <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                   <li>סטטיסטיקות (בוחנים, מבחנים, ציונים)</li>
                   <li>סטטיסטיקות שאלות (סה"כ שאלות, תשובות נכונות)</li>
                   <li>היסטוריית סשנים</li>
                   <li>ניתוח AI</li>
                   <li>התקדמות לפי נושאים</li>
                   <li>נתוני שאלות ספציפיים למשתמש (אם קיימים)</li>
                 </ul>
                 <span className="block mt-3 font-semibold text-amber-600">החשבון עצמו יישמר, רק הנתונים יימחקו.</span>
               </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowResetConfirm(null)}
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-300 transition-colors disabled:opacity-50"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={() => handleResetProgress(showResetConfirm)}
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        מאפס...
                      </>
                    ) : (
                      'אפס התקדמות'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowDeleteConfirm(null)}>
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <h2 className="text-2xl font-bold text-slate-700 mb-4">מחיקת משתמש</h2>
                <p className="text-slate-600 mb-6">
                  האם אתה בטוח שברצונך למחוק משתמש זה? פעולה זו לא ניתנת לביטול ותמחק את כל הנתונים הקשורים למשתמש.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(null)}
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-300 transition-colors disabled:opacity-50"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={() => handleDelete(showDeleteConfirm)}
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
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
          </>
        )}
      </div>
    </div>
  );
};

export default AdminView;

