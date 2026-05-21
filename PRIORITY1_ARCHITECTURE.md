# Priority 1 — Technical Architecture
## Lowe's Professional — React App
### Modules: Payroll · Accounting Ledger · Requests Hub · Daily Sales Wizard

> **Convention rules (matches existing codebase):**
> - Module path: `src/modules/{module}/`
> - Sub-folders: `pages/`, `stores/`, `services/`, `hooks/`, `types/`, `components/`
> - Service pattern: `USE_MOCK` flag → mock branch → real Supabase branch (same as `crmService.js`)
> - Store pattern: Zustand with named selectors exported as `useX()` hooks
> - Mock flag: `VITE_USE_MOCK_{MODULE}=false` in `.env`
> - Supabase lazy import: `const { supabase } = await import('@services/supabase')`
> - Audit logging: insert into `activity_logs(user_id, action, entity_type, entity_id, metadata)`
> - Notifications: call `pushNotification({ recipient_id, title, body, type, link })` from notification service
> - Export: use existing `exportUtils` helpers — `toExcel(rows, columns, filename)` and `toPDF(rows, columns, title, filename)`
> - Realtime: `supabase.channel('channel-name').on('postgres_changes', ...)` pattern
> - RLS: every table has Row Level Security enabled; policies defined below per table
> - All `id` columns: `uuid DEFAULT gen_random_uuid()`
> - All timestamps: `timestamptz DEFAULT now()`

---

---

# MODULE 1 — PAYROLL

---

## 1.1 Purpose

Calculate monthly salaries per employee. Components: base salary + allowances − deductions + commission. Support three currencies (TRY, SYP, USD). Export per-employee payslip and full team payroll sheet as Excel and PDF.

---

## 1.2 Database Schema

### Table: `employee_salary_settings`

Stores the salary configuration for each employee. One row per employee. Admin sets this; never changes except on contract update.

```sql
CREATE TABLE employee_salary_settings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Base
  base_salary           numeric(12,2) NOT NULL DEFAULT 0,
  currency              text NOT NULL DEFAULT 'TRY'
                          CHECK (currency IN ('TRY','SYP','USD')),

  -- Allowances (in same currency as base)
  internet_allowance    numeric(12,2) NOT NULL DEFAULT 0,
  food_allowance        numeric(12,2) NOT NULL DEFAULT 0,

  -- Commission config
  monthly_target        numeric(12,2) NOT NULL DEFAULT 0,
  target_commission     numeric(12,2) NOT NULL DEFAULT 0,  -- paid when target is met
  sales_commission_pct  numeric(5,2)  NOT NULL DEFAULT 0,  -- % on sales above target

  -- Status
  is_active             boolean       NOT NULL DEFAULT true,
  effective_from        date          NOT NULL DEFAULT CURRENT_DATE,
  notes                 text,

  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES profiles(id),

  UNIQUE (employee_id)  -- one active config per employee
);
```

**RLS:**
- `SELECT`: admin, manager, sales_manager (own record: employee can select their own)
- `INSERT / UPDATE / DELETE`: admin only

---

### Table: `payroll_runs`

One row per month per payroll batch. Admin triggers a "run" for a given month. Locks entries once finalized.

```sql
CREATE TABLE payroll_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year     int  NOT NULL,           -- e.g. 2025
  period_month    int  NOT NULL,           -- 1–12
  team_filter     text,                    -- null = all, or team key
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','finalized','paid')),
  total_usd       numeric(14,2) DEFAULT 0,
  total_try       numeric(14,2) DEFAULT 0,
  total_syp       numeric(14,2) DEFAULT 0,
  notes           text,
  finalized_at    timestamptz,
  finalized_by    uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES profiles(id),

  UNIQUE (period_year, period_month, team_filter)
);
```

**RLS:**
- `SELECT`: admin, manager, sales_manager
- `INSERT / UPDATE`: admin only
- `DELETE`: blocked (immutable history)

---

### Table: `payroll_entries`

One row per employee per payroll run. Auto-calculated by service function, then editable before finalization.

```sql
CREATE TABLE payroll_entries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id           uuid NOT NULL REFERENCES profiles(id),

  -- Pulled from salary_settings at calculation time (snapshot)
  base_salary           numeric(12,2) NOT NULL DEFAULT 0,
  internet_allowance    numeric(12,2) NOT NULL DEFAULT 0,
  food_allowance        numeric(12,2) NOT NULL DEFAULT 0,
  monthly_target        numeric(12,2) NOT NULL DEFAULT 0,
  target_commission     numeric(12,2) NOT NULL DEFAULT 0,
  sales_commission_pct  numeric(5,2)  NOT NULL DEFAULT 0,
  currency              text NOT NULL DEFAULT 'TRY',

  -- Calculated fields
  total_sales           numeric(14,2) NOT NULL DEFAULT 0,   -- from daily_sales_reports
  commission_earned     numeric(12,2) NOT NULL DEFAULT 0,
  gross_salary          numeric(14,2) NOT NULL DEFAULT 0,

  -- Deductions
  absent_days           int           NOT NULL DEFAULT 0,
  absent_deduction      numeric(12,2) NOT NULL DEFAULT 0,
  advance_deducted      numeric(12,2) NOT NULL DEFAULT 0,  -- salary advances taken

  -- Bonuses (linked from bonus system)
  bonus_amount          numeric(12,2) NOT NULL DEFAULT 0,

  -- Net
  net_salary            numeric(14,2) NOT NULL DEFAULT 0,

  -- Override
  manual_override       boolean       NOT NULL DEFAULT false,
  override_note         text,

  -- Payment
  payment_status        text NOT NULL DEFAULT 'pending'
                          CHECK (payment_status IN ('pending','paid','hold')),
  paid_at               timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (run_id, employee_id)
);
```

**RLS:**
- `SELECT`: admin, manager (full); employee can select their own row only
- `INSERT / UPDATE`: admin only
- `DELETE`: blocked

---

### Table: `exchange_rates`

Admin sets manual exchange rates. Latest row per pair is used.

```sql
CREATE TABLE exchange_rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_cur    text NOT NULL CHECK (from_cur IN ('USD','TRY','SYP')),
  to_cur      text NOT NULL CHECK (to_cur   IN ('USD','TRY','SYP')),
  rate        numeric(14,6) NOT NULL,
  set_by      uuid REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),

  CHECK (from_cur <> to_cur)
);

-- Index for fast "latest rate" lookup
CREATE INDEX idx_exchange_rates_pair_time ON exchange_rates (from_cur, to_cur, created_at DESC);
```

**RLS:**
- `SELECT`: all roles
- `INSERT`: admin only
- `UPDATE / DELETE`: blocked (append-only)

---

## 1.3 Supabase Realtime

```
Channel: payroll-runs
  → INSERT / UPDATE on payroll_runs
  → UPDATE on payroll_entries (payment_status change)
```

Subscribed by: PayrollPage (admin). Employee only sees their own entry — no realtime needed there (pull on load).

---

## 1.4 Zustand Store Shape

