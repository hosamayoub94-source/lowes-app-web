// =============================================================
// DevQueueInspector — full developer queue dashboard
//
// NOT mounted by default. Import and render conditionally in dev:
//   import { DevQueueInspector } from '@/core/queue';
//   {import.meta.env.DEV && <DevQueueInspector />}
//
// Features:
//   • Live job list by state
//   • Dead-letter queue with retry / dismiss
//   • Pause / resume worker
//   • Manual enqueue for testing
//   • Minimisable panel (fixed bottom-left)
// =============================================================
import React, { useState } from 'react';
import { useQueueStore }    from '../queueStore';
import { useQueueStats, useQueuePaused } from '../useQueue';
import {
  JOB_STATE, JOB_STATE_LABELS, JOB_STATE_COLORS,
  JOB_TYPE,  JOB_TYPE_LABELS,
} from '../jobTypes';
import { pauseWorker, resumeWorker } from '../queueWorker';

// ── Styles (inline — zero CSS dependencies) ──────────────────

const S = {
  overlay: {
    position:   'fixed',
    bottom:     '12px',
    left:       '12px',
    zIndex:     9999,
    fontFamily: '"Tajawal", system-ui, sans-serif',
    fontSize:   '12px',
    direction:  'ltr',
  },
  panel: {
    background:   '#0f1929',
    border:       '1px solid #1e3a5f',
    borderRadius: '8px',
    width:        '420px',
    maxHeight:    '70vh',
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
  },
  title: { fontWeight: 700, color: '#60a5fa', fontSize: '12px' },
  body:  { padding: '10px 12px' },
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
    display:        'flex',
    alignItems:     'center',
    gap:            '6px',
    padding:        '4px 6px',
    borderRadius:   '4px',
    marginBottom:   '2px',
    background:     'rgba(255,255,255,0.03)',
  },
  dot: (color) => ({
    width:        8,
    height:       8,
    borderRadius: '50%',
    background:   color,
    flexShrink:   0,
  }),
  truncate: {
    flex:        1,
    overflow:    'hidden',
    whiteSpace:  'nowrap',
    textOverflow:'ellipsis',
    color:       '#94a3b8',
  },
  section: { marginBottom: '10px' },
  sectionTitle: {
    color:        '#64748b',
    fontWeight:   600,
    marginBottom: '4px',
    fontSize:     '11px',
    textTransform:'uppercase',
    letterSpacing:'0.05em',
  },
};

// ── Component ─────────────────────────────────────────────────

