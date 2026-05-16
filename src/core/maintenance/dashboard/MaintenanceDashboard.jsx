// =============================================================
// MaintenanceDashboard — Production maintenance + health panel
//
// Admin-only page at /admin/maintenance.
// Aggregates results from all maintenance subsystems:
//   Architecture, Performance, Store, Bundle, State, Cleanup,
//   Scalability, Logging, and Documentation.
//
// Ctrl+Shift+M opens as a floating modal from anywhere.
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { runArchitectureIntegrityCheck }    from '../architecture/architectureIntegrity';
import { runConsistencyAudit }              from '../architecture/codeConsistency';
import { runPerformanceCleanupAudit }       from '../performance/performanceCleanup';
import { runWorkspaceOptimizationAudit }    from '../performance/workspaceOptimizer';
import { getCacheStats }                    from '../cache/cacheStrategy';
import { runStoreOptimizationAudit }        from '../store/storeOptimizer';
import { runBundleOptimizationAudit }       from '../bundle/bundleOptimizer';
import { runWorkspaceStateAudit }           from '../state/workspaceStateOptimizer';
import { runMaintenanceToolkitAudit }       from '../devtools/maintenanceToolkit';
import { runScalabilityGuardsAudit }        from '../guards/scalabilityGuards';
import { getLogHealthReport }              from '../logging/loggingStrategy';
import { generateDocumentation }            from '../docs/documentationGenerator';

// ── Status colors ──────────────────────────────────────────────
const C = {
  pass:  'text-green-400',
  warn:  'text-amber-400',
  fail:  'text-red-400',
  info:  'text-blue-400',
  muted: 'text-white/40',
};

