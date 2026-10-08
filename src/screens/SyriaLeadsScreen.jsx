// =============================================================
// SyriaLeadsScreen — «ليدز سوريا B2B»
// قاعدة بيانات مرشحين B2B بسوريا بثلاث مساحات:
//   🏪 محلات     — صيدليات/عيادات جلدية/مراكز تجميل/موردين (lead_type=physical)
//   🛒 أونلاين   — المتاجر والمنصات الأونلاين + تتبّع تواجد Lowe's عليها
//                  (هدف حسام: "لازم نكون في كل المتاجر")
//   📊 تحليلات   — تغطية المحافظات، قابلية التواصل، مسار التحويل، "ابدأ بهدول"
// البيانات البحثية تُملأ من خارج التطبيق بمنهجية صارمة (مصدر لكل معلومة، لا
// اختلاق — D-093) + تحديث أسبوعي. هذه الشاشة تكتب حقول الفريق فقط:
// status/notes/assigned_to + lowes_presence/lowes_listing_url.
// Table: syria_b2b_leads · Permission: VIEW_SYRIA_LEADS
//
// D-119 — نفس الشاشة لكل دولة (prop `country`): SY على المسار المباشر القديم بلا تغيير،
// AE (/uae-leads، صلاحية VIEW_UAE_LEADS) عبر Edge Function `b2b-leads` بفحص صلاحية من الخادم.
// المناطق والتسميات من الإعداد المركزي supabase/functions/_shared/countries.js.
// =============================================================
import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { ROUTES } from '@routes/paths';
import {
  STATUS_LABELS, tierGroup,
  CATEGORIES, ONLINE_CATEGORIES, CHANNEL_LABELS, PRESENCE_LABELS, PRESENCE_LABELS_WITH_UNVERIFIED,
  computeInsights, isNewLead, isStale,
} from '@services/syriaLeadsService';
import { leadsApiFor } from '@services/b2bLeadsApi';
import {
  COUNTRIES, NATIONWIDE, enabledCountries, regionLabelAr, cityLabelAr, waLinkFor,
} from '../../supabase/functions/_shared/countries.js';

const COUNTRY_ROUTE = { SY: ROUTES.SYRIA_LEADS, AE: ROUTES.UAE_LEADS };
const LeadsCtx = createContext({ country: 'SY', api: null });
const useLeadsCtx = () => useContext(LeadsCtx);
const presenceLabelsOf = (country) => (COUNTRIES[country]?.legacyDirect ? PRESENCE_LABELS : PRESENCE_LABELS_WITH_UNVERIFIED);

const STATUS_COLOR = {
  not_contacted:  'text-muted bg-surface-alt border-border',
  contacted:      'text-blue-600 bg-blue-50 border-blue-200',
  interested:     'text-green-600 bg-green-50 border-green-200',
  not_interested: 'text-red-500 bg-red-50 border-red-200',
  customer:       'text-purple-600 bg-purple-50 border-purple-200',
};

const PRESENCE_COLOR = {
  not_listed:     'text-muted bg-surface-alt border-border',
  contacted:      'text-blue-600 bg-blue-50 border-blue-200',
  in_talks:       'text-amber-600 bg-amber-50 border-amber-200',
  listed:         'text-green-700 bg-green-50 border-green-300',
  rejected:       'text-red-500 bg-red-50 border-red-200',
  not_applicable: 'text-muted bg-surface-alt border-border',
  unverified:     'text-slate-500 bg-surface-alt border-dashed border-border',
};

const TIER_LABEL = {
  ready: { label: '🟢 جاهز الآن',   color: 'text-green-600 bg-green-50 border-green-200' },
  check: { label: '🟡 يحتاج تأكيد', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  raw:   { label: '⚪ اكتشاف فقط',  color: 'text-muted bg-surface-alt border-border' },
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLOR[status] || STATUS_COLOR.not_contacted}`}>
      {STATUS_LABELS[status] || STATUS_LABELS.not_contacted}
    </span>
  );
}

function PresenceBadge({ presence }) {
  const { country } = useLeadsCtx();
  const k = presence || 'not_listed';
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${PRESENCE_COLOR[k] || PRESENCE_COLOR.not_listed}`}>
      {"Lowe's: "}{presenceLabelsOf(country)[k] || k}
    </span>
  );
}

