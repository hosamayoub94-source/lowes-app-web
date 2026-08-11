// =============================================================
// AdminWhatsAppScreen — محادثات واتساب (رقم لوويز الرسمي +13204416777).
//   قائمة محادثات (يسار، مقسّمة تتبّع طلبات/محادثات) + محادثة مفتوحة
//   (يمين) + رد نصي/صوتي/صورة مباشر. يقرأ/يكتب على جدول whatsapp_messages
//   بمشروع Supabase آخر — راجع src/services/whatsappService.js للتفاصيل.
//   محميّة admin/manager.
//
// 7 أغسطس 2026 — إعادة تصميم بصري/UX (طلب مالك: "حسّها مش بروفشنال، غليظة
// عالموبايل"). كل الـstate/handlers/منطق تجاري بهالملف بقي حرفياً بلا تغيير
// — فقط الـJSX تحوّل لتركيب مكوّنات عرض من src/screens/admin/whatsapp/
// (يستخدموا نظام التصميم الجاهز Button/Avatar/Badge/BottomSheet/EmptyState
// الموجود أصلاً بالتطبيق بس ما كان مستخدَم بهالشاشة). التفاصيل والمنطق
// الكامل موثّقة بخطة الجلسة.
// =============================================================
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import { useToast } from '@hooks/useToast';
import { ROLES } from '@data/teams';
import { Button, EmptyState, Spinner } from '@components/ui';
import {
  fetchWhatsAppMessages, sendWhatsAppReply, uploadWhatsAppMedia,
  deleteWhatsAppConversation, deleteWhatsAppMessage, transferWhatsAppConversation,
  fetchWhatsAppOwners, claimWhatsAppConversation, setWhatsAppConversationOwner,
  normalizeWaPhone, formatWaBody, isOrderTrackingBody, isCampaignBody, extractTemplateName, QUICK_REPLIES, WA_LINES,
  TRACKING_QUICK_REPLIES, getLatestOrderForWaPhone, trackingLinkMessage,
  setConversationTags, SUGGESTED_TAGS,
} from '@services/whatsappService';
import { listActiveProfiles } from '@services/authService';
import { WhatsAppAnalyticsPanel } from './whatsapp/AnalyticsPanel';
import { ThreadListSection } from './whatsapp/ThreadListSection';
import { ThreadSearchBar } from './whatsapp/ThreadSearchBar';
import { ChatHeader } from './whatsapp/ChatHeader';
import { TagBar } from './whatsapp/TagBar';
import { ReassignSheet } from './whatsapp/ReassignSheet';
import { TransferSheet } from './whatsapp/TransferSheet';
import { QuickRepliesSheet } from './whatsapp/QuickRepliesSheet';
import { MessageBubble } from './whatsapp/MessageBubble';
import { DateDivider } from './whatsapp/DateDivider';
import { TrackingBanner } from './whatsapp/TrackingBanner';
import { Composer } from './whatsapp/Composer';
import { QuoteReplyBar } from './whatsapp/QuoteReplyBar';
import { LineSwitcher } from './whatsapp/LineSwitcher';
import { NewChatBar } from './whatsapp/NewChatBar';

const MAIN_LINE = 'main'; // خط افتراضي عند فتح الشاشة — راجع WA_LINES لكل الخطوط المتاحة

// فرق تشترك برؤية محادثات بعضها البعض — طلب مالك 5 أغسطس 2026: "ديانا وسالي
// كشخص واحد" (بدل تقسيم صارم نص/نص كل وحدة تشوف بس محادثاتها). أي محادثة
// عند أي عضو بالفريق تظهر للكل — بلا حاجة لتغيير المالك الفعلي بقاعدة
// البيانات. ⚠️ ثابت بالكود مؤقتاً (دَين تقني) — لو صارت الفرق أكتر/متغيّرة
// بشكل متكرر، ينقل هذا لإعداد يُدار من لوحة الأدمن بدل تعديل الكود مباشرة.
const WHATSAPP_TEAMS = [
  ['Diana Hasan', 'Sally Teba', 'Fatima Ayoub'],
];
function teammatesOf(name) {
  const team = WHATSAPP_TEAMS.find(t => t.includes(name));
  return team || [name];
}

// حصر كل موظف/ة بخط واحد بس — طلب مالك 9 أغسطس 2026: هيا (تتبّع طلبات
// تركيا) ما إلها شغل بخط الحملات فبده ينحجب عنها كلياً ("حتى ما تتشتت")،
// وفريق الحملات (ديانا/سالي/فاطمة) بالعكس ما إلهم شغل بالخط الرئيسي فبده
// ينحجب عنهم هنن. أي موظف/ة مش مذكورة هون (أو أدمن/مدير) بتضل تشوف كلا
// الخطين متل قبل — القيد هون سلبي فقط لأسماء محدَّدة صراحة. ⚠️ نفس دَين
// WHATSAPP_TEAMS التقني (ثابت بالكود مؤقتاً) — لو تكرر هالنمط لموظفين
// جداد، الأفضل ينقل لإعداد صلاحيات فعلي بدل تعديل الكود بكل مرة.
const LINE_ACCESS = {
  'Haya Almarouf': ['main'],
  'Diana Hasan': ['campaign'],
  'Sally Teba': ['campaign'],
  'Fatima Ayoub': ['campaign'],
};

// واتساب (Meta) بيرفض أي صوت مش Ogg/Opus حقيقي بخطأ Twilio 63021 (Channel
// invalid content error) — تأكَّد هذا حياً: حتى MediaRecorder بصيغة
// audio/mp4 "الافتراضية" بكروم رجعت نفس الخطأ. المتصفح نفسه ما بيقدر يسجّل
// Ogg/Opus حقيقي بشكل موثوق عبر MediaRecorder — لازم Encoder مخصَّص. نحمّل
// مكتبة opus-recorder (WASM Opus encoder حقيقي) من CDN عند أول استخدام.
const OPUS_RECORDER_JS = 'https://cdn.jsdelivr.net/npm/opus-recorder@8.0.5/dist/recorder.min.js';
const OPUS_ENCODER_WORKER = 'https://cdn.jsdelivr.net/npm/opus-recorder@8.0.5/dist/encoderWorker.min.js';
let opusRecorderPromise = null;
function loadOpusRecorder() {
  if (window.Recorder) return Promise.resolve(window.Recorder);
  if (!opusRecorderPromise) {
    opusRecorderPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = OPUS_RECORDER_JS;
      s.onload = () => resolve(window.Recorder);
      s.onerror = () => reject(new Error('تعذّر تحميل مكتبة تسجيل الصوت'));
      document.head.appendChild(s);
    });
  }
  return opusRecorderPromise;
}

