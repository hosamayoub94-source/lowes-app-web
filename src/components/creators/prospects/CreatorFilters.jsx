// بحث واحد + Views جاهزة بعدّاداتها + زر «فلاتر» واحد + شارات للفلاتر النشطة (✕ لكل واحدة) + «إعادة ضبط» ظاهرة دائماً عند أي فلتر.
// Views محفوظة شخصية (هذا المتصفح فقط).
import { useState } from 'react';
import {
  COUNTRIES, GOVERNORATES, CREATOR_TYPES, TYPE_AR, PLATFORMS, PLATFORM_AR, STATUSES, STATUS_AR, CONTENT_TYPES, CONTENT_AR, SKINCARE_FOCUS, FOCUS_AR,
  VERIFICATION, VERIFICATION_AR, SORTS, VIEWS, COLLABS, COLLAB_AR, govOf,
} from './constants';

const sel = 'border rounded-lg px-2 py-1.5 text-xs bg-white w-full';
const pill = (on) => `px-3 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap transition ${on ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 hover:bg-gray-50'}`;

// Which extra filters are on, each with a label and how to clear it.
export function activeFilterChips(filters) {
  const out = [];
  const add = (k, label, clear) => out.push({ k, label, clear });
  if (filters.country) add('country', COUNTRIES.find((c) => c.code === filters.country)?.ar || filters.country, { country: '', governorate: '' });
  if (filters.governorate) add('governorate', govOf(filters.country || 'SY', filters.governorate)?.ar || filters.governorate, { governorate: '' });
  if (filters.city) add('city', `المدينة: ${filters.city}`, { city: '' });
  if (filters.creator_type) add('creator_type', TYPE_AR[filters.creator_type], { creator_type: '' });
  if (filters.platform) add('platform', PLATFORM_AR[filters.platform], { platform: '' });
  if (filters.status) add('status', STATUS_AR[filters.status], { status: '' });
  if (filters.verification_status) add('verification_status', VERIFICATION_AR[filters.verification_status], { verification_status: '' });
  if (filters.collab) add('collab', `تعاون: ${COLLAB_AR[filters.collab]}`, { collab: '' });
  (filters.content_types || []).forEach((c) => add(`ct-${c}`, CONTENT_AR[c], { content_types: (filters.content_types || []).filter((x) => x !== c) }));
  (filters.skincare_focus || []).forEach((c) => add(`sf-${c}`, FOCUS_AR[c], { skincare_focus: (filters.skincare_focus || []).filter((x) => x !== c) }));
  return out;
}

