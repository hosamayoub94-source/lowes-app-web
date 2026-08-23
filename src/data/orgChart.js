// =============================================================
// Org chart — المناصب الإدارية (الهيكل الإداري) بمسميات إنجليزية.
// كل منصب مرتبط بدور (role_type)؛ تُعرض المناصب حتى الشاغرة (Vacant)
// لإظهار طابع شركة محترمة.
// =============================================================
import { ROLES } from './teams';

export const ORG_POSITIONS = [
  { key: 'ceo',       title_en: 'CEO & Founder',        title_ar: 'المؤسس والمدير العام', role: ROLES.ADMIN },
  { key: 'coo',       title_en: 'COO',                  title_ar: 'المدير التنفيذي',       role: ROLES.MANAGER },
  { key: 'sales',     title_en: 'Sales Manager',        title_ar: 'مدير المبيعات',         role: ROLES.SALES_MANAGER },
  { key: 'marketing', title_en: 'Marketing Manager',    title_ar: 'مدير التسويق',          role: ROLES.MARKETING_MANAGER },
  { key: 'media',     title_en: 'Media Buyer',          title_ar: 'ميديا باير',            role: ROLES.MEDIA_BUYER },
  { key: 'social',    title_en: 'Social Media Manager', title_ar: 'مدير السوشال',          role: ROLES.SOCIAL_MANAGER },
  { key: 'finance',   title_en: 'Finance / Accountant', title_ar: 'المحاسبة',              role: ROLES.ACCOUNTANT },
  { key: 'hr',        title_en: 'HR Manager',           title_ar: 'الموارد البشرية',       role: ROLES.HR_MANAGER },
  { key: 'warehouse', title_en: 'Warehouse Manager',    title_ar: 'مدير المخزن',           role: ROLES.WAREHOUSE_MANAGER },
];

// =============================================================
// قسم Media — المسميات الوظيفية المعتمدة (23 آب 2026)
//
// تُخزَّن بـprofiles.job_title كنص إنجليزي مطابق لـtitle_en.
// `reports_to_manager` هو **مصدر التبعية الإدارية الوحيد** — لا الدور
// (role_type) ولا الفريق. سببه أن أكثر من موظف يحمل دور social_manager
// لأغراض صلاحيات، والصلاحيات لا تُغيَّر لأجل العرض (D-075).
//
// الانتماء للقسم شيء والتبعية الإدارية شيء آخر: الستة كلهم تحت قسم
// Media، وأربعة فقط يتبعون Social Media Manager إدارياً.
// =============================================================
export const MEDIA_TEAM = 'ميديا'; // قيمة profiles.team للقسم — من قائمة الفرق القائمة

export const MEDIA_JOB_TITLES = [
  { key: 'social_manager', title_en: 'Social Media Manager',         title_ar: 'مدير السوشال ميديا',
    specialty: 'إدارة فريق السوشال ميديا',                            is_manager: true,  reports_to_manager: false },
  { key: 'graphic',        title_en: 'Graphic Designer',             title_ar: 'مصمم جرافيك',
    specialty: 'التصميم',                                             is_manager: false, reports_to_manager: true  },
  { key: 'specialist',     title_en: 'Social Media Specialist',      title_ar: 'أخصائي سوشال ميديا',
    specialty: 'المحتوى والنشر',                                      is_manager: false, reports_to_manager: true  },
  { key: 'media_buyer',    title_en: 'Media Buyer',                  title_ar: 'ميديا باير',
    specialty: 'مرتبط بالسوشال تنسيقاً وعملاً فقط',                   is_manager: false, reports_to_manager: false },
  { key: 'trade',          title_en: 'Trade Relations Specialist',   title_ar: 'أخصائي علاقات التجار',
    specialty: 'العلاقات مع التجار والمتاجر',                         is_manager: false, reports_to_manager: false },
  { key: 'medical',        title_en: 'Medical Relations Specialist', title_ar: 'أخصائي العلاقات الطبية',
    specialty: 'العلاقات مع الصيادلة والأطباء والمستودعات',           is_manager: false, reports_to_manager: false },
];

/** المسمى المعتمد المطابق لنص job_title — null لو غير معتمد أو فارغ. */
export function mediaTitleOf(jobTitle) {
  if (!jobTitle) return null;
  const t = String(jobTitle).trim().toLowerCase();
  return MEDIA_JOB_TITLES.find(x => x.title_en.toLowerCase() === t) ?? null;
}