export function DevQueueInspector() {
  const [open, setOpen]     = useState(false);
  const [tab,  setTab]      = useState('active'); // 'active' | 'dl'

  const jobs      = useQueueStore((s) => s.jobs);
  const deadLetter = useQueueStore((s) => s.deadLetter);
  const stats     = useQueueStats();
  const paused    = useQueuePaused();

  const cancelJob      = useQueueStore((s) => s.cancel);
  const retryDL        = useQueueStore((s) => s.retry);
  const clearCompleted = useQueueStore((s) => s.clearCompleted);
  const clearDL        = useQueueStore((s) => s.clearDeadLetter);
  const pauseQueue     = useQueueStore((s) => s.pauseQueue);
  const resumeQueue    = useQueueStore((s) => s.resumeQueue);
  const enqueue        = useQueueStore((s) => s.enqueue);

  // Test enqueue
  const [testType, setTestType] = useState(JOB_TYPE.SEND_NOTIFICATION);

  function handleTogglePause() {
    if (paused) { resumeQueue(); resumeWorker(); }
    else        { pauseQueue();  pauseWorker();  }
  }

  const activeJobs = jobs.filter((j) => j.state !== JOB_STATE.COMPLETED);
  const doneJobs   = jobs.filter((j) => j.state === JOB_STATE.COMPLETED);

  return (
    <div style={S.overlay}>
      {/* Toggle button when closed */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            ...S.btn('#1e3a5f'),
            border: '1px solid #2d5f8a',
            fontSize: '11px',
            padding: '5px 10px',
          }}
        >
          ⚙ Queue {stats.pending + stats.processing > 0
            ? `(${stats.pending + stats.processing})`
            : ''}
        </button>
      )}

      {open && (
        <div style={S.panel}>
          {/* Header */}
          <div style={S.header} onClick={() => setOpen(false)}>
            <span style={S.title}>⚙ Dev Queue Inspector</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ color: paused ? '#f59e0b' : '#22c55e', fontSize: '11px' }}>
                {paused ? '⏸ Paused' : '▶ Running'}
              </span>
              <span style={{ color: '#475569' }}>▼</span>
            </div>
          </div>

          <div style={S.body}>
            {/* Stats row */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              {Object.entries({
                '⏳ Pending':   stats.pending,
                '⚡ Running':   stats.processing,
                '🔁 Retrying':  stats.retrying,
                '✓ Done':       stats.completed,
                '✕ DL':         stats.deadLetterCount,
              }).map(([label, count]) => (
                <span key={label} style={{
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  color: count > 0 ? '#e2e8f0' : '#475569',
                }}>
                  {label}: <strong>{count}</strong>
                </span>
              ))}
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <button style={S.btn(paused ? '#22c55e' : '#f59e0b')} onClick={handleTogglePause}>
                {paused ? '▶ Resume' : '⏸ Pause'}
              </button>
              <button style={S.btn('#475569')} onClick={clearCompleted}>
                Clear Done
              </button>
              <button style={S.btn('#7f1d1d')} onClick={clearDL}>
                Clear DL
              </button>
            </div>

            {/* Test enqueue */}
            <div style={{ ...S.section, display: 'flex', gap: '6px' }}>
              <select
                value={testType}
                onChange={(e) => setTestType(e.target.value)}
                style={{
                  background: '#1e293b', border: '1px solid #334155',
                  borderRadius: '4px', color: '#cbd5e1',
                  padding: '2px 6px', fontSize: '11px', flex: 1,
                }}
              >
                {Object.entries(JOB_TYPE).map(([k, v]) => (
                  <option key={v} value={v}>{JOB_TYPE_LABELS[v] ?? k}</option>
                ))}
              </select>
              <button
                style={S.btn('#3b82f6')}
                onClick={() => enqueue(testType, { _test: true })}
              >
                + Enqueue
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
              {[['active', `Active (${activeJobs.length})`], ['dl', `Dead-Letter (${deadLetter.length})`]].map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    ...S.btn(tab === t ? '#1d4ed8' : '#1e293b'),
                    border: tab === t ? 'none' : '1px solid #334155',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Active jobs */}
            {tab === 'active' && (
              <div style={S.section}>
                {activeJobs.length === 0 && doneJobs.length === 0 && (
                  <div style={{ color: '#475569', textAlign: 'center', padding: '12px' }}>
                    No jobs
                  </div>
                )}
                {activeJobs.map((job) => (
                  <JobRow key={job.id} job={job} onCancel={() => cancelJob(job.id)} />
                ))}
                {doneJobs.length > 0 && (
                  <>
                    <div style={{ ...S.sectionTitle, marginTop: '8px' }}>
                      Completed ({doneJobs.length})
                    </div>
                    {doneJobs.slice(0, 10).map((job) => (
                      <JobRow key={job.id} job={job} />
                    ))}
                    {doneJobs.length > 10 && (
                      <div style={{ color: '#475569', fontSize: '10px', textAlign: 'center' }}>
                        +{doneJobs.length - 10} more
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Dead-letter */}
            {tab === 'dl' && (
              <div style={S.section}>
                {deadLetter.length === 0 && (
                  <div style={{ color: '#475569', textAlign: 'center', padding: '12px' }}>
                    Dead-letter queue is empty
                  </div>
                )}
                {deadLetter.map((job) => (
                  <div key={job.id} style={S.row}>
                    <span style={S.dot('#ef4444')} />
                    <span style={S.truncate}>
                      {JOB_TYPE_LABELS[job.type] ?? job.type}
                    </span>
                    <span style={{ color: '#ef4444', fontSize: '10px' }} title={job.error}>
                      {job.attempts} tries
                    </span>
                    <button
                      style={S.btn('#15803d')}
                      onClick={() => retryDL(job.id)}
                      title="Re-queue"
                    >
                      ↩
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-component ─────────────────────────────────────────────

function JobRow({ job, onCancel }) {
  const cancelable =
    job.state === JOB_STATE.PENDING || job.state === JOB_STATE.RETRYING;

  return (
    <div style={S.row}>
      <span style={S.dot(JOB_STATE_COLORS[job.state] ?? '#64748b')} />
      <span style={{ ...S.truncate, minWidth: 0 }}>
        {JOB_TYPE_LABELS[job.type] ?? job.type}
      </span>
      <span style={{ color: '#475569', fontSize: '10px', whiteSpace: 'nowrap' }}>
        #{job.id.slice(-6)}
      </span>
      <span
        style={{
          fontSize:     '10px',
          color:        JOB_STATE_COLORS[job.state] ?? '#64748b',
          whiteSpace:   'nowrap',
        }}
        title={job.error ?? ''}
      >
        {JOB_STATE_LABELS[job.state] ?? job.state}
        {job.attempts > 0 ? ` ×${job.attempts}` : ''}
      </span>
      {cancelable && onCancel && (
        <button
          style={{ ...S.btn('#7f1d1d'), padding: '1px 6px' }}
          onClick={onCancel}
          title="Cancel"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default DevQueueInspector;
