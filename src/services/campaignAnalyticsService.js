// =============================================================
// campaignAnalyticsService — منظومة التقارير اليومية للحملات.
// مصدر الحقيقة: daily_reports (رأس/موظف/يوم) + report_ad_results (سطر/إعلان).
// يخدم: شاشة الإدخال (DailyReportScreen) + لوحة الميديا باير (MediaBuyerBoardScreen).
// نمط managerBoardService: تواريخ محلية + Promise.all + تجميع بالذاكرة.
// أسماء الموظفين نصّية (لا FK). RLS مفتوح + PIN-auth.
// =============================================================
import { supabase } from './supabase';

// ── تواريخ محلية (لا انزياح UTC) ──────────────────────────────
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
export function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const zeroCur = () => ({ try: 0, syp: 0, usd: 0 });
const addCur  = (a, b) => { a.try += Number(b.try || 0); a.syp += Number(b.syp || 0); a.usd += Number(b.usd || 0); return a; };
const rowCur  = (r) => ({ try: Number(r.amount_try || 0), syp: Number(r.amount_syp || 0), usd: Number(r.amount_usd || 0) });

// =============================================================
// شاشة الإدخال
// =============================================================

// حملات الموظف المُسنَد إليها (members يحوي اسمه، نشطة) + إعلاناتها.
export async function getMyCampaignsAndAds(userName) {
  const { data: camps } = await supabase
    .from('campaigns')
    .select('id, name, members, is_active, channel_name_custom')
    .or('is_active.is.null,is_active.eq.true');
  const mine = (camps ?? []).filter(c => Array.isArray(c.members) && c.members.includes(userName));
  const ids = mine.map(c => c.id);
  let ads = [];
  if (ids.length) {
    const { data } = await supabase
      .from('campaign_ads')
      .select('id, campaign_id, ad_name, ad_image_url, status, sort_order')
      .in('campaign_id', ids)
      .order('sort_order', { ascending: true });
    ads = (data ?? []).filter(a => a.status !== 'inactive');
  }
  return { campaigns: mine, ads };
}

// تقرير يوم معيّن لموظف + سطوره (لوضع التعديل).
export async function getDayReport(userName, date) {
  const { data: reps } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('employee_name', userName)
    .eq('report_date', date)
    .order('created_at', { ascending: false });
  const report = (reps ?? [])[0] || null;
  let results = [];
  if (report) {
    const { data } = await supabase.from('report_ad_results').select('*').eq('report_id', report.id);
    results = data ?? [];
  }
  return { report, results };
}

// upsert يدوي حسب (employee_name, report_date) — مقاوم لغياب UNIQUE وللتكرار
// التاريخي. يُرجع id الرأس.
export async function upsertDailyReport(payload) {
  const { data: existing } = await supabase
    .from('daily_reports')
    .select('id')
    .eq('employee_name', payload.employee_name)
    .eq('report_date', payload.report_date)
    .order('created_at', { ascending: false })
    .limit(1);
  const cur = (existing ?? [])[0];
  if (cur?.id) {
    const { error } = await supabase
      .from('daily_reports')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', cur.id);
    if (error) throw error;
    return cur.id;
  }
  const { data, error } = await supabase.from('daily_reports').insert(payload).select('id').single();
  if (error) throw error;
  return data.id;
}

// استبدال سطور الإعلانات لتقرير: حذف الكل ثم إدراج غير الصفرية فقط.
// (FK RESTRICT على campaign_id يمنع حذف الحملة فقط، لا الحذف بـreport_id.)
export async function replaceAdResults(reportId, rows) {
  await supabase.from('report_ad_results').delete().eq('report_id', reportId);
  const clean = (rows ?? [])
    .filter(r => Number(r.messages) > 0 || Number(r.confirmations) > 0
              || Number(r.amount_try) > 0 || Number(r.amount_syp) > 0 || Number(r.amount_usd) > 0)
    .map(r => ({
      report_id:     reportId,
      campaign_id:   r.campaign_id,
      ad_id:         r.ad_id,
      messages:      Number(r.messages) || 0,
      confirmations: Number(r.confirmations) || 0,
      amount_try:    Number(r.amount_try) || 0,
      amount_syp:    Number(r.amount_syp) || 0,
      amount_usd:    Number(r.amount_usd) || 0,
      currency:      r.currency || 'TRY',
      star_rating:   r.star_rating || null,
      notes:         r.notes || null,
    }));
  if (clean.length) {
    const { error } = await supabase.from('report_ad_results').insert(clean);
    if (error) throw error;
  }
  return clean.length;
}