export default function CreatorFilters({
  qInput, setQInput, understood, view, setView, summary, filters, patchFilters, sort, setSort, total, shown, onReset, dirty,
  savedViews, onSaveView, onApplySaved, onDeleteSaved, v2,
}) {
  const [open, setOpen] = useState(false);
  const country = filters.country || 'SY';
  const govs = GOVERNORATES[country] || [];
  const chips = activeFilterChips(filters);
  const toggleArr = (k, v) => { const cur = filters[k] || []; patchFilters({ [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] }); };
  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="ابحث: اسم · @حساب · رابط · UGC دمشق · سيروم · micro skincare"
          className="w-full border-2 rounded-2xl px-4 py-3 text-sm focus:border-gray-900 outline-none bg-white"
          aria-label="بحث صناع المحتوى"
          type="search"
        />
        {qInput && <button onClick={() => setQInput('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg" aria-label="مسح البحث">✕</button>}
      </div>
      {understood && <div className="text-[11px] text-gray-500">فهمت: {understood}</div>}

      {/* ready-made views */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="عروض جاهزة">
        {VIEWS.filter((v) => v.key !== 'garbled' || summary?.garbled).map((v) => {
          const n = v.count && summary ? summary[v.count] : null;
          return (
            <button key={v.key} role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)} className={pill(view === v.key)}>
              {v.ar}{n != null ? ` (${n})` : ''}
            </button>
          );
        })}
      </div>
      {savedViews.length > 0 && (
        <div className="flex gap-1.5 flex-wrap items-center text-xs">
          <span className="text-gray-500">محفوظة:</span>
          {savedViews.map((s) => (
            <span key={s.name} className="inline-flex items-center rounded-full border bg-amber-50 border-amber-200">
              <button onClick={() => onApplySaved(s)} className="px-2.5 py-1 font-bold text-amber-900">{s.name}</button>
              <button onClick={() => onDeleteSaved(s.name)} className="px-1.5 text-amber-700" aria-label={`حذف العرض ${s.name}`}>✕</button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${chips.length ? 'border-gray-900' : ''}`}>
          ⚙ فلاتر{chips.length ? ` (${chips.length})` : ''}
        </button>
        {chips.map((c) => (
          <span key={c.k} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[11px]">
            {c.label}
            <button onClick={() => patchFilters(c.clear)} aria-label={`إزالة فلتر ${c.label}`} className="text-gray-500">✕</button>
          </span>
        ))}
        {dirty && <button onClick={onReset} className="text-xs font-bold text-red-600">إعادة ضبط</button>}
        {dirty && <button onClick={onSaveView} className="text-xs text-blue-700">حفظ كعرض</button>}
        <label className="flex items-center gap-1 text-xs mr-auto">
          <span className="text-gray-500">ترتيب:</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs bg-white" aria-label="الترتيب">
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>

      {open && (
        <div className="rounded-xl border bg-gray-50 p-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select value={filters.country || ''} onChange={(e) => patchFilters({ country: e.target.value, governorate: '' })} className={sel} disabled={!v2} aria-label="الدولة">
              <option value="">كل الدول</option>
              {COUNTRIES.filter((c) => c.enabled).map((c) => <option key={c.code} value={c.code}>{c.ar}</option>)}
            </select>
            <select value={filters.governorate || ''} onChange={(e) => patchFilters({ governorate: e.target.value })} className={sel} disabled={!v2} aria-label="المحافظة">
              <option value="">كل المحافظات</option>
              {govs.map((g) => <option key={g.slug} value={g.slug}>{g.ar}</option>)}
            </select>
            <input value={filters.city || ''} onChange={(e) => patchFilters({ city: e.target.value })} placeholder="المدينة" className={sel} aria-label="المدينة" />
            <select value={filters.platform || ''} onChange={(e) => patchFilters({ platform: e.target.value })} className={sel} aria-label="المنصة">
              <option value="">كل المنصات</option>
              {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_AR[p]}</option>)}
            </select>
            <select value={filters.creator_type || ''} onChange={(e) => patchFilters({ creator_type: e.target.value })} className={sel} disabled={!v2} aria-label="نوع المبدع">
              <option value="">كل الأنواع</option>
              {CREATOR_TYPES.map((t) => <option key={t} value={t}>{TYPE_AR[t]}</option>)}
            </select>
            <select value={filters.status || ''} onChange={(e) => patchFilters({ status: e.target.value })} className={sel} aria-label="الحالة">
              <option value="">كل الحالات</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_AR[s]}</option>)}
            </select>
            <select value={filters.verification_status || ''} onChange={(e) => patchFilters({ verification_status: e.target.value })} className={sel} aria-label="مستوى التحقق">
              <option value="">كل مستويات التحقق</option>
              {VERIFICATION.map((v) => <option key={v} value={v}>{VERIFICATION_AR[v]}</option>)}
            </select>
            <select value={filters.collab || ''} onChange={(e) => patchFilters({ collab: e.target.value })} className={sel} aria-label="نوع التعاون">
              <option value="">كل أنواع التعاون</option>
              {COLLABS.map((c) => <option key={c} value={c}>{COLLAB_AR[c]}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-600 mb-1">أنواع المحتوى (كلها مطلوبة)</div>
            <div className="flex flex-wrap gap-1.5">{CONTENT_TYPES.map((c) => <button key={c} onClick={() => toggleArr('content_types', c)} className={pill((filters.content_types || []).includes(c))}>{CONTENT_AR[c]}</button>)}</div>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-600 mb-1">تخصص العناية (أي واحد)</div>
            <div className="flex flex-wrap gap-1.5">{SKINCARE_FOCUS.map((c) => <button key={c} onClick={() => toggleArr('skincare_focus', c)} className={pill((filters.skincare_focus || []).includes(c))}>{FOCUS_AR[c]}</button>)}</div>
          </div>
        </div>
      )}
      <div className="text-xs text-gray-600" aria-live="polite">
        <b>{total ?? '…'}</b> نتيجة{shown != null && total > shown ? ` · معروض ${shown}` : ''}
      </div>
    </div>
  );
}
