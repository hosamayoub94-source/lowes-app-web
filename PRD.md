# PRD — Lowe's Professional Staff App
> Product Requirements Document · يونيو 2026

---

## 1. نظرة عامة

**المنتج:** تطبيق ويب داخلي لإدارة فريق Lowe's Professional — براند عناية البشرة والكوزمتك.

**الشركة:** Lowe's Professional
**المالك:** Ayoub (Hosam) — hosam.ayoub94@gmail.com
**الأسواق:** تركيا 🇹🇷 · سوريا 🇸🇾 · الإمارات · الشرق الأوسط

**الهدف:** بناء منصة واحدة تجمع كل عمليات الفريق — حضور، مبيعات، مهام، محاسبة، CRM، تدريب، إشعارات — بدلاً من الاعتماد على WhatsApp وجداول Excel المتفرقة.

---

## 2. المشكلة

| المشكلة | الأثر |
|---------|-------|
| تتبّع الحضور يدوي (WhatsApp) | لا يوجد سجل موثوق · تلاعب ممكن |
| الطلبات موزّعة على قنوات متعددة | لا رؤية موحّدة · أخطاء في التوصيل |
| المهام تُوزَّع شفهياً | لا متابعة · ضياع المسؤولية |
| محاسبة يدوية في Excel | بطيئة · عرضة للخطأ |
| تدريب الموظفين غير منتظم | ضعف معرفة المنتجات |
| لا تقارير أداء آنية | القرارات تعتمد على الحدس |

---

## 3. المستخدمون

| الدور | الصلاحيات الرئيسية |
|-------|--------------------|
| **Admin** | كل الصلاحيات — إدارة المستخدمين، الإعدادات، التقارير |
| **Manager** | لوحة المدير، الطلبات، الرواتب، المحاسبة، تقارير الفريق |
| **Sales Manager** | الطلبات، المبيعات، الحملات، تقارير المبيعات |
| **Media Buyer** | الحملات الإعلانية، تقارير الإعلانات، المبيعات |
| **Social Manager** | استوديو السوشال، الحملات |
| **Employee** | حضوره فقط، مهامه، تدريبه، ملفه الشخصي |

**الفِرق:**
- سوريا 🇸🇾 — مندوبو المبيعات الميدانيين
- تركيا 🇹🇷 — فريق المبيعات التركي
- ميديا — مديا باير + سوشال
- إدارة — المدراء والأدمن

---

## 4. المتطلبات الوظيفية

### 4.1 نظام الحضور
- تسجيل حضور/انصراف بصورة سيلفي (التحقق الحيوي)
- تحقق من الوجه مقارنةً بصورة مرجعية (`face_descriptor` في profiles)
- منع الانصراف قبل مرور ساعة من الحضور
- لوحة «الموجودون الآن» — live view بالتيم والوقت
- تقرير الحضور للمدراء (متأخر/غائب/حاضر)
- تنبيهات تلقائية للغياب والتأخير

### 4.2 نظام الطلبات (Orders)
- إدارة طلبات سوريا وتركيا في واجهة واحدة
- مراحل الطلب: وارد → تجهيز → جاهز → شحن → توصيل
- منتقي المنتجات من كتالوج 32 منتج (autocomplete + نص حر)
- شركات شحن لكل سوق (سوريا: الكرم/سامتاك... · تركيا: yurtiçi/Aras...)
- حالة دفع ثلاثية: مدفوع / جزئي (paid_amount + متبقّي) / غير مدفوع
- **مساحة «طلباتي»:** كل بائع يشوف طلباته فقط + إحصائيات مبيعاته
- **الفاتورة:** صورة PNG بتصميم Lowe's → مشاركة فورية على WhatsApp
- مزامنة تلقائية مع Google Sheet «LOWES Sales» (سوريا فقط — dual-write)
- رقم تتبع + رابط مباشر لشركات الشحن التركية

### 4.3 نظام المهام
- إنشاء مهمة: تيم → موظف → أولوية → تاريخ استحقاق → رابط + مرفقات
- Kanban drag-and-drop
- @mention في التعليقات → إشعار فوري
- صلاحيات تعديل/حذف للمدراء + media_buyer
- تقرير المهام للمدراء

### 4.4 نظام المبيعات
- تقارير يومية: TRY / SYP / USD + تأكيدات
- أهداف مبيعات شهرية (`sales_targets`)
- لوحة المدير التنفيذية: KPIs حية من الـ DB
- عمولة تلقائية للبائع: `profiles.commission_pct` × إجمالي المسلّم

### 4.5 الرواتب والموارد البشرية
- راتب أساسي + بدل سكن + بدل مواصلات لكل موظف
- دورة رواتب شهرية — «ملء تلقائي» من الـ profiles
- PDF payslip
- نظام طلبات: إجازة / سلفة / إذن (pending → approved/rejected)
- جدول الشيفتات
- تقييم أداء شهري

