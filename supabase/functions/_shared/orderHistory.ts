// _shared/orderHistory.ts — تسجيل حالات الطلبات بلا ابتلاع صامت للأخطاء.
// قبل هذا الملف كانت كل الدوال تُنهي الإدراج بـ .then(() => {}, () => {}) فكان قيد
// order_status_history.source يُسقط صفوف karam/babel/ptt/babel_webhook بلا أي أثر (اكتُشف 17 تشرين الأول 2026).
// هنا: (1) نرفض مصدراً غير مشروع قبل الإرسال، (2) نسجّل أي فشل بـconsole.error وبجدول
// order_status_history_failures (للمراجعة)، (3) لا نرمي أبداً — تحديث الطلب نفسه لا يتعطّل.
export const HISTORY_SOURCES = ['app', 'sheet', 'yurtici', 'star', 'babel', 'babel_webhook', 'karam', 'ptt'];

// deno-lint-ignore no-explicit-any
export async function recordStatusHistory(supabase: any, row: Record<string, unknown>, context = ''): Promise<boolean> {
  let error: string | null = null;
  if (!HISTORY_SOURCES.includes(String(row.source ?? ''))) {
    error = `source not allowed: ${String(row.source)}`;
  } else {
    try {
      const res = await supabase.from('order_status_history').insert(row);
      error = res?.error ? String(res.error.message ?? res.error) : null;
    } catch (e) {
      error = String((e as Error)?.message ?? e);
    }
  }
  if (!error) return true;
  console.error(`[order_status_history] insert FAILED (${context}): ${error}`, { order_id: row.order_id, to_status: row.to_status, source: row.source });
  try {
    await supabase.from('order_status_history_failures').insert({
      order_id: row.order_id ?? null, from_status: row.from_status ?? null, to_status: row.to_status ?? null,
      source: row.source ?? null, changed_by: row.changed_by ?? null, error, context,
    });
  } catch (_) { /* التسجيل نفسه best-effort: لا نُسقط مسار تحديث الطلب */ }
  return false;
}
