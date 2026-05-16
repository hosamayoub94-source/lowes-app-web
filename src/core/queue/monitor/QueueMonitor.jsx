// =============================================================
// QueueMonitor — compact stats bar (dev + prod safe)
//
// Renders a small status strip showing live queue counts.
// Drop it anywhere in the UI — it's read-only and never mutates state.
//
// Usage:
//   import { QueueMonitor } from '@/core/queue';
//   <QueueMonitor />
// =============================================================
import React from 'react';
import { useQueueStats, useQueuePaused } from '../useQueue';
import { JOB_STATE_COLORS, JOB_STATE_LABELS, JOB_STATE } from '../jobTypes';

const DOT_SIZE = 8;

const DISPLAY_STATES = [
  JOB_STATE.PENDING,
  JOB_STATE.PROCESSING,
  JOB_STATE.RETRYING,
  JOB_STATE.COMPLETED,
  JOB_STATE.FAILED,
  JOB_STATE.CANCELLED,
];

export function QueueMonitor({ style = {} }) {
  const stats  = useQueueStats();
  const paused = useQueuePaused();

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
      {/* Worker status */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          style={{
            width:        DOT_SIZE,
            height:       DOT_SIZE,
            borderRadius: '50%',
            background:   paused ? '#f59e0b' : '#22c55e',
            display:      'inline-block',
          }}
        />
        <span style={{ color: paused ? '#f59e0b' : '#22c55e', fontWeight: 600 }}>
          {paused ? 'متوقف' : 'نشط'}
        </span>
      </span>

      <span style={{ color: '#334155' }}>|</span>

      {/* Per-state counts */}
      {DISPLAY_STATES.map((state) => {
        const count = stats[state] ?? 0;
        if (count === 0 && state === JOB_STATE.COMPLETED) return null; // hide 0 completed
        return (
          <span
            key={state}
            style={{ display: 'flex', alignItems: 'center', gap: 3 }}
            title={JOB_STATE_LABELS[state]}
          >
            <span
              style={{
                width:        DOT_SIZE,
                height:       DOT_SIZE,
                borderRadius: '50%',
                background:   JOB_STATE_COLORS[state],
                display:      'inline-block',
                opacity:      count === 0 ? 0.3 : 1,
              }}
            />
            <span style={{ color: count > 0 ? '#e2e8f0' : '#475569' }}>
              {count}
            </span>
          </span>
        );
      })}

      {/* Dead letter */}
      {stats.deadLetterCount > 0 && (
        <>
          <span style={{ color: '#334155' }}>|</span>
          <span
            title="Dead-letter queue"
            style={{ color: '#ef4444', fontWeight: 600 }}
          >
            ✕ {stats.deadLetterCount}
          </span>
        </>
      )}
    </div>
  );
}

export default QueueMonitor;
