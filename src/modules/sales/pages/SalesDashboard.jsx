// =============================================================
// SalesDashboard 2.0 — واجهة مبيعات احترافية
// KPI cards · ROAS bars · Sales trend · Dark-mode ready
// =============================================================
import { useState, useMemo } from 'react';
import { useAuth } from '@hooks/useAuth';
import {
  useSalesBootstrap, useSalesDashboard, useSalesActions,
  useSelectedReportId, useReportDetail, useSalesLoading,
  useSalesCampaigns, useSalesChannels,
} from '../hooks/useSales.js';
import {
  REPORT_STATUS, REPORT_STATUS_LABELS, AD_PLATFORM_LABELS, formatROAS, roasColor,
} from '../types/sales.types.js';
import { ROLES } from '@data/teams';

// ── Helpers ─────────────────────────────────────────────────────
const usd = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const EMPTY_AD = { campaign_name: '', platform: 'meta', ad_spend_usd: '', orders: '', revenue_usd: '' };

// status badge uses theme tokens
const STATUS_META = {
  draft:     { label: 'مسودة',   cls: 'bg-surface-alt text-muted border border-border' },
  submitted: { label: 'مرسل',    cls: 'bg-amber-bg text-amber-fg border border-amber/20' },
  approved:  { label: 'معتمد',   cls: 'bg-green-bg text-green-fg border border-green/20' },
};

