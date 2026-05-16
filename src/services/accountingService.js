// =============================================================
// Accounting / finance ledger. Mirrors `finance_ledger`.
// =============================================================
import { supabase } from './supabase';

const TABLE = 'finance_ledger';

export async function listEntries({ month, type, archived = false } = {}) {
  let q = supabase
    .from(TABLE)
    .select('*')
    .eq('is_archived', archived)
    .order('date', { ascending: false });
  if (month) q = q.like('date', `${month}%`);
  if (type) q = q.eq('type', type);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function addEntry(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteEntry(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function archiveEntry(id) {
  const { error } = await supabase.from(TABLE).update({ is_archived: true }).eq('id', id);
  if (error) throw error;
}

/** Aggregate totals per currency for a month. */
export async function monthSummary(month) {
  const rows = await listEntries({ month });
  const totals = {
    income: { USD: 0, SYP: 0, TRY: 0 },
    expense: { USD: 0, SYP: 0, TRY: 0 },
  };
  for (const r of rows) {
    const bucket = r.type === 'income' ? totals.income : totals.expense;
    bucket.USD += Number(r.amount_usd || 0);
    bucket.SYP += Number(r.amount_syp || 0);
    bucket.TRY += Number(r.amount_try || 0);
  }
  return totals;
}
