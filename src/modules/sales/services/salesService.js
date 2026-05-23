// =============================================================
// Sales Service — mock + real branches
// =============================================================

export const USE_MOCK =
  String(import.meta.env.VITE_USE_MOCK_SALES ?? '').toLowerCase() !== 'false';

// ── Mock data ──────────────────────────────────────────────────────────────

let _mockReports = [
  {
    id: 'sr-1',
    report_date: '2026-05-19',
    total_orders: 87,
    total_sales_usd: 4320,
    total_ad_spend_usd: 980,
    roas: 4.41,
    status: 'approved',
    notes: 'يوم ممتاز',
    created_by: 'admin-1',
    created_at: '2026-05-19T20:00:00Z',
  },
  {
    id: 'sr-2',
    report_date: '2026-05-18',
    total_orders: 62,
    total_sales_usd: 3100,
    total_ad_spend_usd: 850,
    roas: 3.65,
    status: 'submitted',
    notes: null,
    created_by: 'emp-1',
    created_at: '2026-05-18T20:00:00Z',
  },
];

let _mockChannelResults = [
  { id: 'cr-1', report_id: 'sr-1', channel_id: 'ch-1', channel_name: 'موقع إلكتروني', orders: 40, sales_usd: 2200 },
  { id: 'cr-2', report_id: 'sr-1', channel_id: 'ch-2', channel_name: 'إنستاغرام',     orders: 30, sales_usd: 1400 },
  { id: 'cr-3', report_id: 'sr-1', channel_id: 'ch-3', channel_name: 'متجر',           orders: 17, sales_usd:  720 },
];

let _mockAdResults = [
  {
    id: 'ar-1', report_id: 'sr-1', campaign_id: 'camp-1', campaign_name: 'حملة مايو',
    platform: 'meta', ad_spend_usd: 600, impressions: 85000, clicks: 2200, orders: 45, revenue_usd: 2700,
    roas: 4.5, cpa: 13.3,
  },
  {
    id: 'ar-2', report_id: 'sr-1', campaign_id: 'camp-2', campaign_name: 'تيك توك ربيع',
    platform: 'tiktok', ad_spend_usd: 380, impressions: 50000, clicks: 1400, orders: 25, revenue_usd: 1500,
    roas: 3.95, cpa: 15.2,
  },
];

let _mockChannels = [
  { id: 'ch-1', name: 'موقع إلكتروني', channel_type: 'website', is_active: true },
  { id: 'ch-2', name: 'إنستاغرام',     channel_type: 'instagram', is_active: true },
  { id: 'ch-3', name: 'متجر',           channel_type: 'store', is_active: true },
  { id: 'ch-4', name: 'واتساب',         channel_type: 'whatsapp', is_active: true },
];

let _mockCampaigns = [
  { id: 'camp-1', name: 'حملة مايو',     platform: 'meta',   budget_usd: 1000, is_active: true },
  { id: 'camp-2', name: 'تيك توك ربيع', platform: 'tiktok', budget_usd: 500,  is_active: true },
];

function _getMock() {
  return { reports: _mockReports, channelResults: _mockChannelResults, adResults: _mockAdResults, channels: _mockChannels, campaigns: _mockCampaigns };
}

// ── Service ────────────────────────────────────────────────────────────────

export async function fetchReports(filters = {}) {
  if (USE_MOCK) {
    let list = [..._getMock().reports];
    if (filters.from)   list = list.filter(r => r.report_date >= filters.from);
    if (filters.to)     list = list.filter(r => r.report_date <= filters.to);
    if (filters.status) list = list.filter(r => r.status === filters.status);
    list.sort((a, b) => new Date(b.report_date) - new Date(a.report_date));
    return list;
  }
  const { supabase } = await import('@services/supabase');
  let q = supabase.from('daily_sales_reports').select('*').order('report_date', { ascending: false });
  if (filters.from)   q = q.gte('report_date', filters.from);
  if (filters.to)     q = q.lte('report_date', filters.to);
  if (filters.status) q = q.eq('status', filters.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchReport(id) {
  if (USE_MOCK) return _getMock().reports.find(r => r.id === id) ?? null;
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('daily_sales_reports').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createReport(data) {
  if (USE_MOCK) {
    const report = { id: `sr-${Date.now()}`, ...data, created_at: new Date().toISOString() };
    _mockReports.unshift(report);
    return report;
  }
  const { supabase } = await import('@services/supabase');
  const { data: row, error } = await supabase.from('daily_sales_reports').insert(data).select().single();
  if (error) throw new Error(error.message);
  return row;
}

export async function updateReport(id, data) {
  if (USE_MOCK) {
    _mockReports = _mockReports.map(r => r.id === id ? { ...r, ...data } : r);
    return _mockReports.find(r => r.id === id);
  }
  const { supabase } = await import('@services/supabase');
  const { data: row, error } = await supabase.from('daily_sales_reports').update(data).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return row;
}

export async function deleteReport(id) {
  if (USE_MOCK) {
    _mockReports = _mockReports.filter(r => r.id !== id);
    return;
  }
  const { supabase } = await import('@services/supabase');
  const { error } = await supabase.from('daily_sales_reports').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Channel / Ad results
export async function fetchChannelResults(reportId) {
  if (USE_MOCK) return _getMock().channelResults.filter(c => c.report_id === reportId);
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('daily_sales_channel_results')
    .select('*, sales_channels(name)')
    .eq('report_id', reportId);
  if (error) throw new Error(error.message);
  return data.map(r => ({
    ...r,
    channel_name: r.channel_name ?? r.sales_channels?.name ?? '',
  }));
}

export async function fetchAdResults(reportId) {
  if (USE_MOCK) return _getMock().adResults.filter(a => a.report_id === reportId);
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('daily_sales_ad_results')
    .select('*')
    .eq('report_id', reportId);
  if (error) throw new Error(error.message);
  return data;
}

// Channels & Campaigns
export async function fetchChannels() {
  if (USE_MOCK) return [..._getMock().channels];
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('sales_channels').select('*').eq('is_active', true);
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchCampaigns() {
  if (USE_MOCK) return [..._getMock().campaigns];
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.from('campaigns').select('*').eq('is_active', true);
  if (error) throw new Error(error.message);
  return data;
}

export async function createAdResult(data) {
  if (USE_MOCK) {
    const row = { id: `ar-${Date.now()}`, ...data };
    _mockAdResults.push(row);
    return row;
  }
  const { supabase } = await import('@services/supabase');
  const { data: row, error } = await supabase
    .from('daily_sales_ad_results')
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return row;
}

export async function createChannelResult(data) {
  if (USE_MOCK) {
    const row = { id: `cr-${Date.now()}`, ...data };
    _mockChannelResults.push(row);
    return row;
  }
  const { supabase } = await import('@services/supabase');
  const { data: row, error } = await supabase
    .from('daily_sales_channel_results')
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return row;
}
