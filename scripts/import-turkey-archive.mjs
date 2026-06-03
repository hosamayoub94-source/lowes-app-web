// One-time Turkey archive importer (Strong + Lowe's Turkey).
// Heuristic extraction robust to mixed layouts across sheets.
// Usage: node scripts/import-turkey-archive.mjs [dry|go]
import xlsx from 'xlsx';

const FILE = 'C:/Users/acer/Downloads/ارشيف طلبات تركيا.xlsx';
const SUPA = 'https://fghdumrgimoeqsafdhhh.supabase.co';
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const MODE = process.argv[2] || 'dry';

// brand per sheet; returns sheets are skipped entirely.
const SHEETS = [
  { name: ' اقفال strong man', brand: 'strong' },
  { name: 'ارشيف strong',      brand: 'strong' },
  { name: ' ارشيف LOWES',      brand: 'lowes'  },
  { name: ' ارشيف LOWES 12',   brand: 'lowes'  },
];

function exDate(serial) {
  if (typeof serial !== 'number') return null;
  // Plausible Excel serial range ≈ 2017..2031 — reject corrupt values.
  if (serial < 40000 || serial > 50000) return null;
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  if (isNaN(d)) return null;
  const y = d.getUTCFullYear();
  return (y < 2017 || y > 2031) ? null : d.toISOString();
}
function mapStatus(v) {
  const s = String(v || '');
  if (/تم التسليم|delivered|done/i.test(s)) return 'delivered';
  if (/لم يتم|ملغ|cancel|راجع|رفض/i.test(s)) return 'cancelled';
  if (/شحن|ship/i.test(s)) return 'shipped';
  if (/جديد|new|وارد/i.test(s)) return 'pending';
  return null;
}
const isStatus = (v) => mapStatus(v) !== null;
const STATUS_OF = (v) => mapStatus(v) || 'delivered';

const PROD_HINT = /serum|cream|toner|shampoo|mask|gel|سيروم|كريم|تونر|شامبو|ماسك|واقي|غسول|روزماري|كولاجين|ديرما|روول|spray|viagra|largo|cialis|super|epimedyum|maxman|سبراي/i;

function clean(v) { return v == null ? '' : String(v).trim(); }
function digits(v) { return clean(v).replace(/\D/g, ''); }

function extract(row, brand) {
  const date = exDate(row[0]);
  const name = clean(row[1]);
  const phone = digits(row[2]);
  if (!name && !phone) return null;
  if (!/^5\d{8,9}$/.test(phone)) return null; // require a real TR mobile

  // status index → seller is the next cell
  let statusIdx = -1;
  for (let i = 6; i < Math.min(row.length, 22); i++) {
    if (isStatus(row[i])) { statusIdx = i; break; }
  }
  const status = statusIdx >= 0 ? STATUS_OF(row[statusIdx]) : 'delivered';
  const seller = statusIdx >= 0 ? clean(row[statusIdx + 1]) : '';

  // price = largest plausible number before status (3-6 digits, not phone/tracking)
  let price = null;
  const upper = statusIdx >= 0 ? statusIdx : 11;
  for (let i = 6; i < upper; i++) {
    const n = typeof row[i] === 'number' ? row[i] : Number(String(row[i] || '').replace(/[^\d.]/g, ''));
    if (n && n >= 50 && n <= 200000 && String(Math.round(n)).length <= 6) {
      if (price == null || n > price) price = n;
    }
  }

  // city / district / address
  const city = clean(row[4]) || clean(row[3]);
  // address = longest text among cols 5,6,7
  let address = '';
  for (const i of [6, 5, 7]) { const t = clean(row[i]); if (t.length > address.length && !/^\d+$/.test(t)) address = t; }
  const district = (clean(row[5]) && clean(row[5]) !== address && clean(row[5]).length < 20) ? clean(row[5]) : null;

  // code = short alphanumeric like R221 / B390 / WM350 / BT-1
  let code = '';
  for (let i = 8; i < Math.min(row.length, 16); i++) {
    const t = clean(row[i]);
    if (/^[A-Za-z]{1,3}-?\d{1,5}$/.test(t)) { code = t; break; }
  }

  // items: pairs from col >=19, else a free-text product col (6 or 7)
  const items = [];
  for (let c = 19; c < Math.min(row.length, 60); c++) {
    const t = clean(row[c]);
    if (t && PROD_HINT.test(t) && !/^\d+$/.test(t)) {
      const qty = Number(row[c + 1]) || 1;
      items.push({ name: t.slice(0, 60), qty });
    }
  }
  if (items.length === 0) {
    for (const c of [6, 7]) { const t = clean(row[c]); if (t && PROD_HINT.test(t)) { items.push({ name: t.slice(0, 80), qty: Number(row[c + 1]) || 1 }); break; } }
  }

  return {
    market: 'turkey', brand, archived: true, sheet_synced: true,
    order_date: date, customer_name: name || 'عميل',
    phone_1: phone || null, city: city || null, address: address || null,
    amount: price, currency: 'TRY', status,
    handler_name: seller || null, items,
    _code: code, _dedup: phone + '|' + (code || (date || '').slice(0, 10)),
  };
}

const wb = xlsx.readFile(FILE);
let all = [];
for (const sh of SHEETS) {
  const ws = wb.Sheets[sh.name];
  if (!ws) { console.log('MISSING', sh.name); continue; }
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  let n = 0;
  for (const r of rows) { const rec = r && extract(r, sh.brand); if (rec) { all.push(rec); n++; } }
  console.log(`"${sh.name}": ${n} records`);
}

// dedup by phone+code/date
const seen = new Set();
const records = [];
for (const r of all) { if (seen.has(r._dedup)) continue; seen.add(r._dedup); records.push(r); }
console.log(`TOTAL after dedup: ${records.length} (from ${all.length})`);

// assign unique order_ids
records.forEach((r, i) => {
  r.order_id = 'ARC-T-' + (i + 1);
  r.notes = 'أرشيف تركيا' + (r._code ? ' · رقم أصلي: ' + r._code : '');
  delete r._code; delete r._dedup;
});

if (MODE === 'dry') {
  const st = {}, br = {};
  for (const r of records) { st[r.status] = (st[r.status] || 0) + 1; br[r.brand] = (br[r.brand] || 0) + 1; }
  const s = { ...records[0], customer_name: '***', phone_1: '***', address: '***' };
  console.log('STATUS:', JSON.stringify(st), 'BRAND:', JSON.stringify(br));
  console.log('withSeller:', records.filter(r => r.handler_name).length, 'withPrice:', records.filter(r => r.amount).length,
    'withCity:', records.filter(r => r.city).length, 'withItems:', records.filter(r => r.items.length).length);
  console.log('SAMPLE:', JSON.stringify(s));
  process.exit(0);
}

if (!ANON) { console.error('Missing VITE_SUPABASE_ANON_KEY'); process.exit(1); }
const BATCH = 200; let ok = 0, fail = 0;
for (let i = 0; i < records.length; i += BATCH) {
  const chunk = records.slice(i, i + BATCH);
  const res = await fetch(`${SUPA}/rest/v1/orders`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(chunk),
  });
  if (res.ok) { ok += chunk.length; process.stdout.write('.'); }
  else { fail += chunk.length; console.error(`\nBATCH ${i} FAIL ${res.status}: ${(await res.text()).slice(0,300)}`); break; }
}
console.log(`\nDONE ok=${ok} fail=${fail}`);
