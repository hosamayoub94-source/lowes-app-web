// =============================================================
// guidesLogic — دوال نقيّة لاشتقاق/فلترة/تجميع الأدلة.
// بلا أي imports (لا aliases) → قابلة للاختبار مباشرةً بـnode.
// الخدمة (guidesService) تغلّفها وتمرّر ترتيب/تسميات الأقسام.
// =============================================================

/** فلترة بالصلاحية: permission فارغ/null = للجميع، وإلا يجب أن يملكها المستخدم. */
export function guidesForUser(guides = [], permSet = new Set()) {
  return guides.filter((g) => !g.permission || permSet.has(g.permission));
}

/** ترتيب: أدلة المسار الحالي أولاً (مطابقة بادئة)، مع إبقاء الاستقرار. */
export function guidesForRoute(guides = [], pathname = '') {
  const onRoute = (g) =>
    Array.isArray(g.routes) &&
    g.routes.some((r) => pathname === r || pathname.startsWith(r + '/') || pathname.startsWith(r));
  return [...guides].sort((a, b) => (onRoute(b) ? 1 : 0) - (onRoute(a) ? 1 : 0));
}

/**
 * تجميع حسب section_key بترتيب `order`، مع تسمية من `labels`.
 * @param {Array} guides
 * @param {{order?: string[], labels?: Record<string,string>}} opts
 * @returns {Array<{key:string,label:string,items:Array}>}
 */
export function groupGuidesBySection(guides = [], { order = [], labels = {} } = {}) {
  const keys = [...new Set(guides.map((g) => g.section_key || 'core'))];
  keys.sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  return keys.map((key) => ({
    key,
    label: labels[key] || key,
    items: guides.filter((g) => (g.section_key || 'core') === key),
  }));
}
