// =============================================================
// AppRoutes — single source of truth for the route tree.
// All non-auth screens are lazy-loaded so the initial JS payload
// stays small. Each chunk is named via a magic comment for
// easier inspection in the build output.
// =============================================================
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
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
const CRMDashboard        = lazy(() => import(/* webpackChunkName: "crm"            */ '@modules/crm/pages/CRMDashboard'));
const FileManagerDashboard = lazy(() => import(/* webpackChunkName: "files"          */ '@modules/files/pages/FileManagerDashboard'));
const ExecutiveDashboard   = lazy(() => import(/* webpackChunkName: "analytics"      */ '@modules/analytics/pages/ExecutiveDashboard'));
const DailyWorkspacePage   = lazy(() => import(/* webpackChunkName: "workspace"      */ '@modules/workspace/pages/DailyWorkspacePage'));
const NotificationsScreen = lazy(() => import(/* webpackChunkName: "notifications"  */ '@screens/NotificationsScreen'));
const AdminScreen         = lazy(() => import(/* webpackChunkName: "admin"          */ '@screens/AdminScreen'));
const AdminUsersScreen    = lazy(() => import(/* webpackChunkName: "admin-users"    */ '@screens/admin/AdminUsersScreen'));
const AdminSettingsScreen = lazy(() => import(/* webpackChunkName: "admin-settings" */ '@screens/admin/AdminSettingsScreen'));
const AdminReportsScreen  = lazy(() => import(/* webpackChunkName: "admin-reports"  */ '@screens/admin/AdminReportsScreen'));
const AuditDashboard      = lazy(() => import(/* webpackChunkName: "admin-audit"    */ '@modules/audit/pages/AuditDashboard'));
const QADashboard          = lazy(() => import(/* webpackChunkName: "admin-qa"          */ '@/core/testing/dashboard/OperationalDashboard.jsx'));
const MaintenanceDashboard = lazy(() => import(/* webpackChunkName: "admin-maintenance" */ '@/core/maintenance/dashboard/MaintenanceDashboard.jsx'));
const OperationalInsights  = lazy(() => import(/* webpackChunkName: "admin-operations"  */ '@/core/operations/dashboard/OperationalInsightsDashboard.jsx'));

// Priority 1 modules
const PayrollDashboard  = lazy(() => import(/* webpackChunkName: "payroll"       */ '@modules/payroll/pages/PayrollDashboard'));
const RequestsDashboard = lazy(() => import(/* webpackChunkName: "requests"      */ '@modules/requests/pages/RequestsDashboard'));
const LedgerDashboard   = lazy(() => import(/* webpackChunkName: "ledger"        */ '@modules/accounting/pages/AccountingDashboard'));
const SalesDashboard    = lazy(() => import(/* webpackChunkName: "sales"         */ '@modules/sales/pages/SalesDashboard'));
const CampaignsScreen     = lazy(() => import(/* webpackChunkName: "campaigns"     */ '@screens/CampaignsScreen'));
const TaskReportScreen    = lazy(() => import(/* webpackChunkName: "tasks-report"  */ '@screens/TaskReportScreen'));
const PerformanceScreen        = lazy(() => import(/* webpackChunkName: "performance"   */ '@screens/PerformanceScreen'));
const InventoryScreen          = lazy(() => import(/* webpackChunkName: "inventory"     */ '@screens/InventoryScreen'));
const WarehouseScreen          = lazy(() => import(/* webpackChunkName: "warehouses"     */ '@screens/WarehouseScreen'));
const CustomersScreen          = lazy(() => import(/* webpackChunkName: "customers"      */ '@screens/CustomersScreen'));
const AttendanceReportScreen   = lazy(() => import(/* webpackChunkName: "att-report"    */ '@screens/AttendanceReportScreen'));
const ChatScreen               = lazy(() => import(/* webpackChunkName: "chat"           */ '@screens/ChatScreen'));
const AchievementsScreen       = lazy(() => import(/* webpackChunkName: "achievements"      */ '@modules/gamification/pages/AchievementsScreen'));
const AnnouncementsScreen      = lazy(() => import(/* webpackChunkName: "announcements"    */ '@screens/AnnouncementsScreen'));
const LeaveRequestsScreen      = lazy(() => import(/* webpackChunkName: "leave"            */ '@screens/LeaveRequestsScreen'));
const HRDashboard              = lazy(() => import(/* webpackChunkName: "hr"               */ '@screens/HRDashboard'));
const TrainingScreen           = lazy(() => import(/* webpackChunkName: "training"         */ '@screens/TrainingScreen'));
const AdminQuizScreen          = lazy(() => import(/* webpackChunkName: "admin-quiz"       */ '@screens/admin/AdminQuizScreen'));
const AdminFaceEnrollScreen    = lazy(() => import(/* webpackChunkName: "admin-face"       */ '@screens/admin/AdminFaceEnrollScreen'));
const ShiftScheduleScreen      = lazy(() => import(/* webpackChunkName: "schedule"         */ '@screens/ShiftScheduleScreen'));
const AdvanceRequestsScreen    = lazy(() => import(/* webpackChunkName: "advances"         */ '@screens/AdvanceRequestsScreen'));
const PerformanceReviewScreen  = lazy(() => import(/* webpackChunkName: "reviews"          */ '@screens/PerformanceReviewScreen'));
const MysteryShopperScreen     = lazy(() => import(/* webpackChunkName: "mystery-shopper"  */ '@screens/admin/MysteryShopperScreen'));
const AdminProductsScreen      = lazy(() => import(/* webpackChunkName: "admin-products"   */ '@screens/admin/AdminProductsScreen'));
const AdminLozyScreen          = lazy(() => import(/* webpackChunkName: "admin-lozy"       */ '@screens/admin/AdminLozyScreen'));
const OrdersScreen             = lazy(() => import(/* webpackChunkName: "orders"           */ '@screens/OrdersScreen'));
const ManagerBoardScreen       = lazy(() => import(/* webpackChunkName: "manager-board"    */ '@screens/ManagerBoardScreen'));
const SocialStudioScreen       = lazy(() => import(/* webpackChunkName: "social-studio"    */ '@screens/SocialStudioScreen'));
const SocialTeamScreen         = lazy(() => import(/* webpackChunkName: "social-team"      */ '@screens/SocialTeamScreen'));
const ProfitabilityScreen      = lazy(() => import(/* webpackChunkName: "profitability"    */ '@screens/ProfitabilityScreen'));
const ManagementScreen         = lazy(() => import(/* webpackChunkName: "management"         */ '@screens/ManagementScreen'));
const GuideScreen              = lazy(() => import(/* webpackChunkName: "guide"              */ '@screens/GuideScreen'));
const AdminGuidesScreen        = lazy(() => import(/* webpackChunkName: "admin-guides"       */ '@screens/admin/AdminGuidesScreen'));

