# Lowe's App Web — HANDOFF.md
> استلام فوري للمشروع — يحتوي على كل ما يحتاجه أي مبرمج أو محادثة Claude جديدة للمتابعة فوراً بدون أسئلة

---

## 1. معلومات المشروع الأساسية

| البند | التفاصيل |
|-------|----------|
| الاسم | Lowe's Professional — Staff App |
| الشركة | Lowe's Professional (كوزمتك / عناية بالبشرة) |
| المالك | Ayoub (Hosam) — hosam.ayoub94@gmail.com |
| المسار | `C:\Users\acer\Desktop\lowes app\lowes-app-web\` |
| المرجع القديم | `C:\Users\acer\Desktop\lowes app\index_v4.html` (12,608 سطر HTML — للقراءة فقط) |
| Schema SQL | `C:\Users\acer\Desktop\lowes app\supabase_schema.sql` |

---

## 2. تشغيل المشروع

```bash
cd "C:\Users\acer\Desktop\lowes app\lowes-app-web"
npm run dev
```

يفتح على: **http://localhost:5173**

أو انقر مرتين على `start-dev.bat` في المجلد الأب.

---

## 3. Credentials — Supabase (lowes-attendance)

| البند | القيمة |
|-------|--------|
| **Supabase Project** | lowes-attendance |
| **Supabase Ref** | `fghdumrgimoeqsafdhhh` |
| **URL** | `https://fghdumrgimoeqsafdhhh.supabase.co` |
| **Anon Key** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE3OTQsImV4cCI6MjA5MTc2Nzc5NH0.e9DiuJySh4WMp7x5ErVV5LqBFawHUESrlGDRb8N5zPM` |
| **Service Role Key** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE5MTc5NCwiZXhwIjoyMDkxNzY3Nzk0fQ.xpvq4jRX-SiEy5WpLCOnAbY68k_hXlpPDn6Jp_MhhRs` |

Service Role يُستخدم فقط في سكريبتات Node.js المحلية (مش في المتصفح).

---

## 4. VAPID Keys (Web Push Notifications)

| البند | القيمة |
|-------|--------|
| **Public Key** | `BOjFSpYCptZ0EgkoDFBtrEKe_jd58xeEnN354PxsXoK2jgJVTyo7hPPD0OrAhYVJjttS0nYBeP0J-_phRyl6kY4` |
| **Private Key** | `wj14OeGO_YKISt_T03cIqr70O9Mv9N7znArXL6oN1a8` |
| **VAPID Subject** | `mailto:hosam.ayoub94@gmail.com` |

**أين كل مفتاح:**
- Public Key → في `.env` كـ `VITE_VAPID_PUBLIC_KEY`
- Private Key → في Supabase Dashboard → Edge Functions → Secrets:
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT`
  - `VAPID_PUBLIC_KEY`

---

## 5. Stack التقني

| الطبقة | التقنية |
|--------|---------|
| Framework | React 18 + Vite 5 |
| Styling | Tailwind CSS v3 + CSS Variables |
| State | Zustand |
| Routing | React Router v6 (lazy loading) |
| Backend | Supabase (PostgreSQL + Auth) |
| Language | عربي، RTL، خط Tajawal |
| Charts | recharts |
| Excel | xlsx |
| Notifications | Web Push (VAPID) |
| Auth | Supabase Auth + PIN-based (4 أرقام) |

---

## 6. ملف .env الكامل

```env
VITE_SUPABASE_URL=https://fghdumrgimoeqsafdhhh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE3OTQsImV4cCI6MjA5MTc2Nzc5NH0.e9DiuJySh4WMp7x5ErVV5LqBFawHUESrlGDRb8N5zPM
SUPABASE_SERVICE_ROLE=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE5MTc5NCwiZXhwIjoyMDkxNzY3Nzk0fQ.xpvq4jRX-SiEy5WpLCOnAbY68k_hXlpPDn6Jp_MhhRs

VITE_USE_MOCK_TASKS=false
VITE_USE_MOCK_ATTENDANCE=false
VITE_USE_MOCK_NOTIFICATIONS=false
VITE_USE_MOCK_ANALYTICS=false
VITE_USE_MOCK_AUDIT=false
VITE_USE_MOCK_FILES=false
VITE_USE_MOCK_CRM=false
VITE_USE_MOCK_COLLAB=false
VITE_USE_MOCK_INVENTORY=false
VITE_USE_MOCK_PAYROLL=false
VITE_USE_MOCK_ACCOUNTING=false
VITE_USE_MOCK_REQUESTS=false
VITE_USE_MOCK_SALES=false

