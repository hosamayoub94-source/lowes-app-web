// =============================================================
// Payroll Service — mock + real branches
// =============================================================

export const USE_MOCK =
  String(import.meta.env.VITE_USE_MOCK_PAYROLL ?? '').toLowerCase() !== 'false';

// ── Mock data ──────────────────────────────────────────────────────────────

let _mockRuns = [
  {
    id: 'run-1',
    period_year: 2026, period_month: 5,
    status: 'approved', currency: 'USD',
    total_net_usd: 4800, employee_count: 6,
    approved_by: null, paid_at: null,
    created_by: 'admin-1', created_at: '2026-05-01T10:00:00Z', updated_at: '2026-05-10T12:00:00Z',
  },
  {
    id: 'run-2',
    period_year: 2026, period_month: 4,
    status: 'paid', currency: 'USD',
    total_net_usd: 4650, employee_count: 6,
    approved_by: 'admin-1', paid_at: '2026-04-30T08:00:00Z',
    created_by: 'admin-1', created_at: '2026-04-01T10:00:00Z', updated_at: '2026-04-30T08:00:00Z',
  },
];

let _mockEntries = [
  {
    id: 'entry-1', run_id: 'run-1', employee_id: 'emp-1',
    employee_name: 'أحمد محمد', role_type: 'sales_manager',
    base_salary_usd: 1200, bonus_usd: 300, deductions_usd: 50,
    advance_deduction_usd: 100, net_salary_usd: 1350,
    absent_days: 1, working_days: 22, salary_type: 'mixed',
    notes: null, created_at: '2026-05-01T10:00:00Z',
  },
  {
    id: 'entry-2', run_id: 'run-1', employee_id: 'emp-2',
    employee_name: 'سارة علي', role_type: 'media_buyer',
    base_salary_usd: 900, bonus_usd: 200, deductions_usd: 0,
    advance_deduction_usd: 0, net_salary_usd: 1100,
    absent_days: 0, working_days: 22, salary_type: 'fixed',
    notes: null, created_at: '2026-05-01T10:00:00Z',
  },
  {
    id: 'entry-3', run_id: 'run-1', employee_id: 'emp-3',
    employee_name: 'محمد خالد', role_type: 'employee',
    base_salary_usd: 700, bonus_usd: 0, deductions_usd: 0,
    advance_deduction_usd: 200, net_salary_usd: 500,
    absent_days: 0, working_days: 22, salary_type: 'fixed',
    notes: 'خصم سلفة', created_at: '2026-05-01T10:00:00Z',
  },
];

let _mockSettings = [
  {
    id: 'ss-1', employee_id: 'emp-1',
    base_salary: 1200, salary_currency: 'USD',
    salary_type: 'mixed', commission_rate: 0.05,
    effective_from: '2026-01-01',
  },
  {
    id: 'ss-2', employee_id: 'emp-2',
    base_salary: 900, salary_currency: 'USD',
    salary_type: 'fixed', commission_rate: null,
    effective_from: '2026-01-01',
  },
];

let _mockExchangeRates = [
  { id: 'er-1', from_currency: 'USD', to_currency: 'TRY', rate: 32.5, effective_date: '2026-05-01' },
  { id: 'er-2', from_currency: 'USD', to_currency: 'SYP', rate: 13000, effective_date: '2026-05-01' },
];

function _getMock() {
  return { runs: _mockRuns, entries: _mockEntries, settings: _mockSettings, rates: _mockExchangeRates };
}

// ── Service functions ──────────────────────────────────────────────────────

