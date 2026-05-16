// =============================================================
// deploymentReadiness — Full pre-deployment validation report
//
// Aggregates: env checks, feature flags, health checks, build
// integrity, and produces a go/no-go deployment decision.
//
// Run before deployment or expose in the ops dashboard.
// =============================================================
import { createLogger }          from '@/core/production/productionLogger';
import { validateEnvironment, pingSupabase, validateFeatureFlags } from './envValidation';
import { runAllHealthChecks }    from '../health/healthChecks';

const log = createLogger('DeploymentReadiness');

// ── Build integrity checks (static, no async) ──────────────────
function checkBuildIntegrity() {
  const issues = [];

  // Check if lazy imports have proper chunk names (we check by convention)
  // In practice this is a static analysis — we flag known risky patterns
  const env = import.meta.env;

  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    issues.push({ level: 'error', check: 'build_env', message: 'Critical env vars missing in build' });
  }

  // Detect if running in production with dev-only settings
  if (env.PROD) {
    if (env.VITE_SHOW_INSPECTOR === 'true') {
      issues.push({ level: 'warn', check: 'inspector_in_prod', message: 'Dev inspector enabled in production build' });
    }
    if (env.VITE_LOG_LEVEL === 'debug') {
      issues.push({ level: 'warn', check: 'debug_log_prod', message: 'Debug log level in production build' });
    }
  }

  return {
    check:   'Build Integrity',
    status:  issues.some((i) => i.level === 'error') ? 'fail'
           : issues.some((i) => i.level === 'warn')  ? 'warn'
           : 'pass',
    issues,
  };
}

// ── Mobile responsiveness check (heuristic) ───────────────────
function checkMobileReadiness() {
  // Check if viewport meta is present
  const viewportMeta = document.querySelector('meta[name="viewport"]');
  const hasViewport  = !!viewportMeta;
  const content      = viewportMeta?.getAttribute('content') ?? '';
  const isCorrect    = content.includes('width=device-width');

  return {
    check:   'Mobile Readiness',
    status:  isCorrect ? 'pass' : hasViewport ? 'warn' : 'fail',
    message: isCorrect ? 'Viewport meta correct'
           : hasViewport ? 'Viewport meta present but may be misconfigured'
           : 'Missing viewport meta — mobile layout may break',
    detail:  { hasViewport, content },
  };
}

// ── Network connectivity ───────────────────────────────────────
function checkNetworkConnectivity() {
  const online = navigator.onLine;
  return {
    check:   'Network',
    status:  online ? 'pass' : 'warn',
    message: online ? 'Network online' : 'Device offline — deployment check limited',
  };
}

// ── Master readiness report ────────────────────────────────────
/**
 * Run full deployment readiness check.
 * @param {SupabaseClient|null} supabaseClient
 * @returns {Promise<ReadinessReport>}
 */
export async function runDeploymentReadiness(supabaseClient = null) {
  log.info('Running deployment readiness check...');
  const start = Date.now();

  // 1. Environment validation
  const envResult    = validateEnvironment();
  const flagResult   = validateFeatureFlags();
  const buildResult  = checkBuildIntegrity();
  const mobileResult = checkMobileReadiness();
  const networkCheck = checkNetworkConnectivity();

  // 2. Supabase ping (async)
  const supabasePing = await pingSupabase(4_000);

  // 3. System health checks (async)
  const { results: healthResults, summary: healthSummary } = await runAllHealthChecks(supabaseClient);

  // ── Compile report ─────────────────────────────────────────
  const sections = [
    {
      section: 'Environment',
      status:  envResult.valid ? 'pass' : 'fail',
      items:   [
        ...envResult.errors.map((e) => ({ ...e, status: 'fail' })),
        ...envResult.warns.map((w) => ({ ...w, status: 'warn' })),
        ...envResult.info.map((i)  => ({ ...i, status: i.status === 'ok' ? 'pass' : 'warn', message: `${i.label}: ${i.value}` })),
      ],
    },
    {
      section: 'Feature Flags',
      status:  flagResult.valid ? 'pass' : 'warn',
      items:   flagResult.issues.map((i) => ({ ...i, status: i.level })),
    },
    {
      section: 'Build Integrity',
      status:  buildResult.status,
      items:   buildResult.issues.map((i) => ({ ...i, status: i.level })),
    },
    {
      section: 'Supabase Connectivity',
      status:  supabasePing.reachable ? 'pass' : 'fail',
      items:   [{ message: supabasePing.message, status: supabasePing.reachable ? 'pass' : 'fail', detail: supabasePing }],
    },
    {
      section: 'Mobile Readiness',
      status:  mobileResult.status,
      items:   [mobileResult],
    },
    {
      section: 'System Health',
      status:  healthSummary.overall,
      items:   healthResults.map((r) => ({ message: `${r.name}: ${r.message}`, status: r.status, detail: r.detail })),
    },
  ];

  const criticalFailures = sections.filter((s) => s.status === 'fail');
  const warnings         = sections.filter((s) => s.status === 'warn');

  const overall = criticalFailures.length > 0 ? 'NOT_READY'
                : warnings.length > 2          ? 'CAUTION'
                : 'READY';

  const report = {
    overall,
    ready:          overall === 'READY',
    sections,
    criticalCount:  criticalFailures.length,
    warnCount:      warnings.length,
    durationMs:     Date.now() - start,
    timestamp:      Date.now(),
    environment:    envResult.mode,
    recommendation: overall === 'READY'
      ? '✅ النظام جاهز للنشر'
      : overall === 'CAUTION'
      ? '⚠️ يمكن النشر مع مراجعة التحذيرات'
      : '❌ النظام غير جاهز — يجب إصلاح الأخطاء الحرجة أولاً',
  };

  log.info(`Deployment readiness: ${overall} (${report.durationMs}ms)`);
  return report;
}
