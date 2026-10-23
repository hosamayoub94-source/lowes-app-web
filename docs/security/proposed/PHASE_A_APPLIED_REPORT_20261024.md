# المرحلة A — طُبِّقت على الإنتاج (تقرير قبل/بعد)

**التنفيذ:** 2026-10-23 21:54:55 UTC (معاملة واحدة عبر `execute_sql`، بموافقة المالك الصريحة، المرحلة A فقط؛ لم تُطبَّق A2 ولم يُمسَّ `profiles` ولا صلاحيات PIN).
الملفات: `20261024_phaseA_anon_sensitive_lockdown.sql` · الرجوع الجاهز: `20261024_phaseA_anon_sensitive_lockdown_rollback.sql` · الفحص: `PRE_POST_CHECK.sql`.

## قبل / بعد (قراءة فقط)
| البند | قبل (21:54:07) | بعد (21:55:18) |
|---|---|---|
| acl_md5 | `54cf274a6891923bee709f0e6c3d4ef9` | `28df0bd645dee0fc6a52e58ad926ac2e` (تغيّر — المقصود) |
| policies_md5 | `0b77de1aac6d049ad6ed5c5b30e6f0bf` | `84b5861a10089d0a94656fc563867924` (سياسة audit_log فقط) |
| كائنات حساسة مفتوحة لـ anon | **53** | **0** |
| كائنات مفتوحة لـ anon (الكل) | 165 | 112 (−53 بالضبط) |
| audit_log القديم | 22 · `f0c6becb6b0aaa178e79ae7a5a561dc5` | 22 · `f0c6becb6b0aaa178e79ae7a5a561dc5` (متطابق) |
| audit_log (الإجمالي) | 22 | 22 |
| payroll_runs | 7 · `0ecde5ae…` | 7 · `0ecde5ae…` |
| payroll_entries | 254 · `272ae5be…` | 254 · `272ae5be…` |
| employee_salary_settings | 28 · `155afab6…` | 28 · `155afab6…` |
| payroll_allowances | 7 · `1e0d16bd…` | 7 · `1e0d16bd…` |
| monthly_payroll | 37 · `50d8365b…` | 37 · `50d8365b…` |
| accounting_entries | 923 · `2f2d6ebb…` | 923 · `2f2d6ebb…` |
| finance_ledger_migrated | 37 · `085679fb…` | 37 · `085679fb…` |
| expenses / income | 75 · `13d527fc…` / 42 · `4aca5c23…` | متطابقان |
| system_settings / user_sessions | 36 · `e6645276…` / 430 · `928b67a3…` | متطابقان |
| لقطة الصلاحيات المحفوظة (للرجوع) | — | 6190 صفاً في `_security_backup.acl_phasea_20261024` |

## فرق الصلاحيات (المقارنة مع اللقطة)
- **anon:** أُزيل 876 امتيازاً (868 على الجداول الحساسة والامتيازات غير الضرورية، و8 على audit_log).
- **authenticated:** أُزيلت 7 امتيازات، **كلها على audit_log** (إدراج/تعديل/حذف/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN)؛ صفر على أي جدول آخر.
- **service_role:** لا تغيير. **لا امتيازات مُضافة لأي دور.**

## اختبارات ما بعد التطبيق (قراءة فقط)
- **PostgREST كـ anon (مفتاح التطبيق العام + `Accept-Profile: public`):** `orders` 200 · `tasks` 200 · `accounting_entries` 200 · `customer_stats` 200 · `products` 200 · `profiles` (أعمدة التطبيق) 200 · `attendance_records` (HEAD) 200. مغلقة: `system_settings` · `user_sessions` · `monthly_payroll` · `employees` · `finance_ledger_migrated_20260607` · `expenses` · `audit_log` · `payroll_runs` ← **401**. `profiles.password` ← 401 (كما قبل).
- **RLS بصلاحية authenticated حقيقية (`begin read only … rollback`):** مدير الرواتب: 7 دورات · 254 قيداً · 28 إعداداً · audit_log 22 صفاً. موظف: 0 دورات · 6 قيود قديمة له · إعداد واحد له · audit_log 0. مدير بلا صلاحية: 0 دورات. الجداول التي لم تُمسّ (orders 36463، tasks 260، accounting 923) كما هي.
- **anon (محاكاة دور):** يقرأ orders/tasks/accounting_entries/customer_stats؛ يحتفظ بإدراج وتعديل orders وحذف tasks؛ لا يقرأ system_settings ولا يقرأ/يكتب audit_log.

