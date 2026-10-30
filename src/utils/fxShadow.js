// =============================================================
// fxShadow — S2 «وضع المقارنة» (Shadow Mode): يقارن تحويل المبيعات المسلَّمة بالطريقة الحالية (سعر واحد لكل العملة = سعر اليوم)
// مع الطريقة الجديدة (سعر الشهر المؤكَّد/التقريبي/المُرحَّل + حماية وحدة الليرة السورية). للقراءة فقط: لا يغيّر أي رقم معروض.
//   node test-fx-shadow.mjs
// القديم يُحسب هنا بتجميع دقيق (تقريب مرة واحدة)؛ الرقم المعروض بالشاشة (report.totals.usd) يُمرَّر كما هو للمقارنة.
// =============================================================
import { convertToUsd, monthKey } from './fxResolve.js';
import { toUsd } from './deliveryAccounting.js';

const round2 = (v) => Math.round(v * 100) / 100;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const blank = () => ({ count: 0, native: 0, oldUsd: 0, oldMissing: 0, confirmed: 0, approximate: 0, carried: 0, confirmedN: 0, approximateN: 0, carriedN: 0, missingN: 0, legacyN: 0, suspectN: 0, invalidN: 0 });

function add(g, o, oldU, c) {
  g.count += 1; g.native += num(o.amount);
  if (oldU === null) g.oldMissing += 1; else g.oldUsd += oldU;
  if (c.status === 'ok') { g.confirmed += c.usd; g.confirmedN += 1; }
  else if (c.status === 'approximate') { g.approximate += c.usd; g.approximateN += 1; }
  else if (c.status === 'carried') { g.carried += c.usd; g.carriedN += 1; }
  else if (c.status === 'missing') g.missingN += 1;
  else if (c.status === 'unit_legacy') g.legacyN += 1;
  else if (c.status === 'unit_suspect') g.suspectN += 1;
  else g.invalidN += 1;
}
const finish = (g) => {
  const notConvertedN = g.missingN + g.legacyN + g.suspectN + g.invalidN;
  const estimated = g.approximate + g.carried;
  return { ...g, native: round2(g.native), oldUsd: round2(g.oldUsd), confirmed: round2(g.confirmed), approximate: round2(g.approximate), carried: round2(g.carried), estimated: round2(estimated), newUsd: round2(g.confirmed + estimated), notConvertedN };
};

/**
 * @param delivered  صفوف المبيعات المسلَّمة بالفترة (report.delivered): amount, currency, delivery_at, order_date, market
 * @param oldRateMap خريطة الشاشة الحالية {TRY: usdPerUnit,…}
 * @param fx         {rows, units} من fxRatesService
 * @param displayedOldUsd الرقم الذي تعرضه الشاشة اليوم (للمقارنة المباشرة)
 */
export function buildFxShadow(delivered, oldRateMap, fx, displayedOldUsd = null) {
  const total = blank(); const byCur = new Map(); const byMonth = new Map(); const carriedKeys = new Map(); const approxMonths = new Set();
  for (const o of delivered || []) {
    const cur = String(o.currency || 'USD').toUpperCase();
    const at = o.delivery_at || o.order_date;
    const oldU = toUsd(o.amount, cur, oldRateMap);
    const c = convertToUsd({ amount: o.amount, currency: cur, date: at, unitDate: o.order_date || at, market: null, purpose: 'delivery_accounting' }, fx?.rows || [], fx?.units || []);
    add(total, o, oldU, c);
    if (!byCur.has(cur)) byCur.set(cur, blank()); add(byCur.get(cur), o, oldU, c);
    const mk = monthKey(at) || '—';
    if (!byMonth.has(mk)) byMonth.set(mk, blank()); add(byMonth.get(mk), o, oldU, c);
    if (c.status === 'carried') { const k = `${cur}|${mk}|${c.periodMonth}`; carriedKeys.set(k, (carriedKeys.get(k) || 0) + 1); }
    if (c.status === 'approximate') approxMonths.add(`${cur}|${mk}`);
  }
  const t = finish(total);
  return {
    total: t,
    displayedOldUsd: displayedOldUsd == null ? null : round2(num(displayedOldUsd)),
    diff: round2(t.newUsd - t.oldUsd),
    byCurrency: [...byCur].map(([cur, g]) => ({ cur, ...finish(g) })).sort((a, b) => b.native - a.native),
    byMonth: [...byMonth].map(([month, g]) => ({ month, ...finish(g) })).sort((a, b) => (a.month < b.month ? -1 : 1)),
    carried: [...carriedKeys].map(([k, n]) => { const [currency, month, from] = k.split('|'); return { currency, month, carriedFrom: from, orders: n }; }),
    approximate: [...approxMonths].map((k) => { const [currency, month] = k.split('|'); return { currency, month }; }).sort((a, b) => (a.month + a.currency < b.month + b.currency ? -1 : 1)),
    // نهائي = لا تقدير ولا غير محوَّل (يصلح للإغلاق المالي)
    final: t.estimated === 0 && t.notConvertedN === 0 && t.carriedN === 0 && t.approximateN === 0,
    fxLoaded: !!(fx && Array.isArray(fx.rows) && fx.rows.length),
  };
}
