// =============================================================
// AdminWhatsAppScreen — محادثات واتساب (رقم لوويز الرسمي +13204416777).
//   قائمة محادثات (يسار، مقسّمة تتبّع طلبات/محادثات) + محادثة مفتوحة
//   (يمين) + رد نصي/صوتي/صورة مباشر. يقرأ/يكتب على جدول whatsapp_messages
//   بمشروع Supabase آخر — راجع src/services/whatsappService.js للتفاصيل.
//   محميّة admin/manager.
// =============================================================
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import { useToast } from '@hooks/useToast';
import { ROLES } from '@data/teams';
import {
  fetchWhatsAppMessages, sendWhatsAppReply, uploadWhatsAppMedia,
  deleteWhatsAppConversation, deleteWhatsAppMessage, transferWhatsAppConversation,
  fetchWhatsAppOwners, claimWhatsAppConversation, setWhatsAppConversationOwner,
  normalizeWaPhone, formatWaBody, isOrderTrackingBody, isCampaignBody, extractTemplateName, QUICK_REPLIES, WA_LINES,
  TRACKING_QUICK_REPLIES, getLatestOrderForWaPhone, trackingLinkMessage,
  setConversationTags, SUGGESTED_TAGS,
} from '@services/whatsappService';
import { getWhatsAppAnalytics } from '@services/whatsappAnalyticsService';
import { listActiveProfiles } from '@services/authService';

const MAIN_LINE = 'main'; // خط افتراضي عند فتح الشاشة — راجع WA_LINES لكل الخطوط المتاحة

// فرق تشترك برؤية محادثات بعضها البعض — طلب مالك 5 أغسطس 2026: "ديانا وسالي
// كشخص واحد" (بدل تقسيم صارم نص/نص كل وحدة تشوف بس محادثاتها). أي محادثة
// عند أي عضو بالفريق تظهر للكل — بلا حاجة لتغيير المالك الفعلي بقاعدة
// البيانات. ⚠️ ثابت بالكود مؤقتاً (دَين تقني) — لو صارت الفرق أكتر/متغيّرة
// بشكل متكرر، ينقل هذا لإعداد يُدار من لوحة الأدمن بدل تعديل الكود مباشرة.
const WHATSAPP_TEAMS = [
  ['Diana Hasan', 'Sally Teba'],
];
function teammatesOf(name) {
  const team = WHATSAPP_TEAMS.find(t => t.includes(name));
  return team || [name];
}

const PERIODS = [
  { key: 7,  label: '7 أيام' },
  { key: 30, label: '30 يوم' },
  { key: 90, label: '90 يوم' },
];

