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

export default fetchAllRows;
