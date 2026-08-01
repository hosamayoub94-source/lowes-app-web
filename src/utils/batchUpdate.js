// =============================================================
// batchUpdateByIds — تحديث دفعة كبيرة من الصفوف حسب id على دفعات صغيرة.
//
// .update(...).in('id', ids) يبني رابط طلب فيه كل الـids نصاً واحداً
// (id=in.(uuid1,uuid2,...)). مع مئات المعرّفات (مثال: أرشفة شهر كامل
// من الطلبات) يتجاوز طول الرابط حد PostgREST/الاستضافة فيرجع 400 Bad
// Request بلا تفاصيل. الحل: تقسيم الـids لدفعات صغيرة وإرسال كل دفعة
// بطلب منفصل.
//
// مثال:
//   await batchUpdateByIds(supabaseAnon, 'orders', ids, { archived: true });
// =============================================================
export async function batchUpdateByIds(client, table, ids, patch, batchSize = 150) {
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const { error } = await client.from(table).update(patch).in('id', batch);
    if (error) throw error;
  }
}

export default batchUpdateByIds;
