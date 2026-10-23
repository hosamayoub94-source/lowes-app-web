// Payroll RPC errors → Arabic, user-facing. Pure so it can be tested in Node.
// Messages raised by our own RPCs (RAISE EXCEPTION) are already Arabic and pass through;
// Postgres/PostgREST/network errors are English and must never reach the user raw.
export function arabicPayrollRpcError(error) {
  const msg = String(error?.message || error || '');
  const code = String(error?.code || '');
  if (/[؀-ۿ]/.test(msg)) return msg;
  if (code === '42501' || /permission denied|row-level security|not authorized|insufficient_privilege/i.test(msg)) {
    return 'ليس لديك صلاحية تنفيذ هذه العملية على الرواتب (تحتاج صلاحية الرواتب من الإدارة).';
  }
  if (code === 'PGRST202' || /could not find the function|schema cache/i.test(msg)) {
    return 'دالة الرواتب غير متوفرة على الخادم — أبلغ الدعم الفني ولا تكرر المحاولة.';
  }
  if (/jwt|token|session/i.test(msg)) return 'انتهت الجلسة — سجّل الدخول من جديد ثم أعد المحاولة.';
  if (/fetch|network|timeout|failed to/i.test(msg)) return 'تعذّر الاتصال بالخادم — تأكد من الإنترنت ثم أعد المحاولة. لم يتغيّر شيء.';
  return 'فشلت العملية ولم يتغيّر شيء. (' + msg + ')';
}
