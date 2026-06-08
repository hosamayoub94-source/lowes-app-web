// =============================================================
// Distribution Service — المناطق + الأمانة + التحصيل + المخالفات.
// =============================================================
import { supabase } from '@services/supabase';

// ── المناطق (territories) ──
export async function listTerritories() {
  const { data, error } = await supabase
    .from('territories').select('*').order('created_at', { ascending: false });
  if (error) { console.warn('territories:', error.message); return []; }
  return data || [];
}
export async function createTerritory(payload) {
  const { error } = await supabase.from('territories').insert(payload);
  return !error;
}
export async function setTerritoryStatus(id, status) {
  const { error } = await supabase.from('territories').update({ status }).eq('id', id);
  return !error;
}

export const TERRITORY_STATUS = {
  survey: 'مسح', pilot: 'تجريبي', active: 'مفعّل', paused: 'متوقّف',
};

// ── الأمانة (consignments) ──
export const CONSIGN_TRIAL_QTY = 3;
export const CONSIGN_APPROVED_QTY = 10;

export async function listConsignments(sellerId = null) {
  let q = supabase.from('consignments').select('*').order('placed_at', { ascending: false });
  if (sellerId) q = q.eq('seller_id', sellerId);
  const { data, error } = await q;
  if (error) { console.warn('consignments:', error.message); return []; }
  return data || [];
}
export async function createConsignment(payload) {
  // المعتمد: استحقاق التسوية بعد 90 يوماً.
  const settle_due = payload.tier === 'approved'
    ? new Date(Date.now() + 90 * 864e5).toISOString() : null;
  const { error } = await supabase.from('consignments').insert({ ...payload, settle_due });
  return !error;
}
export async function settleConsignment(id, qtySold) {
  const { error } = await supabase.from('consignments')
    .update({ qty_sold: qtySold, status: 'settled', settled_at: new Date().toISOString() })
    .eq('id', id);
  return !error;
}

// ── التحصيل (overdue) ──
export async function getOverdueOrders(all = false) {
  const { data, error } = await supabase.rpc('overdue_orders', { p_all: all });
  if (error) { console.warn('overdue:', error.message); return []; }
  return data || [];
}

// ── المخالفات ──
export async function logViolation(payload) {
  const { error } = await supabase.from('price_violations').insert(payload);
  return !error;
}
export async function listViolations() {
  const { data, error } = await supabase
    .from('price_violations').select('*').order('created_at', { ascending: false });
  if (error) { console.warn('violations:', error.message); return []; }
  return data || [];
}