```js
// src/modules/payroll/stores/payrollStore.js

{
  // Data
  runs:            [],          // PayrollRun[]
  entries:         [],          // PayrollEntry[] for currently selected run
  salarySettings:  [],          // EmployeeSalarySettings[]
  exchangeRates:   {},          // { 'TRY_USD': 0.027, 'SYP_USD': 0.00028, ... }

  // UI state
  selectedRunId:   null,
  selectedMonth:   null,        // { year: 2025, month: 5 }
  teamFilter:      null,        // null | 'social' | 'sales' | 'ops'
  search:          '',
  loading:         false,
  error:           null,

  // Actions
  setSelectedRun:  (id) => {},
  setMonth:        (year, month) => {},
  setTeamFilter:   (team) => {},
  setSearch:       (q) => {},
  setLoading:      (bool) => {},
  setError:        (err) => {},
  setRuns:         (runs) => {},
  setEntries:      (entries) => {},
  setSalarySettings: (list) => {},
  setExchangeRates:  (map) => {},
  upsertEntry:     (entry) => {},  // update single entry in place
  upsertRun:       (run) => {},
}
```

**Exported hooks:**
```js
export const usePayrollRuns         = () => usePayrollStore(s => s.runs);
export const usePayrollEntries      = () => usePayrollStore(s => s.entries);
export const useSelectedRunId       = () => usePayrollStore(s => s.selectedRunId);
export const usePayrollTeamFilter   = () => usePayrollStore(s => s.teamFilter);
export const usePayrollLoading      = () => usePayrollStore(s => s.loading);
export const useSalarySettings      = () => usePayrollStore(s => s.salarySettings);
export const useExchangeRates       = () => usePayrollStore(s => s.exchangeRates);
```

---

## 1.5 Services Architecture

### File: `src/modules/payroll/services/payrollService.js`

```
USE_MOCK flag: VITE_USE_MOCK_PAYROLL

Functions:
  fetchRuns(filters)               → PayrollRun[]
  createRun(year, month, team)     → PayrollRun
  finalizeRun(runId)               → PayrollRun
  markRunPaid(runId)               → PayrollRun

  fetchEntries(runId)              → PayrollEntry[]
  calculateEntries(runId)          → PayrollEntry[]  ← triggers computation
  updateEntry(entryId, changes)    → PayrollEntry    ← manual override
  markEntryPaid(entryId)           → PayrollEntry

  fetchSalarySettings(filters)     → EmployeeSalarySettings[]
  upsertSalarySettings(employeeId, payload) → EmployeeSalarySettings
  deleteSalarySettings(id)         → bool

  fetchExchangeRates()             → ExchangeRate[]
  setExchangeRate(from, to, rate)  → ExchangeRate

  exportPayrollExcel(runId)        → downloads .xlsx
  exportPayrollPDF(runId)          → downloads .pdf
  exportPayslipPDF(entryId)        → downloads .pdf
```

### Calculation Logic (inside `calculateEntries`):

```
For each employee with salary_settings in the run's team:
  1. Pull attendance for period_year/period_month → count absent_days
  2. Pull sum of daily_sales_reports.total_sales_usd for employee in that month
  3. commission_earned = 0
     if total_sales >= monthly_target:
       commission_earned = target_commission
       if total_sales > monthly_target:
         commission_earned += (total_sales - monthly_target) * sales_commission_pct / 100
  4. daily_rate = base_salary / 26 (working days)
     absent_deduction = absent_days * daily_rate
  5. Pull pending salary advances from accounting_ledger for this employee this month
     advance_deducted = sum of advance amounts
  6. Pull approved bonuses from bonus_entries for this employee this month
     bonus_amount = sum of bonus amounts
  7. gross_salary = base_salary + internet_allowance + food_allowance + commission_earned
  8. net_salary = gross_salary - absent_deduction - advance_deducted + bonus_amount
  9. Upsert payroll_entries row
```

---

## 1.6 Routes & Screens

```
/payroll                    → PayrollDashboard  (admin/manager: run list + summary)
/payroll/settings           → SalarySettingsPage (admin: set per-employee salary config)
/payroll/run/:runId         → PayrollRunDetailPage (entries table, calculate, finalize, export)
/payroll/my-payslip         → MyPayslipPage (employee: see own payslip for selected month)
```

**Add to `paths.js`:**
```js
PAYROLL:             '/payroll',
PAYROLL_SETTINGS:    '/payroll/settings',
PAYROLL_RUN:         '/payroll/run/:runId',
PAYROLL_MY_PAYSLIP:  '/payroll/my-payslip',
```

**Lazy imports in `AppRoutes.jsx`:**
```js
const PayrollDashboard    = lazy(() => import('@modules/payroll/pages/PayrollDashboard'));
const SalarySettingsPage  = lazy(() => import('@modules/payroll/pages/SalarySettingsPage'));
const PayrollRunDetail    = lazy(() => import('@modules/payroll/pages/PayrollRunDetailPage'));
const MyPayslipPage       = lazy(() => import('@modules/payroll/pages/MyPayslipPage'));
```

**Navigation item in `navigation.js`:**
```js
{
  id: 'payroll',
  label: 'الرواتب',
  icon: '💵',
  path: '/payroll',
  roles: [ROLES.ADMIN, ROLES.MANAGER],
}
// My Payslip — employee only (shown in profile section, not main nav)
```

---

## 1.7 Role Permissions

| Action                        | employee | manager | admin | sales_manager |
|-------------------------------|----------|---------|-------|---------------|
| View own payslip              | ✅       | ✅      | ✅    | ✅            |
| View all entries              | ❌       | ✅      | ✅    | ❌            |
| Create/finalize run           | ❌       | ❌      | ✅    | ❌            |
| Edit salary settings          | ❌       | ❌      | ✅    | ❌            |
| Mark payment as paid          | ❌       | ❌      | ✅    | ❌            |
| Set exchange rates            | ❌       | ❌      | ✅    | ❌            |
| Export Excel/PDF              | ❌       | ✅      | ✅    | ❌            |

---

## 1.8 Workflow (Step by Step)

```
1. Admin sets salary config per employee (SalarySettingsPage)
2. Admin sets exchange rates (Settings → exchange_rates table)
3. At month end, admin opens PayrollDashboard → clicks "إنشاء مسير" (Create Run)
4. Selects month + optional team filter → createRun()
5. Run is created with status='draft'
6. Admin clicks "احتساب" (Calculate) → calculateEntries() runs
   - Pulls attendance, sales, advances, bonuses
   - Upserts all payroll_entries with computed values
7. Admin reviews table — can manually override individual entries
8. Admin clicks "تأكيد نهائي" → finalizeRun() → status='finalized'
   - Locked: no more edits
9. Admin pays employees, marks each or all as paid → status='paid'
10. Admin exports Excel (full sheet) or per-employee PDF payslip
```

---

## 1.9 Audit Logging

```js
// On createRun:
logAudit('payroll_run_created', 'payroll_runs', run.id, { year, month, team })

// On finalizeRun:
logAudit('payroll_run_finalized', 'payroll_runs', run.id, { entry_count, total_net })

// On updateEntry (override):
logAudit('payroll_entry_overridden', 'payroll_entries', entry.id, { old_net, new_net, note })

// On markEntryPaid:
logAudit('payroll_entry_paid', 'payroll_entries', entry.id, { employee_id, amount })

// On upsertSalarySettings:
logAudit('salary_settings_updated', 'employee_salary_settings', id, { employee_id, changes })
```

