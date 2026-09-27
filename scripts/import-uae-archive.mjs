// استيراد طلبات الإمارات من جدول «تنزيل طلبات UEA» (ملف xlsx منزَّل منه).
// طلب حسام 27 أيلول 2026.
//
//   تاب «تسليمات الامارات» → أرشيف: status=delivered, archived=true (لا مزامنة أبداً)
//   تاب «شحنات الامارات»   → طلبات نشطة: بنفس «كود الطلب» الأصلي حتى يحدّث التطبيق
//                             نفس الصف بالجدول عند أي تغيير حالة.
// كل الطلبات source='uae_sheet_import' → لا تُخصم من مخزن دبي (بضاعتها طلعت قبل التتبّع).
//
// Usage: node scripts/import-uae-archive.mjs [dry|go] [path/to/file.xlsx]
// يتطلب VITE_SUPABASE_ANON_KEY (من .env.local) لوضع go فقط. آمن لإعادة التشغيل:
// يتخطّى أي order_id موجود مسبقاً.
import xlsx from 'xlsx';
import fs from 'node:fs';

const MODE = process.argv[2] || 'dry';
const FILE = process.argv[3] || 'C:/Users/acer/Downloads/تنزيل طلبات UEA.xlsx';
const SUPA = 'https://fghdumrgimoeqsafdhhh.supabase.co';

