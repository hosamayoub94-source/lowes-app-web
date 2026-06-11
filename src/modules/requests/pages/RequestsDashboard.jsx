// =============================================================
// RequestsDashboard — Requests Hub (theme-aware v2)
// =============================================================
import { useState, useMemo } from 'react';
import { useAuth } from '@hooks/useAuth';
import {
  useRequestsBootstrap,
  useRequestsDashboard,
  useRequestsActions,
  useRequestsLoading,
} from '../hooks/useRequests.js';
import { RequestCard } from '../components/RequestCard.jsx';
import { Tabs } from '@components/ui/Tabs';
import {
  REQUEST_TYPE,
  REQUEST_TYPE_LABELS,
  REQUEST_TYPE_ICONS,
  LEAVE_TYPE,
  LEAVE_TYPE_LABELS,
} from '../types/requests.types.js';
import { ROLES } from '@data/teams';

// ─── Tab definition ──────────────────────────────────────────
const REQUEST_TABS = [
  { key: 'all',      label: 'الكل',              icon: '📋' },
  { key: 'pending',  label: 'بانتظار الموافقة',  icon: '⏳' },
  { key: 'leave',    label: 'إجازات',             icon: '🏖️' },
  { key: 'advance',  label: 'سلف',               icon: '💵' },
];

