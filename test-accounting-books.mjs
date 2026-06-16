// تست الكتابين (تشغيلي/مركزي) + التحويل بساقين — node test-accounting-books.mjs
import { filterByBook, BOOK, TRANSFER_IN, TRANSFER_OUT } from './src/modules/accounting/types/accounting.types.js';
import { computeOperationalBalance, computeBookBalance } from './src/modules/accounting/components/operationalAccount.js';
import { computeSourceBreakdown } from './src/modules/accounting/components/sourceBreakdown.logic.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('❌', msg); } };

// فادي/وسيم: استلام 1000$ + مصروف 200$ ثم سلّموا 500$ للمركزي (تحويل بساقين)
// + قيد قديم بلا book (يُعامل كـ central).
const entries = [
  { entry_type: 'income',   book: 'operational', category: 'قدموس', amount_usd: 1000, amount_try: 0, amount_syp: 0 },
  { entry_type: 'expense',  book: 'operational', category: 'شحن',   amount_usd: 200,  amount_try: 0, amount_syp: 0 },
  { entry_type: 'transfer', book: 'operational', category: TRANSFER_OUT, amount_usd: 500, amount_try: 0, amount_syp: 0, transfer_group: 'g1' },
  { entry_type: 'transfer', book: 'central',     category: TRANSFER_IN,  amount_usd: 500, amount_try: 0, amount_syp: 0, transfer_group: 'g1' },
  { entry_type: 'income',   category: 'أونلاين', amount_usd: 50, amount_try: 0, amount_syp: 0 }, // قديم بلا book → central
];

// 1) filterByBook — الفصل + القديم بلا book يُعامل كـ central
ok(filterByBook(entries, BOOK.OPERATIONAL).length === 3, `قيود التشغيلي = 3 (كان ${filterByBook(entries, BOOK.OPERATIONAL).length})`);
ok(filterByBook(entries, BOOK.CENTRAL).length === 2,     `قيود المركزي = 2 (شامل القديم بلا book) (كان ${filterByBook(entries, BOOK.CENTRAL).length})`);

// 2) رصيد التشغيلي = 1000 − 200 − 500 (تسليم) = 300  → التسليم يُنقص رصيدهم
const opBal = computeBookBalance(entries, BOOK.OPERATIONAL);
ok(opBal.amount_usd === 300, `رصيد التشغيلي USD = 300 (1000−200−500) (كان ${opBal.amount_usd})`);

// 3) رصيد المركزي يستلم +500 من التسليم (+50 من القيد القديم) = 550
const cenBal = computeBookBalance(entries, BOOK.CENTRAL);
ok(cenBal.amount_usd === 550, `رصيد المركزي USD = 550 (+500 توريد +50) (كان ${cenBal.amount_usd})`);

// 4) الزوج (تسليم+توريد) يساوي صفراً على مستوى الشركة
const pair = computeOperationalBalance(entries.filter(e => e.transfer_group === 'g1'));
ok(pair.amount_usd === 0, `الزوج (تسليم+توريد) = 0 للشركة (كان ${pair.amount_usd})`);

// 5) التحويلات مُستثناة من الربح/الخسارة (تقرير المصادر)
const { rows, totals } = computeSourceBreakdown(entries);
ok(totals.in.amount_usd === 1050, `إجمالي الوارد USD = 1050 (قدموس 1000 + أونلاين 50، التحويلات مستثناة) (كان ${totals.in.amount_usd})`);
ok(totals.out.amount_usd === 200,  `إجمالي الصادر USD = 200 (شحن فقط، لا تحويلات) (كان ${totals.out.amount_usd})`);
ok(!rows.some(r => r.source === TRANSFER_OUT || r.source === TRANSFER_IN), `لا توجد صفوف تحويل في تقرير المصادر`);

// 6) تحويل بلا اتجاه واضح (category مفقود) لا يُحتسب — حماية من بيانات مشوّهة
const malformed = computeOperationalBalance([{ entry_type: 'transfer', amount_usd: 9999, amount_try: 0, amount_syp: 0 }]);
ok(malformed.amount_usd === 0, `تحويل بلا اتجاه = 0 (كان ${malformed.amount_usd})`);

console.log(`\n${fail === 0 ? '✅' : '⚠️'} نتيجة: ${pass}/${pass + fail} نجحت`);
process.exit(fail === 0 ? 0 : 1);
