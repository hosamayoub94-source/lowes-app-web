// =============================================================
// ConsignmentScreen — الأمانة: رسم أمانة عند عميل وتسويتها.
// تجريبي (٣ قطع) · معتمد (١٠ قطع · تسوية خلال ٩٠ يوم).
// =============================================================
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@hooks/useAuth';
import {
  listConsignments, createConsignment, settleConsignment,
  CONSIGN_TRIAL_QTY, CONSIGN_APPROVED_QTY,
} from '@modules/distribution/services/distributionService';

const TIER_AR = { trial: 'تجريبي', approved: 'معتمد' };

export default function ConsignmentScreen() {
  const { id } = useAuth();
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState('');
  const [product, setProduct] = useState('');
  const [tier, setTier]     = useState('trial');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setItems(await listConsignments(id));
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const onCreate = async () => {
    if (!client.trim() || !product.trim()) { window.alert('أدخل اسم العميل والمنتج.'); return; }
    const qty = tier === 'approved' ? CONSIGN_APPROVED_QTY : CONSIGN_TRIAL_QTY;
    const ok = await createConsignment({
      seller_id: id, client_name: client.trim(), product_name: product.trim(),
      qty_placed: qty, tier, status: 'open',
    });
    if (ok) { setClient(''); setProduct(''); load(); } else window.alert('تعذّر الإنشاء.');
  };

  const onSettle = async (it) => {
    const raw = window.prompt(`كم قطعة بيعت من ${it.qty_placed}؟`, '0');
    const sold = Number(raw);
    if (!(sold >= 0 && sold <= it.qty_placed)) return;
    await settleConsignment(it.id, sold);
    load();
  };

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      <h1 className="font-black text-lg">الأمانة</h1>

      <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
        <input value={client} onChange={e => setClient(e.target.value)} placeholder="اسم العميل/الصيدلية"
          className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2 text-sm" />
        <input value={product} onChange={e => setProduct(e.target.value)} placeholder="المنتج"
          className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <select value={tier} onChange={e => setTier(e.target.value)}
            className="bg-surface-alt border border-border rounded-xl px-3 py-2 text-sm font-bold">
            <option value="trial">تجريبي · {CONSIGN_TRIAL_QTY} قطع</option>
            <option value="approved">معتمد · {CONSIGN_APPROVED_QTY} قطع</option>
          </select>
          <button onClick={onCreate}
            className="flex-1 bg-navy text-white rounded-xl py-2 text-sm font-black active:scale-[0.99]">
            + رسم أمانة
          </button>
        </div>
      </div>

      <section className="rounded-2xl bg-surface border border-border p-4">
        <h2 className="font-black text-sm mb-3">أماناتي</h2>
        {loading ? (
          <p className="text-muted text-sm">جارٍ التحميل…</p>
        ) : items.length === 0 ? (
          <p className="text-muted text-sm">لا أمانات حالياً.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map(it => (
              <li key={it.id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{it.client_name} · {it.product_name}</p>
                  <p className="text-muted text-xs">
                    {TIER_AR[it.tier]} · {it.qty_placed} قطعة
                    {it.status === 'settled' ? ` · بيع ${it.qty_sold} ✓` : ''}
                  </p>
                </div>
                {it.status === 'open' ? (
                  <button onClick={() => onSettle(it)}
                    className="text-xs font-black bg-surface-alt border border-border rounded-lg px-3 py-1.5 active:scale-95">
                    تسوية
                  </button>
                ) : (
                  <span className="text-muted text-xs shrink-0">مُسوّاة</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
