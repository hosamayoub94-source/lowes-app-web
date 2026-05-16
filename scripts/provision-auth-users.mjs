#!/usr/bin/env node
/* =============================================================
 * Provision Supabase Auth users from existing profiles.
 *
 * For every active profile this script:
 *   - Creates an auth.users row with id == profile.id
 *   - Sets email to `${profile.id}@auth.lowes-pro.local`
 *   - Sets password to "lp:" + profile.pin  (≥ 6 chars to satisfy
 *     Supabase's password policy)
 *   - Marks email_confirmed = true so signIn works immediately
 *
 * Idempotent: re-runs skip profiles that already have an auth row.
 *
 * Required env (read from .env.local OR shell):
 *   VITE_SUPABASE_URL          — your project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — server-side key (NEVER ship to client)
 *
 * Run:
 *   node scripts/provision-auth-users.mjs
 *   node scripts/provision-auth-users.mjs --dry-run
 *   node scripts/provision-auth-users.mjs --reset-password
 *     ↑ overwrites passwords for users that already exist (use when
 *       a PIN was changed via the legacy admin tool and you need
 *       auth.users to catch up)
 * ============================================================= */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// -------------------------------------------------------------
// Tiny .env.local loader — keeps this script dep-free.
// -------------------------------------------------------------
const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, '..', '.env.local');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const ln of lines) {
    const m = ln.match(/^([A-Z0-9_]+)=(.*)$/i);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const DRY = process.argv.includes('--dry-run');
const RESET_PASSWORD = process.argv.includes('--reset-password');

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const synthEmail   = (id) => `${id}@auth.lowes-pro.local`;
const derivePass   = (pin) => `lp:${String(pin).trim()}`;

async function main() {
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, employee_name, pin, role_type, team, is_active')
    .eq('is_active', true);
  if (error) throw error;

  console.log(`Found ${profiles.length} active profiles.`);
  let created = 0, skipped = 0, updated = 0, failed = 0;

  for (const p of profiles) {
    if (!p.pin || String(p.pin).trim().length < 4) {
      console.warn(`  ⚠ skip ${p.employee_name} (${p.id}) — missing/short PIN`);
      failed += 1;
      continue;
    }

    const email = synthEmail(p.id);
    const password = derivePass(p.pin);

    // Does an auth user with this id already exist?
    const { data: existing } = await admin.auth.admin.getUserById(p.id);
    if (existing?.user) {
      if (RESET_PASSWORD) {
        if (DRY) {
          console.log(`  ↻ would reset password: ${p.employee_name} (${p.id})`);
        } else {
          const { error: upErr } = await admin.auth.admin.updateUserById(p.id, { password });
          if (upErr) { console.error(`  ✗ reset failed for ${p.employee_name}: ${upErr.message}`); failed += 1; continue; }
          console.log(`  ↻ password reset: ${p.employee_name}`);
          updated += 1;
        }
      } else {
        skipped += 1;
      }
      continue;
    }

    if (DRY) {
      console.log(`  + would create auth user for ${p.employee_name} (${p.id})`);
      continue;
    }

    const { error: createErr } = await admin.auth.admin.createUser({
      id: p.id,
      email,
      password,
      email_confirm: true,
      user_metadata: { name: p.employee_name, role_type: p.role_type, team: p.team },
    });
    if (createErr) {
      console.error(`  ✗ create failed for ${p.employee_name}: ${createErr.message}`);
      failed += 1;
      continue;
    }
    console.log(`  + created: ${p.employee_name}`);
    created += 1;
  }

  console.log('\n— summary —');
  console.log(`  created: ${created}`);
  console.log(`  updated: ${updated}`);
  console.log(`  skipped: ${skipped}`);
  console.log(`  failed:  ${failed}`);
  if (DRY) console.log('  (dry run — no changes written)');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
