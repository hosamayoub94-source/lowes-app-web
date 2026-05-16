// =============================================================
// OperationalInsightsDashboard — Live operations monitoring UI
//
// Admin panel at /admin/operations.
// Shows real employee usage, friction, workflow health,
// productivity metrics, feedback, and improvement items.
//
// Ctrl+Shift+O opens as floating modal from anywhere.
// Auto-refreshes every 30s.
// =============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { buildDailyReport, buildHealthDigest }  from '../reports/usageReports';
import { getFrictionSummary, getFrictionByPage } from '../tracking/frictionTracker';
import { getTopPages, getTopActions, getTopErrors, getSlowWorkflows, getSessionSummary } from '../tracking/usageTracker';
import { getAllWorkflowTypes, getAttendanceConsistency, getCRMResponseMetrics } from '../metrics/workflowMetrics';
import { getProductivitySummary, getDailyActiveEmployees, getUserEngagementTiers } from '../metrics/productivityMetrics';
import { getFeedbackSummary, getFeedbackByPage }   from '../feedback/liveFeedback';
import { getHeatmapSummary }                       from '../heatmap/workspaceHeatmap';
import { generateSuggestions, getQuickWins }       from '../suggestions/uxSuggestions';
import { getImprovementSummary }                   from '../improvement/continuousImprovement';

// ── Colors ─────────────────────────────────────────────────────
const C = {
  green:  'text-green-400', amber: 'text-amber-400', red:   'text-red-400',
  blue:   'text-blue-400',  gray:  'text-white/40',  white: 'text-white/80',
};

// ── Shared components ──────────────────────────────────────────
function Card({ title, children, badge, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/60 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/5 transition-colors">
        <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">{title}</span>
        <div className="flex items-center gap-2">{badge}<span className="text-white/30 text-xs">{open ? '▲' : '▼'}</span></div>
      </button>
      {open && <div className="px-4 pb-3 pt-1">{children}</div>}
    </div>
  );
}

function StatRow({ label, value, color = C.white }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-white/5 last:border-0 text-xs">
      <span className="text-white/50">{label}</span>
      <span className={`font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}

function BarMini({ value, max, color = 'bg-blue-500' }) {
  const pct = max > 0 ? Math.round(value / max * 100) : 0;
  return (
    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden mx-2">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SeverityDot({ severity }) {
  const c = severity === 'critical' || severity === 'error' ? 'bg-red-400'
    : severity === 'high' || severity === 'warn' ? 'bg-amber-400'
    : 'bg-blue-400';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${c} mr-1.5`} />;
}

// ── Tab bar ────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',      label: '📊 Overview'      },
  { id: 'usage',         label: '👆 Usage'          },
  { id: 'workflows',     label: '⚡ Workflows'      },
  { id: 'friction',      label: '🔥 Friction'       },
  { id: 'employees',     label: '👥 Employees'      },
  { id: 'feedback',      label: '💬 Feedback'       },
  { id: 'heatmap',       label: '🗺️ Heatmap'        },
  { id: 'suggestions',   label: '💡 Suggestions'    },
  { id: 'improvements',  label: '📈 Improvements'   },
];