---

## 1.10 Notification Triggers

```
→ When run finalized:
    Push to all managers: "تم تأكيد مسير رواتب {month}" + link to run

→ When entry marked paid:
    Push to employee: "تم صرف راتبك لشهر {month} — {net_salary} {currency}" + link to payslip

→ When salary settings updated for employee:
    Push to that employee: "تم تحديث إعدادات راتبك — تواصل مع الإدارة للتفاصيل"
```

---

## 1.11 Export Requirements

**Excel (full run):**
- Sheet 1: "مسير الرواتب" — one row per employee: name, team, role, base, allowances, commissions, deductions, bonuses, net, currency, payment status
- Sheet 2: "إعدادات الرواتب" — salary config snapshot
- Totals row at bottom in each currency

**PDF (full run):**
- Header: "مسير رواتب — {month_name} {year}" + company logo
- Table: same columns as Excel
- Footer: totals + admin signature line

**PDF (per-employee payslip):**
- Header: employee name, ID, period
- Breakdown: base + each allowance + commission calculation + deductions (itemized) + bonuses = net
- Stamp area for signature

---

## 1.12 Analytics Hook

```js
// Exposed via usePayrollAnalytics():
{
  totalGrossByTeam:    { social: 0, sales: 0, ops: 0 },
  totalNetCurrentRun:  0,
  avgSalaryByRole:     { employee: 0, manager: 0, ... },
  commissionRatio:     0.0,   // commissions / total gross
  unpaidCount:         0,
}
```

---

---

# MODULE 2 — INTEGRATED ACCOUNTING LEDGER

---

## 2.1 Purpose

Full general ledger for the company. Record every financial transaction: income, expense, salary disbursement, salary advance, and bonus payment. Multi-currency (TRY/SYP/USD). Filter and export. Advances get their own sub-tab with approval status.

---

## 2.2 Database Schema

### Table: `accounting_entries`

```sql
CREATE TABLE accounting_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Classification
  entry_type      text NOT NULL CHECK (entry_type IN (
                    'income', 'expense', 'salary', 'advance', 'bonus'
                  )),
  category        text NOT NULL,        -- free text: "إيجار مكتب", "راتب يناير", "سلفة", etc.
  description     text,

  -- Employee link (required for salary / advance / bonus)
  employee_id     uuid REFERENCES profiles(id),

  -- Amounts (at least one must be non-zero)
  amount_usd      numeric(14,2) NOT NULL DEFAULT 0,
  amount_try      numeric(14,2) NOT NULL DEFAULT 0,
  amount_syp      numeric(14,2) NOT NULL DEFAULT 0,

  -- Payment
  payment_method  text NOT NULL DEFAULT 'cash'
                    CHECK (payment_method IN ('cash','bank','sham_cash','transfer')),
  reference_no    text,                 -- bank ref, receipt number, etc.

  -- Entry date (user-specified, not created_at)
  entry_date      date NOT NULL DEFAULT CURRENT_DATE,

  -- For advances: approval flow
  advance_status  text CHECK (advance_status IN ('pending','approved','rejected','done')),
  -- null for non-advance entries

  notes           text,

  -- Meta
  created_by      uuid NOT NULL REFERENCES profiles(id),
  approved_by     uuid REFERENCES profiles(id),
  approved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_acct_type      ON accounting_entries (entry_type);
CREATE INDEX idx_acct_date      ON accounting_entries (entry_date DESC);
CREATE INDEX idx_acct_employee  ON accounting_entries (employee_id);
CREATE INDEX idx_acct_advance   ON accounting_entries (advance_status) WHERE entry_type = 'advance';
```

**RLS:**
- `SELECT`: admin, manager (full). Employee: only their own salary and advance rows.
- `INSERT`: admin, manager
- `UPDATE`: admin only (after creation, only admin can edit; exception: advance_status update by admin)
- `DELETE`: admin only; blocked if entry_type = 'salary' and linked payroll_entry exists

---

### Table: `accounting_categories`

Pre-seeded list of categories per type; admin can add custom ones.

```sql
CREATE TABLE accounting_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type  text NOT NULL,
  name_ar     text NOT NULL,
  name_en     text,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

**RLS:** SELECT: all. INSERT/UPDATE/DELETE: admin only.

**Seed data:**
```
income:   مبيعات أونلاين، مبيعات مباشرة، عمولات، إيرادات أخرى
expense:  إيجار، رواتب، إنترنت، مواصلات، تسويق، صيانة، مصاريف أخرى
salary:   راتب أساسي، عمولة، بدل انترنت، بدل غذاء
advance:  سلفة راتب، سلفة طارئة
bonus:    مكافأة أداء، مكافأة هدف، هدية
```

---

## 2.3 Supabase Realtime

```
Channel: accounting-live
  → INSERT / UPDATE on accounting_entries
  → Subscribed by: AccountingLedgerPage (admin/manager)
  → Filter: none (all entries stream to authorized users)
```

---

## 2.4 Zustand Store Shape

```js
// src/modules/accounting/stores/accountingStore.js

{
  // Data
  entries:       [],        // AccountingEntry[]
  categories:    {},        // { income: [], expense: [], salary: [], advance: [], bonus: [] }
  advancesPending: [],      // filtered view of entries where advance_status='pending'

  // Filters
  filters: {
    type:          null,    // null | 'income' | 'expense' | 'salary' | 'advance' | 'bonus'
    dateFrom:      null,
    dateTo:        null,
    employeeId:    null,
    paymentMethod: null,
    search:        '',
  },

  // Totals (computed from filtered entries)
  totals: {
    income_usd:  0,  income_try:  0,  income_syp:  0,
    expense_usd: 0,  expense_try: 0,  expense_syp: 0,
    net_usd:     0,  net_try:     0,  net_syp:     0,
  },

  // UI
  activeTab:   'all',   // 'all' | 'income' | 'expense' | 'salary' | 'advance' | 'bonus'
  loading:     false,
  error:       null,

  // Actions
  setFilter:     (key, val) => {},
  resetFilters:  () => {},
  setActiveTab:  (tab) => {},
  setEntries:    (list) => {},
  upsertEntry:   (entry) => {},
  removeEntry:   (id) => {},
  setCategories: (map) => {},
  setLoading:    (bool) => {},
  setError:      (err) => {},
}
```

---

## 2.5 Services Architecture

### File: `src/modules/accounting/services/accountingService.js`

```
USE_MOCK flag: VITE_USE_MOCK_ACCOUNTING

Functions:
  fetchEntries(filters)              → AccountingEntry[]
  createEntry(payload)               → AccountingEntry
  updateEntry(id, changes)           → AccountingEntry
  deleteEntry(id)                    → bool

  approveAdvance(entryId, adminId)   → AccountingEntry
  rejectAdvance(entryId, reason)     → AccountingEntry
  markAdvanceDone(entryId)           → AccountingEntry

  fetchCategories()                  → { [type]: Category[] }
  createCategory(payload)            → Category

  fetchTotals(filters)               → TotalsObject

  exportLedgerExcel(filters)         → downloads .xlsx
  exportLedgerPDF(filters)           → downloads .pdf
