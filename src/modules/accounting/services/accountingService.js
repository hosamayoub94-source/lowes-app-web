// =============================================================
// Accounting Service — mock + real branches
// =============================================================

export const USE_MOCK =
  String(import.meta.env.VITE_USE_MOCK_ACCOUNTING ?? '').toLowerCase() !== 'false';

// ── Mock data ──────────────────────────────────────────────────────────────

let _mockEntries = [
  {
    id: 'ac-1', entry_type: 'income', category: 'مبيعات أونلاين',
    description: 'مبيعات موقع إلكتروني - مايو',
    employee_id: null, employee_name: null,
    amount_usd: 3200, amount_try: 0, amount_syp: 0,
    payment_method: 'bank', entry_date: '2026-05-15',
    advance_status: null, created_by: 'admin-1',
    created_at: '2026-05-15T10:00:00Z',
  },
  {
    id: 'ac-2', entry_type: 'expense', category: 'إعلانات ميتا',
    description: 'حملة إعلانية مايو',
    employee_id: null, employee_name: null,
    amount_usd: 800, amount_try: 0, amount_syp: 0,
    payment_method: 'card', entry_date: '2026-05-10',
    advance_status: null, created_by: 'admin-1',
    created_at: '2026-05-10T09:00:00Z',
  },
  {
    id: 'ac-3', entry_type: 'advance', category: 'سلفة راتب',
    description: 'سلفة راتب - سارة علي',
    employee_id: 'emp-2', employee_name: 'سارة علي',
    amount_usd: 500, amount_try: 0, amount_syp: 0,
    payment_method: 'cash', entry_date: '2026-05-12',
    advance_status: 'approved', created_by: 'admin-1',
    created_at: '2026-05-12T11:00:00Z',
  },
  {
    id: 'ac-4', entry_type: 'expense', category: 'إيجار مكتب',
    description: 'إيجار مكتب إسطنبول - مايو',
    employee_id: null, employee_name: null,
    amount_usd: 1200, amount_try: 0, amount_syp: 0,
    payment_method: 'bank', entry_date: '2026-05-01',
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
