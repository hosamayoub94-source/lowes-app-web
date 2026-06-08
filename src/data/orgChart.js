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
