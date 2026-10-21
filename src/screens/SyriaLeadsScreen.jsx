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
import { COUNTRY_ROUTE, allowedLeadCountries, saveLastCountry } from '@data/b2bLeadsNav';
import {
  STATUS_LABELS, tierGroup,
  CATEGORIES, ONLINE_CATEGORIES, PRESENCE_LABELS, PRESENCE_LABELS_WITH_UNVERIFIED,
  computeInsights, isNewLead,
} from '@services/syriaLeadsService';
import { leadsApiFor } from '@services/b2bLeadsApi';
import { canImportLeads } from '@services/b2bImport';
import { nextStep, stepRank, needsFollowUp, ownerOf, ownerForSave, outreachMessage } from '@services/b2bNextStep';
import ImportLeadsModal from '@components/b2b/ImportLeadsModal';
import LoadStatePanel, { SlowLoadHint } from '@components/b2b/LoadStatePanel';
import MarketDashboard from '@components/b2b/MarketDashboard';
import LeadDetailsModal from '@components/b2b/LeadDetailsModal';
import { assess, trackOf, READY_VIEWS, viewByKey, ORG_TYPES, STAGE_AR, PIPELINE, ownerOf as modelOwnerOf } from '@services/b2bModel';
import {
  cardStatusOf, stepOf, blockerOf, primaryActionOf, queueFilterByKey, queueBar, topPick, ORG_ACCENT,
} from '@services/b2bQueue';
import { toB2bError, logB2bError } from '@services/b2bErrors';
import {
  COUNTRIES, NATIONWIDE, regionLabelAr, cityLabelAr, waLinkFor,
} from '../../supabase/functions/_shared/countries.js';

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
      await api.updateStatus(lead.id, { status, notes, assigned_to: ownerForSave(lead, status, myName) }, myName);
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

const STEP_TONE = {
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  gray: 'bg-surface-alt text-muted border-border',
};

function NextStepRow({ lead }) {
  const { country } = useLeadsCtx();
  const step = nextStep(lead);
  const owner = ownerOf(lead);
  const [msg, setMsg] = useState(null); // null | string (editable draft)
  const [copied, setCopied] = useState(false);
  const canWrite = ['not_contacted', 'contacted', 'interested'].includes(lead.status || 'not_contacted');
  const copy = async () => {
    try { await navigator.clipboard.writeText(msg); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked: the text stays selectable */ }
  };
  return (
    <div className="space-y-1.5">
      <div className={`flex items-center justify-between gap-2 flex-wrap rounded-xl border px-2.5 py-1.5 text-xs font-bold ${STEP_TONE[step.tone]}`}>
        <span>← {step.ar}</span>
        <span className="flex items-center gap-2 font-normal text-[11px]">
          {owner && <span>المسؤول: <b>{owner}</b></span>}
          {canWrite && <button type="button" onClick={() => setMsg(m => (m == null ? outreachMessage(lead, country) : null))} className="font-bold underline">{msg == null ? '✉️ رسالة جاهزة' : 'إخفاء الرسالة'}</button>}
        </span>
      </div>
      {msg != null && (
        <div className="space-y-1">
          <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={5} dir={country === 'AE' ? 'ltr' : 'rtl'}
            className="w-full text-xs bg-surface-alt border border-border rounded-xl px-2.5 py-2 text-text" aria-label="نص رسالة التواصل" />
          <div className="flex items-center gap-2">
            <button type="button" onClick={copy} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-teal text-navy">{copied ? '✓ تم النسخ' : 'نسخ'}</button>
            <span className="text-[10px] text-muted">نسخ فقط — أنت ترسلها بنفسك ثم سجّل «تم التواصل».</span>
          </div>
        </div>
      )}
    </div>
  );
}

const TONE_PILL = {
  green: 'bg-green-50 text-green-700 border-green-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  red: 'bg-red-50 text-red-600 border-red-200',
  gray: 'bg-surface-alt text-muted border-border',
};