// ── Main component ─────────────────────────────────────────────
export function OperationalInsightsDashboard() {
  const [tab,     setTab]     = useState('overview');
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const timerRef              = useRef(null);

  const refresh = useCallback(() => {
    setLoading(true);
    try {
      setData({
        report:         buildDailyReport(),
        digest:         buildHealthDigest(),
        friction:       getFrictionSummary(),
        frictionByPage: getFrictionByPage(),
        pages:          getTopPages(10),
        actions:        getTopActions(10),
        errors:         getTopErrors(5),
        slows:          getSlowWorkflows(),
        session:        getSessionSummary(),
        workflows:      getAllWorkflowTypes(),
        attendance:     getAttendanceConsistency(),
        crm:            getCRMResponseMetrics(),
        productivity:   getProductivitySummary(),
        dae:            getDailyActiveEmployees(),
        tiers:          getUserEngagementTiers(),
        feedback:       getFeedbackSummary(),
        feedbackByPage: getFeedbackByPage(),
        heatmap:        getHeatmapSummary(),
        suggestions:    generateSuggestions(),
        quickWins:      getQuickWins(),
        improvements:   getImprovementSummary(),
      });
      setLastRun(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Dashboard refresh error', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, 30_000);
    return () => clearInterval(timerRef.current);
  }, [refresh]);

  const d = data;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-6" style={{ direction: 'ltr' }}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-white/90">Operational Insights</h1>
          <p className="text-xs text-white/40 mt-0.5">Live employee usage · {lastRun ? `updated ${lastRun}` : 'loading…'}</p>
        </div>
        <div className="flex items-center gap-3">
          {d?.digest && (
            <span className={`text-xs font-mono font-bold px-3 py-1.5 rounded-full border ${
              d.digest.overall === 'healthy'   ? 'text-green-400 border-green-500/40 bg-green-900/20' :
              d.digest.overall === 'attention' ? 'text-amber-400 border-amber-500/40 bg-amber-900/20' :
              'text-red-400 border-red-500/40 bg-red-900/20'
            }`}>{d.digest.overall.toUpperCase()}</span>
          )}
          <button onClick={refresh} disabled={loading} className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-xs font-semibold disabled:opacity-50">
            {loading ? '⏳' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Summary strip */}
      {d && (
        <div className="flex flex-wrap gap-2 mb-5">
          {[
            { label: 'Active today',   val: d.dae.today,                     bad: false },
            { label: 'Total actions',  val: d.report.operations.totalActions, bad: false },
            { label: 'Errors',         val: d.report.operations.errorsRecorded, bad: d.report.operations.errorsRecorded > 5 },
            { label: 'Friction score', val: `${d.friction.healthScore}%`,     bad: d.friction.healthScore < 70 },
            { label: 'Sentiment',      val: d.feedback.sentiment !== null ? `${d.feedback.sentiment}%` : 'N/A', bad: (d.feedback.sentiment ?? 100) < 50 },
            { label: 'Slow workflows', val: d.slows.length,                   bad: d.slows.length > 3 },
          ].map(({ label, val, bad }) => (
            <div key={label} className={`flex flex-col items-center px-3 py-2 rounded-lg border ${bad ? 'border-amber-500/40 bg-amber-900/20' : 'border-white/10 bg-gray-900/60'}`}>
              <span className={`text-base font-mono font-bold ${bad ? C.amber : C.green}`}>{val}</span>
              <span className="text-[10px] text-white/40 mt-0.5">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-none">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === t.id ? 'bg-blue-700 text-white' : 'bg-gray-800 text-white/50 hover:text-white/80'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {!d && <div className="text-center text-white/30 text-sm py-20 animate-pulse">Collecting live usage data…</div>}

      {d && (
        <div className="space-y-3">
          {/* OVERVIEW */}
          {tab === 'overview' && (
            <>
              {d.digest.issues.length > 0 && (
                <Card title="⚠️ Active Issues" defaultOpen>
                  {d.digest.issues.map((i, idx) => (
                    <div key={idx} className="flex items-center gap-2 py-1 border-b border-white/5 last:border-0 text-xs">
                      <SeverityDot severity={i.severity} />
                      <span className="text-white/70">{i.message}</span>
                    </div>
                  ))}
                </Card>
              )}
              <Card title="Operations Summary">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    ['Active employees', d.dae.today],
                    ['Workflows run', d.report.operations.workflowsRun],
                    ['Total actions', d.report.operations.totalActions],
                    ['Errors', d.report.operations.errorsRecorded],
                    ['Slow ops', d.slows.length],
                    ['Quick wins', d.quickWins.length],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-gray-800/60 rounded-lg p-2">
                      <div className="text-white/40 text-[10px]">{k}</div>
                      <div className="text-white/90 font-mono font-bold mt-0.5">{v}</div>
                    </div>
                  ))}
                </div>
              </Card>
              {d.quickWins.length > 0 && (
                <Card title="💡 Quick Wins">
                  {d.quickWins.map((s) => (
                    <div key={s.id} className="py-1.5 border-b border-white/5 last:border-0 text-xs">
                      <div className="flex items-center gap-1">
                        <SeverityDot severity={s.priority} />
                        <span className="text-white/80 font-semibold">{s.title}</span>
                      </div>
                      <p className="text-white/40 mt-0.5 ml-3">{s.detail}</p>
                    </div>
                  ))}
                </Card>
              )}
            </>
          )}

          {/* USAGE */}
          {tab === 'usage' && (
            <>
              <Card title="Top Pages">
                {d.pages.map((p) => (
                  <div key={p.page} className="flex items-center py-1.5 border-b border-white/5 last:border-0 text-xs">
                    <span className="text-white/60 w-40 truncate">{p.page}</span>
                    <BarMini value={p.visits} max={d.pages[0]?.visits ?? 1} />
                    <span className="text-white/60 font-mono w-16 text-right">{p.visits}× {Math.round(p.avgDwellMs / 1000)}s</span>
                  </div>
                ))}
              </Card>
              <Card title="Top Actions">
                {d.actions.map((a) => (
                  <div key={a.action} className="flex items-center py-1.5 border-b border-white/5 last:border-0 text-xs">
                    <span className="text-white/60 truncate flex-1 font-mono">{a.action}</span>
                    <BarMini value={a.count} max={d.actions[0]?.count ?? 1} />
                    <span className="text-white/60 font-mono w-10 text-right">{a.count}×</span>
                  </div>
                ))}
              </Card>
              {d.errors.length > 0 && (
                <Card title={`❌ Top Errors (${d.errors.length})`}>
                  {d.errors.map((e) => (
                    <StatRow key={e.key} label={e.key} value={`${e.count}×`} color={C.red} />
                  ))}
                </Card>
              )}
            </>
          )}

          {/* WORKFLOWS */}
          {tab === 'workflows' && (
            <>
              <Card title="Workflow Performance">
                {d.workflows.length === 0
                  ? <p className="text-xs text-white/30">No workflow data yet — workflows will appear as employees use the app.</p>
                  : d.workflows.map((w) => (
                    <div key={w.workflowType} className="py-1.5 border-b border-white/5 last:border-0 text-xs">
                      <div className="flex justify-between">
                        <span className="text-white/70 font-mono">{w.workflowType}</span>
                        <span className={`font-bold ${w.successRate >= 90 ? C.green : w.successRate >= 70 ? C.amber : C.red}`}>{w.successRate}%</span>
                      </div>
                      <div className="flex gap-3 mt-0.5 text-white/40">
                        <span>avg {Math.round(w.avgMs / 1000)}s</span>
                        <span>p90 {Math.round(w.p90Ms / 1000)}s</span>
                        <span>{w.count} runs</span>
                      </div>
                    </div>
                  ))
                }
              </Card>
              {d.slows.length > 0 && (
                <Card title="🐢 Slow Workflows">
                  {d.slows.map((s) => (
                    <div key={s.workflow} className="py-1.5 border-b border-white/5 last:border-0 text-xs">
                      <div className="flex justify-between">
                        <span className="text-white/70">{s.workflow}</span>
                        <span className={C.amber}>{Math.round(s.avgDurationMs / 1000)}s avg</span>
                      </div>
                      <span className="text-white/30">occurred {s.count}×, max {Math.round(s.maxDurationMs / 1000)}s</span>
                    </div>
                  ))}
                </Card>
              )}
              <Card title="Attendance + CRM Metrics">
                {d.attendance.count > 0 && <StatRow label="Check-in consistency" value={d.attendance.consistent ? '✓ Consistent' : '✗ Variable'} color={d.attendance.consistent ? C.green : C.amber} />}
                {d.attendance.avgCheckInTime && <StatRow label="Avg check-in time" value={d.attendance.avgCheckInTime} />}
                {d.crm.count > 0 && <StatRow label="CRM workflows" value={d.crm.count} />}
                {d.crm.avgMs && <StatRow label="CRM avg response" value={`${Math.round(d.crm.avgMs / 1000)}s`} />}
              </Card>
            </>
          )}

          {/* FRICTION */}
          {tab === 'friction' && (
            <>
              <Card title="Friction Summary">
                <StatRow label="Health score"    value={`${d.friction.healthScore}/100`} color={d.friction.healthScore >= 80 ? C.green : d.friction.healthScore >= 60 ? C.amber : C.red} />
                <StatRow label="Rage clicks"     value={d.friction.rageClickCount} color={d.friction.rageClickCount > 5 ? C.red : C.white} />
                <StatRow label="Abandoned actions" value={d.friction.abandonedCount} color={d.friction.abandonedCount > 3 ? C.amber : C.white} />
                <StatRow label="Action loops"    value={d.friction.loopCount} />
                <StatRow label="Total events"    value={d.friction.total} />
              </Card>
              <Card title="Friction by Page">
                {d.frictionByPage.map((p) => (
                  <div key={p.page} className="flex items-center py-1.5 border-b border-white/5 last:border-0 text-xs">
                    <span className="text-white/60 w-36 truncate">{p.page}</span>
                    <BarMini value={p.count} max={d.frictionByPage[0]?.count ?? 1} color="bg-red-500" />
                    <span className="text-red-400 font-mono w-8 text-right">{p.count}</span>
                  </div>
                ))}
              </Card>
              {d.friction.topFrictions.length > 0 && (
                <Card title="Top Friction Types">
                  {d.friction.topFrictions.map(([type, count]) => (
                    <StatRow key={type} label={type} value={`${count}×`} color={C.amber} />
                  ))}
                </Card>
              )}
            </>
          )}

          {/* EMPLOYEES */}
          {tab === 'employees' && (
            <>
              <Card title="Daily Active Employees">
                {d.dae.last7Days.map((day) => (
                  <div key={day.date} className="flex items-center py-1 border-b border-white/5 last:border-0 text-xs">
                    <span className="text-white/40 w-24">{day.date}</span>
                    <BarMini value={day.count} max={Math.max(...d.dae.last7Days.map((d) => d.count), 1)} />
                    <span className="text-white/70 font-mono w-8 text-right">{day.count}</span>
                  </div>
                ))}
              </Card>
              <Card title="Engagement Tiers">
                <StatRow label="⚡ Power users"    value={d.tiers.power.length}      color={C.green} />
                <StatRow label="✅ Regular users"  value={d.tiers.regular.length}    color={C.blue} />
                <StatRow label="⏱ Occasional"      value={d.tiers.occasional.length} color={C.amber} />
                <StatRow label="💤 Inactive"        value={d.tiers.inactive.length}   color={C.gray} />
              </Card>
              <Card title="Feature Adoption">
                {d.report.employees.features.slice(0, 8).map((f) => (
                  <div key={f.feature} className="flex items-center py-1 border-b border-white/5 last:border-0 text-xs">
                    <span className="text-white/60 flex-1 truncate">{f.feature}</span>
                    <span className="text-white/60 font-mono">{f.userCount} users</span>
                  </div>
                ))}
              </Card>
            </>
          )}

          {/* FEEDBACK */}
          {tab === 'feedback' && (
            <>
              <Card title="Feedback Summary">
                <StatRow label="Sentiment"   value={d.feedback.sentiment !== null ? `${d.feedback.sentiment}%` : 'N/A'} color={d.feedback.sentiment >= 70 ? C.green : d.feedback.sentiment >= 50 ? C.amber : C.red} />
                <StatRow label="Total"       value={d.feedback.total} />
                <StatRow label="Positive"    value={d.feedback.positiveCount}  color={C.green} />
                <StatRow label="Negative"    value={d.feedback.negativeCount}  color={C.red} />
                <StatRow label="Suggestions" value={d.feedback.suggestionCount} color={C.blue} />
                <StatRow label="Complaints"  value={d.feedback.complaintCount}  color={C.amber} />
              </Card>
              <Card title="Feedback by Page">
                {d.feedbackByPage.slice(0, 8).map((p) => (
                  <div key={p.page} className="py-1.5 border-b border-white/5 last:border-0 text-xs">
                    <div className="flex justify-between">
                      <span className="text-white/60">{p.page}</span>
                      <span className={`font-bold ${p.healthScore >= 70 ? C.green : C.amber}`}>{p.healthScore}%</span>
                    </div>
                    <span className="text-white/30">👍 {p.positive}  👎 {p.negative}  ⚠️ {p.friction}</span>
                  </div>
                ))}
              </Card>
            </>
          )}

          {/* HEATMAP */}
          {tab === 'heatmap' && (
            <>
              <Card title="Hot Zones">
                {d.heatmap.hotZones.length === 0
                  ? <p className="text-xs text-white/30">No heat data yet. Interactions will appear as employees use the app.</p>
                  : d.heatmap.hotZones.map((z) => (
                    <div key={z.zone} className="flex items-center py-1 border-b border-white/5 last:border-0 text-xs">
                      <span className="text-white/60 w-44 truncate font-mono">{z.zone}</span>
                      <BarMini value={z.intensity} max={100} color="bg-orange-500" />
                      <span className="text-orange-400 font-mono w-12 text-right">{z.clicks} clicks</span>
                    </div>
                  ))
                }
              </Card>
              <Card title="Peak Hours">
                <div className="grid grid-cols-12 gap-0.5 mt-1">
                  {d.heatmap.hourly.map((h) => (
                    <div key={h.hour} className="flex flex-col items-center">
                      <div className="w-full bg-gray-800 rounded-sm" style={{ height: `${Math.max(4, h.intensity * 0.4)}px`, background: h.intensity > 60 ? '#f97316' : h.intensity > 30 ? '#3b82f6' : '#374151' }} />
                      <span className="text-[8px] text-white/20 mt-0.5">{h.hour}</span>
                    </div>
                  ))}
                </div>
                {d.heatmap.peakHour && <p className="text-xs text-white/40 mt-2">Peak hour: {d.heatmap.peakHour.label}</p>}
              </Card>
              {d.heatmap.neglected.length > 0 && (
                <Card title="Neglected Areas">
                  {d.heatmap.neglected.slice(0, 6).map((z) => (
                    <StatRow key={z.zone} label={z.zone} value={z.reason} color={C.gray} />
                  ))}
                </Card>
              )}
            </>
          )}

          {/* SUGGESTIONS */}
          {tab === 'suggestions' && (
            <Card title={`UX Improvement Suggestions (${d.suggestions.total})`} defaultOpen>
              {d.suggestions.suggestions.length === 0
                ? <p className="text-xs text-white/30">No suggestions yet — collect more usage data first.</p>
                : d.suggestions.suggestions.map((s) => (
                  <div key={s.id} className="py-2 border-b border-white/5 last:border-0 text-xs">
                    <div className="flex items-center gap-1.5">
                      <SeverityDot severity={s.priority} />
                      <span className="text-white/80 font-semibold">{s.title}</span>
                      <span className="text-white/30 ml-auto">{s.category}</span>
                    </div>
                    <p className="text-white/40 mt-0.5 ml-3">{s.detail}</p>
                  </div>
                ))
              }
            </Card>
          )}

          {/* IMPROVEMENTS */}
          {tab === 'improvements' && (
            <>
              <Card title="Improvement Velocity">
                <StatRow label="Open items"       value={d.improvements.velocity.openCount} />
                <StatRow label="In progress"      value={d.improvements.velocity.inProgressCount} />
                <StatRow label="Resolved (7d)"    value={d.improvements.velocity.resolvedLast7Days} color={C.green} />
                <StatRow label="Resolution time"  value={d.improvements.velocity.avgResolutionDays ? `${d.improvements.velocity.avgResolutionDays}d avg` : 'N/A'} />
                <StatRow label="Velocity"         value={`${d.improvements.velocity.velocity}%`} color={d.improvements.velocity.velocity >= 70 ? C.green : C.amber} />
              </Card>
              <Card title="Top Priority Items">
                {d.improvements.topPriority.length === 0
                  ? <p className="text-xs text-white/30">No open improvement items.</p>
                  : d.improvements.topPriority.map((i) => (
                    <div key={i.id} className="py-1.5 border-b border-white/5 last:border-0 text-xs">
                      <div className="flex items-center gap-1">
                        <SeverityDot severity={i.priority} />
                        <span className="text-white/80">{i.title}</span>
                      </div>
                      <span className="text-white/30 ml-3">{i.category} · {i.status}</span>
                    </div>
                  ))
                }
              </Card>
            </>
          )}
        </div>
      )}

      <div className="mt-6 text-center text-[10px] text-white/20 font-mono">
        Operational Insights · auto-refresh 30s · {lastRun ?? '—'}
      </div>
    </div>
  );
}

// ── Modal overlay — Ctrl+Shift+O ──────────────────────────────
export function OperationalInsightsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10030] bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="w-full max-w-5xl min-h-[80vh] rounded-2xl overflow-hidden shadow-2xl border border-white/10 mt-8">
        <div className="flex items-center justify-between bg-gray-900 px-4 py-2 border-b border-white/10">
          <span className="text-xs text-white/50 font-mono">Operational Insights (Ctrl+Shift+O)</span>
          <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white text-sm">✕</button>
        </div>
        <OperationalInsightsDashboard />
      </div>
    </div>
  );
}

export default OperationalInsightsDashboard;
