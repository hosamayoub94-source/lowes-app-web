// =============================================================
// ChatScreen — Team chat + DMs + image/voice messages
// Tables: chat_rooms, chat_room_members, chat_messages
// Storage: chat-files bucket (public)
// =============================================================
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@hooks/useAuth';
import { supabase } from '@services/supabase';

// ── SQL setup (show when tables missing) ─────────────────────
const SETUP_SQL = `-- Chat system tables (run once in Supabase SQL Editor)

CREATE TABLE IF NOT EXISTS chat_rooms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('group','dm')),
  name text, team text, created_by uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cr_all" ON chat_rooms FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS chat_room_members (
  room_id uuid REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, display_name text,
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
ALTER TABLE chat_room_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_all" ON chat_room_members FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id uuid REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id uuid, sender_name text NOT NULL,
  content text,
  message_type text DEFAULT 'text' CHECK (message_type IN ('text','image','voice')),
  file_url text, duration_s int,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cm_all" ON chat_messages FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_cm_room ON chat_messages(room_id, created_at DESC);

-- إنشاء bucket للملفات: Supabase Dashboard → Storage → New bucket → "chat-files" → Public`;

// ── Team rooms seed ───────────────────────────────────────────
const TEAM_ROOMS = [
  { name: '💬 الغرفة العامة', team: 'عام' },
  { name: '🇹🇷 إسطنبول',      team: 'إسطنبول' },
  { name: '🇸🇾 دمشق',          team: 'دمشق' },
  { name: '🇦🇪 دبي',            team: 'دبي' },
  { name: '📱 السوشال ميديا',  team: 'سوشال' },
  { name: '💼 المبيعات',       team: 'مبيعات' },
];

// ── Helpers ───────────────────────────────────────────────────
function timeLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'الآن';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}د`;
  if (diff < 86400000) return d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
}

// ── Setup banner ──────────────────────────────────────────────
function SetupBanner({ onDismiss }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(SETUP_SQL).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="text-5xl">💬</div>
      <h2 className="text-lg font-bold text-text">إعداد نظام المحادثات</h2>
      <p className="text-sm text-muted max-w-sm">
        نفّذ هذا SQL في Supabase SQL Editor لتفعيل غرف الدردشة والرسائل:
      </p>
      <pre className="text-[10px] font-mono bg-surface border border-border rounded-xl p-3 text-start max-h-48 overflow-y-auto text-muted w-full max-w-lg">
        {SETUP_SQL}
      </pre>
      <div className="flex gap-3">
        <button onClick={copy} className="px-4 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 transition">
          {copied ? '✓ تم النسخ' : 'نسخ SQL'}
        </button>
        {onDismiss && (
          <button onClick={onDismiss} className="px-4 py-2 rounded-xl border border-border text-sm text-muted hover:text-text transition">
            لاحقاً
          </button>
        )}
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────
function MessageBubble({ msg, isMine }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);

  const toggleVoice = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[75%] min-w-[80px] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isMine && (
          <span className="text-[10px] text-muted mb-0.5 ms-1">{msg.sender_name}</span>
        )}
        <div className={`rounded-2xl px-3 py-2 ${
          isMine
            ? 'bg-teal text-white rounded-br-sm'
            : 'bg-surface border border-border text-text rounded-bl-sm'
        }`}>
          {msg.message_type === 'text' && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
          )}
          {msg.message_type === 'image' && msg.file_url && (
            <img
              src={msg.file_url}
              alt="صورة"
              className="max-w-full max-h-48 rounded-xl object-cover cursor-pointer"
              onClick={() => window.open(msg.file_url, '_blank')}
            />
          )}
          {msg.message_type === 'voice' && msg.file_url && (
            <div className="flex items-center gap-2 min-w-[140px]">
              <button
                onClick={toggleVoice}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition ${
                  isMine ? 'bg-white/20 hover:bg-white/30' : 'bg-teal/10 hover:bg-teal/20 text-teal'
                }`}
              >
                {playing ? '⏸' : '▶️'}
              </button>
              <div className="flex-1 h-1 rounded-full bg-white/30" />
              <span className="text-[10px] opacity-70">
                {msg.duration_s ? `${msg.duration_s}ث` : '🎙️'}
              </span>
              <audio ref={audioRef} src={msg.file_url} onEnded={() => setPlaying(false)} hidden />
            </div>
          )}
        </div>
        <span className={`text-[9px] text-muted mt-0.5 ${isMine ? 'me-1' : 'ms-1'}`}>
          {timeLabel(msg.created_at)}
        </span>
      </div>
    </div>
  );
}

