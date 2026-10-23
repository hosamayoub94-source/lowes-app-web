# إغلاق ثغرة `audit_log` + جرد الجداول المشابهة — 24 تشرين الأول 2026

**الحالة: لم يُطبَّق أي شيء على الإنتاج. كل فحص للإنتاج كان قراءة فقط.**

## الثغرة (مثبتة على الإنتاج، قراءة فقط)
- سياسة `allow_all_anon_aul`: `FOR ALL TO public USING (true) WITH CHECK (true)`.
- `anon` و`authenticated` يملكان INSERT/SELECT/UPDATE/DELETE/TRUNCATE على الجدول.
- اختبار بدور `anon` داخل `begin read only` أعاد 22 صفاً، و`has_table_privilege(insert/delete) = true`.
- الجدول: 22 صفاً (كلها `requests`، 29/4 → 21/5/2026)، لا FK ولا view ولا دالة ولا trigger تعتمد عليه، ليس في publication.
- المستودع لا يستعمله إطلاقاً (0 ملفات في `src` و`supabase/functions`)، وآخر كتابة قبل 5 أشهر.

## بصمة الصفوف القديمة (إنتاج، قبل أي تطبيق)
`n = 22` — `md5(string_agg(to_jsonb(row)::text, '|' order by id)) = f0c6becb6b0aaa178e79ae7a5a561dc5`
بعد التطبيق (لاحقاً وبموافقتك) يُعاد الاستعلام نفسه ويجب أن يُرجع القيمتين نفسيهما (الصفوف الجديدة، إن وُجدت، تُستثنى بشرط `created_at <= 2026-05-21 14:52:06.683002+00`).

## ما يفعله الـmigration
| | |
|---|---|
| السياسة | تُحذف `allow_all_anon_aul`؛ تُنشأ `audit_log_read_authorised` (SELECT لـ`authenticated`: `is_admin_user() OR payroll_has_access()`) |
| الصلاحيات | `revoke all` عن `public/anon/authenticated`؛ `grant select` لـ`authenticated` فقط (و`service_role` كما هو) |
| إضافة فقط | triggers تمنع UPDATE/DELETE/TRUNCATE للجميع بمن فيهم المالك و`service_role` |
| الكتابة | عبر `audit_row_change()` (trigger، before/after من OLD/NEW، الفاعل `auth.uid()`) و`log_audit_event()` (أحداث التطبيق، لا معامل للفاعل، IP والمتصفح من ترويسات الطلب، الإجراء يُخزَّن `app:<x>`) |
| الدوال | `SECURITY DEFINER` و`search_path = public, pg_temp` ثابت، `EXECUTE` لـ`authenticated` فقط (لـ`log_audit_event`) |
| الصفوف | لا قراءة ولا تعديل ولا حذف لأي صف قائم؛ لا أعمدة جديدة (تبقى البصمة صالحة) |

الملفات: `20261024_audit_log_lockdown.sql` و`..._rollback.sql` (يعيد الحالة غير الآمنة حرفياً — احتياط فقط).

## نتائج الاختبار (56 فحصاً، 0 فشل) — نسخة Postgres في الذاكرة
المخرجات الكاملة: `AUDIT_LOG_LOCKDOWN_TEST_OUTPUT_20261024.txt`، والسكربت `test_audit_log_lockdown_pglite.mjs`.

| الدور | SELECT | INSERT مباشر | UPDATE | DELETE | TRUNCATE | RPC |
|---|---|---|---|---|---|---|
| anon | مرفوض | مرفوض | مرفوض | مرفوض | مرفوض | مرفوض |
| موظف (authenticated) | 0 صفوف | مرفوض | مرفوض | مرفوض | مرفوض | يعمل |
| HR/محاسب (payroll_access) | يقرأ | مرفوض | مرفوض | مرفوض | مرفوض | يعمل |
| admin | يقرأ | مرفوض | مرفوض | مرفوض | مرفوض | يعمل |
| service_role | يقرأ | **يعمل** (مفتاح الخادم) | يحجبه trigger | يحجبه trigger | يحجبه trigger | مرفوض |
| المالك/superuser | يقرأ | يعمل | يحجبه trigger | يحجبه trigger | يحجبه trigger | — |

قبل الإصلاح (نفس النسخة): anon يقرأ 22 ويدرج ويعدّل 22 ويحذف 22؛ authenticated يحذف 22. كلها داخل معاملات مُلغاة والجدول عاد مطابقاً.
- محاولات التزوير: إدراج مباشر بفاعل مزوّر مرفوض؛ الـRPC يخزّن دائماً `actor = auth.uid()`؛ IP والمتصفح من الترويسات لا من المعاملات؛ تجاوز `search_path` بجدول مؤقت اسمه `audit_log` فشل.
- trigger التدقيق على جدول تجريبي سجّل insert/update/delete بالفاعل وبـbefore=1/after=2 من المستخدم الذي لا يملك أي صلاحية على `audit_log`؛ لا يستطيع استدعاء الدالة ولا تعطيل الـtrigger.
- بعد كل الاختبارات: الصفوف الـ22 الأصلية متطابقة (count + md5 لكل الأعمدة).
- idempotent (تطبيقان = نفس الحالة)، والرجوع يعيد ACL والسياسة الأصليتين ثم يعمل إعادة التطبيق.