function envKey() {
  if (process.env.VITE_SUPABASE_ANON_KEY) return process.env.VITE_SUPABASE_ANON_KEY;
  try {
    const m = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(/^VITE_SUPABASE_ANON_KEY=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch { return null; }
}

// أعمدة التابين (نفس الترتيب): A التاريخ · B الإسم · C رقم الواتساب · D رقم 2 · E الامارة
// F المنطقة · G العنوان · H السعر · I بعد التوصيل · J الحالة · K صاحب الطلب · L كود الطلب
// M تقييد · N واتساب · O ملاحظة · P نوع الدفع · Q مكان الاستلام · R.. أصناف/أعداد (9 أزواج)
const C = { date: 0, name: 1, phone: 2, phone2: 3, emirate: 4, area: 5, address: 6, price: 7,
  status: 9, seller: 10, code: 11, note: 14, pay: 15, pickup: 16, item0: 17 };

// Excel serial → ISO (منتصف النهار بتوقيت دبي لتفادي انزياح اليوم).
function exDate(v) {
  if (typeof v !== 'number' || v < 30000 || v > 80000) return null;
  const ms = Math.round((v - 25569) * 86400 * 1000);
  const d = new Date(ms + 8 * 3600 * 1000); // 12:00 GST = 08:00Z
  return isNaN(d) ? null : d.toISOString();
}

const STATUS = [
  [/تم التسليم/, 'delivered'], [/تسوية/, 'settled'], [/لم يتم الاستلام/, 'not_received'],
  [/استرجاع|راجع/, 'returned'], [/انتظار|متابعة/, 'waiting'], [/تجهيز/, 'preparing'],
  [/قيد التوصيل|الطريق/, 'on_way'], [/نقل|شحن/, 'shipped'], [/ملغ|الغاء|إلغاء/, 'cancelled'],
  [/وارد|جديد/, 'pending'],
];
const mapStatus = (v, dflt) => {
  const s = String(v || '').trim();
  for (const [re, k] of STATUS) if (re.test(s)) return k;
  return dflt;
};

// أسماء البائعات بالجدول → أسماء حساباتهن بالتطبيق (profiles.employee_name).
const SELLERS = { arwa: 'Arwa Mohammed', raghad: 'Raghad Almaroof', reem: 'Reem alkshki' };
const mapSeller = (v) => {
  const s = String(v || '').replace(/[\u064B-\u0652]/g, '').trim(); // يشيل الكسرة الملصوقة «ِARWA»
  const first = s.split(/\s+/)[0].toLowerCase();
  return SELLERS[first] || s || null;
};

const PICKUP = (v) => {
  const s = String(v || '');
  if (/عمل/.test(s)) return 'عنوان العمل';
  if (/منزل/.test(s)) return 'عنوان المنزل';
  if (/مركز/.test(s)) return 'استلام من المركز';
  return s.trim() || null;
};

const str = (v) => (v == null || v === '' ? null : String(v).trim() || null);
const num = (v) => (typeof v === 'number' ? v : (v ? Number(String(v).replace(/[^\d.]/g, '')) || null : null));

// تاب الأرشيف فيه صفوف أعمدتها مُزاحة (بعضها بلا «ملاحظة»/«واتساب» → الدفع/الاستلام/
// الأصناف تبدأ أبكر). لذلك من العمود M فصاعداً نتعرّف على كل خانة بمحتواها لا بموقعها.
const PAY_RE = /دفع/, PICK_RE = /عنوان|استلام/, SKIP_RE = /^(تتبع|📱 ?WhatsApp|whatsapp)$/i;
function parseTail(r) {
  let pay = null, pickup = null, note = null, firstItem = -1;
  for (let c = 12; c < r.length; c++) {
    const v = r[c];
    if (v == null || v === '' || typeof v === 'boolean') continue;
    const s = String(v).trim();
    if (typeof v === 'string' && PAY_RE.test(s) && !pay) { pay = s; continue; }
    if (typeof v === 'string' && PICK_RE.test(s) && !pickup) { pickup = s; continue; }
    if (typeof v === 'string' && SKIP_RE.test(s)) continue;
    // أول صنف = نص يتبعه رقم (العدد)، وليس رقم هاتف
    if (typeof v === 'string' && typeof r[c + 1] === 'number' && !/^\+?\d[\d\s()-]{6,}$/.test(s)) { firstItem = c; break; }
    if (c === C.note && typeof v === 'string') note = s;
  }
  const items = [];
  if (firstItem >= 0) {
    for (let c = firstItem; c < r.length - 1; c += 2) {
      const nm = typeof r[c] === 'string' ? r[c].trim() : '';
      if (!nm) { if (r[c] == null || r[c] === '') continue; break; }
      items.push({ name: nm, qty: Number(r[c + 1]) || 1 });
    }
  }
  return { pay, pickup, note, items };
}

let lastGoodDate = null;
function toRecord(r, { archived, defaultStatus }) {
  const { pay, pickup, note, items } = parseTail(r);
  // تاريخ مكتوب غلط بالجدول (سنة 2020 مثلاً — القناة بدأت حزيران 2025) → تاريخ الصف السابق.
  let od = typeof r[C.date] === 'number' && r[C.date] >= 45800 ? exDate(r[C.date]) : null;
  if (od) lastGoodDate = od; else od = lastGoodDate;
  return {
    market: 'uae', brand: 'lowes', currency: 'AED', source: 'uae_sheet_import',
    archived, sheet_synced: true, sync_status: 'synced',
    order_date: od,
    customer_name: str(r[C.name]) || 'عميل',
    phone_1: str(r[C.phone]), phone_2: str(r[C.phone2]),
    wa_number: str(r[C.phone]),
    city: str(r[C.emirate]), district: str(r[C.area]), address: str(r[C.address]),
    amount: num(r[C.price]),
    status: mapStatus(r[C.status], defaultStatus),
    handler_name: mapSeller(r[C.seller]),
    order_id: str(r[C.code]),
    notes: note,
    payment_method: pay,
    pickup_type: PICKUP(pickup),
    shipping_company: 'مندوب توصيل',
    items,
  };
}

// صف طلب حقيقي: فيه اسم + كود، والتاريخ رقم تسلسلي إكسل أو فاضي (يستبعد صفوف الجرد/المجاميع).
// + الحالة نص معروف (يستبعد صفوف الجرد بأعلى التاب اللي أعمدتها أرقام).
const isOrderRow = (r) => r && str(r[C.name]) && str(r[C.code])
  && (r[C.date] == null || r[C.date] === '' || (typeof r[C.date] === 'number' && r[C.date] > 40000))
  && (typeof r[C.price] === 'number' || !str(r[C.price]))
  && typeof r[C.status] === 'string' && mapStatus(r[C.status], null) !== null;

const wb = xlsx.readFile(FILE, { raw: true });
const rowsOf = (tab) => xlsx.utils.sheet_to_json(wb.Sheets[tab], { header: 1, defval: null, raw: true });

const archRows = rowsOf('تسليمات الامارات').filter(isOrderRow)
  .filter(r => mapStatus(r[C.status], null) === 'delivered');
const activeAll = rowsOf('شحنات الامارات');
const hdr = activeAll.findIndex(r => r && r.includes('كود الطلب'));
const activeRows = activeAll.slice(hdr + 1).filter(isOrderRow);

const records = [];
const seen = new Set();
const uniq = (rec, prefix) => {
  // كود مكرر/فارغ → كود اصطناعي فريد (القيد UNIQUE على order_id) مع حفظ الأصلي بالملاحظة.
  if (!rec.order_id || seen.has(rec.order_id)) {
    const orig = rec.order_id;
    rec.order_id = `${prefix}${records.length + 1}`;
    rec.notes = [rec.notes, orig ? `رقم أصلي: ${orig}` : null].filter(Boolean).join(' · ') || null;
  }
  seen.add(rec.order_id);
  records.push(rec);
};
activeRows.forEach(r => uniq(toRecord(r, { archived: false, defaultStatus: 'preparing' }), 'UAE-ACT-'));
archRows.forEach(r => {
  const rec = toRecord(r, { archived: true, defaultStatus: 'delivered' });
  rec.notes = ['أرشيف تسليمات الإمارات', rec.notes].filter(Boolean).join(' · ');
  uniq(rec, 'ARC-U-');
});

const count = (arr, k) => arr.reduce((m, x) => ((m[x[k] ?? '∅'] = (m[x[k] ?? '∅'] || 0) + 1), m), {});
const active = records.filter(r => !r.archived), arch = records.filter(r => r.archived);
console.log(`ACTIVE ${active.length}  status=${JSON.stringify(count(active, 'status'))}`);
console.log(`ARCHIVE ${arch.length}  status=${JSON.stringify(count(arch, 'status'))}`);
console.log(`sellers=${JSON.stringify(count(records, 'handler_name'))}`);
console.log(`noDate=${records.filter(r => !r.order_date).length} noAmount=${records.filter(r => !r.amount).length} noItems=${records.filter(r => !r.items.length).length} synthIds=${records.filter(r => /^(ARC-U-|UAE-ACT-)/.test(r.order_id)).length}`);
const dates = records.map(r => r.order_date).filter(Boolean).sort();
console.log(`dateRange ${dates[0]} → ${dates[dates.length - 1]}`);
console.log(`sampleActive(masked) ${JSON.stringify({ ...active[0], customer_name: '***', phone_1: '***', phone_2: null, wa_number: '***', address: '***' })}`);

if (MODE !== 'go') { console.log('\n(dry run — nothing written. Run with "go" to insert.)'); process.exit(0); }

const ANON = envKey();
if (!ANON) { console.error('Missing VITE_SUPABASE_ANON_KEY'); process.exit(1); }
const H = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };

// تخطّي الموجود مسبقاً (إعادة تشغيل آمنة)
const existing = new Set();
for (let i = 0; i < records.length; i += 100) {
  const ids = records.slice(i, i + 100).map(r => `"${r.order_id.replace(/"/g, '')}"`).join(',');
  const res = await fetch(`${SUPA}/rest/v1/orders?select=order_id&order_id=in.(${encodeURIComponent(ids)})`, { headers: H });
  if (!res.ok) { console.error('lookup failed', res.status, await res.text()); process.exit(1); }
  (await res.json()).forEach(x => existing.add(x.order_id));
}
const todo = records.filter(r => !existing.has(r.order_id));
console.log(`already in app: ${existing.size} · to insert: ${todo.length}`);

let ok = 0;
for (let i = 0; i < todo.length; i += 100) {
  const chunk = todo.slice(i, i + 100);
  const res = await fetch(`${SUPA}/rest/v1/orders`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(chunk) });
  if (!res.ok) { console.error(`\nBATCH ${i} FAILED ${res.status}: ${(await res.text()).slice(0, 400)}`); process.exit(1); }
  ok += chunk.length; process.stdout.write('.');
}
console.log(`\nDONE inserted=${ok}`);
