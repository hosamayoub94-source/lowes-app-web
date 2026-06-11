// =============================================================
// WarehouseScreen — "شو عنا بضاعة" stock visibility + actions.
// Matrix: product × warehouse quantities + total. Receive into
// central, allocate central→sub, adjust. Gated by permissions.
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { PERMISSIONS } from '@data/permissions';
import {
  getStockMatrix, receiveStock, allocateStock, adjustStock,
  listMovements, createWarehouse, updateWarehouse,
  listSellersWithWarehouse, assignSellerWarehouse,
} from '@services/warehouseService';

const TYPE_LABEL = { central: '🏛️ مركزي', sales: '📦 مبيعات', distributor: '🚙 مناديب', returns: '↩️ مرتجعات' };
const MOVE_LABEL = { receive: '📥 استلام', allocate: '⇄ تحويل', adjust: '± جرد', reserve: '🛒 حجز طلب', release: '↩️ إرجاع مرتجع' };
const INP = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30';

// ── Management panel: create sub-warehouses + assign sellers + movement log ──
function ManagePanel({ warehouses, onChanged }) {
  const [tab, setTab] = useState('warehouses'); // warehouses | sellers | log
  const [sellers, setSellers] = useState([]);
  const [moves, setMoves]     = useState([]);
  const [newName, setNewName] = useState('');
  const [busy, setBusy]       = useState(false);
  const whName = (id) => warehouses.find(w => w.id === id)?.name ?? '—';

  const loadSellers = useCallback(async () => { try { setSellers(await listSellersWithWarehouse()); } catch {} }, []);
  const loadMoves   = useCallback(async () => { try { setMoves(await listMovements({ limit: 40 })); } catch {} }, []);
  useEffect(() => { if (tab === 'sellers') loadSellers(); if (tab === 'log') loadMoves(); }, [tab, loadSellers, loadMoves]);

  const addWarehouse = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try { await createWarehouse({ name: newName, type: 'distributor', market: 'syria' }); setNewName(''); onChanged?.(); }
    catch (e) { alert('فشل: ' + e.message); }
    finally { setBusy(false); }
  };
  const assign = async (profileId, whId) => {
    try { await assignSellerWarehouse(profileId, whId); loadSellers(); }
    catch (e) { alert('فشل الإسناد: ' + e.message); }
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
      <div className="flex gap-1.5">
        {[['warehouses','🏬 المخازن'],['sellers','👤 إسناد البائعين'],['log','📜 الحركات']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={'px-3 py-1.5 rounded-xl text-xs font-bold transition ' + (tab===k ? 'bg-teal text-navy' : 'bg-surface-alt text-muted hover:text-text')}>{l}</button>
        ))}
      </div>

      {tab === 'warehouses' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="اسم مخزن سوريا الفرعي (مندوب/مدينة)…" className={INP} />
            <button onClick={addWarehouse} disabled={busy || !newName.trim()} className="px-4 rounded-xl bg-teal text-navy text-sm font-bold disabled:opacity-40 shrink-0">+ إضافة</button>
          </div>
          <div className="space-y-1">
            {warehouses.map(w => (
              <div key={w.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-alt text-sm">
                <span className="text-text">{TYPE_LABEL[w.type]} {w.name} {w.market && <span className="text-[10px] text-muted">· {w.market}</span>}</span>
                {w.type !== 'central' && (
                  <button onClick={() => updateWarehouse(w.id, { is_active: !w.is_active }).then(onChanged)}
                    className="text-[11px] text-muted hover:text-red-fg">{w.is_active ? 'تعطيل' : 'تفعيل'}</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'sellers' && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted">أسند كل بائع لمخزنه الفرعي — تُخصم طلباته منه تلقائياً.</p>
          {sellers.map(s => (
            <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface-alt">
              <span className="text-sm text-text truncate flex-1">{s.employee_name} {s.team && <span className="text-[10px] text-muted">· {s.team}</span>}</span>
              <select value={s.warehouse_id || ''} onChange={e => assign(s.id, e.target.value)}
                className="border border-border rounded-lg px-2 py-1 text-xs bg-surface text-text max-w-[10rem]">
                <option value="">— افتراضي السوق —</option>
                {warehouses.filter(w => w.type !== 'central').map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {tab === 'log' && (
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {moves.length === 0 ? <p className="text-xs text-muted text-center py-4">لا حركات</p> : moves.map(m => (
            <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs border-b border-border/40">
              <span className="text-text">{MOVE_LABEL[m.type] || m.type} · <b className="tabular-nums">{m.quantity}</b></span>
              <span className="text-muted truncate">{m.from_warehouse_id ? whName(m.from_warehouse_id) : ''}{m.to_warehouse_id ? ' → ' + whName(m.to_warehouse_id) : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionModal({ title, warehouses, products, mode, onClose, onSubmit }) {
  // mode: 'receive' | 'allocate' | 'adjust'
  const central = warehouses.find(w => w.type === 'central');
  const [productId, setProductId]   = useState(products[0]?.id ?? '');
  const [fromWh, setFromWh]         = useState(central?.id ?? warehouses[0]?.id ?? '');
  const [toWh, setToWh]             = useState(warehouses.find(w => w.type !== 'central')?.id ?? '');
  const [warehouseId, setWarehouseId] = useState(central?.id ?? warehouses[0]?.id ?? '');
  const [qty, setQty]   = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    setSaving(true); setErr(null);
    try {
      if (mode === 'receive')  await onSubmit({ productId, warehouseId, quantity: qty, reason });
      if (mode === 'allocate') await onSubmit({ productId, fromWarehouseId: fromWh, toWarehouseId: toWh, quantity: qty });
      if (mode === 'adjust')   await onSubmit({ productId, warehouseId, newQuantity: qty, reason });
      onClose();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-base text-text">{title}</h3>

        <div>
          <label className="text-xs font-bold text-muted block mb-1.5">المنتج</label>
          <select value={productId} onChange={e => setProductId(e.target.value)} className={INP}>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {mode === 'allocate' ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">من مخزن</label>
              <select value={fromWh} onChange={e => setFromWh(e.target.value)} className={INP}>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">إلى مخزن</label>
              <select value={toWh} onChange={e => setToWh(e.target.value)} className={INP}>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">المخزن</label>
            <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className={INP}>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="text-xs font-bold text-muted block mb-1.5">
            {mode === 'adjust' ? 'الكمية الجديدة (المطلقة)' : 'الكمية'}
          </label>
          <input type="number" min="0" value={qty} onChange={e => setQty(e.target.value)}
            className={INP} placeholder="0" style={{ direction: 'ltr', textAlign: 'right' }} />
        </div>

        {mode !== 'allocate' && (
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">ملاحظة (اختياري)</label>
            <input value={reason} onChange={e => setReason(e.target.value)} className={INP} placeholder="السبب..." />
          </div>
        )}

        {err && <p className="text-xs text-red-fg bg-red-bg rounded-xl px-3 py-2">⚠️ {err}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted hover:text-text transition">إلغاء</button>
          <button onClick={submit} disabled={saving || !productId || !qty}
            className="flex-1 py-2.5 rounded-xl bg-teal text-navy text-sm font-bold disabled:opacity-40 hover:bg-teal/90 transition">
            {saving ? '…' : 'تأكيد'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WarehouseScreen() {
  const { name: userName } = useAuth();
  const { can } = usePermissions();
  const canCentral = can(PERMISSIONS.MANAGE_CENTRAL_STOCK);
  const canSales   = can(PERMISSIONS.MANAGE_SALES_STOCK);

  const [warehouses, setWarehouses] = useState([]);
  const [rows, setRows]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // 'receive' | 'allocate' | 'adjust' | null
  const [showManage, setShowManage] = useState(false);
  const [lowOnly, setLowOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { warehouses, rows } = await getStockMatrix();
      setWarehouses(warehouses);
      setRows(rows);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const products = useMemo(() => rows.map(r => ({ id: r.id, name: r.name })), [rows]);

  const isLow = (r) => r.min_stock != null && r.total <= r.min_stock;
  const lowCount = useMemo(() => rows.filter(isLow).length, [rows]);

  const filtered = useMemo(() => rows.filter(r =>
    (!search || r.name?.toLowerCase().includes(search.toLowerCase()) || (r.sku || '').toLowerCase().includes(search.toLowerCase()))
    && (!lowOnly || isLow(r))
  ), [rows, search, lowOnly]);

  const handleReceive  = async (p) => { await receiveStock({ ...p, performedBy: userName }); await load(); };
  const handleAllocate = async (p) => { await allocateStock({ ...p, performedBy: userName }); await load(); };
  const handleAdjust   = async (p) => { await adjustStock({ ...p, performedBy: userName }); await load(); };

  const grandTotals = useMemo(() => {
    const totals = {};
    let all = 0;
    for (const r of rows) {
      for (const w of warehouses) { totals[w.id] = (totals[w.id] || 0) + Number(r.perWh[w.id] || 0); }
      all += r.total;
    }
    return { totals, all };
  }, [rows, warehouses]);

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-text">📦 المخازن</h1>
          <p className="text-xs text-muted mt-0.5">شو عنا بضاعة — وأين · {grandTotals.all} قطعة إجمالاً</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {canCentral && (
            <>
              <button onClick={() => setModal('receive')} className="px-3 py-2 rounded-xl bg-green-bg text-green-fg text-xs font-bold hover:opacity-80 transition">+ استلام</button>
              <button onClick={() => setModal('allocate')} className="px-3 py-2 rounded-xl bg-teal text-navy text-xs font-bold hover:bg-teal/90 transition">⇄ تخصيص</button>
            </>
          )}
          {(canCentral || canSales) && (
            <button onClick={() => setModal('adjust')} className="px-3 py-2 rounded-xl bg-surface-alt text-muted text-xs font-bold hover:text-text transition border border-border">± جرد</button>
          )}
          {canCentral && (
            <button onClick={() => setShowManage(v => !v)} className={'px-3 py-2 rounded-xl text-xs font-bold transition border ' + (showManage ? 'bg-navy text-white border-navy' : 'bg-surface-alt text-muted hover:text-text border-border')}>⚙️ إدارة</button>
          )}
        </div>
      </div>

      {canCentral && showManage && <ManagePanel warehouses={warehouses} onChanged={load} />}

      <div className="flex gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 بحث بالمنتج أو SKU..."
          className="flex-1 border border-border rounded-xl px-3 py-2.5 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
        <button onClick={() => setLowOnly(v => !v)}
          className={'px-3 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition border ' +
            (lowOnly ? 'bg-red-fg text-white border-red-fg' : lowCount > 0 ? 'bg-red-bg text-red-fg border-red/30' : 'bg-surface-alt text-muted border-border')}>
          ⚠️ نواقص {lowCount > 0 ? `(${lowCount})` : ''}
        </button>
      </div>

      {loading ? (
        <div className="h-64 bg-surface-alt animate-pulse rounded-2xl" />
      ) : error ? (
        <div className="bg-red-bg border border-red/20 text-red-fg rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="underline text-xs">إعادة</button>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-2xl">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt">
              <tr>
                <th className="text-right px-3 py-2.5 font-bold text-muted sticky right-0 bg-surface-alt">المنتج</th>
                {warehouses.map(w => (
                  <th key={w.id} className="px-3 py-2.5 font-bold text-muted text-center whitespace-nowrap">
                    {TYPE_LABEL[w.type]?.split(' ')[0]} {w.name}
                  </th>
                ))}
                <th className="px-3 py-2.5 font-extrabold text-text text-center">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const low = r.min_stock != null && r.total <= r.min_stock;
                return (
                  <tr key={r.id} className="border-t border-border/40">
                    <td className="text-right px-3 py-2 text-text truncate max-w-[10rem] sticky right-0 bg-surface">{r.name}</td>
                    {warehouses.map(w => (
                      <td key={w.id} className="px-3 py-2 text-center tabular-nums text-muted">{r.perWh[w.id] || 0}</td>
                    ))}
                    <td className={`px-3 py-2 text-center tabular-nums font-extrabold ${low ? 'text-red-fg' : 'text-text'}`}>{r.total}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-surface-alt">
              <tr>
                <td className="text-right px-3 py-2.5 font-bold text-text sticky right-0 bg-surface-alt">الإجمالي</td>
                {warehouses.map(w => (
                  <td key={w.id} className="px-3 py-2.5 text-center tabular-nums font-bold text-text">{grandTotals.totals[w.id] || 0}</td>
                ))}
                <td className="px-3 py-2.5 text-center tabular-nums font-extrabold text-teal">{grandTotals.all}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {modal === 'receive'  && <ActionModal title="📥 استلام بضاعة" mode="receive"  warehouses={warehouses} products={products} onClose={() => setModal(null)} onSubmit={handleReceive} />}
      {modal === 'allocate' && <ActionModal title="⇄ تخصيص بين المخازن" mode="allocate" warehouses={warehouses} products={products} onClose={() => setModal(null)} onSubmit={handleAllocate} />}
      {modal === 'adjust'   && <ActionModal title="± جرد / تصحيح" mode="adjust"   warehouses={warehouses} products={products} onClose={() => setModal(null)} onSubmit={handleAdjust} />}
    </div>
  );
}
