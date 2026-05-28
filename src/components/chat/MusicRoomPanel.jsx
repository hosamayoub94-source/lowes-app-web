// =============================================================
// MusicRoomPanel — غرفة الموسيقى المشتركة
// YouTube sync عبر Supabase Realtime
// DJ يتحكم بالتشغيل، الباقي يستمع
// =============================================================
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@services/supabase';

// ── helpers ───────────────────────────────────────────────────

/** Extract YouTube video ID from URL or bare ID */
function extractVideoId(input) {
  if (!input) return null;
  const t = input.trim();
  // bare ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(t)) return t;
  // youtu.be/ID
  const short = t.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (short) return short[1];
  // youtube.com/?v=ID
  const long = t.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (long) return long[1];
  // /embed/ID
  const embed = t.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embed) return embed[1];
  return null;
}

/** Seconds elapsed since started_at (only when playing) */
function calcElapsed(startedAt) {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
}

// ── Setup SQL (shown if table is missing) ─────────────────────
const SETUP_SQL = `-- Run in Supabase SQL Editor → New query
CREATE TABLE IF NOT EXISTS music_room_state (
  id           INTEGER PRIMARY KEY DEFAULT 1,
  video_id     TEXT,
  video_title  TEXT,
  started_at   TIMESTAMPTZ,
  is_playing   BOOLEAN DEFAULT false,
  dj_id        TEXT,
  dj_name      TEXT,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- seed the single row
INSERT INTO music_room_state (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE music_room_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public select"  ON music_room_state FOR SELECT USING (true);
CREATE POLICY "auth update"    ON music_room_state FOR ALL   USING (auth.role() = 'authenticated');`;

