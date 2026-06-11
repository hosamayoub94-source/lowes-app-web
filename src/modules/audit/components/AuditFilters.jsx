// =============================================================
// Audit — AuditFilters
// Search + filter panel for the audit dashboard.
// =============================================================
import { memo, useState, useCallback } from 'react';
import { cn } from '@utils/classNames';
import {
  SEVERITY_OPTIONS,
  ENTITY_OPTIONS,
  ACTION_TYPE,
  ACTION_LABELS,
} from '../types/audit.types';

// Build action-type options from the constants
const ACTION_OPTIONS = Object.entries(ACTION_TYPE).map(([, v]) => ({
  value: v,
  label: ACTION_LABELS[v] || v,
}));

const QuickChip = memo(function QuickChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1 rounded-full text-xs font-medium transition-colors',
        active
          ? 'bg-teal text-navy'
          : 'bg-surface border border-border text-muted hover:border-teal',
      )}
    >
      {label}
    </button>
  );
});

/**
 * @param {object}   props
 * @param {object}   props.filters
 * @param {function} props.onFilter     — (patch) => void
 * @param {function} props.onReset      — () => void
 * @param {number}   props.activeCount
 */
export const AuditFilters = memo(function AuditFilters({
  filters,
  onFilter,
  onReset,
  activeCount = 0,
}) {
  const [expanded, setExpanded] = useState(false);

  const handleSearch = useCallback(
    (e) => onFilter({ search: e.target.value }),
    [onFilter],
  );

  return (
    <div className="space-y-3">
      {/* Search + toggle row */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16ZM19 19l-4.35-4.35"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="ابحث في السجلات..."
            value={filters.search || ''}
            onChange={handleSearch}
            className="w-full h-9 bg-surface-alt border border-border rounded-lg ps-9 pe-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/30 transition-colors"
          />
        </div>

        {/* Filter toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium transition-colors border',
            expanded
              ? 'bg-teal/10 border-teal text-teal'
              : 'bg-surface border-border text-muted hover:border-teal',
          )}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M2 5h16M5 10h10M8 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          تصفية
          {activeCount > 0 && (
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-teal text-navy text-[9px] font-bold">
              {activeCount}
            </span>
          )}
        </button>

        {/* Reset */}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="h-9 px-3 rounded-lg text-sm text-muted hover:text-red-fg border border-border bg-surface transition-colors"
          >
            مسح
          </button>
        )}
      </div>

      {/* Quick chips */}
      <div className="flex flex-wrap gap-2">
        <QuickChip
          label="🔴 حرجة"
          active={filters.severity === 'critical'}
          onClick={() => onFilter({ severity: filters.severity === 'critical' ? '' : 'critical' })}
        />
        <QuickChip
          label="⚠ تحذيرات"
          active={filters.severity === 'warning'}
          onClick={() => onFilter({ severity: filters.severity === 'warning' ? '' : 'warning' })}
        />
        <QuickChip
          label="🚫 دخول فاشل"
          active={filters.actionType === 'login_failed'}
          onClick={() => onFilter({ actionType: filters.actionType === 'login_failed' ? '' : 'login_failed' })}
        />
        <QuickChip
          label="🔐 مصادقة"
          active={filters.entityType === 'auth'}
          onClick={() => onFilter({ entityType: filters.entityType === 'auth' ? '' : 'auth' })}
        />
        <QuickChip
          label="⚙️ إدارة"
          active={filters.entityType === 'admin'}
          onClick={() => onFilter({ entityType: filters.entityType === 'admin' ? '' : 'admin' })}
        />
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {/* Severity */}
          <SelectField
            label="الخطورة"
            value={filters.severity || ''}
            options={SEVERITY_OPTIONS}
            placeholder="كل مستويات"
            onChange={(v) => onFilter({ severity: v })}
          />

          {/* Entity type */}
          <SelectField
            label="نوع الكيان"
            value={filters.entityType || ''}
            options={ENTITY_OPTIONS}
            placeholder="كل الكيانات"
            onChange={(v) => onFilter({ entityType: v })}
          />

          {/* Action type */}
          <SelectField
            label="نوع الإجراء"
            value={filters.actionType || ''}
            options={ACTION_OPTIONS}
            placeholder="كل الإجراءات"
            onChange={(v) => onFilter({ actionType: v })}
          />

          {/* Date from */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted">من تاريخ</label>
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) => onFilter({ dateFrom: e.target.value })}
              className="h-9 bg-surface-alt border border-border rounded-lg px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
          </div>

          {/* Date to */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted">إلى تاريخ</label>
            <input
              type="date"
              value={filters.dateTo || ''}
              onChange={(e) => onFilter({ dateTo: e.target.value })}
              className="h-9 bg-surface-alt border border-border rounded-lg px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
          </div>
        </div>
      )}
    </div>
  );
});

function SelectField({ label, value, options, placeholder, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 bg-surface-alt border border-border rounded-lg px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/30"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
