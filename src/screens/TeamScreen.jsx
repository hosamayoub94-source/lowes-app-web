// =============================================================
// TeamScreen — real-time directory of active employees from Supabase.
// Groups profiles by their `team` field; shows ungrouped last.
// =============================================================
import { useEffect, useState } from 'react';
import { Hero } from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { EmptyState } from '@components/ui/EmptyState';
import { Spinner } from '@components/ui/Loading';
import { supabase } from '@services/supabase';
import { ROLE_LABELS } from '@data/teams';

/** Fetch all active profiles and group them by team. */
async function fetchTeams() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, employee_name, role_type, team, avatar_url')
    .eq('is_active', true)
    .order('employee_name');
  if (error) throw error;

  // Group by team (null → 'other')
  const groups = {};
  for (const p of data || []) {
    const key = p.team || 'other';
    if (!groups[key]) groups[key] = { name: key === 'other' ? 'موظفون بدون فريق' : key, members: [] };
    groups[key].members.push(p);
  }

  // Sort: named teams first, ungrouped last
  return Object.values(groups).sort((a, b) => {
    if (a.name === 'موظفون بدون فريق') return 1;
    if (b.name === 'موظفون بدون فريق') return -1;
    return a.name.localeCompare(b.name, 'ar');
  });
}

export default function TeamScreen() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTeams()
      .then(setTeams)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  if (error) return (
    <div className="space-y-5">
      <Hero eyebrow="الفريق" title="فريق العمل" subtitle="تعرّف على زملائك في الفريق وأدوارهم." />
      <EmptyState description={`خطأ في تحميل البيانات: ${error}`} />
    </div>
  );

  return (
    <div className="space-y-5">
      <Hero
        eyebrow="الفريق"
        title="فريق العمل"
        subtitle="تعرّف على زملائك في الفريق وأدوارهم."
      />

      {teams.length === 0 ? (
        <EmptyState description="لا توجد بيانات موظفين. تأكد من إضافة موظفين في لوحة الأدمن." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {teams.map((team) => (
            <Card key={team.name}>
              <CardTitle>{team.name}</CardTitle>
              <CardSubtitle>{team.members.length} عضو نشط</CardSubtitle>
              <div className="mt-4 space-y-2">
                {team.members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-alt"
                  >
                    <div className="w-9 h-9 rounded-full bg-teal/15 flex items-center justify-center text-teal font-bold text-sm shrink-0 overflow-hidden">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        (m.employee_name || '?').charAt(0)
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text truncate">
                        {m.employee_name}
                      </p>
                      <p className="text-xs text-muted">
                        {ROLE_LABELS[m.role_type] || m.role_type}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
