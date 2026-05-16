// =============================================================
// AppRoutes — single source of truth for the route tree.
// All non-auth screens are lazy-loaded so the initial JS payload
// stays small. Each chunk is named via a magic comment for
// easier inspection in the build output.
// =============================================================
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '@layouts/MainLayout';
import { AuthLayout } from '@layouts/AuthLayout';
import { LoadingScreen } from '@components/ui/Loading';
import { ProtectedRoute } from './ProtectedRoute';
import { ROUTES } from './paths';
import { ROLES } from '@data/teams';

// Login is the cold-start screen — keep it eagerly loaded.
import LoginScreen from '@screens/LoginScreen';

// Home screen is the default landing — eager load for fast first paint.
import HomeScreen from '@screens/HomeScreen';

const AttendanceScreen    = lazy(() => import(/* webpackChunkName: "attendance"     */ '@screens/AttendanceScreen'));
const TasksScreen         = lazy(() => import(/* webpackChunkName: "tasks"          */ '@modules/tasks/pages/TasksPage'));
const TeamScreen          = lazy(() => import(/* webpackChunkName: "team"           */ '@screens/TeamScreen'));
const HolidaysScreen      = lazy(() => import(/* webpackChunkName: "holidays"       */ '@screens/HolidaysScreen'));
const AccountingScreen    = lazy(() => import(/* webpackChunkName: "accounting"     */ '@screens/AccountingScreen'));
const ProfileScreen       = lazy(() => import(/* webpackChunkName: "profile"        */ '@screens/ProfileScreen'));
const NotFoundScreen      = lazy(() => import(/* webpackChunkName: "404"            */ '@screens/NotFoundScreen'));
const AdminScreen         = lazy(() => import(/* webpackChunkName: "admin"          */ '@screens/AdminScreen'));
const AdminUsersScreen    = lazy(() => import(/* webpackChunkName: "admin-users"    */ '@screens/admin/AdminUsersScreen'));
const AdminSettingsScreen = lazy(() => import(/* webpackChunkName: "admin-settings" */ '@screens/admin/AdminSettingsScreen'));
const AdminReportsScreen  = lazy(() => import(/* webpackChunkName: "admin-reports"  */ '@screens/admin/AdminReportsScreen'));
const AuditDashboard      = lazy(() => import(/* webpackChunkName: "admin-audit"    */ '@modules/audit/pages/AuditDashboard'));

const ALL_ROLES  = Object.values(ROLES);
const MANAGEMENT = [ROLES.MANAGER, ROLES.ADMIN, ROLES.SALES_MANAGER];

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* Auth */}
        <Route element={<AuthLayout />}>
          <Route path={ROUTES.LOGIN} element={<LoginScreen />} />
        </Route>

        {/* Authenticated app */}
        <Route
          element={
            <ProtectedRoute roles={ALL_ROLES}>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<HomeScreen />} />
          <Route path={ROUTES.ATTENDANCE} element={<AttendanceScreen />} />
          <Route path={ROUTES.TASKS}      element={<TasksScreen />}      />
          <Route path={ROUTES.TEAM}       element={<TeamScreen />}       />
          <Route path={ROUTES.HOLIDAYS}   element={<HolidaysScreen />}   />
          <Route path={ROUTES.PROFILE}    element={<ProfileScreen />}    />

          {/* Management-only */}
          <Route
            path={ROUTES.ACCOUNTING}
            element={
              <ProtectedRoute roles={MANAGEMENT}>
                <AccountingScreen />
              </ProtectedRoute>
            }
          />

          {/* Admin only — nested */}
          <Route
            path={ROUTES.ADMIN}
            element={
              <ProtectedRoute roles={[ROLES.ADMIN]}>
                <AdminScreen />
              </ProtectedRoute>
            }
          >
            <Route path="users"    element={<AdminUsersScreen />}    />
            <Route path="settings" element={<AdminSettingsScreen />} />
            <Route path="reports"  element={<AdminReportsScreen />}  />
            <Route path="audit"    element={<AuditDashboard />}      />
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path={ROUTES.NOT_FOUND} element={<NotFoundScreen />} />
        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
