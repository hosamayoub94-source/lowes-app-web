// =============================================================
// Sales-screen access for the media team.
// موظفو فريق «ميديا» (role_type='employee') شغلهم محتوى/سوشال — لا يرون
// شاشات الطلبات والعملاء، لا بالقائمة ولا بالمسار. الميديا باير/المدراء
// يبقون كما هم (يشتغلون على الطلبات). مَن مُنِح manage_orders صراحةً يبقى
// يراها (نفس مبدأ «الصلاحية تكشف الشاشة» بـnavigation.js).
// =============================================================
import { ROLES } from './teams';
import { PERMISSIONS as P } from './permissions';

export const MEDIA_TEAM = 'ميديا';

// معرّفات عناصر القائمة المقفولة عن موظفي الميديا (مطابقة لـNAV_ITEMS).
export const MEDIA_HIDDEN_NAV_IDS = new Set([
  'orders-syria',
  'orders-turkey',
  'orders-uae',
  'customers',
]);

/**
 * هل تُخفى شاشات المبيعات (طلبات + عملاء) عن هذا المستخدم؟
 * @param {string|null} role   profiles.role_type
 * @param {string|null} team   profiles.team
 * @param {Set<string>|null} permSet  الصلاحيات الفعلية (اختياري)
 */
export function hidesSalesScreens(role, team, permSet = null) {
  if (role !== ROLES.EMPLOYEE) return false;
  if (String(team ?? '').trim() !== MEDIA_TEAM) return false;
  if (permSet && permSet.has(P.MANAGE_ORDERS)) return false;
  return true;
}
