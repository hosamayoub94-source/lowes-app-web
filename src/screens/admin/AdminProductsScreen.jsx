// =============================================================
// AdminProductsScreen — كتالوج المنتجات
// إضافة / تعديل / حذف المنتجات + أسعار + خصومات
// عند تغيير السعر: إشعار تلقائي لفريق المبيعات
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase }              from '@services/supabase';
import { sendBulkNotifications } from '@modules/notifications/services/notificationService';
import { NOTIFICATION_TYPE }     from '@modules/notifications/types/notification.types';
import { ROLES }                 from '@data/teams';

const CATEGORIES = [
  { key: 'face_care',    label: 'العناية بالبشرة', icon: '✨' },
  { key: 'body_care',    label: 'العناية بالجسم',  icon: '💆' },
  { key: 'hair_care',    label: 'العناية بالشعر',  icon: '💇' },
  { key: 'eye_care',     label: 'العناية بالعين',  icon: '👁️' },
  { key: 'treatments',   label: 'علاجات',           icon: '💊' },
  { key: 'other',        label: 'أخرى',             icon: '📦' },
];

const EMPTY_FORM = {
  name: '', name_en: '', category: 'face_care',
  price_usd: '', price_try: '', discount_pct: '0',
  description: '', is_active: true,
};

const INP = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30';

