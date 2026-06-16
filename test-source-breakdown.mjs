// تست منطق الوارد/الصادر لكل جهة + الرصيد التشغيلي — node test-source-breakdown.mjs
import { computeSourceBreakdown, netFor } from './src/modules/accounting/components/sourceBreakdown.logic.js';
import { computeOperationalBalance, filterOperational } from './src/modules/accounting/components/operationalAccount.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('❌', msg); } };

const entries = [
  { entry_type: 'income',   category: 'يورتيتشي', amount_try: 1000, amount_usd: 0, amount_syp: 0 }, // COD محصّل
  { entry_type: 'expense',  category: 'يورتيتشي', amount_try: 200,  amount_usd: 0, amount_syp: 0 }, // رسوم شحن
  { entry_type: 'expense',  category: 'أرامكس',   amount_usd: 50,   amount_try: 0, amount_syp: 0 },
  { entry_type: 'salary',   category: 'أرامكس',   amount_usd: 30,   amount_try: 0, amount_syp: 0 }, // صادر أيضاً
  { entry_type: 'transfer', category: 'يورتيتشي', amount_try: 9999, amount_usd: 0, amount_syp: 0 }, // يُتجاهل
  { entry_type: 'income',   category: '',         amount_syp: 5000, amount_usd: 0, amount_try: 0 }, // بلا جهة
];

const { rows, totals } = computeSourceBreakdown(entries);

// 3 جهات: يورتيتشي، أرامكس، غير محدّد
ok(rows.length === 3, `عدد الجهات = 3 (كان ${rows.length})`);

const yurtici = rows.find(r => r.source === 'يورتيتشي');
ok(yurtici.in.amount_try === 1000, `يورتيتشي وارد TRY = 1000 (كان ${yurtici.in.amount_try})`);
ok(yurtici.out.amount_try === 200,  `يورتيتشي صادر TRY = 200 (كان ${yurtici.out.amount_try})`);
ok(netFor(yurtici, 'amount_try') === 800, `يورتيتشي صافي TRY = 800 (كان ${netFor(yurtici, 'amount_try')})`);

const aramex = rows.find(r => r.source === 'أرامكس');
ok(aramex.out.amount_usd === 80, `أرامكس صادر USD = 80 (مصروف 50 + راتب 30) (كان ${aramex.out.amount_usd})`);
ok(aramex.in.amount_usd === 0,  `أرامكس وارد USD = 0`);
ok(netFor(aramex, 'amount_usd') === -80, `أرامكس صافي USD = -80 (كان ${netFor(aramex, 'amount_usd')})`);

const undef = rows.find(r => r.source === 'غير محدّد');
ok(undef && undef.in.amount_syp === 5000, `غير محدّد وارد SYP = 5000`);

// التحويل (9999) مُتجاهل من الإجماليات
ok(totals.in.amount_try === 1000, `إجمالي الوارد TRY = 1000 (التحويل مُتجاهل) (كان ${totals.in.amount_try})`);
ok(totals.out.amount_usd === 80,  `إجمالي الصادر USD = 80 (كان ${totals.out.amount_usd})`);
ok(totals.in.amount_syp === 5000, `إجمالي الوارد SYP = 5000`);

// الترتيب تنازلي حسب الحجم (يورتيتشي 1200 > الباقي)
ok(rows[0].source === 'يورتيتشي', `الأعلى حركةً = يورتيتشي (كان ${rows[0].source})`);

// ── الرصيد التشغيلي (استلامات − مصاريف، تجاهل الرواتب/التحويلات) ──
const opEntries = [
  { entry_type: 'income',   amount_try: 1000, amount_usd: 0,   amount_syp: 0 },
  { entry_type: 'expense',  amount_try: 200,  amount_usd: 0,   amount_syp: 0 },
  { entry_type: 'expense',  amount_try: 0,    amount_usd: 80,  amount_syp: 0 },
  { entry_type: 'salary',   amount_try: 0,    amount_usd: 500, amount_syp: 0 }, // يُتجاهل
  { entry_type: 'transfer', amount_try: 9999, amount_usd: 0,   amount_syp: 0 }, // يُتجاهل
  { entry_type: 'advance',  amount_try: 0,    amount_usd: 300, amount_syp: 0 }, // يُتجاهل
];
ok(filterOperational(opEntries).length === 3, `القيود التشغيلية = 3 (دخل+مصروفان) (كان ${filterOperational(opEntries).length})`);
const opBal = computeOperationalBalance(opEntries);
ok(opBal.amount_try === 800, `الرصيد TRY = 800 (1000-200) (كان ${opBal.amount_try})`);
ok(opBal.amount_usd === -80, `الرصيد USD = -80 (الراتب والسلفة مُتجاهلان) (كان ${opBal.amount_usd})`);
ok(opBal.amount_syp === 0,   `الرصيد SYP = 0`);

console.log(`\n${fail === 0 ? '✅' : '⚠️'} نتيجة: ${pass}/${pass + fail} نجحت`);
process.exit(fail === 0 ? 0 : 1);