// =============================================================
// لوحة الميديا باير — التحليلات
// =============================================================
export async function loadCampaignAnalytics({ from, to, team = null, campaignId = null } = {}) {
  const fromD = from || monthStartISO();
  const toD   = to   || todayISO();
  const today = todayISO();

  // 1) رؤوس التقارير ضمن المدى (+ الفريق)
  let repQ = supabase
    .from('daily_reports')
    .select('id, employee_name, team, report_date, total_messages, total_confirmations, total_sales_try, total_sales_syp, total_sales_usd, old_customer_count, old_customer_amount_try, old_customer_amount_syp, old_customer_amount_usd, other_source_count, other_source_amount_try, other_source_amount_syp, other_source_amount_usd')
    .gte('report_date', fromD).lte('report_date', toD);
  if (team) repQ = repQ.eq('team', team);

  const [repRes, campRes, adRes, profRes] = await Promise.all([
    repQ,
    supabase.from('campaigns').select('id, name, team, is_active, members, manager_name, budget_usd, spend, spend_currency'),
    supabase.from('campaign_ads').select('id, campaign_id, ad_name, ad_image_url'),
    supabase.from('profiles').select('employee_name, team, role_type, is_active').eq('is_active', true),
  ]);

  const reports  = repRes.data ?? [];
  const campaigns = campRes.data ?? [];
  const ads       = adRes.data ?? [];
  const profiles  = profRes.data ?? [];

  const reportById  = Object.fromEntries(reports.map(r => [r.id, r]));
  const campById    = Object.fromEntries(campaigns.map(c => [c.id, c]));
  const adById      = Object.fromEntries(ads.map(a => [a.id, a]));
  const reportIds   = reports.map(r => r.id);

  // 2) سطور نتائج الإعلانات لهذه التقارير
  let results = [];
  if (reportIds.length) {
    // دفعات (تفادي حد طول الفلتر) — العدد صغير لكن آمن
    const chunks = [];
    for (let i = 0; i < reportIds.length; i += 200) chunks.push(reportIds.slice(i, i + 200));
    const parts = await Promise.all(chunks.map(ch =>
      supabase.from('report_ad_results')
        .select('report_id, campaign_id, ad_id, messages, confirmations, amount_try, amount_syp, amount_usd, currency, star_rating')
        .in('report_id', ch)));
    results = parts.flatMap(p => p.data ?? []);
  }
  if (campaignId) results = results.filter(r => r.campaign_id === campaignId);

  // ── إنفاق ميتا (اختياري — الجدول قد لا يكون موجوداً/معبّأً بعد) ──
  let metaRows = [];
  try {
    let mq = supabase.from('meta_ad_insights')
      .select('campaign_id, spend, reach, impressions, results, currency')
      .gte('date', fromD).lte('date', toD);
    if (campaignId) mq = mq.eq('campaign_id', campaignId);
    const { data, error } = await mq;
    if (!error) metaRows = data ?? [];
  } catch { metaRows = []; }
  const metaByCampaign = {};
  let metaSpend = 0, metaReach = 0, metaImpr = 0, metaResults = 0, metaCur = null;
  for (const m of metaRows) {
    metaSpend += Number(m.spend || 0); metaReach += Number(m.reach || 0);
    metaImpr += Number(m.impressions || 0); metaResults += Number(m.results || 0);
    if (!metaCur && m.currency) metaCur = m.currency;
    if (m.campaign_id) {
      const x = (metaByCampaign[m.campaign_id] ??= { spend: 0, reach: 0, impressions: 0, results: 0 });
      x.spend += Number(m.spend || 0); x.reach += Number(m.reach || 0);
      x.impressions += Number(m.impressions || 0); x.results += Number(m.results || 0);
    }
  }
  const curKey = (metaCur || '').toLowerCase(); // 'try'|'usd'|'syp'

  // إنفاق موحّد لكل حملة: ميتا إن وُجد، وإلا الإنفاق اليدوي (campaigns.spend بعملته).
  const campSpend = {};
  const spendByCur = { try: 0, syp: 0, usd: 0 };
  let anySpend = false;
  for (const c of campaigns) {
    const metaSp = metaByCampaign[c.id]?.spend || 0;
    if (metaSp > 0) {
      const cur = curKey || null;
      campSpend[c.id] = { spend: metaSp, cur };
      if (cur) spendByCur[cur] += metaSp;
      anySpend = true;
    } else {
      const s = Number(c.spend || 0);
      const cur = (c.spend_currency || 'TRY').toLowerCase();
      campSpend[c.id] = { spend: s, cur };
      if (s > 0) { spendByCur[cur] = (spendByCur[cur] || 0) + s; anySpend = true; }
    }
  }

  // ── مجاميع مصادر البيع (تُشتق منها الإجماليات وتقسيم المصدر) ──
  // ملاحظة: رؤوس daily_reports التاريخية تحوي total_messages فقط؛ التأكيدات
  // والقيمة الحقيقية في report_ad_results + أعمدة المصادر — فنشتق منها لتطابق.
  const adSales    = results.reduce((a, r) => addCur(a, rowCur(r)), zeroCur());
  const adCount    = results.reduce((n, r) => n + Number(r.confirmations || 0), 0);
  const oldCount   = reports.reduce((n, r) => n + Number(r.old_customer_count || 0), 0);
  const oldSales   = reports.reduce((a, r) => addCur(a, { try: r.old_customer_amount_try, syp: r.old_customer_amount_syp, usd: r.old_customer_amount_usd }), zeroCur());
  const otherCount = reports.reduce((n, r) => n + Number(r.other_source_count || 0), 0);
  const otherSales = reports.reduce((a, r) => addCur(a, { try: r.other_source_amount_try, syp: r.other_source_amount_syp, usd: r.other_source_amount_usd }), zeroCur());

  // ── المجاميع العامة ──
  const totals = {
    messages:      reports.reduce((n, r) => n + Number(r.total_messages || 0), 0),
    confirmations: adCount + oldCount + otherCount,
    sales:         addCur(addCur(addCur(zeroCur(), adSales), oldSales), otherSales),
    reportsCount:  reports.length,
  };
  totals.convRate = totals.messages > 0 ? Math.round((totals.confirmations / totals.messages) * 100) : 0;

  // ── لكل حملة ──
  const cAgg = {};
  const cSellers = {};
  const cStars = {};
  for (const r of results) {
    const c = (cAgg[r.campaign_id] ??= { id: r.campaign_id, messages: 0, confirmations: 0, sales: zeroCur() });
    c.messages += Number(r.messages || 0);
    c.confirmations += Number(r.confirmations || 0);
    addCur(c.sales, rowCur(r));
    const emp = reportById[r.report_id]?.employee_name;
    if (emp) (cSellers[r.campaign_id] ??= new Set()).add(emp);
    if (r.star_rating) (cStars[r.campaign_id] ??= []).push(Number(r.star_rating));
  }
  const adsByCamp = {};
  for (const a of ads) (adsByCamp[a.campaign_id] ??= []).push(a);
  const perCampaign = Object.values(cAgg).map(c => ({
    ...c,
    name:        campById[c.id]?.name || '—',
    team:        campById[c.id]?.team || '',
    manager:     campById[c.id]?.manager_name || null,
    convRate:    c.messages > 0 ? Math.round((c.confirmations / c.messages) * 100) : 0,
    avgStar:     cStars[c.id]?.length ? +(cStars[c.id].reduce((a, b) => a + b, 0) / cStars[c.id].length).toFixed(1) : null,
    adsCount:    (adsByCamp[c.id] || []).length,
    sellersCount: cSellers[c.id]?.size || 0,
    spend:       campSpend[c.id]?.spend || 0,
    spendCur:    campSpend[c.id]?.cur || null,
    reach:       metaByCampaign[c.id]?.reach || 0,
    roas:        (campSpend[c.id]?.spend > 0 && campSpend[c.id]?.cur) ? +(((c.sales[campSpend[c.id].cur] || 0) / campSpend[c.id].spend)).toFixed(2) : null,
  })).sort((a, b) => b.sales.usd + b.sales.try + b.sales.syp - (a.sales.usd + a.sales.try + a.sales.syp));

  // ── لكل إعلان ──
  const aAgg = {};
  const aStars = {};
  for (const r of results) {
    if (!r.ad_id) continue;
    const a = (aAgg[r.ad_id] ??= { id: r.ad_id, messages: 0, confirmations: 0, sales: zeroCur() });
    a.messages += Number(r.messages || 0);
    a.confirmations += Number(r.confirmations || 0);
    addCur(a.sales, rowCur(r));
    if (r.star_rating) (aStars[r.ad_id] ??= []).push(Number(r.star_rating));
  }
  const perAd = Object.values(aAgg).map(a => ({
    ...a,
    ad_name:      adById[a.id]?.ad_name || '—',
    image:        adById[a.id]?.ad_image_url || null,
    campaign_name: campById[adById[a.id]?.campaign_id]?.name || '—',
    convRate:     a.messages > 0 ? Math.round((a.confirmations / a.messages) * 100) : 0,
    avgStar:      aStars[a.id]?.length ? +(aStars[a.id].reduce((x, y) => x + y, 0) / aStars[a.id].length).toFixed(1) : null,
  })).sort((a, b) => b.confirmations - a.confirmations);

  // ── لكل موظف ──
  const eAgg = {};
  for (const r of reports) {
    const e = (eAgg[r.employee_name] ??= { name: r.employee_name, team: r.team, messages: 0, confirmations: 0, sales: zeroCur(), days: new Set(), reportedToday: false, byCampaign: {} });
    e.messages += Number(r.total_messages || 0);
    e.confirmations += Number(r.total_confirmations || 0);
    addCur(e.sales, { try: r.total_sales_try, syp: r.total_sales_syp, usd: r.total_sales_usd });
    e.days.add(r.report_date);
    if (r.report_date === today) e.reportedToday = true;
  }
  for (const r of results) {
    const emp = reportById[r.report_id]?.employee_name;
    if (!emp || !eAgg[emp]) continue;
    const bc = (eAgg[emp].byCampaign[r.campaign_id] ??= { name: campById[r.campaign_id]?.name || '—', sales: zeroCur(), confirmations: 0 });
    addCur(bc.sales, rowCur(r));
    bc.confirmations += Number(r.confirmations || 0);
  }
  const perEmployee = Object.values(eAgg).map(e => ({
    ...e,
    days: e.days.size,
    byCampaign: Object.values(e.byCampaign),
  })).sort((a, b) => (b.sales.usd + b.sales.try + b.sales.syp) - (a.sales.usd + a.sales.try + a.sales.syp));

  // ── تقسيم مصدر البيع (إعلان / عميل سابق / مصدر آخر) — عدد + قيمة ──
  const sourceSplit = {
    ad:    { label: 'إعلان',      count: adCount,    sales: adSales },
    old:   { label: 'عميل سابق',  count: oldCount,   sales: oldSales },
    other: { label: 'مصدر آخر',   count: otherCount, sales: otherSales },
  };

  // ── الاتجاه اليومي ── (الرسائل من الرؤوس، التأكيدات من النتائج حسب تاريخ التقرير)
  const trendMap = {};
  for (const r of reports) {
    (trendMap[r.report_date] ??= { date: r.report_date, messages: 0, confirmations: 0 }).messages += Number(r.total_messages || 0);
  }
  for (const res of results) {
    const d = reportById[res.report_id]?.report_date;
    if (!d) continue;
    (trendMap[d] ??= { date: d, messages: 0, confirmations: 0 }).confirmations += Number(res.confirmations || 0);
  }
  const dailyTrend = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

  // ── الالتزام: المتوقّع = أعضاء الحملات النشطة (موظفون نشطون) ──
  const activeNames = new Set(profiles.map(p => p.employee_name));
  const expected = new Set();
  for (const c of campaigns) {
    if (c.is_active === false) continue;
    for (const m of (Array.isArray(c.members) ? c.members : [])) if (activeNames.has(m)) expected.add(m);
  }
  const reportedToday = new Set(reports.filter(r => r.report_date === today).map(r => r.employee_name));
  const compliance = {
    expected:      [...expected],
    reportedToday: [...reportedToday],
    missingToday:  [...expected].filter(n => !reportedToday.has(n)),
  };

  // ── ملخّص ميتا (إنفاق + ROAS) ──
  const meta = {
    spend: metaSpend, reach: metaReach, impressions: metaImpr, results: metaResults,
    currency: metaCur,
    roas: (metaSpend > 0 && curKey) ? +((totals.sales[curKey] || 0) / metaSpend).toFixed(2) : null,
    costPerResult: metaResults > 0 ? +(metaSpend / metaResults).toFixed(2) : null,
    hasData: metaRows.length > 0,
  };

  // ملخّص الإنفاق الموحّد (ميتا أو يدوي) + ROAS لكل عملة
  const roasByCur = {};
  for (const cur of ['try', 'syp', 'usd']) if (spendByCur[cur] > 0) roasByCur[cur] = +(((totals.sales[cur] || 0) / spendByCur[cur])).toFixed(2);
  const spendSummary = { byCur: spendByCur, any: anySpend, roasByCur, source: meta.hasData ? 'meta' : (anySpend ? 'manual' : 'none') };

  return {
    range: { from: fromD, to: toD },
    totals, perCampaign, perAd, perEmployee, sourceSplit, dailyTrend, compliance, meta, spendSummary,
    filters: {
      campaigns: campaigns.filter(c => c.is_active !== false).map(c => ({ id: c.id, name: c.name })),
      teams: [...new Set(campaigns.map(c => c.team).filter(Boolean))],
    },
    loadedAt: new Date().toISOString(),
  };
}
