// =============================================================
// CampaignsScreen — Ad campaign TRACKING system (Task #4)
//
// Roles:
//  • Media buyer / manager (MANAGE_CAMPAIGNS): create campaigns, add ads
//    (the "ads counter"), assign employees, and SEE per-ad performance +
//    compliance (who actually logged today).
//  • Employees: see campaigns assigned to them and log, per ad, per day:
//    messages received, purchases, and a note about the ad.
//  • Cost (cost_usd) is shown ONLY to VIEW_CAMPAIGN_COST holders.
//
// Tables: campaigns (budget_usd↔cost, members↔assigned, channel_*_custom),
//         campaign_ads (FK→campaigns), ad_daily_logs (FK→campaigns)
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { Hero }                    from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { StatCard }                from '@components/ui/StatCard';
import { Button }                  from '@components/ui/Button';
import { EmptyState }              from '@components/ui/EmptyState';
import { useAuth }                 from '@hooks/useAuth';
import { usePermissions }          from '@hooks/usePermissions';
import { PERMISSIONS }             from '@data/permissions';
import { supabase }                from '@services/supabase';

// ── helpers ────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtNum(n) { return (Number(n) || 0).toLocaleString('ar-SA-u-nu-latn'); }
function fmtUSD(n) { return '$' + (Number(n) || 0).toFixed(2); }

const STATUS_COLOR = {
  active:   'bg-green-bg text-green-fg border border-green/20',
  inactive: 'bg-surface-alt text-muted border border-border/20',
  ended:    'bg-surface-alt text-muted border border-border/20',
  paused:   'bg-amber-bg text-amber-fg border border-amber/20',
};
function StatusBadge({ status }) {
  const cls = STATUS_COLOR[status] || STATUS_COLOR.inactive;
  const label = { active: 'مفعّلة', inactive: 'معطّلة', ended: 'منتهية', paused: 'متوقفة' }[status] || status;
  return <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ' + cls}>{label}</span>;
}

const inputCls = 'w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40';

// ── New / Edit Campaign Modal ──────────────────────────────────
const EMPTY_CMP = { name: '', team: 'تيم سوريا', channel_type: 'page', channel_name: '', status: 'active', cost_usd: '', assigned_to: [], start_date: '', end_date: '', manager_name: '', spend: '', spend_currency: 'TRY' };

