// =============================================================
// Accounting Service — mock + real branches
// =============================================================
import { ENTRY_TYPE, TRANSFER_IN, TRANSFER_OUT, BOOK, WALLETS } from '../types/accounting.types.js';

export const USE_MOCK =
  String(import.meta.env.VITE_USE_MOCK_ACCOUNTING ?? '').toLowerCase() !== 'false';

// ── Mock data ──────────────────────────────────────────────────────────────

let _mockEntries = [
  {
    id: 'ac-1', entry_type: 'income', category: 'مبيعات أونلاين',
    description: 'مبيعات موقع إلكتروني - مايو',
    employee_id: null, employee_name: null,
    amount_usd: 3200, amount_try: 0, amount_syp: 0,
    payment_method: 'bank', entry_date: '2026-05-15', book: 'operational',
    advance_status: null, created_by: 'admin-1',
    created_at: '2026-05-15T10:00:00Z',
  },
  {
    id: 'ac-2', entry_type: 'expense', category: 'إعلانات ميتا',
    description: 'حملة إعلانية مايو',
    employee_id: null, employee_name: null,
    amount_usd: 800, amount_try: 0, amount_syp: 0,
    payment_method: 'card', entry_date: '2026-05-10', book: 'operational',
    advance_status: null, created_by: 'admin-1',
    created_at: '2026-05-10T09:00:00Z',
  },
  {
    id: 'ac-3', entry_type: 'advance', category: 'سلفة راتب',
    description: 'سلفة راتب - سارة علي',
    employee_id: 'emp-2', employee_name: 'سارة علي',
    amount_usd: 500, amount_try: 0, amount_syp: 0,
    payment_method: 'cash', entry_date: '2026-05-12', book: 'central',
    advance_status: 'approved', created_by: 'admin-1',
    created_at: '2026-05-12T11:00:00Z',
  },
  {
    id: 'ac-4', entry_type: 'expense', category: 'إيجار مكتب',
    description: 'إيجار مكتب إسطنبول - مايو',
    employee_id: null, employee_name: null,
    amount_usd: 1200, amount_try: 0, amount_syp: 0,
    payment_method: 'bank', entry_date: '2026-05-01', book: 'operational',
    advance_status: null, created_by: 'admin-1',
    created_at: '2026-05-01T08:00:00Z',
  },
];

let _mockCategories = [
  { id: 'cat-1', name: 'مبيعات أونلاين', entry_type: 'income' },
  { id: 'cat-2', name: 'مبيعات محلات', entry_type: 'income' },
  { id: 'cat-3', name: 'إعلانات ميتا', entry_type: 'expense' },
  { id: 'cat-4', name: 'إيجار مكتب', entry_type: 'expense' },
  { id: 'cat-5', name: 'رواتب', entry_type: 'salary' },
  { id: 'cat-6', name: 'سلفة راتب', entry_type: 'advance' },
];

let _mockChannels = [
  { id: 'ch-1', name_ar: 'قدموس',  kind: 'shipping',   currency: null, is_active: true, allows_income: true,  allows_expense: true,  book: 'operational', sort_order: 10, icon: '🚚' },
  { id: 'ch-2', name_ar: 'الكرم',  kind: 'shipping',   currency: null, is_active: true, allows_income: true,  allows_expense: true,  book: 'operational', sort_order: 11, icon: '🚚' },
  { id: 'ch-3', name_ar: 'أونلاين', kind: 'online',     currency: null, is_active: true, allows_income: true,  allows_expense: false, book: 'operational', sort_order: 20, icon: '🛒' },
  { id: 'ch-4', name_ar: 'إعلانات', kind: 'recurring',  currency: null, is_active: true, allows_income: false, allows_expense: true,  book: 'operational', sort_order: 34, icon: '📢' },
];

function _getMock() {
  return { entries: _mockEntries, categories: _mockCategories };
}

// ── Service functions ──────────────────────────────────────────────────────

