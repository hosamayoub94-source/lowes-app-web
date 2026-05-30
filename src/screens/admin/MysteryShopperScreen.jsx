// =============================================================
// MysteryShopperScreen — مراقبة الأسعار الميدانية
// من SALES_RULES.md: "Mystery Shopper شهري (زيارات عشوائية)"
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { useAuth }  from '@hooks/useAuth';
import { supabase } from '@services/supabase';

const LOWES_PRODUCTS = [
  'غسول الوجه (Facial Cleanser Gel)',
  'كريم المرطب (Intense Repair)',
  'سيروم الريتينول 1%',
  'سيروم البقع (Dark Spot Corrector)',
  'واقي الشمس الزهري SPF50+',
  'واقي الشمس البرتقالي SPF50+',
  'كريم الريتينال شوت',
  'كريم التبييض',
  'سيروم الكولاجين',
  'شامبو روزماري',
  'زيت روزماري الشعر',
  'سكراب الجسم بالفراولة',
  'جل شد الجسم',
  'سيروم الدقن (Beard Serum)',
  'كريم إزالة الشعر',
];

const VIOLATION_TYPES = [
  { key: 'price_lower', label: 'سعر أقل من الرسمي', color: 'text-red-fg bg-red-bg' },
  { key: 'price_higher', label: 'سعر أعلى من الرسمي', color: 'text-amber-fg bg-amber-bg' },
  { key: 'fake_product', label: 'منتج مزور / مقلد', color: 'text-red-fg bg-red-bg' },
  { key: 'no_product', label: 'المنتج غير متوفر', color: 'text-muted bg-surface-alt' },
  { key: 'other', label: 'مخالفة أخرى', color: 'text-muted bg-surface-alt' },
];

