// =============================================================
// CustomersScreen — «العملاء والأرشيف» + retention engine (everyone).
// Sections (Syria/Turkey/Strong/All) · segments (follow-up/at-risk/
// win-back) · notes · cross-sell suggestions · reorder cycle ·
// loyalty tier · WhatsApp with editable / AI-written message.
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  listCustomers, countCustomers, starLabel, customerWaLink, followupMessage,
  sellerMatches, daysSince, getNotes, addNote,
  getCustomerOrders, boughtProductNames, aiFollowupMessage,
  sellerVariants, canonicalSeller, exportMetaCSV, getSellerAliases,
  listCustomerMonths, monthRange, phoneKey,
} from '@services/customerService';
import { suggestComplements, REORDER_DAYS } from '@data/crossSell';
import { STATUSES } from '@data/orderStatus';
import { useAuth } from '@hooks/useAuth';
import { supabase } from '@services/supabase';
import { useNavigate } from 'react-router-dom';
import {
  sendBulkCampaign, getCampaignSentPhones, getCampaignStats, getCampaignResponderPhoneKeys,
  TEMPLATE_SID, CHECKIN_TEMPLATE_SID,
  STAR_NETWORK_INVITE_SID, VIP_REACTIVATION_SID, ACADEMY_INVITE_SID, LIMITED_OFFER_SID,
} from '@services/whatsappService';

// كل الحملات الجماعية المتاحة للإرسال من هالشاشة — كل وحدة قالب معتمَد من
// Meta + مفتاح خاص بجدول campaign_sends (كل حملة لها تتبّع/استبعاد منفصل).
// لإضافة حملة جديدة لاحقاً: أضف سطر هون بس، بلا تعديل أي منطق تاني.
// ⚠️ D-042 (14 أغسطس 2026): من السبعة قوالب المعتمَدة حديثاً، هون بس الثلاثة
// يلي متغيّرها الوحيد {{1}}=اسم العميل (نفس ما sendBulkCampaign بتحقنه
// تلقائياً). الأربعة الباقية (متابعة سعر/منتج، منتج جديد، عرض محدود،
// واسترجاع شكوى) تحتاج متغيّر إضافي حقيقي لكل حملة — غير مربوطة بقصد، راجع
// التعليق أعلى تعريفها بـwhatsappService.js.
const CAMPAIGNS = [
  {
    key: 'hair_density_promo_v2', label: 'كثافة الشعر — خصم 30%', contentSid: TEMPLATE_SID.promo,
    hint: 'قالب تسويقي (صورة + خصم) — بيع مباشر.',
  },
  {
    key: 'customer_checkin_v1', label: 'تواصل ودّي — اشتقنالك', contentSid: CHECKIN_TEMPLATE_SID,
    hint: 'رسالة استرجاع علاقة بحتة (بلا بيع/رابط) — بتفتح نافذة رد حر 24 ساعة، الفريق يرد يدوياً وبيرسل روابط لو لزم.',
  },
  {
    key: 'star_network_invite_v1', label: 'دعوة شبكة النجوم', contentSid: STAR_NETWORK_INVITE_SID,
    hint: 'دعوة عميلة راضية تصير مسوّقة (شبكة النجوم) — مناسبة لعميلات علّقن إيجابياً.',
  },
  {
    key: 'vip_reactivation_v1', label: 'إعادة تنشيط — عملاء قدامى', contentSid: VIP_REACTIVATION_SID,
    hint: 'رسالة "اشتقنالك" لعملاء ما طلبوا من فترة — مناسبة لشريحة الخاملين/عائدين.',
  },
  {
    key: 'academy_invite_v3', label: 'دعوة أكاديمية لوويز (تلغرام)', contentSid: ACADEMY_INVITE_SID,
    hint: 'دعوة لقناة تعليمية عن استخدام المنتجات — بلا بيع مباشر.',
  },
  // 14 أغسطس 2026 — طلب حسام: بعد حملة "تواصل ودّي"، استهدف بس اللي ردّوا
  // فعلياً بحملة بيع مباشر أرخص (شريحة أصغر وأدفأ = تكلفة أقل واحتمال تحويل
  // أعلى من إعادة بث للقائمة كاملة). القالب `limited_offer_reminder_v2`
  // يحتاج {{2}}=نص العرض و{{3}}=تاريخ الانتهاء — audienceOf يقيّد المُرسَل
  // لهم لمن ردّوا على customer_checkin_v1 فقط (CustomersScreen يفلتر
  // campaignVisible بناءً عليه)، extraVars دالة (لا قيمة ثابتة) عشان تاريخ
  // الانتهاء يُحسَب لحظة الإرسال الفعلي لا وقت تحميل الصفحة. المدة: 7 أيام —
  // نفس نمط "أسبوع فقط" المستخدَم أصلاً بقالب كثافة الشعر، كافية لعميلة
  // ردّت لتوّها تتخذ قرار بلا ضغط مبالغ فيه.
  {
    key: 'welcome_back_offer_v1', label: '🎯 عرض 30% — لمن ردّوا على "تواصل ودّي"', contentSid: LIMITED_OFFER_SID,
    hint: 'خصم 30% لأول طلب، لمدة أسبوع — بس لعميلات ردّوا فعلياً على حملة "تواصل ودّي" (شريحة أدفأ، تكلفة أقل من حملة عامة).',
    audienceOf: 'customer_checkin_v1',
    extraVars: () => {
      const end = new Date(); end.setDate(end.getDate() + 7);
      return { '2': 'خصم 30% لأول طلب', '3': end.toLocaleDateString('ar', { day: 'numeric', month: 'long' }) };
    },
  },
];

// 🚨 تجميد مؤقت 16 أغسطس 2026 — Meta علّمت حساب واتساب "Lowes 2" (كل الأرقام
// تحته، بما فيها خط الحملات +12768772635) بمشكلة "Sending spam" (خط الحملات
// جودته "منخفض" بلوحة Meta)، مهلة حتى 13 نوفمبر 2026 قبل تقييد/تعطيل فعلي.
// قرار المالك: وقف الإرسال الجماعي فوراً لحد ما تتعافى الجودة، قبل ما نطلب
// مراجعة من Meta (طلب مراجعة بدون إصلاح السلوك أولاً بيخاطر بحرق الاستئناف).
// لرفع التجميد لاحقاً: بدّل هاد لـfalse بعد تأكيد تعافي الجودة من لوحة Meta.
const CAMPAIGN_FROZEN = true;
import { sessionCan, PERMISSIONS } from '@data/permissions';
import {
  getOrCreateReferralCode, redeemReferralCode, referralInviteMessage,
  aiReferralMessage, getReferralStats,
} from '@services/referralService';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

const SECTIONS = [
  { key: 'syria',  label: '🇸🇾 لويز سوريا', market: 'syria',  brand: 'lowes'  },
  { key: 'turkey', label: '🇹🇷 لويز تركيا', market: 'turkey', brand: 'lowes'  },
  { key: 'strong', label: '💪 سترونغ',       market: null,     brand: 'strong' },
  { key: 'all',    label: '🌍 الكل',          market: null,     brand: null     },
];

const SEGMENTS = [
  { key: 'all',      label: 'كل العملاء' },
  { key: 'followup', label: '⏰ للمتابعة (30+ يوم)' },
  { key: 'atrisk',   label: '⚠️ معرّضون للفقدان' },
  { key: 'winback',  label: '💔 استرجاع (90+ يوم)' },
];

function inSegment(c, seg) {
  const idle = daysSince(c.last_order);
  if (seg === 'followup') return idle >= 30;
  if (seg === 'atrisk')   return c.orders_count >= 2 && idle >= 45 && idle < 90;
  if (seg === 'winback')  return idle >= 90;
  return true;
}