// لوحة تحليلات — سبرنت ② من خطة النمو (5 أغسطس 2026): أول أرقام حقيقية
// لأداء قناة واتساب (معدل رد، سرعة رد الفريق، تحويل لطلب فعلي). أساس
// لقياس أي حملة إعادة تنشيط/إحالة جاية بدل تخمين.
function WhatsAppAnalyticsPanel() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true); setError(null);
    getWhatsAppAnalytics(days)
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [days]);

  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
  const fmtMin = (m) => {
    if (m == null) return '—';
    if (m < 60) return `${Math.round(m)} د`;
    return `${(m / 60).toFixed(1)} س`;
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setDays(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition ${days === p.key ? 'border-teal bg-teal text-navy' : 'border-border text-muted hover:border-teal/40'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-surface-alt animate-pulse rounded-2xl" />)}
        </div>
      ) : error ? (
        <div className="bg-red-bg border border-red/20 text-red-fg rounded-xl px-4 py-3 text-sm">{error}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-surface border border-border rounded-2xl p-3 text-center">
              <p className="text-2xl font-extrabold text-teal">{fmt(stats.totalConvos)}</p>
              <p className="text-[11px] text-muted mt-0.5">محادثة</p>
            </div>
            <div className="bg-surface border border-border rounded-2xl p-3 text-center">
              <p className="text-2xl font-extrabold text-text">{fmt(stats.totalIn)} / {fmt(stats.totalOut)}</p>
              <p className="text-[11px] text-muted mt-0.5">وارد / صادر</p>
            </div>
            <div className="bg-surface border border-border rounded-2xl p-3 text-center">
              <p className="text-2xl font-extrabold text-amber-fg">{stats.replyRate}%</p>
              <p className="text-[11px] text-muted mt-0.5">معدل رد العميل</p>
            </div>
            <div className="bg-surface border border-border rounded-2xl p-3 text-center">
              <p className="text-2xl font-extrabold text-navy dark:text-white">{fmtMin(stats.avgResponseMin)}</p>
              <p className="text-[11px] text-muted mt-0.5">متوسط سرعة رد الفريق</p>
            </div>
          </div>
          <div className="bg-teal/10 border border-teal/30 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-teal-700">💰 تحويل لطلب فعلي (خلال 7 أيام من أول رسالة)</p>
              <p className="text-[11px] text-muted mt-0.5">مطابقة أرقام محادثات واتساب مع طلبات تركيا الفعلية — تركيا فقط (واتساب سوريا محظور).</p>
            </div>
            <div className="text-center shrink-0">
              <p className="text-2xl font-extrabold text-teal">{stats.converted}</p>
              <p className="text-[11px] text-muted">{stats.conversionRate}% من المحادثات</p>
            </div>
          </div>
          <p className="text-[10px] text-muted text-center">
            {stats.customerInitiated} محادثة بلّشها العميل من أصل {stats.totalConvos} — الباقي إشعارات آلية (تتبّع شحن) ما تلاها رد.
          </p>
        </>
      )}
    </div>
  );
}

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