// Payroll Runs
export async function fetchPayrollRuns(filters = {}) {
  if (USE_MOCK) {
    let runs = [..._getMock().runs];
    if (filters.year)   runs = runs.filter(r => r.period_year === filters.year);
    if (filters.status) runs = runs.filter(r => r.status === filters.status);
    runs.sort((a, b) => b.period_year - a.period_year || b.period_month - a.period_month);
    return runs;
  }
  const { supabase } = await import('@services/supabase');
  let q = supabase.from('payroll_runs').select('*').order('period_year', { ascending: false }).order('period_month', { ascending: false });
  if (filters.year)   q = q.eq('period_year', filters.year);
  if (filters.status) q = q.eq('status', filters.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchPayrollRun(runId) {
  if (USE_MOCK) {
    return _getMock().runs.find(r => r.id === runId) ?? null;
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('payroll_runs').select('*').eq('id', runId).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createPayrollRun(data) {
  if (USE_MOCK) {
    const run = { id: `run-${Date.now()}`, ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    _mockRuns.unshift(run);
    return run;
  }
  const { supabase } = await import('@services/supabase');
  const { data: row, error } = await supabase.from('payroll_runs').insert(data).select().single();
  if (error) throw new Error(error.message);
  return row;
}

export async function updatePayrollRun(id, data) {
  if (USE_MOCK) {
    _mockRuns = _mockRuns.map(r => r.id === id ? { ...r, ...data, updated_at: new Date().toISOString() } : r);
    return _mockRuns.find(r => r.id === id);
  }
  const { supabase } = await import('@services/supabase');
  const { data: row, error } = await supabase.from('payroll_runs').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return row;
}

export async function deletePayrollRun(id) {
  if (USE_MOCK) {
    _mockRuns = _mockRuns.filter(r => r.id !== id);
    _mockEntries = _mockEntries.filter(e => e.run_id !== id);
    return;
  }
  const { supabase } = await import('@services/supabase');
  const { error } = await supabase.from('payroll_runs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Payroll Entries
export async function fetchPayrollEntries(runId) {
  if (USE_MOCK) {
    return _getMock().entries.filter(e => e.run_id === runId);
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('payroll_entries')
    .select('*, profiles(full_name, role_type)')
    .eq('run_id', runId);
  if (error) throw new Error(error.message);
  return data.map(row => ({
    ...row,
    employee_name: row.profiles?.full_name ?? '',
    role_type: row.profiles?.role_type ?? '',
  }));
}

export async function upsertPayrollEntry(entry) {
  if (USE_MOCK) {
    const idx = _mockEntries.findIndex(e => e.id === entry.id);
    if (idx >= 0) {
      _mockEntries[idx] = { ..._mockEntries[idx], ...entry };
      return _mockEntries[idx];
    }
    const row = { id: `entry-${Date.now()}`, ...entry, created_at: new Date().toISOString() };
    _mockEntries.push(row);
    return row;
  }
  const { supabase } = await import('@services/supabase');
  // Strip join-computed fields — they are not stored columns in payroll_entries
  const { employee_name, role_type, profiles, ...dbEntry } = entry;
  const { data, error } = await supabase.from('payroll_entries').upsert(dbEntry).select().single();
  if (error) throw new Error(error.message);
  // Re-attach display fields so the store/UI keeps the employee name after save
  return { ...data, employee_name: employee_name ?? '', role_type: role_type ?? '' };
}

export async function deletePayrollEntry(id) {
  if (USE_MOCK) {
    _mockEntries = _mockEntries.filter(e => e.id !== id);
    return;
  }
  const { supabase } = await import('@services/supabase');
  const { error } = await supabase.from('payroll_entries').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Salary Settings
export async function fetchSalarySettings(filters = {}) {
  if (USE_MOCK) {
    let s = [..._getMock().settings];
    if (filters.employeeId) s = s.filter(x => x.employee_id === filters.employeeId);
    return s;
  }
  const { supabase } = await import('@services/supabase');
  let q = supabase.from('employee_salary_settings').select('*').order('effective_from', { ascending: false });
  if (filters.employeeId) q = q.eq('employee_id', filters.employeeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertSalarySettings(settings) {
  if (USE_MOCK) {
    const idx = _mockSettings.findIndex(s => s.employee_id === settings.employee_id);
    if (idx >= 0) {
      _mockSettings[idx] = { ..._mockSettings[idx], ...settings };
      return _mockSettings[idx];
    }
    const row = { id: `ss-${Date.now()}`, ...settings };
    _mockSettings.push(row);
    return row;
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('employee_salary_settings').upsert(settings).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// Exchange Rates
export async function fetchExchangeRates() {
  if (USE_MOCK) return [..._getMock().rates];
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('exchange_rates').select('*').order('effective_date', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertExchangeRate(rate) {
  if (USE_MOCK) {
    const idx = _mockExchangeRates.findIndex(r => r.from_currency === rate.from_currency && r.to_currency === rate.to_currency);
    if (idx >= 0) {
      _mockExchangeRates[idx] = { ..._mockExchangeRates[idx], ...rate };
      return _mockExchangeRates[idx];
    }
    const row = { id: `er-${Date.now()}`, ...rate };
    _mockExchangeRates.push(row);
    return row;
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('exchange_rates').upsert(rate).select().single();
  if (error) throw new Error(error.message);
  return data;
}
