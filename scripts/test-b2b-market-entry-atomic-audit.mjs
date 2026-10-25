import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const edge = readFileSync(new URL('../supabase/functions/b2b-leads/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261025160000_b2b_market_entry_atomic_audit.sql', import.meta.url), 'utf8');

const updateStart = edge.indexOf('if (action === "update_market_entry")');
const updateEnd = edge.indexOf('if (action === "update_presence")', updateStart);
assert.ok(updateStart >= 0 && updateEnd > updateStart, 'market-entry update action exists');
const updateAction = edge.slice(updateStart, updateEnd);

assert.ok(updateAction.includes('admin.rpc("b2b_update_market_entry_atomic"'), 'Edge Function calls the atomic RPC');
assert.ok(!updateAction.includes('admin.from("b2b_lead_events").insert'), 'audit events are not inserted separately after update');
assert.ok(updateAction.includes('return json({ ok: true, row: result.row, audit_warning: false })'), 'success response is returned only after RPC success');

assert.ok(migration.includes('for update;'), 'RPC locks the target lead before update');
assert.ok(migration.includes('insert into public.b2b_lead_events'), 'RPC records field-level audit events');
assert.ok(migration.indexOf('insert into public.b2b_lead_events') < migration.indexOf('return jsonb_build_object'), 'RPC only returns after audit inserts');
assert.ok(migration.includes('revoke all on function public.b2b_update_market_entry_atomic(text, text, jsonb, text) from public, anon, authenticated;'), 'RPC is not executable by public/anon/authenticated');
assert.ok(migration.includes('grant execute on function public.b2b_update_market_entry_atomic(text, text, jsonb, text) to service_role;'), 'RPC execution is granted to service_role');
assert.ok(migration.includes("l.first_order_at is null then now()"), 'first-order timestamp is preserved when entering first_order');
assert.ok(migration.trim().endsWith('commit;'), 'migration transaction closes cleanly');

console.log('B2B market-entry atomic audit: 10 contract checks passed');
