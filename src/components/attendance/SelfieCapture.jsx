// =============================================================
// SelfieCapture — camera modal for attendance verification.
// Opens the front camera, captures a photo, uploads it to the
// `attendance-selfies` bucket, and returns the public URL.
//
// Usage:
//   <SelfieCapture
//     label="تأكيد الحضور"
//     employeeName={userName}
//     kind="in"            // 'in' | 'out'
//     onCapture={(url) => ...}   // url may be null if user skips
//     onClose={() => ...}
//   />
// =============================================================
import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@services/supabase';

const BUCKET = 'attendance-selfies';

export function SelfieCapture({ label = 'التقاط صورة', employeeName, kind = 'in', onCapture, onClose }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [phase,   setPhase]   = useState('loading'); // loading | live | preview | uploading | error
  const [error,   setError]   = useState(null);
  const [shot,    setShot]    = useState(null);       // { blob, dataUrl }

  // ── Start camera ──────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setPhase('loading'); setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPhase('live');
    } catch (e) {
      setError(
        e?.name === 'NotAllowedError'
          ? 'تم رفض إذن الكاميرا. فعّله من إعدادات المتصفح.'
          : 'تعذّر فتح الكاميرا على هذا الجهاز.'
      );
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  // ── Capture frame ─────────────────────────────────────────────
  const capture = () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c) return;
    const size = Math.min(v.videoWidth, v.videoHeight) || 480;
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    // center-crop square + mirror (selfie feel)
    const sx = (v.videoWidth - size) / 2;
    const sy = (v.videoHeight - size) / 2;
    ctx.translate(size, 0); ctx.scale(-1, 1);
    ctx.drawImage(v, sx, sy, size, size, 0, 0, size, size);
    c.toBlob((blob) => {
      if (!blob) return;
      setShot({ blob, dataUrl: c.toDataURL('image/jpeg', 0.8) });
      setPhase('preview');
      stopCamera();
    }, 'image/jpeg', 0.8);
  };

  // ── Retake ────────────────────────────────────────────────────
  const retake = () => { setShot(null); startCamera(); };

  // ── Confirm → upload ──────────────────────────────────────────
  const confirm = async () => {
    if (!shot?.blob) return;
    setPhase('uploading'); setError(null);
    try {
      const safe = (employeeName || 'emp').replace(/[^a-zA-Z0-9]/g, '_');
      const path = `${safe}/${kind}_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, shot.blob, { contentType: 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      stopCamera();
      onCapture?.(data?.publicUrl ?? null);
    } catch {
      setError('فشل رفع الصورة. حاول مجدداً أو تخطَّ.');
      setPhase('preview');
    }
  };

  // ── Skip (e.g. no camera) ─────────────────────────────────────
  const skip = () => { stopCamera(); onCapture?.(null); };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4" dir="rtl">
      <div className="bg-surface rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-navy to-teal flex items-center justify-between">
          <p className="text-white font-bold text-sm">📸 {label}</p>
          <button onClick={() => { stopCamera(); onClose?.(); }}
            className="w-7 h-7 rounded-full bg-white/15 text-white/80 hover:text-white flex items-center justify-center text-sm">✕</button>
        </div>

        {/* Camera / preview area */}
        <div className="relative bg-black aspect-square flex items-center justify-center">
          {phase === 'loading' && (
            <div className="text-white/70 text-sm flex flex-col items-center gap-2">
              <span className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
              جارٍ فتح الكاميرا…
            </div>
          )}
          {phase === 'error' && (
            <div className="text-center px-6">
              <p className="text-4xl mb-3">📷</p>
              <p className="text-white/80 text-sm leading-relaxed">{error}</p>
            </div>
          )}
          {/* live video */}
          <video ref={videoRef} playsInline muted
            className={`w-full h-full object-cover ${phase === 'live' ? '' : 'hidden'}`}
            style={{ transform: 'scaleX(-1)' }} />
          {/* captured preview */}
          {phase !== 'live' && shot?.dataUrl && (
            <img src={shot.dataUrl} alt="selfie" className="w-full h-full object-cover" />
          )}
          {/* face guide overlay */}
          {phase === 'live' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-40 h-52 border-2 border-white/50 rounded-[50%]" />
            </div>
          )}
          {phase === 'uploading' && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-4 space-y-2">
          {phase === 'live' && (
            <button onClick={capture}
              className="w-full py-3.5 rounded-2xl bg-teal text-white font-bold text-base hover:bg-teal/90 transition active:scale-[0.98] flex items-center justify-center gap-2">
              <span className="text-xl">📸</span> التقاط الصورة
            </button>
          )}
          {phase === 'preview' && (
            <div className="flex gap-2">
              <button onClick={retake}
                className="flex-1 py-3 rounded-2xl border border-border text-text font-semibold hover:bg-surface-alt transition">
                ↺ إعادة
              </button>
              <button onClick={confirm}
                className="flex-1 py-3 rounded-2xl bg-teal text-white font-bold hover:bg-teal/90 transition active:scale-[0.98]">
                ✓ تأكيد
              </button>
            </div>
          )}
          {phase === 'error' && (
            <button onClick={startCamera}
              className="w-full py-3 rounded-2xl bg-teal text-white font-bold hover:bg-teal/90 transition">
              إعادة المحاولة
            </button>
          )}
          {error && phase === 'preview' && (
            <p className="text-[11px] text-red-500 text-center">{error}</p>
          )}
          {/* Allow skip so a broken camera never blocks attendance */}
          {(phase === 'error' || phase === 'live') && (
            <button onClick={skip}
              className="w-full py-2 text-xs text-muted hover:text-text transition">
              متابعة بدون صورة
            </button>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}

export default SelfieCapture;
