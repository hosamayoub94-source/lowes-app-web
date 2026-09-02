// =============================================================
// Payroll ↔ Archive Bridge
//
// Spec §18: deliveries/returns for a month must move to the archive
// ONLY after that month's payroll run is approved & closed — never
// before, and never silently on "a new month starts". This mirrors
// OrdersScreen's existing manual "🗄️ أرشفة شهر سابق" logic exactly
// (same TERMINAL_SYNC statuses, same archived flag, same month match
// on updated_at||order_date) so behaviour stays identical — it is
// just triggered automatically by payroll approval instead of only
// by a manual click. The manual button in OrdersScreen is left as-is
// (older months, or a manager catching up manually) — nothing there
// is removed or disabled.
// =============================================================

import { supabaseAnon } from '@services/supabase';
import { fetchAllRows } from '@utils/fetchAllRows';
import { batchUpdateByIds } from '@utils/batchUpdate';

// Same set OrdersScreen uses to decide an order is "settled" enough to archive.
const TERMINAL_SYNC = ['delivered', 'settled', 'returned'];

/**
 * Archive every order for (year, month) that is delivered/settled/returned
 * and not already archived. Idempotent — safe to call more than once
 * (e.g. if approval is retried).
 *
 * @returns {Promise<{count:number}>}
 */
export async function archivePayrollPeriod(year, month) {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const orders = await fetchAllRows(() => supabaseAnon
    .from('orders')
    .select('id, updated_at, order_date, status, archived')
    .in('status', TERMINAL_SYNC)
    .or('archived.is.null,archived.eq.false'));

  const eligible = (orders || []).filter(o =>
    String(o.updated_at || o.order_date || '').slice(0, 7) === monthKey);
  if (eligible.length === 0) return { count: 0 };

  const ids = eligible.map(o => o.id);
  await batchUpdateByIds(supabaseAnon, 'orders', ids, { archived: true });
  return { count: ids.length };
}
