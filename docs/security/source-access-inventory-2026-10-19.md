# Employee App — initial source access inventory

**Date:** 2026-10-19  
**Scope:** Static source inspection of selected employee-app modules on `main`.  
**Status:** Partial inventory; not yet sufficient to authorize production RLS changes.

This is a first-pass mapping of direct Supabase table calls and explicit RPC/Edge Function calls found in the files listed below. It is not a complete whole-repository call graph. Table/RPC access can also be indirect through hooks, stores, shared services, SQL functions, Edge Functions, scheduled tasks, or third-party integrations.

## Direct call-site map from selected source files

| Sensitive data / flow | Confirmed source call sites | What this establishes (and does not establish) |
|---|---|---|
| Profiles and staff identity | `src/services/authService.js`; `src/services/employeeService.js`; `src/modules/payroll/services/payrollEngine.js`; `src/screens/ProfileScreen.jsx`; `src/screens/ManagementScreen.jsx`; `src/screens/LeaveRequestsScreen.jsx`; `src/screens/HRDashboard.jsx`; `src/screens/AttendanceReportScreen.jsx`; `src/screens/OrdersScreen.jsx`; `src/screens/admin/AdminSettingsScreen.jsx` | The selected files query `profiles` for login/name selection, staff details, payroll computation, reporting, and admin settings. This does not define the minimum column-level policy yet. |
| Orders and order-linked workflows | `src/services/customerService.js`; `src/services/orderSyncService.js`; `src/screens/OrdersScreen.jsx`; `src/modules/payroll/services/payrollEngine.js`; `src/modules/payroll/services/archiveLink.js` | Direct `orders` reads/writes are spread across order operations, sync, customer history, and payroll sales. Need full operation/role mapping before narrowing RLS. |
| Accounting entries | `src/modules/accounting/services/accountingService.js`; `src/screens/OrdersScreen.jsx` | Accounting service directly reads/writes `accounting_entries`; order processing also references entries. Do not apply a generic “authenticated users cannot access” policy without an operation-level dependency review. |
| Payroll runs and entries | `src/modules/payroll/services/payrollService.js`; `src/modules/payroll/services/payrollEngine.js` | Payroll UI/service paths access `payroll_runs`, `payroll_entries`, salary settings, and rates. Sensitive operations need payroll/HR-scoped tests. |
| Salary settings and exchange rates | `src/modules/payroll/services/payrollService.js`; `src/modules/payroll/services/payrollEngine.js`; `src/screens/admin/AdminSettingsScreen.jsx` | Both payroll calculation and admin configuration use these tables. Access levels and any service-role paths remain to be mapped. |
| Leave requests | `src/screens/LeaveRequestsScreen.jsx`; `src/screens/HRDashboard.jsx`; `src/screens/ProfileScreen.jsx` | The selected UI screens query `leave_requests`. The payroll engine additionally reads approved leave data; its full query path is separate from the staff screen. |
| Attendance | `src/services/attendanceService.js`; `src/modules/attendance/services/attendanceService.js`; `src/screens/AttendanceReportScreen.jsx`; `src/screens/HRDashboard.jsx`; `src/screens/ProfileScreen.jsx`; `src/screens/admin/AdminReportsScreen.jsx` | Attendance is used by check-in, staff profile, and reporting paths. Role and team boundaries need testable policy cases. |
| Customers / public-key order history | `src/services/customerService.js` | The selected service queries `customer_notes`, `customer_stats`, and `orders`, and calls RPC `get_customer_orders_by_key`. This is not yet a complete inventory of all `customers` table consumers or the RPC's intended public exposure. |
| Order sync helper calls | `src/services/orderSyncService.js` | Calls RPC `increment_order_sync_attempts` and touches order/status history. Review EXECUTE grants and caller authentication separately from table RLS. |
| PIN sign-in / PIN change | `src/services/authService.js` | Calls `verify-pin` directly over HTTP and invokes `pin-change`. This inventory does not verify deployed code parity, secret configuration, or rate limiting. |
| Shipping integrations | `src/screens/OrdersScreen.jsx` | Invokes `create-babel-shipment`, `create-yurtici-shipment`, `import-yurtici-report`, `sync-prices`, `track-babel`, `track-karam`, `track-ptt`, and `track-yurtici`. Each function needs its own caller/authentication contract. |
| Inventory purchase/sales orders and shipments | `src/modules/inventory/services/orderService.js` | Directly accesses `purchase_orders`, `purchase_order_items`, `sales_orders`, `sales_order_items`, and `shipments`; these are adjacent high-impact workflows that need regression tests if shared role grants change. |

## Important gaps — not inferred as unused

The selected-file pass has **not yet mapped all consumers** of `customers`, `salary_deductions`, `monthly_payroll`, `invoices`, `employee_salary_settings_log`, or all SECURITY DEFINER RPCs flagged by the live Security Advisor. Their absence from this table is not evidence they are unused. The inventory must be expanded to all source files, database functions/triggers, Edge Functions, cron jobs, Google Apps Script callers, and role-based UI paths.

## What must happen before an RLS migration

1. Expand this into a whole-repository and deployed-backend operation matrix: table/RPC/function × operation × caller role × ownership/team scope.
2. Mark which endpoints genuinely require unauthenticated access (login picker, public tracking/intake, etc.) and constrain them to narrow server-side paths rather than general table grants wherever possible.
3. Build positive and negative tests for each affected workflow in the actual-schema staging clone.
4. Only then replace broad policies with operation-specific policies. Keep the separate narrow privilege-revocation candidate staged and tested; do not treat this partial source inventory or the isolated SQL fixture as production authorization sign-off.

