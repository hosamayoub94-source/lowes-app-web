// =============================================================
// AutomationMonitor — compact stats strip
//
// Shows live rule counts and execution totals.
// Read-only. Safe to drop anywhere in the UI.
//
// Usage:
//   import { AutomationMonitor } from '@/core/automation';
//   <AutomationMonitor />
// =============================================================
import React from 'react';
import { useAutomationStats, useAutomationEnabled } from '../useAutomation';
import { RULE_STATE_COLORS } from '../automationTypes';

export function AutomationMonitor({ style = {} }) {
  const stats              = useAutomationStats();
  const [enabled]          = useAutomationEnabled();

  const successRate = stats.totalExecutions > 0
    ? Math.round((stats.successCount / stats.totalExecutions) * 100)
    : null;

  return (
    <div
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            '10px',
        padding:        '4px 10px',
        background:     'rgba(15,31,61,0.85)',
        borderRadius:   '6px',
        fontSize:       '11px',
        color:          '#94a3b8',
        backdropFilter: 'blur(4px)',
        userSelect:     'none',
        ...style,
      }}
    >
      {/* Engine status dot */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          style={{
            width:        8,
            height:       8,
            borderRadius: '50%',
            background:   enabled ? '#22c55e' : '#6b7280',
            display:      'inline-block',
          }}
        />
        <span style={{ color: enabled ? '#22c55e' : '#6b7280', fontWeight: 600 }}>
          {enabled ? 'Auto' : 'Off'}
        </span>
      </span>

      <span style={{ color: '#334155' }}>|</span>

      {/* Rule counts */}
      <span
        title="القواعد النشطة"
        style={{ display: 'flex', alignItems: 'center', gap: 3 }}
      >
        <span
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: RULE_STATE_COLORS.active, display: 'inline-block',
          }}
        />
        <span style={{ color: stats.activeRules > 0 ? '#e2e8f0' : '#475569' }}>
          {stats.activeRules}
        </span>
      </span>

      {stats.pausedRules > 0 && (
        <span
          title="قواعد متوقفة"
          style={{ display: 'flex', alignItems: 'center', gap: 3 }}
        >
          <span
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: RULE_STATE_COLORS.paused, display: 'inline-block',
            }}
          />
          <span style={{ color: '#f59e0b' }}>{stats.pausedRules}</span>
        </span>
      )}

      <span style={{ color: '#334155' }}>|</span>

      {/* Execution stats */}
      <span title="إجمالي التنفيذات">
        ⚡ <span style={{ color: '#e2e8f0' }}>{stats.totalExecutions}</span>
      </span>

      {stats.failedCount > 0 && (
        <span title="تنفيذات فاشلة" style={{ color: '#ef4444' }}>
          ✕ {stats.failedCount}
        </span>
      )}

      {successRate !== null && (
        <span
          title="نسبة النجاح"
          style={{ color: successRate >= 80 ? '#22c55e' : '#f59e0b' }}
        >
          {successRate}%
        </span>
      )}

      {stats.avgDuration > 0 && (
        <span title="متوسط وقت التنفيذ" style={{ color: '#64748b' }}>
          {stats.avgDuration}ms
        </span>
      )}
    </div>
  );
}

export default AutomationMonitor;