function loyaltyTier(stars) {
  if (stars >= 3) return { label: '💎 بلاتيني', color: 'text-violet-700' };
  if (stars === 2) return { label: '🥇 ذهبي', color: 'text-amber-fg' };
  if (stars === 1) return { label: '🥈 فضي', color: 'text-muted' };
  return { label: '🌱 جديد', color: 'text-muted' };
}

function custMarket(c) {
  return (c.markets || []).includes('syria') ? 'syria'
       : (c.markets || []).includes('turkey') ? 'turkey' : 'syria';
}

function WaIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.138.561 4.14 1.541 5.876L.057 23.886a.5.5 0 00.606.617l6.218-1.632A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
    </svg>
  );
}

function CustomerModal({ c, sellerName, onClose }) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const mkt = custMarket(c);
  const idle = daysSince(c.last_order);
  const tier = loyaltyTier(c.stars);

  const [notes, setNotes]   = useState([]);
  const [text, setText]     = useState('');
  const [saving, setSaving] = useState(false);

  const [bought, setBought] = useState([]);
  const [history, setHistory] = useState([]);
  const [lastOrder, setLastOrder] = useState(null);
  const [lastOrderDays, setLastOrderDays] = useState(idle);
  const [msg, setMsg]       = useState(followupMessage(c.name, sellerName));
  const [aiLoading, setAiLoading] = useState(false);
  const [aiOptions, setAiOptions] = useState([]); // اقتراحات لوزي المتعددة — تُختار بدل ما تُفرَض

  // ── دعوات الانتشار (الإحالة) ────────────────────────────────
  const [refCode, setRefCode]         = useState(null);
  const [refLoading, setRefLoading]   = useState(false);
  const [refMsg, setRefMsg]           = useState('');
  const [refAiLoading, setRefAiLoading] = useState(false);
  const [redeemInput, setRedeemInput] = useState('');
  const [redeemBusy, setRedeemBusy]   = useState(false);
  const [redeemResult, setRedeemResult] = useState(null); // {ok, error?, referrerName?}

  useEffect(() => { getNotes(c.phone_key).then(setNotes); }, [c.phone_key]);
  useEffect(() => {
    getCustomerOrders(c.phone_key || c.phone).then((orders) => {
      setHistory(orders);
      setBought(boughtProductNames(orders));
      setLastOrder(orders[0] || null);
      if (orders[0]?.order_date) setLastOrderDays(daysSince(orders[0].order_date));
    });
  }, [c.phone_key, c.phone]);

  // One-tap reorder: open a NEW order pre-filled with this customer's
  // details + their last order's products.
  const reorder = () => {
    const lo = lastOrder || {};
    navigate('/orders', { state: { reorder: {
      market: lo.market || mkt,
      brand:  lo.brand || 'lowes',
      customer_name: c.name || lo.customer_name || '',
      phone_1: c.phone || '',
      wa_number: lo.wa_number || '',
      city: c.city || lo.city || '',
      address: lo.address || '',
      items: Array.isArray(lo.items) && lo.items.length ? lo.items : [{ name: '', qty: 1 }],
    } } });
  };

  const suggestions = useMemo(() => suggestComplements(bought), [bought]);
  const reorderDue  = lastOrderDays >= REORDER_DAYS && bought.length > 0;

  // درل-داون «مين باع شو»: جمّع طلبات العميل حسب البائع، وحدّد المنتجات المكرّرة
  // (منتج ظهر بأكتر من طلب = احتمال بيع مكرّر لنفس العميل).
  const salesHistory = useMemo(() => {
    const bySeller = new Map();
    const productOrders = new Map(); // اسم المنتج (حروف صغيرة) → عدد الطلبات التي ظهر فيها
    for (const o of history) {
      const seller = canonicalSeller(o.handler_name) || '—';
      if (!bySeller.has(seller)) bySeller.set(seller, []);
      bySeller.get(seller).push(o);
      const seen = new Set();
      for (const it of (o.items || [])) {
        const nm = String(it?.name || '').trim().toLowerCase();
        if (!nm || seen.has(nm)) continue;
        seen.add(nm);
        productOrders.set(nm, (productOrders.get(nm) || 0) + 1);
      }
    }
    const repeated = new Set([...productOrders.entries()].filter(([, n]) => n >= 2).map(([k]) => k));
    const groups = [...bySeller.entries()]
      .map(([seller, orders]) => ({ seller, orders }))
      .sort((a, b) => b.orders.length - a.orders.length);
    return { groups, sellerCount: bySeller.size, repeated, total: history.length };
  }, [history]);

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try { const n = await addNote(c.phone_key, text, sellerName); setNotes(p => [n, ...p]); setText(''); }
    catch { /* تجاهل */ } finally { setSaving(false); }
  };

  const writeWithAi = async () => {
    setAiLoading(true);
    setAiOptions([]);
    try {
      const out = await aiFollowupMessage({ customerName: c.name, products: bought, idleDays: idle, sellerName });
      if (out?.length) {
        setAiOptions(out);
        setMsg(out[0]); // أول اقتراح يتعبّى بالصندوق فوراً — الباقي جاهزين تحته لو حابة تبدّلي
      }
    } finally { setAiLoading(false); }
  };

  // توليد/جلب كود الإحالة (كسول — بس لما البائع يفتح قسم "دعوة صديقة").
  const loadReferralCode = async () => {
    if (refCode || refLoading) return;
    setRefLoading(true);
    try {
      const row = await getOrCreateReferralCode({ phoneKey: c.phone_key, name: c.name, market: mkt, createdBy: sellerName });
      setRefCode(row);
      setRefMsg(referralInviteMessage(c.name, row.code, sellerName));
    } catch { /* تجاهل — الزر يضل يسمح بإعادة المحاولة */ }
    finally { setRefLoading(false); }
  };

  const writeReferralWithAi = async () => {
    if (!refCode) return;
    setRefAiLoading(true);
    try {
      const out = await aiReferralMessage({ customerName: c.name, code: refCode.code, sellerName });
      if (out) setRefMsg(out);
    } finally { setRefAiLoading(false); }
  };

  // تسجيل تحويل ناجح: هالعميلة (الجديدة) ذكرت كود صديقة عند الطلب.
  // نربطه بأحدث طلب فعلي إلها (lastOrder) بدل لمس نموذج إنشاء الطلب.
  const redeemCode = async () => {
    if (!redeemInput.trim() || redeemBusy) return;
    setRedeemBusy(true);
    setRedeemResult(null);
    try {
      const res = await redeemReferralCode({
        code: redeemInput, newPhoneKey: c.phone_key, newCustomerName: c.name,
        orderId: lastOrder?.id || null, redeemedBy: sellerName,
      });
      setRedeemResult(res);
      if (res.ok) setRedeemInput('');
    } finally { setRedeemBusy(false); }
  };

  const waSend  = customerWaLink(c.phone, mkt, msg);
  const waPlain = customerWaLink(c.phone, mkt);
  const waReferral = refCode ? customerWaLink(c.phone, mkt, refMsg) : null;

  // واتساب الاستهلاكي (wa.me) بيفتح تطبيق واتساب الشخصي عالموبايل — ما عنا
  // API ولا webhook نقرأ منه أي شي (رد العميل يضل غير مرئي كلياً)، بس أقل
  // شي نوثّق إنه تواصل صار أصلاً + شو كان نص الرسالة، بدل ما يضيع بلا أثر.
  const logConsumerWaOutreach = (withMessage) => {
    const note = withMessage ? `📱 واتساب: ${msg}` : '📱 فتح محادثة واتساب فارغة';
    addNote(c.phone_key, note, sellerName).then(n => setNotes(p => [n, ...p])).catch(() => {});
  };

  // زر "فتح شات واتساب الرسمي" — يفتح/يطالب بملكية المحادثة بشاشة
  // /admin/whatsapp (نفس الموظف يضل صاحبها بعدين). القناة الرسمية محظورة
  // كلياً على سوريا (D-022، خطأ Twilio 21408) — الزر يظهر بس لتركيا.
  const canOfficialWa = mkt === 'turkey' && sessionCan(session, PERMISSIONS.SEND_WHATSAPP);
  const openOfficialWa = () => {
    const digits = phoneKey(c.phone)?.replace(/^0+/, '');
    if (!digits) return;
    const full = digits.startsWith('90') ? digits : '90' + digits;
    // بتاخد نفس رسالة "لوزي تكتب" (msg) اللي مكتوبة بالصندوق فوق — نفس الرسالة
    // اللي كان لازم تُنسَخ يدوياً للواتساب العادي هلق تنفتح جاهزة بالرسمي.
    navigate(`/admin/whatsapp?open=${encodeURIComponent('+' + full)}`, { state: { prefill: msg } });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-2 sm:p-4" dir="rtl" onClick={onClose}>
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border/40 flex items-start justify-between gap-2 sticky top-0 bg-surface z-10">
          <div className="min-w-0">
            <h3 className="font-bold text-base text-text truncate">
              {c.stars > 0 && <span className="me-1">{starLabel(c.stars)}</span>}{c.name || 'عميل'}
            </h3>
            <p className="text-[11px] text-muted" dir="ltr">{c.phone}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted shrink-0">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Stats + loyalty */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-surface-alt rounded-xl p-2"><p className="text-lg font-extrabold text-teal">{c.orders_count}</p><p className="text-[10px] text-muted">طلب</p></div>
            <div className="bg-surface-alt rounded-xl p-2"><p className="text-sm font-bold text-text">{idle === Infinity ? '—' : idle}</p><p className="text-[10px] text-muted">يوم خمول</p></div>
            <div className="bg-surface-alt rounded-xl p-2"><p className={`text-xs font-bold ${tier.color}`}>{tier.label}</p><p className="text-[10px] text-muted">الولاء</p></div>
          </div>

          {/* Reorder + win-back nudges */}
          {idle >= 90 && (
            <div className="bg-red-bg border border-red/20 rounded-xl px-3 py-2 text-xs text-red-fg">
              💔 خامل {idle} يوم — أرسل عرض «اشتقنالك» (خصم/هدية استرجاع).
            </div>
          )}
          {idle >= 45 && idle < 90 && c.orders_count >= 2 && (
            <div className="bg-amber-bg border border-amber/30 rounded-xl px-3 py-2 text-xs text-amber-fg">
              ⚠️ عميل وفيّ بدأ يبتعد ({idle} يوم) — تواصل الآن قبل ما نخسره.
            </div>
          )}
          {reorderDue && (
            <div className="bg-teal/10 border border-teal/30 rounded-xl px-3 py-2 text-xs text-teal">
              🔁 مضى {lastOrderDays} يوم على آخر طلب — غالباً منتجه قارب يخلص. ذكّره بإعادة الطلب.
            </div>
          )}

          {/* One-tap reorder */}
          <button onClick={reorder}
            className="w-full py-2.5 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy/90 transition flex items-center justify-center gap-2">
            🛒 إعادة الطلب (طلب جديد بنفس بياناته)
          </button>

          {/* Cross-sell suggestions */}
          {suggestions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-extrabold text-muted">💡 اقترح عليه (بيع مكمّل)</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map(s => (
                  <span key={s} className="text-[11px] bg-teal/10 text-teal font-semibold px-2 py-1 rounded-lg">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* درل-داون: سجل المبيعات حسب البائع + كشف البيع المكرّر */}
          {salesHistory.total > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-extrabold text-muted">📜 سجل المبيعات — مين باع شو</p>
                {salesHistory.sellerCount > 1 && (
                  <span className="text-[11px] font-bold text-amber-fg bg-amber-bg border border-amber/30 rounded-lg px-2 py-0.5">
                    🔀 باعه {salesHistory.sellerCount} بائعين
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {salesHistory.groups.map(({ seller, orders }) => (
                  <div key={seller} className="bg-surface-alt rounded-xl p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-text">👤 {seller}</span>
                      <span className="text-[10px] text-muted">{orders.length} طلب</span>
                    </div>
                    {orders.map((o, i) => (
                      <div key={o.id || o.order_id || i} className="border-t border-border/40 pt-1.5 first:border-t-0 first:pt-0">
                        <div className="flex items-center justify-between text-[10px] text-muted">
                          <span dir="ltr">{o.order_id ? `#${o.order_id}` : ''} · {o.order_date ? new Date(o.order_date).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}</span>
                          <span className="flex items-center gap-1">
                            {Number(o.amount) > 0 && <span className="font-bold text-text">{fmt(o.amount)} {o.currency || ''}</span>}
                            {STATUSES[o.status] && <span title={STATUSES[o.status].label}>{STATUSES[o.status].icon}</span>}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(o.items || []).length === 0 ? (
                            <span className="text-[10px] text-muted">—</span>
                          ) : (o.items || []).map((it, k) => {
                            const nm = String(it?.name || '').trim();
                            const isRep = nm && salesHistory.repeated.has(nm.toLowerCase());
                            return (
                              <span key={k} className={`text-[10px] px-1.5 py-0.5 rounded-md ${isRep ? 'bg-amber-bg text-amber-fg font-bold' : 'bg-surface text-muted'}`}>
                                {nm || '—'}{Number(it?.qty) > 1 ? ` ×${it.qty}` : ''}{isRep ? ' 🔁' : ''}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {salesHistory.repeated.size > 0 && (
                <p className="text-[10px] text-amber-fg">🔁 = منتج اتباع لهالعميل بأكتر من طلب (احتمال تكرار).</p>
              )}
            </div>
          )}

          {/* WhatsApp message (editable + AI) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold text-muted">💬 رسالة المتابعة</p>
              <button onClick={writeWithAi} disabled={aiLoading}
                className="text-[11px] font-bold text-navy bg-navy/10 px-2 py-1 rounded-lg hover:bg-navy/15 transition disabled:opacity-50">
                {aiLoading ? '… لوزي تكتب' : '✨ لوزي تكتب الرسالة'}
              </button>
            </div>
            <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={4}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30 resize-none" />
            {aiOptions.length > 1 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted">اقتراحات لوزي — دوسي على وحدة تاخديها بدل الحالية:</p>
                <div className="flex flex-col gap-1">
                  {aiOptions.map((opt, i) => (
                    <button key={i} onClick={() => setMsg(opt)}
                      className={`text-start text-[11px] rounded-lg px-2 py-1.5 border transition truncate ${
                        opt === msg ? 'border-teal bg-teal/10 text-teal-700 font-bold' : 'border-border/60 text-muted hover:bg-surface-alt'
                      }`}>
                      {opt.slice(0, 70)}{opt.length > 70 ? '…' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              {waSend && (
                <a href={waSend} target="_blank" rel="noreferrer" onClick={() => logConsumerWaOutreach(true)}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition"
                  style={{ background: '#25D366' }}>
                  <WaIcon /> إرسال واتساب
                </a>
              )}
              {waPlain && (
                <a href={waPlain} target="_blank" rel="noreferrer" onClick={() => logConsumerWaOutreach(false)}
                  className="px-4 py-2.5 rounded-xl bg-green-bg text-green-fg text-sm font-bold flex items-center justify-center hover:opacity-80 transition">
                  محادثة فارغة
                </a>
              )}
            </div>
            {canOfficialWa && (
              <button onClick={openOfficialWa}
                className="w-full py-2 rounded-xl border border-teal text-teal-700 text-xs font-bold flex items-center justify-center gap-2 hover:bg-teal/10 transition">
                💬 فتح شات واتساب الرسمي (يضل عندك)
              </button>
            )}
          </div>

          {/* دعوات الانتشار — الإحالة */}
          <div className="space-y-2 bg-teal/5 border border-teal/20 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold text-teal-700">🎁 دعوة صديقة (إحالة)</p>
              {refCode && (
                <button onClick={writeReferralWithAi} disabled={refAiLoading}
                  className="text-[11px] font-bold text-navy bg-navy/10 px-2 py-1 rounded-lg hover:bg-navy/15 transition disabled:opacity-50">
                  {refAiLoading ? '… لوزي تكتب' : '✨ لوزي تكتب الدعوة'}
                </button>
              )}
            </div>
            {!refCode ? (
              <button onClick={loadReferralCode} disabled={refLoading}
                className="w-full py-2 rounded-xl border-2 border-teal/40 text-teal-700 text-xs font-bold hover:bg-teal/10 transition disabled:opacity-50">
                {refLoading ? '...' : '🔗 ولّد كود إحالة لهالعميلة'}
              </button>
            ) : (
              <>
                <p className="text-[11px] text-muted">كودها: <span className="font-mono font-bold text-teal-700" dir="ltr">{refCode.code}</span> — بتشاركه مع صديقة، وكل ما حدا يطلب فيه إلها وإله خصم.</p>
                <textarea value={refMsg} onChange={e => setRefMsg(e.target.value)} rows={3}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30 resize-none" />
                {waReferral && (
                  <a href={waReferral} target="_blank" rel="noreferrer"
                    className="w-full py-2.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition"
                    style={{ background: '#25D366' }}>
                    <WaIcon /> إرسال دعوة واتساب
                  </a>
                )}
              </>
            )}
            {/* عميلة جديدة (طلب واحد أو أقل) — احتمال إنها إجت بكود إحالة */}
            {c.orders_count <= 1 && (
              <div className="pt-2 border-t border-teal/10 space-y-1.5">
                <p className="text-[11px] text-muted">إذا إجت بكود من صديقة، سجّليه هون:</p>
                <div className="flex gap-2">
                  <input value={redeemInput} onChange={e => setRedeemInput(e.target.value.toUpperCase())}
                    placeholder="LOWES-XXXX" dir="ltr"
                    className="flex-1 border border-border rounded-xl px-3 py-2 text-sm font-mono bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
                  <button onClick={redeemCode} disabled={redeemBusy || !redeemInput.trim()}
                    className="px-3 py-2 rounded-xl bg-teal text-navy text-sm font-bold disabled:opacity-40">تسجيل</button>
                </div>
                {redeemResult && (
                  <p className={`text-[11px] font-bold ${redeemResult.ok ? 'text-teal-700' : 'text-red-fg'}`}>
                    {redeemResult.ok ? `✅ تحويل ناجح — إحالة من ${redeemResult.referrerName || 'صديقة'}!` : `❌ ${redeemResult.error}`}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <p className="text-xs font-extrabold text-muted">📝 ملاحظات تذكّرنا بالعميل</p>
            <div className="flex gap-2">
              <input value={text} onChange={e => setText(e.target.value)}
                placeholder="بشرة جافة · تحب الترطيب · اشترت لابنتها..."
                className="flex-1 border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
              <button onClick={save} disabled={saving || !text.trim()}
                className="px-3 py-2 rounded-xl bg-teal text-navy text-sm font-bold disabled:opacity-40">+</button>
            </div>
            {notes.length === 0 ? (
              <p className="text-[11px] text-muted text-center py-1">لا ملاحظات بعد.</p>
            ) : notes.map(n => (
              <div key={n.id} className="bg-surface-alt rounded-xl px-3 py-2">
                <p className="text-sm text-text">{n.note}</p>
                <p className="text-[10px] text-muted mt-0.5">{n.author || '—'} · {n.created_at ? new Date(n.created_at).toLocaleDateString('ar', {day:'numeric',month:'short'}) : ''}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
function monthLabel(key) {
  const [y, m] = String(key).split('-').map(Number);
  return `${MONTHS_AR[(m || 1) - 1]} ${y}`;
}

// أرشيف العملاء مجمّعاً حسب شهر آخر تسليم — «تسليمات شهر كذا» (يستثني الشهر الحالي).
function MonthlyArchive({ market, brand, sellerNames, onOpen }) {
  const [months, setMonths]   = useState(null);   // [{month,count}]
  const [error, setError]     = useState(null);
  const [openMonth, setOpen]  = useState(null);
  const [cache, setCache]     = useState({});      // month → customers[]
  const [loadingMonth, setLoadingMonth] = useState(null);

  useEffect(() => {
    setMonths(null); setError(null); setOpen(null); setCache({});
    listCustomerMonths({ market, brand, sellerNames })
      .then(setMonths)
      .catch(e => setError(e.message));
  }, [market, brand, sellerNames]);

  const toggle = async (mk) => {
    if (openMonth === mk) { setOpen(null); return; }
    setOpen(mk);
    if (!cache[mk]) {
      setLoadingMonth(mk);
      try {
        const { start, end } = monthRange(mk);
        const data = await listCustomers({
          market, brand, sellerNames, sort: 'recent',
          monthStart: start, monthEnd: end, limit: 2000,
        });
        setCache(p => ({ ...p, [mk]: data }));
      } catch (e) { setCache(p => ({ ...p, [mk]: [] })); setError(e.message); }
      finally { setLoadingMonth(null); }
    }
  };

  if (error) return (
    <div className="bg-red-bg border border-red/20 text-red-fg rounded-xl px-4 py-3 text-sm">{error}</div>
  );
  if (months === null) return (
    <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-surface-alt animate-pulse rounded-2xl" />)}</div>
  );
  if (months.length === 0) return (
    <div className="text-center py-16 text-muted border-2 border-dashed border-border rounded-2xl">
      <p className="text-4xl mb-3">🗂️</p>
      <p className="text-sm font-bold">لا أشهر مكتملة للأرشفة بعد</p>
      <p className="text-xs mt-1">الشهر الحالي غير المكتمل لا يُؤرشف.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {months.map(({ month, count }) => {
        const isOpen = openMonth === month;
        const custs  = cache[month];
        return (
          <div key={month} className="border border-border rounded-2xl overflow-hidden bg-surface">
            <button onClick={() => toggle(month)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-alt transition text-right">
              <span className="flex items-center gap-2 font-bold text-text text-sm">
                <span className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                📦 تسليمات شهر {monthLabel(month)}
              </span>
              <span className="text-xs font-bold text-teal bg-teal/10 rounded-lg px-2 py-0.5 tabular-nums shrink-0">
                {count.toLocaleString('en-US')} عميل
              </span>
            </button>
            {isOpen && (
              <div className="p-3 border-t border-border/40 bg-surface-alt/30">
                {loadingMonth === month ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[1,2,3].map(i => <div key={i} className="h-28 bg-surface-alt animate-pulse rounded-2xl" />)}
                  </div>
                ) : (custs && custs.length > 0) ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {custs.map(c => <CustomerCard key={c.phone_key} c={c} onOpen={onOpen} />)}
                  </div>
                ) : (
                  <p className="text-center py-6 text-muted text-xs">لا عملاء في هذا الشهر.</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CustomerCard({ c, onOpen, campaignMode, selected, onToggleSelect, alreadySent }) {
  const mkt = custMarket(c);
  const totals = [];
  if (Number(c.total_syp) > 0) totals.push(`${fmt(c.total_syp)} SYP`);
  if (Number(c.total_usd) > 0) totals.push(`${fmt(c.total_usd)} USD`);
  if (Number(c.total_try) > 0) totals.push(`${fmt(c.total_try)} TRY`);
  const wa = customerWaLink(c.phone, mkt);
  const idle = daysSince(c.last_order);

  const handleClick = () => campaignMode ? onToggleSelect(c) : onOpen(c);

  return (
    <div className={`bg-surface border rounded-2xl p-4 space-y-2 cursor-pointer transition ${selected ? 'border-teal ring-2 ring-teal/30' : 'border-border hover:border-teal/40'}`} onClick={handleClick}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-start gap-2">
          {campaignMode && (
            <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 ${selected ? 'bg-teal border-teal text-navy' : 'border-border'}`}>
              {selected ? '✓' : ''}
            </span>
          )}
          <div className="min-w-0">
            <p className="font-bold text-text text-sm truncate flex items-center gap-1.5">
              {c.stars > 0 && <span className="me-1">{starLabel(c.stars)}</span>}{c.name || 'عميل'}
              {campaignMode && alreadySent && (
                <span className="text-[9px] font-bold text-teal-700 bg-teal/10 border border-teal/30 rounded px-1 py-0.5 shrink-0">✅ استلم/ت الحملة</span>
              )}
            </p>
            <p className="text-[11px] text-muted" dir="ltr">{c.phone}</p>
            {c.city && <p className="text-[11px] text-muted">{c.city}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!campaignMode && wa && (
            <a href={wa} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              className="w-9 h-9 rounded-xl bg-green-bg flex items-center justify-center text-green-fg hover:opacity-80 transition" title="واتساب">
              <WaIcon />
            </a>
          )}
          <div className="text-center">
            <div className="text-lg font-extrabold text-teal tabular-nums leading-none">{c.orders_count}</div>
            <div className="text-[10px] text-muted">طلب</div>
          </div>
        </div>
      </div>
      {totals.length > 0 && <p className="text-xs font-bold text-text">{totals.join(' · ')}</p>}
      <div className="flex items-center justify-between text-[10px] text-muted pt-1 border-t border-border/40">
        <span>{(c.sellers||[]).length > 1 ? `🔀 ${(c.sellers||[]).length} بائع` : `👤 ${(c.sellers||[])[0] || '—'}`}</span>
        {idle >= 90 ? <span className="text-red-fg font-bold">💔 استرجاع ({idle}ي)</span>
          : idle >= 30 ? <span className="text-amber-fg font-bold">⏰ متابعة ({idle}ي)</span>
          : <span>آخر طلب: {c.last_order ? new Date(c.last_order).toLocaleDateString('ar', {month:'short', year:'2-digit'}) : '—'}</span>}
      </div>
    </div>
  );
}

export default function CustomersScreen() {
  const { name: userName, role } = useAuth();
  const isAdmin = role === 'admin';
  // تصدير Meta Ads: الإدارة (أدمن/مدير) + الميديا باير — كلهم بحاجته لرفع الأرقام
  // كـCustom Audience وبناء حملات استهداف. كان محصوراً بـ'admin' فقط سابقاً.
  const canExportMeta = role === 'admin' || role === 'manager' || role === 'media_buyer';

  const [section, setSection]   = useState('syria');
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [search, setSearch]     = useState('');
  const [vipOnly, setVipOnly]   = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [segment, setSegment]   = useState('all');
  const [sort, setSort]         = useState('orders');
  const [selected, setSelected] = useState(null);
  const [totalCount, setTotalCount] = useState(null); // true section total
  const [exporting, setExporting] = useState(false);
  const [partnerNames, setPartnerNames] = useState([]);
  const [archive, setArchive]   = useState(false);    // الأرشيف الشهري
  const [refStats, setRefStats] = useState(null);     // {generated, redeemed} — KPI الإحالة

  // وضع الحملة الجماعية — بس لأسواق غير سوريا (واتساب الرسمي محظور كلياً على
  // +963، خطأ Twilio 21408 — راجع 09_Decision_Register.md § D-022).
  const [campaignMode, setCampaignMode] = useState(false);
  const [campaignChoice, setCampaignChoice] = useState(CAMPAIGNS[0].key);
  const [selectedPhones, setSelectedPhones] = useState(() => new Set());
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [campaignProgress, setCampaignProgress] = useState(null); // {done,total,sent,failed}
  const [sentPhones, setSentPhones] = useState(() => new Set()); // مين استلم حملة "كثافة الشعر" قبل هلق
  const [sentPhonesReady, setSentPhonesReady] = useState(false); // false = لسا ما تأكدنا من سجل الاستبعاد — ممنوع الإرسال بهالحالة (خطر تكرار)
  const [sentPhonesFailed, setSentPhonesFailed] = useState(false); // فشل تحميل سجل "المُرسَل لهم" — لازم نمنع الإرسال بدل ما نفترض الكل جديد
  const [campaignStats, setCampaignStats] = useState(null); // {sent, failed, lastSentAt}
  const [excludeSent, setExcludeSent] = useState(true); // افتراضياً استبعد المُرسَل لهم — منع إزعاج نفس العميل مرتين

  // Load accepted shift partners
  useEffect(() => {
    if (!userName) return;
    supabase.from('shift_partners')
      .select('requester, partner')
      .eq('status', 'accepted')
      .or(`requester.eq.${userName},partner.eq.${userName}`)
      .then(({ data }) => {
        const names = (data ?? []).map(r => r.requester === userName ? r.partner : r.requester);
        setPartnerNames(names);
      })
      .catch(() => {});
  }, [userName]);

  const sec = SECTIONS.find(s => s.key === section) || SECTIONS[0];
  const myNames = useMemo(() => {
    if (!userName) return null;
    const first = String(userName).trim().split(/\s+/)[0];
    const aliases = getSellerAliases(userName);
    // Include shift partners so their customers appear in «عملائي»
    const partnerAliases = partnerNames.flatMap(p => {
      const pFirst = String(p).trim().split(/\s+/)[0];
      return [p, pFirst, ...getSellerAliases(p)];
    });
    return [...new Set([userName, first, ...aliases, ...partnerAliases])];
  }, [userName, partnerNames]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // شرائح idle (متابعة/معرّضون/استرجاع) تحتاج فلترة على مستوى القاعدة —
      // بدون هذا، سقف الجلب (400/600 صف مرتّبة بالأكثر طلباً) بيخفي أغلب
      // العملاء الخاملين (اللي أصلاً قليلي الطلبات) خلف الصفحة الأولى، فيظهر
      // "تحديد الكل" برقم أقل بكثير من الحقيقي (بق موثَّق سابقاً بجلسة 5 آب —
      // 346 ظاهرة مقابل 881 حقيقية). حساب التواريخ بنفس منطق daysSince/inSegment.
      const now = Date.now();
      const cutoff = (days) => new Date(now - days * 86400000).toISOString().slice(0, 10);
      let segFilter = {};
      if (segment === 'followup') segFilter = { maxLastOrder: cutoff(30) };
      else if (segment === 'winback') segFilter = { maxLastOrder: cutoff(90) };
      else if (segment === 'atrisk') segFilter = { maxLastOrder: cutoff(45), minLastOrder: cutoff(90), minOrdersCount: 2 };

      const data = await listCustomers({
        search, vipOnly, sort, market: sec.market, brand: sec.brand,
        sellerNames: mineOnly ? myNames : null,
        // شريحة idle مفعّلة → الفلترة صارت بالقاعدة، فالسقف يقدر يرتفع بأمان
        // (بيرجع بس المطابقين فعلياً، مو 400 عميل عشوائي بعدين تُفلتَر).
        limit: segment !== 'all' ? 5000 : (mineOnly ? 600 : 400),
        ...segFilter,
      });
      setRows(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [search, vipOnly, sort, mineOnly, myNames, sec.market, sec.brand, segment]);

  // True total for the section (independent of the 400-row display cap).
  useEffect(() => {
    countCustomers({ market: sec.market, brand: sec.brand }).then(setTotalCount).catch(() => setTotalCount(null));
  }, [sec.market, sec.brand]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  // KPI الإحالة — بس للأقسام اللي عندها market فعلي (سوريا/تركيا)، مش سترونغ/الكل.
  useEffect(() => {
    if (!sec.market) { setRefStats(null); return; }
    getReferralStats({ market: sec.market }).then(setRefStats).catch(() => setRefStats(null));
  }, [sec.market]);

  // mineOnly is applied server-side; segment is a client-side refinement.
  const displayed = useMemo(() => rows.filter(c => inSegment(c, segment)), [rows, segment]);

  // الحملة الجماعية مسموحة فقط لقسم "لويز تركيا" — الاستبعاد الصريح لسوريا
  // (D-022) والحماية من خلط أسواق بقسمي "سترونغ"/"الكل".
  const activeCampaign = CAMPAIGNS.find(c => c.key === campaignChoice) || CAMPAIGNS[0];
  const canCampaign = sec.market === 'turkey' && !archive && !!activeCampaign.contentSid;

  // حملات "audienceOf" (مثل عرض المتفاعلين) مقيَّدة بشريحة محسوبة سيرفرياً
  // (مين ردّ فعلاً على حملة سابقة) — null = لسا عم تحمّل، Set = جاهزة.
  // ⚠️ 14 آب 2026: بلاغ مالك مباشر (لقطة شاشة) — الشريحة رجّعت 299 عميل مؤهَّل
  // بس "تحديد الكل" ظهر 72 بس. السبب: campaignVisible كانت مبنية فوق
  // `displayed`، واللي جايّة أصلاً من `rows` المحمَّلة بحد أقصى 400 عميل
  // **مرتَّبين بالأكثر طلباً** (نفس سقف التصفّح العادي) — أي عميل بالـ299
  // مش ضمن أعلى 400 بالترتيب هيك (شائع: عميل جديد ردّ على تواصل ودّي بس ما
  // طلب كتير بعد) كان يختفي من القائمة الفعلية للحملة بصمت. الحل: نجيب
  // بيانات الـ299 مباشرة بـphone_keys (بلا سقف/ترتيب) بدل الاعتماد على
  // `displayed` المحدودة أصلاً لغرض التصفّح العادي.
  const [responderPhones, setResponderPhones] = useState(null);
  const [responderCustomers, setResponderCustomers] = useState([]);
  useEffect(() => {
    if (!activeCampaign.audienceOf) { setResponderPhones(null); setResponderCustomers([]); return; }
    let cancelled = false;
    setResponderPhones(null);
    getCampaignResponderPhoneKeys(activeCampaign.audienceOf)
      .then(async (set) => {
        if (cancelled) return;
        setResponderPhones(set);
        if (!set.size) { setResponderCustomers([]); return; }
        const full = await listCustomers({ phoneKeys: [...set], market: sec.market, brand: sec.brand }).catch(() => []);
        if (!cancelled) setResponderCustomers(full);
      })
      .catch(() => { if (!cancelled) { setResponderPhones(new Set()); setResponderCustomers([]); } });
    return () => { cancelled = true; };
  }, [activeCampaign.audienceOf, sec.market, sec.brand]);

  useEffect(() => { setCampaignMode(false); setSelectedPhones(new Set()); }, [section, archive]);
  useEffect(() => { setSelectedPhones(new Set()); }, [campaignChoice]);

  // مين استلم هالحملة (المختارة حالياً) قبل هلق + إحصاءات سريعة — يُحمَّل عند
  // دخول قسم تركيا أو تبديل الحملة، ويُعاد تحميله بعد أي إرسال.
  const loadCampaignData = useCallback(() => {
    if (!canCampaign) { setSentPhones(new Set()); setCampaignStats(null); setSentPhonesReady(false); setSentPhonesFailed(false); return; }
    setSentPhonesReady(false);
    setSentPhonesFailed(false);
    getCampaignSentPhones(activeCampaign.key)
      .then(set => { setSentPhones(set); setSentPhonesReady(true); })
      // فشل التحميل ما لازم يُعامَل متل "محدا استلم الحملة" — هيك كنا عم نبعت
      // لعملاء استلموا فعلاً لأن سجل الاستبعاد ضل فاضي بصمت (D-الحملة المكررة).
      .catch(() => { setSentPhonesFailed(true); setSentPhonesReady(false); });
    getCampaignStats(activeCampaign.key).then(setCampaignStats).catch(() => {});
  }, [canCampaign, activeCampaign.key]);
  useEffect(() => { loadCampaignData(); }, [loadCampaignData]);

  const toggleSelect = useCallback((c) => {
    setSelectedPhones(prev => {
      const next = new Set(prev);
      next.has(c.phone_key) ? next.delete(c.phone_key) : next.add(c.phone_key);
      return next;
    });
  }, []);

  // قاعدة المرشَّحين لوضع الحملة — عادةً `displayed` (سقف/ترتيب التصفّح
  // العادي)، بس حملة "audienceOf" تستخدم `responderCustomers` (الشريحة
  // الكاملة بلا سقف — راجع تعليق الإصلاح أعلاه) عشان ما نخسر عملاء مؤهَّلين
  // مش ضمن أعلى 400 بالترتيب الافتراضي.
  const campaignBaseList = (campaignMode && activeCampaign.audienceOf) ? responderCustomers : displayed;

  const selectedCustomers = useMemo(
    () => campaignBaseList.filter(c => selectedPhones.has(c.phone_key)),
    [campaignBaseList, selectedPhones],
  );

  // القائمة الفعلية بوضع الحملة — تستبعد المُرسَل لهم سابقاً افتراضياً (excludeSent)
  // حتى ما نزعج نفس العميل مرتين بنفس العرض. خارج وضع الحملة تبقى displayed كاملة.
  const campaignVisible = useMemo(
    () => (campaignMode && excludeSent) ? campaignBaseList.filter(c => !sentPhones.has(c.phone_key)) : campaignBaseList,
    [campaignBaseList, campaignMode, excludeSent, sentPhones],
  );

  // تحديد/إلغاء الكل ضمن التصفية الحالية (القسم + الفئة، مثلاً "💔 استرجاع") —
  // بدون هذا، حملة إعادة تنشيط لمئات العملاء الخاملين تعني ضغط كل بطاقة يدوياً
  // (غير عملي). تعمل على campaignVisible (بعد استبعاد المُرسَل لهم) لا rows الخام.
  const allFilteredSelected = campaignVisible.length > 0 && campaignVisible.every(c => selectedPhones.has(c.phone_key));
  const toggleSelectAllFiltered = useCallback(() => {
    setSelectedPhones(allFilteredSelected ? new Set() : new Set(campaignVisible.map(c => c.phone_key)));
  }, [campaignVisible, allFilteredSelected]);

  // تحديد أول N فقط ضمن التصفية الحالية — لدفعات مضبوطة يومياً (مثلاً 600)
  // بدل "تحديد الكل" يلي بياخد الشريحة كاملة (ممكن تكون آلاف) بضغطة وحدة.
  // طلب مالك 8 أغسطس 2026: تشغيل حملة "تواصل ودّي" بدفعات يومية محكومة.
  const [batchN, setBatchN] = useState(600);
  const selectFirstN = useCallback(() => {
    const n = Math.max(1, Math.min(batchN || 0, campaignVisible.length));
    setSelectedPhones(new Set(campaignVisible.slice(0, n).map(c => c.phone_key)));
  }, [campaignVisible, batchN]);

  const runCampaign = async () => {
    if (!selectedCustomers.length || sendingCampaign) return;
    if (CAMPAIGN_FROZEN) {
      alert('🚨 الإرسال الجماعي متوقّف مؤقتاً — Meta علّمت حساب واتساب "Lowes 2" بمشكلة "Sending spam" (خط الحملات جودته منخفضة). التجميد لحماية الحساب كامل (بما فيه الخط الرئيسي) لحد ما تتعافى الجودة. راجع 09_Decision_Register.md بـABOS.');
      return;
    }
    // منع صارم: لو سجل "مين استلم قبل" ما تأكّد تحميله (أو فشل)، ممنوع نبعت —
    // هيك كنا عم نضرب نفس العميل مرتين بصمت لما تفشل قراءة campaign_sends.
    if (excludeSent && !sentPhonesReady) {
      alert(sentPhonesFailed
        ? '⚠️ فشل تحميل سجل "مين استلم الحملة قبل" — الإرسال معطّل حالياً منعاً لتكرار الرسالة. جرّب "إعادة تحميل" أو تواصل مع الدعم.'
        : '⏳ لسا عم يتحقق من سجل "مين استلم الحملة قبل" — انتظر لحظة وحاول مرة ثانية.');
      return;
    }
    // بمعدل 2.5 ثانية بين كل رسالة (حماية Quality Rating عند Meta) — دفعة كبيرة
    // تاخد وقت حقيقي، والموظف/ة لازم تخلّي التبويب مفتوح لحد ما تخلص.
    const etaMin = Math.ceil((selectedCustomers.length * 2.5) / 60);
    // متغيّرات إضافية (لو الحملة محتاجتها، مثلاً {{2}}/{{3}} بعرض المتفاعلين)
    // — تُحسَب هون (لحظة الإرسال الفعلي) عشان تاريخ الانتهاء يطلع صحيح حتى لو
    // الصفحة كانت مفتوحة من قبل. تُعرَض بنص التأكيد عشان الموظف/ة يشوف بالضبط
    // شو رح ينبعت قبل ما يأكّد.
    const extraVars = typeof activeCampaign.extraVars === 'function' ? activeCampaign.extraVars() : activeCampaign.extraVars;
    const extraVarsPreview = extraVars ? `\nنص العرض: "${extraVars['2'] || ''}" — لغاية ${extraVars['3'] || ''}` : '';
    if (!window.confirm(`بدك تبعت رسالة "${activeCampaign.label}" لـ${selectedCustomers.length} عميل عبر واتساب؟${extraVarsPreview}\nرح تاخد تقريباً ${etaMin} دقيقة (خلّي هالتبويب مفتوح). ما في تراجع بعد الإرسال.`)) return;
    setSendingCampaign(true);
    setCampaignProgress({ done: 0, total: selectedCustomers.length, sent: 0, failed: 0 });
    try {
      const { sent, failed } = await sendBulkCampaign(selectedCustomers, activeCampaign.contentSid, {
        delayMs: 2500, extraVars,
        campaignKey: activeCampaign.key, campaignLabel: activeCampaign.label, sentBy: userName,
        onProgress: (done, total, result) => setCampaignProgress(p => ({
          done, total,
          sent: p.sent + (result.ok ? 1 : 0),
          failed: p.failed + (result.ok ? 0 : 1),
        })),
      });
      alert(`✅ انتهت الحملة — انبعت ${sent}، فشل ${failed}.`);
      setSelectedPhones(new Set());
      loadCampaignData(); // حدّث شارات/إحصاءات "استلم الحملة" فوراً
    } catch (e) {
      alert('خطأ بالحملة: ' + e.message);
    } finally {
      setSendingCampaign(false);
    }
  };

  const stats = useMemo(() => ({
    total: displayed.length,
    due: displayed.filter(r => daysSince(r.last_order) >= 30).length,
    vip: displayed.filter(r => r.stars >= 2).length,
  }), [displayed]);

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-text">⭐ العملاء والأرشيف</h1>
          <p className="text-xs text-muted mt-0.5">
            {archive
              ? 'الأرشيف الشهري — العملاء حسب شهر آخر تسليم (الشهر الحالي غير المكتمل مستثنى)'
              : <>
                  {totalCount != null ? `${totalCount.toLocaleString('en-US')} عميل في القسم` : `${stats.total} عميل`}
                  {totalCount != null && totalCount > rows.length && ` · معروض ${stats.total} (ابحث للوصول للبقية)`}
                  {' · '}{stats.due} للمتابعة · {stats.vip} VIP
                  {refStats && refStats.generated > 0 && ` · 🎁 ${refStats.generated} إحالة (${refStats.redeemed} تحوّلت لطلب)`}
                </>}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {canCampaign && (
            <button onClick={() => {
              if (CAMPAIGN_FROZEN) { alert('🚨 الحملات الجماعية متوقفة مؤقتاً — مشكلة "Sending spam" بحساب واتساب "Lowes 2" عند Meta. راجع 09_Decision_Register.md.'); return; }
              setCampaignMode(v => !v); setSelectedPhones(new Set());
            }}
              className={`px-3 py-2.5 rounded-xl text-sm font-bold border-2 transition ${CAMPAIGN_FROZEN ? 'border-red-400 text-red-500 opacity-70' : campaignMode ? 'border-teal bg-teal text-navy' : 'border-border text-muted hover:border-teal/40'}`}
              title={CAMPAIGN_FROZEN ? 'متوقفة مؤقتاً — مشكلة spam عند Meta' : 'تحديد عملاء وإرسال حملة واتساب جماعية'}>
              {CAMPAIGN_FROZEN ? '🚨 الحملات متوقفة مؤقتاً' : campaignMode ? '✕ إلغاء التحديد' : '📢 وضع الحملة'}
            </button>
          )}
          <button onClick={() => setArchive(v => !v)}
            className={`px-3 py-2.5 rounded-xl text-sm font-bold border-2 transition ${archive ? 'border-navy bg-navy text-white' : 'border-border text-muted hover:border-navy/40'}`}
            title="عرض العملاء مؤرشفين حسب الشهر">
            {archive ? '← العملاء' : '🗄️ الأرشيف الشهري'}
          </button>
        </div>
      </div>

      {campaignMode && (
        <div className="bg-teal/10 border border-teal/30 rounded-xl px-3 py-2 text-xs text-teal font-bold space-y-2">
          <div className="flex items-center gap-2 flex-wrap pb-2 border-b border-teal/20">
            <span className="shrink-0">📋 القالب:</span>
            {CAMPAIGNS.map(cmp => (
              <button key={cmp.key} onClick={() => setCampaignChoice(cmp.key)} title={cmp.hint}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border-2 transition ${campaignChoice === cmp.key ? 'border-teal bg-teal text-navy' : 'border-teal/30 text-teal hover:border-teal/60'}`}>
                {cmp.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span>📢 وضع الحملة نشط — دوس على أي بطاقة عميل لتحديدها/إلغاء تحديدها. قالب &quot;{activeCampaign.label}&quot; (معتمَد من Meta) رح ينبعت للمحددين فقط.
              {activeCampaign.audienceOf && (
                responderPhones === null
                  ? ' ⏳ جارٍ حساب شريحة المتفاعلين...'
                  : ` 🎯 مقيَّدة بمن ردّوا فعلاً على الحملة السابقة (${responderPhones.size} عميل مؤهَّل).`
              )}
            </span>
            {campaignVisible.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <input type="number" min={1} max={campaignVisible.length} value={batchN}
                  onChange={e => setBatchN(Number(e.target.value) || 0)}
                  className="w-16 px-1.5 py-1 rounded-lg border border-teal/40 bg-surface text-text text-[11px] text-center" />
                <button onClick={selectFirstN} disabled={excludeSent && !sentPhonesReady}
                  className="px-2.5 py-1 rounded-lg bg-teal/80 text-navy text-[11px] font-bold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed">
                  ✓ تحديد أول {Math.min(batchN || 0, campaignVisible.length)}
                </button>
                <button onClick={toggleSelectAllFiltered} disabled={excludeSent && !sentPhonesReady}
                  className="px-2.5 py-1 rounded-lg bg-teal text-navy text-[11px] font-bold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed">
                  {allFilteredSelected ? `✕ إلغاء تحديد الكل (${campaignVisible.length})` : `✓ تحديد الكل (${campaignVisible.length}${segment !== 'all' ? ' — ' + SEGMENTS.find(s => s.key === segment)?.label : ''})`}
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap font-normal text-[11px] pt-2 border-t border-teal/20">
            <span>
              {campaignStats ? `📊 سبق وانبعتلها الحملة: ${campaignStats.sent} عميل${campaignStats.failed ? ` (+${campaignStats.failed} فشلوا)` : ''}${campaignStats.lastSentAt ? ` — آخر إرسال ${new Date(campaignStats.lastSentAt).toLocaleDateString('ar', { day: 'numeric', month: 'short' })}` : ''}${campaignStats.converted ? ` — ✅ ${campaignStats.converted} اشترت (مجموع ${fmt(campaignStats.revenue)}₺)` : ''}` : '⏳ جارٍ تحميل سجل الحملة...'}
            </span>
            <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
              <input type="checkbox" checked={excludeSent} onChange={e => setExcludeSent(e.target.checked)} className="rounded" />
              🚫 استبعد اللي انبعتلهم قبل
            </label>
          </div>
          {excludeSent && sentPhonesFailed && (
            <div className="flex items-center justify-between gap-2 flex-wrap font-bold text-[11px] pt-2 border-t border-red-300 text-red-700">
              <span>⚠️ فشل تحميل سجل &quot;مين استلم قبل&quot; — الإرسال معطّل الآن منعاً لتكرار الرسالة على نفس العميل.</span>
              <button onClick={loadCampaignData} className="px-2.5 py-1 rounded-lg bg-red-600 text-white hover:opacity-90 transition">🔄 إعادة تحميل</button>
            </div>
          )}
          {excludeSent && !sentPhonesReady && !sentPhonesFailed && (
            <div className="font-normal text-[11px] pt-2 border-t border-teal/20 text-muted">⏳ عم يتحقق من سجل &quot;مين استلم قبل&quot;...</div>
          )}
        </div>
      )}

      {/* Section tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 border-2 transition
              ${section === s.key ? 'border-navy bg-navy text-white' : 'border-border text-muted hover:border-navy/40'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Meta export — الإدارة + الميديا باير. سوريا/تركيا حسب market، سترونغ
          حسب brand (عملاؤها بتركيا فعلياً رغم أنها بلا market مضبوط بالقسم). */}
      {canExportMeta && (section === 'turkey' || section === 'syria' || section === 'strong') && (
        <div className="flex gap-2 items-center bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl px-3 py-2">
          <span className="text-xs font-bold text-blue-700 dark:text-blue-300 flex-1">📊 تصدير Meta Ads ({sec.label})</span>
          <button
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                const params = section === 'strong' ? { brand: 'strong', country: 'turkey' } : { market: sec.market };
                const n = await exportMetaCSV({ vipOnly: false, ...params });
                alert(`✅ تم تصدير ${n.toLocaleString()} رقم (الكامل)`);
              } catch { alert('خطأ في التصدير'); }
              finally { setExporting(false); }
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition">
            {exporting ? '...' : '🌍 كامل'}
          </button>
          <button
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                const params = section === 'strong' ? { brand: 'strong', country: 'turkey' } : { market: sec.market };
                const n = await exportMetaCSV({ vipOnly: true, ...params });
                alert(`✅ تم تصدير ${n.toLocaleString()} رقم (VIP)`);
              } catch { alert('خطأ في التصدير'); }
              finally { setExporting(false); }
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition">
            {exporting ? '...' : '💎 VIP فقط'}
          </button>
        </div>
      )}

      {/* Monthly archive view */}
      {archive ? (
        <MonthlyArchive
          market={sec.market} brand={sec.brand}
          sellerNames={mineOnly ? myNames : null}
          onOpen={setSelected}
        />
      ) : (
      <>
      {/* Search + filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 بحث بالاسم أو الهاتف..."
          className="flex-1 min-w-[150px] border border-border rounded-xl px-3 py-2.5 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
        <select value={segment} onChange={e => setSegment(e.target.value)}
          className="border border-border rounded-xl px-2 py-2.5 text-xs font-bold bg-surface text-text focus:outline-none shrink-0">
          {SEGMENTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)}
          className="border border-border rounded-xl px-2 py-2.5 text-xs font-bold bg-surface text-text focus:outline-none shrink-0">
          <option value="orders">↕ الأكثر طلباً</option>
          <option value="recent">🕒 الأحدث</option>
          <option value="oldest">📅 الأقدم</option>
          <option value="name">🔤 الاسم</option>
        </select>
        <button onClick={() => setMineOnly(v => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition shrink-0 ${mineOnly ? 'border-teal bg-teal text-navy' : 'border-border text-muted hover:border-teal/40'}`}>
          👤 عملائي
        </button>
        <button onClick={() => setVipOnly(v => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition shrink-0 ${vipOnly ? 'border-amber bg-amber-bg text-amber-fg' : 'border-border text-muted hover:border-amber/40'}`}>
          ⭐ VIP
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{[1,2,3,4,5,6].map(i => <div key={i} className="h-32 bg-surface-alt animate-pulse rounded-2xl" />)}</div>
      ) : error ? (
        <div className="bg-red-bg border border-red/20 text-red-fg rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span><button onClick={load} className="underline text-xs">إعادة</button>
        </div>
      ) : campaignVisible.length === 0 ? (
        <div className="text-center py-16 text-muted border-2 border-dashed border-border rounded-2xl">
          <p className="text-4xl mb-3">👤</p>
          <p className="text-sm font-bold">{campaignMode && excludeSent ? 'كل عملاء هالتصفية استلموا الحملة قبل هلق 🎉' : 'لا عملاء مطابقون'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {campaignVisible.map(c => (
            <CustomerCard key={c.phone_key} c={c} onOpen={setSelected}
              campaignMode={campaignMode} selected={selectedPhones.has(c.phone_key)} onToggleSelect={toggleSelect}
              alreadySent={sentPhones.has(c.phone_key)} />
          ))}
        </div>
      )}
      </>
      )}

      {campaignMode && selectedCustomers.length > 0 && (
        <div className="fixed bottom-16 sm:bottom-4 inset-x-4 z-40 max-w-lg mx-auto bg-navy text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center justify-between gap-3">
          {sendingCampaign ? (
            <span className="text-sm font-bold flex-1">
              📤 عم يبعت... {campaignProgress?.done}/{campaignProgress?.total}
              {' '}(✅ {campaignProgress?.sent} · ❌ {campaignProgress?.failed})
            </span>
          ) : (
            <>
              <span className="text-sm font-bold">{selectedCustomers.length} عميل محدد</span>
              <button onClick={runCampaign}
                className="px-4 py-2 rounded-xl bg-teal text-navy text-sm font-bold hover:opacity-90 transition">
                📢 إرسال الحملة
              </button>
            </>
          )}
        </div>
      )}

      {selected && <CustomerModal c={selected} sellerName={userName} onClose={() => setSelected(null)} />}
    </div>
  );
}
