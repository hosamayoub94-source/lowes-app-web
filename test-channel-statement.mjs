// تست كشف الحساب التراكمي لقناة + الرصيد الجاري — node test-channel-statement.mjs
import { computeChannelStatement, entryMatchesChannel } from './src/modules/accounting/components/channelStatement.logic.js';
import { TRANSFER_OUT } from './src/modules/accounting/types/accounting.types.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('❌', msg); } };

const entries = [
  { id: 'e3', entry_type: 'income',   channel_id: 'c-qad', amount_usd: 300, entry_date: '2026-03-10', description: 'استلام دفعة' },
  { id: 'e1', entry_type: 'expense',  channel_id: 'c-qad', amount_usd: 100, entry_date: '2026-01-05', description: 'رسوم' },
  { id: 'e2', entry_type: 'income',   channel_id: 'c-qad', amount_usd: 0, amount_try: 500, entry_date: '2026-02-01', description: 'COD' },
  { id: 'tx', entry_type: 'transfer', channel_id: 'c-qad', category: TRANSFER_OUT, amount_usd: 999, entry_date: '2026-02-15' }, // يُستثنى
  { id: 'o1', entry_type: 'expense',  category: 'إيجار', amount_usd: 50, entry_date: '2026-01-20', description: 'إيجار' },
];

// مطابقة القناة
ok(entryMatchesChannel(entries[0], { channelId: 'c-qad' }), 'مطابقة channel_id');
ok(entryMatchesChannel(entries[4], { category: 'إيجار' }), 'مطابقة category نصّاً');
ok(!entryMatchesChannel(entries[4], { channelId: 'c-qad' }), 'category لا يطابق channel_id');

const st = computeChannelStatement(entries, { channelId: 'c-qad' });

// 3 حركات (التحويل مُستثنى)، مرتّبة زمنياً
ok(st.count === 3, `عدد الحركات = 3 (التحويل مستثنى) (كان ${st.count})`);
ok(st.lines[0].id === 'e1' && st.lines[1].id === 'e2' && st.lines[2].id === 'e3', 'الترتيب زمني تصاعدي');

// الرصيد الجاري USD: −100 ثم −100 (حركة TRY) ثم +200
ok(st.lines[0].balance.amount_usd === -100, `بعد الحركة 1: USD=-100 (كان ${st.lines[0].balance.amount_usd})`);
ok(st.lines[1].balance.amount_usd === -100 && st.lines[1].balance.amount_try === 500, 'بعد الحركة 2: USD=-100, TRY=500');
ok(st.lines[2].balance.amount_usd === 200, `بعد الحركة 3: USD=200 (كان ${st.lines[2].balance.amount_usd})`);

// الرصيد الختامي والإجماليات
ok(st.closing.amount_usd === 200 && st.closing.amount_try === 500, 'الرصيد الختامي USD=200, TRY=500');
ok(st.totalIn.amount_usd === 300 && st.totalOut.amount_usd === 100, 'إجمالي وارد/صادر USD = 300/100');

console.log(`\n${fail === 0 ? '✅' : '⚠️'} نتيجة: ${pass}/${pass + fail} نجحت`);
process.exit(fail === 0 ? 0 : 1);