```

---

## 2.6 Routes & Screens

```
/accounting                → AccountingLedgerPage  (main ledger — admin/manager)
/accounting/advances       → AdvancesPage          (advance requests sub-view)
/accounting/new            → NewEntryPage          (create entry form)
```

> **Note:** `AccountingScreen` already exists at `/accounting`. Replace/extend it — do NOT create a parallel route. Read the existing screen first and merge the new ledger into it.

**Navigation item (already exists, extend):**
```js
// Existing nav item id='accounting' maps to /accounting — keep as-is
// Add sub-navigation inside AccountingLedgerPage for tabs
```

---

## 2.7 Role Permissions

| Action                    | employee | manager | admin | sales_manager |
|---------------------------|----------|---------|-------|---------------|
| View own salary/advance   | ✅       | ✅      | ✅    | ✅            |
| View full ledger          | ❌       | ✅      | ✅    | ❌            |
| Create income/expense     | ❌       | ✅      | ✅    | ❌            |
| Create salary entry       | ❌       | ❌      | ✅    | ❌            |
| Create/approve advance    | ❌       | ❌      | ✅    | ❌            |
| Delete entry              | ❌       | ❌      | ✅    | ❌            |
| Export                    | ❌       | ✅      | ✅    | ❌            |

---

## 2.8 Workflow

**General Entry:**
```
Admin/Manager → New Entry → select type → fill fields → save
Realtime: entry appears instantly for all open instances
```

**Salary Advance Flow:**
```
1. Employee submits advance request (via Requests Hub — see Module 3)
   OR Admin creates directly: type='advance', advance_status='pending'
2. Admin sees pending advances in Advances tab
3. Admin approves: advance_status → 'approved'
   → Notification to employee: "تمت الموافقة على سلفتك"
4. When cash is physically handed: advance_status → 'done'
5. Payroll module picks up this advance and deducts from net salary automatically
```

---

## 2.9 Audit Logging

```js
logAudit('accounting_entry_created', 'accounting_entries', id, { type, amount_usd, amount_try, amount_syp })
logAudit('accounting_entry_updated', 'accounting_entries', id, { changes })
logAudit('accounting_entry_deleted', 'accounting_entries', id, { type, entry_date })
logAudit('advance_approved',  'accounting_entries', id, { employee_id })
logAudit('advance_rejected',  'accounting_entries', id, { employee_id, reason })
logAudit('advance_done',      'accounting_entries', id, { employee_id })
```

---

## 2.10 Notification Triggers

```
→ Advance approved:  Push to employee: "تمت الموافقة على سلفتك بقيمة {amount} {currency}"
→ Advance rejected:  Push to employee: "تم رفض طلب السلفة — {reason}"
→ Advance done:      Push to employee: "تم صرف سلفتك"
```

---

## 2.11 Export Requirements

**Excel:**
- Columns: التاريخ، النوع، التصنيف، الوصف، الموظف، USD، TRY، SYP، طريقة الدفع، المرجع، الحالة
- Bottom row: totals per currency
- Color-coded rows: income=green, expense=red, salary=blue, advance=orange, bonus=purple

**PDF:**
- Title: "كشف حسابات — {period}" + company logo
- Filtered table with the same columns
- Summary box: إجمالي الإيرادات / إجمالي المصاريف / الصافي per currency

---

## 2.12 Analytics Hook

```js
// useAccountingAnalytics():
{
  monthlyNetUSD:    [],   // last 12 months [{ month, net }]
  expenseByCategory: [], // [{ category, total_usd }]
  incomeByCategory:  [],
  advancePendingCount: 0,
  cashFlowSummary: { income_usd, expense_usd, net_usd },
}
```

---

---

# MODULE 3 — ADMIN REQUESTS HUB

---

## 3.1 Purpose

Unified inbox for all employee requests: leave/vacation requests, salary advance requests, and permission (early leave) requests. Admin/manager approves or rejects. Full stats dashboard. Realtime updates.

---

## 3.2 Database Schema

### Table: `employee_requests`

```sql
CREATE TABLE employee_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who & what
  employee_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  request_type     text NOT NULL CHECK (request_type IN (
                     'leave', 'advance', 'permission', 'other'
                   )),

  -- Leave-specific
  leave_type       text CHECK (leave_type IN ('annual','sick','emergency','unpaid')),
  leave_from       date,
  leave_to         date,
  leave_days       int GENERATED ALWAYS AS (
                     CASE WHEN leave_to IS NOT NULL AND leave_from IS NOT NULL
                     THEN (leave_to - leave_from + 1) ELSE NULL END
                   ) STORED,

  -- Advance-specific
  advance_amount   numeric(12,2),
  advance_currency text CHECK (advance_currency IN ('TRY','SYP','USD')),
  repay_month      int,    -- which month to deduct (1–12)
  repay_year       int,

  -- Permission-specific
  permission_date  date,
  permission_hours numeric(4,2),  -- e.g. 2.5 hours

  -- Common
  reason           text NOT NULL,
  attachments      text[],           -- array of Supabase Storage URLs

  -- Status
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected','cancelled')),

  -- Decision
  decided_by       uuid REFERENCES profiles(id),
  decided_at       timestamptz,
  decision_note    text,

  -- Meta
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_req_employee   ON employee_requests (employee_id);
CREATE INDEX idx_req_status     ON employee_requests (status);
CREATE INDEX idx_req_type       ON employee_requests (request_type);
CREATE INDEX idx_req_created    ON employee_requests (created_at DESC);
```

**RLS:**
- `SELECT`: employee sees own rows only. Admin/manager/social_manager/sales_manager see all.
- `INSERT`: all roles (self-submit)
- `UPDATE (status, decided_by, decided_at, decision_note)`: admin, manager only
- `UPDATE (cancelled)`: employee can cancel their own pending requests
- `DELETE`: blocked

---

### Table: `leave_balances`

Track remaining leave days per employee per year.

```sql
CREATE TABLE leave_balances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year            int  NOT NULL,
  total_days      int  NOT NULL DEFAULT 15,
  used_days       int  NOT NULL DEFAULT 0,
  remaining_days  int GENERATED ALWAYS AS (total_days - used_days) STORED,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (employee_id, year)
);
```

**RLS:**
- `SELECT`: employee sees own. Admin/manager see all.
- `INSERT / UPDATE`: admin only (or via trigger on request approval)

---

### Trigger: Auto-update leave balance on approval

```sql
-- When a leave request is approved, deduct from leave_balances.
-- Implemented as Supabase database function + trigger:

CREATE OR REPLACE FUNCTION fn_deduct_leave_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending'
     AND NEW.request_type = 'leave' AND NEW.leave_type = 'annual' THEN
    INSERT INTO leave_balances (employee_id, year, used_days)
    VALUES (NEW.employee_id, EXTRACT(YEAR FROM NEW.leave_from)::int, COALESCE(NEW.leave_days, 0))
    ON CONFLICT (employee_id, year)
    DO UPDATE SET used_days = leave_balances.used_days + COALESCE(NEW.leave_days, 0),
                  updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_leave_balance