function ProductModal({ product, onSave, onClose }) {
  const [form, setForm]   = useState(product ? {
    name:         product.name         ?? '',
    name_en:      product.name_en      ?? '',
    category:     product.category     ?? 'face_care',
    price_usd:    product.price_usd    ?? '',
    price_try:    product.price_try    ?? '',
    discount_pct: product.discount_pct ?? '0',
    description:  product.description  ?? '',
    is_active:    product.is_active    ?? true,
  } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave(form, product);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        dir="rtl" onClick={e => e.stopPropagation()}>

        <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-base text-text">{product ? '✏️ تعديل منتج' : '+ منتج جديد'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted">✕</button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted block mb-1">اسم المنتج (عربي) *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} className={INP} placeholder="مثال: كريم ترطيب" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted block mb-1">الاسم (إنجليزي)</label>
              <input value={form.name_en} onChange={e => set('name_en', e.target.value)} className={INP} placeholder="Moisturizer" />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-muted block mb-1">الفئة</label>
            <select value={form.category} onChange={e => set('category', e.target.value)} className={INP}>
              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-muted block mb-1">السعر ($)</label>
              <input type="number" value={form.price_usd} onChange={e => set('price_usd', e.target.value)} className={INP} placeholder="0.00" step="0.01" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted block mb-1">السعر (₺)</label>
              <input type="number" value={form.price_try} onChange={e => set('price_try', e.target.value)} className={INP} placeholder="0.00" step="0.01" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted block mb-1">خصم %</label>
              <input type="number" value={form.discount_pct} onChange={e => set('discount_pct', e.target.value)} className={INP} placeholder="0" min="0" max="100" />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-muted block mb-1">الوصف</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={3} className={`${INP} resize-none`} placeholder="وصف المنتج..." />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <div className={`w-10 h-5 rounded-full transition-colors ${form.is_active ? 'bg-teal' : 'bg-surface-alt border border-border'}`}
              onClick={() => set('is_active', !form.is_active)}>
              <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform mt-0.5 ${form.is_active ? 'translate-x-5 me-0.5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-text">منتج نشط</span>
          </label>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-border/40 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted hover:text-text transition">إلغاء</button>
          <button onClick={handleSave} disabled={!form.name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-teal text-navy text-sm font-bold disabled:opacity-40 hover:bg-teal/90 transition">
            {saving ? '…جاري الحفظ' : '✓ حفظ'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminProductsScreen() {
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [catFilter,setCatFilter] = useState('all');
  const [modal,    setModal]    = useState(null); // null | 'new' | product_obj
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('products').select('*').order('name');
      setProducts(data ?? []);
    } catch { /* تجاهل */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form, existing) => {
    const payload = {
      name:         form.name.trim(),
      name_en:      form.name_en.trim() || null,
      category:     form.category,
      price_usd:    Number(form.price_usd)    || null,
      price_try:    Number(form.price_try)    || null,
      discount_pct: Number(form.discount_pct) || 0,
      description:  form.description.trim()   || null,
      is_active:    form.is_active,
      updated_at:   new Date().toISOString(),
    };

    const priceChanged = existing &&
      (Number(form.price_usd) !== Number(existing.price_usd ?? 0) ||
       Number(form.discount_pct) !== Number(existing.discount_pct ?? 0));

    const { error: saveErr } = existing?.id
      ? await supabase.from('products').update(payload).eq('id', existing.id)
      : await supabase.from('products').insert({ ...payload, created_at: new Date().toISOString() });
    if (saveErr) { window.alert('تعذّر حفظ المنتج: ' + saveErr.message); return; }

    // Notify sales team on price/discount change
    if (priceChanged) {
      try {
        const { data: salesProfiles } = await supabase.from('profiles')
          .select('id').in('role_type', [ROLES.SALES_MANAGER, ROLES.MEDIA_BUYER, ROLES.ADMIN]);
        const ids = (salesProfiles ?? []).map(p => p.id);
        if (ids.length) {
          const discNote = Number(form.discount_pct) > 0 ? ` — خصم ${form.discount_pct}%` : '';
          await sendBulkNotifications(ids, {
            type:     NOTIFICATION_TYPE.SYSTEM_ALERT,
            title:    `🏷️ تحديث سعر: ${form.name}`,
            message:  `السعر الجديد: $${form.price_usd ?? '—'}${discNote}`,
            severity: 'info',
            entityId: existing?.id ?? 'new',
            metadata: { product: form.name, price_usd: form.price_usd, discount_pct: form.discount_pct },
          });
        }
      } catch { /* تجاهل */ }
    }

    setModal(null);
    load();
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await supabase.from('products').update({ is_active: false }).eq('id', id);
      load();
    } finally { setDeleting(null); }
  };

  const filtered = products.filter(p => {
    const matchCat = catFilter === 'all' || p.category === catFilter;
    const matchSrch = !search || p.name?.includes(search) || p.name_en?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSrch;
  });

  const catMeta = (key) => CATEGORIES.find(c => c.key === key) ?? { icon: '📦', label: key };

  return (
    <div className="space-y-4 pb-8" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-text">🏷️ كتالوج المنتجات</h2>
          <p className="text-xs text-muted mt-0.5">{products.filter(p => p.is_active).length} منتج نشط</p>
        </div>
        <button onClick={() => setModal('new')}
          className="px-4 py-2 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 transition">
          + منتج جديد
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setCatFilter('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition ${catFilter === 'all' ? 'bg-navy text-white' : 'bg-surface border border-border text-muted'}`}>
          الكل ({products.length})
        </button>
        {CATEGORIES.map(c => {
          const count = products.filter(p => p.category === c.key).length;
          if (!count) return null;
          return (
            <button key={c.key} onClick={() => setCatFilter(c.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition ${catFilter === c.key ? 'bg-teal text-navy' : 'bg-surface border border-border text-muted'}`}>
              {c.icon} {c.label} ({count})
            </button>
          );
        })}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="🔍 بحث باسم المنتج..."
        className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />

      {/* Products grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-28 bg-surface-alt animate-pulse rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <p className="text-3xl mb-2">📦</p>
          <p className="text-sm">لا توجد منتجات</p>
          <button onClick={() => setModal('new')} className="mt-3 text-xs text-teal hover:underline">+ أضف أول منتج</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(p => {
            const cat = catMeta(p.category);
            const discountedPrice = p.price_usd && p.discount_pct > 0
              ? (p.price_usd * (1 - p.discount_pct / 100)).toFixed(2)
              : null;
            return (
              <div key={p.id} className={`bg-surface border rounded-2xl p-4 space-y-2 ${p.is_active ? 'border-border' : 'border-border/40 opacity-60'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-sm">{cat.icon}</span>
                      <span className="text-[10px] text-muted">{cat.label}</span>
                      {!p.is_active && <span className="text-[10px] text-red-fg bg-red-bg px-1.5 py-0.5 rounded-full font-bold">غير نشط</span>}
                    </div>
                    <p className="text-sm font-bold text-text truncate">{p.name}</p>
                    {p.name_en && <p className="text-[11px] text-muted">{p.name_en}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setModal(p)}
                      className="w-7 h-7 rounded-lg bg-surface-alt flex items-center justify-center text-muted hover:text-text hover:bg-teal/10 transition text-xs">✏️</button>
                    <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id}
                      className="w-7 h-7 rounded-lg bg-surface-alt flex items-center justify-center text-muted hover:text-red-fg hover:bg-red-bg transition text-xs disabled:opacity-40">
                      {deleting === p.id ? '…' : '🗑️'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  {p.price_usd && (
                    <div>
                      {discountedPrice ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs text-muted line-through">${p.price_usd}</span>
                          <span className="text-sm font-extrabold text-teal">${discountedPrice}</span>
                          <span className="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full">-{p.discount_pct}%</span>
                        </span>
                      ) : (
                        <span className="text-sm font-extrabold text-text">${p.price_usd}</span>
                      )}
                    </div>
                  )}
                  {p.price_try && (
                    <span className="text-xs text-muted">₺{p.price_try}</span>
                  )}
                </div>

                {p.description && (
                  <p className="text-[11px] text-muted leading-relaxed line-clamp-2">{p.description}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <ProductModal
          product={modal === 'new' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