### 4.6 التدريب اليومي (Quiz)
- سؤال يومي واحد لكل موظف
- أسئلة ذكية بالـ AI (Claude Sonnet) مع web search للمكوّنات
- فئات: منتجات / مكوّنات / مبيعات / عملاء
- شارة ذهبية عند 80% صواب (`employee_certifications`)
- اختبار عند الانصراف (checkout quiz modal)

### 4.7 AI Assistant (لوزي 🌸)
- بوت Claude Sonnet مع tool use — ينفّذ أوامر حقيقية
- أدوات قراءة: ملخصي، الفريق، تقرير الحضور، المبيعات، الطلبات، المهام
- أدوات كتابة: إنشاء مهمة، تحديث حالة مهمة، إعلان جديد
- بوابة صلاحيات: كل أداة محمية بـ `can(PERMISSIONS.X)`
- تتعلّم من الفريق: `[[LEARN: ...]]` → جدول `lozy_knowledge`
- لوحة معرفة لوزي: `/admin/lozy` للأدمن

### 4.8 الإشعارات
- Web Push (VAPID) — تصل والتطبيق مغلق
- مركز إشعارات موحّد في التطبيق
- أنواع: تأخر / غياب / مهمة متأخرة / تغيّر حالة طلب / إعلان / مخصص
- بانر اشتراك بعد الدخول مباشرة

### 4.9 المحادثة (Chat)
- قنوات بالتيم/الموضوع (مثل ديسكورد)
- رسائل + مرفقات + @mention + إيموجي + تمرير (forward)
- read receipts
- بوت أغاني: `/اغنية <رابط>` يشغّل لكل أعضاء القناة
- `/اغنية` يضيف للقائمة · `/تخطي` للأغنية التالية

### 4.10 CRM & الزيارات الميدانية
- إدارة العملاء (`crm_clients`)
- سجل الزيارات الميدانية (`crm_visits`)
- Mystery Shopper — مراقبة الأسعار والجودة

### 4.11 استوديو السوشال
- توليد محتوى بالـ AI: كابشن · أفكار ريلز · رد على عميل · تقويم أسبوعي
- نبرة البراند + كتالوج المنتجات في الـ prompt
- منتقي المنتج من جدول `products`
- زر نسخ + سجل آخر التوليدات

### 4.12 الملف الشخصي
- صورة شخصية (avatar)
- معلومات العمل: دور، تيم، مسمى وظيفي
- الإنجازات + الشارات
- إعدادات: الثيم، الإشعارات، شريك الشيفت
- نظام KPI بـ 100 نقطة

---

## 5. المتطلبات غير الوظيفية

| المتطلب | التفصيل |
|---------|---------|
| **الأداء** | lazy loading لكل شاشة · Supabase Realtime للبيانات الحية |
| **الأمان** | PIN server-side عبر edge fn `verify-pin` · column-level grants على `profiles` · RLS على كل الجداول |
| **اللغة** | عربي كامل · RTL · خط Tajawal |
| **الاستجابة** | Mobile-first · PWA (قابل التثبيت على الهاتف) |
| **الثيم** | Light / Dark mode (CSS variables) |
| **Auth** | PIN 4 أرقام + manual session fallback · التحقق بالوجه للحضور |

---

## 6. الـ Stack التقني

| الطبقة | التقنية |
|--------|---------|
| Frontend | React 18 + Vite 5 |
| Styling | Tailwind CSS v3 + CSS Variables |
| State | Zustand |
| Routing | React Router v6 (lazy loading) |
| Backend | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| AI | Claude Sonnet 4.6 (edge functions) |
| Face | @vladmandic/face-api (browser) |
| Push | Web Push VAPID |
| Charts | recharts |
| Excel | xlsx |
| Invoice | html-to-image |
| Deploy | Vercel (frontend) + Supabase Edge Functions |

---

## 7. قاعدة البيانات — الجداول الرئيسية

| الجدول | الغرض |
|--------|-------|
| `profiles` | الموظفون — PIN · دور · تيم · عمولة · كشف الوجه |
| `attendance` | الحضور — in/out · سيلفي · GPS |
| `orders` | الطلبات — items JSONB · حالة الدفع · paid_amount |
| `tasks` | المهام — Kanban · مرفقات · assignee |
| `daily_reports` | تقارير المبيعات اليومية |
| `notifications` | مركز الإشعارات الموحّد |
| `push_subscriptions` | اشتراكات Web Push |
| `quiz_questions` | أسئلة التدريب (static + AI) |
| `lozy_knowledge` | ما تعلّمته لوزي من الفريق |
| `chat_messages` | رسائل المحادثة |
| `products` | كتالوج 32 منتج + `name_en` للـ sync |

---

## 8. Edge Functions (Supabase)

| الاسم | الوظيفة |
|-------|---------|
| `verify-pin` | التحقق من PIN server-side |
| `sync-order-to-sheet` | مزامنة طلبات سوريا → Google Sheet |
| `ai-assistant` | لوزي — Claude tool use + بوابة صلاحيات |
| `generate-quiz` | توليد سؤال تدريب يومي بالـ AI |
| `social-content` | توليد محتوى سوشال (Claude Sonnet 4.6) |
| `send-push` | إرسال Web Push للموظفين |
| `ask-ai` | AI assistant عام |

