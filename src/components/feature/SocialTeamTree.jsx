// =============================================================
// SocialTeamTree — هيكل فريق السوشال ميديا فقط (لا هيكل الشركة كلها)
//
// يقرأ الأشخاص الحقيقيين من profiles — لا أسماء مكتوبة بالكود:
//   • مدير السوشال      → role_type = social_manager
//   • أعضاء الفريق      → team = 'ميديا' (عدا المدير والميديا باير)
//   • الميديا باير      → role_type = media_buyer — يُعرض **بجانب** الفريق
//                          لا تحته: مرتبط بالفريق كله ولا يتبع مدير السوشال.
//
// هذا عرض فقط — لا يكتب شيئاً ولا يغيّر أي مدير مسجَّل بالنظام.
// =============================================================
import { useEffect, useState } from 'react';
import { supabase }     from '@services/supabase';
import { Avatar }       from '@components/ui/Avatar';
import { ROLES, ROLE_LABELS } from '@data/teams';

const SOCIAL_TEAM = 'ميديا';

/** بطاقة شخص واحد — أو خانة شاغرة بنفس اصطلاح شاشة الهيكل الإداري. */
function PersonCard({ person, titleEn, titleAr, tone = 'default' }) {
  const ring =
    tone === 'manager' ? 'border-teal/40 bg-teal/5'
    : tone === 'linked' ? 'border-dashed border-amber-300 bg-amber-50/40 dark:bg-amber-900/10'
    : 'border-border bg-surface';

  return (
    <div className={`rounded-2xl border p-3 min-w-[10.5rem] ${ring}`}>
      <p className="text-[11px] font-black text-text" dir="ltr" style={{ textAlign: 'right' }}>{titleEn}</p>
      <p className="text-[10px] text-muted mb-2">{titleAr}</p>
      {person ? (
        <div className="flex items-center gap-2">
          <Avatar name={person.employee_name} src={person.avatar_url} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-text truncate">{person.employee_name}</p>
            {person.job_title && <p className="text-[10px] text-muted truncate">{person.job_title}</p>}
          </div>
        </div>
      ) : (
        <span className="inline-block text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5">
          Vacant
        </span>
      )}
    </div>
  );
}

export default function SocialTeamTree() {
  const [people, setPeople]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, employee_name, job_title, role_type, team, avatar_url, is_active')
        .eq('is_active', true)
        .order('employee_name');
      if (!alive) return;
      setPeople(data ?? []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-5 text-center text-xs text-muted">
        جارٍ تحميل هيكل الفريق…
      </div>
    );
  }

  const manager = people.find(p => p.role_type === ROLES.SOCIAL_MANAGER) ?? null;
  const buyers  = people.filter(p => p.role_type === ROLES.MEDIA_BUYER);
  const members = people.filter(p =>
    p.team === SOCIAL_TEAM &&
    p.id !== manager?.id &&
    p.role_type !== ROLES.MEDIA_BUYER,
  );

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-3" dir="rtl">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="text-sm font-bold text-text">🧭 هيكل فريق السوشال</p>
        <p className="text-[10px] text-muted">مَن يتبع مَن إدارياً — منفصل تماماً عن شركاء الدوام</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-center">

        {/* ── الفريق: المدير ثم التابعون ── */}
        <div className="flex flex-col items-center gap-0">
          <PersonCard
            person={manager}
            titleEn="Social Media Manager"
            titleAr="مدير السوشال ميديا"
            tone="manager"
          />

          {/* وصلة نازلة من المدير */}
          <div className="w-px h-5 bg-border" aria-hidden="true" />

          {members.length === 0 ? (
            <p className="text-[11px] text-muted py-2">لا يوجد أعضاء مسجَّلون بفريق «{SOCIAL_TEAM}» بعد</p>
          ) : (
            <>
              {/* سكة أفقية تجمع التابعين */}
              <div className="h-px w-full max-w-[36rem] bg-border" aria-hidden="true" />
              <div className="flex flex-wrap justify-center gap-3 pt-0">
                {members.map(m => (
                  <div key={m.id} className="flex flex-col items-center">
                    <div className="w-px h-5 bg-border" aria-hidden="true" />
                    <PersonCard
                      person={m}
                      titleEn={m.job_title || 'Social Media Team'}
                      titleAr={ROLE_LABELS[m.role_type] ?? 'عضو فريق'}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── الميديا باير: بجانب الفريق لا تحته ── */}
        <div className="flex flex-col items-center gap-2 lg:border-s lg:border-dashed lg:border-amber-300 lg:ps-4
                        border-t border-dashed border-amber-300 pt-4 lg:border-t-0 lg:pt-0">
          {buyers.length === 0 ? (
            <PersonCard person={null} titleEn="Media Buyer" titleAr="ميديا باير" tone="linked" />
          ) : (
            buyers.map(b => (
              <PersonCard key={b.id} person={b} titleEn="Media Buyer" titleAr="ميديا باير" tone="linked" />
            ))
          )}
          <p className="text-[10px] text-amber-700 dark:text-amber-400 text-center max-w-[11rem] leading-relaxed">
            متعاون مع الفريق كله — لا يتبع مدير السوشال
          </p>
        </div>

      </div>
    </div>
  );
}
