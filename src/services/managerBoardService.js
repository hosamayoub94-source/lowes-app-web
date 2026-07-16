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
import { supabase, supabaseAnon } from './supabase';

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
async function fetchOrders() {
  const monthStart = monthStartISO();
  const { data, error } = await supabase
    .from('orders')
    .select('status, amount, currency, items, market, created_at, order_date')
    .gte('order_date', monthStart + 'T00:00:00');

  if (error || !data) return { total: 0, byStatus: {}, pending: 0, delivered: 0, cancelled: 0, topProducts: [], valueByCurrency: {} };

  const byStatus = {};
  const valueByCurrency = {};
  const productCount = {};

  for (const o of data) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    if (o.amount) {
      const cur = o.currency || 'TRY';
      valueByCurrency[cur] = (valueByCurrency[cur] || 0) + Number(o.amount);
    }
    if (Array.isArray(o.items)) {
      for (const it of o.items) {
        const name = it.name || 'غير محدد';
        productCount[name] = (productCount[name] || 0) + Number(it.qty || 1);
      }
    }
  }

  const topProducts = Object.entries(productCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  return {
    total:      data.length,
    byStatus,
    pending:    (byStatus.pending || 0) + (byStatus.preparing || 0),
    delivered:  byStatus.delivered || 0,
    cancelled:  byStatus.cancelled || 0,
    shipped:    byStatus.shipped || 0,
    topProducts,
    valueByCurrency,
  };
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

// ── Seller commissions (delivered orders this month) ──────────
// For each seller: total delivered value per currency + commission
// (value × profiles.commission_pct). Sorted by total value.
async function fetchCommissions() {
  const monthStart = monthStartISO();

  const [ordRes, profRes] = await Promise.all([
    supabaseAnon.from('orders')
      .select('handler_name, amount, currency, order_date')
      .eq('status', 'delivered')
      .gte('order_date', monthStart + 'T00:00:00'),
    supabase.from('profiles')
      .select('employee_name, commission_pct'),
  ]);

  const orders = ordRes.data || [];
  const pctByName = {};
  for (const p of (profRes.data || [])) {
    if (p.employee_name) pctByName[p.employee_name] = Number(p.commission_pct ?? 0);
  }

  // Group by seller → { totals: {cur: sum}, count }
  const bySeller = {};
  for (const o of orders) {
    const name = o.handler_name;
    if (!name || !o.amount) continue;
    const cur = o.currency || 'USD';
    if (!bySeller[name]) bySeller[name] = { name, totals: {}, count: 0, pct: pctByName[name] ?? 0 };
    bySeller[name].totals[cur] = (bySeller[name].totals[cur] || 0) + Number(o.amount);
    bySeller[name].count += 1;
  }

  // Compute commission per currency + a sort key (sum of all currency totals)
  const sellers = Object.values(bySeller).map(s => {
    const commissions = {};
    let sortVal = 0;
    for (const [cur, total] of Object.entries(s.totals)) {
      commissions[cur] = s.pct > 0 ? Math.round(total * s.pct / 100) : 0;
      sortVal += total;
    }
    return { ...s, commissions, sortVal };
  }).sort((a, b) => b.sortVal - a.sortVal);

  return { sellers, totalSellers: sellers.length };
}

// ── Returns report: per-seller delivered vs returned (count + value) ──
// «آخر الشهر: لكل موظف شو مسلّم وشو عندو راجع بالعدد والقيمة»
// Returns that count against the seller; «تمت التسوية» (settled) does NOT —
// the customer paid the shipping, so it's a 0-return for the seller's balance.
const RETURN_STATUSES = ['not_received', 'returning', 'returned'];
async function fetchReturnsReport() {
  const monthStart = monthStartISO();
  const { data } = await supabaseAnon.from('orders')
    .select('handler_name, amount, currency, status, order_date')
    .in('status', ['delivered', 'settled', ...RETURN_STATUSES])
    .gte('order_date', monthStart + 'T00:00:00');

  const rows = data || [];
  const bySeller = {};
  for (const o of rows) {
    const name = o.handler_name;
    if (!name) continue;
    const cur = o.currency || 'USD';
    const amt = Number(o.amount) || 0;
    if (!bySeller[name]) bySeller[name] = { name, deliveredCount: 0, returnedCount: 0, settledCount: 0, deliveredValue: {}, returnedValue: {} };
    const s = bySeller[name];
    if (o.status === 'delivered') {
      s.deliveredCount += 1;
      s.deliveredValue[cur] = (s.deliveredValue[cur] || 0) + amt;
    } else if (o.status === 'settled') {
      s.settledCount += 1; // resolved — not held against the seller
    } else if (RETURN_STATUSES.includes(o.status)) {
      s.returnedCount += 1;
      s.returnedValue[cur] = (s.returnedValue[cur] || 0) + amt;
    }
  }

  const sellers = Object.values(bySeller).map(s => {
    const totalOrders = s.deliveredCount + s.returnedCount;
    // Return rate by count — settled excluded (counts as 0 return for the seller)
    s.returnRate = totalOrders > 0 ? Math.round((s.returnedCount / totalOrders) * 100) : 0;
    return s;
  }).sort((a, b) => (b.deliveredCount + b.returnedCount) - (a.deliveredCount + a.returnedCount));

  const totals = {
    deliveredCount: sellers.reduce((n, s) => n + s.deliveredCount, 0),
    returnedCount:  sellers.reduce((n, s) => n + s.returnedCount, 0),
    settledCount:   sellers.reduce((n, s) => n + s.settledCount, 0),
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
  const [sales, orders, attendance, tasks, target, commissions, returns] = await Promise.all([
    fetchSales(),
    fetchOrders(),
    fetchAttendance(),
    fetchTasks(),
    fetchTarget(),
    fetchCommissions(),
    fetchReturnsReport(),
  ]);

  return { sales, orders, attendance, tasks, target, commissions, returns, loadedAt: new Date().toISOString() };
}
