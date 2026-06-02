// =============================================================
// SelfieCapture — camera modal with optional face verification.
//
// Props:
//   label         — button label
//   employeeName  — used in storage path
//   kind          — 'in' | 'out'
//   storedDescriptor — Float32Array or plain array from profiles.face_descriptor
//                      If provided, face verification is performed before upload.
//   onCapture(url, verificationResult) — called on success
//   onClose()
// =============================================================
import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@services/supabase';
import {
  loadFaceModels,
  extractDescriptor,
  compareFaces,
  descriptorToArray,
} from '@services/faceVerificationService';

const BUCKET = 'attendance-selfies';

export function SelfieCapture({
  label = 'التقاط صورة',
  employeeName,
  kind = 'in',
  storedDescriptor = null,
  onCapture,
  onClose,
}) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [phase,   setPhase]   = useState('loading'); // loading|live|preview|verifying|uploading|error
  const [error,   setError]   = useState(null);
  const [shot,    setShot]    = useState(null);        // { blob, dataUrl }
  const [verify,  setVerify]  = useState(null);        // { match, distance, confidence } | null

  // ── Start camera ──────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setPhase('loading'); setError(null); setVerify(null);
    // Pre-load models while camera starts (parallel)
    loadFaceModels().catch(() => {});
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
  const retake = () => { setShot(null); setVerify(null); startCamera(); };

  // ── Confirm → verify (if descriptor available) → upload ───────
  const confirm = async () => {
    if (!shot?.blob) return;
    setError(null);

    // ── Face verification (only if storedDescriptor provided) ──
    if (storedDescriptor) {
      setPhase('verifying');
      try {
        const liveDescriptor = await extractDescriptor(shot.blob);

        if (!liveDescriptor) {
          setError('لم يتم التعرف على وجه في الصورة. حاول مجدداً أو تخطَّ.');
          setPhase('preview');
          return;
        }

        const result = compareFaces(storedDescriptor, liveDescriptor);
        setVerify(result);

        if (!result.match) {
          // Face doesn't match — show warning but still allow skip
          setPhase('mismatch');
          return;
        }
      } catch {
        // If face-api fails (model load error etc.), skip verification silently
        setVerify(null);
      }
    }

    await _upload();
  };

  // ── Force upload even on mismatch (manager decides) ───────────
  const forceUpload = async () => {
    await _upload(true);
  };

  const _upload = async (forcedByUser = false) => {
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
      onCapture?.(data?.publicUrl ?? null, { ...verify, forced: forcedByUser });
    } catch {
      setError('فشل رفع الصورة. حاول مجدداً أو تخطَّ.');
      setPhase('preview');
    }
  };

  // ── Skip ──────────────────────────────────────────────────────
  const skip = () => { stopCamera(); onCapture?.(null, null); };

  // ── Verification result badge ──────────────────────────────────
  const VerifyBadge = () => {
    if (!verify) return null;
    if (verify.match) return (
      <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 text-sm font-bold">
        ✅ تم التحقق من الهوية — {verify.confidence}% تطابق
      </div>
    );
    return (
      <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-bold">
        ⚠️ الوجه لا يتطابق — {verify.confidence}% تطابق
      </div>
    );
  };

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
          {(phase === 'loading' || phase === 'verifying') && (
            <div className="text-white/70 text-sm flex flex-col items-center gap-2">
              <span className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {phase === 'verifying' ? 'جارٍ التحقق من الهوية…' : 'جارٍ فتح الكاميرا…'}
            </div>
          )}
          {phase === 'error' && (
            <div className="text-center px-6">
              <p className="text-4xl mb-3">📷</p>
              <p className="text-white/80 text-sm leading-relaxed">{error}</p>
            </div>
          )}
          <video ref={videoRef} playsInline muted
            className={`w-full h-full object-cover ${phase === 'live' ? '' : 'hidden'}`}
            style={{ transform: 'scaleX(-1)' }} />
          {phase !== 'live' && shot?.dataUrl && (
            <img src={shot.dataUrl} alt="selfie" className="w-full h-full object-cover" />
          )}
          {phase === 'live' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-40 h-52 border-2 border-white/50 rounded-[50%]" />
            </div>
          )}
          {phase === 'uploading' && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-4 space-y-2">
          <VerifyBadge />

          {phase === 'live' && (
            <button onClick={capture}
              className="w-full py-3.5 rounded-2xl bg-teal text-white font-bold text-base hover:bg-teal/90 transition active:scale-[0.98] flex items-center justify-center gap-2">
              <span className="text-xl">📸</span> التقاط الصورة
            </button>
          )}

          {(phase === 'preview') && (
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

          {/* Mismatch — face doesn't match stored descriptor */}
          {phase === 'mismatch' && (
            <div className="space-y-2">
              <p className="text-xs text-red-500 text-center font-semibold">
                ⚠️ الوجه لا يتطابق مع الصورة المحفوظة ({verify?.confidence}% تطابق)
              </p>
              <p className="text-[11px] text-muted text-center">
                سيتم إرسال تنبيه للمدير للمراجعة
              </p>
              <div className="flex gap-2">
                <button onClick={retake}
                  className="flex-1 py-3 rounded-2xl border border-border text-text font-semibold hover:bg-surface-alt transition text-sm">
                  ↺ إعادة
                </button>
                <button onClick={forceUpload}
                  className="flex-1 py-3 rounded-2xl bg-orange-500 text-white font-bold hover:bg-orange-500/90 transition text-sm">
                  تسجيل مع تنبيه
                </button>
              </div>
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
