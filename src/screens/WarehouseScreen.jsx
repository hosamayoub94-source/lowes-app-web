// =============================================================
// WarehouseScreen — "شو عنا بضاعة" stock visibility + actions.
// Matrix: product × warehouse quantities + total. Receive into
// central, allocate central→sub, adjust. Gated by permissions.
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { PERMISSIONS } from '@data/permissions';
import {
  getStockMatrix, receiveStock, allocateStock, adjustStock,
  listMovements, createWarehouse, updateWarehouse,
  listSellersWithWarehouse, assignSellerWarehouse, reverseMovement,
} from '@services/warehouseService';

const TYPE_LABEL = { central: '🏛️ مستودع', sales: '📦 مبيعات', wholesale: '🏪 جملة', distributor: '🚙 مناديب', returns: '↩️ مرتجعات' };
// ترتيب هرمي ضمن كل سوق: مستودع كبير → مبيعات → جملة → مناديب → مرتجعات
const TYPE_RANK = { central: 0, sales: 1, wholesale: 2, distributor: 3, returns: 4 };
const MARKET_LABEL = { syria: '🇸🇾 سوريا', turkey: '🇹🇷 تركيا' };
const MOVE_LABEL = { receive: '📥 استلام', allocate: '⇄ تحويل', adjust: '± جرد', reserve: '🛒 حجز طلب', release: '↩️ إرجاع مرتجع', reverse: '↩️ تراجع' };
const INP = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30';