function normalizePhoneInput(raw) {
  let p = String(raw || '').replace(/[^\d+]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (!p.startsWith('+')) p = '+' + p;
  return p;
}

// فاصل تاريخ ("اليوم"/"أمس"/تاريخ) بين رسائل أيام مختلفة — "متل الواتساب"
// (طلب مالك 5 أغسطس 2026).
function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'اليوم';
  if (sameDay(d, yesterday)) return 'أمس';
  return d.toLocaleDateString('ar', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function AdminWhatsAppScreen() {
  const { id: userId, name: userName, role } = useAuth();
  const location = useLocation();
  const isManager = role === ROLES.ADMIN || role === ROLES.MANAGER; // يشوفوا كل المحادثات — الباقي يشوفوا بس محادثاتهم
  const toast = useToast();
  const [messages, setMessages] = useState(null); // null = لسا ما حمّل
  const [owners, setOwners] = useState([]); // [{ phone, to_number, owner_id, owner_name }]
  const [openPhone, setOpenPhone] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // خطّان فعليان الآن (5 أغسطس 2026): main = عملاء/تتبّع، campaign = حملات
  // جماعية — كل واحد رقم Twilio مستقل مسجَّل ONLINE. المدير/الأدمن فقط يقدر
  // يبدّل (الموظف العادي بيشتغل دائماً على main — أبسط، وحملات ديانا/سالي
  // أصلاً بترسل عبر sendBulkCampaign مش من هالشاشة).
  const [line, setLine] = useState(MAIN_LINE);
  // الخطوط المسموحة لهالمستخدم/ة تحديداً — أدمن/مدير أو أي اسم مش بـLINE_ACCESS
  // يشوف الاثنين متل قبل، أما الأسماء المذكورة صراحة تنحصر بخط واحد.
  const allowedLineKeys = useMemo(
    () => (isManager ? Object.keys(WA_LINES) : (LINE_ACCESS[userName] || Object.keys(WA_LINES))),
    [isManager, userName],
  );
  const visibleLines = useMemo(
    () => Object.fromEntries(Object.entries(WA_LINES).filter(([k]) => allowedLineKeys.includes(k))),
    [allowedLineKeys],
  );
  // لو الخط الحالي صار غير مسموح (أول تحميل لموظف/ة محصورة بخط وحيد)، بدّل
  // للخط المسموح تلقائياً بدل ما تضل الشاشة عالقة عخط فاضي بلا محادثات.
  useEffect(() => {
    if (!allowedLineKeys.includes(line)) setLine(allowedLineKeys[0] || MAIN_LINE);
  }, [allowedLineKeys, line]);
  const [recording, setRecording] = useState(false);
  // نسخة ref من recording — تُقرأ داخل الـinterval (deps فاضية، ما بيشوف
  // تحديثات state) لتفادي تجميد اللقطة الصوتية بمنتصف تسجيل. راجع تعليق
  // الـinterval تحت لتفاصيل شكوى "الصوت مقطّع" (12 آب 2026).
  const recordingRef = useRef(false);
  const recorderRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const autoOpenedRef = useRef(false); // يفتح أول محادثة تلقائياً مرة وحدة بس — لا يعيد فتحها بعد ما يضغط المستخدم "رجوع"
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [search, setSearch] = useState('');
  const [unansweredFirst, setUnansweredFirst] = useState(true); // ترفع المحادثات يلي لسا ما انردّ عليها فوق
  const [deletingPhone, setDeletingPhone] = useState('');
  const [deletingMsgId, setDeletingMsgId] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferPhone, setTransferPhone] = useState('');
  const [view, setView] = useState('chat'); // 'chat' | 'analytics'
  const [trackingOrder, setTrackingOrder] = useState(null); // آخر طلب حقيقي لصاحب المحادثة المفتوحة (لرسالة رابط التتبع)
  const [trackingBannerOpen, setTrackingBannerOpen] = useState(true);
  const [employees, setEmployees] = useState([]); // لقائمة "تغيير المسؤول" — أدمن/مدير فقط
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [tagFilter, setTagFilter] = useState(null); // وسم مُختار للفلترة (null = الكل)
  const [tagInput, setTagInput] = useState('');
  const [savingTag, setSavingTag] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null); // رسالة يُردّ عليها بالاقتباس (quote-reply)
  const [msgSearchOpen, setMsgSearchOpen] = useState(false);
  const [msgSearch, setMsgSearch] = useState(''); // بحث نص داخل المحادثة المفتوحة
  const bottomRef = useRef(null);
  // أسماء الرسائل يلي سبق ورُسمت — أنيميشن دخول للرسالة الجديدة فقط، مش كل
  // رسالة بكل إعادة رسم (load() بتعيد جلب القائمة كاملة بعد كل إرسال).
  // ملاحظة عرض بحتة، ما بتلمس أي state/منطق تجاري.
  const seenMsgIdsRef = useRef(new Set());

  const load = useCallback(async () => {
    try {
      const [rows, ownerRows] = await Promise.all([fetchWhatsAppMessages(), fetchWhatsAppOwners()]);
      setMessages(rows || []);
      setOwners(ownerRows || []);
    } catch (e) {
      toast.error(e.message);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // تحديث خلفي هادئ كل 20 ثانية — بدون toast ولا أي مؤشر تحميل، وبلا لمس
  // openPhone/draft، حتى ما تنقفل محادثة مفتوحة أو ينمسح رد نصف مكتوب.
  // سبب الحاجة: حملات جماعية بترسل عشرات/مئات الرسائل بعد ما الموظف فاتح
  // الشاشة أصلاً — بلا هيك ما بيشوفها إلا بتحديث يدوي (F5) (طلب مالك 9 أغسطس 2026).
  // ⚠️ 12 أغسطس 2026: يتخطّى نفسه بالكامل أثناء تسجيل صوتي جارٍ — شكوى مالك
  // "الصوت مقطّع كأنه تقطيع": fetchWhatsAppMessages بيجيب الجدول كامل (آلاف
  // الصفوف) ويعيد رسم القائمة كاملة، ولو صادف توقيته منتصف تسجيل بيجمّد
  // المتصفح لحظياً — التقاط المايك بالـmain thread بيخسر بيانات بهالجمود
  // فيطلع الصوت مقطّعاً. تخطّي التحديث أثناء التسجيل بيمنعها.
  useEffect(() => {
    const t = setInterval(() => {
      if (recordingRef.current) return;
      Promise.all([fetchWhatsAppMessages(), fetchWhatsAppOwners()])
        .then(([rows, ownerRows]) => { setMessages(rows || []); setOwners(ownerRows || []); })
        .catch(() => {}); // صامت — شبكة متقطعة عادية، ما تستاهل إزعاج المستخدم
    }, 20000);
    return () => clearInterval(t);
  }, []);

  // تحميل مكتبة تسجيل الصوت مسبقاً عند فتح الشاشة (بدل أول ضغطة على 🎙️) —
  // "ياخذ وقت لإرسال التسجيل" (شكوى مالك 8 أغسطس 2026): جزء من التأخير كان
  // تحميل opus-recorder من CDN أول مرة بيضغط الموظف تسجيل، مش وقت الإرسال
  // نفسه. تحميلها بالخلفية هون بيخلي أول تسجيل فعلي جاهز فوراً.
  useEffect(() => { loadOpusRecorder().catch(() => {}); }, []);

  // تبديل الخط بيغيّر مجموعة المحادثات بالكامل — نقفل المحادثة المفتوحة
  // لتفادي عرض محادثة رقم تاني بالغلط (openPhone مش مرتبط بخط).
  useEffect(() => { setOpenPhone(''); autoOpenedRef.current = false; }, [line]);

  // موظفين نشطين — لقائمة "تغيير المسؤول" (سبب الحاجة: موظف عادي فتح محادثة
  // مملوكة لحدا تاني فانقفلت بوجهه بلا أي طريقة يحوّلها إله — 5 أغسطس 2026).
  useEffect(() => {
    if (!isManager) return;
    listActiveProfiles().then(setEmployees).catch(() => {});
  }, [isManager]);

  // فتح محادثة جاي من مكان تاني بالتطبيق (زر "فتح شات واتساب الرسمي" بشاشة
  // العميل) — ?open=+905551234567 — يفتحها ويسجّل الموظف الحالي مالكاً لها
  // لو ما كان فيها مالك أصلاً. لو وصلت رسالة "لوزي" الجاهزة معه (state.prefill
  // — نفس الرسالة المكتوبة أصلاً لصندوق الواتساب العادي) بتتعبّى بصندوق الرد
  // تلقائياً، بدل ما الموظف يعيد كتابتها من الصفر.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('open');
    if (!p) return;
    const norm = normalizePhoneInput(p);
    if (/^\+\d{6,15}$/.test(norm)) {
      setOpenPhone(norm);
      autoOpenedRef.current = true;
      if (location.state?.prefill) setDraft(location.state.prefill);
      claimWhatsAppConversation(norm, WA_LINES[MAIN_LINE].number, userId, userName).then(load).catch(() => {});
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('open');
    window.history.replaceState({}, '', url.pathname + url.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ownerByPhone = useMemo(() => {
    const num = WA_LINES[line].number;
    const map = {};
    for (const o of owners) if (o.to_number === num) map[normalizeWaPhone(o.phone)] = o;
    return map;
  }, [owners, line]);

  const lineMsgs = useMemo(() => {
    if (!messages) return null;
    const num = WA_LINES[line].number;
    return messages.filter(m => (m.to_number || WA_LINES.main.number) === num);
  }, [messages, line]);

  // اسم العميل بدل رقمه بس — "متل الواتساب الحقيقي" (طلب مالك 5 أغسطس 2026).
  // مستخرَج من أي رسالة قالب بالمحادثة (نفس الاسم يلي انبعت فعلياً)، بلا أي
  // استعلام DB إضافي — قاعدة العملاء ~24 ألف صف، أغلى بكتير من الحاجة الفعلية.
  const nameByPhone = useMemo(() => {
    if (!lineMsgs) return {};
    const map = {};
    for (const m of lineMsgs) {
      const name = extractTemplateName(m.body);
      if (name) map[normalizeWaPhone(m.phone)] = name;
    }
    return map;
  }, [lineMsgs]);

  const threads = useMemo(() => {
    if (!lineMsgs) return [];
    const byPhone = {};
    for (const m of lineMsgs) {
      const p = normalizeWaPhone(m.phone);
      if (!byPhone[p] || new Date(m.created_at) > new Date(byPhone[p].created_at)) byPhone[p] = { ...m, phone: p };
    }
    let list = Object.values(byPhone);
    // موظف عادي (بلا صلاحية إدارة) يشوف محادثاته/فريقها (WHATSAPP_TEAMS)
    // + أي محادثة بلا مالك أصلاً (عميل راسل جديد بلا حدا فتحها بعد) —
    // الأدمن/المدير يشوفوا الكل دايماً.
    // ⚠️ 8 أغسطس 2026: كان استبعاد "بلا مالك" كامل عن الموظف العادي (لازم
    // الأدمن يوزّعها يدوياً أول) — بَق حقيقي اكتُشف حياً: مع حملات جماعية
    // بمعدل مئات الرسائل يومياً، كل رد عميل جديد بيوصل بلا مالك (bulk send
    // ما بيستدعي claimWhatsAppConversation)، فديانا/سالي/فاطمة ما كانوا
    // يشوفوا ولا رد جديد إطلاقاً لحد ما أدمن يفتحها يدوياً واحدة واحدة —
    // غير عملي عند 600 رسالة/يوم. صار الموظف العادي يشوف المحادثات الجديدة
    // بلا مالك كمان (بيصير مالكها تلقائياً أول ما يفتحها ويرد — نفس منطق
    // ?open= الموجود أصلاً).
    if (!isManager) {
      const mates = teammatesOf(userName);
      list = list.filter(t => !ownerByPhone[t.phone] || mates.includes(ownerByPhone[t.phone]?.owner_name));
    }
    return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [lineMsgs, isManager, ownerByPhone, userName]);

  // 8 أغسطس 2026 (طلب مالك): ما نفتح أي محادثة تلقائياً عند دخول الشاشة —
  // نضل بقائمة المحادثات لحد ما الموظف يختار هو أي وحدة يفتح (كان قبل هيك
  // بيفتح أول محادثة بالقائمة تلقائياً، فبيروح مباشرة داخل شات معيّن).

  // فتح محادثة من القائمة — لو بلا مالك أصلاً (رد جديد على حملة جماعية
  // مثلاً)، أول من يفتحها يصير مالكها تلقائياً (نفس منطق ?open= وبدء محادثة
  // جديدة الموجودين أصلاً) — claimWhatsAppConversation idempotent، ما بيغيّر
  // مالك موجود لو حدا سبقه.
  // نقطة حمراء = آخر رسالة بالمحادثة من العميل ولسا ما انفتحت. نقطة خضراء =
  // اتفتحت وشافها حدا بالفريق (بس لسا ما انردّ عليها — الرد بيشيل النقطة
  // نهائياً، منطق موجود أصلاً). مخزَّنة محلياً بالمتصفح (بلا جدول DB جديد)
  // — طلب مالك 9 أغسطس 2026: "نعرف إنها انشافت". ⚠️ لا تتزامن بين
  // أجهزة/متصفحات موظفين مختلفين، كل واحد شايف "شفتها" الخاصة فيه بس.
  const [seenMap, setSeenMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wa_seen_map') || '{}'); } catch { return {}; }
  });
  const markSeen = useCallback((phone, msgId) => {
    if (!msgId) return;
    setSeenMap(prev => {
      if (prev[phone] === msgId) return prev;
      const next = { ...prev, [phone]: msgId };
      try { localStorage.setItem('wa_seen_map', JSON.stringify(next)); } catch { /* كاش بحت */ }
      return next;
    });
  }, []);

  const openThread = useCallback((phone) => {
    setOpenPhone(phone);
    const t = threads.find(th => th.phone === phone);
    if (t) markSeen(phone, t.id);
    if (!ownerByPhone[phone]) {
      claimWhatsAppConversation(phone, WA_LINES[line].number, userId, userName).then(load).catch(() => {});
    }
  }, [ownerByPhone, line, userId, userName, load, threads, markSeen]);

  const filteredThreads = useMemo(() => {
    const q = search.trim().replace(/[^\d+]/g, '');
    let list = q ? threads.filter(t => t.phone.includes(q)) : threads;
    if (tagFilter) list = list.filter(t => (ownerByPhone[t.phone]?.tags || []).includes(tagFilter));
    return list;
  }, [threads, search, tagFilter, ownerByPhone]);

  // كل الوسوم المستخدَمة فعلياً (من owners) — لقائمة الفلترة بالسايدبار.
  const allTags = useMemo(() => {
    const set = new Set();
    for (const o of owners) for (const t of (o.tags || [])) set.add(t);
    return [...set].sort();
  }, [owners]);

  // فصل ثلاثي: "تتبّع الطلبات" (إشعارات آلية — مسؤولية Haya حصراً) / "الحملات"
  // (رسائل تسويقية جماعية) / "المحادثات" (رد حر عضوي من عميل/موظف) — طلب
  // مالك 5 أغسطس 2026: فصل الحملات عن تتبّع الطلبات، كل قسم له سياقه.
  const trackingThreads = useMemo(() => filteredThreads.filter(t => isOrderTrackingBody(t.body)), [filteredThreads]);
  const campaignThreads = useMemo(() => filteredThreads.filter(t => !isOrderTrackingBody(t.body) && isCampaignBody(t.body)), [filteredThreads]);
  const convoThreads = useMemo(() => filteredThreads.filter(t => !isOrderTrackingBody(t.body) && !isCampaignBody(t.body)), [filteredThreads]);

  // "غير مردودة أولاً" — آخر رسالة بالمحادثة من العميل (لسا محدا ردّ) ترفع
  // فوق، مع الحفاظ على ترتيب الأحدث ضمن كل مجموعة. طلب مالك 5 أغسطس 2026:
  // ما تضيع محادثة عميل بانتظار رد وسط قائمة طويلة.
  const sortUnansweredFirst = (list) => unansweredFirst
    ? [...list].sort((a, b) => (b.direction === 'in') - (a.direction === 'in'))
    : list;
  const sortedConvoThreads = useMemo(() => sortUnansweredFirst(convoThreads), [convoThreads, unansweredFirst]);
  const sortedCampaignThreads = useMemo(() => sortUnansweredFirst(campaignThreads), [campaignThreads, unansweredFirst]);
  const sortedTrackingThreads = useMemo(() => sortUnansweredFirst(trackingThreads), [trackingThreads, unansweredFirst]);

  // نسخة عرض من كل قائمة (فوق) — بس بتضيف preview نصي جاهز لصفوف القائمة
  // الجانبية (ThreadListRow عرض بحت، ما بتستورد formatWaBody بنفسها).
  const withPreview = (list) => list.map(t => ({
    ...t,
    preview: t.media_url && !t.body ? '📎 مرفق' : formatWaBody(t.body).slice(0, 40),
  }));
  const previewConvoThreads = useMemo(() => withPreview(sortedConvoThreads), [sortedConvoThreads]);
  const previewCampaignThreads = useMemo(() => withPreview(sortedCampaignThreads), [sortedCampaignThreads]);
  const previewTrackingThreads = useMemo(() => withPreview(sortedTrackingThreads), [sortedTrackingThreads]);

  // محادثة عائدة لموظف تاني (مو إله ولا لعضو بفريقه) — موظف عادي ما يشوف
  // رسائلها حتى لو وصل رقمها بالـURL أو كتبه يدوياً بـ"محادثة جديدة".
  const openOwnedByOther = !isManager && !!openPhone
    && ownerByPhone[openPhone] && !teammatesOf(userName).includes(ownerByPhone[openPhone].owner_name);

  const thread = useMemo(
    () => openOwnedByOther ? [] : (lineMsgs || [])
      .filter(m => normalizeWaPhone(m.phone) === openPhone)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [lineMsgs, openPhone, openOwnedByOther],
  );

  // يفتح المحادثة على آخر رسالة مباشرة (تحت) بدل أول رسالة (فوق) — طلب صريح.
  useEffect(() => {
    if (openPhone) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [openPhone, thread.length]);

  // بحث نص داخل المحادثة المفتوحة — "متل الواتساب" (طلب مالك 5 أغسطس 2026).
  const displayThread = useMemo(() => {
    const q = msgSearch.trim();
    if (!q) return thread;
    return thread.filter(m => formatWaBody(m.body).includes(q));
  }, [thread, msgSearch]);

  useEffect(() => { setMsgSearchOpen(false); setMsgSearch(''); setReplyingTo(null); }, [openPhone]);

  // محادثة تتبّع = فيها أي رسالة إشعار آلي بتاريخها (لا بس آخر رسالة — لو
  // الموظف رد بنص حر، تضل "تتبّع" لأنها بلّشت هيك). البانر يستهدفها تحديداً
  // (طلب مالك 5 أغسطس 2026: "بدي بنر خاص في التتبّع").
  const openIsTracking = useMemo(() => thread.some(m => isOrderTrackingBody(m.body)), [thread]);

  // نافذة جلسة واتساب (24 ساعة) — قرار D-041 (11 آب 2026): تحقّق حي أثبت
  // إن أي رسالة حرة (مش قالب) لعميل ما راسل خلال آخر 24 ساعة بترجع
  // "undelivered" بصمت — الموظف يفتكر إنها وصلت وهي أصلاً ما وصلت. آخر
  // رسالة "in" بالمحادثة تحدد بداية النافذة؛ لا نافذة = تحذير قبل الإرسال،
  // مش بعده (بديل أدنى بالقرار — منع كامل يحتاج قائمة قوالب لسا مو موجودة
  // بهالشاشة).
  const lastInboundAt = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      if (thread[i].direction === 'in') return thread[i].created_at;
    }
    return null;
  }, [thread]);
  const sessionOpen = !!lastInboundAt && (Date.now() - new Date(lastInboundAt).getTime()) < 24 * 60 * 60 * 1000;

  useEffect(() => {
    setTrackingBannerOpen(true);
    setReassignOpen(false);
    if (!openPhone || !openIsTracking) { setTrackingOrder(null); return; }
    getLatestOrderForWaPhone(openPhone).then(setTrackingOrder).catch(() => setTrackingOrder(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPhone, openIsTracking]);

  // رد اقتباس (quote-reply) — Twilio ما بيدعم quoted-reply الأصلية لواتساب
  // لرسائل حرة، فنحاكيها بسطر اقتباس نصّي فوق الرد الفعلي (نفس أسلوب
  // البريد/الشات التقليدي). طلب مالك 5 أغسطس 2026.
  const startReply = (m) => {
    const snippet = m.media_url && !m.body ? '📎 مرفق' : formatWaBody(m.body).slice(0, 80);
    setReplyingTo({ id: m.id, snippet, direction: m.direction });
  };
  const cancelReply = () => setReplyingTo(null);

  // إضافة محلية فورية للرسالة الصادرة بدل إعادة تحميل الجدول كاملاً بعد كل
  // إرسال — القرار من شكوى مالك 12 آب 2026 ("تقل بالمراسلة"): fetchWhatsAppMessages
  // يجيب كل الجدول (آلاف الصفوف، بصفحات 1000) وكان يُنادى فوراً بعد كل إرسال،
  // فيوقف الواجهة كل مرة لثوان لحد ما يخلص التحميل — عبء غير ضروري، الرسالة
  // نفسها معروفة محلياً أصلاً فور نجاح الإرسال. التوفيق مع القاعدة الحقيقية
  // (حالة التسليم الفعلية) يصير عبر التحديث الهادئ كل 20 ثانية الموجود أصلاً.
  const appendLocalMessage = (partial) => {
    const msg = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      phone: openPhone,
      direction: 'out',
      status: 'queued',
      by_user: userId,
      twilio_sid: null,
      created_at: new Date().toISOString(),
      to_number: WA_LINES[line].number,
      media_url: null,
      media_content_type: null,
      ...partial,
    };
    setMessages(prev => [msg, ...(prev || [])]);
  };

  const send = async () => {
    let body = draft.trim();
    if (!openPhone || !/^\+\d{6,15}$/.test(openPhone) || !body) return;
    // منع فعلي، لا تحذير فقط — القرار D-041 (11 آب 2026): إرسال حر برا نافذة
    // الجلسة مضمون الفشل (undelivered صامت مؤكَّد حياً) — عبء بلا أي فائدة،
    // فيُمنع بدل ما يُترك ليكتشفه الموظف بالصدفة لاحقاً.
    if (!sessionOpen) {
      toast.error('لا نافذة جلسة نشطة — هذه الرسالة لن تصل. استخدم قالب معتمَد بدلاً من الكتابة الحرة.');
      return;
    }
    if (replyingTo) body = `↩️ ${replyingTo.snippet}\n—\n${body}`;
    setDraft('');
    setReplyingTo(null);
    setSending(true);
    try {
      await sendWhatsAppReply(openPhone, body, userId, line);
      appendLocalMessage({ body });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const sendMedia = async (blob, ext) => {
    if (!openPhone || !/^\+\d{6,15}$/.test(openPhone)) return;
    if (!sessionOpen) {
      toast.error('لا نافذة جلسة نشطة — هذا المرفق لن يصل. استخدم قالب معتمَد بدلاً من الإرسال الحر.');
      return;
    }
    setSending(true);
    try {
      const media = await uploadWhatsAppMedia(blob, ext);
      await sendWhatsAppReply(openPhone, '', userId, line, media);
      appendLocalMessage({ media_url: media.mediaUrl, media_content_type: media.mediaContentType });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const pickImage = () => imageInputRef.current?.click();
  const onImageChosen = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    sendMedia(file, file.name.split('.').pop());
  };

  // إرسال ملفات غير الصور (PDF/Word/إلخ) — طلب مالك 5 أغسطس 2026. زر منفصل
  // عن "📷 صورة" (نفس sendMedia، فقط accept أوسع). الرندر أصلاً جاهز
  // (رابط "📎 مرفق" لأي media_content_type غير audio/image).
  const pickFile = () => fileInputRef.current?.click();
  const onFileChosen = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    sendMedia(file, file.name.split('.').pop());
  };

  // "غير مافي خيار إلغاء التسجيل قبل الإرسال" (طلب مالك 5 أغسطس 2026) —
  // stop() وحده كان يُرسل دائماً؛ العلم هون يميّز "أوقف وأرسل" عن "ألغِ".
  const cancelRecordingRef = useRef(false);

  const toggleRecording = async () => {
    if (recording) {
      cancelRecordingRef.current = false;
      recorderRef.current?.stop();
      return;
    }
    try {
      const Recorder = await loadOpusRecorder();
      const rec = new Recorder({
        encoderPath: OPUS_ENCODER_WORKER,
        streamPages: false, // false = ملف .ogg واحد كامل عند stop()، لا Streaming
        numberOfChannels: 1,
        // ⚠️ 5 أغسطس 2026: عملاء اشتكوا "الصوت مش واضح" — 16kHz بلا bitRate
        // صريح كان الافتراضي يحسب معدل بت منخفض جداً لصوت بشري. رفعناها:
        // 24kHz (super-wideband) + VOIP application (محسَّن لوضوح الكلام لا
        // الموسيقى) + bitRate صريح 32kbps — لسا ملف صغير مناسب لواتساب.
        encoderSampleRate: 24000,
        encoderApplication: 2048, // OPUS_APPLICATION_VOIP
        bitRate: 32000,
      });
      rec.onstart = () => { recordingRef.current = true; setRecording(true); };
      rec.ondataavailable = (arrayBuffer) => {
        recordingRef.current = false;
        setRecording(false);
        if (cancelRecordingRef.current) { cancelRecordingRef.current = false; return; } // ألغيت — ما نرسل
        // ⚠️ 5 أغسطس 2026: عملاء اشتكوا "ما عم يفتح الفويس" (مو بس مش واضح —
        // ما يشتغل إطلاقاً). السبب المرجّح: نوع الملف كان "audio/ogg" بلا
        // "codecs=opus" الصريح — بعض عملاء واتساب ما بيتعرّفوا على ملف صوتي
        // بدون هالتحديد الدقيق فبيفشل التشغيل حتى لو الترميز سليم فعلياً.
        // هالسلسلة (blob.type → uploadWhatsAppMedia → Storage Content-Type
        // → Twilio يقرأها لما يجيب الملف) بتنقل النوع حرفياً لواتساب.
        const blob = new Blob([arrayBuffer], { type: 'audio/ogg; codecs=opus' });
        if (blob.size > 0) sendMedia(blob, 'ogg');
      };
      recorderRef.current = rec;
      await rec.start();
    } catch (e) {
      setRecording(false);
      toast.error('تعذّر الوصول للميكروفون: ' + e.message);
    }
  };

  const cancelRecording = () => {
    if (!recording) return;
    cancelRecordingRef.current = true;
    recorderRef.current?.stop();
  };

  const startNewChat = () => {
    const p = normalizePhoneInput(newChatPhone);
    if (!/^\+\d{6,15}$/.test(p)) {
      toast.error('رقم غير صالح — لازم يبدأ بكود الدولة (مثال: 905551234567)');
      return;
    }
    setOpenPhone(p);
    setNewChatOpen(false);
    setNewChatPhone('');
    claimWhatsAppConversation(p, WA_LINES[line].number, userId, userName).then(load).catch(() => {});
  };

  const deleteThread = async (phone, e) => {
    e.stopPropagation(); // ما يفتح المحادثة عند الضغط على زر الحذف
    if (!window.confirm(`حذف كل محادثة ${phone}؟ ما بينحذف من سجلات Twilio، بس بيختفي من هون.`)) return;
    setDeletingPhone(phone);
    try {
      await deleteWhatsAppConversation(phone, WA_LINES[line].number);
      if (openPhone === phone) setOpenPhone('');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeletingPhone('');
    }
  };

  const deleteMessage = async (id) => {
    if (!window.confirm('حذف هالرسالة؟')) return;
    setDeletingMsgId(id);
    try {
      await deleteWhatsAppMessage(id);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeletingMsgId('');
    }
  };

  const forwardMessage = async (m) => {
    const media = m.media_url ? { mediaUrl: m.media_url, mediaContentType: m.media_content_type } : null;
    const body = m.body && !m.body.startsWith('[template:') ? m.body : '';
    if (!body && !media) {
      toast.error('هاي رسالة إشعار آلي بلا نص أو مرفق — ما فيها شي قابل للتحويل.');
      return;
    }
    const raw = window.prompt('حوّلي هالرسالة لأي رقم؟ (بكود الدولة، مثال: 905551234567)');
    if (!raw) return;
    const p = normalizePhoneInput(raw);
    if (!/^\+\d{6,15}$/.test(p)) {
      toast.error('رقم غير صالح');
      return;
    }
    setSending(true);
    try {
      await sendWhatsAppReply(p, body, userId, line, media);
      toast.success?.('اتحوّلت الرسالة');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const insertQuickReply = (text) => {
    setDraft(d => (d.trim() ? `${d}\n${text}` : text));
    setQuickOpen(false);
  };

  const doTransfer = async () => {
    const p = normalizePhoneInput(transferPhone);
    if (!/^\+\d{6,15}$/.test(p)) {
      toast.error('رقم غير صالح');
      return;
    }
    if (!window.confirm(`نقل كل تاريخ محادثة ${openPhone} لرقم ${p}؟`)) return;
    try {
      await transferWhatsAppConversation(openPhone, p, WA_LINES[line].number);
      setOpenPhone(p);
      setTransferOpen(false);
      setTransferPhone('');
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const reassignOwner = async (emp) => {
    if (!openPhone) return;
    setReassigning(true);
    try {
      await setWhatsAppConversationOwner(openPhone, WA_LINES[line].number, emp.id, emp.employee_name);
      setReassignOpen(false);
      await load();
      toast.success(`صارت المحادثة عند ${emp.employee_name}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReassigning(false);
    }
  };

  const currentTags = ownerByPhone[openPhone]?.tags || [];

  const addTag = async (tag) => {
    const clean = String(tag || '').trim();
    if (!clean || !openPhone || currentTags.includes(clean)) { setTagInput(''); return; }
    setSavingTag(true);
    try {
      await setConversationTags(openPhone, WA_LINES[line].number, [...currentTags, clean]);
      setTagInput('');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingTag(false);
    }
  };

  const removeTag = async (tag) => {
    if (!openPhone) return;
    setSavingTag(true);
    try {
      await setConversationTags(openPhone, WA_LINES[line].number, currentTags.filter(t => t !== tag));
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingTag(false);
    }
  };

  // بنر تتبّع ذكي — عناصر جاهزة (رابط التتبّع الحقيقي + الردود السريعة
  // المخصَّصة لحالة الطلب) لمكوّن TrackingBanner العرضي البحت.
  const trackingBannerItems = [
    {
      key: 'link',
      label: '🔗 رابط التتبّع',
      primary: true,
      onClick: () => insertQuickReply(trackingLinkMessage(trackingOrder, trackingOrder?.customer_name)),
    },
    ...TRACKING_QUICK_REPLIES.map((q) => ({
      key: q.key,
      label: q.label,
      onClick: () => insertQuickReply(q.text(trackingOrder?.customer_name)),
    })),
  ];

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="font-extrabold text-text flex items-center gap-2"><span>💬</span> محادثات واتساب</h1>
        <div className="flex items-center gap-2">
          <Button
            variant={view === 'analytics' ? 'teal' : 'outline'}
            size="sm"
            onClick={() => setView(v => v === 'chat' ? 'analytics' : 'chat')}
          >
            {view === 'analytics' ? '← المحادثات' : '📊 تحليلات'}
          </Button>
          {view === 'chat' && <Button variant="ghost" size="sm" onClick={load}>تحديث ↻</Button>}
        </div>
      </div>
      <p className="text-xs text-muted">
        {view === 'analytics' ? 'أداء قناة واتساب — معدل رد، سرعة الفريق، تحويل لطلب فعلي.' : 'الرسائل الواردة والصادرة عبر أرقام لوويز الرسمية.'}
      </p>

      {view === 'analytics' ? (
        <WhatsAppAnalyticsPanel />
      ) : (
      <>
      <div className="flex gap-2 items-center flex-wrap">
        {allowedLineKeys.length > 1 && <LineSwitcher lines={visibleLines} line={line} onChange={setLine} />}
        <NewChatBar
          open={newChatOpen}
          onToggle={() => setNewChatOpen(v => !v)}
          phone={newChatPhone}
          onPhoneChange={setNewChatPhone}
          onStart={startNewChat}
        />
      </div>

      {messages === null && (
        <div className="py-10 flex justify-center"><Spinner size="lg" /></div>
      )}

      {messages !== null && (
        <div className="flex gap-3 items-start h-[calc(100dvh-3.5rem-7rem-8.5rem)] md:h-[calc(100dvh-3.5rem-2rem-8.5rem)]">
          {/* قائمة المحادثات — على الموبايل تختفي لما تكون محادثة مفتوحة (شاشة وحدة بالمرة، متل أي تطبيق شات) */}
          <div className={`bg-surface border border-border/60 rounded-card w-full md:w-72 shrink-0 h-full min-w-0 flex flex-col min-h-0 ${openPhone ? 'hidden md:flex' : 'flex animate-in fade-in slide-in-from-right-4 duration-200'}`}>
            <ThreadSearchBar
              search={search}
              onSearchChange={setSearch}
              unansweredFirst={unansweredFirst}
              onToggleUnanswered={() => setUnansweredFirst(v => !v)}
              allTags={allTags}
              tagFilter={tagFilter}
              onTagFilterChange={setTagFilter}
            />
            <div className="overflow-y-auto flex-1 min-h-0">
              {filteredThreads.length === 0 && (
                <EmptyState
                  icon="💬"
                  title={threads.length === 0 ? 'لا رسائل بعد' : 'لا نتائج'}
                  className="border-0 bg-transparent py-8"
                />
              )}
              <ThreadListSection
                label="💬 المحادثات"
                threads={previewConvoThreads}
                openPhone={openPhone}
                nameByPhone={nameByPhone}
                ownerByPhone={ownerByPhone}
                isManager={isManager}
                deletingPhone={deletingPhone}
                seenMap={seenMap}
                onOpen={openThread}
                onDelete={deleteThread}
              />
              <ThreadListSection
                label="📢 الحملات"
                threads={previewCampaignThreads}
                openPhone={openPhone}
                nameByPhone={nameByPhone}
                ownerByPhone={ownerByPhone}
                isManager={isManager}
                deletingPhone={deletingPhone}
                seenMap={seenMap}
                onOpen={openThread}
                onDelete={deleteThread}
              />
              <ThreadListSection
                label="📦 تتبّع الطلبات (آلي)"
                threads={previewTrackingThreads}
                openPhone={openPhone}
                nameByPhone={nameByPhone}
                ownerByPhone={ownerByPhone}
                isManager={isManager}
                deletingPhone={deletingPhone}
                seenMap={seenMap}
                onOpen={openThread}
                onDelete={deleteThread}
              />
            </div>
          </div>

          {/* المحادثة المفتوحة */}
          <div className={`bg-surface border border-border/60 rounded-card flex-1 p-3 h-full min-h-0 min-w-0 flex-col ${openPhone ? 'flex animate-in fade-in slide-in-from-left-4 duration-200' : 'hidden md:flex'}`}>
            {!openPhone && (
              <EmptyState icon="👈" title="اختر محادثة" className="border-0 bg-transparent m-auto" />
            )}
            {openPhone && openOwnedByOther && (
              <EmptyState
                icon="🔒"
                title="محادثة موظف/ة تانية"
                description={`هاي المحادثة مسؤول عنها ${ownerByPhone[openPhone]?.owner_name || 'موظف تاني'} — مو ظاهرة إلك.`}
                className="border-0 bg-transparent m-auto"
              />
            )}
            {openPhone && !openOwnedByOther && (
              <>
                <ChatHeader
                  phone={openPhone}
                  name={nameByPhone[openPhone]}
                  isManager={isManager}
                  ownerName={ownerByPhone[openPhone]?.owner_name}
                  msgSearchOpen={msgSearchOpen}
                  isDeleting={deletingPhone === openPhone}
                  onBack={() => setOpenPhone('')}
                  onToggleReassign={() => setReassignOpen(v => !v)}
                  onToggleSearch={() => setMsgSearchOpen(v => !v)}
                  onToggleTransfer={() => { setTransferOpen(v => !v); setTransferPhone(''); }}
                  onDelete={(e) => deleteThread(openPhone, e)}
                />

                {/* وسوم يدوية للمحادثة — تصنيف حرّ ("عميل جديد"، اسم البائع...)
                    لفلترة القائمة بالسايدبار. طلب مالك 5 أغسطس 2026. */}
                <TagBar
                  tags={currentTags}
                  hasOwner={!!ownerByPhone[openPhone]}
                  savingTag={savingTag}
                  tagInput={tagInput}
                  onTagInputChange={setTagInput}
                  onAddTag={addTag}
                  onRemove={removeTag}
                  suggestedTags={SUGGESTED_TAGS}
                />

                {isManager && (
                  <ReassignSheet
                    open={reassignOpen}
                    onClose={() => setReassignOpen(false)}
                    employees={employees}
                    currentOwnerId={ownerByPhone[openPhone]?.owner_id}
                    reassigning={reassigning}
                    onPick={reassignOwner}
                  />
                )}

                <TransferSheet
                  open={transferOpen}
                  onClose={() => setTransferOpen(false)}
                  phone={transferPhone}
                  onPhoneChange={setTransferPhone}
                  onConfirm={doTransfer}
                />

                {msgSearchOpen && (
                  <div className="flex gap-2 mb-2 bg-border/10 rounded-lg p-2">
                    <input
                      autoFocus
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-sm bg-surface text-text"
                      placeholder="🔍 بحث بنص الرسائل بهالمحادثة…"
                      value={msgSearch}
                      onChange={(e) => setMsgSearch(e.target.value)}
                    />
                    {msgSearch && (
                      <span className="text-[11px] text-muted self-center shrink-0">{displayThread.length} نتيجة</span>
                    )}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto flex flex-col gap-2 mb-2 min-h-0">
                  {displayThread.length === 0 && msgSearch && (
                    <p className="text-center text-xs text-muted py-4">لا نتائج لـ«{msgSearch}»</p>
                  )}
                  {displayThread.map((m, i) => {
                    const prevDay = i > 0 ? dayLabel(displayThread[i - 1].created_at) : null;
                    const curDay = dayLabel(m.created_at);
                    const isNew = !seenMsgIdsRef.current.has(m.id);
                    seenMsgIdsRef.current.add(m.id);
                    return (
                      <div key={m.id} className="contents">
                        {curDay !== prevDay && <DateDivider label={curDay} />}
                        <MessageBubble
                          message={m}
                          text={formatWaBody(m.body)}
                          isNew={isNew}
                          onReply={() => startReply(m)}
                          onForward={() => forwardMessage(m)}
                          onDelete={() => deleteMessage(m.id)}
                          isDeleting={deletingMsgId === m.id}
                        />
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                {/* بانر رسائل تتبّع ذكية — يظهر بس لما المحادثة المفتوحة أصلها
                    إشعار تتبّع آلي. أكتر من مجرد حالة شحن: ترحيب/شكر/توثيق فتح
                    الطرد/دعوة قناة/متابعة صفحات/طلب تقييم + رابط تتبع حقيقي
                    (طلب مالك 5 أغسطس 2026). كل زر يعبّي صندوق الرد، ما بيرسل مباشرة. */}
                {openIsTracking && (
                  <TrackingBanner
                    open={trackingBannerOpen}
                    onToggle={() => setTrackingBannerOpen(v => !v)}
                    orderId={trackingOrder?.order_id}
                    items={trackingBannerItems}
                  />
                )}

                <QuickRepliesSheet
                  open={quickOpen}
                  onClose={() => setQuickOpen(false)}
                  replies={QUICK_REPLIES}
                  onPick={insertQuickReply}
                />

                {!sessionOpen && (
                  <div className="mb-2 bg-amber-50 border border-amber-300 rounded-lg p-2 text-[11px] font-bold text-amber-800 flex items-start gap-1.5">
                    <span>⚠️</span>
                    <span>
                      لا نافذة جلسة نشطة (العميل ما راسل خلال آخر 24 ساعة) — الإرسال الحر معطَّل
                      لأنه مضمون الفشل («لم تصل» بصمت). لازم قالب معتمَد بدل الكتابة الحرة.
                    </span>
                  </div>
                )}

                {replyingTo && <QuoteReplyBar snippet={replyingTo.snippet} onCancel={cancelReply} />}

                <Composer
                  draft={draft}
                  onDraftChange={setDraft}
                  onSend={send}
                  sending={sending}
                  recording={recording}
                  onToggleQuick={() => setQuickOpen(v => !v)}
                  onPickImage={pickImage}
                  onPickFile={pickFile}
                  onToggleRecording={toggleRecording}
                  onCancelRecording={cancelRecording}
                  imageInputRef={imageInputRef}
                  fileInputRef={fileInputRef}
                  onImageChosen={onImageChosen}
                  onFileChosen={onFileChosen}
                />
              </>
            )}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
