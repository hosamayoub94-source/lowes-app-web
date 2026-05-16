// =============================================================
// DevAutomationInspector — full developer automation dashboard
//
// NOT mounted by default. Add conditionally in dev:
//   import { DevAutomationInspector } from '@/core/automation';
//   {import.meta.env.DEV && <DevAutomationInspector />}
//
// Features:
//   • Live rule list with state toggle (active / paused / disabled)
//   • Execution history with status + duration
//   • Per-rule history drill-down
//   • Add / remove rules at runtime
//   • Global engine enable / disable
//   • Rule builder preset loader
//   • Minimisable panel (fixed bottom-right)
// =============================================================
import React, { useState } from 'react';
import { useAutomationStore }   from '../automationStore';
import {
  useAutomationStats,
  useAutomationHistory,
  useAutomationEnabled,
} from '../useAutomation';
import {
  RULE_STATE, RULE_STATE_LABELS, RULE_STATE_COLORS,
  TRIGGER_TYPE_LABELS, ACTION_TYPE_LABELS,
  EXEC_STATUS, EXEC_STATUS_COLORS,
} from '../automationTypes';
import {
  ruleNotifyOnTaskAssigned,
  ruleEscalateOverdueTasks,
  ruleNotifyLateAttendance,
  ruleLogCriticalAuditEvents,
} from '../ruleBuilder';

// ── Styles ────────────────────────────────────────────────────

const S = {
  overlay: {
    position:   'fixed',
    bottom:     '12px',
    right:      '12px',
    zIndex:     9998,
    fontFamily: '"Tajawal", system-ui, sans-serif',
    fontSize:   '12px',
    direction:  'ltr',
  },
  panel: {
    background:   '#0f1929',
    border:       '1px solid #1e3a5f',
    borderRadius: '8px',
    width:        '460px',
    maxHeight:    '75vh',
    overflowY:    'auto',
    boxShadow:    '0 8px 32px rgba(0,0,0,0.5)',
    color:        '#cbd5e1',
  },
  header: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '8px 12px',
    background:     '#0a1628',
    borderRadius:   '8px 8px 0 0',
    cursor:         'pointer',
    userSelect:     'none',
    position:       'sticky',
    top:            0,
    zIndex:         1,
  },
  title:    { fontWeight: 700, color: '#818cf8', fontSize: '12px' },
  body:     { padding: '10px 12px' },
  btn: (color = '#3b82f6') => ({
    background:   color,
    color:        '#fff',
    border:       'none',
    borderRadius: '4px',
    padding:      '2px 8px',
    cursor:       'pointer',
    fontSize:     '11px',
  }),
  row: {
    display:      'flex',
    alignItems:   'center',
    gap:          '6px',
    padding:      '5px 6px',
    borderRadius: '4px',
    marginBottom: '2px',
    background:   'rgba(255,255,255,0.03)',
  },
  dot: (color) => ({
    width: 8, height: 8, borderRadius: '50%',
    background: color, flexShrink: 0,
  }),
  truncate: {
    flex: 1, overflow: 'hidden',
    whiteSpace: 'nowrap', textOverflow: 'ellipsis',
    color: '#94a3b8',
  },
  sectionTitle: {
    color: '#64748b', fontWeight: 600, marginBottom: '4px',
    fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em',
  },
};

const PRESETS = [
  { label: 'إشعار تعيين مهمة', fn: ruleNotifyOnTaskAssigned },
  { label: 'تصعيد المتأخرات',   fn: ruleEscalateOverdueTasks },
  { label: 'إشعار التأخر',      fn: ruleNotifyLateAttendance },
  { label: 'تسجيل الأحداث الحرجة', fn: ruleLogCriticalAuditEvents },
];

// ── Component ─────────────────────────────────────────────────

