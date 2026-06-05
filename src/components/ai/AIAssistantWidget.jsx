// =============================================================
// AIAssistantWidget — لوزي 🌸
// مساعدة لويز Professional الذكية
// ذاكرة دائمة عبر Supabase · Claude Haiku
// =============================================================
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuth }  from '@hooks/useAuth';
import { supabase } from '@services/supabase';
import { ROLES }    from '@data/teams';

const MAX_HISTORY = 40; // max messages to keep in DB

// ── Lozy's face — a cute AI cat (girly + a tech sparkle) ──────
function LozyFace({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {/* ears */}
      <path d="M7 10 L9.5 3.5 L13.5 11 Z" fill="#fdf3ea" />
      <path d="M25 10 L22.5 3.5 L18.5 11 Z" fill="#fdf3ea" />
      <path d="M9 9.5 L9.6 6 L11.4 10 Z" fill="#ff9ec4" />
      <path d="M23 9.5 L22.4 6 L20.6 10 Z" fill="#ff9ec4" />
      {/* head */}
      <circle cx="16" cy="17.5" r="9.3" fill="#fdf3ea" />
      {/* eyes */}
      <ellipse cx="12.4" cy="16.8" rx="2" ry="2.6" fill="#1a2747" />
      <ellipse cx="19.6" cy="16.8" rx="2" ry="2.6" fill="#1a2747" />
      <circle cx="11.9" cy="15.9" r="0.55" fill="#fff" />
      <circle cx="19.1" cy="15.9" r="0.55" fill="#fff" />
      <circle cx="13" cy="17.6" r="0.32" fill="#5eead4" />
      <circle cx="20.2" cy="17.6" r="0.32" fill="#5eead4" />
      {/* blush */}
      <ellipse cx="9.6" cy="20" rx="1.5" ry="0.95" fill="#ff8fb8" opacity="0.55" />
      <ellipse cx="22.4" cy="20" rx="1.5" ry="0.95" fill="#ff8fb8" opacity="0.55" />
      {/* nose + mouth */}
      <path d="M15.1 19.4 Q16 20.4 16.9 19.4" stroke="#ff7fb0" strokeWidth="0.9" fill="none" strokeLinecap="round" />
      <circle cx="16" cy="19" r="0.5" fill="#ff7fb0" />
      {/* whiskers */}
      <path d="M5.5 17.5 L8.5 17.8 M5.8 19.5 L8.6 19.2" stroke="#e7d4c4" strokeWidth="0.6" strokeLinecap="round" />
      <path d="M26.5 17.5 L23.5 17.8 M26.2 19.5 L23.4 19.2" stroke="#e7d4c4" strokeWidth="0.6" strokeLinecap="round" />
      {/* AI sparkle */}
      <path d="M25.5 6 l0.7 1.8 1.8 0.7 -1.8 0.7 -0.7 1.8 -0.7 -1.8 -1.8 -0.7 1.8 -0.7 Z" fill="#5eead4" />
    </svg>
  );
}
const LOZY_AVATAR = <LozyFace size={20} />;

// ── Markdown-lite renderer ────────────────────────────────────
function RenderText({ text }) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\n)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p === '\n') return <br key={i} />;
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2,-2)}</strong>;
        if (p.startsWith('*')  && p.endsWith('*'))  return <em key={i}>{p.slice(1,-1)}</em>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

// ── Suggestions ───────────────────────────────────────────────
const SUGGESTIONS_EMPLOYEE = [
  'شو مهامي اليوم؟',
  'كيف أستخدم سيروم الريتينول؟',
  'كم ضل لي من إجازة؟',
  'ما مكونات واقي الشمس الزهري؟',
];
const SUGGESTIONS_MANAGER = [
  'من غاب اليوم من الفريق؟',
  'شو رصيد الحسابات الشهر؟',
  'اجيبلي مصاريف هالشهر',
  'سجّل مصروف 100$ نقداً',
];

