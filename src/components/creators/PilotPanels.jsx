// Pilot panels: results (descriptive, small-sample aware), issue log, decision report. Pure UI over services/creatorPilot.
import { useState, useMemo } from 'react';
import * as PL from '@services/creatorPilot';
import { download } from './uiData';
import { Pill, Btn } from './ui';

const fmtRate = r => (r.n ? `${r.pct}%` : '—');
const DIM_AR = { slot: 'الشريحة (Beauty/Lifestyle/UGC/Experts/Hair)', segment: 'القطاع (من المراجع)', creator_type: 'نوع المبدع', follower_tier: 'شريحة المتابعين', platform: 'المنصة', pilot_group: 'PR / UGC / Expert / Paid', contact_method: 'وسيلة التواصل' };

export function ResultsPanel({ members }) {
  const [dim, setDim] = useState('slot');
  const M = useMemo(() => PL.pilotMetrics(members), [members]);
  const B = useMemo(() => PL.breakdown(members, dim), [members, dim]);
  const c = M.counts, r = M.rates, d = M.days;
  const Row = ({ k, v, n }) => <tr className="border-t border-border"><td className="py-1 text-right">{k}</td><td className="font-bold">{v}</td><td className="text-muted">{n}</td></tr>;
  const rr = x => [fmtRate(x), x.n ? `${x.k}/${x.n}${x.low_sample ? ' · n<10' : ''}` : 'بلا مقام'];
  return (
    <div className="space-y-3 text-xs" dir="rtl">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-2 text-[11px]">التجربة لجمع الأدلة وليست حكماً: أي شريحة أقل من {PL.MIN_SAMPLE} متواصَل معهم = وصف فقط، ولا تُعتبر ناجحة أو فاشلة. المتابعون ليسوا معياراً.</div>
      <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
        {[['contacted', 'تواصل'], ['replied', 'ردّ'], ['interested', 'مهتم'], ['accepted', 'وافق'], ['address_received', 'عنوان'], ['product_sent', 'أُرسل'], ['product_received', 'استلم'], ['content_received', 'محتوى'], ['posted', 'نُشر'], ['declined', 'رفض'], ['no_response', 'بلا رد'], ['do_not_contact', 'لا تتواصل']].map(([k, l]) => <div key={k} className="bg-surface border border-border rounded-xl p-1.5"><p className="text-base font-extrabold text-text">{c[k]}</p><p className="text-muted">{l}</p></div>)}
      </div>
      <p className="text-[11px] text-muted">{M.selected} مختار · {c.still_open} مفتوح (تواصل بلا رد أو إغلاق)</p>
      <table className="w-full bg-surface border border-border rounded-xl">
        <thead><tr className="text-muted text-[10px]"><th className="text-right p-1">المؤشر</th><th>القيمة</th><th>العيّنة</th></tr></thead>
        <tbody>
          <Row k="1. نسبة الرد (ردّ/رفض ÷ تواصل)" v={rr(r.contact_response_rate)[0]} n={rr(r.contact_response_rate)[1]} />
          <Row k="2. الرد الإيجابي (مهتم فأعلى ÷ تواصل)" v={rr(r.positive_response_rate)[0]} n={rr(r.positive_response_rate)[1]} />
          <Row k="3. قبول الهدية (وافق ÷ تواصل)" v={rr(r.gift_acceptance_rate)[0]} n={rr(r.gift_acceptance_rate)[1]} />
          <Row k="4. إتمام العنوان (عنوان ÷ وافق)" v={rr(r.address_completion_rate)[0]} n={rr(r.address_completion_rate)[1]} />
          <Row k="5. إنجاز المحتوى (محتوى ÷ استلم المنتج)" v={rr(r.content_completion_rate)[0]} n={rr(r.content_completion_rate)[1]} />
          <Row k="6. النشر (نُشر ÷ محتوى)" v={rr(r.posting_rate)[0]} n={rr(r.posting_rate)[1]} />
          <Row k="7. متوسط الأيام للرد" v={d.avg_days_to_response.n ? d.avg_days_to_response.mean : '—'} n={`n=${d.avg_days_to_response.n}`} />
          <Row k="8. متوسط الأيام للمحتوى (من استلام المنتج)" v={d.avg_days_to_content.n ? d.avg_days_to_content.mean : '—'} n={`n=${d.avg_days_to_content.n}`} />
          <Row k="9. بلا رد (÷ تواصل)" v={rr(r.no_response_rate)[0]} n={rr(r.no_response_rate)[1]} />
        </tbody>
      </table>
      <div className="flex flex-wrap gap-1">{Object.keys(DIM_AR).map(k => <button key={k} type="button" onClick={() => setDim(k)} className={`text-[11px] px-2 py-1 rounded-lg border ${dim === k ? 'bg-navy text-white border-navy' : 'bg-surface border-border'}`}>{DIM_AR[k]}</button>)}</div>
      <div className="overflow-x-auto">
        <table className="w-full bg-surface border border-border rounded-xl text-center">
          <thead><tr className="text-muted text-[10px]"><th className="text-right p-1">المجموعة</th><th>مختار</th><th>تواصل</th><th>ردّ</th><th>مهتم</th><th>وافق</th><th>أُرسل</th><th>محتوى</th><th>نُشر</th><th>رد%</th><th /></tr></thead>
          <tbody>
            {Object.entries(B).map(([k, g]) => <tr key={k} className="border-t border-border"><td className="text-right p-1 font-bold" dir="ltr">{k}</td><td>{g.selected}</td><td>{g.contacted}</td><td>{g.replied}</td><td>{g.interested}</td><td>{g.accepted}</td><td>{g.product_sent}</td><td>{g.content_received}</td><td>{g.posted}</td><td>{fmtRate(g.contact_response_rate)}</td><td>{g.low_sample && <Pill>وصف فقط</Pill>}</td></tr>)}
            {Object.keys(B).length === 0 && <tr><td colSpan={11} className="p-3 text-muted">لا أعضاء بعد.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function IssuesPanel({ issues, creators, reviewer, onAdd }) {
  const [type, setType] = useState('ui_bug');
  const [text, setText] = useState('');
  const [cid, setCid] = useState('');
  const submit = () => {
    const i = PL.newIssue({ type, text, by: reviewer, creator_id: cid || null });
    if (!PL.validateIssue(i).ok) return;
    onAdd(i); setText('');
  };
  return (
    <div className="space-y-2 text-xs" dir="rtl">
      <div className="bg-surface border border-border rounded-2xl p-3 space-y-2">
        <p className="font-extrabold">سجّل ملاحظة تشغيلية أو مشكلة بالنظام (تدخل بالتقرير النهائي)</p>
        <div className="flex flex-wrap gap-2">
          <select value={type} onChange={e => setType(e.target.value)} className="bg-surface-alt border border-border rounded-lg px-2 py-1">{PL.ISSUE_TYPES.map(t => <option key={t} value={t}>{PL.ISSUE_TYPE_AR[t]}</option>)}</select>
          <select value={cid} onChange={e => setCid(e.target.value)} className="bg-surface-alt border border-border rounded-lg px-2 py-1 max-w-[180px]"><option value="">بدون مبدع محدد</option>{creators.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="اكتب بالتفصيل: شو صار، وين، وكيف بتعيدها" className="w-full bg-surface-alt border border-border rounded-xl px-2 py-1.5" />
        <Btn kind="primary" onClick={submit} disabled={!text.trim()}>حفظ الملاحظة</Btn>
      </div>
      {[...issues].reverse().map(i => <div key={i.id} className="bg-surface border border-border rounded-xl px-3 py-2"><div className="flex gap-2 items-center"><Pill>{PL.ISSUE_TYPE_AR[i.type]}</Pill><span className="text-muted text-[10px]">{i.by} · {i.at.slice(0, 16).replace('T', ' ')}</span></div><p className="mt-1 whitespace-pre-wrap">{i.text}</p></div>)}
      {issues.length === 0 && <p className="text-muted text-center py-4">لا ملاحظات بعد.</p>}
    </div>
  );
}

export function ReportPanel({ queue, reviews, members, issues, mergeRejected, strict }) {
  const md = useMemo(() => PL.pilotReportMarkdown(PL.pilotReport({ queue, reviews, members, issues, mergeRejected, strict })), [queue, reviews, members, issues, mergeRejected, strict]);
  return (
    <div className="space-y-2" dir="rtl">
      <div className="flex gap-2"><Btn kind="primary" onClick={() => download(`pilot-decision-report-${new Date().toISOString().slice(0, 10)}.md`, md, 'text/markdown;charset=utf-8')}>⬇ تنزيل التقرير (MD)</Btn><Btn onClick={() => navigator.clipboard?.writeText(md)}>نسخ</Btn></div>
      <pre className="text-[10px] leading-relaxed bg-surface border border-border rounded-xl p-3 overflow-x-auto whitespace-pre-wrap" dir="ltr">{md}</pre>
    </div>
  );
}
