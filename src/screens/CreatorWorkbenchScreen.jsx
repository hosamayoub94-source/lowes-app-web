// =============================================================
// CreatorWorkbenchScreen — «مراجعة وتواصل المبدعين»
// Thin wrapper: identity + permissions + local store. All logic lives in services/creatorReview.js.
// No database is used (creator_* tables are not applied); data is local to the browser + JSON export.
// Permission: VIEW_CREATOR_INTELLIGENCE to open · MANAGE_CREATOR_RESEARCH to review · MANAGE_CREATOR_CAMPAIGNS to run waves/outreach.
// =============================================================
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { PERMISSIONS as P } from '@data/permissions';
import { createLocalStore } from '@services/creatorReviewStore';
import { ROUTES } from '@routes/paths';
import CreatorWorkbench from '@components/creators/CreatorWorkbench';

export default function CreatorWorkbenchScreen() {
  const { name } = useAuth();
  const { can } = usePermissions();
  const store = useMemo(() => createLocalStore(window.localStorage), []);
  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3" dir="rtl">
      <Link to={ROUTES.CREATORS} className="text-xs font-bold text-blue-600">← صناع المحتوى</Link>
      <CreatorWorkbench
        reviewer={name || 'مراجع'}
        store={store}
        canReview={can(P.MANAGE_CREATOR_RESEARCH) || can(P.MANAGE_CREATOR_DATA)}
        canOutreach={can(P.MANAGE_CREATOR_CAMPAIGNS)}
      />
    </div>
  );
}
