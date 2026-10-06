// «اكتشاف» — يساعد الفريق يلاقي حسابات جديدة بدون scraping: Queries جاهزة تفتح بحثاً عاماً، ثم إضافة المرشّح مع مصدره.
// كل حساب جديد يبدأ «مُكتشَف» + «غير متحقَّق» — ما بيصير متحقَّق تلقائياً.
import { useMemo, useState } from 'react';
import { buildDiscoveryQueries, discoveryHashtags, parsePastedCandidates } from '@services/creatorDiscovery';
import { addProspect } from '@services/creatorProspectsApi';
import { GOVERNORATES, COUNTRIES, CREATOR_TYPES, TYPE_AR, SOURCES } from './constants';

const inputCls = 'border rounded-lg px-2 py-1.5 text-sm w-full';

export default function DiscoveryPanel({ schema, onAdded, onImport }) {
  const v2 = schema === 'v2';
  const country = COUNTRIES.find((c) => c.enabled)?.code || 'SY';
  const [gov, setGov] = useState('');
  const [showAll, setShowAll] = useState(false);
  const queries = useMemo(() => buildDiscoveryQueries({ country, governorate: gov }), [country, gov]);
  const tags = useMemo(() => discoveryHashtags(country), [country]);
  const [c, setC] = useState({ handle: '', name: '', source: 'Google Search', source_url: '', governorate: '', creator_type: '', notes: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState('');
  const [pasteSource, setPasteSource] = useState('Google Search');
  const parsed = useMemo(() => parsePastedCandidates(paste), [paste]);
  const set = (k, v) => setC((p) => ({ ...p, [k]: v }));

  async function addOne(e) {
    e.preventDefault();
    if (!c.handle.trim() || !c.source.trim()) { setMsg({ err: true, t: 'الحساب والمصدر إلزاميان.' }); return; }
    setBusy(true); setMsg(null);
    const row = { handle: c.handle, name: c.name || null, status: 'discovered', notes: c.notes || null };
    if (v2) Object.assign(row, { source: c.source, source_url: c.source_url || null, country, governorate: c.governorate || null, location_confidence: c.governorate ? 'low' : null, creator_type: c.creator_type || null, verification_status: 'unverified' });
    else row.source = [c.source, c.source_url].filter(Boolean).join(' — ');
    const res = await addProspect(row, schema, 'discovery');
    setBusy(false);
    if (!res.ok) { setMsg({ err: true, t: res.error === 'duplicate' ? `موجود أصلاً${res.duplicate?.name ? `: ${res.duplicate.name}` : ''}${res.duplicate?.deleted ? ' (محذوف)' : ''}` : res.message || res.error }); return; }
    setMsg({ t: `أُضيف @${res.row.handle} كـ«مُكتشَف» — راجعه قبل اعتماده.` });
    setC((p) => ({ ...p, handle: '', name: '', source_url: '', notes: '' }));
    onAdded(res.row);
  }
  function importPasted() {
    const rows = parsed.candidates.map((x) => ({ handle: x.handle, platform: x.platform, source: pasteSource, status: 'discovered', country, verification_status: 'unverified' }));
    onImport({ rows, label: `اكتشاف — ${pasteSource}` });
  }
  const shown = showAll ? queries : queries.slice(0, 18);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-black text-sm ml-auto">1) ابحث — Queries جاهزة (تفتح بتبويب جديد)</h3>
          <select value={gov} onChange={(e) => setGov(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs">
            <option value="">كل سوريا</option>
            {(GOVERNORATES[country] || []).map((g) => <option key={g.slug} value={g.slug}>{g.ar}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {shown.map((x) => <a key={x.q} href={x.url} target="_blank" rel="noopener noreferrer" className="px-2 py-1 rounded-lg border text-xs hover:bg-gray-50">🔎 {x.label}</a>)}
          {queries.length > shown.length && <button onClick={() => setShowAll(true)} className="px-2 py-1 text-xs text-blue-700 font-bold">+ {queries.length - shown.length} أخرى</button>}
        </div>
        <div className="flex flex-wrap gap-1.5 items-center pt-1">
          <span className="text-xs text-gray-500">هاشتاغات Instagram:</span>
          {tags.map((t) => <a key={t.tag} href={t.url} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 rounded-full bg-pink-50 text-pink-800 text-xs" dir="auto">#{t.tag}</a>)}
        </div>
        <p className="text-[11px] text-gray-500 leading-5">قبل الإضافة تأكد: حساب شخص حقيقي (مو براند/متجر/صفحة إعادة نشر)، الحساب عام ويفتح، وفي دليل إنه بسوريا (Bio، الموقع، المحتوى، رقم سوري عام). لا تكتب متابعين أو تفاعل بالتقدير — اتركها فارغة.</p>
      </section>

      <section className="rounded-xl border bg-white p-3">
        <h3 className="font-black text-sm mb-2">2) أضف مرشّحاً واحداً</h3>
        <form onSubmit={addOne} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <label className="text-xs text-gray-600">الحساب (@ أو رابط) *<input className={inputCls} value={c.handle} onChange={(e) => set('handle', e.target.value)} dir="ltr" /></label>
          <label className="text-xs text-gray-600">الاسم<input className={inputCls} value={c.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label className="text-xs text-gray-600">المصدر *<select className={inputCls} value={c.source} onChange={(e) => set('source', e.target.value)}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="text-xs text-gray-600 col-span-2 sm:col-span-1">رابط المصدر<input className={inputCls} value={c.source_url} onChange={(e) => set('source_url', e.target.value)} dir="ltr" placeholder="رابط نتيجة البحث / الدليل" /></label>
          <label className="text-xs text-gray-600">المحافظة (إن عُرفت)<select disabled={!v2} className={inputCls} value={c.governorate} onChange={(e) => set('governorate', e.target.value)}><option value="">غير معروفة</option>{(GOVERNORATES[country] || []).map((g) => <option key={g.slug} value={g.slug}>{g.ar}</option>)}</select></label>
          <label className="text-xs text-gray-600">النوع (إن ظهر)<select disabled={!v2} className={inputCls} value={c.creator_type} onChange={(e) => set('creator_type', e.target.value)}><option value="">غير مصنّف</option>{CREATOR_TYPES.map((t) => <option key={t} value={t}>{TYPE_AR[t]}</option>)}</select></label>
          <label className="text-xs text-gray-600 col-span-2">ملاحظة (ليش لفتنا؟)<input className={inputCls} value={c.notes} onChange={(e) => set('notes', e.target.value)} /></label>
          <div className="flex items-end"><button disabled={busy} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold w-full disabled:opacity-50">{busy ? '…' : '+ إضافة كمُكتشَف'}</button></div>
        </form>
        {msg && <div className={`mt-2 rounded-lg text-sm p-2 ${msg.err ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>{msg.t}</div>}
      </section>

      <section className="rounded-xl border bg-white p-3 space-y-2">
        <h3 className="font-black text-sm">3) أو الصق قائمة روابط/حسابات (سطر لكل حساب)</h3>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} dir="ltr" className={inputCls} placeholder={'https://instagram.com/creator1/\n@creator2\ncreator3'} />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span>{parsed.candidates.length} حساب صالح{parsed.invalid.length ? ` · ${parsed.invalid.length} غير صالح (روابط منشورات أو نص)` : ''}</span>
          <select value={pasteSource} onChange={(e) => setPasteSource(e.target.value)} className="border rounded-lg px-2 py-1">{SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
          <button disabled={!parsed.candidates.length} onClick={importPasted} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white font-bold disabled:opacity-40 mr-auto">معاينة وإضافة ←</button>
        </div>
      </section>
    </div>
  );
}
