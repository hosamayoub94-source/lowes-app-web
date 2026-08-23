// =============================================================
// SocialTeamTree — شجرة قسم Media فقط (لا هيكل الشركة كلها)
//
// مصدر التبعية الإدارية هو **المسمى الوظيفي** (profiles.job_title)
// مقابل المسميات المعتمدة بـ@data/orgChart — لا الدور ولا الفريق.
// السبب: أكثر من موظف يحمل دور social_manager لأغراض صلاحيات، ولا
// تُغيَّر الصلاحيات لأجل العرض (D-075).
//
//   Media
//   ├── Social Media Manager
//   │   ├── Graphic Designer × 2
//   │   └── Social Media Specialist × 2
//   ├── Media Buyer × 1
//   ├── Trade Relations Specialist
//   └── Medical Relations Specialist
//
// عرض فقط — لا يكتب شيئاً ولا يغيّر أي دور أو مدير مسجَّل بالنظام.
// =============================================================
import { useEffect, useState } from 'react';
import { supabase } from '@services/supabase';
import { Avatar }   from '@components/ui/Avatar';
import { ROLES }    from '@data/teams';
import { MEDIA_TEAM, MEDIA_JOB_TITLES, mediaTitleOf } from '@data/orgChart';

/** بطاقة شخص — أو خانة شاغرة بنفس اصطلاح شاشة الهيكل الإداري القائمة. */
function PersonCard({ person, titleEn, titleAr, specialty, tone = 'default' }) {
  const skin =
    tone === 'manager' ? 'border-teal/40 bg-teal/5'
    : tone === 'aside' ? 'border-dashed border-amber-300 bg-amber-50/40 dark:bg-amber-900/10'
    : 'border-border bg-surface';

  return (
    <div className={`rounded-2xl border p-3 min-w-[10.5rem] max-w-[13rem] ${skin}`}>
      <p className="text-[11px] font-black text-text" dir="ltr" style={{ textAlign: 'right' }}>{titleEn}</p>
      <p className="text-[10px] text-muted">{titleAr}</p>
      {specialty && <p className="text-[9px] text-muted/80 mb-2 leading-relaxed">{specialty}</p>}
      {person ? (
        <div className="flex items-center gap-2 mt-1.5">
          <Avatar name={person.employee_name} src={person.avatar_url} size="sm" />
          <p className="text-sm font-bold text-text truncate">{person.employee_name}</p>
        </div>
      ) : (
        <span className="inline-block mt-1.5 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5">
          Vacant
        </span>
      )}
    </div>
  );
}

/** خانات مسمّى واحد: يعرض كل مَن يحمله، وخانة شاغرة حتى اكتمال العدد. */
function TitleSlots({ def, holders, expected, tone }) {
  const vacancies = Math.max(0, (expected ?? 0) - holders.length);
  return (
    <>
      {holders.map(p => (
        <PersonCard key={p.id} person={p} tone={tone}
          titleEn={def.title_en} titleAr={def.title_ar} specialty={def.specialty} />
      ))}
      {Array.from({ length: vacancies }, (_, i) => (
        <PersonCard key={`${def.key}-vacant-${i}`} person={null} tone={tone}
          titleEn={def.title_en} titleAr={def.title_ar} specialty={def.specialty} />
      ))}
    </>
  );
}

// العدد المتوقَّع لكل مسمى بالهيكل المعتمد
const EXPECTED = { social_manager: 1, graphic: 2, specialist: 2, media_buyer: 1, trade: 1, medical: 1 };

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
      if (alive) { setPeople(data ?? []); setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-5 text-center text-xs text-muted">
        جارٍ تحميل هيكل القسم…
      </div>
    );
  }

  const dept = people.filter(p => p.team === MEDIA_TEAM);

  /** حاملو مسمّى معتمد. الميديا باير يُلتقط بدوره أيضاً لمن لم يُثبَّت مسمّاه بعد. */
  const holdersOf = (key) => dept.filter(p => {
    const t = mediaTitleOf(p.job_title);
    if (t?.key === key) return true;
    return key === 'media_buyer' && !t && p.role_type === ROLES.MEDIA_BUYER;
  });

  const def       = (key) => MEDIA_JOB_TITLES.find(x => x.key === key);
  const managers  = holdersOf('social_manager');
  const directs   = ['graphic', 'specialist'];
  const asides    = ['media_buyer', 'trade', 'medical'];

  // أعضاء القسم بلا مسمّى معتمد — لا يُنسبون لأي مدير، ينتظرون التثبيت
  const assignedIds = new Set(
    [...managers, ...directs.flatMap(holdersOf), ...asides.flatMap(holdersOf)].map(p => p.id),
  );
  const unassigned = dept.filter(p => !assignedIds.has(p.id));

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-4" dir="rtl">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="text-sm font-bold text-text">🗂️ شجرة قسم Media</p>
        <p className="text-[10px] text-muted">التبعية الإدارية تُقرأ من المسمى الوظيفي — منفصلة عن شركاء الدوام</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">

        {/* ── مدير السوشال ومَن يتبعه إدارياً ── */}
        <div className="flex flex-col items-center">
          <TitleSlots def={def('social_manager')} holders={managers}
            expected={EXPECTED.social_manager} tone="manager" />

          <div className="w-px h-5 bg-border" aria-hidden="true" />
          <div className="h-px w-full max-w-[34rem] bg-border" aria-hidden="true" />

          <div className="flex flex-wrap justify-center gap-3">
            {directs.map(key => (
              <div key={key} className="flex flex-col items-center">
                <div className="w-px h-5 bg-border" aria-hidden="true" />
                <div className="flex flex-wrap justify-center gap-3">
                  <TitleSlots def={def(key)} holders={holdersOf(key)} expected={EXPECTED[key]} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── ضمن القسم، خارج تبعية مدير السوشال ── */}
        <div className="flex flex-col items-center gap-2 pt-4 border-t border-dashed border-amber-300
                        lg:pt-0 lg:border-t-0 lg:border-s lg:border-dashed lg:border-amber-300 lg:ps-4">
          {asides.map(key => (
            <TitleSlots key={key} def={def(key)} holders={holdersOf(key)}
              expected={EXPECTED[key]} tone="aside" />
          ))}
          <p className="text-[10px] text-amber-700 dark:text-amber-400 text-center max-w-[12rem] leading-relaxed">
            ضمن قسم Media — لا يتبعون مدير السوشال إدارياً
          </p>
        </div>
      </div>

      {/* ── بانتظار تثبيت المسمى — لا يُنسبون لأي مدير ── */}
      {unassigned.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="text-[10px] font-bold text-muted mb-1.5">
            بانتظار تثبيت المسمى الوظيفي ({unassigned.length}) — غير منسوبين لأي مدير
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unassigned.map(p => (
              <span key={p.id} className="px-2.5 py-1 rounded-full bg-surface-alt border border-border text-xs text-text">
                {p.employee_name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