function ViolationBadge({ type, priceOk }) {
  if (priceOk) return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-bg text-green-fg">✅ سعر صحيح</span>;
  const v = VIOLATION_TYPES.find(x => x.key === type);
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${v?.color ?? 'bg-surface-alt text-muted'}`}>⚠️ {v?.label ?? 'مخالفة'}</span>;
}

function AddReportModal({ onSave, onClose }) {
  const { id: shopperId, name: shopperName } = useAuth();
  const [form, setForm] = useState({
    client_name: '', client_city: '', client_type: 'pharmacy',
    product_name: LOWES_PRODUCTS[0], listed_price: '', found_price: '',
    notes: '', violation_type: '',
  });
  const [saving, setSaving] = useState(false);

  const priceOk = form.found_price && form.listed_price &&
    Math.abs(Number(form.found_price) - Number(form.listed_price)) < 0.01;

  const save = async () => {
    if (!form.client_name || !form.product_name) return;
    setSaving(true);
    try {
      await supabase.from('mystery_shopper').insert({
        client_name:    form.client_name,
        client_city:    form.client_city || null,
        client_type:    form.client_type,
        shopper_id:     shopperId,
        shopper_name:   shopperName,
        product_name:   form.product_name,
        listed_price:   form.listed_price ? Number(form.listed_price) : null,
        found_price:    form.found_price  ? Number(form.found_price)  : null,
        price_ok:       !!priceOk,
        violation_type: priceOk ? null : (form.violation_type || 'price_lower'),
        notes:          form.notes || null,
      });
      onSave(); onClose();
    } catch (e) { alert('خطأ: ' + e.message); }
    finally { setSaving(false); }
  };

  const INP = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface text-text focus:border-teal focus:outline-none transition';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose} dir="rtl">
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between bg-gradient-to-r from-red-bg to-transparent">
          <h3 className="font-bold text-base text-text">🕵️ تقرير Mystery Shopper</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-surface-alt flex items-center justify-center text-muted hover:text-text">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {[
            { key: 'client_name', label: 'اسم المحل / الصيدلية *', placeholder: 'صيدلية النور' },
            { key: 'client_city', label: 'المدينة', placeholder: 'دمشق' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="text-xs font-bold text-muted block mb-1.5">{label}</label>
              <input value={form[key]} onChange={e => setForm(f=>({...f,[key]:e.target.value}))} placeholder={placeholder} className={INP} />
            </div>
          ))}

          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">المنتج</label>
            <select value={form.product_name} onChange={e => setForm(f=>({...f,product_name:e.target.value}))} className={INP}>
              {LOWES_PRODUCTS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">💵 السعر الرسمي ($)</label>
              <input type="number" value={form.listed_price} onChange={e => setForm(f=>({...f,listed_price:e.target.value}))} placeholder="0.00" className={INP} />
            </div>
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">🏷️ السعر الموجود ($)</label>
              <input type="number" value={form.found_price} onChange={e => setForm(f=>({...f,found_price:e.target.value}))} placeholder="0.00" className={INP} />
            </div>
          </div>

          {/* Result preview */}
          {form.found_price && form.listed_price && (
            <div className={`rounded-xl p-3 text-center font-bold text-sm ${priceOk ? 'bg-green-bg text-green-fg' : 'bg-red-bg text-red-fg'}`}>
              {priceOk ? '✅ السعر صحيح — لا مشكلة' : `⚠️ فرق: $${Math.abs(Number(form.found_price) - Number(form.listed_price)).toFixed(2)}`}
            </div>
          )}

          {!priceOk && form.found_price && (
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">نوع المخالفة</label>
              <div className="flex flex-wrap gap-1.5">
                {VIOLATION_TYPES.map(v => (
                  <button key={v.key} onClick={() => setForm(f=>({...f,violation_type:v.key}))}
                    className={`text-xs px-2.5 py-1.5 rounded-xl border font-semibold transition ${form.violation_type === v.key ? 'bg-red-500 text-white border-red-500' : 'border-border text-muted hover:border-red-300'}`}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))}
              rows={2} placeholder="أي تفاصيل إضافية..." className={`${INP} resize-none`} />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border/40">
          <button onClick={save} disabled={saving || !form.client_name}
            className="w-full py-2.5 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy/90 disabled:opacity-50 transition">
            {saving ? '⏳ جاري الحفظ...' : '✓ تسجيل التقرير'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MysteryShopperScreen() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'violations' | 'ok'

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('mystery_shopper')
      .select('*').order('created_at', { ascending: false }).limit(100);
    setReports(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'violations' ? reports.filter(r => !r.price_ok)
                 : filter === 'ok'         ? reports.filter(r => r.price_ok)
                 : reports;

  const stats = {
    total:      reports.length,
    violations: reports.filter(r => !r.price_ok).length,
    ok:         reports.filter(r => r.price_ok).length,
  };

  return (
    <div className="space-y-5 pb-24 sm:pb-8" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-text">🕵️ Mystery Shopper</h1>
          <p className="text-sm text-muted mt-0.5">مراقبة الأسعار والامتثال في السوق</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="px-4 py-2.5 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy/90 transition shrink-0">
          + تقرير جديد
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'إجمالي الزيارات', value: stats.total,      icon: '🕵️', color: 'text-text' },
          { label: 'مخالفات',          value: stats.violations, icon: '⚠️', color: 'text-red-fg' },
          { label: 'أسعار صحيحة',     value: stats.ok,         icon: '✅', color: 'text-green-fg' },
        ].map(s => (
          <div key={s.label} className="bg-surface border border-border rounded-2xl p-4 text-center">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className={`text-2xl font-extrabold ${s.color}`}>{loading ? '…' : s.value}</div>
            <div className="text-[10px] text-muted mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 bg-surface-alt rounded-2xl border border-border">
        {[
          { key: 'all',        label: `الكل (${stats.total})` },
          { key: 'violations', label: `مخالفات (${stats.violations})` },
          { key: 'ok',         label: `ملتزم (${stats.ok})` },
        ].map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${filter === t.key ? 'bg-surface text-text shadow-sm border border-border' : 'text-muted'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Reports */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-surface-alt animate-pulse rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-10 text-center">
          <p className="text-3xl mb-2">🕵️</p>
          <p className="text-sm text-muted">لا توجد تقارير</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div key={r.id} className={`bg-surface border rounded-2xl px-4 py-3 ${!r.price_ok ? 'border-red-200 dark:border-red-900/40' : 'border-border'}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-sm font-bold text-text">{r.client_name}</p>
                  <p className="text-[10px] text-muted">{r.client_city} · {r.shopper_name} · {new Date(r.created_at).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory',{month:'short',day:'numeric'})}</p>
                </div>
                <ViolationBadge type={r.violation_type} priceOk={r.price_ok} />
              </div>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span>📦 {r.product_name}</span>
                {r.listed_price && <span>رسمي: ${r.listed_price}</span>}
                {r.found_price  && <span className={!r.price_ok ? 'text-red-fg font-semibold' : ''}>موجود: ${r.found_price}</span>}
              </div>
              {r.notes && <p className="text-[11px] text-muted mt-1.5 border-t border-border/40 pt-1.5">📝 {r.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {showModal && <AddReportModal onSave={load} onClose={() => setShowModal(false)} />}
    </div>
  );
}