// ── Management panel: create sub-warehouses + assign sellers + movement log ──
function ManagePanel({ warehouses, onChanged, userName, canReverse }) {
  const [tab, setTab] = useState('warehouses'); // warehouses | sellers | log
  const [sellers, setSellers] = useState([]);
  const [moves, setMoves]     = useState([]);
  const [newName, setNewName] = useState('');
  const [busy, setBusy]       = useState(false);
  const whName = (id) => warehouses.find(w => w.id === id)?.name ?? '—';

  const loadSellers = useCallback(async () => { try { setSellers(await listSellersWithWarehouse()); } catch {} }, []);
  const loadMoves   = useCallback(async () => { try { setMoves(await listMovements({ limit: 40 })); } catch {} }, []);
  useEffect(() => { if (tab === 'sellers') loadSellers(); if (tab === 'log') loadMoves(); }, [tab, loadSellers, loadMoves]);

  // مجموعة معرّفات الحركات التي تم التراجع عنها (لإخفاء زر التراجع ومنع التكرار).
  const reversedIds = useMemo(() => new Set(moves.filter(m => m.reverses_id).map(m => m.reverses_id)), [moves]);
  const doReverse = async (m) => {
    if (!window.confirm(`تراجع عن «${MOVE_LABEL[m.type] || m.type}» بكمية ${m.quantity}؟ سيُعكَس أثرها على المخزون.`)) return;
    try { await reverseMovement(m, userName); await loadMoves(); onChanged?.(); }
    catch (e) { alert('تعذّر التراجع: ' + e.message); }
  };

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
        <div className="space-y-1 max-h-80 overflow-y-auto">
          <p className="text-[11px] text-muted pb-1">تصحيح خطأ؟ اضغط «↩️ تراجع» على حركة الاستلام/التخصيص — يعكس أثرها على المخزون ويُسجَّل.</p>
          {moves.length === 0 ? <p className="text-xs text-muted text-center py-4">لا حركات</p> : moves.map(m => {
            const reversible = canReverse && ['receive', 'allocate'].includes(m.type);
            const isReversed = reversedIds.has(m.id);
            return (
              <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs border-b border-border/40">
                <span className={'text-text ' + (isReversed ? 'line-through opacity-50' : '')}>
                  {MOVE_LABEL[m.type] || m.type} · <b className="tabular-nums">{m.quantity}</b>
                  <span className="text-muted"> · {m.from_warehouse_id ? whName(m.from_warehouse_id) : ''}{m.to_warehouse_id ? ' → ' + whName(m.to_warehouse_id) : ''}</span>
                </span>
                {reversible && !isReversed && (
                  <button onClick={() => doReverse(m)} className="shrink-0 text-[11px] text-red-fg font-bold hover:underline">↩️ تراجع</button>
                )}
                {isReversed && <span className="shrink-0 text-[10px] text-muted">متراجَع ✓</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActionModal({ title, warehouses, products, mode, onClose, onSubmit, initialFrom, initialTo }) {
  // mode: 'receive' | 'allocate' | 'adjust'
  const central = warehouses.find(w => w.type === 'central');
  const [productId, setProductId]   = useState(products[0]?.id ?? '');
  const [fromWh, setFromWh]         = useState(initialFrom ?? central?.id ?? warehouses[0]?.id ?? '');
  const [toWh, setToWh]             = useState(initialTo ?? warehouses.find(w => w.type !== 'central')?.id ?? '');
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

// ── بطاقة مخزن (بنر مفصّل) — إحصائيات + تزويد + تفاصيل ──────────
function WarehouseCard({ wh, stats, hasCentral, canManage, onReplenish, onDetail }) {
  const isSub = wh.type !== 'central';
  const icon  = TYPE_LABEL[wh.type]?.split(' ')[0] || '📦';
  const typeName = TYPE_LABEL[wh.type]?.split(' ').slice(1).join(' ') || wh.type;
  return (
    <div className={'bg-surface border rounded-2xl p-3.5 flex flex-col gap-2.5 ' + (stats.neg > 0 ? 'border-red/40' : 'border-border')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-text text-sm truncate">{icon} {wh.name}</p>
          <p className="text-[10px] text-muted mt-0.5">{MARKET_LABEL[wh.market] || wh.market || '—'}{wh.owner_name ? ` · ${wh.owner_name}` : ''}</p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-alt text-muted shrink-0">{typeName}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div><p className="text-base font-black text-text tabular-nums">{stats.total}</p><p className="text-[9px] text-muted">قطعة</p></div>
        <div><p className="text-base font-black text-teal tabular-nums">{stats.products}</p><p className="text-[9px] text-muted">صنف</p></div>
        <div><p className={'text-base font-black tabular-nums ' + (stats.neg > 0 ? 'text-red-fg' : 'text-muted')}>{stats.neg}</p><p className="text-[9px] text-muted">سالب</p></div>
      </div>
      <div className="flex gap-1.5">
        <button onClick={() => onDetail(wh)} className="flex-1 py-1.5 rounded-lg bg-surface-alt text-muted text-[11px] font-bold hover:text-text transition">📋 الأصناف</button>
        {isSub && canManage && hasCentral && (
          <button onClick={() => onReplenish(wh)} className="flex-1 py-1.5 rounded-lg bg-teal/15 text-teal text-[11px] font-bold hover:bg-teal/25 transition">⬇️ تزويد من المستودع</button>
        )}
      </div>
    </div>
  );
}

// ── نافذة أصناف مخزن واحد ──────────────────────────────────────
function WarehouseDetailModal({ wh, rows, onClose }) {
  const items = rows.map(r => ({ name: r.name, qty: Number(r.perWh[wh.id] || 0) }))
    .filter(x => x.qty !== 0).sort((a, b) => b.qty - a.qty);
  const total = items.reduce((s, i) => s + i.qty, 0);
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl p-5 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-base text-text">{TYPE_LABEL[wh.type]?.split(' ')[0]} {wh.name}</h3>
        <p className="text-[11px] text-muted mb-3">{items.length} صنف · {total} قطعة</p>
        <div className="space-y-1 overflow-y-auto">
          {items.length === 0 ? <p className="text-xs text-muted text-center py-6">لا أصناف في هذا المخزن</p> :
            items.map((it, i) => (
              <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-surface-alt text-sm">
                <span className="text-text truncate">{it.name}</span>
                <b className={'tabular-nums shrink-0 ' + (it.qty < 0 ? 'text-red-fg' : 'text-text')}>{it.qty}</b>
              </div>
            ))}
        </div>
        <button onClick={onClose} className="mt-3 py-2.5 rounded-xl border border-border text-sm text-muted hover:text-text transition">إغلاق</button>
      </div>
    </div>
  );
}

export default function WarehouseScreen() {
  const navigate = useNavigate();
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
  const [marketFilter, setMarketFilter] = useState('all'); // all | syria | turkey
  const [showMatrix, setShowMatrix] = useState(false);     // الجدول التفصيلي مطويّ افتراضياً
  const [detailWh, setDetailWh] = useState(null);          // نافذة أصناف مخزن
  const [replenishWh, setReplenishWh] = useState(null);    // تزويد مخزن من المستودع

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

  // الأعمدة المعروضة: مفلترة بالسوق + مرتّبة هرمياً (مستودع→مبيعات→جملة) ضمن كل سوق.
  const visibleWarehouses = useMemo(() => {
    const list = warehouses.filter(w => marketFilter === 'all' || w.market === marketFilter);
    return [...list].sort((a, b) =>
      (a.market || '').localeCompare(b.market || '') ||
      (TYPE_RANK[a.type] ?? 9) - (TYPE_RANK[b.type] ?? 9) ||
      (a.name || '').localeCompare(b.name || ''));
  }, [warehouses, marketFilter]);

  // مجموع صف عبر الأعمدة المعروضة فقط (يطابق ما يُعرض عند فلترة السوق).
  const visTotal = useCallback((r) =>
    visibleWarehouses.reduce((s, w) => s + Number(r.perWh[w.id] || 0), 0), [visibleWarehouses]);

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
      for (const w of visibleWarehouses) { totals[w.id] = (totals[w.id] || 0) + Number(r.perWh[w.id] || 0); }
      all += visibleWarehouses.reduce((s, w) => s + Number(r.perWh[w.id] || 0), 0);
    }
    return { totals, all };
  }, [rows, visibleWarehouses]);

  const markets = useMemo(() => [...new Set(warehouses.map(w => w.market).filter(Boolean))], [warehouses]);

  // إحصائيات كل مخزن (إجمالي القطع · عدد الأصناف الموجبة · عدد السوالب).
  const whStats = useMemo(() => {
    const m = {};
    for (const w of warehouses) m[w.id] = { total: 0, products: 0, neg: 0 };
    for (const r of rows) {
      for (const w of warehouses) {
        const q = Number(r.perWh[w.id] || 0);
        if (q === 0) continue;
        m[w.id].total += q;
        if (q > 0) m[w.id].products++; else m[w.id].neg++;
      }
    }
    return m;
  }, [rows, warehouses]);

  const centralOfMarket = useCallback(
    (market) => warehouses.find(w => w.type === 'central' && w.market === market),
    [warehouses]);

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
          <button onClick={() => navigate('/guide')} className="px-3 py-2 rounded-xl bg-surface-alt text-muted text-xs font-bold hover:text-text transition border border-border">📖 دليل</button>
          {canCentral && (
            <button onClick={() => setShowManage(v => !v)} className={'px-3 py-2 rounded-xl text-xs font-bold transition border ' + (showManage ? 'bg-navy text-white border-navy' : 'bg-surface-alt text-muted hover:text-text border-border')}>⚙️ إدارة</button>
          )}
        </div>
      </div>

      {canCentral && showManage && <ManagePanel warehouses={warehouses} onChanged={load} userName={userName} canReverse={canCentral} />}

      {markets.length > 1 && (
        <div className="flex gap-1.5">
          {[['all', '🌍 الكل'], ...markets.map(m => [m, MARKET_LABEL[m] || m])].map(([k, l]) => (
            <button key={k} onClick={() => setMarketFilter(k)}
              className={'px-3 py-1.5 rounded-xl text-xs font-bold transition border ' +
                (marketFilter === k ? 'bg-teal text-navy border-teal' : 'bg-surface-alt text-muted hover:text-text border-border')}>{l}</button>
          ))}
        </div>
      )}

      {/* بطاقات المخازن (بنرات مفصّلة) مجمَّعة حسب السوق + هرمياً */}
      {!loading && !error && (marketFilter === 'all' ? markets : [marketFilter]).map(mk => {
        const whs = visibleWarehouses.filter(w => w.market === mk);
        if (!whs.length) return null;
        return (
          <div key={mk} className="space-y-2">
            <p className="text-xs font-bold text-muted">{MARKET_LABEL[mk] || mk}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {whs.map(w => (
                <WarehouseCard key={w.id} wh={w} stats={whStats[w.id] || { total: 0, products: 0, neg: 0 }}
                  hasCentral={!!centralOfMarket(w.market)} canManage={canCentral}
                  onReplenish={setReplenishWh} onDetail={setDetailWh} />
              ))}
            </div>
          </div>
        );
      })}

      {/* زر الجدول التفصيلي (منتج × مخزن) — مطويّ افتراضياً */}
      {!loading && !error && (
        <button onClick={() => setShowMatrix(v => !v)}
          className="w-full text-right px-3 py-2.5 rounded-xl bg-surface-alt text-sm font-bold text-text hover:bg-surface-alt/70 transition border border-border">
          {showMatrix ? '▾' : '▸'} 📊 الجدول التفصيلي (منتج × مخزن)
        </button>
      )}

      {showMatrix && (
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
      )}

      {loading ? (
        <div className="h-64 bg-surface-alt animate-pulse rounded-2xl" />
      ) : error ? (
        <div className="bg-red-bg border border-red/20 text-red-fg rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="underline text-xs">إعادة</button>
        </div>
      ) : showMatrix ? (
        <div className="overflow-x-auto border border-border rounded-2xl">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt">
              <tr>
                <th className="text-right px-3 py-2.5 font-bold text-muted sticky right-0 bg-surface-alt">المنتج</th>
                {visibleWarehouses.map(w => (
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
                    {visibleWarehouses.map(w => (
                      <td key={w.id} className="px-3 py-2 text-center tabular-nums text-muted">{r.perWh[w.id] || 0}</td>
                    ))}
                    <td className={`px-3 py-2 text-center tabular-nums font-extrabold ${low ? 'text-red-fg' : 'text-text'}`}>{visTotal(r)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-surface-alt">
              <tr>
                <td className="text-right px-3 py-2.5 font-bold text-text sticky right-0 bg-surface-alt">الإجمالي</td>
                {visibleWarehouses.map(w => (
                  <td key={w.id} className="px-3 py-2.5 text-center tabular-nums font-bold text-text">{grandTotals.totals[w.id] || 0}</td>
                ))}
                <td className="px-3 py-2.5 text-center tabular-nums font-extrabold text-teal">{grandTotals.all}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      {modal === 'receive'  && <ActionModal title="📥 استلام بضاعة" mode="receive"  warehouses={warehouses} products={products} onClose={() => setModal(null)} onSubmit={handleReceive} />}
      {modal === 'allocate' && <ActionModal title="⇄ تخصيص بين المخازن" mode="allocate" warehouses={warehouses} products={products} onClose={() => setModal(null)} onSubmit={handleAllocate} />}
      {modal === 'adjust'   && <ActionModal title="± جرد / تصحيح" mode="adjust"   warehouses={warehouses} products={products} onClose={() => setModal(null)} onSubmit={handleAdjust} />}

      {/* تزويد مخزن فرعي من المستودع المركزي لسوقه (تخصيص مُسبق) */}
      {replenishWh && (
        <ActionModal title={`⬇️ تزويد «${replenishWh.name}» من المستودع`} mode="allocate"
          warehouses={warehouses} products={products}
          initialFrom={centralOfMarket(replenishWh.market)?.id} initialTo={replenishWh.id}
          onClose={() => setReplenishWh(null)} onSubmit={handleAllocate} />
      )}

      {/* نافذة أصناف مخزن واحد */}
      {detailWh && <WarehouseDetailModal wh={detailWh} rows={rows} onClose={() => setDetailWh(null)} />}
    </div>
  );
}
