// =============================================================
// ChatScreen 3.0 — نظام العضوية + طلبات الانضمام + مجموعات خاصة
// WhatsApp × Discord — RTL Arabic
// =============================================================
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth }        from '@hooks/useAuth';
import { supabase }       from '@services/supabase';
import { MusicRoomPanel } from '@components/chat/MusicRoomPanel';
import { ROLES }          from '@data/teams';

// ── القنوات الافتراضية (تُنشأ تلقائياً عند أول استخدام) ──────
const DEFAULT_CHANNELS = [
  { name: '💬 عام',                team: 'عام',   description: 'قناة عامة للجميع',             requires_approval: false, is_private: false },
  { name: '📱 الميديا والمحتوى',  team: 'ميديا', description: 'فريق السوشال ميديا',            requires_approval: true,  is_private: false },
  { name: '🇸🇾 مبيعات سوريا',      team: 'سوريا', description: 'فريق المبيعات سوريا',          requires_approval: true,  is_private: false },
  { name: '🇹🇷 مبيعات تركيا',      team: 'تركيا', description: 'فريق المبيعات تركيا',          requires_approval: true,  is_private: false },
  { name: '⚙️ الإدارة والعمليات', team: 'إدارة', description: 'الإدارة والعمليات والتخطيط',   requires_approval: true,  is_private: false },
];

// أدوار تستطيع قبول/رفض طلبات الانضمام
const APPROVER_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER, ROLES.SOCIAL_MANAGER];

// ── Helpers ────────────────────────────────────────────────────
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
    if (day !== lastDay) {
      groups.push({ type: 'divider', label: dateDivider(m.created_at), key: day });
      lastDay = day;
    }
    groups.push({ type: 'msg', ...m });
  });
  return groups;
}

const QUICK_EMOJIS = ['👍','❤️','😂','😮','😢','🔥'];

// ── AI Bot ──────────────────────────────────────────────────────
const BOT_NAME = '🤖 مساعد لووز';
const BOT_ID   = 'bot';

async function buildBotResponse(cmdText, roomId, userId, userName) {
  const cmd  = cmdText.trim();
  const cmdL = cmd.toLowerCase();
  let response = '';
  try {
    if (['/مساعدة','/help','/مساعده'].includes(cmdL)) {
      response = ['🤖 الأوامر المتاحة:','','📋 /مهامي   — مهامي المفتوحة','📅 /حضور   — سجل حضوري اليوم','👥 /الفريق  — قائمة أعضاء الفريق','📢 /اعلانات — آخر 5 إعلانات','❓ /مساعدة  — هذه القائمة'].join('\n');
    } else if (['/مهامي','/tasks','/مهام'].includes(cmdL)) {
      const { data } = await supabase.from('tasks').select('title,status,priority,due_date').ilike('assigned_to',`%${userName}%`).not('status','in','("done","completed","مكتملة")').order('created_at',{ascending:false}).limit(8);
      if (!data?.length) { response = '✅ ليس لديك مهام مفتوحة حالياً!'; }
      else {
        const icons = { pending:'⏳', in_progress:'🔄', review:'👀', blocked:'🚫' };
        response = `📋 مهامك المفتوحة (${data.length}):\n\n${data.map(t=>`${icons[t.status]??'📋'} ${t.title}${t.due_date?` — ${new Date(t.due_date).toLocaleDateString('ar-SA',{month:'short',day:'numeric'})}`:''}`).join('\n')}`;
      }
    } else if (['/حضور','/attendance','/حضوري'].includes(cmdL)) {
      const today = new Date().toISOString().slice(0,10);
      const { data } = await supabase.from('attendance').select('check_in,check_out,status,notes').eq('user_id',userId).eq('date',today).maybeSingle();
      if (!data) { response = `📅 حضورك اليوم (${today}):\n\n❌ لم يتم تسجيل حضور بعد`; }
      else { response = `📅 حضورك اليوم (${today}):\n\n${data.check_in?`✅ دخول:  ${data.check_in}`:'❌ لم تسجل دخول'}\n${data.check_out?`🏠 خروج: ${data.check_out}`:'⏳ لم تسجل خروج بعد'}${data.notes?`\n📝 ${data.notes}`:''}`; }
    } else if (['/الفريق','/team','/فريق'].includes(cmdL)) {
      const { data } = await supabase.from('profiles').select('employee_name,team,role_type').eq('is_active',true).order('employee_name').limit(25);
      if (!data?.length) { response = '⚠️ لا توجد بيانات الفريق.'; }
      else { response = `👥 الفريق (${data.length} عضو):\n\n${data.map(p=>`• ${p.employee_name}${p.team?` — ${p.team}`:''}`).join('\n')}`; }
    } else if (['/اعلانات','/announcements','/اعلان'].includes(cmdL)) {
      const { data } = await supabase.from('announcements').select('title,created_at,is_pinned').order('created_at',{ascending:false}).limit(5);
      if (!data?.length) { response = '📢 لا توجد إعلانات حديثة.'; }
      else { response = `📢 آخر الإعلانات:\n\n${data.map(a=>`${a.is_pinned?'📌':'📢'} ${a.title} — ${new Date(a.created_at).toLocaleDateString('ar-SA',{month:'short',day:'numeric'})}`).join('\n')}`; }
    } else { response = `❓ أمر غير معروف: "${cmd}"\n\nاكتب /مساعدة لعرض الأوامر المتاحة.`; }
  } catch { response = '⚠️ حدث خطأ أثناء معالجة الأمر. حاول مجدداً.'; }
  return { id:`bot-${Date.now()}`, room_id:roomId, sender_id:BOT_ID, sender_name:BOT_NAME, message_type:'text', content:response, created_at:new Date().toISOString(), reply_to:null, reply_preview:null };
}

