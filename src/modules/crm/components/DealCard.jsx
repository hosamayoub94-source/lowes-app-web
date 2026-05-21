/**
 * DealCard — compact Kanban card for a single deal.
 * Task #69/#8: Full Tailwind rewrite — no inline CSS.
 */
import React from 'react';
import { cn } from '@utils/classNames';
import { formatCurrency, daysFromNow } from '../types/crm.types.js';

export default function DealCard({ deal, onSelect, isDragging = false }) {
  if (!deal) return null;

  const days      = deal.expected_close_date ? daysFromNow(deal.expected_close_date) : null;
  const isOverdue = days !== null && days < 0;
  const isDueSoon = days !== null && days >= 0 && days <= 7;

  // probability bar colour
  const probColor =
    deal.probability >= 70 ? 'bg-green'
    : deal.probability >= 40 ? 'bg-amber'
    : 'bg-border';

  return (
    <div
      onClick={() => onSelect?.(deal)}
      className={cn(
        'bg-surface rounded-lg border transition-all duration-150',
        'px-3 py-2.5 cursor-grab select-none',
        isDragging
          ? 'border-teal shadow-lg opacity-85 rotate-1 scale-[1.02]'
          : 'border-border shadow-card hover:border-teal/40 hover:shadow-soft',
      )}
    >
      {/* Title */}
      <p className="text-sm font-semibold text-text truncate mb-1.5">
        {deal.title}
      </p>

      {/* Company */}
      {deal.customer?.company_name && (
        <p className="text-[11px] text-muted mb-1.5 truncate">
          🏢 {deal.customer.company_name}
        </p>
      )}

      {/* Value + close date */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-text">
          {formatCurrency(deal.value, deal.currency)}
        </span>

        {days !== null && (
          <span className={cn(
            'text-[10px] font-semibold shrink-0',
            isOverdue  ? 'text-red-fg'
            : isDueSoon ? 'text-amber-fg'
            : 'text-muted',
          )}>
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
        <div className="mt-2 h-[3px] rounded-full bg-border overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-[width] duration-300', probColor)}
            style={{ width: `${deal.probability}%` }}
          />
        </div>
      )}

      {/* Tags */}
      {deal.tags?.length > 0 && (
        <div className="flex gap-1 flex-wrap mt-2">
          {deal.tags.slice(0, 2).map(tag => (
            <span
              key={tag}
              className="text-[9px] font-medium bg-surface-alt text-muted px-1.5 py-px rounded-lg"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
