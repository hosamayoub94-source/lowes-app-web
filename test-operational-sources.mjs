// تست بند 🔴1 — HANDOVER/SUPPLY مُزالان من بنود المصروف/الاستلام السريعة
// لكنهما باقيان كتسميتين في OP_CAT. — node test-operational-sources.mjs
import {
  OP_CAT, OP_EXPENSE_SOURCES, OP_INCOME_SOURCES, OP_ALL_SOURCES,
  isOperational, computeOperationalBalance, computeBookBalance,
} from './src/modules/accounting/components/operationalAccount.js';
import { ENTRY_TYPE, TRANSFER_IN, TRANSFER_OUT, BOOK } from './src/modules/accounting/types/accounting.types.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('❌', m); } };

// 🔴1 — التسليم/التوريد ليسا بندَي مصروف/استلام سريع
ok(!OP_EXPENSE_SOURCES.includes(OP_CAT.HANDOVER), 'HANDOVER مُزال من بنود المصروف السريعة');
ok(!OP_INCOME_SOURCES.includes(OP_CAT.SUPPLY), 'SUPPLY مُزال من بنود الاستلام السريعة');
ok(!OP_ALL_SOURCES.includes(OP_CAT.HANDOVER) && !OP_ALL_SOURCES.includes(OP_CAT.SUPPLY), 'لا يظهران في كل المصادر');
// لكن باقيان كتسميتين للتحويلات
ok(OP_CAT.HANDOVER === 'تسليم للإدارة المالية', 'OP_CAT.HANDOVER باقٍ كتسمية');
ok(OP_CAT.SUPPLY === 'توريد من الإدارة المالية', 'OP_CAT.SUPPLY باقٍ كتسمية');
// البنود السريعة الصحيحة باقية
ok(OP_EXPENSE_SOURCES.includes(OP_CAT.SHIPPING) && OP_EXPENSE_SOURCES.includes(OP_CAT.WAGES), 'بنود المصروف الأساسية باقية');
ok(OP_INCOME_SOURCES.includes(OP_CAT.GOODS_SOLD), 'بند الاستلام الأساسي باقٍ');

// الرصيد التراكمي يراعي التحويلات (التسليم بزرّ مخصّص — لا ازدواج كمصروف)
const entries = [
  { entry_type: ENTRY_TYPE.INCOME,   amount_usd: 1000, book: BOOK.OPERATIONAL },
  { entry_type: ENTRY_TYPE.EXPENSE,  amount_usd: 300,  book: BOOK.OPERATIONAL },
  { entry_type: ENTRY_TYPE.TRANSFER, category: TRANSFER_OUT, amount_usd: 200, book: BOOK.OPERATIONAL }, // تسليم
];
const bal = computeOperationalBalance(entries);
ok(bal.amount_usd === 500, `الرصيد = 1000−300−200 = 500 (كان ${bal.amount_usd})`);
ok(isOperational(entries[0]) && !isOperational(entries[2]), 'التحويل ليس قيداً تشغيلياً (استلام/مصروف)');
ok(computeBookBalance(entries, BOOK.OPERATIONAL).amount_usd === 500, 'computeBookBalance يطابق');

console.log(`\n${fail === 0 ? '✅' : '⚠️'} نتيجة: ${pass}/${pass + fail} نجحت`);
process.exit(fail === 0 ? 0 : 1);
