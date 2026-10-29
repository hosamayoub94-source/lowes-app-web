// =============================================================
// Manager Board Service — pulls live KPIs from Supabase for the
// executive morning dashboard (#5).
//
// Sources:
//   • daily_reports     → sales (TRY/SYP/USD) + confirmations
//   • orders            → order value + status breakdown + top products
//   • attendance        → today's present/late/absent
//   • tasks             → overdue / in-progress / done-this-week
//   • profiles          → active headcount
//   • sales_targets     → monthly target (if defined)
// =============================================================
import { supabase } from './supabase';
import { fetchAllRows } from '@utils/fetchAllRows';
import { loadDeliveredForPeriod, loadStoredCommissions } from './deliveryAccountingService';
import { periodBounds } from '@utils/deliveryAccounting';

// ── المسلَّم هذا الشهر (D-174) ────────────────────────────────
// نفس محدِّد الرواتب و«محاسبة المبيعات والتسليمات»: تاريخ انتقال الطلب إلى «تم التسليم»
// بتوقيت إسطنبول، لا order_date. يُحمَّل مرة ويُمرَّر لكل الأقسام. null = تعذّر (يظهر «—» لا صفر).
async function fetchDeliveredThisMonth() {
  const d = new Date();
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  try {
    const p = periodBounds({ month });
    const res = await loadDeliveredForPeriod({ from: p.from, to: p.to });
    return { delivered: res.delivered, returns: res.returns };
  } catch {
    return null;
  }
}

// ── Date helpers ──────────────────────────────────────────────
function todaySlash() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}
function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Sales (daily_reports) ─────────────────────────────────────
async function fetchSales() {
  const monthStart = monthStartISO();
  const today      = todayISO();

  const { data, error } = await supabase
    .from('daily_reports')
    .select('report_date, total_sales_try, total_sales_syp, total_sales_usd, total_confirmations, total_messages')
    .gte('report_date', monthStart)
    .order('report_date', { ascending: false });

  if (error || !data) return { today: zero(), month: zero(), confirmsToday: 0, confirmsMonth: 0, msgsMonth: 0 };

  const sum = (rows) => rows.reduce((a, r) => ({
    try: a.try + Number(r.total_sales_try || 0),
    syp: a.syp + Number(r.total_sales_syp || 0),
    usd: a.usd + Number(r.total_sales_usd || 0),
  }), zero());

  const todayRows = data.filter(r => r.report_date === today);
  return {
    today:         sum(todayRows),
    month:         sum(data),
    confirmsToday: todayRows.reduce((a, r) => a + Number(r.total_confirmations || 0), 0),
    confirmsMonth: data.reduce((a, r) => a + Number(r.total_confirmations || 0), 0),
    msgsMonth:     data.reduce((a, r) => a + Number(r.total_messages || 0), 0),
  };
}
const zero = () => ({ try: 0, syp: 0, usd: 0 });

