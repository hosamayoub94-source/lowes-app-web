// =============================================================
// EmployeeProfileModal — بطاقة تعريفية للموظف
// يُستخدم في TeamScreen وغيرها لعرض بروفايل أي موظف
// =============================================================
import { useState, useEffect } from 'react';
import { supabase } from '@services/supabase';
import { ROLE_LABELS } from '@data/teams';

const AVATAR_COLORS = [
  'bg-teal/20 text-teal', 'bg-navy/20 text-navy', 'bg-amber/20 text-amber',
  'bg-red/20 text-red', 'bg-purple-100 text-purple-600', 'bg-green-100 text-green-700',
];
function avatarColor(name) {
  let h = 0;
  for (const c of (name || '')) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

function InfoRow({ icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-none">
      <span className="text-lg shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-muted uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-text mt-0.5 break-words">{value}</p>
      </div>
    </div>
  );
}

// ── Star display ──────────────────────────────────────────────
function AvgStars({ avg }) {
  const n = Math.round(avg || 0);
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(s => (
        <span key={s} className={`text-sm ${s <= n ? 'text-amber-400' : 'text-border'}`}>★</span>
      ))}
    </div>
  );
}

export default function EmployeeProfileModal({ profile, onClose }) {
  const [extended, setExtended] = useState(null);
  const [review,   setReview]   = useState(null);
  const [partners, setPartners] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!profile?.employee_name) { setLoading(false); return; }
    const n = profile.employee_name;

    Promise.all([
      supabase.from('profiles').select('phone,personal_email,work_location,birthday,hire_date,bio,skills').eq('employee_name', n).single(),
      supabase.from('performance_reviews').select('rating_overall,rating_attendance,rating_tasks,rating_attitude,rating_knowledge').eq('employee_name', n).order('period_year', { ascending: false }).order('period_month', { ascending: false }).limit(1).single(),
      supabase.from('shift_partners').select('partner').eq('requester', n).eq('status', 'accepted'),
    ]).then(([profRes, revRes, partRes]) => {
      setExtended(profRes.data ?? null);
      setReview(revRes.data ?? null);
      setPartners((partRes.data ?? []).map(p => p.partner));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [profile]);

  if (!profile) return null;

  const { employee_name, role_type, team, avatar_url } = profile;
  const roleLabel = ROLE_LABELS?.[role_type] ?? role_type ?? '';

  const avgRating = review
    ? (review.rating_overall + review.rating_attendance + review.rating_tasks + review.rating_attitude + review.rating_knowledge) / 5
    : null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4"
      dir="rtl"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">

        {/* Top handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Close btn (desktop) */}
        <div className="hidden sm:flex justify-end px-4 pt-3">
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt text-muted hover:text-text flex items-center justify-center transition">✕</button>
        </div>

        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-3 px-6 pt-4 pb-5">
          {avatar_url ? (
            <img src={avatar_url} alt={employee_name} className="w-20 h-20 rounded-3xl object-cover shadow-md" />
          ) : (
            <div className={`w-20 h-20 rounded-3xl flex items-center justify-center text-3xl font-extrabold shadow-md ${avatarColor(employee_name)}`}>
              {employee_name?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div className="text-center">
            <h2 className="text-lg font-extrabold text-text">{employee_name}</h2>
            <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
              {roleLabel && (
                <span className="text-xs font-bold text-teal bg-teal/10 border border-teal/20 px-2 py-0.5 rounded-full">
                  {roleLabel}
                </span>
              )}
              {team && (
                <span className="text-xs font-semibold text-muted border border-border px-2 py-0.5 rounded-full">
                  {team}
                </span>
              )}
            </div>
            {avgRating && (
              <div className="flex items-center justify-center gap-1.5 mt-2">
                <AvgStars avg={avgRating} />
                <span className="text-xs text-muted">{avgRating.toFixed(1)}/5</span>
              </div>
            )}
          </div>
        </div>

        {/* Info rows */}
        {loading ? (
          <div className="px-5 pb-5 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-10 bg-surface-alt animate-pulse rounded-xl" />)}
          </div>
        ) : (
          <div className="px-5 pb-5">
            {extended?.bio && (
              <div className="mb-3 bg-surface-alt rounded-2xl px-4 py-3">
                <p className="text-xs text-muted leading-relaxed">{extended.bio}</p>
              </div>
            )}

            <InfoRow icon="📍" label="موقع العمل"       value={extended?.work_location} />
            <InfoRow icon="📅" label="تاريخ الانضمام"   value={extended?.hire_date ? new Date(extended.hire_date).toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' }) : null} />
            <InfoRow icon="🎂" label="تاريخ الميلاد"    value={extended?.birthday   ? new Date(extended.birthday).toLocaleDateString('ar-SA', { month:'long', day:'numeric' }) : null} />
            <InfoRow icon="🧩" label="المهارات"          value={extended?.skills} />
            {partners.length > 0 && (
              <InfoRow icon="🤝" label="شركاء الوردية"  value={partners.join('، ')} />
            )}
          </div>
        )}

        {/* Close bottom */}
        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-surface-alt text-muted font-bold text-sm hover:bg-border transition"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
