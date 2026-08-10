// =============================================================
// entrySign — قاعدة الإشارة الوحيدة بالنظام المحاسبي.
//
// قبل هذا الملف كانت في قاعدتان متناقضتان جنب بعض على نفس الشاشة:
//   • computeOperationalBalance : راتب/سلفة = 0 (مُتجاهَلة)
//   • walletDelta               : راتب/سلفة = −1 (تنقص)
// فبطاقة «الرصيد» ما كانت تساوي مجموع بطاقات المحافظ يلي تحتها حرفياً.
//
// قرار المالك (10 آب 2026): الراتب والسلفة **ينقصان** الرصيد — إذا الكاش
// طلع من جيبة فادي، الكاش الفعلي نقص. قاعدة واحدة، بلا استثناء، لكل
// الشاشات والتقارير.
// =============================================================
import { ENTRY_TYPE, TRANSFER_IN, TRANSFER_OUT, BOOK } from '../types/accounting.types.js';

/**
 * إشارة القيد: ‎+1 داخل · ‎−1 خارج · ‎0 لا يُحتسب.
 *   income                      → +1
 *   expense · salary · advance  → −1
 *   transfer                    → +1 وارد · −1 صادر
 *   is_void                     → 0  (إدخال خاطئ مُعلَّم)
 *   transfer بتصنيف مجهول       → 0  + تُعدّ كخلل (شوف findLedgerIssues)
 */
export function entrySign(entry) {
  if (!entry || entry.is_void) return 0;
  switch (entry.entry_type) {
    case ENTRY_TYPE.INCOME:
      return 1;
    case ENTRY_TYPE.EXPENSE:
    case ENTRY_TYPE.SALARY:
    case ENTRY_TYPE.ADVANCE:
      return -1;
    case ENTRY_TYPE.TRANSFER:
      if (entry.category === TRANSFER_IN)  return 1;
      if (entry.category === TRANSFER_OUT) return -1;
      return 0; // اتجاه مجهول — لا نخمّن؛ يظهر كتنبيه بلوحة التسوية
    default:
      return 0;
  }
}

/** هل القيد تحويل باتجاه غير معروف؟ (خلل يستحق المراجعة) */
export function isUnknownTransfer(entry) {
  return entry?.entry_type === ENTRY_TYPE.TRANSFER
    && entry.category !== TRANSFER_IN
    && entry.category !== TRANSFER_OUT;
}

// ── تفكيك الرصيد: «من وين إجا الرقم» ─────────────────────────────────────────

const CCY_FIELDS = ['amount_usd', 'amount_try', 'amount_syp'];
const zero = () => ({ amount_usd: 0, amount_try: 0, amount_syp: 0 });

/**
 * تفكيك الرصيد لسطور مقروءة (استلامات/مصاريف/رواتب وسلف/تحويلات) بحيث
 * مجموع السطور = الرصيد بالضبط. هذا ما يقرأه المستخدم بدل ما يخمّن.
 * @returns {{ rows: Array<{key,label,sign,amounts,count}>, total: object }}
 */
export function explainBalance(entries = []) {
  const buckets = {
    income:    { key: 'income',    label: 'استلامات',        sign:  1, amounts: zero(), count: 0 },
    expense:   { key: 'expense',   label: 'مصاريف',          sign: -1, amounts: zero(), count: 0 },
    payroll:   { key: 'payroll',   label: 'رواتب وسلف',      sign: -1, amounts: zero(), count: 0 },
    trIn:      { key: 'trIn',      label: 'تحويلات واردة',   sign:  1, amounts: zero(), count: 0 },
    trOut:     { key: 'trOut',     label: 'تحويلات صادرة',   sign: -1, amounts: zero(), count: 0 },
  };
  const total = zero();

  for (const e of entries) {
    const sign = entrySign(e);
    if (!sign) continue;
    const b = e.entry_type === ENTRY_TYPE.INCOME ? buckets.income
            : e.entry_type === ENTRY_TYPE.EXPENSE ? buckets.expense
            : (e.entry_type === ENTRY_TYPE.SALARY || e.entry_type === ENTRY_TYPE.ADVANCE) ? buckets.payroll
            : sign > 0 ? buckets.trIn : buckets.trOut;
    b.count += 1;
    for (const f of CCY_FIELDS) {
      const v = Number(e[f]) || 0;
      if (!v) continue;
      b.amounts[f] += v;      // مخزّنة موجبة؛ الإشارة بحقل sign للعرض
      total[f] += sign * v;
    }
  }

  return { rows: Object.values(buckets).filter(b => b.count > 0), total };
}

/**
 * كشف الخلل بالدفتر — الأسباب الفعلية يلي بتخلّي الأرقام «تبيّن غلط».
 *
 * أخطرها `orphanTransfers`: التحويل بين الكتابين يُكتب بساقين (صادر + وارد)
 * بنفس `transfer_group`. حذف ساق واحدة (زر الحذف يحذف قيداً واحداً بلا وعي
 * بالمجموعة) بيخلّي مبلغاً يطلع من كتاب وما يوصل لحدا — فيختلّ مجموع الشركة
 * بصمت وما بيوقف يتراكم.
 *
 * @returns {{orphanTransfers:Array, unknownTransfers:Array, missingBook:Array, voided:Array}}
 */
export function findLedgerIssues(entries = []) {
  const groups = new Map();
  const unknownTransfers = [];
  const missingBook = [];
  const voided = [];

  for (const e of entries) {
    if (e.is_void) voided.push(e);
    if (e.book == null) missingBook.push(e);
    if (e.entry_type !== ENTRY_TYPE.TRANSFER) continue;
    if (isUnknownTransfer(e)) unknownTransfers.push(e);
    const g = e.transfer_group || `__nogroup__${e.id}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(e);
  }

  const orphanTransfers = [];
  for (const [group, legs] of groups) {
    const live = legs.filter(l => !l.is_void);
    if (live.length === 0) continue;
    const outs = live.filter(l => l.category === TRANSFER_OUT).length;
    const ins  = live.filter(l => l.category === TRANSFER_IN).length;
    // تحويل سليم = ساق صادرة واحدة + ساق واردة واحدة.
    if (outs !== 1 || ins !== 1) orphanTransfers.push({ group, legs: live });
  }

  return { orphanTransfers, unknownTransfers, missingBook, voided };
}

/** رصيد كتاب معيّن — يُستخدم لكشف الكتاب السالب (صرف بلا تمويل مقابل). */
export function bookTotals(entries = []) {
  const out = { [BOOK.OPERATIONAL]: zero(), [BOOK.CENTRAL]: zero() };
  for (const e of entries) {
    const sign = entrySign(e);
    if (!sign) continue;
    const book = e.book ?? BOOK.CENTRAL;
    const bucket = out[book] || (out[book] = zero());
    for (const f of CCY_FIELDS) bucket[f] += sign * (Number(e[f]) || 0);
  }
  return out;
}