// ─── KPI card ────────────────────────────────────────────────
function KpiCard({ icon, label, value, colorClass }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="w-9 h-9 rounded-xl bg-surface-alt flex items-center justify-center text-lg">{icon}</div>
      <div className={`text-2xl font-extrabold tracking-tight ${colorClass}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

// ─── Input class helper ──────────────────────────────────────
const INP = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-cream text-text outline-none focus:border-teal transition';

// ─── Main component ───────────────────────────────────────────
export function RequestsDashboard() {
  const { id, role } = useAuth();
  useRequestsBootstrap(id, role);

  const { requests, kpis, isLoading } = useRequestsDashboard();
  const { approveRequest, rejectRequest, cancelRequest, createRequest } = useRequestsActions();
  const loading = useRequestsLoading();

  const isAdmin = role === ROLES.ADMIN || role === ROLES.MANAGER || role === ROLES.SALES_MANAGER;

  const [activeTab, setActiveTab]   = useState('all');
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm] = useState({
    request_type:     REQUEST_TYPE.LEAVE,
    leave_type:       LEAVE_TYPE.ANNUAL,
    leave_from:       '',
    leave_to:         '',
    leave_days:       '',
    advance_amount:   '',
    advance_currency: 'USD',
    reason:           '',
  });

  const resetForm = () => setForm({
    request_type: REQUEST_TYPE.LEAVE, leave_type: LEAVE_TYPE.ANNUAL,
    leave_from: '', leave_to: '', leave_days: '',
    advance_amount: '', advance_currency: 'USD', reason: '',
  });

  // ── Filter
  const filtered = useMemo(() => requests.filter(r => {
    if (activeTab === 'pending') return r.status === 'pending';
    if (activeTab === 'leave')   return r.request_type === 'leave';
    if (activeTab === 'advance') return r.request_type === 'advance';
    return true;
  }), [requests, activeTab]);

  // ── Submit
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
    resetForm();
  };

  const handleApprove = (rid) => approveRequest(rid, '');
  const handleReject  = (rid) => rejectRequest(rid, 'مرفوض من الإدارة');

  return (
    <div className="min-h-screen bg-cream p-4 md:p-6" dir="rtl">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-text tracking-tight">الطلبات</h1>
          <p className="text-sm text-muted mt-0.5">طلبات الموظفين والإجازات والسلف</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 active:scale-95 transition shadow-sm"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"/></svg>
          طلب جديد
        </button>
      </div>

      {/* ── KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard icon="📋" label="إجمالي الطلبات"     value={kpis.total}    colorClass="text-text" />
        <KpiCard icon="⏳" label="بانتظار الموافقة"  value={kpis.pending}  colorClass="text-amber-fg" />
        <KpiCard icon="✅" label="موافق عليها"        value={kpis.approved} colorClass="text-green-fg" />
        <KpiCard icon="❌" label="مرفوضة"             value={kpis.rejected} colorClass="text-red-fg" />
      </div>

      {/* ── Tabs (موحّد) ───────────────────────────────────── */}
      <Tabs
        className="mb-5"
        value={activeTab}
        onChange={setActiveTab}
        tabs={REQUEST_TABS.map(t => (t.key === 'pending' && kpis.pending > 0 ? { ...t, badge: kpis.pending } : t))}
      />

      {/* ── List ───────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-muted text-sm">
          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          جار التحميل…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-16 h-16 rounded-2xl bg-surface-alt flex items-center justify-center text-3xl">📭</div>
          <p className="text-text font-semibold">لا توجد طلبات</p>
          <p className="text-muted text-sm text-center max-w-xs">
            {activeTab === 'all' ? 'لم يتم تقديم أي طلبات بعد' : `لا توجد طلبات في هذا القسم`}
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-2 px-5 py-2 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 transition"
          >
            + تقديم طلب جديد
          </button>
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

      {/* ── New Request Modal ──────────────────────────────── */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => { setShowForm(false); resetForm(); }}
        >
          <div
            className="bg-surface rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
              <h3 className="font-bold text-base text-text">تقديم طلب جديد</h3>
              <button
                onClick={() => { setShowForm(false); resetForm(); }}
                className="w-8 h-8 rounded-full bg-surface-alt flex items-center justify-center text-muted hover:text-text transition"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/></svg>
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Type selector */}
              <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider mb-2 block">نوع الطلب</label>
                <div className="grid grid-cols-3 gap-2">
                  {[REQUEST_TYPE.LEAVE, REQUEST_TYPE.ADVANCE, REQUEST_TYPE.DOCUMENT, REQUEST_TYPE.VACATION, REQUEST_TYPE.OTHER].map(t => (
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, request_type: t }))}
                      className={[
                        'py-2.5 px-2 rounded-xl text-xs font-semibold transition border flex flex-col items-center gap-1',
                        form.request_type === t
                          ? 'bg-navy text-white border-navy'
                          : 'border-border text-muted hover:border-teal/40 hover:text-text',
                      ].join(' ')}
                    >
                      <span className="text-base">{REQUEST_TYPE_ICONS[t]}</span>
                      {REQUEST_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Leave fields */}
              {form.request_type === REQUEST_TYPE.LEAVE && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-muted mb-1.5 block">نوع الإجازة</label>
                    <select
                      value={form.leave_type}
                      onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}
                      className={INP}
                    >
                      {Object.entries(LEAVE_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-muted mb-1.5 block">من تاريخ</label>
                      <input type="date" value={form.leave_from}
                        onChange={e => setForm(f => ({ ...f, leave_from: e.target.value }))}
                        className={INP} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted mb-1.5 block">إلى تاريخ</label>
                      <input type="date" value={form.leave_to}
                        onChange={e => setForm(f => ({ ...f, leave_to: e.target.value }))}
                        className={INP} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted mb-1.5 block">عدد الأيام</label>
                    <input type="number" min="1" value={form.leave_days}
                      onChange={e => setForm(f => ({ ...f, leave_days: e.target.value }))}
                      placeholder="0"
                      className={INP} />
                  </div>
                </div>
              )}

              {/* Advance fields */}
              {form.request_type === REQUEST_TYPE.ADVANCE && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted mb-1.5 block">المبلغ المطلوب</label>
                    <input type="number" min="1" value={form.advance_amount}
                      onChange={e => setForm(f => ({ ...f, advance_amount: e.target.value }))}
                      placeholder="0"
                      className={INP} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted mb-1.5 block">العملة</label>
                    <select value={form.advance_currency}
                      onChange={e => setForm(f => ({ ...f, advance_currency: e.target.value }))}
                      className={INP}>
                      <option value="USD">🇺🇸 USD</option>
                      <option value="TRY">🇹🇷 TRY</option>
                      <option value="SYP">🇸🇾 SYP</option>
                      <option value="AED">🇦🇪 AED</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="text-xs font-semibold text-muted mb-1.5 block">السبب</label>
                <textarea
                  value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  rows={3}
                  className={`${INP} resize-none`}
                  placeholder="اكتب سبب الطلب…"
                />
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex gap-3 px-5 py-4 border-t border-border/40">
              <button
                onClick={handleSubmit}
                disabled={loading.action}
                className="flex-1 py-2.5 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 disabled:opacity-50 transition active:scale-95"
              >
                {loading.action ? '…جار الإرسال' : '✓ إرسال الطلب'}
              </button>
              <button
                onClick={() => { setShowForm(false); resetForm(); }}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text hover:border-teal/40 transition"
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
