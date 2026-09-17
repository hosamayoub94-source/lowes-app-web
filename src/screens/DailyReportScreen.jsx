// =============================================================
// DailyReportScreen — تقرير الموظف اليومي (رسائل + مبيعات لكل إعلان + مصدر).
// يكتب daily_reports (رأس) + report_ad_results (سطر/إعلان) عبر
// campaignAnalyticsService (upsert يدوي حسب employee_name+report_date).
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@hooks/useAuth';
import { Hero, Card, CardTitle, Button, EmptyState, StatCard } from '@components/ui';
import {
  getMyCampaignsAndAds, getDayReport, upsertDailyReport, replaceAdResults, todayISO,
  getMyOrdersDaySummary, uploadReportAdImage,
  getInactiveCampaignsAndAds, getSourcePlatforms, replaceSourceResults, SOURCE_KINDS,
} from '@services/campaignAnalyticsService';
// التاريخ الافتراضي = يوم الوردية لا اليوم التقويمي: موظف وردية 18:00→01:00
// يسجّل تقريره 00:40 كان يُحفظ على تاريخ اليوم الجديد فيظهر «لم يسجّل».
import { shiftDateISO } from '@utils/date';

const MAX_AD_IMAGES = 4;

const CURS = ['TRY', 'SYP', 'USD'];
const CUR_SYM = { TRY: '₺', SYP: 'ل.س', USD: '$' };
const inputCls = 'w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30';
const numCls = inputCls + ' tabular-nums';
const numStyle = { direction: 'ltr', textAlign: 'right' };
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

const pickAmount = (try_, syp, usd) => Number(try_) || Number(syp) || Number(usd) || '';
const pickCur = (try_, syp, usd, def) => (Number(try_) ? 'TRY' : Number(syp) ? 'SYP' : Number(usd) ? 'USD' : def);

// نجوم تقييم 1-5 (0 = بدون)
function Stars({ value, onChange }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange(value === n ? 0 : n)}
          className={'text-lg leading-none transition ' + (n <= value ? 'text-amber-fg' : 'text-muted/40 hover:text-muted')}>★</button>
      ))}
    </div>
  );
}

