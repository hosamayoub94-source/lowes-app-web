// =============================================================
// Profitability Service (#1) — الربح الصافي الحقيقي لكل منتج.
//
// التحدي: عناصر الطلبات أسماء حرة إنجليزية لا تطابق الكتالوج العربي.
// الحل: نجمّع حسب اسم العنصر كما هو في الطلبات (بيانات حقيقية)، ونربطه
// بجدول product_economics (السعر/التكلفة/الإعلان/الشحن لكل صنف) الذي
// يملؤه المالك. الربح يظهر فور إدخال الاقتصاديات.
//
//   ربح الوحدة = السعر − التكلفة − الإعلان − الشحن
//   الربح الصافي للصنف = (ربح الوحدة × الوحدات المُباعة) − (التكلفة × المرتجعات)
// =============================================================
import { supabase } from './supabase';

function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}
const norm = (s) => String(s || '').trim().toLowerCase();

export async function loadProfitability({ since } = {}) {
  const from = since || monthStartISO();

  const [ordersRes, econRes] = await Promise.all([
    supabase.from('orders').select('status, items, order_date').gte('order_date', from + 'T00:00:00'),
    supabase.from('product_economics').select('*'),
  ]);

  const orders = ordersRes.data ?? [];
  const econRows = econRes.data ?? [];
  const econByName = {};
  econRows.forEach(e => { econByName[norm(e.item_name)] = e; });

  // Aggregate units sold (non-cancelled) + returned units (cancelled) per item name
  const agg = {}; // key: display name
  for (const o of orders) {
    if (!Array.isArray(o.items)) continue;
    const cancelled = o.status === 'cancelled';
    for (const it of o.items) {
      const name = (it.name || '').trim();
      if (!name) continue;
      const key = norm(name);
      if (!agg[key]) agg[key] = { name, units: 0, returns: 0 };
      const qty = Number(it.qty || 1);
      if (cancelled) agg[key].returns += qty;
      else agg[key].units += qty;
    }
  }

  const products = Object.values(agg).map(p => {
    const e = econByName[norm(p.name)] || {};
    const price = Number(e.sale_price_usd || 0);
    const cost  = Number(e.cost_usd || 0);
    const ad    = Number(e.ad_cost_usd || 0);
    const ship  = Number(e.shipping_cost_usd || 0);

    const unitProfit  = price - cost - ad - ship;
    const revenue     = price * p.units;
    const netProfit   = (unitProfit * p.units) - (cost * p.returns); // returns lose COGS
    const totalUnits  = p.units + p.returns;
    const returnRate  = totalUnits ? Math.round((p.returns / totalUnits) * 100) : 0;
    const margin      = revenue ? Math.round((netProfit / revenue) * 100) : null;
    const hasEcon     = price > 0 && cost > 0;

    return {
      name: p.name, units: p.units, returns: p.returns, returnRate,
      price, cost, ad, ship, unitProfit, revenue, netProfit, margin, hasEcon,
      // classification
      flag: !hasEcon ? 'unset'
        : unitProfit <= 0 ? 'loss'
        : returnRate > 25 ? 'risky'
        : (netProfit > 0 && p.units >= 2) ? 'star'
        : 'ok',
    };
  });

  // sort: configured first by netProfit desc, then unset by units desc
  products.sort((a, b) => {
    if (a.hasEcon !== b.hasEcon) return a.hasEcon ? -1 : 1;
    if (a.hasEcon) return b.netProfit - a.netProfit;
    return b.units - a.units;
  });

  const configured = products.filter(p => p.hasEcon);
  const totals = {
    netProfit: configured.reduce((s, p) => s + p.netProfit, 0),
    revenue:   configured.reduce((s, p) => s + p.revenue, 0),
    stars:     products.filter(p => p.flag === 'star').length,
    losers:    products.filter(p => p.flag === 'loss').length,
    risky:     products.filter(p => p.flag === 'risky').length,
    unset:     products.filter(p => p.flag === 'unset').length,
  };

  return { products, totals, since: from };
}

/** Upsert economics for one item name. */
export async function saveEconomics(itemName, fields) {
  const row = { item_name: itemName, updated_at: new Date().toISOString(), ...fields };
  const { error } = await supabase
    .from('product_economics')
    .upsert(row, { onConflict: 'item_name' });
  if (error) throw error;
  return true;
}
