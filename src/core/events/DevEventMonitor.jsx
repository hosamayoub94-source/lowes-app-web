// =============================================================
// DevEventMonitor — floating panel that shows live bus traffic.
//
// NOT mounted by default. Drop it into any screen during dev:
//   import { DevEventMonitor } from '@/core/events/DevEventMonitor';
//   <DevEventMonitor />
//
// Or toggle via window.__eventBus.setDebug(true) and mount manually.
// The component is rendered as a fixed overlay and does NOT touch
// existing UI — safe to leave imported and conditionally render.
// =============================================================
import { useMemo, useState } from 'react';
import { useEventTimeline } from './useEvent';
import eventBus from './eventBus';

const SEVERITY_COLOR = {
  info:     '#0ea5e9',
  warning:  '#f59e0b',
  critical: '#ef4444',
};

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour12: false }) + '.' +
    String(d.getMilliseconds()).padStart(3, '0');
}

export function DevEventMonitor({
  open = true,
  position = 'bottom-right',
  limit = 80,
}) {
  const [collapsed, setCollapsed] = useState(!open);
  const [filter, setFilter]       = useState('');
  const [selectedId, setSelected] = useState(null);

  const events = useEventTimeline(limit);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      (e.source || '').toLowerCase().includes(q) ||
      JSON.stringify(e.payload || {}).toLowerCase().includes(q),
    );
  }, [events, filter]);

  const selected = filtered.find((e) => e.id === selectedId) || filtered[filtered.length - 1];

  const corner = {
    'top-left':     { top: 12, left: 12 },
    'top-right':    { top: 12, right: 12 },
    'bottom-left':  { bottom: 12, left: 12 },
    'bottom-right': { bottom: 12, right: 12 },
  }[position] || { bottom: 12, right: 12 };

  return (
    <div
      dir="ltr"
      style={{
        position: 'fixed',
        zIndex: 99999,
        width: collapsed ? 140 : 420,
        maxHeight: collapsed ? 36 : '70vh',
        background: 'rgba(15,23,42,0.95)',
        color: '#e2e8f0',
        border: '1px solid #1e293b',
        borderRadius: 10,
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: 11,
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        overflow: 'hidden',
        ...corner,
      }}
    >
      {/* Header */}
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', cursor: 'pointer',
          background: '#0f172a', borderBottom: '1px solid #1e293b',
        }}
      >
        <span style={{ fontWeight: 700, letterSpacing: 0.5 }}>
          ⚡ Event Bus {collapsed ? '▸' : '▾'}
        </span>
        <span style={{ opacity: 0.7 }}>{events.length}</span>
      </div>

      {!collapsed && (
        <>
          {/* Controls */}
          <div style={{ display: 'flex', gap: 6, padding: 6, borderBottom: '1px solid #1e293b' }}>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter by name / source / payload"
              style={{
                flex: 1, padding: '4px 8px', borderRadius: 6,
                background: '#0f172a', color: '#e2e8f0',
                border: '1px solid #334155', fontFamily: 'inherit', fontSize: 11,
              }}
            />
            <button
              onClick={() => eventBus.clearTimeline()}
              style={btnStyle}
            >clear</button>
            <button
              onClick={() => eventBus.setDebug(!eventBus.isDebug())}
              style={btnStyle}
              title="toggle console tracing"
            >trace</button>
          </div>

          {/* List */}
          <div style={{ maxHeight: 240, overflow: 'auto' }}>
            {filtered.slice().reverse().map((e) => (
              <div
                key={e.id}
                onClick={() => setSelected(e.id)}
                style={{
                  padding: '4px 10px',
                  borderBottom: '1px solid #1e293b',
                  cursor: 'pointer',
                  background: selected?.id === e.id ? '#1e293b' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{
                    color: SEVERITY_COLOR[e.severity] || '#94a3b8',
                    fontWeight: 600,
                  }}>{e.name}</span>
                  <span style={{ opacity: 0.6 }}>{formatTime(e.timestamp)}</span>
                </div>
                <div style={{ opacity: 0.7, fontSize: 10 }}>
                  src: {e.source}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: 12, textAlign: 'center', opacity: 0.6 }}>
                no events yet
              </div>
            )}
          </div>

          {/* Payload */}
          {selected && (
            <div style={{
              padding: 8, borderTop: '1px solid #1e293b',
              maxHeight: 200, overflow: 'auto', background: '#020617',
            }}>
              <div style={{ marginBottom: 4, fontWeight: 700, color: '#facc15' }}>
                payload
              </div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {JSON.stringify(selected.payload, null, 2)}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const btnStyle = {
  padding: '4px 8px',
  background: '#1e293b',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 11,
};

export default DevEventMonitor;
