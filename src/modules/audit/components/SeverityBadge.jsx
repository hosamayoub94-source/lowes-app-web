// =============================================================
// Audit — SeverityBadge
// Pill badge with icon + label, driven by SEVERITY_META.
// =============================================================
import { memo } from 'react';
import { SEVERITY_META } from '../types/audit.types';

/**
 * @param {object}  props
 * @param {string}  props.severity   — 'info' | 'warning' | 'critical'
 * @param {string}  [props.size]     — 'sm' (default) | 'xs'
 * @param {boolean} [props.iconOnly] — show only the icon dot, no label
 */
export const SeverityBadge = memo(function SeverityBadge({ severity, size = 'sm', iconOnly = false }) {
  const meta = SEVERITY_META[severity] || SEVERITY_META.info;

  const sizeClass = size === 'xs'
    ? 'text-[10px] px-1.5 py-0.5 gap-1'
    : 'text-xs px-2 py-0.5 gap-1.5';

  if (iconOnly) {
    return (
      <span
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${meta.bgClass}`}
        title={meta.label}
      >
        <span className="text-[10px] leading-none">{meta.icon}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${meta.bgClass} ${sizeClass}`}
    >
      <span className="text-[11px] leading-none">{meta.icon}</span>
      <span>{meta.label}</span>
    </span>
  );
});
