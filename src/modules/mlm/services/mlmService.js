// =============================================================
// MLM Service — شبكة المسوّقات: رمز الدعوة، الضمّ، شجرة الفريق.
// =============================================================
import { supabase } from '@services/supabase';

/** يضمن وجود رمز دعوة للمستخدم ويعيده. */
export async function ensureInviteCode(userId) {
  if (!userId) return null;
  const { data, error } = await supabase.rpc('ensure_invite_code', { p_user: userId });
  if (error) { console.warn('inviteCode:', error.message); return null; }
  return data || null;
}

/** ضمّ المستخدم الحالي تحت صاحب رمز الدعوة. */
export async function joinByInvite(code) {
  const { data, error } = await supabase.rpc('set_recruiter_by_invite', { p_code: code });
  if (error) return { ok: false, error: error.message };
  return data || { ok: false, error: 'unknown' };
}

/** شجرة الفريق (downline) مع العمق ومبيعات/عمولة الشهر. */
export async function getDownline(rootId = null, month = null) {
  const { data, error } = await supabase.rpc('my_downline', { p_root: rootId, p_month: month });
  if (error) { console.warn('downline:', error.message); return []; }
  return data || [];
}

/** رسالة واتساب جاهزة لدعوة مسوّقة جديدة. */
export function inviteWhatsAppLink(code, inviterName = '') {
  const txt = `مرحباً 🌸 انضمّي لشبكة مسوّقات LOWE'S!\nرمز دعوتي: ${code}\n${inviterName ? 'من: ' + inviterName : ''}`;
  return `https://wa.me/?text=${encodeURIComponent(txt)}`;
}

export const RANK_LABELS = {
  bronze: 'برونزي', silver: 'فضّي', gold: 'ذهبي', platinum: 'بلاتيني', diamond: 'ألماس',
};
