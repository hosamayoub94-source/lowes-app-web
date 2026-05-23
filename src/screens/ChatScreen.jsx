// =============================================================
// ChatScreen 2.0 — واتساب + ديسكورد
// قنوات الأقسام + رسائل خاصة + ردود + تفاعلات + صوت + صور + موسيقى
// =============================================================
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth }         from '@hooks/useAuth';
import { supabase }        from '@services/supabase';
import { MusicRoomPanel }  from '@components/chat/MusicRoomPanel';

// ── القنوات الافتراضية ─────────────────────────────────────
const DEFAULT_CHANNELS = [
  { name: '💬 عام',                team: 'عام',   description: 'قناة عامة للجميع' },
  { name: '📱 الميديا والمحتوى',  team: 'ميديا', description: 'فريق السوشال ميديا' },
  { name: '🇸🇾 مبيعات سوريا',      team: 'سوريا', description: 'فريق المبيعات سوريا' },
  { name: '🇹🇷 مبيعات تركيا',      team: 'تركيا', description: 'فريق المبيعات تركيا' },
  { name: '⚙️ الإدارة والعمليات', team: 'إدارة', description: 'الإدارة والعمليات' },
];

// ── Helpers ────────────────────────────────────────────────
function timeLabel(iso) {
  if (!iso) return '';
  const d   = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000)    return 'الآن';
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}د`;
  if (diff < 86400000) return d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
}

function dateDivider(iso) {
  const d   = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return 'اليوم';
  if (diff === 1) return 'أمس';
  return d.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' });
}

function groupByDay(msgs) {
  const groups = [];
  let lastDay  = null;
  msgs.forEach(m => {
    const day = new Date(m.created_at).toDateString();
    if (day !== lastDay) { groups.push({ type: 'divider', label: dateDivider(m.created_at), key: day }); lastDay = day; }
    groups.push({ type: 'msg', ...m });
  });
  return groups;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

// ── AI Bot ─────────────────────────────────────────────────
const BOT_NAME = '🤖 مساعد لووز';
const BOT_ID   = 'bot';

async function buildBotResponse(cmdText, roomId, userId, userName) {
  const cmd = cmdText.trim();
  const cmdL = cmd.toLowerCase();
  let response = '';

  try {
    // /مساعدة
    if (['/مساعدة', '/help', '/مساعده'].includes(cmdL)) {
      response = [
        '🤖 الأوامر المتاحة:',
        '',
        '📋 /مهامي   — مهامي المفتوحة',
        '📅 /حضور   — سجل حضوري اليوم',
        '👥 /الفريق  — قائمة أعضاء الفريق',
        '📢 /اعلانات — آخر 5 إعلانات',
        '❓ /مساعدة  — هذه القائمة',
      ].join('\n');
    }
    // /مهامي
    else if (['/مهامي', '/tasks', '/مهام'].includes(cmdL)) {
      const { data, error } = await supabase
        .from('tasks')
        .select('title,status,priority,due_date,assigned_to')
        .ilike('assigned_to', `%${userName}%`)
        .not('status', 'in', '("done","completed","مكتملة")')
        .order('created_at', { ascending: false })
        .limit(8);

      if (error) throw error;
      if (!data?.length) {
        response = '✅ ليس لديك مهام مفتوحة حالياً!';
      } else {
        const icons = { pending: '⏳', in_progress: '🔄', review: '👀', blocked: '🚫' };
        const lines = data.map(t => {
          const icon = icons[t.status] ?? '📋';
          const due  = t.due_date
            ? ` — ${new Date(t.due_date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}`
            : '';
          return `${icon} ${t.title}${due}`;
        });
        response = `📋 مهامك المفتوحة (${data.length}):\n\n${lines.join('\n')}`;
      }
    }
    // /حضور
    else if (['/حضور', '/attendance', '/حضوري'].includes(cmdL)) {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('attendance')
        .select('check_in,check_out,status,notes')
        .eq('user_id', userId)
        .eq('date', today)
        .maybeSingle();

      if (!data) {
        response = `📅 حضورك اليوم (${today}):\n\n❌ لم يتم تسجيل حضور بعد`;
      } else {
        const ci = data.check_in  ? `✅ دخول:  ${data.check_in}` : '❌ لم تسجل دخول';
        const co = data.check_out ? `🏠 خروج: ${data.check_out}` : '⏳ لم تسجل خروج بعد';
        response = `📅 حضورك اليوم (${today}):\n\n${ci}\n${co}`;
        if (data.notes) response += `\n📝 ${data.notes}`;
      }
    }
    // /الفريق
    else if (['/الفريق', '/team', '/فريق'].includes(cmdL)) {
      const { data } = await supabase
        .from('profiles')
        .select('employee_name,team,role_type')
        .eq('is_active', true)
        .order('employee_name')
        .limit(25);

      if (!data?.length) {
        response = '⚠️ لا توجد بيانات الفريق.';
      } else {
        const lines = data.map(p => `• ${p.employee_name}${p.team ? ` — ${p.team}` : ''}`);
        response = `👥 الفريق (${data.length} عضو):\n\n${lines.join('\n')}`;
      }
    }
    // /اعلانات
    else if (['/اعلانات', '/announcements', '/اعلان'].includes(cmdL)) {
      const { data } = await supabase
        .from('announcements')
        .select('title,created_at,is_pinned')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!data?.length) {
        response = '📢 لا توجد إعلانات حديثة.';
      } else {
        const lines = data.map(a => {
          const date = new Date(a.created_at).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
          return `${a.is_pinned ? '📌' : '📢'} ${a.title} — ${date}`;
        });
        response = `📢 آخر الإعلانات:\n\n${lines.join('\n')}`;
      }
    }
    // Unknown command
    else {
      response = `❓ أمر غير معروف: "${cmd}"\n\nاكتب /مساعدة لعرض الأوامر المتاحة.`;
    }
  } catch {
    response = '⚠️ حدث خطأ أثناء معالجة الأمر. حاول مجدداً.';
  }

  return {
    id:            `bot-${Date.now()}`,
    room_id:       roomId,
    sender_id:     BOT_ID,
    sender_name:   BOT_NAME,
    message_type:  'text',
    content:       response,
    created_at:    new Date().toISOString(),
    reply_to:      null,
    reply_preview: null,
  };
}

// ── Voice recorder hook ─────────────────────────────────────
function useVoiceRecorder(onDone) {
  const [recording, setRecording] = useState(false);
  const [seconds,   setSeconds]   = useState(0);
  const recRef    = useRef(null);
  const chunksRef = useRef([]);
  const timerRef  = useRef(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(timerRef.current);
        setSeconds(0);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onDone(blob);
      };
      recRef.current = mr;
      mr.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch { alert('الميكروفون غير متاح'); }
  };

  const stop = () => { recRef.current?.stop(); setRecording(false); };
  const cancel = () => {
    recRef.current?.stream?.getTracks().forEach(t => t.stop());
    recRef.current?.stop();
    chunksRef.current = [];
    setRecording(false);
    setSeconds(0);
    clearInterval(timerRef.current);
  };

  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return { recording, seconds, fmt, start, stop, cancel };
}

// ── ReactionBar ────────────────────────────────────────────
function ReactionBar({ reactions = [], messageId, userId, userName, onReact }) {
  const counts = {};
  reactions.forEach(r => { counts[r.emoji] = (counts[r.emoji] || 0) + 1; });
  if (!Object.keys(counts).length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {Object.entries(counts).map(([emoji, count]) => {
        const mine = reactions.some(r => r.emoji === emoji && r.user_id === userId);
        return (
          <button
            key={emoji}
            onClick={() => onReact(messageId, emoji)}
            className={`text-xs px-2 py-0.5 rounded-full border transition ${
              mine ? 'bg-teal/20 border-teal/40 text-teal' : 'bg-surface-alt border-border text-muted hover:border-teal/30'
            }`}
          >
            {emoji} {count}
          </button>
        );
      })}
    </div>
  );
}

// ── MessageBubble ──────────────────────────────────────────
function MessageBubble({ msg, isMine, userId, userName, onReply, onReact, reactions }) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [playing,   setPlaying]   = useState(false);
  const audioRef = useRef(null);

  // ── Bot card (different visual style) ───────────────────
  const isBot = msg.sender_id === BOT_ID || msg.sender_name?.startsWith('🤖');
  if (isBot) {
    return (
      <div className="flex justify-start mb-3">
        <div className="max-w-[88%] sm:max-w-[75%]">
          <span className="text-[10px] font-bold text-navy/50 ms-1 mb-1 block">🤖 مساعد لووز</span>
          <div className="bg-navy/[0.06] border border-navy/12 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
            <pre className="text-sm text-text whitespace-pre-wrap font-[inherit] leading-relaxed">{msg.content}</pre>
          </div>
          <span className="text-[9px] text-muted ms-1 mt-0.5 block">{timeLabel(msg.created_at)}</span>
        </div>
      </div>
    );
  }

  const toggleVoice = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else         { audioRef.current.play();  setPlaying(true);  }
  };

  return (
    <div
      className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1 group`}
      onMouseLeave={() => setShowEmoji(false)}
    >
      {/* Avatar (others only) */}
      {!isMine && (
        <div className="w-7 h-7 rounded-full bg-teal/10 flex items-center justify-center text-teal font-bold text-xs shrink-0 me-2 mt-auto mb-1">
          {msg.sender_name?.[0]?.toUpperCase() ?? '?'}
        </div>
      )}

      <div className={`max-w-[78%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
        {/* Sender name (group, not mine) */}
        {!isMine && (
          <span className="text-[10px] text-teal font-semibold mb-0.5 ms-1">{msg.sender_name}</span>
        )}

        {/* Reply preview */}
        {msg.reply_preview && (
          <div className={`text-[10px] px-2.5 py-1.5 rounded-lg mb-1 border-s-2 border-teal/60 bg-surface-alt text-muted max-w-full truncate ${
            isMine ? 'rounded-br-sm' : 'rounded-bl-sm'
          }`}>
            ↩ {msg.reply_preview}
          </div>
        )}

        {/* Bubble */}
        <div
          className={`relative rounded-2xl px-3 py-2 shadow-sm ${
            isMine
              ? 'bg-teal text-white rounded-br-sm'
              : 'bg-surface border border-border text-text rounded-bl-sm'
          }`}
        >
          {msg.message_type === 'text' && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
          )}

          {msg.message_type === 'image' && msg.file_url && (
            <img
              src={msg.file_url}
              alt="صورة"
              className="max-w-[220px] max-h-52 rounded-xl object-cover cursor-pointer"
              onClick={() => window.open(msg.file_url, '_blank')}
            />
          )}

          {msg.message_type === 'voice' && msg.file_url && (
            <div className="flex items-center gap-2 min-w-[160px]">
              <button
                onClick={toggleVoice}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                  isMine ? 'bg-white/20 hover:bg-white/30' : 'bg-teal/10 hover:bg-teal/20 text-teal'
                }`}
              >
                {playing ? '⏸' : '▶️'}
              </button>
              {/* Waveform bars (decorative) */}
              <div className="flex items-center gap-0.5 flex-1">
                {Array.from({ length: 20 }, (_, i) => (
                  <div
                    key={i}
                    className={`rounded-full flex-1 ${isMine ? 'bg-white/50' : 'bg-teal/40'}`}
                    style={{ height: `${4 + Math.sin(i * 1.5) * 6 + 6}px` }}
                  />
                ))}
              </div>
              <span className={`text-[10px] shrink-0 ${isMine ? 'text-white/70' : 'text-muted'}`}>
                {msg.duration_s ? `${msg.duration_s}ث` : '🎙️'}
              </span>
              <audio ref={audioRef} src={msg.file_url} onEnded={() => setPlaying(false)} hidden />
            </div>
          )}
        </div>

        {/* Reactions */}
        <ReactionBar
          reactions={reactions}
          messageId={msg.id}
          userId={userId}
          userName={userName}
          onReact={onReact}
        />

        {/* Time + actions row */}
        <div className={`flex items-center gap-2 mt-0.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-[9px] text-muted">{timeLabel(msg.created_at)}</span>

          {/* Hover actions */}
          <div className={`hidden group-hover:flex items-center gap-1`}>
            <button
              onClick={() => setShowEmoji(v => !v)}
              className="text-[11px] text-muted hover:text-text px-1"
              title="تفاعل"
            >😊</button>
            <button
              onClick={() => onReply(msg)}
              className="text-[11px] text-muted hover:text-text px-1"
              title="رد"
            >↩</button>
          </div>
        </div>

        {/* Emoji picker */}
        {showEmoji && (
          <div className="flex gap-1 mt-1 bg-surface border border-border rounded-2xl px-2 py-1.5 shadow-soft">
            {QUICK_EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => { onReact(msg.id, e); setShowEmoji(false); }}
                className="text-base hover:scale-125 transition-transform"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MessageInput ───────────────────────────────────────────
function MessageInput({ onSend, disabled, replyTo, onCancelReply }) {
  const [text,      setText]      = useState('');
  const [uploading, setUploading] = useState(false);
  const [imgPreview, setImgPreview] = useState(null);
  const [imgFile,    setImgFile]    = useState(null);
  const fileRef = useRef(null);
  const voice   = useVoiceRecorder(async (blob) => {
    setUploading(true);
    try {
      const path = `voice/${Date.now()}.webm`;
      const { data, error } = await supabase.storage.from('chat-files').upload(path, blob, { contentType: 'audio/webm' });
      if (error) throw error;
      const { data: u } = supabase.storage.from('chat-files').getPublicUrl(data.path);
      await onSend({ message_type: 'voice', file_url: u.publicUrl, duration_s: blob.size > 0 ? Math.max(1, Math.round(blob.size / 16000)) : 1 });
    } catch (e) { alert('فشل رفع الصوت: ' + e.message); }
    finally { setUploading(false); }
  });

  const sendText = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend({ message_type: 'text', content: t });
    setText('');
  };

  const sendImage = async () => {
    if (!imgFile) return;
    setUploading(true);
    try {
      const ext  = imgFile.name.split('.').pop();
      const path = `images/${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from('chat-files').upload(path, imgFile, { contentType: imgFile.type });
      if (error) throw error;
      const { data: u } = supabase.storage.from('chat-files').getPublicUrl(data.path);
      await onSend({ message_type: 'image', file_url: u.publicUrl });
    } catch (e) { alert('فشل رفع الصورة: ' + e.message); }
    finally { setUploading(false); setImgPreview(null); setImgFile(null); }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgFile(file);
    setImgPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  };

  return (
    <div className="border-t border-border bg-surface shrink-0">
      {/* Reply preview bar */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 pt-2 pb-1">
          <div className="flex-1 bg-surface-alt rounded-lg px-3 py-1.5 border-s-2 border-teal text-xs text-muted truncate">
            ↩ ردّاً على <span className="font-semibold text-teal">{replyTo.sender_name}</span>: {replyTo.content || (replyTo.message_type === 'image' ? '📷 صورة' : '🎙️ صوت')}
          </div>
          <button onClick={onCancelReply} className="text-muted hover:text-text text-lg leading-none">×</button>
        </div>
      )}

      {/* Image preview */}
      {imgPreview && (
        <div className="px-3 pt-2 flex items-start gap-2">
          <div className="relative">
            <img src={imgPreview} className="h-20 w-20 object-cover rounded-xl border border-border" alt="" />
            <button
              onClick={() => { setImgPreview(null); setImgFile(null); }}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
            >×</button>
          </div>
          <button
            onClick={sendImage}
            disabled={uploading}
            className="mt-1 px-3 py-1.5 rounded-xl bg-teal text-white text-xs font-semibold hover:bg-teal/90 disabled:opacity-50"
          >
            {uploading ? '⏳ يرفع…' : 'إرسال الصورة 📤'}
          </button>
        </div>
      )}

      {/* Voice recording bar */}
      {voice.recording && (
        <div className="flex items-center gap-3 px-3 py-2 bg-red-50 border-t border-red-200">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm text-red-600 font-mono">{voice.fmt(voice.seconds)}</span>
          <div className="flex-1 flex items-center gap-0.5">
            {Array.from({ length: 30 }, (_, i) => (
              <div key={i} className="flex-1 bg-red-300 rounded-full animate-pulse" style={{ height: `${3 + Math.random() * 8}px`, animationDelay: `${i * 0.05}s` }} />
            ))}
          </div>
          <button onClick={voice.cancel} className="text-xs text-red-500 font-semibold">إلغاء</button>
          <button onClick={voice.stop} className="px-3 py-1.5 rounded-xl bg-teal text-white text-xs font-semibold">إرسال ✓</button>
        </div>
      )}

      {/* Main input row */}
      {!voice.recording && (
        <div className="flex items-end gap-2 p-3">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading}
            className="w-9 h-9 rounded-xl bg-surface-alt border border-border flex items-center justify-center text-muted hover:text-teal hover:border-teal/40 transition shrink-0"
            title="إرسال صورة"
          >📷</button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="اكتب رسالة… أو /مساعدة للبوت"
            rows={1}
            disabled={disabled}
            className="flex-1 resize-none rounded-2xl border border-border bg-surface-alt px-4 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/30 max-h-28 overflow-y-auto"
            dir="rtl"
            style={{ lineHeight: '1.5' }}
          />

          <button
            onPointerDown={voice.start}
            disabled={disabled || uploading}
            className="w-9 h-9 rounded-xl bg-surface-alt border border-border flex items-center justify-center text-muted hover:text-teal hover:border-teal/40 transition shrink-0"
            title="اضغط مع الاستمرار للتسجيل"
          >🎙️</button>

          <button
            onClick={sendText}
            disabled={!text.trim() || disabled}
            className="w-9 h-9 rounded-xl bg-teal text-white flex items-center justify-center shrink-0 hover:bg-teal/90 disabled:opacity-40 transition"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ── ChannelItem ─────────────────────────────────────────────
function ChannelItem({ room, active, unread, onClick }) {
  const icon = room.name?.match(/[\p{Emoji}\u{1F1E0}-\u{1F1FF}]/gu)?.[0] ?? '#';
  const label = room.name?.replace(/^[\p{Emoji}\u{1F1E0}-\u{1F1FF}\s]+/gu, '').trim() || room.name;
  return (
    <button
      onClick={onClick}
      className={`w-full text-start px-2 py-2 rounded-xl transition flex items-center gap-2.5 group ${
        active ? 'bg-teal/10 text-teal' : 'text-muted hover:bg-surface-alt hover:text-text'
      }`}
    >
      <span className="text-base w-6 text-center flex-shrink-0">{icon}</span>
      <span className={`flex-1 text-sm truncate ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
      {unread > 0 && (
        <span className="w-5 h-5 rounded-full bg-teal text-white text-[9px] font-bold grid place-items-center flex-shrink-0">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}

// ── Main ChatScreen ─────────────────────────────────────────
export default function ChatScreen() {
  const { id: userId, name: userName } = useAuth();

  const [rooms,       setRooms]       = useState([]);
  const [activeRoom,  setActiveRoom]  = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [reactions,   setReactions]   = useState({}); // { messageId: [reaction] }
  const [lastMsgs,    setLastMsgs]    = useState({});
  const [unreadCounts,setUnreadCounts]= useState({});
  const [loading,     setLoading]     = useState(true);
  const [msgLoading,  setMsgLoading]  = useState(false);
  const [sending,     setSending]     = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [replyTo,       setReplyTo]       = useState(null);
  const [allProfiles,   setAllProfiles]   = useState([]);
  const [showNewDm,     setShowNewDm]     = useState(false);
  const [dmSearch,      setDmSearch]      = useState('');
  const [typingUsers,   setTypingUsers]   = useState([]);
  const [showMusicRoom, setShowMusicRoom] = useState(false);

  const msgEndRef  = useRef(null);
  const subRef     = useRef(null);
  const typingRef  = useRef(null);

  // ── Load rooms ───────────────────────────────────────────
  const loadRooms = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // Load group rooms
      let { data: groups, error } = await supabase
        .from('chat_rooms').select('id,type,name,team,description')
        .eq('type', 'group')
        .order('created_at');

      if (error?.code === '42P01') { setLoading(false); return; }

      // Seed if empty
      if (!groups?.length) {
        const { data: seeded } = await supabase.from('chat_rooms')
          .insert(DEFAULT_CHANNELS.map(c => ({ type: 'group', ...c, created_by: userId })))
          .select('id,type,name,team,description');
        groups = seeded ?? [];
      }

      // Load DM rooms I'm part of
      const { data: myMemberships } = await supabase
        .from('chat_room_members').select('room_id').eq('user_id', userId);
      let dmRooms = [];
      if (myMemberships?.length) {
        const ids = myMemberships.map(m => m.room_id);
        const { data: dms } = await supabase
          .from('chat_rooms').select('id,type,name,team').eq('type', 'dm').in('id', ids);
        if (dms?.length) {
          const enriched = await Promise.all(dms.map(async r => {
            const { data: members } = await supabase
              .from('chat_room_members').select('user_id,display_name').eq('room_id', r.id);
            const other = members?.find(m => m.user_id !== userId);
            return { ...r, display_name: other?.display_name ?? r.name };
          }));
          dmRooms = enriched;
        }
      }

      const allRooms = [...(groups ?? []), ...dmRooms];
      setRooms(allRooms);

      // Last messages preview
      if (allRooms.length) {
        const { data: lms } = await supabase
          .from('chat_messages').select('room_id,content,message_type,created_at')
          .in('room_id', allRooms.map(r => r.id))
          .order('created_at', { ascending: false });
        const map = {};
        (lms ?? []).forEach(m => {
          if (!map[m.room_id]) {
            map[m.room_id] = m.message_type === 'text'  ? m.content
              : m.message_type === 'image' ? '📷 صورة'
              : '🎙️ رسالة صوتية';
          }
        });
        setLastMsgs(map);
      }

      if (allRooms.length && !activeRoom) setActiveRoom(allRooms[0]);
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  // ── Load messages ────────────────────────────────────────
  const loadMessages = useCallback(async (roomId) => {
    if (!roomId) return;
    setMsgLoading(true);
    const { data } = await supabase
      .from('chat_messages').select('*')
      .eq('room_id', roomId)
      .order('created_at').limit(150);
    setMessages(data ?? []);

    // Load reactions for these messages
    if (data?.length) {
      const ids = data.map(m => m.id);
      const { data: rxs } = await supabase
        .from('chat_reactions').select('*').in('message_id', ids);
      const map = {};
      (rxs ?? []).forEach(r => {
        if (!map[r.message_id]) map[r.message_id] = [];
        map[r.message_id].push(r);
      });
      setReactions(map);
    }
    setMsgLoading(false);
  }, []);

  useEffect(() => {
    if (!activeRoom?.id) return;
    setReplyTo(null);
    loadMessages(activeRoom.id);

    // Realtime
    subRef.current?.unsubscribe();
    subRef.current = supabase
      .channel(`room:${activeRoom.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${activeRoom.id}` },
        payload => {
          setMessages(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          setLastMsgs(prev => ({
            ...prev,
            [activeRoom.id]: payload.new.message_type === 'text' ? payload.new.content
              : payload.new.message_type === 'image' ? '📷 صورة' : '🎙️ رسالة صوتية',
          }));
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reactions' },
        () => loadMessages(activeRoom.id))
      .subscribe();

    return () => subRef.current?.unsubscribe();
  }, [activeRoom?.id, loadMessages]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ─────────────────────────────────────────
  const handleSend = async (msgData) => {
    if (!activeRoom || !userId) return;
    setSending(true);
    try {
      const payload = {
        room_id:      activeRoom.id,
        sender_id:    userId,
        sender_name:  userName,
        created_at:   new Date().toISOString(),
        ...msgData,
      };
      if (replyTo) {
        payload.reply_to      = replyTo.id;
        payload.reply_preview = replyTo.content
          ? replyTo.content.slice(0, 60)
          : replyTo.message_type === 'image' ? '📷 صورة' : '🎙️ صوت';
      }
      const { error } = await supabase.from('chat_messages').insert(payload);
      if (error) throw error;
      setReplyTo(null);

      // ── Bot command ──────────────────────────────────────
      if (msgData.message_type === 'text' && msgData.content?.startsWith('/')) {
        buildBotResponse(msgData.content, activeRoom.id, userId, userName)
          .then(botMsg => setMessages(prev => [...prev, botMsg]))
          .catch(() => {});
      }
    } catch (e) { alert('فشل الإرسال: ' + e.message); }
    finally { setSending(false); }
  };

  // ── React to message ─────────────────────────────────────
  const handleReact = async (messageId, emoji) => {
    if (!userId) return;
    const existing = (reactions[messageId] ?? []).find(r => r.emoji === emoji && r.user_id === userId);
    if (existing) {
      await supabase.from('chat_reactions').delete()
        .eq('message_id', messageId).eq('user_id', userId).eq('emoji', emoji);
    } else {
      await supabase.from('chat_reactions').insert({ message_id: messageId, user_id: userId, user_name: userName, emoji });
    }
    // Refresh reactions
    const { data } = await supabase.from('chat_reactions').select('*').eq('message_id', messageId);
    setReactions(prev => ({ ...prev, [messageId]: data ?? [] }));
  };

  // ── Open DM ──────────────────────────────────────────────
  const openDmWith = async (profile) => {
    // Check existing
    const { data: myRooms } = await supabase.from('chat_room_members').select('room_id').eq('user_id', userId);
    const myIds = myRooms?.map(r => r.room_id) ?? [];
    if (myIds.length) {
      const { data: shared } = await supabase.from('chat_room_members')
        .select('room_id').eq('user_id', profile.id).in('room_id', myIds);
      if (shared?.length) {
        const ex = rooms.find(r => r.id === shared[0].room_id && r.type === 'dm');
        if (ex) { setActiveRoom(ex); setShowNewDm(false); return; }
      }
    }
    const { data: room, error } = await supabase.from('chat_rooms')
      .insert({ type: 'dm', name: profile.employee_name, created_by: userId }).select().single();
    if (error) { alert('خطأ: ' + error.message); return; }
    await supabase.from('chat_room_members').insert([
      { room_id: room.id, user_id: userId,    display_name: userName },
      { room_id: room.id, user_id: profile.id, display_name: profile.employee_name },
    ]);
    const enriched = { ...room, display_name: profile.employee_name };
    setRooms(prev => [...prev, enriched]);
    setActiveRoom(enriched);
    setShowNewDm(false);
    setDmSearch('');
  };

  const loadProfiles = async () => {
    const { data } = await supabase.from('profiles')
      .select('id,employee_name,role_type,team').eq('is_active', true).neq('id', userId).order('employee_name');
    setAllProfiles(data ?? []);
  };

  // ── Render ───────────────────────────────────────────────
  const groupRooms = rooms.filter(r => r.type === 'group');
  const dmRooms    = rooms.filter(r => r.type === 'dm');
  const grouped    = groupByDay(messages);
  const filteredProfiles = allProfiles.filter(p =>
    !dmSearch || p.employee_name?.toLowerCase().includes(dmSearch.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-2xl border border-border bg-surface" dir="rtl">

      {/* ══ Sidebar ══════════════════════════════════════════ */}
      <div className={`transition-all duration-200 ${sidebarOpen ? 'w-64 sm:w-72' : 'w-0'} shrink-0 overflow-hidden flex flex-col border-e border-border bg-surface`}>

        {/* Sidebar header */}
        <div className="px-3 py-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-extrabold text-text text-sm">Lowe's Pro 💙</h2>
            <button
              onClick={() => { setShowNewDm(true); loadProfiles(); }}
              className="w-7 h-7 rounded-lg bg-teal/10 text-teal text-base flex items-center justify-center hover:bg-teal/20 transition"
              title="رسالة خاصة جديدة"
            >✎</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-4">
          {/* Music Room shortcut */}
          <button
            onClick={() => { setShowMusicRoom(v => !v); }}
            className={`w-full text-start px-2 py-2 rounded-xl transition flex items-center gap-2.5 ${
              showMusicRoom ? 'bg-teal/10 text-teal' : 'text-muted hover:bg-surface-alt hover:text-text'
            }`}
          >
            <span className="text-base w-6 text-center flex-shrink-0">🎵</span>
            <span className={`flex-1 text-sm ${showMusicRoom ? 'font-bold' : 'font-medium'}`}>غرفة الموسيقى</span>
            {showMusicRoom && <span className="text-[9px] text-teal font-semibold">مباشر</span>}
          </button>

          {/* Channels */}
          <div>
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider px-2 mb-1">القنوات</p>
            {loading ? (
              <div className="space-y-1">
                {[1,2,3,4,5].map(i => <div key={i} className="h-9 rounded-xl bg-surface-alt animate-pulse" />)}
              </div>
            ) : groupRooms.map(r => (
              <ChannelItem
                key={r.id}
                room={r}
                active={activeRoom?.id === r.id && !showMusicRoom}
                unread={unreadCounts[r.id] ?? 0}
                onClick={() => { setActiveRoom(r); setShowMusicRoom(false); }}
              />
            ))}
          </div>

          {/* DMs */}
          {dmRooms.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider px-2 mb-1">رسائل خاصة</p>
              {dmRooms.map(r => (
                <button
                  key={r.id}
                  onClick={() => { setActiveRoom(r); setShowMusicRoom(false); }}
                  className={`w-full text-start px-2 py-2 rounded-xl transition flex items-center gap-2.5 ${
                    activeRoom?.id === r.id && !showMusicRoom ? 'bg-teal/10 text-teal' : 'text-muted hover:bg-surface-alt hover:text-text'
                  }`}
                >
                  <div className="relative">
                    <div className="w-7 h-7 rounded-full bg-teal/10 flex items-center justify-center text-teal font-bold text-xs">
                      {(r.display_name ?? r.name)?.[0]?.toUpperCase()}
                    </div>
                  </div>
                  <span className="flex-1 text-sm font-medium truncate">{r.display_name ?? r.name}</span>
                  {lastMsgs[r.id] && (
                    <span className="text-[9px] text-muted truncate max-w-[60px]">{lastMsgs[r.id]}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══ Chat area ══════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <div className="px-3 py-3 border-b border-border flex items-center gap-3 shrink-0 bg-surface">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="w-8 h-8 rounded-lg bg-surface-alt border border-border flex items-center justify-center text-muted hover:text-text transition"
          >☰</button>

          {showMusicRoom ? (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text">🎵 غرفة الموسيقى</p>
              <p className="text-[10px] text-muted">استمع مع فريقك بشكل متزامن</p>
            </div>
          ) : activeRoom && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text truncate">
                {activeRoom.display_name ?? activeRoom.name}
              </p>
              {activeRoom.description && (
                <p className="text-[10px] text-muted truncate">{activeRoom.description}</p>
              )}
            </div>
          )}

          {/* Members count placeholder */}
          {!showMusicRoom && activeRoom?.type === 'group' && (
            <div className="flex items-center gap-1 text-xs text-muted">
              <span>👥</span>
              <span>{groupRooms.find(r => r.id === activeRoom.id)?.team ?? ''}</span>
            </div>
          )}
        </div>

        {/* Music Room */}
        {showMusicRoom && (
          <MusicRoomPanel userId={userId} userName={userName} />
        )}

        {/* Messages + Input (hidden when music room is open) */}
        {!showMusicRoom && (
          <>
            <div className="flex-1 overflow-y-auto overscroll-contain" style={{ background: 'rgb(var(--color-cream, var(--color-surface-alt)))' }}>
              <div className="px-4 py-4 space-y-0.5">
                {!activeRoom ? (
                  <div className="h-64 flex flex-col items-center justify-center text-muted">
                    <p className="text-4xl mb-3">💬</p>
                    <p className="text-sm">اختر قناة لتبدأ</p>
                  </div>
                ) : msgLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-2 border-teal/30 border-t-teal rounded-full animate-spin" />
                  </div>
                ) : grouped.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-4xl mb-3">💬</p>
                    <p className="font-bold text-text">لا توجد رسائل بعد</p>
                    <p className="text-sm text-muted mt-1">كن أول من يبدأ النقاش!</p>
                  </div>
                ) : (
                  grouped.map((item) => {
                    if (item.type === 'divider') {
                      return (
                        <div key={item.key} className="flex items-center gap-3 py-3">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-[10px] text-muted font-medium px-2 bg-surface-alt rounded-full py-0.5">{item.label}</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      );
                    }
                    return (
                      <MessageBubble
                        key={item.id}
                        msg={item}
                        isMine={item.sender_id === userId}
                        userId={userId}
                        userName={userName}
                        onReply={setReplyTo}
                        onReact={handleReact}
                        reactions={reactions[item.id] ?? []}
                      />
                    );
                  })
                )}
                <div ref={msgEndRef} />
              </div>
            </div>

            {activeRoom && (
              <MessageInput
                onSend={handleSend}
                disabled={sending}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
              />
            )}
          </>
        )}
      </div>

      {/* ══ New DM modal ══════════════════════════════════════ */}
      {showNewDm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && setShowNewDm(false)}
        >
          <div className="w-full max-w-sm bg-surface rounded-2xl shadow-xl border border-border overflow-hidden" dir="rtl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-base font-bold text-text">رسالة خاصة جديدة</h2>
              <button onClick={() => setShowNewDm(false)} className="text-muted hover:text-text text-xl">✕</button>
            </div>
            <div className="p-3">
              <input
                value={dmSearch}
                onChange={e => setDmSearch(e.target.value)}
                placeholder="بحث بالاسم…"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30 mb-3"
                autoFocus
              />
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {filteredProfiles.length === 0 ? (
                  <p className="text-center text-muted text-sm py-4">لا توجد نتائج</p>
                ) : filteredProfiles.map(p => (
                  <button
                    key={p.id}
                    onClick={() => openDmWith(p)}
                    className="w-full text-start px-3 py-2.5 rounded-xl hover:bg-surface-alt transition flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-teal/10 flex items-center justify-center text-teal font-bold text-sm shrink-0">
                      {p.employee_name?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text">{p.employee_name}</p>
                      <p className="text-xs text-muted">{p.team ?? ''}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