// تسجيل النتيجة بنقرة واحدة من البطاقة (نفس نداء StatusEditor، تحفظ الملاحظة الحالية كما هي).
const QUICK_RESULTS = [
  { status: 'contacted', label: '✓ تواصلنا' },
  { status: 'interested', label: '👍 مهتم' },
  { status: 'not_interested', label: '👎 غير مهتم' },
];
function QuickResult({ lead, myName, onSaved }) {
  const { api } = useLeadsCtx();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const current = lead.status || 'not_contacted';
  if (!['not_contacted', 'contacted', 'interested'].includes(current)) return null;   // عميل/مغلق: لا تسجيل سريع
  const save = async (status) => {
    setBusy(status); setErr(null);
    try {
      await api.updateStatus(lead.id, { status, notes: lead.notes || '', assigned_to: ownerForSave(lead, status, myName) }, myName);
      await onSaved?.();
    } catch (e) { setErr(e?.message || 'تعذّر الحفظ'); }
    finally { setBusy(null); }
  };
  return (
    <div className="space-y-1" data-testid="quick-result">
      <div className="flex gap-1.5">
        {QUICK_RESULTS.filter(r => r.status !== current).map(r => (
          <button key={r.status} type="button" disabled={!!busy} onClick={() => save(r.status)} data-quick={r.status}
            className="flex-1 text-[11px] font-bold px-2 py-1.5 rounded-lg bg-surface-alt border border-border text-text disabled:opacity-50">
            {busy === r.status ? '…' : r.label}
          </button>
        ))}
      </div>
      {err && <p className="text-[10px] text-red-500">{err}</p>}
    </div>
  );
}

// بطاقة مختصرة: الجهة ← الحالة ← الخطوة التالية (بارزة) ← المسؤول/العائق ← زر رئيسي واحد ← تسجيل النتيجة بنقرة.
// كل ما عداه (المصادر، سبب التقييم، الملاحظات، التحديث والحفظ) داخل «التفاصيل».
function LeadCard({ lead, onOpen, myName, onSaved }) {
  const { country } = useLeadsCtx();
  const a = useMemo(() => assess(lead), [lead]);
  const step = useMemo(() => stepOf(lead, a), [lead, a]);
  const st = cardStatusOf(lead, a);
  const wa = lead.whatsapp_link || waLinkFor(lead.whatsapp, COUNTRIES[country].phoneCc);
  const act = primaryActionOf(lead, step, wa);
  const blocker = blockerOf(lead, a);
  const place = [regionLabelAr(country, lead.province), cityLabelAr(country, lead.city), lead.district].filter(Boolean).join(' · ');
  const hot = ['today', 'follow_up'].includes(a.exec.key);
  const pill = 'inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap';
  return (
    <article data-testid="lead-card" data-org={a.orgType}
      className={`bg-surface border border-border border-r-4 ${ORG_ACCENT[a.orgType]} rounded-2xl p-3 flex flex-col gap-2.5 ${hot ? 'shadow-sm' : ''}`} dir="rtl">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-extrabold text-sm text-text leading-snug break-words">{lead.name}</h3>
          <p className="text-[11px] text-muted mt-0.5" data-testid="org-line">{a.org.icon} {a.org.ar}{place ? ` · ${place}` : ''}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`${pill} ${TONE_PILL[st.tone]}`} data-testid="card-status">{st.ar}</span>
          {isNewLead(lead) && <span className={`${pill} bg-amber-100 text-amber-700 border-amber-200`}>جديد</span>}
        </div>
      </header>

      <div className={`rounded-xl border px-2.5 py-2 ${TONE_PILL[step.tone]}`} data-testid="next-step">
        <p className="text-[10px] font-bold opacity-70">الخطوة التالية</p>
        <p className="text-xs font-extrabold leading-snug">{step.ar}</p>
      </div>

      <p className="text-[11px] text-muted flex flex-wrap gap-x-3 gap-y-0.5" data-testid="owner-line">
        <span>المسؤول: <b className={a.owner ? 'text-text' : ''}>{a.owner || 'غير محدد'}</b></span>
        {blocker && <span className="text-amber-700">العائق: {blocker}</span>}
      </p>

      <footer className="flex items-center gap-2 mt-auto pt-0.5">
        {act.kind === 'link' ? (
          <a href={act.href} target={act.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" data-testid="primary-action"
            className="flex-1 text-center text-xs font-extrabold px-3 py-2 rounded-xl bg-teal text-navy">{act.label}</a>
        ) : (
          <button type="button" onClick={onOpen} data-testid="primary-action"
            className="flex-1 text-xs font-extrabold px-3 py-2 rounded-xl bg-teal text-navy">{act.label}</button>
        )}
        {act.kind === 'link' && (
          <button type="button" onClick={onOpen} data-testid="open-details"
            className="text-xs font-bold px-3 py-2 rounded-xl bg-surface-alt border border-border text-text">التفاصيل</button>
        )}
      </footer>
      <QuickResult lead={lead} myName={myName} onSaved={onSaved} />
    </article>
  );
}

