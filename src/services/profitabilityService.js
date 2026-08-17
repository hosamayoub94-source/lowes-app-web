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
import { supabase, supabaseAnon } from './supabase';
import { fetchAllRows } from '@utils/fetchAllRows';

// المرتجعات الحقيقية (يخسر فيها الصنف تكلفته). الملغي/المحذوف ليس مرتجعاً.
const RETURN_STATUSES = ['not_received', 'returning', 'returned'];
const CANCELLED_STATUSES = ['cancelled'];

function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}
const norm = (s) => String(s || '').trim().toLowerCase();

export async function loadProfitability({ since, brand = 'lowes' } = {}) {
  const from = since || monthStartISO();

  const [orders, econRes, mapRes] = await Promise.all([
    // على دفعات + استثناء المحذوف (soft-delete يحمل status='cancelled' فيُحسب
    // خطأً كمرتجع). جدول orders ضخم (30k+) فبدون الدفعات تُبتر البيانات.
    fetchAllRows(() => supabaseAnon.from('orders')
      .select('status, items, order_date')
      .is('deleted_at', null)
      .gte('order_date', from + 'T00:00:00')),
    supabase.from('product_economics').select('*'),
    supabase.from('product_name_map').select('*'),
  ]);

  const econRows = econRes.data ?? [];
  const econByName = {};
  econRows.forEach(e => { econByName[norm(e.item_name)] = e; });

  // ⚠️ 17 آب 2026: أسماء عناصر الطلبات حرّة — نفس المنتج يظهر بعدة أسماء
  // (عربي/إنجليزي/أخطاء إملائية: "شامبو الروزماري" و"ROSEMARY SHAMPOO" هما
  // نفس الصنف) فكانا يُحسبان كصنفين منفصلين وتُشتّت الأرقام. product_name_map
  // يربط كل اسم خام باسم موحّد + براند (lowes/strong) + حالة نشاط — أصناف
  // سترونغ المُعلَّمة "مجمَّد" (is_active=false) تُستبعد كلياً من التقرير.
  // اسم غير مُخطَّط (لا صف له بالجدول) يبقى ظاهراً باسمه الخام تحت براند lowes
  // الافتراضي، عشان ما يختفي بصمت — يحتاج تصنيف لاحق بدل تجاهله.
  const mapRows = mapRes.data ?? [];
  const nameMap = {};
  mapRows.forEach(m => { nameMap[norm(m.alias_name)] = m; });

  // Aggregate units sold + returned units (المرتجع الحقيقي فقط) per canonical name.
  // الملغي يُتخطّى (لم يُباع ولا يُرجَع). أصناف سترونغ المجمَّدة تُستبعد كلياً.
  const agg = {}; // key: canonical display name
  for (const o of orders) {
    if (!Array.isArray(o.items)) continue;
    if (CANCELLED_STATUSES.includes(o.status)) continue;
    const returned = RETURN_STATUSES.includes(o.status);
    for (const it of o.items) {
      const rawName = (it.name || '').trim();
      if (!rawName) continue;
      const m = nameMap[norm(rawName)];
      if (m && !m.is_active) continue; // صنف مجمَّد — مُستبعد كلياً
      const itemBrand = m?.brand || 'lowes';
      if (brand !== 'all' && itemBrand !== brand) continue;
      const name = m?.canonical_name || rawName;
      const key = norm(name);
      if (!agg[key]) agg[key] = { name, units: 0, returns: 0, brand: itemBrand };
      const qty = Number(it.qty || 1);
      if (returned) agg[key].returns += qty;
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
      name: p.name, brand: p.brand, units: p.units, returns: p.returns, returnRate,
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

/** تجميد/تفعيل صنف — يطبَّق على كل الأسماء الخام المدمَجة تحت نفس الاسم الموحَّد. */
export async function setProductActive(canonicalName, isActive) {
  const { error } = await supabase
    .from('product_name_map')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('canonical_name', canonicalName);
  if (error) throw error;
  return true;
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
