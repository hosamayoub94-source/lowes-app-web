// =============================================================
// DevToolbar — Unified developer toolbar (DEV only)
//
// Fixed bottom strip with quick-access buttons for all dev tools.
// Ctrl+Shift+D to toggle. Renders nothing in production.
//
// Buttons:
//   [Trace Events] [Simulate Offline] [Burst Notifications]
//   [Active Workday] [Render Hotspots] [Clear Metrics]
//   [Run Health Checks] [Deployment Readiness]
// =============================================================
import { useState, useCallback, useEffect } from 'react';
import { simulateOffline, isSimulatingOffline } from '../mocks/networkSimulation';
import { simulateActiveWorkday, burst, fireNotification } from '../mocks/mockRealtime';
import { startEventTrace, stopEventTrace, getHotspots, getDebugSummary } from './debugToolkit';
import { getStats, getSlowOperations } from '../performance/benchmarkLayer';
import { runAllHealthChecks } from '../health/healthChecks';

const IS_DEV = import.meta.env.DEV;

// ── Toolbar button ─────────────────────────────────────────────
function Btn({ label, onClick, active = false, danger = false, icon }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`
        flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono
        transition-all duration-100 active:scale-95 whitespace-nowrap
        ${active  ? 'bg-green-700 text-green-100'
         : danger ? 'bg-red-900/60 hover:bg-red-800 text-red-300'
         :          'bg-gray-800 hover:bg-gray-700 text-gray-300'}
      `}
    >
      {icon && <span>{icon}</span>}
      {label}
    </button>
  );
}

