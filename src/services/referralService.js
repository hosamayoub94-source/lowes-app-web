// =============================================================
// referralService — محرك «دعوات الانتشار» عبر واتساب.
// كل عميل راضٍ يصير قناة اكتساب: كود إحالة قصير + رسالة دعوة (لوزي
// أو نص جاهز) + تسجيل التحويل لما صديق يطلب بنفس الكود.
//
// عمداً بلا لمس نموذج إنشاء الطلب (شاشة كبيرة وحسّاسة) — البائع يسجّل
// التحويل يدوياً من بروفايل العميل الجديد بعد إنشاء طلبه، بربط رقم
// طلبه الفعلي. هذا يبقي المخاطرة محصورة بملفات هذا السبرنت فقط.
// =============================================================
import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;

// كود قصير قابل للنطق شفهياً بين صديقتين: LOWES-XXXX (أرقام+حروف، بلا 0/O/1/I ملتبسة).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return `LOWES-${s}`;
}

// يرجّع كود العميل الفعّال (يعيد استخدام كود pending موجود بدل توليد كود
// جديد كل مرة يفتح فيها البائع البروفايل — رابط واحد ثابت للعميل لمشاركته).
export async function getOrCreateReferralCode({ phoneKey, name, market, createdBy }) {
  if (!phoneKey) return null;
  const { data: existing } = await supabase
    .from('referral_codes')
    .select('*')
    .eq('referrer_phone_key', phoneKey)
    .eq('reward_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing;

  // احتمال تصادم ضئيل جداً (32^5) — إعادة محاولة بسيطة عند تعارض UNIQUE.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('referral_codes')
      .insert({
        code: randomCode(),
        referrer_phone_key: phoneKey,
        referrer_name: name || null,
        market: market || null,
        created_by: createdBy || null,
      })
      .select()
      .single();
    if (!error) return data;
    if (error.code !== '23505') throw error; // غير تعارض UNIQUE → فشل حقيقي
  }
  throw new Error('تعذّر توليد كود إحالة فريد');
}

// تسجيل تحويل ناجح: صديق طلب فعلياً بنفس الكود. حرّاس: كود موجود وما
// انصرف بعد، وما مسموح تحيل حالك (نفس رقم الهاتف).
export async function redeemReferralCode({ code, newPhoneKey, newCustomerName, orderId, redeemedBy }) {
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) return { ok: false, error: 'الرجاء إدخال كود' };
  const { data: row, error: findErr } = await supabase
    .from('referral_codes')
    .select('*')
    .eq('code', cleanCode)
    .maybeSingle();
  if (findErr || !row) return { ok: false, error: 'كود غير موجود' };
  if (row.reward_status !== 'pending') return { ok: false, error: 'هذا الكود استُخدم مسبقاً' };
  if (newPhoneKey && row.referrer_phone_key === newPhoneKey) return { ok: false, error: 'ما بيصير تحيل حالك' };

  const { error: updErr } = await supabase
    .from('referral_codes')
    .update({
      reward_status: 'redeemed',
      redeemed_order_id: orderId || null,
      redeemed_phone_key: newPhoneKey || null,
      redeemed_customer_name: newCustomerName || null,
      redeemed_by: redeemedBy || null,
      redeemed_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('reward_status', 'pending'); // حارس تسابق (race) — لو اتحوّل بنفس اللحظة من مكان تاني
  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true, referrerName: row.referrer_name, referrerPhoneKey: row.referrer_phone_key };
}

// إحصاءات سريعة لسوق معيّن (لوحة نمو مصغّرة بشاشة العملاء).
export async function getReferralStats({ market } = {}) {
  let q = supabase.from('referral_codes').select('reward_status', { count: 'exact' });
  if (market) q = q.eq('market', market);
  const { data, error } = await q;
  if (error || !data) return { generated: 0, redeemed: 0 };
  return {
    generated: data.length,
    redeemed: data.filter(r => r.reward_status !== 'pending').length,
  };
}

// رسالة دعوة جاهزة (fallback بلا AI — دائماً متاحة فوراً).
export function referralInviteMessage(customerName, code, sellerName) {
  const n = customerName && customerName !== 'عميل' ? ` ${customerName}` : '';
  return `مرحباً${n} 🌿\nحابة تشاركي صديقاتك تجربتك مع Lowe's Professional؟\nاديهم كود الدعوة هاد: ${code}\nوكل ما صديقة تطلب فيه، إلك إنتي وإلها خصم خاص 🎁\n${sellerName ? 'معك ' + sellerName + ' — بخدمتك دائماً 💚' : ''}`;
}

// صيغة لوزي الذكية (AI) لرسالة الدعوة — نفس بنية aiFollowupMessage
// (edge fn social-content, وضع followup) لكن بسياق دعوة/إحالة بدل متابعة بيع.
export async function aiReferralMessage({ customerName, code, sellerName }) {
  try {
    const ctx = `اكتبي رسالة قصيرة ودّية واحدة (مو أكتر) تدعو عميلة اسمها ${customerName || 'العميلة'} لمشاركة كود دعوة مع صديقاتها. `
      + `اذكري الكود حرفياً بالضبط كما هو: ${code}. وضّحي إنها وصديقتها بياخدوا خصم خاص لما الصديقة تستخدم الكود.`
      + (sellerName ? ` وقّعي باسم ${sellerName}.` : '')
      + ` نص الرسالة جاهز للإرسال مباشرة، بلا عناوين ولا شرح إضافي.`;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/social-content`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'followup', product: '', extra: ctx }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = String(data?.content || '').trim();
    return raw || null;
  } catch { return null; }
}