AFTER UPDATE ON employee_requests
FOR EACH ROW EXECUTE FUNCTION fn_deduct_leave_on_approval();
```

---

### Trigger: Auto-create accounting advance entry on advance approval

```sql
CREATE OR REPLACE FUNCTION fn_create_advance_entry_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending'
     AND NEW.request_type = 'advance' THEN
    INSERT INTO accounting_entries (
      entry_type, category, description,
      employee_id,
      amount_usd, amount_try, amount_syp,
      payment_method, entry_date,
      advance_status,
      created_by
    ) VALUES (
      'advance',
      'سلفة راتب',
      NEW.reason,
      NEW.employee_id,
      CASE WHEN NEW.advance_currency = 'USD' THEN NEW.advance_amount ELSE 0 END,
      CASE WHEN NEW.advance_currency = 'TRY' THEN NEW.advance_amount ELSE 0 END,
      CASE WHEN NEW.advance_currency = 'SYP' THEN NEW.advance_amount ELSE 0 END,
      'cash',
      CURRENT_DATE,
      'approved',
      NEW.decided_by
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_advance_accounting
AFTER UPDATE ON employee_requests
FOR EACH ROW EXECUTE FUNCTION fn_create_advance_entry_on_approval();
```

---

## 3.3 Supabase Realtime

```
Channel: requests-hub
  → INSERT on employee_requests         (new request submitted → admin notified)
  → UPDATE on employee_requests.status  (decision → employee notified)
  → Subscribed by: RequestsHubPage (admin), MyRequestsPage (employee)
```

---

## 3.4 Zustand Store Shape

```js
// src/modules/requests/stores/requestsStore.js

{
  // Admin view
  allRequests:     [],    // EmployeeRequest[] — full list
  pendingCount:    0,
  approvedCount:   0,
  rejectedCount:   0,

  // Employee view
  myRequests:      [],

  // Filters
  filters: {
    type:       null,     // null | 'leave' | 'advance' | 'permission' | 'other'
    status:     null,     // null | 'pending' | 'approved' | 'rejected' | 'cancelled'
    employeeId: null,
    dateFrom:   null,
    dateTo:     null,
  },

  // Wizard state (for employee submitting new request)
  wizard: {
    open:         false,
    step:         1,
    type:         null,
    formData:     {},
    submitting:   false,
    error:        null,
  },

  // UI
  loading:     false,
  error:       null,

  // Actions
  setFilter:       (key, val) => {},
  resetFilters:    () => {},
  setAllRequests:  (list) => {},
  setMyRequests:   (list) => {},
  upsertRequest:   (req) => {},   // update in place (realtime)
  openWizard:      (type) => {},
  closeWizard:     () => {},
  setWizardStep:   (n) => {},
  setWizardData:   (data) => {},
  setLoading:      (bool) => {},
  setError:        (err) => {},
}
```

---

## 3.5 Services Architecture

### File: `src/modules/requests/services/requestsService.js`

```
USE_MOCK flag: VITE_USE_MOCK_REQUESTS

Functions:
  fetchAllRequests(filters)          → EmployeeRequest[]   (admin/manager)
  fetchMyRequests(employeeId)        → EmployeeRequest[]   (employee)
  submitRequest(payload)             → EmployeeRequest
  cancelRequest(requestId)           → EmployeeRequest
  approveRequest(requestId, adminId, note) → EmployeeRequest
  rejectRequest(requestId, adminId, note)  → EmployeeRequest

  fetchLeaveBalance(employeeId, year) → LeaveBalance
  updateLeaveBalance(employeeId, year, changes) → LeaveBalance

  fetchRequestStats()                → { pending, approved, rejected, by_type }
```

---

## 3.6 Routes & Screens

```
/requests                  → RequestsHubPage     (admin/manager: full inbox)
/requests/my               → MyRequestsPage      (all roles: own requests)
/requests/new              → (modal/drawer, not standalone route)
/requests/leave-balances   → LeaveBalancesPage   (admin: manage leave days)
```

**Add to `paths.js`:**
```js
REQUESTS:           '/requests',
MY_REQUESTS:        '/requests/my',
LEAVE_BALANCES:     '/requests/leave-balances',
```

**Navigation:**
```js
// Admin/manager nav:
{ id: 'requests', label: 'الطلبات', icon: '📨', path: '/requests',
  roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER, ROLES.SOCIAL_MANAGER] }

// All employees — add to existing nav (employee):
{ id: 'my-requests', label: 'طلباتي', icon: '📝', path: '/requests/my',
  roles: [ROLES.EMPLOYEE, ROLES.MEDIA_BUYER] }
```

> Note: manager/admin also see `/requests/my` to view their own personal requests.

---

## 3.7 Role Permissions

| Action                     | employee | manager | admin | sales_mgr | social_mgr |
|----------------------------|----------|---------|-------|-----------|------------|
| Submit own request         | ✅       | ✅      | ✅    | ✅        | ✅         |
| Cancel own pending request | ✅       | ✅      | ✅    | ✅        | ✅         |
| View own requests          | ✅       | ✅      | ✅    | ✅        | ✅         |
| View ALL requests          | ❌       | ✅      | ✅    | ✅        | ✅         |
| Approve / reject           | ❌       | ✅      | ✅    | ❌        | ❌         |
| Edit leave balances        | ❌       | ❌      | ✅    | ❌        | ❌         |
| Export                     | ❌       | ✅      | ✅    | ❌        | ❌         |

---

## 3.8 Workflow

**Employee submits leave request:**
```
1. Employee clicks "طلب جديد" → RequestWizard opens
2. Selects type: إجازة / سلفة / إذن
3. Fills type-specific fields (dates, amount, reason)
4. Submits → status='pending'
5. Realtime push to admin: "طلب إجازة جديد من {name}"
6. Admin opens RequestsHubPage → sees pending badge
7. Admin reviews → Approve or Reject with optional note
8. Status updates → realtime → employee sees new status on MyRequestsPage
9. Push notification to employee with decision
```

**Advance request special path:**
```
After approval → DB trigger auto-creates accounting_entries row
After payroll run → advance_deducted picked up automatically from accounting table
```

**Leave balance enforcement:**
```
Before approval, service checks: remaining_days >= leave_days
If insufficient: admin sees warning (can still override and approve)
After approval: DB trigger deducts days from leave_balances
```

---

## 3.9 Audit Logging

```js
logAudit('request_submitted',  'employee_requests', id, { type, employee_id })
logAudit('request_approved',   'employee_requests', id, { type, employee_id, decided_by })
logAudit('request_rejected',   'employee_requests', id, { type, employee_id, reason })
logAudit('request_cancelled',  'employee_requests', id, { type, employee_id })
logAudit('leave_balance_updated', 'leave_balances', id, { employee_id, old_remaining, new_remaining })
```

---

## 3.10 Notification Triggers

```
→ New request submitted:
    Push to admin + manager: "طلب {type} جديد من {employee_name}" + link to /requests

