// =============================================================
// envValidation — Environment variable detection + validation
//
// Detects missing/malformed environment variables, validates
// Supabase configuration, checks feature flag consistency,
// and produces a structured readiness report.
// =============================================================
import { createLogger } from '@/core/production/productionLogger';
import { getConfig }     from '@/core/production/productionConfig';

const log = createLogger('EnvValidation');

// ── Required env vars ──────────────────────────────────────────
const REQUIRED_VARS = [
  { key: 'VITE_SUPABASE_URL',      format: /^https:\/\/.+\.supabase\.co$/, label: 'Supabase URL' },
  { key: 'VITE_SUPABASE_ANON_KEY', format: /^eyJ/,                         label: 'Supabase Anon Key' },
];

const OPTIONAL_VARS = [
  { key: 'VITE_USE_MOCK_ATTENDANCE',   label: 'Mock attendance mode' },
  { key: 'VITE_USE_MOCK_TASKS',        label: 'Mock tasks mode' },
  { key: 'VITE_USE_MOCK_CRM',          label: 'Mock CRM mode' },
  { key: 'VITE_USE_MOCK_REALTIME',     label: 'Mock realtime mode' },
  { key: 'VITE_SAFE_MODE',             label: 'Safe mode' },
  { key: 'VITE_READ_ONLY',             label: 'Read-only mode' },
  { key: 'VITE_SHOW_INSPECTOR',        label: 'Dev inspector visible' },
  { key: 'VITE_LOG_LEVEL',             label: 'Log level override' },
  { key: 'VITE_DISABLE_REALTIME',      label: 'Realtime disabled' },
  { key: 'VITE_DISABLE_OFFLINE',       label: 'Offline recovery disabled' },
];

// ── Validate ───────────────────────────────────────────────────
export function validateEnvironment() {
  const env    = import.meta.env;
  const issues = [];
  const info   = [];

  // Required vars
  for (const { key, format, label } of REQUIRED_VARS) {
    const value = env[key];
    if (!value) {
      issues.push({ level: 'error', key, message: `Missing required env var: ${key} (${label})` });
    } else if (format && !format.test(value)) {
      issues.push({ level: 'error', key, message: `Invalid format for ${key} (${label}): "${value.slice(0, 20)}..."` });
    } else {
      info.push({ key, label, value: value.slice(0, 20) + '...', status: 'ok' });
    }
  }

  // Optional vars — report which are active
  for (const { key, label } of OPTIONAL_VARS) {
    const value = env[key];
    if (value) {
      info.push({ key, label, value, status: 'active' });
      if (value === 'true' && key.startsWith('VITE_USE_MOCK_')) {
        issues.push({ level: 'warn', key, message: `Mock mode active: ${label} — ensure this is intentional in production` });
      }
    }
  }

  // Conflict checks
  if (env.VITE_SAFE_MODE === 'true' && env.VITE_READ_ONLY !== 'true') {
    issues.push({ level: 'warn', key: 'VITE_SAFE_MODE', message: 'Safe mode is on but read-only is not — writes may still occur' });
  }
  if (env.VITE_DISABLE_REALTIME === 'true' && env.VITE_DISABLE_OFFLINE === 'true') {
    issues.push({ level: 'warn', key: 'both_disabled', message: 'Both realtime and offline recovery are disabled — degraded mode' });
  }

  const errors = issues.filter((i) => i.level === 'error');
  const warns  = issues.filter((i) => i.level === 'warn');

  const result = {
    valid:    errors.length === 0,
    errors,
    warns,
    info,
    summary:  errors.length > 0
      ? `❌ ${errors.length} critical env issue(s)`
      : warns.length > 0
      ? `⚠️ ${warns.length} warning(s)`
      : '✅ Environment OK',
    isDev:    env.DEV  === true,
    isProd:   env.PROD === true,
    mode:     env.MODE ?? 'unknown',
  };

  if (errors.length > 0) {
    log.error('Environment validation failed', { errors: errors.map((e) => e.message) });
  } else if (warns.length > 0) {
    log.warn('Environment warnings', { warns: warns.map((w) => w.message) });
  } else {
    log.info('Environment validated OK');
  }

  return result;
}

// ── Supabase reachability ping ─────────────────────────────────
export async function pingSupabase(timeoutMs = 5_000) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) return { reachable: false, message: 'VITE_SUPABASE_URL not set' };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const start    = Date.now();
    const response = await fetch(`${url}/rest/v1/`, {
      method:  'GET',
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '' },
      signal:  controller.signal,
    });
    clearTimeout(timer);

    const latencyMs = Date.now() - start;
    return {
      reachable:  true,
      status:     response.status,
      latencyMs,
      message:    `Supabase reachable (${latencyMs}ms, HTTP ${response.status})`,
    };
  } catch (err) {
    return {
      reachable: false,
      message:   err.name === 'AbortError' ? `Supabase timeout (>${timeoutMs}ms)` : `Supabase unreachable: ${err.message}`,
    };
  }
}

// ── Feature flag consistency check ────────────────────────────
export function validateFeatureFlags() {
  const config  = getConfig();
  const issues  = [];

  // Safety: if prod + dev flags on = problem
  if (config.isProd && config.showInspector) {
    issues.push({ level: 'warn', key: 'showInspector', message: 'Dev inspector is enabled in production' });
  }
  if (config.isProd && config.logLevel === 'debug') {
    issues.push({ level: 'warn', key: 'logLevel', message: 'Debug logging is enabled in production — performance impact' });
  }
  if (!config.enableErrorReporting) {
    issues.push({ level: 'warn', key: 'enableErrorReporting', message: 'Error reporting is disabled' });
  }
  if (!config.enableHealthMonitor) {
    issues.push({ level: 'warn', key: 'enableHealthMonitor', message: 'Health monitor is disabled' });
  }

  log.debug('Feature flag validation', { issues });
  return { issues, valid: issues.filter((i) => i.level === 'error').length === 0 };
}
