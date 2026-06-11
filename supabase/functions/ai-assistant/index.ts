// =============================================================
// Supabase Edge Function — ai-assistant
// يستدعي Claude API كمساعد ذكي لموظفي لويز Professional
//
// Required Secret: ANTHROPIC_API_KEY
// Deploy: supabase functions deploy ai-assistant --no-verify-jwt
// =============================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── System prompt مع معرفة الشركة الكاملة ─────────────────────
// يبني كتلة دليل الاستخدام من جدول app_guides (المصدر الموحّد).
// أي دليل يُضاف من لوحة الأدمن → لوزي تعرفه فوراً (قراءة وقت الطلب).
function formatGuidesForPrompt(guides: { title: string; icon?: string; why?: string; steps?: string[] }[]) {
  if (!guides || !guides.length) return '(لا يوجد دليل مُحمّل حالياً.)';
  return guides.map((g) => {
    const steps = (g.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n');
    return `### ${g.icon || ''} ${g.title}\n${g.why ? g.why + '\n' : ''}${steps}`;
  }).join('\n\n');
}

function buildSystemPrompt(ctx: {
  userName: string;
  userRole: string;
  isManager: boolean;
  tasks: any[];
  attendance: any;
  leaveBalance: any;
  kpi: any;
  learnedFacts: { fact: string; taught_by?: string }[];
  appGuides: { title: string; icon?: string; why?: string; steps?: string[] }[];
}) {
  const today = new Date().toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return `أنتِ **لوزي** 🌸 — مساعِدة لويز Professional الذكية.
شخصيتكِ: ودودة، مشجِّعة، عملية، تحكين العربية العامية السورية بشكل طبيعي وبدون رسميات زائدة. ردودك مختصرة وواضحة.
تعريفك عن نفسك بسيط: "أنا لوزي، مساعدتك في لويز Professional" — لا تطيلي بالتعريف.
عندما تتذكرين شيئاً من محادثات سابقة، أشيري إليه طبيعياً.

## ⭐ قاعدة ذهبية
أنتِ تعرفين هذا التطبيق بالكامل (دليل الاستخدام تحت). لا تقولي أبداً "ما عندي معلومة" عن أي شيء يخص استخدام التطبيق أو المنتجات أو العمولات أو الإجراءات — كله موجود عندك. وجِّهي للمدير **فقط** للأمور الشخصية الحساسة جداً (مثل تعديل راتب محدد، أو قرار إداري) التي تحتاج صلاحية. غير ذلك، ساعدي دائماً خطوة بخطوة.

## معلومات الموظف الحالي
- الاسم: ${ctx.userName}
- الدور: ${ctx.userRole}
- تاريخ اليوم: ${today}
- صلاحية المدير: ${ctx.isManager ? 'نعم' : 'لا'}

## بيانات الموظف الحية
### مهامه المفتوحة (${ctx.tasks.length}):
${ctx.tasks.length > 0
  ? ctx.tasks.map(t => `- ${t.title} [${t.status}]${t.due_date ? ` — موعد: ${t.due_date.slice(0,10)}` : ''}`).join('\n')
  : '- لا توجد مهام مفتوحة'}

### حضور اليوم:
${ctx.attendance?.checkedIn
  ? `✅ سجّل دخول الساعة ${ctx.attendance.timeIn}`
  : '❌ لم يسجّل دخول اليوم'}
${ctx.attendance?.checkedOut ? `🏠 سجّل خروج الساعة ${ctx.attendance.timeOut}` : ''}

### رصيد الإجازة:
${ctx.leaveBalance
  ? `المخصص: ${ctx.leaveBalance.total} يوم | المستخدم: ${ctx.leaveBalance.used} | المتبقي: ${ctx.leaveBalance.remaining}`
  : 'غير محدد'}

### نتيجة KPI آخر شهر:
${ctx.kpi ? `${ctx.kpi.total_score}/100 — ${ctx.kpi.level}` : 'غير محددة بعد'}

---

## كتالوج منتجات لويز (33 منتج)

### خط البشرة:
- **غسول الوجه (Facial Cleanser Gel)** 250ml | مكونات: هيالورونيك، سيراميد، صبار، خيار | الاستخدام: صباح ومساء | تجنب العينين
- **كريم المرطب (Intense Repair Moisturizer)** 50ml | زبدة الشيا، هيالورونيك، بانثينول، كاليندولا | مرتين يومياً للبشرة الجافة
- **سيروم الريتينول (Retinol Serum 1%)** 30ml | ريتينول 1%، سيراميد، نياسيناميد | **مساءً فقط. ممنوع للحوامل**
- **سيروم البقع (Dark Spot Corrector)** 30ml | Alpha-Arbutin 2%، نياسيناميد، Glutathione | مرتين يومياً + واقي شمس
- **تونر الوجه (Pore Tightening Toner)** 250ml | Glycolic Acid، Salicylic Acid | 2-3 مرات أسبوعياً ليلاً فقط
- **جل مقشّر (Facial Peeling Gel)** 100ml | فيتامين C، سنتيلا آسياتيكا | مرة-مرتين أسبوعياً
- **واقي الشمس الزهري (Pink Sunscreen SPF50+)** 75ml | Calamine، هيالورونيك، Glutathione | قبل الشمس بـ15 دقيقة
- **واقي الشمس البرتقالي (Orange Sunscreen SPF50+)** 75ml | أكاسيد حديدية، هيالورونيك | SPF50+
- **سيروم الترطيب (Intensive Hydration Serum)** 30ml | هيالورونيك، بانثينول، سنتيلا | مرتين يومياً
- **سيروم الكولاجين (Collagen Serum)** 30ml | كولاجين متحلل، هيالورونيك | مرتين يومياً
- **سيروم الحبوب (Anti-Acne Serum)** 30ml | Salicylic Acid، نياسيناميد | مرتين على مناطق الحبوب
- **غسول البشرة الدهنية (Oily Skin Cleanser)** 250ml | للبشرة الدهنية | صباح ومساء
- **سيروم الهالات (Eye Circle Serum)** 15ml | فيتامين K، هيالورونيك | حول العين فقط، لا داخلها
- **ماسك الكولاجين (Collagen Mask)** | كولاجين، مضادات أكسدة | 15-20 دقيقة أسبوعياً
- **كريم الريتينال شوت (Retinal Shot)** | **ريتينال أقوى من الريتينول. ممنوع للحوامل. مساء فقط. ابدأ مرة/أسبوع**
- **كريم بكج الرز (Rice Milk Spot Cream)** 50ml | ماء الأرز، Alpha-Arbutin، نياسيناميد | مرتين يومياً

### خط الشعر:
- **شامبو روزماري (Rosemary Shampoo)** 250ml | روزماري، كيراتين، كولاجين، بيوتين | يومي
- **زيت روزماري الشعر (Rosemary Hair Oil)** 50ml | 20+ زيت طبيعي (جوجوبا، أرجان، حبة سوداء...) | يصلح للرموش والحواجب أيضاً
- **ماء الروزماري النقي (Pure Rosemary Water)** 100ml | **Rosmarinus Officinalis فقط — 100% طبيعي** | رشّ بدون شطف
- **سيروم الدقن (Beard Serum)** 30ml | جوجوبا، كافيين، Formononetin | **للرجال فقط** | 30-60 دقيقة ثم شطف

### خط الجسم:
- **سكراب الجسم بالفراولة (Strawberry Body Scrub)** 275g | ملح الصخر، جلسرين | على بشرة مبللة 5 دقائق
- **زيت المساج (Massage Oil)** 150ml | زيوت طبيعية، عطر فراولة | لا يحتاج شطف
- **جل شد الجسم (Body Firming Gel)** 250ml | كافيين، فلفل حار، زيت أفوكادو | مرتين يومياً
- **كريم التبييض (Skin Whitening Cream)** 50ml | نياسيناميد، Kojic Acid، Alpha-Arbutin، Glutathione، Tranexamic Acid | مرتين يومياً
- **كريم إزالة الشعر (Hair Removal Cream)** 100ml | Calcium Thioglycolate | **7-9 دقائق فقط. لا على الوجه أو المناطق الحساسة**
- **سيروم الصدر (Breast Firming Serum)** 30ml | Kigelia Africana، Capryloyl Glycine | مرتين يومياً، لا يُغسل
- **كريم الصدر (Breast Care Cream)** 50ml | Kigelia Africana، Menthol | مرتين يومياً
- **كريم القدمين (Foot Care Cream)** | مرطبات مكثفة | ليلاً مع قفازات
- **تونر الجسم (Body Toner)** | شد وترطيب | بعد الاستحمام

---

## نظام العمولات (SALES_RULES.md)
- **مبتدئ:** 8% عمولة | هدف 25 طلب/شهر | 15-25 عميل
- **نشيط:** 5% هامش + 3% بونص عند الهدف | 60 طلب/شهر
- **محترف:** 10% هامش + بونصات تصاعدية | مع مندوبين تحته
- **وكيل منطقة:** 20% هامش + بونص ربعي + صحة الشبكة
- **البونص:** من 1% (80% تحقيق) حتى 12% (150%+ تحقيق) حسب المستوى
- **قاعدة النزول:** 3 شهور دون تحقيق الحد الأدنى = نزول مستوى

## KPI (100 نقطة شهرياً)
- حجم المبيعات 30% | زيارات يومية 15% | عملاء جدد 15%
- إعادة الطلب 15% | نسبة التحصيل 15% | الانضباط 10%
- 90+ نجم | 75-89 متميز | 60-74 مقبول | أقل من 60 ضعيف

## معلومات الشركة
- المقر: تركيا (تصنيع) | أسواق: سوريا، الإمارات، تركيا، الخليج
- سعر واحد للسوق — لا خصومات شخصية أبداً
- العميل ملك الشبكة، التسجيل في CRM إلزامي
- الاسم القانوني: LOWES PROFESYONEL İÇ VE DIŞ TİCARET LİMİTED ŞİRKETİ · سجل تجاري 1120333
- تواصل: info@lowesprofesyonel.com · lowesprofesyonel.com · واتساب +90 551 817 77 98 · إنستغرام @lowes.profesyonel.tr

## 🌸 هوية البراند ونبرته (مهم — تكلّمي وانصحي الفريق بها)
- LOWE'S Professional = **مستشار علمي موثوق بأسلوب صديقة** (فاخر بهدوء، صادق، يدعم المرأة). تأسّس 02.02.2022 كـ«البديل الذي تستحقّينه».
- السلوغان: «عنايةٌ تثقين بها، جمالٌ تستحقّينه». التوقيع: القلب الذهبي 💛. الألوان: ذهبي #C9A646/أبيض/أسود.
- القيم: 💛 المرأة أولاً · 🎗️ دعم سرطان الثدي (أكتوبر) · 🌿 البيئة · 🔬 الجودة والعلم والصدق.
- **نبرة الكلام (4 أعمدة):** علمي وواضح (سمّي المكوّن وآليته) · عملي ومباشر (توقيت النتيجة) · محترم وواثق (لا مبالغة) · بشري ودافئ.
- **ممنوع بأي محتوى/نصيحة:** «الأفضل بالعالم» · «سحري/معجزة» · «حصري جداً» · «ضمان 100%» · تخويف المنافس · أخطاء إملائية. إيموجي 1–2 فقط.
- عند مساعدة موظف بكتابة رسالة لعميل أو محتوى → التزمي بهذه النبرة والقيم.

## 📒 دفتر الحسابات (مساعدة محاسبية)
أنتِ تعرفين دفتر حسابات الشركة وتقدرين تجيبي منه البيانات وتسجّلي قيود جديدة.
- **الأنواع:** income (دخل)، expense (مصروف)، advance (سلفة)، salary (راتب)، transfer (تحويل)
- **طرق الدفع:** cash (نقداً)، bank (تحويل بنكي)، sham_cash (شام كاش)، transfer (حوالة)، card (بطاقة)
- **العملات:** USD ($)، TRY (₺)، SYP (ل.س)
- عند السؤال عن الرصيد أو المصاريف → استخدمي get_accounting_summary
- عند السؤال عن قيود محددة → استخدمي get_accounting_entries
- عند طلب تسجيل قيد جديد → استخدمي create_accounting_entry بعد تأكيد التفاصيل

---

## 📱 دليل استخدام التطبيق (اشرحي منه خطوة بخطوة عند أي سؤال "كيف بدي…")
> هذا الدليل يُبنى تلقائياً من نظام الأدلة في التطبيق — مُحدَّث دائماً.

${formatGuidesForPrompt(ctx.appGuides)}

---

## 🧠 التعلّم من الفريق
إذا علّمك موظف معلومة جديدة وصحيحة تخص العمل (منتج، إجراء، سياسة، رقم تواصل، عرض…)، احفظيها للمستقبل بأن تضيفي في **نهاية ردك** سطراً بهذا الشكل بالضبط:
\`[[LEARN: نص المعلومة باختصار]]\`
(يمكن تكرار السطر لأكثر من معلومة). هذا الوسم داخلي — سيُحذف قبل عرض ردك، فلا تشيري له. اشكري الموظف طبيعياً على المعلومة. لا تستخدمي الوسم للأشياء الشخصية أو المؤقتة، فقط للمعرفة المفيدة للكل.

${ctx.learnedFacts.length > 0 ? `## 📚 معرفة مكتسبة من الفريق (تعلّمتها سابقاً — استخدميها)
${ctx.learnedFacts.map(f => `- ${f.fact}${f.taught_by ? ` (علّمني إياها ${f.taught_by})` : ''}`).join('\n')}
` : ''}
---

## إرشادات الردود
- احكي العربية (عامية سورية طبيعية)، مختصرة وودودة كأنك صديقة بالشغل.
- أسئلة "كيف بدي أعمل كذا" → اشرحي الخطوات من دليل الاستخدام أعلاه.
- أسئلة المهام/الحضور/الإجازة → استخدمي البيانات الحية أعلاه.
- أسئلة المنتجات → من الكتالوج بدقة. أسئلة العمولات → احسبي من SALES_RULES.
- لا تختلقي أرقاماً غير موجودة، لكن لا تردّي "ما بعرف" لأي شيء مشروح هنا.
`;
}

// =============================================================
// Permissions (mirror of src/data/permissions.js) + Agent tools
// =============================================================
const PERMS = {
  ASSIGN_TASKS:'assign_tasks', EDIT_TASK:'edit_task', DELETE_TASK:'delete_task',
  MANAGE_ORDERS:'manage_orders', VIEW_ALL_ATTENDANCE:'view_all_attendance',
  MANAGE_ATTENDANCE:'manage_attendance', APPROVE_LEAVES:'approve_leaves',
  MANAGE_PAYROLL:'manage_payroll', MANAGE_KPI:'manage_kpi', MANAGE_PRODUCTS:'manage_products',
  VIEW_FINANCE:'view_finance', VIEW_ANALYTICS:'view_analytics',
  MANAGE_USERS:'manage_users', MANAGE_SETTINGS:'manage_settings',
};
const ALL_PERMS = Object.values(PERMS);
const ROLE_PERMS: Record<string, string[]> = {
  admin: ALL_PERMS,
  manager: [PERMS.ASSIGN_TASKS,PERMS.EDIT_TASK,PERMS.DELETE_TASK,PERMS.MANAGE_ORDERS,PERMS.VIEW_ALL_ATTENDANCE,PERMS.MANAGE_ATTENDANCE,PERMS.APPROVE_LEAVES,PERMS.MANAGE_PAYROLL,PERMS.MANAGE_KPI,PERMS.MANAGE_PRODUCTS,PERMS.VIEW_FINANCE,PERMS.VIEW_ANALYTICS],
  sales_manager: [PERMS.ASSIGN_TASKS,PERMS.EDIT_TASK,PERMS.DELETE_TASK,PERMS.MANAGE_ORDERS,PERMS.VIEW_ALL_ATTENDANCE,PERMS.MANAGE_KPI,PERMS.MANAGE_PRODUCTS,PERMS.VIEW_ANALYTICS],
  social_manager: [PERMS.ASSIGN_TASKS,PERMS.EDIT_TASK,PERMS.DELETE_TASK,PERMS.VIEW_ALL_ATTENDANCE,PERMS.VIEW_ANALYTICS],
  media_buyer: [PERMS.ASSIGN_TASKS,PERMS.EDIT_TASK,PERMS.DELETE_TASK,PERMS.MANAGE_ORDERS,PERMS.VIEW_ANALYTICS],
  employee: [],
};
function resolvePerms(role: string, extra: string[] = [], denied: string[] = []): Set<string> {
  if (role === 'admin') return new Set(ALL_PERMS);
  const s = new Set([...(ROLE_PERMS[role] ?? []), ...(extra || [])]);
  (denied || []).forEach(p => s.delete(p));
  return s;
}

// Tool definitions (Claude tool-use schema). Each carries a `perm`:
//   null = everyone, or a PERMS key required. Special 'own' handled inline.
const TOOLS = [
  { perm: null, name:'get_my_summary', description:'ملخّص الموظف نفسه: حضوره اليوم، مهامه المفتوحة، رصيد إجازته، نتيجة KPI. للمستخدم عن نفسه.',
    input_schema:{ type:'object', properties:{}, required:[] } },
  { perm: null, name:'list_team', description:'قائمة الفريق/الموظفين النشطين مع المسمى الوظيفي والدور والفريق. فلتر اختياري حسب الفريق.',
    input_schema:{ type:'object', properties:{ team:{type:'string', description:'سوريا/تركيا/ميديا/إدارة (اختياري)'} }, required:[] } },
  { perm: PERMS.VIEW_ALL_ATTENDANCE, name:'get_attendance_report', description:'الحضور والغياب — كشف الدوام: كم موظف حضر ومن غاب ومن تأخّر في يوم. الكلمات المفتاحية: حضور، غياب، تأخّر، دوام، مين حضر، كم حضر.',
    input_schema:{ type:'object', properties:{ date:{type:'string', description:'YYYY-MM-DD (افتراضي اليوم)'}, team:{type:'string'} }, required:[] } },
  { perm: PERMS.VIEW_ANALYTICS, name:'get_sales_report', description:'المبيعات والأرقام المالية — مجاميع المبيعات (TRY/SYP/USD) والتأكيدات. الكلمات المفتاحية: مبيعات، مبلغ، إيراد، تأكيدات، كم بعنا.',
    input_schema:{ type:'object', properties:{ period:{type:'string', enum:['today','month'], description:'افتراضي month'}, team:{type:'string'} }, required:[] } },
  { perm: PERMS.MANAGE_ORDERS, name:'get_orders', description:'كشف الطلبات: فلترة حسب السوق والحالة. عدد وقيمة وأعلى منتجات.',
    input_schema:{ type:'object', properties:{ market:{type:'string', enum:['syria','turkey']}, status:{type:'string'} }, required:[] } },
  { perm: PERMS.ASSIGN_TASKS, name:'get_tasks', description:'قائمة مهام الفريق (لغير صاحبها) مع الحالة والمسؤول والموعد.',
    input_schema:{ type:'object', properties:{ status:{type:'string'}, assignee:{type:'string', description:'اسم الموظف'} }, required:[] } },
  { perm: PERMS.ASSIGN_TASKS, name:'create_task', description:'إنشاء مهمة واحدة وإسنادها لموظف (مع موعد كتذكير).',
    input_schema:{ type:'object', properties:{ title:{type:'string'}, assignee_name:{type:'string'}, due_date:{type:'string', description:'YYYY-MM-DD'}, priority:{type:'string', enum:['low','medium','high']}, description:{type:'string'} }, required:['title'] } },
  { perm: PERMS.ASSIGN_TASKS, name:'create_tasks_bulk', description:'التخطيط والجدولة: إنشاء عدة مهام دفعة واحدة (مثلاً تقسيم خطة/مشروع إلى خطوات، أو توزيع مهام على عدة موظفين). الكلمات: خطّط، جدول، قسّم، أنشئ عدة مهام، خطة عمل.',
    input_schema:{ type:'object', properties:{ tasks:{ type:'array', description:'قائمة المهام', items:{ type:'object', properties:{ title:{type:'string'}, assignee_name:{type:'string'}, due_date:{type:'string', description:'YYYY-MM-DD'}, priority:{type:'string', enum:['low','medium','high']}, description:{type:'string'} }, required:['title'] } } }, required:['tasks'] } },
  { perm: PERMS.EDIT_TASK, name:'update_task_status', description:'تحديث حالة مهمة (مثلاً done / in_progress).',
    input_schema:{ type:'object', properties:{ title:{type:'string', description:'عنوان المهمة'}, status:{type:'string', enum:['todo','in_progress','review','done']} }, required:['title','status'] } },
  { perm: PERMS.MANAGE_SETTINGS, name:'create_announcement', description:'نشر إعلان/تعميم للفريق.',
    input_schema:{ type:'object', properties:{ title:{type:'string'}, body:{type:'string'} }, required:['title','body'] } },
  { perm: PERMS.APPROVE_LEAVES, name:'get_pending_requests', description:'الطلبات المعلّقة (إجازات/سلف/أذونات) بانتظار الموافقة. الكلمات المفتاحية: طلبات، إجازات معلّقة، سلف، موافقات.',
    input_schema:{ type:'object', properties:{ type:{type:'string', enum:['leave','advance','permission','other']} }, required:[] } },
  { perm: PERMS.APPROVE_LEAVES, name:'approve_request', description:'الموافقة على طلب إجازة/سلفة لموظف.',
    input_schema:{ type:'object', properties:{ employee_name:{type:'string'}, note:{type:'string'} }, required:['employee_name'] } },
  { perm: PERMS.MANAGE_ORDERS, name:'update_order_status', description:'تحديث حالة طلب (وارد→تجهيز→شحن→توصيل...). الكلمات المفتاحية: حالة الطلب، شحن، توصيل.',
    input_schema:{ type:'object', properties:{ order_id:{type:'string', description:'رقم الطلب'}, status:{type:'string', enum:['pending','preparing','shipped','delivered','cancelled']} }, required:['order_id','status'] } },

  // ── Accounting tools (VIEW_FINANCE permission) ──────────────────────────────
  { perm: PERMS.VIEW_FINANCE, name:'get_accounting_summary', description:'ملخص دفتر الحسابات: الدخل والمصاريف والسلف والرصيد الصافي. الكلمات: رصيد، دخل، مصاريف، ميزانية، حسابات، ربح، خسارة.',
    input_schema:{ type:'object', properties:{ from:{type:'string', description:'YYYY-MM-DD (اختياري)'}, to:{type:'string', description:'YYYY-MM-DD (اختياري)'} }, required:[] } },
  { perm: PERMS.VIEW_FINANCE, name:'get_accounting_entries', description:'قائمة قيود المحاسبة مع فلترة حسب النوع والتاريخ والتصنيف. الكلمات: مصاريف، دخل، سلف، رواتب، تحويلات.',
    input_schema:{ type:'object', properties:{ type:{type:'string', enum:['income','expense','advance','salary','transfer']}, from:{type:'string'}, to:{type:'string'}, category:{type:'string'}, limit:{type:'number'} }, required:[] } },
  { perm: PERMS.VIEW_FINANCE, name:'create_accounting_entry', description:'إضافة قيد جديد في دفتر الحسابات. الكلمات: اضف مصروف، سجّل دخل، قيد جديد.',
    input_schema:{ type:'object', properties:{ entry_type:{type:'string', enum:['income','expense','advance','salary','transfer']}, description:{type:'string'}, amount_usd:{type:'number'}, amount_try:{type:'number'}, amount_syp:{type:'number'}, category:{type:'string'}, payment_method:{type:'string', enum:['cash','bank','sham_cash','transfer','card']}, entry_date:{type:'string'}, notes:{type:'string'} }, required:['entry_type','description'] } },
];

// Least-privilege: a user only SEES the tools their permissions allow.
// (runTool still re-checks as defense-in-depth.)
function toolsForUser(perms: Set<string>) {
  return TOOLS.filter(t => !t.perm || perms.has(t.perm))
    .map(t => ({ name:t.name, description:t.description, input_schema:t.input_schema }));
}

// Execute one tool with permission enforcement. Returns a string result.
async function runTool(supabase: any, name: string, input: any, ctx: { userId:string; userName:string; role:string; perms:Set<string> }): Promise<string> {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) return 'أداة غير معروفة.';
  // Permission gate
  if (tool.perm && !ctx.perms.has(tool.perm)) {
    return `🚫 لا تملك صلاحية تنفيذ هذا الإجراء (${name}). هذا الأمر متاح لمن لديه صلاحية أعلى فقط.`;
  }
  const todayISO = new Date().toISOString().slice(0,10);
  const slash = (d: Date) => `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;

  try {
    switch (name) {
      case 'get_my_summary': {
        const ds = slash(new Date());
        const [att, tk] = await Promise.all([
          supabase.from('attendance').select('type,time_in').eq('employee_name', ctx.userName).eq('date', ds),
          supabase.from('tasks').select('title,status,due_date').or(`assignee_id.eq.${ctx.userId},assigned_to.eq.${ctx.userId}`).not('status','in','("done","completed","cancelled")').limit(15),
        ]);
        return JSON.stringify({ attendance: att.data ?? [], openTasks: tk.data ?? [] });
      }
      case 'list_team': {
        let q = supabase.from('profiles').select('employee_name,job_title,role_type,team').eq('is_active', true).order('team');
        if (input.team) q = q.eq('team', input.team);
        const { data } = await q;
        return JSON.stringify(data ?? []);
      }
      case 'get_attendance_report': {
        const ds = input.date ? input.date.replace(/-/g,'/') : slash(new Date());
        let q = supabase.from('attendance').select('employee_name,type,time_in,status,was_late,team').eq('date', ds);
        if (input.team) q = q.eq('team', input.team);
        const { data } = await q;
        const ins = (data ?? []).filter((r:any)=>r.type==='in');
        return JSON.stringify({ date: ds, present: ins.length, late: ins.filter((r:any)=>r.was_late).length, records: ins });
      }
      case 'get_sales_report': {
        const period = input.period || 'month';
        const since = period==='today' ? todayISO : todayISO.slice(0,8)+'01';
        let q = supabase.from('daily_reports').select('total_sales_try,total_sales_syp,total_sales_usd,total_confirmations,team,report_date').gte('report_date', since);
        if (input.team) q = q.eq('team', input.team);
        const { data } = await q;
        const sum = (data??[]).reduce((a:any,r:any)=>({try:a.try+ +r.total_sales_try||0, syp:a.syp+ +r.total_sales_syp||0, usd:a.usd+ +r.total_sales_usd||0, conf:a.conf+ +r.total_confirmations||0}),{try:0,syp:0,usd:0,conf:0});
        return JSON.stringify({ period, ...sum, reports: (data??[]).length });
      }
      case 'get_orders': {
        const since = todayISO.slice(0,8)+'01';
        let q = supabase.from('orders').select('status,amount,currency,market,items').gte('order_date', since+'T00:00:00');
        if (input.market) q = q.eq('market', input.market);
        if (input.status) q = q.eq('status', input.status);
        const { data } = await q;
        const byStatus:any = {}; (data??[]).forEach((o:any)=>byStatus[o.status]=(byStatus[o.status]||0)+1);
        return JSON.stringify({ total:(data??[]).length, byStatus });
      }
      case 'get_tasks': {
        let q = supabase.from('tasks').select('id,title,status,priority,due_date,assigned_to').order('created_at',{ascending:false}).limit(30);
        if (input.status) q = q.eq('status', input.status);
        const { data } = await q;
        let rows = data ?? [];
        // Resolve assignee names + optional filter by assignee
        const ids = [...new Set(rows.map((r:any)=>r.assigned_to).filter(Boolean))];
        let nameById:Record<string,string> = {};
        if (ids.length) {
          const { data: ps } = await supabase.from('profiles').select('id,employee_name').in('id', ids);
          (ps??[]).forEach((p:any)=>nameById[p.id]=p.employee_name);
        }
        rows = rows.map((r:any)=>({ ...r, assignee: nameById[r.assigned_to] ?? null }));
        if (input.assignee) rows = rows.filter((r:any)=>(r.assignee||'').includes(input.assignee));
        return JSON.stringify(rows);
      }
      case 'create_task': {
        const row:any = { title: input.title, priority: input.priority||'medium', created_by: ctx.userId };
        if (input.description) row.description = input.description;
        if (input.due_date) row.due_date = input.due_date;
        let assignedName = null;
        if (input.assignee_name) {
          const { data: p } = await supabase.from('profiles').select('id,employee_name').ilike('employee_name', `%${input.assignee_name}%`).limit(1).maybeSingle();
          if (p) { row.assigned_to = p.id; row.assignee_id = p.id; assignedName = p.employee_name; }
        }
        const { data, error } = await supabase.from('tasks').insert(row).select('id,title').single();
        if (error) return 'فشل إنشاء المهمة: '+error.message;
        return '✅ أُنشئت المهمة "'+data.title+'"'+(assignedName?(' وأُسندت إلى '+assignedName):'')+'.';
      }
      case 'create_tasks_bulk': {
        const items = Array.isArray(input.tasks) ? input.tasks : [];
        if (!items.length) return 'لم تُحدّد أي مهام للإنشاء.';
        if (items.length > 30) return 'الحد الأقصى 30 مهمة في الدفعة الواحدة.';
        // Resolve assignee names once (avoid repeated lookups for the same person)
        const nameCache: Record<string,{id:string;name:string}|null> = {};
        const resolveAssignee = async (nm?: string) => {
          if (!nm) return null;
          if (nm in nameCache) return nameCache[nm];
          const { data: p } = await supabase.from('profiles').select('id,employee_name').ilike('employee_name', `%${nm}%`).limit(1).maybeSingle();
          return (nameCache[nm] = p ? { id: p.id, name: p.employee_name } : null);
        };
        const rows: any[] = [];
        for (const t of items) {
          if (!t?.title) continue;
          const row: any = { title: t.title, priority: t.priority || 'medium', created_by: ctx.userId };
          if (t.description) row.description = t.description;
          if (t.due_date) row.due_date = t.due_date;
          const a = await resolveAssignee(t.assignee_name);
          if (a) { row.assigned_to = a.id; row.assignee_id = a.id; }
          rows.push(row);
        }
        if (!rows.length) return 'لا توجد مهام صالحة (كل عنصر يحتاج عنواناً).';
        const { data, error } = await supabase.from('tasks').insert(rows).select('id,title');
        if (error) return 'فشل إنشاء المهام: '+error.message;
        const assignedCount = rows.filter(r => r.assigned_to).length;
        return `✅ أُنشئت ${data.length} مهمة دفعة واحدة${assignedCount?` (${assignedCount} منها مُسندة لموظفين)`:''}.`;
      }
      case 'update_task_status': {
        const { data: t } = await supabase.from('tasks').select('id,title').ilike('title', `%${input.title}%`).limit(1).maybeSingle();
        if (!t) return 'لم أجد مهمة بهذا العنوان.';
        const { error } = await supabase.from('tasks').update({ status: input.status, updated_at: new Date().toISOString() }).eq('id', t.id);
        if (error) return 'فشل التحديث: '+error.message;
        return `✅ حُدّثت حالة "${t.title}" إلى ${input.status}`;
      }
      case 'create_announcement': {
        const { error } = await supabase.from('announcements').insert({ title: input.title, body: input.body, created_by: ctx.userId, is_pinned:false });
        if (error) return 'فشل النشر: '+error.message;
        return '✅ نُشر الإعلان: '+input.title;
      }
      case 'get_pending_requests': {
        let q = supabase.from('requests').select('employee_name,request_type,start_date,end_date,amount,currency,reason,team').eq('status','pending').order('created_at',{ascending:false}).limit(40);
        if (input.type) q = q.eq('request_type', input.type);
        const { data } = await q;
        return JSON.stringify({ count:(data??[]).length, requests: data ?? [] });
      }
      case 'approve_request': {
        const { data: r } = await supabase.from('requests').select('id,employee_name,request_type').eq('status','pending').ilike('employee_name', `%${input.employee_name}%`).order('created_at',{ascending:false}).limit(1).maybeSingle();
        if (!r) return 'لا يوجد طلب معلّق بهذا الاسم.';
        const { error } = await supabase.from('requests').update({ status:'approved', reviewed_by: ctx.userName, reviewed_at: new Date().toISOString(), admin_note: input.note ?? null }).eq('id', r.id);
        if (error) return 'فشل الموافقة: '+error.message;
        return `✅ تمت الموافقة على طلب ${r.request_type} لـ ${r.employee_name}.`;
      }
      case 'update_order_status': {
        const { data: o } = await supabase.from('orders').select('id,order_id,customer_name').eq('order_id', input.order_id).limit(1).maybeSingle();
        if (!o) return 'لم أجد طلباً بهذا الرقم.';
        const { error } = await supabase.from('orders').update({ status: input.status, updated_at: new Date().toISOString() }).eq('id', o.id);
        if (error) return 'فشل التحديث: '+error.message;
        return `✅ حُدّثت حالة الطلب ${o.order_id} (${o.customer_name}) إلى ${input.status}.`;
      }

      // ── Accounting ────────────────────────────────────────────────────────────
      case 'get_accounting_summary': {
        let q = supabase.from('accounting_entries').select('entry_type,amount_usd,amount_try,amount_syp,entry_date');
        if (input.from) q = q.gte('entry_date', input.from);
        if (input.to)   q = q.lte('entry_date', input.to);
        const { data, error } = await q;
        if (error) return 'خطأ في جلب الحسابات: '+error.message;
        const rows = data ?? [];
        const sum = (type: string) => rows.filter((r:any)=>r.entry_type===type).reduce((s:number,r:any)=>s+Number(r.amount_usd||0),0);
        const income  = sum('income');
        const expense = sum('expense');
        const salary  = sum('salary');
        const advance = sum('advance');
        const balance = income - expense - salary;
        const sumTRY  = rows.reduce((s:number,r:any)=>s+Number(r.amount_try||0),0);
        const sumSYP  = rows.reduce((s:number,r:any)=>s+Number(r.amount_syp||0),0);
        return JSON.stringify({ income, expense, advance, salary, balance, totalEntries: rows.length,
          totalTRY: sumTRY, totalSYP: sumSYP,
          period: input.from ? `${input.from} → ${input.to||todayISO}` : 'كل الوقت' });
      }
      case 'get_accounting_entries': {
        let q = supabase.from('accounting_entries').select('entry_type,description,amount_usd,amount_try,amount_syp,category,payment_method,entry_date,notes').order('entry_date', {ascending:false}).limit(input.limit||20);
        if (input.type)     q = q.eq('entry_type', input.type);
        if (input.from)     q = q.gte('entry_date', input.from);
        if (input.to)       q = q.lte('entry_date', input.to);
        if (input.category) q = q.ilike('category', `%${input.category}%`);
        const { data, error } = await q;
        if (error) return 'خطأ: '+error.message;
        return JSON.stringify({ count: (data??[]).length, entries: data ?? [] });
      }
      case 'create_accounting_entry': {
        const today2 = new Date().toISOString().slice(0,10);
        const row = {
          entry_type:     input.entry_type,
          description:    input.description,
          amount_usd:     Number(input.amount_usd||0),
          amount_try:     Number(input.amount_try||0),
          amount_syp:     Number(input.amount_syp||0),
          category:       input.category || null,
          payment_method: input.payment_method || 'cash',
          entry_date:     input.entry_date || today2,
          notes:          input.notes || null,
          created_by:     ctx.userId,
        };
        const { data, error } = await supabase.from('accounting_entries').insert(row).select('id,description,amount_usd').single();
        if (error) return 'فشل إنشاء القيد: '+error.message;
        return `✅ تم إضافة القيد "${data.description}" بمبلغ $${data.amount_usd} في دفتر الحسابات.`;
      }

      default: return 'غير منفّذ.';
    }
  } catch (e) { return 'خطأ بالتنفيذ: '+String(e); }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { messages, userId, userName, userRole, isManager, extraPermissions, deniedPermissions } = await req.json();

    if (!messages?.length || !userId) {
      return new Response(JSON.stringify({ error: 'messages and userId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Supabase admin client to fetch employee context ───────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch employee's live data in parallel
    const today = new Date();
    const dateSlash = `${today.getFullYear()}/${String(today.getMonth()+1).padStart(2,'0')}/${String(today.getDate()).padStart(2,'0')}`;

    const [tasksRes, attRes, lbRes, kpiRes, knowRes, guidesRes] = await Promise.allSettled([
      supabase.from('tasks').select('title,status,due_date')
        .or(userId ? `assignee_id.eq.${userId},assigned_to.eq.${userId}` : `assigned_to.eq.${userId}`)
        .not('status', 'in', '("done","completed","cancelled")')
        .order('created_at', { ascending: false }).limit(10),

      supabase.from('attendance').select('type,time_in')
        .eq('employee_name', userName).eq('date', dateSlash).in('type', ['in','out']),

      // Leave: compute from approved annual leave_requests (same source as the app UI)
      supabase.from('leave_requests').select('days')
        .eq('employee_id', userId).eq('type', 'annual').eq('status', 'approved')
        .gte('start_date', today.getFullYear() + '-01-01'),

      supabase.from('employee_kpis').select('total_score,level')
        .eq('employee_id', userId)
        .eq('year', today.getFullYear()).eq('month', today.getMonth() + 1).maybeSingle(),

      // Team-taught knowledge — keeps Lozy learning over time
      supabase.from('lozy_knowledge').select('fact,taught_by')
        .eq('is_active', true).order('created_at', { ascending: false }).limit(60),

      // App usage guides — single source feeding Lozy's how-to knowledge
      supabase.from('app_guides').select('title,icon,why,steps')
        .eq('is_published', true).order('sort_order', { ascending: true }),
    ]);

    const tasks       = tasksRes.status === 'fulfilled' ? (tasksRes.value.data ?? []) : [];
    const attRows     = attRes.status === 'fulfilled'   ? (attRes.value.data ?? [])   : [];
    const leaveRows   = lbRes.status === 'fulfilled'    ? (lbRes.value.data ?? [])    : [];
    const kpi         = kpiRes.status === 'fulfilled'   ? kpiRes.value.data           : null;
    const learnedFacts = knowRes.status === 'fulfilled' ? (knowRes.value.data ?? [])  : [];
    const appGuides    = guidesRes.status === 'fulfilled' ? (guidesRes.value.data ?? []) : [];

    const inRow  = attRows.find((r: any) => r.type === 'in');
    const outRow = attRows.find((r: any) => r.type === 'out');
    const attendance = {
      checkedIn:  !!inRow,
      timeIn:     inRow?.time_in ?? null,
      checkedOut: !!outRow,
      timeOut:    outRow?.time_in ?? null,
    };
    const ANNUAL = 15;
    const usedDays = leaveRows.reduce((s: number, r: any) => s + (Number(r.days) || 0), 0);
    const leaveBalance = {
      total:     ANNUAL,
      used:      usedDays,
      remaining: Math.max(0, ANNUAL - usedDays),
    };

    // Resolve the user's effective permissions for tool gating
    const perms = resolvePerms(userRole, extraPermissions ?? [], deniedPermissions ?? []);
    const ctx = { userId, userName, role: userRole, perms };

    const systemPrompt = buildSystemPrompt({ userName, userRole, isManager, tasks, attendance, leaveBalance, kpi, learnedFacts, appGuides })
      + `\n\n## 🛠️ تنفيذ الأوامر — قاعدة حاسمة (أهم شي)
أنتِ الآن **منفِّذة فعلية** (agent) ولستِ مجرد محادِثة. عندك أدوات تنفّذ كشوفات وتقارير وإنشاء مهام وإعلانات.
- إذا طلب المستخدم أي بيان أو إجراء تغطيه أداة → **استدعي الأداة فوراً** ثم اعرضي النتيجة مرتّبة بالعربي.
- **لا تسألي أسئلة توضيحية** إلا للضرورة القصوى. استخدمي القيم الافتراضية المعقولة: التاريخ = اليوم، الفريق = الكل، الفترة = الشهر. مثال: "كم حضر اليوم؟" → نفّذي get_attendance_report مباشرةً (اليوم، كل الفِرق).
- أدواتك المتاحة محدودة بصلاحية المستخدم. إذا طلب إجراءً إدارياً (إنشاء/تعديل/حذف مهمة، إعلان، كشف حضور/مبيعات...) و**لا تملكين أداةً له** → قولي له بوضوح ولطف: «هذا الإجراء يحتاج صلاحية أعلى (مدير/أدمن) وما بقدر أنفّذه إلك» — **وتوقّفي**. لا تشغّلي أداة غير ذات صلة (مثل قائمة الفريق) كبديل أو تعويض.
- **التخطيط والجدولة:** إذا طلب المستخدم خطة عمل أو تقسيم مشروع/هدف إلى خطوات، أو توزيع عدّة مهام على موظفين، أو جدولة مهام بمواعيد → خطّطي الخطوات ثم نفّذي **create_tasks_bulk** دفعة واحدة (مع due_date كموعد/تذكير وassignee_name عند توفّره). لا تنشئي المهام واحدة واحدة إن كانت خطة.
- لا تستخدمي list_team إلا إذا طُلبت قائمة الفريق/الموظفين صراحةً.
- لا تختلقي أرقاماً — فقط ما ترجعه الأدوات. صلاحية المستخدم الحالي: ${userRole}.
- بعد التنفيذ، تكلّمي بطبيعتك الودّية لكن اعرضي الأرقام بدقة.`;

    // ── Agent loop: Claude tool-use with permission-gated execution ──
    const convo: any[] = messages.map((m: any) => ({ role: m.role, content: m.content }));
    const toolDefs = toolsForUser(perms);
    let reply = 'عذراً، لم أستطع المعالجة.';

    for (let iter = 0; iter < 5; iter++) {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':         Deno.env.get('ANTHROPIC_API_KEY')!,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify({
          model:      'claude-sonnet-4-6',
          max_tokens: 1500,
          system:     systemPrompt,
          tools:      toolDefs,
          messages:   convo,
        }),
      });
      if (!claudeRes.ok) throw new Error(`Claude API error: ${await claudeRes.text()}`);
      const data = await claudeRes.json();

      const textBlocks = (data.content ?? []).filter((b:any)=>b.type==='text').map((b:any)=>b.text).join('\n').trim();

      if (data.stop_reason === 'tool_use') {
        // Execute each requested tool, gather results, continue the loop
        convo.push({ role: 'assistant', content: data.content });
        const toolResults: any[] = [];
        for (const block of (data.content ?? [])) {
          if (block.type !== 'tool_use') continue;
          const result = await runTool(supabase, block.name, block.input ?? {}, ctx);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
        convo.push({ role: 'user', content: toolResults });
        if (textBlocks) reply = textBlocks; // keep latest narration as fallback
        continue;
      }

      // end_turn
      reply = textBlocks || reply;
      break;
    }

    // ── Capture [[LEARN: ...]] tags → persist as shared knowledge ──
    const learnMatches = [...reply.matchAll(/\[\[LEARN:\s*([^\]]+?)\s*\]\]/gi)];
    if (learnMatches.length > 0) {
      const rows = learnMatches
        .map(m => m[1].trim())
        .filter(Boolean)
        .map(fact => ({ fact, taught_by: userName ?? null, taught_by_id: userId ?? null }));
      if (rows.length > 0) {
        supabase.from('lozy_knowledge').insert(rows).then(() => {}); // fire-and-forget
      }
      // Strip the tags from what the user sees
      reply = reply.replace(/\[\[LEARN:\s*[^\]]+?\s*\]\]/gi, '').replace(/\n{3,}/g, '\n\n').trim();
    }

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[ai-assistant]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
