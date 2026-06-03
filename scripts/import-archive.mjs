// One-time archive importer: reads the Archive xlsx, maps columns, inserts
// into `orders` as archived rows. Usage: node scripts/import-archive.mjs [dry|go]
import xlsx from 'xlsx';

const FILE = 'C:/Users/acer/Downloads/جدول بيانات بدون عنوان.xlsx';
const SUPA = 'https://fghdumrgimoeqsafdhhh.supabase.co';
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const MODE = process.argv[2] || 'dry';

// Excel serial date → ISO
function exDate(serial) {
  if (typeof serial !== 'number') return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return isNaN(d) ? null : d.toISOString();
}
const STATUS = { 'DONE': 'delivered', 'SHIP': 'shipped', 'NEW': 'pending' };
function mapStatus(v) {
  if (!v) return 'delivered';
  const s = String(v).toUpperCase();
  if (s.includes('DONE')) return 'delivered';
  if (s.includes('SHIP')) return 'shipped';
  if (s.includes('NEW')) return 'pending';
  return 'delivered';
}
const STRONG = ['zina','zena','khder','khedr','khidr'];
function brandOf(seller) {
  const s = String(seller || '').toLowerCase();
  return STRONG.some(k => s.includes(k)) ? 'strong' : 'lowes';
}

const wb = xlsx.readFile(FILE);
const rows = xlsx.utils.sheet_to_json(wb.Sheets['Archive'], { header: 1, defval: null, raw: true });
const data = rows.slice(4).filter(r => r && (String(r[1]||'').trim() || r[2]));

const records = data.map((r, idx) => {
  // items: product names from cols 19,21,23,25,27,29,31 (qty in next even col, default 1)
  const items = [];
  for (let c = 19; c <= 31; c += 2) {
    const nm = r[c];
    if (nm && String(nm).trim()) items.push({ name: String(nm).trim(), qty: Number(r[c+1]) || 1 });
  }
  const origId = r[12] != null ? String(r[12]).trim() : '';
  return {
    market: 'syria',
    brand: brandOf(r[13]),
    archived: true,
    sheet_synced: true,
    order_date: exDate(r[0]),
    customer_name: String(r[1] || '').trim() || 'عميل',
    phone_1: r[2] != null ? String(r[2]).trim() : null,
    phone_2: r[3] != null ? String(r[3]).trim() : null,
    city: r[4] != null ? String(r[4]).trim() : null,
    address: r[5] != null ? String(r[5]).trim() : null,
    amount: typeof r[6] === 'number' ? r[6] : (r[6] ? Number(String(r[6]).replace(/[^\d.]/g,'')) || null : null),
    currency: 'SYP',
    status: mapStatus(r[11]),
    // order_id has a UNIQUE constraint; archive has dup/blank codes → use a
    // guaranteed-unique synthetic id, keep the original code in notes.
    order_id: 'ARC-' + (idx + 1),
    handler_name: r[13] != null ? String(r[13]).trim() : null,
    shipping_company: r[16] != null ? String(r[16]).trim() : null,
    payment_method: r[17] != null ? String(r[17]).trim() : null,
    notes: 'أرشيف' + (origId ? ' · رقم أصلي: ' + origId : ''),
    items,
  };
});

if (MODE === 'test') {
  if (!ANON) { console.error('Missing VITE_SUPABASE_ANON_KEY'); process.exit(1); }
  const t = { ...records[0], order_id: 'ARC-TEST-0' };
  const res = await fetch(`${SUPA}/rest/v1/orders`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(t),
  });
  console.log('TEST insert status', res.status, (await res.text()).slice(0, 200));
  process.exit(0);
}

if (MODE === 'dry') {
  const cur = {}, st = {}, br = {};
  for (const x of records) { st[x.status]=(st[x.status]||0)+1; br[x.brand]=(br[x.brand]||0)+1; }
  const sample = { ...records[0], customer_name: '***', phone_1: '***', phone_2: null, address: '***' };
  console.log('RECORDS:', records.length);
  console.log('STATUS:', JSON.stringify(st));
  console.log('BRAND:', JSON.stringify(br));
  console.log('withItems:', records.filter(r=>r.items.length).length, 'withAmount:', records.filter(r=>r.amount).length, 'withDate:', records.filter(r=>r.order_date).length);
  console.log('SAMPLE(masked):', JSON.stringify(sample));
  process.exit(0);
}

// GO: insert in batches
if (!ANON) { console.error('Missing VITE_SUPABASE_ANON_KEY env'); process.exit(1); }
const BATCH = 200;
let ok = 0, fail = 0;
for (let i = 0; i < records.length; i += BATCH) {
  const chunk = records.slice(i, i + BATCH);
  const res = await fetch(`${SUPA}/rest/v1/orders`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(chunk),
  });
  if (res.ok) { ok += chunk.length; process.stdout.write(`.`); }
  else { fail += chunk.length; console.error(`\nBATCH ${i} FAILED ${res.status}: ${(await res.text()).slice(0,300)}`); break; }
}
console.log(`\nDONE ok=${ok} fail=${fail}`);
