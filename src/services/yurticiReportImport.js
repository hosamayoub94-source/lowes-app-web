// ════════════════════════════════════════════════════════════════════
// yurticiReportImport.js — قراءة تقرير يورتيتشي (results.xlsx) في المتصفّح
// ────────────────────────────────────────────────────────────────────
// يقرأ ملف Excel بـxlsx (محمّل عند الطلب — نفس نمط exportYurticiExcel) ثم
// يمرّره لمحلّل نقيّ مُختبَر (parseYurticiReport). غلاف متصفّح فقط.
// ════════════════════════════════════════════════════════════════════
import { parseYurticiReport } from './yurticiReport.js';

export { parseYurticiReport };

// ملف Excel (File/Blob/ArrayBuffer) → { updates, warnings }.
export async function parseReportFile(input) {
  const buf = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  return parseYurticiReport(rows);
}