// ── Message input ─────────────────────────────────────────────
function MessageInput({ onSend, disabled }) {
  const [text, setText]             = useState('');
  const [uploading, setUploading]   = useState(false);
  const [recording, setRecording]   = useState(false);
  const fileRef  = useRef(null);
  const recRef   = useRef(null);
  const chunksRef = useRef([]);

  const sendText = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend({ content: t, message_type: 'text' });
    setText('');
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  };

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `images/${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage
        .from('chat-files').upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(data.path);
      onSend({ content: null, message_type: 'image', file_url: urlData.publicUrl });
    } catch (e) {
      alert('فشل رفع الصورة: ' + e.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setUploading(true);
        try {
          const path = `voice/${Date.now()}.webm`;
          const { data, error } = await supabase.storage
            .from('chat-files').upload(path, blob, { contentType: 'audio/webm' });
          if (error) throw error;
          const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(data.path);
          const durationS = Math.round(blob.size / 16000); // rough estimate
          onSend({ content: null, message_type: 'voice', file_url: urlData.publicUrl, duration_s: durationS });
        } catch (e) {
          alert('فشل رفع التسجيل: ' + e.message);
        } finally {
          setUploading(false);
        }
      };
      recRef.current = mr;
      mr.start();
      setRecording(true);
    } catch (e) {
      alert('الميكروفون غير متاح: ' + e.message);
    }
  };

  const stopRecording = () => {
    recRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="border-t border-border bg-surface p-3">
      {uploading && (
        <div className="text-xs text-teal text-center mb-2 animate-pulse">⏳ جار الرفع…</div>
      )}
      <div className="flex items-end gap-2">
        {/* Image button */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
          className="w-9 h-9 rounded-xl bg-surface-alt border border-border flex items-center justify-center text-muted hover:text-text transition shrink-0"
          title="إرسال صورة"
        >
          📷
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />

        {/* Text input */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder={recording ? '🔴 جار التسجيل…' : 'اكتب رسالة…'}
          rows={1}
          disabled={disabled || recording}
          className="flex-1 resize-none rounded-xl border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/30 max-h-24 overflow-y-auto"
          dir="rtl"
        />

        {/* Voice button (hold or toggle) */}
        <button
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          disabled={disabled || uploading}
          className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm shrink-0 transition ${
            recording ? 'bg-red-500 text-white animate-pulse' : 'bg-surface-alt border border-border text-muted hover:text-text'
          }`}
          title="اضغط مع الاستمرار للتسجيل"
        >
          🎙️
        </button>

        {/* Send */}
        <button
          onClick={sendText}
          disabled={!text.trim() || disabled}
          className="w-9 h-9 rounded-xl bg-teal text-white flex items-center justify-center shrink-0 hover:bg-teal/90 disabled:opacity-40 transition"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="rotate-[225deg]">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Room list item ────────────────────────────────────────────