// ── Chat Bubble ───────────────────────────────────────────────
function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2.5 mb-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-sm font-bold ${
        isUser ? 'bg-teal text-white' : 'bg-gradient-to-br from-navy to-teal text-white'
      }`}>
        {isUser ? '👤' : LOZY_AVATAR}
      </div>
      <div className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
        isUser
          ? 'bg-teal text-white rounded-tr-sm'
          : 'bg-surface border border-border/80 text-text rounded-tl-sm'
      }`}>
        {msg.loading ? (
          <div className="flex items-center gap-1.5 py-0.5">
            <span className="text-xs text-muted">لوزي تفكّر</span>
            {[0,1,2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-teal/60 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        ) : (
          <RenderText text={msg.content} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
export function AIAssistantWidget() {
  const { id: userId, name: userName, role, session } = useAuth();
  const isManager = [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER].includes(role);
  const firstName = userName?.split(' ')[0] ?? '';

  const WELCOME = {
    role: 'assistant',
    content: `أهلاً ${firstName}! 🌸\nأنا لوزي، مساعدتك في لويز Professional.\nاسأليني عن أي شيء — المنتجات، مهامك، إجازاتك، العمولات، أو أي معلومة تحتاجينها! 💫`,
  };

  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);
  const [unread,   setUnread]   = useState(0);
  const [memLoaded,setMemLoaded] = useState(false);

  // ── Draggable position ────────────────────────────────────────
  const STORAGE_KEY = 'lozy_pos';
  const defaultPos = () => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) return JSON.parse(s);
    } catch {}
    return { x: null, y: null }; // null = use CSS default (bottom-right)
  };
  const [pos, setPos] = useState(defaultPos);
  const dragging = useRef(false);
  const moved = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, bx: 0, by: 0 });
  const btnRef = useRef(null);

  const savePos = useCallback((p) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
  }, []);

  // Drag listeners are attached ONLY while dragging, so the rest of the
  // time there is no global non-passive touchmove handler degrading page
  // scroll (fixes "التمرير صار صعب").
  const dragHandlers = useRef(null);

  const handleDragStart = (e) => {
    if (e.button !== 0 && e.type === 'mousedown') return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = btnRef.current?.getBoundingClientRect();
    dragging.current = true;
    moved.current = false;
    dragStart.current = {
      mx: clientX, my: clientY,
      bx: rect ? rect.left + rect.width / 2 : clientX,
      by: rect ? rect.top + rect.height / 2 : clientY,
    };

    const onMove = (ev) => {
      if (!dragging.current) return;
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const dist = Math.abs(cx - dragStart.current.mx) + Math.abs(cy - dragStart.current.my);
      if (dist > 6) {
        moved.current = true;
        if (ev.cancelable) ev.preventDefault(); // stop page scroll only during a real drag
        const W = window.innerWidth, H = window.innerHeight, R = 28;
        setPos({
          x: Math.min(Math.max(dragStart.current.bx + (cx - dragStart.current.mx), R), W - R),
          y: Math.min(Math.max(dragStart.current.by + (cy - dragStart.current.my), R), H - R),
        });
      }
    };
    const onUp = () => {
      dragging.current = false;
      detach();
      if (!moved.current) { setOpen(o => !o); return; } // a tap → toggle
      setPos(p => { savePos(p); return p; });
    };
    const detach = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
    dragHandlers.current = detach;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };

  useEffect(() => () => dragHandlers.current?.(), []);

  // Compute button style (fixed position or CSS default)
  const btnStyle = useMemo(() => {
    if (pos.x === null) return {};
    return { left: pos.x - 28, top: pos.y - 28, right: 'auto', bottom: 'auto' };
  }, [pos]);

  // Panel appears above/below the button depending on position
  const panelStyle = useMemo(() => {
    if (pos.x === null) return {};
    const W = window.innerWidth, H = window.innerHeight;
    const pW = Math.min(384, W - 32); // panel width (max w-96)
    const pAbove = pos.y > H * 0.6; // button in bottom half → panel above
    const pLeft = Math.min(Math.max(pos.x - pW / 2, 16), W - pW - 16);
    return {
      position: 'fixed',
      left: pLeft,
      ...(pAbove ? { bottom: H - pos.y + 64 } : { top: pos.y + 64 }),
      right: 'auto', bottom: pAbove ? H - pos.y + 64 : 'auto',
      top: pAbove ? 'auto' : pos.y + 64,
      width: pW,
    };
  }, [pos]);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const saveTimer = useRef(null);

  // ── Load memory from DB ──────────────────────────────────────
  useEffect(() => {
    if (!userId || memLoaded) return;
    setMemLoaded(true);
    (async () => {
      try {
        const { data } = await supabase
          .from('lozy_chats')
          .select('messages')
          .eq('user_id', userId)
          .maybeSingle();
        if (data?.messages?.length > 1) {
          setMessages(data.messages);
        }
      } catch { /* silent */ }
    })();
  }, [userId, memLoaded]);

  // ── Save memory to DB (debounced 2s) ─────────────────────────
  const saveMemory = useCallback((msgs) => {
    if (!userId) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const toSave = msgs.slice(-MAX_HISTORY);
        await supabase.from('lozy_chats').upsert(
          { user_id: userId, messages: toSave, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );
      } catch { /* silent */ }
    }, 2000);
  }, [userId]);

  // ── Auto-scroll ───────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Focus on open ─────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  // ── Send message ──────────────────────────────────────────────
  const send = useCallback(async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    setInput('');
    setError(null);

    const userMsg    = { role: 'user',      content: msg };
    const loadingMsg = { role: 'assistant', content: '', loading: true };
    const withUser   = [...messages, userMsg];

    setMessages([...withUser, loadingMsg]);
    setLoading(true);

    // History = all real messages (no loading placeholders)
    const history = withUser.map(m => ({ role: m.role, content: m.content }));

    try {
      let todayVisits = 0;
      try {
        const today = new Date().toISOString().slice(0,10);
        const { count } = await supabase.from('crm_visits')
          .select('id', { count: 'exact', head: true })
          .eq('rep_id', userId).eq('visit_date', today);
        todayVisits = count ?? 0;
      } catch {}

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, userId, userName, userRole: role, isManager, todayVisits,
          extraPermissions:  session?.extra_permissions  ?? [],
          deniedPermissions: session?.denied_permissions ?? [] }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data  = await res.json();
      const reply = data?.reply ?? 'عذراً، ما قدرت أفهم. حاولي مجدداً 😊';

      const finalMsgs = [...withUser, { role: 'assistant', content: reply }];
      setMessages(finalMsgs);
      saveMemory(finalMsgs);

      if (!open) setUnread(u => u + 1);
    } catch {
      setMessages(withUser);
      setError('فشل الاتصال. تأكد من الإنترنت وحاولي مجدداً 🌐');
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, userId, userName, role, isManager, open, saveMemory, session]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clearChat = async () => {
    const fresh = [WELCOME];
    setMessages(fresh);
    setError(null);
    // Clear DB memory too
    if (userId) {
      await supabase.from('lozy_chats')
        .upsert({ user_id: userId, messages: fresh, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' });
    }
  };

  const suggestions = isManager ? SUGGESTIONS_MANAGER : SUGGESTIONS_EMPLOYEE;
  const showSuggestions = messages.length <= 2;

  return (
    <>
      {/* ── Chat Panel ──────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed z-[100] w-[calc(100vw-2rem)] sm:w-96 max-h-[78vh] flex flex-col bg-surface border border-border rounded-3xl shadow-2xl overflow-hidden"
          dir="rtl"
          style={{
            animation: 'fadeSlideUp 0.2s ease-out',
            ...(pos.x !== null ? panelStyle : { bottom: '5rem', right: '1rem', left: 'auto', top: 'auto' }),
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-navy to-teal border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-white/15 border-2 border-white/30 flex items-center justify-center text-xl shrink-0">
                {LOZY_AVATAR}
              </div>
              <div>
                <p className="text-sm font-extrabold text-white leading-tight">لوزي</p>
                <p className="text-[10px] text-white/60">مساعدة لويز الذكية · تذكر كل شيء 💭</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={clearChat} title="مسح المحادثة"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition text-xs"
                aria-label="مسح">
                🗑
              </button>
              <button onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition text-sm">
                ✕
              </button>
            </div>
          </div>

          {/* Memory indicator */}
          {messages.length > 3 && (
            <div className="px-4 py-1.5 bg-teal/5 border-b border-border/30 flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-teal font-medium">💭 لوزي تذكر {messages.length - 1} رسالة من محادثاتكم</span>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 min-h-0 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
            {messages.map((msg, i) => <Message key={i} msg={msg} />)}
            {error && (
              <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 border border-red-200 rounded-xl px-3 py-2 text-center my-2">
                ⚠️ {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions */}
          {showSuggestions && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
              {suggestions.map(s => (
                <button key={s} onClick={() => send(s)} disabled={loading}
                  className="text-[11px] px-2.5 py-1.5 rounded-xl bg-surface-alt border border-border text-muted hover:border-teal/50 hover:text-teal hover:bg-teal/5 transition disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex items-end gap-2 px-3 pb-3 pt-2 border-t border-border/40 shrink-0">
            <div className="flex-1 flex items-end bg-surface-alt border border-border rounded-2xl px-3 py-2 focus-within:border-teal/50 transition">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="اكتبي سؤالك للوزي…"
                rows={1}
                disabled={loading}
                style={{ resize: 'none', maxHeight: 80 }}
                className="flex-1 bg-transparent text-sm text-text placeholder:text-muted/50 outline-none resize-none disabled:opacity-60 leading-relaxed"
              />
            </div>
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-xl bg-teal text-white flex items-center justify-center hover:bg-teal/90 disabled:opacity-50 transition active:scale-95 shrink-0"
            >
              {loading
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="m3.478 2.405-2.478 14c-.168.944.667 1.754 1.606 1.508l5.993-1.635 3.401 6.06c.437.777 1.57.649 1.833-.22l8.168-28c.283-.97-.613-1.866-1.583-1.583l-18 6a1 1 0 0 0-.94 1.87Z"/></svg>
              }
            </button>
          </div>
        </div>
      )}

      {/* ── Floating Button (draggable) ───────────────────────────── */}
      <button
        ref={btnRef}
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        className={`fixed z-[99] w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-2xl select-none touch-none cursor-grab active:cursor-grabbing ${
          pos.x === null ? 'bottom-20 sm:bottom-6 end-4 sm:end-6' : ''
        } ${open ? 'bg-navy' : 'bg-gradient-to-br from-navy to-teal hover:shadow-teal/30 hover:shadow-2xl'}`}
        style={btnStyle}
        title="لوزي 🐱 — انقر للدردشة، أو اسحبني لتحريكي"
      >
        {open ? '✕' : <LozyFace size={32} />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -end-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center shadow-md pointer-events-none">
            {unread}
          </span>
        )}
        {!open && (
          <span className="absolute inset-0 rounded-full animate-ping bg-teal/20 pointer-events-none" />
        )}
      </button>

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

export default AIAssistantWidget;
