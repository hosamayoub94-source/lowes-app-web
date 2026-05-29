// =============================================================
// HolidaysScreen — عرض رصيد الإجازات + تقديم طلب سريع
// يستخدم نفس جدول leave_requests الذي يستخدمه LeaveRequestsScreen
// حتى يرى المدير الطلبات ويوافق عليها من /leave
// =============================================================
import { useEffect, useState, useCallback } from 'react';
import { Hero } from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { StatCard } from '@components/ui/StatCard';
import { Button } from '@components/ui/Button';
import { EmptyState } from '@components/ui/EmptyState';
import { useAuth } from '@hooks/useAuth';
import { supabase } from '@services/supabase';

// الرصيد السنوي الثابت (يُحسب من leave_requests إن وُجدت leave_balances)
const ANNUAL_ALLOWANCE = 21;

// ── Helpers ────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-SA', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function diffDays(from, to) {
  if (!from || !to) return 0;
  const d = (new Date(to) - new Date(from)) / 86400000;
  return Math.max(0, Math.round(d) + 1);
}

const STATUS_META = {
  pending:  { label: 'بانتظار الاعتماد', color: 'bg-amber-bg text-amber-fg border border-amber/20'  },
  approved: { label: 'مُعتمدة',          color: 'bg-green-bg text-green-fg border border-green/20'  },
  rejected: { label: 'مرفوضة',           color: 'bg-red-bg text-red-fg border border-red/20'        },
};

const LEAVE_TYPES = [
  { value: 'annual',    label: 'إجازة سنوية'     },
  { value: 'sick',      label: 'إجازة مرضية'     },
  { value: 'emergency', label: 'إجازة طارئة'     },
  { value: 'unpaid',    label: 'إجازة بدون راتب' },
];

const LEAVE_TYPE_LABEL = {
  annual: 'سنوية', sick: 'مرضية', emergency: 'طارئة', unpaid: 'بدون راتب', other: 'أخرى',
};

