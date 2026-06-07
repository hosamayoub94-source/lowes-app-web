// =============================================================
// orderStatus — قاموس حالات الطلب + قوائم منفصلة لكل سوق.
// كل الحالات الـ14 تبقى مقبولة بقيد القاعدة (orders_status_check)؛
// هذا الملف يتحكّم فقط بـ«ما يُعرض/يُختار» لكل سوق (تركيا/سوريا).
// =============================================================

export const STATUSES = {
  pending:      { label: 'وارد جديد',         icon: '📥', bg: 'bg-surface-alt', text: 'text-muted',      border: 'border-border'      },
  preparing:    { label: 'في التجهيز',        icon: '📦', bg: 'bg-amber-bg',    text: 'text-amber-fg',   border: 'border-amber/30'    },
  ready:        { label: 'جاهز للشحن',        icon: '🚀', bg: 'bg-violet-100',  text: 'text-violet-700', border: 'border-violet-200'  },
  motor:        { label: 'قيد توصيل الموتور', icon: '🏍️', bg: 'bg-blue-100',    text: 'text-blue-700',   border: 'border-blue-200'    },
  at_center:    { label: 'في المركز',         icon: '🏢', bg: 'bg-blue-50',     text: 'text-blue-700',   border: 'border-blue-200'    },
  shipped:      { label: 'في النقل',          icon: '🚚', bg: 'bg-blue-100',    text: 'text-blue-700',   border: 'border-blue-200'    },
  on_way:       { label: 'في الطريق للعميل',  icon: '🛵', bg: 'bg-blue-100',    text: 'text-blue-700',   border: 'border-blue-200'    },
  delivered:    { label: 'تم التسليم',        icon: '✅', bg: 'bg-green-bg',    text: 'text-green-fg',   border: 'border-green/30'    },
  waiting:      { label: 'بالانتظار/متابعة',  icon: '⏳', bg: 'bg-amber-bg',    text: 'text-amber-fg',   border: 'border-amber/30'    },
  not_received: { label: 'لم يتم الاستلام',   icon: '📭', bg: 'bg-red-bg',      text: 'text-red-fg',     border: 'border-red/30'      },
  returning:    { label: 'راجع للمركز',       icon: '↩️', bg: 'bg-red-bg',      text: 'text-red-fg',     border: 'border-red/30'      },
  returned:     { label: 'راجع',              icon: '🔁', bg: 'bg-red-bg',      text: 'text-red-fg',     border: 'border-red/30'      },
  settled:      { label: 'تمت التسوية',       icon: '🤝', bg: 'bg-green-bg',    text: 'text-green-fg',   border: 'border-green/30'    },
  cancelled:    { label: 'ملغي',              icon: '❌', bg: 'bg-red-bg',      text: 'text-red-fg',     border: 'border-red/30'      },
};

export const ALL_STATUS_KEYS = Object.keys(STATUSES);

// قوائم الحالات حسب السوق (المالك: قوائم منفصلة لكل سوق).
// تركيا = مسار شركات الشحن (مركز/شحن/في الطريق). سوريا = مسار محلي (موتور).
const TURKEY_STATUSES = ['pending','preparing','ready','at_center','shipped','on_way','delivered','waiting','not_received','returning','returned','settled','cancelled'];
// سوريا (طلب المالك): فقط 7 حالات — جديد·تجهيز·شحن·تم التسليم·انتظار·تسوية·ملغي.
const SYRIA_STATUSES  = ['pending','preparing','shipped','delivered','waiting','settled','cancelled'];

export const STATUS_KEYS_BY_MARKET = { turkey: TURKEY_STATUSES, syria: SYRIA_STATUSES };

// مفاتيح الحالات المعروضة لسوق معيّن (أو الكل عند 'all'/غير معروف).
export function statusKeysForMarket(market) {
  return STATUS_KEYS_BY_MARKET[market] || ALL_STATUS_KEYS;
}

// خطوط التقدّم (شريط المراحل) لكل سوق — مسار خطّي فقط.
const TURKEY_STAGES = ['pending','preparing','ready','at_center','shipped','on_way','delivered'];
const SYRIA_STAGES  = ['pending','preparing','shipped','delivered'];
export const STAGES_BY_MARKET = { turkey: TURKEY_STAGES, syria: SYRIA_STAGES };

export function stagesForMarket(market) {
  return STAGES_BY_MARKET[market] || ['pending','preparing','ready','shipped','delivered'];
}
