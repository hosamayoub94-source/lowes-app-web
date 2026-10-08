// ImportLeadsModal — استيراد دفعة بحث لدولة غير سوريا (D-119). أدمن فقط (الزر مخفي لغيره، والخادم يرفض غيره).
// 1) اختيار ملف (JSON/CSV/Excel) أو لصق JSON  ←  2) «معاينة» = dry_run: لا يُحفظ شيء  ←
// 3) تحديد الصفوف المطلوبة (الافتراضي: ولا صف)  ←  4) إقرار صريح أنها غير متحقق منها  ←  5) «حفظ المحدد».
// لا حفظ تلقائي أبداً: الحفظ ضغطة منفصلة، ويرسل الصفوف المحدّدة فقط، والخادم يعيد كل الفحوص قبل الإدراج.
import { useState, useMemo } from 'react';
import {
  COUNTRIES, regionLabelAr,
} from '../../../supabase/functions/_shared/countries.js';
import {
  rowsFromFile, rowsFromJsonText, buildPreview, rowsToSave, canSave, isWeakSource,
} from '@services/b2bImport';
import { importLeads } from '@services/b2bLeadsApi';

const fmtDate = (d) => (d ? String(d).slice(0, 10) : '—');
const inputCls = 'w-full bg-surface-alt border border-border rounded-xl px-3 py-2 text-sm text-text focus:outline-none focus:border-teal transition';

function Section({ title, tone = 'muted', children, count }) {
  const toneCls = {
    muted: 'text-muted', green: 'text-green-700', amber: 'text-amber-700', red: 'text-red-600',
  }[tone];
  return (
    <div className="space-y-1.5">
      <p className={`text-xs font-extrabold ${toneCls}`}>{title} ({count})</p>
      {children}
    </div>
  );
}