// ROAS — theme-aware
function RoasBadge({ roas }) {
  const v = Number(roas || 0);
  const cls = v >= 3 ? 'text-green-fg bg-green-bg border-green/20'
    : v >= 1.5       ? 'text-amber-fg bg-amber-bg border-amber/20'
    :                  'text-red-fg   bg-red-bg   border-red/20';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${cls}`}>
      {formatROAS(v)}
    </span>
  );
}

// ROAS progress bar (0–5x scale)
function RoasBar({ roas }) {
  const v = Math.min(Number(roas || 0), 5);
  const pct = (v / 5) * 100;
  const color = v >= 3 ? 'bg-green' : v >= 1.5 ? 'bg-amber' : 'bg-red';
  return (
    <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Skeleton
function Skel({ className = '' }) {
  return <div className={`bg-surface-alt animate-pulse rounded-xl ${className}`} />;
}

// ── New Report Modal ─────────────────────────────────────────────
function NewReportModal({ open, onClose, onSave, loading, campaigns, channels }) {
  const [form, setForm] = useState({
    report_date: new Date().toISOString().slice(0, 10),
    total_orders: '', total_sales_usd: '', total_ad_spend_usd: '', notes: '',
  });
  const [ads, setAds]         = useState([]);
  const [chanRows, setChanRows] = useState([]);
  const [tab, setTab]           = useState('summary');

  const setF   = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const sumSpend   = ads.reduce((s, a) => s + (Number(a.ad_spend_usd)  || 0), 0);
  const sumRevenue = ads.reduce((s, a) => s + (Number(a.revenue_usd)   || 0), 0);
  const sumOrders  = ads.reduce((s, a) => s + (Number(a.orders)        || 0), 0);
  const addAd    = () => setAds(p => [...p, { ...EMPTY_AD }]);
  const setAd    = (i, k, v) => setAds(p => p.map((a, idx) => idx === i ? { ...a, [k]: v } : a));
  const removeAd = (i) => setAds(p => p.filter((_, idx) => idx !== i));
  const addChan    = () => setChanRows(p => [...p, { channel_name: '', orders: '', sales_usd: '' }]);
  const setChan    = (i, k, v) => setChanRows(p => p.map((c, idx) => idx === i ? { ...c, [k]: v } : c));
  const removeChan = (i) => setChanRows(p => p.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    const totalSpend  = ads.length > 0 ? sumSpend   : Number(form.total_ad_spend_usd) || 0;
    const totalSales  = ads.length > 0 ? sumRevenue : Number(form.total_sales_usd)    || 0;
    const totalOrders = ads.length > 0 ? sumOrders  : Number(form.total_orders)       || 0;
    await onSave({
      summary: { report_date: form.report_date, total_orders: totalOrders, total_sales_usd: totalSales,
        total_ad_spend_usd: totalSpend, roas: totalSpend > 0 ? +(totalSales / totalSpend).toFixed(2) : 0, notes: form.notes },
      ads: ads.filter(a => a.campaign_name.trim()),
      channels: chanRows.filter(c => c.channel_name.trim()),
    });
    setForm({ report_date: new Date().toISOString().slice(0, 10), total_orders: '', total_sales_usd: '', total_ad_spend_usd: '', notes: '' });
    setAds([]); setChanRows([]); setTab('summary');
  };

  if (!open) return null;
  const previewRoas = Number(form.total_sales_usd) / (Number(form.total_ad_spend_usd) || 1);
  const INP = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-modal w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh] animate-pop-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h3 className="font-extrabold text-text text-base">📊 تقرير مبيعات جديد</h3>
            <p className="text-xs text-muted mt-0.5">{form.report_date}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted hover:text-text transition">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3 pb-1 border-b border-border shrink-0">
          {[
            { key: 'summary',   label: 'الإجمالي',  icon: '📋' },
            { key: 'campaigns', label: 'الحملات',    icon: '📣', badge: ads.length || null },
            { key: 'channels',  label: 'القنوات',    icon: '📦', badge: chanRows.length || null },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition ${tab === t.key ? 'bg-teal/10 text-teal' : 'text-muted hover:text-text'}`}>
              {t.icon} {t.label}
              {t.badge ? <span className="bg-teal text-white text-[9px] font-bold px-1.5 rounded-full">{t.badge}</span> : null}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* Summary tab */}
          {tab === 'summary' && (
            <>
              <div>
                <label className="text-xs font-semibold text-muted mb-1.5 block">📅 التاريخ</label>
                <input type="date" value={form.report_date} onChange={e => setF('report_date', e.target.value)} className={INP} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted mb-1.5 block">🛒 عدد الطلبات</label>
                  <input type="number" value={ads.length > 0 ? sumOrders : form.total_orders}
                    readOnly={ads.length > 0} onChange={e => setF('total_orders', e.target.value)}
                    placeholder="0" className={`${INP} ${ads.length > 0 ? 'opacity-60' : ''}`} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted mb-1.5 block">💵 إجمالي المبيعات ($)</label>
                  <input type="number" value={ads.length > 0 ? sumRevenue : form.total_sales_usd}
                    readOnly={ads.length > 0} onChange={e => setF('total_sales_usd', e.target.value)}
                    placeholder="0" className={`${INP} ${ads.length > 0 ? 'opacity-60' : ''}`} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted mb-1.5 block">📣 الإنفاق الإعلاني ($)</label>
                <input type="number" value={ads.length > 0 ? sumSpend : form.total_ad_spend_usd}
                  readOnly={ads.length > 0} onChange={e => setF('total_ad_spend_usd', e.target.value)}
                  placeholder="0" className={`${INP} ${ads.length > 0 ? 'opacity-60' : ''}`} />
              </div>
              {/* ROAS preview */}
              {(ads.length > 0 || (form.total_sales_usd && form.total_ad_spend_usd)) && (
                <div className="bg-surface-alt rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted font-medium">ROAS {ads.length > 0 ? '(من الحملات)' : 'المتوقع'}</span>
                    <RoasBadge roas={ads.length > 0 ? (sumSpend > 0 ? sumRevenue / sumSpend : 0) : previewRoas} />
                  </div>
                  <RoasBar roas={ads.length > 0 ? (sumSpend > 0 ? sumRevenue / sumSpend : 0) : previewRoas} />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-muted mb-1.5 block">📝 ملاحظات</label>
                <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} rows={2}
                  placeholder="اختياري…" className={`${INP} resize-none`} />
              </div>
            </>
          )}

          {/* Campaigns tab */}
          {tab === 'campaigns' && (
            <div className="space-y-3">
              {ads.length === 0 && (
                <div className="text-center py-6 text-muted">
                  <p className="text-2xl mb-2">📣</p>
                  <p className="text-xs">أضف حملات لتفصيل الإنفاق الإعلاني تلقائياً</p>
                </div>
              )}
              {ads.map((ad, i) => (
                <div key={i} className="bg-surface-alt border border-border rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={ad.campaign_name} onChange={e => setAd(i, 'campaign_name', e.target.value)}
                      placeholder="اسم الحملة" className="flex-1 border border-border rounded-lg px-2.5 py-2 text-xs bg-surface text-text focus:outline-none focus:ring-1 focus:ring-teal/30" />
                    <select value={ad.platform} onChange={e => setAd(i, 'platform', e.target.value)}
                      className="border border-border rounded-lg px-2 py-2 text-xs bg-surface text-text focus:outline-none">
                      {Object.entries(AD_PLATFORM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button onClick={() => removeAd(i)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-red-fg hover:bg-red-bg transition text-base">×</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[['ad_spend_usd','إنفاق ($)'],['orders','طلبات'],['revenue_usd','إيراد ($)']].map(([k,l]) => (
                      <div key={k}>
                        <label className="text-[10px] text-muted block mb-0.5">{l}</label>
                        <input type="number" value={ad[k]} onChange={e => setAd(i, k, e.target.value)}
                          placeholder="0" className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-surface text-text focus:outline-none" />
                      </div>
                    ))}
                  </div>
                  {ad.ad_spend_usd && ad.revenue_usd && Number(ad.ad_spend_usd) > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted">ROAS</span>
                      <RoasBadge roas={Number(ad.revenue_usd) / Number(ad.ad_spend_usd)} />
                    </div>
                  )}
                </div>
              ))}
              <button onClick={addAd} className="w-full py-2.5 border-2 border-dashed border-teal/40 rounded-xl text-xs text-teal hover:bg-teal/5 hover:border-teal/60 transition font-semibold">
                + إضافة حملة
              </button>
              {campaigns?.length > 0 && (
                <div>
                  <p className="text-xs text-muted mb-2">إضافة سريعة:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {campaigns.map(c => (
                      <button key={c.id} onClick={() => setAds(p => [...p, { campaign_name: c.name, platform: c.platform, ad_spend_usd: '', orders: '', revenue_usd: '' }])}
                        className="text-xs px-2.5 py-1 rounded-lg border border-border bg-surface-alt hover:border-teal/40 hover:text-teal text-muted transition">
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Channels tab */}
          {tab === 'channels' && (
            <div className="space-y-3">
              {chanRows.length === 0 && (
                <div className="text-center py-6 text-muted">
                  <p className="text-2xl mb-2">📦</p>
                  <p className="text-xs">أضف قنوات لتفصيل المبيعات حسب المنصة</p>
                </div>
              )}
              {chanRows.map((c, i) => (
                <div key={i} className="bg-surface-alt border border-border rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={c.channel_name} onChange={e => setChan(i, 'channel_name', e.target.value)}
                      placeholder="اسم القناة" className="flex-1 border border-border rounded-lg px-2.5 py-2 text-xs bg-surface text-text focus:outline-none" />
                    <button onClick={() => removeChan(i)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-red-fg hover:bg-red-bg transition text-base">×</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[['orders','طلبات'],['sales_usd','مبيعات ($)']].map(([k,l]) => (
                      <div key={k}>
                        <label className="text-[10px] text-muted block mb-0.5">{l}</label>
                        <input type="number" value={c[k]} onChange={e => setChan(i, k, e.target.value)}
                          placeholder="0" className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-surface text-text focus:outline-none" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={addChan} className="w-full py-2.5 border-2 border-dashed border-teal/40 rounded-xl text-xs text-teal hover:bg-teal/5 transition font-semibold">
                + إضافة قناة
              </button>
              {channels?.length > 0 && (
                <div>
                  <p className="text-xs text-muted mb-2">إضافة سريعة:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {channels.map(ch => (
                      <button key={ch.id} onClick={() => setChanRows(p => [...p, { channel_name: ch.name, orders: '', sales_usd: '' }])}
                        className="text-xs px-2.5 py-1 rounded-lg border border-border bg-surface-alt hover:border-teal/40 hover:text-teal text-muted transition">
                        {ch.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 py-4 border-t border-border shrink-0">
          <button onClick={handleSave} disabled={loading.action}
            className="flex-1 py-2.5 rounded-xl bg-teal text-white text-sm font-bold hover:bg-teal/90 disabled:opacity-50 transition shadow-sm">
            {loading.action ? '⏳ جار الحفظ…' : '💾 حفظ كمسودة'}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-border text-sm text-muted hover:text-text hover:bg-surface-alt transition">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Report Card (sidebar list item) ──────────────────────────────
function ReportCard({ rep, active, onClick }) {
  const meta = STATUS_META[rep.status] ?? STATUS_META.draft;
  return (
    <button onClick={onClick} className={`w-full text-start p-3.5 rounded-2xl border transition-all duration-150 ${
      active ? 'border-teal bg-teal/5 shadow-sm' : 'border-border bg-surface hover:border-teal/40 hover:shadow-sm'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-text">{rep.report_date}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{rep.total_orders} طلب</span>
        <span className="text-base font-extrabold text-teal">{usd(rep.total_sales_usd)}</span>
      </div>
      {rep.roas > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted">ROAS</span>
            <RoasBadge roas={rep.roas} />
          </div>
          <RoasBar roas={rep.roas} />
        </div>
      )}
    </button>
  );
}

// ── Report Detail ────────────────────────────────────────────────
function ReportDetail({ report, channelResults, adResults, isAdmin, loading, onSubmit, onApprove, onDelete }) {
  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted rounded-2xl border border-dashed border-border bg-surface/50">
        <span className="text-4xl mb-2 opacity-30">📈</span>
        <p className="text-sm font-medium">اختر تقريراً لعرض التفاصيل</p>
      </div>
    );
  }

  const meta = STATUS_META[report.status] ?? STATUS_META.draft;
  const totalAdSpend = adResults.length > 0
    ? adResults.reduce((s, a) => s + Number(a.ad_spend_usd ?? 0), 0)
    : Number(report.total_ad_spend_usd ?? 0);

  return (
    <div className="space-y-3">
      {/* Header card */}
      <div className="bg-gradient-to-br from-navy to-navy/80 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-white/50 font-medium">تقرير يوم</p>
            <p className="text-lg font-extrabold mt-0.5">{report.report_date}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${meta.cls}`}>{meta.label}</span>
            {isAdmin && report.status === REPORT_STATUS.SUBMITTED && (
              <button onClick={onApprove} disabled={loading.action}
                className="px-3 py-1.5 rounded-lg bg-green/20 text-green-fg border border-green/30 text-xs font-bold hover:bg-green/30 disabled:opacity-50 transition">
                ✓ اعتماد
              </button>
            )}
            {report.status === REPORT_STATUS.DRAFT && (
              <button onClick={onSubmit} disabled={loading.action}
                className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-bold hover:bg-white/20 disabled:opacity-50 transition border border-white/20">
                إرسال للمراجعة ↑
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'الطلبات',   val: report.total_orders,         icon: '🛒', color: 'text-white' },
            { label: 'المبيعات',  val: usd(report.total_sales_usd), icon: '💵', color: 'text-emerald-300' },
            { label: 'الإنفاق',   val: usd(report.total_ad_spend_usd), icon: '📣', color: 'text-amber-300' },
          ].map(s => (
            <div key={s.label} className="text-center bg-white/[0.07] rounded-xl p-2.5">
              <div className="text-lg mb-0.5">{s.icon}</div>
              <div className={`text-base font-extrabold ${s.color}`}>{s.val}</div>
              <div className="text-[10px] text-white/40 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
        {report.roas > 0 && (
          <div className="mt-4 bg-white/[0.07] rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-white/60">ROAS</span>
              <span className="text-sm font-extrabold text-white">{formatROAS(report.roas)}</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-teal transition-all duration-700"
                style={{ width: `${Math.min((Number(report.roas) / 5) * 100, 100)}%` }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-white/30">0x</span>
              <span className="text-[9px] text-white/30">5x+</span>
            </div>
          </div>
        )}
        {report.notes && (
          <p className="mt-3 text-xs text-white/50 italic border-t border-white/10 pt-3">{report.notes}</p>
        )}
      </div>

      {/* Channel breakdown */}
      {channelResults.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-4">
          <h3 className="text-sm font-bold text-text mb-3 flex items-center gap-2">
            <span>📦</span> حسب القناة
          </h3>
          <div className="space-y-2">
            {channelResults.map((c, i) => {
              const maxSales = Math.max(...channelResults.map(x => Number(x.sales_usd || 0)), 1);
              const pct = (Number(c.sales_usd || 0) / maxSales) * 100;
              return (
                <div key={c.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-text font-medium">{c.channel_name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted">{c.orders} طلب</span>
                      <span className="text-sm font-bold text-teal">{usd(c.sales_usd)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
                    <div className="h-full rounded-full bg-teal/60 transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ad campaigns table */}
      {adResults.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-4">
          <h3 className="text-sm font-bold text-text mb-3 flex items-center gap-2">
            <span>📣</span> نتائج الحملات الإعلانية
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="py-2 pe-3 text-start font-semibold">الحملة</th>
                  <th className="py-2 px-2 text-center font-semibold">المنصة</th>
                  <th className="py-2 px-2 text-center font-semibold">الإنفاق</th>
                  <th className="py-2 px-2 text-center font-semibold">طلبات</th>
                  <th className="py-2 px-2 text-center font-semibold">الإيراد</th>
                  <th className="py-2 ps-2 text-center font-semibold">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {adResults.map(a => (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition">
                    <td className="py-2.5 pe-3 text-text font-medium">{a.campaign_name}</td>
                    <td className="py-2.5 px-2 text-center text-muted">{AD_PLATFORM_LABELS[a.platform] ?? a.platform}</td>
                    <td className="py-2.5 px-2 text-center text-amber-fg font-semibold">{usd(a.ad_spend_usd)}</td>
                    <td className="py-2.5 px-2 text-center text-text">{a.orders}</td>
                    <td className="py-2.5 px-2 text-center text-green-fg font-semibold">{usd(a.revenue_usd)}</td>
                    <td className="py-2.5 ps-2 text-center"><RoasBadge roas={a.roas} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-bold text-muted">
                  <td className="py-2 pe-3 text-start" colSpan={2}>الإجمالي</td>
                  <td className="py-2 px-2 text-center text-amber-fg">
                    {usd(adResults.reduce((s, a) => s + Number(a.ad_spend_usd ?? 0), 0))}
                  </td>
                  <td className="py-2 px-2 text-center text-text">
                    {adResults.reduce((s, a) => s + Number(a.orders ?? 0), 0)}
                  </td>
                  <td className="py-2 px-2 text-center text-green-fg">
                    {usd(adResults.reduce((s, a) => s + Number(a.revenue_usd ?? 0), 0))}
                  </td>
                  <td className="py-2 ps-2 text-center">
                    <RoasBadge roas={totalAdSpend > 0
                      ? adResults.reduce((s, a) => s + Number(a.revenue_usd ?? 0), 0) / totalAdSpend
                      : 0} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Main SalesDashboard
// ══════════════════════════════════════════════════════════════════
export function SalesDashboard() {
  const { id, role } = useAuth();
  useSalesBootstrap(id);
  const { reports, kpis, isLoading } = useSalesDashboard();
  const { report, channelResults, adResults } = useReportDetail();
  const selectedReportId = useSelectedReportId();
  const { createReport, selectReport, submitReport, approveReport, deleteReport, createAdResult, createChannelResult } = useSalesActions();
  const loading   = useSalesLoading();
  const campaigns = useSalesCampaigns();
  const channels  = useSalesChannels();

  const isAdmin = [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER].includes(role);
  const [showForm, setShowForm] = useState(false);

  const handleCreate = async ({ summary, ads, channels: chanRows }) => {
    const newReport = await createReport(summary);
    if (!newReport) return;
    for (const ad of ads) {
      try { await createAdResult({ report_id: newReport.id, campaign_name: ad.campaign_name, platform: ad.platform,
        ad_spend_usd: Number(ad.ad_spend_usd)||0, orders: Number(ad.orders)||0, revenue_usd: Number(ad.revenue_usd)||0,
        roas: Number(ad.ad_spend_usd)>0 ? +(Number(ad.revenue_usd)/Number(ad.ad_spend_usd)).toFixed(2) : 0 });
      } catch {}
    }
    for (const c of chanRows) {
      try { await createChannelResult({ report_id: newReport.id, channel_name: c.channel_name,
        orders: Number(c.orders)||0, sales_usd: Number(c.sales_usd)||0 });
      } catch {}
    }
    setShowForm(false);
    selectReport(newReport.id);
  };

  // KPI config
  const kpiCards = [
    { label: 'طلبات آخر 7 أيام', val: kpis.last7Orders,                          icon: '🛒', cls: 'text-text' },
    { label: 'مبيعات آخر 7 أيام', val: usd(kpis.last7Sales),                     icon: '💵', cls: 'text-green-fg' },
    { label: 'إنفاق إعلاني',       val: usd(kpis.last7Spend),                     icon: '📣', cls: 'text-amber-fg' },
    { label: 'ROAS متوسط',          val: formatROAS(kpis.avgRoas),                 icon: '📊', cls: roasColor(kpis.avgRoas).replace('text-green-600','text-green-fg').replace('text-yellow-600','text-amber-fg').replace('text-red-500','text-red-fg') },
  ];

  return (
    <div className="space-y-5 pb-24 sm:pb-8" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-text">المبيعات اليومية</h1>
          <p className="text-sm text-muted mt-0.5">تقارير المبيعات ونتائج الحملات الإعلانية</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2.5 rounded-xl bg-teal text-white text-sm font-bold hover:bg-teal/90 transition shadow-sm flex items-center gap-2 shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span className="hidden sm:inline">تقرير جديد</span>
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiCards.map(k => (
          <div key={k.label} className="bg-surface border border-border rounded-2xl p-4 space-y-1">
            <div className="text-2xl">{k.icon}</div>
            {isLoading ? <div className="h-7 w-20 bg-surface-alt animate-pulse rounded-lg" />
              : <div className={`text-xl font-extrabold ${k.cls}`}>{k.val}</div>}
            <div className="text-[11px] text-muted">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Reports list + detail */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* List */}
        <div className="md:col-span-1 space-y-2">
          <p className="text-xs font-bold text-muted uppercase tracking-wider">التقارير ({reports.length})</p>
          {isLoading ? (
            [1,2,3].map(i => <div key={i} className="h-24 rounded-2xl bg-surface-alt animate-pulse" />)
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted border border-dashed border-border rounded-2xl">
              <span className="text-3xl mb-2 opacity-30">📋</span>
              <p className="text-sm">لا توجد تقارير بعد</p>
              <button onClick={() => setShowForm(true)} className="mt-3 text-xs text-teal hover:underline">+ أضف أول تقرير</button>
            </div>
          ) : reports.map(rep => (
            <ReportCard key={rep.id} rep={rep} active={selectedReportId === rep.id} onClick={() => selectReport(rep.id)} />
          ))}
        </div>

        {/* Detail */}
        <div className="md:col-span-2">
          <ReportDetail
            report={report}
            channelResults={channelResults}
            adResults={adResults}
            isAdmin={isAdmin}
            loading={loading}
            onSubmit={() => submitReport(report.id)}
            onApprove={() => approveReport(report.id)}
            onDelete={() => deleteReport(report.id)}
          />
        </div>
      </div>

      {/* Modal */}
      <NewReportModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onSave={handleCreate}
        loading={loading}
        campaigns={campaigns}
        channels={channels}
      />
    </div>
  );
}

export default SalesDashboard;