VITE_VAPID_PUBLIC_KEY=BOjFSpYCptZ0EgkoDFBtrEKe_jd58xeEnN354PxsXoK2jgJVTyo7hPPD0OrAhYVJjttS0nYBeP0J-_phRyl6kY4
```

جميع MOCK flags = false (قاعدة البيانات الحقيقية مفعّلة).

---

## 7. الأدوار (ROLES)

```js
// src/data/teams.js
ROLES = {
  MANAGER:        'manager',
  ADMIN:          'admin',
  MEDIA_BUYER:    'media_buyer',
  SALES_MANAGER:  'sales_manager',
  SOCIAL_MANAGER: 'social_manager',
  EMPLOYEE:       'employee',
}
```

**كلمات المرور للأدوار الإدارية** (مخزونة في `system_settings` بـ Supabase):
| الدور | كلمة المرور |
|-------|-------------|
| manager | `lowes2020` |
| admin | `lowes2026` |
| media_buyer | `media2026` |

**سلوك تسجيل الدخول:**
- Manager/Admin/Media Buyer/Sales Manager/Social Manager → إدخال كلمة مرور مباشرة
- Employee → اختيار الاسم من القائمة ← إدخال PIN (4 أرقام)

---

## 8. نظام Auth (PIN-based)

**الملف:** `src/services/authService.js`

### تدفق الدخول:
1. المستخدم يختار دوره
2. إذا كان employee: يختار اسمه من `profiles` table
3. يدخل PIN من 4 أرقام
4. `signInWithPin()` تحول الاسم لـ email وهمي: `${profileId}@auth.lowes-pro.local`
5. تسجيل الدخول بـ Supabase Auth باستخدام هذا الـ email

### Manual Session Fallback:
- إذا فشل Supabase Auth → يُخزَّن session يدوي في:
  ```
  localStorage key: 'lowes_manual_session'
  ```
- `AuthBoot.jsx` يتحقق من كلا النظامين

### موقع الملفات:
- `src/services/authService.js` — signInWithPin, listActiveProfiles
- `src/context/AuthBoot.jsx` — auth state listener
- `src/context/ThemeBoot.jsx` — dark/light theme
- `src/services/supabase.js` — Supabase client

---

## 9. هيكل src/ الكامل

```
lowes-app-web/src/
├── main.jsx              ← entry point (boot sequence)
├── App.jsx               ← ThemeBoot + AuthBoot + BrowserRouter
├── styles/
│   ├── theme.css         ← CSS variables (navy/teal/cream)
│   └── globals.css       ← Tailwind + base resets
├── routes/
│   ├── AppRoutes.jsx     ← كل الـ routes (40+)
│   ├── ProtectedRoute.jsx
│   └── paths.js          ← ROUTES constants
├── context/
│   ├── ThemeBoot.jsx
│   └── AuthBoot.jsx
├── screens/
│   ├── LoginScreen.jsx
│   ├── HomeScreen.jsx
│   ├── AttendanceScreen.jsx
│   ├── TeamScreen.jsx
│   ├── HolidaysScreen.jsx
│   ├── AccountingScreen.jsx
│   ├── ProfileScreen.jsx
│   ├── NotificationsScreen.jsx
│   ├── NotFoundScreen.jsx
│   ├── CampaignsScreen.jsx
│   ├── TaskReportScreen.jsx
│   ├── TrainingScreen.jsx    ← (اختبارات المنتجات اليومية)
│   └── admin/
│       ├── AdminScreen.jsx
│       ├── AdminUsersScreen.jsx
│       ├── AdminSettingsScreen.jsx
│       ├── AdminReportsScreen.jsx
│       └── AdminQuizScreen.jsx   ← (إدارة أسئلة الاختبار)
├── modules/
│   ├── tasks/pages/TasksPage.jsx
│   ├── crm/pages/CRMDashboard.jsx
│   ├── files/pages/FileManagerDashboard.jsx
│   ├── analytics/pages/ExecutiveDashboard.jsx
│   ├── workspace/pages/DailyWorkspacePage.jsx
│   ├── audit/pages/AuditDashboard.jsx
│   ├── payroll/pages/PayrollDashboard.jsx
│   ├── requests/pages/RequestsDashboard.jsx
│   ├── accounting/pages/AccountingDashboard.jsx
│   ├── sales/pages/SalesDashboard.jsx
│   ├── hr/pages/HRDashboard.jsx   ← (HR Dashboard)
│   ├── attendance/
│   ├── crm/integrations/crmEventBus.js
│   ├── files/integrations/fileEventBus.js
│   └── analytics/integrations/analyticsEventBus.js
├── core/
│   ├── events/           ← Event Bus
│   ├── queue/            ← Queue system
│   ├── automation/       ← Automation system
│   ├── operations/       ← Workflow metrics
│   ├── maintenance/      ← Maintenance dashboard
│   └── testing/          ← validateEnvironment
├── layouts/
│   ├── MainLayout.jsx
│   └── AuthLayout.jsx
├── components/
│   ├── ui/               ← Card, Button, Avatar, Loading...
│   ├── feature/
│   └── dev/MockModeBanner.jsx
├── services/
│   ├── supabase.js
│   └── authService.js
├── hooks/
│   ├── useAuth.js
│   ├── useToast.js
│   ├── useTheme.js
│   └── usePushNotifications.js
├── stores/               ← Zustand stores
├── data/
│   └── teams.js          ← ROLES, ROLE_LABELS, TEAM_KEYS
└── utils/
```

---

## 10. Boot Sequence (main.jsx)

عند التشغيل تُنفَّذ هذه الـ subsystems بالترتيب — كل واحدة مُغلَّفة بـ `safeBoot()` (خطأ في أي منها لا يوقف التطبيق):

1. EventListeners (`@/core/events`)
2. Queue (`@/core/queue`)
3. Automation (`@/core/automation`)
4. AttendanceIntegration (`@modules/attendance`)
5. FileIntegration
6. AnalyticsIntegration
7. CRMIntegration
8. EnvValidation (`@/core/testing`)
9. TimerTracking (`@/core/maintenance`)
10. WorkflowMetrics + PersistedMetrics (`@/core/operations`)
11. MaintenanceCleanup

---

## 11. الشاشات والمسارات الكاملة

| المسار | الشاشة / الملف | الأدوار المسموحة |
|--------|----------------|-----------------|
| `/` | HomeScreen | الكل |
| `/login` | LoginScreen | — |
| `/attendance` | AttendanceScreen | الكل |
| `/tasks` | TasksPage | الكل |
| `/crm` | CRMDashboard | الكل |
| `/files` | FileManagerDashboard | الكل |
| `/analytics` | ExecutiveDashboard | الكل |
| `/workspace` | DailyWorkspacePage | الكل |
| `/team` | TeamScreen | الكل |
| `/holidays` | HolidaysScreen | الكل |
| `/training` | TrainingScreen | الكل |
| `/accounting` | AccountingScreen | Manager, Admin |
| `/payroll` | PayrollDashboard | Admin, Manager |
| `/requests` | RequestsDashboard | الكل |
| `/ledger` | AccountingDashboard | Admin, Manager |
| `/sales` | SalesDashboard | Sales roles |
| `/campaigns` | CampaignsScreen | Sales roles |
| `/tasks-report` | TaskReportScreen | Admin, Manager, Sales Mgr |
| `/hr` | HRDashboard | Admin, Manager |
| `/profile` | ProfileScreen | الكل |
| `/notifications` | NotificationsScreen | الكل |
| `/admin` | AdminScreen | Admin فقط |
| `/admin/users` | AdminUsersScreen | Admin فقط |
| `/admin/settings` | AdminSettingsScreen | Admin فقط |
| `/admin/reports` | AdminReportsScreen | Admin فقط |
| `/admin/quiz` | AdminQuizScreen | Admin فقط |

---

## 12. نظام الألوان

```css
--navy:  #0f1f3d   /* اللون الرئيسي */
--teal:  #0d7377   /* اللون الثانوي */
--cream: #f8f7f4   /* الخلفية */
```

Dark mode: `[data-theme="dark"]` على `<html>` — يُخزَّن في localStorage.

---

## 13. قاعدة البيانات — الجداول الكاملة (40 section)

### جداول رئيسية:
| الجدول | الوصف |
|--------|-------|
| `attendance` | الحضور — UNIQUE(employee_name, date) — check_in/check_out بصيغة HH:MM |
| `profiles` | ملفات الموظفين — employee_name, pin, role_type, team, avatar_url |
| `tasks` | المهام — status, priority, assignee_name, due_date, kanban_column |
| `task_comments` | تعليقات المهام + mentions[] |
| `task_points` | نقاط الإنجاز لكل مهمة |
| `task_subtasks` | المهام الفرعية |
| `task_timeline` | سجل أحداث المهمة |
| `finance_ledger` | السجل المالي |
| `channels` | القنوات (pages + whatsapp) |
| `campaigns` | الحملات الإعلانية |
| `campaign_ads` | إعلانات الحملات (max 6 per campaign) |
| `daily_reports` | التقارير اليومية للمبيعات |
| `report_ad_results` | نتائج الإعلانات لكل تقرير |
| `report_other_sales` | مبيعات أخرى (old_customer/other) |
| `partnerships` | الشراكات القديمة |
| `partnership_requests` | طلبات الشراكة الجديدة (pending→approved/rejected) |
| `employee_partnerships` | الشراكات النشطة |
| `alerts` | التنبيهات (late/no_checkout/task_due/absent/custom) |
| `alert_rules` | قواعد التنبيهات |
| `bonuses` | المكافآت |
| `bonus_settings` | إعدادات قيمة النقطة |
| `requests` | طلبات الإجازات/السلف/الأذونات |
| `performance_scores` | تقييم الأداء الشهري |
| `departments` | الأقسام (syria/turkey/social/hr/finance) |
| `audit_log` | سجل التدقيق |
| `attachments` | المرفقات العامة |
| `notifications` | مركز الإشعارات الموحّد |
| `delivery_results` | نتائج التسليم النهائية |
| `monthly_sales_records` | سجلات المبيعات الشهرية |
| `app_settings` | إعدادات التطبيق العامة |
| `system_settings` | إعدادات النظام (key/value) — تشمل كلمات مرور الأدوار |
| `salary_deductions` | خصومات الراتب |
| `user_sessions` | جلسات المستخدمين |
| `otp_codes` | رموز OTP لـ 2FA |
| `backup_log` | سجل النسخ الاحتياطية |
| `chat_rooms` | غرف المحادثة |
| `chat_messages` | رسائل المحادثة |
| `chat_room_members` | أعضاء الغرف |
| `chat_join_requests` | طلبات الانضمام |
| `chat_last_read` | آخر قراءة لكل مستخدم |
| `push_subscriptions` | اشتراكات Web Push |
| `quiz_questions` | أسئلة اختبار المنتجات |
| `quiz_attempts` | محاولات الموظفين في الاختبار |

### Storage Buckets:
- `avatars` — صور الملف الشخصي (public)
- `attachments` — مرفقات المهام (public)
- `ads` — صور الإعلانات (public)

### ملاحظة مهمة — جدول attendance:
```sql
CREATE TABLE attendance (
  id             uuid PRIMARY KEY,
  employee_name  text NOT NULL,
  date           date NOT NULL,
  check_in       text,   -- HH:MM (أرقام لاتينية)
  check_out      text,   -- HH:MM (أرقام لاتينية)
  notes          text,
  team           text,
  delay_minutes  int DEFAULT 0,
  was_late       boolean DEFAULT false,
  method         text DEFAULT 'manual',
  recorded_at    text,
  gps_lat, gps_lng, gps_accuracy...
  CONSTRAINT attendance_emp_date_unique UNIQUE (employee_name, date)
)
```

**⚠️ لا يوجد date_str أو date_slash — العمود `date` من نوع date، وليس text مع شرطات مائلة.**
**موظف واحد = صف واحد في اليوم** (مش صفين in/out).

---

## 14. كلمات مرور الأدوار (system_settings)

مخزونة في جدول `system_settings`:
```
manager_pass   = lowes2020
admin_pass     = lowes2026
media_buyer_pass = media2026
```

---

## 15. الفرق بين المشروعين

| البند | lowes-app-web (هذا) | lowes-professional (ERP) |
|-------|---------------------|--------------------------|
| النوع | Staff App (موظفين) | Admin ERP (إدارة) |
| Stack | React + Vite | NestJS + Next.js |
| DB | Supabase (lowes-attendance) | Supabase (lowes-production) |
| Auth | PIN-based | JWT + bcrypt |
| Port | 5173 | API: 3001 / Admin: 3002 |
| المسار | `Desktop/lowes app/lowes-app-web` | `Desktop/my projects/lowes-professional` |

---

## 16. تنبيهات تقنية مهمة

### ⚠️ Glob لا يعمل في هذا المشروع
بسبب المسافة في اسم المجلد `"lowes app"` — الـ Glob tool لا يجد ملفات `src/`.
**الحل:** استخدم `Read` مباشرة بالمسار الكامل، أو `Bash` مع تحديد المسار.

### ⚠️ paths.js في AppRoutes
مسارات الـ imports تستخدم alias مثل `@/` و `@modules/`:
```js
// vite.config.js يُعرَّف فيه:
resolve: {
  alias: {
    '@': '/src',
    '@modules': '/src/modules',
  }
}
```

### ⚠️ PWA Service Worker
يوجد `vite-plugin-pwa` مُفعَّل — قد يُسبب تخزين مؤقت عند التطوير.
افتح DevTools → Application → Clear Storage عند الحاجة.

---

## 17. Supabase Realtime

بعض الشاشات تستخدم Realtime subscriptions:
- `ProfileScreen` — partnership_requests (realtime لطلبات الشراكة)
- `NotificationsScreen` — notifications table
- يُفعَّل عبر `supabase.channel()` في hooks

---

## 18. Web Push Notifications

- **hook:** `src/hooks/usePushNotifications.js`
- **الجدول:** `push_subscriptions`
- **Edge Function:** مُضبوطة في Supabase مع:
  - `VAPID_PRIVATE_KEY=wj14OeGO_YKISt_T03cIqr70O9Mv9N7znArXL6oN1a8`
  - `VAPID_SUBJECT=mailto:hosam.ayoub94@gmail.com`
  - `VAPID_PUBLIC_KEY=BOjFSpYCptZ0EgkoDFBtrEKe_jd58xeEnN354PxsXoK2jgJVTyo7hPPD0OrAhYVJjttS0nYBeP0J-_phRyl6kY4`

---

## 19. التدريب اليومي (Training / Quiz System)

### الجداول:
- `quiz_questions` — أسئلة عن المنتجات (4 خيارات، واحد صحيح)
- `quiz_attempts` — محاولات الموظفين (مرة واحدة في اليوم)

### الشاشات:
- `/training` — TrainingScreen — الموظف يجيب على سؤال يومي
- `/admin/quiz` — AdminQuizScreen — الأدمن يضيف/يعدل الأسئلة
- `AttendanceScreen` — نافذة اختبار عند تسجيل الخروج (checkout quiz modal)

---

## 20. نظام الإجازات وطلبات الموارد البشرية

### الجدول: `requests`
```
request_type: leave / advance / permission / other
status: pending / under_review / approved / rejected / cancelled
```

### الشاشات:
- `/requests` — RequestsDashboard — الموظف يقدم طلبات ويتابعها
- `/hr` — HRDashboard — المدير/الأدمن يعالج الطلبات

---

## 21. آخر Commits (مايو 2026)

```
feat(profile): add realtime subscription for shift partner requests
feat: Enhanced Profile (work info + shift partners) + Daily Quiz Training System
feat(chat): Feature #8 — Quick emoji strip, read receipts, @mention, forward message
feat: Feature #4 — Enhanced Task System (Kanban DnD + @mention + File Attachments)
feat: VAPID keys + Leave Requests system + HR Dashboard
```

---

## 22. كيفية إجراء Migration جديدة على Supabase

1. افتح [Supabase Dashboard](https://supabase.com/dashboard/project/fghdumrgimoeqsafdhhh)
2. انتقل لـ SQL Editor
3. انسخ الـ SQL المطلوب وشغّله مباشرة

أو عبر browser JavaScript في Console (بعد تسجيل الدخول في dashboard):
```js
const token = (await fetch('/rest/v1/', {credentials: 'include'})).headers.get('Authorization');
// ... ثم استخدم Supabase Management API
```

---

## 23. Profiles الأساسية (موظفون في DB)

```
اسم الموظف          الفريق                  الدور
alic kanaan         تيم السوشال ميديا       manager (social_only)
wasim alkshki       تيم سوريا               manager (finance_only)
Fadi jarrouge       تيم سوريا               manager (finance_only)
shamh               تيم السوشال ميديا       employee
ala aboumasoud      تيم السوشال ميديا       employee
Hamza Nsr           تيم السوشال ميديا       employee
```

---

## 24. الأقسام (Departments)

```
syria   → تيم سوريا
turkey  → تيم Lowes تركيا
social  → تيم السوشال ميديا
hr      → الموارد البشرية
finance → المحاسبة
```

---

## 25. نصائح للمبرمج القادم

1. **قبل أي شيء** — شغّل `npm run dev` وتأكد إن الصفحة تفتح على 5173
2. **الـ Glob لا يعمل** — استخدم `Read` مع المسار الكامل دائماً
3. **الـ Mock flags** كلها `false` — لا تُفعّلها إلا للاختبار المحلي بدون إنترنت
4. **قاعدة البيانات حقيقية** — أي تغيير في Supabase مباشر، لا يوجد staging
5. **نظام Auth** له fallback يدوي في localStorage — إذا رأيت `lowes_manual_session` فهذا طبيعي
6. **الـ schema SQL** في `supabase_schema.sql` هو المرجع الكامل للجداول
7. **الـ HANDOFF.md للمشروع الثاني** موجود في: `C:\Users\acer\Desktop\my projects\lowes-professional\HANDOFF.md`

---

*آخر تحديث: مايو 2026*
