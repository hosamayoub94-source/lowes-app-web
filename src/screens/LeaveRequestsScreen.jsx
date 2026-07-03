// =============================================================
// LeaveRequestsScreen — نظام طلبات الإجازة الكامل
//
// Employee view  → submit request + history
// Manager/Admin  → approve / reject pending requests
//
// Table: leave_requests
//   id, employee_id, employee_name, type, start_date, end_date,
//   days, reason, status (pending/approved/rejected),
//   manager_note, manager_id, created_at, updated_at
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth }   from '@hooks/useAuth';
import { supabase }  from '@services/supabase';
import { ROLES }     from '@data/teams';

// ── Constants ─────────────────────────────────────────────────
const LEAVE_TYPES = {
  annual:    { label: 'سنوية',      icon: '🏖️', color: 'bg-blue-100 text-blue-700   dark:bg-blue-900/30 dark:text-blue-300'   },
  sick:      { label: 'مرضية',      icon: '🏥', color: 'bg-red-100 text-red-700     dark:bg-red-900/30 dark:text-red-300'     },
  emergency: { label: 'طارئة',      icon: '🚨', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  unpaid:    { label: 'بدون راتب', icon: '💸', color: 'bg-gray-100 text-gray-600   dark:bg-gray-800/60 dark:text-gray-400'   },
  other:     { label: 'أخرى',       icon: '📝', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
};

const STATUS_CONFIG = {
  pending:  { label: 'قيد الانتظار', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', icon: '⏳' },
  approved: { label: 'موافق عليها',  cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: '✅' },
  rejected: { label: 'مرفوضة',      cls: 'bg-red-100 text-red-700     dark:bg-red-900/30 dark:text-red-300',     icon: '❌' },
};

const MANAGER_ROLES = [ROLES.MANAGER, ROLES.ADMIN];

// Annual leave allocation per year
const ANNUAL_ALLOWANCE = 15;

// ── Helpers ────────────────────────────────────────────────────
function calcDays(start, end) {
  if (!start || !end) return 0;
  const a = new Date(start);
  const b = new Date(end);
  if (b < a) return 0;
  return Math.floor((b - a) / 86400000) + 1;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { year: 'numeric', month: 'short', day: 'numeric' });
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

// ── StatusBadge ────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── LeaveTypeBadge ─────────────────────────────────────────────
function LeaveTypeBadge({ type }) {
  const cfg = LEAVE_TYPES[type] ?? LEAVE_TYPES.other;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── RequestCard ────────────────────────────────────────────────
function RequestCard({ req, showEmployee = false }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <LeaveTypeBadge type={req.type} />
          <StatusBadge status={req.status} />
        </div>
        <span className="text-[11px] text-muted font-mono">
          {req.days} {req.days === 1 ? 'يوم' : 'أيام'}
        </span>
      </div>

      {showEmployee && (
        <p className="text-sm font-bold text-text">{req.employee_name}</p>
      )}

      <div className="flex items-center gap-2 text-xs text-muted">
        <span>📅 {fmtDate(req.start_date)}</span>
        <span>→</span>
        <span>{fmtDate(req.end_date)}</span>
      </div>

      {req.reason && (
        <p className="text-xs text-text bg-surface-alt rounded-lg px-3 py-2 leading-relaxed">
          {req.reason}
        </p>
      )}

      {req.manager_note && (
        <p className="text-xs text-muted border-t border-border pt-2 leading-relaxed">
          💬 ملاحظة المدير: {req.manager_note}
        </p>
      )}

      <p className="text-[10px] text-muted">
        {new Date(req.created_at).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { year: 'numeric', month: 'short', day: 'numeric' })}
      </p>
    </div>
  );
}

// ── ApprovalCard ───────────────────────────────────────────────
function ApprovalCard({ req, onDecide, deciding }) {
  const [note, setNote] = useState('');
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-text">{req.employee_name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <LeaveTypeBadge type={req.type} />
            <span className="text-[11px] text-muted font-mono">
              {req.days} {req.days === 1 ? 'يوم' : 'أيام'}
            </span>
          </div>
        </div>
        <p className="text-[10px] text-muted shrink-0">
          {new Date(req.created_at).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { month: 'short', day: 'numeric' })}
        </p>
      </div>

      {/* Dates */}
      <div className="flex items-center gap-2 text-xs text-muted bg-surface-alt px-3 py-2 rounded-lg">
        <span>📅 {fmtDate(req.start_date)}</span>
        <span>→</span>
        <span>{fmtDate(req.end_date)}</span>
      </div>

      {/* Reason toggle */}
      {req.reason && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-xs text-teal text-right w-full hover:underline">
          {expanded ? '▲ إخفاء السبب' : '▼ عرض السبب'}
        </button>
      )}
      {expanded && req.reason && (
        <p className="text-xs text-text leading-relaxed bg-surface-alt px-3 py-2 rounded-lg">
          {req.reason}
        </p>
      )}

      {/* Manager note */}
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="ملاحظة (اختياري)…"
        rows={2}
        className="w-full text-xs border border-border rounded-xl px-3 py-2 bg-surface text-text placeholder:text-muted resize-none focus:outline-none focus:ring-1 focus:ring-teal/40"
      />

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={deciding}
          onClick={() => onDecide(req.id, 'approved', note)}
          className="py-2.5 rounded-xl bg-green-bg border border-green-fg/20 text-green-fg text-sm font-bold hover:opacity-90 transition disabled:opacity-50">
          ✅ موافقة
        </button>
        <button
          disabled={deciding}
          onClick={() => onDecide(req.id, 'rejected', note)}
          className="py-2.5 rounded-xl bg-red-bg border border-red-fg/20 text-red-fg text-sm font-bold hover:opacity-90 transition disabled:opacity-50">
          ❌ رفض
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
export default function LeaveRequestsScreen() {
  const { id: userId, name: userName, role, team: userTeam } = useAuth();
  const isManager = MANAGER_ROLES.includes(role);

  // Tabs
  const [tab, setTab] = useState('my'); // 'my' | 'approvals'

  // My requests
  const [myRequests,   setMyRequests]   = useState([]);
  const [myLoading,    setMyLoading]    = useState(true);

  // Approval queue (managers)
  const [pending,      setPending]      = useState([]);
  const [pendingLoad,  setPendingLoad]  = useState(false);
  const [deciding,     setDeciding]     = useState(false);

  // Submit form
  const [showForm,  setShowForm]  = useState(false);
  const [formData,  setFormData]  = useState({ type: 'annual', start: '', end: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formMsg,   setFormMsg]   = useState(null);

  // Leave balance (used annual days this year)
  const [usedAnnual, setUsedAnnual] = useState(0);

  // ── Load my requests ─────────────────────────────────────────
  const loadMyRequests = useCallback(async () => {
    if (!userId) return;
    setMyLoading(true);
    try {
      const { data } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('employee_id', userId)
        .order('created_at', { ascending: false });

      const rows = data ?? [];
      setMyRequests(rows);

      // Compute used annual days this year
      const year = new Date().getFullYear();
      const used = rows
        .filter(r => r.type === 'annual' && r.status === 'approved' &&
                     new Date(r.start_date).getFullYear() === year)
        .reduce((s, r) => s + (r.days || 0), 0);
      setUsedAnnual(used);
    } catch { /* silent */ }
    finally { setMyLoading(false); }
  }, [userId]);

  // ── Load pending approvals ───────────────────────────────────
  const loadPending = useCallback(async () => {
    if (!isManager) return;
    setPendingLoad(true);
    try {
      const { data } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      setPending(data ?? []);
    } catch { /* silent */ }
    finally { setPendingLoad(false); }
  }, [isManager]);

  useEffect(() => { loadMyRequests(); }, [loadMyRequests]);
  useEffect(() => {
    if (isManager && tab === 'approvals') loadPending();
  }, [tab, isManager, loadPending]);

  // ── Submit request ───────────────────────────────────────────
  const handleSubmit = async () => {
    const { type, start, end, reason } = formData;
    if (!start || !end) { setFormMsg({ type: 'err', text: 'يرجى تحديد تواريخ الإجازة' }); return; }
    const days = calcDays(start, end);
    if (days <= 0)  { setFormMsg({ type: 'err', text: 'تاريخ النهاية يجب أن يكون بعد البداية' }); return; }
    if (type === 'annual' && (usedAnnual + days) > ANNUAL_ALLOWANCE) {
      setFormMsg({ type: 'err', text: `تجاوزت رصيد الإجازة السنوي (${ANNUAL_ALLOWANCE} يوم) — متبقي: ${ANNUAL_ALLOWANCE - usedAnnual} يوم` });
      return;
    }

    setSubmitting(true);
    setFormMsg(null);
    try {
      const { error } = await supabase.from('leave_requests').insert({
        employee_id:   userId,
        employee_name: userName,
        team:          userTeam || 'غير محدد',   // عمود NOT NULL — بدونه يفشل الإدراج
        type,
        start_date:    start,
        end_date:      end,
        days,
        reason:        reason.trim() || null,
        status:        'pending',
      });
      if (error) throw error;

      // Notify all managers
      try {
        const { data: managers } = await supabase
          .from('profiles')
          .select('id')
          .in('role_type', ['manager', 'admin'])
          .eq('is_active', true);

        const { sendNotification } = await import('@modules/notifications/services/notificationService');
        for (const mgr of (managers ?? [])) {
          await sendNotification({
            userId:    mgr.id,
            type:      'leave_request',
            title:     `طلب إجازة جديد — ${userName}`,
            message:   `${LEAVE_TYPES[type]?.label ?? type} · ${days} أيام · ${fmtDate(start)} ← ${fmtDate(end)}`,
            entityType: 'leave_request',
            skipDedup:  true,
          }).catch(() => {});
        }
      } catch { /* notification failure — don't block submit */ }

      setFormMsg({ type: 'ok', text: '✅ تم إرسال الطلب بنجاح!' });
      setTimeout(() => { setShowForm(false); setFormMsg(null); setFormData({ type: 'annual', start: '', end: '', reason: '' }); }, 1600);
      loadMyRequests();
    } catch (err) {
      setFormMsg({ type: 'err', text: err.message || 'فشل إرسال الطلب' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Manager decide ───────────────────────────────────────────
  const handleDecide = async (requestId, decision, note) => {
    setDeciding(true);
    try {
      const { data: req } = await supabase
        .from('leave_requests')
        .select('employee_id, employee_name, type, days, start_date')
        .eq('id', requestId)
        .single();

      const { data: updated } = await supabase.from('leave_requests').update({
        status:       decision,
        manager_id:   userId,
        manager_note: note?.trim() || null,
        updated_at:   new Date().toISOString(),
      }).eq('id', requestId).eq('status', 'pending').select();

      // Guard against double-approval / decision-overwrite race
      if (!updated || updated.length === 0) {
        alert('هذا الطلب تمت معالجته مسبقاً');
        loadPending();
        return;
      }

      // Notify employee
      if (req) {
        const { sendNotification } = await import('@modules/notifications/services/notificationService');
        const icon = decision === 'approved' ? '✅' : '❌';
        await sendNotification({
          userId:     req.employee_id,
          type:       'leave_decision',
          title:      `${icon} طلب الإجازة ${decision === 'approved' ? 'موافق عليه' : 'مرفوض'}`,
          message:    `${LEAVE_TYPES[req.type]?.label ?? req.type} · ${req.days} أيام ${note ? `· ${note}` : ''}`,
          entityType: 'leave_request',
          entityId:   requestId,
          skipDedup:  true,
        }).catch(() => {});
      }

      setPending(p => p.filter(r => r.id !== requestId));
    } catch (err) {
      alert('فشل: ' + err.message);
    } finally {
      setDeciding(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────
  const formDays = useMemo(() => calcDays(formData.start, formData.end), [formData.start, formData.end]);
  const remaining = ANNUAL_ALLOWANCE - usedAnnual;

  const myByStatus = useMemo(() => ({
    pending:  myRequests.filter(r => r.status === 'pending'),
    approved: myRequests.filter(r => r.status === 'approved'),
    rejected: myRequests.filter(r => r.status === 'rejected'),
  }), [myRequests]);

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto space-y-4 pb-24 sm:pb-8" dir="rtl">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-teal to-cyan-600 rounded-3xl p-6 text-white shadow-xl">
        <p className="text-xs font-semibold opacity-70 mb-1">إدارة الإجازات</p>
        <h1 className="text-2xl font-extrabold mb-3">طلبات الإجازة 🏖️</h1>
        {/* Annual balance card */}
        <div className="bg-white/15 backdrop-blur rounded-2xl p-3 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xl font-extrabold">{ANNUAL_ALLOWANCE}</p>
            <p className="text-[11px] opacity-75">الرصيد السنوي</p>
          </div>
          <div>
            <p className="text-xl font-extrabold">{usedAnnual}</p>
            <p className="text-[11px] opacity-75">مستخدم</p>
          </div>
          <div>
            <p className={`text-xl font-extrabold ${remaining < 5 ? 'text-amber-300' : ''}`}>{remaining}</p>
            <p className="text-[11px] opacity-75">متبقي</p>
          </div>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      {isManager && (
        <div className="flex gap-1 bg-surface border border-border rounded-2xl p-1">
          {[
            { key: 'my',        label: 'طلباتي',  icon: '📋' },
            { key: 'approvals', label: `موافقات ${pending.length > 0 ? `(${pending.length})` : ''}`, icon: '✅' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                tab === t.key
                  ? 'bg-teal text-navy shadow-sm'
                  : 'text-muted hover:text-text'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {tab === 'my' && (
        <>
          {/* Submit button */}
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setFormMsg(null); }}
              className="w-full py-3.5 rounded-2xl bg-teal text-navy font-bold text-sm hover:opacity-90 transition-all hover:scale-[1.01] active:scale-[0.99] shadow-md">
              ＋ تقديم طلب إجازة جديد
            </button>
          )}

          {/* ── Submit Form ──────────────────────────────────── */}
          {showForm && (
            <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-text">طلب إجازة جديد</p>
                <button onClick={() => { setShowForm(false); setFormMsg(null); }}
                  className="text-muted hover:text-red-fg text-lg leading-none">✕</button>
              </div>

              {/* Type */}
              <div>
                <label className="text-xs text-muted mb-1.5 block">نوع الإجازة</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {Object.entries(LEAVE_TYPES).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => setFormData(f => ({ ...f, type: key }))}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                        formData.type === key
                          ? 'border-teal bg-teal/10 text-teal'
                          : 'border-border text-muted hover:border-teal/40'
                      }`}
                    >
                      {cfg.icon} {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted mb-1 block">من</label>
                  <input type="date" value={formData.start} min={todayISO()}
                    onChange={e => setFormData(f => ({ ...f, start: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-1 focus:ring-teal/40" />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">إلى</label>
                  <input type="date" value={formData.end} min={formData.start || todayISO()}
                    onChange={e => setFormData(f => ({ ...f, end: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-1 focus:ring-teal/40" />
                </div>
              </div>

              {/* Days preview */}
              {formDays > 0 && (
                <div className={`text-xs text-center font-semibold py-2 rounded-xl ${
                  formData.type === 'annual' && (usedAnnual + formDays) > ANNUAL_ALLOWANCE
                    ? 'bg-red-50 text-red-600 dark:bg-red-900/20'
                    : 'bg-teal/10 text-teal'
                }`}>
                  {formDays} {formDays === 1 ? 'يوم' : 'أيام'}
                  {formData.type === 'annual' && ` — سيتبقى ${remaining - formDays} من ${ANNUAL_ALLOWANCE}`}
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="text-xs text-muted mb-1 block">السبب (اختياري)</label>
                <textarea
                  value={formData.reason}
                  onChange={e => setFormData(f => ({ ...f, reason: e.target.value }))}
                  placeholder="اذكر سبب طلب الإجازة…"
                  rows={2}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text placeholder:text-muted resize-none focus:outline-none focus:ring-1 focus:ring-teal/40"
                />
              </div>

              {/* Feedback */}
              {formMsg && (
                <p className={`text-xs text-center font-semibold ${formMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
                  {formMsg.text}
                </p>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={submitting || !formData.start || !formData.end}
                className="w-full py-3 rounded-xl bg-teal text-navy font-bold text-sm hover:opacity-90 transition disabled:opacity-50">
                {submitting ? 'جاري الإرسال…' : '📤 إرسال الطلب'}
              </button>
            </div>
          )}

          {/* ── My Requests ──────────────────────────────────── */}
          {myLoading ? (
            <div className="text-center py-8 text-muted text-sm animate-pulse">جار التحميل…</div>
          ) : myRequests.length === 0 ? (
            <div className="text-center py-12 text-muted">
              <p className="text-3xl mb-2">🏖️</p>
              <p className="text-sm font-semibold">لم تقدّم أي طلب إجازة بعد</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Pending */}
              {myByStatus.pending.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">⏳ قيد الانتظار</p>
                  <div className="space-y-2">
                    {myByStatus.pending.map(r => <RequestCard key={r.id} req={r} />)}
                  </div>
                </div>
              )}
              {/* Approved */}
              {myByStatus.approved.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">✅ موافق عليها</p>
                  <div className="space-y-2">
                    {myByStatus.approved.map(r => <RequestCard key={r.id} req={r} />)}
                  </div>
                </div>
              )}
              {/* Rejected */}
              {myByStatus.rejected.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">❌ مرفوضة</p>
                  <div className="space-y-2">
                    {myByStatus.rejected.map(r => <RequestCard key={r.id} req={r} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {tab === 'approvals' && isManager && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-text">الطلبات المعلّقة</p>
            <button onClick={loadPending} className="text-xs text-teal hover:underline">تحديث</button>
          </div>

          {pendingLoad ? (
            <div className="text-center py-8 text-muted text-sm animate-pulse">جار التحميل…</div>
          ) : pending.length === 0 ? (
            <div className="text-center py-12 text-muted">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-sm font-semibold">لا توجد طلبات معلّقة</p>
              <p className="text-xs mt-1">كل الطلبات تمت معالجتها</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map(req => (
                <ApprovalCard key={req.id} req={req} onDecide={handleDecide} deciding={deciding} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
