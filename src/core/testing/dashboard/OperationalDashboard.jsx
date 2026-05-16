// =============================================================
// OperationalDashboard — Admin QA + system readiness panel
//
// Accessible via /admin/qa (ADMIN only).
// Shows: overall readiness, health checks, env status,
//        performance hotspots, queue state, migration status,
//        recent errors, realtime stats.
//
// Ctrl+Shift+Q to open from anywhere (DEV + PROD).
// =============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { buildSystemSnapshot, getQuickStatus }       from './operationalDashboard';
import { formatChecklistMarkdown }                   from '../release/releaseChecklist';

// ── Status color map ───────────────────────────────────────────
const STATUS_COLOR = {
  READY:    { bg: 'bg-green-900/40',  text: 'text-green-400',  border: 'border-green-500/40' },
  CAUTION:  { bg: 'bg-amber-900/40',  text: 'text-amber-400',  border: 'border-amber-500/40' },
  BLOCKED:  { bg: 'bg-red-900/40',    text: 'text-red-400',    border: 'border-red-500/40'   },
  UNKNOWN:  { bg: 'bg-gray-800/40',   text: 'text-gray-400',   border: 'border-gray-600/40'  },
  pass:     'text-green-400',
  warn:     'text-amber-400',
  fail:     'text-red-400',
  skip:     'text-gray-500',
  pending:  'text-blue-400',
  success:  'text-green-400',
  error:    'text-red-400',
};

// ── Section card ───────────────────────────────────────────────
function Card({ title, children, badge = null, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">{title}</span>
        <div className="flex items-center gap-2">
          {badge}
          <span className="text-white/30 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && <div className="px-4 pb-3 pt-1">{children}</div>}
    </div>
  );
}

// ── Status pill ────────────────────────────────────────────────
function Pill({ status, label }) {
  const cls = STATUS_COLOR[status] ?? 'text-gray-400';
  const text = typeof cls === 'object' ? cls.text : cls;
  return (
    <span className={`text-[10px] font-mono font-bold ${text}`}>
      {label ?? status?.toUpperCase()}
    </span>
  );
}

// ── Check row ──────────────────────────────────────────────────
function CheckRow({ name, status, message, durationMs }) {
  const color = STATUS_COLOR[status] ?? 'text-gray-400';
  const text  = typeof color === 'object' ? color.text : color;
  return (
    <div className="flex items-center justify-between py-1 border-b border-white/5 last:border-0 text-xs">
      <span className="text-white/60 truncate max-w-[55%]">{name}</span>
      <div className="flex items-center gap-2 shrink-0">
        {message && <span className="text-white/30 truncate max-w-[120px]">{message}</span>}
        {durationMs != null && <span className="text-white/20 font-mono">{durationMs}ms</span>}
        <span className={`font-mono font-bold ${text}`}>{status?.toUpperCase()}</span>
      </div>
    </div>
  );
}