---

## 9. الصفحات والمسارات (50+)

| المسار | الشاشة | الأدوار |
|--------|---------|---------|
| `/` | Home | الكل |
| `/attendance` | الحضور + سيلفي | الكل |
| `/tasks` | Kanban المهام | الكل |
| `/orders` | إدارة الطلبات + «طلباتي» | الكل |
| `/training` | التدريب اليومي | الكل |
| `/performance` | KPI + عمولة | الكل |
| `/chat` | المحادثة | الكل |
| `/crm` | CRM | الكل |
| `/field-crm` | الزيارات الميدانية | الكل |
| `/sales` | تقارير المبيعات | مدراء |
| `/payroll` | الرواتب | Admin, Manager |
| `/manager-board` | لوحة المدير التنفيذية | Admin, Manager |
| `/social-studio` | استوديو السوشال | Admin, Manager, Social, Media |
| `/admin/*` | الإدارة الكاملة | Admin فقط |

---

## 10. نظام الصلاحيات

```
PERMISSIONS = {
  VIEW_ORDERS, CREATE_ORDER, EDIT_ORDER,
  VIEW_ALL_ORDERS, ASSIGN_TASKS, EDIT_TASK, DELETE_TASK,
  VIEW_PAYROLL, MANAGE_USERS, VIEW_REPORTS,
  MANAGE_SETTINGS, VIEW_ACCOUNTING, ...
}
```

- كل دور له صلاحيات افتراضية في `ROLE_PERMISSIONS`
- تعديل per-user: `profiles.extra_permissions` + `profiles.denied_permissions` (JSONB)
- الأدمن يمنح/يسحب صلاحيات من شاشة «المستخدمون»

---

## 11. نظام الألوان (Brand)

```css
--navy:  #0f1f3d   /* الرئيسي */
--teal:  #0d7377   /* الثانوي */
--cream: #f8f7f4   /* الخلفية */
```

Dark mode: `[data-theme="dark"]` على `<html>`

---

## 12. Integrations

| النظام | طريقة الربط |
|--------|-------------|
| Google Sheets «LOWES Sales» | Apps Script Web App + edge fn `sync-order-to-sheet` |
| WhatsApp | `wa.me` links + Web Share API للفواتير |
| Web Push | VAPID keys + service worker |
| Claude AI | Anthropic API عبر edge functions |
| Supabase Storage | avatars · attachments · ads · attendance-selfies |

---

## 13. Boot Sequence (main.jsx)

عند تشغيل التطبيق تُنفَّذ هذه الـ subsystems بالترتيب (كل واحدة في safeBoot):

1. EventListeners · 2. Queue · 3. Automation · 4. AttendanceIntegration  
5. FileIntegration · 6. AnalyticsIntegration · 7. CRMIntegration  
8. EnvValidation · 9. TimerTracking · 10. WorkflowMetrics · 11. MaintenanceCleanup

---

## 14. الحالة الحالية (يونيو 2026)

### ✅ مكتمل ومنشور على prod (Vercel)
- نظام الحضور الكامل مع التحقق بالوجه
- نظام الطلبات + مزامنة Google Sheet + منظومة البائع (طلباتي + فاتورة + عمولة)
- المهام v2 — تيم + مرفقات + صلاحيات
- لوزي AI Agent مع tool use + بوابة صلاحيات
- استوديو السوشال (Claude Sonnet 4.6)
- لوحة المدير التنفيذية (KPIs حية)
- نظام الرواتب + PDF payslip
- Web Push Notifications (VAPID)
- التدريب اليومي — أسئلة ذكية بالـ AI
- CRM + الزيارات الميدانية
- نظام الإجازات والسلف والأذونات
- المحادثة مع بوت الأغاني
- نظام الصلاحيات per-user

### ⏳ قيد التطوير / مخطّط
- إضافة `commission_pct` لشاشة تعديل المستخدم (Admin)
- تقرير عمولة شهري للمدير
- إشعار عند تغيّر حالة الطلب للبائع
- مزامنة Google Sheet للسوق التركي

---

## 15. قواعد تقنية حرجة

1. **profiles column grants:** أي عمود جديد يُضاف لـ `profiles` يحتاج فوراً:
   ```sql
   GRANT SELECT (col) ON profiles TO anon, authenticated;
   ```
   وإلا يكسر تسجيل الدخول.

2. **PIN Auth:** التطبيق يستخدم manual session — لا `supabase.functions.invoke`. استخدم `fetch` مباشر مع `Authorization: Bearer <anon_key>`.

3. **Glob لا يعمل** بسبب المسافة في `"lowes app"` — استخدم `Read` بالمسار الكامل.

4. **اختبار العربي في sync:** bash يشوّه العربي في curl — اختبر دائماً عبر browser fetch.

---

*آخر تحديث: يونيو 2026 · المسار: `C:\Users\acer\Desktop\lowes app\lowes-app-web\PRD.md`*
