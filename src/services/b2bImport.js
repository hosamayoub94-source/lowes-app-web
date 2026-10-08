// b2bImport — منطق نقي لاستيراد ليدز الدول غير سوريا (D-119، زر الاستيراد).
// لا شبكة هنا: القراءة والتحويل والمعاينة فقط. الاستدعاء الفعلي لـ`b2b-leads` بـb2bLeadsApi.importLeads،
// والخادم يعيد كل الفحوص (أدمن فقط، مصدر لكل صف، تاريخ تحقق، تكرار، دولة الصف).
import { COUNTRIES } from '../../supabase/functions/_shared/countries.js';

export const MAX_IMPORT_ROWS = 500;          // نفس سقف الخادم
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** الزر والمعاينة لأدمن فقط، ولدول غير سوريا فقط (سوريا ما زالت على مسارها المباشر). الخادم يفحص الأدمن مرة ثانية. */
export function canImportLeads(role, country) {
  const c = COUNTRIES[country];
  return role === 'admin' && !!c && c.enabled && !c.legacyDirect && !!c.leadsPermission;
}

const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== null && v !== undefined));

/** JSON: مصفوفة صفوف، أو { rows: [...] } (شكل ملف الدفعة). */
export function rowsFromJsonText(text) {
  let data;
  try { data = JSON.parse(String(text).replace(/^\uFEFF/, '')); }
  catch { throw new Error('الملف ليس JSON صالحاً'); }
  const rows = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : null;
  if (!rows) throw new Error('الشكل المتوقع: مصفوفة صفوف أو { "rows": [...] }');
  return normalizeRows(rows);
}

/** CSV / Excel: الصف الأول = أسماء الحقول (name, province, lead_type, source_urls, last_verified_at …). */
export async function rowsFromSheetBuffer(buffer, kind = 'array') {
  const XLSX = (await import('xlsx')).default ?? (await import('xlsx'));
  const wb = XLSX.read(buffer, { type: kind });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('الملف فارغ');
  return normalizeRows(XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }));
}

function normalizeRows(rows) {
  if (!rows.length) throw new Error('الملف بلا صفوف');
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`الحد الأقصى ${MAX_IMPORT_ROWS} صف بالمرة الواحدة (الملف فيه ${rows.length})`);
  return rows.map((r) => (r && typeof r === 'object' && !Array.isArray(r) ? clean(r) : r));
}

/** يقرأ ملفاً من <input type=file> حسب نوعه. */
export async function rowsFromFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('الملف أكبر من 2MB');
  const name = String(file.name || '').toLowerCase();
  if (name.endsWith('.json')) return rowsFromJsonText(await file.text());
  if (name.endsWith('.csv')) return rowsFromSheetBuffer(await file.text(), 'string');
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return rowsFromSheetBuffer(await file.arrayBuffer(), 'array');
  throw new Error('نوع الملف غير مدعوم — JSON أو CSV أو Excel');
}

/**
 * معاينة من رد `import` بوضع dry_run: يربط كل صف جديد بصفّه الأصلي.
 * الخادم يبني id الصف الجديد بنهاية «-NNN» = رقم السطر (idx+1)، فنستخرج منه السطر بلا أي تعديل على الدالة.
 */
export function buildPreview(rows, report) {
  const lineOfId = (id) => Number(String(id).split('-').pop());
  const newItems = (report?.new || []).map((n) => {
    const line = lineOfId(n.id);
    const row = Number.isInteger(line) && line >= 1 ? rows[line - 1] : undefined;
    return { line, id: n.id, name: n.name, province: n.province, row };
  }).filter((i) => i.row);
  const withRow = (list) => (list || []).map((x) => ({ ...x, row: rows[(x.line ?? 0) - 1] }));
  return {
    summary: report?.summary || { total: rows.length, new: newItems.length, duplicate_existing: 0, duplicate_in_file: 0, invalid: 0 },
    newItems,
    duplicateExisting: withRow(report?.duplicate_existing),
    duplicateInFile: withRow(report?.duplicate_in_file),
    invalid: withRow(report?.invalid),
  };
}

/** الصفوف الأصلية للسطور المختارة فقط — هي وحدها اللي تُرسل بوضع الحفظ. */
export function rowsToSave(preview, selectedLines) {
  const sel = new Set(selectedLines);
  return preview.newItems.filter((i) => sel.has(i.line)).map((i) => i.row);
}

/** زر الحفظ يُفعَّل فقط: صفّ مختار واحد على الأقل + إقرار صريح أن البيانات غير متحقق منها. */
export function canSave(selectedCount, acknowledged) {
  return selectedCount > 0 && acknowledged === true;
}

/** هل الصف اعتمد مصدراً ثانوياً/غير مؤكَّد؟ (للتحذير بالمعاينة) */
export const isWeakSource = (row) => !row || row.verified !== 'verified_multi_source';
