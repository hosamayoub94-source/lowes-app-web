// =============================================================
// Single Supabase client instance.
// .env.local must define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
// =============================================================
import { createClient } from '@supabase/supabase-js';

// Publishable key — safe to ship in the browser (the new replacement for the
// legacy anon key, which is being revoked because it leaked). We prefer an env
// value ONLY if it's already a publishable key; otherwise we use the publishable
// key directly so the client never depends on the (leaked) legacy anon JWT.
const PUBLISHABLE_KEY = 'sb_publishable_iYn5Rc00ZmdLPUBH5_09fg_eLiok3UO';
const url = import.meta.env.VITE_SUPABASE_URL || 'https://fghdumrgimoeqsafdhhh.supabase.co';
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const anonKey = (typeof envKey === 'string' && envKey.startsWith('sb_publishable_')) ? envKey : PUBLISHABLE_KEY;

if (!url || !anonKey) {
  // Don't crash the app — surface a clear console error so the dev sees it.
  // Services will fail with a useful error message when called.
   
  console.error(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local and fill in the values.',
  );
}

export const supabase = createClient(url || 'http://localhost', anonKey || 'anon', {
  auth: { persistSession: true, autoRefreshToken: true },
});

// Session-less client — always uses the anon/publishable key, never attaches
// a user JWT. Required for tables where the `authenticated` RLS policy is more
// restrictive than `anon` (e.g. orders table restricted to own rows). Use this
// client for SELECT-only queries where all users should see all rows.
export const supabaseAnon = createClient(url || 'http://localhost', anonKey || 'anon', {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Storage bucket helper — matches legacy upload path.
export const AVATAR_BUCKET = 'avatars';
