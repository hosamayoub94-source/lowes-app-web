// =============================================================
// AdminWhatsAppScreen — محادثات واتساب (رقم لوويز الرسمي +13204416777).
//   قائمة محادثات (يسار، مقسّمة تتبّع طلبات/محادثات) + محادثة مفتوحة
//   (يمين) + رد نصي/صوتي/صورة مباشر. يقرأ/يكتب على جدول whatsapp_messages
//   بمشروع Supabase آخر — راجع src/services/whatsappService.js للتفاصيل.
//   محميّة admin/manager.
// =============================================================
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@hooks/useAuth';
import { useToast } from '@hooks/useToast';
import {
  fetchWhatsAppMessages, sendWhatsAppReply, uploadWhatsAppMedia,
  deleteWhatsAppConversation, deleteWhatsAppMessage, transferWhatsAppConversation,
  normalizeWaPhone, formatWaBody, isOrderTrackingBody, QUICK_REPLIES, WA_LINES,
} from '@services/whatsappService';

const MAIN_LINE = 'main'; // خط وحيد فعلياً حالياً — راجع WA_LINES

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

export default function AdminWhatsAppScreen() {
  const { id: userId } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState(null); // null = لسا ما حمّل
  const [openPhone, setOpenPhone] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const line = MAIN_LINE; // خط وحيد فعلياً حالياً (خط الحملة مُزال — راجع D-016)
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef(null);
  const imageInputRef = useRef(null);
  const autoOpenedRef = useRef(false); // يفتح أول محادثة تلقائياً مرة وحدة بس — لا يعيد فتحها بعد ما يضغط المستخدم "رجوع"
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [search, setSearch] = useState('');
  const [deletingPhone, setDeletingPhone] = useState('');
  const [deletingMsgId, setDeletingMsgId] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferPhone, setTransferPhone] = useState('');
  const bottomRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const rows = await fetchWhatsAppMessages();
      setMessages(rows || []);
    } catch (e) {
      toast.error(e.message);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const lineMsgs = useMemo(() => {
    if (!messages) return null;
    const num = WA_LINES[line].number;
    return messages.filter(m => (m.to_number || WA_LINES.main.number) === num);
  }, [messages, line]);

  const threads = useMemo(() => {
    if (!lineMsgs) return [];
    const byPhone = {};
    for (const m of lineMsgs) {
      const p = normalizeWaPhone(m.phone);
      if (!byPhone[p] || new Date(m.created_at) > new Date(byPhone[p].created_at)) byPhone[p] = { ...m, phone: p };
    }
    return Object.values(byPhone).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [lineMsgs]);

  useEffect(() => {
    if (!autoOpenedRef.current && !openPhone && threads.length) {
      autoOpenedRef.current = true;
      setOpenPhone(threads[0].phone);
    }
  }, [threads, openPhone]);

  const filteredThreads = useMemo(() => {
    const q = search.trim().replace(/[^\d+]/g, '');
    if (!q) return threads;
    return threads.filter(t => t.phone.includes(q));
  }, [threads, search]);

  // فصل شات "تتبّع الطلبات" (إشعارات آلية) عن "المحادثات" (رد حر من عميل/موظف) — طلب صريح.
  const trackingThreads = useMemo(() => filteredThreads.filter(t => isOrderTrackingBody(t.body)), [filteredThreads]);
  const convoThreads = useMemo(() => filteredThreads.filter(t => !isOrderTrackingBody(t.body)), [filteredThreads]);

  const thread = useMemo(
    () => (lineMsgs || [])
      .filter(m => normalizeWaPhone(m.phone) === openPhone)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [lineMsgs, openPhone],
  );

  // يفتح المحادثة على آخر رسالة مباشرة (تحت) بدل أول رسالة (فوق) — طلب صريح.
  useEffect(() => {
    if (openPhone) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [openPhone, thread.length]);

  const send = async () => {
    const body = draft.trim();
    if (!openPhone || !/^\+\d{6,15}$/.test(openPhone) || !body) return;
    setDraft('');
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

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const Recorder = await loadOpusRecorder();
      const rec = new Recorder({
        encoderPath: OPUS_ENCODER_WORKER,
        streamPages: false, // false = ملف .ogg واحد كامل عند stop()، لا Streaming
        numberOfChannels: 1,
        encoderSampleRate: 16000, // كافٍ لصوت بشري، حجم ملف أصغر
      });
      rec.onstart = () => setRecording(true);
      rec.ondataavailable = (arrayBuffer) => {
        setRecording(false);
        const blob = new Blob([arrayBuffer], { type: 'audio/ogg' });
        if (blob.size > 0) sendMedia(blob, 'ogg');
      };
      recorderRef.current = rec;
      await rec.start();
    } catch (e) {
      setRecording(false);
      toast.error('تعذّر الوصول للميكروفون: ' + e.message);
    }
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
    const raw = window.prompt('حوّلي هالرسالة لأي رقم؟ (بكود الدولة، مثال: 905551234567)');
    if (!raw) return;
    const p = normalizePhoneInput(raw);
    if (!/^\+\d{6,15}$/.test(p)) {
      toast.error('رقم غير صالح');
      return;
    }
    setSending(true);
    try {
      const media = m.media_url ? { mediaUrl: m.media_url, mediaContentType: m.media_content_type } : null;
      await sendWhatsAppReply(p, m.body && !m.body.startsWith('[template:') ? m.body : '', userId, line, media);
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

  const renderThreadRow = (t) => (
    <div
      key={t.phone}
      onClick={() => setOpenPhone(t.phone)}
      className={`group px-3 py-2 border-b border-border/40 cursor-pointer flex items-center gap-2 ${t.phone === openPhone ? 'bg-teal/10' : ''}`}
    >
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm text-text" dir="ltr">{t.phone}</div>
        <div className="text-xs text-muted truncate">
          {t.direction === 'out' ? 'أنتم: ' : ''}
          {t.media_url && !t.body ? '📎 مرفق' : formatWaBody(t.body).slice(0, 40)}
        </div>
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
        <button onClick={load} className="text-xs text-teal-700 font-bold">تحديث ↻</button>
      </div>
      <p className="text-xs text-muted">الرسائل الواردة والصادرة عبر أرقام لوويز الرسمية.</p>

      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-xs font-bold rounded-lg px-3 py-1.5 bg-teal/10 text-teal-700">
          {WA_LINES[line].label} · {WA_LINES[line].number}
        </span>
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
            <div className="p-2 border-b border-border/40 shrink-0">
              <input
                className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-surface text-text"
                placeholder="🔍 بحث برقم الهاتف…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredThreads.length === 0 && (
                <div className="text-muted text-sm py-8 text-center">
                  {threads.length === 0 ? 'لا رسائل بعد' : 'لا نتائج'}
                </div>
              )}
              {convoThreads.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[11px] font-bold text-muted bg-border/20 sticky top-0">💬 المحادثات</div>
                  {convoThreads.map(renderThreadRow)}
                </>
              )}
              {trackingThreads.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[11px] font-bold text-muted bg-border/20 sticky top-0">📦 تتبّع الطلبات (آلي)</div>
                  {trackingThreads.map(renderThreadRow)}
                </>
              )}
            </div>
          </div>

          {/* المحادثة المفتوحة */}
          <div className={`bg-surface border border-border/60 rounded-xl flex-1 p-3 flex-col max-h-[70vh] ${openPhone ? 'flex' : 'hidden md:flex'}`}>
            {!openPhone && <div className="text-muted text-sm py-8 text-center">👈 اختر محادثة</div>}
            {openPhone && (
              <>
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-border/40 shrink-0 gap-2 flex-wrap">
                  <button
                    onClick={() => setOpenPhone('')}
                    className="md:hidden text-xs font-bold text-teal-700"
                  >
                    ‹ رجوع
                  </button>
                  <div className="font-bold text-sm text-text hidden md:block" dir="ltr">{openPhone}</div>
                  <div className="flex items-center gap-2">
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

                <div className="flex-1 overflow-y-auto flex flex-col gap-2 mb-2">
                  {thread.map(m => (
                    <div
                      key={m.id}
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
                        <span>
                          {new Date(m.created_at).toLocaleString('ar')}
                          {m.direction === 'out' && m.status ? ` · ${m.status}` : ''}
                        </span>
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
                  ))}
                  <div ref={bottomRef} />
                </div>

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

                <div className="flex gap-2">
                  <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={onImageChosen} />
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
    </div>
  );
}
