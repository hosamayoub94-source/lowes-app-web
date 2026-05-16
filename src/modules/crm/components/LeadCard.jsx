/**
 * LeadCard — compact card for a single lead in the leads list.
 */
import React from 'react';
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCE_ICONS,
  formatCurrency,
} from '../types/crm.types.js';

const STATUS_BADGE = {
  new:         { bg: '#dbeafe', color: '#1d4ed8' },
  contacted:   { bg: '#fef3c7', color: '#92400e' },
  qualified:   { bg: '#d1fae5', color: '#065f46' },
  unqualified: { bg: '#fee2e2', color: '#991b1b' },
  converted:   { bg: '#ede9fe', color: '#5b21b6' },
  lost:        { bg: '#f1f5f9', color: '#475569' },
};

export default function LeadCard({ lead, onSelect, onConvert, onDelete, selected = false }) {
  if (!lead) return null;

  const badge = STATUS_BADGE[lead.status] ?? STATUS_BADGE.new;
  const srcIcon = LEAD_SOURCE_ICONS[lead.source] ?? '📋';
  const srcLabel = LEAD_SOURCE_LABELS[lead.source] ?? lead.source;

  return (
    <div
      onClick={() => onSelect?.(lead)}
      style={{
        background: selected ? '#f0f9ff' : '#fff',
        border: `1.5px solid ${selected ? '#0ea5e9' : '#e2e8f0'}`,
        borderRadius: 10,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, border-color 0.15s',
        boxShadow: selected ? '0 0 0 3px #bae6fd' : '0 1px 3px #0001',
        direction: 'rtl',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        {/* Source icon */}
        <span style={{ fontSize: 18 }}>{srcIcon}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontWeight: 600, fontSize: 14, color: '#0f172a',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {lead.title}
          </p>
          {lead.company_name && (
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{lead.company_name}</p>
          )}
        </div>

        {/* Status badge */}
        <span style={{
          background: badge.bg, color: badge.color,
          fontSize: 11, fontWeight: 600,
          padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap',
        }}>
          {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
        </span>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {lead.estimated_value > 0 && (
          <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }}>
            {formatCurrency(lead.estimated_value, lead.currency)}
          </span>
        )}
        <span style={{ fontSize: 11, color: '#94a3b8' }}>{srcLabel}</span>
        {lead.contact_name && (
          <span style={{ fontSize: 11, color: '#64748b' }}>👤 {lead.contact_name}</span>
        )}
        {lead.score > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: lead.score >= 70 ? '#16a34a' : lead.score >= 40 ? '#ca8a04' : '#dc2626',
          }}>
            🎯 {lead.score}%
          </span>
        )}
      </div>

      {/* Tags */}
      {lead.tags?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
          {lead.tags.slice(0, 3).map(tag => (
            <span key={tag} style={{
              background: '#f1f5f9', color: '#475569',
              fontSize: 10, padding: '2px 6px', borderRadius: 10,
            }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      {(onConvert || onDelete) && (
        <div
          style={{ display: 'flex', gap: 8, marginTop: 10 }}
          onClick={e => e.stopPropagation()}
        >
          {onConvert && lead.status !== 'converted' && lead.status !== 'lost' && (
            <button
              onClick={() => onConvert(lead)}
              style={{
                background: '#0ea5e9', color: '#fff',
                border: 'none', borderRadius: 6,
                padding: '4px 12px', fontSize: 11, cursor: 'pointer',
              }}
            >
              تحويل إلى عميل
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(lead.id)}
              style={{
                background: 'transparent', color: '#ef4444',
                border: '1px solid #fca5a5', borderRadius: 6,
                padding: '4px 10px', fontSize: 11, cursor: 'pointer',
              }}
            >
              حذف
            </button>
          )}
        </div>
      )}
    </div>
  );
}
