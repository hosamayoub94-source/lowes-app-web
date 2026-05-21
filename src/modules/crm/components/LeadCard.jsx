/**
 * LeadCard — compact card for a single lead in the leads list.
 * Task #69/#8: Full Tailwind rewrite — no inline CSS.
 */
import React from 'react';
import { cn } from '@utils/classNames';
import {
  LEAD_STATUS_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCE_ICONS,
  formatCurrency,
} from '../types/crm.types.js';

// Status → Tailwind badge tone
const STATUS_TONE = {
  new:         'bg-blue-bg   text-blue-fg',
  contacted:   'bg-amber-bg  text-amber-fg',
  qualified:   'bg-green-bg  text-green-fg',
  unqualified: 'bg-red-bg    text-red-fg',
  converted:   'bg-purple-bg text-purple-fg',
  lost:        'bg-surface-alt text-muted',
};

export default function LeadCard({ lead, onSelect, onConvert, onDelete, selected = false }) {
  if (!lead) return null;

  const badgeTone = STATUS_TONE[lead.status] ?? STATUS_TONE.new;
  const srcIcon   = LEAD_SOURCE_ICONS[lead.source] ?? '📋';
  const srcLabel  = LEAD_SOURCE_LABELS[lead.source] ?? lead.source;

  return (
    <div
      onClick={() => onSelect?.(lead)}
      className={cn(
        'rounded-xl border px-4 py-3.5 cursor-pointer transition-all duration-150',
        selected
          ? 'bg-blue-bg border-teal ring-2 ring-teal/20'
          : 'bg-surface border-border hover:border-teal/40 hover:shadow-soft',
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2.5 mb-2">
        {/* Source icon */}
        <span className="text-lg shrink-0" aria-hidden>{srcIcon}</span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text truncate">{lead.title}</p>
          {lead.company_name && (
            <p className="text-xs text-muted truncate">{lead.company_name}</p>
          )}
        </div>

        {/* Status badge */}
        <span className={cn(
          'text-[11px] font-semibold px-2 py-px rounded-full whitespace-nowrap shrink-0',
          badgeTone,
        )}>
          {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 flex-wrap text-xs">
        {lead.estimated_value > 0 && (
          <span className="font-semibold text-text">
            {formatCurrency(lead.estimated_value, lead.currency)}
          </span>
        )}
        <span className="text-muted">{srcLabel}</span>
        {lead.contact_name && (
          <span className="text-muted">👤 {lead.contact_name}</span>
        )}
        {lead.score > 0 && (
          <span className={cn(
            'font-semibold',
            lead.score >= 70 ? 'text-green-fg'
            : lead.score >= 40 ? 'text-amber-fg'
            : 'text-red-fg',
          )}>
            🎯 {lead.score}%
          </span>
        )}
      </div>

      {/* Tags */}
      {lead.tags?.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mt-2">
          {lead.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="text-[10px] font-medium bg-surface-alt text-muted px-2 py-px rounded-lg"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      {(onConvert || onDelete) && (
        <div
          className="flex gap-2 mt-3"
          onClick={e => e.stopPropagation()}
        >
          {onConvert && lead.status !== 'converted' && lead.status !== 'lost' && (
            <button
              type="button"
              onClick={() => onConvert(lead)}
              className="px-3 py-1 text-[11px] font-semibold rounded-lg bg-teal text-white hover:opacity-90 transition-opacity"
            >
              تحويل إلى عميل
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(lead.id)}
              className="px-3 py-1 text-[11px] font-semibold rounded-lg border border-red/30 text-red-fg hover:bg-red-bg transition-colors"
            >
              حذف
            </button>
          )}
        </div>
      )}
    </div>
  );
}
