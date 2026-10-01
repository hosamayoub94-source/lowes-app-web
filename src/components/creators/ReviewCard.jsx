// The 8-question human review form (target 60–90 s). Pure UI over services/creatorReview.
import { useState, useMemo, useEffect, useRef } from 'react';
import * as V from '@services/creatorReview';
import { SYRIA_CITIES, tierOf } from '@services/creatorLogic';
import { CITY_AR, SEG_AR, CONTACT_AR, PLAT_AR, TRI_OPTS, fmtN, missingAr } from './uiData';
import { Pill, Btn, VerdictPill, Seg, Q } from './ui';

export default function ReviewCard({ item, prior, reviewer, position, strict, onSave, onSkip }) {
  const [draft, setDraft] = useState(() => ({ ...V.emptyReview(item.id, reviewer), ...(prior || {}), reviewer }));
  const [errors, setErrors] = useState([]);
  const [sec, setSec] = useState(0);
  const started = useRef(Date.now());
  useEffect(() => { const t = setInterval(() => setSec(Math.floor((Date.now() - started.current) / 1000)), 1000); return () => clearInterval(t); }, []);
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const [videoText, setVideoText] = useState((prior?.video_urls || []).join('\n'));
  const videoUrls = useMemo(() => videoText.split(/\s+/).map(s => s.trim()).filter(Boolean), [videoText]);
  const live = useMemo(() => ({ ...draft, video_urls: videoUrls }), [draft, videoUrls]);
  const verdict = useMemo(() => V.deriveVerdict(live, item, { strict }), [live, item, strict]);
  const comp = useMemo(() => V.reviewCompleteness(live), [live]);
  const existingBiz = (item.contacts || []).filter(c => !/_dm$|messenger/.test(c.type));
  const submit = () => {
    const review = { ...live, seconds: sec, reviewed_at: new Date().toISOString(), reviewer };
    const v = V.validateReview(review);
    if (!v.ok) { setErrors(v.errors); return; }
    setErrors([]); onSave(review);
  };
  // One-tap rejection: a clearly unsuitable account is saved as Not Relevant without the 8 answers (the verdict rules reject on active=no / fit=no).
  const QUICK = { inactive: ['غير نشط', { active: 'no', slow_reason: 'no_recent_posts' }], private: ['خاص / مقفول', { active: 'no', slow_reason: 'private_or_locked' }], unfit: ['غير مناسب للبراند', { fit_lowes: 'no' }] };
  const quickReject = kind => {
    const [label, patch] = QUICK[kind];
    const review = { ...V.emptyReview(item.id, reviewer), ...patch, seconds: sec, reviewed_at: new Date().toISOString(), reviewer, notes: `رفض سريع: ${label}` };
    const v = V.validateReview(review);
    if (!v.ok) { setErrors(v.errors); return; }
    setErrors([]); onSave(review);
  };
  const addContact = () => set('contacts', [...(draft.contacts || []), { type: 'whatsapp', value: '', source_url: item.platforms[0]?.profile_url || '' }]);
  const upContact = (i, patch) => set('contacts', draft.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const timeCls = sec <= 60 ? 'text-green-700' : sec <= V.REVIEW_SECONDS_TARGET ? 'text-amber-600' : 'text-red-600';
  const ans = comp.answered;
  const toggleHard = q => set('hard_fields', draft.hard_fields.includes(q) ? draft.hard_fields.filter(x => x !== q) : [...draft.hard_fields, q]);
  return (
    <div className="space-y-3" dir="rtl">
      <div className="bg-surface border border-border rounded-2xl p-3 space-y-2">
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <p className="text-base font-extrabold text-text">{item.display_name}</p>
            <p className="text-[11px] text-muted">{position} · طابور {item.queue_tier} · {tierOf(item.follower_count)?.label || 'متابعون غير معروفين'} · {fmtN(item.follower_count)} متابع</p>
          </div>
          <div className={`text-lg font-extrabold tabular-nums ${timeCls}`} title="هدف المراجعة 60–90 ثانية">{sec}s</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {item.platforms.map(p => <a key={p.profile_url} href={p.profile_url} target="_blank" rel="noreferrer" className="text-[12px] font-bold text-white bg-navy rounded-lg px-3 py-1.5" dir="ltr">↗ {PLAT_AR[p.platform] || p.platform} @{p.handle}</a>)}
        </div>
        <div className="flex flex-wrap gap-1">
          {(item.pools || []).map(pl => <Pill key={pl}>{pl.replace('_pool', '').toUpperCase()}</Pill>)}
          {item.main_category && <Pill>{item.main_category}</Pill>}
          <Pill>ثقة البيانات {item.verification_level}</Pill>
          <Pill>جمهور سوريا {item.audience_syria_pct == null ? 'غير معروف' : item.audience_syria_pct + '%'}</Pill>
          <Pill>النشاط (مصدر قديم) {item.activity_status}</Pill>
        </div>
        {item.bio && <p className="text-xs text-text whitespace-pre-wrap bg-surface-alt rounded-xl p-2" dir="auto">{item.bio}</p>}
        {item.sample_posts?.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-muted">منشورات عامة للفحص السريع:</p>
            {item.sample_posts.slice(0, 4).map(sp => <a key={sp.url} href={sp.url} target="_blank" rel="noreferrer" className="block text-[11px] text-blue-600 truncate" dir="auto">↗ {sp.date ? sp.date + ' — ' : ''}{sp.caption || sp.url}</a>)}
          </div>
        )}
        {existingBiz.length > 0 && <p className="text-[11px] text-text">تواصل عام موجود بالبحث: {existingBiz.map(c => `${CONTACT_AR[c.type] || c.type}: ${c.value}`).join(' · ')}</p>}
      </div>

      <Q n={1} title="هل الحساب فعلاً نشط؟" hint="افتح البروفايل: نشط = نشر خلال آخر 90 يوماً." done={ans.q1}>
        <Seg value={draft.active} onChange={v => set('active', v)} options={TRI_OPTS} />
        <label className="text-[11px] text-muted block">تاريخ آخر منشور شفته <input type="date" value={draft.last_post_seen || ''} onChange={e => set('last_post_seen', e.target.value || null)} className="mx-2 bg-surface-alt border border-border rounded-lg px-2 py-1 text-xs" /></label>
      </Q>
      <Q n={2} title="هل المحتوى مناسب لـLOWE'S؟ + القطاع" hint="عناية بالبشرة/جمال/لايف ستايل نسائي… وذوق يليق بالبراند." done={ans.q2}>
        <Seg value={draft.fit_lowes} onChange={v => set('fit_lowes', v)} options={[['yes', 'نعم'], ['partial', 'جزئياً'], ['no', 'لا'], ['unsure', 'غير متأكد']]} />
        <Seg value={draft.segment} onChange={v => set('segment', v)} options={V.SEGMENTS.map(s => [s, SEG_AR[s]])} />
      </Q>
      <Q n={3} title="هل يصوّر وجهه / يتكلم / ريفيو / أنبوكسينغ؟" hint="الفحص الوحيد اللي بيفتح UGC Ready. أي «نعم» يحتاج جودة + رابط فيديو شاهدته." done={ans.q3}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div><p className="font-bold mb-1">وجهه ظاهر</p><Seg value={draft.face_on_camera} onChange={v => set('face_on_camera', v)} options={TRI_OPTS} /></div>
          <div><p className="font-bold mb-1">يتكلم للكاميرا</p><Seg value={draft.talks_to_camera} onChange={v => set('talks_to_camera', v)} options={TRI_OPTS} /></div>
          <div><p className="font-bold mb-1">يعمل ريفيو</p><Seg value={draft.does_review} onChange={v => set('does_review', v)} options={TRI_OPTS} /></div>
          <div><p className="font-bold mb-1">أنبوكسينغ</p><Seg value={draft.does_unboxing} onChange={v => set('does_unboxing', v)} options={TRI_OPTS} /></div>
        </div>
        <p className="text-xs font-bold">جودة الفيديو (إضاءة/صوت/أسلوب)</p>
        <Seg value={draft.ugc_quality} onChange={v => set('ugc_quality', v)} options={[['high', 'عالية'], ['medium', 'متوسطة'], ['low', 'ضعيفة'], ['unsure', 'غير متأكد']]} />
        <textarea value={videoText} onChange={e => setVideoText(e.target.value)} rows={2} dir="ltr" placeholder="روابط فيديو/ريلز شاهدتها (رابط بكل سطر)" className="w-full bg-surface-alt border border-border rounded-xl px-2 py-1.5 text-xs" />
      </Q>
      <Q n={4} title="المدينة (كما تظهر عند المبدع نفسه)" hint="اختر «غير معروف» فقط إذا بحثت ولم تجد." done={ans.q4}>
        <select value={draft.city || ''} onChange={e => set('city', e.target.value || null)} className="bg-surface-alt border border-border rounded-lg px-2 py-1.5 text-xs">
          <option value="">— لم تُحدَّد —</option><option value="unknown">غير معروف (تحققت)</option>{SYRIA_CITIES.filter(c => c !== 'unknown').map(c => <option key={c} value={c}>{CITY_AR[c]}</option>)}
        </select>
        {item.creator_city && <span className="mx-2 text-[11px] text-muted">المصدر قال: {CITY_AR[item.creator_city] || item.creator_city} <button type="button" className="text-blue-600 font-bold" onClick={() => set('city', item.creator_city)}>اعتمد</button></span>}
      </Q>
      <Q n={5} title="تواصل عام (منشور في البروفايل فقط)" hint="لا تضف رقماً/إيميلاً شخصياً غير منشور. لازم رابط المصدر." done={ans.q5}>
        {(draft.contacts || []).map((c, i) => (
          <div key={i} className="grid grid-cols-12 gap-1">
            <select value={c.type} onChange={e => upContact(i, { type: e.target.value })} className="col-span-3 bg-surface-alt border border-border rounded-lg px-1 py-1 text-xs">{V.CONTACT_TYPES.map(t => <option key={t} value={t}>{CONTACT_AR[t]}</option>)}</select>
            <input value={c.value} onChange={e => upContact(i, { value: e.target.value })} dir="ltr" placeholder="القيمة" className="col-span-4 bg-surface-alt border border-border rounded-lg px-2 py-1 text-xs" />
            <input value={c.source_url} onChange={e => upContact(i, { source_url: e.target.value })} dir="ltr" placeholder="رابط المصدر" className="col-span-4 bg-surface-alt border border-border rounded-lg px-2 py-1 text-xs" />
            <button type="button" onClick={() => set('contacts', draft.contacts.filter((_, j) => j !== i))} className="col-span-1 text-red-500 text-xs">✕</button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 items-center">
          <Btn onClick={addContact}>+ وسيلة تواصل</Btn>
          {existingBiz.length > 0 && <label className="text-[11px] flex items-center gap-1"><input type="checkbox" checked={draft.contact_confirmed} onChange={e => set('contact_confirmed', e.target.checked)} />أؤكد التواصل الموجود أعلاه (تحققت منه بالبروفايل)</label>}
          <label className="text-[11px] flex items-center gap-1"><input type="checkbox" checked={draft.no_public_contact} disabled={(draft.contacts || []).length > 0} onChange={e => set('no_public_contact', e.target.checked)} />لا يوجد تواصل عام (فقط الرسائل الخاصة)</label>
        </div>
      </Q>
      <Q n={6} title="هل ظاهر أنه يقبل PR أو تعاونات؟" hint="«هدية ظاهرة» = شفت منتج مُهدى/PR package بمنشوره — لازم رابط." done={ans.q6}>
        <Seg value={draft.pr_signal} onChange={v => set('pr_signal', v)} options={[['none', 'لا شيء ظاهر'], ['open_to_collab', 'منفتح على تعاونات'], ['gifted_seen', 'هدية ظاهرة'], ['unsure', 'غير متأكد']]} />
        {draft.pr_signal === 'gifted_seen' && <input value={draft.pr_evidence_url || ''} onChange={e => set('pr_evidence_url', e.target.value || null)} dir="ltr" placeholder="رابط المنشور الذي يثبت الهدية" className="w-full bg-surface-alt border border-border rounded-lg px-2 py-1.5 text-xs" />}
      </Q>
      <Q n={7} title="مناسب للريتينول / سكين كير تحديداً؟" done={ans.q7}>
        <Seg value={draft.skincare_fit} onChange={v => set('skincare_fit', v)} options={[['yes', 'نعم'], ['maybe', 'ربما'], ['no', 'لا'], ['unsure', 'غير متأكد']]} />
      </Q>
      <Q n={8} title="القرار: هدية؟ UGC؟ مدفوع؟" done={ans.q8}>
        <Seg value={draft.action} onChange={v => set('action', v)} options={[['gift', 'نرسل هدية'], ['ugc', 'نطلب UGC'], ['paid', 'استفسار مدفوع'], ['none', 'لا شيء'], ['unsure', 'غير متأكد']]} />
        <textarea value={draft.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="ملاحظات (اختياري)" className="w-full bg-surface-alt border border-border rounded-xl px-2 py-1.5 text-xs" />
      </Q>
      <section className="bg-surface border border-dashed border-border rounded-2xl p-3 space-y-2">
        <p className="text-[12px] font-extrabold text-text">ملاحظات تشغيلية (تدخل في تقرير التجربة)</p>
        <div className="flex flex-wrap gap-2 text-[11px] items-center">
          <select value={draft.slow_reason || ''} onChange={e => set('slow_reason', e.target.value || null)} className="bg-surface-alt border border-border rounded-lg px-2 py-1"><option value="">ما أبطأني: لا شيء</option>{V.SLOW_REASONS.map(r => <option key={r} value={r}>{V.SLOW_REASON_AR[r]}</option>)}</select>
          <select value={draft.helpful_source || ''} onChange={e => set('helpful_source', e.target.value || null)} className="bg-surface-alt border border-border rounded-lg px-2 py-1"><option value="">أكثر شي ساعدني…</option>{V.HELPFUL_SOURCES.map(r => <option key={r} value={r}>{r}</option>)}</select>
        </div>
        <p className="text-[11px] text-muted">أسئلة كانت صعبة التحقق:</p>
        <div className="flex flex-wrap gap-1">{V.HARD_FIELDS.map(q => <button key={q} type="button" onClick={() => toggleHard(q)} className={`text-[11px] px-2 py-1 rounded-lg border ${draft.hard_fields.includes(q) ? 'bg-amber-100 border-amber-300 font-bold' : 'bg-surface border-border'}`}>{q.toUpperCase()}</button>)}</div>
      </section>

      <div className="sticky bottom-2 bg-surface border border-border rounded-2xl p-3 space-y-2 shadow-card">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`text-[11px] font-bold ${comp.complete ? 'text-green-700' : 'text-amber-700'}`}>{comp.done}/8 أسئلة</span>
          <span className="text-[11px] text-muted">الحكم المتوقع:</span>
          {verdict.labels.map(l => <VerdictPill key={l} v={l} />)}
          {verdict.missing.length > 0 && <span className="text-[11px] text-amber-700">ناقص: {verdict.missing.map(missingAr).join(' · ')}</span>}
        </div>
        {errors.length > 0 && <p className="text-[11px] text-red-600" dir="ltr">{errors.join(' · ')}</p>}
        <div className="flex flex-wrap gap-2 items-center"><Btn kind="good" onClick={submit}>حفظ + التالي</Btn><Btn onClick={onSkip}>تخطي</Btn>
          <span className="text-[11px] text-muted ms-auto">رفض سريع (بدون الأسئلة):</span>
          {Object.entries(QUICK).map(([k, [label]]) => <Btn key={k} kind="danger" onClick={() => quickReject(k)} title="يُحفظ كـ Not Relevant ويمكن تعديله لاحقاً">{label}</Btn>)}
        </div>
      </div>
    </div>
  );
}
