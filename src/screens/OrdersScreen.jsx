// =============================================================
// OrdersScreen — نظام إدارة الطلبات
// تركيا 🇹🇷 + سوريا 🇸🇾
// منظومة البائع: طلباتي + دفع جزئي + فاتورة + عمولة
// =============================================================
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@services/supabase';
import { useAuth }  from '@hooks/useAuth';
import { ROLES }    from '@data/teams';
import { sendNotification } from '@modules/notifications/services/notificationService';
import { NOTIFICATION_TYPE } from '@modules/notifications/types/notification.types';
import { reserveForOrder, releaseForOrder } from '@services/warehouseService';
import { citiesForMarket, shippingForMarket, paymentForMarket, districtsForCity, isMotorZone, buildTurkishAddress } from '@data/cities';
import { SYRIA_PROVINCES, getSyriaDistricts, getSyriaNeighborhoods } from '@data/syriaAddress';
import { ComboBox } from '@components/ui/ComboBox';
import { fetchNeighborhoods, fetchStreets } from '@services/turkeyApi';
import { targetForCurrency } from '@data/targets';
import { lookupCustomer, starLabel } from '@services/customerService';
import { saveEconomics } from '@services/profitabilityService';

// ── Google Sheet dual-write (Syria) ──────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;
async function syncOrderToSheet(orderId) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/sync-order-to-sheet`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
  } catch { /* best-effort; sheet_synced stays false for retry */ }
}

// Notify the seller (order.handler_name) that their order moved to a new stage.
// Best-effort: looks up the seller's profile id by name, never blocks the UI.
async function notifySellerStatusChange(order, newStatus, actorName) {
  try {
    if (!order?.handler_name) return;
    // For 'delivered' we always nudge the seller (retention); for other
    // stages, skip notifying themselves.
    if (newStatus !== 'delivered' && order.handler_name === actorName) return;
    const { data: prof } = await supabase
      .from('profiles')
      .select('id')
      .eq('employee_name', order.handler_name)
      .maybeSingle();
    if (!prof?.id) return;
    const cust = order.customer_name || 'العميل';
    const meta = STATUSES[newStatus];

    if (newStatus === 'delivered') {
      // Lozy retention reminder after each delivery.
      await sendNotification({
        userId:     prof.id,
        type:       NOTIFICATION_TYPE.SYSTEM_ALERT,
        title:      `💚 تم تسليم طلب ${cust}`,
        message:    `تواصل مع ${cust} بعد يوم-يومين: اطمئن على المنتج، أظهر اهتمامك، واقترح منتجاً مكمّلاً. عميل سعيد = بيع متكرر! تجده في «العملاء والأرشيف».`,
        entityType: 'order',
        entityId:   order.id,
        metadata:   { order_id: order.order_id, status: newStatus, kind: 'followup' },
      });
      return;
    }

    await sendNotification({
      userId:     prof.id,
      type:       NOTIFICATION_TYPE.SYSTEM_ALERT,
      title:      `${meta?.icon ?? '📦'} طلبك ${order.order_id}: ${meta?.label ?? newStatus}`,
      message:    `${cust} — انتقل الطلب إلى مرحلة «${meta?.label ?? newStatus}».`,
      entityType: 'order',
      entityId:   order.id,
      metadata:   { order_id: order.order_id, status: newStatus },
    });
  } catch { /* notifications are best-effort */ }
}

// ── Constants ────────────────────────────────────────────────
const STATUSES = {
  pending:      { label: 'وارد جديد',         icon: '📥', bg: 'bg-surface-alt', text: 'text-muted',      border: 'border-border'      },
  preparing:    { label: 'في التجهيز',        icon: '📦', bg: 'bg-amber-bg',    text: 'text-amber-fg',   border: 'border-amber/30'    },
  ready:        { label: 'جاهز للشحن',        icon: '🚀', bg: 'bg-violet-100',  text: 'text-violet-700', border: 'border-violet-200'  },
  motor:        { label: 'قيد توصيل الموتور', icon: '🏍️', bg: 'bg-blue-100',    text: 'text-blue-700',   border: 'border-blue-200'    },
  at_center:    { label: 'في المركز',         icon: '🏢', bg: 'bg-blue-50',     text: 'text-blue-700',   border: 'border-blue-200'    },
  shipped:      { label: 'في النقل',          icon: '🚚', bg: 'bg-blue-100',    text: 'text-blue-700',   border: 'border-blue-200'    },
  on_way:       { label: 'في الطريق للعميل',  icon: '🛵', bg: 'bg-blue-100',    text: 'text-blue-700',   border: 'border-blue-200'    },
  delivered:    { label: 'تم التسليم',        icon: '✅', bg: 'bg-green-bg',    text: 'text-green-fg',   border: 'border-green/30'    },
  waiting:      { label: 'بالانتظار/متابعة',  icon: '⏳', bg: 'bg-amber-bg',    text: 'text-amber-fg',   border: 'border-amber/30'    },
  not_received: { label: 'لم يتم الاستلام',   icon: '📭', bg: 'bg-red-bg',      text: 'text-red-fg',     border: 'border-red/30'      },
  returning:    { label: 'راجع للمركز',       icon: '↩️', bg: 'bg-red-bg',      text: 'text-red-fg',     border: 'border-red/30'      },
  returned:     { label: 'راجع',              icon: '🔁', bg: 'bg-red-bg',      text: 'text-red-fg',     border: 'border-red/30'      },
  settled:      { label: 'تمت التسوية',       icon: '🤝', bg: 'bg-green-bg',    text: 'text-green-fg',   border: 'border-green/30'    },
  cancelled:    { label: 'ملغي',              icon: '❌', bg: 'bg-red-bg',      text: 'text-red-fg',     border: 'border-red/30'      },
};

// Linear pipeline for the progress strip; any status outside it hides the strip.
const STAGES_ORDER = ['pending', 'preparing', 'ready', 'shipped', 'delivered'];

// ── Commission helpers ────────────────────────────────────────
const CURRENCY_SYMBOLS = { TRY: '₺', SYP: '£', USD: '$' };
const THIS_MONTH = new Date().toISOString().slice(0, 7); // '2026-06'

// Convert any order amount to USD using admin-set rates (units per 1 USD).
function toUSD(amount, currency, rates) {
  const a = Number(amount || 0);
  if (!a) return 0;
  const cur = String(currency || 'SYP').toUpperCase();
  if (cur === 'USD') return a;
  if (cur === 'TRY') return a / (Number(rates?.try_per_usd) || 33);
  if (cur === 'SYP') return a / (Number(rates?.syp_per_usd) || 14000);
  return 0;
}

function useCommission(isManager) {
  const [rulesById, setRulesById] = useState(null); // { turkey:{...}, syria:{...} }
  const [adjustments, setAdj] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('commission_rules').select('*')
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(r => { map[r.id] = r; });
        if (!map.turkey) map.turkey = { id: 'turkey', monthly_target_try: 65000, monthly_target_usd: 0, try_per_usd: 33, syp_per_usd: 14000, base_commission_pct: 0, prepaid_bonus_try: 0, prepaid_bonus_pct: 0, repeat_customer_bonus_try: 0 };
        if (!map.syria)  map.syria  = { id: 'syria',  monthly_target_try: 0, monthly_target_usd: 1000, try_per_usd: 33, syp_per_usd: 14000, base_commission_pct: 0, prepaid_bonus_try: 0, prepaid_bonus_pct: 0, repeat_customer_bonus_try: 0 };
        setRulesById(map);
      });
    supabase.from('monthly_commission_adjustments').select('*').eq('month', THIS_MONTH)
      .then(({ data }) => setAdj(data || []));
  }, []);

  // Shared conversion rates live on the turkey row.
  const rates = rulesById ? { try_per_usd: rulesById.turkey?.try_per_usd ?? 33, syp_per_usd: rulesById.turkey?.syp_per_usd ?? 14000 } : { try_per_usd: 33, syp_per_usd: 14000 };
  const rules = rulesById?.turkey || null; // backward-compat for the settings panel

  const saveRules = async (updated, actor) => {
    setSaving(true);
    // Persist conversion rates to BOTH rows so they stay in sync.
    const ratePatch = { try_per_usd: Number(updated.try_per_usd) || 33, syp_per_usd: Number(updated.syp_per_usd) || 14000 };
    await supabase.from('commission_rules').upsert({ ...updated, ...ratePatch, updated_at: new Date().toISOString(), updated_by: actor });
    await supabase.from('commission_rules').update(ratePatch).eq('id', 'syria');
    if (updated.syria_target_usd != null) {
      await supabase.from('commission_rules').update({ monthly_target_usd: Number(updated.syria_target_usd) }).eq('id', 'syria');
    }
    setRulesById(prev => ({
      ...prev,
      turkey: { ...prev.turkey, ...updated, ...ratePatch },
      syria:  { ...prev.syria, ...ratePatch, monthly_target_usd: updated.syria_target_usd != null ? Number(updated.syria_target_usd) : prev.syria?.monthly_target_usd },
    }));
    setSaving(false);
  };

  const saveAdj = async (employeeName, adjustmentTry, note, actor) => {
    setSaving(true);
    const row = { employee_name: employeeName, month: THIS_MONTH, adjustment_try: Number(adjustmentTry), note, created_by: actor };
    await supabase.from('monthly_commission_adjustments').upsert(row, { onConflict: 'employee_name,month' });
    setAdj(prev => {
      const filtered = prev.filter(a => a.employee_name !== employeeName);
      return [...filtered, { ...row }];
    });
    setSaving(false);
  };

  return { rules, rulesById, rates, adjustments, saveRules, saveAdj, saving };
}

// ── Commission Panel (admin settings) ────────────────────────
function CommissionSettings({ rules, syriaTargetUsd, onSave, saving, actor }) {
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    if (rules) setDraft({ ...rules, syria_target_usd: syriaTargetUsd ?? 1000 });
  }, [rules, syriaTargetUsd]);
  if (!draft) return null;
  const f = (k) => (e) => setDraft(p => ({ ...p, [k]: Number(e.target.value) }));
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-extrabold text-text">⚙️ إعدادات العمولة والتارجت</h3>

      <p className="text-[11px] font-bold text-muted">🎯 التارجت</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] text-muted font-bold">🇹🇷 تارجت تركيا (TRY)</label>
          <input type="number" value={draft.monthly_target_try || 0} onChange={f('monthly_target_try')} min="0"
            className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted font-bold">🇸🇾 تارجت سوريا ($)</label>
          <input type="number" value={draft.syria_target_usd || 0} onChange={f('syria_target_usd')} min="0"
            className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
        </div>
      </div>

      <p className="text-[11px] font-bold text-muted pt-1">💱 أسعار التحويل لـ USD (كم وحدة = 1$)</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] text-muted font-bold">₺ ليرة تركية / دولار</label>
          <input type="number" value={draft.try_per_usd || 0} onChange={f('try_per_usd')} min="0"
            className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted font-bold">£ ليرة سورية / دولار</label>
          <input type="number" value={draft.syp_per_usd || 0} onChange={f('syp_per_usd')} min="0"
            className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
        </div>
      </div>

      <p className="text-[11px] font-bold text-muted pt-1">💰 العمولة (تركيا)</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { k: 'base_commission_pct', label: 'نسبة عمولة الأساس %', icon: '💰' },
          { k: 'prepaid_bonus_try', label: 'بونص الدفع المسبق (₺/طلب)', icon: '⚡' },
          { k: 'prepaid_bonus_pct', label: 'أو نسبة الدفع المسبق %', icon: '⚡' },
          { k: 'repeat_customer_bonus_try', label: 'بونص العميل المكرر (₺/عميل)', icon: '🔄' },
        ].map(({ k, label, icon }) => (
          <div key={k} className="space-y-1">
            <label className="text-[10px] text-muted font-bold">{icon} {label}</label>
            <input type="number" value={draft[k] || 0} onChange={f(k)} min="0"
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
          </div>
        ))}
      </div>
      <button onClick={() => onSave(draft, actor)} disabled={saving}
        className="w-full py-2.5 rounded-xl bg-teal text-white text-sm font-bold hover:bg-teal/90 transition disabled:opacity-40">
        {saving ? 'جاري الحفظ…' : '💾 حفظ الإعدادات'}
      </button>
    </div>
  );
}

// ── Per-employee commission card ──────────────────────────────
function EmployeeCommissionCard({ emp, rank, rules, rates, targetUsd, adj, onSaveAdj, saving, isManager, isMe }) {
  const [showAdj, setShowAdj] = useState(false);
  const [adjVal, setAdjVal] = useState('');
  const [adjNote, setAdjNote] = useState('');

  if (!rules) return null;
  const tryTotal = emp.totals['TRY'] || 0;

  // USD-equivalent total across ALL currencies — the unified metric. A Syria
  // seller's Turkey (TRY) sales convert and count toward their $ target too.
  const usdTotal = emp.orders.reduce((s, o) => s + toUSD(o.amount, o.currency, rates), 0);
  const targetU  = Number(targetUsd) || 0;
  const pct = targetU > 0 ? Math.min(100, Math.round((usdTotal / targetU) * 100)) : 0;

  // Count prepaid orders
  const prepaidCount = emp.orders.filter(o =>
    (o.payment_method || '').includes('مسبق') || (o.payment_method || '').includes('bank') || (o.payment_method || '').includes('بنك')
  ).length;

  // Base commission
  const baseCommission = rules.base_commission_pct > 0 ? (tryTotal * rules.base_commission_pct / 100) : 0;

  // Prepaid bonus
  const prepaidBonus = rules.prepaid_bonus_pct > 0
    ? emp.orders.filter(o => (o.payment_method || '').includes('مسبق')).reduce((s, o) => s + Number(o.amount || 0), 0) * rules.prepaid_bonus_pct / 100
    : prepaidCount * (rules.prepaid_bonus_try || 0);

  // Repeat customer bonus (orders where customer has previous order)
  const repeatBonus = (emp.repeatCount || 0) * (rules.repeat_customer_bonus_try || 0);

  // Manual adjustment
  const manualAdj = adj?.adjustment_try || 0;
  const adjNote_saved = adj?.note || '';

  const netCommission = baseCommission + prepaidBonus + repeatBonus + manualAdj;

  const RANK_ICONS = ['🥇', '🥈', '🥉'];

  return (
    <div className={`bg-surface border-2 rounded-2xl p-4 space-y-3 ${isMe ? 'border-teal/60' : 'border-border'}`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="text-2xl shrink-0">{RANK_ICONS[rank] || `#${rank + 1}`}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-extrabold text-text">{emp.name}</p>
            {isMe && <span className="text-[10px] bg-teal/20 text-teal px-2 py-0.5 rounded-full font-bold">أنت</span>}
          </div>
          <p className="text-xs text-muted">{emp.orders.length} طلب مسلّم · {prepaidCount} مسبق</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-black text-text">${usdTotal.toFixed(0)}</p>
          {Object.entries(emp.totals).map(([cur, val]) => (
            <p key={cur} className="text-[11px] text-muted">
              {CURRENCY_SYMBOLS[cur]}{val.toLocaleString('en-US')} {cur}
            </p>
          ))}
        </div>
      </div>

      {/* Target progress (USD-equivalent — unified across currencies) */}
      {targetU > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted font-bold">🎯 التارجت</span>
            <span className={`font-extrabold ${pct >= 100 ? 'text-green-fg' : 'text-text'}`}>
              ${usdTotal.toFixed(0)} / ${targetU.toLocaleString('en-US')} ({pct}%)
            </span>
          </div>
          <div className="h-2 bg-surface-alt rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-fg' : pct >= 70 ? 'bg-teal' : 'bg-amber-fg'}`}
              style={{ width: pct + '%' }} />
          </div>
        </div>
      )}

      {/* Commission breakdown */}
      {(baseCommission > 0 || prepaidBonus > 0 || repeatBonus > 0 || manualAdj !== 0) && (
        <div className="bg-surface-alt rounded-xl p-3 space-y-1.5 text-xs">
          <p className="font-extrabold text-text text-[11px] mb-2">💰 تفصيل العمولة</p>
          {baseCommission > 0 && (
            <div className="flex justify-between"><span className="text-muted">عمولة أساس ({rules.base_commission_pct}%)</span><span className="font-bold text-green-fg">+₺{baseCommission.toFixed(0)}</span></div>
          )}
          {prepaidBonus > 0 && (
            <div className="flex justify-between"><span className="text-muted">⚡ دفع مسبق ({prepaidCount} طلب)</span><span className="font-bold text-teal">+₺{prepaidBonus.toFixed(0)}</span></div>
          )}
          {repeatBonus > 0 && (
            <div className="flex justify-between"><span className="text-muted">🔄 عميل مكرر</span><span className="font-bold text-teal">+₺{repeatBonus.toFixed(0)}</span></div>
          )}
          {manualAdj !== 0 && (
            <div className="flex justify-between">
              <span className="text-muted">{adjNote_saved || 'تعديل يدوي'}</span>
              <span className={`font-bold ${manualAdj > 0 ? 'text-green-fg' : 'text-red-fg'}`}>{manualAdj > 0 ? '+' : ''}₺{manualAdj.toFixed(0)}</span>
            </div>
          )}
          <div className="border-t border-border pt-1.5 flex justify-between">
            <span className="font-extrabold text-text">الصافي</span>
            <span className={`font-extrabold text-base ${netCommission > 0 ? 'text-green-fg' : 'text-red-fg'}`}>₺{netCommission.toFixed(0)}</span>
          </div>
        </div>
      )}

      {/* No commission configured yet */}
      {baseCommission === 0 && prepaidBonus === 0 && repeatBonus === 0 && manualAdj === 0 && tryTotal > 0 && (
        <div className="text-xs text-muted text-center py-1">
          {pct >= 100 ? '✅ وصل التارجت' : `${100 - pct}% للتارجت`}
        </div>
      )}

      {/* Products */}
      {Object.keys(emp.products).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(emp.products).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name, qty]) => (
            <span key={name} className="text-[10px] bg-surface border border-border rounded-xl px-2 py-1 text-muted">
              {name} <span className="font-extrabold text-text">×{qty}</span>
            </span>
          ))}
        </div>
      )}

      {/* Admin: manual adjustment */}
      {isManager && (
        <div>
          <button onClick={() => setShowAdj(v => !v)}
            className="text-xs text-muted hover:text-text transition font-bold">
            ✏️ {showAdj ? 'إخفاء' : 'تعديل يدوي'}
            {manualAdj !== 0 && <span className={`ml-1 ${manualAdj > 0 ? 'text-green-fg' : 'text-red-fg'}`}>({manualAdj > 0 ? '+' : ''}₺{manualAdj})</span>}
          </button>
          {showAdj && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                <input type="number" value={adjVal} onChange={e => setAdjVal(e.target.value)}
                  placeholder="₺ قيمة (سالب=خصم)"
                  className="flex-1 border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
                <input value={adjNote} onChange={e => setAdjNote(e.target.value)}
                  placeholder="السبب"
                  className="flex-1 border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
              </div>
              <button onClick={() => { onSaveAdj(emp.name, adjVal, adjNote); setShowAdj(false); }} disabled={saving}
                className="w-full py-2 rounded-xl bg-navy text-white text-xs font-bold hover:bg-navy/90 transition disabled:opacity-40">
                {saving ? '…' : '💾 حفظ التعديل'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Product values (sold products + editable catalog price) ───
// المنتجات المباعة من الطلبات المسلّمة + قيمتها (USD) من أسعار الكتالوج.
// السعر قابل للتحرير ويُحفظ في product_economics (نفس مصدر صفحة الربحية).
function ProductValuesSection({ delivered, canEdit }) {
  const norm = (s) => String(s || '').trim().toLowerCase();
  const [open, setOpen]         = useState(true);
  const [prices, setPrices]     = useState({});   // norm(name) -> sale_price_usd
  const [savingKey, setSaving]  = useState(null);
  const [savedKey, setSaved]    = useState(null);

  useEffect(() => {
    let alive = true;
    supabase.from('product_economics').select('item_name, sale_price_usd').then(({ data }) => {
      if (!alive || !data) return;
      const m = {};
      data.forEach(r => { m[norm(r.item_name)] = Number(r.sale_price_usd) || 0; });
      setPrices(m);
    });
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => {
    const agg = {};
    for (const o of delivered) {
      (o.items || []).forEach(it => {
        const name = (it.name || '').trim();
        if (!name) return;
        const k = norm(name);
        if (!agg[k]) agg[k] = { key: k, name, qty: 0 };
        agg[k].qty += Number(it.qty || 1);
      });
    }
    return Object.values(agg)
      .map(r => { const price = prices[r.key]; const has = price != null && price > 0;
        return { ...r, price: has ? price : null, value: has ? price * r.qty : null }; })
      .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || b.qty - a.qty);
  }, [delivered, prices]);

  const totalValue = rows.reduce((s, r) => s + (r.value || 0), 0);
  const totalQty   = rows.reduce((s, r) => s + r.qty, 0);

  const savePrice = async (row, raw) => {
    const v = raw === '' ? 0 : Number(raw);
    if (Number.isNaN(v) || v === (row.price ?? 0)) return;
    setPrices(p => ({ ...p, [row.key]: v }));        // optimistic
    setSaving(row.key);
    try {
      await saveEconomics(row.name, { sale_price_usd: v });
      setSaved(row.key); setTimeout(() => setSaved(k => (k === row.key ? null : k)), 1500);
    } catch (e) { window.alert('تعذّر حفظ السعر: ' + e.message); }
    finally { setSaving(k => (k === row.key ? null : k)); }
  };

  if (rows.length === 0) return null;
  const GRID = 'grid grid-cols-[1fr_3rem_4rem_5rem] gap-2 items-center';

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-alt transition">
        <span className="font-extrabold text-text text-sm">
          🧾 المنتجات المباعة <span className="text-muted font-normal">({rows.length})</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-black text-teal">≈ ${totalValue.toLocaleString('en-US')}</span>
          <span className="text-muted text-xs">{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className={`${GRID} px-2 py-1 text-[10px] text-muted font-bold`}>
            <span>المنتج</span><span className="text-center">الكمية</span>
            <span className="text-center">السعر $</span><span className="text-left">القيمة $</span>
          </div>
          {rows.map(r => (
            <div key={r.key} className={`${GRID} px-2 py-1.5 border-t border-border text-xs`}>
              <span className="text-text truncate" title={r.name}>{r.name}</span>
              <span className="font-bold text-text tabular-nums text-center">×{r.qty}</span>
              {canEdit ? (
                <input type="number" min="0" defaultValue={r.price ?? ''} onBlur={e => savePrice(r, e.target.value)}
                  placeholder="—"
                  className="w-full border border-border rounded-lg px-1.5 py-1 text-xs bg-surface-alt text-text text-center focus:outline-none focus:ring-2 focus:ring-teal/30" />
              ) : (
                <span className="text-muted tabular-nums text-center">{r.price != null ? '$' + r.price : '—'}</span>
              )}
              <span className="font-extrabold text-text tabular-nums text-left">
                {r.value != null ? '$' + r.value.toLocaleString('en-US') : '—'}
                {savingKey === r.key && <span className="text-muted"> …</span>}
                {savedKey === r.key && <span className="text-green-fg"> ✓</span>}
              </span>
            </div>
          ))}
          <div className={`${GRID} px-2 py-2 border-t-2 border-border text-xs font-extrabold`}>
            <span className="text-text">الإجمالي</span>
            <span className="text-text tabular-nums text-center">×{totalQty}</span>
            <span></span>
            <span className="text-teal tabular-nums text-left">${totalValue.toLocaleString('en-US')}</span>
          </div>
          <p className="text-[10px] text-muted mt-2 px-2 leading-relaxed">
            القيمة تقديرية حسب أسعار الكتالوج (USD). المنتجات بـ «—» تحتاج إدخال سعرها — اكتبه بالخانة ويُحفظ تلقائياً.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Monthly Deliveries Tab ────────────────────────────────────

function MonthlyDeliveriesTab({ orders, isManager, userName, onArchive, archiving }) {
  const [brand, setBrand] = useState('all');
  const [showSettings, setShowSettings] = useState(false);
  const { rules, rulesById, rates, adjustments, saveRules, saveAdj, saving } = useCommission(isManager);

  const now = new Date();
  const monthLabel = now.toLocaleString('ar-SA', { month: 'long', year: 'numeric' });
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Filter: delivered this month
  const delivered = useMemo(() => orders.filter(o =>
    o.status === 'delivered' &&
    o.archived !== true &&
    o.order_date && o.order_date >= monthStart &&
    (brand === 'all' || (o.brand || 'lowes').toLowerCase() === brand)
  ), [orders, brand, monthStart]);

  // Group by employee, with USD-equivalent total + dominant market
  const byEmployee = useMemo(() => {
    const map = {};
    for (const o of delivered) {
      const name = o.handler_name || 'غير محدد';
      if (!map[name]) map[name] = { name, orders: [], totals: {}, products: {}, marketCount: {} };
      map[name].orders.push(o);
      const cur = (o.currency || 'SYP').toUpperCase();
      map[name].totals[cur] = (map[name].totals[cur] || 0) + Number(o.amount || 0);
      const mk = o.market || 'turkey';
      map[name].marketCount[mk] = (map[name].marketCount[mk] || 0) + 1;
      (o.items || []).forEach(it => {
        const k = it.name || '—';
        map[name].products[k] = (map[name].products[k] || 0) + Number(it.qty || 1);
      });
    }
    const list = Object.values(map).map(emp => {
      emp.usdTotal = emp.orders.reduce((s, o) => s + toUSD(o.amount, o.currency, rates), 0);
      // dominant market = the one with the most delivered orders
      emp.market = Object.entries(emp.marketCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'turkey';
      return emp;
    });
    // Sort by USD total (the unified metric) descending
    return list.sort((a, b) => b.usdTotal - a.usdTotal);
  }, [delivered, rates]);

  // Target (USD) for a given market.
  const targetUsdFor = (market) => {
    if (market === 'syria') return Number(rulesById?.syria?.monthly_target_usd) || 1000;
    // Turkey team's TRY target expressed in USD (so everyone compares in $)
    const tTry = Number(rulesById?.turkey?.monthly_target_try) || 0;
    const tUsd = Number(rulesById?.turkey?.monthly_target_usd) || 0;
    return tUsd > 0 ? tUsd : (tTry > 0 ? tTry / (Number(rates?.try_per_usd) || 33) : 0);
  };

  // Grand totals
  const grandTotals = useMemo(() => {
    const t = {};
    delivered.forEach(o => {
      const c = (o.currency || 'SYP').toUpperCase();
      t[c] = (t[c] || 0) + Number(o.amount || 0);
    });
    return t;
  }, [delivered]);

  const RANK_ICONS = ['🥇', '🥈', '🥉'];
  const BRAND_COLORS = { lowes: 'border-teal/40 bg-teal/5', strong: 'border-amber/40 bg-amber/5' };

  // Archive eligible: delivered this month by managers
  const archiveEligible = useMemo(() => delivered.filter(o => !o.archived), [delivered]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-navy/10 to-teal/5 border border-navy/20 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-text text-base">📦 تسليمات {monthLabel}</h2>
            <p className="text-xs text-muted mt-0.5">{delivered.length} طلب مسلّم · {byEmployee.length} موظف</p>
          </div>
          {isManager && archiveEligible.length > 0 && (
            <button onClick={() => onArchive(archiveEligible.map(o => o.id))} disabled={archiving}
              className="px-3 py-2 rounded-xl bg-navy text-white text-xs font-bold hover:bg-navy/90 transition disabled:opacity-40 shrink-0">
              {archiving ? '…' : `🗄️ أرشفة (${archiveEligible.length})`}
            </button>
          )}
        </div>

        {/* Grand totals */}
        {Object.keys(grandTotals).length > 0 && (
          <div className="flex gap-3 mt-3 flex-wrap items-stretch">
            <div className="bg-teal text-white rounded-xl px-3 py-1.5 text-center">
              <p className="text-[10px] opacity-80">الإجمالي ≈ USD</p>
              <p className="text-sm font-black">${delivered.reduce((s, o) => s + toUSD(o.amount, o.currency, rates), 0).toFixed(0)}</p>
            </div>
            {Object.entries(grandTotals).map(([cur, total]) => (
              <div key={cur} className="bg-surface rounded-xl px-3 py-1.5 text-center">
                <p className="text-xs text-muted">{cur}</p>
                <p className="text-sm font-extrabold text-text">{CURRENCY_SYMBOLS[cur]}{total.toLocaleString('en-US')}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Brand filter */}
      <div className="flex gap-2">
        {[
          { key: 'all', label: '🌍 الكل' },
          { key: 'lowes', label: "🟦 LOWE'S" },
          { key: 'strong', label: '🟡 STRONG' },
        ].map(b => (
          <button key={b.key} onClick={() => setBrand(b.key)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition
              ${brand === b.key ? 'border-navy bg-navy text-white' : 'border-border text-muted hover:border-navy/40'}`}>
            {b.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {delivered.length === 0 && (
        <div className="text-center py-16 text-muted border-2 border-dashed border-border rounded-2xl">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm font-bold">لا توجد تسليمات هذا الشهر</p>
        </div>
      )}

      {/* Sold products + values (accountant) */}
      <ProductValuesSection delivered={delivered} canEdit={isManager} />

      {/* Commission settings toggle (admin only) */}
      {isManager && (
        <button onClick={() => setShowSettings(v => !v)}
          className={`w-full py-2.5 rounded-xl border text-sm font-bold transition
            ${showSettings ? 'bg-navy/10 border-navy/30 text-navy' : 'bg-surface-alt border-border text-muted hover:text-text'}`}>
          ⚙️ {showSettings ? 'إخفاء إعدادات العمولة' : 'إعدادات العمولة والتارجت'}
        </button>
      )}
      {isManager && showSettings && (
        <CommissionSettings rules={rules} syriaTargetUsd={rulesById?.syria?.monthly_target_usd}
          onSave={saveRules} saving={saving} actor={userName} />
      )}

      {/* Leaderboard */}
      {byEmployee.map((emp, i) => (
        <EmployeeCommissionCard
          key={emp.name}
          emp={emp}
          rank={i}
          rules={rules}
          rates={rates}
          targetUsd={targetUsdFor(emp.market)}
          adj={adjustments.find(a => a.employee_name === emp.name)}
          onSaveAdj={(name, val, note) => saveAdj(name, val, note, userName)}
          saving={saving}
          isManager={isManager}
          isMe={emp.name === userName}
        />
      ))}
    </div>
  );
}

// Shipping tracking pipeline (what the cargo company reports)
const TRACKING_STAGES = [
  { key: 'shipped',     label: 'استُلم',     icon: '📦' },
  { key: 'at_center',  label: 'في المركز',  icon: '🏢' },
  { key: 'on_way',     label: 'في الطريق',  icon: '🛵' },
  { key: 'delivered',  label: 'تم التسليم', icon: '✅' },
];
const TRACKING_STAGE_KEYS = TRACKING_STAGES.map(s => s.key);

// ── Tracking Tab ──────────────────────────────────────────────
function TrackingTab({ orders, onManualRefresh, refreshing }) {
  const trackable = useMemo(() =>
    orders.filter(o => o.tracking_number && o.tracking_number.trim() !== '' && o.market === 'turkey')
          .sort((a, b) => {
            // Sort by stage index ascending (earlier stages first)
            const ai = TRACKING_STAGE_KEYS.indexOf(a.status);
            const bi = TRACKING_STAGE_KEYS.indexOf(b.status);
            return (bi === -1 ? -1 : bi) - (ai === -1 ? -1 : ai);
          }),
  [orders]);

  const stageCount = useMemo(() => {
    const c = {};
    TRACKING_STAGE_KEYS.forEach(k => { c[k] = trackable.filter(o => o.status === k).length; });
    return c;
  }, [trackable]);

  if (trackable.length === 0) {
    return (
      <div className="text-center py-16 text-muted border-2 border-dashed border-border rounded-2xl">
        <p className="text-4xl mb-3">📡</p>
        <p className="text-sm font-bold">لا توجد طلبات برقم تتبع</p>
        <p className="text-xs mt-1">أضف رقم التتبع عند تحديث الطلب</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stage summary bar */}
      <div className="grid grid-cols-4 gap-2">
        {TRACKING_STAGES.map(s => (
          <div key={s.key} className={`rounded-2xl p-3 text-center ${STATUSES[s.key]?.bg || 'bg-surface-alt'}`}>
            <p className="text-lg">{s.icon}</p>
            <p className={`text-xl font-extrabold tabular-nums ${STATUSES[s.key]?.text || 'text-muted'}`}>{stageCount[s.key] || 0}</p>
            <p className="text-[10px] text-muted font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Manual refresh */}
      <button onClick={onManualRefresh} disabled={refreshing}
        className="w-full py-2.5 rounded-xl border border-border text-sm font-bold text-muted hover:text-text hover:border-teal/50 transition disabled:opacity-40 flex items-center justify-center gap-2">
        {refreshing ? <span className="animate-spin">⟳</span> : '🔄'} تحديث حالات يورتيتشي الآن
      </button>

      {/* Tracking cards */}
      <div className="space-y-3">
        {trackable.map(o => {
          const stageIdx = TRACKING_STAGE_KEYS.indexOf(o.status);
          const tUrl = trackingLink(o.shipping_company, o.tracking_number);
          const st = STATUSES[o.status];
          return (
            <div key={o.id} className="bg-surface border border-border rounded-2xl p-4 space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-text text-sm truncate">{o.customer_name || '—'}</p>
                  <p className="text-xs text-muted">{o.order_id} · {o.shipping_company || 'شركة شحن'}</p>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-xl text-xs font-bold ${st?.bg || 'bg-surface-alt'} ${st?.text || 'text-muted'}`}>
                  {st?.icon} {st?.label || o.status}
                </span>
              </div>

              {/* Progress pipeline */}
              <div className="flex items-center gap-1">
                {TRACKING_STAGES.map((s, i) => {
                  const done    = stageIdx >= i && stageIdx !== -1;
                  const current = stageIdx === i;
                  return (
                    <div key={s.key} className="flex items-center flex-1">
                      <div className={`flex flex-col items-center flex-1`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition
                          ${current ? 'bg-teal text-white shadow-lg scale-110' : done ? 'bg-teal/20 text-teal' : 'bg-surface-alt text-muted/40'}`}>
                          {s.icon}
                        </div>
                        <p className={`text-[9px] mt-0.5 font-medium ${done ? 'text-teal' : 'text-muted/40'}`}>{s.label}</p>
                      </div>
                      {i < TRACKING_STAGES.length - 1 && (
                        <div className={`h-0.5 flex-1 mx-0.5 rounded-full ${stageIdx > i && stageIdx !== -1 ? 'bg-teal' : 'bg-border'}`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Tracking number + link */}
              <div className="flex items-center justify-between gap-2 bg-surface-alt rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[10px] text-muted">رقم التتبع</p>
                  <p className="text-sm font-bold text-text font-mono">{o.tracking_number}</p>
                </div>
                {tUrl && (
                  <a href={tUrl} target="_blank" rel="noreferrer"
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-teal text-white text-xs font-bold hover:bg-teal/90 transition flex items-center gap-1">
                    🚚 تتبع
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
// Statuses that count as a return AGAINST the seller (settled is resolved → not counted).
const RETURN_STATUSES   = ['not_received', 'returning', 'returned'];
// Statuses that need the seller to chase the customer.
const FOLLOWUP_STATUSES = ['waiting', 'not_received', 'returning'];
// Returning/cancelling puts reserved stock back to the source warehouse.
const RELEASE_STATUSES  = ['returning', 'returned', 'cancelled'];

const TEAM_MARKET = {
  'تركيا': 'turkey', 'تيم تركيا': 'turkey',
  'سوريا': 'syria',  'تيم سوريا': 'syria',
};
function teamToMarket(team) {
  if (!team) return null;
  for (const [k, v] of Object.entries(TEAM_MARKET)) {
    if (team.includes(k.replace('تيم ', ''))) return v;
  }
  return null;
}

const SYRIA_COMPANIES  = ['شركة الكرم', 'سامتاك', 'ضد الدفع', 'واصل', 'أخرى'];
const TURKEY_COMPANIES = ['yurtiçi', 'Aras', 'ptt', 'توصيل الموتور', 'أخرى'];
const CURRENCIES       = ['TRY', 'SYP', 'USD'];
const PICKUP_TYPES     = ['استلام من المركز', 'عنوان المنزل', 'عنوان العمل'];

const TRACKING_URLS = {
  'Yurtiçi Kargo': (n) => `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${n}`,
  'Aras Kargo':    (n) => `https://kargotakip.aras.com.tr/?id=${n}`,
  'PTT Kargo':     (n) => `https://turkiye.ptt.gov.tr/anasayfa#`,
  'Sürat Kargo':   (n) => `https://www.suratkargo.com.tr/KargoTakip/?takipNo=${n}`,
  'MNG Kargo':     (n) => `https://www.mngkargo.com.tr/tr/musteri-hizmetleri/kargo-sorgula?trackingNumber=${n}`,
};

function waLink(phone, market) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (market === 'turkey') return `https://wa.me/90${digits.replace(/^0/, '')}`;
  return `https://wa.me/963${digits.replace(/^0/, '')}`;
}
function trackingLink(company, number) {
  if (!number) return null;
  const fn = company ? TRACKING_URLS[company] : null;
  if (fn) return fn(number);
  // Universal fallback for any company with a tracking number
  if (number) return `https://kargomnerede.com.tr/tracking?t=${encodeURIComponent(number)}`;
  return null;
}
function nextOrderId(market, orders) {
  const prefix = market === 'syria' ? 'SA-' : 'S';
  const existing = orders
    .filter(o => o.market === market && o.order_id)
    .map(o => { const m = o.order_id.match(/\d+$/); return m ? parseInt(m[0], 10) : 0; });
  const max = existing.length ? Math.max(...existing) : 0;
  const now = new Date();
  return `${now.getMonth() + 1}${prefix}${max + 1}`;
}

// Remembered Sokak (street) suggestions. There is no public street dataset for
// Turkey (the address API only covers Mahalle/neighborhoods), so we learn from
// what the team actually types and persist it locally — autocomplete that grows.
const SOKAK_KEY = 'lowes_sokak_history';
function loadSokakHistory() {
  try { return JSON.parse(localStorage.getItem(SOKAK_KEY) || '[]'); } catch { return []; }
}
function rememberSokak(v) {
  const s = String(v || '').trim();
  if (!s) return;
  try {
    const list = loadSokakHistory().filter(x => x.toLowerCase() !== s.toLowerCase());
    list.unshift(s);
    localStorage.setItem(SOKAK_KEY, JSON.stringify(list.slice(0, 300)));
  } catch { /* ignore */ }
}

const EMPTY_FORM = {
  market: 'turkey', brand: 'lowes', order_id: '', order_date: new Date().toISOString().slice(0, 16),
  handler_name: '', status: 'pending', notes: '',
  customer_name: '', phone_1: '', phone_2: '', wa_number: '',
  city: '', district: '', sy_neighborhood: '', address: '',
  mahalle: '', sokak: '', bno: '', daire: '',
  amount: '', currency: 'TRY',
  payment_method: 'دفع عند الباب 💵', payment_status: 'unpaid', paid_amount: '',
  shipping_company: 'Yurtiçi Kargo', pickup_type: 'استلام من المركز', tracking_number: '',
};

const INP = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30 placeholder:text-muted/50';
const LBL = 'text-xs font-bold text-muted block mb-1.5';

// ── Status Badge ──────────────────────────────────────────────
function StatusBadge({ status, size = 'sm' }) {
  const s = STATUSES[status] ?? STATUSES.pending;
  return (
    <span className={`inline-flex items-center gap-1 font-bold border rounded-full
      ${size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1'}
      ${s.bg} ${s.text} ${s.border}`}>
      {s.icon} {s.label}
    </span>
  );
}

// ── Progress Strip ─────────────────────────────────────────────
function ProgressStrip({ status }) {
  if (!STAGES_ORDER.includes(status)) return null;
  const current = STAGES_ORDER.indexOf(status);
  return (
    <div className="flex items-center gap-0.5">
      {STAGES_ORDER.map((_, i) => (
        <div key={i} className="flex-1 h-1.5 rounded-full transition-all"
          style={{
            background: i < current ? '#0d7377' : i === current ? '#0d7377' : 'var(--color-border, #e5e7eb)',
            opacity: i < current ? 0.4 : i === current ? 1 : 1,
          }} />
      ))}
    </div>
  );
}

// ── Payment Badge ─────────────────────────────────────────────
function PaymentBadge({ status, amount, paidAmount, currency }) {
  if (status === 'paid')
    return <span className="text-[10px] font-semibold text-green-fg">💰 مدفوع</span>;
  if (status === 'partial')
    return <span className="text-[10px] font-semibold text-amber-fg">💳 {paidAmount || 0}/{amount} {currency}</span>;
  return <span className="text-[10px] font-semibold text-red-fg">⏳ غير مدفوع</span>;
}

// ── Invoice Modal ─────────────────────────────────────────────
function InvoiceModal({ order, onClose }) {
  const ref = useRef(null);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState('');

  const paymentText =
    order.payment_status === 'paid'    ? 'مدفوع بالكامل ✓' :
    order.payment_status === 'partial' ? `مدفوع جزئياً — ${order.paid_amount} ${order.currency} · المتبقّي: ${Math.max(0, Number(order.amount) - Number(order.paid_amount || 0)).toFixed(0)} ${order.currency}` :
    'غير مدفوع — الدفع عند الاستلام';

  const capture = async () => {
    if (!ref.current) return null;
    const { toPng } = await import('html-to-image');
    return await toPng(ref.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
  };

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const dataUrl = await capture();
      const link = document.createElement('a');
      link.download = `invoice-${order.order_id}.png`;
      link.href = dataUrl;
      link.click();
      setMsg('تم تحميل الفاتورة ✓');
    } catch { setMsg('حدث خطأ أثناء التحميل'); }
    finally { setGenerating(false); }
  };

  const handleWhatsApp = async () => {
    setGenerating(true);
    setMsg('');
    try {
      const dataUrl = await capture();
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `invoice-${order.order_id}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `فاتورة ${order.order_id}` });
      } else {
        // Fallback: download
        const link = document.createElement('a');
        link.download = `invoice-${order.order_id}.png`;
        link.href = dataUrl;
        link.click();
        setMsg('تم تحميل الفاتورة (افتح واتساب وأرسلها يدوياً)');
      }
    } catch { setMsg('حدث خطأ'); }
    finally { setGenerating(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}>
      <div className="bg-surface rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden my-auto"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40" dir="rtl">
          <h3 className="font-bold text-sm text-text">🧾 فاتورة الطلب</h3>
          <button onClick={onClose} className="text-muted hover:text-text w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-alt transition text-sm">✕</button>
        </div>

        {/* Invoice (captured as image) */}
        <div ref={ref} dir="rtl" style={{
          background: '#ffffff', padding: '0',
          fontFamily: '"Tajawal", "Segoe UI", Arial, sans-serif', color: '#111827',
          minWidth: '320px',
        }}>
          {/* Brand header — navy gradient */}
          <div style={{
            background: 'linear-gradient(135deg, #0f1f3d 0%, #0d7377 100%)',
            padding: '20px 24px 18px',
            color: '#fff',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Decorative circles */}
            <div style={{ position:'absolute', top:'-20px', left:'-20px', width:'80px', height:'80px', borderRadius:'50%', background:'rgba(255,255,255,0.06)' }} />
            <div style={{ position:'absolute', bottom:'-15px', right:'-10px', width:'60px', height:'60px', borderRadius:'50%', background:'rgba(255,255,255,0.06)' }} />
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', position:'relative' }}>
              <div>
                <div style={{ fontSize:'18px', fontWeight:'900', letterSpacing:'-0.3px', lineHeight:1.1 }}>
                  Lowe&apos;s
                </div>
                <div style={{ fontSize:'11px', fontWeight:'700', opacity:0.9, letterSpacing:'1px', textTransform:'uppercase' }}>
                  Professional
                </div>
                <div style={{ fontSize:'9px', opacity:0.65, marginTop:'3px' }}>
                  منتجات عناية البشرة الاحترافية
                </div>
              </div>
              {/* Logo circle */}
              <div style={{
                width:'44px', height:'44px', borderRadius:'50%',
                background:'rgba(255,255,255,0.15)',
                border:'2px solid rgba(255,255,255,0.3)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:'20px',
              }}>🌿</div>
            </div>
            {/* Invoice title strip */}
            <div style={{
              marginTop:'12px', paddingTop:'10px', borderTop:'1px solid rgba(255,255,255,0.15)',
              display:'flex', justifyContent:'space-between', alignItems:'center',
              fontSize:'11px', opacity:0.9,
            }}>
              <span style={{ fontWeight:'800', fontSize:'13px' }}>فاتورة طلب</span>
              <span style={{ fontWeight:'700', color:'#a7f3d0' }}>{order.order_id}</span>
            </div>
          </div>
          {/* Body */}
          <div style={{ padding: '20px 24px 24px' }}>

          {/* Order meta */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '12px', color: '#6b7280' }}>
            <div>
              <div style={{ fontSize: '9px', marginBottom: '1px' }}>📅 التاريخ</div>
              <div style={{ fontWeight: '700', color: '#111827' }}>
                {order.order_date
                  ? new Date(order.order_date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })
                  : '—'}
              </div>
            </div>
            {order.market && (
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '9px', marginBottom: '1px' }}>السوق</div>
                <div style={{ fontWeight: '700', color: '#111827' }}>
                  {order.market === 'turkey' ? '🇹🇷 تركيا' : '🇸🇾 سوريا'}
                </div>
              </div>
            )}
          </div>

          {/* Customer */}
          <div style={{ background: '#f8f7f4', borderRadius: '10px', padding: '10px', marginBottom: '14px' }}>
            <div style={{ fontSize: '9px', color: '#9ca3af', fontWeight: '700', marginBottom: '5px' }}>بيانات العميل</div>
            <div style={{ fontSize: '14px', fontWeight: '800', marginBottom: '3px' }}>{order.customer_name}</div>
            {order.phone_1 && <div style={{ fontSize: '11px', color: '#374151', direction: 'ltr' }}>{order.phone_1}</div>}
            {order.city && (
              <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
                {order.city}{order.district ? ` · ${order.district}` : ''}{order.address ? ` — ${order.address}` : ''}
              </div>
            )}
          </div>

          {/* Items */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '9px', color: '#9ca3af', fontWeight: '700', marginBottom: '7px' }}>المنتجات</div>
            {(order.items ?? []).map((item, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '5px 0', borderBottom: '1px solid #f3f4f6', fontSize: '12px',
              }}>
                <span>{item.name}</span>
                <span style={{ fontWeight: '700', color: '#0d7377' }}>×{item.qty}</span>
              </div>
            ))}
          </div>

          {/* Total */}
          {order.amount > 0 && (
            <div style={{
              background: '#0f1f3d0d', borderRadius: '10px', padding: '10px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px',
            }}>
              <span style={{ fontSize: '12px', fontWeight: '700' }}>الإجمالي</span>
              <span style={{ fontSize: '18px', fontWeight: '900', color: '#0f1f3d' }}>
                {order.amount} <span style={{ fontSize: '12px' }}>{order.currency}</span>
              </span>
            </div>
          )}

          {/* Payment */}
          <div style={{
            fontSize: '10px', color: '#6b7280', marginBottom: '10px',
            padding: '7px', background: '#f9fafb', borderRadius: '8px', textAlign: 'center',
          }}>
            {paymentText}
          </div>

          {/* Shipping */}
          {order.shipping_company && (
            <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '3px' }}>
              الشحن: {order.shipping_company}
              {order.tracking_number ? ` · رقم التتبع: ${order.tracking_number}` : ''}
            </div>
          )}

          {/* Seller + brand footer */}
          <div style={{
            borderTop: '1px solid #f3f4f6', paddingTop: '10px', marginTop: '12px',
            display:'flex', justifyContent:'space-between', alignItems:'center',
            fontSize: '9px', color: '#9ca3af',
          }}>
            {order.handler_name
              ? <span>البائع: <strong style={{color:'#374151'}}>{order.handler_name}</strong></span>
              : <span />
            }
            <span style={{ color:'#0d7377', fontWeight:'700', fontSize:'8px' }}>Lowe's Professional ✦</span>
          </div>
          </div>{/* end body */}
        </div>

        {/* Message feedback */}
        {msg && (
          <p className="text-center text-xs text-teal px-4 py-1" dir="rtl">{msg}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 p-4 border-t border-border/40">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-xs text-muted hover:text-text transition">
            إغلاق
          </button>
          <button onClick={handleDownload} disabled={generating}
            className="flex-1 py-2.5 rounded-xl bg-navy/10 text-navy text-xs font-bold disabled:opacity-40 hover:bg-navy/15 transition">
            {generating ? '…' : '⬇ تحميل'}
          </button>
          <button onClick={handleWhatsApp} disabled={generating}
            className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold disabled:opacity-40 hover:opacity-90 transition"
            style={{ background: '#25D366' }}>
            {generating ? '…' : '📤 واتساب'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Order Card ─────────────────────────────────────────────────
function OrderCard({ order, onStatusChange, onEdit, onInvoice, onDelete, canDelete, canAdvance }) {
  const [changing, setChanging] = useState(false);
  const wa   = waLink(order.wa_number || order.phone_1, order.market);
  const tUrl = trackingLink(order.shipping_company, order.tracking_number);
  const itemsSummary = (order.items ?? []).slice(0, 3).map(i => `${i.name} ×${i.qty}`).join(' · ');
  const moreItems = (order.items ?? []).length - 3;

  // Reversible status: pick ANY status from a dropdown (no more one-way flip).
  const handleSetStatus = async (newStatus) => {
    if (newStatus === order.status || changing) return;
    setChanging(true);
    await onStatusChange(order.id, newStatus);
    setChanging(false);
  };
  const telHref = (order.phone_1 || order.wa_number)
    ? `tel:${String(order.phone_1 || order.wa_number).replace(/[^\d+]/g, '')}`
    : null;

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-3 active:scale-[0.99] transition-transform">
      {/* Progress strip */}
      <ProgressStrip status={order.status} />

      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-muted">{order.market === 'turkey' ? '🇹🇷' : '🇸🇾'} {order.order_id}</span>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-sm font-bold text-text mt-1 truncate">{order.customer_name}</p>
          {order.city && <p className="text-[11px] text-muted">{order.city}{order.district ? ` · ${order.district}` : ''}</p>}
        </div>
        <div className="flex gap-1 shrink-0">
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer"
              className="w-8 h-8 rounded-xl bg-green-bg flex items-center justify-center text-green-fg hover:opacity-80 transition">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.138.561 4.14 1.541 5.876L.057 23.886a.5.5 0 00.606.617l6.218-1.632A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.901 0-3.68-.498-5.22-1.371l-.374-.22-3.878 1.018 1.034-3.776-.241-.389A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
              </svg>
            </a>
          )}
          {telHref && (
            <a href={telHref}
              className="w-8 h-8 rounded-xl bg-teal/10 flex items-center justify-center text-teal hover:opacity-80 transition" title="اتصال">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
            </a>
          )}
          {order.tracking_number && (
            <a href={tUrl || `https://kargomnerede.com.tr/tracking?t=${encodeURIComponent(order.tracking_number)}`}
              target="_blank" rel="noreferrer"
              title={`تتبع الشحنة · ${order.shipping_company || ''} · ${order.tracking_number}`}
              className="h-8 px-2 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 text-[11px] hover:bg-blue-200 transition font-bold gap-1 shrink-0">
              🚚 تتبع
            </a>
          )}
          <button onClick={() => onInvoice(order)}
            className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted hover:text-text transition text-sm"
            title="فاتورة">
            🧾
          </button>
          <button onClick={() => onEdit(order)}
            className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted hover:text-text transition text-sm">
            ✏️
          </button>
          {canDelete && onDelete && (
            <button onClick={() => onDelete(order)} title="حذف الطلب"
              className="w-8 h-8 rounded-xl bg-red-bg flex items-center justify-center text-red-fg hover:opacity-80 transition text-sm">
              🗑
            </button>
          )}
        </div>
      </div>

      {/* Items summary */}
      <p className="text-[11px] text-muted leading-relaxed">
        📦 {itemsSummary || 'لا توجد منتجات'}
        {moreItems > 0 && <span className="text-teal font-semibold"> +{moreItems} أخرى</span>}
      </p>

      {/* Bottom row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {order.amount > 0 && (
            <span className="text-xs font-bold text-text">{order.amount} {order.currency}</span>
          )}
          <PaymentBadge
            status={order.payment_status}
            amount={order.amount}
            paidAmount={order.paid_amount}
            currency={order.currency}
          />
        </div>
        {canAdvance && (
          <select value={order.status} onChange={e => handleSetStatus(e.target.value)} disabled={changing}
            title="غيّر حالة الطلب (قابل للتراجع)"
            className="text-xs font-bold rounded-xl bg-teal/10 text-teal px-2 py-1.5 border border-teal/20 hover:bg-teal/20 transition disabled:opacity-40 cursor-pointer focus:outline-none">
            {Object.entries(STATUSES).map(([k, v]) => (
              <option key={k} value={k}>{v.icon} {v.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Handler + date */}
      <div className="flex items-center justify-between pt-1 border-t border-border/40">
        <span className="text-[10px] text-muted">{order.handler_name || '—'}</span>
        <span className="text-[10px] text-muted">
          {order.order_date ? new Date(order.order_date).toLocaleDateString('ar', { day: 'numeric', month: 'short' }) : '—'}
        </span>
      </div>

      {/* Audit: created / last edited */}
      {(order.created_at || order.updated_by) && (
        <div className="flex items-center justify-between text-[9px] text-muted/70">
          <span>🆕 {order.created_at ? new Date(order.created_at).toLocaleString('ar', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '—'}{order.created_by ? ` · ${order.created_by}` : ''}</span>
          {order.updated_by && (
            <span>✏️ {order.updated_at ? new Date(order.updated_at).toLocaleString('ar', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : ''} · {order.updated_by}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Item Row in form ──────────────────────────────────────────
function ItemRow({ item, index, onChange, onRemove, products = [] }) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = (item.name || '').trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter(p => p.name?.toLowerCase().includes(q)).slice(0, 30);
  }, [item.name, products]);
  const pick = (p) => { onChange(index, 'name', p.name); setOpen(false); };

  return (
    <div className="flex gap-2 items-start">
      <div className="flex-1 relative">
        <input value={item.name}
          onChange={e => { onChange(index, 'name', e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="اسم المنتج (اكتب أو اختر من القائمة)"
          className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30"
        />
        {open && matches.length > 0 && (
          <div className="absolute z-20 top-full mt-1 inset-x-0 bg-surface border border-border rounded-xl shadow-xl max-h-52 overflow-y-auto">
            {matches.map(p => (
              <button key={p.id} type="button" onMouseDown={() => pick(p)}
                className="w-full text-right px-3 py-2 text-sm text-text hover:bg-teal/10 transition flex items-center justify-between gap-2 border-b border-border/40 last:border-0">
                <span className="truncate">{p.name}</span>
                {p.category && <span className="text-[10px] text-muted shrink-0">{p.category}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center border border-border rounded-xl overflow-hidden shrink-0 mt-0.5">
        <button type="button" onClick={() => onChange(index, 'qty', Math.max(1, item.qty - 1))}
          className="px-2 py-2 text-muted hover:text-text hover:bg-surface-alt transition text-sm font-bold">−</button>
        <span className="px-2 text-sm font-bold text-text tabular-nums min-w-[1.5rem] text-center">{item.qty}</span>
        <button type="button" onClick={() => onChange(index, 'qty', item.qty + 1)}
          className="px-2 py-2 text-muted hover:text-text hover:bg-surface-alt transition text-sm font-bold">+</button>
      </div>
      <button type="button" onClick={() => onRemove(index)}
        className="w-8 h-8 mt-0.5 rounded-xl bg-red-bg text-red-fg flex items-center justify-center text-xs hover:opacity-80 transition shrink-0">
        🗑
      </button>
    </div>
  );
}

// ── Order Form Modal ──────────────────────────────────────────
function OrderFormModal({ order, onClose, onSave, allOrders }) {
  const { name: userName, team, order_market } = useAuth();
  // Default a brand-new order to the seller's own market so it doesn't land in
  // a market they can't see. Falls back to Turkey when unknown.
  const myMarket = order_market ?? teamToMarket(team) ?? 'turkey';
  const isEdit = !!order?.id;
  const prefill = order?.__prefill || null; // reorder from a customer

  const [form, setForm] = useState(isEdit ? {
    market:           order.market,
    brand:            order.brand            ?? 'lowes',
    order_id:         order.order_id         ?? '',
    order_date:       order.order_date ? new Date(order.order_date).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
    handler_name:     order.handler_name     ?? userName ?? '',
    status:           order.status           ?? 'pending',
    notes:            order.notes            ?? '',
    customer_name:    order.customer_name    ?? '',
    phone_1:          order.phone_1          ?? '',
    phone_2:          order.phone_2          ?? '',
    wa_number:        order.wa_number        ?? '',
    city:             order.city             ?? '',
    district:         order.district         ?? '',
    address:          order.address          ?? '',
    amount:           order.amount           ?? '',
    currency:         order.currency         ?? 'TRY',
    payment_method:   order.payment_method   ?? 'دفع عند الباب 💵',
    payment_status:   order.payment_status   ?? 'unpaid',
    paid_amount:      order.paid_amount      ?? '',
    shipping_company: order.shipping_company ?? 'Yurtiçi Kargo',
    pickup_type:      order.pickup_type      ?? 'استلام من المركز',
    tracking_number:  order.tracking_number  ?? '',
    mahalle: '', sokak: '', bno: '', daire: '',
  } : prefill ? {
    ...EMPTY_FORM,
    handler_name: userName ?? '',
    market:        prefill.market || 'turkey',
    brand:         prefill.brand || 'lowes',
    currency:      prefill.market === 'syria' ? 'SYP' : 'TRY',
    customer_name: prefill.customer_name || '',
    phone_1:       prefill.phone_1 || '',
    wa_number:     prefill.wa_number || '',
    city:          prefill.city || '',
    address:       prefill.address || '',
    shipping_company: prefill.market === 'syria' ? 'شركة الكرم' : 'yurtiçi',
    payment_method:   prefill.market === 'syria' ? 'دفع عند الاستلام' : 'دفع عند الباب',
  } : {
    ...EMPTY_FORM,
    handler_name: userName ?? '',
    market:   myMarket,
    currency: myMarket === 'syria' ? 'SYP' : 'TRY',
    shipping_company: myMarket === 'syria' ? 'شركة الكرم' : 'Yurtiçi Kargo',
    payment_method:   myMarket === 'syria' ? 'دفع عند الاستلام' : 'دفع عند الباب 💵',
  });

  const [items,    setItems]    = useState(
    isEdit ? (order.items ?? [])
    : (prefill?.items?.length ? prefill.items.map(it => ({ name: it.name || '', qty: it.qty || 1 })) : [{ name: '', qty: 1 }]),
  );
  const [saving,   setSaving]   = useState(false);
  const [products, setProducts] = useState([]);
  const [cust,     setCust]     = useState(null);   // matched customer (repeat detection)
  const [mahalleOpts, setMahalleOpts] = useState([]); // live Mahalle suggestions
  const [sokakOpts]   = useState(loadSokakHistory());  // remembered Sokak suggestions
  const [streetOpts,  setStreetOpts]  = useState([]);  // official UAVT streets for the chosen mahalle

  // Reload products whenever brand changes.
  // Strong brand: shows ALL products (Strong + Lowe's) — sellers handle both.
  // Lowe's brand: hides Strong (adult/pharma) products.
  useEffect(() => {
    let q = supabase.from('products').select('id, name, category').eq('is_active', true).order('name');
    if (form.brand !== 'strong') q = q.neq('category', 'Strong');
    q.then(({ data }) => setProducts(data ?? [])).catch(() => {});
  }, [form.brand]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Repeat-customer lookup: when phone settles, check if we know this customer.
  useEffect(() => {
    const phone = form.phone_1;
    const t = setTimeout(async () => {
      const c = await lookupCustomer(phone);
      // Only surface as "repeat" if they have prior orders
      setCust(c && c.orders_count > 0 ? c : null);
    }, 500);
    return () => clearTimeout(t);
  }, [form.phone_1]);

  const handleMarketChange = (market) => {
    set('market', market);
    set('currency', market === 'turkey' ? 'TRY' : 'SYP');
    set('shipping_company', market === 'turkey' ? 'Yurtiçi Kargo' : 'شركة الكرم');
    set('payment_method', market === 'turkey' ? 'دفع عند الباب 💵' : 'دفع عند الاستلام');
    if (!isEdit) set('order_id', nextOrderId(market, allOrders));
  };

  useEffect(() => {
    if (!isEdit && !form.order_id) set('order_id', nextOrderId(form.market, allOrders));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live Mahalle suggestions once a Turkish province + district are chosen.
  useEffect(() => {
    if (form.market !== 'turkey' || !form.city || !form.district) { setMahalleOpts([]); return; }
    let alive = true;
    fetchNeighborhoods(form.city, form.district).then(n => { if (alive) setMahalleOpts(n); });
    return () => { alive = false; };
  }, [form.market, form.city, form.district]);

  // Official Sokak (street) suggestions for the chosen district + mahalle (UAVT).
  useEffect(() => {
    if (form.market !== 'turkey' || !form.city || !form.district) { setStreetOpts([]); return; }
    let alive = true;
    fetchStreets(form.city, form.district, form.mahalle).then(s => { if (alive) setStreetOpts(s); });
    return () => { alive = false; };
  }, [form.market, form.city, form.district, form.mahalle]);

  // Build the detailed Turkish address from its parts (only when a part is set,
  // so a pasted invoice address isn't wiped).
  useEffect(() => {
    const built = buildTurkishAddress({ mahalle: form.mahalle, sokak: form.sokak, bno: form.bno, daire: form.daire });
    if (built) set('address', built);
  }, [form.mahalle, form.sokak, form.bno, form.daire]); // eslint-disable-line react-hooks/exhaustive-deps

  const addItem    = () => setItems(p => [...p, { name: '', qty: 1 }]);
  const removeItem = (i) => setItems(p => p.filter((_, idx) => idx !== i));
  const changeItem = (i, k, v) => setItems(p => p.map((item, idx) => idx === i ? { ...item, [k]: v } : item));

  // Auto-computed remaining for partial payment
  const remaining = form.payment_status === 'partial' && form.amount && form.paid_amount
    ? Math.max(0, Number(form.amount) - Number(form.paid_amount)).toFixed(0)
    : null;

  const handleSave = async () => {
    if (!form.customer_name.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      amount:      form.amount      ? Number(form.amount)      : null,
      paid_amount: form.paid_amount ? Number(form.paid_amount) : null,
      order_date:  new Date(form.order_date).toISOString(),
      items:       items.filter(i => i.name.trim()),
    };
    // Remember the typed street so it autocompletes next time (no public dataset).
    rememberSokak(form.sokak);
    // Address parts are UI-only helpers (not DB columns) — strip before save.
    delete payload.mahalle; delete payload.sokak; delete payload.bno; delete payload.daire;
    delete payload.sy_neighborhood; // UI-only for Syria address
    try {
      await onSave(payload, order?.id);
    } catch (err) {
      window.alert('❌ خطأ في الحفظ:\n' + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  const companies = shippingForMarket(form.market);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {/* No close-on-backdrop — prevents losing entered data by accident */}
      <div className="bg-surface rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto"
        dir="rtl" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between shrink-0 bg-gradient-to-r from-navy/5 to-transparent">
          <div>
            <h3 className="font-bold text-base text-text">{isEdit ? '✏️ تعديل طلب' : '+ طلب جديد'}</h3>
            {isEdit && <p className="text-xs text-muted mt-0.5">{order.order_id}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted">✕</button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">

          {/* Market */}
          <div className="flex gap-2">
            {[{ key: 'turkey', label: 'تركيا', flag: '🇹🇷' }, { key: 'syria', label: 'سوريا', flag: '🇸🇾' }].map(m => (
              <button key={m.key} onClick={() => handleMarketChange(m.key)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition
                  ${form.market === m.key ? 'border-teal bg-teal/10 text-teal' : 'border-border text-muted hover:border-teal/40'}`}>
                {m.flag} {m.label}
              </button>
            ))}
          </div>

          {/* Brand — la ronven glow orders are isolated from Lowe's stock */}
          <div className="flex gap-2">
            {[
              { key: 'lowes', label: "Lowe's", emoji: '🌿' },
              { key: 'strong', label: 'Strong', emoji: '💪' },
            ].map(b => (
              <button key={b.key} onClick={() => set('brand', b.key)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition
                  ${form.brand === b.key ? 'border-navy bg-navy/10 text-navy' : 'border-border text-muted hover:border-navy/40'}`}>
                {b.emoji} {b.label}
              </button>
            ))}
          </div>

          {/* Order Info */}
          <div className="space-y-3">
            <p className="text-xs font-extrabold text-muted uppercase tracking-wider">📋 معلومات الطلب</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>رقم الطلب</label>
                <input value={form.order_id} onChange={e => set('order_id', e.target.value)} className={INP} placeholder="5S100" />
              </div>
              <div>
                <label className={LBL}>البائع</label>
                <input value={form.handler_name} onChange={e => set('handler_name', e.target.value)} className={INP} placeholder="الاسم" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>التاريخ</label>
                <input type="datetime-local" value={form.order_date} onChange={e => set('order_date', e.target.value)} className={INP} />
              </div>
              <div>
                <label className={LBL}>الحالة</label>
                <select value={form.status} onChange={e => set('status', e.target.value)} className={INP}>
                  {Object.entries(STATUSES).map(([k, v]) => (
                    <option key={k} value={k}>{v.icon} {v.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Customer */}
          <div className="space-y-3">
            <p className="text-xs font-extrabold text-muted uppercase tracking-wider">👤 العميل</p>
            <input value={form.customer_name} onChange={e => set('customer_name', e.target.value)} className={INP} placeholder="اسم العميل *" />
            <div className="grid grid-cols-2 gap-3">
              <input value={form.phone_1} onChange={e => set('phone_1', e.target.value)} className={INP} placeholder="الهاتف 1" />
              <input value={form.phone_2} onChange={e => set('phone_2', e.target.value)} className={INP} placeholder="الهاتف 2" />
            </div>

            {/* Repeat-customer banner */}
            {cust && (
              <div className="bg-teal/10 border border-teal/30 rounded-xl px-3 py-2.5 text-xs space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-teal">{starLabel(cust.stars) || '🔁'} عميل لنا</span>
                  <span className="text-text font-semibold">{cust.name}</span>
                  <span className="text-muted">· {cust.orders_count} طلب سابق</span>
                </div>
                {cust.sellers?.length > 0 && (
                  <p className="text-muted">
                    {cust.sellers.length > 1 ? 'باعه قبلك: ' : 'آخر بائع: '}
                    <span className="font-semibold text-text">{(cust.sellers || []).join('، ')}</span>
                  </p>
                )}
              </div>
            )}
            <input value={form.wa_number} onChange={e => set('wa_number', e.target.value)} className={INP}
              placeholder={`واتساب ${form.market === 'turkey' ? '(بدون +90)' : '(بدون +963)'}`} />
            {form.market === 'turkey' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <ComboBox value={form.city} onChange={v => { set('city', v); set('district', ''); }}
                    options={citiesForMarket('turkey')} className={INP} placeholder="المحافظة (اختر أو اكتب)" />
                  <ComboBox value={form.district} onChange={v => set('district', v)}
                    options={districtsForCity('turkey', form.city)} className={INP} placeholder="البلدية (اختر أو اكتب)" />
                </div>
                {/* Structured Turkish address — builds the detailed address line */}
                <div className="grid grid-cols-2 gap-3">
                  <ComboBox value={form.mahalle} onChange={v => set('mahalle', v)} options={mahalleOpts}
                    className={INP} placeholder={mahalleOpts.length ? 'Mahalle (المحلة)' : 'Mahalle (اكتب)'} />
                  <ComboBox value={form.sokak} onChange={v => set('sokak', v)}
                    options={streetOpts.length ? streetOpts : sokakOpts}
                    className={INP} placeholder={streetOpts.length ? 'Sokak (اختر الشارع)' : 'Sokak (الشارع)'} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input value={form.bno} onChange={e => set('bno', e.target.value)} className={INP} placeholder="No (رقم المبنى)" />
                  <input value={form.daire} onChange={e => set('daire', e.target.value)} className={INP} placeholder="Daire (الشقة)" />
                </div>
                <input value={form.address} onChange={e => set('address', e.target.value)} className={INP}
                  placeholder="العنوان كامل (يُبنى تلقائياً — أو الصق من فاتورة العميل)" />
                {isMotorZone(form.city, form.district) && (
                  <div className="bg-amber-bg border border-amber/30 rounded-xl px-3 py-2 text-xs text-amber-fg flex items-center justify-between gap-2">
                    <span>🏍️ منطقة توصيل موتور (إسطنبول الأوروبية)</span>
                    <button type="button" onClick={() => set('shipping_company', 'توصيل الموتور')}
                      className="font-bold underline shrink-0">اعتمد موتور</button>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Syria: محافظة → منطقة/مدينة → حي/قرية (all alphabetical) */}
                <div className="grid grid-cols-2 gap-3">
                  <ComboBox value={form.city} onChange={v => { set('city', v); set('district', ''); set('sy_neighborhood', ''); }}
                    options={SYRIA_PROVINCES.map(p => p.value)} className={INP} placeholder="المحافظة (اختر أو اكتب)" />
                  <ComboBox value={form.district} onChange={v => { set('district', v); set('sy_neighborhood', ''); }}
                    options={getSyriaDistricts(form.city)} className={INP} placeholder="المنطقة / المدينة" />
                </div>
                <ComboBox value={form.sy_neighborhood}
                  onChange={v => {
                    set('sy_neighborhood', v);
                    // بنِ العنوان التفصيلي تلقائياً من المحافظة+المنطقة+الحي
                    const parts = [form.city, form.district, v].filter(Boolean);
                    if (parts.length > 0) set('address', parts.join(' - '));
                  }}
                  options={getSyriaNeighborhoods(form.district)} className={INP} placeholder="الحي / القرية (اختر أو اكتب)" />
                <input value={form.address} onChange={e => set('address', e.target.value)} className={INP}
                  placeholder="العنوان التفصيلي (شارع، رقم، ملاحظة) — يُبنى تلقائياً" />
              </>
            )}
          </div>

          {/* Products */}
          <div className="space-y-3">
            <p className="text-xs font-extrabold text-muted uppercase tracking-wider">📦 المنتجات</p>
            {items.map((item, i) => (
              <ItemRow key={i} item={item} index={i} onChange={changeItem} onRemove={removeItem} products={products} />
            ))}
            <button onClick={addItem}
              className="w-full py-2 rounded-xl border-2 border-dashed border-teal/30 text-teal text-sm font-semibold hover:border-teal/60 hover:bg-teal/5 transition">
              + أضف منتج
            </button>
          </div>

          {/* Financial */}
          <div className="space-y-3">
            <p className="text-xs font-extrabold text-muted uppercase tracking-wider">💰 المالية</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={LBL}>المبلغ الإجمالي</label>
                <input type="number" inputMode="decimal" value={form.amount}
                  onChange={e => set('amount', e.target.value)}
                  className={INP} placeholder="0" style={{ direction: 'ltr', textAlign: 'right' }} />
              </div>
              <div>
                <label className={LBL}>العملة</label>
                {form.market === 'turkey' ? (
                  <div className="border border-border rounded-xl px-3 py-2.5 text-sm bg-surface-alt text-muted">TRY</div>
                ) : (
                  <select value={form.currency} onChange={e => set('currency', e.target.value)} className={INP}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>طريقة الدفع</label>
                <ComboBox value={form.payment_method} onChange={v => set('payment_method', v)}
                  options={paymentForMarket(form.market)} className={INP} placeholder="اختر أو اكتب" />
              </div>
              <div>
                <label className={LBL}>حالة الدفع</label>
                <select value={form.payment_status} onChange={e => set('payment_status', e.target.value)} className={INP}>
                  <option value="unpaid">⏳ غير مدفوع</option>
                  <option value="partial">💳 مدفوع جزئياً</option>
                  <option value="paid">💰 مدفوع كامل</option>
                </select>
              </div>
            </div>
            {/* Partial payment detail */}
            {form.payment_status === 'partial' && (
              <div className="bg-amber-bg border border-amber/30 rounded-xl p-3 space-y-2">
                <div>
                  <label className={LBL}>المبلغ المدفوع الآن</label>
                  <input type="number" inputMode="decimal" value={form.paid_amount}
                    onChange={e => set('paid_amount', e.target.value)}
                    className={INP} placeholder="0" style={{ direction: 'ltr', textAlign: 'right' }} />
                </div>
                {remaining !== null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">المتبقّي للتحصيل:</span>
                    <span className="font-bold text-amber-fg">{remaining} {form.currency}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Shipping */}
          <div className="space-y-3">
            <p className="text-xs font-extrabold text-muted uppercase tracking-wider">🚚 الشحن</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>شركة الشحن</label>
                <ComboBox value={form.shipping_company} onChange={v => set('shipping_company', v)}
                  options={companies} className={INP} placeholder="اختر أو اكتب" />
              </div>
              <div>
                <label className={LBL}>نوع الاستلام</label>
                <select value={form.pickup_type} onChange={e => set('pickup_type', e.target.value)} className={INP}>
                  {PICKUP_TYPES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            {form.market === 'turkey' && (
              <div>
                <label className={LBL}>رقم التتبع</label>
                <div className="flex gap-2">
                  <input value={form.tracking_number} onChange={e => set('tracking_number', e.target.value)}
                    className={`${INP} flex-1`} placeholder="مثال: 6422898622431" />
                  {form.tracking_number && trackingLink(form.shipping_company, form.tracking_number) && (
                    <a href={trackingLink(form.shipping_company, form.tracking_number)} target="_blank" rel="noreferrer"
                      className="px-3 py-2 rounded-xl bg-blue-100 text-blue-700 text-xs font-bold hover:opacity-80 transition shrink-0">
                      🔍 تتبع
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className={LBL}>ملاحظات</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} className={`${INP} resize-none`} placeholder="أي ملاحظة على الطلب..." />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-border/40 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted hover:text-text transition">إلغاء</button>
          <button onClick={handleSave} disabled={!form.customer_name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-teal text-white text-sm font-bold disabled:opacity-40 hover:bg-teal/90 transition">
            {saving ? '…جاري الحفظ' : isEdit ? '✓ حفظ التعديلات' : '✓ إنشاء الطلب'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Seller Stats Card ─────────────────────────────────────────
function SellerStatsCard({ orders, userName, commissionPct, myNames }) {
  const nameSet = useMemo(() => myNames || new Set([userName]), [myNames, userName]);
  const delivered = useMemo(() =>
    orders.filter(o => o.status === 'delivered' && nameSet.has(o.handler_name)),
  [orders, nameSet]);

  const totals = useMemo(() => delivered.reduce((acc, o) => {
    if (!o.amount) return acc;
    const c = o.currency || 'USD';
    acc[c] = (acc[c] || 0) + Number(o.amount);
    return acc;
  }, {}), [delivered]);

  const hasData = Object.keys(totals).length > 0;

  return (
    <div className="bg-gradient-to-br from-teal/10 to-navy/5 border border-teal/20 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-text">📊 مبيعاتي المسلّمة</h3>
        {commissionPct > 0 && (
          <span className="text-[10px] font-bold text-teal bg-teal/10 px-2 py-0.5 rounded-full">
            عمولة {commissionPct}%
          </span>
        )}
      </div>

      {!hasData ? (
        <p className="text-xs text-muted text-center py-2">لا توجد طلبات مسلّمة بعد</p>
      ) : (
        <div className="space-y-2">
          {Object.entries(totals).map(([currency, total]) => {
            const commission = commissionPct > 0 ? (total * commissionPct / 100).toFixed(0) : null;
            const target = targetForCurrency(currency);
            const pct = target ? Math.min(100, Math.round((total / target) * 100)) : null;
            return (
              <div key={currency} className="bg-surface rounded-xl px-3 py-2 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-muted">{currency}</span>
                  <div className="text-right">
                    <div className="text-sm font-black text-text">{total.toFixed(0)} {currency}</div>
                    {commission && (
                      <div className="text-[10px] text-teal font-semibold">عمولتي: {commission} {currency}</div>
                    )}
                  </div>
                </div>
                {pct !== null && (
                  <div>
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-muted">الهدف {target} {currency}</span>
                      <span className={`font-bold ${pct >= 100 ? 'text-green-fg' : 'text-muted'}`}>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-fg' : pct >= 60 ? 'bg-teal' : 'bg-amber-fg'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[10px] text-muted text-center">{delivered.length} طلب مسلّم</p>
        </div>
      )}
    </div>
  );
}

// ── Seller Wallet — محفظة المبيعات ─────────────────────────────
function SellerWallet({ orders, userName, myNames, commissionPct }) {
  const nameSet = useMemo(() => myNames || new Set([userName]), [myNames, userName]);

  const myOrders = useMemo(() =>
    orders.filter(o => nameSet.has(o.handler_name) && !o.archived),
  [orders, nameSet]);

  const delivered = myOrders.filter(o => o.status === 'delivered');
  const pending   = myOrders.filter(o => ['pending','preparing','ready'].includes(o.status));
  const returned  = myOrders.filter(o => RETURN_STATUSES.includes(o.status));

  // مجاميع حسب العملة
  const deliveredTotals = useMemo(() => delivered.reduce((acc, o) => {
    if (!o.amount) return acc;
    const c = o.currency || 'SYP';
    acc[c] = (acc[c] || 0) + Number(o.amount);
    return acc;
  }, {}), [delivered]);

  const pendingTotals = useMemo(() => pending.reduce((acc, o) => {
    if (!o.amount) return acc;
    const c = o.currency || 'SYP';
    acc[c] = (acc[c] || 0) + Number(o.amount);
    return acc;
  }, {}), [pending]);

  const months = useMemo(() => {
    const map = {};
    delivered.forEach(o => {
      const m = (o.order_date || o.created_at || '').slice(0, 7);
      if (!m) return;
      if (!map[m]) map[m] = { count: 0, totals: {} };
      map[m].count++;
      const c = o.currency || 'SYP';
      map[m].totals[c] = (map[m].totals[c] || 0) + Number(o.amount || 0);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  }, [delivered]);

  return (
    <div className="space-y-4">
      {/* بطاقة الملخص */}
      <div className="bg-gradient-to-br from-navy to-teal rounded-2xl p-5 text-white space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs opacity-80">محفظة مبيعاتي</p>
            <p className="text-lg font-extrabold">{userName}</p>
          </div>
          <span className="text-4xl">💼</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-xl font-black">{delivered.length}</p>
            <p className="text-[10px] opacity-80 mt-0.5">✅ مسلّم</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-xl font-black">{pending.length}</p>
            <p className="text-[10px] opacity-80 mt-0.5">⏳ قيد التنفيذ</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-xl font-black">{returned.length}</p>
            <p className="text-[10px] opacity-80 mt-0.5">🔁 راجع</p>
          </div>
        </div>
        {commissionPct > 0 && (
          <p className="text-[11px] opacity-70 text-center">نسبة عمولتي: {commissionPct}%</p>
        )}
      </div>

      {/* المبالغ المسلّمة */}
      <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-text">💰 إجمالي المبيعات المسلّمة</h3>
        {Object.keys(deliveredTotals).length === 0
          ? <p className="text-xs text-muted text-center py-2">لا توجد مبيعات مسلّمة بعد</p>
          : Object.entries(deliveredTotals).map(([c, total]) => {
            const commission = commissionPct > 0 ? (total * commissionPct / 100) : null;
            const target = targetForCurrency(c);
            const pct = target ? Math.min(100, Math.round((total / target) * 100)) : null;
            return (
              <div key={c} className="space-y-1.5">
                <div className="flex justify-between items-end">
                  <span className="text-xs text-muted">{c}</span>
                  <div className="text-right">
                    <span className="text-base font-black text-text">{total.toLocaleString()} {c}</span>
                    {commission && <p className="text-[10px] text-teal font-semibold">عمولة: {commission.toFixed(0)} {c}</p>}
                  </div>
                </div>
                {pct !== null && (
                  <>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-muted">الهدف: {target?.toLocaleString()} {c}</span>
                      <span className={`font-bold ${pct >= 100 ? 'text-green-fg' : 'text-muted'}`}>{pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-alt overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-fg' : pct >= 60 ? 'bg-teal' : 'bg-amber-fg'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </>
                )}
              </div>
            );
          })
        }
      </div>

      {/* المبالغ المعلّقة (قيد التنفيذ) */}
      {Object.keys(pendingTotals).length > 0 && (
        <div className="bg-amber-bg border border-amber/20 rounded-2xl p-4 space-y-2">
          <h3 className="text-sm font-bold text-amber-fg">⏳ طلبات قيد التنفيذ</h3>
          {Object.entries(pendingTotals).map(([c, total]) => (
            <div key={c} className="flex justify-between">
              <span className="text-xs text-muted">{c}</span>
              <span className="text-sm font-bold text-text">{total.toLocaleString()} {c}</span>
            </div>
          ))}
        </div>
      )}

      {/* مبيعات الأشهر السابقة */}
      {months.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-text">📅 مبيعات شهرية</h3>
          {months.map(([month, data]) => (
            <div key={month} className="flex justify-between items-center py-1.5 border-b border-border/40 last:border-0">
              <div>
                <p className="text-xs font-semibold text-text">{month}</p>
                <p className="text-[10px] text-muted">{data.count} طلب</p>
              </div>
              <div className="text-right">
                {Object.entries(data.totals).map(([c, t]) => (
                  <p key={c} className="text-xs font-bold text-text">{t.toLocaleString()} {c}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main Screen
// ══════════════════════════════════════════════════════════════
export default function OrdersScreen() {
  const { role, team, name: userName, id: userId, order_role, order_market } = useAuth();

  const isManager        = [ROLES.MANAGER, ROLES.ADMIN, ROLES.SALES_MANAGER].includes(role);
  const isFulfillment    = order_role === 'fulfillment';
  const isStorage        = order_role === 'storage';   // تخزين/تغليف — يشوف الكل، لا يعدّل
  const userMarket       = order_market ?? teamToMarket(team) ?? null;
  const canAdvanceOrders = isFulfillment || isManager;
  // البائع يقدر يغيّر حالة طلبه هو فقط
  const canAdvanceOrder  = (o) => canAdvanceOrders || o.handler_name === userName;

  const [orders,        setOrders]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [market,        setMarket]        = useState(userMarket ?? 'all');
  const [status,        setStatus]        = useState(isFulfillment ? 'pending' : 'all');
  const [search,        setSearch]        = useState('');
  const [modal,         setModal]         = useState(null);    // null | 'new' | order
  const [invoice,       setInvoice]       = useState(null);    // order | null
  const [myOrders,      setMyOrders]      = useState(false);   // «طلباتي» toggle
  const [viewArchive,   setViewArchive]   = useState(false);   // «الأرشيف» toggle (managers)
  const [viewTracking,   setViewTracking]  = useState(false);   // «تتبع الشحنات» toggle
  const [viewMonthly,    setViewMonthly]   = useState(false);   // «تسليمات الشهر» toggle
  const [viewWallet,     setViewWallet]    = useState(false);   // «محفظتي» toggle
  const [refreshing,     setRefreshing]    = useState(false);   // manual tracking refresh
  const [commissionPct, setCommissionPct] = useState(0);
  const [partnerNames,  setPartnerNames]  = useState([]);      // accepted shift-partner names
  const [sellerFilter,  setSellerFilter]  = useState('');      // فلتر اسم البائع
  const [dateFrom,      setDateFrom]      = useState('');      // فلتر من تاريخ
  const [dateTo,        setDateTo]        = useState('');      // فلتر إلى تاريخ

  // Reorder: open a prefilled new-order form when arriving from «إعادة الطلب».
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (location.state?.reorder) {
      setModal({ __prefill: location.state.reorder });
      navigate('.', { replace: true, state: null }); // clear so refresh doesn't re-open
    }
  }, [location.state, navigate]);

  // Load commission_pct for current seller
  useEffect(() => {
    if (!userName) return;
    supabase.from('profiles')
      .select('commission_pct')
      .eq('employee_name', userName)
      .maybeSingle()
      .then(({ data }) => { if (data?.commission_pct != null) setCommissionPct(Number(data.commission_pct)); })
      .catch(() => {});
  }, [userName]);

  // Load accepted shift partners so their orders appear in «طلباتي»
  useEffect(() => {
    if (!userName) return;
    supabase.from('shift_partners')
      .select('requester, partner')
      .eq('status', 'accepted')
      .or(`requester.eq.${userName},partner.eq.${userName}`)
      .then(({ data }) => {
        const names = (data ?? []).map(r => r.requester === userName ? r.partner : r.requester);
        setPartnerNames(names);
      })
      .catch(() => {});
  }, [userName]);

  // Realtime: auto-update order status when cron/function changes it in DB
  useEffect(() => {
    const channel = supabase
      .channel('orders-status-changes')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          setOrders(prev => prev.map(o =>
            o.id === payload.new.id ? { ...o, ...payload.new } : o
          ));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Manual trigger: call track-yurtici function immediately
  const handleManualTrackingRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/track-yurtici`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      });
      await load();
    } catch { /* best-effort */ }
    finally { setRefreshing(false); }
  };

  // Archive a batch of order IDs (month-end)
  const handleMonthArchive = async (ids) => {
    if (!ids.length) return;
    if (!window.confirm(`أرشفة ${ids.length} طلب مسلّم لهذا الشهر؟ ستختفي من القائمة وتبقى في الأرشيف.`)) return;
    setArchiving(true);
    try {
      await supabase.from('orders').update({ archived: true }).in('id', ids);
      await load();
      setViewMonthly(false);
    } catch (e) { window.alert('تعذّر: ' + e.message); }
    finally { setArchiving(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('orders').select('*').order('order_date', { ascending: false });
      if (viewArchive) {
        // Archive view: search the whole archive server-side (not just a page).
        q = q.eq('archived', true);
        const s = search.trim();
        if (s) q = q.or(`customer_name.ilike.%${s}%,phone_1.ilike.%${s}%,order_id.ilike.%${s}%`);
        q = q.limit(500);
      } else {
        q = q.or('archived.is.null,archived.eq.false');
      }
      // Everyone (employees included) sees BOTH teams' orders so cross-team
      // selling works; the market tabs below let them narrow to تركيا/سوريا.
      // Edits/permissions are handled per-card, not by hiding rows here.
      const { data } = await q;
      setOrders(data ?? []);
    } catch {}
    finally { setLoading(false); }
  }, [viewArchive, search]);

  // Debounced so archive search hits the server without a request per keystroke.
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  // Auto-retry: re-sync Syria/Turkey orders that never reached the sheet
  useEffect(() => {
    const pending = orders.filter(o => (o.market === 'syria' || o.market === 'turkey') && o.archived !== true && o.sheet_synced !== true);
    if (pending.length === 0) return;
    pending.slice(0, 20).forEach(o => syncOrderToSheet(o.id));
  }, [orders]);

  const handleStatusChange = async (id, newStatus) => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', id);
    const order = orders.find(o => o.id === id);
    setOrders(p => p.map(o => o.id === id ? { ...o, status: newStatus } : o));
    // Re-sync to the sheet so status/tracking changes update the existing row
    if (order && (order.market === 'syria' || order.market === 'turkey') && order.archived !== true) syncOrderToSheet(id);
    // Notify the seller their order advanced (best-effort, fire-and-forget)
    if (order) notifySellerStatusChange(order, newStatus, userName);
    // Cancelling / returning releases reserved stock back to the source warehouse
    if (order && RELEASE_STATUSES.includes(newStatus)) releaseForOrder({ ...order, status: newStatus }, userName);

    // ── Auto accounting entry when delivered ──────────────────────
    if (newStatus === 'delivered' && order && Number(order.amount) > 0) {
      try {
        const cur  = (order.currency || 'SYP').toUpperCase();
        const amt  = Number(order.amount);
        const orderNum = order.order_number || order.id?.slice(0, 8) || '—';
        await supabase.from('accounting_entries').insert({
          entry_type:     'income',
          category:       'مبيعات أونلاين',
          description:    `مبيعات — طلب #${orderNum} (${order.customer_name || order.client_name || '—'})`,
          amount_usd:     cur === 'USD' ? amt : 0,
          amount_try:     cur === 'TRY' ? amt : 0,
          amount_syp:     cur === 'SYP' ? amt : 0,
          payment_method: order.payment_method === 'bank' ? 'bank' : 'cash',
          entry_date:     new Date().toISOString().slice(0, 10),
          notes:          `تسجيل تلقائي عند التسليم — البائع: ${userName}`,
          created_by:     userName,
        });
      } catch (e) {
        console.warn('⚠️ لم يتم تسجيل القيد المحاسبي تلقائياً:', e.message);
      }
    }
  };

  const handleSave = async (form, existingId) => {
    let savedId = existingId;
    if (existingId) {
      const { error } = await supabase.from('orders')
        .update({ ...form, updated_at: new Date().toISOString(), updated_by: userName })
        .eq('id', existingId);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await supabase.from('orders')
        .insert({ ...form, created_by: userName })
        .select('id').single();
      if (error) throw new Error(error.message);
      savedId = data?.id;
    }
    setModal(null);
    load();
    // مزامنة الجدول عند الإنشاء أو التعديل
    const syncId = savedId || existingId;
    if (syncId && (form.market === 'syria' || form.market === 'turkey')) syncOrderToSheet(syncId);
    // Phase 2: reserve stock for NEW lowes-brand orders (best-effort).
    // Deducts catalog items from the seller's source warehouse.
    if (savedId && !existingId) {
      reserveForOrder({ id: savedId, ...form }, userName);
    }
  };

  // Delete permission: managers/admins/fulfillment anytime; a regular
  // employee may delete only their own order, and only the same day.
  const canDeleteOrder = (o) => {
    if (isManager || isFulfillment) return true;
    if (!myNames.has(o.handler_name)) return false;
    const created = o.created_at ? new Date(o.created_at) : (o.order_date ? new Date(o.order_date) : null);
    return created && created.toDateString() === new Date().toDateString();
  };
  const handleDelete = async (o) => {
    if (!canDeleteOrder(o)) { window.alert('لا تملك صلاحية حذف هذا الطلب. (الموظف يحذف طلبه بنفس يوم الإنشاء فقط.)'); return; }
    if (!window.confirm(`حذف طلب «${o.customer_name || o.order_id}»؟ لا يمكن التراجع.`)) return;
    try {
      if ((o.market === 'syria' || o.market === 'turkey') && o.archived !== true) releaseForOrder(o, userName);
      await supabase.from('orders').delete().eq('id', o.id);
      setOrders(p => p.filter(x => x.id !== o.id));
    } catch (e) { window.alert('تعذّر الحذف: ' + e.message); }
  };

  // Monthly archive: flag delivered orders older than 30 days as archived.
  const [archiving, setArchiving] = useState(false);
  const archiveOldDelivered = async () => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const eligible = orders.filter(o =>
      o.status === 'delivered' && o.archived !== true &&
      o.order_date && new Date(o.order_date) < cutoff
    );
    if (eligible.length === 0) { window.alert('لا توجد طلبات مسلّمة أقدم من شهر لأرشفتها.'); return; }
    if (!window.confirm(`أرشفة ${eligible.length} طلب مسلّم (أقدم من شهر)؟ تختفي من القائمة وتبقى في سجل العملاء.`)) return;
    setArchiving(true);
    try {
      const ids = eligible.map(o => o.id);
      await supabase.from('orders').update({ archived: true }).in('id', ids);
      await load();
    } catch (e) { window.alert('تعذّر: ' + e.message); }
    finally { setArchiving(false); }
  };

  const myNames = useMemo(() => new Set([userName, ...partnerNames]), [userName, partnerNames]);

  const filtered = useMemo(() => orders.filter(o => {
    if (myOrders && !myNames.has(o.handler_name)) return false;
    if (market !== 'all' && o.market !== market) return false;
    if (status !== 'all' && o.status !== status) return false;
    if (sellerFilter && o.handler_name !== sellerFilter) return false;
    if (dateFrom) {
      const oDate = (o.order_date || o.created_at || '').slice(0, 10);
      if (oDate < dateFrom) return false;
    }
    if (dateTo) {
      const oDate = (o.order_date || o.created_at || '').slice(0, 10);
      if (oDate > dateTo) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return o.customer_name?.toLowerCase().includes(q) ||
             o.order_id?.toLowerCase().includes(q) ||
             o.phone_1?.includes(q);
    }
    return true;
  }), [orders, market, status, search, myOrders, myNames, sellerFilter, dateFrom, dateTo]);

  // قائمة البائعين الفريدة من الطلبات الحالية
  const sellerOptions = useMemo(() =>
    [...new Set(orders.map(o => o.handler_name).filter(Boolean))].sort()
  , [orders]);

  const stats = useMemo(() => ({
    total:      orders.length,
    pending:    orders.filter(o => o.status === 'pending').length,
    preparing:  orders.filter(o => o.status === 'preparing').length,
    ready:      orders.filter(o => o.status === 'ready').length,
    shipped:    orders.filter(o => o.status === 'shipped').length,
    delivered:  orders.filter(o => o.status === 'delivered').length,
    actionable: orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status)).length,
    waiting:    orders.filter(o => FOLLOWUP_STATUSES.includes(o.status)).length,
    returned:   orders.filter(o => RETURN_STATUSES.includes(o.status)).length,
    myDelivered: orders.filter(o => o.status === 'delivered' && myNames.has(o.handler_name)).length,
    myWaiting:  orders.filter(o => myNames.has(o.handler_name) && FOLLOWUP_STATUSES.includes(o.status)).length,
  }), [orders, userName, myNames]);

  // Daily reminder: notify the seller (once per day) of orders that need follow-up
  // (waiting / returned). Mirrors the «Lozy reminds you» idea. Client-side, on open.
  useEffect(() => {
    if (!userId || stats.myWaiting === 0) return;
    const key = `orders_followup_reminded_${userId}_${new Date().toDateString()}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    sendNotification({
      userId,
      type:    NOTIFICATION_TYPE.SYSTEM_ALERT,
      title:   '⏳ طلبات بانتظار متابعتك',
      message: `عندك ${stats.myWaiting} طلب في الانتظار/راجع — صار وقت تتابعها وتضغط على العميل ليستلم.`,
      metadata: { kind: 'followup_reminder', count: stats.myWaiting },
    }).catch(() => {});
  }, [userId, stats.myWaiting]);

  return (
    <div className="space-y-4 pb-24 sm:pb-8" dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-text">
            {isFulfillment ? '📦 طلبات التجهيز' : 'إدارة الطلبات'}
          </h1>
          <p className="text-xs text-muted mt-0.5">
            {viewArchive
              ? `🗄️ الأرشيف · ${search.trim() ? `نتائج البحث: ${orders.length}` : `أحدث ${orders.length} — اكتب للبحث في كل الأرشيف`}`
              : isFulfillment
              ? `${stats.actionable} طلب يحتاج عملك · ${stats.delivered} تم توصيله`
              : `${stats.total} طلب · ${stats.pending} وارد · ${stats.shipped} في الشحن`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {isManager && (
            <button onClick={() => setViewArchive(v => !v)}
              className={`px-3 py-2.5 rounded-xl text-sm font-bold border transition ${viewArchive ? 'bg-navy text-white border-navy' : 'bg-surface-alt border-border text-muted hover:text-text'}`}
              title="عرض الطلبات المؤرشفة">
              {viewArchive ? '← الطلبات النشطة' : '🗄️ الأرشيف'}
            </button>
          )}
          {isManager && !viewArchive && (
            <button onClick={archiveOldDelivered} disabled={archiving}
              className="px-3 py-2.5 rounded-xl bg-surface-alt border border-border text-muted text-sm font-bold hover:text-text transition disabled:opacity-40"
              title="أرشفة الطلبات المسلّمة الأقدم من شهر">
              {archiving ? '…' : '🗄️ أرشفة'}
            </button>
          )}
          {!isFulfillment && !isStorage && !viewArchive && (
            <button onClick={() => { setViewWallet(v => !v); setViewTracking(false); setViewMonthly(false); }}
              className={`px-3 py-2.5 rounded-xl text-sm font-bold border transition ${viewWallet ? 'bg-navy text-white border-navy' : 'bg-surface-alt border-border text-muted hover:text-text'}`}
              title="محفظتي">
              💼
            </button>
          )}
          {!isFulfillment && !isStorage && !viewArchive && (
            <button onClick={() => { setViewTracking(v => !v); setViewMonthly(false); setViewWallet(false); }}
              className={`px-3 py-2.5 rounded-xl text-sm font-bold border transition ${viewTracking ? 'bg-teal text-white border-teal' : 'bg-surface-alt border-border text-muted hover:text-text'}`}
              title="تتبع الشحنات">
              📡
            </button>
          )}
          {!isFulfillment && !isStorage && !viewArchive && (
            <button onClick={() => { setViewMonthly(v => !v); setViewTracking(false); setViewWallet(false); }}
              className={`px-3 py-2.5 rounded-xl text-sm font-bold border transition ${viewMonthly ? 'bg-navy text-white border-navy' : 'bg-surface-alt border-border text-muted hover:text-text'}`}
              title="تسليمات الشهر">
              📦
            </button>
          )}
          {!isFulfillment && !viewArchive && !viewTracking && (
            <button onClick={() => setModal('new')}
              className="px-4 py-2.5 rounded-xl bg-teal text-white text-sm font-bold hover:bg-teal/90 transition shadow-sm flex items-center gap-2">
              + طلب جديد
            </button>
          )}
        </div>
      </div>

      {/* محفظة المبيعات */}
      {viewWallet && !isFulfillment && !isStorage && (
        <SellerWallet orders={orders} userName={userName} myNames={myNames} commissionPct={commissionPct} />
      )}

      {/* «طلباتي» / «كل الطلبات» toggle */}
      {!isFulfillment && !viewTracking && !viewMonthly && !viewWallet && (
        <div className="flex gap-2">
          <button onClick={() => setMyOrders(false)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition
              ${!myOrders ? 'border-navy bg-navy text-white' : 'border-border text-muted hover:border-navy/40'}`}>
            🌍 كل الطلبات
          </button>
          <button onClick={() => setMyOrders(true)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition
              ${myOrders ? 'border-teal bg-teal text-white' : 'border-border text-muted hover:border-teal/40'}`}>
            👤 طلباتي{partnerNames.length > 0 ? ` +${partnerNames.length}` : ''}{stats.myDelivered > 0 ? ` · ${stats.myDelivered} ✅` : ''}
          </button>
        </div>
      )}

      {/* Seller stats — visible when in «طلباتي» mode */}
      {myOrders && !isFulfillment && !viewTracking && !viewMonthly && !viewWallet && (
        <SellerStatsCard orders={orders} userName={userName} commissionPct={commissionPct} myNames={myNames} />
      )}

      {/* Fulfillment banner */}
      {isFulfillment && stats.pending > 0 && (
        <div className="bg-amber-bg border border-amber/30 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-2xl">📥</span>
          <div>
            <p className="text-sm font-bold text-amber-fg">{stats.pending} طلب وارد ينتظر التجهيز</p>
            <p className="text-xs text-muted">اضغط على الطلب للبدء بالفرز والتغليف</p>
          </div>
        </div>
      )}

      {/* Follow-up / returns banner — orders that need chasing the customer */}
      {!viewArchive && !viewMonthly && !viewWallet && (stats.waiting + stats.returned) > 0 && (
        <div className="bg-red-bg border border-red/30 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-2xl">🔁</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-fg">
              {stats.returned > 0 && `${stats.returned} راجع`}{stats.returned > 0 && stats.waiting > 0 && ' · '}{stats.waiting > 0 && `${stats.waiting} بالانتظار`}
            </p>
            <p className="text-xs text-muted">عملاء لم يستلموا — تابعهم واضغط عليهم ليستلموا (واتساب/اتصال على الكرت).</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {stats.returned > 0 && (
              <button onClick={() => setStatus('returned')}
                className="px-2.5 py-1.5 rounded-xl bg-red-fg/10 text-red-fg text-xs font-bold hover:opacity-80 transition">الرواجع</button>
            )}
            {stats.waiting > 0 && (
              <button onClick={() => setStatus('waiting')}
                className="px-2.5 py-1.5 rounded-xl bg-amber-fg/10 text-amber-fg text-xs font-bold hover:opacity-80 transition">الانتظار</button>
            )}
          </div>
        </div>
      )}

      {/* Stats row */}
      {!viewTracking && !viewMonthly && !viewWallet && <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'وارد',  value: stats.pending,                  color: 'text-muted',    bg: 'bg-surface-alt', onClick: () => setStatus('pending')   },
          { label: 'تجهيز', value: stats.preparing + stats.ready,  color: 'text-amber-fg', bg: 'bg-amber-bg',    onClick: () => setStatus('preparing') },
          { label: 'شحن',   value: stats.shipped,                   color: 'text-blue-700', bg: 'bg-blue-50',     onClick: () => setStatus('shipped')   },
          { label: 'وصل',   value: stats.delivered,                 color: 'text-green-fg', bg: 'bg-green-bg',    onClick: () => setStatus('delivered') },
        ].map(s => (
          <button key={s.label} onClick={s.onClick}
            className={`${s.bg} rounded-2xl p-3 text-center hover:opacity-80 transition cursor-pointer`}>
            <p className={`text-xl font-extrabold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted mt-0.5 font-medium">{s.label}</p>
          </button>
        ))}
      </div>}

      {/* Market tabs — everyone can browse both teams, when not in «طلباتي» */}
      {!myOrders && !viewTracking && !viewMonthly && !viewWallet && (
        <div className="flex gap-2">
          {[{ key: 'all', label: 'الكل', icon: '🌍' }, { key: 'turkey', label: 'تركيا', icon: '🇹🇷' }, { key: 'syria', label: 'سوريا', icon: '🇸🇾' }].map(m => (
            <button key={m.key} onClick={() => setMarket(m.key)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition
                ${market === m.key ? 'border-navy bg-navy text-white' : 'border-border text-muted hover:border-navy/40'}`}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Status filter */}
      {!viewTracking && !viewMonthly && !viewWallet && <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button onClick={() => setStatus('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition
            ${status === 'all' ? 'bg-text text-surface' : 'bg-surface border border-border text-muted'}`}>
          الكل
        </button>
        {Object.entries(STATUSES).map(([k, v]) => (
          <button key={k} onClick={() => setStatus(k)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition border
              ${status === k ? `${v.bg} ${v.text} ${v.border}` : 'bg-surface border-border text-muted'}`}>
            {v.icon} {v.label}
          </button>
        ))}
      </div>}

      {/* Search */}
      {!viewTracking && !viewMonthly && !viewWallet && <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="🔍 بحث بالاسم أو رقم الطلب أو الهاتف..."
        className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />}

      {/* فلتر البائع + المدة */}
      {!viewTracking && !viewMonthly && !viewWallet && isManager && (
        <div className="flex gap-2 flex-wrap">
          <select value={sellerFilter} onChange={e => setSellerFilter(e.target.value)}
            className="flex-1 min-w-[120px] border border-border rounded-xl px-3 py-2 text-xs bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30">
            <option value="">👤 كل البائعين</option>
            {sellerOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            title="من تاريخ"
            className="flex-1 min-w-[120px] border border-border rounded-xl px-3 py-2 text-xs bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            title="إلى تاريخ"
            className="flex-1 min-w-[120px] border border-border rounded-xl px-3 py-2 text-xs bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
          {(sellerFilter || dateFrom || dateTo) && (
            <button onClick={() => { setSellerFilter(''); setDateFrom(''); setDateTo(''); }}
              className="px-3 py-2 rounded-xl bg-red-bg text-red-fg text-xs font-bold hover:opacity-80 transition">
              ✕ مسح
            </button>
          )}
        </div>
      )}

      {/* Monthly Deliveries Tab */}
      {viewMonthly && (
        <MonthlyDeliveriesTab
          orders={orders}
          isManager={isManager}
          userName={userName}
          onArchive={handleMonthArchive}
          archiving={archiving}
        />
      )}

      {/* Tracking Tab */}
      {viewTracking && (
        <TrackingTab
          orders={orders}
          onManualRefresh={handleManualTrackingRefresh}
          refreshing={refreshing}
        />
      )}

      {/* List */}
      {!viewTracking && !viewMonthly && loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-36 bg-surface-alt animate-pulse rounded-2xl" />)}</div>
      ) : !viewTracking && filtered.length === 0 ? (
        <div className="text-center py-16 text-muted border-2 border-dashed border-border rounded-2xl">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm font-bold">{myOrders ? 'لا توجد طلبات باسمك بعد' : 'لا توجد طلبات'}</p>
          {!myOrders && (
            <button onClick={() => setModal('new')}
              className="mt-4 px-4 py-2 rounded-xl bg-teal/10 text-teal text-sm font-bold hover:bg-teal/20 transition">
              + أضف أول طلب
            </button>
          )}
        </div>
      ) : !viewTracking && !viewMonthly ? (
        <div className="space-y-3">
          {filtered.map(o => (
            <OrderCard key={o.id} order={o}
              canAdvance={canAdvanceOrder(o)}
              onStatusChange={handleStatusChange}
              onEdit={(o) => setModal(o)}
              onInvoice={(o) => setInvoice(o)}
              onDelete={handleDelete}
              canDelete={canDeleteOrder(o)} />
          ))}
        </div>
      ) : null}

      {/* FAB */}
      <button onClick={() => setModal('new')}
        className="fixed bottom-24 end-5 z-40 w-14 h-14 rounded-full bg-navy text-white shadow-2xl flex items-center justify-center text-2xl hover:bg-navy/90 active:scale-95 transition-transform md:bottom-8"
        aria-label="طلب جديد">
        +
      </button>

      {/* Order Form Modal */}
      {modal && (
        <OrderFormModal
          order={modal === 'new' ? null : modal}
          allOrders={orders}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {/* Invoice Modal */}
      {invoice && (
        <InvoiceModal order={invoice} onClose={() => setInvoice(null)} />
      )}
    </div>
  );
}
