// نافذة تفاصيل الجهة — كل ما نعرفه + ما لا نعرفه صراحةً. لا إرسال تلقائي: الرسالة نسخ فقط.
// المستندات وشروط التسجيل وسجل التغييرات الكامل تحتاج حقول/جدول غير موجودة اليوم (migration مقترحة) فتظهر «غير مسجّلة» بدل أن نخترعها.
import { useMemo, useState } from 'react';
import { assess, chainKeyOf, chainGroups, sourcesOf, STAGE_AR, SOURCE_QUALITY_AR, APPROACH_AR, EXEC_AR } from '@services/b2bModel';
import { outreachMessage } from '@services/b2bNextStep';
import { STATUS_LABELS } from '@services/syriaLeadsService';
import { timelineOf } from '@services/b2bTimeline';
import { COUNTRIES, regionLabelAr, cityLabelAr } from '../../../supabase/functions/_shared/countries.js';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const LEVEL_AR = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة', unknown: 'غير معروفة', ready: 'جاهزة', blocked: 'متوقفة' };
const yn = (v) => (v === true ? 'نعم' : v === false ? 'لا' : 'غير معروف');

const Sec = ({ title, children }) => (
  <section className="space-y-1.5 border-t border-border pt-3">
    <h4 className="text-xs font-extrabold text-text">{title}</h4>
    {children}
  </section>
);
const Row = ({ k, v }) => <div className="flex gap-2 text-xs"><span className="w-28 shrink-0 text-muted">{k}</span><span className="text-text break-words min-w-0">{v || '—'}</span></div>;
const Missing = ({ children }) => <p className="text-[11px] text-muted border border-dashed border-border rounded-lg px-2.5 py-1.5">{children}</p>;

