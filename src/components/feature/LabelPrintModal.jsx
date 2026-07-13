// =============================================================
// LabelPrintModal — اختيار الطلبات وطباعة بوليصات الشحن (A4×8).
// سوريا: «وارد جديد» · تركيا: «تحضير الموتور» فقط.
// =============================================================
import { useMemo, useState } from 'react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '@components/ui/Modal';
import { openLabelsPrint, labelEligible } from '@services/labelPrint';

const CUR = { SYP: 'ل.س', USD: '$', TRY: '₺' };

export default function LabelPrintModal({ open, onClose, orders, market }) {
  // الطلبات المؤهّلة — مقيّدة بالسوق المعروض حالياً إن كان محدداً
  const eligible = useMemo(() => {
    const list = (orders || []).filter(labelEligible);
    return (market === 'syria' || market === 'turkey')
      ? list.filter(o => o.market === market)
      : list;
  }, [orders, market]);

  const [excluded, setExcluded] = useState(() => new Set());
  const picked = eligible.filter(o => !excluded.has(o.id));

  const toggle = (id) => setExcluded(p => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const groups = [
    { key: 'syria',  title: '🇸🇾 سوريا — وارد جديد 📥',     list: eligible.filter(o => o.market === 'syria') },
    { key: 'turkey', title: '🇹🇷 تركيا — تحضير الموتور 🏍️', list: eligible.filter(o => o.market === 'turkey') },
  ].filter(g => g.list.length);

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <ModalHeader
        title="🖨️ طباعة بوليصات الشحن"
        subtitle="A4 — ثماني بوليصات بالورقة، بهوية LOWE'S مع QR صفحة الانستغرام"
        onClose={onClose}
      />
      <ModalBody className="space-y-4">
        {!eligible.length && (
          <div className="text-center py-8 text-muted text-sm">
            لا توجد طلبات جاهزة للطباعة حالياً.
            <p className="text-xs mt-1">سوريا: حالة «وارد جديد 📥» · تركيا: حالة «تحضير الموتور 🛠️»</p>
          </div>
        )}
        {groups.map(g => (
          <div key={g.key}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-text">{g.title} · {g.list.length}</p>
              <button
                onClick={() => setExcluded(p => {
                  const n = new Set(p);
                  const allPicked = g.list.every(o => !n.has(o.id));
                  g.list.forEach(o => allPicked ? n.add(o.id) : n.delete(o.id));
                  return n;
                })}
                className="text-[11px] font-bold text-teal hover:opacity-80 transition">
                {g.list.every(o => !excluded.has(o.id)) ? 'إلغاء الكل' : 'تحديد الكل'}
              </button>
            </div>
            <div className="space-y-1.5">
              {g.list.map(o => (
                <label key={o.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition
                    ${excluded.has(o.id) ? 'border-border bg-surface-alt/50 opacity-50' : 'border-teal/30 bg-teal/5'}`}>
                  <input type="checkbox" checked={!excluded.has(o.id)} onChange={() => toggle(o.id)}
                    className="accent-[var(--color-teal,#0d7377)] w-4 h-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{o.customer_name || '—'}
                      <span className="text-xs text-muted font-medium"> · {o.order_id}</span>
                    </p>
                    <p className="text-[11px] text-muted truncate">
                      {[o.city, o.district].filter(Boolean).join(' – ') || 'بلا عنوان'} · {o.shipping_company || '—'}
                    </p>
                  </div>
                  <span className="text-xs font-extrabold tabular-nums shrink-0" dir="ltr">
                    {Number(o.amount || 0).toLocaleString('en-US')} {CUR[String(o.currency || '').toUpperCase()] || o.currency || ''}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </ModalBody>
      <ModalFooter>
        <span className="text-xs text-muted ml-auto">
          {picked.length} بوليصة · {Math.ceil(picked.length / 8) || 0} ورقة A4
        </span>
        <button onClick={onClose}
          className="px-4 py-2.5 rounded-xl bg-surface-alt border border-border text-muted text-sm font-bold hover:text-text transition">
          إغلاق
        </button>
        <button onClick={() => openLabelsPrint(picked).then(() => onClose?.())} disabled={!picked.length}
          className="px-5 py-2.5 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 transition disabled:opacity-40">
          🖨️ طباعة {picked.length ? `(${picked.length})` : ''}
        </button>
      </ModalFooter>
    </Modal>
  );
}
