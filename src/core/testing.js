// =============================================================
// Core Testing — environment validation & QA utilities.
// =============================================================

const REQUIRED_VARS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

export function validateEnvironment() {
  const missing = REQUIRED_VARS.filter((k) => !import.meta.env[k]);
  if (missing.length) {
    console.warn(
      '[core/testing] Missing environment variables:',
      missing.join(', '),
      '— copy .env.example to .env.local and fill in the values.',
    );
  } else {
    console.info('[core/testing] Environment OK');
  }
}

export default { validateEnvironment };