→ Request approved:
    Push to employee: "تمت الموافقة على طلبك ({type})" + link to /requests/my

→ Request rejected:
    Push to employee: "تم رفض طلبك ({type}) — {decision_note}" + link to /requests/my

→ Leave balance low (< 3 days remaining):
    Push to employee: "تنبيه: رصيد إجازاتك المتبقي {remaining} يوم فقط"
```

---

## 3.11 Export Requirements

**Excel:**
- All requests with filters applied
- Columns: الاسم، الفريق، النوع، التفاصيل، السبب، تاريخ التقديم، الحالة، القرار، ملاحظة القرار

**PDF:**
- Title: "تقرير الطلبات — {period}"
- Stats summary box at top: إجمالي / معلق / موافق / مرفوض
- Filtered table

---

## 3.12 Analytics Hook

```js
// useRequestsAnalytics():
{
  pendingByType:     { leave: 0, advance: 0, permission: 0 },
  approvalRate:      0.0,     // approved / (approved + rejected)
  avgDecisionTimeHours: 0,
  topRequestType:    'leave',
  leaveBalanceSummary: [{ employee_id, name, remaining_days }],
}
```

---

---

# MODULE 4 — DAILY SALES REPORT WIZARD

---

## 4.1 Purpose

Sales employees (employee, media_buyer) submit their daily sales report through a 6-step wizard. Each report captures: which channel they worked, inbox message count, which campaigns were active, results per ad (orders + amounts in TRY/SYP/USD), and other revenue sources. This feeds directly into the payroll commission calculation and the sales analytics dashboard.

---

## 4.2 Database Schema

### Table: `sales_channels`

Admin-managed list of pages (Facebook/Instagram) and WhatsApp numbers.

```sql
CREATE TABLE sales_channels (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  channel_type  text NOT NULL CHECK (channel_type IN ('page','whatsapp','other')),
  platform      text CHECK (platform IN ('facebook','instagram','tiktok','whatsapp','other')),
  team          text REFERENCES -- team key (social/sales/ops)
                  -- stored as text matching TEAM_KEYS
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES profiles(id)
);
```

**RLS:** SELECT: all. INSERT/UPDATE/DELETE: admin, media_buyer.

---

### Table: `campaigns`

```sql
CREATE TABLE campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  team          text NOT NULL,       -- team key
  channel_id    uuid REFERENCES sales_channels(id),
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','paused','ended')),
  start_date    date,
  end_date      date,
  budget        numeric(14,2),
  budget_currency text DEFAULT 'USD',
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES profiles(id),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

**RLS:** SELECT: all. INSERT/UPDATE: admin, media_buyer, sales_manager. DELETE: admin only.

---

### Table: `campaign_ads`

Individual ads within a campaign.

```sql
CREATE TABLE campaign_ads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name         text NOT NULL,
  image_url    text,          -- Supabase Storage URL
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES profiles(id)
);
```

**RLS:** SELECT: all. INSERT/UPDATE/DELETE: admin, media_buyer.

---

### Table: `daily_sales_reports`

One row per employee per day. Wizard creates/updates this row.

```sql
CREATE TABLE daily_sales_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  report_date      date NOT NULL DEFAULT CURRENT_DATE,
  channel_id       uuid REFERENCES sales_channels(id),
  channel_type     text CHECK (channel_type IN ('page','whatsapp','other')),

  -- Step 2: inbox
  inbox_count      int NOT NULL DEFAULT 0,

  -- Step 5: other sources
  returning_orders int NOT NULL DEFAULT 0,
  other_orders     int NOT NULL DEFAULT 0,
  other_amount_usd numeric(12,2) NOT NULL DEFAULT 0,
  other_amount_try numeric(12,2) NOT NULL DEFAULT 0,
  other_amount_syp numeric(12,2) NOT NULL DEFAULT 0,
  other_source_note text,

  -- Totals (computed by service after saving ad results)
  total_orders     int NOT NULL DEFAULT 0,
  total_sales_usd  numeric(14,2) NOT NULL DEFAULT 0,
  total_sales_try  numeric(14,2) NOT NULL DEFAULT 0,
  total_sales_syp  numeric(14,2) NOT NULL DEFAULT 0,

  -- Status
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','submitted','confirmed')),
  submitted_at     timestamptz,
  confirmed_by     uuid REFERENCES profiles(id),
  confirmed_at     timestamptz,

  -- Wizard progress (so employee can resume)
  wizard_step      int NOT NULL DEFAULT 1,
  wizard_data      jsonb,   -- temporary step data before final submit

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (employee_id, report_date)
);

CREATE INDEX idx_dsr_employee ON daily_sales_reports (employee_id);
CREATE INDEX idx_dsr_date     ON daily_sales_reports (report_date DESC);
CREATE INDEX idx_dsr_status   ON daily_sales_reports (status);
```

**RLS:**
- `SELECT`: employee sees own. Admin/manager/sales_manager see all. Media_buyer sees own.
- `INSERT`: employee, media_buyer (own only)
- `UPDATE`: employee/media_buyer (own, status=draft only). Admin can update status to 'confirmed'.
- `DELETE`: blocked

---

### Table: `daily_sales_ad_results`

Per-ad breakdown within a daily report.

```sql
CREATE TABLE daily_sales_ad_results (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id        uuid NOT NULL REFERENCES daily_sales_reports(id) ON DELETE CASCADE,
  campaign_id      uuid NOT NULL REFERENCES campaigns(id),
  ad_id            uuid REFERENCES campaign_ads(id),

  order_count      int          NOT NULL DEFAULT 0,
  amount_usd       numeric(12,2) NOT NULL DEFAULT 0,
  amount_try       numeric(12,2) NOT NULL DEFAULT 0,
  amount_syp       numeric(12,2) NOT NULL DEFAULT 0,

  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dsar_report   ON daily_sales_ad_results (report_id);
CREATE INDEX idx_dsar_campaign ON daily_sales_ad_results (campaign_id);
CREATE INDEX idx_dsar_ad       ON daily_sales_ad_results (ad_id);
```

**RLS:**
- `SELECT`: employee sees own reports' results. Admin/manager/sales_manager see all.
- `INSERT / UPDATE / DELETE`: employee/media_buyer on own report only (while draft).

---

### Table: `daily_report_campaigns`

Junction: which campaigns were selected in step 3 of the wizard for a given report.

```sql
CREATE TABLE daily_report_campaigns (
  report_id   uuid NOT NULL REFERENCES daily_sales_reports(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  PRIMARY KEY (report_id, campaign_id)
);
```

**RLS:** same as daily_sales_reports.

---

## 4.3 Supabase Realtime

```
Channel: sales-reports
  → INSERT / UPDATE on daily_sales_reports
  → Filter: subscribed by sales_manager/admin (all), employee (own reports only)

Channel: campaigns-live
  → INSERT / UPDATE on campaigns
  → Subscribed by: all (employees need fresh campaign list in wizard)
```

---

## 4.4 Zustand Store Shape

