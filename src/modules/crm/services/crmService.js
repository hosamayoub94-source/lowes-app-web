// =============================================================
// CRM Module — CRM Service
//
// Unified data layer for all CRM operations.
// Mock mode: in-memory state seeded from MOCK_* constants.
// Real mode: Supabase queries via lazy import.
//
// Functions:
//   Pipelines:  fetchPipelines, fetchStages
//   Leads:      fetchLeads, createLead, updateLead, deleteLead, convertLeadToCustomer
//   Deals:      fetchDeals, createDeal, updateDealStage, updateDeal, deleteDeal
//   Customers:  fetchCustomers, createCustomer, updateCustomer
//   Contacts:   fetchContacts, createContact, deleteContact
//   Activities: fetchActivities, addActivity
//   Followups:  fetchFollowups, scheduleFollowup, completeFollowup, cancelFollowup
//   Notes:      fetchNotes, addNote, deleteNote
//   Agents:     assignSalesAgent
//   Search:     searchCRM
// =============================================================
export const USE_MOCK = String(import.meta.env.VITE_USE_MOCK_CRM ?? '').toLowerCase() !== 'false';

import {
  DEFAULT_STAGES,
  MOCK_PIPELINE,
  MOCK_STAGES,
  MOCK_CUSTOMERS,
  MOCK_LEADS,
  MOCK_DEALS,
  MOCK_FOLLOWUPS,
  MOCK_ACTIVITIES,
  LEAD_STATUS,
  DEAL_STATUS,
  FOLLOWUP_STATUS,
  ACTIVITY_TYPE,
  CUSTOMER_STATUS,
} from '../types/crm.types';

// ── DB missing flag (set when 42P01 error detected) ──────────
export let CRM_DB_MISSING = false;
function _handleNotFound(error, fallback = []) {
  if (error?.code === '42P01' || error?.message?.includes('42P01')) {
    CRM_DB_MISSING = true;
    return fallback;
  }
  throw error;
}

// ── In-memory mock store ──────────────────────────────────────
let _mockData = null;

function _getMock() {
  if (!_mockData) {
    _mockData = {
      pipelines:  [MOCK_PIPELINE],
      stages:     [...MOCK_STAGES],
      customers:  [...MOCK_CUSTOMERS],
      leads:      [...MOCK_LEADS],
      deals:      [...MOCK_DEALS],
      followups:  [...MOCK_FOLLOWUPS],
      activities: [...MOCK_ACTIVITIES],
      notes:      [],
      contacts:   [],
    };
  }
  return _mockData;
}

