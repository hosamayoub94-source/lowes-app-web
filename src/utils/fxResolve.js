// =============================================================
// fxResolve — تحويل المبالغ للدولار بأسعار شهرية مؤكَّدة (D1–D4 من مشروع توحيد الصرف). دوال نقية بلا واجهة، مُختبَرة:
//   node test-fx-resolve.mjs
//
// القواعد:
//  - السعر معرَّف بـ (الغرض، العملة، [السوق]، الشهر). لا أي سعر افتراضي مخفي بالكود: لا سعر = «غير محوَّل».
//  - يُستعمل صف `confirmed` فقط. شهر بلا سعر يأخذ آخر شهر سابق مؤكَّد ويُوسَم «تقديري/مُرحَّل» (exact=false)، ولا يُرحَّل تقدير من تقدير.
//  - وحدة العملة: مبلغ مسجَّل بوحدة قديمة (legacy) لا يُحوَّل بسعر الوحدة الحالية — يُعلَن «unit_legacy» ولا يدخل أي مجموع.
//  - المؤكَّد والتقديري مجموعان منفصلان، والتقريب مرة واحدة بنهاية التجميع (لا تقريب لكل طلب).
// نفس منطق دالتي القاعدة fx_rate_for / fx_unit_for (supabase/migrations/20261031000000_fx_s1a_monthly_rate_model.sql).
// =============================================================

const ISTANBUL_MS = 3 * 3600 * 1000;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (v) => Math.round(v * 100) / 100;

