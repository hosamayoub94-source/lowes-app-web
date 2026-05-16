/**
 * DevCRMMonitor — floating debug panel for CRM module (dev only).
 * Shows store state: pipeline, leads, deals, followups, KPIs.
 */

import React, { useState } from 'react';
import useCRMStore from '../store/useCRMStore.js';

// Only render in dev
if (import.meta.env.PROD) {
  // eslint-disable-next-line import/no-anonymous-default-export
  export default function DevCRMMonitor() { return null; }
  // stop parsing
  throw new Error('__CRM_MONITOR_PROD_EXIT__');
}

const TABS = ['kpis', 'deals', 'leads', 'followups', 'state'];

function TabContent({ tab }) {
  const {
    deals, leads, customers, followups, stages, pipelines,
    loading, error, _userId, _initialized,
    getPipelineKPIs,
  } = useCRMStore(s => s);

  if (tab === 'kpis') {
    const kpis = getPipelineKPIs();
    return (
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <tbody>
          {Object.entries(kpis).filter(([k]) => typeof kpis[k] !== 'object').map(([k, v]) => (
            <tr key={k}>
              <td style={{ padding: '2px 6px', color: '#94a3b8', borderBottom: '1px solid #1e293b' }}>{k}</td>
              <td style={{ padding: '2px 6px', color: '#f1f5f9', fontWeight: 600, borderBottom: '1px solid #1e293b' }}>
                {typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (tab === 'deals') {
    return (
      <div>
        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6 }}>
          {deals.length} صفقة | {stages.length} مرحلة
        </div>
        {stages.map(s => {
          const stageDeals = deals.filter(d => d.stage_id === s.id);
          return (
            <div key={s.id} style={{ marginBottom: 8 }}>
              <div style={{ color: s.color ?? '#64748b', fontWeight: 600, fontSize: 11 }}>
                {s.name} ({stageDeals.length})
              </div>
              {stageDeals.map(d => (
                <div key={d.id} style={{
                  color: '#f1f5f9', fontSize: 10, paddingRight: 8, paddingTop: 2,
                }}>
                  • {d.title} — {d.value} {d.currency}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  if (tab === 'leads') {
    return (
      <div>
        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6 }}>
          {leads.length} عميل محتمل
        </div>
        {leads.map(l => (
          <div key={l.id} style={{ color: '#f1f5f9', fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: '#94a3b8' }}>{l.status}</span> — {l.title}
            {l.estimated_value > 0 && (
              <span style={{ color: '#22c55e', marginRight: 4 }}>{l.estimated_value} {l.currency}</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (tab === 'followups') {
    return (
      <div>
        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6 }}>
          {followups.length} متابعة
        </div>
        {followups.map(f => (
          <div key={f.id} style={{
            color: f.status === 'overdue' ? '#f87171' : '#f1f5f9',
            fontSize: 11, marginBottom: 4,
          }}>
            {f.status === 'overdue' ? '⚠️' : '🗓'} {f.title} — {f.followup_type}
          </div>
        ))}
      </div>
    );
  }

  if (tab === 'state') {
    return (
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <tbody>
          {[
            ['initialized', String(_initialized)],
            ['userId', _userId ?? 'null'],
            ['pipelines', pipelines.length],
            ['stages', stages.length],
            ['customers', customers.length],
            ...Object.entries(loading).map(([k, v]) => [`loading.${k}`, String(v)]),
            ['error', error ?? 'none'],
          ].map(([k, v]) => (
            <tr key={k}>
              <td style={{ padding: '2px 6px', color: '#94a3b8', borderBottom: '1px solid #1e293b' }}>{k}</td>
              <td style={{
                padding: '2px 6px', borderBottom: '1px solid #1e293b',
                color: v === 'true' ? '#4ade80' : v === 'false' ? '#f87171' : '#f1f5f9',
                fontWeight: 600,
              }}>
                {String(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return null;
}

export default function DevCRMMonitor() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('kpis');

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="CRM Dev Monitor"
        style={{
          position: 'fixed', bottom: 16, left: 64,
          width: 40, height: 40, borderRadius: '50%',
          background: '#0f172a', border: '2px solid #22c55e',
          color: '#22c55e', fontSize: 16, cursor: 'pointer',
          zIndex: 9998, display: 'flex', alignItems: 'center',
          justifyContent: 'center', boxShadow: '0 2px 8px #0005',
        }}
      >
        💼
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 64, left: 16,
          width: 340, maxHeight: 460,
          background: '#0f172a', color: '#f1f5f9',
          borderRadius: 10, boxShadow: '0 8px 32px #0008',
          border: '1px solid #22c55e',
          zIndex: 9999, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            padding: '8px 12px', background: '#1e293b',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: '#22c55e' }}>
              💼 CRM Monitor
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'none', border: 'none', color: '#94a3b8',
                cursor: 'pointer', fontSize: 14, lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex', background: '#1e293b',
            borderBottom: '1px solid #334155', padding: '0 8px',
          }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '6px 8px', fontSize: 10,
                  color: tab === t ? '#22c55e' : '#94a3b8',
                  borderBottom: `2px solid ${tab === t ? '#22c55e' : 'transparent'}`,
                  marginBottom: -1,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
            <TabContent tab={tab} />
          </div>
        </div>
      )}
    </>
  );
}
