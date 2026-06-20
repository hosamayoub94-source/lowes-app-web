// =============================================================
// AdminChannelsScreen — إدارة قنوات المحاسبة (المصادر/الجهات).
//   شركات الشحن، الموزّعين، المسوّقين، الأونلاين، البنود المتكررة.
//   فتح/تسكير كل قناة + تحديد إن كان فيها وارد و/أو صادر. محميّة admin/manager.
// =============================================================
import { useState } from 'react';
import { useAuth } from '@hooks/useAuth';
import { useToast } from '@hooks/useToast';
import {
  useAccountingBootstrap,
  useChannels,
  useAccountingActions,
  useAccountingLoading,
} from '@modules/accounting/hooks/useAccounting.js';
import { BOOK, BOOK_LABELS } from '@modules/accounting/types/accounting.types.js';
import { useShippingStore } from '@services/shippingService';

const KINDS = [
  { k: 'shipping',    l: '🚚 شركة شحن' },
  { k: 'distributor', l: '🤝 موزّع' },
  { k: 'marketer',    l: '📣 مسوّق' },
  { k: 'online',      l: '🛒 أونلاين' },
  { k: 'supplier',    l: '🏭 مورّد' },
  { k: 'recurring',   l: '🔁 مصروف متكرر' },
  { k: 'expense',     l: '💸 مصروف' },
  { k: 'other',       l: '📌 أخرى' },
];
const KIND_LABEL = Object.fromEntries(KINDS.map(({ k, l }) => [k, l]));

const BLANK = {
  name_ar: '', kind: 'shipping', currency: '', is_active: true,
  allows_income: true, allows_expense: true, book: 'operational', sort_order: 100, icon: '🚚',
};

