// =============================================================
// AdminFaceEnrollScreen — رفع الصور المرجعية للتحقق من الوجه
// الأدمن يختار موظف → يرفع صورته المرجعية → يُستخرج الـ descriptor
// ويُخزَّن في profiles.face_descriptor
// =============================================================
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@services/supabase';
import {
  loadFaceModels,
  extractDescriptor,
  descriptorToArray,
} from '@services/faceVerificationService';

export default function AdminFaceEnrollScreen() {
  const [profiles,  setProfiles]  = useState([]);
  const [search,    setSearch]    = useState('');
  const [selected,  setSelected]  = useState(null); // profile object
  const [loading,   setLoading]   = useState(false);
  const [status,    setStatus]    = useState(null);  // { type: 'success'|'error'|'info', msg }
  const [modelsReady, setModelsReady] = useState(false);
  const fileRef = useRef(null);

  // Load face-api models
  useEffect(() => {
    setStatus({ type: 'info', msg: 'جارٍ تحميل نماذج الذكاء الاصطناعي…' });
    loadFaceModels()
      .then(() => { setModelsReady(true); setStatus(null); })
      .catch(() => setStatus({ type: 'error', msg: 'فشل تحميل نماذج التعرف على الوجه' }));
  }, []);

  // Load profiles
  useEffect(() => {
    supabase.from('profiles')
      .select('id, employee_name, avatar_url, face_descriptor, role_type, is_active')
      .eq('is_active', true)
      .order('employee_name')
      .then(({ data }) => setProfiles(data ?? []))
      .catch(() => {});
  }, []);

  const filtered = profiles.filter(p =>
    p.employee_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selected || !modelsReady) return;

    setLoading(true);
    setStatus({ type: 'info', msg: 'جارٍ تحليل الصورة…' });

    try {
      // Extract face descriptor
      const descriptor = await extractDescriptor(file);
      if (!descriptor) {
        setStatus({ type: 'error', msg: '❌ لم يتم اكتشاف وجه في الصورة. جرّب صورة أوضح.' });
        setLoading(false);
        return;
      }

      // Save to Supabase profiles
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ face_descriptor: descriptorToArray(descriptor) })
        .eq('id', selected.id);

      if (updateErr) throw updateErr;

      // Also upload image to avatars bucket as reference
      const ext  = file.name.split('.').pop();
      const path = `face_ref/${selected.id}.${ext}`;
      await supabase.storage.from('avatars').upload(path, file, { upsert: true }).catch(() => {});

      // Update local state
      setProfiles(ps => ps.map(p =>
        p.id === selected.id
          ? { ...p, face_descriptor: descriptorToArray(descriptor) }
          : p
      ));
      setSelected(s => ({ ...s, face_descriptor: descriptorToArray(descriptor) }));
      setStatus({ type: 'success', msg: `✅ تم حفظ صورة ${selected.employee_name} بنجاح! التحقق من الوجه مفعّل.` });

    } catch (err) {
      setStatus({ type: 'error', msg: `❌ خطأ: ${err.message}` });
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const clearDescriptor = async (profile) => {
    if (!window.confirm('حذف بصمة الوجه لهذا الموظف؟')) return;
    const { error } = await supabase.from('profiles').update({ face_descriptor: null }).eq('id', profile.id);
    if (error) { window.alert('تعذّر حذف بصمة الوجه: ' + error.message); return; }
    setProfiles(ps => ps.map(p => p.id === profile.id ? { ...p, face_descriptor: null } : p));
    if (selected?.id === profile.id) setSelected(s => ({ ...s, face_descriptor: null }));
    setStatus({ type: 'info', msg: `تم إلغاء التحقق من الوجه لـ ${profile.employee_name}` });
  };

  const enrolled   = profiles.filter(p => p.face_descriptor);
  const unenrolled = profiles.filter(p => !p.face_descriptor);

  return (
    <div className="max-w-2xl mx-auto pb-24 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-text">🔐 التحقق من الوجه</h1>
        <p className="text-sm text-muted mt-1">
          ارفع صورة مرجعية لكل موظف لتفعيل التحقق التلقائي عند تسجيل الحضور
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-green-600">{enrolled.length}</p>
          <p className="text-xs text-green-600 font-semibold mt-1">✅ مُسجَّل</p>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-orange-500">{unenrolled.length}</p>
          <p className="text-xs text-orange-500 font-semibold mt-1">⏳ بانتظار الصورة</p>
        </div>
      </div>

      {/* Status message */}
      {status && (
        <div className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
          status.type === 'success' ? 'bg-green-500/10 text-green-600 border border-green-500/20' :
          status.type === 'error'   ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
          'bg-teal/10 text-teal border border-teal/20'
        }`}>
          {status.msg}
        </div>
      )}

      {/* Search */}
      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="🔍 ابحث عن موظف…"
        className="w-full border border-border rounded-2xl px-4 py-3 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30"
      />

      {/* Employee list */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        {filtered.map((p, i) => {
          const hasDescriptor = !!p.face_descriptor;
          const isSelected    = selected?.id === p.id;
          return (
            <div key={p.id}
              className={`flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0 transition-all cursor-pointer ${
                isSelected ? 'bg-teal/5 border-r-2 border-r-teal' : 'hover:bg-surface-alt'
              }`}
              onClick={() => setSelected(p)}>
              {/* Avatar */}
              <div className="w-10 h-10 rounded-2xl bg-surface-alt grid place-items-center shrink-0 overflow-hidden">
                {p.avatar_url
                  ? <img src={p.avatar_url} alt={p.employee_name} className="w-full h-full object-cover" />
                  : <span className="font-bold text-sm text-muted">{p.employee_name?.[0]?.toUpperCase()}</span>
                }
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-text truncate">{p.employee_name}</p>
                <p className="text-[11px] text-muted">{p.role_type}</p>
              </div>

              {/* Status + actions */}
              <div className="flex items-center gap-2 shrink-0">
                {hasDescriptor ? (
                  <>
                    <span className="text-[10px] font-bold text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full">✅ مُسجَّل</span>
                    <button
                      onClick={e => { e.stopPropagation(); clearDescriptor(p); }}
                      className="text-[10px] text-red-400 hover:text-red-600 transition px-1">
                      حذف
                    </button>
                  </>
                ) : (
                  <span className="text-[10px] font-bold text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full">⏳ بدون</span>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted text-sm">لا نتائج</div>
        )}
      </div>

      {/* Upload section */}
      {selected && (
        <div className="bg-surface border border-teal/30 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-surface-alt grid place-items-center overflow-hidden">
              {selected.avatar_url
                ? <img src={selected.avatar_url} alt="" className="w-full h-full object-cover" />
                : <span className="font-black text-lg text-muted">{selected.employee_name?.[0]?.toUpperCase()}</span>
              }
            </div>
            <div>
              <p className="font-bold text-text">{selected.employee_name}</p>
              <p className="text-xs text-muted">
                {selected.face_descriptor ? '✅ لديه صورة مرجعية — يمكنك تحديثها' : '⏳ لا توجد صورة مرجعية بعد'}
              </p>
            </div>
          </div>

          <div className="text-xs text-muted bg-surface-alt rounded-xl px-3 py-2 leading-relaxed">
            💡 <strong>نصائح للصورة الجيدة:</strong> وجه واضح ومضيء، بدون نظارات شمسية، مباشرة للكاميرا، لا يوجد أشخاص آخرون في الصورة
          </div>

          <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl py-8 cursor-pointer transition ${
            loading || !modelsReady
              ? 'opacity-50 cursor-not-allowed border-border'
              : 'border-teal/40 hover:border-teal hover:bg-teal/5'
          }`}>
            <span className="text-4xl">{loading ? '⏳' : '📸'}</span>
            <span className="font-bold text-sm text-text">
              {loading ? 'جارٍ المعالجة…' : !modelsReady ? 'جارٍ تحميل الذكاء الاصطناعي…' : 'اضغط لرفع صورة الموظف'}
            </span>
            <span className="text-xs text-muted">JPG, PNG — الوجه يجب أن يكون واضحاً</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={loading || !modelsReady}
              onChange={handleFileChange}
            />
          </label>
        </div>
      )}
    </div>
  );
}
