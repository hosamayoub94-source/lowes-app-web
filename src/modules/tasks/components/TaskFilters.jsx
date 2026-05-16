// =============================================================
// TaskFilters — filter panel: search, status, priority, employee,
// and quick-filter chips. Collapses on mobile behind a toggle.
// =============================================================

import { memo, useState } from 'react';
import { cn } from '@utils/classNames';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select } from '@components/ui/Input';
import { Avatar } from '@components/ui/Avatar';
import { Badge } from '@components/ui/Badge';
import { STATUS_META, PRIORITY_META } from '../types/task.types';
import { countActiveFilters } from '../utils/taskUtils';

// ── Filter chip ───────────────────────────────────────────────
function QuickChip({ active, onClick, children, tone = 'neutral' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold border transition-all',
        active
          ? 'bg-teal text-white border-transparent shadow-sm'
          : 'bg-surface text-muted border-border hover:border-teal/40 hover:text-text',
      )}
    >
      {children}
    </button>
  );
}

// ── Employee select item ──────────────────────────────────────
function EmployeeOption({ employee }) {
  return (
    <option key={employee.id} value={employee.id}>
      {employee.name}
    </option>
  );
}

// ── Main component ────────────────────────────────────────────
export const TaskFilters = memo(function TaskFilters({
  filters,
  employees = [],
  onSetFilter,
  onToggleFilter,
  onReset,
  className = '',
}) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = countActiveFilters(filters);

  return (
    <div className={cn('space-y-3', className)}>

      {/* ── Top row: search + expand toggle ── */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <svg
            className="absolute start-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <Input
            type="search"
            placeholder="ابحث عن مهمة..."
            value={filters.search}
            onChange={(e) => onSetFilter('search', e.target.value)}
            className="ps-9"
            aria-label="البحث في المهام"
          />
        </div>

        {/* Filter toggle button */}
        <Button
          variant={activeCount > 0 ? 'teal' : 'outline'}
          size="md"
          onClick={() => setExpanded((p) => !p)}
          aria-label="الفلاتر"
          aria-expanded={expanded}
          className="shrink-0 gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span className="hidden sm:inline">فلترة</span>
          {activeCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-white/25 text-[10px] font-bold grid place-items-center">
              {activeCount}
            </span>
          )}
        </Button>

        {/* Reset — only visible when there are active filters */}
        {activeCount > 0 && (
          <Button variant="ghost" size="md" onClick={onReset} className="shrink-0 text-red-fg hover:bg-red-bg">
            مسح
          </Button>
        )}
      </div>

      {/* ── Quick filter chips ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <QuickChip
          active={filters.overdueOnly}
          onClick={() => {
            onToggleFilter('overdueOnly');
            if (!filters.overdueOnly) onSetFilter('completedOnly', false);
          }}
        >
          🔥 متأخرة فقط
        </QuickChip>
        <QuickChip
          active={filters.completedOnly}
          onClick={() => {
            onToggleFilter('completedOnly');
            if (!filters.completedOnly) onSetFilter('overdueOnly', false);
          }}
        >
          ✅ مكتملة فقط
        </QuickChip>
        {/* Status quick chips */}
        {['in_progress', 'pending'].map((s) => (
          <QuickChip
            key={s}
            active={filters.status === s}
            onClick={() => onSetFilter('status', filters.status === s ? '' : s)}
          >
            {STATUS_META[s].icon} {STATUS_META[s].label}
          </QuickChip>
        ))}
      </div>

      {/* ── Expanded advanced filters ── */}
      {expanded && (
        <div className="p-4 bg-surface rounded-2xl border border-border space-y-3 animate-slideUp">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

            {/* Status select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted block">الحالة</label>
              <Select
                value={filters.status}
                onChange={(e) => onSetFilter('status', e.target.value)}
              >
                <option value="">كل الحالات</option>
                {Object.entries(STATUS_META).map(([val, meta]) => (
                  <option key={val} value={val}>{meta.icon} {meta.label}</option>
                ))}
              </Select>
            </div>

            {/* Priority select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted block">الأولوية</label>
              <Select
                value={filters.priority}
                onChange={(e) => onSetFilter('priority', e.target.value)}
              >
                <option value="">كل الأولويات</option>
                {Object.entries(PRIORITY_META).map(([val, meta]) => (
                  <option key={val} value={val}>{meta.icon} {meta.label}</option>
                ))}
              </Select>
            </div>

            {/* Employee select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted block">الموظف</label>
              <Select
                value={filters.assignedTo}
                onChange={(e) => onSetFilter('assignedTo', e.target.value)}
              >
                <option value="">جميع الموظفين</option>
                {employees.map((emp) => (
                  <EmployeeOption key={emp.id} employee={emp} />
                ))}
              </Select>
            </div>

          </div>

          {/* Active filter summary */}
          {activeCount > 0 && (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <span className="text-xs text-muted">الفلاتر النشطة:</span>
              {filters.status && (
                <Badge tone={STATUS_META[filters.status]?.tone || 'neutral'} className="text-[11px]">
                  {STATUS_META[filters.status]?.label}
                </Badge>
              )}
              {filters.priority && (
                <Badge tone={PRIORITY_META[filters.priority]?.tone || 'neutral'} className="text-[11px]">
                  {PRIORITY_META[filters.priority]?.label}
                </Badge>
              )}
              {filters.assignedTo && employees.find(e => e.id === filters.assignedTo) && (
                <Badge tone="teal" className="text-[11px] gap-1">
                  <Avatar
                    name={employees.find(e => e.id === filters.assignedTo)?.name}
                    size="xs"
                    className="w-4 h-4 text-[8px]"
                  />
                  {employees.find(e => e.id === filters.assignedTo)?.name}
                </Badge>
              )}
              {filters.overdueOnly  && <Badge tone="red"   className="text-[11px]">🔥 متأخرة فقط</Badge>}
              {filters.completedOnly && <Badge tone="green" className="text-[11px]">✅ مكتملة فقط</Badge>}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default TaskFilters;