/** 'YYYY-MM-01' لشهر تاريخ بتوقيت إسطنبول (يقبل Date أو نصاً ISO). null إن لم يُفهم التاريخ. */
export function monthKey(d) {
  if (d == null || d === '') return null;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d.slice(0, 7)}-01`; // تاريخ بلا وقت: كما هو
  const t = d instanceof Date ? d.getTime() : Date.parse(d);
  if (!Number.isFinite(t)) return null;
  return `${new Date(t + ISTANBUL_MS).toISOString().slice(0, 7)}-01`;
}
const dayKey = (d) => {
  if (d == null || d === '') return null;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const t = d instanceof Date ? d.getTime() : Date.parse(d);
  return Number.isFinite(t) ? new Date(t + ISTANBUL_MS).toISOString().slice(0, 10) : null;
};

/** وحدة العملة بتاريخ ما ('current' | 'legacy'). بلا صف مطابق = 'current'. units = صفوف fx_currency_units. */
export function unitFor(currency, onDate, units) {
  const cur = String(currency || '').toUpperCase();
  const day = dayKey(onDate);
  if (!day) return 'current';
  const hit = (units || [])
    .filter((u) => String(u.currency).toUpperCase() === cur && String(u.valid_from).slice(0, 10) <= day && (!u.valid_to || day <= String(u.valid_to).slice(0, 10)))
    .sort((a, b) => (String(a.valid_from) < String(b.valid_from) ? 1 : -1))[0];
  return hit ? hit.unit : 'current';
}

/**
 * أفضل سعر مؤكَّد لشهر: الشهر نفسه (exact=true) أو آخر شهر سابق مؤكَّد (exact=false). null = لا سعر.
 * rows = صفوف fx_monthly_rates؛ تُهمَل غير المؤكَّدة/المستبدَلة/ذات الوحدة القديمة/بلا period_month (نسخ S0 التاريخية).
 */
export function resolveRate(rows, { purpose, currency, month, market = null }) {
  const cur = String(currency || '').toUpperCase();
  const mk = monthKey(month);
  if (!mk || !cur) return null;
  const cands = (rows || []).filter((r) =>
    r.purpose === purpose && String(r.currency).toUpperCase() === cur && r.status === 'confirmed' && (r.currency_unit || 'current') === 'current'
    && r.period_month && String(r.period_month).slice(0, 10) <= mk && (r.market == null || r.market === market) && num(r.units_per_usd) > 0);
  if (!cands.length) return null;
  cands.sort((a, b) => {
    const pa = String(a.period_month).slice(0, 10), pb = String(b.period_month).slice(0, 10);
    if (pa !== pb) return pa < pb ? 1 : -1;
    if ((a.market != null) !== (b.market != null)) return a.market != null ? -1 : 1;
    return String(a.created_at || '') < String(b.created_at || '') ? 1 : -1;
  });
  const r = cands[0];
  const pm = String(r.period_month).slice(0, 10);
  return { unitsPerUsd: num(r.units_per_usd), periodMonth: pm, exact: pm === mk, market: r.market ?? null, source: r.source ?? null };
}

/**
 * يحوّل مبلغاً. status: ok (سعر الشهر مؤكَّد) | carried (مُرحَّل، تقديري) | missing (لا سعر) | unit_legacy (وحدة قديمة) | invalid (مبلغ غير رقمي).
 * date = تاريخ الاعتماد المالي (التسليم)؛ unitDate = تاريخ تسجيل الطلب (وحدة المبلغ تتبع وقت تسجيله، لا وقت تسليمه).
 */
export function convertToUsd({ amount, currency, date, unitDate = null, market = null, purpose }, rows, units) {
  const cur = String(currency || 'USD').toUpperCase();
  const a = Number(amount);
  if (amount == null || amount === '' || !Number.isFinite(a)) return { usd: null, status: 'invalid' };
  if (cur === 'USD') return { usd: a, status: 'ok', rate: 1, periodMonth: null, source: 'USD' };
  if (unitFor(cur, unitDate ?? date, units) === 'legacy') return { usd: null, status: 'unit_legacy' };
  const r = resolveRate(rows, { purpose, currency: cur, month: date, market });
  if (!r) return { usd: null, status: 'missing' };
  return { usd: a / r.unitsPerUsd, status: r.exact ? 'ok' : 'carried', rate: r.unitsPerUsd, periodMonth: r.periodMonth, source: r.source, market: r.market };
}

/**
 * مجاميع لقائمة طلبات: المؤكَّد والتقديري منفصلان، وغير المحوَّل (سعر ناقص / وحدة قديمة) يُعَدّ ولا يدخل أي مجموع.
 * order = {amount, currency, date, unitDate?, market?}. التقريب مرة واحدة هنا.
 */
export function summarizeConversion(orders, rows, units, { purpose }) {
  let confirmed = 0, estimated = 0;
  const out = { count: 0, confirmedCount: 0, estimatedCount: 0, missingCount: 0, legacyCount: 0, invalidCount: 0, carried: new Map(), missingCurrencies: new Set() };
  for (const o of orders || []) {
    out.count += 1;
    const c = convertToUsd({ ...o, purpose }, rows, units);
    if (c.status === 'ok') { confirmed += c.usd; out.confirmedCount += 1; }
    else if (c.status === 'carried') {
      estimated += c.usd; out.estimatedCount += 1;
      const k = `${String(o.currency).toUpperCase()}|${monthKey(o.date)}|${c.periodMonth}`;
      out.carried.set(k, (out.carried.get(k) || 0) + 1);
    }
    else if (c.status === 'missing') { out.missingCount += 1; out.missingCurrencies.add(String(o.currency).toUpperCase()); }
    else if (c.status === 'unit_legacy') out.legacyCount += 1;
    else out.invalidCount += 1;
  }
  return {
    ...out,
    confirmedUsd: round2(confirmed), estimatedUsd: round2(estimated), totalUsd: round2(confirmed + estimated),
    carried: [...out.carried].map(([k, n]) => { const [currency, month, from] = k.split('|'); return { currency, month, carriedFrom: from, orders: n }; }),
    missingCurrencies: [...out.missingCurrencies],
    final: out.estimatedCount === 0 && out.missingCount === 0 && out.legacyCount === 0 && out.invalidCount === 0,
  };
}