export default function ImportLeadsModal({ country, onClose, onSaved }) {
  const C = COUNTRIES[country];
  const [rows, setRows] = useState(null);          // الصفوف المقروءة من الملف/اللصق
  const [fileName, setFileName] = useState('');
  const [pasted, setPasted] = useState('');
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const reset = () => { setRows(null); setPreview(null); setSelected(new Set()); setAck(false); setResult(null); setError(null); };

  const runPreview = async (parsedRows) => {
    setBusy(true); setError(null); setPreview(null); setSelected(new Set()); setAck(false); setResult(null);
    try {
      const report = await importLeads(country, parsedRows, true);      // dry_run — لا حفظ
      setRows(parsedRows);
      setPreview(buildPreview(parsedRows, report));
    } catch (e) {
      setError(e?.message || 'تعذّرت المعاينة');
    } finally { setBusy(false); }
  };

  const onPickFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name); setError(null);
    try { await runPreview(await rowsFromFile(f)); }
    catch (err) { setError(err?.message || 'تعذّرت قراءة الملف'); }
    e.target.value = '';
  };

  const onPreviewPasted = async () => {
    setFileName('لصق'); setError(null);
    try { await runPreview(rowsFromJsonText(pasted)); }
    catch (err) { setError(err?.message || 'تعذّرت قراءة النص'); }
  };

  const toggle = (line) => setSelected((s) => { const n = new Set(s); if (n.has(line)) n.delete(line); else n.add(line); return n; });
  const allNewLines = useMemo(() => (preview ? preview.newItems.map((i) => i.line) : []), [preview]);

  const save = async () => {
    if (!preview || !canSave(selected.size, ack)) return;
    setBusy(true); setError(null);
    try {
      const toSave = rowsToSave(preview, [...selected]);
      const res = await importLeads(country, toSave, false);            // حفظ فعلي: المحدّد فقط
      setResult(res);
      onSaved?.();
    } catch (e) {
      setError(e?.message || 'تعذّر الحفظ — لم يُحفظ شيء');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" dir="rtl" data-testid="import-modal">
      <div className="bg-surface rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div>
            <h3 className="text-base font-extrabold text-text">استيراد ليدز {C.ar} (أدمن)</h3>
            <p className="text-[11px] text-muted mt-0.5">معاينة أولاً: لا يُحفظ شيء قبل أن تختار الصفوف وتؤكّد.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt text-muted hover:text-text flex items-center justify-center text-lg transition shrink-0">✕</button>
        </div>

        <div className="px-5 pb-5 space-y-4 overflow-y-auto">
          {!result && (
            <div className="space-y-2">
              <label className="block">
                <span className="text-xs font-bold text-muted">ملف (JSON / CSV / Excel — حتى 500 صف)</span>
                <input type="file" accept=".json,.csv,.xlsx,.xls" onChange={onPickFile} disabled={busy}
                  className="mt-1 block w-full text-xs text-text file:ml-2 file:rounded-lg file:border file:border-border file:bg-surface-alt file:px-3 file:py-1.5 file:text-xs file:font-bold" />
              </label>
              <details className="text-xs">
                <summary className="cursor-pointer font-bold text-muted select-none">أو الصق JSON</summary>
                <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={4} dir="ltr" placeholder='{ "rows": [ ... ] }'
                  className={`${inputCls} mt-1.5 font-mono`} aria-label="لصق JSON" />
                <button onClick={onPreviewPasted} disabled={busy || !pasted.trim()}
                  className="mt-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-teal text-navy disabled:opacity-50">معاينة النص</button>
              </details>
              <p className="text-[11px] text-muted">الحقول المطلوبة بكل صف: <b>name</b> · <b>province</b> ({C.regionLabel}) · <b>lead_type</b> (physical/online) · <b>source_urls</b> (روابط مفصولة بـ|) · <b>last_verified_at</b>. أي حقل مجهول يُترك فارغاً.</p>
            </div>
          )}

          {busy && <div className="h-10 bg-surface-alt animate-pulse rounded-xl" aria-label="جارٍ العمل" />}
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2" role="alert">{error}</p>}

          {preview && !result && (
            <div className="space-y-4" data-testid="import-preview">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                {[['الملف', preview.summary.total], ['جديد', preview.summary.new], ['مكرّر بالقاعدة', preview.summary.duplicate_existing], ['مكرّر بالملف', preview.summary.duplicate_in_file], ['غير صالح', preview.summary.invalid]].map(([l, v]) => (
                  <div key={l} className="bg-surface-alt border border-border rounded-xl px-2 py-2">
                    <p className="text-base font-extrabold text-text">{v}</p>
                    <p className="text-[10px] font-bold text-muted">{l}</p>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                ⚠️ بيانات بحثية، وأغلبها بمصدر واحد أو ثانوي. كل صف يدخل «غير متحقق» من وجود Lowe&apos;s، وبحالة «لم يُتَّصل». اختر فقط ما تريد إدخاله.
              </p>

              <Section title="جديد — يمكن إدخاله" tone="green" count={preview.newItems.length}>
                {preview.newItems.length === 0 ? <p className="text-xs text-muted">لا يوجد صف جديد.</p> : (
                  <>
                    <div className="flex gap-2">
                      <button onClick={() => setSelected(new Set(allNewLines))} className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-surface-alt border border-border">تحديد الكل</button>
                      <button onClick={() => setSelected(new Set())} className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-surface-alt border border-border">إلغاء التحديد</button>
                      <span className="text-[11px] text-muted self-center">المحدّد: {selected.size}</span>
                    </div>
                    <ul className="space-y-1.5">
                      {preview.newItems.map((i) => {
                        const r = i.row;
                        const urls = String(r.source_urls || '').split('|').map((u) => u.trim()).filter(Boolean);
                        return (
                          <li key={i.line} className={`border rounded-xl px-3 py-2 ${selected.has(i.line) ? 'border-teal bg-teal/5' : 'border-border'}`}>
                            <label className="flex items-start gap-2 cursor-pointer">
                              <input type="checkbox" checked={selected.has(i.line)} onChange={() => toggle(i.line)} className="mt-1" aria-label={`اختيار ${i.name}`} />
                              <span className="flex-1 min-w-0">
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-extrabold text-text">{i.name}</span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-border text-muted">{regionLabelAr(country, i.province)}</span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-border text-muted">{r.category || '—'}</span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-dashed border-border text-slate-500">Lowe&apos;s: غير متحقق</span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-border text-muted">أولوية {r.priority || 'D'}</span>
                                  {isWeakSource(r) && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">مصدر ضعيف/ثانوي</span>}
                                </span>
                                {r.reason && <span className="block text-[11px] text-muted mt-1 leading-relaxed">{r.reason}</span>}
                                <span className="block text-[10px] text-muted mt-1 break-all">
                                  تحقق: {fmtDate(r.last_verified_at)} · المصادر ({urls.length}):{' '}
                                  {urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="underline ml-1">{u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a>)}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </Section>

              {preview.duplicateExisting.length > 0 && (
                <Section title="مكرّر — موجود بالقاعدة (لن يُدخل)" tone="amber" count={preview.duplicateExisting.length}>
                  <ul className="text-[11px] text-muted space-y-0.5">{preview.duplicateExisting.map((d) => <li key={`e${d.line}`}>س{d.line}: {d.name} ← {d.existing?.name}</li>)}</ul>
                </Section>
              )}
              {preview.duplicateInFile.length > 0 && (
                <Section title="مكرّر داخل الملف (لن يُدخل)" tone="amber" count={preview.duplicateInFile.length}>
                  <ul className="text-[11px] text-muted space-y-0.5">{preview.duplicateInFile.map((d) => <li key={`f${d.line}`}>س{d.line}: {d.name}</li>)}</ul>
                </Section>
              )}
              {preview.invalid.length > 0 && (
                <Section title="غير صالح (لن يُدخل — صحّحه بالملف)" tone="red" count={preview.invalid.length}>
                  <ul className="text-[11px] text-red-600 space-y-0.5">{preview.invalid.map((d) => <li key={`i${d.line}`}>س{d.line}: {d.name || '—'} — {d.error}</li>)}</ul>
                </Section>
              )}

              <div className="space-y-2 border-t border-border pt-3">
                <label className="flex items-start gap-2 text-xs text-text cursor-pointer">
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
                  <span>أفهم أن هذه الصفوف <b>غير متحقق منها</b> ومصادرها قد تكون ثانوية، وأن «غير متحقق» لا يعني «غير موجودين».</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button onClick={save} disabled={busy || !canSave(selected.size, ack)}
                    className="text-sm font-extrabold px-4 py-2 rounded-xl bg-teal text-navy disabled:opacity-40" data-testid="import-save">
                    حفظ المحدد ({selected.size})
                  </button>
                  <button onClick={() => { reset(); setFileName(''); }} disabled={busy} className="text-sm font-bold px-4 py-2 rounded-xl bg-surface-alt border border-border text-text">إعادة</button>
                </div>
                <p className="text-[10px] text-muted">الملف: {fileName || '—'} · {rows?.length ?? 0} صف. الحفظ يرسل الصفوف المحدّدة فقط، والخادم يعيد فحصها (المصدر، التاريخ، التكرار).</p>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-3" data-testid="import-result">
              <p className="text-sm font-extrabold text-green-700">✅ تم حفظ {result.inserted} صف.</p>
              {result.summary && (result.summary.duplicate_existing > 0 || result.summary.invalid > 0 || result.summary.duplicate_in_file > 0) && (
                <p className="text-xs text-amber-700">تجاوز الخادم: مكرّر {result.summary.duplicate_existing + result.summary.duplicate_in_file} · غير صالح {result.summary.invalid}.</p>
              )}
              <button onClick={onClose} className="text-sm font-extrabold px-4 py-2 rounded-xl bg-teal text-navy">تم</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