## السياسات والصلاحيات بعد الإصلاح (من النسخة)
- السياسة الوحيدة: `audit_log_read_authorised` — SELECT — `{authenticated}` — `(is_admin_user() OR payroll_has_access())`.
- صلاحيات الجدول: `authenticated: SELECT`، `service_role: كل شيء (يحجب الكتابة trigger)`، لا شيء لـ`anon` ولا `PUBLIC`.
- الدوال: `log_audit_event` EXECUTE لـ`authenticated` فقط؛ `audit_row_change` و`audit_log_append_only` بلا EXECUTE لأحد؛ الثلاث `search_path = public, pg_temp`.
- على الإنتاج: `is_admin_user()` و`payroll_has_access()` قابلتان للتنفيذ من `authenticated` (مثبت قراءةً).

## جرد الجداول الحساسة المشابهة (إنتاج، قراءة فقط)
ملاحظة: منح `anon` الكامل على الجداول افتراضي في Supabase؛ **الحاجز الفعلي هو RLS**. الخطر الحقيقي حيث توجد سياسة مفتوحة (`true`) لـ`public/anon`.

| الجدول | صفوف | سياسة مفتوحة | استعمال في التطبيق | الخطورة |
|---|---|---|---|---|
| `audit_log` | 22 | قراءة وكتابة بلا قيد | لا | **حرجة — يعالجها هذا الملف** |
| `finance_ledger_migrated_20260607` | 37 | قراءة وكتابة بلا قيد | ملف واحد | **حرجة (مالية)** — غالباً نسخة تاريخية؛ تحتاج تأكيد الاستعمال ثم إغلاق |
| `activity_logs` | 2273 | قراءة للجميع (`activity_logs_select_anon` true) + إدراج anon/authenticated بلا قيد | 3 ملفات (يستعمله التطبيق) | **عالية** — يتطلب تعديل التطبيق (الكتابة عبر مستخدم مسجّل) قبل الإغلاق |
| `order_status_history` | 18395 | `osh_all` ALL true | 3 ملفات | **عالية** — يعدّل/يمسح تاريخ الطلبات |
| `wh_movements` | 10609 | `wh_movements_all` ALL true | 3 ملفات | **عالية** — حركات المخزون |
| `inventory_daily_log` | 1480 | ALL true | ملف واحد | عالية |
| `task_activity` | 813 | قراءة وإدراج بلا قيد | ملف واحد | متوسطة |
| `leave_balances` | 3 | `leave_bal_all` ALL true | ملف واحد | عالية (أرصدة الإجازات) |
| `network_audit` | 49 | `network_audit_read` SELECT true | ملف واحد | متوسطة (قراءة فقط) |
| `backup_log` | 9 | ALL true | لا | متوسطة |
| `ad_daily_logs` | 0 | ALL true | لا | منخفضة (فارغ) |
| `stock_movements`, `commission_ledger`, `attendance_events`, `file_activity` | — | مقيّدة بـ`auth.uid()`/الدور | — | لا سياسة مفتوحة (منح anon بلا أثر بفضل RLS) |
| `payroll_run_events`, `employee_salary_settings_log`, `creator_prospect_audit`, `product_economics_history`, `profitability_retro_log` | — | لا منح anon | — | سليمة (منح authenticated فقط) |

**لم أُعدّل أي جدول غير `audit_log`**: الجداول المستعملة (activity_logs، order_status_history، wh_movements …) تعتمد عليها واجهة التطبيق، وإغلاقها دون تعديل التطبيق يكسره. يُقترح تقرير تفصيلي ومIgration مستقلة لكل جدول بعد فحص من يكتب فيه (التطبيق يعمل بمفتاح anon في بعض المسارات: {unverified}).

## ما لم يُثبَت
- الاختبار على نسخة PGlite وليس Supabase: PostgREST و`auth.uid()` الحقيقيتان وترويسة `x-forwarded-for` (هل تُضبط من الحافة أم قابلة للتزييف من العميل). (Unverified)
- كاتبون من خارج هذا المستودع (مشاريع أخرى أو سكربتات) باستعمال مفتاح anon: آخر صف قبل 5 أشهر يرجّح عدم وجودهم، لكن لا دليل قاطع. (Unverified)
- أي مستخدم authenticated يستطيع استدعاء `log_audit_event` (إضافة أحداث `app:` بهويته هو فقط): لا حد للمعدل. (Unverified)
