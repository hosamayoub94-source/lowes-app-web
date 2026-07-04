// =============================================================
// Analytics — FilterBar
// Date range presets + department/role selectors.
// =============================================================
import { memo } from 'react';
import { useFilterPanel } from '../hooks/useAnalytics';
import { DATE_RANGE_PRESET, DATE_RANGE_LABELS } from '../types/analytics.types';

const PRESETS = [
  DATE_RANGE_PRESET.TODAY,
  DATE_RANGE_PRESET.LAST_7_DAYS,
  DATE_RANGE_PRESET.LAST_30_DAYS,
  DATE_RANGE_PRESET.THIS_MONTH,
  DATE_RANGE_PRESET.LAST_MONTH,
];

function FilterBar({ style = {} }) {
  const { filters, setPreset, setDateRange, reset } = useFilterPanel();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
      ...style,
    }}>
      {/* Preset chips */}
      {PRESETS.map((preset) => (
        <button
          key={preset}
          onClick={() => setPreset(preset)}
          style={{
            padding: '5px 12px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 500,
            border: filters.preset === preset ? '1.5px solid #3b82f6' : '1.5px solid rgb(var(--color-border) / 0.15)',
            background: filters.preset === preset ? '#3b82f622' : 'transparent',
            color: filters.preset === preset ? '#3b82f6' : 'rgb(var(--color-muted))',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {DATE_RANGE_LABELS[preset]}
        </button>
      ))}

      {/* Custom date range */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="date"
          value={filters.from ?? ''}
          onChange={(e) => setDateRange(e.target.value, filters.to)}
          style={_inputStyle}
        />
        <span className="text-muted" style={{ fontSize: 12 }}>—</span>
        <input
          type="date"
          value={filters.to ?? ''}
          onChange={(e) => setDateRange(filters.from, e.target.value)}
          style={_inputStyle}
        />
      </div>

      {/* Reset */}
      <button
        onClick={reset}
        className="border border-border text-muted"
        style={{
          padding: '5px 10px',
          borderRadius: 6,
          fontSize: 12,
          background: 'transparent',
          cursor: 'pointer',
          marginRight: 'auto',
        }}
      >
        إعادة تعيين
      </button>
    </div>
  );
}

const _inputStyle = {
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid rgb(var(--color-border) / 0.15)',
  background: 'rgb(var(--color-surface-alt))',
  color: 'rgb(var(--color-text))',
  fontSize: 12,
  outline: 'none',
};

export default memo(FilterBar);
