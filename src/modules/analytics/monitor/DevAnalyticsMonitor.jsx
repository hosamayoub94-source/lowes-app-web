// =============================================================
// Analytics — Dev Monitor
// Floating dev panel: KPI state, alert list, realtime counters,
// cache controls. Visible only in mock mode or DEV environment.
// =============================================================
import { useState, memo } from 'react';
import { USE_MOCK } from '../services/kpiEngine';
import useAnalyticsStore from '../store/useAnalyticsStore';

const isDevMode = USE_MOCK || import.meta.env.DEV;

// ── Null component for prod builds ───────────────────────────
function _Null() { return null; }

// ── Full monitor component ────────────────────────────────────
function _DevAnalyticsMonitor() {
  const [open, setOpen]   = useState(false);
  const [tab,  setTab]    = useState('kpis');  // kpis | alerts | counters

  const kpis          = useAnalyticsStore((s) => s.kpis);
  const alerts        = useAnalyticsStore((s) => s.alerts);
  const loading       = useAnalyticsStore((s) => s.loading);
  const lastUpdated   = useAnalyticsStore((s) => s.lastUpdated);
  const filters       = useAnalyticsStore((s) => s.filters);
  const dashboardId   = useAnalyticsStore((s) => s.dashboardId);
  const loadDashboard = useAnalyticsStore((s) => s.loadDashboard);
  const invalidate    = useAnalyticsStore((s) => s.invalidateCache);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Dev Analytics Monitor"
        style={{
          position: 'fixed',
          bottom: 80,
          left: 16,
          zIndex: 9999,
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: '#7c3aed',
          border: '2px solid #a78bfa',
          color: '#fff',
          fontSize: 18,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px #0008',
        }}
      >
        📊
      </button>
    );
  }

  const kpiEntries    = Object.entries(kpis);
  const anyLoading    = Object.values(loading).some(Boolean);

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      left: 16,
      zIndex: 9999,
      width: 340,
      maxHeight: '70vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#0f172a',
      border: '1px solid #7c3aed',
      borderRadius: 12,
      boxShadow: '0 8px 32px #0009',
      fontFamily: 'monospace',
      fontSize: 11,
      overflow: 'hidden',
    }}>
      {/* Title bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', background: '#7c3aed22', borderBottom: '1px solid #7c3aed44',
      }}>
        <span style={{ color: '#a78bfa', fontWeight: 700 }}>
          📊 Analytics Monitor {anyLoading ? '⌛' : ''}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={invalidate}        style={_btnStyle('#334155','#94a3b8')}>clear cache</button>
          <button onClick={loadDashboard}     style={_btnStyle('#334155','#94a3b8')}>refresh</button>
          <button onClick={() => setOpen(false)} style={_btnStyle('#7c3aed','#fff')}>✕</button>
        </div>
      </div>

      {/* Status bar */}
      <div style={{ padding: '4px 12px', background: '#1e293b', fontSize: 10, color: '#64748b', borderBottom: '1px solid #1e293b' }}>
        dashboard: <b style={{ color: '#a78bfa' }}>{dashboardId}</b>
        {' | '}
        preset: <b style={{ color: '#a78bfa' }}>{filters.preset}</b>
        {' | '}
        updated: <b style={{ color: '#94a3b8' }}>{lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}</b>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1e293b' }}>
        {['kpis', 'alerts', 'counters'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '6px 0', fontSize: 10, fontFamily: 'monospace',
              border: 'none', cursor: 'pointer',
              background: tab === t ? '#7c3aed22' : 'transparent',
              color: tab === t ? '#a78bfa' : '#64748b',
              borderBottom: tab === t ? '2px solid #7c3aed' : '2px solid transparent',
            }}
          >
            {t} {t === 'alerts' && alerts.length > 0 ? `(${alerts.length})` : ''}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ overflowY: 'auto', flex: 1, padding: 8 }}>

        {tab === 'kpis' && (
          <div>
            {kpiEntries.length === 0 ? (
              <div style={{ color: '#64748b', padding: 8 }}>No KPIs loaded</div>
            ) : kpiEntries.map(([k, v]) => (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '3px 6px', borderRadius: 4,
                borderBottom: '1px solid #1e293b44',
              }}>
                <span style={{ color: '#94a3b8' }}>{k}</span>
                <span style={{ color: '#22c55e', fontWeight: 700 }}>
                  {v !== null ? (typeof v === 'number' && v > 1e6 ? (v/1e9).toFixed(2)+'G' : Math.round(v*10)/10) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 'alerts' && (
          <div>
            {alerts.length === 0 ? (
              <div style={{ color: '#22c55e', padding: 8 }}>✅ No active alerts</div>
            ) : alerts.map((a) => (
              <div key={a.metric} style={{
                padding: '4px 8px', marginBottom: 4, borderRadius: 6,
                background: a.status === 'critical' ? '#ef444411' : '#f59e0b11',
                border: `1px solid ${a.status === 'critical' ? '#ef444433' : '#f59e0b33'}`,
              }}>
                <span style={{ color: a.status === 'critical' ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>
                  [{a.status.toUpperCase()}]
                </span>
                {' '}
                <span style={{ color: '#e2e8f0' }}>{a.metric}</span>
                {' = '}
                <span style={{ color: '#94a3b8' }}>{Math.round(a.value * 10) / 10}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'counters' && (
          <RealtimeCounters />
        )}
      </div>
    </div>
  );
}

function RealtimeCounters() {
  const [counters, setCounters] = useState({});

  useState(() => {
    import('../services/analyticsService').then(({ getRealtimeStats }) => {
      setCounters(getRealtimeStats());
    });
    const handle = setInterval(() => {
      import('../services/analyticsService').then(({ getRealtimeStats }) => {
        setCounters(getRealtimeStats());
      });
    }, 2000);
    return () => clearInterval(handle);
  });

  return (
    <div>
      {Object.entries(counters).map(([k, v]) => (
        <div key={k} style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '3px 6px', borderBottom: '1px solid #1e293b44',
        }}>
          <span style={{ color: '#94a3b8' }}>{k}</span>
          <span style={{ color: '#3b82f6', fontWeight: 700 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function _btnStyle(bg, color) {
  return {
    padding: '2px 8px', borderRadius: 4, border: 'none',
    background: bg, color, fontSize: 10, fontFamily: 'monospace',
    cursor: 'pointer',
  };
}

// ── Conditional export ────────────────────────────────────────
const DevAnalyticsMonitor = isDevMode ? _DevAnalyticsMonitor : _Null;
export default memo(DevAnalyticsMonitor);