## المراقبة (21:55:30 → 22:26:34 UTC، 31 دقيقة، باستبعاد طلبات curl الخاصة بالفحص)
| المؤشر | النتيجة | خط الأساس (24 ساعة قبل) |
|---|---|---|
| طلبات REST التطبيقية | 784 | — |
| نجاح 2xx | 781 | — |
| 401 / 403 | **0** | 0 / 0 |
| 5xx | **0** | 3 (500) |
| 404 | 3، كلها `GET orders` من سكربت Google Apps Script خارجي بلا ترويسة `Accept-Profile` (خطأ schema لا صلاحيات؛ نمط موجود قبل التطبيق) | 157 |
| أخطاء قاعدة البيانات ERROR/FATAL بعد 21:59:30 | **0** (العشرة 42501 الأولى كانت من فحوصاتي أنا على الجداول المغلقة، آخرها 21:58:55) | 0 من 42501 |
| دوال الحافة (function_edge_logs) | 60 استدعاء، 0 أخطاء 5xx | — |
- مسارات anon التي يعتمد عليها التطبيق (قراءة/إضافة/تعديل `orders`، قراءة `tasks`) نجحت طوال النافذة.
- فحص السلامة عند 22:27:53: `acl_md5` ما زال `28df0bd6…`، `anon_open_sensitive = 0`، هاشات الرواتب والمالية و`audit_log` (22 صفاً) مطابقة للقيم قبل التطبيق.
- **قرار الرجوع: لم يُنفَّذ** (لا كسر وظيفي ولا 401/403/42501 غير متوقعة).

## جاهزية الرجوع (Rollback readiness)
- `_security_backup.acl_phasea_20261024` فيه 6190 صفاً (لقطة الصلاحيات الأصلية: جدول + أعمدة + كل الأدوار).
- أمر الرجوع: تنفيذ `20261024_phaseA_anon_sensitive_lockdown_rollback.sql` (معاملة واحدة؛ اختُبر على النسخة الوهمية: يعيد 4116 خلية صلاحية مطابقة للأصل، ويعيد سياسة audit_log كما كانت، ولا يلمس أي صف، ثم يحذف جدول اللقطة).
- تنبيه: الرجوع يعيد الانكشاف على الإنترنت؛ يُستعمل فقط عند كسر وظيفي، ويُفضَّل بدله `grant` محدد للجدول المتأثر.

## ما بقي مفتوحاً (خارج المرحلة A، لم يُلمَس)
- المرحلة A2 (`profiles`: anon يعدّل `role_type`/`base_salary_usd`...): **غير مطبَّقة**، بقرارك.
- authenticated ما زال يصل لجداول حساسة (`system_settings` و`user_sessions` و`monthly_payroll` و`employees`…)، إذ لم تشمله المرحلة A.
- قائمة السماح (`orders` وغيرها) تحتاج تعديل التطبيق ليحمل JWT؛ ظهر أن سكربت Google Apps Script يقرأ `orders` بدون تسجيل دخول أيضاً.
- كلمات مرور/PIN القديمة التي كانت في `system_settings`: تُبدَّل إن كانت صالحة، فقد كانت قابلة للقراءة من الإنترنت.
- سياسات `storage.objects` (رفع/تعديل عام).