// ── Orders (status + value + top products) ────────────────────
// byStatus/valueByCurrency/topProducts = طلبات أُنشئت هذا الشهر (حسب حالتها الآن).
// «المسلَّم» (العدد ولكل سوق) من deliv: ما سُلِّم فعلاً هذا الشهر — نفس الرواتب (D-174).
async function fetchOrders(deliv) {
  const monthStart = monthStartISO();
  // fetchAllRows — PostgREST يبتر عند 1000 صف صامتاً بلا خطأ. تحقّقت حياً:
  // آخر الشهر بيعدّي 1000 طلب بسهولة (أغسطس لحاله عدّى 800+ بمنتصف الشهر)،
  // فبدون هالـhelper كانت أرقام "المُسلَّم لكل فريق" تطلع ناقصة بصمت.
  let data = [];
  let error = null;
  try {
    data = await fetchAllRows(() => supabase
      .from('orders')
      .select('status, amount, currency, items, market, created_at, order_date')
      .gte('order_date', monthStart + 'T00:00:00'));
  } catch (e) { error = e; }

  if (error || !data) return { total: 0, byStatus: {}, pending: 0, delivered: 0, cancelled: 0, topProducts: [], valueByCurrency: {}, byMarket: {} };

  const byStatus = {};
  const valueByCurrency = {};
  const productCount = {};
  // تقسيم حسب الفريق — orders.market عمود نظيف وإلزامي ('syria'/'turkey'،
  // لا علاقة له بتضارب campaigns.team/profiles.team). كان يُجلب هون أصلاً
  // (السطر فوق) بس بلا استخدام — كل الأرقام كانت مجمّعة للفريقين سوا.
  // كل الطلبات (كل الحالات) + delivered فقط (طلب حسام: "القطع اللي تسلّمت"
  // هي رقم "المباع" الحقيقي، مش كل طلب مسجَّل بغض النظر عن حالته).
  const byMarket = {};
  const marketBucket = (mk) => (byMarket[mk] ??= {
    orders: 0, units: 0, valueByCurrency: {},
    delivered: { orders: 0, units: 0, valueByCurrency: {} },
  });

  for (const o of data) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    const mb = marketBucket(o.market || 'غير محدد');
    mb.orders += 1;
    if (o.amount) {
      const cur = o.currency || 'TRY';
      valueByCurrency[cur] = (valueByCurrency[cur] || 0) + Number(o.amount);
      mb.valueByCurrency[cur] = (mb.valueByCurrency[cur] || 0) + Number(o.amount);
    }
    if (Array.isArray(o.items)) {
      for (const it of o.items) {
        const name = it.name || 'غير محدد';
        const qty = Number(it.qty || 1);
        productCount[name] = (productCount[name] || 0) + qty;
        mb.units += qty;
      }
    }
  }
  for (const o of deliv?.delivered || []) {
    const mb = marketBucket(o.market || 'غير محدد');
    mb.delivered.orders += 1;
    if (o.amount) {
      const cur = o.currency || 'TRY';
      mb.delivered.valueByCurrency[cur] = (mb.delivered.valueByCurrency[cur] || 0) + Number(o.amount);
    }
    for (const it of Array.isArray(o.items) ? o.items : []) mb.delivered.units += Number(it.qty || 1);
  }

  const topProducts = Object.entries(productCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  return {
    total:      data.length,
    byStatus,
    pending:    (byStatus.pending || 0) + (byStatus.preparing || 0),
    delivered:  deliv ? deliv.delivered.length : null, // null = تعذّر التحميل (يُعرض «—»)
    cancelled:  byStatus.cancelled || 0,
    shipped:    byStatus.shipped || 0,
    topProducts,
    valueByCurrency,
    byMarket,
  };
}

// ── حركة المخزن (استلام/تحويل/حجز/استرداد) لكل فريق هذا الشهر ──
// wh_movements ما فيها market مباشرة — لازم ربطها بـwh_warehouses.market عبر
// from/to_warehouse_id. from=null (receive) يُحسب "دخول" فقط لسوق to. حركة
// بين مخزنين بنفس السوق تُحسب دخول+خروج لنفس السوق (صافي صفر بقصد — تحويل
// داخلي، مش دخول/خروج فعلي للفريق). حركة "adjust" مُستبعدة من المجموع لأنها
// تسجّل الكمية النهائية المطلقة بعد الجرد (مش فرق/دلتا) فجمعها بيعطي رقم
// كارثي الخطأ — تُحسب بالعدّاد فقط كـ"عدد عمليات تصحيح".
async function fetchInventoryMovements() {
  const monthStart = monthStartISO();
  // fetchAllRows — تحقّقت حياً: 1153 حركة هالشهر لحاله (بمنتصف الشهر)، تعدّى
  // سقف PostgREST الـ1000 صف الصامت. بدون هالـhelper الأرقام كانت تُبتر.
  let movRows = [];
  let whRows = [];
  try {
    [movRows, whRows] = await Promise.all([
      fetchAllRows(() => supabase.from('wh_movements')
        .select('from_warehouse_id, to_warehouse_id, quantity, type, created_at')
        .gte('created_at', monthStart + 'T00:00:00')),
      fetchAllRows(() => supabase.from('wh_warehouses').select('id, market')),
    ]);
  } catch { return { byMarket: {} }; }

  const marketByWh = Object.fromEntries(whRows.map(w => [w.id, w.market || 'غير محدد']));
  const byMarket = {};
  const bucket = (mk) => (byMarket[mk] ??= { in: 0, out: 0, adjustCount: 0, byType: {} });

  for (const m of movRows) {
    const qty = Number(m.quantity) || 0;
    if (m.type === 'adjust') {
      const mk = marketByWh[m.to_warehouse_id] || marketByWh[m.from_warehouse_id];
      if (mk) bucket(mk).adjustCount += 1;
      continue;
    }
    if (m.to_warehouse_id && marketByWh[m.to_warehouse_id]) {
      const b = bucket(marketByWh[m.to_warehouse_id]);
      b.in += qty;
      (b.byType[m.type] ??= { in: 0, out: 0 }).in += qty;
    }
    if (m.from_warehouse_id && marketByWh[m.from_warehouse_id]) {
      const b = bucket(marketByWh[m.from_warehouse_id]);
      b.out += qty;
      (b.byType[m.type] ??= { in: 0, out: 0 }).out += qty;
    }
  }
  return { byMarket };
}

