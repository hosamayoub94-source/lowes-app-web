// =============================================================
// AIAssistantWidget — زر عائم + chat panel للمساعد الذكي
// يظهر على كل شاشة · يستدعي Edge Function ai-assistant
// =============================================================
import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth }  from '@hooks/useAuth';
import { supabase } from '@services/supabase';
import { ROLES }    from '@data/teams';

// ── Markdown-lite renderer (bold + newlines) ──────────────────
function RenderText({ text }) {
  if (!text) return null;
  // Convert **bold**, *italic*, and newlines
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

// ── Suggested prompts ─────────────────────────────────────────
const SUGGESTIONS = [
  'شو مهامي اليوم؟',
  'كيف أستخدم سيروم الريتينول؟',
  'كم ضل لي من إجازة؟',
  'اشرح لي نظام العمولات',
  'ما مكونات واقي الشمس الزهري؟',
  'من غاب اليوم من الفريق؟',
];

// ── Chat message component ────────────────────────────────────
function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2.5 mb-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-sm font-bold ${
        isUser ? 'bg-teal text-white' : 'bg-gradient-to-br from-navy to-teal text-white'
      }`}>
        {isUser ? '👤' : '🤖'}
      </div>

      {/* Bubble */}
      <div className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
        isUser
          ? 'bg-teal text-white rounded-tr-sm'
          : 'bg-surface border border-border/80 text-text rounded-tl-sm'
      }`}>
        {msg.loading ? (
          <div className="flex items-center gap-1.5 py-0.5">
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

// ═══════════════════════════════════════════════════════════════
export function AIAssistantWidget() {
  const { id: userId, name: userName, role } = useAuth();
  const isManager = [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER].includes(role);

  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState([
    {
      role:    'assistant',
      content: `أهلاً ${userName?.split(' ')[0] ?? ''} 👋\nأنا مساعدك الذكي في لويز Professional. اسألني عن أي شيء — المنتجات، مهامك، إجازاتك، العمولات، أو أي معلومة تحتاجها!`,
    },
  ]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [unread,   setUnread]   = useState(0);

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const send = useCallback(async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    setInput('');
    setError(null);

    const userMsg   = { role: 'user',      content: msg };
    const loadingMsg = { role: 'assistant', content: '', loading: true };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setLoading(true);

    // Build conversation history (exclude the loading placeholder)
    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    try {
      // Fetch today's visits count for richer context
      const today = new Date().toISOString().slice(0,10);
      const { count: todayVisits } = await supabase
        .from('crm_visits').select('id', { count: 'exact', head: true })
        .eq('rep_id', userId).eq('visit_date', today).catch(() => ({ count: null }));

      const { data, error: fnErr } = await supabase.functions.invoke('ai-assistant', {
        body: {
          messages:  history,
          userId,
          userName,
          userRole:  role,
          isManager,
          todayVisits: todayVisits ?? 0,
        },
      });

      if (fnErr) throw fnErr;

      const reply = data?.reply ?? 'عذراً، لم أستطع المعالجة. حاول مجدداً.';

      setMessages(prev => [
        ...prev.slice(0, -1), // remove loading
        { role: 'assistant', content: reply },
      ]);

      if (!open) setUnread(u => u + 1);
    } catch (err) {
      setMessages(prev => prev.slice(0, -1));
      setError('فشل الاتصال بالمساعد. تأكد من الاتصال بالإنترنت.');
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, userId, userName, role, isManager, open]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: `أهلاً من جديد ${userName?.split(' ')[0] ?? ''} 😊 كيف أقدر أساعدك؟`,
    }]);
    setError(null);
  };

  return (
    <>
      {/* ── Chat Panel ──────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-[100] w-[calc(100vw-2rem)] sm:w-96 max-h-[75vh] flex flex-col bg-surface border border-border rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
          dir="rtl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-navy to-teal border-b border-border/20">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-base shrink-0">🤖</div>
              <div>
                <p className="text-sm font-bold text-white leading-none">مساعد لويز الذكي</p>
                <p className="text-[10px] text-white/60 mt-0.5">مدعوم بـ Claude AI</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={clearChat} title="محادثة جديدة"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition text-xs">
                🔄
              </button>
              <button onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition text-sm">
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1 min-h-0 scrollbar-hide">
            {messages.map((msg, i) => <Message key={i} msg={msg} />)}
            {error && (
              <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 border border-red-200 rounded-xl px-3 py-2 text-center">
                ⚠️ {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions (only when few messages) */}
          {messages.length <= 2 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.slice(0, isManager ? 6 : 4).map(s => (
                <button key={s} onClick={() => send(s)} disabled={loading}
                  className="text-[11px] px-2.5 py-1.5 rounded-xl bg-surface-alt border border-border text-muted hover:border-teal/50 hover:text-teal hover:bg-teal/5 transition disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex items-end gap-2 px-3 pb-3 pt-2 border-t border-border/40">
            <div className="flex-1 flex items-end gap-2 bg-surface-alt border border-border rounded-2xl px-3 py-2 focus-within:border-teal/50 transition">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="اكتب سؤالك…"
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

      {/* ── Floating Button ──────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-[99] w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-2xl transition-all duration-300 active:scale-95 ${
          open
            ? 'bg-red-500 hover:bg-red-600 rotate-0'
            : 'bg-gradient-to-br from-navy to-teal hover:shadow-teal/30 hover:shadow-2xl hover:scale-110'
        }`}
        title={open ? 'إغلاق المساعد' : 'المساعد الذكي'}
        style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}
      >
        {open ? '✕' : '🤖'}
        {/* Unread badge */}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -end-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center shadow-md">
            {unread}
          </span>
        )}
        {/* Pulse ring */}
        {!open && (
          <span className="absolute inset-0 rounded-full animate-ping bg-teal/20 pointer-events-none" />
        )}
      </button>
    </>
  );
}

export default AIAssistantWidget;