// داخل نافذة التفاصيل: كل ما كان مبعثراً أسفل البطاقة — رسالة جاهزة، وسائل التواصل، التواجد، التحديث والحفظ.
function LeadManage({ lead, myName, onSaved }) {
  const a = useMemo(() => assess(lead), [lead]);
  return (
    <section className="space-y-2.5 border-t border-border pt-3" data-testid="lead-manage">
      <h4 className="text-xs font-extrabold text-text">تحديث الجهة والتواصل</h4>
      <NextStepRow lead={lead} />
      <ContactActions lead={lead} />
      {a.track === 'channel' && <PresenceEditor lead={lead} myName={myName} onSaved={onSaved} />}
      <StatusEditor lead={lead} myName={myName} onSaved={onSaved} />
    </section>
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

// تبويب الدولة — الطريقة الوحيدة للتبديل (بند «ليدز B2B» واحد بالقائمة). يظهر فقط الدول المسموحة للمستخدم.
// بلا أعلام emoji: على ويندوز تظهر كحروف (SY/AE).
function CountryTabs({ country }) {
  const { can } = usePermissions();
  const navigate = useNavigate();
  const allowed = allowedLeadCountries(can);
  if (allowed.length < 2) {
    return <span className="inline-flex text-[11px] font-bold px-2.5 py-1 rounded-full bg-surface-alt border border-border text-muted">{COUNTRIES[country].ar}</span>;
  }
  return (
    <div role="tablist" aria-label="الدولة" className="inline-flex gap-1 bg-surface-alt border border-border rounded-2xl p-1" data-testid="country-tabs">
      {allowed.map((code) => (
        <button key={code} role="tab" aria-selected={code === country} onClick={() => code !== country && navigate(COUNTRY_ROUTE[code])}
          className={`px-4 py-1.5 rounded-xl text-sm font-extrabold transition ${code === country ? 'bg-surface text-teal shadow-sm' : 'text-muted hover:text-text'}`}>
          {COUNTRIES[code].ar}
        </button>
      ))}
    </div>
  );
}

// شريط «ماذا أفعل الآن؟» — أرقام قابلة للضغط بدل صفوف الفلاتر. الضغط مرة ثانية يلغي التصفية.
function QueueBar({ items, active, onPick }) {
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="queue-bar" role="group" aria-label="ماذا أفعل الآن">
      {items.map((it) => (
        <button key={it.key} type="button" onClick={() => onPick(active === it.key ? 'all' : it.key)} data-queue={it.key} aria-pressed={active === it.key}
          className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border transition ${active === it.key ? 'bg-teal/10 border-teal text-teal' : 'bg-surface border-border text-muted hover:text-text'}`}>
          <span>{it.ar}</span>
          <b className={`text-sm ${it.count > 0 && it.tone === 'amber' ? 'text-amber-700' : 'text-text'}`}>{it.count}</b>
        </button>
      ))}
    </div>
  );
}

export default function SyriaLeadsScreen({ country = 'SY' }) {
  const C = COUNTRIES[country] || COUNTRIES.SY;
  const api = useMemo(() => leadsApiFor(C.code), [C.code]);
  const ctx = useMemo(() => ({ country: C.code, api }), [C.code, api]);
  const provLabel = (p) => regionLabelAr(C.code, p);
  const { name, role } = useAuth();
  const { can } = usePermissions();
  const canImport = canImportLeads(role, C.code, can);   // أدمن أو صاحب صلاحية ليدز الدولة (سوريا والإمارات) — الخادم يفحص مرة ثانية
  const [importOpen, setImportOpen] = useState(false);
  const [leads, setLeads]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);
  const [slow, setSlow] = useState(false);
  const [view, setView]       = useState(C.legacyDirect ? 'physical' : 'online'); // online = قنوات البيع | physical = الجهات المحلية | insights = لوحة السوق (الإمارات تبدأ بالقنوات)
  const [q, setQ]             = useState('');
  const [province, setProvince] = useState('all');
  const [tier, setTier]       = useState('all');
  const [status, setStatus]   = useState('all');
  const [onlyFollow, setOnlyFollow] = useState(false);
  const [category, setCategory] = useState('all');
  const [presence, setPresence] = useState('all');
  const [onlyNew, setOnlyNew] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [readyKey, setReadyKey] = useState('all');
  const [orgFilter, setOrgFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [queueKey, setQueueKey] = useState('all');
  const [advOpen, setAdvOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);

  useEffect(() => { saveLastCountry(C.code); }, [C.code]);   // «ليدز B2B» بالقائمة يرجع لآخر دولة

  const load = useCallback(async () => {
    setLoading(true); setLoadErr(null); setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 8000);   // الحدّ الأقصى لكل نداء بـb2bErrors.LOAD_TIMEOUT_MS ثم تظهر لوحة الخطأ
    try { setLeads(await api.list()); }
    catch (e) { const err = toB2bError(e, 'list'); logB2bError(err, 'list'); setLeads([]); setLoadErr(err); }
    finally { clearTimeout(slowTimer); setSlow(false); setLoading(false); }
  }, [api]);
  // تحديث صامت بعد تسجيل سريع: بلا هياكل تحميل ولا فقدان موضع التمرير؛ فشله يُبقي القائمة الحالية (الحفظ نفسه نجح).
  const refresh = useCallback(async () => {
    try { setLeads(await api.list()); }
    catch (e) { logB2bError(toB2bError(e, 'list'), 'list'); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const assessed = useMemo(() => new Map(leads.map(l => [l.id, assess(l)])), [leads]);
  const typeLeads = useMemo(
    () => leads.filter(l => trackOf(l) === (view === 'online' ? 'channel' : 'local')),   // قنوات (منصات/سلاسل/متاجر أونلاين) مقابل جهات محلية
    [leads, view],
  );
  const channelTotal = useMemo(() => leads.filter(l => trackOf(l) === 'channel').length, [leads]);
  const localTotal = leads.length - channelTotal;
  const provinces = useMemo(() => Array.from(new Set(typeLeads.map(l => l.province).filter(Boolean))).sort(), [typeLeads]);
  const categories = useMemo(() => Array.from(new Set(typeLeads.map(l => l.category).filter(Boolean))), [typeLeads]);
  const owners = useMemo(() => Array.from(new Set(typeLeads.map(l => modelOwnerOf(l)).filter(Boolean))).sort(), [typeLeads]);
  const ready = readyKey === 'all' ? null : viewByKey(readyKey);
  const queue = queueKey === 'all' ? null : queueFilterByKey(queueKey);
  const readyCounts = useMemo(() => Object.fromEntries(READY_VIEWS.map(v => [v.key, v.needsFields ? null : typeLeads.filter(l => v.test(l, Date.now())).length])), [typeLeads]);
  const bar = useMemo(() => queueBar(typeLeads, assessed), [typeLeads, assessed]);

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
    if (onlyFollow && !needsFollowUp(l)) return false;
    if (ready && !ready.test(l, Date.now())) return false;
    const as = assessed.get(l.id);
    if (queue && !queue.test(l, as)) return false;
    if (orgFilter !== 'all' && as?.orgType !== orgFilter) return false;
    if (stageFilter !== 'all' && as?.stage !== stageFilter) return false;
    if (ownerFilter === '__none' && modelOwnerOf(l)) return false;
    if (ownerFilter !== 'all' && ownerFilter !== '__none' && modelOwnerOf(l) !== ownerFilter) return false;
    return true;
  }), [typeLeads, q, province, tier, status, category, presence, onlyNew, onlyFollow, view, ready, queue, assessed, orgFilter, stageFilter, ownerFilter]);

  const sorted = useMemo(() => {
    const order = { ready: 0, check: 1, raw: 2 };
    return [...filtered].sort((a, b) =>
      (assessed.get(a.id)?.exec.rank ?? 9) - (assessed.get(b.id)?.exec.rank ?? 9) || stepRank(a) - stepRank(b)
      || order[tierGroup(a.priority)] - order[tierGroup(b.priority)] || (b.score || 0) - (a.score || 0));
  }, [filtered, assessed]);

  const newCount = typeLeads.filter(l => isNewLead(l)).length;
  const followCount = typeLeads.filter(l => needsFollowUp(l)).length;
  const pick = useMemo(() => (queueKey === 'all' && !q ? topPick(sorted, assessed) : null), [sorted, assessed, queueKey, q]);
  const pickStep = pick ? stepOf(pick, assessed.get(pick.id)) : null;
  // عدد الفلاتر المتقدمة المفعّلة (يظهر على الزر حتى لا تُنسى فلاتر مخفية)
  const advActive = [province, category, presence, tier, status, readyKey, orgFilter, stageFilter, ownerFilter].filter(v => v !== 'all').length + (onlyNew ? 1 : 0) + (onlyFollow ? 1 : 0);

  const resetFilters = () => {
    setProvince('all'); setCategory('all'); setPresence('all'); setTier('all'); setStatus('all'); setOnlyNew(false); setOnlyFollow(false);
    setReadyKey('all'); setOrgFilter('all'); setStageFilter('all'); setOwnerFilter('all'); setQueueKey('all'); setQ('');
  };
  const switchView = (v) => { setView(v); resetFilters(); setAdvOpen(false); };
  const jumpTo = (lead) => {
    switchView(trackOf(lead) === 'channel' ? 'online' : 'physical');
    setQ(lead.name);
  };

  const presenceLabels = presenceLabelsOf(C.code);
  const detail = detailId ? leads.find(l => l.id === detailId) : null;
  const tabs = [['online', '🎯 قنوات البيع', channelTotal], ['physical', '🏪 الجهات المحلية', localTotal], ['insights', '📊 لوحة السوق', null]];

  return (
    <LeadsCtx.Provider value={ctx}>
    <div className="space-y-3 pb-6" dir="rtl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-xl font-extrabold text-text">ليدز B2B</h1>
          <CountryTabs country={C.code} />
        </div>
        <div className="flex items-center gap-1.5">
          {canImport && (
            <button onClick={() => setImportOpen(true)} data-testid="import-open"
              className="px-3 py-2 rounded-xl bg-surface-alt border border-border text-text text-xs font-bold hover:border-teal transition">
              ⬆️ استيراد من ملف
            </button>
          )}
          {view !== 'insights' && !loadErr && (
            <button onClick={() => setAddOpen(true)}
              className="px-4 py-2 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 active:scale-95 transition shadow-sm">
              + إضافة
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 bg-surface-alt border border-border rounded-2xl p-1" role="tablist" aria-label="أقسام ليدز B2B" data-testid="view-tabs">
        {tabs.map(([k, l, n]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => switchView(k)}
            className={`py-2 rounded-xl text-xs sm:text-sm font-extrabold transition ${view === k ? 'bg-surface text-teal shadow-sm' : 'text-muted'}`}>
            {l}{n != null && !loading ? <span className="font-bold opacity-70"> · {n}</span> : null}
          </button>
        ))}
      </div>

      {loadErr && <LoadStatePanel err={loadErr} onRetry={load} />}
      {loading && slow && <SlowLoadHint />}

      {loadErr ? null : view === 'insights' ? (
        loading ? <div className="h-40 bg-surface-alt animate-pulse rounded-2xl" /> : <div className="space-y-4"><MarketDashboard leads={leads} country={C.code} onView={(k) => { switchView('physical'); setReadyKey(k); setAdvOpen(true); }} /><InsightsView leads={leads} onJump={jumpTo} /></div>
      ) : (
        <>
          {!loading && leads.length > 0 && (
            <>
              <QueueBar items={bar} active={queueKey} onPick={setQueueKey} />
              {pick && (
                <button type="button" onClick={() => setDetailId(pick.id)} data-testid="top-pick"
                  className="w-full text-right flex items-center justify-between gap-3 rounded-2xl border border-teal/40 bg-teal/5 px-3 py-2.5">
                  <span className="min-w-0 text-xs">
                    <span className="font-extrabold text-teal">ابدأ من هنا: </span>
                    <b className="text-text">{pick.name}</b>
                    <span className="text-muted"> — {pickStep.ar}</span>
                  </span>
                  <span className="text-xs font-extrabold text-teal shrink-0">فتح ←</span>
                </button>
              )}
            </>
          )}

          <div className="flex items-center gap-2">
            <input type="search" value={q} onChange={e => setQ(e.target.value)}
              placeholder={view === 'online' ? 'دوّر باسم المنصة أو المتجر…' : 'دوّر باسم الجهة أو المنطقة…'}
              className="flex-1 min-w-0 bg-surface border border-border rounded-xl px-3.5 py-2 text-sm text-text focus:outline-none focus:border-teal" />
            <button type="button" onClick={() => setAdvOpen(o => !o)} aria-expanded={advOpen} data-testid="adv-toggle"
              className={`shrink-0 text-xs font-bold px-3 py-2.5 rounded-xl border transition ${advOpen || advActive ? 'border-teal text-teal bg-teal/5' : 'border-border text-muted'}`}>
              فلاتر متقدمة{advActive ? ` (${advActive})` : ''}
            </button>
          </div>

          {advOpen && (
            <div className="space-y-3 bg-surface border border-border rounded-2xl p-3" data-testid="adv-panel">
              <div className="flex flex-wrap gap-1.5" data-testid="ready-views" aria-label="عروض جاهزة">
                <Chip active={readyKey === 'all'} onClick={() => setReadyKey('all')}>كل الجهات</Chip>
                {READY_VIEWS.map(v => (
                  <button key={v.key} type="button" disabled={!!v.needsFields} data-view={v.key} onClick={() => setReadyKey(readyKey === v.key ? 'all' : v.key)}
                    title={v.needsFields ? 'يحتاج حقلاً غير موجود بعد (migration مقترحة)' : undefined}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border transition disabled:opacity-40 disabled:cursor-not-allowed ${readyKey === v.key ? 'bg-teal/10 border-teal text-teal' : 'border-border text-muted hover:text-text'}`}>
                    {v.ar}{readyCounts[v.key] != null ? ` (${readyCounts[v.key]})` : ''}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={province === 'all'} onClick={() => setProvince('all')}>{C.allRegionsLabel}</Chip>
                {provinces.map(p => <Chip key={p} active={province === p} onClick={() => setProvince(p)}>{provLabel(p)}</Chip>)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={category === 'all'} onClick={() => setCategory('all')}>كل الفئات</Chip>
                {categories.map(c => <Chip key={c} active={category === c} onClick={() => setCategory(c)}>{c}</Chip>)}
                {newCount > 0 && <Chip active={onlyNew} onClick={() => setOnlyNew(v => !v)}>🆕 جديد ({newCount})</Chip>}
                {followCount > 0 && <Chip active={onlyFollow} onClick={() => setOnlyFollow(v => !v)}>⏰ تحتاج متابعة ({followCount})</Chip>}
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
              <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="extra-filters">
                <select value={orgFilter} onChange={e => setOrgFilter(e.target.value)} aria-label="نوع الجهة" className="bg-surface-alt border border-border rounded-lg px-2 py-1.5 font-bold text-text">
                  <option value="all">كل أنواع الجهات</option>
                  {Object.entries(ORG_TYPES).filter(([, o]) => o.track === (view === 'online' ? 'channel' : 'local')).map(([k, o]) => <option key={k} value={k}>{o.ar}</option>)}
                </select>
                <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} aria-label="المرحلة" className="bg-surface-alt border border-border rounded-lg px-2 py-1.5 font-bold text-text">
                  <option value="all">كل المراحل (تقديرية)</option>
                  {PIPELINE.filter(s => !['documents_requested', 'application_started', 'submitted', 'pending_approval', 'approved', 'paused'].includes(s)).map(s => <option key={s} value={s}>{STAGE_AR[s]}</option>)}
                </select>
                <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} aria-label="المسؤول" className="bg-surface-alt border border-border rounded-lg px-2 py-1.5 font-bold text-text">
                  <option value="all">كل المسؤولين</option>
                  <option value="__none">بلا مسؤول</option>
                  {owners.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {advActive > 0 && <button type="button" onClick={resetFilters} className="font-bold text-teal underline mr-auto">مسح الفلاتر</button>}
              </div>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {[1, 2, 3].map(i => <div key={i} className="h-32 bg-surface-alt animate-pulse rounded-2xl" />)}
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-16 text-muted" data-testid="empty-data">
              <p className="text-4xl mb-3">🗂️</p>
              <p className="text-sm font-semibold">لا توجد جهات لهذه الدولة بعد</p>
              <p className="text-xs mt-1">{canImport ? 'استورد ملف Excel (زر الاستيراد) أو أضف جهة يدوياً.' : 'تُضاف الجهات بعد اعتماد دفعات البحث، أو يدوياً من زر «إضافة».'}</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-14 text-muted">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-sm font-semibold">ولا نتيجة مطابقة</p>
              {(advActive > 0 || queueKey !== 'all' || q) && <button type="button" onClick={resetFilters} className="mt-2 text-xs font-bold text-teal underline">مسح الفلاتر</button>}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="lead-grid">
              {sorted.map(l => <LeadCard key={l.id} lead={l} onOpen={() => setDetailId(l.id)} myName={name} onSaved={refresh} />)}
            </div>
          )}
        </>
      )}

      {detail && (
        <LeadDetailsModal lead={detail} leads={leads} country={C.code} onClose={() => setDetailId(null)}>
          <LeadManage lead={detail} myName={name} onSaved={load} />
        </LeadDetailsModal>
      )}
      {addOpen && (
        <AddLeadModal myName={name} defaultType={view === 'online' ? 'online' : 'physical'}
          onClose={() => setAddOpen(false)} onSaved={load} />
      )}
      {importOpen && canImport && (
        <ImportLeadsModal country={C.code} onClose={() => setImportOpen(false)} onSaved={load} />
      )}
    </div>
    </LeadsCtx.Provider>
  );
}