export default function LeadDetailsModal({ lead, leads, country, onClose, children }) {
  const C = COUNTRIES[country];
  const a = useMemo(() => assess(lead), [lead]);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);
  const srcs = sourcesOf(lead);
  const chain = useMemo(() => {
    const k = chainKeyOf(lead);
    return k ? chainGroups((leads || []).filter((l) => l.country === lead.country)).find((g) => g.members.some((m) => m.id === lead.id)) || null : null;
  }, [lead, leads]);
  const copy = async () => { try { await navigator.clipboard.writeText(msg); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked: text stays selectable */ } };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`تفاصيل ${lead.name}`} data-testid="lead-details" onClick={onClose}>
      <div className="bg-surface w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-4 space-y-3" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-text break-words">{lead.name}</h3>
            <p className="text-xs text-muted">{a.org.icon} {a.org.ar} · {APPROACH_AR[a.approach]} · {[C.ar, regionLabelAr(country, lead.province), cityLabelAr(country, lead.city), lead.district].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="text-lg px-2 text-muted hover:text-text">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs" data-testid="assessments">
          <div className="rounded-xl bg-surface-alt border border-border p-2"><b>المرحلة:</b> {STAGE_AR[a.stage]} <span className="text-muted">· حالة تقديرية — لم تُحفظ بعد</span></div>
          <div className="rounded-xl bg-surface-alt border border-border p-2"><b>أولوية التنفيذ:</b> {EXEC_AR[a.exec.key]}</div>
          <div className="rounded-xl bg-surface-alt border border-border p-2"><b>جودة المصدر:</b> {SOURCE_QUALITY_AR[a.source.level]}</div>
          <div className="rounded-xl bg-surface-alt border border-border p-2"><b>الفرصة:</b> {a.opportunity.value}/100</div>
          <div className="rounded-xl bg-surface-alt border border-border p-2"><b>سهولة الدخول:</b> {LEVEL_AR[a.ease.level]}</div>
          <div className="rounded-xl bg-surface-alt border border-border p-2"><b>جاهزية Lowe&apos;s:</b> {LEVEL_AR[a.readiness.level]}</div>
        </div>

        {children}

        <Sec title="لماذا هذه الأولوية؟">
          <ul className="list-disc pr-4 text-xs text-text space-y-0.5">
            {a.exec.why.map((w) => <li key={w}>{w}</li>)}
            {a.opportunity.reasons.map((w) => <li key={w} className="text-muted">{w}</li>)}
          </ul>
          {a.opportunity.unknowns.length > 0 && <p className="text-[11px] text-amber-700">مجهول (لا يُحتسب): {a.opportunity.unknowns.join(' · ')}</p>}
          <p className="text-[11px] text-muted">سهولة الدخول: {a.ease.reasons.join(' · ')} — جاهزية Lowe&apos;s: {a.readiness.reasons.join(' · ')}</p>
        </Sec>

        <Sec title="الخطوة التالية والمسؤول">
          <Row k="المسؤول الداخلي" v={a.owner || 'لا مسؤول بعد'} />
          <Row k="حالة التواصل" v={STATUS_LABELS[lead.status || 'not_contacted']} />
          <Row k="موعد المتابعة" v="غير مسجّل (يحتاج حقل next_action_due_at)" />
          <Row k="العائق الحالي" v={a.exec.key === 'blocked' ? a.exec.why.join(' · ') : 'غير مسجّل (يحتاج حقل blocker)'} />
        </Sec>

        <Sec title="الجهة وقنوات البيع">
          <Row k="الفئة" v={lead.category} />
          {lead.address && <Row k="العنوان" v={lead.address} />}
          <Row k="الشخص المسؤول عندهم" v={lead.contact_person || 'غير مسجّل'} />
          <Row k="تقبل بائعين" v={yn(lead.accepts_sellers)} />
          <Row k="تبيع تجميل/عناية" v={yn(lead.sells_beauty)} />
          <Row k="تغطية التوصيل" v={lead.delivery_coverage} />
          <Row k="تواجد Lowe's" v={lead.lowes_presence} />
          {lead.lowes_listing_url && <Row k="صفحتنا عندهم" v={<a className="underline text-teal" href={lead.lowes_listing_url} target="_blank" rel="noreferrer">فتح ↗</a>} />}
          {chain && <Row k="سلسلة محتملة" v={`${chain.members.length} فروع مسجّلة عندنا (تجميع مشتق — غير مؤكَّد)`} />}
          <Missing>رابط تسجيل البائع/المورّد، شروط التسجيل، المستندات المطلوبة والناقصة: غير مسجّلة بالنظام بعد (تحتاج حقولاً جديدة — migration مقترحة).</Missing>
        </Sec>

        <Sec title="بيانات الاتصال">
          <Row k="الهاتف" v={lead.phone} /><Row k="واتساب" v={lead.whatsapp} /><Row k="البريد" v={lead.email} />
          <Row k="الموقع" v={lead.website} /><Row k="إنستغرام" v={lead.instagram} /><Row k="فيسبوك" v={lead.facebook} />
          <p className="text-[11px] text-muted">مصدر كل معلومة اتصال على حدة غير مسجّل؛ المصادر العامة للجهة بالأسفل.</p>
        </Sec>

        <Sec title={`المصادر (${srcs.length}) · آخر تحقق ${fmt(lead.last_verified_at)}`}>
          <p className="text-[11px] text-muted">{a.source.freshness.ar} · {a.source.reasons.join(' · ')}</p>
          {srcs.length === 0 ? <Missing>لا مصدر مسجّل.</Missing> : <ul className="space-y-0.5 break-all">{srcs.map((u) => <li key={u} className="text-[11px]"><a className="underline" href={u} target="_blank" rel="noreferrer">{u}</a></li>)}</ul>}
          {lead.reason && <p className="text-xs text-text leading-relaxed">{lead.reason}</p>}
        </Sec>

        <Sec title="ملاحظات">
          <p className="text-xs text-text whitespace-pre-wrap">{lead.notes || 'لا ملاحظات.'}</p>
        </Sec>

        <Sec title="سجل مبسّط">
          <ul className="space-y-0.5" data-testid="timeline">{timelineOf(lead).map((e) => <li key={e.at + e.t} className="text-[11px]"><span className="text-muted">{fmt(e.at)}</span> — {e.t}</li>)}</ul>
          <p className="text-[10px] text-muted">مبني من الطوابع الموجودة فقط؛ سجل التغييرات الكامل (من غيّر ماذا ومتى) يحتاج جدول تدقيق — مقترح.</p>
        </Sec>

        <Sec title="رسالة تواصل">
          <button type="button" onClick={() => setMsg((m) => (m == null ? outreachMessage(lead, country) : null))} className="text-xs font-bold underline">{msg == null ? '✉️ عرض رسالة جاهزة' : 'إخفاء الرسالة'}</button>
          {msg != null && (
            <div className="space-y-1">
              <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={5} dir={country === 'AE' ? 'ltr' : 'rtl'} aria-label="نص رسالة التواصل" className="w-full text-xs bg-surface-alt border border-border rounded-xl px-2.5 py-2 text-text" />
              <div className="flex items-center gap-2"><button type="button" onClick={copy} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-teal text-navy">{copied ? '✓ تم النسخ' : 'نسخ'}</button><span className="text-[10px] text-muted">نسخ فقط — لا إرسال تلقائي أبداً.</span></div>
            </div>
          )}
        </Sec>
      </div>
    </div>
  );
}
