// =============================================================
// Analytics Module — Export Service
//
// Browser-side export engine. Produces downloadable files from
// report data without a server round-trip.
//
// exportReport({ format, columns, rows, filename, title })
//   → triggers browser download (CSV, XLSX, or PDF)
//
// All heavy libs (xlsx) are dynamically imported to keep the
// initial bundle lean.
// =============================================================
import {
  EXPORT_FORMAT,
  EXPORT_MAX_ROWS,
  KPI_LABELS,
} from '../types/analytics.types';

// ── Public API ────────────────────────────────────────────────

/**
 * Generate and immediately download a report file.
 *
 * @param {object}   opts
 * @param {string}   opts.format      EXPORT_FORMAT constant
 * @param {string[]} opts.columns     Column keys (first = date)
 * @param {object[]} opts.rows        Data rows [{date, metric1, ...}]
 * @param {string}   [opts.filename]  Without extension
 * @param {string}   [opts.title]     Report title (used in PDF header)
 */
export async function exportReport({ format, columns, rows, filename, title = 'Analytics Report' }) {
  const safeRows  = (rows ?? []).slice(0, EXPORT_MAX_ROWS);
  const safeCols  = columns ?? Object.keys(safeRows[0] ?? {});
  const baseName  = filename ?? `analytics_${_dateStamp()}`;

  switch (format) {
    case EXPORT_FORMAT.CSV:
      return _downloadBlob(_buildCSV(safeCols, safeRows), `${baseName}.csv`, 'text/csv;charset=utf-8;');

    case EXPORT_FORMAT.XLSX:
      return _exportXLSX(safeCols, safeRows, baseName, title);

    case EXPORT_FORMAT.PDF:
      return _exportPDF(safeCols, safeRows, baseName, title);

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

/**
 * Build a raw CSV string from columns + rows (no download).
 * Useful for unit-testing or piping to another consumer.
 */
export function buildCSVString(columns, rows) {
  return _buildCSV(columns, rows);
}

// ── CSV ───────────────────────────────────────────────────────

function _buildCSV(columns, rows) {
  const header = columns.map(_csvCell).join(',');
  const body   = rows.map((row) =>
    columns.map((col) => _csvCell(row[col] ?? '')).join(','),
  ).join('\r\n');
  return `${header}\r\n${body}`;
}

function _csvCell(value) {
  const s = String(value ?? '');
  // Wrap in quotes if contains comma, quote, or newline
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ── XLSX ──────────────────────────────────────────────────────

async function _exportXLSX(columns, rows, filename, title) {
  try {
    // Try SheetJS (xlsx) if available in the project
    const XLSX = await import('xlsx').catch(() => null);

    if (XLSX) {
      const sheetData = [
        columns.map((c) => KPI_LABELS[c] ?? c),  // Arabic header row
        ...rows.map((row) => columns.map((c) => row[c] ?? '')),
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(sheetData);

      // Style header row (basic column widths)
      ws['!cols'] = columns.map(() => ({ wch: 18 }));

      XLSX.utils.book_append_sheet(wb, ws, 'تقرير');
      XLSX.writeFile(wb, `${filename}.xlsx`);
      return;
    }
  } catch {
    // SheetJS not available — fall through to CSV-as-XLSX
  }

  // Fallback: download as CSV with .xlsx extension (Excel will open it)
  _downloadBlob(
    _buildCSV(columns, rows),
    `${filename}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}

// ── PDF ───────────────────────────────────────────────────────

async function _exportPDF(columns, rows, filename, title) {
  // Open a styled print window; no jsPDF dependency required
  const html = _buildPrintHTML(columns, rows, title);
  const win  = window.open('', '_blank');
  if (!win) {
    // Popup blocked — fallback to CSV
    console.warn('[Export] Popup blocked; falling back to CSV');
    _downloadBlob(_buildCSV(columns, rows), `${filename}.csv`, 'text/csv;charset=utf-8;');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Give styles time to apply before printing
  setTimeout(() => { win.print(); }, 400);
}

function _buildPrintHTML(columns, rows, title) {
  const headerCells = columns
    .map((c) => `<th>${_esc(KPI_LABELS[c] ?? c)}</th>`)
    .join('');
  const bodyRows = rows.map((row) => {
    const cells = columns.map((c) => `<td>${_esc(String(row[c] ?? ''))}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<title>${_esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; padding: 20px; direction: rtl; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1e40af; color: #fff; padding: 6px 8px; text-align: right; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; text-align: right; }
  tr:nth-child(even) td { background: #f8fafc; }
  @media print { @page { margin: 1cm; } }
</style>
</head>
<body>
<h1>${_esc(title)}</h1>
<p class="meta">تاريخ التصدير: ${new Date().toLocaleDateString('ar-SA')} — ${rows.length} صف</p>
<table>
  <thead><tr>${headerCells}</tr></thead>
  <tbody>${bodyRows}</tbody>
</table>
</body>
</html>`;
}

// ── Helpers ───────────────────────────────────────────────────

function _downloadBlob(content, filename, mimeType) {
  const blob = content instanceof Blob
    ? content
    : new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function _dateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
