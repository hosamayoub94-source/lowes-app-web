// =============================================================
// Analytics Module — Export Service
//
// Browser-side export of EXACTLY the table the caller passes (the data on
// screen after filters — building it is the hook's job, see useExportPanel).
//
//   exportReport({ format, columns:[{key,label}], rows, filename, title, meta })
//     → { ok:true, filename } | { ok:false, reason }
//
// CSV  : BOM + CRLF + formula-injection guard (reportMath.buildCSV)
// XLSX : SheetJS, strings formula-guarded
// PDF  : print dialog of a styled RTL table (browser "Save as PDF"); a blocked
//        pop-up is REPORTED, never silently turned into a different format.
// =============================================================
import { EXPORT_FORMAT, EXPORT_MAX_ROWS } from '../types/analytics.types';
import { buildCSV, guardFormula } from './reportMath';

export async function exportReport({ format, columns, rows, filename, title = 'تقرير', meta = [] }) {
  if (!Array.isArray(columns) || columns.length === 0) return { ok: false, reason: 'لا أعمدة للتصدير' };
  const safeRows = (rows ?? []).slice(0, EXPORT_MAX_ROWS);
  if (safeRows.length === 0) return { ok: false, reason: 'لا توجد بيانات لتصديرها ضمن الفلاتر الحالية' };

  try {
    switch (format) {
      case EXPORT_FORMAT.CSV:
        _downloadBlob(buildCSV(columns, safeRows), `${filename}.csv`, 'text/csv;charset=utf-8;');
        return { ok: true, filename: `${filename}.csv` };
      case EXPORT_FORMAT.XLSX:
        await _exportXLSX(columns, safeRows, filename);
        return { ok: true, filename: `${filename}.xlsx` };
      case EXPORT_FORMAT.PDF:
        return _exportPDF(columns, safeRows, title, meta);
      default:
        return { ok: false, reason: `صيغة غير مدعومة: ${format}` };
    }
  } catch (e) {
    return { ok: false, reason: e?.message || 'فشل التصدير' };
  }
}

// ── XLSX ──────────────────────────────────────────────────────

async function _exportXLSX(columns, rows, filename) {
  const XLSX = await import('xlsx');
  const sheetData = [
    columns.map((c) => c.label),
    ...rows.map((row) => columns.map((c) => guardFormula(row[c.key] ?? ''))),
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = columns.map(() => ({ wch: 18 }));
  ws['!views'] = [{ RTL: true }];
  XLSX.utils.book_append_sheet(wb, ws, 'تقرير');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ── PDF (print) ───────────────────────────────────────────────

function _exportPDF(columns, rows, title, meta) {
  const win = window.open('', '_blank');
  if (!win) return { ok: false, reason: 'المتصفح حجب نافذة الطباعة — اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة' };
  win.document.write(_buildPrintHTML(columns, rows, title, meta));
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
  return { ok: true, filename: null };
}

function _buildPrintHTML(columns, rows, title, meta) {
  const head = columns.map((c) => `<th>${_esc(c.label)}</th>`).join('');
  const body = rows.map((row) => `<tr>${columns.map((c) => `<td>${_esc(row[c.key] ?? '')}</td>`).join('')}</tr>`).join('');
  const metaHtml = meta.map((m) => `<span>${_esc(m)}</span>`).join(' · ');
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<title>${_esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 12px; padding: 20px; direction: rtl; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #555; font-size: 11px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1e40af; color: #fff; padding: 6px 8px; text-align: right; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; text-align: right; }
  tr:nth-child(even) td { background: #f8fafc; }
  @media print { @page { margin: 1cm; } }
</style>
</head>
<body>
<h1>${_esc(title)}</h1>
<p class="meta">${metaHtml}</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body>
</html>`;
}

// ── Helpers ───────────────────────────────────────────────────

function _downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
