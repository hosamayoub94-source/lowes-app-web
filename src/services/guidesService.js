// =============================================================
// guidesService — مصدر الأدلة الموحّد (جدول app_guides).
// يجلب الأدلة المنشورة (مع cache بالذاكرة) ويغلّف الدوال النقيّة
// من guidesLogic بترتيب/تسميات أقسام القائمة (navigation).
// =============================================================
import { supabase } from '@services/supabase';
import { GROUP_ORDER, NAV_GROUPS } from '@data/navigation';
import { guidesForUser, guidesForRoute, groupGuidesBySection as groupBy } from './guidesLogic';

let _cache = null;

/** يجلب الأدلة المنشورة مرتّبة، مع cache بالذاكرة. */
export async function fetchGuides({ force = false } = {}) {
  if (_cache && !force) return _cache;
  const { data } = await supabase
    .from('app_guides')
    .select('*')
    .eq('is_published', true)
    .order('sort_order', { ascending: true });
  _cache = data ?? [];
  return _cache;
}

/** يبطل الـcache (يُستدعى بعد الحفظ من لوحة الأدمن). */
export function invalidateGuides() { _cache = null; }

/** تجميع حسب القسم بترتيب وتسميات القائمة. */
export function groupGuidesBySection(guides = []) {
  return groupBy(guides, { order: GROUP_ORDER, labels: NAV_GROUPS });
}

export { guidesForUser, guidesForRoute };
