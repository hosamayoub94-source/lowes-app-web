// =============================================================
// AdminWhatsAppScreen — محادثات واتساب (رقم لوويز الرسمي +13204416777).
//   قائمة محادثات (يسار) + محادثة مفتوحة (يمين) + رد نصي مباشر.
//   يقرأ/يكتب على جدول whatsapp_messages بمشروع Supabase آخر — راجع
//   src/services/whatsappService.js لتفاصيل الربط. محميّة admin/manager.
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@hooks/useAuth';
import { useToast } from '@hooks/useToast';
import { fetchWhatsAppMessages, sendWhatsAppReply, normalizeWaPhone, WA_LINES } from '@services/whatsappService';

export default function AdminWhatsAppScreen() {
  const { id: userId } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState(null); // null = لسا ما حمّل
  const [openPhone, setOpenPhone] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [line, setLine] = useState('main'); // "main" | "campaign" — راجع D-016

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
    if (!openPhone && threads.length) setOpenPhone(threads[0].phone);
  }, [threads, openPhone]);

  const switchLine = (l) => { setLine(l); setOpenPhone(''); };

  const thread = useMemo(
    () => (lineMsgs || [])
      .filter(m => normalizeWaPhone(m.phone) === openPhone)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [lineMsgs, openPhone],
  );

  const send = async () => {
    const body = draft.trim();
    if (!openPhone || !body) return;
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

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="font-extrabold text-text flex items-center gap-2"><span>💬</span> محادثات واتساب</h1>
        <button onClick={load} className="text-xs text-teal-700 font-bold">تحديث ↻</button>
      </div>
      <p className="text-xs text-muted">الرسائل الواردة والصادرة عبر أرقام لوويز الرسمية.</p>

      <div className="flex gap-2">
        {Object.entries(WA_LINES).map(([key, l]) => (
          <button
            key={key}
            onClick={() => switchLine(key)}
            className={`text-xs font-bold rounded-lg px-3 py-1.5 border ${
              line === key ? 'bg-teal text-navy border-teal' : 'bg-surface text-text border-border/60'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {messages === null && <div className="text-muted text-sm py-8 text-center">⏳ جارٍ التحميل…</div>}

      {messages !== null && (
        <div className="flex gap-3 items-start flex-wrap md:flex-nowrap">
          {/* قائمة المحادثات */}
          <div className="bg-surface border border-border/60 rounded-xl w-full md:w-72 shrink-0 max-h-[70vh] overflow-y-auto">
            {threads.length === 0 && (
              <div className="text-muted text-sm py-8 text-center">لا رسائل بعد</div>
            )}
            {threads.map(t => (
              <div
                key={t.phone}
                onClick={() => setOpenPhone(t.phone)}
                className={`px-3 py-2 border-b border-border/40 cursor-pointer ${t.phone === openPhone ? 'bg-teal/10' : ''}`}
              >
                <div className="font-bold text-sm text-text">{t.phone}</div>
                <div className="text-xs text-muted truncate">
                  {t.direction === 'out' ? 'أنتم: ' : ''}{(t.body || '').slice(0, 40)}
                </div>
              </div>
            ))}
          </div>

          {/* المحادثة المفتوحة */}
          <div className="bg-surface border border-border/60 rounded-xl flex-1 p-3 flex flex-col max-h-[70vh]">
            {!openPhone && <div className="text-muted text-sm py-8 text-center">👈 اختر محادثة</div>}
            {openPhone && (
              <>
                <div className="flex-1 overflow-y-auto flex flex-col gap-2 mb-2">
                  {thread.map(m => (
                    <div
                      key={m.id}
                      className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                        m.direction === 'out'
                          ? 'self-end bg-teal text-navy'
                          : 'self-start bg-border/30 text-text'
                      }`}
                    >
                      {m.body}
                      <div className="text-[10px] opacity-70 mt-1">
                        {new Date(m.created_at).toLocaleString('ar')}
                        {m.direction === 'out' && m.status ? ` · ${m.status}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-sm bg-surface text-text"
                    placeholder="اكتب رد…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                    disabled={sending}
                  />
                  <button
                    onClick={send}
                    disabled={sending || !draft.trim()}
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
