// =============================================================
// CampaignsScreen — Ad Campaign management for Media Buyer,
// Sales Manager, and Admin.
// Tables: ad_campaigns, campaign_ads, ad_results
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { Hero }                    from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { StatCard }                from '@components/ui/StatCard';
import { Button }                  from '@components/ui/Button';
import { EmptyState }              from '@components/ui/EmptyState';
import { useAuth }                 from '@hooks/useAuth';
import { supabase }                from '@services/supabase';

// ── helpers ────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtNum(n) { return (n ?? 0).toLocaleString('ar-SA'); }
function fmtUSD(n) { return '$' + (Number(n) || 0).toFixed(2); }

const STATUS_COLOR = {
  active:   'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  paused:   'bg-amber-100 text-amber-700',
};

// ── Status badge ───────────────────────────────────────────────
function StatusBadge({ status }) {
  const cls = STATUS_COLOR[status] || STATUS_COLOR.inactive;
  const label = { active: 'مفعّلة', inactive: 'معطّلة', paused: 'متوقفة' }[status] || status;
  return (
    <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ' + cls}>
      {label}
    </span>
  );
}

// ── New Campaign Modal ─────────────────────────────────────────
const EMPTY_CMP = { name: '', team: 'تيم سوريا', channel_type: 'page', channel_name: '', status: 'active' };