// ── Attendance (today) ────────────────────────────────────────
async function fetchAttendance() {
  const today = todaySlash();

  const [attRes, profRes] = await Promise.all([
    supabase.from('attendance')
      .select('employee_name, type, status, was_late, time_in, team')
      .eq('date', today),
    supabase.from('profiles')
      .select('employee_name, team, role_type')
      .eq('is_active', true),
  ]);

  const att   = attRes.data || [];
  const profs = profRes.data || [];

  // present = anyone with an 'in' record today
  const inRecords = att.filter(r => r.type === 'in');
  const presentNames = new Set(inRecords.map(r => r.employee_name));
  const lateNames    = new Set(inRecords.filter(r => r.was_late).map(r => r.employee_name));

  // Exclude admin/manager synthetic accounts from headcount where role is generic
  const activeEmployees = profs.filter(p => p.employee_name);
  const total   = activeEmployees.length;
  const present = activeEmployees.filter(p => presentNames.has(p.employee_name)).length;
  const late    = activeEmployees.filter(p => lateNames.has(p.employee_name)).length;
  const absent  = total - present;

  const absentList = activeEmployees
    .filter(p => !presentNames.has(p.employee_name))
    .map(p => ({ name: p.employee_name, team: p.team }))
    .slice(0, 20);

  return {
    total, present, late, absent,
    rate: total ? Math.round((present / total) * 100) : 0,
    absentList,
    presentList: inRecords.map(r => ({ name: r.employee_name, time: r.time_in, late: r.was_late, team: r.team })),
  };
}

// ── Tasks ─────────────────────────────────────────────────────
async function fetchTasks() {
  const todayStr   = todayISO();
  const weekAgoStr = daysAgoISO(7);

  const { data, error } = await supabase
    .from('tasks')
    .select('title, status, priority, due_date, assigned_to, progress, updated_at');

  if (error || !data) return { overdue: [], inProgress: 0, doneThisWeek: 0, highPriority: 0, total: 0 };

  const isDone = (s) => ['done', 'completed'].includes(s);

  const overdue = data.filter(t =>
    !isDone(t.status) &&
    t.due_date &&
    t.due_date.slice(0, 10) < todayStr
  ).map(t => ({ title: t.title, due: t.due_date.slice(0, 10), priority: t.priority }));

  const inProgress   = data.filter(t => t.status === 'in_progress').length;
  const doneThisWeek = data.filter(t => isDone(t.status) && t.updated_at && t.updated_at.slice(0,10) >= weekAgoStr).length;
  const highPriority = data.filter(t => !isDone(t.status) && ['high','urgent'].includes(t.priority)).length;

  return { overdue, inProgress, doneThisWeek, highPriority, total: data.length };
}

