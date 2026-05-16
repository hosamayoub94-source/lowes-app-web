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
            border: filters.preset === preset ? '1.5px solid #3b82f6' : '1.5px solid #334155',
            background: filters.preset === preset ? '#3b82f622' : 'transparent',
            color: filters.preset === preset ? '#3b82f6' : '#94a3b8',
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
        <span style={{ color: '#64748b', fontSize: 12 }}>—</span>
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
        style={{
          padding: '5px 10px',
          borderRadius: 6,
          fontSize: 12,
          border: '1px solid #334155',
          background: 'transparent',
          color: '#64748b',
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
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#e2e8f0',
  fontSize: 12,
  outline: 'none',
};

export default memo(FilterBar);
