// =============================================================
// TerritoriesScreen — المناطق المحمية (إدارة).
// مسح → تجريبي → مفعّل · لكل منطقة وكيل وحالة.
// =============================================================
import { useEffect, useState, useCallback } from 'react';
import {
  listTerritories, createTerritory, setTerritoryStatus, TERRITORY_STATUS,
} from '@modules/distribution/services/distributionService';

const STATUS_FLOW = ['survey', 'pilot', 'active', 'paused'];

export default function TerritoriesScreen() {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName]     = useState('');
  const [market, setMarket] = useState('syria');

  const load = useCallback(async () => {
    setLoading(true);
    setItems(await listTerritories());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const onAdd = async () => {
    if (!name.trim()) return;
    const ok = await createTerritory({ name: name.trim(), market, status: 'survey' });
    if (ok) { setName(''); load(); } else window.alert('تعذّر الإضافة.');
  };

  const cycleStatus = async (it) => {
    const idx = STATUS_FLOW.indexOf(it.status);
    const next = STATUS_FLOW[(idx + 1) % STATUS_FLOW.length];
    await setTerritoryStatus(it.id, next);
    load();
  };

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      <h1 className="font-black text-lg">المناطق المحمية</h1>

      {/* إضافة منطقة */}
      <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="اسم المنطقة (مثال: دمشق — المزة)"
          className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <select value={market} onChange={e => setMarket(e.target.value)}
            className="bg-surface-alt border border-border rounded-xl px-3 py-2 text-sm font-bold">
            <option value="syria">سوريا</option>
            <option value="turkey">تركيا</option>
          </select>
          <button onClick={onAdd}
            className="flex-1 bg-navy text-white rounded-xl py-2 text-sm font-black active:scale-[0.99]">
            + إضافة منطقة
          </button>
        </div>
      </div>

      {/* القائمة */}
      <section className="rounded-2xl bg-surface border border-border p-4">
        {loading ? (
          <p className="text-muted text-sm">جارٍ التحميل…</p>
        ) : items.length === 0 ? (
          <p className="text-muted text-sm">لا مناطق بعد — أضف أول منطقة.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map(it => (
              <li key={it.id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{it.name}</p>
                  <p className="text-muted text-xs">{it.market === 'syria' ? 'سوريا' : 'تركيا'}</p>
                </div>
                <button onClick={() => cycleStatus(it)}
                  className="text-xs font-black bg-surface-alt border border-border rounded-lg px-3 py-1.5 active:scale-95">
                  {TERRITORY_STATUS[it.status] || it.status} ↻
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
