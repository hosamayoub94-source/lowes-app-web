// =============================================================
// Badge Service — أوسمة البائع + مستواه/رتبته (قراءة).
// =============================================================
import { supabase } from '@services/supabase';

/** أوسمة بائع مع تفاصيلها (اسم/أيقونة/وصف). */
export async function getMyBadges(sellerId) {
  if (!sellerId) return [];
  const { data, error } = await supabase
    .from('seller_badges')
    .select('badge_code, awarded_at, badges(name, icon, description, sort_order)')
    .eq('seller_id', sellerId);
  if (error) { console.warn('badges:', error.message); return []; }
  return (data || [])
    .map(r => ({ code: r.badge_code, awarded_at: r.awarded_at, ...(r.badges || {}) }))
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

/** مستوى/رتبة البائع من بروفايله. */
export async function getMyTier(sellerId) {
  if (!sellerId) return null;
  const { data, error } = await supabase
    .from('profiles').select('seller_type, rep_level, mlm_rank').eq('id', sellerId).maybeSingle();
  if (error) { console.warn('tier:', error.message); return null; }
  return data || null;
}

export const REP_LEVEL_LABELS = {
  junior: 'مبتدئ', active: 'نشيط', pro: 'محترف', agent: 'وكيل منطقة',
};
export const MLM_RANK_LABELS = {
  bronze: 'برونزي', silver: 'فضّي', gold: 'ذهبي', platinum: 'بلاتيني', diamond: 'ألماس',
};

/** تسمية المستوى/الرتبة الحالية للعرض. */
export function tierLabel(tier) {
  if (!tier) return '';
  if (tier.seller_type === 'field_rep') return REP_LEVEL_LABELS[tier.rep_level] || tier.rep_level || '—';
  if (tier.seller_type === 'marketer')  return MLM_RANK_LABELS[tier.mlm_rank] || tier.mlm_rank || '—';
  return '';
}
