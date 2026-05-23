// =============================================================
// SalesDashboard — Daily Sales Report Wizard
// =============================================================
import { useState } from 'react';
import { useAuth } from '@hooks/useAuth';
import {
  useSalesBootstrap,
  useSalesDashboard,
  useSalesActions,
  useSelectedReportId,
  useReportDetail,
  useSalesLoading,
  useSalesCampaigns,
  useSalesChannels,
} from '../hooks/useSales.js';
import {
  REPORT_STATUS, REPORT_STATUS_LABELS, AD_PLATFORM_LABELS, formatROAS, roasColor,
} from '../types/sales.types.js';
import { ROLES } from '@data/teams';

const STATUS_COLORS = {
  draft:     'bg-gray-100 text-gray-600',
  submitted: 'bg-yellow-100 text-yellow-700',
  approved:  'bg-green-100 text-green-700',
};
const EMPTY_AD = { campaign_name: '', platform: 'meta', ad_spend_usd: '', orders: '', revenue_usd: '' };

function NewReportModal({ open, onClose, onSave, loading, campaigns, channels }) {
  const [form, setForm] = useState({
    report_date: new Date().toISOString().slice(0, 10),
    total_orders: '', total_sales_usd: '', total_ad_spend_usd: '', notes: '',
  });
  const [ads, setAds]          = useState([]);
  const [chanRows, setChanRows] = useState([]);
  const [tab, setTab]          = useState('summary');

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const sumSpend   = ads.reduce((s, a) => s + (Number(a.ad_spend_usd)  || 0), 0);
  const sumRevenue = ads.reduce((s, a) => s + (Number(a.revenue_usd)   || 0), 0);
  const sumOrders  = ads.reduce((s, a) => s + (Number(a.orders)        || 0), 0);

  const addAd      = () => setAds(p => [...p, { ...EMPTY_AD }]);
  const setAd      = (i, k, v) => setAds(p => p.map((a, idx) => idx === i ? { ...a, [k]: v } : a));
  const removeAd   = (i) => setAds(p => p.filter((_, idx) => idx !== i));
  const addChan    = () => setChanRows(p => [...p, { channel_name: '', orders: '', sales_usd: '' }]);
  const setChan    = (i, k, v) => setChanRows(p => p.map((c, idx) => idx === i ? { ...c, [k]: v } : c));
  const removeChan = (i) => setChanRows(p => p.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    const totalSpend  = ads.length > 0 ? sumSpend   : Number(form.total_ad_spend_usd) || 0;
    const totalSales  = ads.length > 0 ? sumRevenue : Number(form.total_sales_usd)    || 0;
    const totalOrders = ads.length > 0 ? sumOrders  : Number(form.total_orders)       || 0;
    const roas = totalSpend > 0 ? Number((totalSales / totalSpend).toFixed(2)) : 0;
    await onSave({
      summary: { report_date: form.report_date, total_orders: totalOrders, total_sales_usd: totalSales, total_ad_spend_usd: totalSpend, roas, notes: form.notes },
      ads: ads.filter(a => a.campaign_name.trim()),
      channels: chanRows.filter(c => c.channel_name.trim()),
    });
    setForm({ report_date: new Date().toISOString().slice(0, 10), total_orders: '', total_sales_usd: '', total_ad_spend_usd: '', notes: '' });
    setAds([]); setChanRows([]); setTab('summary');
  };

  if (!open) return null;
  const previewRoas = Number(form.total_sales_usd) / (Number(form.total_ad_spend_usd) || 1);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-6 w-full max-w-lg shadow-xl overflow-y-auto max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg text-text mb-4">تقرير مبيعات جديد</h3>
        <div className="flex gap-1 mb-4 bg-cream rounded-xl p-1">
          {[['summary','الإجمالي'],['campaigns','الحملات'],['channels','القنوات']].map(([key, lbl]) => (
            <button key={key} onClick={() => setTab(key)}
              className={['flex-1 py-1.5 rounded-lg text-xs font-semibold transition', tab === key ? 'bg-teal text-white' : 'text-muted hover:text-text'].join(' ')}>
              {lbl}{key === 'campaigns' && ads.length > 0 && ' (' + ads.length + ')'}
            </button>
          ))}
        </div>
        {tab === 'summary' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted mb-1 block">التاريخ</label>
              <input type="date" value={form.report_date} onChange={e => setF('report_date', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted mb-1 block">عدد الطلبات</label>
                <input type="number" readOnly={ads.length > 0} value={ads.length > 0 ? sumOrders : form.total_orders} onChange={e => setF('total_orders', e.target.value)} placeholder="0" className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" />
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">المبيعات (USD)</label>
                <input type="number" readOnly={ads.length > 0} value={ads.length > 0 ? sumRevenue : form.total_sales_usd} onChange={e => setF('total_sales_usd', e.target.value)} placeholder="0" className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">الإنفاق الإعلاني (USD)</label>
              <input type="number" readOnly={ads.length > 0} value={ads.length > 0 ? sumSpend : form.total_ad_spend_usd} onChange={e => setF('total_ad_spend_usd', e.target.value)} placeholder="0" className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" />
            </div>
            {ads.length === 0 && form.total_sales_usd && Number(form.total_ad_spend_usd) > 0 && (
              <div className="bg-cream rounded-xl p-3 text-center">
                <span className="text-xs text-muted">ROAS: </span>
                <span className={'text-sm font-bold ' + roasColor(previewRoas)}>{formatROAS(previewRoas)}</span>
              </div>
            )}
            {ads.length > 0 && (
              <div className="bg-teal/5 border border-teal/20 rounded-xl p-3 text-center text-xs text-muted">
                محسوب من {ads.length} حملة — ROAS: <span className={'font-bold ' + roasColor(sumSpend > 0 ? sumRevenue/sumSpend : 0)}>{formatROAS(sumSpend > 0 ? sumRevenue/sumSpend : 0)}</span>
              </div>
            )}
            <div>
              <label className="text-xs text-muted mb-1 block">ملاحظات</label>
              <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} rows={2} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text resize-none" placeholder="اختياري…" />
            </div>
          </div>
        )}
        {tab === 'campaigns' && (
          <div className="space-y-3">
            {ads.length === 0 && <p className="text-xs text-muted text-center py-4">أضف حملة لتفصيل الإنفاق</p>}
            {ads.map((ad, i) => (
              <div key={i} className="bg-cream border border-border rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input value={ad.campaign_name} onChange={e => setAd(i,'campaign_name',e.target.value)} placeholder="اسم الحملة" className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs bg-surface text-text" />
                  <select value={ad.platform} onChange={e => setAd(i,'platform',e.target.value)} className="border border-border rounded-lg px-2 py-1.5 text-xs bg-surface text-text">
                    {Object.entries(AD_PLATFORM_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <button onClick={() => removeAd(i)} className="text-red-400 hover:text-red-600 font-bold px-1">x</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[['ad_spend_usd','إنفاق'],['orders','طلبات'],['revenue_usd','إيراد']].map(([k,lbl]) => (
                    <div key={k}>
                      <label className="text-xs text-muted block mb-0.5">{lbl}</label>
                      <input type="number" value={ad[k]} onChange={e => setAd(i,k,e.target.value)} placeholder="0" className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-surface text-text" />
                    </div>
                  ))}
                </div>
                {Number(ad.ad_spend_usd) > 0 && Number(ad.revenue_usd) > 0 && (
                  <div className="text-xs text-right text-muted">ROAS: <span className={'font-bold ' + roasColor(Number(ad.revenue_usd)/Number(ad.ad_spend_usd))}>{formatROAS(Number(ad.revenue_usd)/Number(ad.ad_spend_usd))}</span></div>
                )}
              </div>
            ))}
            <button onClick={addAd} className="w-full py-2 border border-dashed border-teal/50 rounded-xl text-xs text-teal hover:bg-teal/5 transition">+ إضافة حملة</button>
            {campaigns && campaigns.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-muted mb-1.5">إضافة سريعة:</p>
                <div className="flex flex-wrap gap-1.5">
                  {campaigns.map(c => (
                    <button key={c.id} onClick={() => setAds(p => [...p, { campaign_name: c.name, platform: c.platform, ad_spend_usd:'', orders:'', revenue_usd:'' }])}
                      className="text-xs px-2 py-1 rounded-lg border border-border bg-surface hover:border-teal/40 text-muted">{c.name}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {tab === 'channels' && (
          <div className="space-y-3">
            {chanRows.length === 0 && <p className="text-xs text-muted text-center py-4">أضف قناة لتفصيل المبيعات</p>}
            {chanRows.map((c, i) => (
              <div key={i} className="bg-cream border border-border rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input value={c.channel_name} onChange={e => setChan(i,'channel_name',e.target.value)} placeholder="اسم القناة" className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs bg-surface text-text" />
                  <button onClick={() => removeChan(i)} className="text-red-400 hover:text-red-600 font-bold px-1">x</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[['orders','طلبات'],['sales_usd','مبيعات (USD)']].map(([k,lbl]) => (
                    <div key={k}>
                      <label className="text-xs text-muted block mb-0.5">{lbl}</label>
                      <input type="number" value={c[k]} onChange={e => setChan(i,k,e.target.value)} placeholder="0" className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-surface text-text" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={addChan} className="w-full py-2 border border-dashed border-teal/50 rounded-xl text-xs text-teal hover:bg-teal/5 transition">+ إضافة قناة</button>
            {channels && channels.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-muted mb-1.5">إضافة سريعة:</p>
                <div className="flex flex-wrap gap-1.5">
                  {channels.map(ch => (
                    <button key={ch.id} onClick={() => setChanRows(p => [...p, { channel_name: ch.name, orders:'', sales_usd:'' }])}
                      className="text-xs px-2 py-1 rounded-lg border border-border bg-surface hover:border-teal/40 text-muted">{ch.name}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2 mt-5">
          <button onClick={handleSave} disabled={loading.action} className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold disabled:opacity-50 transition">{loading.action ? 'جار الحفظ…' : 'حفظ كمسودة'}</button>
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-border text-sm text-text hover:bg-cream transition">إلغاء</button>
        </div>
      </div>
    </div>
  );
}

// ── Empty campaign row ─────────────────────────────────────────
const EMPTY_AD = { campaign_name: '', platform: 'meta', ad_spend_usd: '', orders: '', revenue_usd: '' };

// ── New Report Modal ───────────────────────────────────────────
function NewReportModal({ open, onClose, onSave, loading, campaigns, channels }) {
  const [form, setForm] = useState({
    report_date:        new Date().toISOString().slice(0, 10),
    total_orders:       '',
    total_sales_usd:    '',
    total_ad_spend_usd: '',
    notes:              '',
  });
  const [ads, setAds]         = useState([]);
  const [tab, setTab]         = useState('summary'); // 'summary' | 'campaigns' | 'channels'
  const [chanRows, setChanRows] = useState([]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Auto-sum from campaigns
  const sumSpend   = ads.reduce((s, a) => s + (Number(a.ad_spend_usd) || 0), 0);
  const sumRevenue = ads.reduce((s, a) => s + (Number(a.revenue_usd) || 0), 0);
  const sumOrders  = ads.reduce((s, a) => s + (Number(a.orders) || 0), 0);

  const addAd = () => setAds(p => [...p, { ...EMPTY_AD }]);
  const setAd = (i, k, v) => setAds(p => p.map((a, idx) => idx === i ? { ...a, [k]: v } : a));
  const removeAd = (i) => setAds(p => p.filter((_, idx) => idx !== i));

  const addChan = () => setChanRows(p => [...p, { channel_name: '', orders: '', sales_usd: '' }]);
  const setChan = (i, k, v) => setChanRows(p => p.map((c, idx) => idx === i ? { ...c, [k]: v } : c));
  const removeChan = (i) => setChanRows(p => p.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    // Use summed values if campaigns were entered
    const totalSpend  = ads.length > 0 ? sumSpend   : Number(form.total_ad_spend_usd) || 0;
    const totalSales  = ads.length > 0 ? sumRevenue : Number(form.total_sales_usd)    || 0;
    const totalOrders = ads.length > 0 ? sumOrders  : Number(form.total_orders)       || 0;
    const roas = totalSpend > 0 ? Number((totalSales / totalSpend).toFixed(2)) : 0;

    await onSave({
      summary: {
        report_date:        form.report_date,
        total_orders:       totalOrders,
        total_sales_usd:    totalSales,
        total_ad_spend_usd: totalSpend,
        roas,
        notes: form.notes,
      },
      ads:  ads.filter(a => a.campaign_name.trim()),
      channels: chanRows.filter(c => c.channel_name.trim()),
    });
    // Reset
    setForm({ report_date: new Date().toISOString().slice(0, 10), total_orders: '', total_sales_usd: '', total_ad_spend_usd: '', notes: '' });
    setAds([]);
    setChanRows([]);
    setTab('summary');
  };

  if (!open) return null;
  const roas = Number(form.total_sales_usd) / (Number(form.total_ad_spend_usd) || 1);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-6 w-full max-w-lg shadow-xl overflow-y-auto max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg text-text mb-4">📊 تقرير مبيعات جديد</h3>

        {/* Tab nav */}
        <div className="flex gap-1 mb-4 bg-cream rounded-xl p-1">
          {[
            { key: 'summary',   label: 'الإجمالي' },
            { key: 'campaigns', label: 'الحملات' },
            { key: 'channels',  label: 'القنوات' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                'flex-1 py-1.5 rounded-lg text-xs font-semibold transition',
                tab === t.key ? 'bg-teal text-white' : 'text-muted hover:text-text',
              ].join(' ')}
            >
              {t.label}
              {t.key === 'campaigns' && ads.length > 0 && (
                <span className="mr-1 bg-white/30 rounded-full px-1">{ads.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Summary tab */}
        {tab === 'summary' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted mb-1 block">التاريخ</label>
              <input type="date" value={form.report_date} onChange={e => setF('report_date', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted mb-1 block">عدد الطلبات</label>
                <input type="number" value={ads.length > 0 ? sumOrders : form.total_orders}
                  readOnly={ads.length > 0}
                  onChange={e => setF('total_orders', e.target.value)}
                  placeholder="0"
                  className={['w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text', ads.length > 0 ? 'opacity-60' : ''].join(' ')} />
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">إجمالي المبيعات ($)</label>
                <input type="number" value={ads.length > 0 ? sumRevenue : form.total_sales_usd}
                  readOnly={ads.length > 0}
                  onChange={e => setF('total_sales_usd', e.target.value)}
                  placeholder="0"
                  className={['w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text', ads.length > 0 ? 'opacity-60' : ''].join(' ')} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">إنفاق إعلاني ($)</label>
              <input type="number" value={ads.length > 0 ? sumSpend : form.total_ad_spend_usd}
                readOnly={ads.length > 0}
                onChange={e => setF('total_ad_spend_usd', e.target.value)}
                placeholder="0"
                className={['w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text', ads.length > 0 ? 'opacity-60' : ''].join(' ')} />
            </div>
            {ads.length === 0 && form.total_sales_usd && form.total_ad_spend_usd && Number(form.total_ad_spend_usd) > 0 && (
              <div className="bg-cream rounded-xl p-3 text-center">
                <span className="text-xs text-muted">ROAS المتوقع: </span>
                <span className={`text-sm font-bold ${roasColor(roas)}`}>{formatROAS(roas)}</span>
              </div>
            )}
            {ads.length > 0 && (
              <div className="bg-teal/5 border border-teal/20 rounded-xl p-3 text-center text-xs text-muted">
                القيم محسوبة تلقائياً من الحملات ({ads.length} حملة) — ROAS: <span className={`font-bold ${roasColor(sumSpend > 0 ? sumRevenue / sumSpend : 0)}`}>{formatROAS(sumSpend > 0 ? sumRevenue / sumSpend : 0)}</span>
              </div>
            )}
            <div>
              <label className="text-xs text-muted mb-1 block">ملاحظات</label>
              <textarea value={form.notes} onChange={e => setF('notes', e.target.value)}
                rows={2} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text resize-none" placeholder="اختياري…" />
            </div>
          </div>
        )}

        {/* Campaigns tab */}
        {tab === 'campaigns' && (
          <div className="space-y-3">
            {ads.length === 0 && (
              <p className="text-xs text-muted text-center py-4">لا توجد حملات — أضف حملة لتفصيل الإنفاق الإعلاني</p>
            )}
            {ads.map((ad, i) => (
              <div key={i} className="bg-cream border border-border rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={ad.campaign_name}
                    onChange={e => setAd(i, 'campaign_name', e.target.value)}
                    placeholder="اسم الحملة"
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs bg-surface text-text"
                  />
                  <select value={ad.platform} onChange={e => setAd(i, 'platform', e.target.value)}
                    className="border border-border rounded-lg px-2 py-1.5 text-xs bg-surface text-text">
                    {Object.entries(AD_PLATFORM_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <button onClick={() => removeAd(i)} className="text-red-400 hover:text-red-600 text-sm font-bold">×</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-muted block mb-0.5">إنفاق ($)</label>
                    <input type="number" value={ad.ad_spend_usd} onChange={e => setAd(i, 'ad_spend_usd', e.target.value)}
                      placeholder="0" className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-surface text-text" />
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-0.5">طلبات</label>
                    <input type="number" value={ad.orders} onChange={e => setAd(i, 'orders', e.target.value)}
                      placeholder="0" className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-surface text-text" />
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-0.5">إيراد ($)</label>
                    <input type="number" value={ad.revenue_usd} onChange={e => setAd(i, 'revenue_usd', e.target.value)}
                      placeholder="0" className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-surface text-text" />
                  </div>
                </div>
                {ad.ad_spend_usd && ad.revenue_usd && Number(ad.ad_spend_usd) > 0 && (
                  <div className="text-xs text-right">
                    ROAS: <span className={`font-bold ${roasColor(Number(ad.revenue_usd) / Number(ad.ad_spend_usd))}`}>
                      {formatROAS(Number(ad.revenue_usd) / Number(ad.ad_spend_usd))}
                    </span>
                  </div>
                )}
              </div>
            ))}
            <button onClick={addAd}
              className="w-full py-2 border border-dashed border-teal/50 rounded-xl text-xs text-teal hover:bg-teal/5 transition">
              + إضافة حملة
            </button>
            {/* Quick-add from existing campaigns */}
            {campaigns && campaigns.length > 0 && (
              <div>
                <p className="text-xs text-muted mb-2">إضافة سريعة من الحملات المحفوظة:</p>
                <div className="flex flex-wrap gap-1.5">
                  {campaigns.map(c => (
                    <button key={c.id} onClick={() => setAds(p => [...p, { campaign_name: c.name, platform: c.platform, ad_spend_usd: '', orders: '', revenue_usd: '' }])}
                      className="text-xs px-2 py-1 rounded-lg border border-border bg-surface hover:border-teal/40 text-muted transition">
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
              <p className="text-xs text-muted text-center py-4">لا توجد قنوات — أضف قناة لتفصيل المبيعات حسب المنصة</p>
            )}
            {chanRows.map((c, i) => (
              <div key={i} className="bg-cream border border-border rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={c.channel_name}
                    onChange={e => setChan(i, 'channel_name', e.target.value)}
                    placeholder="اسم القناة"
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs bg-surface text-text"
                  />
                  <button onClick={() => removeChan(i)} className="text-red-400 hover:text-red-600 text-sm font-bold">×</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted block mb-0.5">طلبات</label>
                    <input type="number" value={c.orders} onChange={e => setChan(i, 'orders', e.target.value)}
                      placeholder="0" className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-surface text-text" />
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-0.5">مبيعات ($)</label>
                    <input type="number" value={c.sales_usd} onChange={e => setChan(i, 'sales_usd', e.target.value)}
                      placeholder="0" className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-surface text-text" />
                  </div>
                </div>
              </div>
            ))}
            <button onClick={addChan}
              className="w-full py-2 border border-dashed border-teal/50 rounded-xl text-xs text-teal hover:bg-teal/5 transition">
              + إضافة قناة
            </button>
            {channels && channels.length > 0 && (
              <div>
                <p className="text-xs text-muted mb-2">إضافة سريعة من القنوات المحفوظة:</p>
                <div className="flex flex-wrap gap-1.5">
                  {channels.map(ch => (
                    <button key={ch.id} onClick={() => setChanRows(p => [...p, { channel_name: ch.name, orders: '', sales_usd: '' }])}
                      className="text-xs px-2 py-1 rounded-lg border border-border bg-surface hover:border-teal/40 text-muted transition">
                      {ch.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button onClick={handleSave} disabled={loading.action}
            className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 disabled:opacity-50 transition">
            {loading.action ? 'جار الحفظ…' : 'حفظ كمسودة'}
          </button>
          <button onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-border text-sm text-text hover:bg-cream transition">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────
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

  const isAdmin = role === ROLES.ADMIN || role === ROLES.MANAGER || role === ROLES.SALES_MANAGER;

  const [showForm, setShowForm] = useState(false);

  const handleCreate = async ({ summary, ads, channels: chanRows }) => {
    const newReport = await createReport(summary);
    if (!newReport) return;
    // Insert campaign ad results
    for (const ad of ads) {
      try {
        await createAdResult({
          report_id:     newReport.id,
          campaign_name: ad.campaign_name,
          platform:      ad.platform,
          ad_spend_usd:  Number(ad.ad_spend_usd) || 0,
          orders:        Number(ad.orders) || 0,
          revenue_usd:   Number(ad.revenue_usd) || 0,
          roas: Number(ad.ad_spend_usd) > 0
            ? Number((Number(ad.revenue_usd) / Number(ad.ad_spend_usd)).toFixed(2))
            : 0,
        });
      } catch { /* continue */ }
    }
    // Insert channel results
    for (const c of chanRows) {
      try {
        await createChannelResult({
          report_id:    newReport.id,
          channel_name: c.channel_name,
          orders:       Number(c.orders) || 0,
          sales_usd:    Number(c.sales_usd) || 0,
        });
      } catch { /* continue */ }
    }
    setShowForm(false);
    selectReport(newReport.id);
  };

  const usd = (n) => '$' + Number(n || 0).toFixed(0);

  return (
    <div className="min-h-screen bg-cream p-4 md:p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">المبيعات اليومية</h1>
          <p className="text-sm text-muted mt-0.5">تقارير المبيعات ونتائج الإعلانات</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 transition">+ تقرير جديد</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'طلبات آخر 7 أيام', value: kpis.last7Orders,                             icon: '🛒', color: 'text-text'       },
          { label: 'مبيعات آخر 7 أيام', value: '$' + Number(kpis.last7Sales).toFixed(0),    icon: '💵', color: 'text-green-600'   },
          { label: 'إنفاق إعلاني',      value: '$' + Number(kpis.last7Spend).toFixed(0),    icon: '📣', color: 'text-orange-500'  },
          { label: 'ROAS متوسط',         value: formatROAS(kpis.avgRoas),                    icon: '📊', color: roasColor(kpis.avgRoas) },
        ].map(k => (
          <div key={k.label} className="bg-surface border border-border rounded-xl p-4">
            <div className="text-2xl mb-1">{k.icon}</div>
            <div className={'text-xl font-bold ' + k.color}>{k.value}</div>
            <div className="text-xs text-muted mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-2">
          <h2 className="text-sm font-semibold text-muted mb-2">التقارير</h2>
          {isLoading ? (
            <div className="text-center py-8 text-muted text-sm">جار التحميل…</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8 text-muted text-sm">لا توجد تقارير</div>
          ) : reports.map(rep => (
            <button key={rep.id} onClick={() => selectReport(rep.id)}
              className={['w-full text-right p-4 rounded-xl border transition-all', selectedReportId === rep.id ? 'border-teal bg-teal/5' : 'border-border bg-surface hover:border-teal/40'].join(' ')}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={'text-xs font-semibold px-2 py-0.5 rounded-full ' + (STATUS_COLORS[rep.status] ?? '')}>{REPORT_STATUS_LABELS[rep.status] ?? rep.status}</span>
                <span className="text-sm font-semibold text-text">{rep.report_date}</span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className="text-xs text-muted">{rep.total_orders} طلب</span>
                <span className="text-sm font-bold text-teal">{usd(rep.total_sales_usd)}</span>
              </div>
              {rep.roas > 0 && <div className="mt-1"><span className={'text-xs font-bold ' + roasColor(rep.roas)}>ROAS: {formatROAS(rep.roas)}</span></div>}
            </button>
          ))}
        </div>

        <div className="md:col-span-2">
          {!report ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted text-sm bg-surface border border-border rounded-xl">
              <span className="text-4xl mb-2">📈</span><p>اختر تقريراً لعرض التفاصيل</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-text text-lg">تقرير {report.report_date}</h2>
                  <div className="flex gap-2">
                    {isAdmin && report.status === REPORT_STATUS.SUBMITTED && (
                      <button
                        onClick={() => approveReport(report.id)}
                        disabled={loading.action}
                        className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition"
                      >
                        اعتماد ✓
                      </button>
                    )}
                    {report.status === REPORT_STATUS.DRAFT && (
                      <button onClick={() => submitReport(report.id)} disabled={loading.action} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">إرسال للمراجعة</button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-cream rounded-xl"><div className="text-lg font-bold text-text">{report.total_orders}</div><div className="text-xs text-muted">طلبات</div></div>
                  <div className="text-center p-3 bg-cream rounded-xl"><div className="text-lg font-bold text-green-600">{usd(report.total_sales_usd)}</div><div className="text-xs text-muted">مبيعات</div></div>
                  <div className="text-center p-3 bg-cream rounded-xl"><div className={'text-lg font-bold ' + roasColor(report.roas)}>{formatROAS(report.roas)}</div><div className="text-xs text-muted">ROAS</div></div>
                </div>
                {report.total_ad_spend_usd > 0 && (
                  <div className="mt-3 flex justify-between text-xs text-muted">
                    <span>إنفاق: <span className="text-orange-500 font-semibold">{usd(report.total_ad_spend_usd)}</span></span>
                    {report.total_orders > 0 && <span>CPA: <span className="font-semibold">{usd(Number(report.total_ad_spend_usd)/Number(report.total_orders))}</span></span>}
                  </div>
                )}
                {report.notes && <p className="mt-3 text-xs text-muted">{report.notes}</p>}
              </div>

              {/* Ad spend summary */}
              {report.total_ad_spend_usd > 0 && (
                <div className="bg-surface border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-text">الإنفاق الإعلاني</span>
                    <span className="text-sm font-bold text-orange-500">${Number(report.total_ad_spend_usd).toFixed(0)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted">
                    <span>تكلفة الطلب (CPA)</span>
                    <span className="font-semibold">
                      {report.total_orders > 0
                        ? '$' + (Number(report.total_ad_spend_usd) / Number(report.total_orders)).toFixed(1)
                        : '—'}
                    </span>
                  </div>
                </div>
              )}

              {/* Channel breakdown */}
              {channelResults.length > 0 && (
                <div className="bg-surface border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-text mb-3">📦 حسب القناة</h3>
                  <div className="space-y-2">
                    {channelResults.map(c => (
                      <div key={c.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-border last:border-0">
                        <span className="text-sm text-text">{c.channel_name}</span>
                        <div><span className="text-sm font-semibold text-text">{usd(c.sales_usd)}</span><span className="text-xs text-muted mr-2">{c.orders} طلب</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {adResults.length > 0 && (
                <div className="bg-surface border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-text mb-3">📣 نتائج الحملات الإعلانية</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted border-b border-border">
                          <th className="py-2 px-2 text-right">الحملة</th><th className="py-2 px-2 text-center">المنصة</th>
                          <th className="py-2 px-2 text-center">الإنفاق</th><th className="py-2 px-2 text-center">الطلبات</th>
                          <th className="py-2 px-2 text-center">الإيراد</th><th className="py-2 px-2 text-center">ROAS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adResults.map(a => (
                          <tr key={a.id} className="border-b border-border last:border-0 hover:bg-cream/50 transition">
                            <td className="py-2 px-2 text-right text-text font-medium">{a.campaign_name}</td>
                            <td className="py-2 px-2 text-center text-muted">{AD_PLATFORM_LABELS[a.platform] ?? a.platform}</td>
                            <td className="py-2 px-2 text-center text-orange-500">{usd(a.ad_spend_usd)}</td>
                            <td className="py-2 px-2 text-center">{a.orders}</td>
                            <td className="py-2 px-2 text-center text-green-600">{usd(a.revenue_usd)}</td>
                            <td className={'py-2 px-2 text-center font-bold ' + roasColor(a.roas)}>{formatROAS(a.roas)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border text-muted font-semibold">
                          <td className="py-2 px-2 text-right text-xs" colSpan={2}>الإجمالي</td>
                          <td className="py-2 px-2 text-center text-orange-500">
                            ${adResults.reduce((s, a) => s + Number(a.ad_spend_usd ?? 0), 0).toFixed(0)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {adResults.reduce((s, a) => s + Number(a.orders ?? 0), 0)}
                          </td>
                          <td className="py-2 px-2 text-center text-green-600">
                            ${adResults.reduce((s, a) => s + Number(a.revenue_usd ?? 0), 0).toFixed(0)}
                          </td>
                          <td className="py-2 px-2 text-center"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
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
