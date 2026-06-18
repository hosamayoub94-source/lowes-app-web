// تست كشف حركة الحساب (محفظة + قناة) — node test-account-statement.mjs
import {
  walletStatementRows,
  channelStatementRows,
  buildStatement,
  statementHasCurrency,
} from './src/modules/accounting/components/accountStatement.logic.js';
import { WALLETS, TRANSFER_IN, TRANSFER_OUT } from './src/modules/accounting/types/accounting.types.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('❌', msg); } };

const shamUsd = WALLETS.find(w => w.id === 'sham_usd');   // عملة USD
const cashSyp = WALLETS.find(w => w.id === 'cash_syp');   // عملة SYP

// ── كشف محفظة: شام USD ──────────────────────────────────────────────────────
const wEntries = [
  { id: 'e1', entry_date: '2026-05-01', entry_type: 'income',  description: 'بيع',   payment_method: 'sham_usd', amount_usd: 300 },
  { id: 'e2', entry_date: '2026-05-05', entry_type: 'expense', description: 'شحن',    payment_method: 'sham_usd', amount_usd: 100 },
  { id: 'e3', entry_date: '2026-05-10', entry_type: 'transfer', category: TRANSFER_IN,  description: 'توريد', payment_method: 'sham_usd', amount_usd: 50 },
  { id: 'e4', entry_date: '2026-05-12', entry_type: 'transfer', category: TRANSFER_OUT, description: 'تسليم', payment_method: 'sham_usd', amount_usd: 30 },
  { id: 'e5', entry_date: '2026-05-15', entry_type: 'income',  description: 'بيع آخر', payment_method: 'cash_usd', amount_usd: 999 }, // محفظة أخرى → يُستثنى
  { id: 'e6', entry_date: '2026-04-20', entry_type: 'income',  description: 'بيع قديم (شام كاش عام)', payment_method: 'sham_cash', amount_usd: 70 }, // legacy → sham_usd
];

const wRows = walletStatementRows(wEntries, shamUsd);
ok(wRows.length === 5, `محفظة شام USD: 5 حركات (تستثني محفظة أخرى) (كان ${wRows.length})`);
ok(!wRows.some(r => r.id === 'e5'), `قيد محفظة أخرى مُستثنى`);
ok(wRows.some(r => r.id === 'e6'), `قيد legacy "sham_cash" يُحسب ضمن شام USD`);

const wStmt = buildStatement(wRows, {});
// الرصيد النهائي = +300 −100 +50 −30 +70 = 290
ok(wStmt.totals.net.amount_usd === 290, `رصيد شام USD الصافي = 290 (كان ${wStmt.totals.net.amount_usd})`);
ok(wStmt.totals.in.amount_usd === 420, `إجمالي الوارد = 420 (300+50+70) (كان ${wStmt.totals.in.amount_usd})`);
ok(wStmt.totals.out.amount_usd === 130, `إجمالي الصادر = 130 (100+30) (كان ${wStmt.totals.out.amount_usd})`);

// ترتيب زمنيّ صاعد: e6 (أبريل) أولاً، ثم e1..e4
ok(wStmt.rows[0].id === 'e6', `الأقدم أولاً = e6 (كان ${wStmt.rows[0].id})`);
// رصيد جارٍ: بعد e6 = 70، بعد e1 = 370، بعد e2 = 270، بعد e3 = 320، بعد e4 = 290
ok(wStmt.rows[0].balance.amount_usd === 70, `رصيد جارٍ بعد e6 = 70 (كان ${wStmt.rows[0].balance.amount_usd})`);
ok(wStmt.rows[1].balance.amount_usd === 370, `رصيد جارٍ بعد e1 = 370 (كان ${wStmt.rows[1].balance.amount_usd})`);
ok(wStmt.rows[4].balance.amount_usd === 290, `رصيد جارٍ نهائي = 290 (كان ${wStmt.rows[4].balance.amount_usd})`);

// فلترة بالتاريخ: مايو فقط → يستثني e6 (أبريل)
const wMay = buildStatement(wRows, { from: '2026-05-01', to: '2026-05-31' });
ok(wMay.totals.count === 4, `فلتر مايو: 4 حركات (كان ${wMay.totals.count})`);
ok(wMay.totals.net.amount_usd === 220, `صافي مايو = 220 (290−70) (كان ${wMay.totals.net.amount_usd})`);

