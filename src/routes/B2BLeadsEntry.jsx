// /b2b-leads — مدخل بند «ليدز B2B» الواحد: يحوّل لصفحة الدولة المناسبة (آخر دولة مستعملة إن كانت مسموحة).
// صلاحية كل دولة تُفحص مرة ثانية بـProtectedRoute على مسارها.
import { Navigate } from 'react-router-dom';
import { usePermissions } from '@hooks/usePermissions';
import { leadsEntryRoute, readLastCountry } from '@data/b2bLeadsNav';

export default function B2BLeadsEntry() {
  const { can } = usePermissions();
  return <Navigate to={leadsEntryRoute(can, readLastCountry())} replace />;
}