function _uuid() {
  return `mock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Pipelines ─────────────────────────────────────────────────

export async function fetchPipelines() {
  if (USE_MOCK) return _getMock().pipelines;
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('pipelines')
    .select('*')
    .eq('is_active', true)
    .order('created_at');
  if (error) return _handleNotFound(error, [MOCK_PIPELINE]);
  // If no pipelines configured yet, return default
  if (!data?.length) return [MOCK_PIPELINE];
  return data;
}

export async function fetchStages(pipelineId) {
  if (USE_MOCK) return _getMock().stages.filter((s) => s.pipeline_id === pipelineId);
  if (CRM_DB_MISSING) return DEFAULT_STAGES.map((s, i) => ({ id: `ds${i}`, pipeline_id: pipelineId, ...s }));
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('pipeline_id', pipelineId)
    .order('position');
  if (error) return _handleNotFound(error, DEFAULT_STAGES.map((s, i) => ({ id: `ds${i}`, pipeline_id: pipelineId, ...s })));
  // If no stages configured, return defaults
  if (!data?.length) return DEFAULT_STAGES.map((s, i) => ({ id: `ds${i}`, pipeline_id: pipelineId, ...s }));
  return data;
}

// ── Leads ─────────────────────────────────────────────────────

export async function fetchLeads(filters = {}) {
  if (USE_MOCK) {
    let list = _getMock().leads;
    if (filters.status)  list = list.filter((l) => l.status === filters.status);
    if (filters.assigned_to) list = list.filter((l) => l.assigned_to === filters.assigned_to);
    if (filters.search)  {
      const q = filters.search.toLowerCase();
      list = list.filter((l) => l.title.toLowerCase().includes(q) || (l.company_name ?? '').toLowerCase().includes(q));
    }
    return list;
  }
  const { supabase } = await import('@services/supabase');
  let q = supabase.from('leads').select('*').order('created_at', { ascending: false });
  if (filters.status)      q = q.eq('status', filters.status);
  if (filters.assigned_to) q = q.eq('assigned_to', filters.assigned_to);
  if (filters.search)      q = q.ilike('title', `%${filters.search}%`);
  const { data, error } = await q;
  if (error) return _handleNotFound(error, []);
  return data ?? [];
}

export async function createLead(payload) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const lead = { id: _uuid(), status: LEAD_STATUS.NEW, score: 0, created_at: now, updated_at: now, ...payload };
    _getMock().leads.unshift(lead);
    return lead;
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('leads').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateLead(leadId, changes) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const idx = _getMock().leads.findIndex((l) => l.id === leadId);
    if (idx < 0) throw new Error('Lead not found');
    _getMock().leads[idx] = { ..._getMock().leads[idx], ...changes, updated_at: now };
    return _getMock().leads[idx];
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('leads').update({ ...changes, updated_at: now }).eq('id', leadId).select().single();
  if (error) throw error;
  return data;
}

export async function deleteLead(leadId) {
  if (USE_MOCK) {
    _getMock().leads = _getMock().leads.filter((l) => l.id !== leadId);
    return true;
  }
  const { supabase } = await import('@services/supabase');
  const { error } = await supabase.from('leads').delete().eq('id', leadId);
  if (error) throw error;
  return true;
}

/**
 * Convert a qualified lead into a customer and a deal.
 * Returns { customer, deal }
 */
export async function convertLeadToCustomer(leadId, { pipelineId, stageId, dealTitle, dealValue } = {}) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const lead = _getMock().leads.find((l) => l.id === leadId);
    if (!lead) throw new Error('Lead not found');

    const customer = {
      id:           _uuid(),
      company_name: lead.company_name ?? lead.title,
      status:       CUSTOMER_STATUS.ACTIVE,
      total_deals:  1,
      total_revenue:lead.estimated_value ?? 0,
      assigned_to:  lead.assigned_to,
      owner_id:     lead.owner_id,
      created_at:   now,
      updated_at:   now,
    };
    _getMock().customers.unshift(customer);

    const stages    = _getMock().stages;
    const firstStage = stages.find((s) => s.position === 1) ?? stages[0];
    const deal = {
      id:          _uuid(),
      title:       dealTitle ?? lead.title,
      pipeline_id: pipelineId ?? _getMock().pipelines[0]?.id,
      stage_id:    stageId ?? firstStage?.id,
      customer_id: customer.id,
      lead_id:     leadId,
      value:       dealValue ?? lead.estimated_value ?? 0,
      currency:    'SAR',
      status:      DEAL_STATUS.OPEN,
      probability: firstStage?.probability ?? 25,
      assigned_to: lead.assigned_to,
      owner_id:    lead.owner_id,
      created_at:  now,
      updated_at:  now,
    };
    _getMock().deals.unshift(deal);

    // Update lead status
    const leadIdx = _getMock().leads.findIndex((l) => l.id === leadId);
    if (leadIdx >= 0) {
      _getMock().leads[leadIdx] = {
        ..._getMock().leads[leadIdx],
        status:       LEAD_STATUS.CONVERTED,
        customer_id:  customer.id,
        converted_at: now,
        updated_at:   now,
      };
    }
    return { customer, deal };
  }

  // Real: use a Supabase RPC or multi-step transaction
  const { supabase } = await import('@services/supabase');
  const lead = await supabase.from('leads').select('*').eq('id', leadId).single().then(r => r.data);

  const { data: customer, error: ce } = await supabase.from('customers')
    .insert({ company_name: lead.company_name ?? lead.title, assigned_to: lead.assigned_to, owner_id: lead.owner_id })
    .select().single();
  if (ce) throw ce;

  const { data: deal, error: de } = await supabase.from('deals')
    .insert({ title: dealTitle ?? lead.title, pipeline_id: pipelineId, stage_id: stageId, customer_id: customer.id, lead_id: leadId, value: dealValue ?? lead.estimated_value, assigned_to: lead.assigned_to })
    .select().single();
  if (de) throw de;

  await supabase.from('leads').update({ status: LEAD_STATUS.CONVERTED, customer_id: customer.id, converted_at: now }).eq('id', leadId);

  return { customer, deal };
}

// ── Deals ─────────────────────────────────────────────────────

export async function fetchDeals(filters = {}) {
  if (USE_MOCK) {
    let list = _getMock().deals;
    if (filters.pipeline_id) list = list.filter((d) => d.pipeline_id === filters.pipeline_id);
    if (filters.stage_id)    list = list.filter((d) => d.stage_id === filters.stage_id);
    if (filters.status)      list = list.filter((d) => d.status === filters.status);
    if (filters.assigned_to) list = list.filter((d) => d.assigned_to === filters.assigned_to);
    if (filters.customer_id) list = list.filter((d) => d.customer_id === filters.customer_id);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter((d) => d.title.toLowerCase().includes(q));
    }
    return list;
  }
  const { supabase } = await import('@services/supabase');
  let q = supabase.from('deals').select(`
    *, pipeline_stages(name, color, slug, is_won, is_lost),
    customers(company_name)
  `).order('updated_at', { ascending: false });
  if (filters.pipeline_id) q = q.eq('pipeline_id', filters.pipeline_id);
  if (filters.stage_id)    q = q.eq('stage_id', filters.stage_id);
  if (filters.status)      q = q.eq('status', filters.status);
  if (filters.assigned_to) q = q.eq('assigned_to', filters.assigned_to);
  const { data, error } = await q;
  if (error) return _handleNotFound(error, []);
  return data ?? [];
}

export async function createDeal(payload) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const stage = _getMock().stages.find((s) => s.id === payload.stage_id);
    const deal  = {
      id:          _uuid(),
      status:      DEAL_STATUS.OPEN,
      probability: stage?.probability ?? 10,
      currency:    'SAR',
      created_at:  now,
      updated_at:  now,
      ...payload,
    };
    _getMock().deals.unshift(deal);
    return deal;
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('deals').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateDealStage(dealId, stageId, { userId, note } = {}) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const idx = _getMock().deals.findIndex((d) => d.id === dealId);
    if (idx < 0) throw new Error('Deal not found');
    const oldStageId = _getMock().deals[idx].stage_id;
    const newStage   = _getMock().stages.find((s) => s.id === stageId);
    _getMock().deals[idx] = {
      ..._getMock().deals[idx],
      stage_id:    stageId,
      probability: newStage?.probability ?? _getMock().deals[idx].probability,
      status:      newStage?.is_won ? DEAL_STATUS.WON : newStage?.is_lost ? DEAL_STATUS.LOST : DEAL_STATUS.OPEN,
      closed_at:   (newStage?.is_won || newStage?.is_lost) ? now : null,
      updated_at:  now,
    };
    // Log activity
    if (userId) {
      const oldStage = _getMock().stages.find((s) => s.id === oldStageId);
      _getMock().activities.unshift({
        id:            _uuid(),
        deal_id:       dealId,
        user_id:       userId,
        activity_type: ACTIVITY_TYPE.STAGE_CHANGE,
        title:         `تحرك الصفقة إلى: ${newStage?.name ?? stageId}`,
        description:   `من: ${oldStage?.name ?? oldStageId} → ${newStage?.name ?? stageId}${note ? ` — ${note}` : ''}`,
        created_at:    now,
      });
    }
    return _getMock().deals[idx];
  }
  const { supabase } = await import('@services/supabase');
  const stage = await supabase.from('pipeline_stages').select('*').eq('id', stageId).single().then(r => r.data);
  const changes = {
    stage_id:   stageId,
    probability: stage?.probability,
    status:     stage?.is_won ? DEAL_STATUS.WON : stage?.is_lost ? DEAL_STATUS.LOST : DEAL_STATUS.OPEN,
    closed_at:  (stage?.is_won || stage?.is_lost) ? now : null,
    updated_at: now,
  };
  const { data, error } = await supabase.from('deals').update(changes).eq('id', dealId).select().single();
  if (error) throw error;
  if (userId) {
    await supabase.from('deal_activities').insert({
      deal_id: dealId, user_id: userId,
      activity_type: ACTIVITY_TYPE.STAGE_CHANGE,
      title: `تحرك الصفقة إلى: ${stage?.name ?? stageId}`,
      description: note ?? '',
    });
  }
  return data;
}

export async function updateDeal(dealId, changes) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const idx = _getMock().deals.findIndex((d) => d.id === dealId);
    if (idx < 0) throw new Error('Deal not found');
    _getMock().deals[idx] = { ..._getMock().deals[idx], ...changes, updated_at: now };
    return _getMock().deals[idx];
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('deals').update({ ...changes, updated_at: now }).eq('id', dealId).select().single();
  if (error) throw error;
  return data;
}

export async function deleteDeal(dealId) {
  if (USE_MOCK) {
    _getMock().deals = _getMock().deals.filter((d) => d.id !== dealId);
    return true;
  }
  const { supabase } = await import('@services/supabase');
  const { error } = await supabase.from('deals').delete().eq('id', dealId);
  if (error) throw error;
  return true;
}

// ── Customers ─────────────────────────────────────────────────

export async function fetchCustomers(filters = {}) {
  if (USE_MOCK) {
    let list = _getMock().customers;
    if (filters.status)  list = list.filter((c) => c.status === filters.status);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter((c) => c.company_name.toLowerCase().includes(q));
    }
    return list;
  }
  const { supabase } = await import('@services/supabase');
  let q = supabase.from('customers').select('*').order('company_name');
  if (filters.status) q = q.eq('status', filters.status);
  const { data, error } = await q;
  if (error) return _handleNotFound(error, []);
  return data ?? [];
}

export async function createCustomer(payload) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const cust = { id: _uuid(), status: CUSTOMER_STATUS.ACTIVE, total_deals: 0, total_revenue: 0, created_at: now, updated_at: now, ...payload };
    _getMock().customers.unshift(cust);
    return cust;
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('customers').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateCustomer(customerId, changes) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const idx = _getMock().customers.findIndex((c) => c.id === customerId);
    if (idx < 0) throw new Error('Customer not found');
    _getMock().customers[idx] = { ..._getMock().customers[idx], ...changes, updated_at: now };
    return _getMock().customers[idx];
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('customers').update({ ...changes, updated_at: now }).eq('id', customerId).select().single();
  if (error) throw error;
  return data;
}

// ── Assign sales agent ────────────────────────────────────────

export async function assignSalesAgent(entityType, entityId, agentId) {
  // entityType: 'lead' | 'deal' | 'customer'
  if (USE_MOCK) {
    const table  = entityType === 'lead' ? 'leads' : entityType === 'deal' ? 'deals' : 'customers';
    const arr    = _getMock()[table];
    const idx    = arr.findIndex((x) => x.id === entityId);
    if (idx < 0) throw new Error(`${entityType} not found`);
    arr[idx] = { ...arr[idx], assigned_to: agentId, updated_at: new Date().toISOString() };
    return arr[idx];
  }
  const { supabase } = await import('@services/supabase');
  const table = entityType === 'lead' ? 'leads' : entityType === 'deal' ? 'deals' : 'customers';
  const { data, error } = await supabase.from(table)
    .update({ assigned_to: agentId, updated_at: new Date().toISOString() })
    .eq('id', entityId).select().single();
  if (error) throw error;
  return data;
}

// ── Activities ────────────────────────────────────────────────

export async function fetchActivities(filters = {}) {
  if (USE_MOCK) {
    let list = _getMock().activities;
    if (filters.deal_id)     list = list.filter((a) => a.deal_id === filters.deal_id);
    if (filters.customer_id) list = list.filter((a) => a.customer_id === filters.customer_id);
    return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const { supabase } = await import('@services/supabase');
  let q = supabase.from('deal_activities').select('*').order('created_at', { ascending: false }).limit(50);
  if (filters.deal_id)     q = q.eq('deal_id', filters.deal_id);
  if (filters.customer_id) q = q.eq('customer_id', filters.customer_id);
  const { data, error } = await q;
  if (error) return _handleNotFound(error, []);
  return data ?? [];
}

export async function addActivity(payload) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const act = { id: _uuid(), created_at: now, ...payload };
    _getMock().activities.unshift(act);
    return act;
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('deal_activities').insert(payload).select().single();
  if (error) throw error;
  return data;
}

// ── Followups ─────────────────────────────────────────────────

export async function fetchFollowups(filters = {}) {
  if (USE_MOCK) {
    let list = _getMock().followups;
    if (filters.assigned_to) list = list.filter((f) => f.assigned_to === filters.assigned_to);
    if (filters.deal_id)     list = list.filter((f) => f.deal_id === filters.deal_id);
    if (filters.status)      list = list.filter((f) => f.status === filters.status);
    // Auto-mark overdue
    const now = new Date();
    list = list.map((f) =>
      f.status === FOLLOWUP_STATUS.PENDING && new Date(f.due_at) < now
        ? { ...f, status: FOLLOWUP_STATUS.OVERDUE }
        : f,
    );
    return list.sort((a, b) => a.due_at.localeCompare(b.due_at));
  }
  const { supabase } = await import('@services/supabase');
  let q = supabase.from('followups').select('*').order('due_at');
  if (filters.assigned_to) q = q.eq('assigned_to', filters.assigned_to);
  if (filters.deal_id)     q = q.eq('deal_id', filters.deal_id);
  if (filters.status)      q = q.eq('status', filters.status);
  const { data, error } = await q;
  if (error) return _handleNotFound(error, []);
  return data ?? [];
}

export async function scheduleFollowup(payload) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const fu = { id: _uuid(), status: FOLLOWUP_STATUS.PENDING, reminder_sent: false, created_at: now, updated_at: now, ...payload };
    _getMock().followups.push(fu);
    return fu;
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('followups').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function completeFollowup(followupId) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const idx = _getMock().followups.findIndex((f) => f.id === followupId);
    if (idx < 0) throw new Error('Followup not found');
    _getMock().followups[idx] = { ..._getMock().followups[idx], status: FOLLOWUP_STATUS.DONE, completed_at: now, updated_at: now };
    return _getMock().followups[idx];
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('followups')
    .update({ status: FOLLOWUP_STATUS.DONE, completed_at: now, updated_at: now })
    .eq('id', followupId).select().single();
  if (error) throw error;
  return data;
}

export async function cancelFollowup(followupId) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const idx = _getMock().followups.findIndex((f) => f.id === followupId);
    if (idx < 0) throw new Error('Followup not found');
    _getMock().followups[idx] = { ..._getMock().followups[idx], status: FOLLOWUP_STATUS.CANCELLED, updated_at: now };
    return _getMock().followups[idx];
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('followups')
    .update({ status: FOLLOWUP_STATUS.CANCELLED, updated_at: now })
    .eq('id', followupId).select().single();
  if (error) throw error;
  return data;
}

// ── Notes ─────────────────────────────────────────────────────

export async function fetchNotes(filters = {}) {
  if (USE_MOCK) {
    let list = _getMock().notes;
    if (filters.deal_id)     list = list.filter((n) => n.deal_id === filters.deal_id);
    if (filters.customer_id) list = list.filter((n) => n.customer_id === filters.customer_id);
    return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const { supabase } = await import('@services/supabase');
  let q = supabase.from('sales_notes').select('*').order('created_at', { ascending: false });
  if (filters.deal_id)     q = q.eq('deal_id', filters.deal_id);
  if (filters.customer_id) q = q.eq('customer_id', filters.customer_id);
  const { data, error } = await q;
  if (error) return _handleNotFound(error, []);
  return data ?? [];
}

export async function addNote(payload) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const note = { id: _uuid(), is_pinned: false, created_at: now, updated_at: now, ...payload };
    _getMock().notes.unshift(note);
    return note;
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('sales_notes').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteNote(noteId) {
  if (USE_MOCK) {
    _getMock().notes = _getMock().notes.filter((n) => n.id !== noteId);
    return true;
  }
  const { supabase } = await import('@services/supabase');
  const { error } = await supabase.from('sales_notes').delete().eq('id', noteId);
  if (error) throw error;
  return true;
}

// ── Search ────────────────────────────────────────────────────

export async function searchCRM(query) {
  if (!query?.trim()) return { leads: [], deals: [], customers: [] };
  const q = query.toLowerCase();

  if (USE_MOCK) {
    const leads     = _getMock().leads.filter((l) =>
      l.title.toLowerCase().includes(q) || (l.company_name ?? '').toLowerCase().includes(q) || (l.contact_name ?? '').toLowerCase().includes(q));
    const deals     = _getMock().deals.filter((d) =>
      d.title.toLowerCase().includes(q));
    const customers = _getMock().customers.filter((c) =>
      c.company_name.toLowerCase().includes(q) || (c.city ?? '').toLowerCase().includes(q));
    return { leads: leads.slice(0,5), deals: deals.slice(0,5), customers: customers.slice(0,5) };
  }

  const { supabase } = await import('@services/supabase');
  const [lRes, dRes, cRes] = await Promise.all([
    supabase.from('leads').select('id,title,company_name,status').ilike('title', `%${query}%`).limit(5),
    supabase.from('deals').select('id,title,value,status').ilike('title', `%${query}%`).limit(5),
    supabase.from('customers').select('id,company_name,status').ilike('company_name', `%${query}%`).limit(5),
  ]);

  return {
    leads:     lRes.data ?? [],
    deals:     dRes.data ?? [],
    customers: cRes.data ?? [],
  };
}

// ── Contacts ──────────────────────────────────────────────────

export async function fetchContacts(customerId) {
  if (USE_MOCK) return _getMock().contacts.filter((c) => c.customer_id === customerId);
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('customer_contacts')
    .select('*').eq('customer_id', customerId).order('is_primary', { ascending: false });
  if (error) return _handleNotFound(error, []);
  return data ?? [];
}

export async function createContact(payload) {
  const now = new Date().toISOString();
  if (USE_MOCK) {
    const c = { id: _uuid(), is_primary: false, created_at: now, ...payload };
    _getMock().contacts.push(c);
    return c;
  }
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('customer_contacts').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteContact(contactId) {
  if (USE_MOCK) {
    _getMock().contacts = _getMock().contacts.filter((c) => c.id !== contactId);
    return true;
  }
  const { supabase } = await import('@services/supabase');
  const { error } = await supabase.from('customer_contacts').delete().eq('id', contactId);
  if (error) throw error;
  return true;
}
