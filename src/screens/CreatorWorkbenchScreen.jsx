// =============================================================
// CreatorWorkbenchScreen — «مراجعة وتواصل المبدعين»
// Thin wrapper: identity + permissions + local store. All logic lives in services/creatorReview.js.
// Shared storage: table creator_workbench_items (one row per item), mirrored from the local store by creatorWorkbenchSync.
// The local store stays the instant/offline layer; JSON export/import remains as a manual backup.
// Permission: VIEW_CREATOR_INTELLIGENCE to open · MANAGE_CREATOR_RESEARCH to review · MANAGE_CREATOR_CAMPAIGNS to run waves/outreach.
// =============================================================
import { useMemo, useState, useEffect } from 'react';import { Link } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { PERMISSIONS as P } from '@data/permissions';
import { createLocalStore } from '@services/creatorReviewStore';
import { createSyncedStore, supabaseClient } from '@services/creatorWorkbenchSync';
import { supabase } from '@services/supabase';
import { ROUTES } from '@routes/paths';
import { ROLES } from '@data/teams';
import CreatorWorkbench from '@components/creators/CreatorWorkbench';

export default function CreatorWorkbenchScreen() {
  const { name, role } = useAuth();
  const { can } = usePermissions();
  const store = useMemo(() => createSyncedStore(createLocalStore(window.localStorage), supabaseClient(supabase), name || ''), [name]);
  const [employees, setEmployees] = useState([]);
  // Reviewers are login accounts: profiles.employee_name is exactly what useAuth().name returns (admins are in profiles, not in `employees`).
  useEffect(() => {
    let alive = true;
    supabase.from('profiles').select('employee_name,role_type').eq('is_active', true).order('employee_name')
      .then(({ data }) => { if (alive && data) setEmployees([...data].sort((a, b) => (b.role_type === 'admin') - (a.role_type === 'admin')).map(p => ({ name: p.employee_name }))); })
      .catch(() => { /* picker shows a notice */ });
    return () => { alive = false; };
  }, []);
  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3" dir="rtl">
      <Link to={ROUTES.CREATORS} className="text-xs font-bold text-blue-600">← صناع المحتوى</Link>
      <CreatorWorkbench
        reviewer={name || 'مراجع'}
        store={store}
        employees={employees}
        isAdmin={role === ROLES.ADMIN}
        canReview={can(P.MANAGE_CREATOR_RESEARCH) || can(P.MANAGE_CREATOR_DATA)}
        canOutreach={can(P.MANAGE_CREATOR_CAMPAIGNS)}
      />
    </div>
  );
}
