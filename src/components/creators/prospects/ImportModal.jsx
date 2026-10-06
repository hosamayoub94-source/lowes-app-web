// رفع ملف Excel/CSV (منقول من الشاشة السابقة) + أعمدة v2 + لصق قائمة روابط من «اكتشاف».
// معاينة dry-run دائماً قبل الإدخال، والمكرر (نفس الحساب بأي كتابة: @x / x / رابط) لا يُضاف مرتين.
import { useEffect, useState } from 'react';
import { call, invalidate } from '@services/creatorProspectsApi';
import { fmtNum } from './constants';

// ---- header aliases for uploads (English + Arabic) ----
const ALIASES = {
  handle: ['handle', 'account', 'username', 'user', 'الحساب', 'اسمالمستخدم', 'instagram', 'حساب'],
  profile_url: ['url', 'profileurl', 'link', 'الرابط', 'رابط'],
  name: ['name', 'creator', 'displayname', 'الاسم', 'اسمالمبدع'],
  platform: ['platform', 'المنصة'],
  followers: ['followers', 'followerssnapshot', 'followercount', 'المتابعون', 'متابعين', 'عددالمتابعين'],
  engagement_pct: ['engagement', 'engagementsignal', 'er', 'engagementrate', 'التفاعل', 'نسبةالتفاعل'],
  location: ['location', 'الموقع'],
  country: ['country', 'الدولة'],
  governorate: ['governorate', 'state', 'province', 'المحافظة'],
  city: ['city', 'المدينة'],
  location_confidence: ['locationconfidence', 'ثقةالموقع'],
  creator_type: ['creatortype', 'type', 'نوعالمبدع', 'النوع'],
  content_types: ['contenttypes', 'content', 'أنواعالمحتوى', 'انواعالمحتوى'],
  skincare_focus: ['skincarefocus', 'focus', 'تخصصالعناية'],
  category: ['category', 'niche', 'الفئة', 'التصنيف'],
  priority: ['priority', 'الأولوية', 'الاولوية'],
  fit: ['fit', 'الملاءمة', 'سببالاستهداف'],
  evidence: ['evidence', 'evidencelevel', 'confidence', 'الثقة', 'مستوىالثقة'],
  source: ['source', 'المصدر'],
  source_url: ['sourceurl', 'رابطالمصدر'],
  verification_status: ['verificationstatus', 'dataquality', 'جودةالبيانات'],
  last_active_at: ['lastactive', 'lastactiveat', 'lastpost', 'آخرنشر'],
  bio: ['bio', 'النبذة'],
  tags: ['tags', 'الوسوم'],
  email: ['email', 'البريد'],
  phone: ['phone', 'الهاتف'],
  notes: ['notes', 'note', 'ملاحظات', 'ملاحظة'],
  owner: ['owner', 'assignedto', 'المسؤول'],
  status: ['status', 'الحالة'],
};
const keyNorm = (s) => String(s || '').replace(/﻿/g, '').toLowerCase().replace(/[\s_\-.]/g, '');
function mapRows(sheetRows) {
  if (!sheetRows.length) return [];
  const headers = Object.keys(sheetRows[0]);
  const map = {};
  headers.forEach((h) => { const k = keyNorm(h); for (const [field, al] of Object.entries(ALIASES)) if (al.map(keyNorm).includes(k)) { map[h] = field; break; } });
  return sheetRows.map((r) => { const o = {}; for (const [h, f] of Object.entries(map)) if (r[h] !== '' && r[h] != null && o[f] == null) o[f] = r[h]; return o; })
    .filter((o) => Object.keys(o).length > 0);
}
async function readFile(file) {
  const XLSX = await import('xlsx');
  const isCsv = /\.csv$/i.test(file.name);
  const wb = isCsv ? XLSX.read(await file.text(), { type: 'string' }) : XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // raw:false => formatted text ("3.2%", "12,500"): raw numbers would turn "3.2%" into 0.032 and silently store 0.03.
  return mapRows(XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }));
}
function downloadTemplate() {
  const csv = '﻿handle,name,platform,followers,engagement,country,governorate,city,location_confidence,creator_type,content_types,skincare_focus,source,source_url,verification_status,last_active,notes\n'
    + '@example_handle,اسم المبدع,instagram,12500,3.2%,SY,damascus,دمشق,medium,ugc,"ugc,reels",serums,Google Search,https://example.com/source,unverified,2026-10-01,ملاحظة اختيارية\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'creators-upload-template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ImportModal({ onClose, onDone, preset }) {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState(null);
  const [merge, setMerge] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  async function preview(parsed, name) {
    setErr(''); setReport(null); setDone(null); setFileName(name); setBusy(true);
    try {
      if (parsed.length === 0) throw new Error('الملف فاضي أو الأعمدة غير معروفة. حمّل القالب وانسخ بياناتك عليه.');
      if (parsed.length > 2000) throw new Error('الحد الأقصى 2000 صف بالمرة الواحدة.');
      setRows(parsed);
      const res = await call('import', { rows: parsed, dry_run: true });
      if (!res.ok) throw new Error(res.message || res.error);
      setReport(res);
    } catch (ex) { setErr(ex.message || 'تعذّرت قراءة الملف'); }
    setBusy(false);
  }
  useEffect(() => { if (preset) preview(preset.rows, preset.label); }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await preview(await readFile(file), file.name); } catch (ex) { setErr(ex.message || 'تعذّرت قراءة الملف'); }
  }
  async function confirm() {
    setBusy(true); setErr('');
    const res = await call('import', { rows, dry_run: false, merge, label: fileName });
    setBusy(false);
    if (!res.ok) { setErr(res.message || res.error); return; }
    invalidate(); setDone(res); onDone();
  }
  const s = report?.summary;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-2" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto p-4 space-y-3" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="font-black text-base">{preset ? 'إضافة مرشّحين من الاكتشاف' : 'رفع ملف (Excel / CSV)'}</h2><button onClick={onClose} className="text-gray-400 text-lg">✕</button></div>
        {!preset && (
          <>
            <div className="text-xs text-gray-600 leading-6">
              الأعمدة المعروفة (عربي أو إنجليزي): handle · name · followers · engagement · country · governorate · city · creator_type · content_types · skincare_focus · source · source_url · notes…
              العمود الوحيد الإجباري هو <b>handle</b> (أو رابط الحساب). المكرر ما بينضاف مرتين.
              <button onClick={downloadTemplate} className="text-blue-600 font-bold mr-2">⬇ تحميل القالب</button>
            </div>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={pick} className="text-sm" disabled={busy} />
          </>
        )}
        {busy && <div className="text-sm text-gray-500">جارٍ المعالجة…</div>}
        {err && <div className="rounded-lg bg-red-50 text-red-700 text-sm p-2">{err}</div>}
        {s && !done && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-xl bg-emerald-50 p-2"><div className="text-lg font-black text-emerald-700">{s.new}</div>جديد</div>
              <div className="rounded-xl bg-amber-50 p-2"><div className="text-lg font-black text-amber-700">{s.duplicate_existing}</div>مكرر (موجود)</div>
              <div className="rounded-xl bg-gray-100 p-2"><div className="text-lg font-black text-gray-700">{s.duplicate_in_file}</div>مكرر داخل الملف</div>
              <div className="rounded-xl bg-red-50 p-2"><div className="text-lg font-black text-red-700">{s.invalid}</div>غير صالح</div>
            </div>
            {s.dropped_v2_fields > 0 && <div className="rounded-lg bg-amber-50 text-amber-800 text-xs p-2">{s.dropped_v2_fields} صف فيه أعمدة جديدة (النوع، المحتوى…) ستُتجاهَل حتى تطبيق migration v2.</div>}
            {report.new.length > 0 && <details className="text-xs"><summary className="cursor-pointer font-bold">الجديد ({s.new})</summary><div className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">{report.new.map((n) => <div key={n.line}>@{n.handle} {n.name ? `· ${n.name}` : ''} {n.followers ? `· ${fmtNum(n.followers)}` : ''}</div>)}</div></details>}
            {report.duplicate_existing.length > 0 && <details className="text-xs"><summary className="cursor-pointer font-bold">المكرر الموجود ({s.duplicate_existing})</summary><div className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">{report.duplicate_existing.map((d) => <div key={d.line}>@{d.handle} {d.existing_name ? `· ${d.existing_name}` : ''} {d.deleted ? '· (محذوف)' : ''} {d.fills.length ? `· يكمّل: ${d.fills.join('، ')}` : ''}</div>)}</div></details>}
            {report.invalid.length > 0 && <details className="text-xs"><summary className="cursor-pointer font-bold text-red-700">غير الصالح ({s.invalid})</summary><div className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">{report.invalid.map((d) => <div key={d.line}>سطر {d.line}: {d.reason}</div>)}</div></details>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} /> للمكرر: املأ الحقول الفاضية فقط (ما بنمسح ولا بنبدّل شي موجود)</label>
            <button disabled={busy || s.new + (merge ? s.duplicate_existing : 0) === 0} onClick={confirm} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-40">استيراد {s.new} جديد</button>
          </>
        )}
        {done && <div className="rounded-xl bg-emerald-50 text-emerald-800 text-sm p-3">تم: أُضيف {done.inserted} جديد{done.merged ? `، وأُكمل ${done.merged} موجود` : ''}، وتُجوهل {done.summary.duplicate_existing + done.summary.duplicate_in_file} مكرر.</div>}
      </div>
    </div>
  );
}
