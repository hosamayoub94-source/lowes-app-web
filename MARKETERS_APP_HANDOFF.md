# 🚚 تطبيق المسوقين — MARKETERS APP / Distribution System — HANDOFF

> ملف الاستلام الخاص بنظام **المندوبين والمسوّقين والتوزيع** المبني داخل `lowes-app-web`.
> يُقرأ أولاً من أي مبرمج أو محادثة Claude جديدة تشتغل على هذا النظام. يُحدَّث مع كل جديد.
> آخر تحديث: 8 يونيو 2026 — كل النظام مبنيّ ومنشور (Vercel) + كل الـmigrations مطبّقة على prod.

---

## 🔴 الحالة الحالية + المهام المفتوحة (اقرأها أولاً — محادثة جديدة)

**كل شي مبنيّ ومنشور وشغّال:**
- ✅ DB: كل الـmigrations مطبّقة على prod `fghdumrgimoeqsafdhhh` (p0/p1/p1b/p2/p3 + login_codes تراجعت + p5 trigger تراجع — انظر التغييرات). محرّك العمولات + الترقية الآلية + الأوسمة في الـDB.
- ✅ Frontend منشور على Vercel (`lowes-app-web.vercel.app`، حساب Vercel = `lowes1`). الشاشات الجديدة كلها ظاهرة وشغّالة: محفظتي/شبكتي/كشف العمولات/التحصيل/الأمانة/المناطق/**الهيكل الإداري (Management)**.
- ✅ لوحة الدخول = **3 خانات** (Team / Stars Network / Field Sales) — كل الأشخاص بـTeam (قرار المالك). Management صار **صفحة داخلية** `/management` (org chart إنجليزي + Vacant)، مش خانة دخول.
- ✅ إنشاء موظف من التطبيق مباشرة يشتغل (edge fn `manage-employee` محدّثة لتقبل role_type + seller_type + level/rank). الدخول بالاسم+PIN (تغيير الدخول بكود **مؤجّل/متراجع**).

**✅ المشكلة المفتوحة #1 — حُلّت (السبب الجذري كان في الكود لا في الكاش):**
- العَرَض كان: قائمة الأدوار بشاشة «إضافة/تعديل موظف» تعرض **6 أدوار قديمة فقط** بدل الـ15.
- **التشخيص القديم (كاش PWA) كان خاطئاً.** السبب الحقيقي: `ROLE_LABELS` كان **ثابتاً معرّفاً محلياً داخل `AdminUsersScreen.jsx`** يحتوي 6 أدوار فقط، ولا يستورد أدوار التوزيع/الإدارة إطلاقاً. (لذلك لم يفده أي redeploy/clear cache — المصدر نفسه كان 6.)
- **الإصلاح:** حُذف التعريف المحلي، واستُورد `ROLE_LABELS` الكامل (15 دوراً) من مصدر الحقيقة `@data/teams`. القائمة الآن تعرض كل الأدوار. `vite build` أخضر.
- ملاحظة جانبية: `registerType:'autoUpdate'` + `skipWaiting`/`clientsClaim` كانت مطبّقة فعلاً في `vite.config.js`/`src/sw.js` (لم تكن هي المشكلة، لكنها سليمة وتمنع شكاوى الكاش المستقبلية).

**⏳ مهمة مفتوحة #2 — تست العمولة لم يكتمل (بانتظار حل #1):**
- الخطوات: أضف «مندوب تجريبي» (دور مندوب ميداني + مستوى محترف + PIN) → اعمل طلب $100 باسمه → «تم التسليم» → «كشف العمولات» لازم يظهر $10. (المحرّك متحقّق منو على مستوى الـDB.)

**❓ أسئلة المالك المعلّقة (وضّحها):**
- «Management وينها؟ المندوب/الوكلاء/المتاجر» — Management = صفحة `/management` الآن. المندوب/الوكلاء = أدوار يدخلون من **Field Sales**؛ المسوّقات/المشرفات من **Stars Network**؛ «المتاجر أونلاين» لسّا ما إلها واجهة مخصّصة (فكرة بانر مؤجّلة). قد يريد المالك Management كخانة دخول رابعة — أكّد معه.

---

## 0) ملخّص بسطر واحد
«تطبيق المسوقين» **ليس تطبيقاً منفصلاً** — هو **منظومة جديدة داخل `lowes-app-web`** (نفس React+Supabase، نفس مشروع Supabase `fghdumrgimoeqsafdhhh`). يضيف فوق النظام الحالي: مندوبين ميدانيين + شبكة مسوّقات MLM + محرّك عمولات موحّد + محافظ + مناطق + أمانة + تحصيل — كلها بمبدأ **«توسعة لا استبدال»** (الموظفون الحاليون نوع `online`، سلوكهم بلا تغيير).

---

## 1) أين يعيش (مهم جداً)
- **التطبيق:** `C:\Users\acer\Desktop\lowes app\lowes-app-web\` (React 18 + Vite + Supabase + Tailwind). منشور على Vercel.
- **مشروع Supabase:** **`fghdumrgimoeqsafdhhh`** (نفس مشروع الإنتاج — فيه كل البيانات الحقيقية).
- ❌ **ليس** في مجلد `تطلبق المسوقين 4.6.2026` (ذاك ملف HTML/localStorage — مرجع تصميمي فقط، لا علاقة له بـSupabase).
- ❌ **لا يُنشأ مشروع Supabase جديد** — الـmigrations تعدّل جداول موجودة (profiles/orders) وتفشل على مشروع فاضٍ.

---

## 2) الناس — الحسابات

### أ) القيادة/المدراء (موجودون أصلاً — يبقون كما هم)
لهم وصول وإشراف كامل على منظومة المسوّقين تلقائياً (صلاحيات `MANAGE_COMMISSION/TERRITORY/CONSIGNMENT/VIEW_NETWORK` مُضافة لقوالب `manager`/`sales_manager`، و`admin` يملك الكل):
| الاسم | الدور (role_type) | النطاق |
|---|---|---|
| حسام أيوب | admin | المؤسس/CEO — الشركة |
| ريم | admin/manager | COO — تركيا + الإمارات |
| أماني | admin/manager | المديرة العامة لسوريا |
| (مدراء المبيعات) | sales_manager | قيادة فرق البيع |

> المدراء **ما بدهم أي إجراء** غير تطبيق الـmigrations — صلاحياتهم على النظام الجديد تأتي من دورهم الحالي.

### ب) البائعون الحاليون (online order-handlers — يبقون `seller_type='online'`)
هؤلاء فريق المبيعات الحالي (معالجو الطلبات أونلاين). عمولتهم تبقى per-market كما هي (لا يمرّون بدفتر العمولات). المرجع القانوني للأسماء = `SELLER_CANON` في `src/services/customerService.js`:
> Haneen Mohamad · Rita Deeb · Sally Teba · Dalal Ali · Raghad Almaroof · Petra Dahdouh · Zina Sulyman · Yasmin Mahmoud · Leen Alasaad · Taj Mahmoud · Arwa Mohammed · Diana Hasan · Louna Dahdouh · Thanaa Al Ashkar · Hassna Deeb · Hla Al Namra · Khedr Alnisafe · Rouida Alibrahim · Yasmeen Alahmad · Bushra Saidy · Marah Bashir · Sarah Ibrahim · Sarah Alasaad · Zeina Almarouf · Yousef Alkshki · (LOWES = مبيعات الشركة).

### ج) المندوبون/المسوّقون الجدد (99% أشخاص جدد — يُضافون لاحقاً)
يُضافون كـ**حسابات جديدة** (صفوف `profiles` جديدة + PIN) بـ`role_type` و`seller_type` من الأدوار الجديدة. الخصوصية مضمونة عبر RLS: كل واحد يرى بياناته فقط، المشرفة ترى فريقها، الإدارة ترى الكل.

---

## 3) الأدوار الجديدة (في `src/data/teams.js`)
| key | عربي | seller_type المقابل | يرى |
|---|---|---|---|
| `field_rep` | مندوب ميداني | field_rep | زياراته، طلباته، محفظته، تحصيله، أمانته |
| `marketer` | مسوّقة | marketer | طلباتها، شبكتها (downline)، محفظتها |
| `supervisor` | مشرفة مجموعة | marketer | + فريق مجموعتها |
| `supervisor_manager` | مديرة المشرفات | marketer/online | + كل المجموعات |
| `area_agent` | وكيل منطقة | field_rep | + منطقته ومخزونها |

> `role_type` يحدّد القوائم/الصلاحيات؛ `seller_type` يحدّد **طريقة حساب العمولة** في المحرّك.

---

## 4) ما الذي بُني (P0 → P3) — كله مبنيّ، lint نظيف، `vite build` أخضر

### الـmigrations (في `supabase/` — تُطبَّق يدوياً بالترتيب)
| الملف | المحتوى |
|---|---|
| `distribution_system_p0.sql` | الأساس: territories · mlm_groups · أعمدة profiles/orders (+GRANTs) · rep_level_rules + mlm_rank_rules (seed) · commission_config · **commission_ledger** · withdrawals · RLS helpers `is_supervisor_of`/`current_seller_id` |
| `distribution_system_p1.sql` | **محرّك العمولات** `post_order_commission()` (idempotent عبر `commission_locked`؛ online يُتجاوز؛ field_rep نسبة المستوى؛ marketer شخصية+override سلسلة recruiter+group+سقوف) + `commission_statement()` |
| `distribution_system_p1b.sql` | badges + seller_badges + challenges + challenge_progress (seed 8 أوسمة) + RPC `manager_commission_report()` + `commission_leaderboard()` |
| `distribution_system_p2.sql` | `ensure_invite_code()` + `set_recruiter_by_invite()` (منع الحلقات) + `my_downline()` |
| `distribution_system_p3.sql` | crm_clients(zone/credit/suspended) + orders.client_id + consignments + price_violations + RPC `overdue_orders()` (أعمار ديون) |

### الشاشات والكود (React)
- `src/modules/commission/` → `services/{commissionEngine,ledgerService}.js` · `pages/{MyWalletScreen,CommissionReportScreen}.jsx`
- `src/modules/mlm/` → `services/mlmService.js` · `pages/NetworkScreen.jsx`
- `src/modules/distribution/` → `services/distributionService.js` · `pages/{TerritoriesScreen,ConsignmentScreen,CollectionsScreen}.jsx`
- **مربوط في** `src/screens/OrdersScreen.jsx` → عند تحويل الطلب إلى `delivered` يستدعي `postOrderCommission(id)` (بعد القيد المحاسبي مباشرة).
- المسارات في `src/routes/{paths.js,AppRoutes.jsx}`: WALLET `/wallet` · NETWORK `/network` · COMMISSION_REPORT `/commission-report` · TERRITORIES `/territories` · CONSIGNMENT `/consignment` · COLLECTIONS `/collections`.
- التنقّل: `src/data/navigation.js` (عناصر + BottomNav per-role) · `src/data/homeLayout.js` (archetypes: field_rep/marketer/supervisor).
- الصلاحيات: `src/data/permissions.js` (PERMISSIONS الجديدة + ROLE_PERMISSIONS + ROLE_TEMPLATES).
- **الدليل داخل التطبيق:** `src/data/guides.js` (مدخلات: wallet/network/visits_field/collections/consignment/territories/commission_report) — تظهر تلقائياً per-role عبر `HelpGuide`.

---

## 5) محرّك العمولات — كيف يعمل
`post_order_commission(order_id)` (RPC SECURITY DEFINER) يُستدعى **مرة عند التسليم فقط**:
- `online` → يُتجاوز (يقفل `commission_locked`، لا يكتب دفتر — عمولته per-market في الواجهة).
- `field_rep` → `rep_level_rules[level].base_pct` (junior 8% · active 5% · pro 10% · agent 20%).
- `marketer` → شخصية `mlm_rank_rules[rank]` (bronze 35%→diamond 50%) + override صعوداً في سلسلة `recruiter_id` بـ `commission_config.override_pcts=[5,3,2]` + إشراف المجموعة 5% + سقف صارم 55%.
- يكتب صفوف في `commission_ledger` (نوع لكل مكوّن) + يحدّث `profiles.wallet_balance`.
- **idempotent:** `orders.commission_locked=true` يمنع الاحتساب المزدوج.
- **الترقية الآلية ✅:** عند التسليم يستدعي `apply_seller_progress(seller, month)` (في p1b): يرقّي/ينزّل `rep_level` (حسب طلبات الشهر) و`mlm_rank` (حسب مبيعات الشهر) + يرسل إشعاراً + يمنح الأوسمة الآلية (first_sale/ten_orders/fifty_orders/recruiter/team_of_five/silver_rank/diamond_rank). تظهر في شاشة «محفظتي» (المستوى/الرتبة + شريط الأوسمة).

---

## 6) الإجراءات المطلوبة لتشغيل النظام (للمالك)
1. **Backup** للمشروع (Supabase → Database → Backups).
2. **SQL Editor** → شغّل الملفات بالترتيب: `p0 → p1 → p1b → p2 → p3` (كلها idempotent).
3. **فحص أمان بعد p0:** `select count(*) from orders where seller_id is null;` + تأكّد login والطلبات تعمل.
4. **اختبار:** حوّل طلب لمندوب `field_rep` إلى delivered → تحقّق `commission_ledger` + `wallet_balance` + شاشة «محفظتي».
5. **إضافة المندوبين/المسوّقين الجدد** (يدوي من «المستخدمون» أو دفعة بسكربت — انظر §7).

> الكود محمي: استدعاءات الـRPC fire-and-forget — لا تكسر الواجهة لو الجداول لسّه ما طُبّقت.

---

## 7) قالب إضافة بائع جديد (SQL — بعد إنشاء حساب/profile)
```sql
-- مندوب ميداني:
update profiles set role_type='field_rep', seller_type='field_rep', rep_level='junior'
where employee_name='<الاسم>';
-- مسوّقة MLM:
update profiles set role_type='marketer', seller_type='marketer', mlm_rank='bronze'
where employee_name='<الاسم>';
-- توليد رمز دعوة للمسوّقة:  select ensure_invite_code('<uuid>');
```
> إنشاء الحساب نفسه (auth + PIN) عبر شاشة «المستخدمون» (Admin) أو `scripts/provision-auth-users.mjs`.

---

## 8) قواعد تقنية حرجة (مستخلصة)
1. **GRANT إجباري:** أي عمود جديد على `profiles` يُقرأ وقت login يحتاج `GRANT SELECT (col) ON profiles TO anon, authenticated;` وإلا **ينكسر تسجيل الدخول**.
2. **مشروع واحد فقط:** `fghdumrgimoeqsafdhhh` — لا مشروع جديد.
3. **tokens الثيم:** `surface / surface-alt / border / muted / navy / teal` (لا يوجد `bg-bg`).
4. **RLS helpers موجودة:** `current_role_type()`, `current_team()` (0001) + الجديدتان `current_seller_id()`, `is_supervisor_of()` (p0).
5. **كتابة الدفتر:** `commission_ledger` تُكتب فقط عبر RPC SECURITY DEFINER (سياسة `ledger_write` محصورة بالإدارة) — منعاً للتلاعب.
6. **PIN Auth + Edge fns:** أي `fetch` لـedge function يحمل `apikey`+`Authorization: Bearer <anon>` (درس من HANDOFF الرئيسي).
7. **نشر Edge Functions:** `npx supabase functions deploy <fn> --project-ref fghdumrgimoeqsafdhhh --use-api` (token `sbp_` من Dashboard).

---

## 9) المتبقّي / أفكار لاحقة
- بونصات آلية (حجم/عملاء جدد/تحصيل/احتفاظ) — البنية جاهزة في `commission_ledger` (أنواع `bonus_*`)، تحتاج منطق احتساب (يعتمد على تعريف التارجت الشهري لكل بائع).
- onboarding ذاتي للمسوّقات عبر رمز الدعوة (تسجيل بلا تدخّل أدمن) — حالياً الضمّ يربط recruiter، لكن إنشاء الحساب يبقى عبر الأدمن.
- وسام `top_month` (الأعلى عمولةً) — يحتاج مقارنة عبر كل البائعين (job شهري أو منح يدوي).
- ✅ **مُنجز:** الترقية/النزول الآلي للمستوى والرتبة + منح الأوسمة آلياً (انظر §5).

---

## 10) سجل التغييرات (يُحدَّث مع كل جلسة)
- **8 يونيو 2026 — الإصدار الأول:** بُنيت P0→P3 بالكامل (5 migrations + 6 شاشات + محرّك عمولات + الدليل per-role). lint نظيف، `vite build` أخضر. **لم تُطبَّق الـmigrations على Supabase بعد.** الخطة الكاملة: `C:\Users\acer\.claude\plans\c-users-acer-desktop-my-projects-radiant-volcano.md`.
- **8 يونيو 2026 — ✅ طُبّقت كل الـmigrations على prod (`fghdumrgimoeqsafdhhh`) عبر Management API:** p0→p1→p1b→p2→p3 كلها HTTP 201. تحقّق بنيوي: 11 دالة + كل أعمدة profiles/orders + 13 جدول موجودة. **هجرة البيانات: 27,751 طلب انربطوا بـseller_id** (4,010 غير مطابق = أرشيف/LOWES). الإنتاج آمن: 56 موظف كلهم seller_type='online'. **الاختبار الوظيفي الحيّ للمحرّك لم يُنفَّذ** (حارس الأمان منع تعديل سجل موظف حقيقي — يحتاج حساب test rep مخصّص أو موافقة صريحة).
- **8 يونيو 2026 — الترقية الآلية + الأوسمة:** أُضيفت `apply_seller_progress()` في p1b (ترقية/نزول المستوى والرتبة + منح أوسمة آلية + إشعار)، تُستدعى من `post_order_commission` عند التسليم. شاشة «محفظتي» تعرض المستوى/الرتبة + شريط الأوسمة (`badgeService.js`). lint + build أخضر. **لم يُطبَّق على Supabase بعد.**
- **8 يونيو 2026 (مساءً) — نشر كامل + UI الأدوار + Management + تشخيص كاش PWA:**
  - طُبّقت كل migrations التوزيع على prod عبر Management API (توكن sbp_ ولّده المالك ثم ألغاه). تحقّق: 11 دالة + الجداول + 27,751 طلب مربوط seller_id.
  - login_codes + p5(trigger seller_id) **تراجعا** (revert commit) — أُجّل تغيير الدخول بكود (خطر قفل 56 موظف)؛ بدّلنا p5 بربط seller_id في `OrdersScreen.handleSave` (frontend).
  - لوحة الدخول: قناتان→3 خانات (Team/Stars Network/Field Sales)، كل الأشخاص بـTeam.
  - شاشة المستخدمين: إنشاء مباشر عبر `manage-employee` + حقل PIN + اشتقاق seller_type من الدور + إخفاء شبكة صلاحيات الإدارة لأدوار المبيعات (ملخّص تلقائي).
  - أدوار إدارية جديدة (accountant/hr_manager/warehouse_manager/marketing_manager) + صفحة `/management` (orgChart.js + ManagementScreen.jsx).
  - **عالق:** قائمة أدوار شاشة الإضافة تظهر 6 فقط بسبب كاش PWA (انظر «المشكلة المفتوحة #1» بالأعلى). الحزمة الحيّة صحيحة.
  - كل التغييرات منشورة على main + Vercel (آخر deploy: Redeploy نظيف بدون كاش).
- **8 يونيو 2026 — 🔒 عزل بيانات الشركة عن أدوار الشبكة (خصوصية):**
  - **المشكلة:** المندوب/المسوّقة كان يرى في القائمة شاشات الشركة الداخلية (طلبات سوريا/تركيا + العملاء والأرشيف). أسوأ: سياسة RLS على `orders` كانت مفتوحة بالكامل (`orders_all USING(true)`) → تسريب بيانات على مستوى الـDB، مش بس UI.
  - **الواجهة:** `navigation.js` — حُذفت أدوار الشبكة من `orders-syria/turkey` و`customers`؛ أُضيف بند **«طلباتي»** (`/my-orders`) لأدوار الشبكة فقط. الشريط السفلي بدّل `orders`→`my-orders`.
  - **شاشة جديدة:** `src/modules/distribution/pages/MyOrdersScreen.jsx` — طلبات المندوب مفلترة بـ`seller_id` + «طلب جديد» مبسّط (عميل من `crm_clients` الخاصين به + سلة منتجات) يضبط `seller_id` + «تم التسليم» يستدعي `postOrderCommission`. (route في paths/AppRoutes، محمي بأدوار الشبكة.) «عملائي» مغطّاة أصلاً بشاشة الزيارات (`FieldCRMScreen` يفلتر بـ`rep_id`).
  - **RLS:** migration جديد `supabase/distribution_system_p6_rls.sql` يستبدل `orders_all` بسياسات «مفتوحة افتراضياً، تقيّد فقط أدوار الشبكة المؤكَّدة» (تفشل مفتوحة عند `auth.uid()=null` فلا تكسر الأونلاين/الجلسة اليدوية). يشمل `crm_clients`. **⚠️ لم يُطبَّق على prod بعد** — يحتاج Backup + تحقّق من سياسة crm_clients الموجودة + التأكد أن أدوار الشبكة مُجهّزة بحساب Supabase Auth (auth.uid=profiles.id) لتفعيل التقييد. `vite build` أخضر.
  - **ملاحظة معمارية مهمة:** المصادقة هجينة (Supabase Auth JWT عند التجهيز + fallback جلسة يدوية بلا JWT). لذلك تأمين RLS بـ`auth.uid()` يعمل فقط للحسابات المُجهّزة بـauth؛ الخصوصية الفعلية الحالية تعتمد على **فلترة client-side** في كل استعلام (`.eq('seller_id'/'rep_id', me)`).
- **8 يونيو 2026 — ✅ إصلاح قائمة الأدوار (المشكلة #1):** السبب الجذري لم يكن كاش PWA بل ثابت `ROLE_LABELS` محلي ذو 6 أدوار داخل `AdminUsersScreen.jsx`. حُذف واستُورد `ROLE_LABELS` الكامل (15 دوراً) من `@data/teams`. الآن تظهر كل الأدوار (مندوب/مسوّقة/مشرفة/وكيل + محاسب/HR/مخزن/تسويق). `vite build` أخضر. **يحتاج push + redeploy على Vercel لتظهر للمالك.** بعدها يُستأنف تست العمولة (المهمة #2).
- **8 يونيو 2026 — 🐛 تست العمولة كشف عطلاً حرِجاً + إصلاح bug في «طلباتي»:**
  - **تست حيّ end-to-end** (مندوب field_rep تجريبي + طلب $100 مُسلّم + استدعاء `post_order_commission` عبر service role): فشل بـ«no unique or exclusion constraint matching the ON CONFLICT».
  - **السبب الجذري:** `apply_seller_progress()` ينفّذ `INSERT INTO notifications ... ON CONFLICT (dedup_key)` لكن `notifications.dedup_key` **بلا قيد UNIQUE على prod** → الـRPC تتراجع كاملة → **المحرّك لا يحتسب أي عمولة حالياً**. (هذا يفسّر لماذا لم يكتمل التست الوظيفي سابقاً.)
  - **الإصلاح:** `supabase/distribution_system_p7_fix.sql` — فهرس فريد جزئي على `notifications(dedup_key) WHERE dedup_key IS NOT NULL`. **⚠️ يحتاج تطبيق DDL على prod** ثم إعادة التست (يُتوقّع $10).
  - **bug في الواجهة (أُصلح):** `MyOrdersScreen.markDelivered` كان يضبط `delivered_at` — **العمود غير موجود في `orders`** (OrdersScreen يحدّث `status` فقط). أُزيل، وإلا كان زر «تم التسليم» سيفشل.
  - **🔴 حاجز تنفيذ DDL:** لا يمكن تطبيق p6 (RLS) ولا p7 (الإصلاح) برمجياً — الـservice_role JWT لم يعد يصلح كلمة مرور قاعدة (Supabase غيّرته؛ pooler الصحيح `aws-1-ap-northeast-1` يردّ «password authentication failed»). يلزم **كلمة مرور قاعدة البيانات** أو **توكن Management API (sbp_)** أو التطبيق يدوياً عبر **SQL Editor**. (الـREST بالـservice_role يكفي لقراءة/كتابة البيانات لكن ليس DDL.)
<!-- أضف الإدخالات الجديدة هنا أعلى السطر، بالتاريخ + ما تغيّر + هل طُبّق على prod -->
