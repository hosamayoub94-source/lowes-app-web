// =============================================================
// Single Supabase client instance.
// .env.local must define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
// =============================================================
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Don't crash the app — surface a clear console error so the dev sees it.
  // Services will fail with a useful error message when called.
  // eslint-disable-next-line no-console
  console.error(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local and fill in the values.',
  );
}

export const supabase = createClient(url || 'http://localhost', anonKey || 'anon', {
  auth: { persistSession: true, autoRefreshToken: true },
});

// Storage bucket helper — matches legacy upload path.
export const AVATAR_BUCKET = 'avatars';
