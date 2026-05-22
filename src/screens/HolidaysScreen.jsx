// =============================================================
// HolidaysScreen — leave balance + request history from Supabase.
// Tables: leave_balances (balance), employee_requests (requests)
// =============================================================
import { useEffect, useState, useCallback } from 'react';
import { Hero } from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { StatCard } from '@components/ui/StatCard';
import { Button } from '@components/ui/Button';
import { EmptyState } from '@components/ui/EmptyState';
import { useAuth } from '@hooks/useAuth';
import { supabase } from '@services/supabase';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-SA', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

const STATUS_META = {
  pending:   { label: 'بانتظار الاعتماد', color: 'text-amber-600 bg-amber-50' },
  approved:  { label: 'مُعتمدة',          color: 'text-green-700 bg-green-50'  },
  rejected:  { label: 'مرفوضة',           color: 'text-red-600 bg-red-50'      },
  cancelled: { label: 'ملغاة',            color: 'text-gray-500 bg-gray-100'   },
};

const LEAVE_TYPE_LABEL = {
  annual:    'إجازة سنوية',
  sick:      'إجازة مرضية',
  emergency: 'إجازة طارئة',
  unpaid:    'إجازة بدون راتب',
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${meta.color}`}>
      {meta.label}
    </span>
  );
}

function RequestRow({ req }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-border last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">
          {LEAVE_TYPE_LABEL[req.leave_type] || req.leave_type || 'إجازة'}
        </p>
        <p className="text-xs text-muted mt-0.5">
          {fmtDate(req.leave_from)} — {fmtDate(req.leave_to)}
          {req.leave_days ? ` (${req.leave_days} أيام)` : ''}
        </p>
        {req.reason && (
          <p className="text-xs text-muted mt-0.5 truncate max-w-[220px]">{req.reason}</p>
        )}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <StatusBadge status={req.status} />
        <span className="text-xs text-muted">{fmtDate(req.created_at)}</span>
      </div>
    </div>
  );
}

export default function HolidaysScreen() {
  const { id: userId } = useAuth();
  const year = new Date().getFullYear();

  const [balance,  setBalance]  = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [balRes, reqRes] = await Promise.allSettled([
        supabase
          .from('leave_balances')
          .select('total_days, used_days')
          .eq('employee_id', userId)
          .eq('year', year)
          .maybeSingle(),
        supabase
          .from('employee_requests')
          .select('id, leave_type, leave_from, leave_to, leave_days, reason, status, created_at')
          .eq('employee_id', userId)
          .eq('request_type', 'leave')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (balRes.status === 'fulfilled' && !balRes.value.error) setBalance(balRes.value.data);
      if (reqRes.status === 'fulfilled' && !reqRes.value.error) setRequests(reqRes.value.data || []);
    } catch (e) {
      setError(e?.message || 'تعذّر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [userId, year]);

  useEffect(() => { load(); }, [load]);

  const totalDays   = balance?.total_days ?? 15;
  const usedDays    = balance?.used_days  ?? 0;
  const remaining   = totalDays - usedDays;
  const pendingCnt  = requests.filter(r => r.status === 'pending').length;
  const rejectedCnt = requests.filter(r => r.status === 'rejected').length;

  return (
    <div className="space-y-5">
      <Hero
        eyebrow="الإجازات"
        title="إجازاتي"
        subtitle="تابع رصيدك وقدّم طلباتك بسهولة."
        actions={<Button variant="teal" size="lg">+ طلب إجازة</Button>}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="رصيد متبقٍ"       value={loading ? '—' : `${remaining} يوم`} tone="green" />
        <StatCard label="مستخدم"           value={loading ? '—' : `${usedDays} يوم`}  tone="amber" />
        <StatCard label="بانتظار اعتماد"  value={loading ? '—' : pendingCnt}          tone="blue"  />
        <StatCard label="مرفوضة"          value={loading ? '—' : rejectedCnt}         tone="red"   />
      </div>

      <Card>
        <CardTitle>طلباتي السابقة</CardTitle>
        <CardSubtitle>كافة طلبات الإجازة المُقدَّمة</CardSubtitle>
        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-muted animate-pulse py-4">جاري التحميل…</p>
          ) : error ? (
            <p className="text-sm text-red-500 py-2">⚠️ {error}</p>
          ) : requests.length === 0 ? (
            <EmptyState description="لا توجد طلبات إجازة بعد" />
          ) : (
            <div>{requests.map(req => <RequestRow key={req.id} req={req} />)}</div>
          )}
        </div>
      </Card>
    </div>
  );
}