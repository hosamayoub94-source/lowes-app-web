// تحويل ورقة «تأكيدات التسليم المالية» (CSV بعد تعبئتها) إلى حمولة لـ confirm_order_deliveries (D-179).
// دوال نقية بلا شبكة ولا قاعدة: تتحقق محلياً قبل أي إرسال. الإرسال نفسه يمرّ بوضع التجربة (p_apply=false) أولاً.
// لا تخترع قيماً: صف بلا تاريخ يُعدّ «غير معبّأ» ويُتجاوز، وصف بنصف بيانات يُرفض برسالة واضحة.

export const BASIS_LABELS = {
  'تقرير شركة الشحن': 'carrier_record',
  'ورقة/جدول التسليم': 'delivery_sheet',
  'كشف السائق/المندوب': 'driver_report',
  'إيصال تحصيل نقدي': 'cash_receipt',
  'تأكيد الزبون': 'customer_confirmation',
  'قيد محاسبي': 'accounting_record',
  'مستند آخر': 'other_document',
};
const BASIS_VALUES = new Set(Object.values(BASIS_LABELS));

/** CSV بسيط مع علامات اقتباس وسطور داخل الحقول وBOM. */
export function parseCsv(text) {
  const s = String(text || '').replace(/^\uFEFF/, '');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((c) => c !== '')) rows.push(row); row = []; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.some((c) => c !== '')) rows.push(row); }
  return rows;
}

/** "2026-10-14 15:30" ← 2026-10-14T15:30:00+03:00. تاريخ بلا وقت ← 12:00 مع إشارة timeAssumed (لا دقة مزيّفة). */
export function toIstanbulIso(v) {
  const t = String(v || '').trim().replace(/\//g, '-');
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/.exec(t);
  const pad = (x) => String(x).padStart(2, '0');
  if (m) { const [, y, mo, d, h, mi] = m; if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59) return null; return { iso: `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${mi}:00+03:00`, timeAssumed: false }; }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) { const [, y, mo, d] = m; if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null; return { iso: `${y}-${pad(mo)}-${pad(d)}T12:00:00+03:00`, timeAssumed: true }; }
  return null;
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const findCol = (header, ...needles) => header.findIndex((h) => needles.some((n) => norm(h).includes(n)));

/**
 * @param {string} csvText ورقة معبّأة. الأعمدة المعرَّفة بالعنوان: «رقم الطلب» · «تاريخ التسليم» · «أساس التأكيد» · «المستند» · «ملاحظة».
 * @returns {{payload:Array, skipped:number, errors:Array<{line:number, code:string, error:string}>, assumedTime:number}}
 */
export function buildConfirmationPayload(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return { payload: [], skipped: 0, errors: [{ line: 0, code: '', error: 'الملف فارغ أو بلا صفوف' }], assumedTime: 0 };
  const h = rows[0];
  const cCode = findCol(h, 'رقم الطلب'), cAt = findCol(h, 'تاريخ التسليم المؤكَّد', 'تاريخ التسليم المؤكد'), cBasis = findCol(h, 'أساس التأكيد'), cRef = findCol(h, 'المستند'), cNote = findCol(h, 'ملاحظة');
  if ([cCode, cAt, cBasis, cRef].some((i) => i < 0)) return { payload: [], skipped: 0, errors: [{ line: 1, code: '', error: 'أعمدة ناقصة: يلزم «رقم الطلب» و«تاريخ التسليم المؤكَّد» و«أساس التأكيد» و«المستند»' }], assumedTime: 0 };
  const payload = [], errors = []; let skipped = 0, assumedTime = 0; const seen = new Set();
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2; const code = norm(r[cCode]); const at = norm(r[cAt]); const basisRaw = norm(r[cBasis]); const ref = norm(r[cRef]); const note = cNote >= 0 ? norm(r[cNote]) : '';
    if (!at && !basisRaw && !ref) { skipped++; return; }          // غير معبّأ بعد
    const fail = (error) => errors.push({ line, code, error });
    if (!code) return fail('رقم الطلب فارغ');
    if (seen.has(code)) return fail('رقم الطلب مكرر في الملف');
    seen.add(code);
    if (!at) return fail('التاريخ ناقص');
    const d = toIstanbulIso(at); if (!d) return fail(`تاريخ غير مفهوم «${at}» (الصيغة YYYY-MM-DD HH:MM)`);
    const basis = BASIS_LABELS[basisRaw] || (BASIS_VALUES.has(basisRaw) ? basisRaw : null); if (!basis) return fail(`أساس غير معروف «${basisRaw}»`);
    if (ref.length < 3) return fail('المستند/المرجع إلزامي (3 أحرف على الأقل)');
    if (d.timeAssumed) assumedTime++;
    payload.push({ order_code: code, delivered_at: d.iso, basis, evidence_ref: ref, ...(note || d.timeAssumed ? { note: [note, d.timeAssumed ? 'الوقت غير معروف، افتُرض 12:00 بتوقيت إسطنبول' : ''].filter(Boolean).join(' — ') } : {}) });
  });
  return { payload, skipped, errors, assumedTime };
}

/**
 * عدة ملفات (ورقة لكل فريق/شركة شحن) ← حمولة واحدة. يكشف الطلب المكرر بين الملفات، ويُرجع إحصاء كل ملف.
 * @param {Array<{name:string, text:string}>} files
 */
export function buildConfirmationPayloadMany(files) {
  const payload = [], errors = [], perFile = []; let skipped = 0, assumedTime = 0; const firstSeen = new Map();
  for (const f of files) {
    const r = buildConfirmationPayload(f.text);
    perFile.push({ name: f.name, valid: r.payload.length, skipped: r.skipped, errors: r.errors.length });
    skipped += r.skipped; assumedTime += r.assumedTime;
    for (const e of r.errors) errors.push({ file: f.name, ...e });
    for (const p of r.payload) {
      if (firstSeen.has(p.order_code)) { errors.push({ file: f.name, line: 0, code: p.order_code, error: `رقم الطلب مكرر بين الملفات (أولاً في ${firstSeen.get(p.order_code)})` }); continue; }
      firstSeen.set(p.order_code, f.name); payload.push(p);
    }
  }
  return { payload, skipped, errors, assumedTime, perFile };
}
