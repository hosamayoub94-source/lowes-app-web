// =============================================================
// TeamScreen — real-time directory of active employees from Supabase.
// Groups profiles by their `team` field; supports live search +
// team / role filters. Ungrouped employees appear last.
// =============================================================
import { useEffect, useState, useMemo } from 'react';
import { Hero } from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { EmptyState } from '@components/ui/EmptyState';
import { Spinner } from '@components/ui/Loading';
import { supabase } from '@services/supabase';
import { ROLE_LABELS } from '@data/teams';
import EmployeeProfileModal from '@components/ui/EmployeeProfileModal';
import ShiftScheduleScreen from '@screens/ShiftScheduleScreen';

// ── Data fetching ─────────────────────────────────────────────

/** Fetch all active profiles (flat list, grouping done client-side). */
async function fetchAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, employee_name, role_type, team, avatar_url')
    .eq('is_active', true)
    .order('employee_name');
  if (error) throw error;
  return data || [];
}

// ── Group helper ──────────────────────────────────────────────

function groupByTeam(profiles) {
  const groups = {};
  for (const p of profiles) {
    const key = p.team || '__other__';
    if (!groups[key]) {
      groups[key] = {
        key,
        name: key === '__other__' ? 'موظفون بدون فريق' : key,
        members: [],
      };
    }
    groups[key].members.push(p);
  }
  return Object.values(groups).sort((a, b) => {
    if (a.key === '__other__') return 1;
    if (b.key === '__other__') return -1;
    return a.name.localeCompare(b.name, 'ar');
  });
}

// ── Search / filter bar ───────────────────────────────────────

function FilterBar({ search, onSearch, teamFilter, onTeamFilter, roleFilter, onRoleFilter, teamOptions, roleOptions, total, filtered }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
      {/* Search */}
      <div className="relative">
        <span className="absolute inset-y-0 start-3 flex items-center pointer-events-none text-muted">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="ابحث باسم الموظف..."
          aria-label="بحث عن موظف"
          className="w-full rounded-xl border border-border bg-surface-alt ps-9 pe-3 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/40"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearch('')}
            className="absolute inset-y-0 end-3 flex items-center text-muted hover:text-text"
            aria-label="مسح البحث"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdowns row */}
      <div className="flex gap-2 flex-wrap">
        {/* Team filter */}
        <select
          value={teamFilter}
          onChange={(e) => onTeamFilter(e.target.value)}
          aria-label="تصفية حسب الفريق"
          className="flex-1 min-w-[140px] rounded-xl border border-border bg-surface-alt px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
        >
          <option value="">كل الفرق</option>
          {teamOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
          <option value="__other__">بدون فريق</option>
        </select>

        {/* Role filter */}
        <select
          value={roleFilter}
          onChange={(e) => onRoleFilter(e.target.value)}
          aria-label="تصفية حسب الدور"
          className="flex-1 min-w-[140px] rounded-xl border border-border bg-surface-alt px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
        >
          <option value="">كل الأدوار</option>
          {roleOptions.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
          ))}
        </select>

        {/* Reset */}
        {(search || teamFilter || roleFilter) && (
          <button
            type="button"
            onClick={() => { onSearch(''); onTeamFilter(''); onRoleFilter(''); }}
            className="px-3 py-2 rounded-xl border border-border bg-surface-alt text-xs text-muted hover:text-text hover:bg-teal/5 transition-colors shrink-0"
          >
            إعادة ضبط
          </button>
        )}
      </div>

      {/* Result count */}
      {(search || teamFilter || roleFilter) && (
        <p className="text-xs text-muted">
          عرض <span className="font-semibold text-teal">{filtered}</span> من أصل {total} موظف
        </p>
      )}
    </div>
  );
}

// ── Employee card ─────────────────────────────────────────────

