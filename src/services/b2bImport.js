// b2bImport — منطق نقي لاستيراد ليدز الدول غير سوريا (D-119، زر الاستيراد).
// لا شبكة هنا: القراءة والتحويل والمعاينة فقط. الاستدعاء الفعلي لـ`b2b-leads` بـb2bLeadsApi.importLeads،
// والخادم يعيد كل الفحوص (أدمن فقط، مصدر لكل صف، تاريخ تحقق، تكرار، دولة الصف).
import { COUNTRIES, NATIONWIDE } from '../../supabase/functions/_shared/countries.js';

export const MAX_IMPORT_ROWS = 500;          // نفس سقف الخادم
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * الزر والمعاينة: الأدمن، أو من يملك صلاحية ليدز تلك الدولة (`can` = (permission) => boolean). سوريا والإمارات معاً.
 * الخادم يعيد الفحص من الجلسة، فهذا للعرض فقط.
 */
export function canImportLeads(role, country, can) {
  const c = COUNTRIES[country];
  if (!c || !c.enabled || !c.leadsPermission) return false;
  return role === 'admin' || (typeof can === 'function' && can(c.leadsPermission) === true);
}

// ───────────── مطابقة الأعمدة (عربي/إنجليزي) — ملفات من مصادر خارجية ─────────────
// العنوان يُطبَّع (حروف صغيرة، بلا مسافات/رموز/تشكيل، ألف/ياء موحّدة) ثم يُقارَن بالأسماء المعروفة. ما لا يُعرف يُهمل ويُعرض للمستخدم.
export const COLUMN_ALIASES = {
  name: ['name', 'الاسم', 'اسم', 'اسم الجهة', 'اسم المتجر', 'اسم المحل', 'store name', 'business name', 'title'],
  province: ['province', 'region', 'state', 'emirate', 'governorate', 'المحافظة', 'محافظة', 'الإمارة', 'امارة', 'الامارة'],
  city: ['city', 'المدينة', 'مدينة'],
  district: ['district', 'الحي', 'حي'],
  lead_type: ['lead_type', 'type', 'النوع', 'نوع الجهة', 'نوع', 'النوع (محل / أونلاين)'],
  category: ['category', 'الفئة', 'التصنيف', 'فئة', 'تصنيف'],
  channel: ['channel', 'القناة'],
  phone: ['phone', 'tel', 'mobile', 'telephone', 'الهاتف', 'رقم الهاتف', 'هاتف', 'الجوال', 'موبايل'],
  whatsapp: ['whatsapp', 'whats app', 'واتساب', 'واتس اب', 'واتس'],
  website: ['website', 'site', 'url', 'web', 'link', 'الموقع', 'رابط الموقع', 'الموقع الالكتروني', 'الرابط'],
  instagram: ['instagram', 'ig', 'insta', 'انستغرام', 'انستقرام', 'إنستغرام'],
  facebook: ['facebook', 'fb', 'فيسبوك', 'فيس بوك'],
  email: ['email', 'e-mail', 'mail', 'الايميل', 'ايميل', 'البريد', 'البريد الالكتروني'],
  telegram: ['telegram', 'تيليغرام', 'تلغرام'],
  address: ['address', 'العنوان', 'عنوان'],
  source_urls: ['source_urls', 'source', 'sources', 'source_url', 'المصدر', 'المصادر', 'رابط المصدر', 'رابط المصادر', 'المصدر (رابط)'],
  last_verified_at: ['last_verified_at', 'verified_at', 'تاريخ التحقق', 'تاريخ التاكد'],
  reason: ['reason', 'notes', 'note', 'description', 'ملاحظات', 'ملاحظة', 'الوصف', 'وصف'],
  priority: ['priority', 'الاولوية', 'أولوية'],
  // حقول يعرفها الخادم أصلاً (ملفات JSON القديمة): تمرّ كما هي
  verified: ['verified'], score: ['score'], country: ['country'], sells_beauty: ['sells_beauty'], accepts_sellers: ['accepts_sellers'],
  delivery_coverage: ['delivery_coverage'], lowes_presence: ['lowes_presence'], lowes_listing_url: ['lowes_listing_url'], discovery_source: ['discovery_source'],
};
const normHeader = (h) => String(h ?? '').toLowerCase().normalize('NFKD')
  .replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/[^\p{L}\p{N}]+/gu, '');
const ALIAS_LOOKUP = new Map(Object.entries(COLUMN_ALIASES).flatMap(([canon, names]) => [canon, ...names].map((n) => [normHeader(n), canon])));

