/**
 * DealCard — compact card used inside the Kanban pipeline columns.
 */
import React from 'react';
import { formatCurrency, daysFromNow } from '../types/crm.types.js';

export default function DealCard({ deal, onSelect, isDragging = false }) {
  if (!deal) return null;

  const days = deal.expected_close_date ? daysFromNow(deal.expected_close_date) : null;
  const isOverdue = days !== null && days < 0;
  const isDueSoon = days !== null && days >= 0 && days <= 7;

  return (
    <div
      onClick={() => onSelect?.(deal)}
      style={{
        background: '#fff',
        border: `1.5px solid ${isDragging ? '#0ea5e9' : '#e2e8f0'}`,
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'grab',
        boxShadow: isDragging ? '0 8px 24px #0002' : '0 1px 3px #0001',
        opacity: isDragging ? 0.85 : 1,
        transform: isDragging ? 'rotate(2deg)' : 'none',
        transition: 'box-shadow 0.15s',
        direction: 'rtl',
        userSelect: 'none',
      }}
    >
      {/* Title */}
      <p style={{
        margin: '0 0 6px', fontWeight: 600, fontSize: 13, color: '#0f172a',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {deal.title}
      </p>

      {/* Company */}
      {deal.customer?.company_name && (
        <p style={{ margin: '0 0 6px', fontSize: 11, color: '#64748b' }}>
          🏢 {deal.customer.company_name}
        </p>
      )}

      {/* Value + close date */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
          {formatCurrency(deal.value, deal.currency)}
        </span>

        {days !== null && (
          <span style={{
            fontSize: 10, fontWeight: 600,
            color: isOverdue ? '#dc2626' : isDueSoon ? '#ca8a04' : '#64748b',
          }}>
            {isOverdue
              ? `متأخر ${Math.abs(days)} يوم`
              : days === 0
                ? 'اليوم'
                : `${days} يوم`}
          </span>
        )}
      </div>

      {/* Probability bar */}
      {deal.probability > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            height: 3, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden',
          }}>
            <div style={{
              width: `${deal.probability}%`,
              height: '100%',
              background: deal.probability >= 70 ? '#22c55e' : deal.probability >= 40 ? '#f59e0b' : '#94a3b8',
              borderRadius: 2,
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      )}

      {/* Tags */}
      {deal.tags?.length > 0 && (
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 8 }}>
          {deal.tags.slice(0, 2).map(tag => (
            <span key={tag} style={{
              background: '#f1f5f9', color: '#475569',
              fontSize: 9, padding: '2px 5px', borderRadius: 8,
            }}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
