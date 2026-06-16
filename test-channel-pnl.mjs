// تست الربح/الخسارة لكل قناة + الإجمالي الموحّد بالدولار — node test-channel-pnl.mjs
import { computeChannelPnL } from './src/modules/accounting/components/channelPnL.logic.js';
import { TRANSFER_IN, TRANSFER_OUT } from './src/modules/accounting/types/accounting.types.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('❌', msg); } };

const channels = [
  { id: 'c-qadmous', name_ar: 'قدموس',  kind: 'shipping', is_active: true, icon: '🚚' },
  { id: 'c-online',  name_ar: 'أونلاين', kind: 'online',   is_active: true, icon: '🛒' },
];
const rates = { TRY: 32.5, SYP: 13000 }; // وحدات لكل 1 دولار

const entries = [
  { entry_type: 'income',   channel_id: 'c-qadmous', amount_usd: 0,   amount_try: 1000, amount_syp: 0 }, // COD محصّل
  { entry_type: 'expense',  channel_id: 'c-qadmous', amount_usd: 0,   amount_try: 200,  amount_syp: 0 }, // رسوم شحن
  { entry_type: 'income',   channel_id: 'c-online',  amount_usd: 500, amount_try: 0,    amount_syp: 0 },
  { entry_type: 'expense',  category: 'إيجار',        amount_usd: 100, amount_try: 0,    amount_syp: 0 }, // بلا قناة → category
  { entry_type: 'transfer', category: TRANSFER_OUT,   amount_usd: 999, amount_try: 0,    amount_syp: 0 }, // يُستثنى
];

const { rows, grand } = computeChannelPnL(entries, { channels, rates });

// 3 قنوات: قدموس، أونلاين، إيجار (التحويل مُستثنى)
ok(rows.length === 3, `عدد القنوات = 3 (التحويل مُستثنى) (كان ${rows.length})`);

const q = rows.find(r => r.key === 'c-qadmous');
ok(q && q.name === 'قدموس', `قدموس يأخذ اسمه من جدول القنوات`);
ok(q.in.amount_try === 1000 && q.out.amount_try === 200, `قدموس وارد/صادر TRY = 1000/200`);
ok(q.net.amount_try === 800, `قدموس صافي TRY = 800 (كان ${q.net.amount_try})`);
ok(Math.abs(q.usdNet - (800 / 32.5)) < 0.01, `قدموس صافي ≈ $${(800 / 32.5).toFixed(2)} (كان ${q.usdNet.toFixed(2)})`);

const online = rows.find(r => r.key === 'c-online');
ok(online.usdNet === 500, `أونلاين صافي بالدولار = 500 (كان ${online.usdNet})`);

const rent = rows.find(r => r.key === 'إيجار');
ok(rent && rent.net.amount_usd === -100, `إيجار (بلا قناة، عبر category) صافي USD = -100`);

ok(!rows.some(r => r.key === TRANSFER_OUT || r.key === TRANSFER_IN), `لا توجد صفوف تحويل`);

// الإجمالي الموحّد بالدولار = 500 (أونلاين) − 100 (إيجار) + 800/32.5 (قدموس)
const expectGrand = 500 - 100 + (800 / 32.5);
ok(Math.abs(grand.usdNet - expectGrand) < 0.01, `الإجمالي ≈ $${expectGrand.toFixed(2)} (كان ${grand.usdNet.toFixed(2)})`);

// الفرز الافتراضي تنازلي حسب الصافي بالدولار → أونلاين (500) أولاً
ok(rows[0].key === 'c-online', `الأعلى ربحاً = أونلاين (كان ${rows[0].key})`);

console.log(`\n${fail === 0 ? '✅' : '⚠️'} نتيجة: ${pass}/${pass + fail} نجحت`);
process.exit(fail === 0 ? 0 : 1);