// ── Overall badge ──────────────────────────────────────────────
function OverallBadge({ status }) {
  const c = STATUS_COLOR[status] ?? STATUS_COLOR.UNKNOWN;
  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${c.bg} ${c.border} ${c.text} text-sm font-bold font-mono`}>
      <span>{status === 'READY' ? '✅' : status === 'CAUTION' ? '⚠️' : status === 'BLOCKED' ? '❌' : '❓'}</span>
      {status}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────
export function OperationalDashboard() {
  const [snapshot,  setSnapshot]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [lastRun,   setLastRun]   = useState(null);
  const [quickStat, setQuickStat] = useState(null);
  const [tab,       setTab]       = useState('health'); // health | deploy | perf | queue | mig | errors
  const supabaseRef = useRef(null);

  // Load snapshot
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await buildSystemSnapshot({ supabase: supabaseRef.current });
      setSnapshot(snap);
      setLastRun(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  }, []);

  // Quick stats (sync, frequent)
  const refreshQuick = useCallback(() => setQuickStat(getQuickStatus()), []);

  useEffect(() => {
    refresh();
    refreshQuick();
    const t = setInterval(refreshQuick, 10_000);
    return () => clearInterval(t);
  }, [refresh, refreshQuick]);

  const TABS = [
    { id: 'health',  label: '🏥 Health'       },
    { id: 'deploy',  label: '🚀 Deployment'   },
    { id: 'perf',    label: '⚡ Performance'  },
    { id: 'queue',   label: '📬 Queue'        },
    { id: 'mig',     label: '🔄 Migrations'   },
    { id: 'errors',  label: '🔴 Errors'       },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans p-4 md:p-6" style={{ direction: 'ltr' }}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white/90">Operational Dashboard</h1>
          <p className="text-xs text-white/40 mt-0.5">
            QA &amp; Deployment Readiness — {lastRun ? `last run: ${lastRun}` : 'not run yet'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {snapshot && <OverallBadge status={snapshot.overall} />}
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-xs font-semibold disabled:opacity-50 transition-colors"
          >
            {loading ? '⏳ Running…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Quick stats strip */}
      {quickStat && (
        <div className="flex flex-wrap gap-3 mb-5">
          {[
            { label: 'Queue pending',  val: quickStat.queuePending,        warn: quickStat.queuePending > 10  },
            { label: 'Dead letters',   val: quickStat.queueDead,           warn: quickStat.queueDead > 0      },
            { label: 'Recent errors',  val: quickStat.recentErrors,        warn: quickStat.recentErrors > 0   },
            { label: 'Slow ops',       val: quickStat.slowOpsCount,        warn: quickStat.slowOpsCount > 0   },
            { label: 'Failed mig.',    val: quickStat.migrationsFailed,    warn: quickStat.migrationsFailed > 0 },
            { label: 'Stress active',  val: quickStat.stressRunning ? 'YES' : 'NO', warn: quickStat.stressRunning },
          ].map(({ label, val, warn }) => (
            <div key={label} className={`flex flex-col items-center px-3 py-2 rounded-lg border ${warn ? 'border-amber-500/40 bg-amber-900/20' : 'border-white/10 bg-gray-900/60'}`}>
              <span className={`text-base font-mono font-bold ${warn ? 'text-amber-400' : 'text-green-400'}`}>{val}</span>
              <span className="text-[10px] text-white/40 mt-0.5">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === t.id ? 'bg-blue-700 text-white' : 'bg-gray-800 text-white/50 hover:text-white/80'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {loading && !snapshot && (
        <div className="flex items-center justify-center h-40 text-white/30 text-sm animate-pulse">
          Running health checks &amp; readiness scans…
        </div>
      )}

      {snapshot && (
        <div className="space-y-3">
          {/* ── HEALTH TAB ─────────────────────────────────────── */}
          {tab === 'health' && (
            <>
              <Card
                title="System Health"
                badge={<Pill status={snapshot.health.overall} />}
              >
                {snapshot.health.results.length === 0
                  ? <p className="text-xs text-white/30">No checks run yet.</p>
                  : snapshot.health.results.map((r) => (
                    <CheckRow key={r.name} {...r} />
                  ))
                }
              </Card>

              {snapshot.health.failed.length > 0 && (
                <Card title="❌ Failed Checks" defaultOpen>
                  {snapshot.health.failed.map((r) => (
                    <div key={r.name} className="text-xs py-1.5 border-b border-white/5 last:border-0">
                      <div className="flex justify-between">
                        <span className="text-red-400 font-semibold">{r.name}</span>
                        <span className="text-white/30 font-mono">{r.durationMs}ms</span>
                      </div>
                      {r.message && <p className="text-white/40 mt-0.5">{r.message}</p>}
                    </div>
                  ))}
                </Card>
              )}
            </>
          )}

          {/* ── DEPLOYMENT TAB ─────────────────────────────────── */}
          {tab === 'deploy' && (
            <>
              <Card
                title="Deployment Readiness"
                badge={
                  <span className={`text-[10px] font-mono font-bold ${snapshot.deployment.ready ? 'text-green-400' : 'text-red-400'}`}>
                    {snapshot.deployment.ready ? 'READY' : 'BLOCKED'}
                  </span>
                }
              >
                {snapshot.deployment.checks.length === 0
                  ? <p className="text-xs text-white/30">No deployment checks available.</p>
                  : snapshot.deployment.checks.map((c) => (
                    <CheckRow key={c.name} name={c.name} status={c.status} message={c.message} />
                  ))
                }
              </Card>

              <Card title="Release Checklist" badge={<Pill status={snapshot.release.overall} />}>
                <div className="text-xs mb-2">
                  <span className="text-green-400">{snapshot.release.summary.pass ?? 0} pass</span>
                  {' · '}
                  <span className="text-amber-400">{snapshot.release.summary.warn ?? 0} warn</span>
                  {' · '}
                  <span className="text-red-400">{snapshot.release.summary.fail ?? 0} fail</span>
                </div>
                {snapshot.release.items.map((item) => (
                  <CheckRow key={item.name} name={item.name} status={item.status} message={item.message} />
                ))}
              </Card>
            </>
          )}

          {/* ── PERFORMANCE TAB ────────────────────────────────── */}
          {tab === 'perf' && (
            <>
              <Card title="Slow Operations (>300ms)" defaultOpen>
                {snapshot.performance.slowOps.length === 0
                  ? <p className="text-xs text-green-400">✓ No slow operations detected.</p>
                  : snapshot.performance.slowOps.map((op, i) => (
                    <div key={i} className="flex justify-between items-center py-1 border-b border-white/5 last:border-0 text-xs">
                      <span className="text-white/60 truncate max-w-[60%]">{op.name}</span>
                      <span className="text-amber-400 font-mono font-bold">{op.durationMs}ms</span>
                    </div>
                  ))
                }
              </Card>

              <Card title="Render Hotspots" defaultOpen>
                {snapshot.debug.hotspots.length === 0
                  ? <p className="text-xs text-green-400">✓ No render hotspots.</p>
                  : snapshot.debug.hotspots.map((h, i) => (
                    <div key={i} className="flex justify-between items-center py-1 border-b border-white/5 last:border-0 text-xs">
                      <span className="text-white/60">{h.component}</span>
                      <span className="text-red-400 font-mono font-bold">{h.count}x</span>
                    </div>
                  ))
                }
              </Card>
            </>
          )}

          {/* ── QUEUE TAB ──────────────────────────────────────── */}
          {tab === 'queue' && (
            <Card title="Offline Queue Stats" defaultOpen>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                {Object.entries(snapshot.queue).map(([k, v]) => (
                  typeof v !== 'object' && (
                    <div key={k} className="flex flex-col bg-gray-800/60 rounded-lg p-2">
                      <span className="text-white/40 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                      <span className={`text-base font-mono font-bold mt-1 ${
                        k === 'dead' && v > 0 ? 'text-red-400'
                        : k === 'pending' && v > 10 ? 'text-amber-400'
                        : 'text-green-400'
                      }`}>{String(v)}</span>
                    </div>
                  )
                ))}
              </div>

              <div className="mt-3 text-xs text-white/40">
                Realtime reconnects: <span className="text-white/70 font-mono">{snapshot.realtime.reconnects ?? 0}</span>
              </div>
            </Card>
          )}

          {/* ── MIGRATIONS TAB ─────────────────────────────────── */}
          {tab === 'mig' && (
            <Card
              title="Migration Status"
              badge={
                snapshot.migrations.failed.length > 0
                  ? <span className="text-[10px] text-red-400 font-mono">{snapshot.migrations.failed.length} FAILED</span>
                  : <span className="text-[10px] text-green-400 font-mono">ALL OK</span>
              }
            >
              {snapshot.migrations.all.length === 0
                ? <p className="text-xs text-white/30">No migrations registered.</p>
                : snapshot.migrations.all.map((m) => (
                  <div key={m.id} className="py-1.5 border-b border-white/5 last:border-0">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/60 font-mono truncate max-w-[55%]">{m.id}</span>
                      <Pill status={m.status} />
                    </div>
                    {m.description && <p className="text-[10px] text-white/30 mt-0.5">{m.description}</p>}
                    {m.warnings?.length > 0 && (
                      <p className="text-[10px] text-amber-400 mt-0.5">⚠️ {m.warnings.join(', ')}</p>
                    )}
                  </div>
                ))
              }
            </Card>
          )}

          {/* ── ERRORS TAB ─────────────────────────────────────── */}
          {tab === 'errors' && (
            <Card
              title="Recent Errors"
              badge={<span className={`text-[10px] font-mono ${snapshot.errors.count > 0 ? 'text-red-400' : 'text-green-400'}`}>{snapshot.errors.count}</span>}
            >
              {snapshot.errors.recent.length === 0
                ? <p className="text-xs text-green-400">✓ No recent errors.</p>
                : snapshot.errors.recent.map((err, i) => (
                  <div key={i} className="py-1.5 border-b border-white/5 last:border-0 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-red-400 font-semibold truncate max-w-[60%]">{err.message ?? err.type ?? 'Unknown error'}</span>
                      {err.ts && <span className="text-white/30 font-mono text-[10px]">{new Date(err.ts).toLocaleTimeString()}</span>}
                    </div>
                    {err.context && <p className="text-white/30 mt-0.5">{JSON.stringify(err.context).slice(0, 120)}</p>}
                  </div>
                ))
              }
            </Card>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 text-center text-[10px] text-white/20 font-mono">
        QA Dashboard · snapshot in {snapshot?.durationMs ?? 0}ms · {snapshot ? new Date(snapshot.generatedAt).toLocaleString() : '—'}
      </div>
    </div>
  );
}

// ── Modal overlay (accessible via Ctrl+Shift+Q) ───────────────
export function QADashboardModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[10010] bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div className="w-full max-w-4xl min-h-[70vh] rounded-2xl overflow-hidden shadow-2xl border border-white/10 mt-8">
        <div className="flex items-center justify-between bg-gray-900 px-4 py-2 border-b border-white/10">
          <span className="text-xs text-white/50 font-mono">QA Dashboard (Ctrl+Shift+Q)</span>
          <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white text-sm">✕</button>
        </div>
        <OperationalDashboard />
      </div>
    </div>
  );
}

export default OperationalDashboard;
