// =============================================================
// sheet-order-statuses -- read-only order statuses for the Google Apps Script guard (29 Oct 2026). No imports: the
// service-role client and the token check are injected so test-sheet-order-statuses.mjs runs every branch in Node.
//
// Why it exists: yurtici-public-tracker.gs asks the app for each open order's current status BEFORE pushing a Yurtici status, and
// skips orders the team already marked returning/returned/not_received/cancelled/settled (stops a courier status from
// overwriting a team decision). It read public.orders with the anon key; since the 28 Oct anon lockdown that read is 401/404 and the
// guard is silently OFF ("GUARD DISABLED" in the script log). Re-opening orders to anon is not an option, so the script now asks
// this function with the same sheet token it already uses for sheet-to-app (the only gate; verify_jwt is off because Apps Script
// cannot send a JWT).
//
// Contract: POST { token, market?: 'turkey'|'syria'|'uae' (default turkey) }
//   -> 200 { ok:true, market, count, rows:[{ order_id, status }] }
//   403 { ok:false, error:'invalid token' } · 400 bad market/json · 500 server_error
//   * ONLY order_id and status are returned (no names, phones, addresses, amounts).
//   * same row set the script used to ask for: that market, not archived (null or false), not soft-deleted.
//   * read-only: nothing here writes.
// =============================================================

export const MARKETS = ['turkey', 'syria', 'uae'];
const PAGE = 1000;       // PostgREST returns at most 1000 rows per request
const MAX_PAGES = 10;    // 10,000 open orders ceiling; beyond that we fail loudly instead of returning a partial guard list

export interface Deps {
  // deno-lint-ignore no-explicit-any
  admin: any;                                  // service-role client
  tokenOk: (given: unknown) => boolean;        // constant-time check against the configured sheet tokens
  log?: (msg: string) => void;
}

const res = (status: number, body: Record<string, unknown>) => ({ status, body });

export async function handleOrderStatuses(deps: Deps, body: Record<string, unknown> | null) {
  if (!body || typeof body !== 'object') return res(400, { ok: false, error: 'invalid json' });
  if (!deps.tokenOk(body.token)) return res(403, { ok: false, error: 'invalid token' });

  const market = body.market === undefined ? 'turkey' : String(body.market);
  if (!MARKETS.includes(market)) return res(400, { ok: false, error: 'invalid market' });

  const rows: { order_id: string; status: string }[] = [];
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) {
      deps.log?.('too many open orders for one guard response');
      return res(500, { ok: false, error: 'server_error' });   // never hand back a truncated guard list
    }
    const { data, error } = await deps.admin
      .from('orders')
      .select('order_id, status')
      .eq('market', market)
      .is('deleted_at', null)
      .or('archived.is.null,archived.eq.false')
      .order('order_id')
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) {
      deps.log?.(`orders query failed: ${error.code ?? 'unknown'}`);
      return res(500, { ok: false, error: 'server_error' });
    }
    for (const r of data ?? []) {
      if (typeof r.order_id === 'string' && r.order_id.trim() !== '') {
        rows.push({ order_id: r.order_id, status: r.status ?? '' });
      }
    }
    if ((data ?? []).length < PAGE) break;
  }
  return res(200, { ok: true, market, count: rows.length, rows });
}
