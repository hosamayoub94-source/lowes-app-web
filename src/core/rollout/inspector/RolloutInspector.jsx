// =============================================================
// RolloutInspector — Dev-only rollout health overlay
//
// Ctrl+Shift+R to toggle.
// Shows: onboarding state, session recovery, reminders,
// metrics snapshot, personalization, mobile mode.
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { useOnboardingStore }        from '../onboarding/useOnboardingStore';
import { getSession }                from '../session/sessionRecovery';
import { getMetricsSnapshot, clearMetrics } from '../metrics/operationalMetrics';
import { usePersonalizationStore }   from '../personalization/usePersonalizationStore';

function Row({ label, value, ok = null }) {
  return (
    <div className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
      <span className="text-white/50">{label}</span>
      <span className={`font-medium ${
        ok === true ? 'text-green-400' : ok === false ? 'text-red-400' : 'text-white/80'
      }`}>
        {String(value ?? '—')}
      </span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="border-t border-white/10 pt-2 mt-2">
      <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5">{title}</div>
      {children}
    </div>
  );
}

export function RolloutInspector() {
  const [open, setOpen] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [session, setSession] = useState(null);

  const { completed, skipped, currentStep, userId, preferences } = useOnboardingStore();
  const personalization = usePersonalizationStore();

  const refresh = useCallback(() => {
    setMetrics(getMetricsSnapshot());
    setSession(getSession());
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        setOpen((v) => !v);
        refresh();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [refresh]);

  useEffect(() => {
    if (open) {
      refresh();
      const t = setInterval(refresh, 5_000);
      return () => clearInterval(t);
    }
  }, [open, refresh]);

  if (!import.meta.env.DEV || !open) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[10001] w-72 max-h-[80vh] overflow-y-auto bg-gray-950 border border-white/15 rounded-xl shadow-2xl text-white text-xs font-mono"
      style={{ direction: 'ltr' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="font-semibold text-white/70">🚀 Rollout Inspector</span>
        <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white">✕</button>
      </div>

      <div className="px-3 pb-3">
        {/* Onboarding */}
        <Section title="Onboarding">
          <Row label="Completed"    value={String(completed)} ok={completed} />
          <Row label="Skipped"      value={String(skipped)} />
          <Row label="Current step" value={currentStep} />
          <Row label="User ID"      value={userId ?? 'none'} />
          <Row label="Compact mode" value={String(preferences.compactMode)} />
        </Section>

        {/* Session */}
        {session && (
          <Section title="Session">
            <Row label="Active section"  value={session.section ?? 'none'} />
            <Row label="Drafts"          value={session.drafts?.length ?? 0} />
            <Row label="Pending actions" value={session.pendingActions?.length ?? 0} />
            <Row label="Saved filters"   value={Object.keys(session.filters ?? {}).length} />
            <Row label="Compact mode"    value={String(session.compactMode)} />
          </Section>
        )}

        {/* Personalization */}
        <Section title="Personalization">
          <Row label="Theme"           value={personalization.theme} />
          <Row label="Font size"       value={personalization.fontSize} />
          <Row label="Compact mode"    value={String(personalization.compactMode)} />
          <Row label="Accessibility"   value={String(personalization.accessibilityMode)} />
          <Row label="Saved layouts"   value={personalization.savedLayouts?.length ?? 0} />
        </Section>

        {/* Metrics */}
        {metrics && (
          <Section title="Metrics">
            <Row label="Session duration" value={`${Math.round(metrics.sessionDurationMs / 60000)}m`} />
            <Row label="Events logged"    value={metrics.eventCount} />
            <Row label="Workflows"        value={`${metrics.workflowStats.completed}/${metrics.workflowStats.total} done`} />
            {metrics.topActions.slice(0, 3).map((a) => (
              <Row key={a.key} label={a.key.slice(0, 25)} value={`×${a.count}`} />
            ))}
            {metrics.frictions.slice(0, 2).map((f) => (
              <Row key={f.type} label={`friction:${f.type}`} value={`×${f.count}`} ok={false} />
            ))}
          </Section>
        )}

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={refresh}
            className="flex-1 text-xs px-2 py-1 bg-white/10 hover:bg-white/20 rounded transition-colors"
          >
            ↻ Refresh
          </button>
          <button
            onClick={() => { clearMetrics(); refresh(); }}
            className="flex-1 text-xs px-2 py-1 bg-red-900/40 hover:bg-red-800/60 text-red-300 rounded transition-colors"
          >
            Clear Metrics
          </button>
        </div>
        <div className="mt-1 text-center text-white/20 text-[10px]">Ctrl+Shift+R to toggle</div>
      </div>
    </div>
  );
}

export default RolloutInspector;
