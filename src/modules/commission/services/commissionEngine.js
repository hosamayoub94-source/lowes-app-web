// =============================================================
// Unified Commission Engine — محرّك العمولات الموحّد (client side)
//
// نقطة استدعاء واحدة: postOrderCommission(orderId) عند تحويل الطلب
// إلى «تم التسليم». المنطق كله في RPC آمنة (SECURITY DEFINER) اسمها
// post_order_commission — تكتب صفوف commission_ledger وتحدّث المحفظة،
// وهي idempotent عبر orders.commission_locked (لا احتساب مزدوج).
//
// ملاحظة: البائع من نوع 'online' لا يكتب دفتراً — عمولته تبقى تُحسب
// per-market في الواجهة كما هي (صفر كسر للإنتاج الحالي).
// =============================================================
import { supabase } from '@services/supabase';

/**
 * يحتسب عمولة طلب مُسلّم ويكتبها في الدفتر (idempotent).
 * fire-and-forget — لا يوقف تدفّق تغيير الحالة عند الفشل.
 * @param {string} orderId  معرّف الطلب (UUID)
 * @returns {Promise<boolean>} نجح الاحتساب أم لا
 */
export async function postOrderCommission(orderId) {
  if (!orderId) return false;
  try {
    const { error } = await supabase.rpc('post_order_commission', { p_order_id: orderId });
    if (error) {
      console.warn('⚠️ محرّك العمولات:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('⚠️ محرّك العمولات (استثناء):', e?.message || e);
    return false;
  }
}
