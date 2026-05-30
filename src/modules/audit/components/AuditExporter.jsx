// =============================================================
// Audit — AuditExporter
// CSV export button with loading state.
// =============================================================
import { memo, useState } from 'react';

/**
 * @param {object}   props
 * @param {function} props.onExport   — async export handler (from store)
 * @param {number}   [props.count]    — total records in current filter
 */
export const AuditExporter = memo(function AuditExporter({ onExport, count }) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await onExport();
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={exporting || !count}
      className="flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium bg-surface border border-border text-muted hover:border-teal hover:text-teal disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {exporting ? (
        <>
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
          </svg>
          جاري التصدير…
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M10 3v10m0 0-3-3m3 3 3-3M3 17h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          تصدير CSV
          {count != null && (
            <span className="text-muted text-xs">({count.toLocaleString('ar-SA-u-nu-latn')})</span>
          )}
        </>
      )}
    </button>
  );
});
