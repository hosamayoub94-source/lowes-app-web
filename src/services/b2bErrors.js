// تصنيف أخطاء ليدز B2B + timeout — منطق نقي (بلا React/Supabase) كي لا تبقى الشاشة على «جاري التحميل…» أبداً.
// كل خطأ يصير { kind, status, message(للمستخدم), hint, retryable } — لا نصوص تقنية للمستخدم.
// ما يُسجَّل بالـconsole: النوع + رمز الحالة + اسم الإجراء فقط (لا توكن، لا بيانات اتصال، لا نص رد الخادم).

export const LOAD_TIMEOUT_MS = 20000;

export const ERROR_KINDS = ['session', 'forbidden', 'not_deployed', 'migration', 'network', 'timeout', 'server'];

const COPY = {
  session:      { message: 'انتهت جلستك أو لم تعد صالحة.', hint: 'سجّل خروج ثم ادخل من جديد.', retryable: false },
  forbidden:    { message: 'ما عندك صلاحية لهذا القسم.', hint: 'اطلب الصلاحية من الأدمن (إدارة المستخدمين).', retryable: false },
  not_deployed: { message: 'خدمة ليدز الدول غير منشورة بعد.', hint: 'أبلغ الأدمن — لا شيء تفعله من جهتك.', retryable: true },
  migration:    { message: 'قاعدة البيانات تحتاج تحديثاً قبل فتح هذا القسم.', hint: 'أبلغ الأدمن — التحديث لم يُطبَّق بعد.', retryable: true },
  network:      { message: 'تعذّر الاتصال بالخادم.', hint: 'تأكد من الإنترنت ثم أعد المحاولة.', retryable: true },
  timeout:      { message: 'استغرق التحميل وقتاً أطول من المعتاد وتوقف.', hint: 'أعد المحاولة، وإن تكرر أبلغ الأدمن.', retryable: true },
  server:       { message: 'حدث خطأ غير متوقع أثناء التحميل.', hint: 'أعد المحاولة، وإن تكرر أبلغ الأدمن.', retryable: true },
};

export class B2bError extends Error {
  constructor(kind, { status = null, action = null, detail = null, message = null } = {}) {
    super(message || COPY[kind]?.message || COPY.server.message);
    this.name = 'B2bError';
    this.kind = ERROR_KINDS.includes(kind) ? kind : 'server';
    this.status = status;
    this.action = action;
    this.detail = detail; // short server code only (e.g. 'duplicate'), never a stack/body
    this.hint = COPY[this.kind].hint;
    this.retryable = COPY[this.kind].retryable;
  }
}

/**
 * Map what we know about a failed call to a kind.
 * { status, code, timeout, network }  — status = HTTP status of the Edge Function / PostgREST reply (if any),
 * code = the server's short `error` code ('migration_required'…), timeout/network = client-side flags.
 */
export function classifyB2bFailure({ status = null, code = null, timeout = false, network = false } = {}) {
  if (timeout) return 'timeout';
  if (code === 'migration_required') return 'migration';
  if (status === 401 || code === 'authenticated user session required') return 'session';
  if (status === 403) return 'forbidden';
  if (status === 404 && !code) return 'not_deployed';
  if (status === 409 && code === 'migration_required') return 'migration';
  if (network || (status == null && !code)) return 'network';
  return 'server';
}

/** Any thrown value -> B2bError (idempotent). PostgREST/Supabase errors carry `.status` / `.code` / `.message`. */
export function toB2bError(e, action = null) {
  if (e instanceof B2bError) return e;
  const status = typeof e?.status === 'number' ? e.status : (typeof e?.context?.status === 'number' ? e.context.status : null);
  const msg = String(e?.message || '');
  const jwt = /jwt (expired|invalid)|invalid jwt|not authenticated/i.test(msg) || e?.code === 'PGRST301';
  const kind = jwt ? 'session'
    : classifyB2bFailure({ status, code: typeof e?.code === 'string' && /^[a-z_ ]+$/i.test(e.code) ? e.code : null, network: /failed to (send|fetch)|network|fetch/i.test(msg) });
  return new B2bError(kind, { status, action });
}

/** Rejects with a timeout B2bError after `ms` — the UI can never wait forever. The underlying request is not cancelled. */
export function withTimeout(promise, ms = LOAD_TIMEOUT_MS, action = null) {
  let t;
  const timer = new Promise((_, rej) => { t = setTimeout(() => rej(new B2bError('timeout', { action })), ms); });
  return Promise.race([promise, timer]).finally(() => clearTimeout(t));
}

/** Safe console diagnostics: kind/status/action only. */
export function logB2bError(err, action = null, sink = console) {
  try { sink.warn('[b2b-leads]', { kind: err?.kind || 'server', status: err?.status ?? null, action: action || err?.action || null }); } catch { /* console unavailable */ }
}

/** What the screen shows: error panel copy for a B2bError (or null). */
export function errorPanelCopy(err) {
  if (!err) return null;
  const e = err instanceof B2bError ? err : toB2bError(err);
  return { kind: e.kind, message: e.message, hint: e.hint, retryable: e.retryable };
}