// ── Card ───────────────────────────────────────────────────────
function Card({ title, status, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const border = status === 'healthy' ? 'border-green-500/20'
    : status === 'warn' ? 'border-amber-500/30'
    : status === 'error' ? 'border-red-500/30'
    : 'border-white/10';

  return (
    <div className={`rounded-xl border ${border} bg-gray-900/60 overflow-hidden`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${
            status === 'healthy' ? 'bg-green-400' :
            status === 'warn'    ? 'bg-amber-400' :
            status === 'error'   ? 'bg-red-400'   : 'bg-gray-500'
          }`} />
          <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">{title}</span>
        </div>
        <span className="text-white/30 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 pb-3 pt-1">{children}</div>}
    </div>
  );
}

// ── Issue row ──────────────────────────────────────────────────
function IssueRow({ severity, message, detail }) {
  const color = severity === 'error' ? C.fail : severity === 'warn' ? C.warn : C.info;
  return (
    <div className="py-1.5 border-b border-white/5 last:border-0 text-xs">
      <div className="flex gap-2 items-start">
        <span className={`${color} flex-shrink-0 mt-0.5`}>
          {severity === 'error' ? '❌' : severity === 'warn' ? '⚠️' : 'ℹ️'}
        </span>
        <div>
          <span className="text-white/70">{message}</span>
          {detail && typeof detail === 'string' && (
            <p className="text-white/30 mt-0.5">{detail}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Score badge ────────────────────────────────────────────────
function ScoreBadge({ score }) {
  const color = score >= 80 ? 'text-green-400' : score >= 60 ? 'text-amber-400' : 'text-red-400';
  return <span className={`text-sm font-mono font-bold ${color}`}>{score}%</span>;
}

// ── Main dashboard ─────────────────────────────────────────────
export function MaintenanceDashboard() {
  const [loading,  setLoading]  = useState(false);
  const [report,   setReport]   = useState(null);
  const [lastRun,  setLastRun]  = useState(null);
  const [tab,      setTab]      = useState('overview');

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const [
        arch, consistency, perf, workspace,
        store, bundle, state, toolkit,
        scalability, logs, docs,
      ] = await Promise.allSettled([
        Promise.resolve(runArchitectureIntegrityCheck()),
        Promise.resolve(runConsistencyAudit()),
        runPerformanceCleanupAudit(),
        Promise.resolve(runWorkspaceOptimizationAudit()),
        Promise.resolve(runStoreOptimizationAudit()),
        Promise.resolve(runBundleOptimizationAudit()),
        Promise.resolve(runWorkspaceStateAudit()),
        Promise.resolve(runMaintenanceToolkitAudit()),
        Promise.resolve(runScalabilityGuardsAudit()),
        Promise.resolve(getLogHealthReport()),
        Promise.resolve(generateDocumentation()),
      ]);

      const safe = (r) => r.status === 'fulfilled' ? r.value : null;

      setReport({
        arch:         safe(arch),
        consistency:  safe(consistency),
        perf:         safe(perf),
        workspace:    safe(workspace),
        store:        safe(store),
        bundle:       safe(bundle),
        state:        safe(state),
        toolkit:      safe(toolkit),
        scalability:  safe(scalability),
        logs:         safe(logs),
        docs:         safe(docs),
        cache:        getCacheStats(),
        generatedAt:  Date.now(),
      });
      setLastRun(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { run(); }, [run]);

  const TABS = [
    { id: 'overview',      label: '📋 Overview'     },
    { id: 'architecture',  label: '🏗️ Architecture' },
    { id: 'performance',   label: '⚡ Performance'  },
    { id: 'store',         label: '🗄️ Store'        },
    { id: 'bundle',        label: '📦 Bundle'       },
    { id: 'state',         label: '💾 State'        },
    { id: 'toolkit',       label: '🔧 Toolkit'      },
    { id: 'scalability',   label: '📈 Scalability'  },
    { id: 'docs',          label: '📄 Docs'         },
  ];

  // ── Overview summary ───────────────────────────────────────
  const allIssues = report ? [
    ...(report.arch?.errors   ?? []),
    ...(report.arch?.warnings ?? []),
    ...(report.perf?.issues   ?? []),
    ...(report.store?.issues  ?? []),
    ...(report.bundle?.issues ?? []),
    ...(report.state?.issues  ?? []),
    ...(report.toolkit?.findings ?? []),
    ...(report.scalability?.violations ?? []),
  ] : [];

  const errorCount = allIssues.filter((i) => i.severity === 'error' || i.severity === 'fail' || i.status === 'error').length;
  const warnCount  = allIssues.filter((i) => i.severity === 'warn'  || i.status === 'warn').length;
  const overallHealth = errorCount > 0 ? 'error' : warnCount > 5 ? 'warn' : 'healthy';

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-6" style={{ direction: 'ltr' }}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white/90">Maintenance Dashboard</h1>
          <p className="text-xs text-white/40 mt-0.5">
            System optimization &amp; long-term maintainability · {lastRun ? `last run: ${lastRun}` : 'loading…'}
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-xs font-semibold disabled:opacity-50 transition-colors"
        >
          {loading ? '⏳ Running…' : '↻ Refresh'}
        </button>
      </div>

      {/* Summary strip */}
      {report && (
        <div className="flex flex-wrap gap-3 mb-5">
          {[
            { label: 'Errors',      val: errorCount, bad: errorCount > 0  },
            { label: 'Warnings',    val: warnCount,  bad: warnCount > 5   },
            { label: 'Modules',     val: report.docs?.stats?.moduleCount ?? '—', bad: false },
            { label: 'Events',      val: report.docs?.stats?.eventCount  ?? '—', bad: false },
            { label: 'Cache size',  val: `${report.cache?.size ?? 0} keys`, bad: false },
            { label: 'MFE score',   val: `${report.scalability?.mfeReadiness?.score ?? 0}%`, bad: (report.scalability?.mfeReadiness?.score ?? 100) < 80 },
          ].map(({ label, val, bad }) => (
            <div key={label} className={`flex flex-col items-center px-3 py-2 rounded-lg border ${bad ? 'border-amber-500/40 bg-amber-900/20' : 'border-white/10 bg-gray-900/60'}`}>
              <span className={`text-base font-mono font-bold ${bad ? 'text-amber-400' : 'text-green-400'}`}>{val}</span>
              <span className="text-[10px] text-white/40 mt-0.5">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
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

      {loading && !report && (
        <div className="flex items-center justify-center h-40 text-white/30 text-sm animate-pulse">
          Running maintenance audits across all subsystems…
        </div>
      )}

      {report && (
        <div className="space-y-3">
          {/* OVERVIEW */}
          {tab === 'overview' && (
            <>
              <Card title="Overall Health" status={overallHealth} defaultOpen>
                <p className="text-xs text-white/60 mb-3">
                  {errorCount === 0 && warnCount === 0
                    ? '✅ All systems healthy — no issues detected.'
                    : `Found ${errorCount} error(s) and ${warnCount} warning(s) across all subsystems.`}
                </p>
                {allIssues.slice(0, 15).map((issue, i) => (
                  <IssueRow
                    key={i}
                    severity={issue.severity ?? issue.status ?? 'info'}
                    message={issue.message ?? issue.detail ?? JSON.stringify(issue).slice(0, 100)}
                  />
                ))}
                {allIssues.length > 15 && (
                  <p className="text-xs text-white/30 mt-2">…and {allIssues.length - 15} more — check individual tabs</p>
                )}
              </Card>

              <Card title="Cache Statistics" status="healthy">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    ['Size', report.cache.size],
                    ['Hit ratio', `${report.cache.hitRatio}%`],
                    ['Fresh', report.cache.freshEntries],
                    ['Stale', report.cache.staleEntries],
                    ['Hits', report.cache.stats.hits],
                    ['Misses', report.cache.stats.misses],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-gray-800/60 rounded p-2">
                      <div className="text-white/40 text-[10px]">{k}</div>
                      <div className="text-white/80 font-mono font-bold mt-0.5">{v}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {/* ARCHITECTURE */}
          {tab === 'architecture' && report.arch && (
            <>
              <Card title={`Architecture Integrity — ${report.arch.overall}`} status={report.arch.overall === 'PASS' ? 'healthy' : report.arch.overall === 'WARN' ? 'warn' : 'error'} defaultOpen>
                {report.arch.errors.map((e, i) => <IssueRow key={i} severity="error" message={e.detail ?? e.rule} />)}
                {report.arch.warnings.map((w, i) => <IssueRow key={i} severity="warn" message={w.detail ?? w.rule} />)}
                {report.arch.passes.map((p, i) => <IssueRow key={i} severity="info" message={`✓ ${p.detail ?? p.rule}`} />)}
              </Card>
              <Card title={`Code Consistency — ${report.consistency?.overall}`} status={report.consistency?.overall === 'PASS' ? 'healthy' : 'warn'}>
                {(report.consistency?.results ?? []).map((r, i) => (
                  <IssueRow key={i} severity={r.status === 'pass' ? 'info' : r.status} message={r.message} />
                ))}
              </Card>
            </>
          )}

          {/* PERFORMANCE */}
          {tab === 'performance' && (
            <>
              <Card title="Performance Issues" status={report.perf?.healthy ? 'healthy' : 'warn'} defaultOpen>
                {(report.perf?.issues ?? []).length === 0
                  ? <p className="text-xs text-green-400">✓ No performance issues found.</p>
                  : (report.perf?.issues ?? []).map((i, idx) => <IssueRow key={idx} severity={i.severity} message={i.message} />)
                }
              </Card>
              <Card title="Workspace Optimization" status={report.workspace?.healthy ? 'healthy' : 'warn'}>
                {(report.workspace?.issues ?? []).length === 0
                  ? <p className="text-xs text-green-400">✓ No workspace optimization issues.</p>
                  : (report.workspace?.issues ?? []).map((i, idx) => <IssueRow key={idx} severity={i.severity} message={i.category} />)
                }
              </Card>
            </>
          )}

          {/* STORE */}
          {tab === 'store' && report.store && (
            <Card title="Store Optimization" status={report.store.healthy ? 'healthy' : 'warn'} defaultOpen>
              {report.store.details.sizeAudit.stores.map((s) => (
                <div key={s.key} className="flex justify-between py-1 border-b border-white/5 last:border-0 text-xs">
                  <span className="text-white/60 font-mono truncate">{s.key}</span>
                  <span className={`font-mono ${s.oversized ? 'text-red-400' : 'text-green-400'}`}>{s.kb}KB</span>
                </div>
              ))}
              {report.store.issues.map((i, idx) => <IssueRow key={idx} severity={i.severity ?? 'warn'} message={i.message} />)}
            </Card>
          )}

          {/* BUNDLE */}
          {tab === 'bundle' && report.bundle && (
            <Card title="Bundle Analysis" status={report.bundle.healthy ? 'healthy' : 'warn'} defaultOpen>
              {report.bundle.issues.map((i, idx) => <IssueRow key={idx} severity={i.severity} message={i.message} detail={i.detail} />)}
              {report.bundle.details.startupAudit && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {[
                    ['TTFB', `${report.bundle.details.startupAudit.ttfb}ms`],
                    ['DOM Complete', `${report.bundle.details.startupAudit.domComplete}ms`],
                    ['Total JS', `${report.bundle.details.startupAudit.totalChunksKB}KB`],
                    ['Chunks', report.bundle.details.startupAudit.chunkCount],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-gray-800/60 rounded p-2">
                      <div className="text-white/40 text-[10px]">{k}</div>
                      <div className="text-white/80 font-mono font-bold mt-0.5">{v}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* STATE */}
          {tab === 'state' && report.state && (
            <Card title="Workspace State" status={report.state.healthy ? 'healthy' : 'error'} defaultOpen>
              {Object.entries(report.state.details.validation).map(([name, result]) => (
                <div key={name} className="flex justify-between py-1 border-b border-white/5 last:border-0 text-xs">
                  <span className="text-white/60">{name}</span>
                  <span className={result.status === 'ok' ? C.pass : result.status === 'missing' ? C.muted : C.fail}>{result.status}</span>
                </div>
              ))}
              {report.state.issues.map((i, idx) => <IssueRow key={idx} severity={i.severity} message={i.message ?? i.type} />)}
            </Card>
          )}

          {/* TOOLKIT */}
          {tab === 'toolkit' && report.toolkit && (
            <Card title="Maintenance Findings" status={report.toolkit.healthy ? 'healthy' : 'warn'} defaultOpen>
              {report.toolkit.findings.length === 0
                ? <p className="text-xs text-green-400">✓ No maintenance findings.</p>
                : report.toolkit.findings.map((f, i) => <IssueRow key={i} severity={f.severity} message={f.message} />)
              }
            </Card>
          )}

          {/* SCALABILITY */}
          {tab === 'scalability' && report.scalability && (
            <>
              <Card title="Scalability Guards" status={report.scalability.healthy ? 'healthy' : 'warn'} defaultOpen>
                {report.scalability.violations.length === 0
                  ? <p className="text-xs text-green-400">✓ No scalability violations.</p>
                  : report.scalability.violations.map((v, i) => <IssueRow key={i} severity="warn" message={v.message} detail={v.advice} />)
                }
              </Card>
              <Card title="Microfrontend Readiness">
                <div className="flex items-center gap-3 mb-2">
                  <ScoreBadge score={report.scalability.mfeReadiness.score} />
                  <span className="text-xs text-white/50">{report.scalability.mfeReadiness.ready ? 'MFE-ready' : 'Not MFE-ready'}</span>
                </div>
                {report.scalability.mfeReadiness.issues.map((i, idx) => <IssueRow key={idx} severity="warn" message={i.message} />)}
              </Card>
              <Card title="Multi-Tenant Readiness">
                <div className="flex items-center gap-3 mb-2">
                  <ScoreBadge score={report.scalability.tenantReadiness.score} />
                </div>
                {report.scalability.tenantReadiness.checks.map((c, i) => (
                  <IssueRow key={i} severity={c.pass ? 'info' : 'warn'} message={c.message} />
                ))}
              </Card>
            </>
          )}

          {/* DOCS */}
          {tab === 'docs' && report.docs && (
            <>
              <Card title="Module Map" defaultOpen status="healthy">
                {report.docs.modules.map((m) => (
                  <div key={m.name} className="py-1.5 border-b border-white/5 last:border-0 text-xs">
                    <div className="flex justify-between">
                      <span className="text-white/80 font-semibold">{m.name}</span>
                      <span className="text-white/30">{m.routes?.join(', ')}</span>
                    </div>
                    <p className="text-white/40 mt-0.5">{m.services?.join(', ')}</p>
                  </div>
                ))}
              </Card>
              <Card title="Event Catalog" status="healthy">
                {report.docs.events.slice(0, 20).map((e) => (
                  <div key={e.type} className="py-1 border-b border-white/5 last:border-0 text-xs">
                    <span className="text-blue-400 font-mono">{e.type}</span>
                    <span className="text-white/40 ml-2">{e.description}</span>
                  </div>
                ))}
              </Card>
            </>
          )}
        </div>
      )}

      <div className="mt-6 text-center text-[10px] text-white/20 font-mono">
        Maintenance Dashboard · {report ? new Date(report.generatedAt).toLocaleString() : '—'}
      </div>
    </div>
  );
}

// ── Modal overlay — Ctrl+Shift+M ──────────────────────────────
export function MaintenanceDashboardModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') {
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
      className="fixed inset-0 z-[10020] bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div className="w-full max-w-5xl min-h-[75vh] rounded-2xl overflow-hidden shadow-2xl border border-white/10 mt-8">
        <div className="flex items-center justify-between bg-gray-900 px-4 py-2 border-b border-white/10">
          <span className="text-xs text-white/50 font-mono">Maintenance Dashboard (Ctrl+Shift+M)</span>
          <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white text-sm">✕</button>
        </div>
        <MaintenanceDashboard />
      </div>
    </div>
  );
}

export default MaintenanceDashboard;
