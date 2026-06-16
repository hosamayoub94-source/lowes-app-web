// =============================================================
// منطق نقيّ — كشف حركة الحساب (محفظة أو قناة) — قابل للاختبار بلا React.
//   • محفظة (شام كاش، كاش $…): عملة واحدة — اتجاه القيد عبر walletDelta
//     (دخل/تحويل وارد = +، مصروف/سلفة/راتب/تحويل صادر = −).
//   • قناة (القدموس، أونلاين…): متعدّد العملات — دخل = وارد، مصروف/سلفة/راتب
//     = صادر، والتحويلات الداخلية تُستثنى (نفس منطق channelPnL).
//   • buildStatement: فلترة بالتاريخ/البحث + ترتيب زمنيّ + رصيد جارٍ لكل عملة.
// =============================================================
import { ENTRY_TYPE, walletDelta } from '../types/accounting.types.js';
import { CCY, blank } from './sourceBreakdown.logic.js';

const OUT_TYPES = new Set([ENTRY_TYPE.EXPENSE, ENTRY_TYPE.SALARY, ENTRY_TYPE.ADVANCE]);

// شكل الصفّ الموحّد: { id, date, description, category, entry_type, in:{usd,try,syp}, out:{...}, raw }

/** صفوف كشف محفظة (عملة واحدة). يستعمل walletDelta لاتجاه القيد والمحافظ القديمة. */
export function walletStatementRows(entries = [], wallet) {
  if (!wallet) return [];
  const rows = [];
  for (const e of entries) {
    const delta = walletDelta(e, wallet);
    if (delta === 0) continue;
    const inAmt = blank(), outAmt = blank();
    if (delta > 0) inAmt[wallet.amtField] = delta;
    else outAmt[wallet.amtField] = -delta;
    rows.push({
      id: e.id, date: e.entry_date || '', description: e.description || '',
      category: e.category || '', entry_type: e.entry_type,
      payment_method: e.payment_method, channel_id: e.channel_id || null,
      in: inAmt, out: outAmt, raw: e,
    });
  }
  return rows;
}

/**
 * صفوف كشف قناة (متعدّد العملات). العضوية إما عبر channel_id لقناة مُدارة،
 * أو عبر اسم الفئة (category) للصفوف بلا قناة (نفس تجميع channelPnL).
 * التحويلات وأي نوع غير دخل/مصروف تُستثنى.
 */
export function channelStatementRows(entries = [], { channelId = null, categoryKey = null } = {}) {
  const rows = [];
  const cat = categoryKey != null ? String(categoryKey).trim() : null;
  for (const e of entries) {
    let belongs = false;
    if (channelId) belongs = e.channel_id === channelId;
    else if (cat) belongs = !e.channel_id && String(e.category || '').trim() === cat;
    if (!belongs) continue;
    const isIn  = e.entry_type === ENTRY_TYPE.INCOME;
    const isOut = OUT_TYPES.has(e.entry_type);
    if (!isIn && !isOut) continue;            // التحويلات الداخلية تُستثنى
    const inAmt = blank(), outAmt = blank();
    for (const c of CCY) {
      const v = Number(e[c.key]) || 0;
      if (isIn) inAmt[c.key] = v; else outAmt[c.key] = v;
    }
    rows.push({
      id: e.id, date: e.entry_date || '', description: e.description || '',
      category: e.category || '', entry_type: e.entry_type,
      payment_method: e.payment_method, channel_id: e.channel_id || null,
      in: inAmt, out: outAmt, raw: e,
    });
  }
  return rows;
}

/**
 * يبني الكشف النهائي من صفوف موحّدة:
 *   • فلترة بمدى التاريخ (from/to شاملان) وبحث نصّي في الوصف/الفئة.
 *   • ترتيب تصاعديّ بالتاريخ (الأقدم أولاً) لحساب رصيد جارٍ صحيح لكل عملة.
 *   • كل صفّ يحمل لقطة الرصيد الجاري بعده.
 * @returns {{rows, totals:{in,out,net,count}}}
 */
export function buildStatement(rows = [], { from = null, to = null, query = '' } = {}) {
  const q = (query || '').trim();
  const filtered = rows.filter(r => {
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    if (q && !`${r.description} ${r.category}`.includes(q)) return false;
    return true;
  });
  // ترتيب زمنيّ صاعد (الأقدم أولاً) — الرصيد الجاري يتراكم بهذا الترتيب.
  const sorted = [...filtered].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const running = blank();
  const totals = { in: blank(), out: blank(), net: blank(), count: 0 };
  const out = sorted.map(r => {
    for (const c of CCY) {
      running[c.key]    += (r.in[c.key] || 0) - (r.out[c.key] || 0);
      totals.in[c.key]  += r.in[c.key] || 0;
      totals.out[c.key] += r.out[c.key] || 0;
    }
    totals.count += 1;
    return { ...r, balance: { ...running } };
  });
  for (const c of CCY) totals.net[c.key] = totals.in[c.key] - totals.out[c.key];
  return { rows: out, totals };
}

/** هل للحساب أي حركة في أي عملة (لإظهار/إخفاء أعمدة فارغة). */
export function statementHasCurrency(totals, ccyKey) {
  return (totals.in[ccyKey] || 0) !== 0 || (totals.out[ccyKey] || 0) !== 0;
}
