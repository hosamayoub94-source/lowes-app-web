// =============================================================
// AttendanceScreen — daily check-in/out + today's record.
// Wired to attendanceService (mock or Supabase).
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { Hero } from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { StatCard } from '@components/ui/StatCard';
import { Button } from '@components/ui/Button';
import { EmptyState } from '@components/ui/EmptyState';
import { useAuthStore } from '@stores/authStore';
import {
  checkIn,
  checkOut,
  fetchTodayRecord,
} from '@modules/attendance/services/attendanceService';

// ── User ID helpers ────────────────────────────────────────────
/** Sync read of the Supabase user ID from localStorage token. */
function _readLocalStorageUserId() {
  try {
    const key = Object.keys(localStorage).find((k) => k.includes('auth-token'));
    if (!key) return null;
    const data = JSON.parse(localStorage.getItem(key));
    return data?.user?.id ?? null;
  } catch { return null; }
}

// ── Helpers ────────────────────────────────────────────────────
function _fmt(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleTimeString('ar-SA', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function _duration(checkInTime, checkOutTime) {
  if (!checkInTime) return '—';
  const start = new Date(checkInTime);
  const end   = checkOutTime ? new Date(checkOutTime) : new Date();
  const mins  = Math.floor((end - start) / 60_000);
  if (mins < 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} دقيقة`;
  return `${h}س ${m}د`;
}

// ── Status badge ───────────────────────────────────────────────
function StatusBadge({ record }) {
  if (!record) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-surface-alt text-muted">
        ⬜ لم تسجّل بعد
      </span>
    );
  }
  if (record.check_out_time) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-bg text-blue-fg">
        ✅ مُنصرف — {_fmt(record.check_out_time)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-bg text-green-fg">
      🟢 حاضر منذ {_fmt(record.check_in_time)}
    </span>
  );
}

// ── Main screen ────────────────────────────────────────────────
export default function AttendanceScreen() {
  const session     = useAuthStore((s) => s.session);
  const supaSession = useAuthStore((s) => s.supaSession);
  // Prefer app profile id → raw supabase user id → direct localStorage read
  const userId = session?.id ?? supaSession?.user?.id ?? _readLocalStorageUserId();

  const [record,  setRecord]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [busy,    setBusy]    = useState(false);

  // ── Load today's record ──────────────────────────────────────
  const loadRecord = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const rec = await fetchTodayRecord(userId);
      setRecord(rec ?? null);
    } catch (err) {
      setError(err?.message ?? 'تعذّر تحميل السجل');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadRecord(); }, [loadRecord]);

  // ── Check-in handler ─────────────────────────────────────────
  const handleCheckIn = useCallback(async () => {
    if (!userId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await checkIn(userId);
      await loadRecord();
    } catch (err) {
      setError(err?.message ?? 'تعذّر تسجيل الحضور');
    } finally {
      setBusy(false);
    }
  }, [userId, busy, loadRecord]);

  // ── Check-out handler ────────────────────────────────────────
  const handleCheckOut = useCallback(async () => {
    if (!userId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await checkOut(userId);
      await loadRecord();
    } catch (err) {
      setError(err?.message ?? 'تعذّر تسجيل الانصراف');
    } finally {
      setBusy(false);
    }
  }, [userId, busy, loadRecord]);

  // ── Button states ────────────────────────────────────────────
  const checkedIn  = !!record?.check_in_time;
  const checkedOut = !!record?.check_out_time;
  const canCheckIn  = !checkedIn && !loading;
  const canCheckOut = checkedIn && !checkedOut && !loading;

  // ── Derived stats ────────────────────────────────────────────
  const workedHours = record
    ? _duration(record.check_in_time, record.check_out_time)
    : '—';

  return (
    <div className="space-y-5">
      <Hero
        eyebrow="الحضور والانصراف"
        title="سجل يومك"
        subtitle="تحقّق من حالتك اليومية وسجّل الحضور أو الانصراف."
        actions={
          <>
            <Button
              variant="success"
              size="lg"
              onClick={handleCheckIn}
              disabled={!canCheckIn || busy}
            >
              {busy && canCheckIn ? '⏳' : '✅'} حضور
            </Button>
            <Button
              variant="danger"
              size="lg"
              onClick={handleCheckOut}
              disabled={!canCheckOut || busy}
            >
              {busy && canCheckOut ? '⏳' : '🚪'} انصراف
            </Button>
          </>
        }
      />

      {/* Status badge */}
      <div className="flex items-center gap-3 flex-wrap">
        <StatusBadge record={record} />
        {error && (
          <span className="text-sm text-red-500">⚠️ {error}</span>
        )}
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="وقت الحضور"
          value={record ? _fmt(record.check_in_time) : '—'}
          tone="green"
        />
        <StatCard
          label="وقت الانصراف"
          value={record ? _fmt(record.check_out_time) : '—'}
          tone="blue"
        />
        <StatCard
          label="ساعات العمل"
          value={workedHours}
          tone="amber"
        />
        <StatCard
          label="الحالة"
          value={checkedOut ? 'منصرف' : checkedIn ? 'حاضر' : 'غائب'}
          tone={checkedOut ? 'blue' : checkedIn ? 'green' : 'red'}
        />
      </div>

      {/* Today's record card */}
      <Card>
        <CardTitle>سجل اليوم</CardTitle>
        <CardSubtitle>آخر العمليات المُسجّلة</CardSubtitle>
        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-muted animate-pulse">جاري التحميل…</p>
          ) : !record ? (
            <EmptyState description="لم يتم تسجيل أي حركات بعد" />
          ) : (
            <div className="space-y-2 text-sm">
              {record.check_in_time && (
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted">🟢 تسجيل الحضور</span>
                  <span className="font-semibold text-green-fg">
                    {_fmt(record.check_in_time)}
                  </span>
                </div>
              )}
              {record.late_minutes > 0 && (
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted">⏰ تأخّر</span>
                  <span className="font-semibold text-amber-fg">
                    {record.late_minutes} دقيقة
                  </span>
                </div>
              )}
              {(record._breaks ?? []).map((b, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted">☕ استراحة {i + 1}</span>
                  <span className="font-semibold text-blue-fg">
                    {_fmt(b.start_time)} — {b.end_time ? _fmt(b.end_time) : 'جارية'}
                  </span>
                </div>
              ))}
              {record.check_out_time && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-muted">🚪 تسجيل الانصراف</span>
                  <span className="font-semibold text-red-fg">
                    {_fmt(record.check_out_time)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