function NewCampaignModal({ open, onClose, onSaved }) {
  const [form, setForm]   = useState(EMPTY_CMP);
  const [saving, setSaving] = useState(false);
  const [err, setErr]     = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr('اسم الحملة مطلوب'); return; }
    setSaving(true);
    setErr(null);
    try {
      const { error } = await supabase.from('ad_campaigns').insert({
        name:         form.name.trim(),
        team:         form.team,
        channel_type: form.channel_type,
        channel_name: form.channel_name.trim() || null,
        status:       form.status,
      });
      if (error) throw new Error(error.message);
      setForm(EMPTY_CMP);
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md bg-surface rounded-2xl shadow-xl border border-border overflow-hidden" dir="rtl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-text">حملة جديدة</h2>
          <button onClick={onClose} className="text-muted hover:text-text text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">اسم الحملة *</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="حملة صيف 2026..."
              className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">الفريق</label>
            <select
              value={form.team}
              onChange={e => set('team', e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
            >
              <option value="تيم سوريا">🟩 تيم سوريا</option>
              <option value="تيم Lowes تركيا">🇹🇷 تيم Lowes تركيا</option>
              <option value="الكل">الكل</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">نوع القناة</label>
              <select
                value={form.channel_type}
                onChange={e => set('channel_type', e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
              >
                <option value="page">📱 صفحة</option>
                <option value="whatsapp">💬 واتساب</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">الحالة</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
              >
                <option value="active">🟢 مفعّلة</option>
                <option value="inactive">⚪ معطّلة</option>
                <option value="paused">⏸️ متوقفة</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">اسم القناة / الصفحة</label>
            <input
              value={form.channel_name}
              onChange={e => set('channel_name', e.target.value)}
              placeholder="صفحة لوز الرسمية..."
              className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
            />
          </div>
          {err && <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">⚠️ {err}</p>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>إلغاء</Button>
            <Button type="submit" variant="teal" className="flex-1" disabled={saving}>
              {saving ? '⏳ جاري الحفظ…' : '➕ إنشاء الحملة'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Campaign Card ──────────────────────────────────────────────
function CampaignCard({ c, onSelect }) {
  return (
    <div
      className="bg-surface border border-border rounded-2xl p-4 cursor-pointer hover:border-teal transition-colors"
      onClick={() => onSelect(c)}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="font-bold text-text text-sm truncate">{c.name}</p>
          <p className="text-xs text-muted mt-0.5">{c.team}</p>
        </div>
        <StatusBadge status={c.status} />
      </div>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span>{c.channel_type === 'page' ? '📱' : '💬'} {c.channel_name || '—'}</span>
        <span className="mr-auto">{fmtDate(c.created_at)}</span>
      </div>
      {(c._spend > 0 || c._orders > 0) && (
        <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs font-bold text-text">{fmtUSD(c._spend)}</p>
            <p className="text-[10px] text-muted">إنفاق</p>
          </div>
          <div>
            <p className="text-xs font-bold text-text">{fmtNum(c._orders)}</p>
            <p className="text-[10px] text-muted">طلبات</p>
          </div>
          <div>
            <p className="text-xs font-bold text-teal">{fmtUSD(c._revenue)}</p>
            <p className="text-[10px] text-muted">إيرادات</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Campaign Detail Panel ──────────────────────────────────────
function CampaignDetail({ campaign, onClose }) {
  const [ads, setAds]       = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState('ads');

  useEffect(() => {
    if (!campaign) return;
    (async () => {
      setLoading(true);
      const [adsRes, resRes] = await Promise.allSettled([
        supabase.from('campaign_ads').select('*').eq('campaign_id', campaign.id).order('created_at'),
        supabase.from('ad_results').select('*').eq('campaign_id', campaign.id).order('result_date', { ascending: false }).limit(30),
      ]);
      if (adsRes.status === 'fulfilled' && !adsRes.value.error) setAds(adsRes.value.data || []);
      if (resRes.status === 'fulfilled' && !resRes.value.error) setResults(resRes.value.data || []);
      setLoading(false);
    })();
  }, [campaign]);

  if (!campaign) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg bg-surface rounded-2xl shadow-xl border border-border overflow-hidden max-h-[90vh] flex flex-col" dir="rtl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-text">{campaign.name}</h2>
            <p className="text-xs text-muted mt-0.5">{campaign.team} · {campaign.channel_name || '—'}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text text-xl leading-none">✕</button>
        </div>
        <div className="flex gap-1 px-5 pt-3 shrink-0">
          {[['ads','🖼️ الإعلانات'], ['results','📊 النتائج']].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={'px-4 py-2 rounded-xl text-xs font-bold transition-colors ' +
                (tab === k ? 'bg-teal text-white' : 'bg-surface-alt text-muted hover:text-text')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          {loading ? (
            <p className="text-sm text-muted text-center py-6 animate-pulse">جاري التحميل…</p>
          ) : tab === 'ads' ? (
            ads.length === 0
              ? <EmptyState description="لا توجد إعلانات لهذه الحملة بعد" />
              : ads.map(ad => (
                  <div key={ad.id} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                    <div className="w-10 h-10 rounded-xl bg-surface-alt flex items-center justify-center text-lg shrink-0">
                      {ad.image_url ? (
                        <img src={ad.image_url} alt={ad.name} className="w-full h-full object-cover rounded-xl" />
                      ) : '🖼️'}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text">{ad.name}</p>
                      <p className="text-xs text-muted">{fmtDate(ad.created_at)}</p>
                    </div>
                  </div>
                ))
          ) : (
            results.length === 0
              ? <EmptyState description="لا توجد نتائج مسجّلة لهذه الحملة" />
              : results.map(r => (
                  <div key={r.id} className="py-3 border-b border-border last:border-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted">{fmtDate(r.result_date || r.created_at)}</span>
                      <span className="text-xs font-bold text-teal">{fmtUSD(r.revenue_usd || 0)}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-muted">
                      <span>إنفاق: <b className="text-text">{fmtUSD(r.ad_spend_usd || 0)}</b></span>
                      <span>طلبات: <b className="text-text">{r.orders || 0}</b></span>
                      {r.roas > 0 && <span>ROAS: <b className="text-amber-600">{Number(r.roas).toFixed(2)}x</b></span>}
                    </div>
                  </div>
                ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────
export default function CampaignsScreen() {
  const { role } = useAuth();

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected]   = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [kpis, setKpis] = useState({ totalSpend: 0, totalRevenue: 0, totalOrders: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cmpRes, resRes] = await Promise.allSettled([
        supabase.from('ad_campaigns').select('*').order('created_at', { ascending: false }),
        supabase.from('ad_results').select('ad_spend_usd, revenue_usd, orders, campaign_id'),
      ]);

      let cmps = [];
      let results = [];
      if (cmpRes.status === 'fulfilled' && !cmpRes.value.error) cmps = cmpRes.value.data || [];
      if (resRes.status === 'fulfilled' && !resRes.value.error) results = resRes.value.data || [];

      const byId = {};
      results.forEach(r => {
        if (!byId[r.campaign_id]) byId[r.campaign_id] = { spend: 0, revenue: 0, orders: 0 };
        byId[r.campaign_id].spend   += Number(r.ad_spend_usd) || 0;
        byId[r.campaign_id].revenue += Number(r.revenue_usd)  || 0;
        byId[r.campaign_id].orders  += Number(r.orders)       || 0;
      });

      const enriched = cmps.map(c => ({
        ...c,
        _spend:   byId[c.id]?.spend   || 0,
        _revenue: byId[c.id]?.revenue || 0,
        _orders:  byId[c.id]?.orders  || 0,
      }));

      setCampaigns(enriched);

      const totalSpend   = results.reduce((s, r) => s + (Number(r.ad_spend_usd) || 0), 0);
      const totalRevenue = results.reduce((s, r) => s + (Number(r.revenue_usd)  || 0), 0);
      const totalOrders  = results.reduce((s, r) => s + (Number(r.orders)       || 0), 0);
      setKpis({ totalSpend, totalRevenue, totalOrders });
    } catch (e) {
      setError(e?.message || 'تعذّر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filterStatus === 'all'
    ? campaigns
    : campaigns.filter(c => c.status === filterStatus);

  const activeCnt = campaigns.filter(c => c.status === 'active').length;

  return (
    <div className="space-y-5">
      <Hero
        eyebrow="الحملات الإعلانية"
        title="إدارة الحملات"
        subtitle="تتبّع حملاتك الإعلانية وأداء الإعلانات."
        actions={
          <Button variant="teal" size="lg" onClick={() => setShowCreate(true)}>
            + حملة جديدة
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="الحملات الكل"    value={loading ? '—' : campaigns.length} tone="blue" />
        <StatCard label="مفعّلة"          value={loading ? '—' : activeCnt}         tone="green" />
        <StatCard label="إجمالي الإنفاق"  value={loading ? '—' : fmtUSD(kpis.totalSpend)}   tone="amber" />
        <StatCard label="إجمالي الإيرادات" value={loading ? '—' : fmtUSD(kpis.totalRevenue)} tone="green" />
      </div>

      <div className="flex gap-2 flex-wrap">
        {[['all','الكل'],['active','🟢 مفعّلة'],['inactive','⚪ معطّلة'],['paused','⏸️ متوقفة']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilterStatus(k)}
            className={'px-4 py-2 rounded-xl text-xs font-bold transition-colors ' +
              (filterStatus === k ? 'bg-teal text-white' : 'bg-surface border border-border text-muted hover:text-text')}
          >
            {label}
          </button>
        ))}
      </div>

      <Card>
        <CardTitle>قائمة الحملات</CardTitle>
        <CardSubtitle>اضغط على الحملة لرؤية التفاصيل والإعلانات</CardSubtitle>
        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-muted animate-pulse py-4">جاري التحميل…</p>
          ) : error ? (
            <p className="text-sm text-red-500 py-2">⚠️ {error}</p>
          ) : filtered.length === 0 ? (
            <EmptyState description="لا توجد حملات بعد — أنشئ أول حملة إعلانية" />
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {filtered.map(c => (
                <CampaignCard key={c.id} c={c} onSelect={setSelected} />
              ))}
            </div>
          )}
        </div>
      </Card>

      <NewCampaignModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={load}
      />
      {selected && (
        <CampaignDetail
          campaign={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}