export function DevAutomationInspector() {
  const [open, setOpen]       = useState(false);
  const [tab,  setTab]        = useState('rules'); // rules | history

  const rules          = useAutomationStore((s) => s.rules);
  const stats          = useAutomationStats();
  const history        = useAutomationHistory(30);
  const [enabled, setEnabled] = useAutomationEnabled();

  const addRule      = useAutomationStore((s) => s.addRule);
  const removeRule   = useAutomationStore((s) => s.removeRule);
  const setRuleState = useAutomationStore((s) => s.setRuleState);
  const clearHistory = useAutomationStore((s) => s.clearHistory);

  // Selected rule for drill-down
  const [selectedRuleId, setSelectedRuleId] = useState(null);
  const selectedRule    = rules.find((r) => r.id === selectedRuleId) ?? null;
  const selectedHistory = history.filter((h) => h.ruleId === selectedRuleId);

  return (
    <div style={S.overlay}>
      {/* Closed state */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            ...S.btn('#1e3a5f'),
            border: '1px solid #3730a3',
            fontSize: '11px',
            padding: '5px 10px',
          }}
        >
          🤖 Auto
          {stats.activeRules > 0 ? ` (${stats.activeRules})` : ''}
          {stats.failedCount > 0 ? ` ✕${stats.failedCount}` : ''}
        </button>
      )}

      {open && (
        <div style={S.panel}>
          {/* Header */}
          <div style={S.header} onClick={() => setOpen(false)}>
            <span style={S.title}>🤖 Dev Automation Inspector</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: enabled ? '#22c55e' : '#6b7280', fontSize: '11px' }}>
                {enabled ? '● Active' : '○ Off'}
              </span>
              <span style={{ color: '#475569' }}>▼</span>
            </div>
          </div>

          <div style={S.body}>
            {/* Stats row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              {[
                ['Rules', stats.totalRules],
                ['Active', stats.activeRules],
                ['Paused', stats.pausedRules],
                ['Runs', stats.totalExecutions],
                ['✓', stats.successCount],
                ['✕', stats.failedCount],
              ].map(([label, count]) => (
                <span key={label} style={{
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '4px', padding: '2px 6px',
                  color: count > 0 ? '#e2e8f0' : '#475569',
                }}>
                  {label}: <strong>{count}</strong>
                </span>
              ))}
              {stats.avgDuration > 0 && (
                <span style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '2px 6px', color: '#64748b' }}>
                  avg {stats.avgDuration}ms
                </span>
              )}
            </div>

            {/* Engine toggle + clear history */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <button
                style={S.btn(enabled ? '#6b7280' : '#22c55e')}
                onClick={() => setEnabled(!enabled)}
              >
                {enabled ? '⏸ Disable Engine' : '▶ Enable Engine'}
              </button>
              <button style={S.btn('#475569')} onClick={clearHistory}>
                Clear History
              </button>
            </div>

            {/* Preset loader */}
            <div style={{ ...S.sectionTitle }}>Load Preset Rule</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {PRESETS.map(({ label, fn }) => (
                <button
                  key={label}
                  style={{ ...S.btn('#312e81'), fontSize: '10px', padding: '2px 7px' }}
                  onClick={() => addRule(fn())}
                >
                  + {label}
                </button>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {[
                ['rules',   `Rules (${rules.length})`],
                ['history', `History (${history.length})`],
              ].map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setSelectedRuleId(null); }}
                  style={{
                    ...S.btn(tab === t ? '#1d4ed8' : '#1e293b'),
                    border: tab === t ? 'none' : '1px solid #334155',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── Rules tab ──────────────────────────────────── */}
            {tab === 'rules' && !selectedRuleId && (
              <>
                {rules.length === 0 && (
                  <div style={{ color: '#475569', textAlign: 'center', padding: 12 }}>
                    No rules — load a preset above
                  </div>
                )}
                {rules.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    onSetState={(state) => setRuleState(rule.id, state)}
                    onRemove={() => removeRule(rule.id)}
                    onDrillDown={() => setSelectedRuleId(rule.id)}
                  />
                ))}
              </>
            )}

            {/* ── Rule drill-down ─────────────────────────────── */}
            {tab === 'rules' && selectedRuleId && selectedRule && (
              <>
                <button
                  style={{ ...S.btn('#1e293b'), border: '1px solid #334155', marginBottom: 8 }}
                  onClick={() => setSelectedRuleId(null)}
                >
                  ← Back
                </button>
                <RuleDetail rule={selectedRule} history={selectedHistory} />
              </>
            )}

            {/* ── History tab ─────────────────────────────────── */}
            {tab === 'history' && (
              <>
                {history.length === 0 && (
                  <div style={{ color: '#475569', textAlign: 'center', padding: 12 }}>
                    No executions yet
                  </div>
                )}
                {history.map((entry) => (
                  <HistoryRow key={entry.id} entry={entry} />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function RuleRow({ rule, onSetState, onRemove, onDrillDown }) {
  const nextState = {
    [RULE_STATE.ACTIVE]:   RULE_STATE.PAUSED,
    [RULE_STATE.PAUSED]:   RULE_STATE.ACTIVE,
    [RULE_STATE.DISABLED]: RULE_STATE.ACTIVE,
  };

  return (
    <div style={S.row}>
      <span style={S.dot(RULE_STATE_COLORS[rule.state] ?? '#64748b')} />
      <span
        style={{ ...S.truncate, cursor: 'pointer', color: '#e2e8f0' }}
        onClick={onDrillDown}
        title="Drill down"
      >
        {rule.name}
      </span>
      <span style={{ color: '#64748b', fontSize: '10px', whiteSpace: 'nowrap' }}>
        {TRIGGER_TYPE_LABELS[rule.trigger?.type] ?? rule.trigger?.type}
      </span>
      <button
        style={{
          ...S.btn(
            rule.state === RULE_STATE.ACTIVE ? '#854d0e' :
            rule.state === RULE_STATE.PAUSED ? '#14532d' : '#1d4ed8'
          ),
          padding: '1px 6px',
        }}
        onClick={() => onSetState(nextState[rule.state])}
        title="Toggle state"
      >
        {rule.state === RULE_STATE.ACTIVE ? '⏸' :
         rule.state === RULE_STATE.PAUSED  ? '▶' : '↺'}
      </button>
      <button
        style={{ ...S.btn('#7f1d1d'), padding: '1px 5px' }}
        onClick={onRemove}
        title="Delete rule"
      >
        ✕
      </button>
    </div>
  );
}

function RuleDetail({ rule, history }) {
  return (
    <div>
      <div style={{ color: '#818cf8', fontWeight: 700, marginBottom: 6 }}>
        {rule.name}
      </div>
      {rule.description && (
        <div style={{ color: '#64748b', marginBottom: 6 }}>{rule.description}</div>
      )}
      <div style={{ color: '#475569', marginBottom: 8, fontSize: '11px' }}>
        Trigger: <span style={{ color: '#94a3b8' }}>
          {TRIGGER_TYPE_LABELS[rule.trigger?.type] ?? rule.trigger?.type}
        </span>
        {' · '}Conditions: <span style={{ color: '#94a3b8' }}>{rule.conditions?.length ?? 0}</span>
        {' · '}Actions: <span style={{ color: '#94a3b8' }}>{rule.actions?.length ?? 0}</span>
        {rule.debounceMs > 0 && <span> · Debounce: {rule.debounceMs}ms</span>}
        {rule.maxRetries > 0 && <span> · Retries: {rule.maxRetries}</span>}
      </div>
      <div style={S.sectionTitle}>Actions</div>
      {(rule.actions ?? []).map((a, i) => (
        <div key={i} style={{ ...S.row, marginBottom: 2 }}>
          <span style={{ color: '#818cf8' }}>→</span>
          <span style={{ color: '#94a3b8' }}>{ACTION_TYPE_LABELS[a.type] ?? a.type}</span>
        </div>
      ))}
      {history.length > 0 && (
        <>
          <div style={{ ...S.sectionTitle, marginTop: 8 }}>
            Recent Executions ({history.length})
          </div>
          {history.slice(0, 5).map((h) => (
            <HistoryRow key={h.id} entry={h} compact />
          ))}
        </>
      )}
    </div>
  );
}

function HistoryRow({ entry, compact = false }) {
  const color  = EXEC_STATUS_COLORS[entry.status] ?? '#64748b';
  const ts     = entry.startedAt
    ? new Date(entry.startedAt).toLocaleTimeString('ar-SA')
    : '';

  return (
    <div style={{ ...S.row, marginBottom: 2 }}>
      <span style={S.dot(color)} />
      {!compact && (
        <span style={{ ...S.truncate, color: '#e2e8f0' }}>
          {entry.ruleName ?? entry.ruleId}
        </span>
      )}
      <span style={{ color: '#64748b', fontSize: '10px', whiteSpace: 'nowrap' }}>
        {TRIGGER_TYPE_LABELS[entry.triggerType] ?? entry.triggerType}
      </span>
      <span style={{ color, fontSize: '10px', whiteSpace: 'nowrap' }}>
        {entry.status}
      </span>
      {entry.durationMs != null && (
        <span style={{ color: '#475569', fontSize: '10px' }}>
          {entry.durationMs}ms
        </span>
      )}
      {ts && (
        <span style={{ color: '#334155', fontSize: '10px' }}>{ts}</span>
      )}
      {entry.error && (
        <span
          title={entry.error}
          style={{ color: '#ef4444', fontSize: '10px', cursor: 'help' }}
        >
          ⚠
        </span>
      )}
    </div>
  );
}

export default DevAutomationInspector;