function RoomItem({ room, active, onClick, lastMsg }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-start px-3 py-2.5 rounded-xl transition flex items-center gap-3 ${
        active ? 'bg-teal/10 border border-teal/20' : 'hover:bg-surface-alt'
      }`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${
        active ? 'bg-teal/20' : 'bg-surface-alt border border-border'
      }`}>
        {room.type === 'dm' ? '👤' : room.name?.match(/[\p{Emoji}]/u)?.[0] ?? '💬'}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold truncate ${active ? 'text-teal' : 'text-text'}`}>
          {room.display_name ?? room.name}
        </p>
        {lastMsg && (
          <p className="text-[10px] text-muted truncate">{lastMsg}</p>
        )}
      </div>
    </button>
  );
}

// ── Main ChatScreen ───────────────────────────────────────────
export default function ChatScreen() {
  const { id: userId, name: userName, team } = useAuth();

  const [rooms,       setRooms]       = useState([]);
  const [activeRoom,  setActiveRoom]  = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [lastMsgs,    setLastMsgs]    = useState({});
  const [loading,     setLoading]     = useState(true);
  const [msgLoading,  setMsgLoading]  = useState(false);
  const [sending,     setSending]     = useState(false);
  const [dbMissing,   setDbMissing]   = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [allProfiles, setAllProfiles] = useState([]);
  const [showNewDm,   setShowNewDm]   = useState(false);
  const [dmSearch,    setDmSearch]    = useState('');

  const msgEndRef = useRef(null);
  const subRef    = useRef(null);

  // ── Load rooms ─────────────────────────────────────────────
  const loadRooms = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // Seed default team rooms if none exist
      const { data: existing, error: e1 } = await supabase
        .from('chat_rooms').select('id,type,name,team').eq('type', 'group');
      if (e1?.code === '42P01') { setDbMissing(true); setLoading(false); return; }

      if (!existing?.length) {
        // Create default group rooms
        const { data: created } = await supabase.from('chat_rooms')
          .insert(TEAM_ROOMS.map(r => ({ type: 'group', name: r.name, team: r.team, created_by: userId })))
          .select('id,type,name,team');
        existing?.push(...(created ?? []));
      }

      // Load my DM rooms
      const { data: myDmMemberships } = await supabase
        .from('chat_room_members')
        .select('room_id')
        .eq('user_id', userId);

      let dmRooms = [];
      if (myDmMemberships?.length) {
        const dmIds = myDmMemberships.map(m => m.room_id);
        const { data: dms } = await supabase
          .from('chat_rooms').select('id,type,name,team').eq('type', 'dm').in('id', dmIds);
        dmRooms = dms ?? [];
      }

      // For DMs, get the other member's name as display name
      const enrichedDms = await Promise.all(dmRooms.map(async (r) => {
        const { data: members } = await supabase
          .from('chat_room_members').select('user_id,display_name').eq('room_id', r.id);
        const other = members?.find(m => m.user_id !== userId);
        return { ...r, display_name: other?.display_name ?? r.name };
      }));

      const allRooms = [...(existing ?? []), ...enrichedDms];
      setRooms(allRooms);

      // Load last message for each room
      if (allRooms.length) {
        const { data: lms } = await supabase
          .from('chat_messages')
          .select('room_id,content,message_type,created_at')
          .in('room_id', allRooms.map(r => r.id))
          .order('created_at', { ascending: false });
        const map = {};
        (lms ?? []).forEach(m => {
          if (!map[m.room_id]) {
            map[m.room_id] = m.message_type === 'text' ? m.content : m.message_type === 'image' ? '📷 صورة' : '🎙️ تسجيل';
          }
        });
        setLastMsgs(map);
      }

      // Auto-select first room
      if (allRooms.length && !activeRoom) setActiveRoom(allRooms[0]);
    } catch (e) {
      console.error('loadRooms', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  // ── Load messages ──────────────────────────────────────────
  const loadMessages = useCallback(async (roomId) => {
    if (!roomId) return;
    setMsgLoading(true);
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at')
      .limit(100);
    if (!error) setMessages(data ?? []);
    setMsgLoading(false);
  }, []);

  useEffect(() => {
    if (!activeRoom?.id) return;
    loadMessages(activeRoom.id);

    // Subscribe to realtime
    subRef.current?.unsubscribe();
    subRef.current = supabase
      .channel(`room:${activeRoom.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${activeRoom.id}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => subRef.current?.unsubscribe();
  }, [activeRoom?.id, loadMessages]);

  // Scroll to bottom
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ───────────────────────────────────────────
  const handleSend = async (msgData) => {
    if (!activeRoom || !userId) return;
    setSending(true);
    try {
      const { error } = await supabase.from('chat_messages').insert({
        room_id:      activeRoom.id,
        sender_id:    userId,
        sender_name:  userName,
        ...msgData,
        created_at:   new Date().toISOString(),
      });
      if (error) throw error;
      // Update last message preview
      const preview = msgData.message_type === 'text' ? msgData.content
        : msgData.message_type === 'image' ? '📷 صورة' : '🎙️ تسجيل';
      setLastMsgs(prev => ({ ...prev, [activeRoom.id]: preview }));
    } catch (e) {
      alert('فشل الإرسال: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  // ── Load profiles for DM picker ────────────────────────────
  const loadProfiles = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, employee_name, role_type, team')
      .eq('is_active', true)
      .neq('id', userId)
      .order('employee_name');
    setAllProfiles(data ?? []);
  };

  const openDmWith = async (profile) => {
    // Check if DM room already exists
    const { data: myRooms } = await supabase
      .from('chat_room_members').select('room_id').eq('user_id', userId);
    const myRoomIds = myRooms?.map(r => r.room_id) ?? [];

    if (myRoomIds.length) {
      const { data: theirRooms } = await supabase
        .from('chat_room_members').select('room_id').eq('user_id', profile.id).in('room_id', myRoomIds);
      if (theirRooms?.length) {
        // DM already exists
        const existing = rooms.find(r => r.id === theirRooms[0].room_id);
        if (existing) { setActiveRoom(existing); setShowNewDm(false); return; }
      }
    }

    // Create new DM room
    const { data: newRoom, error } = await supabase.from('chat_rooms')
      .insert({ type: 'dm', name: profile.employee_name, created_by: userId })
      .select().single();
    if (error) { alert('خطأ: ' + error.message); return; }

    await supabase.from('chat_room_members').insert([
      { room_id: newRoom.id, user_id: userId, display_name: userName },
      { room_id: newRoom.id, user_id: profile.id, display_name: profile.employee_name },
    ]);

    const enriched = { ...newRoom, display_name: profile.employee_name };
    setRooms(prev => [...prev, enriched]);
    setActiveRoom(enriched);
    setShowNewDm(false);
    setDmSearch('');
  };

  if (dbMissing) {
    return (
      <div className="h-[calc(100vh-8rem)] flex flex-col" dir="rtl">
        <SetupBanner onDismiss={() => setDbMissing(false)} />
      </div>
    );
  }

  const filteredProfiles = allProfiles.filter(p =>
    !dmSearch || p.employee_name.toLowerCase().includes(dmSearch.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-2xl border border-border bg-surface" dir="rtl">

      {/* ── Sidebar ── */}
      <div className={`${sidebarOpen ? 'w-72' : 'w-0'} shrink-0 transition-all duration-200 overflow-hidden flex flex-col border-e border-border`}>
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-text text-sm">المحادثات</h2>
          <button
            onClick={() => { setShowNewDm(true); loadProfiles(); }}
            className="w-7 h-7 rounded-lg bg-teal/10 text-teal text-sm flex items-center justify-center hover:bg-teal/20 transition"
            title="محادثة جديدة"
          >+</button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {loading ? (
            <div className="text-center py-8 text-muted text-xs animate-pulse">جار التحميل…</div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-8 text-muted text-xs">لا توجد غرف</div>
          ) : rooms.map(r => (
            <RoomItem
              key={r.id}
              room={r}
              active={activeRoom?.id === r.id}
              onClick={() => setActiveRoom(r)}
              lastMsg={lastMsgs[r.id]}
            />
          ))}
        </div>
      </div>

      {/* ── Chat area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="w-8 h-8 rounded-lg bg-surface-alt border border-border flex items-center justify-center text-muted hover:text-text transition"
          >
            ☰
          </button>
          {activeRoom && (
            <>
              <div className="w-8 h-8 rounded-xl bg-teal/10 flex items-center justify-center text-sm">
                {activeRoom.type === 'dm' ? '👤' : '💬'}
              </div>
              <div>
                <p className="text-sm font-bold text-text">{activeRoom.display_name ?? activeRoom.name}</p>
                <p className="text-[10px] text-muted">
                  {activeRoom.type === 'group' ? 'غرفة جماعية' : 'محادثة خاصة'}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          {!activeRoom ? (
            <div className="h-full flex items-center justify-center text-muted text-sm">
              اختر محادثة من القائمة
            </div>
          ) : msgLoading ? (
            <div className="text-center py-8 text-muted text-sm animate-pulse">جار التحميل…</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-muted text-sm">
              <div className="text-3xl mb-2">💬</div>
              <p>لا توجد رسائل — كن أول من يكتب!</p>
            </div>
          ) : (
            messages.map(msg => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isMine={msg.sender_id === userId}
              />
            ))
          )}
          <div ref={msgEndRef} />
        </div>

        {/* Input */}
        {activeRoom && (
          <MessageInput onSend={handleSend} disabled={sending} />
        )}
      </div>

      {/* ── New DM modal ── */}
      {showNewDm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
             onClick={e => e.target === e.currentTarget && setShowNewDm(false)}>
          <div className="w-full max-w-sm bg-surface rounded-2xl shadow-xl border border-border overflow-hidden" dir="rtl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-base font-bold text-text">محادثة جديدة</h2>
              <button onClick={() => setShowNewDm(false)} className="text-muted hover:text-text text-xl leading-none">✕</button>
            </div>
            <div className="p-3">
              <input
                value={dmSearch}
                onChange={e => setDmSearch(e.target.value)}
                placeholder="بحث بالاسم…"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30 mb-3"
                autoFocus
              />
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {filteredProfiles.length === 0 ? (
                  <p className="text-center text-muted text-sm py-4">لا توجد نتائج</p>
                ) : filteredProfiles.map(p => (
                  <button
                    key={p.id}
                    onClick={() => openDmWith(p)}
                    className="w-full text-start px-3 py-2.5 rounded-xl hover:bg-surface-alt transition flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-teal/10 flex items-center justify-center text-teal font-bold text-sm">
                      {p.employee_name[0]}
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
