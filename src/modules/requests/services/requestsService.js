// =============================================================
// Requests Service — mock + real branches
// =============================================================

export const USE_MOCK =
  String(import.meta.env.VITE_USE_MOCK_REQUESTS ?? '').toLowerCase() !== 'false';

// ── Mock data ──────────────────────────────────────────────────────────────

let _mockRequests = [
  {
    id: 'req-1', employee_id: 'emp-1', employee_name: 'أحمد محمد',
    request_type: 'leave', leave_type: 'annual',
    leave_from: '2026-05-20', leave_to: '2026-05-24', leave_days: 4,
    advance_amount: null, advance_currency: null,
    reason: 'إجازة عائلية', status: 'pending',
    decided_by: null, decision_note: null,
    created_at: '2026-05-15T09:00:00Z', updated_at: '2026-05-15T09:00:00Z',
  },
  {
    id: 'req-2', employee_id: 'emp-2', employee_name: 'سارة علي',
    request_type: 'advance', leave_type: null,
    leave_from: null, leave_to: null, leave_days: null,
    advance_amount: 500, advance_currency: 'USD',
    reason: 'ظروف طارئة', status: 'approved',
    decided_by: 'admin-1', decision_note: 'تمت الموافقة',
    created_at: '2026-05-10T11:00:00Z', updated_at: '2026-05-11T08:00:00Z',
  },
  {
    id: 'req-3', employee_id: 'emp-3', employee_name: 'محمد خالد',
    request_type: 'document', leave_type: null,
    leave_from: null, leave_to: null, leave_days: null,
    advance_amount: null, advance_currency: null,
    reason: 'شهادة راتب للبنك', status: 'pending',
    decided_by: null, decision_note: null,
    created_at: '2026-05-18T14:00:00Z', updated_at: '2026-05-18T14:00:00Z',
  },
];

let _mockLeaveBalances = [
  { id: 'lb-1', employee_id: 'emp-1', year: 2026, annual_days: 21, used_days: 0 },
  { id: 'lb-2', employee_id: 'emp-2', year: 2026, annual_days: 21, used_days: 5 },
];

function _getMock() {
  return { requests: _mockRequests, balances: _mockLeaveBalances };
}

// ── Service functions ──────────────────────────────────────────────────────

export async function fetchRequests(filters = {}) {
  if (USE_MOCK) {
    let list = [..._getMock().requests];
    if (filters.employeeId) list = list.filter(r => r.employee_id === filters.employeeId);
    if (filters.status)     list = list.filter(r => r.status === filters.status);
    if (filters.type)       list = list.filter(r => r.request_type === filters.type);
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  }
  const { supabase } = await import('@services/supabase');
  let q = supabase
    .from('employee_requests')
    .select('*, profiles(employee_name)')
    .order('created_at', { ascending: false });
  if (filters.employeeId) q = q.eq('employee_id', filters.employeeId);
  if (filters.status)     q = q.eq('status', filters.status);
  if (filters.type)       q = q.eq('request_type', filters.type);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data.map(r => ({ ...r, employee_name: r.profiles?.employee_name ?? '' }));
}

export async function fetchRequest(id) {
  if (USE_MOCK) return _getMock().requests.find(r => r.id === id) ?? null;
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('employee_requests')
    .select('*, profiles(employee_name)')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return { ...data, employee_name: data.profiles?.employee_name ?? '' };
}

export async function createRequest(data) {
  if (USE_MOCK) {
    const req = {
      id: `req-${Date.now()}`,
      ...data,
      status: 'pending',
      decided_by: null,
      decision_note: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    _mockRequests.unshift(req);
    return req;
  }
  const { supabase } = await import('@services/supabase');
  const { data: row, error } = await supabase.from('employee_requests').insert(data).select().single();
  if (error) throw new Error(error.message);
  return row;
}

export async function decideRequest(id, { status, decisionNote, decidedBy }) {
  if (USE_MOCK) {
    _mockRequests = _mockRequests.map(r =>
      r.id === id
        ? { ...r, status, decision_note: decisionNote ?? null, decided_by: decidedBy, updated_at: new Date().toISOString() }
        : r
    );
    return _mockRequests.find(r => r.id === id);
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('employee_requests')
    .update({ status, decision_note: decisionNote, decided_by: decidedBy, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function cancelRequest(id, employeeId) {
  if (USE_MOCK) {
    _mockRequests = _mockRequests.map(r =>
      r.id === id && r.employee_id === employeeId
        ? { ...r, status: 'cancelled', updated_at: new Date().toISOString() }
        : r
    );
    return _mockRequests.find(r => r.id === id);
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('employee_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('employee_id', employeeId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Leave Balances
export async function fetchLeaveBalance(employeeId, year) {
  if (USE_MOCK) {
    return _getMock().balances.find(b => b.employee_id === employeeId && b.year === year) ?? null;
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('leave_balances')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('year', year)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchAllLeaveBalances(year) {
  if (USE_MOCK) {
    return _getMock().balances.filter(b => b.year === year);
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('leave_balances')
    .select('*, profiles(employee_name)')
    .eq('year', year);
  if (error) throw new Error(error.message);
  return data.map(b => ({ ...b, employee_name: b.profiles?.employee_name ?? '' }));
}
