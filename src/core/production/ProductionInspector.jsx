// =============================================================
// ProductionInspector — Dev-only overlay panel
//
// Triggered by: Ctrl+Shift+I (configurable in productionConfig)
// Shows:
//   • System health signals
//   • Queue status (offline + dead-letter)
//   • Realtime channel list + heartbeat age
//   • Error ring buffer (last 20 entries)
//   • Memory / render counters
//   • Action lock snapshot
//   • Quick toggles: safe mode, read-only, log level
//
// Only mounted when import.meta.env.DEV === true.
// =============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSystemHealth }    from './useSystemHealth';
import { getErrors, clearErrors } from './errorReporter';
import { inspectLocks, clearAllLocks } from './actionLock';
import { getOfflineQueueStats, clearDeadLetter, replayNow } from './offlineRecovery';
import { inspectRealtime, forceReconnect } from './realtimeRecovery';
import { getFlag, setFlag }   from './productionConfig';

// ── Small sub-components ───────────────────────────────────────
function Badge({ ok, label, value }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${ok ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'}`}>
      <span>{ok ? '✓' : '✗'}</span>
      <span className="font-medium">{label}</span>
      {value != null && <span className="opacity-70">{String(value)}</span>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="border-t border-white/10 pt-2 mt-2">
      <div className="text-xs text-white/40 uppercase tracking-wider mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function Btn({ onClick, children, variant = 'default' }) {
  const colors = {
    default: 'bg-white/10 hover:bg-white/20 text-white',
    danger:  'bg-red-900/50 hover:bg-red-800 text-red-300',
    primary: 'bg-blue-900/50 hover:bg-blue-800 text-blue-300',
  };
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-0.5 rounded transition-colors ${colors[variant]}`}
    >
      {children}
    </button>
  );
}

// ── Main panel ─────────────────────────────────────────────────
function InspectorPanel({ onClose }) {
  const { status, signals, lastCheck, refresh } = useSystemHealth();
  const [errors, setErrors]      = useState([]);
  const [locks, setLocks]        = useState([]);
  const [queueStats, setStats]   = useState(null);
  const [rtSnap, setRtSnap]      = useState(null);
  const [tab, setTab]            = useState('health');
  const panelRef = useRef(null);

  const refreshAll = useCallback(() => {
    refresh();
    setErrors(getErrors(20));
    setLocks(inspectLocks());
    setStats(getOfflineQueueStats());
    setRtSnap(inspectRealtime());
  }, [refresh]);

  useEffect(() => {
    refreshAll();
    const t = setInterval(refreshAll, 3_000);
    return () => clearInterval(t);
  }, [refreshAll]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const statusColor = {
    healthy:      'text-green-400',
    degraded:     'text-yellow-400',
    offline:      'text-red-400',
    reconnecting: 'text-amber-400',
  }[status] ?? 'text-gray-400';

  return (
    <div
      ref={panelRef}
      className="fixed bottom-4 left-4 z-[10000] w-80 max-h-[80vh] overflow-y-auto
                 bg-gray-950 border border-white/15 rounded-xl shadow-2xl
                 text-white text-xs font-mono"
      style={{ direction: 'ltr' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span>🔬</span>
          <span className="font-semibold text-white/80">Production Inspector</span>
          <span className={`font-bold ${statusColor}`}>{status.toUpperCase()}</span>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white">✕</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-3 pt-2">
        {['health', 'errors', 'locks', 'queue', 'realtime'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-2 py-0.5 rounded text-xs capitalize transition-colors ${
              tab === t ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            {t}
            {t === 'errors' && errors.length > 0 && (
              <span className="ml-1 text-red-400">({errors.length})</span>
            )}
            {t === 'locks' && locks.filter(l => !l.expired).length > 0 && (
              <span className="ml-1 text-amber-400">({locks.filter(l => !l.expired).length})</span>
            )}
          </button>
        ))}
      </div>

      <div className="px-3 pb-3">
        {/* ── Health tab ── */}
        {tab === 'health' && (
          <>
            <Section title="Signals">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(signals).map(([key, sig]) => (
                  <Badge key={key} ok={sig.ok} label={sig.label} value={sig.detail} />
                ))}
              </div>
            </Section>
            <Section title="Last Check">
              <span className="text-white/50">
                {lastCheck ? new Date(lastCheck).toLocaleTimeString() : 'Never'}
              </span>
            </Section>
            <Section title="Flags">
              <div className="space-y-1">
                {['safeMode', 'readOnly', 'enableErrorReporting', 'enableActionLocking'].map((flag) => (
                  <label key={flag} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!getFlag(flag)}
                      onChange={(e) => setFlag(flag, e.target.checked)}
                      className="accent-blue-500"
                    />
                    <span className="text-white/60">{flag}</span>
                  </label>
                ))}
              </div>
            </Section>
            <Section title="Memory">
              <span className="text-white/60">{signals?.memory?.detail ?? 'N/A'}</span>
            </Section>
          </>
        )}

        {/* ── Errors tab ── */}
        {tab === 'errors' && (
          <>
            <Section title={`Error Ring Buffer (${errors.length})`}>
              {errors.length === 0 ? (
                <div className="text-green-400">✓ No errors</div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {errors.map((e) => (
                    <div key={e.id} className="bg-white/5 rounded p-1.5">
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className={`font-bold ${e.severity === 'fatal' || e.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
                          [{e.severity.toUpperCase()}]
                        </span>
                        <span className="text-white/40 truncate">{e.context}</span>
                      </div>
                      <div className="text-white/70 truncate">{e.message}</div>
                      <div className="text-white/30">{new Date(e.timestamp).toLocaleTimeString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
            <div className="mt-2">
              <Btn variant="danger" onClick={() => { clearErrors(); setErrors([]); }}>
                Clear Errors
              </Btn>
            </div>
          </>
        )}

        {/* ── Locks tab ── */}
        {tab === 'locks' && (
          <>
            <Section title={`Active Locks (${locks.filter(l => !l.expired).length})`}>
              {locks.length === 0 ? (
                <div className="text-white/40">No active locks</div>
              ) : (
                <div className="space-y-1">
                  {locks.map((l) => (
                    <div key={l.key} className={`flex justify-between items-center px-1.5 py-1 rounded ${l.expired ? 'opacity-40' : 'bg-white/5'}`}>
                      <span className="text-white/70 truncate max-w-[170px]">{l.key}</span>
                      <span className={l.expired ? 'text-white/30' : 'text-amber-400'}>
                        {l.expired ? 'expired' : `${l.heldMs}ms`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
            <div className="mt-2">
              <Btn variant="danger" onClick={() => { clearAllLocks(); setLocks([]); }}>
                Clear All Locks
              </Btn>
            </div>
          </>
        )}

        {/* ── Queue tab ── */}
        {tab === 'queue' && queueStats && (
          <>
            <Section title="Offline Queue">
              <div className="flex gap-3">
                <div>
                  <div className="text-white/40">Pending</div>
                  <div className={`text-lg font-bold ${queueStats.queueSize > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                    {queueStats.queueSize}
                  </div>
                </div>
                <div>
                  <div className="text-white/40">Dead Letter</div>
                  <div className={`text-lg font-bold ${queueStats.deadLetterSize > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {queueStats.deadLetterSize}
                  </div>
                </div>
                <div>
                  <div className="text-white/40">Status</div>
                  <div className={`font-bold ${queueStats.isOnline ? 'text-green-400' : 'text-red-400'}`}>
                    {queueStats.isOnline ? 'Online' : 'Offline'}
                  </div>
                </div>
              </div>
            </Section>
            {queueStats.queue.length > 0 && (
              <Section title="Queued Actions">
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {queueStats.queue.map((item) => (
                    <div key={item.id} className="flex justify-between items-center bg-white/5 px-1.5 py-1 rounded">
                      <span className="text-white/70 truncate">{item.label}</span>
                      <span className="text-white/40">{item.retryCount}✗</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
            <div className="mt-2 flex gap-2">
              <Btn primary onClick={() => replayNow().then(refreshAll)}>Replay Now</Btn>
              <Btn variant="danger" onClick={() => { clearDeadLetter(); refreshAll(); }}>Clear Dead Letter</Btn>
            </div>
          </>
        )}

        {/* ── Realtime tab ── */}
        {tab === 'realtime' && rtSnap && (
          <>
            <Section title="Status">
              <div className="flex items-center gap-2">
                <span className={`font-bold ${rtSnap.status === 'connected' ? 'text-green-400' : 'text-amber-400'}`}>
                  {rtSnap.status.toUpperCase()}
                </span>
                <span className="text-white/40">reconnects: {rtSnap.reconnectCount}</span>
              </div>
              <div className="text-white/40 mt-1">
                Last heartbeat: {rtSnap.heartbeatAgeMs != null ? `${Math.round(rtSnap.heartbeatAgeMs / 1000)}s ago` : 'never'}
              </div>
            </Section>
            <Section title="Channels">
              {rtSnap.channels.length === 0 ? (
                <div className="text-white/40">No channels registered</div>
              ) : (
                <div className="space-y-1">
                  {rtSnap.channels.map((ch) => (
                    <div key={ch.name} className="flex justify-between items-center bg-white/5 px-1.5 py-1 rounded">
                      <span className="text-white/70">{ch.name}</span>
                      <span className={ch.healthy ? 'text-green-400' : 'text-red-400'}>
                        {ch.healthy ? '●' : '○'} {ch.uptimeMs != null ? `${Math.round(ch.uptimeMs / 1000)}s` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
            <div className="mt-2">
              <Btn variant="primary" onClick={() => { forceReconnect(); refreshAll(); }}>
                Force Reconnect
              </Btn>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-white/10 flex justify-between items-center">
        <span className="text-white/30">Ctrl+Shift+I to toggle</span>
        <Btn onClick={refreshAll}>↻ Refresh</Btn>
      </div>
    </div>
  );
}

// ── Export: only renders in DEV ────────────────────────────────
export function ProductionInspector() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const handler = (e) => {
      const hotkey = getFlag('inspectorHotkey') ?? 'ctrl+shift+i';
      const parts  = hotkey.toLowerCase().split('+');
      const wantsCtrl  = parts.includes('ctrl');
      const wantsShift = parts.includes('shift');
      const key        = parts.find((p) => !['ctrl', 'shift', 'alt'].includes(p)) ?? 'i';

      if (
        e.key.toLowerCase() === key &&
        (!wantsCtrl  || e.ctrlKey)  &&
        (!wantsShift || e.shiftKey)
      ) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!import.meta.env.DEV) return null;
  if (!open) return null;

  return <InspectorPanel onClose={() => setOpen(false)} />;
}

export default ProductionInspector;