// بحث نصّي
const wSearch = buildStatement(wRows, { query: 'شحن' });
ok(wSearch.totals.count === 1 && wSearch.rows[0].id === 'e2', `بحث "شحن" → قيد واحد`);

// ── كشف قناة: القدموس (متعدّد العملات) ──────────────────────────────────────
const chEntries = [
  { id: 'c1', entry_date: '2026-05-02', entry_type: 'income',  channel_id: 'c-qad', description: 'COD', amount_try: 1000 },
  { id: 'c2', entry_date: '2026-05-03', entry_type: 'expense', channel_id: 'c-qad', description: 'رسوم', amount_try: 200 },
  { id: 'c3', entry_date: '2026-05-04', entry_type: 'transfer', channel_id: 'c-qad', category: TRANSFER_OUT, description: 'تحويل', amount_try: 500 }, // مُستثنى
  { id: 'c4', entry_date: '2026-05-05', entry_type: 'income',  channel_id: 'c-other', description: 'قناة أخرى', amount_try: 9999 }, // مُستثنى
  { id: 'c5', entry_date: '2026-05-06', entry_type: 'expense', category: 'إيجار', description: 'بلا قناة', amount_usd: 100 },
];

const chRows = channelStatementRows(chEntries, { channelId: 'c-qad' });
ok(chRows.length === 2, `قناة القدموس: حركتان (تستثني التحويل والقناة الأخرى) (كان ${chRows.length})`);
const chStmt = buildStatement(chRows, {});
ok(chStmt.totals.in.amount_try === 1000 && chStmt.totals.out.amount_try === 200, `القدموس وارد/صادر TRY = 1000/200`);
ok(chStmt.totals.net.amount_try === 800, `القدموس صافي TRY = 800 (كان ${chStmt.totals.net.amount_try})`);
ok(chStmt.rows[1].balance.amount_try === 800, `رصيد جارٍ نهائي TRY = 800 (كان ${chStmt.rows[1].balance.amount_try})`);

// كشف مصدر بلا قناة (category)
const catRows = channelStatementRows(chEntries, { categoryKey: 'إيجار' });
ok(catRows.length === 1 && catRows[0].id === 'c5', `مصدر "إيجار" بلا قناة: قيد واحد`);

// statementHasCurrency
ok(statementHasCurrency(chStmt.totals, 'amount_try') === true, `القدموس له حركة TRY`);
ok(statementHasCurrency(chStmt.totals, 'amount_syp') === false, `القدموس بلا حركة SYP`);

// ── [#27] ترتيب حركات نفس اليوم بـcreated_at ثم id (رصيد جارٍ حتميّ) ──────────────
const cashUsd = WALLETS.find(w => w.id === 'cash_usd');
const sameDay = [ // مُدخَل بترتيب مبعثر عمداً (d2, d1, d3)
  { id: 'd2', entry_date: '2026-06-01', entry_type: 'income',  description: 'ثاني', payment_method: 'cash_usd', amount_usd: 100, created_at: '2026-06-01T12:00:00Z' },
  { id: 'd1', entry_date: '2026-06-01', entry_type: 'expense', description: 'أول',  payment_method: 'cash_usd', amount_usd: 40,  created_at: '2026-06-01T09:00:00Z' },
  { id: 'd3', entry_date: '2026-06-01', entry_type: 'income',  description: 'ثالث', payment_method: 'cash_usd', amount_usd: 10,  created_at: '2026-06-01T15:00:00Z' },
];
const sdStmt = buildStatement(walletStatementRows(sameDay, cashUsd), {});
ok(sdStmt.rows.map(r => r.id).join(',') === 'd1,d2,d3', `ترتيب نفس اليوم بـcreated_at = d1,d2,d3 (كان ${sdStmt.rows.map(r => r.id).join(',')})`);
ok(sdStmt.rows[0].balance.amount_usd === -40, `رصيد جارٍ بعد d1 = −40 (كان ${sdStmt.rows[0].balance.amount_usd})`);
ok(sdStmt.rows[2].balance.amount_usd === 70,  `رصيد جارٍ نهائي = 70 (كان ${sdStmt.rows[2].balance.amount_usd})`);

console.log(`\n${fail === 0 ? '✅' : '⚠️'} نتيجة: ${pass}/${pass + fail} نجحت`);
process.exit(fail === 0 ? 0 : 1);