// ── Seller commissions — من مسيّر الرواتب كما حُسبت (D-174) ────────
// كانت: قيمة المسلَّم بتاريخ الطلب × profiles.commission_pct — رقم لا يُصرف.
// الآن: payroll_entries لدورة الشهر (قراءة فقط، محمية بصلاحية الرواتب؛ بلا صلاحية ← قائمة فارغة).
async function fetchCommissions() {
  const d = new Date();
  try {
    const rows = await loadStoredCommissions(d.getFullYear(), d.getMonth() + 1);
    const sellers = rows
      .filter(r => r.orders > 0 || r.commission > 0)
      .sort((a, b) => b.commission - a.commission || b.salesUsd - a.salesUsd);
    return { sellers, totalSellers: sellers.length };
  } catch {
    return { sellers: [], totalSellers: 0 };
  }
}

// ── Returns report: per-seller delivered vs returned (count + value) ──
// «آخر الشهر: لكل موظف شو مسلّم وشو عندو راجع بالعدد والقيمة»
// المسلَّم = سُلِّم فعلاً هذا الشهر؛ الراجع = «تم الاسترجاع» بتاريخ إرجاع موثوق داخل الشهر
// (نفس تبويب المرتجعات بـ/sales-delivery). المعلّق (راجع للمركز/لم يُستلم) والتسويات هناك بالتفصيل.
function buildReturnsReport(deliv) {
  if (!deliv) return null;
  const bySeller = {};
  const slot = (name) => (bySeller[name] ??= { name, deliveredCount: 0, returnedCount: 0, deliveredValue: {}, returnedValue: {} });
  for (const o of deliv.delivered) {
    if (!o.handler_name) continue;
    const s = slot(o.handler_name), cur = o.currency || 'USD';
    s.deliveredCount += 1;
    s.deliveredValue[cur] = (s.deliveredValue[cur] || 0) + (Number(o.amount) || 0);
  }
  for (const o of deliv.returns) {
    if (!o.handler_name) continue;
    const s = slot(o.handler_name), cur = o.currency || 'USD';
    s.returnedCount += 1;
    s.returnedValue[cur] = (s.returnedValue[cur] || 0) + (Number(o.amount) || 0);
  }

  const sellers = Object.values(bySeller).map(s => {
    const totalOrders = s.deliveredCount + s.returnedCount;
    s.returnRate = totalOrders > 0 ? Math.round((s.returnedCount / totalOrders) * 100) : 0;
    return s;
  }).sort((a, b) => (b.deliveredCount + b.returnedCount) - (a.deliveredCount + a.returnedCount));

  const totals = {
    deliveredCount: sellers.reduce((n, s) => n + s.deliveredCount, 0),
    returnedCount:  sellers.reduce((n, s) => n + s.returnedCount, 0),
  };
  return { sellers, totals };
}

// ── Sales target (if defined) ─────────────────────────────────
async function fetchTarget() {
  const d = new Date();
  try {
    // Same row the Sales dashboard writes (target_usd / achieved_usd)
    const { data } = await supabase
      .from('sales_targets')
      .select('target_usd, achieved_usd, month, year')
      .eq('year', d.getFullYear())
      .eq('month', d.getMonth() + 1)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

// ── Master loader ─────────────────────────────────────────────
export async function loadManagerBoard() {
  // المسلَّم هذا الشهر يُحمَّل أولاً (بالتوازي مع الباقي) ويُمرَّر للطلبات والرواجع — مصدر واحد
  const delivPromise = fetchDeliveredThisMonth();
  const [sales, orders, attendance, tasks, target, commissions, deliv, inventory] = await Promise.all([
    fetchSales(),
    delivPromise.then(fetchOrders),
    fetchAttendance(),
    fetchTasks(),
    fetchTarget(),
    fetchCommissions(),
    delivPromise,
    fetchInventoryMovements(),
  ]);
  const returns = buildReturnsReport(deliv);

  return { sales, orders, attendance, tasks, target, commissions, returns, inventory, deliveredLoadFailed: !deliv, loadedAt: new Date().toISOString() };
}