export default function DailyReportScreen() {
  const { name: userName, team } = useAuth();
  const defCur = team && /سوريا|syria/i.test(team) ? 'SYP' : 'TRY';

  const [date, setDate]       = useState(shiftDateISO());
  const [campaigns, setCampaigns] = useState([]);
  const [ads, setAds]         = useState([]);
  const [rows, setRows]       = useState({});   // ad_id → { messages, confirmations, amount, currency, star_rating, notes }
  // مصادر التثبيت من خارج الإعلانات النشطة (D-085): سطر لكل مصدر —
  // { kind, campaign_id, ad_id, platform_key, label, count, amount, currency, notes }
  const [srcRows, setSrcRows] = useState([]);
  const [oldCamps, setOldCamps] = useState({ campaigns: [], ads: [] }); // الحملات المتوقفة وإعلاناتها
  const [platforms, setPlatforms] = useState([]);
  useEffect(() => {
    let alive = true;
    getInactiveCampaignsAndAds().then(d => { if (alive) setOldCamps(d); }).catch(() => {});
    getSourcePlatforms().then(d => { if (alive) setPlatforms(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState(null);
  const [uploadingAd, setUploadingAd] = useState(null); // ad_id قيد رفع صورة

  // صور الإعلان ضمن التقرير — مسموحة فقط لإعلان وصلت منه رسائل (messages > 0)
  // ومن حملة مسنَدة للموظف (قائمة ads أصلاً محصورة بحملاته).
  const addAdImage = async (adId, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMsg({ type: 'err', text: 'الملف يجب أن يكون صورة' }); return; }
    if (!ads.some(a => a.id === adId)) return;
    const cur = rows[adId]?.image_urls || [];
    if (cur.length >= MAX_AD_IMAGES) { setMsg({ type: 'err', text: `الحد الأقصى ${MAX_AD_IMAGES} صور لكل إعلان` }); return; }
    setUploadingAd(adId); setMsg(null);
    try {
      const url = await uploadReportAdImage(file, userName, date, adId);
      setRows(p => ({ ...p, [adId]: { ...(p[adId] || {}), image_urls: [...(p[adId]?.image_urls || []), url] } }));
    } catch (e) { setMsg({ type: 'err', text: 'تعذّر رفع الصورة: ' + (e.message || e) }); }
    finally { setUploadingAd(null); }
  };
  const removeAdImage = (adId, url) =>
    setRows(p => ({ ...p, [adId]: { ...(p[adId] || {}), image_urls: (p[adId]?.image_urls || []).filter(u => u !== url) } }));

  // ملخّص طلبات اليوم الفعلية (تلقائي من جدول orders) — قراءة فقط، للمقارنة.
  const [ordSum, setOrdSum]   = useState({ count: 0, sales: { TRY: 0, SYP: 0, USD: 0 }, items: [], delivered: 0 });
  const [ordLoading, setOrdLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setOrdLoading(true);
    getMyOrdersDaySummary(userName, date)
      .then(s => { if (alive) setOrdSum(s); })
      .catch(() => { /* */ })
      .finally(() => { if (alive) setOrdLoading(false); });
    return () => { alive = false; };
  }, [userName, date]);

  // حملات الموظف وإعلاناتها (مرّة)
  useEffect(() => {
    let alive = true;
    (async () => {
      try { const { campaigns, ads } = await getMyCampaignsAndAds(userName); if (alive) { setCampaigns(campaigns); setAds(ads); } }
      catch { /* */ }
    })();
    return () => { alive = false; };
  }, [userName]);

  // تقرير اليوم المحدّد (تعبئة/تعديل)
  const loadDay = useCallback(async () => {
    setLoading(true); setMsg(null);
    try {
      const { report, results, sources } = await getDayReport(userName, date);
      const r = {};
      for (const res of results) {
        r[res.ad_id] = {
          messages: res.messages || '', confirmations: res.confirmations || '',
          amount: pickAmount(res.amount_try, res.amount_syp, res.amount_usd),
          currency: res.currency || defCur, star_rating: res.star_rating || 0, notes: res.notes || '',
          image_urls: Array.isArray(res.image_urls) ? res.image_urls : [],
        };
      }
      setRows(r);
      if (sources && sources.length) {
        setSrcRows(sources.map(sr => ({
          kind: sr.kind, campaign_id: sr.campaign_id || null, ad_id: sr.ad_id || null, platform_key: sr.platform_key || null,
          label: sr.label || '', count: sr.count || '', amount: pickAmount(sr.amount_try, sr.amount_syp, sr.amount_usd),
          currency: pickCur(sr.amount_try, sr.amount_syp, sr.amount_usd, sr.currency || defCur), notes: sr.notes || '',
        })));
      } else if (report) {
        // تقرير قديم (قبل D-085): نُظهر خانتي الرأس كسطرين قابلين للتعديل
        const legacy = [];
        const oldAmt = pickAmount(report.old_customer_amount_try, report.old_customer_amount_syp, report.old_customer_amount_usd);
        const othAmt = pickAmount(report.other_source_amount_try, report.other_source_amount_syp, report.other_source_amount_usd);
        if (Number(report.old_customer_count) || oldAmt)
          legacy.push({ kind: 'old_customer', campaign_id: null, ad_id: null, platform_key: null, label: '', count: report.old_customer_count || '',
            amount: oldAmt, currency: pickCur(report.old_customer_amount_try, report.old_customer_amount_syp, report.old_customer_amount_usd, defCur), notes: '' });
        if (Number(report.other_source_count) || othAmt)
          legacy.push({ kind: 'other', campaign_id: null, ad_id: null, platform_key: null, label: '', count: report.other_source_count || '',
            amount: othAmt, currency: pickCur(report.other_source_amount_try, report.other_source_amount_syp, report.other_source_amount_usd, defCur), notes: '' });
        setSrcRows(legacy);
      } else setSrcRows([]);
    } catch { /* */ }
    finally { setLoading(false); }
  }, [userName, date, defCur]);
  useEffect(() => { loadDay(); }, [loadDay]);

  const setRow  = (adId, patch) => setRows(p => ({ ...p, [adId]: { ...(p[adId] || { messages: '', confirmations: '', amount: '', currency: defCur, star_rating: 0, notes: '' }), ...patch } }));
  const newSrcRow = (kind = 'old_ad') => ({ kind, campaign_id: null, ad_id: null, platform_key: null, label: '', count: '', amount: '', currency: defCur, notes: '' });
  const setSrc    = (i, patch) => setSrcRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));
  const delSrc    = (i) => setSrcRows(rs => rs.filter((_, j) => j !== i));
  const oldAdsByCampaign = useMemo(() => { const m = {}; for (const a of oldCamps.ads) (m[a.campaign_id] ??= []).push(a); return m; }, [oldCamps]);
  // لقطة نصية للعرض بلوحة الميديا باير — تبقى حتى لو زال الربط
  const srcLabel = (r) => {
    if (r.kind === 'old_ad') { const c = oldCamps.campaigns.find(x => x.id === r.campaign_id); const a = oldCamps.ads.find(x => x.id === r.ad_id); return [c?.name, a?.ad_name].filter(Boolean).join(' · '); }
    if (r.kind === 'page')   { const pf = platforms.find(x => x.key === r.platform_key); return pf?.label || ''; }
    if (r.kind === 'other')  return (r.label || '').trim();
    return SOURCE_KINDS.find(k => k.key === r.kind)?.label || r.kind;
  };
  const adsByCampaign = useMemo(() => { const m = {}; for (const a of ads) (m[a.campaign_id] ??= []).push(a); return m; }, [ads]);

  // ملخّص حيّ
  const totals = useMemo(() => {
    const sales = { TRY: 0, SYP: 0, USD: 0 };
    let messages = 0, confirmations = 0;
    for (const a of ads) {
      const r = rows[a.id]; if (!r) continue;
      messages += Number(r.messages) || 0;
      confirmations += Number(r.confirmations) || 0;
      sales[r.currency] = (sales[r.currency] || 0) + (Number(r.amount) || 0);
    }
    for (const r of srcRows) sales[r.currency] = (sales[r.currency] || 0) + (Number(r.amount) || 0);
    return { messages, confirmations, sales };
  }, [ads, rows, srcRows]);
  const srcHeader = useMemo(() => {
    const agg = (pred) => { const o = { count: 0, TRY: 0, SYP: 0, USD: 0 }; for (const r of srcRows) if (pred(r)) { o.count += Number(r.count) || 0; o[r.currency] = (o[r.currency] || 0) + (Number(r.amount) || 0); } return o; };
    const old = agg(r => r.kind === 'old_customer'), oth = agg(r => r.kind !== 'old_customer');
    return {
      old_customer_count: old.count, old_customer_amount_try: old.TRY, old_customer_amount_syp: old.SYP, old_customer_amount_usd: old.USD,
      other_source_count: oth.count, other_source_amount_try: oth.TRY, other_source_amount_syp: oth.SYP, other_source_amount_usd: oth.USD,
    };
  }, [srcRows]);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const header = {
        // daily_reports.team عمود NOT NULL بقاعدة البيانات — أي مستخدم بلا
        // team بملفه (مثلاً أدمن) كان يُسقِط الحفظ بالكامل بخطأ صامت الظاهر.
        employee_name: userName, team: team || 'عام', report_date: date,
        total_messages: totals.messages, total_confirmations: totals.confirmations,
        total_sales_try: totals.sales.TRY, total_sales_syp: totals.sales.SYP, total_sales_usd: totals.sales.USD,
        // خانتا الرأس القديمتان تُشتقّان من الأسطر التفصيلية (D-085) — لوحة الميديا
        // باير الحالية ورسومها تقرأهما كما كانت، بلا أي تغيير.
        ...srcHeader,
        default_currency: defCur,
      };
      const reportId = await upsertDailyReport(header);
      const adRows = ads.map(a => {
        const r = rows[a.id]; if (!r) return null;
        const amt = Number(r.amount) || 0;
        return {
          campaign_id: a.campaign_id, ad_id: a.id,
          messages: Number(r.messages) || 0, confirmations: Number(r.confirmations) || 0,
          amount_try: r.currency === 'TRY' ? amt : 0, amount_syp: r.currency === 'SYP' ? amt : 0, amount_usd: r.currency === 'USD' ? amt : 0,
          currency: r.currency, star_rating: r.star_rating || null, notes: (r.notes || '').trim() || null,
          // الصور تُحفظ فقط مع رسائل > 0 — بلا رسائل لا صور (قاعدة حسام)
          image_urls: (Number(r.messages) || 0) > 0 ? (r.image_urls || []).slice(0, MAX_AD_IMAGES) : [],
        };
      }).filter(Boolean);
      await replaceAdResults(reportId, adRows);
      await replaceSourceResults(reportId, srcRows.map(r => ({
        kind: r.kind, campaign_id: r.kind === 'old_ad' ? r.campaign_id : null, ad_id: r.kind === 'old_ad' ? r.ad_id : null,
        platform_key: r.kind === 'page' ? r.platform_key : null, label: srcLabel(r), count: Number(r.count) || 0,
        amount_try: r.currency === 'TRY' ? Number(r.amount) || 0 : 0, amount_syp: r.currency === 'SYP' ? Number(r.amount) || 0 : 0, amount_usd: r.currency === 'USD' ? Number(r.amount) || 0 : 0,
        currency: r.currency, notes: r.notes,
      })));
      setMsg({ type: 'ok', text: '✅ حُفظ تقرير اليوم' });
    } catch (e) { setMsg({ type: 'err', text: 'تعذّر الحفظ: ' + (e.message || e) }); }
    finally { setSaving(false); }
  };

  const salesStr = CURS.filter(c => totals.sales[c] > 0).map(c => `${fmt(totals.sales[c])} ${CUR_SYM[c]}`).join(' · ') || '—';
  const ordSalesStr = CURS.filter(c => ordSum.sales[c] > 0).map(c => `${fmt(ordSum.sales[c])} ${CUR_SYM[c]}`).join(' · ') || '—';

  return (
    <div className="space-y-4 pb-28" dir="rtl">
      <Hero eyebrow="التقرير اليومي" title={`🧾 تقريري — ${userName || ''}`}
        subtitle="سجّل لكل إعلان: الرسائل الواردة + المبيعات وقيمتها + تقييم الإعلان، ومبيعات المصادر الأخرى."
        actions={
          <input type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)}
            className="bg-white/15 text-white rounded-xl px-3 py-2 text-sm border border-white/20 focus:outline-none" />
        } />

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="رسائل" value={fmt(totals.messages)} icon="💬" />
        <StatCard label="تأكيدات" value={fmt(totals.confirmations)} icon="✅" tone="teal" />
        <StatCard label="إجمالي المبيعات" value={<span className="text-base">{salesStr}</span>} icon="💵" />
      </div>

      {/* ملخّص طلباتك الفعلية اليوم — تلقائي من جدول الطلبات (قراءة فقط، للمقارنة) */}
      <Card padding="md" className="space-y-2 border-teal/30">
        <CardTitle className="text-sm">
          📦 طلباتك الفعلية اليوم
          <span className="text-[10px] font-normal text-muted"> · تلقائي من النظام</span>
        </CardTitle>
        {ordLoading ? (
          <div className="h-16 bg-surface-alt animate-pulse rounded-xl" />
        ) : ordSum.count === 0 ? (
          <p className="text-xs text-muted">لا طلبات مسجّلة باسمك في هذا اليوم بعد.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="طلبات" value={fmt(ordSum.count)} icon="🧾" />
              <StatCard label="مُسلّمة" value={fmt(ordSum.delivered)} icon="✅" tone="teal" />
              <StatCard label="مبيعات الطلبات" value={<span className="text-base">{ordSalesStr}</span>} icon="💵" />
            </div>
            {ordSum.items.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {ordSum.items.slice(0, 12).map(it => (
                  <span key={it.name} className="text-[11px] bg-surface-alt border border-border rounded-full px-2 py-0.5">
                    {it.name} <strong className="tabular-nums">×{it.qty}</strong>
                  </span>
                ))}
                {ordSum.items.length > 12 && <span className="text-[11px] text-muted px-1">+{ordSum.items.length - 12}</span>}
              </div>
            )}
            <p className="text-[10px] text-muted">أرقام طلباتك الفعلية في النظام لهذا اليوم — للمقارنة مع تقريرك اليدوي (تُحسب تلقائياً ولا تُحفَظ).</p>
          </>
        )}
      </Card>

      {loading ? (
        <div className="h-40 bg-surface-alt animate-pulse rounded-2xl" />
      ) : campaigns.length === 0 ? (
        <EmptyState icon="📣" title="لا حملات مُسنَدة إليك"
          description="لم تُسنَد لأي حملة بعد. تواصل مع الميديا باير (أولغا) لإسنادك — عندها ستظهر إعلاناتك هنا للتسجيل اليومي." />
      ) : (
        <>
          {campaigns.map(c => (
            <Card key={c.id} padding="md" className="space-y-3">
              <CardTitle className="text-sm">📣 {c.name}{c.channel_name_custom ? <span className="text-muted font-normal text-xs"> · {c.channel_name_custom}</span> : null}</CardTitle>
              {(adsByCampaign[c.id] || []).length === 0 ? (
                <p className="text-xs text-muted">لا إعلانات في هذه الحملة بعد.</p>
              ) : (adsByCampaign[c.id] || []).map(a => {
                const r = rows[a.id] || {};
                return (
                  <div key={a.id} className="rounded-xl border border-border p-3 space-y-2 bg-surface-alt/40">
                    <div className="flex items-center gap-2">
                      {a.ad_image_url && <img src={a.ad_image_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />}
                      <span className="text-sm font-semibold text-text truncate flex-1">{a.ad_name}</span>
                      <Stars value={r.star_rating || 0} onChange={(v) => setRow(a.id, { star_rating: v })} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <label className="block">
                        <span className="text-[10px] text-muted block mb-0.5">💬 رسائل</span>
                        <input type="number" min="0" value={r.messages ?? ''} onChange={e => setRow(a.id, { messages: e.target.value })} className={numCls} style={numStyle} placeholder="0" />
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-muted block mb-0.5">✅ تأكيدات</span>
                        <input type="number" min="0" value={r.confirmations ?? ''} onChange={e => setRow(a.id, { confirmations: e.target.value })} className={numCls} style={numStyle} placeholder="0" />
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-muted block mb-0.5">💵 قيمة البيع</span>
                        <input type="number" min="0" value={r.amount ?? ''} onChange={e => setRow(a.id, { amount: e.target.value })} className={numCls} style={numStyle} placeholder="0" />
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-muted block mb-0.5">العملة</span>
                        <select value={r.currency || defCur} onChange={e => setRow(a.id, { currency: e.target.value })} className={inputCls}>
                          {CURS.map(cur => <option key={cur} value={cur}>{cur}</option>)}
                        </select>
                      </label>
                    </div>
                    <input value={r.notes ?? ''} onChange={e => setRow(a.id, { notes: e.target.value })} className={inputCls} placeholder="📝 ملاحظة عن الإعلان (اختياري)…" />
                    {/* صور الإعلان — تظهر فقط عندما وصلت رسائل من هذا الإعلان */}
                    {(Number(r.messages) || 0) > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        {(r.image_urls || []).map(u => (
                          <div key={u} className="relative w-14 h-14 rounded-lg overflow-hidden border border-border">
                            <img src={u} alt="" className="w-full h-full object-cover" />
                            <button type="button" onClick={() => removeAdImage(a.id, u)} title="إزالة"
                              className="absolute top-0 left-0 w-5 h-5 bg-black/60 text-white text-[10px] leading-none rounded-br-lg">✕</button>
                          </div>
                        ))}
                        {(r.image_urls || []).length < MAX_AD_IMAGES && (
                          <label className={'w-14 h-14 rounded-lg border-2 border-dashed border-teal/40 text-teal text-[10px] flex flex-col items-center justify-center cursor-pointer hover:bg-teal/5 ' + (uploadingAd === a.id ? 'opacity-60 pointer-events-none' : '')}>
                            <span className="text-base leading-none">{uploadingAd === a.id ? '⏳' : '📷'}</span>
                            <span>صورة</span>
                            <input type="file" accept="image/*" className="hidden" disabled={uploadingAd === a.id}
                              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; addAdImage(a.id, f); }} />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          ))}

          {/* مصادر التثبيت من خارج الإعلانات النشطة (D-085) — سطر لكل مصدر:
              إعلان قديم متوقف (بصورته) / صفحاتنا (منصة) / ستوري / توصية / زبون قديم / آخر */}
          <Card padding="md" className="space-y-3">
            <CardTitle className="text-sm">🔎 تثبيتات من خارج الإعلانات النشطة
              <span className="text-[10px] font-normal text-muted"> · من أين جاء التثبيت؟</span>
            </CardTitle>
            {srcRows.length === 0 && <p className="text-xs text-muted">لا شيء بعد — أضف سطراً لكل مصدر تثبيت (إعلان قديم، صفحة، ستوري…).</p>}
            {srcRows.map((r, i) => {
              const kindMeta = SOURCE_KINDS.find(k => k.key === r.kind);
              const campAds  = r.campaign_id ? (oldAdsByCampaign[r.campaign_id] || []) : [];
              const pickedAd = campAds.find(a => a.id === r.ad_id);
              return (
                <div key={i} className="rounded-xl border border-border p-3 space-y-2 bg-surface-alt/40">
                  <div className="flex items-center gap-2">
                    <select value={r.kind} onChange={e => setSrc(i, { kind: e.target.value, campaign_id: null, ad_id: null, platform_key: null, label: '' })} className={inputCls + ' flex-1'}>
                      {SOURCE_KINDS.map(k => <option key={k.key} value={k.key}>{k.icon} {k.label}</option>)}
                    </select>
                    <button type="button" onClick={() => delSrc(i)} title="حذف السطر" className="w-8 h-8 rounded-lg bg-red-bg text-red-fg text-sm shrink-0">🗑️</button>
                  </div>

                  {r.kind === 'old_ad' && (
                    <div className="space-y-2">
                      <select value={r.campaign_id || ''} onChange={e => setSrc(i, { campaign_id: e.target.value || null, ad_id: null })} className={inputCls}>
                        <option value="">— اختر الحملة المتوقفة —</option>
                        {oldCamps.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}{c.team ? ' · ' + c.team : ''}</option>)}
                      </select>
                      {r.campaign_id && (campAds.length === 0
                        ? <p className="text-[11px] text-muted">لا إعلانات محفوظة لهذه الحملة.</p>
                        : <div className="flex flex-wrap gap-2">
                            {campAds.map(a => (
                              <button key={a.id} type="button" onClick={() => setSrc(i, { ad_id: a.id })} title={a.ad_name}
                                className={'w-16 rounded-lg border-2 overflow-hidden text-[10px] text-center ' + (r.ad_id === a.id ? 'border-teal ring-2 ring-teal/30' : 'border-border hover:border-teal/40')}>
                                {a.ad_image_url ? <img src={a.ad_image_url} alt="" className="w-16 h-16 object-cover" /> : <div className="w-16 h-16 flex items-center justify-center text-xl">🖼️</div>}
                                <span className="block truncate px-1 py-0.5 text-text">{a.ad_name}</span>
                              </button>
                            ))}
                          </div>)}
                      {pickedAd && <p className="text-[11px] text-teal">✓ {pickedAd.ad_name}</p>}
                    </div>
                  )}

                  {r.kind === 'page' && (
                    <select value={r.platform_key || ''} onChange={e => setSrc(i, { platform_key: e.target.value || null })} className={inputCls}>
                      <option value="">— اختر المنصة —</option>
                      {platforms.map(pf => <option key={pf.key} value={pf.key}>{pf.icon || '📱'} {pf.label}</option>)}
                    </select>
                  )}

                  {r.kind === 'other' && (
                    <input value={r.label} onChange={e => setSrc(i, { label: e.target.value })} className={inputCls} placeholder="اكتب المصدر (مثال: صديق، معرض، جوجل…)" />
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="text-[10px] text-muted block mb-0.5">✅ تثبيتات</span>
                      <input type="number" min="0" value={r.count} onChange={e => setSrc(i, { count: e.target.value })} className={numCls} style={numStyle} placeholder="0" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-muted block mb-0.5">💵 القيمة</span>
                      <input type="number" min="0" value={r.amount} onChange={e => setSrc(i, { amount: e.target.value })} className={numCls} style={numStyle} placeholder="0" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-muted block mb-0.5">العملة</span>
                      <select value={r.currency} onChange={e => setSrc(i, { currency: e.target.value })} className={inputCls}>
                        {CURS.map(cur => <option key={cur} value={cur}>{cur}</option>)}
                      </select>
                    </label>
                  </div>
                  {kindMeta && r.kind !== 'other' && <input value={r.notes} onChange={e => setSrc(i, { notes: e.target.value })} className={inputCls} placeholder="📝 ملاحظة (اختياري)…" />}
                </div>
              );
            })}
            <div className="flex flex-wrap gap-1.5">
              {SOURCE_KINDS.map(k => (
                <button key={k.key} type="button" onClick={() => setSrcRows(rs => [...rs, newSrcRow(k.key)])}
                  className="text-[11px] px-2.5 py-1.5 rounded-full border border-teal/40 text-teal hover:bg-teal/5">➕ {k.icon} {k.label}</button>
              ))}
            </div>
          </Card>

          {msg && <p className={'text-sm rounded-xl px-3 py-2 ' + (msg.type === 'ok' ? 'bg-green-bg text-green-fg' : 'bg-red-bg text-red-fg')}>{msg.text}</p>}

          <div className="fixed bottom-20 sm:bottom-0 inset-x-0 p-3 bg-surface/95 backdrop-blur border-t border-border sm:static sm:bg-transparent sm:border-0 sm:p-0 z-40">
            <div className="max-w-3xl mx-auto">
              <Button variant="teal" className="w-full" onClick={save} disabled={saving}>
                {saving ? '⏳ جاري الحفظ…' : '💾 حفظ تقرير اليوم'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