/** يعيد { rows, mapped: [{from,to}], ignored: [عناوين لم تُفهم] }. أول قيمة غير فارغة لكل حقل تفوز. */
export function mapColumns(rows) {
  const mapped = new Map(), ignored = new Set();
  const out = rows.map((r) => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return r;
    const o = {};
    for (const [k, v] of Object.entries(r)) {
      const canon = ALIAS_LOOKUP.get(normHeader(k));
      if (!canon) { ignored.add(k); continue; }
      mapped.set(k, canon);
      if (!(canon in o) && v !== '' && v !== null && v !== undefined) o[canon] = v;
    }
    return o;
  });
  return { rows: out, mapped: [...mapped].map(([from, to]) => ({ from, to })), ignored: [...ignored] };
}

// قيم عمود «النوع» الشائعة → القيمتان اللتان يفهمهما الخادم. ما لا يُعرف يبقى كما هو (يُرفض بسبب واضح).
const ONLINE_WORDS = new Set(['online', 'اونلاين', 'أونلاين', 'متجراونلاين', 'متجرالكتروني', 'متجر الكتروني', 'الكتروني', 'إلكتروني', 'ecommerce', 'منصة'].map(normHeader));
const PHYSICAL_WORDS = new Set(['physical', 'محل', 'محلي', 'محلات', 'فرع', 'صيدلية', 'عيادة', 'مركز', 'offline', 'shop'].map(normHeader));
export function normalizeLeadType(v) {
  const n = normHeader(v);
  if (ONLINE_WORDS.has(n)) return 'online';
  if (PHYSICAL_WORDS.has(n)) return 'physical';
  return v;
}

/**
 * تطبيق اختيار المستخدم حين يغيب العمود: leadType = 'online'|'physical'|'auto'.
 * الأونلاين بلا محافظة/إمارة ← «على مستوى البلد». لا شيء يُختلق غير هذين الافتراضين.
 */
export function applyFileDefaults(rows, { leadType = 'auto' } = {}) {
  return rows.map((r) => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return r;
    const o = { ...r };
    if (o.lead_type) o.lead_type = normalizeLeadType(o.lead_type);
    else if (leadType === 'online' || leadType === 'physical') o.lead_type = leadType;
    if (!o.province && o.lead_type === 'online') o.province = NATIONWIDE;
    return o;
  });
}

/** رسائل الخادم الإنجليزية الشائعة بالعربية، للمعاينة. غير المعروف يبقى كما هو. */
export function arabicRowError(e) {
  const s = String(e || '');
  if (/^name required/.test(s)) return 'الاسم ناقص';
  if (/^lead_type must be/.test(s)) return 'نوع الجهة ناقص أو غير مفهوم (محل / أونلاين) — اختر النوع من أعلى النافذة';
  if (/^website must be/.test(s)) return 'رابط الموقع لازم يبدأ بـhttp';
  if (/^invalid email/.test(s)) return 'إيميل غير صالح';
  if (/^unknown channel/.test(s)) return 'قناة غير معروفة';
  if (/^lowes_presence=listed/.test(s)) return 'حالة «موجودون» تحتاج رابط إثبات';
  if (/^row country/.test(s)) return 'الصف لدولة أخرى';
  return s;
}

/** ملف نموذج جاهز للتعبئة (عناوين عربية يفهمها `mapColumns`). */
export async function downloadTemplate(country) {
  const C = COUNTRIES[country];
  const XLSX = (await import('xlsx')).default ?? (await import('xlsx'));
  const headers = ['الاسم', C.regionLabel, 'النوع (محل / أونلاين)', 'الفئة', 'الهاتف', 'واتساب', 'الموقع', 'إنستغرام', 'فيسبوك', 'إيميل', 'المصدر (رابط)', 'تاريخ التحقق', 'ملاحظات'];
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const help = XLSX.utils.aoa_to_sheet([
    ['المطلوب فقط: الاسم، وبعده المحافظة/الإمارة (للمحلات). الباقي اختياري.'],
    [`${C.regionLabel}: ${C.regions.map((r) => C.regionAr[r] || r).join('، ')} — للأونلاين اتركها فارغة أو اكتب «${C.nationwideLabel}».`],
    ['بلا «المصدر» و«تاريخ التحقق»: تدخل الجهة «غير متحقق» ولا تظهر في «ابدأ اليوم» حتى يتحقق منها أحد.'],
    ['اترك الخلية فارغة إذا لا تعرف القيمة — لا تخمّن.'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ليدز');
  XLSX.utils.book_append_sheet(wb, help, 'تعليمات');
  XLSX.writeFile(wb, `lowes-leads-template-${country}.xlsx`);
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
