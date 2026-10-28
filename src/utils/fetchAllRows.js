// =============================================================
// fetchAllRows — جلب كل الصفوف على دفعات (يتجاوز سقف PostgREST 1000 صف).
//
// Supabase/PostgREST يحدّ كل استجابة بـ1000 صف افتراضياً ويبترها صامتاً
// (بلا خطأ) حتى لو مررت .limit() أكبر. أي استعلام قد يرجّع >1000 صف يجب
// أن يمرّ عبر هذا الـ helper وإلا تُبتر البيانات (رواتب/محاسبة/تقارير ناقصة).
//
// buildQuery: دالة تُعيد استعلام Supabase جديداً في كل نداء (استعلامات
// Supabase thenable ولمرة واحدة، فلا يصحّ إعادة استخدام نفس الكائن).
//
// مثال:
//   const rows = await fetchAllRows(() =>
//     supabase.from('orders').select('*').eq('status','delivered'));
// =============================================================
export async function fetchAllRows(buildQuery, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}

/**
 * نسخة متوازية: تجلب الصفحات على دفعات من `concurrency` طلباً معاً بدل واحدة تلو الأخرى (نفس النتيجة بنفس الترتيب).
 * لاستعلامات خفيفة ومرتّبة بمفتاح ثابت (.order('id')) — تتوقف عند أول صفحة ناقصة/فارغة. الدفعة الأخيرة قد تحوي صفحات فارغة (طلبات زائدة محدودة).
 * لا تُستخدم مع دوال ثقيلة (RPC) كي لا تتزاحم على مهلة قاعدة البيانات.
 */
export async function fetchAllRowsConcurrent(buildQuery, { pageSize = 1000, concurrency = 4 } = {}) {
  const out = [];
  for (let wave = 0; ; wave += concurrency) {
    const pages = await Promise.all(Array.from({ length: concurrency }, (_, i) => buildQuery().range((wave + i) * pageSize, (wave + i + 1) * pageSize - 1)));
    for (const { data, error } of pages) {
      if (error) throw error;
      if (!data?.length) return out;
      out.push(...data);
      if (data.length < pageSize) return out;
    }
  }
}

export default fetchAllRows;