// ── Panel: Health ──────────────────────────────────────────────
function HealthPanel({ onClose }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    const { results: r } = await runAllHealthChecks();
    setResults(r);
    setLoading(false);
  }, []);

  useEffect(() => { run(); }, []);

  return (
    <div className="absolute bottom-full right-0 mb-2 w-80 bg-gray-950 border border-white/15 rounded-xl shadow-2xl p-3 text-xs font-mono" style={{ direction: 'ltr' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-white/70 font-semibold">Health Checks</span>
        <div className="flex gap-2">
          <button onClick={run} className="text-blue-400 hover:text-blue-300">↻</button>
          <button onClick={onClose} className="text-white/30 hover:text-white">✕</button>
        </div>
      </div>
      {loading ? <div className="text-white/40 animate-pulse">Running checks...</div>
      : results ? results.map((r) => (
        <div key={r.name} className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
          <span className="text-white/60">{r.name}</span>
          <span className={`font-bold ${r.status === 'pass' ? 'text-green-400' : r.status === 'warn' ? 'text-yellow-400' : r.status === 'fail' ? 'text-red-400' : 'text-gray-500'}`}>
            {r.status.toUpperCase()} <span className="font-normal text-white/40">{r.durationMs}ms</span>
          </span>
        </div>
      )) : null}
    </div>
  );
}

// ── Panel: Performance ─────────────────────────────────────────
function PerfPanel({ onClose }) {
  const slow = getSlowOperations(500);
  const stats = getStats();

  return (
    <div className="absolute bottom-full right-0 mb-2 w-80 bg-gray-950 border border-white/15 rounded-xl shadow-2xl p-3 text-xs font-mono max-h-60 overflow-y-auto" style={{ direction: 'ltr' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-white/70 font-semibold">Performance</span>
        <button onClick={onClose} className="text-white/30 hover:text-white">✕</button>
      </div>
      {slow.length === 0
        ? <div className="text-green-400">✓ No slow operations</div>
        : slow.map((s, i) => (
          <div key={i} className="flex justify-between py-0.5 border-b border-white/5 last:border-0">
            <span className="text-white/60 truncate max-w-[180px]">{s.name}</span>
            <span className="text-amber-400 font-bold">{s.durationMs}ms</span>
          </div>
        ))
      }
    </div>
  );
}

// ── Main toolbar ───────────────────────────────────────────────
export function DevToolbar() {
  const [visible,      setVisible]     = useState(false);
  const [panel,        setPanel]       = useState(null);  // null | 'health' | 'perf'
  const [tracing,      setTracing]     = useState(false);
  const [offline,      setOffline]     = useState(false);
  const [stopBurst,    setStopBurst]   = useState(null);
  const [burstActive,  setBurstActive] = useState(false);

  if (!IS_DEV) return null;

  const togglePanel = (name) => setPanel((p) => (p === name ? null : name));

  // Ctrl+Shift+D toggle
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleTrace = useCallback(() => {
    if (tracing) { stopEventTrace(); setTracing(false); }
    else         { startEventTrace(); setTracing(true); }
  }, [tracing]);

  const handleOffline = useCallback(() => {
    if (offline) { window.dispatchEvent(new Event('online')); setOffline(false); }
    else {
      const restore = simulateOffline(15_000);
      setOffline(true);
      setTimeout(() => setOffline(false), 15_000);
    }
  }, [offline]);

  const handleBurst = useCallback(() => {
    if (burstActive) { stopBurst?.(); setBurstActive(false); setStopBurst(null); }
    else {
      const stop = burst(() => fireNotification({ title: 'إشعار تجريبي', type: 'system' }), 20, 300);
      setBurstActive(true); setStopBurst(() => stop);
      setTimeout(() => { setBurstActive(false); setStopBurst(null); }, 6_500);
    }
  }, [burstActive, stopBurst]);

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="fixed bottom-2 right-1/2 translate-x-1/2 z-[10005] bg-gray-900 border border-white/20 text-white/40 hover:text-white text-[10px] font-mono px-3 py-1 rounded-full shadow-lg"
      >
        DEV TOOLBAR (Ctrl+Shift+D)
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[10005] bg-gray-900/95 border-t border-white/10 backdrop-blur-sm"
      style={{ direction: 'ltr' }}
    >
      <div className="relative flex items-center gap-1.5 px-3 py-1.5 overflow-x-auto scrollbar-none">
        {/* Label */}
        <span className="text-[10px] text-white/30 font-mono flex-shrink-0 ml-2">DEV</span>

        {/* Buttons */}
        <Btn icon="📡" label={tracing ? 'Stop Trace' : 'Trace Events'} onClick={handleTrace} active={tracing} />
        <Btn icon="📴" label={offline ? 'Go Online' : 'Go Offline'} onClick={handleOffline} active={offline} danger />
        <Btn icon="🔔" label={burstActive ? 'Stop Burst' : 'Notif Burst'} onClick={handleBurst} active={burstActive} />
        <Btn icon="🎭" label="Workday Sim" onClick={simulateActiveWorkday} />
        <Btn
          icon="🏥"
          label="Health"
          onClick={() => togglePanel('health')}
          active={panel === 'health'}
        />
        <Btn
          icon="⚡"
          label="Performance"
          onClick={() => togglePanel('perf')}
          active={panel === 'perf'}
        />

        {/* Separator */}
        <span className="text-white/20 mx-1">|</span>
        <Btn icon="🔬" label="Prod Inspector" onClick={() => { const e = new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true, key: 'I', bubbles: true }); window.dispatchEvent(e); }} />
        <Btn icon="🚀" label="Rollout" onClick={() => { const e = new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true, key: 'R', bubbles: true }); window.dispatchEvent(e); }} />

        {/* Close */}
        <button
          onClick={() => { setVisible(false); setPanel(null); }}
          className="ml-auto text-white/30 hover:text-white text-[10px] font-mono flex-shrink-0"
        >
          ✕ hide
        </button>

        {/* Panels */}
        {panel === 'health' && <HealthPanel onClose={() => setPanel(null)} />}
        {panel === 'perf'   && <PerfPanel   onClose={() => setPanel(null)} />}
      </div>
    </div>
  );
}

export default DevToolbar;