export default function AdminChannelsScreen() {
  const { id } = useAuth();
  useAccountingBootstrap(id);
  const channels = useChannels();
  const { createChannel, updateChannel, deleteChannel } = useAccountingActions();
  const loading = useAccountingLoading();
  const toast = useToast();
  const [edit, setEdit] = useState(null);

  const save = async () => {
    if (!edit.name_ar.trim()) { toast.error('اسم القناة مطلوب'); return; }
    const data = {
      name_ar:        edit.name_ar.trim(),
      kind:           edit.kind,
      currency:       edit.currency || null,
      is_active:      !!edit.is_active,
      allows_income:  !!edit.allows_income,
      allows_expense: !!edit.allows_expense,
      book:           edit.book || BOOK.OPERATIONAL,
      sort_order:     Number(edit.sort_order) || 100,
      icon:           edit.icon || null,
    };
    try {
      if (edit.id) await updateChannel(edit.id, data);
      else await createChannel(data);
      toast.success('تم الحفظ ✅');
      setEdit(null);
      useShippingStore.getState().reload(); // keep the order-form carrier picker fresh
    } catch (e) { toast.error(e.message); }
  };

  const toggleActive = async (c) => {
    try { await updateChannel(c.id, { is_active: !c.is_active }); useShippingStore.getState().reload(); }
    catch (e) { toast.error(e.message); }
  };

  const del = async (c) => {
    if (!confirm(`حذف القناة «${c.name_ar}» نهائياً؟ (القيود المرتبطة تبقى لكن بلا قناة)`)) return;
    try { await deleteChannel(c.id); toast.success('تم الحذف'); useShippingStore.getState().reload(); }
    catch (e) { toast.error(e.message); }
  };

  const INP = 'w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-surface text-text';

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="font-extrabold text-text flex items-center gap-2"><span>🔀</span> قنوات المحاسبة</h1>
        <button onClick={() => setEdit({ ...BLANK })}
          className="bg-teal text-navy rounded-xl px-3 py-1.5 text-sm font-bold hover:bg-teal/90">+ قناة جديدة</button>
      </div>
      <p className="text-xs text-muted">كل مصدر/جهة (شركة شحن، موزّع، مسوّق، أونلاين، بند متكرر) — تفتحها/تسكّرها وتحدّد إن فيها وارد و/أو صادر.</p>

      {channels.length === 0 && (
        <div className="text-muted text-sm py-8 text-center">لا توجد قنوات بعد — اضغط «+ قناة جديدة».</div>
      )}
      {channels.map(c => (
        <div key={c.id} className={`flex items-center justify-between bg-surface border border-border/60 rounded-xl px-3 py-2 ${c.is_active ? '' : 'opacity-60'}`}>
          <span className="text-sm text-text">
            {c.icon || '📌'} {c.name_ar}
            <span className="text-muted text-xs"> · {KIND_LABEL[c.kind] || c.kind}
              {c.allows_income ? ' · 🟢وارد' : ''}{c.allows_expense ? ' · 🔴صادر' : ''}
              {c.currency ? ` · ${c.currency}` : ''}
              {!c.is_active ? ' · ⏸ مسكّرة' : ''}
            </span>
          </span>
          <span className="flex gap-3 shrink-0">
            <button onClick={() => toggleActive(c)} className="text-xs font-bold text-amber-600">
              {c.is_active ? 'تسكير' : 'فتح'}
            </button>
            <button onClick={() => setEdit({ ...c, currency: c.currency || '' })} className="text-xs text-teal-700 font-bold">تعديل</button>
            <button onClick={() => del(c)} className="text-xs text-red-600 font-bold">حذف</button>
          </span>
        </div>
      ))}

      {edit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setEdit(null)}>
          <div className="bg-surface rounded-2xl p-4 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-2"
            onClick={e => e.stopPropagation()} dir="rtl">
            <h2 className="font-bold text-text">{edit.id ? 'تعديل قناة' : 'قناة جديدة'}</h2>
            <div className="flex gap-2">
              <div className="w-20">
                <label className="text-xs text-muted">أيقونة:</label>
                <input className={INP} value={edit.icon || ''} onChange={e => setEdit({ ...edit, icon: e.target.value })} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted">الاسم:</label>
                <input className={INP} value={edit.name_ar} onChange={e => setEdit({ ...edit, name_ar: e.target.value })} placeholder="مثال: قدموس / موزّع دمشق" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted">النوع:</label>
                <select className={INP} value={edit.kind} onChange={e => setEdit({ ...edit, kind: e.target.value })}>
                  {KINDS.map(({ k, l }) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div className="w-28">
                <label className="text-xs text-muted">العملة:</label>
                <select className={INP} value={edit.currency} onChange={e => setEdit({ ...edit, currency: e.target.value })}>
                  <option value="">متعدد</option>
                  <option value="USD">USD</option>
                  <option value="TRY">TRY</option>
                  <option value="SYP">SYP</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted">الكتاب:</label>
                <select className={INP} value={edit.book} onChange={e => setEdit({ ...edit, book: e.target.value })}>
                  {Object.values(BOOK).map(b => <option key={b} value={b}>{BOOK_LABELS[b]}</option>)}
                </select>
              </div>
              <div className="w-24">
                <label className="text-xs text-muted">الترتيب:</label>
                <input type="number" className={INP} value={edit.sort_order} onChange={e => setEdit({ ...edit, sort_order: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-1.5 text-sm text-text">
                <input type="checkbox" checked={edit.allows_income} onChange={e => setEdit({ ...edit, allows_income: e.target.checked })} /> 🟢 فيها وارد
              </label>
              <label className="flex items-center gap-1.5 text-sm text-text">
                <input type="checkbox" checked={edit.allows_expense} onChange={e => setEdit({ ...edit, allows_expense: e.target.checked })} /> 🔴 فيها صادر
              </label>
              <label className="flex items-center gap-1.5 text-sm text-text">
                <input type="checkbox" checked={edit.is_active} onChange={e => setEdit({ ...edit, is_active: e.target.checked })} /> مفتوحة
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={save} disabled={loading.action}
                className="flex-1 bg-teal text-navy rounded-xl py-2 text-sm font-bold disabled:opacity-50">
                {loading.action ? '⏳ جارٍ الحفظ…' : 'حفظ'}</button>
              <button onClick={() => setEdit(null)} className="flex-1 bg-surface-alt rounded-xl py-2 text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
