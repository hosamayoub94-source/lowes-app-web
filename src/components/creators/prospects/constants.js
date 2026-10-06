// ثوابت واجهة «صناع المحتوى» v2 — المصدر الوحيد للمفردات هو _shared/creatorMatch.js (نفس الملف بالدالة)، وهون فقط ما يخص العرض.
import { govOf as _govOf, countryOf as _countryOf } from '../../../../supabase/functions/_shared/creatorMatch.js';

export {
  CONTENT_TYPES, SKINCARE_FOCUS, CREATOR_TYPES, STATUSES, VERIFICATION, LOCATION_CONFIDENCE, PLATFORMS,
  CONTENT_AR, FOCUS_AR, TYPE_AR, STATUS_AR, VERIFICATION_AR, CONFIDENCE_AR, CATEGORY_AR,
  COUNTRIES, GOVERNORATES, govOf, countryOf, statusOf, BADGES, SORTS, WEIGHTS, fmtNum, normalizeHandle, parseHandle, scoreCreator,
} from '../../../../supabase/functions/_shared/creatorMatch.js';

export const STATUS_CLS = {
  discovered: 'bg-sky-50 text-sky-800', needs_review: 'bg-amber-100 text-amber-800', verified: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-700', contacted: 'bg-blue-100 text-blue-800', interested: 'bg-indigo-100 text-indigo-800',
  collaborating: 'bg-green-200 text-green-900', not_interested: 'bg-orange-100 text-orange-800', inactive: 'bg-gray-200 text-gray-600',
};
export const VERIFY_CLS = { verified: 'text-emerald-700', partial: 'text-amber-700', unverified: 'text-gray-500' };
export const SOURCES = ['Instagram', 'Google Search', 'Influencer Directory', 'Manual', 'Referral', 'Other'];
export const PLATFORM_AR = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook', other: 'أخرى' };

// Link to the creator's own profile: stored URL first (legacy rows), else built from platform + handle.
export function profileUrl(r, platform = r.platform, handle = r.handle) {
  if (platform === r.platform && /^https?:\/\//i.test(r.profile_url || '') && /instagram|tiktok|youtube|facebook/i.test(r.profile_url)) return r.profile_url;
  const h = encodeURIComponent(String(handle || '').replace(/^@+/, ''));
  if (!h) return '';
  switch (platform) {
    case 'instagram': return `https://www.instagram.com/${h}/`;
    case 'tiktok': return `https://www.tiktok.com/@${h}`;
    case 'youtube': return `https://www.youtube.com/@${h}`;
    case 'facebook': return `https://www.facebook.com/${h}`;
    default: return '';
  }
}
// Instagram first: the primary handle when the creator is on Instagram, else other_platforms.instagram.
export function instagramUrl(r) {
  if (r.platform === 'instagram') return profileUrl(r);
  const ig = r.other_platforms?.instagram;
  return ig ? profileUrl(r, 'instagram', ig) : '';
}

export function placeOf(row) {
  const gov = _govOf(row.country, row.governorate);
  const parts = [row.city, gov?.ar].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
  if (!parts.length && row.location) parts.push(row.location);
  const cn = _countryOf(row.country);
  if (cn) parts.push(cn.ar);
  return parts.join(' · ');
}

export function contactUrl(row) {
  const phone = String(row.phone || '').replace(/[^\d+]/g, '');
  if (row.preferred_contact === 'whatsapp' && phone) return `https://wa.me/${phone.replace(/^\+/, '')}`;
  if (row.preferred_contact === 'email' && row.email) return `mailto:${row.email}`;
  if (row.platform === 'instagram' || row.other_platforms?.instagram) return `https://ig.me/m/${encodeURIComponent(row.platform === 'instagram' ? row.handle : row.other_platforms.instagram)}`;
  if (row.email) return `mailto:${row.email}`;
  if (phone) return `https://wa.me/${phone.replace(/^\+/, '')}`;
  return '';
}

