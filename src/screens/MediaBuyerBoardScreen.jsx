// =============================================================
// MediaBuyerBoardScreen — لوحة الميديا باير (أولغا) التحليلية.
// مصدرها campaignAnalyticsService (daily_reports + report_ad_results).
// مَن يعمل · مَن يبيع · قيمة كل موظف per-حملة/إعلان · مصدر البيع · الاتجاه.
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Hero, Card, CardTitle, EmptyState, StatCard } from '@components/ui';
import { loadCampaignAnalytics, todayISO, daysAgoISO, monthStartISO } from '@services/campaignAnalyticsService';
import { DailyTrendChart, HBarChart, SourceSplitDonut } from './mediaBuyer/charts';

const CUR_SYM = { try: '₺', syp: 'ل.س', usd: '$' };
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const fmtSales = (s) => ['usd', 'try', 'syp'].filter(c => s?.[c] > 0).map(c => `${fmt(s[c])} ${CUR_SYM[c]}`).join(' · ') || '—';

const PERIODS = [['today', 'اليوم'], ['7d', '7 أيام'], ['month', 'هذا الشهر'], ['custom', 'مخصّص']];
const SRC_COLORS = { ad: '#0d7377', old: '#d97706', other: '#64748b' };

export default function MediaBuyerBoardScreen() {
  const [period, setPeriod] = useState('month');
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo]     = useState(todayISO());
  const [team, setTeam] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    if (period === 'today')  return { from: todayISO(), to: todayISO() };
    if (period === '7d')     return { from: daysAgoISO(6), to: todayISO() };
    if (period === 'month')  return { from: monthStartISO(), to: todayISO() };
    return { from, to };
  }, [period, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await loadCampaignAnalytics({ from: range.from, to: range.to, team: team || null, campaignId: campaignId || null });
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [range.from, range.to, team, campaignId]);
  useEffect(() => { load(); }, [load]);

  const t = data?.totals;
  const trendData = useMemo(() => (data?.dailyTrend || []).map(d => ({ date: d.date, messages: d.messages, confirmations: d.confirmations })), [data]);
  const campBars  = useMemo(() => (data?.perCampaign || []).slice(0, 8).map(c => ({ name: c.name, value: c.confirmations })), [data]);
  const adBars    = useMemo(() => (data?.perAd || []).slice(0, 8).map(a => ({ name: a.ad_name, value: a.confirmations })), [data]);
  const srcSegments = useMemo(() => {
    const s = data?.sourceSplit; if (!s) return [];
    return [
      { name: s.ad.label, value: s.ad.count, color: SRC_COLORS.ad },
      { name: s.old.label, value: s.old.count, color: SRC_COLORS.old },
      { name: s.other.label, value: s.other.count, color: SRC_COLORS.other },
    ];
  }, [data]);

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      <Hero eyebrow="الميديا باير" title="📡 لوحة الميديا باير"
        subtitle="أداء الحملات والإعلانات · مَن يعمل ومَن يبيع · قيمة المبيعات ومصدرها بدقّة." />

      {/* الفلاتر */}
      <div className="space-y-2">
        <div className="flex gap-1.5 flex-wrap">
          {PERIODS.map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)}
              className={'px-3 py-1.5 rounded-xl text-xs font-bold transition border ' + (period === k ? 'bg-teal text-navy border-teal' : 'bg-surface-alt text-muted hover:text-text border-border')}>{l}</button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {period === 'custom' && (
            <>
              <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="border border-border rounded-xl px-2 py-1.5 text-xs bg-surface text-text" />
              <input type="date" value={to} max={todayISO()} onChange={e => setTo(e.target.value)} className="border border-border rounded-xl px-2 py-1.5 text-xs bg-surface text-text" />
            </>
          )}
          <select value={campaignId} onChange={e => setCampaignId(e.target.value)} className="border border-border rounded-xl px-2 py-1.5 text-xs bg-surface text-text max-w-[12rem]">
            <option value="">كل الحملات</option>
            {(data?.filters?.campaigns || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={team} onChange={e => setTeam(e.target.value)} className="border border-border rounded-xl px-2 py-1.5 text-xs bg-surface text-text">
            <option value="">كل الفِرق</option>
            {(data?.filters?.teams || []).map(tm => <option key={tm} value={tm}>{tm}</option>)}
          </select>
          <button onClick={load} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-surface-alt text-muted hover:text-text border border-border">🔄 تحديث</button>
        </div>
      </div>

      {loading ? (
        <div className="h-64 bg-surface-alt animate-pulse rounded-2xl" />
      ) : !data ? (
        <EmptyState icon="⚠️" title="تعذّر التحميل" />
      ) : (
        <>
          {t.reportsCount === 0 && (
            <div className="bg-amber-bg border border-amber/30 text-amber-fg rounded-xl px-4 py-3 text-sm">
              لا تقارير في هذه الفترة. جرّب فترة أوسع (مثلاً «مخصّص» لشهر سابق)، أو ابدأ التسجيل اليومي من «🧾 تقريري اليومي» وستظهر الأرقام هنا.
            </div>
          )}
          {/* بطاقات إجمالية */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatCard label="رسائل" value={fmt(t.messages)} icon="💬" />
            <StatCard label="تأكيدات" value={fmt(t.confirmations)} icon="✅" tone="teal" />
            <StatCard label="نسبة التحويل" value={t.convRate + '%'} icon="📈" tone="amber" />
            <StatCard label="عدد التقارير" value={fmt(t.reportsCount)} icon="🧾" />
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <Card padding="md">
              <CardTitle className="text-sm mb-1">💵 إجمالي المبيعات</CardTitle>
              <p className="text-xl font-extrabold text-teal">{fmtSales(t.sales)}</p>
            </Card>
            <Card padding="md">
              <CardTitle className="text-sm mb-1">📊 إنفاق ميتا · ROAS</CardTitle>
              {data.meta?.hasData ? (
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-xl font-extrabold text-amber-fg">{fmt(data.meta.spend)} {data.meta.currency || ''}</span>
                  {data.meta.roas != null && <span className="text-sm font-bold text-teal">ROAS ×{data.meta.roas}</span>}
                  {data.meta.costPerResult != null && <span className="text-xs text-muted">تكلفة النتيجة {data.meta.costPerResult}</span>}
                  <span className="text-xs text-muted">وصول {fmt(data.meta.reach)}</span>
                </div>
              ) : (
                <p className="text-xs text-muted">لم يُربط حساب ميتا بعد — أضف سرّي <span className="font-mono">META_ACCESS_TOKEN</span> و<span className="font-mono">META_AD_ACCOUNT_ID</span> لتظهر الإنفاق وROAS تلقائياً.</p>
              )}
            </Card>
          </div>

          {/* الاتجاه اليومي */}
          <Card padding="md">
            <CardTitle className="text-sm mb-2">📈 الاتجاه اليومي (رسائل · تأكيدات)</CardTitle>
            <DailyTrendChart data={trendData} />
          </Card>

          {/* تقسيم مصدر البيع */}
          <Card padding="md">
            <CardTitle className="text-sm mb-2">🔀 مصدر المبيعات (عدد التأكيدات)</CardTitle>
            <SourceSplitDonut segments={srcSegments} />
            <div className="mt-2 space-y-1 text-xs">
              {data.sourceSplit && [['ad', data.sourceSplit.ad], ['old', data.sourceSplit.old], ['other', data.sourceSplit.other]].map(([k, s]) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <span className="text-text"><span className="inline-block w-2.5 h-2.5 rounded-full align-middle ml-1" style={{ background: SRC_COLORS[k] }} /> {s.label}</span>
                  <span className="text-muted"><b className="text-text">{fmt(s.count)}</b> بيع · {fmtSales(s.sales)}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* أداء الحملات */}
          <Card padding="md">
            <CardTitle className="text-sm mb-2">📣 أداء الحملات (الأعلى تأكيدات)</CardTitle>
            <HBarChart data={campBars} color="#0d7377" valueLabel="تأكيدات" />
            <div className="mt-2 divide-y divide-border/50">
              {(data.perCampaign || []).map(c => (
                <div key={c.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <span className="text-text font-semibold truncate flex-1">{c.name}
                    {c.avgStar ? <span className="text-amber-fg"> ★{c.avgStar}</span> : null}
                    <span className="text-muted font-normal"> · {c.sellersCount} موظف · {c.adsCount} إعلان</span>
                  </span>
                  <span className="text-muted shrink-0">💬{fmt(c.messages)} · ✅{fmt(c.confirmations)} ({c.convRate}%)</span>
                  {c.spend > 0 && <span className="text-amber-fg shrink-0">📊{fmt(c.spend)}{c.roas != null ? ` · ×${c.roas}` : ''}</span>}
                  <span className="text-teal font-bold shrink-0">{fmtSales(c.sales)}</span>
                </div>
              ))}
              {(data.perCampaign || []).length === 0 && <p className="py-3 text-xs text-muted text-center">لا بيانات في هذه الفترة.</p>}
            </div>
          </Card>

          {/* أداء الإعلانات */}
          <Card padding="md">
            <CardTitle className="text-sm mb-2">🖼️ أداء الإعلانات (الأعلى تأكيدات)</CardTitle>
            <HBarChart data={adBars} color="#2563eb" valueLabel="تأكيدات" />
            <div className="mt-2 divide-y divide-border/50">
              {(data.perAd || []).slice(0, 12).map(a => (
                <div key={a.id} className="py-2 flex items-center gap-2 text-xs">
                  {a.image && <img src={a.image} alt="" className="w-7 h-7 rounded object-cover shrink-0" />}
                  <span className="text-text font-semibold truncate flex-1">{a.ad_name}
                    {a.avgStar ? <span className="text-amber-fg"> ★{a.avgStar}</span> : null}
                    <span className="text-muted font-normal"> · {a.campaign_name}</span>
                  </span>
                  <span className="text-muted shrink-0">💬{fmt(a.messages)} · ✅{fmt(a.confirmations)}</span>
                  <span className="text-teal font-bold shrink-0">{fmtSales(a.sales)}</span>
                </div>
              ))}
              {(data.perAd || []).length === 0 && <p className="py-3 text-xs text-muted text-center">لا بيانات في هذه الفترة.</p>}
            </div>
          </Card>

          {/* الالتزام اليوم */}
          <Card padding="md">
            <CardTitle className="text-sm mb-2">🟢 التزام اليوم بالتسجيل ({data.compliance.reportedToday.length}/{data.compliance.expected.length})</CardTitle>
            <div className="flex flex-wrap gap-1.5">
              {data.compliance.expected.length === 0 ? <p className="text-xs text-muted">لا موظفين مُسنَدين لحملات نشطة.</p> :
                data.compliance.expected.map(n => {
                  const done = data.compliance.reportedToday.includes(n);
                  return <span key={n} className={'px-2 py-1 rounded-lg text-[11px] font-semibold ' + (done ? 'bg-green-bg text-green-fg' : 'bg-red-bg text-red-fg')}>{done ? '✅' : '⏳'} {n}</span>;
                })}
            </div>
          </Card>

          {/* الموظفون */}
          <Card padding="md">
            <CardTitle className="text-sm mb-2">👥 أداء الموظفين</CardTitle>
            <div className="divide-y divide-border/50">
              {(data.perEmployee || []).map(e => (
                <details key={e.name} className="py-2">
                  <summary className="flex items-center justify-between gap-2 text-xs cursor-pointer list-none">
                    <span className="text-text font-semibold truncate flex-1">{e.reportedToday ? '🟢' : '⚪'} {e.name}
                      <span className="text-muted font-normal"> · {e.days} يوم · {e.team || ''}</span>
                    </span>
                    <span className="text-muted shrink-0">💬{fmt(e.messages)} · ✅{fmt(e.confirmations)}</span>
                    <span className="text-teal font-bold shrink-0">{fmtSales(e.sales)}</span>
                  </summary>
                  {e.byCampaign.length > 0 && (
                    <div className="mt-1.5 pr-4 space-y-1">
                      {e.byCampaign.map((b, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-[11px] text-muted">
                          <span className="truncate flex-1">↳ {b.name}</span>
                          <span>✅{fmt(b.confirmations)}</span>
                          <span className="text-teal">{fmtSales(b.sales)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </details>
              ))}
              {(data.perEmployee || []).length === 0 && <p className="py-3 text-xs text-muted text-center">لا تقارير في هذه الفترة.</p>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