// ── Voice recorder hook ─────────────────────────────────────────
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
        onDone(new Blob(chunksRef.current, { type: 'audio/webm' }));
      };
      recRef.current = mr;
      mr.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch { alert('لا يمكن الوصول إلى الميكروفون'); }
  };

  const stop   = () => { recRef.current?.stop(); setRecording(false); };
  const cancel = () => { chunksRef.current = []; recRef.current?.stop(); setRecording(false); setSeconds(0); };
  const fmt    = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  return { recording, seconds, start, stop, cancel, fmt };
}

// ── VoiceMessage ────────────────────────────────────────────────
function VoiceMessage({ url, isMine }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  useEffect(() => { audioRef.current = new Audio(url); audioRef.current.onended = () => setPlaying(false); return () => audioRef.current?.pause(); }, [url]);
  const toggle = () => { if (!audioRef.current) return; if (playing) { audioRef.current.pause(); setPlaying(false); } else { audioRef.current.play(); setPlaying(true); } };
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <button onClick={toggle} className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 transition ${isMine ? 'bg-white/20 hover:bg-white/30' : 'bg-teal/10 hover:bg-teal/20 text-teal'}`}>
        {playing ? '⏸' : '▶'}
      </button>
      <div className="flex-1 flex items-center gap-0.5 h-5">
        {Array.from({length:20},(_,i) => (
          <div key={i} className={`flex-1 rounded-full transition-all ${playing ? (isMine ? 'bg-white/60' : 'bg-teal/50') : (isMine ? 'bg-white/30' : 'bg-teal/20')}`}
            style={{height:`${4+Math.sin(i*0.7)*4+Math.cos(i*1.3)*3}px`}} />
        ))}
      </div>
      <span className={`text-[10px] font-mono flex-shrink-0 ${isMine ? 'text-white/60' : 'text-muted'}`}>🎙️</span>
    </div>
  );
}

// ── MessageBubble ───────────────────────────────────────────────
function MessageBubble({ msg, isMine, userId, onReply, onReact, reactions }) {
  const [showReacts, setShowReacts] = useState(false);
  const rxMap = {};
  (reactions ?? []).forEach(r => { rxMap[r.emoji] = (rxMap[r.emoji] ?? 0) + 1; });

  // Bot message
  if (msg.sender_id === BOT_ID || msg.sender_name?.startsWith('🤖')) {
    return (
      <div className="flex justify-start mb-2 animate-in slide-in-from-bottom-2 duration-200">
        <div className="max-w-[85%] sm:max-w-[72%]">
          <span className="text-[10px] font-bold text-navy/50 ms-1 mb-1 block">🤖 مساعد لووز</span>
          <div className="bg-navy/[0.06] border border-navy/10 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
            <pre className="text-sm text-text whitespace-pre-wrap font-[inherit] leading-relaxed">{msg.content}</pre>
          </div>
          <span className="text-[9px] text-muted ms-1 mt-0.5 block">{timeLabel(msg.created_at)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex mb-1.5 group animate-in slide-in-from-bottom-1 duration-150 ${isMine ? 'justify-end' : 'justify-start'}`}>
      {/* Avatar (others only) */}
      {!isMine && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal/30 to-navy/20 flex items-center justify-center text-navy font-bold text-xs shrink-0 me-2 mt-auto mb-1 select-none">
          {msg.sender_name?.[0]?.toUpperCase() ?? '?'}
        </div>
      )}

      <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[80%] sm:max-w-[68%]`}>
        {/* Sender name */}
        {!isMine && (
          <span className="text-[10px] text-teal font-semibold mb-0.5 ms-1">{msg.sender_name}</span>
        )}

        {/* Reply preview */}
        {msg.reply_preview && (
          <div className={`mb-1 px-3 py-1.5 rounded-lg text-[11px] border-s-2 border-teal text-muted bg-surface-alt/80 max-w-full truncate ${isMine ? 'self-end' : ''}`}>
            ↩ <span className="font-medium text-teal">{msg.reply_to}</span> {msg.reply_preview}
          </div>
        )}

        {/* Bubble */}
        <div className="relative">
          <div
            onDoubleClick={() => onReact?.(msg.id, '❤️')}
            className={`px-3.5 py-2 rounded-2xl shadow-sm cursor-pointer select-text transition-transform active:scale-[0.98] ${
              isMine
                ? 'bg-teal text-white rounded-br-sm'
                : 'bg-surface border border-border text-text rounded-bl-sm'
            }`}
          >
            {msg.message_type === 'text' && (
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
            )}
            {msg.message_type === 'image' && msg.file_url && (
              <img src={msg.file_url} alt="صورة" className="max-w-[220px] rounded-xl max-h-60 object-cover" />
            )}
            {msg.message_type === 'voice' && msg.file_url && (
              <VoiceMessage url={msg.file_url} isMine={isMine} />
            )}
          </div>

          {/* Quick react button */}
          <button
            onClick={() => setShowReacts(v => !v)}
            className={`absolute top-0 opacity-0 group-hover:opacity-100 transition-all duration-150 w-6 h-6 rounded-full bg-surface border border-border text-xs flex items-center justify-center shadow-sm hover:scale-110 ${isMine ? '-left-7' : '-right-7'}`}
          >😊</button>
        </div>

        {/* Quick emoji picker */}
        {showReacts && (
          <div className={`flex gap-1 mt-1 px-2 py-1.5 bg-surface border border-border rounded-full shadow-lg animate-in zoom-in-90 duration-150 ${isMine ? 'self-end' : ''}`}>
            {QUICK_EMOJIS.map(e => (
              <button key={e} onClick={() => { onReact?.(msg.id, e); setShowReacts(false); }}
                className="text-base hover:scale-125 transition-transform duration-100">{e}</button>
            ))}
          </div>
        )}

        {/* Reactions bar */}
        {Object.keys(rxMap).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(rxMap).map(([emoji, count]) => (
              <button key={emoji} onClick={() => onReact?.(msg.id, emoji)}
                className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-surface-alt border border-border text-xs hover:scale-105 transition-transform shadow-sm">
                <span>{emoji}</span><span className="text-muted font-semibold">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Time + reply */}
        <div className={`flex items-center gap-2 mt-0.5 ${isMine ? 'flex-row-reverse' : ''}`}>
          <span className="text-[9px] text-muted">{timeLabel(msg.created_at)}</span>
          <button onClick={() => onReply?.(msg)}
            className="text-[9px] text-muted opacity-0 group-hover:opacity-100 transition-opacity hover:text-teal">
            ↩ رد
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MessageInput ────────────────────────────────────────────────
function MessageInput({ onSend, disabled, replyTo, onCancelReply }) {
  const [text,      setText]      = useState('');
  const [uploading, setUploading] = useState(false);
  const [imgPreview, setImgPreview] = useState(null);
  const [imgFile,    setImgFile]    = useState(null);
  const fileRef = useRef(null);
  const textRef = useRef(null);

  const voice = useVoiceRecorder(async (blob) => {
    setUploading(true);
    try {
      const path = `voice/${Date.now()}.webm`;
      const { data, error } = await supabase.storage.from('chat-files').upload(path, blob, { contentType: 'audio/webm' });
      if (error) throw error;
      const { data: u } = supabase.storage.from('chat-files').getPublicUrl(data.path);
      await onSend({ message_type: 'voice', file_url: u.publicUrl, duration_s: Math.max(1, Math.round(blob.size / 16000)) });
    } catch (e) { alert('فشل رفع الصوت: ' + e.message); }
    finally { setUploading(false); }
  });

  const sendText = () => {
    const t = text.trim();
    if (!t) return;
    onSend({ message_type: 'text', content: t });
    setText('');
    textRef.current?.focus();
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
    const reader = new FileReader();
    reader.onload = ev => setImgPreview(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="shrink-0 border-t border-border bg-surface">
      {/* Reply bar */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 pt-2 pb-1">
          <div className="flex-1 bg-teal/5 border border-teal/20 rounded-xl px-3 py-1.5 text-xs text-muted truncate">
            ↩ ردّاً على <span className="font-semibold text-teal">{replyTo.sender_name}</span>: {replyTo.content || (replyTo.message_type === 'image' ? '📷 صورة' : '🎙️ صوت')}
          </div>
          <button onClick={onCancelReply} className="text-muted hover:text-red-500 text-xl leading-none transition-colors">×</button>
        </div>
      )}

      {/* Image preview */}
      {imgPreview && (
        <div className="px-3 pt-2 flex items-start gap-2 animate-in slide-in-from-bottom-2 duration-200">
          <div className="relative">
            <img src={imgPreview} alt="" className="w-16 h-16 rounded-xl object-cover border border-border" />
            <button onClick={() => { setImgPreview(null); setImgFile(null); }}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center shadow">×</button>
          </div>
          <button onClick={sendImage} disabled={uploading}
            className="mt-1 px-4 py-2 rounded-xl bg-teal text-white text-xs font-bold hover:bg-teal/90 disabled:opacity-50 transition">
            {uploading ? '⏳ يرفع…' : '📤 إرسال'}
          </button>
        </div>
      )}

      {/* Recording bar */}
      {voice.recording && (
        <div className="flex items-center gap-3 px-3 py-2 bg-red-50 dark:bg-red-950/20 border-t border-red-100 animate-in slide-in-from-bottom-2 duration-200">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm text-red-600 font-mono font-bold">{voice.fmt(voice.seconds)}</span>
          <div className="flex-1 flex items-end gap-0.5 h-6">
            {Array.from({length:30},(_,i) => (
              <div key={i} className="flex-1 bg-red-400 rounded-full animate-pulse"
                style={{height:`${3+Math.random()*9}px`, animationDelay:`${i*0.04}s`}} />
            ))}
          </div>
          <button onClick={voice.cancel} className="text-xs text-red-500 font-semibold hover:text-red-700 transition-colors">إلغاء</button>
          <button onClick={voice.stop} className="px-3 py-1.5 rounded-xl bg-teal text-white text-xs font-bold hover:bg-teal/90 transition">✓ إرسال</button>
        </div>
      )}

      {/* Main input */}
      {!voice.recording && (
        <div className="flex items-end gap-2 p-3">
          <button onClick={() => fileRef.current?.click()} disabled={disabled||uploading}
            className="w-9 h-9 rounded-xl bg-surface-alt border border-border flex items-center justify-center text-muted hover:text-teal hover:border-teal/40 transition shrink-0">
            📷
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

          <div className="flex-1 relative">
            <textarea
              ref={textRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } }}
              placeholder="اكتب رسالة… أو /مساعدة للبوت"
              rows={1}
              disabled={disabled||uploading}
              className="w-full border border-border rounded-2xl px-4 py-2.5 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30 resize-none disabled:opacity-60 transition max-h-32"
              style={{overflowY:'auto'}}
              onInput={e => { e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight, 128)+'px'; }}
            />
          </div>

          {text.trim() ? (
            <button onClick={sendText} disabled={disabled||uploading}
              className="w-9 h-9 rounded-xl bg-teal text-white flex items-center justify-center hover:bg-teal/90 disabled:opacity-50 transition shrink-0 shadow-sm">
              ↑
            </button>
          ) : (
            <button onPointerDown={voice.start} disabled={disabled||uploading}
              className="w-9 h-9 rounded-xl bg-surface-alt border border-border flex items-center justify-center text-muted hover:text-teal hover:border-teal/40 transition shrink-0"
              title="اضغط مع الاستمرار للتسجيل">
              🎙️
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── ChannelItem ─────────────────────────────────────────────────
function ChannelItem({ room, active, unread, onClick }) {
  const icon  = room.is_private ? '🔒' : room.type === 'dm' ? null : '#';
  const label = room.display_name ?? room.name;
  return (
    <button
      onClick={onClick}
      className={`w-full text-start px-2.5 py-2 rounded-xl transition-all duration-150 flex items-center gap-2.5 ${
        active
          ? 'bg-teal/10 text-teal shadow-sm'
          : 'text-muted hover:bg-surface-alt hover:text-text'
      }`}
    >
      <span className={`text-sm w-5 text-center flex-shrink-0 font-bold ${active ? 'text-teal' : 'text-muted/60'}`}>{icon}</span>
      <span className={`flex-1 text-sm truncate ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
      {unread > 0 && (
        <span className="w-5 h-5 rounded-full bg-teal text-white text-[9px] font-bold grid place-items-center flex-shrink-0 animate-bounce-slow">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}

// ── DiscoverPanel — اكتشف قنوات جديدة ─────────────────────────
function DiscoverPanel({ allChannels, memberRoomIds, userId, userName, onClose, onRequestSent }) {
  const [requests,  setRequests]  = useState({});  // roomId → 'pending'|'approved'|'rejected'
  const [loading,   setLoading]   = useState(true);
  const [sending,   setSending]   = useState(null); // roomId being processed

  const available = allChannels.filter(r => !memberRoomIds.includes(r.id) && !r.is_private);

  useEffect(() => {
    (async () => {
      if (!available.length) { setLoading(false); return; }
      const { data } = await supabase
        .from('chat_join_requests')
        .select('room_id,status')
        .eq('user_id', userId)
        .in('room_id', available.map(r => r.id));
      const map = {};
      (data ?? []).forEach(r => { map[r.room_id] = r.status; });
      setRequests(map);
      setLoading(false);
    })();
  }, [userId]);

  const requestJoin = async (room) => {
    setSending(room.id);
    try {
      await supabase.from('chat_join_requests').upsert({
        room_id: room.id, room_name: room.name,
        user_id: userId,  user_name: userName,
        status:  'pending',
        requested_at: new Date().toISOString(),
      }, { onConflict: 'room_id,user_id' });
      setRequests(prev => ({ ...prev, [room.id]: 'pending' }));
      onRequestSent?.();
    } catch (e) { alert('فشل إرسال الطلب: ' + e.message); }
    finally { setSending(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-xl border border-border overflow-hidden animate-in slide-in-from-bottom-4 duration-250" dir="rtl">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text">🔍 اكتشف قنوات</h2>
            <p className="text-[11px] text-muted mt-0.5">اطلب الانضمام إلى قناة</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted hover:text-text transition">✕</button>
        </div>

        <div className="p-3 max-h-80 overflow-y-auto space-y-2">
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-teal/30 border-t-teal rounded-full animate-spin" /></div>
          ) : available.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <p className="text-3xl mb-2">🎉</p>
              <p className="text-sm font-medium">أنت عضو في كل القنوات المتاحة!</p>
            </div>
          ) : available.map(room => {
            const status = requests[room.id];
            return (
              <div key={room.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-alt border border-border hover:border-teal/30 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-teal/10 flex items-center justify-center text-lg shrink-0">#</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text truncate">{room.name}</p>
                  <p className="text-xs text-muted truncate">{room.description ?? ''}</p>
                </div>
                {status === 'pending' ? (
                  <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">⏳ معلق</span>
                ) : status === 'approved' ? (
                  <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">✓ مقبول</span>
                ) : status === 'rejected' ? (
                  <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">✕ مرفوض</span>
                ) : (
                  <button
                    onClick={() => requestJoin(room)}
                    disabled={sending === room.id}
                    className="px-3 py-1.5 rounded-xl bg-teal text-white text-[11px] font-bold hover:bg-teal/90 disabled:opacity-50 transition shrink-0">
                    {sending === room.id ? '⏳' : '+ طلب'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── JoinRequestsPanel — لوحة الموافقة (للأدمن والمدراء) ────────
function JoinRequestsPanel({ userId, userName, onApproved, onClose }) {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [acting,   setActing]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('chat_join_requests')
      .select('*')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });
    setRequests(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (req) => {
    setActing(req.id);
    try {
      // Add to channel members
      await supabase.from('chat_room_members').upsert({
        room_id: req.room_id, user_id: req.user_id, user_name: req.user_name,
        display_name: req.user_name, role: 'member', joined_at: new Date().toISOString(),
      }, { onConflict: 'room_id,user_id' });
      // Update request status
      await supabase.from('chat_join_requests').update({
        status: 'approved', reviewed_by: userName, reviewed_at: new Date().toISOString(),
      }).eq('id', req.id);
      setRequests(prev => prev.filter(r => r.id !== req.id));
      onApproved?.();
    } catch (e) { alert('خطأ: ' + e.message); }
    finally { setActing(null); }
  };

  const reject = async (req) => {
    setActing(req.id);
    try {
      await supabase.from('chat_join_requests').update({
        status: 'rejected', reviewed_by: userName, reviewed_at: new Date().toISOString(),
      }).eq('id', req.id);
      setRequests(prev => prev.filter(r => r.id !== req.id));
    } catch (e) { alert('خطأ: ' + e.message); }
    finally { setActing(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-xl border border-border overflow-hidden animate-in slide-in-from-bottom-4 duration-250" dir="rtl">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text">📋 طلبات الانضمام</h2>
            <p className="text-[11px] text-muted mt-0.5">{requests.length} طلب معلق</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted hover:text-text transition">✕</button>
        </div>

        <div className="p-3 max-h-80 overflow-y-auto space-y-2">
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-teal/30 border-t-teal rounded-full animate-spin" /></div>
          ) : requests.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-sm font-medium">لا توجد طلبات معلقة</p>
            </div>
          ) : requests.map(req => (
            <div key={req.id} className="px-3 py-3 rounded-xl bg-surface-alt border border-border space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-teal/10 flex items-center justify-center text-teal font-bold text-sm shrink-0">
                  {req.user_name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text">{req.user_name}</p>
                  <p className="text-xs text-muted">يريد الانضمام إلى <span className="font-medium text-text">{req.room_name}</span></p>
                </div>
                <span className="text-[10px] text-muted shrink-0">{timeLabel(req.requested_at)}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => approve(req)}
                  disabled={acting === req.id}
                  className="flex-1 py-1.5 rounded-xl bg-teal text-white text-xs font-bold hover:bg-teal/90 disabled:opacity-50 transition">
                  ✓ قبول
                </button>
                <button
                  onClick={() => reject(req)}
                  disabled={acting === req.id}
                  className="flex-1 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-200 text-xs font-bold hover:bg-red-100 disabled:opacity-50 transition">
                  ✕ رفض
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── CreateGroupPanel — إنشاء مجموعة خاصة (للأدمن) ────────────
function CreateGroupPanel({ userId, userName, onCreated, onClose }) {
  const [name,     setName]     = useState('');
  const [desc,     setDesc]     = useState('');
  const [profiles, setProfiles] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    supabase.from('profiles').select('id,employee_name,team,role_type').eq('is_active',true).neq('id',userId).order('employee_name')
      .then(({ data }) => { setProfiles(data ?? []); setLoading(false); });
  }, [userId]);

  const toggle = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const create = async () => {
    if (!name.trim()) { alert('أدخل اسم المجموعة'); return; }
    setSaving(true);
    try {
      const { data: room, error } = await supabase.from('chat_rooms').insert({
        type: 'group', name: name.trim(), description: desc.trim() || null,
        created_by: userId, created_by_name: userName,
        requires_approval: false, is_private: true, team: 'خاص',
      }).select().single();
      if (error) throw error;

      // Add creator + selected members
      const members = [
        { room_id: room.id, user_id: userId, user_name: userName, display_name: userName, role: 'admin', joined_at: new Date().toISOString() },
        ...selected.map(uid => {
          const p = profiles.find(x => x.id === uid);
          return { room_id: room.id, user_id: uid, user_name: p?.employee_name, display_name: p?.employee_name, role: 'member', joined_at: new Date().toISOString() };
        }),
      ];
      await supabase.from('chat_room_members').insert(members);
      onCreated?.(room);
    } catch (e) { alert('خطأ في الإنشاء: ' + e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-xl border border-border overflow-hidden animate-in slide-in-from-bottom-4 duration-250" dir="rtl">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text">🔒 مجموعة خاصة جديدة</h2>
            <p className="text-[11px] text-muted mt-0.5">اختر الأعضاء وأنشئ المجموعة</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted hover:text-text transition">✕</button>
        </div>

        <div className="p-4 space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="اسم المجموعة *"
            className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="وصف المجموعة (اختياري)"
            className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />

          <div>
            <p className="text-[11px] font-bold text-muted mb-2">اختر الأعضاء ({selected.length} مختار)</p>
            <div className="max-h-48 overflow-y-auto space-y-1 border border-border rounded-xl p-2">
              {loading ? <div className="flex justify-center py-4"><div className="w-4 h-4 border-2 border-teal/30 border-t-teal rounded-full animate-spin" /></div>
              : profiles.map(p => (
                <button key={p.id} onClick={() => toggle(p.id)}
                  className={`w-full text-start px-3 py-2 rounded-lg text-sm flex items-center gap-2.5 transition-colors ${selected.includes(p.id) ? 'bg-teal/10 text-teal' : 'hover:bg-surface-alt text-text'}`}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${selected.includes(p.id) ? 'border-teal bg-teal' : 'border-border'}`}>
                    {selected.includes(p.id) && <span className="text-white text-[10px]">✓</span>}
                  </div>
                  <span className="flex-1 truncate">{p.employee_name}</span>
                  <span className="text-[10px] text-muted">{p.team}</span>
                </button>
              ))}
            </div>
          </div>

          <button onClick={create} disabled={saving || !name.trim()}
            className="w-full py-2.5 rounded-xl bg-teal text-white text-sm font-bold hover:bg-teal/90 disabled:opacity-50 transition shadow-sm">
            {saving ? '⏳ جاري الإنشاء…' : '✓ إنشاء المجموعة'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main ChatScreen
// ══════════════════════════════════════════════════════════════
export default function ChatScreen() {
  const { id: userId, name: userName, role, team: userTeam } = useAuth();
  const isApprover = APPROVER_ROLES.includes(role);
  const isAdmin    = role === ROLES.ADMIN;

  const [rooms,         setRooms]         = useState([]);
  const [allChannels,   setAllChannels]   = useState([]);  // all group rooms (for discovery)
  const [memberRoomIds, setMemberRoomIds] = useState([]);  // rooms user is member of
  const [activeRoom,    setActiveRoom]    = useState(null);
  const [messages,      setMessages]      = useState([]);
  const [reactions,     setReactions]     = useState({});
  const [lastMsgs,      setLastMsgs]      = useState({});
  const [unreadCounts,  setUnreadCounts]  = useState({});
  const [loading,       setLoading]       = useState(true);
  const [msgLoading,    setMsgLoading]    = useState(false);
  const [sending,       setSending]       = useState(false);
  const [sidebarOpen,   setSidebarOpen]   = useState(true);
  const [replyTo,       setReplyTo]       = useState(null);
  const [allProfiles,   setAllProfiles]   = useState([]);
  const [pendingCount,  setPendingCount]  = useState(0);

  // Panel visibility
  const [showMusicRoom,   setShowMusicRoom]   = useState(false);
  const [showDiscover,    setShowDiscover]    = useState(false);
  const [showRequests,    setShowRequests]    = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showNewDm,       setShowNewDm]       = useState(false);
  const [dmSearch,        setDmSearch]        = useState('');

  const msgEndRef = useRef(null);
  const subRef    = useRef(null);

  // ── Load pending count (admin/manager) ──────────────────────
  const loadPendingCount = useCallback(async () => {
    if (!isApprover) return;
    const { count } = await supabase
      .from('chat_join_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    setPendingCount(count ?? 0);
  }, [isApprover]);

  // ── Load rooms with membership ───────────────────────────────
  const loadRooms = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // 1. Load ALL group rooms
      let { data: allGroups, error } = await supabase
        .from('chat_rooms').select('id,type,name,team,description,requires_approval,is_private,created_at')
        .eq('type', 'group').order('created_at');

      if (error?.code === '42P01') { setLoading(false); return; }

      // 2. Seed defaults if empty
      if (!allGroups?.length) {
        const { data: seeded } = await supabase.from('chat_rooms')
          .insert(DEFAULT_CHANNELS.map(c => ({ type: 'group', ...c, created_by: userId })))
          .select('id,type,name,team,description,requires_approval,is_private');
        allGroups = seeded ?? [];
      }

      setAllChannels(allGroups);

      // 3. Get user's memberships from chat_room_members
      const { data: memberships } = await supabase
        .from('chat_room_members').select('room_id').eq('user_id', userId);
      const memberIds = (memberships ?? []).map(m => m.room_id);
      setMemberRoomIds(memberIds);

      // 4. Auto-join: عام channel (always) + team channel
      const toJoin = [];
      for (const room of allGroups) {
        if (memberIds.includes(room.id)) continue;
        const isGeneral = room.name === '💬 عام';
        const isMyTeam  = userTeam && room.team === userTeam;
        const isAdmin_  = (role === ROLES.ADMIN || role === ROLES.MANAGER) && !room.is_private;
        if (isGeneral || isMyTeam || isAdmin_) {
          toJoin.push({ room_id: room.id, user_id: userId, user_name: userName, display_name: userName, role: 'member', joined_at: new Date().toISOString() });
        }
      }
      if (toJoin.length) {
        await supabase.from('chat_room_members').insert(toJoin).catch(() => {});
        toJoin.forEach(m => { if (!memberIds.includes(m.room_id)) memberIds.push(m.room_id); });
        setMemberRoomIds([...memberIds]);
      }

      // 5. Filter to only member channels
      const myGroups = allGroups.filter(r => memberIds.includes(r.id));

      // 6. Load DM rooms
      let dmRooms = [];
      if (memberIds.length) {
        const { data: dms } = await supabase
          .from('chat_rooms').select('id,type,name,team').eq('type','dm').in('id', memberIds);
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

      const allRooms = [...myGroups, ...dmRooms];
      setRooms(allRooms);

      // 7. Last messages preview
      if (allRooms.length) {
        const { data: lms } = await supabase
          .from('chat_messages').select('room_id,content,message_type,created_at')
          .in('room_id', allRooms.map(r => r.id))
          .order('created_at', { ascending: false });
        const map = {};
        (lms ?? []).forEach(m => {
          if (!map[m.room_id]) {
            map[m.room_id] = m.message_type==='text' ? m.content : m.message_type==='image' ? '📷 صورة' : '🎙️ رسالة صوتية';
          }
        });
        setLastMsgs(map);
      }

      if (allRooms.length && !activeRoom) setActiveRoom(allRooms[0]);
    } finally { setLoading(false); }
  }, [userId, userTeam, role]);

  useEffect(() => { loadRooms(); loadPendingCount(); }, [loadRooms, loadPendingCount]);

  // ── Load messages ────────────────────────────────────────────
  const loadMessages = useCallback(async (roomId) => {
    if (!roomId) return;
    setMsgLoading(true);
    const { data } = await supabase
      .from('chat_messages').select('*').eq('room_id', roomId).order('created_at').limit(150);
    setMessages(data ?? []);
    if (data?.length) {
      const { data: rxs } = await supabase.from('chat_reactions').select('*').in('message_id', data.map(m => m.id));
      const map = {};
      (rxs ?? []).forEach(r => { if (!map[r.message_id]) map[r.message_id] = []; map[r.message_id].push(r); });
      setReactions(map);
    }
    setMsgLoading(false);
  }, []);

  useEffect(() => {
    if (!activeRoom?.id) return;
    setReplyTo(null);
    loadMessages(activeRoom.id);
    subRef.current?.unsubscribe();
    subRef.current = supabase.channel(`room:${activeRoom.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${activeRoom.id}` },
        payload => {
          setMessages(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]);
          setLastMsgs(prev => ({
            ...prev,
            [activeRoom.id]: payload.new.message_type==='text' ? payload.new.content : payload.new.message_type==='image' ? '📷 صورة' : '🎙️ رسالة صوتية',
          }));
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reactions' }, () => loadMessages(activeRoom.id))
      .subscribe();
    return () => subRef.current?.unsubscribe();
  }, [activeRoom?.id, loadMessages]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ─────────────────────────────────────────────
  const handleSend = async (msgData) => {
    if (!activeRoom || !userId) return;
    setSending(true);
    try {
      const payload = { room_id: activeRoom.id, sender_id: userId, sender_name: userName, created_at: new Date().toISOString(), ...msgData };
      if (replyTo) {
        payload.reply_to      = replyTo.id;
        payload.reply_preview = replyTo.content ? replyTo.content.slice(0, 60) : replyTo.message_type==='image' ? '📷 صورة' : '🎙️ صوت';
      }
      const { error } = await supabase.from('chat_messages').insert(payload);
      if (error) throw error;
      setReplyTo(null);
      if (msgData.message_type==='text' && msgData.content?.startsWith('/')) {
        buildBotResponse(msgData.content, activeRoom.id, userId, userName)
          .then(botMsg => setMessages(prev => [...prev, botMsg])).catch(() => {});
      }
    } catch (e) { alert('فشل الإرسال: ' + e.message); }
    finally { setSending(false); }
  };

  // ── React ────────────────────────────────────────────────────
  const handleReact = async (messageId, emoji) => {
    if (!userId) return;
    const existing = (reactions[messageId] ?? []).find(r => r.emoji===emoji && r.user_id===userId);
    if (existing) { await supabase.from('chat_reactions').delete().eq('message_id',messageId).eq('user_id',userId).eq('emoji',emoji); }
    else { await supabase.from('chat_reactions').insert({ message_id:messageId, user_id:userId, user_name:userName, emoji }); }
    const { data } = await supabase.from('chat_reactions').select('*').eq('message_id', messageId);
    setReactions(prev => ({ ...prev, [messageId]: data ?? [] }));
  };

  // ── Open DM ──────────────────────────────────────────────────
  const openDmWith = async (profile) => {
    const { data: myRooms } = await supabase.from('chat_room_members').select('room_id').eq('user_id', userId);
    const myIds = myRooms?.map(r => r.room_id) ?? [];
    if (myIds.length) {
      const { data: shared } = await supabase.from('chat_room_members').select('room_id').eq('user_id', profile.id).in('room_id', myIds);
      if (shared?.length) {
        const ex = rooms.find(r => r.id === shared[0].room_id && r.type==='dm');
        if (ex) { setActiveRoom(ex); setShowNewDm(false); return; }
      }
    }
    const { data: room, error } = await supabase.from('chat_rooms').insert({ type:'dm', name:profile.employee_name, created_by:userId }).select().single();
    if (error) { alert('خطأ: ' + error.message); return; }
    await supabase.from('chat_room_members').insert([
      { room_id:room.id, user_id:userId,    display_name:userName,             user_name:userName,             role:'member', joined_at:new Date().toISOString() },
      { room_id:room.id, user_id:profile.id, display_name:profile.employee_name, user_name:profile.employee_name, role:'member', joined_at:new Date().toISOString() },
    ]);
    const enriched = { ...room, display_name: profile.employee_name };
    setRooms(prev => [...prev, enriched]);
    setActiveRoom(enriched);
    setShowNewDm(false);
    setDmSearch('');
  };

  const loadProfiles = async () => {
    const { data } = await supabase.from('profiles').select('id,employee_name,role_type,team').eq('is_active',true).neq('id',userId).order('employee_name');
    setAllProfiles(data ?? []);
  };

  // ── Render ───────────────────────────────────────────────────
  const groupRooms    = rooms.filter(r => r.type==='group');
  const privateRooms  = groupRooms.filter(r => r.is_private);
  const publicRooms   = groupRooms.filter(r => !r.is_private);
  const dmRooms       = rooms.filter(r => r.type==='dm');
  const grouped       = groupByDay(messages);
  const filteredProfiles = allProfiles.filter(p => !dmSearch || p.employee_name?.toLowerCase().includes(dmSearch.toLowerCase()));

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-2xl border border-border bg-surface shadow-sm" dir="rtl">

      {/* ══ Sidebar ══════════════════════════════════════════════ */}
      <div className={`transition-all duration-200 ${sidebarOpen ? 'w-64 sm:w-72' : 'w-0'} shrink-0 overflow-hidden flex flex-col border-e border-border bg-surface`}>

        {/* Header */}
        <div className="px-3 py-3 border-b border-border bg-surface shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-extrabold text-text text-sm tracking-tight">Lowe's Pro 💙</h2>
            <div className="flex items-center gap-1">
              {/* Admin: create private group */}
              {isAdmin && (
                <button onClick={() => setShowCreateGroup(true)}
                  className="w-7 h-7 rounded-lg bg-surface-alt border border-border text-muted text-xs flex items-center justify-center hover:text-teal hover:border-teal/40 transition"
                  title="مجموعة خاصة جديدة">🔒</button>
              )}
              {/* New DM */}
              <button onClick={() => { setShowNewDm(true); loadProfiles(); }}
                className="w-7 h-7 rounded-lg bg-teal/10 text-teal text-base flex items-center justify-center hover:bg-teal/20 transition"
                title="رسالة خاصة جديدة">✎</button>
            </div>
          </div>
        </div>

        {/* Sidebar body */}
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-4">

          {/* Music Room */}
          <button
            onClick={() => setShowMusicRoom(v => !v)}
            className={`w-full text-start px-2.5 py-2 rounded-xl transition-all flex items-center gap-2.5 ${showMusicRoom ? 'bg-teal/10 text-teal' : 'text-muted hover:bg-surface-alt hover:text-text'}`}
          >
            <span className="text-base w-5 text-center flex-shrink-0">🎵</span>
            <span className={`flex-1 text-sm ${showMusicRoom ? 'font-bold' : 'font-medium'}`}>غرفة الموسيقى</span>
            {showMusicRoom && <span className="text-[9px] text-teal font-bold bg-teal/10 px-1.5 py-0.5 rounded-full">مباشر</span>}
          </button>

          {/* Admin: pending requests badge */}
          {isApprover && pendingCount > 0 && (
            <button
              onClick={() => setShowRequests(true)}
              className="w-full text-start px-2.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center gap-2.5 hover:bg-amber-100 transition"
            >
              <span className="text-base w-5 text-center flex-shrink-0">📋</span>
              <span className="flex-1 text-sm font-bold">طلبات الانضمام</span>
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold grid place-items-center">{pendingCount}</span>
            </button>
          )}

          {/* Public Channels */}
          {publicRooms.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider px-2 mb-1">القنوات العامة</p>
              {loading ? [1,2,3,4,5].map(i => <div key={i} className="h-9 rounded-xl bg-surface-alt animate-pulse mb-1" />)
              : publicRooms.map(r => (
                <ChannelItem key={r.id} room={r} active={activeRoom?.id===r.id && !showMusicRoom} unread={unreadCounts[r.id]??0}
                  onClick={() => { setActiveRoom(r); setShowMusicRoom(false); }} />
              ))}
            </div>
          )}

          {/* Private Groups */}
          {privateRooms.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider px-2 mb-1">مجموعات خاصة</p>
              {privateRooms.map(r => (
                <ChannelItem key={r.id} room={r} active={activeRoom?.id===r.id && !showMusicRoom} unread={unreadCounts[r.id]??0}
                  onClick={() => { setActiveRoom(r); setShowMusicRoom(false); }} />
              ))}
            </div>
          )}

          {/* DMs */}
          {dmRooms.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider px-2 mb-1">رسائل خاصة</p>
              {dmRooms.map(r => (
                <button key={r.id} onClick={() => { setActiveRoom(r); setShowMusicRoom(false); }}
                  className={`w-full text-start px-2.5 py-2 rounded-xl transition-all flex items-center gap-2.5 ${activeRoom?.id===r.id && !showMusicRoom ? 'bg-teal/10 text-teal' : 'text-muted hover:bg-surface-alt hover:text-text'}`}>
                  <div className="w-7 h-7 rounded-full bg-teal/10 flex items-center justify-center text-teal font-bold text-xs shrink-0">
                    {(r.display_name??r.name)?.[0]?.toUpperCase()}
                  </div>
                  <span className="flex-1 text-sm font-medium truncate">{r.display_name??r.name}</span>
                  {lastMsgs[r.id] && <span className="text-[9px] text-muted truncate max-w-[60px]">{lastMsgs[r.id]}</span>}
                </button>
              ))}
            </div>
          )}

          {/* Discover channels button */}
          <button onClick={() => setShowDiscover(true)}
            className="w-full text-start px-2.5 py-2 rounded-xl border border-dashed border-border text-muted hover:border-teal/40 hover:text-teal transition-all flex items-center gap-2.5">
            <span className="text-base w-5 text-center flex-shrink-0">🔍</span>
            <span className="text-sm font-medium">اكتشف قنوات</span>
          </button>
        </div>
      </div>

      {/* ══ Chat Area ════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <div className="px-3 py-3 border-b border-border flex items-center gap-3 shrink-0 bg-surface shadow-sm">
          <button onClick={() => setSidebarOpen(o => !o)}
            className="w-8 h-8 rounded-xl bg-surface-alt border border-border flex items-center justify-center text-muted hover:text-text transition shrink-0">
            ☰
          </button>

          {showMusicRoom ? (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text">🎵 غرفة الموسيقى</p>
              <p className="text-[11px] text-muted">استمع مع فريقك بشكل متزامن</p>
            </div>
          ) : activeRoom ? (
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-text truncate">{activeRoom.display_name ?? activeRoom.name}</p>
                {activeRoom.description && <p className="text-[11px] text-muted truncate">{activeRoom.description}</p>}
              </div>
              {activeRoom.is_private && <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-surface-alt border border-border text-muted">🔒 خاص</span>}
            </div>
          ) : null}

          {!showMusicRoom && activeRoom?.type==='group' && (
            <div className="flex items-center gap-1 text-xs text-muted shrink-0">
              <span>👥</span>
              <span className="hidden sm:block">{activeRoom.team ?? ''}</span>
            </div>
          )}
        </div>

        {/* Music Room */}
        {showMusicRoom && <MusicRoomPanel userId={userId} userName={userName} />}

        {/* Messages + Input */}
        {!showMusicRoom && (
          <>
            <div className="flex-1 overflow-y-auto overscroll-contain bg-cream" style={{background:'var(--color-surface-alt, #f8f7f4)'}}>
              <div className="px-4 py-4 space-y-0.5 max-w-4xl mx-auto">
                {!activeRoom ? (
                  <div className="h-64 flex flex-col items-center justify-center text-muted">
                    <p className="text-5xl mb-3 opacity-30">💬</p>
                    <p className="text-sm font-medium">اختر قناة لتبدأ</p>
                  </div>
                ) : msgLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-2 border-teal/30 border-t-teal rounded-full animate-spin" />
                  </div>
                ) : grouped.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-5xl mb-3 opacity-30">💬</p>
                    <p className="font-bold text-text">لا توجد رسائل بعد</p>
                    <p className="text-sm text-muted mt-1">كن أول من يبدأ النقاش!</p>
                  </div>
                ) : (
                  grouped.map((item) => {
                    if (item.type==='divider') {
                      return (
                        <div key={item.key} className="flex items-center gap-3 py-3">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-[10px] text-muted font-medium px-2 bg-surface-alt rounded-full py-0.5 border border-border">{item.label}</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      );
                    }
                    return (
                      <MessageBubble
                        key={item.id}
                        msg={item}
                        isMine={item.sender_id===userId}
                        userId={userId}
                        onReply={setReplyTo}
                        onReact={handleReact}
                        reactions={reactions[item.id]}
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

      {/* ══ Modals ════════════════════════════════════════════════ */}

      {/* New DM */}
      {showNewDm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={e => e.target===e.currentTarget && setShowNewDm(false)}>
          <div className="w-full max-w-sm bg-surface rounded-2xl shadow-xl border border-border overflow-hidden animate-in slide-in-from-bottom-4 duration-250" dir="rtl">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
              <h2 className="text-base font-bold text-text">رسالة خاصة جديدة</h2>
              <button onClick={() => setShowNewDm(false)} className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted hover:text-text transition">✕</button>
            </div>
            <div className="p-3">
              <input value={dmSearch} onChange={e => setDmSearch(e.target.value)} placeholder="بحث بالاسم…"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30 mb-3" autoFocus />
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {filteredProfiles.length===0 ? (
                  <p className="text-center text-muted text-sm py-4">لا توجد نتائج</p>
                ) : filteredProfiles.map(p => (
                  <button key={p.id} onClick={() => openDmWith(p)}
                    className="w-full text-start px-3 py-2.5 rounded-xl hover:bg-surface-alt transition flex items-center gap-3">
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

      {/* Discover Channels */}
      {showDiscover && (
        <DiscoverPanel
          allChannels={allChannels}
          memberRoomIds={memberRoomIds}
          userId={userId}
          userName={userName}
          onClose={() => setShowDiscover(false)}
          onRequestSent={() => { setShowDiscover(false); loadPendingCount(); }}
        />
      )}

      {/* Join Requests (admin/manager) */}
      {showRequests && (
        <JoinRequestsPanel
          userId={userId}
          userName={userName}
          onApproved={() => { loadRooms(); loadPendingCount(); }}
          onClose={() => { setShowRequests(false); loadPendingCount(); }}
        />
      )}

      {/* Create Private Group (admin) */}
      {showCreateGroup && (
        <CreateGroupPanel
          userId={userId}
          userName={userName}
          onCreated={(room) => { setShowCreateGroup(false); loadRooms(); }}
          onClose={() => setShowCreateGroup(false)}
        />
      )}
    </div>
  );
}
