// Shared bits for the Creator Workbench (labels, tiny UI primitives, file download). No data, no side effects except download().

export const CITY_AR = { damascus: 'دمشق', rif_dimashq: 'ريف دمشق', aleppo: 'حلب', homs: 'حمص', hama: 'حماة', latakia: 'اللاذقية', tartus: 'طرطوس', daraa: 'درعا', sweida: 'السويداء', idlib: 'إدلب', deir_ez_zor: 'دير الزور', raqqa: 'الرقة', hasakah: 'الحسكة', quneitra: 'القنيطرة', other: 'أخرى', unknown: 'غير معروف' };
export const SEG_AR = { skincare_beauty: 'سكين كير / بيوتي', lifestyle_women: 'لايف ستايل / نساء', hair_beauty: 'شعر / بيوتي', expert: 'خبير / مختص', other: 'أخرى' };
export const SLOT_AR = { skincare_beauty: 'Beauty / Skincare', lifestyle_women: 'Lifestyle / Women', ugc_capable: 'UGC-capable', expert: 'Experts', hair_beauty: 'Hair / Beauty' };
export const VERDICT_COLOR = { ugc_ready: 'bg-purple-50 text-purple-700 border-purple-200', pr_ready: 'bg-green-50 text-green-700 border-green-200', expert: 'bg-blue-50 text-blue-700 border-blue-200', paid_inquiry: 'bg-amber-50 text-amber-700 border-amber-200', needs_review: 'bg-surface-alt text-muted border-border', not_relevant: 'bg-red-50 text-red-600 border-red-200' };
export const CONTACT_AR = { management: 'إدارة أعمال', agency: 'وكالة', email: 'إيميل', whatsapp: 'واتساب', phone: 'هاتف عمل', website: 'موقع/رابط', instagram_dm: 'DM انستغرام', tiktok_dm: 'DM تيك توك', facebook_messenger: 'ماسنجر' };
export const PLAT_AR = { instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube' };
export const TRI_OPTS = [['yes', 'نعم'], ['no', 'لا'], ['unsure', 'غير متأكد']];
export const fmtN = n => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en'));

export function download(name, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}


// Reviewer-facing Arabic text for the verdict's "missing" codes (raw codes stay in the data; only the display changes).
const MISSING_AR = { active: 'هل الحساب نشط', fit_lowes: 'ملاءمة LOWE\'S', action: 'التوصية (هدية/UGC/مدفوع/لا شيء)', skincare_fit: 'ملاءمة العناية بالبشرة', contact: 'وسيلة تواصل' };
export function missingAr(code) {
  if (MISSING_AR[code]) return MISSING_AR[code];
  const m = /^answer:q(\d)$/.exec(code);
  if (m) return `سؤال ${m[1]}`;
  if (String(code).startsWith('ugc_evidence')) return 'دليل UGC (وجه + كلام/مراجعة/unboxing + جودة + رابط فيديو)';
  return code;
}
