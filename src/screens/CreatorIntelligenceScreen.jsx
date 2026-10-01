// =============================================================
// CreatorIntelligenceScreen — «صناع المحتوى»
// قاعدة بيانات مؤثرين/UGC/بلوجرز (المرحلة 1: سوريا، الـschema متعدد الأسواق).
// قاعدة ذهبية: المجهول يظهر «غير معروف» — لا تخمين. كل رقم له مصدر بتاب «الأدلة».
// Tables: creator_* · Permission: VIEW_CREATOR_INTELLIGENCE (+MANAGE_*)
// =============================================================
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '@routes/paths';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { PERMISSIONS as P } from '@data/permissions';
import {
  listCreators, getCreatorDetail, listBenchmarks, estimateForCreator, latestQuoted, rateDisplay,
  listCampaigns, createCampaign, addCampaignMembers, listCampaignMembers, updateMemberOutreach,
  addQuotedRate, planImport, commitImport,
  applyFilters, tierOf, tierKey, TIERS, freshness, SAVED_FILTER_PRESETS, selectForCampaign,
  distributeAssignments, toCsv, parseCsv, coverageMatrix, growthStatus, CAMPAIGN_STATUSES,
  SOURCE_PROVIDERS, CREATOR_TYPES, SYRIA_CITIES, MARKETS,
} from '@services/creatorIntelligenceService';

