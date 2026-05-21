// =============================================================
// RequestsDashboard — Admin Requests Hub main page
// =============================================================
import { useState } from 'react';
import { useAuth } from '@hooks/useAuth';
import {
  useRequestsBootstrap,
  useRequestsDashboard,
  useRequestsActions,
  useRequestsLoading,
} from '../hooks/useRequests.js';
import { RequestCard } from '../components/RequestCard.jsx';
import {
  REQUEST_TYPE,
  REQUEST_TYPE_LABELS,
  REQUEST_TYPE_ICONS,
  LEAVE_TYPE,
  LEAVE_TYPE_LABELS,
} from '../types/requests.types.js';
import { ROLES } from '@data/teams';

const REQUEST_TABS = [
  { key: 'all',     label: 'الكل' },
  { key: 'pending', label: 'بانتظار الموافقة' },
  { key: 'leave',   label: 'إجازات' },
  { key: 'advance', label: 'سلف' },
];

export function RequestsDashboard() {
  const { id, role } = useAuth();
  useRequestsBootstrap(id, role);

  const { requests, kpis, isLoading } = useRequestsDashboard();
  const { approveRequest, rejectRequest, cancelRequest, createRequest } = useRequestsActions();
  const loading = useRequestsLoading();

  const isAdmin = role === ROLES.ADMIN || role === ROLES.MANAGER || role === ROLES.SALES_MANAGER;

  const [activeTab, setActiveTab] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    request_type: REQUEST_TYPE.LEAVE,
    leave_type: LEAVE_TYPE.ANNUAL,
    leave_from: '',
    leave_to: '',
    leave_days: '',
    advance_amount: '',
    advance_currency: 'USD',
    reason: '',
  });

  // Filter requests by active tab
  const filtered = requests.filter(r => {
    if (activeTab === 'pending') return r.status === 'pending';
    if (activeTab === 'leave')   return r.request_type === 'leave';
    if (activeTab === 'advance') return r.request_type === 'advance';
    return true;
  });

  const handleSubmit = async () => {
    const payload = { request_type: form.request_type, reason: form.reason };
    if (form.request_type === REQUEST_TYPE.LEAVE) {
      Object.assign(payload, {
        leave_type: form.leave_type,
        leave_from: form.leave_from || null,
        leave_to:   form.leave_to   || null,
        leave_days: form.leave_days ? Number(form.leave_days) : null,
      });
    }
    if (form.request_type === REQUEST_TYPE.ADVANCE) {
      Object.assign(payload, {
        advance_amount:   form.advance_amount ? Number(form.advance_amount) : null,
        advance_currency: form.advance_currency,
      });
    }
    await createRequest(payload);
    setShowForm(false);
    setForm({ request_type: REQUEST_TYPE.LEAVE, leave_type: LEAVE_TYPE.ANNUAL, leave_from: '', leave_to: '', leave_days: '', advance_amount: '', advance_currency: 'USD', reason: '' });
  };

  const handleApprove = (id) => approveRequest(id, '');
  const handleReject  = (id) => rejectRequest(id, 'مرفوض من الإدارة');

  return (
    <div className="min-h-screen bg-cream p-4 md:p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">📋 الطلبات</h1>
          <p className="text-sm text-muted mt-0.5">طلبات الموظفين والإجازات والسلف</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 transition"
        >
          + طلب جديد
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'إجمالي',          value: kpis.total,    icon: '📋', color: 'text-text' },
          { label: 'بانتظار الموافقة', value: kpis.pending,  icon: '⏳', color: 'text-yellow-600' },
          { label: 'موافق عليها',     value: kpis.approved, icon: '✅', color: 'text-green-600' },
          { label: 'مرفوضة',          value: kpis.rejected, icon: '❌', color: 'text-red-500' },
        ].map(k => (
          <div key={k.label} className="bg-surface border border-border rounded-xl p-4">
            <div className="text-2xl mb-1">{k.icon}</div>
            <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-muted mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {REQUEST_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={[
              'px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition',
              activeTab === t.key
                ? 'bg-teal text-white'
                : 'bg-surface border border-border text-muted hover:border-teal/40',
            ].join(' ')}
          >
            {t.label}
            {t.key === 'pending' && kpis.pending > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/20 text-xs">
                {kpis.pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Requests list */}
      {isLoading ? (
        <div className="text-center py-16 text-muted text-sm">جار التحميل…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-muted text-sm">لا توجد طلبات</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(r => (
            <RequestCard
              key={r.id}
              request={r}
              canDecide={isAdmin}
              isOwn={r.employee_id === id}
              onApprove={handleApprove}
              onReject={handleReject}
              onCancel={cancelRequest}
            />
          ))}
        </div>
      )}

      {/* New Request Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-text mb-4">طلب جديد</h3>

            {/* Type */}
            <div className="mb-3">
              <label className="text-xs text-muted mb-1 block">نوع الطلب</label>
              <div className="grid grid-cols-3 gap-2">
                {[REQUEST_TYPE.LEAVE, REQUEST_TYPE.ADVANCE, REQUEST_TYPE.DOCUMENT, REQUEST_TYPE.VACATION, REQUEST_TYPE.OTHER].map(t => (
                  <button
                    key={t}
                    onClick={() => setForm(f => ({ ...f, request_type: t }))}
                    className={[
                      'py-2 px-3 rounded-lg text-xs font-medium transition border',
                      form.request_type === t
                        ? 'bg-teal text-white border-teal'
                        : 'border-border text-muted hover:border-teal/40',
                    ].join(' ')}
                  >
                    {REQUEST_TYPE_ICONS[t]} {REQUEST_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Leave fields */}
            {form.request_type === REQUEST_TYPE.LEAVE && (
              <div className="space-y-2 mb-3">
                <div>
                  <label className="text-xs text-muted mb-1 block">نوع الإجازة</label>
                  <select
                    value={form.leave_type}
                    onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text"
                  >
                    {Object.entries(LEAVE_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted mb-1 block">من</label>
                    <input type="date" value={form.leave_from} onChange={e => setForm(f => ({ ...f, leave_from: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text" />
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">إلى</label>
                    <input type="date" value={form.leave_to} onChange={e => setForm(f => ({ ...f, leave_to: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">عدد الأيام</label>
                  <input type="number" value={form.leave_days} onChange={e => setForm(f => ({ ...f, leave_days: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text" />
                </div>
              </div>
            )}

            {/* Advance fields */}
            {form.request_type === REQUEST_TYPE.ADVANCE && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="text-xs text-muted mb-1 block">المبلغ</label>
                  <input type="number" value={form.advance_amount} onChange={e => setForm(f => ({ ...f, advance_amount: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text" />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">العملة</label>
                  <select value={form.advance_currency} onChange={e => setForm(f => ({ ...f, advance_currency: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text">
                    <option value="USD">USD</option>
                    <option value="TRY">TRY</option>
                    <option value="SYP">SYP</option>
                  </select>
                </div>
              </div>
            )}

            {/* Reason */}
            <div className="mb-4">
              <label className="text-xs text-muted mb-1 block">السبب</label>
              <textarea
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                rows={2}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text resize-none"
                placeholder="اكتب سبب الطلب…"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                disabled={loading.action}
                className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 disabled:opacity-50 transition"
              >
                إرسال
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-text hover:bg-cream transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RequestsDashboard;