// ── Status badge ───────────────────────────────────────────────
function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${meta.color}`}>
      {meta.label}
    </span>
  );
}

// ── Request row ───────────────────────────────────────────────
function RequestRow({ req }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-border last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">
          {LEAVE_TYPE_LABEL[req.type] || req.type || 'إجازة'}
        </p>
        <p className="text-xs text-muted mt-0.5">
          {fmtDate(req.start_date)} — {fmtDate(req.end_date)}
          {req.days ? ` (${req.days} أيام)` : ''}
        </p>
        {req.reason && (
          <p className="text-xs text-muted mt-0.5 truncate max-w-[220px]">{req.reason}</p>
        )}
        {req.manager_note && (
          <p className="text-xs text-teal mt-0.5">💬 {req.manager_note}</p>
        )}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <StatusBadge status={req.status} />
        <span className="text-xs text-muted">{fmtDate(req.created_at)}</span>
      </div>
    </div>
  );
}

// ── New request modal ─────────────────────────────────────────
const EMPTY_FORM = { leave_type: 'annual', leave_from: '', leave_to: '', reason: '' };

function NewRequestModal({ open, onClose, onSubmitted, userId, userName, remaining }) {
  const [form,   setForm]   = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);

  const days = diffDays(form.leave_from, form.leave_to);
  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.leave_from || !form.leave_to) { setErr('يرجى تحديد تاريخ البداية والنهاية'); return; }
    if (days <= 0) { setErr('تاريخ النهاية يجب أن يكون بعد تاريخ البداية'); return; }
    if (form.leave_type === 'annual' && days > remaining) {
      setErr(`الأيام المطلوبة تتجاوز رصيدك المتاح (${remaining} يوم)`);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const { error } = await supabase.from('leave_requests').insert({
        employee_id:   userId,
        employee_name: userName,
        type:          form.leave_type,
        start_date:    form.leave_from,
        end_date:      form.leave_to,
        days:          days,
        reason:        form.reason.trim() || null,
        status:        'pending',
      });
      if (error) throw new Error(error.message);
      setForm(EMPTY_FORM);
      onSubmitted();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md bg-surface rounded-2xl shadow-xl border border-border overflow-hidden" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-text">طلب إجازة جديد</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-text text-xl leading-none">✕</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Leave type */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">نوع الإجازة</label>
            <select
              value={form.leave_type}
              onChange={e => set('leave_type', e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
            >
              {LEAVE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">من تاريخ</label>
              <input
                type="date"
                value={form.leave_from}
                min={new Date().toISOString().slice(0, 10)}
                onChange={e => set('leave_from', e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">إلى تاريخ</label>
              <input
                type="date"
                value={form.leave_to}
                min={form.leave_from || new Date().toISOString().slice(0, 10)}
                onChange={e => set('leave_to', e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
                required
              />
            </div>
          </div>

          {/* Days preview */}
          {days > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-teal/10 text-teal text-sm font-semibold">
              📅 إجمالي الأيام: {days} يوم
              {form.leave_type === 'annual' && (
                <span className="text-xs font-normal text-muted mr-auto">رصيدك: {remaining} يوم</span>
              )}
            </div>
          )}

          {/* Reason */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">السبب (اختياري)</label>
            <textarea
              value={form.reason}
              onChange={e => set('reason', e.target.value)}
              placeholder="أدخل سبب الإجازة…"
              rows={3}
              className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40 resize-none"
            />
          </div>

          {/* Error */}
          {err && (
            <p className="text-xs text-red-fg bg-red-bg rounded-xl px-3 py-2 border border-red/20">⚠️ {err}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
              إلغاء
            </Button>
            <Button type="submit" variant="teal" className="flex-1" disabled={saving}>
              {saving ? '⏳ جاري الإرسال…' : 'إرسال الطلب'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────
export default function HolidaysScreen() {
  const { id: userId, name: userName } = useAuth();
  const year = new Date().getFullYear();

  const [requests,  setRequests]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: dbErr } = await supabase
        .from('leave_requests')
        .select('id, type, start_date, end_date, days, reason, status, manager_note, created_at')
        .eq('employee_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (dbErr) throw new Error(dbErr.message);
      setRequests(data || []);
    } catch (e) {
      setError(e?.message || 'تعذّر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [userId, year]);

  useEffect(() => { load(); }, [load]);

  // ── Derived stats ──────────────────────────────────────────
  const usedAnnual = requests
    .filter(r => r.type === 'annual' && r.status === 'approved' &&
                 new Date(r.start_date).getFullYear() === year)
    .reduce((s, r) => s + (r.days || 0), 0);

  const remaining   = ANNUAL_ALLOWANCE - usedAnnual;
  const pendingCnt  = requests.filter(r => r.status === 'pending').length;
  const rejectedCnt = requests.filter(r => r.status === 'rejected').length;

  return (
    <div className="space-y-5">
      <Hero
        eyebrow="الإجازات"
        title="إجازاتي"
        subtitle="تابع رصيدك وقدّم طلباتك بسهولة."
        actions={
          <Button variant="teal" size="lg" onClick={() => setShowModal(true)}>
            + طلب إجازة
          </Button>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="رصيد متبقٍ"      value={loading ? '—' : remaining + ' يوم'} tone="green" />
        <StatCard label="مستخدم"           value={loading ? '—' : usedAnnual + ' يوم'} tone="amber" />
        <StatCard label="بانتظار اعتماد"  value={loading ? '—' : pendingCnt}          tone="blue"  />
        <StatCard label="مرفوضة"           value={loading ? '—' : rejectedCnt}         tone="red"   />
      </div>

      {/* Request history */}
      <Card>
        <CardTitle>طلباتي السابقة</CardTitle>
        <CardSubtitle>كافة طلبات الإجازة المُقدَّمة</CardSubtitle>
        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-muted animate-pulse py-4">جاري التحميل…</p>
          ) : error ? (
            <p className="text-sm text-red-fg py-2">⚠️ {error}</p>
          ) : requests.length === 0 ? (
            <EmptyState description="لا توجد طلبات إجازة بعد — اضغط «+ طلب إجازة» لتقديم طلبك" />
          ) : (
            <div>
              {requests.map(req => (
                <RequestRow key={req.id} req={req} />
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* New request modal */}
      <NewRequestModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSubmitted={load}
        userId={userId}
        userName={userName}
        remaining={remaining}
      />
    </div>
  );
}