// ── Main component ─────────────────────────────────────────────
export function MusicRoomPanel({ userId, userName }) {
  const [state,        setState]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [setupNeeded,  setSetupNeeded]  = useState(false);
  const [urlInput,     setUrlInput]     = useState('');
  const [titleInput,   setTitleInput]   = useState('');
  const [iframeKey,    setIframeKey]    = useState(0);   // force iframe reload
  const [copied,       setCopied]       = useState(false);
  const subRef = useRef(null);

  const isDJ     = state?.dj_id === userId;
  const videoId  = state?.video_id ?? null;
  const elapsed  = calcElapsed(state?.is_playing ? state.started_at : null);

  // YouTube embed URL — autoplay, start at elapsed position
  const embedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1&start=${elapsed}&rel=0&modestbranding=1`
    : null;

  // ── Load state ──────────────────────────────────────────────
  const loadState = async () => {
    const { data, error } = await supabase
      .from('music_room_state')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error?.code === '42P01') {   // table doesn't exist
      setSetupNeeded(true);
    } else if (!data) {
      // Table exists but row missing — insert seed row
      let seeded = null;
      try {
        const { data: s } = await supabase.from('music_room_state').insert({ id: 1 }).select().single();
        seeded = s;
      } catch {}
      setState(seeded ?? { id: 1, video_id: null, is_playing: false, dj_id: null, dj_name: null });
    } else {
      setState(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadState();

    // Realtime subscription
    subRef.current = supabase
      .channel('music-room-state')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'music_room_state', filter: 'id=eq.1' },
        (payload) => {
          setState(payload.new);
          setIframeKey(k => k + 1);  // reload iframe to sync position
        },
      )
      .subscribe();

    return () => { subRef.current?.unsubscribe(); };
  }, []);

  // ── Actions ─────────────────────────────────────────────────

  const claimDJ = async () => {
    await supabase.from('music_room_state').update({
      dj_id: userId, dj_name: userName, updated_at: new Date().toISOString(),
    }).eq('id', 1);
  };

  const releaseDJ = async () => {
    await supabase.from('music_room_state').update({
      dj_id: null, dj_name: null, updated_at: new Date().toISOString(),
    }).eq('id', 1);
  };

  const playSong = async () => {
    const vid = extractVideoId(urlInput);
    if (!vid) { alert('رابط يوتيوب غير صحيح ❌'); return; }
    const now = new Date().toISOString();
    await supabase.from('music_room_state').update({
      video_id:    vid,
      video_title: titleInput.trim() || `🎵 ${urlInput.trim()}`,
      started_at:  now,
      is_playing:  true,
      updated_at:  now,
    }).eq('id', 1);
    setUrlInput('');
    setTitleInput('');
  };

  const stopSong = async () => {
    await supabase.from('music_room_state').update({
      video_id:   null,
      video_title: null,
      started_at: null,
      is_playing: false,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
  };

  const copySetup = () => {
    navigator.clipboard.writeText(SETUP_SQL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Loading ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-teal/30 border-t-teal rounded-full animate-spin" />
      </div>
    );
  }

  // ── Setup needed ────────────────────────────────────────────
  if (setupNeeded) {
    return (
      <div className="flex-1 p-5 overflow-y-auto" dir="rtl">
        <div className="max-w-xl mx-auto">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🎵</span>
              <div>
                <h3 className="font-bold text-amber-800">تفعيل غرفة الموسيقى</h3>
                <p className="text-xs text-amber-600">الجدول غير موجود — شغّل هذا الـ SQL مرة واحدة</p>
              </div>
            </div>
            <pre className="text-[10px] bg-amber-100/80 rounded-xl p-3 overflow-auto text-amber-900 leading-relaxed whitespace-pre-wrap font-mono border border-amber-200">{SETUP_SQL}</pre>
            <div className="flex gap-2 mt-3">
              <button
                onClick={copySetup}
                className="flex-1 px-3 py-2 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition"
              >
                {copied ? '✓ تم النسخ!' : '📋 نسخ SQL'}
              </button>
              <button
                onClick={loadState}
                className="px-3 py-2 bg-amber-100 text-amber-700 border border-amber-300 rounded-xl text-sm font-semibold hover:bg-amber-200 transition"
              >
                ↻ تحقق مجدداً
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main UI ─────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-y-auto gap-4 p-4" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="font-extrabold text-text">🎵 غرفة الموسيقى</h2>
          <p className="text-xs text-muted mt-0.5">
            {state?.dj_name
              ? <>الدي جي: <span className="text-teal font-semibold">{state.dj_name}</span></>
              : 'لا يوجد دي جي — كن أول من يتولى التحكم 🎧'}
          </p>
        </div>

        {/* DJ toggle */}
        {isDJ ? (
          <button
            onClick={releaseDJ}
            className="px-3 py-1.5 rounded-xl text-xs bg-red-50 text-red-500 border border-red-200 hover:bg-red-100 transition font-semibold"
          >
            تركت 🎧
          </button>
        ) : (
          <button
            onClick={claimDJ}
            className="px-3 py-1.5 rounded-xl text-xs bg-teal/10 text-teal border border-teal/20 hover:bg-teal/20 transition font-semibold"
          >
            أنا الدي جي 🎧
          </button>
        )}
      </div>

      {/* Video player */}
      <div className="rounded-2xl overflow-hidden border border-border bg-black"
           style={{ aspectRatio: '16/9' }}>
        {embedUrl ? (
          <iframe
            key={iframeKey}
            src={embedUrl}
            className="w-full h-full"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            title="غرفة الموسيقى"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted select-none">
            <p className="text-5xl mb-3 opacity-40">🎵</p>
            <p className="font-bold text-sm">لا يوجد موسيقى حالياً</p>
            <p className="text-xs mt-1 opacity-70">
              {isDJ ? 'الصق رابط يوتيوب أدناه لتبدأ' : 'انتظر الدي جي…'}
            </p>
          </div>
        )}
      </div>

      {/* Now playing bar */}
      {state?.video_title && (
        <div className="flex items-center gap-3 px-3 py-2.5 bg-surface-alt rounded-xl border border-border">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 transition-all ${
            state.is_playing ? 'bg-teal animate-pulse scale-110' : 'bg-muted'
          }`} />
          <p className="flex-1 text-sm font-medium text-text truncate">{state.video_title}</p>
          {isDJ && videoId && (
            <button
              onClick={stopSong}
              className="text-xs text-muted hover:text-red-500 transition px-1"
              title="إيقاف الأغنية"
            >⏹</button>
          )}
        </div>
      )}

      {/* DJ controls */}
      {isDJ && (
        <div className="bg-teal/5 border border-teal/15 rounded-2xl p-4">
          <p className="text-xs font-bold text-teal mb-3">🎧 تحكم الدي جي</p>
          <div className="flex flex-col gap-2">
            <input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && playSong()}
              placeholder="رابط يوتيوب (youtube.com/watch?v=... أو youtu.be/...)"
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30"
              dir="ltr"
            />
            <div className="flex gap-2">
              <input
                value={titleInput}
                onChange={e => setTitleInput(e.target.value)}
                placeholder="اسم الأغنية (اختياري)"
                className="flex-1 border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30"
              />
              <button
                onClick={playSong}
                disabled={!urlInput.trim()}
                className="px-5 py-2 rounded-xl bg-teal text-white text-sm font-bold hover:bg-teal/90 disabled:opacity-40 transition"
              >
                ▶️ شغّل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info note */}
      <p className="text-[10px] text-muted text-center pb-1">
        🔊 إذا منع المتصفح الصوت — اضغط مرتين على الفيديو لتفعيل الصوت
      </p>
    </div>
  );
}

export default MusicRoomPanel;