// علامات ✓/✓✓ زرقاء بصرية بدل نص الحالة الخام — "متل الواتساب" (طلب مالك
// 5 أغسطس 2026). بس للرسائل الصادرة.
function StatusTicks({ status }) {
  if (!status) return null;
  if (status === 'read') return <span title="قُرئت" className="text-blue-400">✓✓</span>;
  if (status === 'delivered') return <span title="وصلت" className="opacity-70">✓✓</span>;
  if (status === 'sent' || status === 'queued') return <span title={status === 'queued' ? 'قيد الإرسال' : 'أُرسلت'} className="opacity-70">✓</span>;
  if (status === 'failed' || status === 'undelivered') return <span title={status} className="text-red-400">⚠️</span>;
  return <span title={status} className="opacity-70">{status}</span>;
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
  const [recording, setRecording] = useState(false);
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
    // موظف عادي (بلا صلاحية إدارة) يشوف بس المحادثات المسجَّلة إله أو لأي
    // عضو بفريقها (WHATSAPP_TEAMS) — الأدمن/المدير يشوفوا الكل. محادثة بلا
    // مالك أصلاً (عميل راسل جديد بلا حدا فتحها) ما تظهر للموظف العادي
    // بهالنسخة البسيطة — تحتاج الأدمن يوزّعها أول.
    if (!isManager) {
      const mates = teammatesOf(userName);
      list = list.filter(t => mates.includes(ownerByPhone[t.phone]?.owner_name));
    }
    return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [lineMsgs, isManager, ownerByPhone, userName]);

  useEffect(() => {
    if (!autoOpenedRef.current && !openPhone && threads.length) {
      autoOpenedRef.current = true;
      setOpenPhone(threads[0].phone);
    }
  }, [threads, openPhone]);

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

  const send = async () => {
    let body = draft.trim();
    if (!openPhone || !/^\+\d{6,15}$/.test(openPhone) || !body) return;
    if (replyingTo) body = `↩️ ${replyingTo.snippet}\n—\n${body}`;
    setDraft('');
    setReplyingTo(null);
    setSending(true);
    try {
      await sendWhatsAppReply(openPhone, body, userId, line);
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const sendMedia = async (blob, ext) => {
    if (!openPhone || !/^\+\d{6,15}$/.test(openPhone)) return;
    setSending(true);
    try {
      const media = await uploadWhatsAppMedia(blob, ext);
      await sendWhatsAppReply(openPhone, '', userId, line, media);
      await load();
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
      rec.onstart = () => setRecording(true);
      rec.ondataavailable = (arrayBuffer) => {
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

  const renderThreadRow = (t) => (
    <div
      key={t.phone}
      onClick={() => setOpenPhone(t.phone)}
      className={`group px-3 py-2 border-b border-border/40 cursor-pointer flex items-center gap-2 ${t.phone === openPhone ? 'bg-teal/10' : ''}`}
    >
      {t.direction === 'in' && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="بانتظار رد" />}
      <div className="flex-1 min-w-0">
        {nameByPhone[t.phone] ? (
          <>
            <div className="font-bold text-sm text-text truncate">{nameByPhone[t.phone]}</div>
            <div className="text-[10px] text-muted" dir="ltr">{t.phone}</div>
          </>
        ) : (
          <div className="font-bold text-sm text-text" dir="ltr">{t.phone}</div>
        )}
        <div className="text-xs text-muted truncate">
          {t.direction === 'out' ? 'أنتم: ' : ''}
          {t.media_url && !t.body ? '📎 مرفق' : formatWaBody(t.body).slice(0, 40)}
        </div>
        {isManager && ownerByPhone[t.phone]?.owner_name && (
          <div className="text-[10px] text-teal-700 truncate">👤 {ownerByPhone[t.phone].owner_name}</div>
        )}
      </div>
      <button
        onClick={(e) => deleteThread(t.phone, e)}
        disabled={deletingPhone === t.phone}
        title="حذف المحادثة"
        className="text-muted hover:text-red-500 opacity-60 hover:opacity-100 text-sm shrink-0 disabled:opacity-30"
      >
        {deletingPhone === t.phone ? '…' : '🗑️'}
      </button>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="font-extrabold text-text flex items-center gap-2"><span>💬</span> محادثات واتساب</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setView(v => v === 'chat' ? 'analytics' : 'chat')}
            className={`text-xs font-bold rounded-lg px-3 py-1.5 border-2 transition ${view === 'analytics' ? 'border-teal bg-teal text-navy' : 'border-border/60 text-muted hover:border-teal/40'}`}>
            {view === 'analytics' ? '← المحادثات' : '📊 تحليلات'}
          </button>
          {view === 'chat' && <button onClick={load} className="text-xs text-teal-700 font-bold">تحديث ↻</button>}
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
        {isManager ? (
          Object.entries(WA_LINES).map(([key, l]) => (
            <button
              key={key}
              onClick={() => setLine(key)}
              className={`text-xs font-bold rounded-lg px-3 py-1.5 border-2 transition ${
                line === key ? 'border-teal bg-teal/10 text-teal-700' : 'border-border/60 text-muted hover:border-teal/40'
              }`}
            >
              {l.label} · {l.number}
            </button>
          ))
        ) : (
          <span className="text-xs font-bold rounded-lg px-3 py-1.5 bg-teal/10 text-teal-700">
            {WA_LINES[line].label} · {WA_LINES[line].number}
          </span>
        )}
        <button
          onClick={() => setNewChatOpen(v => !v)}
          className="text-xs font-bold rounded-lg px-3 py-1.5 border border-border/60 bg-surface text-text"
        >
          ＋ محادثة جديدة
        </button>
      </div>

      {newChatOpen && (
        <div className="flex gap-2 bg-surface border border-border/60 rounded-xl p-2">
          <input
            className="flex-1 border border-border rounded-lg px-2 py-1.5 text-sm bg-surface text-text"
            placeholder="رقم بكود الدولة (مثال: 905551234567)"
            value={newChatPhone}
            onChange={(e) => setNewChatPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') startNewChat(); }}
            dir="ltr"
          />
          <button
            onClick={startNewChat}
            className="bg-teal text-navy rounded-xl px-3 py-1.5 text-sm font-bold hover:bg-teal/90"
          >
            بدء
          </button>
        </div>
      )}

      {messages === null && <div className="text-muted text-sm py-8 text-center">⏳ جارٍ التحميل…</div>}

      {messages !== null && (
        <div className="flex gap-3 items-start flex-wrap md:flex-nowrap">
          {/* قائمة المحادثات — على الموبايل تختفي لما تكون محادثة مفتوحة (شاشة وحدة بالمرة، متل أي تطبيق شات) */}
          <div className={`bg-surface border border-border/60 rounded-xl w-full md:w-72 shrink-0 max-h-[70vh] flex flex-col ${openPhone ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-2 border-b border-border/40 shrink-0 space-y-1.5">
              <input
                className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-surface text-text"
                placeholder="🔍 بحث برقم الهاتف…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                dir="ltr"
              />
              <button onClick={() => setUnansweredFirst(v => !v)}
                className={`w-full text-[11px] font-bold rounded-lg px-2 py-1.5 border transition ${unansweredFirst ? 'border-teal bg-teal/10 text-teal-700' : 'border-border/60 text-muted'}`}>
                🔴 غير مردودة أولاً {unansweredFirst ? '✓' : ''}
              </button>
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => setTagFilter(null)}
                    className={`text-[10px] font-bold rounded-md px-1.5 py-0.5 border ${!tagFilter ? 'border-navy bg-navy text-white' : 'border-border/60 text-muted'}`}>
                    الكل
                  </button>
                  {allTags.map(tag => (
                    <button key={tag} onClick={() => setTagFilter(v => v === tag ? null : tag)}
                      className={`text-[10px] font-bold rounded-md px-1.5 py-0.5 border ${tagFilter === tag ? 'border-navy bg-navy text-white' : 'border-border/60 text-muted hover:border-navy/40'}`}>
                      🏷️ {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredThreads.length === 0 && (
                <div className="text-muted text-sm py-8 text-center">
                  {threads.length === 0 ? 'لا رسائل بعد' : 'لا نتائج'}
                </div>
              )}
              {sortedConvoThreads.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[11px] font-bold text-muted bg-border/20 sticky top-0">💬 المحادثات</div>
                  {sortedConvoThreads.map(renderThreadRow)}
                </>
              )}
              {sortedCampaignThreads.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[11px] font-bold text-muted bg-border/20 sticky top-0">📢 الحملات</div>
                  {sortedCampaignThreads.map(renderThreadRow)}
                </>
              )}
              {sortedTrackingThreads.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[11px] font-bold text-muted bg-border/20 sticky top-0">📦 تتبّع الطلبات (آلي)</div>
                  {sortedTrackingThreads.map(renderThreadRow)}
                </>
              )}
            </div>
          </div>

          {/* المحادثة المفتوحة */}
          <div className={`bg-surface border border-border/60 rounded-xl flex-1 p-3 flex-col max-h-[70vh] ${openPhone ? 'flex' : 'hidden md:flex'}`}>
            {!openPhone && <div className="text-muted text-sm py-8 text-center">👈 اختر محادثة</div>}
            {openPhone && openOwnedByOther && (
              <div className="text-muted text-sm py-8 text-center">
                🔒 هاي المحادثة مسؤول عنها {ownerByPhone[openPhone]?.owner_name || 'موظف تاني'} — مو ظاهرة إلك.
              </div>
            )}
            {openPhone && !openOwnedByOther && (
              <>
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-border/40 shrink-0 gap-2 flex-wrap">
                  <button
                    onClick={() => setOpenPhone('')}
                    className="md:hidden text-xs font-bold text-teal-700"
                  >
                    ‹ رجوع
                  </button>
                  <div className="hidden md:block">
                    {nameByPhone[openPhone] ? (
                      <>
                        <div className="font-bold text-sm text-text">{nameByPhone[openPhone]}</div>
                        <div className="text-[10px] text-muted" dir="ltr">{openPhone}</div>
                      </>
                    ) : (
                      <div className="font-bold text-sm text-text" dir="ltr">{openPhone}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {isManager && (
                      <button
                        onClick={() => setReassignOpen(v => !v)}
                        title="تحويل هاي المحادثة لموظف/ة تانية"
                        className="text-muted hover:text-teal-700 text-xs font-bold"
                      >
                        👤 {ownerByPhone[openPhone]?.owner_name ? `عند ${ownerByPhone[openPhone].owner_name} — تغيير` : 'بلا مسؤول — تعيين'}
                      </button>
                    )}
                    <button
                      onClick={() => setMsgSearchOpen(v => !v)}
                      title="بحث داخل المحادثة"
                      className={`text-xs font-bold ${msgSearchOpen ? 'text-teal-700' : 'text-muted hover:text-teal-700'}`}
                    >
                      🔍
                    </button>
                    <button
                      onClick={() => { setTransferOpen(v => !v); setTransferPhone(''); }}
                      title="نقل المحادثة لرقم آخر"
                      className="text-muted hover:text-teal-700 text-xs font-bold"
                    >
                      🔀 نقل
                    </button>
                    <button
                      onClick={(e) => deleteThread(openPhone, e)}
                      disabled={deletingPhone === openPhone}
                      title="حذف المحادثة"
                      className="text-muted hover:text-red-500 text-sm disabled:opacity-30"
                    >
                      {deletingPhone === openPhone ? '…' : '🗑️ حذف'}
                    </button>
                  </div>
                </div>

                {/* وسوم يدوية للمحادثة — تصنيف حرّ ("عميل جديد"، اسم البائع...)
                    لفلترة القائمة بالسايدبار. طلب مالك 5 أغسطس 2026. */}
                <div className="flex items-center flex-wrap gap-1.5 mb-2">
                  {currentTags.map(tag => (
                    <span key={tag} className="text-[11px] font-bold bg-navy/10 text-navy dark:text-white rounded-md px-2 py-0.5 flex items-center gap-1">
                      🏷️ {tag}
                      <button onClick={() => removeTag(tag)} disabled={savingTag} className="hover:text-red-500">✕</button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addTag(tagInput); }}
                    disabled={savingTag || !ownerByPhone[openPhone]}
                    placeholder={ownerByPhone[openPhone] ? '+ إضافة وسم…' : 'ملكية أول لتقدري توسمي'}
                    list="wa-suggested-tags"
                    className="text-[11px] border border-border/60 rounded-md px-2 py-0.5 bg-surface text-text w-32 disabled:opacity-50"
                  />
                  <datalist id="wa-suggested-tags">
                    {SUGGESTED_TAGS.map(t => <option key={t} value={t} />)}
                  </datalist>
                </div>

                {reassignOpen && (
                  <div className="flex flex-wrap gap-1.5 mb-2 bg-border/10 rounded-lg p-2 max-h-32 overflow-y-auto">
                    {employees.length === 0 ? (
                      <span className="text-xs text-muted">⏳ جارٍ تحميل الموظفين…</span>
                    ) : employees.map(emp => (
                      <button
                        key={emp.id}
                        onClick={() => reassignOwner(emp)}
                        disabled={reassigning}
                        className={`text-xs font-bold px-2 py-1 rounded-lg border transition disabled:opacity-40 ${
                          ownerByPhone[openPhone]?.owner_id === emp.id
                            ? 'border-teal bg-teal text-navy' : 'border-border/60 text-text hover:bg-teal/10'
                        }`}
                      >
                        {emp.employee_name}
                      </button>
                    ))}
                  </div>
                )}

                {transferOpen && (
                  <div className="flex gap-2 mb-2 bg-border/10 rounded-lg p-2">
                    <input
                      className="flex-1 border border-border rounded-lg px-2 py-1.5 text-sm bg-surface text-text"
                      placeholder="الرقم الجديد (بكود الدولة)"
                      value={transferPhone}
                      onChange={(e) => setTransferPhone(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') doTransfer(); }}
                      dir="ltr"
                    />
                    <button onClick={doTransfer} className="bg-teal text-navy rounded-lg px-3 py-1.5 text-xs font-bold">نقل</button>
                  </div>
                )}

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

                <div className="flex-1 overflow-y-auto flex flex-col gap-2 mb-2">
                  {displayThread.length === 0 && msgSearch && (
                    <p className="text-center text-xs text-muted py-4">لا نتائج لـ«{msgSearch}»</p>
                  )}
                  {displayThread.map((m, i) => {
                    const prevDay = i > 0 ? dayLabel(displayThread[i - 1].created_at) : null;
                    const curDay = dayLabel(m.created_at);
                    return (
                      <div key={m.id} className="contents">
                        {curDay !== prevDay && (
                          <div className="self-center text-[10px] font-bold text-muted bg-border/30 rounded-full px-3 py-0.5 my-1">{curDay}</div>
                        )}
                        <div
                          className={`group max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                            m.direction === 'out'
                              ? 'self-end bg-teal text-navy'
                              : 'self-start bg-border/30 text-text'
                          }`}
                        >
                          {m.media_url && (m.media_content_type || '').startsWith('audio/') && (
                            <audio controls src={m.media_url} className="max-w-full mb-1" />
                          )}
                          {m.media_url && (m.media_content_type || '').startsWith('image/') && (
                            <img src={m.media_url} alt="" className="max-w-full rounded-lg mb-1" />
                          )}
                          {m.media_url && !(m.media_content_type || '').startsWith('audio/') && !(m.media_content_type || '').startsWith('image/') && (
                            <a href={m.media_url} target="_blank" rel="noreferrer" className="underline text-teal-700 block mb-1">📎 مرفق</a>
                          )}
                          {formatWaBody(m.body)}
                          <div className="flex items-center gap-2 text-[10px] opacity-70 mt-1">
                            <span className="flex items-center gap-1">
                              {new Date(m.created_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
                              {m.direction === 'out' && <StatusTicks status={m.status} />}
                            </span>
                            <button
                              onClick={() => startReply(m)}
                              title="رد باقتباس"
                              className="opacity-0 group-hover:opacity-100 hover:!opacity-100"
                            >
                              ↩️
                            </button>
                            <button
                              onClick={() => forwardMessage(m)}
                              title="تحويل الرسالة"
                              className="opacity-0 group-hover:opacity-100 hover:!opacity-100"
                            >
                              ↪️
                            </button>
                            {m.direction === 'out' && (
                              <button
                                onClick={() => deleteMessage(m.id)}
                                disabled={deletingMsgId === m.id}
                                title="حذف الرسالة"
                                className="opacity-0 group-hover:opacity-100 hover:!opacity-100 disabled:opacity-30"
                              >
                                {deletingMsgId === m.id ? '…' : '🗑️'}
                              </button>
                            )}
                          </div>
                        </div>
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
                  <div className="mb-2 bg-teal/10 border border-teal/30 rounded-lg p-2">
                    <button onClick={() => setTrackingBannerOpen(v => !v)}
                      className="w-full flex items-center justify-between text-xs font-bold text-teal-700">
                      <span>🏷️ رسائل تتبّع ذكية {trackingOrder ? `— طلبها الأخير #${trackingOrder.order_id || ''}` : ''}</span>
                      <span>{trackingBannerOpen ? '▲' : '▼'}</span>
                    </button>
                    {trackingBannerOpen && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          onClick={() => insertQuickReply(trackingLinkMessage(trackingOrder, trackingOrder?.customer_name))}
                          className="text-[11px] font-bold px-2 py-1 rounded-lg bg-teal text-navy hover:opacity-90 transition"
                        >
                          🔗 رابط التتبّع
                        </button>
                        {TRACKING_QUICK_REPLIES.map((q) => (
                          <button
                            key={q.key}
                            onClick={() => insertQuickReply(q.text(trackingOrder?.customer_name))}
                            className="text-[11px] font-bold px-2 py-1 rounded-lg border border-teal/40 text-teal-700 hover:bg-teal/10 transition"
                          >
                            {q.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {quickOpen && (
                  <div className="mb-2 bg-border/10 rounded-lg p-2 flex flex-col gap-1 max-h-40 overflow-y-auto">
                    {QUICK_REPLIES.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => insertQuickReply(q.text)}
                        className="text-xs text-start text-text hover:bg-teal/10 rounded px-2 py-1"
                      >
                        <span className="font-bold">{q.label}:</span> {q.text.slice(0, 50)}…
                      </button>
                    ))}
                  </div>
                )}

                {replyingTo && (
                  <div className="flex items-center justify-between gap-2 mb-1.5 bg-border/10 border-r-4 border-teal rounded-lg px-2.5 py-1.5">
                    <span className="text-[11px] text-muted truncate">↩️ رد على: {replyingTo.snippet}</span>
                    <button onClick={cancelReply} className="text-muted hover:text-red-500 shrink-0">✕</button>
                  </div>
                )}

                <div className="flex gap-2">
                  <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={onImageChosen} />
                  <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChosen} />
                  <button
                    onClick={() => setQuickOpen(v => !v)}
                    disabled={sending || recording}
                    title="ردود جاهزة"
                    className="border border-border/60 rounded-xl px-2.5 py-1.5 text-sm disabled:opacity-50"
                  >
                    ⚡
                  </button>
                  <button
                    onClick={pickImage}
                    disabled={sending || recording}
                    title="إرسال صورة"
                    className="border border-border/60 rounded-xl px-2.5 py-1.5 text-sm disabled:opacity-50"
                  >
                    📷
                  </button>
                  <button
                    onClick={pickFile}
                    disabled={sending || recording}
                    title="إرسال ملف (PDF/Word/إلخ)"
                    className="border border-border/60 rounded-xl px-2.5 py-1.5 text-sm disabled:opacity-50"
                  >
                    📎
                  </button>
                  {recording && (
                    <button
                      onClick={cancelRecording}
                      disabled={sending}
                      title="إلغاء التسجيل بلا إرسال"
                      className="border border-red-500 text-red-500 rounded-xl px-2.5 py-1.5 text-sm disabled:opacity-50"
                    >
                      🗑️
                    </button>
                  )}
                  <button
                    onClick={toggleRecording}
                    disabled={sending}
                    title={recording ? 'إيقاف وإرسال التسجيل' : 'تسجيل رسالة صوتية'}
                    className={`border rounded-xl px-2.5 py-1.5 text-sm disabled:opacity-50 ${
                      recording ? 'bg-red-500 text-white border-red-500 animate-pulse' : 'border-border/60'
                    }`}
                  >
                    {recording ? '⏹️' : '🎙️'}
                  </button>
                  <input
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-sm bg-surface text-text"
                    placeholder="اكتب رد…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    disabled={sending || recording}
                  />
                  <button
                    onClick={send}
                    disabled={sending || recording || !draft.trim()}
                    className="bg-teal text-navy rounded-xl px-3 py-1.5 text-sm font-bold hover:bg-teal/90 disabled:opacity-50"
                  >
                    {sending ? '…' : 'إرسال'}
                  </button>
                </div>
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