const btnCls = 'text-[11px] font-bold px-2.5 py-1 rounded-lg bg-surface-alt border border-border text-text';

function ContactActions({ lead }) {
  const { country } = useLeadsCtx();
  const wa = lead.whatsapp_link || waLinkFor(lead.whatsapp, COUNTRIES[country].phoneCc);
  const tg = lead.telegram;
  const any = wa || lead.phone_tel || lead.instagram_link || lead.facebook || lead.website || lead.email || tg;
  return (
    <div className="flex flex-wrap gap-1.5">
      {wa && (
        <a href={wa} target="_blank" rel="noreferrer"
          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-green-50 border border-green-200 text-green-700">💬 واتساب</a>
      )}
      {lead.phone_tel && (
        <a href={lead.phone_tel}
          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-teal/10 border border-teal/30 text-teal">📞 {lead.phone}</a>
      )}
      {lead.website && <a href={lead.website} target="_blank" rel="noreferrer" className={btnCls}>🌐 الموقع</a>}
      {lead.email && <a href={`mailto:${lead.email}`} className={btnCls}>✉️ إيميل</a>}
      {lead.instagram_link && <a href={lead.instagram_link} target="_blank" rel="noreferrer" className={btnCls}>📷 إنستغرام</a>}
      {lead.facebook && <a href={lead.facebook} target="_blank" rel="noreferrer" className={btnCls}>👍 فيسبوك</a>}
      {tg && <a href={tg} target="_blank" rel="noreferrer" className={btnCls}>✈️ تيليغرام</a>}
      {!any && <span className="text-[11px] text-muted">لا وسيلة تواصل منشورة بعد</span>}
    </div>
  );
}

function Sources({ lead }) {
  const urls = (lead.source_urls || '').split('|').map(s => s.trim()).filter(Boolean);
  if (!urls.length) return null;
  return (
    <details className="text-[11px] text-muted">
      <summary className="cursor-pointer select-none font-bold">
        🔎 المصادر ({urls.length}) · آخر تحقّق {fmtDate(lead.last_verified_at || lead.created_at)}
      </summary>
      <ul className="mt-1 space-y-0.5 break-all">
        {urls.map(u => <li key={u}><a href={u} target="_blank" rel="noreferrer" className="underline">{u}</a></li>)}
      </ul>
    </details>
  );
}

