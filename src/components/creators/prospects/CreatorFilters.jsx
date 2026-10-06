// بحث واحد واضح + أزرار سريعة (UGC فقط · Skin Care فقط · المحفوظ · المحافظات) + 4 قوائم أساسية + «فلاتر إضافية» مطوية.
import { useState } from 'react';
import {
  COUNTRIES, GOVERNORATES, CREATOR_TYPES, TYPE_AR, PLATFORMS, PLATFORM_AR, STATUSES, STATUS_AR, CONTENT_TYPES, CONTENT_AR, SKINCARE_FOCUS, FOCUS_AR,
  VERIFICATION, VERIFICATION_AR, SORTS,
} from './constants';

const sel = 'border rounded-lg px-2 py-1.5 text-xs bg-white';
const pill = (on) => `px-3 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap transition ${on ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 hover:bg-gray-50'}`;

export default function CreatorFilters({ qInput, setQInput, understood, filters, setFilter, sort, setSort, counts, v2, onReset, activeCount }) {
  const [more, setMore] = useState(false);
  const country = filters.country || 'SY';
  const govs = GOVERNORATES[country] || [];
  const toggleArr = (k, v) => { const cur = filters[k] || []; setFilter(k, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]); };
  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="ابحث: UGC دمشق · سيروم · unboxing حلب · micro skincare · @username · ريم"
          className="w-full border-2 rounded-2xl px-4 py-3 text-sm focus:border-gray-900 outline-none bg-white"
          aria-label="بحث صناع المحتوى"
        />
        {qInput && <button onClick={() => setQInput('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg" aria-label="مسح البحث">✕</button>}
      </div>
      {understood && <div className="text-[11px] text-gray-500">فهمت: {understood}</div>}

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        <button onClick={() => setFilter('ugcOnly', !filters.ugcOnly)} className={pill(filters.ugcOnly)}>🎥 UGC فقط{counts ? ` (${counts.ugc})` : ''}</button>
        <button onClick={() => setFilter('skincareOnly', !filters.skincareOnly)} className={pill(filters.skincareOnly)}>🧴 Skin Care فقط{counts ? ` (${counts.skincare})` : ''}</button>
        <button disabled={!v2} title={v2 ? '' : 'يحتاج migration v2'} onClick={() => setFilter('saved', !filters.saved)} className={`${pill(filters.saved)} disabled:opacity-40`}>⭐ المحفوظ{counts ? ` (${counts.saved})` : ''}</button>
        <span className="w-px bg-gray-200 shrink-0" />
        {govs.map((g) => {
          const n = counts?.governorate?.[g.slug] || 0;
          const on = filters.governorate === g.slug;
          return <button key={g.slug} onClick={() => setFilter('governorate', on ? '' : g.slug)} className={`${pill(on)} ${!n && !on ? 'opacity-40' : ''}`}>{g.ar}{n ? ` ${n}` : ''}</button>;
        })}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select value={filters.country || ''} onChange={(e) => { setFilter('country', e.target.value); setFilter('governorate', ''); }} className={sel} disabled={!v2} aria-label="الدولة">
          <option value="">كل الدول</option>
          {COUNTRIES.filter((c) => c.enabled).map((c) => <option key={c.code} value={c.code}>{c.ar}</option>)}
        </select>
        <select value={filters.creator_type || ''} onChange={(e) => setFilter('creator_type', e.target.value)} className={sel} disabled={!v2} aria-label="نوع المبدع">
          <option value="">كل الأنواع</option>
          {CREATOR_TYPES.map((t) => <option key={t} value={t}>{TYPE_AR[t]}</option>)}
        </select>
        <select value={filters.platform || ''} onChange={(e) => setFilter('platform', e.target.value)} className={sel} aria-label="المنصة">
          <option value="">كل المنصات</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_AR[p]}</option>)}
        </select>
        <select value={filters.status || ''} onChange={(e) => setFilter('status', e.target.value)} className={sel} aria-label="الحالة">
          <option value="">كل الحالات</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_AR[s]}{counts?.status?.[s] ? ` (${counts.status[s]})` : ''}</option>)}
        </select>
        <button onClick={() => setMore((m) => !m)} className="text-xs font-bold text-blue-700">{more ? 'إخفاء' : 'فلاتر إضافية'}{activeCount ? ` (${activeCount})` : ''}</button>
        {activeCount > 0 && <button onClick={onReset} className="text-xs text-gray-500">مسح الفلاتر</button>}
        <label className="flex items-center gap-1 text-xs mr-auto">
          <span className="text-gray-500">ترتيب:</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={sel} aria-label="الترتيب">
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>

      {more && (
        <div className="rounded-xl border bg-gray-50 p-3 space-y-2">
          {!v2 && <div className="text-[11px] text-amber-700">أنواع المحتوى وتخصص العناية والمدينة تعمل بعد تطبيق migration v2 (البيانات فارغة قبلها).</div>}
          <div>
            <div className="text-xs font-bold text-gray-600 mb-1">أنواع المحتوى (كلها مطلوبة)</div>
            <div className="flex flex-wrap gap-1.5">{CONTENT_TYPES.map((c) => <button key={c} onClick={() => toggleArr('content_types', c)} className={pill((filters.content_types || []).includes(c))}>{CONTENT_AR[c]}</button>)}</div>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-600 mb-1">تخصص العناية (أي واحد)</div>
            <div className="flex flex-wrap gap-1.5">{SKINCARE_FOCUS.map((c) => <button key={c} onClick={() => toggleArr('skincare_focus', c)} className={pill((filters.skincare_focus || []).includes(c))}>{FOCUS_AR[c]}</button>)}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={filters.city || ''} onChange={(e) => setFilter('city', e.target.value)} placeholder="المدينة" className={sel} />
            <select value={filters.verification_status || ''} onChange={(e) => setFilter('verification_status', e.target.value)} className={sel} aria-label="جودة البيانات">
              <option value="">كل مستويات التحقق</option>
              {VERIFICATION.map((v) => <option key={v} value={v}>{VERIFICATION_AR[v]}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