function EmployeeRow({ member, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(member)}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-surface-alt hover:bg-teal/5 hover:border-teal/20 border border-transparent transition text-start"
    >
      <div className="w-9 h-9 rounded-full bg-teal/15 flex items-center justify-center text-teal font-bold text-sm shrink-0 overflow-hidden">
        {member.avatar_url ? (
          <img src={member.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
        ) : (
          (member.employee_name || '?').charAt(0)
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text truncate">{member.employee_name}</p>
        <p className="text-xs text-muted">{ROLE_LABELS[member.role_type] || member.role_type || '—'}</p>
      </div>
    </button>
  );
}

// ── Main screen ───────────────────────────────────────────────

export default function TeamScreen() {
  const [profiles, setProfiles]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);

  // Filter state
  const [search, setSearch]         = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [view, setView]             = useState('team'); // 'team' | 'schedule'

  useEffect(() => {
    fetchAllProfiles()
      .then(setProfiles)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Unique teams and roles for dropdowns
  const teamOptions = useMemo(() => {
    const teams = [...new Set(profiles.map((p) => p.team).filter(Boolean))];
    return teams.sort((a, b) => a.localeCompare(b, 'ar'));
  }, [profiles]);

  const roleOptions = useMemo(() => {
    const roles = [...new Set(profiles.map((p) => p.role_type).filter(Boolean))];
    return roles.sort((a, b) => (ROLE_LABELS[a] || a).localeCompare(ROLE_LABELS[b] || b, 'ar'));
  }, [profiles]);

  // Filtered profiles
  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((p) => {
      if (q && !(p.employee_name || '').toLowerCase().includes(q)) return false;
      if (teamFilter) {
        if (teamFilter === '__other__') {
          if (p.team) return false;
        } else {
          if (p.team !== teamFilter) return false;
        }
      }
      if (roleFilter && p.role_type !== roleFilter) return false;
      return true;
    });
  }, [profiles, search, teamFilter, roleFilter]);

  // Group filtered profiles
  const groups = useMemo(() => groupByTeam(filteredProfiles), [filteredProfiles]);

  const hasFilters = search || teamFilter || roleFilter;

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
        subtitle={`${profiles.length} موظف نشط في ${teamOptions.length} فريق`}
      />

      {/* Tabs: team directory / shift schedule (merged) */}
      <div className="flex gap-2">
        {[['team', '👥 الفريق'], ['schedule', '🗓️ الورديات']].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)}
            className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition ${view === k ? 'border-teal bg-teal text-white' : 'border-border text-muted hover:border-teal/40'}`}>
            {l}
          </button>
        ))}
      </div>

      {view === 'schedule' ? <ShiftScheduleScreen /> : (<>

      {/* Filters */}
      {profiles.length > 0 && (
        <FilterBar
          search={search}
          onSearch={setSearch}
          teamFilter={teamFilter}
          onTeamFilter={setTeamFilter}
          roleFilter={roleFilter}
          onRoleFilter={setRoleFilter}
          teamOptions={teamOptions}
          roleOptions={roleOptions}
          total={profiles.length}
          filtered={filteredProfiles.length}
        />
      )}

      {/* Results */}
      {filteredProfiles.length === 0 ? (
        <EmptyState
          description={
            hasFilters
              ? 'لا يوجد موظفون يطابقون معايير البحث. جرّب تغيير الفلاتر.'
              : 'لا توجد بيانات موظفين. تأكد من إضافة موظفين في لوحة الأدمن.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map((group) => (
            <Card key={group.key}>
              <CardTitle>{group.name}</CardTitle>
              <CardSubtitle>
                {group.members.length} {group.members.length === 1 ? 'عضو' : 'أعضاء'}
              </CardSubtitle>
              <div className="mt-4 space-y-2">
                {group.members.map((m) => (
                  <EmployeeRow key={m.id} member={m} onClick={setSelectedProfile} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {selectedProfile && (
        <EmployeeProfileModal
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
        />
      )}

      </>)}
    </div>
  );
}