const ALL_ROLES     = Object.values(ROLES);
const MANAGEMENT    = [ROLES.MANAGER, ROLES.ADMIN, ROLES.SALES_MANAGER];
const FINANCE_ROLES = [ROLES.ADMIN, ROLES.MANAGER];
const SALES_ROLES   = [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER, ROLES.MEDIA_BUYER];

// /orders → يحوّل لماكنة سوق المستخدم (سوريا/تركيا) مع الحفاظ على state (إعادة الطلب).
function OrdersRedirect() {
  const { order_market, team } = useAuth();
  const location = useLocation();
  const m = order_market ?? (team && String(team).includes('سوريا') ? 'syria' : 'turkey');
  return <Navigate to={m === 'syria' ? ROUTES.ORDERS_SYRIA : ROUTES.ORDERS_TURKEY} replace state={location.state} />;
}

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
          <Route path={ROUTES.CRM}        element={<CRMDashboard />}        />
          <Route path={ROUTES.FILES}      element={<FileManagerDashboard />} />
          <Route path={ROUTES.ANALYTICS}  element={<ExecutiveDashboard />}   />
          <Route path={ROUTES.WORKSPACE}  element={<DailyWorkspacePage />}   />
          <Route path={ROUTES.TEAM}       element={<TeamScreen />}           />
          <Route path={ROUTES.HOLIDAYS}   element={<HolidaysScreen />}   />
          <Route path={ROUTES.NOTIFICATIONS} element={<NotificationsScreen />} />
          <Route path={ROUTES.CHAT}         element={<ChatScreen />}         />
          <Route path={ROUTES.ACHIEVEMENTS}   element={<AchievementsScreen />}   />
          <Route path={ROUTES.ANNOUNCEMENTS} element={<AnnouncementsScreen />} />
          <Route path={ROUTES.PROFILE}    element={<ProfileScreen />}    />
          <Route path={ROUTES.GUIDE}      element={<GuideScreen />}      />
          <Route
            path={ROUTES.ADMIN_GUIDES}
            element={
              <ProtectedRoute roles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <AdminGuidesScreen />
              </ProtectedRoute>
            }
          />

          {/* Management-only */}
          <Route
            path={ROUTES.ACCOUNTING}
            element={
              <ProtectedRoute roles={MANAGEMENT}>
                <AccountingScreen />
              </ProtectedRoute>
            }
          />

          {/* Priority 1 modules */}
          <Route
            path={ROUTES.PAYROLL}
            element={
              <ProtectedRoute roles={FINANCE_ROLES}>
                <PayrollDashboard />
              </ProtectedRoute>
            }
          />
          <Route path={ROUTES.REQUESTS} element={<RequestsDashboard />} />
          <Route
            path={ROUTES.LEDGER}
            element={
              <ProtectedRoute roles={FINANCE_ROLES}>
                <LedgerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.SALES}
            element={
              <ProtectedRoute roles={SALES_ROLES}>
                <SalesDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.MANAGER_BOARD}
            element={
              <ProtectedRoute roles={MANAGEMENT}>
                <ManagerBoardScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.WAREHOUSES}
            element={
              <ProtectedRoute roles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER, ROLES.EMPLOYEE]}>
                <WarehouseScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.CUSTOMERS}
            element={
              <ProtectedRoute roles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER, ROLES.EMPLOYEE, ROLES.MEDIA_BUYER, ROLES.SOCIAL_MANAGER]}>
                <CustomersScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.SOCIAL_STUDIO}
            element={
              <ProtectedRoute roles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.SOCIAL_MANAGER, ROLES.MEDIA_BUYER]}>
                <SocialStudioScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.SOCIAL_TEAM}
            element={
              <ProtectedRoute roles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.SOCIAL_MANAGER]}>
                <SocialTeamScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.PROFITABILITY}
            element={
              <ProtectedRoute roles={MANAGEMENT}>
                <ProfitabilityScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.CAMPAIGNS}
            element={
              <ProtectedRoute roles={SALES_ROLES}>
                <CampaignsScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.TASKS_REPORT}
            element={
              <ProtectedRoute roles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER]}>
                <TaskReportScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.PERFORMANCE}
            element={
              <ProtectedRoute roles={ALL_ROLES}>
                <PerformanceScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.INVENTORY}
            element={
              <ProtectedRoute roles={[ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER]}>
                <InventoryScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.ATTENDANCE_REPORT}
            element={
              <ProtectedRoute roles={[ROLES.ADMIN, ROLES.MANAGER]}>
                <AttendanceReportScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.LEAVE}
            element={
              <ProtectedRoute roles={ALL_ROLES}>
                <LeaveRequestsScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.HR}
            element={
              <ProtectedRoute roles={FINANCE_ROLES}>
                <HRDashboard />
              </ProtectedRoute>
            }
          />
          <Route path={ROUTES.TRAINING} element={<TrainingScreen />} />
          <Route
            path={ROUTES.MANAGEMENT}
            element={
              <ProtectedRoute roles={MANAGEMENT}>
                <ManagementScreen />
              </ProtectedRoute>
            }
          />
          <Route path={ROUTES.SCHEDULE} element={<ShiftScheduleScreen />} />
          <Route path={ROUTES.ADVANCES} element={<AdvanceRequestsScreen />} />
          <Route path={ROUTES.REVIEWS}  element={<PerformanceReviewScreen />} />
          <Route path={ROUTES.ORDERS}         element={<OrdersRedirect />} />
          <Route path={ROUTES.ORDERS_SYRIA}   element={<OrdersScreen forcedMarket="syria" />} />
          <Route path={ROUTES.ORDERS_TURKEY}  element={<OrdersScreen forcedMarket="turkey" />} />
          <Route path="/mystery-shopper" element={
            <ProtectedRoute roles={MANAGEMENT}>
              <MysteryShopperScreen />
            </ProtectedRoute>
          } />

          {/* Admin only — nested */}
          <Route
            path={ROUTES.ADMIN}
            element={
              <ProtectedRoute roles={[ROLES.ADMIN]}>
                <AdminScreen />
              </ProtectedRoute>
            }
          >
            <Route path="users"       element={<AdminUsersScreen />}    />
            <Route path="settings"    element={<AdminSettingsScreen />} />
            <Route path="reports"     element={<AdminReportsScreen />}  />
            <Route path="audit"       element={<AuditDashboard />}      />
            <Route path="qa"          element={<QADashboard />}          />
            <Route path="maintenance" element={<MaintenanceDashboard />} />
            <Route path="operations"  element={<OperationalInsights />}  />
            <Route path="quiz"        element={<AdminQuizScreen />}       />
            <Route path="products"    element={<AdminProductsScreen />}   />
            <Route path="lozy"        element={<AdminLozyScreen />}        />
            <Route path="face-enroll" element={<AdminFaceEnrollScreen />}  />
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
