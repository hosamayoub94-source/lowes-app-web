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
} from '@services/campaignAnalyticsService';

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

  const [date, setDate]       = useState(todayISO());
  const [campaigns, setCampaigns] = useState([]);
  const [ads, setAds]         = useState([]);
  const [rows, setRows]       = useState({});   // ad_id → { messages, confirmations, amount, currency, star_rating, notes }
  const [other, setOther]     = useState({ oldCount: '', oldAmount: '', oldCur: defCur, otherCount: '', otherAmount: '', otherCur: defCur });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState(null);

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
      const { report, results } = await getDayReport(userName, date);
      const r = {};
      for (const res of results) {
        r[res.ad_id] = {
          messages: res.messages || '', confirmations: res.confirmations || '',
          amount: pickAmount(res.amount_try, res.amount_syp, res.amount_usd),
          currency: res.currency || defCur, star_rating: res.star_rating || 0, notes: res.notes || '',
        };
      }
      setRows(r);
      setOther(report ? {
        oldCount: report.old_customer_count || '',
        oldAmount: pickAmount(report.old_customer_amount_try, report.old_customer_amount_syp, report.old_customer_amount_usd),
        oldCur: pickCur(report.old_customer_amount_try, report.old_customer_amount_syp, report.old_customer_amount_usd, defCur),
        otherCount: report.other_source_count || '',
        otherAmount: pickAmount(report.other_source_amount_try, report.other_source_amount_syp, report.other_source_amount_usd),
        otherCur: pickCur(report.other_source_amount_try, report.other_source_amount_syp, report.other_source_amount_usd, defCur),
      } : { oldCount: '', oldAmount: '', oldCur: defCur, otherCount: '', otherAmount: '', otherCur: defCur });
    } catch { /* */ }
    finally { setLoading(false); }
  }, [userName, date, defCur]);
  useEffect(() => { loadDay(); }, [loadDay]);

  const setRow  = (adId, patch) => setRows(p => ({ ...p, [adId]: { ...(p[adId] || { messages: '', confirmations: '', amount: '', currency: defCur, star_rating: 0, notes: '' }), ...patch } }));
  const setO    = (patch) => setOther(o => ({ ...o, ...patch }));
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
    sales[other.oldCur]   = (sales[other.oldCur]   || 0) + (Number(other.oldAmount)   || 0);
    sales[other.otherCur] = (sales[other.otherCur] || 0) + (Number(other.otherAmount) || 0);
    return { messages, confirmations, sales };
  }, [ads, rows, other]);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const header = {
        employee_name: userName, team: team || null, report_date: date,
        total_messages: totals.messages, total_confirmations: totals.confirmations,
        total_sales_try: totals.sales.TRY, total_sales_syp: totals.sales.SYP, total_sales_usd: totals.sales.USD,
        old_customer_count: Number(other.oldCount) || 0,
        old_customer_amount_try: other.oldCur === 'TRY' ? Number(other.oldAmount) || 0 : 0,
        old_customer_amount_syp: other.oldCur === 'SYP' ? Number(other.oldAmount) || 0 : 0,
        old_customer_amount_usd: other.oldCur === 'USD' ? Number(other.oldAmount) || 0 : 0,
        other_source_count: Number(other.otherCount) || 0,
        other_source_amount_try: other.otherCur === 'TRY' ? Number(other.otherAmount) || 0 : 0,
        other_source_amount_syp: other.otherCur === 'SYP' ? Number(other.otherAmount) || 0 : 0,
        other_source_amount_usd: other.otherCur === 'USD' ? Number(other.otherAmount) || 0 : 0,
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
        };
      }).filter(Boolean);
      await replaceAdResults(reportId, adRows);
      setMsg({ type: 'ok', text: '✅ حُفظ تقرير اليوم' });
    } catch (e) { setMsg({ type: 'err', text: 'تعذّر الحفظ: ' + (e.message || e) }); }
    finally { setSaving(false); }
  };

  const salesStr = CURS.filter(c => totals.sales[c] > 0).map(c => `${fmt(totals.sales[c])} ${CUR_SYM[c]}`).join(' · ') || '—';

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
                  </div>
                );
              })}
            </Card>
          ))}

          {/* مصادر أخرى */}
          <Card padding="md" className="space-y-3">
            <CardTitle className="text-sm">🔀 مبيعات من مصادر أخرى (خارج الإعلانات)</CardTitle>
            {[['old', '👤 عميل سابق', 'oldCount', 'oldAmount', 'oldCur'], ['other', '🌐 مصدر آخر', 'otherCount', 'otherAmount', 'otherCur']].map(([k, label, ck, ak, curk]) => (
              <div key={k} className="grid grid-cols-3 gap-2 items-end">
                <label className="block">
                  <span className="text-[10px] text-muted block mb-0.5">{label} — عدد</span>
                  <input type="number" min="0" value={other[ck]} onChange={e => setO({ [ck]: e.target.value })} className={numCls} style={numStyle} placeholder="0" />
                </label>
                <label className="block">
                  <span className="text-[10px] text-muted block mb-0.5">القيمة</span>
                  <input type="number" min="0" value={other[ak]} onChange={e => setO({ [ak]: e.target.value })} className={numCls} style={numStyle} placeholder="0" />
                </label>
                <label className="block">
                  <span className="text-[10px] text-muted block mb-0.5">العملة</span>
                  <select value={other[curk]} onChange={e => setO({ [curk]: e.target.value })} className={inputCls}>
                    {CURS.map(cur => <option key={cur} value={cur}>{cur}</option>)}
                  </select>
                </label>
              </div>
            ))}
          </Card>

          {msg && <p className={'text-sm rounded-xl px-3 py-2 ' + (msg.type === 'ok' ? 'bg-green-bg text-green-fg' : 'bg-red-bg text-red-fg')}>{msg.text}</p>}

          <div className="fixed bottom-0 inset-x-0 p-3 bg-surface/95 backdrop-blur border-t border-border sm:static sm:bg-transparent sm:border-0 sm:p-0 z-30">
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