export async function fetchEntries(filters = {}) {
  if (USE_MOCK) {
    let list = [..._getMock().entries];
    if (filters.type)       list = list.filter(e => e.entry_type === filters.type);
    if (filters.category)   list = list.filter(e => e.category === filters.category);
    if (filters.from)       list = list.filter(e => e.entry_date >= filters.from);
    if (filters.to)         list = list.filter(e => e.entry_date <= filters.to);
    if (filters.employeeId) list = list.filter(e => e.employee_id === filters.employeeId);
    list.sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date));
    return list;
  }
  const { supabase } = await import('@services/supabase');
  let q = supabase.from('accounting_entries').select('*').order('entry_date', { ascending: false });
  if (filters.type)       q = q.eq('entry_type', filters.type);
  if (filters.from)       q = q.gte('entry_date', filters.from);
  if (filters.to)         q = q.lte('entry_date', filters.to);
  if (filters.employeeId) q = q.eq('employee_id', filters.employeeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

export async function createEntry(data) {
  if (USE_MOCK) {
    const entry = { id: `ac-${Date.now()}`, ...data, created_at: new Date().toISOString() };
    _mockEntries.unshift(entry);
    return entry;
  }
  const { supabase } = await import('@services/supabase');
  const { data: row, error } = await supabase.from('accounting_entries').insert(data).select().single();
  if (error) throw new Error(error.message);
  return row;
}

/**
 * تحويل بساقين بين كتابين (تشغيلي ↔ مركزي) — تسليم/توريد الرصيد.
 * يُدخل قيدين مرتبطين بـ transfer_group واحد بنداء insert واحد:
 *   • الساق المغادِرة: book=fromBook · category=TRANSFER_OUT (يُنقص رصيد المُسلِّم)
 *   • الساق الواصلة:  book=toBook   · category=TRANSFER_IN  (يزيد رصيد المُستلِم)
 * كلاهما entry_type='transfer' → يُستثنيان من الربح/الخسارة، والمجموع = صفر للشركة.
 */
export async function createTransfer({ amount, currency, wallet, fromBook, toBook, date, note, createdBy }) {
  const amt = Number(amount) || 0;
  if (amt <= 0) throw new Error('أدخل مبلغاً صحيحاً');
  // اختياري: تمرير محفظة محدّدة (بنك/شام/كاش) — تُشتقّ منها العملة وطريقة الدفع.
  const w = wallet ? WALLETS.find(x => x.id === wallet) : null;
  const cur   = w ? w.currency : currency;
  const field = w ? w.amtField : (cur === 'TRY' ? 'amount_try' : cur === 'SYP' ? 'amount_syp' : 'amount_usd');
  const pm    = w ? w.id       : (cur === 'TRY' ? 'cash_try'   : cur === 'SYP' ? 'cash_syp'   : 'cash_usd');
  const group = globalThis.crypto?.randomUUID?.() || `trf-${Date.now()}-${Math.round(amt)}`;
  const fromOp = fromBook === BOOK.OPERATIONAL;
  const amounts = {
    amount_usd: field === 'amount_usd' ? amt : 0,
    amount_try: field === 'amount_try' ? amt : 0,
    amount_syp: field === 'amount_syp' ? amt : 0,
  };
  const leg = (book, category, description) => ({
    entry_type: ENTRY_TYPE.TRANSFER, book, category, description, ...amounts,
    payment_method: pm, entry_date: date, notes: note || null,
    transfer_group: group, created_by: createdBy ?? null,
  });
  const legOut = leg(fromBook, TRANSFER_OUT, fromOp ? 'تحويل: تسليم الرصيد إلى الإدارة المالية' : 'تحويل: توريد إلى الحساب التشغيلي');
  const legIn  = leg(toBook,   TRANSFER_IN,  fromOp ? 'تحويل: توريد من الحساب التشغيلي' : 'تحويل: استلام من الإدارة المالية');

  if (USE_MOCK) {
    const rows = [legOut, legIn].map((l, i) => ({ id: `ac-${Date.now()}-${i}`, ...l, created_at: new Date().toISOString() }));
    _mockEntries.unshift(...rows);
    return rows;
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('accounting_entries').insert([legOut, legIn]).select();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateEntry(id, data) {
  if (USE_MOCK) {
    _mockEntries = _mockEntries.map(e => e.id === id ? { ...e, ...data } : e);
    return _mockEntries.find(e => e.id === id);
  }
  const { supabase } = await import('@services/supabase');
  const { data: row, error } = await supabase.from('accounting_entries').update(data).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return row;
}

export async function deleteEntry(id) {
  if (USE_MOCK) {
    _mockEntries = _mockEntries.filter(e => e.id !== id);
    return;
  }
  const { supabase } = await import('@services/supabase');
  const { error } = await supabase.from('accounting_entries').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchCategories(type = null) {
  if (USE_MOCK) {
    let cats = [..._getMock().categories];
    if (type) cats = cats.filter(c => c.entry_type === type);
    return cats;
  }
  const { supabase } = await import('@services/supabase');
  let q = supabase.from('accounting_categories').select('*').order('name');
  if (type) q = q.eq('entry_type', type);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

export async function createCategory(data) {
  if (USE_MOCK) {
    const cat = { id: `cat-${Date.now()}`, ...data };
    _mockCategories.push(cat);
    return cat;
  }
  const { supabase } = await import('@services/supabase');
  const { data: row, error } = await supabase.from('accounting_categories').insert(data).select().single();
  if (error) throw new Error(error.message);
  return row;
}

// ── Channels (القنوات/المصادر: شركات الشحن، موزّعين، أونلاين، بنود متكررة) ──────

export async function fetchChannels() {
  if (USE_MOCK) return [..._mockChannels].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('accounting_channels').select('*').order('sort_order');
  if (error) throw new Error(error.message);
  return data;
}

export async function createChannel(data) {
  if (USE_MOCK) {
    const ch = { id: `ch-${Date.now()}`, is_active: true, allows_income: true, allows_expense: true, book: 'operational', sort_order: 100, ...data };
    _mockChannels.push(ch);
    return ch;
  }
  const { supabase } = await import('@services/supabase');
  const { data: row, error } = await supabase.from('accounting_channels').insert(data).select().single();
  if (error) throw new Error(error.message);
  return row;
}

export async function updateChannel(id, data) {
  if (USE_MOCK) {
    _mockChannels = _mockChannels.map(c => (c.id === id ? { ...c, ...data } : c));
    return _mockChannels.find(c => c.id === id);
  }
  const { supabase } = await import('@services/supabase');
  const { data: row, error } = await supabase.from('accounting_channels').update(data).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return row;
}

export async function deleteChannel(id) {
  if (USE_MOCK) { _mockChannels = _mockChannels.filter(c => c.id !== id); return; }
  const { supabase } = await import('@services/supabase');
  const { error } = await supabase.from('accounting_channels').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Exchange rates (للإجمالي الموحّد بالدولار في تقرير القنوات) ─────────────────
export async function fetchExchangeRates() {
  if (USE_MOCK) return [
    { from_currency: 'USD', to_currency: 'TRY', rate: 32.5,  effective_date: '2026-05-01' },
    { from_currency: 'USD', to_currency: 'SYP', rate: 13000, effective_date: '2026-05-01' },
  ];
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('exchange_rates').select('*').order('effective_date', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}
