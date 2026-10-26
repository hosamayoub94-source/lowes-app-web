// =============================================================
// Analytics — FilterBar
// Period presets + custom range + team + employee + reset.
// Every control is labelled; dates are local calendar days.
// =============================================================
import { memo, useMemo } from 'react';
import { useFilterPanel, useDirectory } from '../hooks/useAnalytics';
import { DATE_RANGE_PRESET, DATE_RANGE_LABELS } from '../types/analytics.types';

const PRESETS = [
  DATE_RANGE_PRESET.TODAY,
  DATE_RANGE_PRESET.LAST_7_DAYS,
  DATE_RANGE_PRESET.LAST_30_DAYS,
  DATE_RANGE_PRESET.THIS_MONTH,
  DATE_RANGE_PRESET.LAST_MONTH,
];

const FIELD = 'bg-surface-alt border border-border text-text';
const fieldStyle = { borderRadius: 8, padding: '8px 10px', fontSize: 14, minHeight: 40, minWidth: 0 };

function FilterBar({ style = {} }) {
  const { filters, setPreset, setDateRange, setTeam, setEmployee, reset } = useFilterPanel();
  const directory = useDirectory();

  const employees = useMemo(
    () => directory.employees.filter((e) => !filters.team || e.team === filters.team),
    [directory.employees, filters.team],
  );

  return (
    <div role="group" aria-label="فلاتر التقرير" style={{ display: 'flex', flexDirection: 'column', gap: 10, ...style }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PRESETS.map((preset) => {
          const active = filters.preset === preset;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={active}
              onClick={() => setPreset(preset)}
              style={{
                padding: '8px 14px', minHeight: 40, borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: active ? '1.5px solid #3b82f6' : '1.5px solid rgb(var(--color-border) / 0.25)',
                background: active ? '#3b82f622' : 'transparent',
                color: active ? '#2563eb' : 'rgb(var(--color-muted))',
              }}
            >
              {DATE_RANGE_LABELS[preset]}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
        <label className="text-muted" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          من تاريخ
          <input type="date" className={FIELD} style={fieldStyle} value={filters.from ?? ''} max={filters.to || undefined}
            onChange={(e) => setDateRange(e.target.value, filters.to)} />
        </label>
        <label className="text-muted" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          إلى تاريخ
          <input type="date" className={FIELD} style={fieldStyle} value={filters.to ?? ''} min={filters.from || undefined}
            onChange={(e) => setDateRange(filters.from, e.target.value)} />
        </label>
        <label className="text-muted" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          الفريق
          <select className={FIELD} style={fieldStyle} value={filters.team ?? ''} onChange={(e) => setTeam(e.target.value)}>
            <option value="">كل الفرق</option>
            {directory.teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="text-muted" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          الموظف
          <select className={FIELD} style={fieldStyle} value={filters.employeeId ?? ''} onChange={(e) => setEmployee(e.target.value)}>
            <option value="">كل الموظفين</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={reset} className="border border-border text-text" style={{ ...fieldStyle, background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>
          إعادة ضبط الفلاتر
        </button>
      </div>

      {directory.status === 'error' && (
        <div role="alert" style={{ fontSize: 12, color: '#dc2626' }}>
          تعذّر تحميل قائمة الفرق والموظفين ({directory.reason}) — تصفية الفريق/الموظف غير متاحة، وعدد الموظفين النشطين غير معروف.
        </div>
      )}
      {filters.from && filters.to && filters.from > filters.to && (
        <div role="status" className="text-muted" style={{ fontSize: 12 }}>تاريخ البداية بعد النهاية — سيُعرض النطاق بترتيب صحيح.</div>
      )}
    </div>
  );
}

export default memo(FilterBar);