const L = {
  types: { ugc: 'UGC', nano: 'Nano', micro: 'Micro', mid: 'Mid-tier', macro: 'Macro', celebrity: 'Celebrity', blogger: 'Blogger', publisher: 'Publisher/Media', reviewer: 'Reviewer', beauty_creator: 'Beauty Creator', expert: 'Expert', local_page: 'Local Page', other: 'أخرى' },
  cats: { skincare: 'عناية بالبشرة', beauty: 'جمال', makeup: 'مكياج', hair: 'شعر', fashion: 'أزياء', lifestyle: 'لايف ستايل', women: 'نساء', men: 'رجال', motherhood: 'أمومة', wellness: 'صحة', fitness: 'لياقة', entertainment: 'ترفيه', comedy: 'كوميدي', food: 'طعام', local: 'محلي', shopping: 'تسوق/عروض', reviews: 'مراجعات', unboxing: 'أنبوكسينغ', educational: 'تعليمي', expert: 'خبراء', other: 'أخرى' },
  cities: { damascus: 'دمشق', rif_dimashq: 'ريف دمشق', aleppo: 'حلب', homs: 'حمص', hama: 'حماة', latakia: 'اللاذقية', tartus: 'طرطوس', daraa: 'درعا', sweida: 'السويداء', idlib: 'إدلب', deir_ez_zor: 'دير الزور', raqqa: 'الرقة', hasakah: 'الحسكة', quneitra: 'القنيطرة', other: 'أخرى', unknown: 'غير معروف' },
  level: { high: 'مرتفع', medium: 'متوسط', low: 'منخفض', unknown: 'غير معروف' },
  yn: { yes: 'نعم', no: 'لا', unknown: 'غير معروف' },
  fresh: { fresh: 'حديث', aged: 'متوسط', stale: 'قديم', unknown: 'غير معروف' },
  status: { discovered: 'مكتشف', qualified: 'مؤهَّل', do_not_contact: 'لا تتواصل', rejected: 'مرفوض' },
  camp: { selected: 'مختار', assigned: 'موزَّع', contact_pending: 'بانتظار التواصل', contacted: 'تم التواصل', replied: 'ردّ', interested: 'مهتم', not_interested: 'غير مهتم', address_requested: 'طُلب العنوان', product_sent: 'أُرسل المنتج', received: 'استلم', content_pending: 'بانتظار المحتوى', content_received: 'وصل المحتوى', posted: 'نُشر', no_response: 'بلا رد', rejected: 'مرفوض', do_not_contact: 'لا تتواصل' },
  contact: { instagram_dm: 'DM انستغرام', tiktok_dm: 'DM تيك توك', facebook_messenger: 'ماسنجر', email: 'إيميل', whatsapp: 'واتساب', phone: 'هاتف', website: 'موقع', management: 'إدارة أعمال', agency: 'وكالة' },
  platform: { instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube', snapchat: 'Snapchat', other: 'أخرى' },
  activity: { active_30d: 'نشط ≤30 يوم', active_90d: 'نشط ≤90 يوم', inactive_90d: 'غير نشط 90+ يوم', unknown: 'النشاط غير معروف' },
  paid: { known_paid: 'يتعاون بمقابل (مثبت)', likely_commercial: 'مؤشرات تجارية', unknown: 'غير معروف' },
};
const lab = (map, k, fallback = 'غير معروف') => (k === null || k === undefined || k === '' ? fallback : (map[k] || k));
const fmtN = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en'));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtPct = (n) => (n === null || n === undefined ? 'غير معروف' : `${Number(n).toFixed(1)}%`);
const FRESH_COLOR = { fresh: 'text-green-700 bg-green-50 border-green-200', aged: 'text-amber-700 bg-amber-50 border-amber-200', stale: 'text-red-600 bg-red-50 border-red-200', unknown: 'text-muted bg-surface-alt border-border' };
const LEVEL_COLOR = { A: 'text-green-700 bg-green-50 border-green-200', B: 'text-blue-700 bg-blue-50 border-blue-200', C: 'text-amber-700 bg-amber-50 border-amber-200', Unknown: 'text-muted bg-surface-alt border-border' };

const Pill = ({ children, cls = 'text-muted bg-surface-alt border-border' }) => (
  <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{children}</span>
);
const Chip = ({ active, onClick, children }) => (
  <button type="button" onClick={onClick}
    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border whitespace-nowrap ${active ? 'bg-navy text-white border-navy' : 'bg-surface text-text border-border'}`}>{children}</button>
);
const Stat = ({ label, value, sub }) => (
  <div className="bg-surface border border-border rounded-xl px-3 py-2 text-center min-w-[92px]">
    <p className="text-lg font-extrabold text-text">{value}</p>
    <p className="text-[10px] font-bold text-muted">{label}</p>
    {sub && <p className="text-[9px] text-muted">{sub}</p>}
  </div>
);

function MultiChips({ options, value, onChange, render }) {
  const set = new Set(value || []);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <Chip key={o} active={set.has(o)} onClick={() => { const n = new Set(set); n.has(o) ? n.delete(o) : n.add(o); onChange([...n]); }}>{render ? render(o) : o}</Chip>
      ))}
    </div>
  );
}

// ---------------- Filters ----------------
function FilterPanel({ filter, setFilter, assignees, campaigns, categories }) {
  const [open, setOpen] = useState(false);
  const set = (k, v) => setFilter(f => ({ ...f, [k]: v }));
  const num = (k) => (e) => set(k, e.target.value === '' ? null : Number(e.target.value));
  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <input value={filter.q || ''} onChange={e => set('q', e.target.value)} placeholder="🔍 اسم / @handle" dir="rtl"
          className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-sm" />
        <Chip active={open} onClick={() => setOpen(o => !o)}>فلاتر ▾</Chip>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {SAVED_FILTER_PRESETS.map(p => <Chip key={p.id} onClick={() => setFilter(p.filter)}>{p.label}</Chip>)}
        <Chip onClick={() => setFilter({ market: 'syria' })}>مسح</Chip>
      </div>
      {open && (
        <div className="bg-surface border border-border rounded-2xl p-3 space-y-3 text-xs">
          <div><p className="font-bold mb-1">السوق</p>
            <MultiChips options={MARKETS} value={filter.market ? [filter.market] : []} onChange={v => set('market', v[v.length - 1] || null)} /></div>
          <div><p className="font-bold mb-1">المنصة</p>
            <MultiChips options={['instagram', 'tiktok', 'facebook', 'youtube']} value={filter.platform} onChange={v => set('platform', v)} render={o => lab(L.platform, o)} /></div>
          <div><p className="font-bold mb-1">النوع</p>
            <MultiChips options={CREATOR_TYPES} value={filter.creator_type} onChange={v => set('creator_type', v)} render={o => lab(L.types, o)} /></div>
          <div><p className="font-bold mb-1">شريحة المتابعين</p>
            <MultiChips options={[...TIERS.map(t => t.key), 'unknown']} value={filter.tier} onChange={v => set('tier', v)} render={o => TIERS.find(t => t.key === o)?.label || 'غير معروف'} /></div>
          <div><p className="font-bold mb-1">الفئة</p>
            <MultiChips options={categories} value={filter.category} onChange={v => set('category', v)} render={o => lab(L.cats, o)} /></div>
          <div><p className="font-bold mb-1">المدينة</p>
            <MultiChips options={SYRIA_CITIES} value={filter.city} onChange={v => set('city', v)} render={o => lab(L.cities, o)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <label>UGC<div className="mt-1"><MultiChips options={['high', 'medium', 'low', 'unknown']} value={filter.ugc_potential} onChange={v => set('ugc_potential', v)} render={o => lab(L.level, o)} /></div></label>
            <label>PR<div className="mt-1"><MultiChips options={['high', 'medium', 'low', 'unknown']} value={filter.pr_fit} onChange={v => set('pr_fit', v)} render={o => lab(L.level, o)} /></div></label>
          </div>
          <div><p className="font-bold mb-1">Paid</p>
            <MultiChips options={['yes', 'no', 'unknown']} value={filter.paid_collaboration ? [filter.paid_collaboration] : []} onChange={v => set('paid_collaboration', v[v.length - 1] || null)} render={o => lab(L.yn, o)} /></div>
          <div><p className="font-bold mb-1">مستوى التحقق</p>
            <MultiChips options={['A', 'B', 'C', 'Unknown']} value={filter.verification_level} onChange={v => set('verification_level', v)} /></div>
          <div><p className="font-bold mb-1">حداثة التحقق</p>
            <MultiChips options={['fresh', 'aged', 'stale', 'unknown']} value={filter.freshness} onChange={v => set('freshness', v)} render={o => lab(L.fresh, o)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <label>جمهور سوريا ≥ %<input type="number" min="0" max="100" value={filter.minAudienceSyria ?? ''} onChange={num('minAudienceSyria')} className="w-full mt-1 bg-surface-alt border border-border rounded-lg px-2 py-1" /></label>
            <label>Engagement ≥ %<input type="number" min="0" value={filter.minEngagement ?? ''} onChange={num('minEngagement')} className="w-full mt-1 bg-surface-alt border border-border rounded-lg px-2 py-1" /></label>
            <label>متوسط المشاهدات ≥<input type="number" min="0" value={filter.minAvgViews ?? ''} onChange={num('minAvgViews')} className="w-full mt-1 bg-surface-alt border border-border rounded-lg px-2 py-1" /></label>
            <label>قابلية التواصل ≥<input type="number" min="0" max="100" value={filter.minContactability ?? ''} onChange={num('minContactability')} className="w-full mt-1 bg-surface-alt border border-border rounded-lg px-2 py-1" /></label>
            <label>نشط آخر (يوم)<input type="number" min="1" value={filter.recentlyActiveDays ?? ''} onChange={num('recentlyActiveDays')} className="w-full mt-1 bg-surface-alt border border-border rounded-lg px-2 py-1" /></label>
            <label>موزَّع على
              <select value={filter.assigned_to || ''} onChange={e => set('assigned_to', e.target.value || null)} className="w-full mt-1 bg-surface-alt border border-border rounded-lg px-2 py-1">
                <option value="">الكل</option>{assignees.map(a => <option key={a} value={a}>{a}</option>)}
              </select></label>
          </div>
          {campaigns.length > 0 && (
            <label>الحملة
              <select value={filter.campaign_id || ''} onChange={e => set('campaign_id', e.target.value || null)} className="w-full mt-1 bg-surface-alt border border-border rounded-lg px-2 py-1">
                <option value="">الكل</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------- Card ----------------
function CreatorCard({ c, benchmark, onOpen, selected, onToggle }) {
  const tier = tierOf(c.follower_count);
  const fr = freshness(c.last_verified_at);
  const est = benchmark ? estimateForCreator(c, benchmark) : null;
  const p = [...c.platforms].sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1))[0];
  return (
    <div className="bg-surface border border-border rounded-2xl p-3 space-y-2" dir="rtl">
      <div className="flex gap-3 items-start">
        {onToggle && <input type="checkbox" checked={!!selected} onChange={() => onToggle(c.id)} className="mt-1" />}
        <button type="button" onClick={() => onOpen(c)} className="flex gap-3 items-start text-right flex-1 min-w-0">
          {c.profile_image
            ? <img src={c.profile_image} alt="" className="w-11 h-11 rounded-full object-cover bg-surface-alt" loading="lazy" />
            : <div className="w-11 h-11 rounded-full bg-surface-alt flex items-center justify-center text-lg">🎥</div>}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-text truncate">{c.display_name}</p>
            <p className="text-[11px] text-muted truncate" dir="ltr">{p ? `${lab(L.platform, p.platform)} · @${p.handle}` : 'بلا منصة'}{c.platforms.length > 1 ? ` +${c.platforms.length - 1}` : ''}</p>
          </div>
        </button>
        <div className="text-left shrink-0">
          <p className="text-sm font-extrabold text-text" dir="ltr">{fmtN(c.follower_count)}</p>
          <p className="text-[10px] text-muted">{tier?.label || 'غير معروف'}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        <Pill>{lab(L.cats, c.main_category)}</Pill>
        <Pill>{lab(L.cities, c.city)}</Pill>
        <Pill cls={LEVEL_COLOR[c.verification_level || 'Unknown']}>تحقق {c.verification_level || 'Unknown'}</Pill>
        <Pill cls={FRESH_COLOR[fr]}>{lab(L.fresh, fr)}</Pill>
        {c.growth_status === 'rising' && <Pill cls="text-green-700 bg-green-50 border-green-200">RISING</Pill>}
        {c.needs_manual_review && <Pill cls="text-amber-700 bg-amber-50 border-amber-200">مراجعة يدوية</Pill>}
        <Pill cls={c.activity_status === 'active_30d' || c.activity_status === 'active_90d' ? 'text-green-700 bg-green-50 border-green-200' : c.activity_status === 'inactive_90d' ? 'text-red-600 bg-red-50 border-red-200' : 'text-muted bg-surface-alt border-border'}>{lab(L.activity, c.activity_status, L.activity.unknown)}</Pill>
        {c.data_quality_score !== null && c.data_quality_score !== undefined && <Pill>جودة البيانات {c.data_quality_score}</Pill>}
      </div>
      <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
        <div><p className="font-extrabold text-text">{fmtPct(c.audience_syria_pct)}</p><p className="text-muted">جمهور سوريا</p></div>
        <div><p className="font-extrabold text-text">{c.engagement_rate === null ? '—' : `${c.engagement_rate}%`}</p><p className="text-muted">Engagement</p></div>
        <div><p className="font-extrabold text-text">{fmtN(c.average_views)}</p><p className="text-muted">متوسط مشاهدات</p></div>
        <div><p className="font-extrabold text-text">{c.creator_priority_score ?? '—'}</p><p className="text-muted">Score</p></div>
      </div>
      <div className="flex flex-wrap gap-1 text-[10px]">
        <Pill>PR: {lab(L.level, c.pr_fit)}</Pill>
        <Pill>UGC: {lab(L.level, c.ugc_potential)}</Pill>
        <Pill>Paid: {lab(L.yn, c.paid_collaboration)}</Pill>
        <Pill>تواصل: {c.contacts.length ? c.contactability_score : 'غير معروف'}</Pill>
        {est && <Pill cls="text-purple-700 bg-purple-50 border-purple-200">Estimated {est.estimated_low}–{est.estimated_high} {est.currency} · benchmark {est.basis.benchmark_scope} · {est.confidence}</Pill>}
      </div>
      <p className="text-[10px] text-muted">آخر تحقق: {fmtDate(c.last_verified_at)}{c.assigned_to ? ` · ${c.assigned_to}` : ''}</p>
    </div>
  );
}

// ---------------- Detail ----------------
const DETAIL_TABS = ['profile', 'platforms', 'audience', 'content', 'commercial', 'contact', 'evidence', 'outreach', 'campaigns', 'notes'];
const DETAIL_LABEL = { profile: 'الملف', platforms: 'المنصات', audience: 'الجمهور', content: 'المحتوى', commercial: 'تجاري', contact: 'التواصل', evidence: 'الأدلة', outreach: 'المتابعة', campaigns: 'الحملات', notes: 'ملاحظات' };
const Row = ({ k, v }) => (<div className="flex justify-between gap-3 py-1 border-b border-border/60 text-xs"><span className="text-muted">{k}</span><span className="font-bold text-text text-left" dir="auto">{v ?? 'غير معروف'}</span></div>);

function DetailModal({ c, benchmark, canManage, onClose, onChanged, by }) {
  const [tab, setTab] = useState('profile');
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [quote, setQuote] = useState({ amount: '', currency: 'USD', source: '', date: new Date().toISOString().slice(0, 10), platform: '', format: '' });
  useEffect(() => { getCreatorDetail(c.id).then(setD).catch(e => setErr(e.message)); }, [c.id]);
  const est = benchmark ? estimateForCreator(c, benchmark) : null;
  const rd = rateDisplay(latestQuoted(d?.rates), est);
  const growth = growthStatus(d?.snapshots || []);
  const audBy = (dim) => (d?.audience || []).filter(a => a.dimension === dim).sort((a, b) => b.pct - a.pct);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" dir="rtl" onClick={onClose}>
      <div className="bg-cream w-full sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div><h2 className="text-base font-extrabold text-text">{c.display_name}</h2>
            <p className="text-[11px] text-muted">{lab(L.types, c.creator_type)} · {lab(L.cities, c.city)}</p></div>
          <button onClick={onClose} className="text-muted text-lg">✕</button>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">{DETAIL_TABS.map(t => <Chip key={t} active={tab === t} onClick={() => setTab(t)}>{DETAIL_LABEL[t]}</Chip>)}</div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        {tab === 'profile' && <div>
          <Row k="السوق" v={c.market} /><Row k="الفئة الرئيسية" v={lab(L.cats, c.main_category)} />
          <Row k="فئات فرعية" v={c.subcategories?.length ? c.subcategories.map(x => lab(L.cats, x)).join('، ') : null} />
          <Row k="الجنس" v={c.gender} /><Row k="بلد صانع المحتوى" v={c.creator_country} /><Row k="مدينة صانع المحتوى" v={lab(L.cities, c.city)} />
          <Row k="نبذة" v={c.bio} /><Row k="الموقع" v={c.website} />
          <Row k="مستوى التحقق" v={c.verification_level || 'Unknown'} /><Row k="عدد المصادر" v={c.source_count} />
          <Row k="لماذا هذا المبدع" v={c.why_text} /><Row k="جودة البيانات (ليست جودة المبدع)" v={c.data_quality_score} />
          <Row k="النشاط" v={`${lab(L.activity, c.activity_status, L.activity.unknown)}${c.days_since_last_post != null ? ' · آخر نشر قبل ' + c.days_since_last_post + ' يوم' : ''}`} /><Row k="أساس تقييم النشاط" v={c.activity_basis} />
          <Row k="ثقة البيانات" v={c.data_confidence} /><Row k="آخر تحقق" v={fmtDate(c.last_verified_at)} />
          <Row k="النمو" v={growth.growth_status === 'unknown' ? 'غير معروف (لا تاريخ كافٍ)' : `${growth.growth_status} (${growth.growth_rate}%)`} />
        </div>}
        {tab === 'platforms' && <div className="space-y-2">{c.platforms.length === 0 && <p className="text-xs text-muted">لا منصات.</p>}
          {c.platforms.map(p => (<div key={p.id} className="bg-surface border border-border rounded-xl p-2">
            <a href={p.profile_url} target="_blank" rel="noreferrer" className="text-xs font-extrabold text-blue-600" dir="ltr">{lab(L.platform, p.platform)} @{p.handle}</a>
            <Row k="متابعون" v={fmtN(p.followers)} /><Row k="متوسط مشاهدات" v={fmtN(p.avg_views)} /><Row k="وسيط المشاهدات" v={fmtN(p.median_views)} />
            <Row k="Engagement" v={p.engagement_rate === null ? null : `${p.engagement_rate}%`} /><Row k="آخر منشور" v={fmtDate(p.last_post_at)} />
            <Row k="توثيق" v={p.verification_badge === null ? null : p.verification_badge ? 'نعم' : 'لا'} /><Row k="حالة الحساب" v={p.platform_status} />
          </div>))}</div>}
        {tab === 'audience' && <div>
          <Row k="جمهور سوريا" v={fmtPct(c.audience_syria_pct)} />
          {['country', 'city', 'gender', 'age_range', 'language'].map(dim => audBy(dim).length > 0 && (
            <div key={dim} className="mt-2"><p className="text-[11px] font-extrabold text-text">{dim}</p>
              {audBy(dim).map(a => <Row key={a.id} k={`${a.key} · ${fmtDate(a.observed_at)} · ${a.confidence || '—'}`} v={`${a.pct}%`} />)}</div>))}
          {d && (d.audience || []).length === 0 && <p className="text-xs text-muted mt-2">لا بيانات جمهور موثَّقة — تُترك فارغة إلى أن يوجد مصدر.</p>}
        </div>}
        {tab === 'content' && <div>
          <Row k="صيغ المحتوى" v={c.content_formats?.join('، ') || null} /><Row k="Tags" v={c.tags?.length ? `${c.tags.join('، ')} (${c.tags_origin || 'origin غير معروف'})` : null} />
          <Row k="UGC" v={lab(L.level, c.ugc_potential)} /><Row k="سبب UGC" v={c.ugc_reason || c.ugc_fit_reason} /><Row k="نوع دليل UGC" v={c.ugc_evidence_type} /><Row k="رابط دليل UGC" v={c.ugc_evidence_url ? <a href={c.ugc_evidence_url} target="_blank" rel="noreferrer" className="text-blue-600">فتح</a> : null} /><Row k="PR" v={lab(L.level, c.pr_fit)} />
          <p className="text-[11px] font-extrabold mt-2">تعاونات سابقة (موثَّقة)</p>
          {(d?.collabs || []).map(x => <Row key={x.id} k={`${x.brand}${x.is_competitor ? ' ⚠️ منافس' : ''} · ${x.content_type || ''} · ${fmtDate(x.content_date)}`} v={<a href={x.source_url} target="_blank" rel="noreferrer" className="text-blue-600">مصدر</a>} />)}
          {d && !d.collabs?.length && <p className="text-xs text-muted">لا تعاونات موثَّقة.</p>}
        </div>}
        {tab === 'commercial' && <div>
          <Row k="يقبل هدايا" v={lab(L.yn, c.accepts_gifting)} /><Row k="يقبل تبادل منتجات" v={lab(L.yn, c.accepts_product_exchange)} /><Row k="Paid" v={lab(L.yn, c.paid_collaboration)} />
          <Row k="حالة التعاون المدفوع" v={`${lab(L.paid, c.paid_status, L.paid.unknown)}${c.paid_basis ? ' — ' + c.paid_basis : ''}`} />
          <Row k="أنماط التعاون" v={c.collab_modes?.join('، ') || null} />
          <div className="mt-2 bg-surface border border-border rounded-xl p-2 space-y-1">
            <p className="text-[11px] font-extrabold">السعر المؤكَّد (Quoted)</p>
            {rd.quoted ? <p className="text-sm font-extrabold">{rd.quoted.amount} {rd.quoted.currency} <span className="text-[10px] text-muted">({rd.quoted.source} · {rd.quoted.date})</span></p> : <p className="text-xs text-muted">لا يوجد سعر مؤكَّد</p>}
            <p className="text-[11px] font-extrabold pt-1">تقدير (Estimated)</p>
            {rd.estimated ? <div><p className="text-sm font-extrabold text-purple-700">Estimated: {rd.estimated.estimated_low}–{rd.estimated.estimated_high} {rd.estimated.currency}</p>
              <p className="text-[10px] text-muted">ثقة: {rd.estimated.confidence} · الأساس: {rd.estimated.basis.benchmark_source} ({rd.estimated.basis.benchmark_date}) نطاق {rd.estimated.basis.benchmark_scope} · شريحة {rd.estimated.basis.tier}</p></div>
              : <p className="text-xs text-muted">غير معروف — لا benchmark أو لا بيانات كافية.</p>}
          </div>
          {canManage && <div className="mt-2 bg-surface border border-border rounded-xl p-2 space-y-1">
            <p className="text-[11px] font-extrabold">تسجيل سعر مؤكَّد</p>
            <div className="grid grid-cols-2 gap-1">
              <input placeholder="المبلغ" value={quote.amount} onChange={e => setQuote({ ...quote, amount: e.target.value })} className="bg-surface-alt border border-border rounded-lg px-2 py-1 text-xs" dir="ltr" />
              <input placeholder="العملة" value={quote.currency} onChange={e => setQuote({ ...quote, currency: e.target.value })} className="bg-surface-alt border border-border rounded-lg px-2 py-1 text-xs" dir="ltr" />
              <input placeholder="المصدر (ردّ مباشر / rate card)" value={quote.source} onChange={e => setQuote({ ...quote, source: e.target.value })} className="col-span-2 bg-surface-alt border border-border rounded-lg px-2 py-1 text-xs" />
              <input type="date" value={quote.date} onChange={e => setQuote({ ...quote, date: e.target.value })} className="bg-surface-alt border border-border rounded-lg px-2 py-1 text-xs" />
            </div>
            <button className="text-xs font-bold bg-navy text-white rounded-lg px-3 py-1" onClick={async () => { try { await addQuotedRate(c.id, quote); setD(await getCreatorDetail(c.id)); } catch (e) { setErr(e.message); } }}>حفظ</button>
          </div>}
        </div>}
        {tab === 'contact' && <div>{c.contacts.length === 0 && <p className="text-xs text-muted">لا وسائل تواصل عامة موثَّقة.</p>}
          {c.contacts.map(x => <Row key={x.id} k={`${lab(L.contact, x.type)} · تحقق ${fmtDate(x.verified_at)}`} v={<span dir="ltr">{x.value || '✓ (عام)'} <a href={x.source_url} target="_blank" rel="noreferrer" className="text-blue-600 mx-1">مصدر</a></span>} />)}
          <Row k="Contactability (منفصل عن التأثير)" v={c.contacts.length ? c.contactability_score : null} /></div>}
        {tab === 'evidence' && <div className="space-y-2">
          {(d?.sources || []).map(s => (<div key={s.id} className="bg-surface border border-border rounded-xl p-2 text-xs space-y-0.5">
            <p className="font-extrabold">{s.field}{s.value_text ? `: ${s.value_text}` : ''}</p>
            <p className="text-muted">المصدر: {s.provider} ({s.source_type}) · ثقة {s.confidence}</p>
            <p className="text-muted">Observed {fmtDate(s.observed_at)} · Verified {fmtDate(s.verified_at)}</p>
            <a href={s.source_url} target="_blank" rel="noreferrer" className="text-blue-600 break-all" dir="ltr">{s.source_url}</a>
            {s.evidence && <p>{s.evidence}</p>}
          </div>))}
          {d && !d.sources?.length && <p className="text-xs text-muted">لا أدلة مسجَّلة — سجل بلا مصدر لا يُعتمد.</p>}</div>}
        {tab === 'outreach' && <div>
          <Row k="موزَّع على" v={c.assigned_to} /><Row k="الحالة" v={lab(L.status, c.creator_status)} />
          {(d?.memberships || []).map(m => <Row key={m.id} k={`${m.creator_campaigns?.name || m.campaign_id}`} v={`${lab(L.camp, m.campaign_status)} · تواصل ${m.contact_count}× · آخر ${fmtDate(m.last_contacted_at)}`} />)}</div>}
        {tab === 'campaigns' && <div>{(d?.memberships || []).map(m => <Row key={m.id} k={m.creator_campaigns?.name || m.campaign_id} v={`${lab(L.camp, m.campaign_status)}${m.outcome ? ' · ' + m.outcome : ''}`} />)}
          {d && !d.memberships?.length && <p className="text-xs text-muted">لم يدخل أي حملة.</p>}</div>}
        {tab === 'notes' && <div><p className="text-xs whitespace-pre-wrap">{c.notes || 'لا ملاحظات.'}</p>{c.management_notes && <p className="text-xs mt-2">إدارة: {c.management_notes}</p>}{c.coverage_gap && <p className="text-xs mt-2 text-amber-700">فجوة: {c.coverage_gap}</p>}</div>}
        {canManage && tab === 'profile' && (
          <div className="flex gap-2 pt-1">
            {['qualified', 'do_not_contact', 'rejected'].map(s => (
              <button key={s} className="text-[11px] font-bold border border-border rounded-lg px-2 py-1 bg-surface"
                onClick={async () => { const { updateCreatorFields } = await import('@services/creatorIntelligenceService'); await updateCreatorFields(c.id, { creator_status: s }, by); onChanged(); }}>{lab(L.status, s)}</button>))}
          </div>)}
      </div>
    </div>
  );
}

// ---------------- Dashboard ----------------
function Dashboard({ rows }) {
  const ct = (fn) => rows.filter(fn).length;
  const audience = rows.map(r => r.audience_syria_pct).filter(v => v !== null);
  const avg = audience.length ? (audience.reduce((a, b) => a + b, 0) / audience.length).toFixed(1) : null;
  const byTier = {}; rows.forEach(r => { const k = tierKey(r.follower_count); byTier[k] = (byTier[k] || 0) + 1; });
  const by = (fn) => rows.reduce((m, r) => { const k = fn(r) || 'unknown'; m[k] = (m[k] || 0) + 1; return m; }, {});
  const byCity = by(r => r.city), byCat = by(r => r.main_category);
  const byPlat = {}; rows.forEach(r => r.platforms.forEach(p => { byPlat[p.platform] = (byPlat[p.platform] || 0) + 1; }));
  const list = (obj, map) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, n]) => <Pill key={k}>{map ? lab(map, k) : k}: {n}</Pill>);
  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Stat label="الإجمالي" value={rows.length} />
        <Stat label="محقَّق A/B" value={ct(r => ['A', 'B'].includes(r.verification_level))} />
        <Stat label="جاهز PR" value={ct(r => ['high', 'medium'].includes(r.pr_fit))} />
        <Stat label="جاهز UGC" value={ct(r => ['high', 'medium'].includes(r.ugc_potential))} />
        <Stat label="مرشّح Paid" value={ct(r => r.paid_collaboration === 'yes')} />
        <Stat label="متوسط جمهور سوريا" value={avg === null ? '—' : `${avg}%`} sub={`من ${audience.length} موثَّق`} />
        <Stat label="واتساب عام" value={ct(r => r.contacts.some(c => c.type === 'whatsapp'))} />
        <Stat label="إيميل عام" value={ct(r => r.contacts.some(c => c.type === 'email'))} />
        <Stat label="نشط ≤30 يوم" value={ct(r => r.last_post_at && (Date.now() - new Date(r.last_post_at)) / 864e5 <= 30)} />
      </div>
      <div className="bg-surface border border-border rounded-2xl p-3 space-y-2">
        <p className="text-xs font-extrabold">حسب الشريحة</p><div className="flex flex-wrap gap-1">{TIERS.map(t => <Pill key={t.key}>{t.label}: {byTier[t.key] || 0}</Pill>)}<Pill>غير معروف: {byTier.unknown || 0}</Pill></div>
        <p className="text-xs font-extrabold">حسب المنصة</p><div className="flex flex-wrap gap-1">{list(byPlat, L.platform)}</div>
        <p className="text-xs font-extrabold">حسب المدينة</p><div className="flex flex-wrap gap-1">{list(byCity, L.cities)}</div>
        <p className="text-xs font-extrabold">حسب الفئة</p><div className="flex flex-wrap gap-1">{list(byCat, L.cats)}</div>
      </div>
    </div>
  );
}

function CoverageGaps({ rows }) {
  const cats = ['skincare', 'beauty', 'makeup', 'hair', 'fashion', 'lifestyle', 'women', 'men', 'motherhood', 'wellness', 'fitness', 'entertainment', 'comedy', 'shopping', 'reviews', 'local', 'expert'];
  const tiers = ['under_1k', '1k_5k', '5k_10k', '10k_25k', '25k_50k', '50k_100k', '100k_250k', '250k_500k', '500k_1m', '1m_plus'];
  const m = coverageMatrix(rows, cats, tiers);
  const ugc = rows.filter(r => r.creator_type === 'ugc').length;
  return (
    <div className="bg-surface border border-border rounded-2xl p-3 overflow-x-auto" dir="rtl">
      <p className="text-xs font-extrabold mb-2">فجوات التغطية (الفئة × الشريحة) — الأصفار = بحث إضافي مطلوب</p>
      <table className="text-[10px] w-full"><thead><tr><th className="text-right">الفئة</th>{tiers.map(t => <th key={t} className="px-1">{TIERS.find(x => x.key === t).label}</th>)}</tr></thead>
        <tbody>{cats.map(c => (<tr key={c} className="border-t border-border text-center"><td className="text-right font-bold py-1">{lab(L.cats, c)}</td>
          {tiers.map(t => <td key={t} className={m[c][t] === 0 ? 'bg-red-50 text-red-500' : 'font-bold'}>{m[c][t]}</td>)}</tr>))}</tbody></table>
      <p className="text-[11px] mt-2">UGC (نوع UGC): <b>{ugc}</b></p>
    </div>
  );
}

// ---------------- List with pagination ----------------
function CardList({ rows, benchmark, onOpen, selection, onToggle, empty = 'لا نتائج.' }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [rows.length]);
  const size = 30;
  if (!rows.length) return <p className="text-center text-xs text-muted py-8">{empty}</p>;
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted">{rows.length} نتيجة</p>
      {rows.slice(0, page * size).map(c => <CreatorCard key={c.id} c={c} benchmark={benchmark} onOpen={onOpen} selected={selection?.has(c.id)} onToggle={onToggle} />)}
      {rows.length > page * size && <button className="w-full text-xs font-bold border border-border rounded-xl py-2 bg-surface" onClick={() => setPage(p => p + 1)}>عرض المزيد</button>}
    </div>
  );
}

// ---------------- Paid ----------------
function PaidView({ rows, benchmark, onOpen }) {
  const [min, setMin] = useState(50000);
  const list = rows.filter(r => (r.follower_count ?? 0) >= min).sort((a, b) => (b.follower_count ?? 0) - (a.follower_count ?? 0));
  const suggestUse = (c) => {
    const u = [];
    if (['high', 'medium'].includes(c.pr_fit)) u.push('PR');
    if (['high', 'medium'].includes(c.ugc_potential)) u.push('UGC');
    if ((c.audience_syria_pct ?? 0) >= 50 && (c.follower_count ?? 0) >= 100000) u.push('Reach');
    if (c.audience_syria_pct !== null && c.audience_syria_pct >= 50) u.push('Awareness');
    if (c.creator_type === 'expert') u.push('Expert content');
    return u.length ? u.join(' · ') : 'غير محدد (بيانات ناقصة)';
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto">{[50000, 100000, 250000, 500000, 1000000].map(v => <Chip key={v} active={min === v} onClick={() => setMin(v)}>{fmtN(v)}+</Chip>)}</div>
      {list.length === 0 && <p className="text-center text-xs text-muted py-8">لا صناع محتوى بهذه الشريحة ضمن الفلاتر الحالية.</p>}
      {list.slice(0, 60).map(c => {
        const est = benchmark ? estimateForCreator(c, benchmark) : null;
        return (<div key={c.id} className="bg-surface border border-border rounded-2xl p-3 space-y-1" dir="rtl">
          <button onClick={() => onOpen(c)} className="text-sm font-extrabold text-text text-right">{c.display_name}</button>
          <div className="grid grid-cols-3 gap-1 text-[10px] text-center">
            <div><b>{fmtN(c.follower_count)}</b><p className="text-muted">متابعون</p></div>
            <div><b>{fmtPct(c.audience_syria_pct)}</b><p className="text-muted">جمهور سوريا</p></div>
            <div><b>{fmtN(c.average_views)}</b><p className="text-muted">متوسط مشاهدات</p></div>
            <div><b>{c.engagement_rate === null ? '—' : c.engagement_rate + '%'}</b><p className="text-muted">Engagement</p></div>
            <div><b>{est ? `Estimated ${est.estimated_low}–${est.estimated_high} ${est.currency}` : 'غير معروف'}</b><p className="text-muted">تقدير</p></div>
            <div><b>{c.contacts.length ? c.contactability_score : 'غير معروف'}</b><p className="text-muted">تواصل</p></div>
          </div>
          <p className="text-[11px]"><b>استخدام مقترح:</b> {suggestUse(c)}</p>
        </div>);
      })}
    </div>
  );
}

// ---------------- Campaigns / PR batch builder ----------------
function Campaigns({ rows, canManage, by, assignees, reloadKey, onDone }) {
  const [campaigns, setCampaigns] = useState([]);
  const [open, setOpen] = useState(null);
  const [members, setMembers] = useState([]);
  const [builder, setBuilder] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState(300);
  const [team, setTeam] = useState([]);
  const [msg, setMsg] = useState(null);
  const pool = useMemo(() => applyFilters(rows, { market: 'syria', category: ['skincare', 'beauty', 'lifestyle', 'makeup', 'hair', 'women'], tier: ['1k_5k', '5k_10k', '10k_25k', '25k_50k'], pr_fit: ['high', 'medium'], ugc_potential: ['high', 'medium'] }), [rows]);
  const sel = useMemo(() => selectForCampaign(pool, target), [pool, target]);
  const load = useCallback(() => listCampaigns().then(setCampaigns).catch(e => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load, reloadKey]);
  useEffect(() => { if (open) listCampaignMembers(open).then(setMembers).catch(e => setMsg(e.message)); }, [open]);
  const create = async () => {
    try {
      const id = await createCampaign({ name, kind: 'pr', target_count: target, filter_json: { preset: 'pr_batch_default' } }, by);
      const ids = sel.selected.map(c => c.id);
      const asg = team.length ? distributeAssignments(ids, team) : { '': ids };
      const n = await addCampaignMembers(id, asg, by);
      setMsg(`أُنشئت الحملة بـ ${n} صانع محتوى.${sel.message ? ' ' + sel.message : ''}`); setBuilder(false); setName(''); load(); onDone();
    } catch (e) { setMsg(e.message); }
  };
  const exportCampaign = () => {
    const ids = new Set(members.map(m => m.creator_id));
    const csv = toCsv(rows.filter(r => ids.has(r.id)).map(r => ({ ...r, assigned_to: members.find(m => m.creator_id === r.id)?.assigned_to })));
    download(`campaign-${open}.csv`, csv);
  };
  return (
    <div className="space-y-3" dir="rtl">
      {msg && <p className="text-xs bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{msg}</p>}
      {canManage && <button className="text-xs font-bold bg-navy text-white rounded-xl px-3 py-2" onClick={() => setBuilder(b => !b)}>➕ PR Batch Builder</button>}
      {builder && (
        <div className="bg-surface border border-border rounded-2xl p-3 space-y-2 text-xs">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="اسم الحملة (مثال: Retinol PR Wave 01)" className="w-full bg-surface-alt border border-border rounded-lg px-2 py-1.5" />
          <p>الفلتر: سوريا · بيوتي/سكين كير/لايف ستايل · 1K–50K · PR وUGC عالٍ/متوسط</p>
          <label>العدد المستهدف <input type="number" value={target} min={1} onChange={e => setTarget(Number(e.target.value) || 1)} className="w-24 bg-surface-alt border border-border rounded-lg px-2 py-1" /></label>
          <p className="font-bold">{sel.message ? `⚠️ ${sel.message}` : `✅ ${sel.selected.length} مؤهَّل ومختار`} (المؤهَّلون بالقاعدة: {pool.length})</p>
          <div><p className="font-bold mb-1">توزيع على الفريق (بالتساوي)</p><MultiChips options={assignees} value={team} onChange={setTeam} /></div>
          <button disabled={!name || !sel.selected.length} className="text-xs font-bold bg-green-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-40" onClick={create}>إنشاء الحملة</button>
        </div>)}
      {campaigns.map(c => {
        const counts = {}; c.members.forEach(m => { counts[m.campaign_status] = (counts[m.campaign_status] || 0) + 1; });
        return (<div key={c.id} className="bg-surface border border-border rounded-2xl p-3 space-y-1">
          <button className="text-sm font-extrabold text-right" onClick={() => setOpen(open === c.id ? null : c.id)}>{c.name} <span className="text-muted text-[10px]">({c.members.length}/{c.target_count ?? '—'})</span></button>
          <div className="flex flex-wrap gap-1">{Object.entries(counts).map(([k, n]) => <Pill key={k}>{lab(L.camp, k)}: {n}</Pill>)}</div>
          {open === c.id && <div className="space-y-1 pt-2">
            <button className="text-[11px] font-bold border border-border rounded-lg px-2 py-1" onClick={exportCampaign}>⬇️ تصدير القائمة</button>
            {members.map(m => (<div key={m.id} className="flex flex-wrap items-center gap-2 border-t border-border/60 py-1 text-[11px]">
              <b className="flex-1 min-w-[120px]">{m.creator_profiles?.display_name}</b><span className="text-muted">{m.assigned_to || 'غير موزَّع'}</span>
              {canManage && <select value={m.campaign_status} className="bg-surface-alt border border-border rounded-lg px-1 py-0.5"
                onChange={async e => { await updateMemberOutreach(m.id, { campaign_status: e.target.value, contact_count: e.target.value === 'contacted' ? m.contact_count + 1 : m.contact_count }, by); listCampaignMembers(open).then(setMembers); load(); }}>
                {CAMPAIGN_STATUSES.map(s => <option key={s} value={s}>{lab(L.camp, s)}</option>)}</select>}
            </div>))}
          </div>}
        </div>);
      })}
      {campaigns.length === 0 && <p className="text-center text-xs text-muted py-6">لا حملات بعد.</p>}
    </div>
  );
}

// ---------------- Research ----------------
function ResearchView({ rows, canManage, by, onDone }) {
  const [plan, setPlan] = useState(null);
  const [ctx, setCtx] = useState({ provider: 'web', source_url: '', confidence: 'low', source_type: 'public_profile' });
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);
  const dist = (fn) => rows.reduce((m, r) => { const k = fn(r); m[k] = (m[k] || 0) + 1; return m; }, {});
  const byFresh = dist(r => freshness(r.last_verified_at)), byLevel = dist(r => r.verification_level || 'Unknown');
  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const text = await f.text();
    setPlan(planImport(parseCsv(text), rows, { ...ctx, market: 'syria' }));
  };
  const commit = async () => {
    try { const n = await commitImport(plan, { ...ctx, observed_at: new Date().toISOString() }, by); setMsg(`تم استيراد ${n} سجل.`); setPlan(null); onDone(); }
    catch (e) { setMsg(e.message); }
  };
  return (
    <div className="space-y-3" dir="rtl">
      <div className="bg-surface border border-border rounded-2xl p-3 text-xs space-y-1">
        <p className="font-extrabold">جودة البيانات</p>
        <div className="flex flex-wrap gap-1">{['A', 'B', 'C', 'Unknown'].map(k => <Pill key={k} cls={LEVEL_COLOR[k]}>تحقق {k}: {byLevel[k] || 0}</Pill>)}</div>
        <div className="flex flex-wrap gap-1">{['fresh', 'aged', 'stale', 'unknown'].map(k => <Pill key={k} cls={FRESH_COLOR[k]}>{lab(L.fresh, k)}: {byFresh[k] || 0}</Pill>)}</div>
        <p className="text-muted">حدود الحداثة: حديث &lt; 30 يوم · متوسط 30–90 · قديم &gt; 90.</p>
      </div>
      <CoverageGaps rows={rows} />
      {canManage && (
        <div className="bg-surface border border-border rounded-2xl p-3 text-xs space-y-2">
          <p className="font-extrabold">استيراد CSV (يمر عبر التحقق وكشف التكرار — لا junk)</p>
          <p className="text-muted">الأعمدة: Name, URL, Followers, Category, City, Email, WhatsApp, Notes · المصدر يُحدَّد أدناه ويُسجَّل لكل سجل.</p>
          <div className="grid grid-cols-2 gap-1">
            <select value={ctx.provider} onChange={e => setCtx({ ...ctx, provider: e.target.value })} className="bg-surface-alt border border-border rounded-lg px-2 py-1">{SOURCE_PROVIDERS.map(p => <option key={p}>{p}</option>)}</select>
            <select value={ctx.confidence} onChange={e => setCtx({ ...ctx, confidence: e.target.value })} className="bg-surface-alt border border-border rounded-lg px-2 py-1">{['low', 'medium', 'high'].map(p => <option key={p}>{p}</option>)}</select>
            <input value={ctx.source_url} onChange={e => setCtx({ ...ctx, source_url: e.target.value })} placeholder="رابط المصدر (مطلوب)" dir="ltr" className="col-span-2 bg-surface-alt border border-border rounded-lg px-2 py-1" />
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} disabled={!ctx.source_url} />
          {plan && <div className="space-y-1">
            <p>جديد: <b>{plan.new.length}</b> · مكرَّر: <b>{plan.duplicate.length}</b> · مراجعة يدوية: <b>{plan.manual_review.length}</b> · غير صالح: <b>{plan.invalid.length}</b></p>
            {plan.invalid.slice(0, 8).map(x => <p key={x.line} className="text-red-600">سطر {x.line}: {x.errors.join(', ')}</p>)}
            <button disabled={!plan.new.length && !plan.manual_review.length} className="bg-green-600 text-white font-bold rounded-lg px-3 py-1 disabled:opacity-40" onClick={commit}>اعتمد الاستيراد</button>
          </div>}
          {msg && <p>{msg}</p>}
        </div>)}
    </div>
  );
}

function download(filename, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}

// ---------------- Screen ----------------
export default function CreatorIntelligenceScreen() {
  const { name } = useAuth();
  const { can } = usePermissions();
  const canData = can(P.MANAGE_CREATOR_DATA), canCamp = can(P.MANAGE_CREATOR_CAMPAIGNS), canRes = can(P.MANAGE_CREATOR_RESEARCH);
  const [rows, setRows] = useState([]);
  const [benchmark, setBenchmark] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [view, setView] = useState('db');
  const [filter, setFilter] = useState({ market: 'syria' });
  const [open, setOpen] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [r, b, c] = await Promise.all([listCreators(), listBenchmarks('syria'), listCampaigns()]);
      setRows(r); setBenchmark(b); setCampaigns(c);
    } catch (e) { setErr(e?.message || 'تعذّر التحميل'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const assignees = useMemo(() => Array.from(new Set(rows.map(r => r.assigned_to).filter(Boolean))), [rows]);
  const categories = useMemo(() => Array.from(new Set(rows.map(r => r.main_category).filter(Boolean))), [rows]);
  const filtered = useMemo(() => applyFilters(rows, filter), [rows, filter]);
  const prPool = useMemo(() => applyFilters(filtered, { tier: ['1k_5k', '5k_10k', '10k_25k', '25k_50k', 'under_1k'] }).filter(r => ['high', 'medium'].includes(r.pr_fit) || ['high', 'medium'].includes(r.ugc_potential) || r.creator_type === 'ugc'), [filtered]);
  const paidPool = useMemo(() => filtered.filter(r => r.paid_collaboration === 'yes' || r.is_celebrity || (r.follower_count ?? 0) >= 50000), [filtered]);

  const notSetUp = !!err && /schema cache|could not find the table|does not exist|relation .* does not exist/i.test(err);
  const TABS = [['db', 'قاعدة البيانات'], ['pr', 'PR / UGC'], ['paid', 'Paid'], ['camp', 'الحملات'], ['res', 'البحث']];
  return (
    <div className="p-4 space-y-3 max-w-3xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-extrabold text-text">🎥 صناع المحتوى</h1>
        <Link to={ROUTES.CREATORS_WORKBENCH} className="text-[11px] font-bold border border-navy text-navy rounded-lg px-2 py-1">🧪 مراجعة وتواصل</Link>
        <div className="flex gap-2">
          <button className="text-[11px] font-bold border border-border rounded-lg px-2 py-1 bg-surface" onClick={() => download('creators.csv', toCsv(filtered))}>⬇️ CSV</button>
          <button className="text-[11px] font-bold border border-border rounded-lg px-2 py-1 bg-surface" onClick={load}>↻</button>
        </div>
      </div>
      {!notSetUp && <div className="flex gap-1.5 overflow-x-auto pb-1">{TABS.map(([k, l]) => <Chip key={k} active={view === k} onClick={() => setView(k)}>{l}</Chip>)}</div>}
      {loading && <p className="text-center text-xs text-muted py-10">جارٍ التحميل…</p>}
      {/* The full creator database tables are intentionally not applied yet (owner decision): show a calm pointer, not a SQL error. */}
      {notSetUp && (
        <div className="bg-surface border border-border rounded-2xl p-4 space-y-2 text-xs" role="status">
          <p className="text-sm font-extrabold text-text">لوحة قاعدة بيانات المبدعين الكاملة غير مفعّلة بعد</p>
          <p className="text-muted">هذا قرار إداري وليس عطلاً. العمل الحالي (مراجعة المبدعين، الطابور، دفعات الاكتشاف، التوزيع على الفريق) كله على شاشة «مراجعة وتواصل المبدعين».</p>
          <Link to={ROUTES.CREATORS_WORKBENCH} className="inline-block font-bold bg-navy text-white rounded-xl px-4 py-2">افتح مراجعة وتواصل المبدعين ←</Link>
        </div>
      )}
      {err && !notSetUp && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{err}</p>}
      {!loading && !err && (
        <>
          {['db', 'pr', 'paid'].includes(view) && <FilterPanel filter={filter} setFilter={setFilter} assignees={assignees} campaigns={campaigns} categories={categories} />}
          {view === 'db' && <><Dashboard rows={filtered} /><CardList rows={filtered} benchmark={benchmark} onOpen={setOpen} empty="القاعدة فارغة — لم تُدخل بيانات موثَّقة بعد. استخدم تبويب «البحث» للاستيراد." /></>}
          {view === 'pr' && <CardList rows={prPool} benchmark={benchmark} onOpen={setOpen} empty="لا مرشّحين PR/UGC ضمن الفلاتر الحالية." />}
          {view === 'paid' && <PaidView rows={paidPool} benchmark={benchmark} onOpen={setOpen} />}
          {view === 'camp' && <Campaigns rows={rows} canManage={canCamp} by={name} assignees={assignees.length ? assignees : []} reloadKey={reloadKey} onDone={() => { setReloadKey(k => k + 1); load(); }} />}
          {view === 'res' && <ResearchView rows={rows} canManage={canRes || canData} by={name} onDone={load} />}
        </>
      )}
      {open && <DetailModal c={open} benchmark={benchmark} canManage={canData} by={name} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} />}
    </div>
  );
}
