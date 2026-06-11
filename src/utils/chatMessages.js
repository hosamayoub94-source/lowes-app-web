// =============================================================
// chatMessages — أدوات نقيّة لإدارة قائمة رسائل المحادثة
// تُستخدم في ChatScreen لدمج التحديثات (شبكة الأمان عند رجوع
// التبويب) دون مَحْو الرسائل الأقدم المُحمّلة بالـpagination.
// =============================================================

/**
 * يدمج دفعة `fresh` (أحدث رسائل من الخادم) داخل `prev` (المصفوفة الحالية
 * — قد تحتوي تاريخاً مُرحّلاً فوق آخر 200) دون فقدان أي رسالة.
 * - يُطابق بالـid؛ نسخة `fresh` تفوز (تلتقط التعديل/الحذف).
 * - يُبقي الترتيب تصاعدياً بـ created_at (ثم id كسرٌ للتعادل).
 * - دالة نقيّة: لا تُعدّل المدخلات.
 *
 * @param {Array<{id:any,created_at?:string}>} prev
 * @param {Array<{id:any,created_at?:string}>} fresh
 * @returns {Array} مصفوفة مدموجة مرتّبة
 */
export function mergeMessagesById(prev = [], fresh = []) {
  const byId = new Map();
  for (const m of prev) if (m && m.id != null) byId.set(m.id, m);
  for (const m of fresh) if (m && m.id != null) byId.set(m.id, m); // fresh يفوز
  return [...byId.values()].sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    if (ta !== tb) return ta - tb;
    // كسر التعادل بثبات حتى لا يهتزّ الترتيب عند تساوي الطابع الزمني
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  });
}

/**
 * هل غيّرت `fresh` شيئاً فعلياً مقارنةً بـ`prev`؟ (رسالة جديدة أو تعديل
 * محتوى/حذف/وقت تعديل). يُستخدم لتفادي re-render و«قفزة التمرير» بلا داعٍ.
 *
 * @param {Array} prev
 * @param {Array} fresh
 * @returns {boolean}
 */
export function hasMessageChanges(prev = [], fresh = []) {
  const byId = new Map();
  for (const m of prev) if (m && m.id != null) byId.set(m.id, m);
  for (const m of fresh) {
    if (!m || m.id == null) continue;
    const old = byId.get(m.id);
    if (!old) return true; // رسالة جديدة
    if (old.content !== m.content) return true;
    if (old.is_deleted !== m.is_deleted) return true;
    if (old.edited_at !== m.edited_at) return true;
  }
  return false;
}