function StatusEditor({ lead, myName, onSaved }) {
  const { api } = useLeadsCtx();
  const [status, setStatus] = useState(lead.status || 'not_contacted');
  const [notes, setNotes]   = useState(lead.notes || '');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setFlash] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await api.updateStatus(lead.id, { status, notes, assigned_to: lead.assigned_to }, myName);
      setFlash(true);
      onSaved?.();
      setTimeout(() => setFlash(false), 1500);
    } catch (e) {
      setErr(e?.message || 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const touched = lead.status_updated_at
    ? `آخر تحديث: ${lead.status_updated_by || '—'} · ${fmtDate(lead.status_updated_at)}`
    : 'لم يُحدَّث بعد';

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2.5 mt-1" dir="rtl">
      <span className="text-[10px] font-bold text-muted">التواصل:</span>
      <select value={status} onChange={e => setStatus(e.target.value)}
        className="text-xs font-bold bg-surface-alt border border-border rounded-lg px-2 py-1.5 text-text">
        {Object.entries(STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظة (اختياري)"
        className="flex-1 min-w-[140px] text-xs bg-surface-alt border border-border rounded-lg px-2 py-1.5 text-text" />
      <button onClick={save} disabled={saving}
        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-teal text-navy disabled:opacity-50">
        {saving ? '...' : savedFlash ? '✓ تم' : 'حفظ'}
      </button>
      <span className="text-[10px] text-muted w-full">{err ? <span className="text-red-500">{err}</span> : touched}</span>
    </div>
  );
}

function PresenceEditor({ lead, myName, onSaved }) {
  const { api, country } = useLeadsCtx();
  const labels = presenceLabelsOf(country);
  const [presence, setPresence] = useState(lead.lowes_presence || 'not_listed');
  const [url, setUrl] = useState(lead.lowes_listing_url || '');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await api.updatePresence(lead.id, { lowes_presence: presence, lowes_listing_url: url }, myName);
      setFlash(true); onSaved?.();
      setTimeout(() => setFlash(false), 1500);
    } catch (e) {
      setErr(e?.message || 'تعذّر الحفظ');
    } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 bg-teal/5 border border-teal/20 rounded-xl px-2.5 py-2" dir="rtl">
      <span className="text-[10px] font-bold text-teal">{"تواجد Lowe's:"}</span>
      <select value={presence} onChange={e => setPresence(e.target.value)}
        className="text-xs font-bold bg-surface border border-border rounded-lg px-2 py-1.5 text-text">
        {Object.entries(labels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="رابط منتجاتنا عندهم (إن وُجد)"
        className="flex-1 min-w-[140px] text-xs bg-surface border border-border rounded-lg px-2 py-1.5 text-text" dir="ltr" />
      <button onClick={save} disabled={saving}
        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-teal text-navy disabled:opacity-50">
        {saving ? '...' : flash ? '✓ تم' : 'حفظ'}
      </button>
      {(err || lead.presence_updated_at) && (
        <span className="text-[10px] text-muted w-full">
          {err ? <span className="text-red-500">{err}</span>
            : `آخر تحديث: ${lead.presence_updated_by || '—'} · ${fmtDate(lead.presence_updated_at)}`}
        </span>
      )}
      {lead.lowes_listing_url && (
        <a href={lead.lowes_listing_url} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-teal underline">↗ صفحتنا عندهم</a>
      )}
    </div>
  );
}

function LeadCard({ lead, myName, onSaved }) {
  const { country } = useLeadsCtx();
  const online = lead.lead_type === 'online';
  const tier = tierGroup(lead.priority);
  return (
    <div className={`bg-surface border rounded-2xl p-4 space-y-2 ${tier === 'ready' ? 'border-green-300' : 'border-border'}`} dir="rtl">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-extrabold text-sm text-text">{lead.name}</p>
          {isNewLead(lead) && <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">جديد</span>}
        </div>
        <div className="flex gap-1.5 items-center flex-wrap">
          {lead.added_manually && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-teal bg-teal/10 border-teal/30">✋ أضافه {lead.added_by || 'الفريق'}</span>
          )}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${TIER_LABEL[tier].color}`}>{lead.priority} · {lead.score}</span>
          {online ? <PresenceBadge presence={lead.lowes_presence} /> : <StatusBadge status={lead.status} />}
        </div>
      </div>
      <p className="text-xs text-muted">
        {[regionLabelAr(country, lead.province), cityLabelAr(country, lead.city), lead.category, online && CHANNEL_LABELS[lead.channel], lead.district, lead.contact_person]
          .filter(Boolean).join(' · ')}
      </p>
      {online && (
        <div className="flex flex-wrap gap-1.5">
          {lead.accepts_sellers && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">🏬 يقبل بائعين — نقدر نعرض منتجاتنا</span>}
          {lead.sells_beauty && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200">💄 يبيع تجميل/عناية</span>}
          {lead.delivery_coverage && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-alt text-muted border border-border">🚚 {lead.delivery_coverage}</span>}
        </div>
      )}
      <ContactActions lead={lead} />
      {lead.reason && <p className="text-[11px] text-muted leading-relaxed">{lead.reason}</p>}
      <Sources lead={lead} />
      {isStale(lead) && <p className="text-[10px] font-bold text-amber-600">⚠️ لم يُتحقق منه منذ أكثر من 90 يوماً — أكّد البيانات قبل الاعتماد عليها.</p>}
      {online && <PresenceEditor lead={lead} myName={myName} onSaved={onSaved} />}
      <StatusEditor lead={lead} myName={myName} onSaved={onSaved} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <p className="text-xs font-bold text-muted mb-1.5">{label}</p>
      {children}
    </div>
  );
}
const inputCls = "w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text focus:outline-none focus:border-teal transition";

function AddLeadModal({ onClose, onSaved, myName, defaultType }) {
  const { api, country } = useLeadsCtx();
  const C = COUNTRIES[country];
  const defaultRegion = (type) => (type === 'online' ? NATIONWIDE : C.regions[country === 'AE' ? 1 : 0]);
  const physicalCats = [...CATEGORIES, ...C.extraCategories];
  const onlineCats = [...ONLINE_CATEGORIES, ...C.extraCategories];
  const knownCities = Object.values(C.cities).flat();
  const [form, setForm] = useState({
    lead_type: defaultType, name: '',
    category: defaultType === 'online' ? ONLINE_CATEGORIES[1] : CATEGORIES[0],
    province: defaultRegion(defaultType), city: '', district: '', address: '',
    contact_person: '', phone: '', whatsapp: '', instagram: '', facebook: '', website: '', email: '', telegram: '',
    reason: '', initialStatus: 'not_contacted',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const online = form.lead_type === 'online';

  const save = async () => {
    setError(null);
    if (!form.name.trim()) { setError('الاسم مطلوب'); return; }
    setSaving(true);
    try {
      await api.create(form, myName);
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e?.message || 'حدث خطأ — حاول مجدداً');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" dir="rtl">
      <div className="bg-surface rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div>
            <h3 className="text-base font-extrabold text-text">{online ? 'إضافة متجر أونلاين' : 'إضافة Lead جديد'}</h3>
            <p className="text-[11px] text-muted mt-0.5">معرفة شخصية بالفريق — مصدر واحد، فيتصنّف تلقائياً B كحد أقصى.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt text-muted hover:text-text flex items-center justify-center text-lg transition shrink-0">✕</button>
        </div>

        <div className="px-5 pb-5 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            {[['physical', '🏪 محل/عيادة'], ['online', '🛒 متجر أونلاين']].map(([k, l]) => (
              <button key={k} type="button"
                onClick={() => setForm(f => ({ ...f, lead_type: k, category: k === 'online' ? ONLINE_CATEGORIES[1] : CATEGORIES[0], province: defaultRegion(k) }))}
                className={`py-2 rounded-xl text-xs font-bold border ${form.lead_type === k ? 'bg-teal/10 border-teal text-teal' : 'border-border text-muted'}`}>{l}</button>
            ))}
          </div>

          <Field label={online ? 'اسم المتجر/المنصة *' : 'اسم المحل/العيادة *'}>
            <input className={inputCls} value={form.name} onChange={set('name')} placeholder={online ? 'مثلاً: متجر نور للتجميل' : 'مثلاً: صيدلية النور'} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="الفئة">
              <select className={inputCls} value={form.category} onChange={set('category')}>
                {(online ? onlineCats : physicalCats).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={`${C.regionLabel} *`}>
              <select className={inputCls} value={form.province} onChange={set('province')}>
                {online && <option value={NATIONWIDE}>{C.nationwideLabel}</option>}
                {C.regions.map(p => <option key={p} value={p}>{regionLabelAr(country, p)}</option>)}
              </select>
            </Field>
          </div>

          {online && (
            <Field label="الموقع الإلكتروني"><input className={inputCls} value={form.website} onChange={set('website')} placeholder="https://..." dir="ltr" /></Field>
          )}

          {!online && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="المدينة/المنطقة">
                  <input className={inputCls} value={form.city} onChange={set('city')} list={knownCities.length ? `cities-${country}` : undefined} />
                  {knownCities.length > 0 && (
                    <datalist id={`cities-${country}`}>
                      {knownCities.map(c => <option key={c} value={c}>{cityLabelAr(country, c)}</option>)}
                    </datalist>
                  )}
                </Field>
                <Field label="الحي/التفصيل"><input className={inputCls} value={form.district} onChange={set('district')} /></Field>
              </div>
              <Field label="العنوان"><input className={inputCls} value={form.address} onChange={set('address')} /></Field>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="رقم الهاتف"><input className={inputCls} value={form.phone} onChange={set('phone')} placeholder={C.phoneHint} /></Field>
            <Field label="واتساب"><input className={inputCls} value={form.whatsapp} onChange={set('whatsapp')} placeholder={C.phoneHint} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="إنستغرام"><input className={inputCls} value={form.instagram} onChange={set('instagram')} placeholder="@handle" /></Field>
            <Field label="فيسبوك"><input className={inputCls} value={form.facebook} onChange={set('facebook')} placeholder="رابط الصفحة" /></Field>
          </div>
          {online && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="إيميل"><input className={inputCls} value={form.email} onChange={set('email')} dir="ltr" /></Field>
              <Field label="تيليغرام"><input className={inputCls} value={form.telegram} onChange={set('telegram')} placeholder="https://t.me/..." dir="ltr" /></Field>
            </div>
          )}
          {!online && <Field label="الشخص المسؤول/المالك"><input className={inputCls} value={form.contact_person} onChange={set('contact_person')} /></Field>}

          <Field label="من وين عرفناها / ملاحظة">
            <textarea className={inputCls} rows={2} value={form.reason} onChange={set('reason')} placeholder="مثلاً: زبونة سابقة، عرّفتني عليها ديانا شخصياً..." />
          </Field>

          <Field label="حالة التواصل الحالية">
            <select className={inputCls} value={form.initialStatus} onChange={set('initialStatus')}>
              {Object.entries(STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button onClick={save} disabled={saving}
            className="w-full py-3 rounded-2xl bg-teal text-navy font-extrabold text-sm hover:bg-teal/90 active:scale-95 transition disabled:opacity-50">
            {saving ? 'جارٍ الحفظ...' : online ? '+ إضافة متجر' : '+ إضافة Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}

const Chip = ({ active, onClick, children }) => (
  <button onClick={onClick}
    className={`text-xs font-bold px-3 py-1.5 rounded-full border transition ${active ? 'bg-teal/10 border-teal text-teal' : 'border-border text-muted hover:text-text'}`}>
    {children}
  </button>
);

function Stat({ label, val, sub }) {
  return (
    <div className="bg-surface-alt rounded-2xl px-2 py-3 text-center border border-border">
      <p className="text-lg font-extrabold text-text">{val}</p>
      <p className="text-[10px] font-bold text-muted mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-muted">{sub}</p>}
    </div>
  );
}

function InsightsView({ leads, onJump }) {
  const { country } = useLeadsCtx();
  const C = COUNTRIES[country];
  const presenceLabels = presenceLabelsOf(country);
  const provLabel = (p) => regionLabelAr(country, p);
  const ins = useMemo(() => computeInsights(leads, C.regions), [leads, C.regions]);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const provRows = Object.entries(ins.byProvince).sort((a, b) => b[1].total - a[1].total);
  const funnelOrder = ['not_contacted', 'contacted', 'interested', 'customer', 'not_interested'];
  const presenceOrder = ['listed', 'in_talks', 'contacted', 'not_listed', 'rejected', 'not_applicable']
    .concat(C.legacyDirect ? [] : ['unverified']);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Stat label="إجمالي الليدز" val={ins.total} />
        <Stat label="تواصل مباشر (هاتف/واتساب)" val={`${pct(ins.direct, ins.total)}%`} sub={`${ins.direct} من ${ins.total}`} />
        <Stat label="جديد آخر 7 أيام" val={ins.fresh7} />
        <Stat label="يحتاج إعادة تحقق" val={ins.stale} sub="أقدم من 90 يوماً" />
      </div>

      <section className="bg-surface border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-text">🛒 تواجدنا بالمتاجر الأونلاين</h3>
          <span className="text-xs font-extrabold text-teal">{ins.online.listed} / {ins.online.total}</span>
        </div>
        <div className="h-2.5 bg-surface-alt rounded-full overflow-hidden border border-border">
          <div className="h-full bg-teal" style={{ width: `${pct(ins.online.listed, ins.online.total)}%` }} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {presenceOrder.map(k => (
            <span key={k} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PRESENCE_COLOR[k]}`}>
              {presenceLabels[k]}: {ins.online.presence[k] || 0}
            </span>
          ))}
        </div>
        {ins.online.sellerPlatformsGap.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-muted mb-1.5">🏬 أسرع طريق للتواجد — منصات تقبل بائعين ولسنا عليها بعد:</p>
            <div className="flex flex-wrap gap-1.5">
              {ins.online.sellerPlatformsGap.map(l => (
                <button key={l.id} onClick={() => onJump(l)} className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-700">
                  {l.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="bg-surface border border-border rounded-2xl p-4 space-y-2">
        <h3 className="text-sm font-extrabold text-text">🎯 ابدأ بهدول — أعلى Score بتواصل مباشر ولم يُتواصل معهم</h3>
        {ins.startWith.length === 0 ? <p className="text-xs text-muted">لا يوجد — كل الليدز ذات التواصل المباشر تم التواصل معها 👏</p> : (
          <ol className="space-y-1.5">
            {ins.startWith.map((l, i) => (
              <li key={l.id}>
                <button onClick={() => onJump(l)} className="w-full text-right flex items-center justify-between gap-2 text-xs bg-surface-alt border border-border rounded-xl px-3 py-2 hover:border-teal">
                  <span className="font-bold text-text">{i + 1}. {l.name}</span>
                  <span className="text-muted">{provLabel(l.province)} · {l.category} · {l.score}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="bg-surface border border-border rounded-2xl p-4 space-y-2">
        <h3 className="text-sm font-extrabold text-text">📈 مسار التحويل</h3>
        <div className="grid grid-cols-5 gap-1.5">
          {funnelOrder.map(k => (
            <div key={k} className={`rounded-xl border px-1 py-2 text-center ${STATUS_COLOR[k]}`}>
              <p className="text-base font-extrabold">{ins.funnel[k] || 0}</p>
              <p className="text-[9px] font-bold">{STATUS_LABELS[k]}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted">
          نسبة التحويل لعميل من اللي تواصلنا معهم: {pct(ins.funnel.customer || 0, ins.total - (ins.funnel.not_contacted || 0))}%
        </p>
      </section>

      <section className="bg-surface border border-border rounded-2xl p-4 space-y-2 overflow-x-auto">
        <h3 className="text-sm font-extrabold text-text">🗺️ التغطية حسب {C.regionLabel}</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted text-[10px]">
              <th className="text-right py-1">{C.regionLabel}</th><th>الكل</th><th>تواصل مباشر</th><th>تواصلنا</th><th>عملاء</th><th>أونلاين</th>
            </tr>
          </thead>
          <tbody>
            {provRows.map(([p, r]) => (
              <tr key={p} className="border-t border-border text-center">
                <td className="text-right py-1.5 font-bold text-text">{provLabel(p)}</td>
                <td>{r.total}</td><td>{r.direct}</td><td>{r.contacted}</td><td>{r.customers}</td><td>{r.online}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ins.missingProvinces.length > 0 && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            ⚠️ {C.regionPlural} بلا أي ليد بعد: {ins.missingProvinces.map(provLabel).join('، ')} — أولوية للبحث القادم.
          </p>
        )}
      </section>

      <section className="bg-surface border border-border rounded-2xl p-4 space-y-2">
        <h3 className="text-sm font-extrabold text-text">🏷️ حسب الفئة</h3>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(ins.byCategory).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
            <span key={c} className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-surface-alt border border-border text-text">{c}: {n}</span>
          ))}
        </div>
      </section>
    </div>
  );
}

function CountrySwitcher({ country }) {
  const { can } = usePermissions();
  const navigate = useNavigate();
  const visible = enabledCountries().filter(c => c.leadsPermission && COUNTRY_ROUTE[c.code] && can(c.leadsPermission));
  if (visible.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map(c => (
        <Chip key={c.code} active={c.code === country} onClick={() => c.code !== country && navigate(COUNTRY_ROUTE[c.code])}>
          {c.flag} {c.ar}
        </Chip>
      ))}
    </div>
  );
}

export default function SyriaLeadsScreen({ country = 'SY' }) {
  const C = COUNTRIES[country] || COUNTRIES.SY;
  const api = useMemo(() => leadsApiFor(C.code), [C.code]);
  const ctx = useMemo(() => ({ country: C.code, api }), [C.code, api]);
  const provLabel = (p) => regionLabelAr(C.code, p);
  const { name } = useAuth();
  const [leads, setLeads]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);
  const [view, setView]       = useState('physical'); // physical | online | insights
  const [q, setQ]             = useState('');
  const [province, setProvince] = useState('all');
  const [tier, setTier]       = useState('all');
  const [status, setStatus]   = useState('all');
  const [category, setCategory] = useState('all');
  const [presence, setPresence] = useState('all');
  const [onlyNew, setOnlyNew] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadErr(null);
    try { setLeads(await api.list()); }
    catch (e) { setLeads([]); setLoadErr(e?.message || 'تعذّر التحميل'); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const typeLeads = useMemo(
    () => leads.filter(l => (l.lead_type || 'physical') === (view === 'online' ? 'online' : 'physical')),
    [leads, view],
  );
  const provinces = useMemo(() => Array.from(new Set(typeLeads.map(l => l.province).filter(Boolean))).sort(), [typeLeads]);
  const categories = useMemo(() => Array.from(new Set(typeLeads.map(l => l.category).filter(Boolean))), [typeLeads]);

  const filtered = useMemo(() => typeLeads.filter(l => {
    if (q) {
      const s = q.toLowerCase();
      const hay = [l.name, l.district, l.city, l.category, l.website, l.instagram].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(s)) return false;
    }
    if (province !== 'all' && l.province !== province) return false;
    if (tier !== 'all' && tierGroup(l.priority) !== tier) return false;
    if (status !== 'all' && (l.status || 'not_contacted') !== status) return false;
    if (category !== 'all' && l.category !== category) return false;
    if (view === 'online' && presence !== 'all' && (l.lowes_presence || 'not_listed') !== presence) return false;
    if (onlyNew && !isNewLead(l)) return false;
    return true;
  }), [typeLeads, q, province, tier, status, category, presence, onlyNew, view]);

  const sorted = useMemo(() => {
    const order = { ready: 0, check: 1, raw: 2 };
    return [...filtered].sort((a, b) =>
      order[tierGroup(a.priority)] - order[tierGroup(b.priority)] || (b.score || 0) - (a.score || 0));
  }, [filtered]);

  const readyCount = filtered.filter(l => tierGroup(l.priority) === 'ready').length;
  const checkCount = filtered.filter(l => tierGroup(l.priority) === 'check').length;
  const contactedCount = filtered.filter(l => (l.status || 'not_contacted') !== 'not_contacted').length;
  const listedCount = filtered.filter(l => l.lowes_presence === 'listed').length;
  const newCount = typeLeads.filter(l => isNewLead(l)).length;

  const switchView = (v) => {
    setView(v); setProvince('all'); setCategory('all'); setPresence('all'); setTier('all'); setStatus('all'); setOnlyNew(false);
  };
  const jumpTo = (lead) => {
    switchView(lead.lead_type === 'online' ? 'online' : 'physical');
    setQ(lead.name);
  };

  const presenceLabels = presenceLabelsOf(C.code);

  return (
    <LeadsCtx.Provider value={ctx}>
    <div className="space-y-5 pb-6" dir="rtl">
      <div className="flex items-start justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-extrabold text-text">ليدز {C.ar} B2B</h1>
          <p className="text-xs text-muted mt-0.5">
            {C.legacyDirect
              ? 'محلات ومتاجر أونلاين حقيقية بمصادر موثّقة — لا بيانات مُختلَقة. تتحدّث أسبوعياً بالجديد.'
              : 'منصات وصيدليات ومتاجر تجميل وموزعون — كل جهة بمصدر عام وتاريخ تحقق. «غير متحقق» يعني لم نجد دليلاً بعد، لا أننا غير موجودين.'}
          </p>
        </div>
        {view !== 'insights' && (
          <button onClick={() => setAddOpen(true)}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 active:scale-95 transition shadow-sm">
            + إضافة
          </button>
        )}
      </div>

      <CountrySwitcher country={C.code} />

      <div className="grid grid-cols-3 gap-1.5 bg-surface-alt border border-border rounded-2xl p-1">
        {[['physical', '🏪 محلات'], ['online', '🛒 متاجر أونلاين'], ['insights', '📊 تحليلات']].map(([k, l]) => (
          <button key={k} onClick={() => switchView(k)}
            className={`py-2 rounded-xl text-xs font-extrabold transition ${view === k ? 'bg-surface text-teal shadow-sm' : 'text-muted'}`}>
            {l}
          </button>
        ))}
      </div>

      {loadErr && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{loadErr}</p>}

      {view === 'insights' ? (
        loading ? <div className="h-40 bg-surface-alt animate-pulse rounded-2xl" /> : <InsightsView leads={leads} onJump={jumpTo} />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2.5">
            <Stat label="بالعرض الحالي" val={filtered.length} />
            <Stat label="جاهز الآن" val={readyCount} />
            {view === 'online'
              ? <Stat label="موجودين عندهم" val={listedCount} />
              : <Stat label="يحتاج تأكيد" val={checkCount} />}
            <Stat label="تواصلنا معهم" val={contactedCount} />
          </div>

          <input type="search" value={q} onChange={e => setQ(e.target.value)}
            placeholder={view === 'online' ? 'دوّر باسم المتجر أو الموقع أو الحساب…' : 'دوّر باسم المحل أو المنطقة…'}
            className="w-full bg-surface border border-border rounded-2xl px-4 py-2.5 text-sm text-text focus:outline-none focus:border-teal" />

          <div className="flex flex-wrap gap-1.5">
            <Chip active={province === 'all'} onClick={() => setProvince('all')}>{C.allRegionsLabel}</Chip>
            {provinces.map(p => <Chip key={p} active={province === p} onClick={() => setProvince(p)}>{provLabel(p)}</Chip>)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={category === 'all'} onClick={() => setCategory('all')}>كل الفئات</Chip>
            {categories.map(c => <Chip key={c} active={category === c} onClick={() => setCategory(c)}>{c}</Chip>)}
            {newCount > 0 && <Chip active={onlyNew} onClick={() => setOnlyNew(v => !v)}>🆕 جديد ({newCount})</Chip>}
          </div>
          {view === 'online' ? (
            <div className="flex flex-wrap gap-1.5">
              <Chip active={presence === 'all'} onClick={() => setPresence('all')}>كل حالات التواجد</Chip>
              {Object.entries(presenceLabels).map(([k, l]) => (
                <Chip key={k} active={presence === k} onClick={() => setPresence(k)}>{l}</Chip>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {['all', 'ready', 'check', 'raw'].map(t => (
                <Chip key={t} active={tier === t} onClick={() => setTier(t)}>
                  {t === 'all' ? 'كل المستويات' : TIER_LABEL[t].label}
                </Chip>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Chip active={status === 'all'} onClick={() => setStatus('all')}>كل حالات التواصل</Chip>
            {Object.entries(STATUS_LABELS).map(([k, l]) => (
              <Chip key={k} active={status === k} onClick={() => setStatus(k)}>{l}</Chip>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-20 bg-surface-alt animate-pulse rounded-2xl" />)}
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-16 text-muted">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-sm font-semibold">ولا نتيجة مطابقة</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sorted.map(l => <LeadCard key={l.id} lead={l} myName={name} onSaved={load} />)}
            </div>
          )}
        </>
      )}

      {addOpen && (
        <AddLeadModal myName={name} defaultType={view === 'online' ? 'online' : 'physical'}
          onClose={() => setAddOpen(false)} onSaved={load} />
      )}
    </div>
    </LeadsCtx.Provider>
  );
}
