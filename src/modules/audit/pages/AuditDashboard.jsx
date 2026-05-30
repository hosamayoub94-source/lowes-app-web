// =============================================================
// Audit — AuditDashboard (Admin Page)
//
// Full-screen admin view for browsing, filtering, and exporting
// the enterprise activity log.
//
// Requires admin role — enforce at the route level.
// =============================================================
import { memo, useEffect } from 'react';
import { useAudit }           from '../hooks/useAudit';
import { useAuditStore, selectActiveFilterCount, selectTotalPages } from '../store/useAuditStore';
import { AuditStatsBar }      from '../components/AuditStatsBar';
import { AuditFilters }       from '../components/AuditFilters';
import { AuditFeed }          from '../components/AuditFeed';
import { AuditExporter }      from '../components/AuditExporter';
import { USE_MOCK_AUDIT }     from '../services/auditService';

// ── Live feed indicator ──────────────────────────────────────
const LiveIndicator = memo(function LiveIndicator({ active, count, onClear }) {
  if (!active && count === 0) return null;
  return (
    <div className="flex items-center gap-2">
      {active && (
        <span className="flex items-center gap-1.5 text-xs text-teal">
          <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
          مباشر
        </span>
      )}
      {count > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs px-2 py-0.5 rounded-full bg-teal/10 text-teal font-medium hover:bg-teal hover:text-white transition-colors"
        >
          +{count} جديد
        </button>
      )}
    </div>
  );
});

// ── Error banner ─────────────────────────────────────────────
const ErrorBanner = memo(function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-bg border border-red text-red-fg text-sm">
      <span>⚠</span>
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onDismiss} className="opacity-60 hover:opacity-100">✕</button>
    </div>
  );
});

// ── Mock mode ribbon ─────────────────────────────────────────
const MockRibbon = memo(function MockRibbon() {
  if (!USE_MOCK_AUDIT) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-bg border border-amber text-amber-fg text-xs">
      <span>🧪</span>
      <span>بيانات تجريبية — اضبط <code className="font-mono">VITE_USE_MOCK_AUDIT=false</code> للتشغيل الحقيقي</span>
    </div>
  );
});

// ── Main Dashboard ───────────────────────────────────────────
export default function AuditDashboard() {
  const {
    logs, stats, liveEntries, realtimeActive,
    filters, pagination,
    loading, statsLoading, error,
    setFilter, resetFilters, goToPage,
    loadStats, clearLiveEntries, exportCSV, clearError,
  } = useAudit({ realtime: true });

  const activeFilterCount = useAuditStore(selectActiveFilterCount);
  const totalPages        = useAuditStore(selectTotalPages);

  // Refresh stats every 60 s
  useEffect(() => {
    const t = setInterval(loadStats, 60_000);
    return () => clearInterval(t);
  }, [loadStats]);

  return (
    <div className="min-h-screen bg-surface px-4 py-6 md:px-6 lg:px-8" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Page header ─────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-text">
              سجل النشاط
            </h1>
            <p className="text-sm text-muted mt-1">
              سجل مراجعة كامل — للقراءة فقط، غير قابل للتعديل
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <LiveIndicator
              active={realtimeActive}
              count={liveEntries.length}
              onClear={clearLiveEntries}
            />
            <AuditExporter onExport={exportCSV} count={pagination.total} />
          </div>
        </div>

        {/* ── Mock ribbon ──────────────────────────────────── */}
        <MockRibbon />

        {/* ── Error banner ─────────────────────────────────── */}
        <ErrorBanner message={error} onDismiss={clearError} />

        {/* ── Stats cards ──────────────────────────────────── */}
        <AuditStatsBar stats={stats} loading={statsLoading} />

        {/* ── Filters ──────────────────────────────────────── */}
        <section className="bg-surface rounded-2xl border border-border p-4">
          <AuditFilters
            filters={filters}
            onFilter={setFilter}
            onReset={resetFilters}
            activeCount={activeFilterCount}
          />
        </section>

        {/* ── Log feed ─────────────────────────────────────── */}
        <section className="space-y-0">
          {/* Section header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-text">
                السجلات
              </h2>
              {!loading && (
                <span className="text-xs text-muted bg-surface-alt px-2 py-0.5 rounded-full">
                  {pagination.total.toLocaleString('ar-SA-u-nu-latn')} إدخال
                </span>
              )}
            </div>
            {/* Page info */}
            {totalPages > 1 && (
              <span className="text-xs text-muted">
                صفحة {pagination.page} من {totalPages}
              </span>
            )}
          </div>

          <AuditFeed
            logs={logs}
            loading={loading}
            pagination={pagination}
            onPage={goToPage}
          />
        </section>

      </div>
    </div>
  );
}