function CampaignModal({ open, onClose, onSaved, employees, canViewCost, editCampaign, userName }) {
  const [form, setForm]   = useState(EMPTY_CMP);
  const [saving, setSaving] = useState(false);
  const [err, setErr]     = useState(null);

  useEffect(() => {
    if (!open) return;
    if (editCampaign) {
      setForm({
        name: editCampaign.name ?? '', team: editCampaign.team ?? 'تيم سوريا',
        channel_type: editCampaign.channel_type ?? 'page', channel_name: editCampaign.channel_name ?? '',
        status: editCampaign.status ?? 'active', cost_usd: editCampaign.cost_usd ?? '',
        assigned_to: Array.isArray(editCampaign.assigned_to) ? editCampaign.assigned_to : [],
        start_date: editCampaign.start_date ?? '', end_date: editCampaign.end_date ?? '',
        manager_name: editCampaign.manager_name ?? '',
        spend: editCampaign.spend ?? '', spend_currency: editCampaign.spend_currency ?? 'TRY',
      });
    } else setForm(EMPTY_CMP);
    setErr(null);
  }, [open, editCampaign]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleEmp = (name) => setForm(f => {
    const s = new Set(f.assigned_to); s.has(name) ? s.delete(name) : s.add(name);
    return { ...f, assigned_to: [...s] };
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr('اسم الحملة مطلوب'); return; }
    setSaving(true); setErr(null);
    try {
      // Map the screen's fields → `campaigns` columns.
      const payload = {
        name: form.name.trim(), team: form.team, status: form.status,
        channel_type_custom: form.channel_type,
        channel_name_custom: form.channel_name.trim() || null,
        budget_usd: form.cost_usd === '' ? 0 : Number(form.cost_usd),
        members: form.assigned_to,
        manager_name: form.manager_name || null,
        spend: form.spend === '' ? 0 : Number(form.spend),
        spend_currency: form.spend_currency || 'TRY',
      };
      const q = editCampaign
        ? supabase.from('campaigns').update(payload).eq('id', editCampaign.id)
        : supabase.from('campaigns').insert({ ...payload, is_active: true, created_by: userName || null });
      const { error } = await q;
      if (error) throw new Error(error.message);
      onSaved(); onClose();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md bg-surface rounded-2xl shadow-xl border border-border overflow-hidden max-h-[92vh] flex flex-col" dir="rtl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-bold text-text">{editCampaign ? 'تعديل الحملة' : 'حملة جديدة'}</h2>
          <button onClick={onClose} className="text-muted hover:text-text text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">اسم الحملة *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="حملة صيف 2026…" className={inputCls} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">الفريق</label>
              <select value={form.team} onChange={e => set('team', e.target.value)} className={inputCls}>
                <option value="تيم سوريا">🟩 تيم سوريا</option>
                <option value="تيم Lowes تركيا">🇹🇷 تيم تركيا</option>
                <option value="الكل">الكل</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">الحالة</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                <option value="active">🟢 مفعّلة</option>
                <option value="ended">🏁 منتهية</option>
                <option value="paused">⏸️ متوقفة</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">نوع القناة</label>
              <select value={form.channel_type} onChange={e => set('channel_type', e.target.value)} className={inputCls}>
                <option value="page">📱 صفحة</option>
                <option value="whatsapp">💬 واتساب</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">اسم القناة</label>
              <input value={form.channel_name} onChange={e => set('channel_name', e.target.value)} placeholder="صفحة لويز…" className={inputCls} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">🎯 مدير الإعلانات (للرؤية والتحليل)</label>
            <select value={form.manager_name} onChange={e => set('manager_name', e.target.value)} className={inputCls}>
              <option value="">— بدون —</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.employee_name}>{emp.employee_name}{emp.team ? ` · ${emp.team}` : ''}</option>
              ))}
            </select>
          </div>
          {canViewCost && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">💰 تكلفة الحملة ($) <span className="text-[10px] font-normal">(مخفية عن الموظفين)</span></label>
              <input type="number" min="0" step="0.01" value={form.cost_usd} onChange={e => set('cost_usd', e.target.value)} placeholder="0" className={inputCls} style={{ direction: 'ltr', textAlign: 'right' }} />
            </div>
          )}
          {canViewCost && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">📊 الإنفاق الفعلي (للـ ROAS) <span className="text-[10px] font-normal">— يُحسب ROAS = المبيعات ÷ الإنفاق</span></label>
              <div className="grid grid-cols-3 gap-2">
                <input type="number" min="0" step="0.01" value={form.spend} onChange={e => set('spend', e.target.value)} placeholder="0" className={inputCls + ' col-span-2'} style={{ direction: 'ltr', textAlign: 'right' }} />
                <select value={form.spend_currency} onChange={e => set('spend_currency', e.target.value)} className={inputCls}>
                  <option value="TRY">₺ TRY</option>
                  <option value="SYP">ل.س SYP</option>
                  <option value="USD">$ USD</option>
                </select>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">تاريخ البداية</label>
              <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">تاريخ النهاية</label>
              <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">👥 الموظفون المكلّفون (اختر 2-3) — سيظهر لهم تقريرهم اليومي لإعلانات هذه الحملة</label>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-surface-alt p-2 space-y-1">
              {employees.length === 0 ? <p className="text-xs text-muted px-2 py-1">لا يوجد موظفون</p> :
                employees.map(emp => {
                  const checked = form.assigned_to.includes(emp.employee_name);
                  return (
                    <label key={emp.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-teal/5">
                      <input type="checkbox" checked={checked} onChange={() => toggleEmp(emp.employee_name)} className="w-4 h-4 accent-teal" />
                      <span className="text-xs text-text">{emp.employee_name}</span>
                      {emp.team && <span className="text-[10px] text-muted">· {emp.team}</span>}
                    </label>
                  );
                })}
            </div>
            {form.assigned_to.length > 0 && <p className="text-[11px] text-teal">{form.assigned_to.length} مكلّف</p>}
          </div>
          {err && <p className="text-xs text-red-fg bg-red-bg rounded-xl px-3 py-2 border border-red/20">⚠️ {err}</p>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>إلغاء</Button>
            <Button type="submit" variant="teal" className="flex-1" disabled={saving}>
              {saving ? '⏳ جاري الحفظ…' : (editCampaign ? '💾 حفظ' : '➕ إنشاء')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Upload an ad image to storage (reuses the public chat-files bucket) ──
async function uploadAdImage(file, campaignId) {
  const safe = (file.name || 'img').replace(/[^\w.\-]/g, '_').slice(-40);
  const path = `campaign-ads/${campaignId}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('chat-files').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);
  return supabase.storage.from('chat-files').getPublicUrl(path).data.publicUrl;
}

// ── Add / Edit Ad Modal ────────────────────────────────────────
function AddAdModal({ open, campaign, editAd, onClose, onSaved }) {
  const [name, setName]   = useState('');
  const [img, setImg]     = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr]     = useState(null);

  useEffect(() => {
    if (open) { setName(editAd?.ad_name || ''); setImg(editAd?.ad_image_url || ''); setErr(null); }
  }, [open, editAd]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErr('الملف يجب أن يكون صورة'); return; }
    if (file.size > 5 * 1024 * 1024) { setErr('حجم الصورة أكبر من 5MB'); return; }
    setUploading(true); setErr(null);
    try { setImg(await uploadAdImage(file, campaign.id)); }
    catch (e) { setErr('فشل رفع الصورة: ' + e.message); }
    finally { setUploading(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setErr('اسم الإعلان مطلوب'); return; }
    setSaving(true); setErr(null);
    try {
      const payload = { ad_name: name.trim(), ad_image_url: img.trim() || null };
      const q = editAd
        ? supabase.from('campaign_ads').update(payload).eq('id', editAd.id)
        : supabase.from('campaign_ads').insert({ ...payload, campaign_id: campaign.id, status: 'active' });
      const { error } = await q;
      if (error) throw new Error(error.message);
      onSaved(); onClose();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-xl border border-border" dir="rtl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-text">🖼️ {editAd ? 'تعديل الإعلان' : 'إعلان جديد'}</h2>
          <button onClick={onClose} className="text-muted hover:text-text text-xl leading-none">✕</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">اسم الإعلان *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="إعلان الفيديو الأول…" className={inputCls} required />
          </div>

          {/* Image: upload or paste a link */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted">صورة الإعلان (اختياري)</label>
            {img && (
              <div className="relative">
                <img src={img} alt="معاينة" className="w-full h-32 object-cover rounded-xl border border-border" />
                <button type="button" onClick={() => setImg('')}
                  className="absolute top-1.5 end-1.5 w-7 h-7 rounded-full bg-black/60 text-white text-sm hover:bg-black/80">×</button>
              </div>
            )}
            <label className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border-2 border-dashed cursor-pointer text-sm transition ${uploading ? 'opacity-60' : 'border-teal/40 text-teal hover:bg-teal/5'}`}>
              {uploading ? '⏳ جارٍ الرفع…' : '📤 رفع صورة من جهازك'}
              <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} className="hidden" />
            </label>
            <input value={img} onChange={e => setImg(e.target.value)} placeholder="أو الصق رابط صورة https://…" className={inputCls} style={{ direction: 'ltr' }} />
          </div>

          {err && <p className="text-xs text-red-fg bg-red-bg rounded-xl px-3 py-2 border border-red/20">⚠️ {err}</p>}
          <div className="flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>إلغاء</Button>
            <Button type="submit" variant="teal" className="flex-1" disabled={saving || uploading}>{saving ? '⏳…' : (editAd ? '💾 حفظ' : '➕ إضافة')}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Campaign Detail Panel ──────────────────────────────────────
function CampaignDetail({ campaign, userName, canManage, canViewCost, onClose, onChanged }) {
  const [ads, setAds]         = useState([]);
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('ads'); // ads | log | performance
  const [showAddAd, setShowAddAd] = useState(false);
  const [editAd, setEditAd]   = useState(null);

  const deleteAd = async (ad) => {
    if (!window.confirm(`حذف الإعلان "${ad.ad_name}" وكل تسجيلاته؟`)) return;
    const { error } = await supabase.from('campaign_ads').delete().eq('id', ad.id);
    if (error) { alert('فشل الحذف: ' + error.message); return; }
    reload(); onChanged?.();
  };

  const reload = useCallback(async () => {
    setLoading(true);
    // المصدر الفعلي: report_ad_results (مرتبط بـdaily_reports عبر report_id).
    const [adsRes, rarRes] = await Promise.allSettled([
      supabase.from('campaign_ads').select('*').eq('campaign_id', campaign.id).order('sort_order'),
      supabase.from('report_ad_results').select('report_id, ad_id, messages, confirmations').eq('campaign_id', campaign.id),
    ]);
    if (adsRes.status === 'fulfilled' && !adsRes.value.error) setAds(adsRes.value.data || []);
    const rar = (rarRes.status === 'fulfilled' && !rarRes.value.error) ? rarRes.value.data || [] : [];
    const reportIds = [...new Set(rar.map(r => r.report_id).filter(Boolean))];
    const repMap = {};
    if (reportIds.length) {
      const chunks = [];
      for (let i = 0; i < reportIds.length; i += 200) chunks.push(reportIds.slice(i, i + 200));
      const parts = await Promise.all(chunks.map(ch => supabase.from('daily_reports').select('id, employee_name, report_date').in('id', ch)));
      for (const p of parts) for (const d of (p.data || [])) repMap[d.id] = d;
    }
    setLogs(rar.map(r => ({
      ad_id: r.ad_id, messages: r.messages || 0, purchases: r.confirmations || 0,
      employee_name: repMap[r.report_id]?.employee_name || '—',
      log_date: repMap[r.report_id]?.report_date || '',
    })).sort((a, b) => (b.log_date || '').localeCompare(a.log_date || '')));
    setLoading(false);
  }, [campaign.id]);

  useEffect(() => { reload(); }, [reload]);

  // Aggregates per ad
  const perAd = {};
  ads.forEach(a => { perAd[a.id] = { messages: 0, purchases: 0, entries: 0 }; });
  logs.forEach(l => {
    if (!perAd[l.ad_id]) perAd[l.ad_id] = { messages: 0, purchases: 0, entries: 0 };
    perAd[l.ad_id].messages  += Number(l.messages)  || 0;
    perAd[l.ad_id].purchases += Number(l.purchases) || 0;
    perAd[l.ad_id].entries   += 1;
  });
  const totMessages  = logs.reduce((s, l) => s + (Number(l.messages) || 0), 0);
  const totPurchases = logs.reduce((s, l) => s + (Number(l.purchases) || 0), 0);

  // Compliance: who (of assigned) logged TODAY
  const assigned = Array.isArray(campaign.assigned_to) ? campaign.assigned_to : [];
  const loggedToday = new Set(logs.filter(l => l.log_date === todayISO()).map(l => l.employee_name));
  const missingToday = assigned.filter(n => !loggedToday.has(n));

  const isAssigned = assigned.includes(userName);

  const TABS = [['ads', `🖼️ الإعلانات (${ads.length})`], ['log', '📝 التسجيل اليومي']];
  if (canManage) TABS.push(['performance', '📊 الأداء والالتزام']);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg bg-surface rounded-2xl shadow-xl border border-border overflow-hidden max-h-[92vh] flex flex-col" dir="rtl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-text truncate">{campaign.name}</h2>
            <p className="text-xs text-muted mt-0.5">{campaign.team} · {campaign.channel_name || '—'} · <StatusBadge status={campaign.status} /></p>
            {campaign.manager_name && <p className="text-[11px] text-teal mt-0.5">🎯 مدير الإعلانات: {campaign.manager_name}</p>}
          </div>
          <button onClick={onClose} className="text-muted hover:text-text text-xl leading-none shrink-0">✕</button>
        </div>

        {/* Summary strip */}
        <div className={`grid ${canViewCost ? 'grid-cols-3' : 'grid-cols-2'} gap-2 px-5 py-3 border-b border-border shrink-0`}>
          <div className="text-center"><p className="text-sm font-bold text-text">{fmtNum(totMessages)}</p><p className="text-[10px] text-muted">رسائل</p></div>
          <div className="text-center"><p className="text-sm font-bold text-teal">{fmtNum(totPurchases)}</p><p className="text-[10px] text-muted">مشتريات</p></div>
          {canViewCost && <div className="text-center"><p className="text-sm font-bold text-amber-fg">{fmtUSD(campaign.cost_usd)}</p><p className="text-[10px] text-muted">التكلفة</p></div>}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 shrink-0 flex-wrap">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={'px-3 py-2 rounded-xl text-xs font-bold transition-colors ' + (tab === k ? 'bg-teal text-navy' : 'bg-surface-alt text-muted hover:text-text')}>
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {loading ? <p className="text-sm text-muted text-center py-6 animate-pulse">جاري التحميل…</p> : (
            <>
              {/* ── ADS TAB ── */}
              {tab === 'ads' && (
                <div className="space-y-2">
                  {canManage && (
                    <Button variant="teal" size="sm" className="w-full mb-2" onClick={() => setShowAddAd(true)}>➕ إضافة إعلان</Button>
                  )}
                  {ads.length === 0 ? <EmptyState description="لا توجد إعلانات بعد" /> : ads.map(ad => {
                    const agg = perAd[ad.id] || { messages: 0, purchases: 0 };
                    const conv = agg.messages > 0 ? Math.round((agg.purchases / agg.messages) * 100) : 0;
                    return (
                      <div key={ad.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                        <div className="w-12 h-12 rounded-xl bg-surface-alt flex items-center justify-center text-lg shrink-0 overflow-hidden">
                          {ad.ad_image_url ? <img src={ad.ad_image_url} alt={ad.ad_name} className="w-full h-full object-cover" /> : '🖼️'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-text truncate">{ad.ad_name}</p>
                          <p className="text-[11px] text-muted">💬 {fmtNum(agg.messages)} · 🛒 {fmtNum(agg.purchases)} · <span className="text-teal font-semibold">{conv}%</span></p>
                        </div>
                        {(isAssigned || canManage) && (
                          <a href="/daily-report" className="px-3 py-1.5 rounded-lg bg-teal/10 text-teal text-xs font-bold hover:bg-teal/20 transition shrink-0">📝 سجّل</a>
                        )}
                        {canManage && (
                          <>
                            <button onClick={() => setEditAd(ad)} title="تعديل" className="w-8 h-8 rounded-lg bg-surface-alt text-muted hover:text-text text-sm shrink-0">✏️</button>
                            <button onClick={() => deleteAd(ad)} title="حذف" className="w-8 h-8 rounded-lg bg-red-bg text-red-fg hover:bg-red/20 text-sm shrink-0">🗑️</button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── LOG TAB (recent entries) ── */}
              {tab === 'log' && (
                <div className="space-y-2">
                  {!isAssigned && !canManage && <p className="text-xs text-amber-fg bg-amber-bg border border-amber/30 rounded-xl px-3 py-2 mb-2">لست مكلّفاً بهذه الحملة.</p>}
                  {logs.length === 0 ? <EmptyState description="لا توجد تسجيلات بعد" /> : logs.slice(0, 50).map(l => {
                    const ad = ads.find(a => a.id === l.ad_id);
                    return (
                      <div key={l.id} className="p-3 rounded-xl border border-border">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-text">{ad?.ad_name || 'إعلان'}</span>
                          <span className="text-[10px] text-muted">{fmtDate(l.log_date)}</span>
                        </div>
                        <div className="flex gap-3 text-[11px] text-muted">
                          <span>💬 <b className="text-text">{fmtNum(l.messages)}</b></span>
                          <span>🛒 <b className="text-teal">{fmtNum(l.purchases)}</b></span>
                          {canManage && <span className="mr-auto">👤 {l.employee_name}</span>}
                        </div>
                        {l.note && <p className="text-[11px] text-muted mt-1 leading-relaxed">📌 {l.note}</p>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── PERFORMANCE + COMPLIANCE (managers) ── */}
              {tab === 'performance' && canManage && (
                <div className="space-y-4">
                  {/* Compliance */}
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs font-bold text-text mb-2">✅ التزام التسجيل اليوم ({loggedToday.size}/{assigned.length})</p>
                    {assigned.length === 0 ? <p className="text-[11px] text-muted">لم يُكلَّف أحد بعد — عدّل الحملة وأضف موظفين.</p> : (
                      <div className="flex flex-wrap gap-1.5">
                        {assigned.map(n => (
                          <span key={n} className={`text-[11px] px-2 py-1 rounded-full font-semibold ${loggedToday.has(n) ? 'bg-green-bg text-green-fg' : 'bg-red-bg text-red-fg'}`}>
                            {loggedToday.has(n) ? '✓' : '✕'} {n}
                          </span>
                        ))}
                      </div>
                    )}
                    {missingToday.length > 0 && <p className="text-[10px] text-amber-fg mt-2">⚠️ لم يسجّل اليوم: {missingToday.join('، ')}</p>}
                  </div>
                  {/* Per-ad performance */}
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs font-bold text-text mb-2">📊 أداء كل إعلان</p>
                    {ads.length === 0 ? <p className="text-[11px] text-muted">لا إعلانات.</p> : (
                      <div className="space-y-2">
                        {ads.map(ad => {
                          const a = perAd[ad.id] || { messages: 0, purchases: 0, entries: 0 };
                          const conv = a.messages > 0 ? Math.round((a.purchases / a.messages) * 100) : 0;
                          return (
                            <div key={ad.id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-text truncate flex-1">{ad.ad_name}</span>
                              <span className="text-muted shrink-0">💬{fmtNum(a.messages)} · 🛒{fmtNum(a.purchases)} · <b className="text-teal">{conv}%</b></span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AddAdModal open={showAddAd || !!editAd} campaign={campaign} editAd={editAd}
        onClose={() => { setShowAddAd(false); setEditAd(null); }}
        onSaved={() => { reload(); onChanged?.(); }} />
    </div>
  );
}

// ── Campaign Card ──────────────────────────────────────────────
function CampaignCard({ c, canViewCost, canManage, onSelect, onEdit, onDelete, onToggleActive }) {
  const disabled = c.is_active === false;
  return (
    <div className={'bg-surface border rounded-2xl p-4 cursor-pointer transition-colors ' + (disabled ? 'border-border opacity-60' : 'border-border hover:border-teal')} onClick={() => onSelect(c)}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="font-bold text-text text-sm truncate">{disabled && '🚫 '}{c.name}</p>
          <p className="text-xs text-muted mt-0.5">{c.team}{c.manager_name ? ` · 🎯 ${c.manager_name}` : ''}</p>
        </div>
        <StatusBadge status={c.status} />
      </div>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span>{c.channel_type === 'page' ? '📱' : '💬'} {c.channel_name || '—'}</span>
        <span className="mr-auto">{fmtDate(c.created_at)}</span>
      </div>
      <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-2 text-center">
        <div><p className="text-xs font-bold text-text">{fmtNum(c._ads)}</p><p className="text-[10px] text-muted">إعلانات</p></div>
        <div><p className="text-xs font-bold text-teal">{fmtNum(c._purchases)}</p><p className="text-[10px] text-muted">مشتريات</p></div>
        {canViewCost
          ? <div><p className="text-xs font-bold text-amber-fg">{fmtUSD(c.cost_usd)}</p><p className="text-[10px] text-muted">تكلفة</p></div>
          : <div><p className="text-xs font-bold text-text">{fmtNum(c._messages)}</p><p className="text-[10px] text-muted">رسائل</p></div>}
      </div>
      {(c._assignedCount > 0 || canManage) && (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-muted">
            👥 {fmtNum(c._assignedCount)} مكلّف
            {c._assignedCount > 0 && (
              <span className={c._loggedToday >= c._assignedCount ? 'text-green-600' : 'text-amber-fg'}> · ✅ {c._loggedToday}/{c._assignedCount} اليوم</span>
            )}
          </span>
          {canManage && (
            <span className="flex gap-3">
              <button onClick={e => { e.stopPropagation(); onEdit(c); }} className="text-[11px] text-teal font-semibold hover:underline">✏️ تعديل</button>
              <button onClick={e => { e.stopPropagation(); onToggleActive?.(c); }} className="text-[11px] text-muted font-semibold hover:underline">{disabled ? '♻️ تفعيل' : '🚫 تعطيل'}</button>
              <button onClick={e => { e.stopPropagation(); onDelete(c); }} className="text-[11px] text-red-fg font-semibold hover:underline">🗑️ حذف</button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Manager dashboard (overview across all campaigns) ──────────
function CampaignsDashboard({ campaigns, canViewCost }) {
  const active = campaigns.filter(c => c.status === 'active');
  const totMsg = campaigns.reduce((s, c) => s + c._messages, 0);
  const totBuy = campaigns.reduce((s, c) => s + c._purchases, 0);
  const totCost = campaigns.reduce((s, c) => s + (Number(c.cost_usd) || 0), 0);
  const conv = totMsg > 0 ? Math.round((totBuy / totMsg) * 100) : 0;
  const costPerBuy = totBuy > 0 ? totCost / totBuy : 0;
  const assignedTot = campaigns.reduce((s, c) => s + c._assignedCount, 0);
  const loggedTot   = campaigns.reduce((s, c) => s + c._loggedToday, 0);
  const topByBuy = [...campaigns].filter(c => c._purchases > 0).sort((a, b) => b._purchases - a._purchases).slice(0, 5);
  // Active campaigns where not everyone logged today
  const behind = active.filter(c => c._assignedCount > 0 && c._loggedToday < c._assignedCount);

  // تحليل الأداء حسب مدير الإعلانات (للرؤية/المتابعة — طلب المالك).
  const byManager = {};
  for (const c of campaigns) {
    if (!c.manager_name) continue;
    const m = (byManager[c.manager_name] ??= { manager: c.manager_name, count: 0, msg: 0, buy: 0, cost: 0 });
    m.count++; m.msg += c._messages; m.buy += c._purchases; m.cost += Number(c.cost_usd) || 0;
  }
  const managerRows = Object.values(byManager).sort((a, b) => b.buy - a.buy);

  const cell = (label, val, tone = 'text-text') => (
    <div className="bg-surface border border-border rounded-xl p-3 text-center">
      <p className={`text-lg font-black ${tone}`}>{val}</p>
      <p className="text-[10px] text-muted mt-0.5">{label}</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className={`grid grid-cols-2 ${canViewCost ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-2`}>
        {cell('رسائل', fmtNum(totMsg))}
        {cell('مشتريات', fmtNum(totBuy), 'text-teal')}
        {cell('نسبة التحويل', conv + '%', 'text-amber-fg')}
        {cell('التزام اليوم', `${loggedTot}/${assignedTot}`, loggedTot >= assignedTot && assignedTot > 0 ? 'text-green-600' : 'text-red-500')}
        {canViewCost && cell('تكلفة/شراء', costPerBuy > 0 ? fmtUSD(costPerBuy) : '—', 'text-amber-fg')}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {/* Top campaigns by purchases */}
        <div className="bg-surface border border-border rounded-2xl p-3">
          <p className="text-xs font-bold text-text mb-2">🏆 الأعلى مبيعات</p>
          {topByBuy.length === 0 ? <p className="text-[11px] text-muted">لا بيانات بعد.</p> : (
            <div className="space-y-1.5">
              {topByBuy.map((c, i) => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span className="text-text truncate flex-1">{i + 1}. {c.name}</span>
                  <span className="text-teal font-bold shrink-0">🛒 {fmtNum(c._purchases)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Compliance — campaigns behind on logging */}
        <div className="bg-surface border border-border rounded-2xl p-3">
          <p className="text-xs font-bold text-text mb-2">⚠️ متأخّرة بالتسجيل اليوم</p>
          {behind.length === 0 ? <p className="text-[11px] text-green-600">الكل ملتزم اليوم ✓</p> : (
            <div className="space-y-1.5">
              {behind.slice(0, 6).map(c => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span className="text-text truncate flex-1">{c.name}</span>
                  <span className="text-red-500 font-bold shrink-0">{c._loggedToday}/{c._assignedCount}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* تحليل حسب مدير الإعلانات */}
      {managerRows.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-3">
          <p className="text-xs font-bold text-text mb-2">🎯 الأداء حسب مدير الإعلانات</p>
          <div className="space-y-1.5">
            {managerRows.map(m => {
              const cv = m.msg > 0 ? Math.round((m.buy / m.msg) * 100) : 0;
              return (
                <div key={m.manager} className="flex items-center justify-between gap-2 text-xs border-b border-border/40 pb-1.5 last:border-0">
                  <span className="text-text font-semibold truncate flex-1">{m.manager} <span className="text-[10px] text-muted font-normal">· {m.count} حملة</span></span>
                  <span className="text-muted shrink-0">💬 {fmtNum(m.msg)}</span>
                  <span className="text-teal font-bold shrink-0">🛒 {fmtNum(m.buy)}</span>
                  <span className="text-amber-fg shrink-0">{cv}%</span>
                  {canViewCost && <span className="text-amber-fg shrink-0">{fmtUSD(m.cost)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────
export default function CampaignsScreen() {
  const { name: userName } = useAuth();
  const { can } = usePermissions();
  const canManage   = can(PERMISSIONS.MANAGE_CAMPAIGNS);
  const canViewCost = can(PERMISSIONS.VIEW_CAMPAIGN_COST);

  const [campaigns, setCampaigns] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [showDisabled, setShowDisabled] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editCampaign, setEditCampaign] = useState(null);
  const [selected, setSelected]   = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [showDashboard, setShowDashboard] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      // مصدر الأرقام = report_ad_results (النظام الفعلي) + daily_reports اليوم
      // للالتزام. (ad_daily_logs مهجور — التسجيل انتقل لشاشة «تقريري اليومي».)
      const [cmpRes, adsRes, rarRes, empRes, drRes] = await Promise.allSettled([
        supabase.from('campaigns').select('*').order('created_at', { ascending: false }),
        supabase.from('campaign_ads').select('id,campaign_id'),
        supabase.from('report_ad_results').select('campaign_id,messages,confirmations'),
        supabase.from('profiles').select('id,employee_name,team').eq('is_active', true).order('employee_name'),
        supabase.from('daily_reports').select('employee_name').eq('report_date', today),
      ]);

      let cmps = [];
      if (cmpRes.status === 'fulfilled' && !cmpRes.value.error) cmps = cmpRes.value.data || [];
      const ads  = (adsRes.status === 'fulfilled' && !adsRes.value.error) ? adsRes.value.data || [] : [];
      const rar  = (rarRes.status === 'fulfilled' && !rarRes.value.error) ? rarRes.value.data || [] : [];
      const reportedToday = new Set(((drRes.status === 'fulfilled' && !drRes.value.error) ? drRes.value.data || [] : []).map(r => r.employee_name));
      if (empRes.status === 'fulfilled' && !empRes.value.error) setEmployees(empRes.value.data || []);

      const adCount = {}; ads.forEach(a => { adCount[a.campaign_id] = (adCount[a.campaign_id] || 0) + 1; });
      const byId = {};
      rar.forEach(l => {
        if (!byId[l.campaign_id]) byId[l.campaign_id] = { messages: 0, purchases: 0 };
        byId[l.campaign_id].messages  += Number(l.messages)  || 0;
        byId[l.campaign_id].purchases += Number(l.confirmations) || 0;
      });

      let enriched = cmps.map(c => {
        // Map `campaigns` columns → the screen's internal shape.
        const assigned = Array.isArray(c.members) ? c.members : (Array.isArray(c.partners) ? c.partners : []);
        return {
          ...c,
          channel_type: c.channel_type_custom ?? c.channel_type ?? 'page',
          channel_name: c.channel_name_custom ?? c.channel_name ?? null,
          cost_usd:     c.budget_usd ?? 0,
          assigned_to:  assigned,
          _ads: adCount[c.id] || 0,
          _messages:  byId[c.id]?.messages  || 0,
          _purchases: byId[c.id]?.purchases || 0,
          _assignedCount: assigned.length,
          _loggedToday: assigned.filter(n => reportedToday.has(n)).length,
        };
      });

      // أخفِ الحملات المعطّلة افتراضياً (تظهر بفلتر «المعطّلة»).
      if (!showDisabled) enriched = enriched.filter(c => c.is_active !== false);

      // Employees only see campaigns they're assigned to
      if (!canManage) enriched = enriched.filter(c => (c.assigned_to || []).includes(userName));

      setCampaigns(enriched);
    } catch (e) {
      setError(e?.message || 'تعذّر تحميل البيانات');
    } finally { setLoading(false); }
  }, [canManage, userName, showDisabled]);

  useEffect(() => { load(); }, [load]);

  // حملة لها تاريخ مبيعات (report_ad_results، FK=RESTRICT) → تعطيل ناعم يحفظ
  // التاريخ. حملة فارغة (خطأ) → حذف نهائي مع تنظيف الأبناء.
  const deleteCampaign = async (c) => {
    const { count } = await supabase.from('report_ad_results')
      .select('id', { count: 'exact', head: true }).eq('campaign_id', c.id);
    if (count && count > 0) {
      if (!window.confirm(`«${c.name}» لها ${count} تسجيل مبيعات — لا تُحذف (نحفظ التاريخ). تعطيلها وإخفاؤها؟`)) return;
      const { error } = await supabase.from('campaigns').update({ is_active: false }).eq('id', c.id);
      if (error) { alert('فشل التعطيل: ' + error.message); return; }
      load(); return;
    }
    if (!window.confirm(`حذف حملة "${c.name}" نهائياً مع إعلاناتها؟ (لا يوجد لها تسجيلات مبيعات)`)) return;
    await supabase.from('report_ad_results').delete().eq('campaign_id', c.id).then(() => {}, () => {});
    await supabase.from('campaign_ads').delete().eq('campaign_id', c.id).then(() => {}, () => {});
    await supabase.from('ad_daily_logs').delete().eq('campaign_id', c.id).then(() => {}, () => {});
    await supabase.from('daily_reports').update({ campaign1_id: null }).eq('campaign1_id', c.id).then(() => {}, () => {});
    await supabase.from('daily_reports').update({ campaign2_id: null }).eq('campaign2_id', c.id).then(() => {}, () => {});
    const { error } = await supabase.from('campaigns').delete().eq('id', c.id);
    if (error) {
      await supabase.from('campaigns').update({ is_active: false }).eq('id', c.id);
      alert('تعذّر الحذف النهائي — عُطّلت الحملة بدلاً منه. (' + error.message + ')');
    }
    load();
  };

  // تعطيل / إعادة تفعيل حملة (للمدراء) — is_active هو آلية الإخفاء
  // (status محكوم بـCHECK active/paused/ended، فلا نلمسه هنا).
  const toggleCampaignActive = async (c) => {
    const { error } = await supabase.from('campaigns')
      .update({ is_active: c.is_active === false }).eq('id', c.id);
    if (error) { alert('فشل: ' + error.message); return; }
    load();
  };

  const filtered = filterStatus === 'all' ? campaigns : campaigns.filter(c => c.status === filterStatus);
  const activeCnt = campaigns.filter(c => c.status === 'active').length;
  const totPurchases = campaigns.reduce((s, c) => s + c._purchases, 0);
  const totCost = campaigns.reduce((s, c) => s + (Number(c.cost_usd) || 0), 0);

  return (
    <div className="space-y-5">
      <Hero
        eyebrow="الحملات الإعلانية"
        title={canManage ? 'إدارة ومتابعة الحملات' : 'حملاتي'}
        subtitle={canManage ? 'أنشئ الحملات والإعلانات، أسند الموظفين، وتابع الأداء والالتزام.' : 'سجّل أداء الإعلانات المكلّف بها يومياً عبر «تقريري اليومي».'}
        actions={canManage
          ? <Button variant="teal" size="lg" onClick={() => { setEditCampaign(null); setShowCreate(true); }}>+ حملة جديدة</Button>
          : <a href="/daily-report" className="px-4 py-2 rounded-xl bg-white/15 text-white text-sm font-bold border border-white/20 hover:bg-white/25 transition">🧾 تقريري اليومي</a>}
      />

      {/* Manager dashboard */}
      {canManage && (
        <div className="space-y-2">
          <button onClick={() => setShowDashboard(v => !v)}
            className="flex items-center gap-2 text-sm font-bold text-text hover:text-teal transition">
            📊 لوحة الأداء {showDashboard ? '▲' : '▼'}
          </button>
          {showDashboard && !loading && <CampaignsDashboard campaigns={campaigns} canViewCost={canViewCost} />}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="الحملات" value={loading ? '—' : campaigns.length} tone="blue" />
        <StatCard label="مفعّلة" value={loading ? '—' : activeCnt} tone="green" />
        <StatCard label="إجمالي المشتريات" value={loading ? '—' : fmtNum(totPurchases)} tone="teal" />
        {canViewCost
          ? <StatCard label="إجمالي التكلفة" value={loading ? '—' : fmtUSD(totCost)} tone="amber" />
          : <StatCard label="إجمالي الرسائل" value={loading ? '—' : fmtNum(campaigns.reduce((s, c) => s + c._messages, 0))} tone="amber" />}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[['all','الكل'],['active','🟢 مفعّلة'],['paused','⏸️ متوقفة'],['ended','🏁 منتهية']].map(([k, label]) => (
          <button key={k} onClick={() => setFilterStatus(k)}
            className={'px-4 py-2 rounded-xl text-xs font-bold transition-colors ' + (filterStatus === k ? 'bg-teal text-navy' : 'bg-surface border border-border text-muted hover:text-text')}>
            {label}
          </button>
        ))}
        {canManage && (
          <button onClick={() => setShowDisabled(v => !v)}
            className={'px-4 py-2 rounded-xl text-xs font-bold transition-colors ms-auto ' + (showDisabled ? 'bg-red-fg text-white' : 'bg-surface border border-border text-muted hover:text-text')}>
            🚫 إظهار المعطّلة {showDisabled ? '✓' : ''}
          </button>
        )}
      </div>

      <Card>
        <CardTitle>{canManage ? 'قائمة الحملات' : 'الحملات المكلّف بها'}</CardTitle>
        <CardSubtitle>اضغط على الحملة لرؤية الإعلانات والتسجيل اليومي</CardSubtitle>
        <div className="mt-4">
          {loading ? <p className="text-sm text-muted animate-pulse py-4">جاري التحميل…</p>
            : error ? <p className="text-sm text-red-500 py-2">⚠️ {error}</p>
            : filtered.length === 0 ? <EmptyState description={canManage ? 'لا توجد حملات بعد — أنشئ أول حملة' : 'لا توجد حملات مكلّف بها حالياً'} />
            : (
              <div className="grid sm:grid-cols-2 gap-3">
                {filtered.map(c => (
                  <CampaignCard key={c.id} c={c} canViewCost={canViewCost} canManage={canManage}
                    onSelect={setSelected} onEdit={(cc) => { setEditCampaign(cc); setShowCreate(true); }}
                    onDelete={deleteCampaign} onToggleActive={toggleCampaignActive} />
                ))}
              </div>
            )}
        </div>
      </Card>

      {canManage && (
        <CampaignModal
          open={showCreate} onClose={() => { setShowCreate(false); setEditCampaign(null); }}
          onSaved={load} employees={employees} canViewCost={canViewCost} editCampaign={editCampaign} userName={userName}
        />
      )}
      {selected && (
        <CampaignDetail
          campaign={selected} userName={userName} canManage={canManage} canViewCost={canViewCost}
          onClose={() => setSelected(null)} onChanged={load}
        />
      )}
    </div>
  );
}