```js
// src/modules/sales/stores/salesStore.js

{
  // Wizard state
  wizard: {
    open:       false,
    reportId:   null,      // null = new, uuid = resume draft
    step:       1,         // 1–6
    steps: {
      step1: { channelId: null, channelType: null },
      step2: { inboxCount: 0 },
      step3: { selectedCampaignIds: [] },
      step4: { adResults: {} },  // { [ad_id]: { order_count, amount_usd, amount_try, amount_syp } }
      step5: { returningOrders: 0, otherOrders: 0, otherAmounts: {}, otherNote: '' },
      step6: { preview: null },  // computed summary
    },
    submitting: false,
    error:      null,
  },

  // Data
  todayReport:     null,       // employee's own today report
  myReports:       [],         // employee's report history
  allReports:      [],         // admin/manager view
  channels:        [],         // SalesChannel[]
  campaigns:       [],         // Campaign[]
  ads:             {},         // { [campaign_id]: CampaignAd[] }

  // Filters (admin view)
  filters: {
    employeeId: null,
    dateFrom:   null,
    dateTo:     null,
    channelId:  null,
    status:     null,
  },

  // UI
  loading:     false,
  error:       null,

  // Actions
  openWizard:       (reportId) => {},
  closeWizard:      () => {},
  setWizardStep:    (n) => {},
  setStepData:      (step, data) => {},
  setChannels:      (list) => {},
  setCampaigns:     (list) => {},
  setAds:           (campaignId, list) => {},
  setTodayReport:   (report) => {},
  setMyReports:     (list) => {},
  setAllReports:    (list) => {},
  upsertReport:     (report) => {},
  setFilter:        (key, val) => {},
  setLoading:       (bool) => {},
  setError:         (err) => {},
}
```

---

## 4.5 Services Architecture

### File: `src/modules/sales/services/salesReportService.js`

```
USE_MOCK flag: VITE_USE_MOCK_SALES

Functions:
  fetchChannels(filters)               → SalesChannel[]
  createChannel(payload)               → SalesChannel
  updateChannel(id, changes)           → SalesChannel

  fetchCampaigns(filters)              → Campaign[]
  createCampaign(payload)              → Campaign
  updateCampaign(id, changes)          → Campaign

  fetchAds(campaignId)                 → CampaignAd[]
  createAd(payload)                    → CampaignAd
  updateAd(id, changes)                → CampaignAd

  fetchTodayReport(employeeId)         → DailySalesReport | null
  fetchMyReports(employeeId, filters)  → DailySalesReport[]
  fetchAllReports(filters)             → DailySalesReport[]

  saveDraftReport(employeeId, wizardData) → DailySalesReport  (upsert draft)
  submitReport(reportId)               → DailySalesReport    (status → submitted)
  confirmReport(reportId, adminId)     → DailySalesReport    (status → confirmed)

  saveAdResults(reportId, adResults[]) → DailySalesAdResult[]
  recalculateTotals(reportId)          → DailySalesReport    (recomputes total_orders + amounts)

  exportReportsExcel(filters)          → downloads .xlsx
  exportReportsPDF(filters)            → downloads .pdf
```

### `recalculateTotals` logic:

```
totals = SUM all daily_sales_ad_results WHERE report_id
       + other_orders + returning_orders
       + other_amounts
→ UPDATE daily_sales_reports SET total_orders, total_sales_usd, total_sales_try, total_sales_syp
```

---

## 4.6 Routes & Screens

```
/sales                     → SalesDashboardPage     (admin/manager/sales_manager: all reports view)
/sales/my                  → MySalesPage             (employee/media_buyer: own history + wizard trigger)
/sales/wizard              → (opens as full-screen modal overlay, not standalone route)
/sales/channels            → ChannelsPage            (admin/media_buyer: manage channels)
/sales/campaigns           → CampaignsPage           (admin/media_buyer: manage campaigns + ads)
/sales/report/:reportId    → ReportDetailPage        (admin: view + confirm individual report)
```

**Add to `paths.js`:**
```js
SALES:                '/sales',
MY_SALES:             '/sales/my',
SALES_CHANNELS:       '/sales/channels',
SALES_CAMPAIGNS:      '/sales/campaigns',
SALES_REPORT_DETAIL:  '/sales/report/:reportId',
```

**Navigation:**
```js
// Admin/Manager/Sales Manager:
{ id: 'sales', label: 'المبيعات', icon: '📈', path: '/sales',
  roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER] }

// Employee/Media Buyer — show "My Sales" shortcut:
{ id: 'my-sales', label: 'مبيعاتي', icon: '📈', path: '/sales/my',
  roles: [ROLES.EMPLOYEE, ROLES.MEDIA_BUYER] }
```

---

## 4.7 Role Permissions

| Action                      | employee | media_buyer | manager | admin | sales_mgr |
|-----------------------------|----------|-------------|---------|-------|-----------|
| Submit own daily report     | ✅       | ✅          | ❌      | ❌    | ❌        |
| View own reports            | ✅       | ✅          | ✅      | ✅    | ✅        |
| View ALL reports            | ❌       | ❌          | ✅      | ✅    | ✅        |
| Confirm reports             | ❌       | ❌          | ✅      | ✅    | ✅        |
| Manage channels             | ❌       | ✅          | ❌      | ✅    | ❌        |
| Manage campaigns & ads      | ❌       | ✅          | ❌      | ✅    | ✅        |
| Export                      | ❌       | ❌          | ✅      | ✅    | ✅        |

---

## 4.8 Wizard Workflow (6 Steps)

```
STEP 1 — Select Channel
  - Show active sales_channels list
  - Employee picks the channel/page they worked today
  - Set channelId + channelType in store.wizard.steps.step1
  - Guard: if today's report exists as 'submitted' → block resubmit, show read-only view

STEP 2 — Inbox Count
  - Number input: "كم رسالة وصلت في الصندوق؟"
  - Store inboxCount in step2

STEP 3 — Select Active Campaigns
  - Show campaigns filtered by channel or team
  - Multi-select checkboxes
  - Store selectedCampaignIds in step3

STEP 4 — Results Per Ad
  - For each selected campaign: expand to show its ads
  - Per ad: order_count, amount_try, amount_syp, amount_usd inputs
  - Store in step4.adResults[ad_id] = { order_count, amount_try, ... }

STEP 5 — Other Sources
  - Returning customers orders (int)
  - Other orders (int) + amounts (TRY/SYP/USD)
  - Free text note
  - Store in step5

STEP 6 — Summary & Submit
  - Show computed totals:
    Total Orders = step4 orders + step5 returning + step5 other
    Total TRY = sum of all TRY amounts
    Total SYP = sum of all SYP amounts
    Total USD = sum of all USD amounts
  - "حفظ وإرسال" button
  - On submit: saveDraftReport() → saveAdResults() → recalculateTotals() → submitReport()
  - Confetti animation on successful submission

RESUME DRAFT:
  - On wizard open, fetchTodayReport() first
  - If draft exists: restore wizard_data → jump to wizard_step
  - Auto-save draft on each step advance (saveDraftReport with wizard_data = current steps snapshot)
```

---

## 4.9 Audit Logging

```js
logAudit('sales_report_submitted', 'daily_sales_reports', id,
  { employee_id, date: report_date, total_orders, total_sales_usd })

logAudit('sales_report_confirmed', 'daily_sales_reports', id,
  { employee_id, confirmed_by, total_sales_usd })

logAudit('campaign_created', 'campaigns', id, { name, team, channel_id })
logAudit('campaign_updated', 'campaigns', id, { changes })
logAudit('channel_created',  'sales_channels', id, { name, type })
```

---

## 4.10 Notification Triggers

```
→ Report submitted by employee:
    Push to sales_manager/admin: "{employee_name} أرسل تقرير مبيعات اليوم" + link to /sales/report/:id

→ Report confirmed by admin:
    Push to employee: "تم تأكيد تقرير مبيعاتك بتاريخ {date}" + link to /sales/my

→ No report submitted by end of working day (e.g., 18:00):
    Scheduled check → push to employee: "تذكير: لم تقدم تقرير مبيعات اليوم"
    (Implemented via a Supabase cron job or Edge Function, not client-side)
```

---

## 4.11 Export Requirements

**Excel (reports list):**
- Sheet 1: "تقارير المبيعات" — date, employee, team, channel, inbox count, total orders, total TRY, total SYP, total USD, status
- Sheet 2: "تفاصيل الإعلانات" — report_date, employee, campaign, ad, orders, TRY, SYP, USD

**PDF:**
- Title: "تقرير المبيعات — {period}"
- Summary table: per employee totals
- Detail section: breakdown per campaign/ad

---

## 4.12 Analytics Hook

```js
// useSalesAnalytics():
{
  totalSalesByEmployee: [],    // [{ employee_id, name, total_try, total_usd }]
  totalSalesByChannel:  [],    // [{ channel_name, total_orders }]
  totalSalesByDay:      [],    // [{ date, total_usd }] last 30 days
  topCampaignByOrders:  null,  // Campaign
  avgInboxCount:        0,
  conversionRate:       0.0,   // orders / inbox_count
  dailyReportCompliance: 0.0,  // % of employees who submitted today
}
```

---

---

# CROSS-MODULE INTEGRATION MAP

---

## Data Flow Connections

```
[Daily Sales Wizard]
    ↓ daily_sales_reports.total_sales_usd per employee per month
    ↓ feeds into ▶
[Payroll Module — calculateEntries()]
    → reads total_sales to compute commission_earned

[Requests Hub — advance approved]
    ↓ DB trigger auto-creates ▶
[Accounting Ledger — accounting_entries (type=advance)]
    ↓ sum of advance amounts per employee per month
    ↓ feeds into ▶
[Payroll Module — calculateEntries()]
    → reads advance_deducted from accounting table

[Accounting Ledger — salary entry created after payroll finalized]
    → Admin manually creates accounting_entry type='salary' linked to run
    OR payroll service auto-creates salary entries on markRunPaid()

[Requests Hub — leave approved]
    ↓ DB trigger deducts from ▶
[leave_balances]
    ↓ leave days absent fed into ▶
[Payroll — absent_days deduction]
    (service cross-queries attendance + approved leaves)
```

---

## Shared Supabase Tables (used by multiple modules)

| Table                      | Used by                                    |
|----------------------------|--------------------------------------------|
| `profiles`                 | All modules (employee reference)           |
| `exchange_rates`           | Payroll, Accounting, Sales                 |
| `activity_logs`            | All modules (audit)                        |
| `notifications`            | All modules (push)                         |
| `attendance`               | Payroll (absent days calculation)          |
| `employee_requests`        | Requests Hub → Accounting (advance trigger)|
| `accounting_entries`       | Accounting → Payroll (advance deduction)   |
| `daily_sales_reports`      | Sales → Payroll (commission base)          |

---

## `.env` Additions Required

```bash
VITE_USE_MOCK_PAYROLL=false
VITE_USE_MOCK_ACCOUNTING=false
VITE_USE_MOCK_REQUESTS=false
VITE_USE_MOCK_SALES=false
```

---

## SQL Migration File

All 4 modules should be delivered as a single SQL migration file:
`supabase/migrations/0005_priority1_modules.sql`

**Content order:**
1. `exchange_rates`
2. `employee_salary_settings`
3. `payroll_runs`
4. `payroll_entries`
5. `accounting_categories` + seed data
6. `accounting_entries`
7. `leave_balances`
8. `employee_requests` + triggers (fn_deduct_leave, fn_create_advance_entry)
9. `sales_channels`
10. `campaigns`
11. `campaign_ads`
12. `daily_sales_reports`
13. `daily_sales_ad_results`
14. `daily_report_campaigns`
15. All RLS `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` statements
16. All `CREATE INDEX` statements
17. Realtime publication: `ALTER PUBLICATION supabase_realtime ADD TABLE ...`

---

## Module Folder Structure

```
src/modules/
  payroll/
    pages/
      PayrollDashboard.jsx
      SalarySettingsPage.jsx
      PayrollRunDetailPage.jsx
      MyPayslipPage.jsx
    stores/
      payrollStore.js
    services/
      payrollService.js
    hooks/
      usePayroll.js
      usePayrollAnalytics.js
    types/
      payroll.types.js
    components/
      PayrollEntryRow.jsx
      SalarySettingsForm.jsx
      PayrollRunCard.jsx
      PayslipPrint.jsx

  accounting/
    pages/
      AccountingLedgerPage.jsx    ← replaces/extends existing AccountingScreen
      AdvancesPage.jsx
      NewEntryPage.jsx
    stores/
      accountingStore.js
    services/
      accountingService.js
    hooks/
      useAccounting.js
      useAccountingAnalytics.js
    types/
      accounting.types.js
    components/
      EntryRow.jsx
      EntryForm.jsx
      AdvanceCard.jsx
      LedgerTotalsBar.jsx

  requests/
    pages/
      RequestsHubPage.jsx
      MyRequestsPage.jsx
      LeaveBalancesPage.jsx
    stores/
      requestsStore.js
    services/
      requestsService.js
    hooks/
      useRequests.js
      useRequestsAnalytics.js
    types/
      requests.types.js
    components/
      RequestCard.jsx
      RequestWizard.jsx
      RequestWizardStepLeave.jsx
      RequestWizardStepAdvance.jsx
      RequestWizardStepPermission.jsx
      RequestStats.jsx
      LeaveBalanceBar.jsx

  sales/
    pages/
      SalesDashboardPage.jsx
      MySalesPage.jsx
      ChannelsPage.jsx
      CampaignsPage.jsx
      ReportDetailPage.jsx
    stores/
      salesStore.js
    services/
      salesReportService.js
    hooks/
      useSales.js
      useSalesAnalytics.js
    types/
      sales.types.js
    components/
      SalesReportWizard.jsx
      WizardStep1Channel.jsx
      WizardStep2Inbox.jsx
      WizardStep3Campaigns.jsx
      WizardStep4AdResults.jsx
      WizardStep5OtherSources.jsx
      WizardStep6Summary.jsx
      DailySalesCard.jsx
      CampaignCard.jsx
      AdResultRow.jsx
```

---

*Architecture document — Lowe's Professional v1.0 Priority 1 Modules*
*Generated: 2026-05-20 | Do not code until this document is reviewed and approved.*
