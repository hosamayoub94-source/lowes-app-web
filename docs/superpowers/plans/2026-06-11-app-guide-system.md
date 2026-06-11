# نظام الدليل المرجعي + تعليم لوزي — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** مصدر واحد (`app_guides`) يغذّي شاشة دليل مخصّصة + زر ❓ السياقي + معرفة لوزي، قابل للتحرير من لوحة أدمن بلا كود.

**Architecture:** جدول Supabase `app_guides` (مقروء anon/PIN). خدمة `guidesService` بدوال نقيّة للفلترة/التجميع. شاشة `/guide` + لوحة `/admin/guides` + `HelpGuide` تقرأ من الخدمة. `ai-assistant` يبني كتلة الدليل ديناميكياً من الجدول.

**Tech Stack:** React 18 + Vite · Zustand · Supabase JS · Tailwind · Deno (edge fn) · node+xlsx غير مطلوب · اختبارات node `.mjs`.

**Reference spec:** `docs/superpowers/specs/2026-06-11-app-guide-system-design.md`

**ملاحظة تنفيذ:** الكتابة على قاعدة الإنتاج يحظرها الـclassifier حتى تصريح المالك الصريح؛ DDL (`CREATE TABLE`) يُنفَّذ عبر لوحة Supabase بجلسة المالك. القراءة بالـanon key متاحة دائماً.

---

## File Structure
- Create `supabase/app_guides.sql` — DDL + seed (idempotent UPSERT).
- Create `src/services/guidesService.js` — fetch + دوال نقيّة (`guidesForUser`, `guidesForRoute`, `groupGuidesBySection`).
- Create `src/screens/GuideScreen.jsx` — شاشة `/guide`.
- Create `src/screens/admin/AdminGuidesScreen.jsx` — CRUD `/admin/guides`.
- Create `test-guides.mjs` — اختبار الدوال النقيّة (جذر المشروع).
- Modify `src/data/permissions.js` — `MANAGE_GUIDES`.
- Modify `src/data/navigation.js` — عنصرا القائمة.
- Modify `src/routes/paths.js` + `src/routes/AppRoutes.jsx` — مساران lazy.
- Modify `src/components/ui/HelpGuide.jsx` — يقرأ من الخدمة.
- Modify `supabase/functions/ai-assistant/index.ts` — كتلة دليل ديناميكية + `formatGuidesForPrompt`.

---

### Task 1: مخطط الجدول + بذور المحتوى (SQL)

**Files:** Create `supabase/app_guides.sql`

- [ ] **Step 1: اكتب الـDDL + البذور**

```sql
-- نظام الدليل المرجعي — مصدر واحد للأدلة (شاشة /guide + ❓ + لوزي)
CREATE TABLE IF NOT EXISTS app_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  section_key text NOT NULL DEFAULT 'core',
  title text NOT NULL,
  icon text DEFAULT '📄',
  why text DEFAULT '',
  steps jsonb NOT NULL DEFAULT '[]',
  tips jsonb NOT NULL DEFAULT '[]',
  routes jsonb NOT NULL DEFAULT '[]',
  permission text,
  sort_order int NOT NULL DEFAULT 100,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE app_guides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_guides_read ON app_guides;
DROP POLICY IF EXISTS app_guides_write ON app_guides;
CREATE POLICY app_guides_read ON app_guides FOR SELECT USING (true);
CREATE POLICY app_guides_write ON app_guides FOR ALL USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON app_guides TO anon, authenticated;

-- البذور (idempotent): أدلة مفصّلة لكل قسم. permission NULL = للجميع.
INSERT INTO app_guides (key, section_key, title, icon, why, steps, tips, routes, permission, sort_order) VALUES
('orders_syria','sales','تنزيل طلبات سوريا','🇸🇾',
 'كل طلب تُدخله ينزل تلقائياً على جدول سوريا (Google Sheet) ويراه فريق المبيعات والمخزن فوراً.',
 '["افتح «طلبات سوريا» من القائمة.","اضغط «+ طلب جديد».","اكتب اسم العميل ورقمه (9 أرقام على الأقل) ومدينته وعنوانه.","اختر المنتجات وكمياتها وطريقة الدفع (كامل/جزئي/آجل).","احفظ — تظهر رسالة «✅ نزل على الجدول · سطر N»."]'::jsonb,
 '[{"type":"warning","text":"لو ظهر «⚠️ فشل» سيُعاد تلقائياً؛ لا تفتح الجدول يدوياً."},{"type":"tip","text":"الحالة يملكها الجدول — غيّرها من الجدول وتصل التطبيق تلقائياً."}]'::jsonb,
 '["/orders/syria"]'::jsonb, NULL, 10),
('orders_turkey','sales','تنزيل طلبات تركيا','🇹🇷',
 'طلبات تركيا (LOWE''S وسترونغ) تتزامن بالاتجاهين مع جدول تركيا، وتربط بشحن يورتيتشي.',
 '["افتح «طلبات تركيا».","اضغط «+ طلب جديد» واختر البراند (LOWE''S أو سترونغ).","أدخل بيانات العميل والمنتجات وطريقة الدفع.","احفظ — ينزل على الجدول في مكانه الصحيح.","لتغيير الحالة استخدم القائمة على كرت الطلب (تنعكس على الجدول)."]'::jsonb,
 '[{"type":"tip","text":"للشحن عبر يورتيتشي: استخدم زر «📤 يورتيتشي» (تصدير Excel) أو «🚚 أنشئ شحنة» على الكرت."}]'::jsonb,
 '["/orders/turkey"]'::jsonb, NULL, 20),
('fulfillment','sales','لوحة التجهيز اليومية','📦',
 'تجمع طلبات اليوم الجاهزة للتجهيز حسب جهة الإرسال لتسريع التحضير والترحيل.',
 '["افتح «التجهيز».","راجع الطلبات مجمّعة حسب السوق وجهة الإرسال.","جهّز الطلبات وعلّمها، ثم رحّلها جماعياً للحالة التالية."]'::jsonb,
 '[{"type":"tip","text":"الترحيل الجماعي متسلسل وآمن — انتظر اكتمال الدفعة."}]'::jsonb,
 '["/fulfillment"]'::jsonb, NULL, 30),
('yurtici_export','sales','شحن يورتيتشي (تصدير Excel)','🚚',
 'يولّد ملف Excel بصيغة يورتيتشي لطلبات تركيا الجاهزة لرفعه دفعة واحدة عبر «Dosya İle Gönderi».',
 '["من «طلبات تركيا» اضغط «📤 يورتيتشي».","أكّد العدد، يُنزَّل ملف Excel.","ارفعه على بوابة يورتيتشي عبر «Dosya İle Gönderi».","اطبع Teslim Listesi وسلّمها للمندوب."]'::jsonb,
 '[{"type":"warning","text":"الطلبات التي لها شحنة مُنشأة سلفاً أو توصيل بالموتور تُستثنى تلقائياً لمنع التكرار."}]'::jsonb,
 '["/orders/turkey"]'::jsonb, NULL, 40),
('attendance','self','الحضور والانصراف','🕐',
 'الحضور يُحتسب في الرواتب والأداء ويُظهر للإدارة من الموجود فعلاً.',
 '["افتح «الحضور».","اضغط «تسجيل الحضور» عند الوصول (الكاميرا تأخذ صورة تأكيد).","عند المغادرة اضغط «تسجيل الانصراف» (بعد ساعة على الأقل)."]'::jsonb,
 '[{"type":"tip","text":"الورديات الليلية التي تنتهي بعد منتصف الليل لا تمنعك من تسجيل حضور جديد في نفس اليوم."}]'::jsonb,
 '["/attendance"]'::jsonb, NULL, 50),
('tasks','core','المهام','✅',
 'تتبّع المهام يضمن عدم ضياع أي عمل ويعطي الإدارة صورة واضحة عن التقدّم.',
 '["افتح «المهام».","اضغط المهمة لرؤية التفاصيل والمرفقات والرابط.","غيّر الحالة عند الإنجاز."]'::jsonb,
 '[]'::jsonb, '["/tasks","/workspace"]'::jsonb, NULL, 60),
('accounting','admin','المحاسبة والخزينة','💰',
 'لوحة الخزائن تُظهر رصيد كل محفظة×عملة لحظياً، والسندات توثّق كل حركة رسمياً.',
 '["افتح «الحسابات».","«+ قيد جديد» لتسجيل دخل/مصروف واختيار المحفظة (نقد/بنك/شام كاش × العملة).","«🧾 سند قبض/صرف» لسند رسمي مرقّم قابل للطباعة.","«🔄 تحويل» للنقل بين المحافظ (يدعم اختلاف العملة).","«📊 تقرير» لصافي الربح وحركة كل محفظة لفترة."]'::jsonb,
 '[{"type":"tip","text":"شام كاش متاح بعملتيه (SYP/USD) ضمن قائمة المحافظ."}]'::jsonb,
 '["/accounting","/ledger"]'::jsonb, 'VIEW_FINANCE', 70),
('inventory','inventory','المخازن والمنتجات','📦',
 'معرفة المخزون لحظياً تمنع نفاد المنتجات أو تكدّسها.',
 '["افتح «المخازن» لرؤية أرصدة كل مخزن.","من له صلاحية يستلم/يخصّص من المخزن المركزي أو يعدّل مخزون المبيعات."]'::jsonb,
 '[]'::jsonb, '["/warehouses","/inventory"]'::jsonb, 'VIEW_INVENTORY', 80),
('campaigns_manage','sales','إدارة الحملات','🎯',
 'تعرف أي إعلان يحقّق مبيعات فعلية وأي موظف يلتزم بالتسجيل.',
 '["اضغط «+ حملة جديدة» وأضف التكلفة والموظفين المكلّفين.","افتح الحملة وأضف الإعلانات.","تابع تبويب «الأداء والالتزام»."]'::jsonb,
 '[]'::jsonb, '["/campaigns"]'::jsonb, 'MANAGE_CAMPAIGNS', 90),
('campaigns_log','sales','تسجيل أداء الإعلانات','📣',
 'تسجيلك اليومي يقيس أداء كل إعلان فعلياً ويُظهر التزامك للميديا باير.',
 '["افتح «الحملات» واختر حملتك المُسندة.","بجانب كل إعلان اضغط «📝 سجّل».","أدخل عدد الرسائل والمشتريات وورديتك وأي ملاحظة."]'::jsonb,
 '[]'::jsonb, '["/campaigns"]'::jsonb, NULL, 95),
('chat','core','المحادثات','💬',
 'مكان موحّد للتواصل بين الفرق بدل الرسائل المتفرّقة.',
 '["افتح «المحادثات».","اختر قناة قسمك أو ابدأ محادثة خاصة.","اسحب للأعلى لرؤية الرسائل الأقدم."]'::jsonb,
 '[]'::jsonb, '["/chat"]'::jsonb, NULL, 100),
('requests','hr','الطلبات والإجازات','📨',
 'كل الطلبات موثّقة في مكان واحد بدل الرسائل المتفرّقة.',
 '["افتح «طلباتي وإجازاتي».","اختر النوع (إجازة/إذن/سلفة…).","اكتب التفاصيل وأرسل وتابع حالة الموافقة."]'::jsonb,
 '[]'::jsonb, '["/requests","/leave"]'::jsonb, NULL, 110),
('training','self','التدريب والأسئلة','🧠',
 'تحسّن معرفتك بالمنتجات يرفع جودة ردّك على العملاء ومبيعاتك.',
 '["يظهر سؤال سريع عند الانصراف أو من «التدريب».","أجب — إجابتك مجهولة تماماً."]'::jsonb,
 '[]'::jsonb, '["/training"]'::jsonb, NULL, 120),
('payroll','hr','الرواتب','💵',
 'رواتب دقيقة مربوطة بالحضور والسلف تقلّل الأخطاء.',
 '["افتح «الرواتب».","الأساسيات تُملأ تلقائياً من ملف الموظف.","عدّل عند الحاجة واعتمد."]'::jsonb,
 '[]'::jsonb, '["/payroll"]'::jsonb, 'MANAGE_PAYROLL', 130),
('permissions_admin','admin','إدارة الصلاحيات','🔑',
 'كل شخص يرى ويفعل ما يخصّ مسؤوليته فقط — أمان وتنظيم.',
 '["من «المستخدمون» عدّل الموظف.","اختر دوره (قالب جاهز).","فعّل أو امنع أي صلاحية فردياً — المعاينة تُظهر العدد الفعّال."]'::jsonb,
 '[]'::jsonb, '["/admin/users"]'::jsonb, 'MANAGE_USERS', 140),
('guides_admin','admin','إدارة الأدلة','📖',
 'تضيف/تعدّل أي دليل بنفسك — يظهر في الدليل ولوزي تعرفه فوراً بلا مبرمج.',
 '["افتح «الإدارة» ← «الأدلة».","اضغط «+ دليل جديد».","اختر القسم واكتب العنوان والخطوات والتنبيهات والصلاحية.","احفظ — يظهر فوراً في /guide لأصحاب الصلاحية ولوزي تعرفه."]'::jsonb,
 '[{"type":"tip","text":"اترك الصلاحية فارغة ليراه الجميع، أو اختر صلاحية لقصره على دور معيّن."}]'::jsonb,
 '["/admin/guides"]'::jsonb, 'MANAGE_GUIDES', 150),
('customers','sales','العملاء والأرشيف','⭐',
 'يكشف العملاء المتكرّرين وكبار المشترين عبر البائعين لتحسين المتابعة.',
 '["افتح «العملاء والأرشيف».","ابحث باسم/رقم العميل.","راجع تاريخ طلباته وتكرارها."]'::jsonb,
 '[]'::jsonb, '["/customers"]'::jsonb, NULL, 160)
ON CONFLICT (key) DO UPDATE SET
  section_key=EXCLUDED.section_key, title=EXCLUDED.title, icon=EXCLUDED.icon,
  why=EXCLUDED.why, steps=EXCLUDED.steps, tips=EXCLUDED.tips, routes=EXCLUDED.routes,
  permission=EXCLUDED.permission, sort_order=EXCLUDED.sort_order, updated_at=now();
```

- [ ] **Step 2: Commit**
```bash
git add supabase/app_guides.sql
git commit -m "feat(guides): app_guides table DDL + seed content"
```

- [ ] **Step 3: نفّذ الـDDL+البذور على Supabase** (لوحة المالك → SQL Editor → الصق app_guides.sql → Run). تحقّق: `SELECT count(*) FROM app_guides;` ≥ 17.

---

### Task 2: خدمة الأدلة + دوال نقيّة + اختبار

**Files:** Create `src/services/guidesService.js`, `test-guides.mjs`

- [ ] **Step 1: اكتب الاختبار الفاشل** (`test-guides.mjs`)
```js
import { guidesForUser, groupGuidesBySection, guidesForRoute } from './src/services/guidesService.js';
let p=0,f=0; const ok=(n,c)=>{c?(p++,console.log('  ✓',n)):(f++,console.error('  ✗',n));};
const G=[
 {key:'a',section_key:'sales',permission:null,routes:['/orders/syria'],sort_order:10},
 {key:'b',section_key:'admin',permission:'VIEW_FINANCE',routes:['/accounting'],sort_order:70},
 {key:'c',section_key:'sales',permission:'MANAGE_CAMPAIGNS',routes:['/campaigns'],sort_order:90},
];
const emp=guidesForUser(G,new Set());           // موظف بلا صلاحيات
ok('null permission مرئي للجميع', emp.some(g=>g.key==='a'));
ok('المحظور لا يظهر بلا صلاحية', !emp.some(g=>g.key==='b'));
const mgr=guidesForUser(G,new Set(['VIEW_FINANCE','MANAGE_CAMPAIGNS']));
ok('صاحب الصلاحية يرى المحمي', mgr.length===3);
const grp=groupGuidesBySection(G);
ok('التجميع يرتّب sales قبل admin', grp.findIndex(s=>s.key==='sales')<grp.findIndex(s=>s.key==='admin'));
ok('قسم sales فيه دليلان', grp.find(s=>s.key==='sales').items.length===2);
const r=guidesForRoute(G,'/accounting');
ok('دليل المسار الحالي أولاً', r[0].key==='b');
console.log(`\n${f===0?'✅':'❌'} pass ${p} fail ${f}`); process.exit(f===0?0:1);
```

- [ ] **Step 2: شغّله ليفشل** — `node test-guides.mjs` → Expected: FAIL (module not found).

- [ ] **Step 3: اكتب الخدمة** (`src/services/guidesService.js`)
```js
import { supabase } from '@services/supabase';
import { GROUP_ORDER, NAV_GROUPS } from '@data/navigation';

let _cache = null;
export async function fetchGuides({ force = false } = {}) {
  if (_cache && !force) return _cache;
  const { data } = await supabase.from('app_guides').select('*')
    .eq('is_published', true).order('sort_order', { ascending: true });
  _cache = data ?? [];
  return _cache;
}
export function invalidateGuides() { _cache = null; }

// دالة نقيّة: فلترة بالصلاحية (null = للجميع)
export function guidesForUser(guides = [], permSet = new Set()) {
  return guides.filter(g => !g.permission || permSet.has(g.permission));
}
// دالة نقيّة: تجميع حسب القسم بترتيب NAV_GROUPS
export function groupGuidesBySection(guides = []) {
  const order = (typeof GROUP_ORDER !== 'undefined' && GROUP_ORDER) || [];
  const keys = [...new Set(guides.map(g => g.section_key || 'core'))];
  keys.sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  return keys.map(key => ({
    key,
    label: (NAV_GROUPS && NAV_GROUPS[key]) || key,
    items: guides.filter(g => (g.section_key || 'core') === key),
  }));
}
// دالة نقيّة: أدلة المسار الحالي أولاً
export function guidesForRoute(guides = [], pathname = '') {
  const match = g => Array.isArray(g.routes) && g.routes.some(r => pathname.startsWith(r));
  return [...guides].sort((a, b) => (match(b) ? 1 : 0) - (match(a) ? 1 : 0));
}
```

- [ ] **Step 4: شغّل الاختبار ليمرّ** — `node test-guides.mjs` → Expected: PASS (6/6). تحقّق أن `GROUP_ORDER`/`NAV_GROUPS` مُصدَّران من `navigation.js`؛ إن لم يكن `GROUP_ORDER` مُصدَّراً أضف `export` له.

- [ ] **Step 5: Commit**
```bash
git add src/services/guidesService.js test-guides.mjs src/data/navigation.js
git commit -m "feat(guides): guidesService + pure filter/group/route helpers + tests"
```

---

### Task 3: صلاحية MANAGE_GUIDES

**Files:** Modify `src/data/permissions.js`

- [ ] **Step 1: أضف الصلاحية** — في كائن `PERMISSIONS` أضف:
```js
MANAGE_GUIDES: 'manage_guides',
```
وفي `PERMISSION_DESCRIPTIONS`:
```js
[PERMISSIONS.MANAGE_GUIDES]: 'إضافة وتعديل أدلة استخدام التطبيق',
```
وأضف `PERMISSIONS.MANAGE_GUIDES` إلى مجموعة الإدارة في `PERMISSION_GROUPS`، وإلى قوالب الأدوار الافتراضية لـ admin و manager (ابحث عن `ROLE_DEFAULT_PERMISSIONS`/قائمة صلاحيات admin/manager وأضفه).

- [ ] **Step 2: تحقّق** — `node -e "import('./src/data/permissions.js').then(m=>console.log(m.PERMISSIONS.MANAGE_GUIDES))"` → `manage_guides`. (لو الاستيراد يحتاج alias، تحقّق بالبناء في Task 6.)

- [ ] **Step 3: Commit**
```bash
git add src/data/permissions.js
git commit -m "feat(guides): MANAGE_GUIDES permission (admin+manager default)"
```

---

### Task 4: شاشة الدليل `/guide`

**Files:** Create `src/screens/GuideScreen.jsx`; Modify `src/routes/paths.js`, `src/routes/AppRoutes.jsx`, `src/data/navigation.js`

- [ ] **Step 1: اكتب الشاشة** (`src/screens/GuideScreen.jsx`)
```jsx
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import { fetchGuides, guidesForUser, groupGuidesBySection } from '@services/guidesService';

export default function GuideScreen() {
  const { permissions } = useAuth();
  const [guides, setGuides] = useState([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({});
  const loc = useLocation();
  useEffect(() => { fetchGuides().then(setGuides); }, [loc.key]);

  const permSet = useMemo(() => new Set(permissions || []), [permissions]);
  const visible = useMemo(() => {
    const mine = guidesForUser(guides, permSet);
    const term = q.trim();
    const filtered = term
      ? mine.filter(g => (g.title + ' ' + (g.why||'') + ' ' + (g.steps||[]).join(' ')).includes(term))
      : mine;
    return groupGuidesBySection(filtered);
  }, [guides, permSet, q]);

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl">📖</span>
        <h1 className="text-lg font-extrabold text-text">دليل التطبيق</h1>
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث في الأدلة…"
        className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text" />
      {visible.length === 0 && <div className="text-muted text-sm py-8 text-center">لا توجد أدلة ضمن صلاحياتك بعد.</div>}
      {visible.map(sec => (
        <div key={sec.key} className="bg-surface border border-border/60 rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 bg-surface-alt font-bold text-sm text-text">{sec.label}</div>
          <div className="divide-y divide-border/40">
            {sec.items.map(g => (
              <div key={g.key} className="p-3">
                <button onClick={() => setOpen(o => ({ ...o, [g.key]: !o[g.key] }))}
                  className="w-full flex items-center justify-between text-right">
                  <span className="flex items-center gap-2 font-bold text-text text-sm">
                    <span>{g.icon}</span>{g.title}</span>
                  <span className="text-muted text-xs">{open[g.key] ? '▲' : '▼'}</span>
                </button>
                {open[g.key] && (
                  <div className="mt-2 space-y-2 text-sm">
                    {g.why && <p className="text-muted">💡 {g.why}</p>}
                    <ol className="list-decimal pr-5 space-y-1 text-text">
                      {(g.steps||[]).map((s,i) => <li key={i}>{s}</li>)}
                    </ol>
                    {(g.tips||[]).map((t,i) => (
                      <p key={i} className={t.type==='warning' ? 'text-red-fg' : 'text-amber-fg'}>
                        {t.type==='warning' ? '⚠️' : '💡'} {t.text}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```
> تحقّق من اسم خاصية الصلاحيات في `useAuth` (قد تكون `permissions` أو `permissionSet`)؛ طابقها. إن كانت Set مسبقاً، احذف `new Set(...)`.

- [ ] **Step 2: أضف المسار** — في `src/routes/paths.js` أضف `GUIDE: '/guide'`. في `AppRoutes.jsx`:
```jsx
const GuideScreen = lazy(() => import('@screens/GuideScreen'));
// ضمن <Routes> داخل ProtectedRoute:
<Route path="/guide" element={<GuideScreen />} />
```

- [ ] **Step 3: أضف للقائمة** — في `src/data/navigation.js` ضمن مصفوفة العناصر:
```js
{ id: 'guide', label: 'دليل التطبيق', icon: '📖', path: '/guide', roles: ALL, group: 'self' },
```

- [ ] **Step 4: Commit**
```bash
git add src/screens/GuideScreen.jsx src/routes/paths.js src/routes/AppRoutes.jsx src/data/navigation.js
git commit -m "feat(guides): /guide screen (sectioned, searchable, permission-filtered)"
```

---

### Task 5: لوحة أدمن `/admin/guides`

**Files:** Create `src/screens/admin/AdminGuidesScreen.jsx`; Modify `src/routes/AppRoutes.jsx`, `src/data/navigation.js`, `src/routes/paths.js`

- [ ] **Step 1: اكتب اللوحة** (`src/screens/admin/AdminGuidesScreen.jsx`)
```jsx
import { useEffect, useState } from 'react';
import { supabase } from '@services/supabase';
import { invalidateGuides } from '@services/guidesService';
import { NAV_GROUPS } from '@data/navigation';
import { PERMISSIONS, PERMISSION_DESCRIPTIONS } from '@data/permissions';

const BLANK = { key:'', section_key:'core', title:'', icon:'📄', why:'',
  steps:[''], tips:[], routes:[], permission:'', sort_order:100, is_published:true };

export default function AdminGuidesScreen() {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null); // null | guide object
  const load = async () => {
    const { data } = await supabase.from('app_guides').select('*').order('sort_order');
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    const g = { ...edit, permission: edit.permission || null,
      steps: (edit.steps||[]).filter(Boolean),
      routes: (edit.routes||[]).filter(Boolean) };
    if (!g.key || !g.title) { alert('المفتاح والعنوان مطلوبان'); return; }
    const { error } = await supabase.from('app_guides').upsert(g, { onConflict: 'key' });
    if (error) { alert('خطأ: ' + error.message); return; }
    invalidateGuides(); setEdit(null); load();
  };
  const del = async (key) => {
    if (!confirm('حذف الدليل؟')) return;
    await supabase.from('app_guides').delete().eq('key', key);
    invalidateGuides(); load();
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="font-extrabold text-text">📖 إدارة الأدلة</h1>
        <button onClick={() => setEdit({ ...BLANK })}
          className="bg-teal-600 text-white rounded-xl px-3 py-1.5 text-sm font-bold">+ دليل جديد</button>
      </div>
      {rows.map(g => (
        <div key={g.key} className="flex items-center justify-between bg-surface border border-border/60 rounded-xl px-3 py-2">
          <span className="text-sm text-text">{g.icon} {g.title} <span className="text-muted text-xs">· {NAV_GROUPS[g.section_key]||g.section_key}{g.permission?` · 🔒${g.permission}`:''}</span></span>
          <span className="flex gap-2">
            <button onClick={() => setEdit({ ...g, permission: g.permission||'' })} className="text-xs text-teal-700">تعديل</button>
            <button onClick={() => del(g.key)} className="text-xs text-red-600">حذف</button>
          </span>
        </div>
      ))}
      {edit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setEdit(null)}>
          <div className="bg-surface rounded-2xl p-4 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-2" onClick={e=>e.stopPropagation()}>
            <input className="w-full border rounded-lg px-2 py-1.5 text-sm" placeholder="المفتاح (مثل orders_syria)" value={edit.key} onChange={e=>setEdit({...edit,key:e.target.value})} />
            <input className="w-full border rounded-lg px-2 py-1.5 text-sm" placeholder="العنوان" value={edit.title} onChange={e=>setEdit({...edit,title:e.target.value})} />
            <div className="flex gap-2">
              <input className="w-20 border rounded-lg px-2 py-1.5 text-sm" placeholder="أيقونة" value={edit.icon} onChange={e=>setEdit({...edit,icon:e.target.value})} />
              <select className="flex-1 border rounded-lg px-2 py-1.5 text-sm" value={edit.section_key} onChange={e=>setEdit({...edit,section_key:e.target.value})}>
                {Object.entries(NAV_GROUPS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <textarea className="w-full border rounded-lg px-2 py-1.5 text-sm" placeholder="لماذا (الفائدة)" value={edit.why} onChange={e=>setEdit({...edit,why:e.target.value})} />
            <label className="text-xs text-muted">الخطوات (سطر لكل خطوة):</label>
            <textarea className="w-full border rounded-lg px-2 py-1.5 text-sm h-24" value={(edit.steps||[]).join('\n')} onChange={e=>setEdit({...edit,steps:e.target.value.split('\n')})} />
            <input className="w-full border rounded-lg px-2 py-1.5 text-sm" placeholder="المسارات (مفصولة بفاصلة، مثل /orders/syria)" value={(edit.routes||[]).join(',')} onChange={e=>setEdit({...edit,routes:e.target.value.split(',').map(s=>s.trim())})} />
            <select className="w-full border rounded-lg px-2 py-1.5 text-sm" value={edit.permission} onChange={e=>setEdit({...edit,permission:e.target.value})}>
              <option value="">— للجميع —</option>
              {Object.values(PERMISSIONS).map(p=><option key={p} value={p}>{PERMISSION_DESCRIPTIONS[p]||p}</option>)}
            </select>
            <input type="number" className="w-full border rounded-lg px-2 py-1.5 text-sm" placeholder="الترتيب" value={edit.sort_order} onChange={e=>setEdit({...edit,sort_order:Number(e.target.value)})} />
            <div className="flex gap-2 pt-2">
              <button onClick={save} className="flex-1 bg-teal-600 text-white rounded-xl py-2 text-sm font-bold">حفظ</button>
              <button onClick={()=>setEdit(null)} className="flex-1 bg-surface-alt rounded-xl py-2 text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```
> ملاحظة: `tips` تُحرَّر لاحقاً يدوياً عبر القاعدة في v1 (اللوحة تركّز على الحقول الأساسية). إن أردت دعم `tips` بالنموذج أضف textarea مماثلاً يحلّل `type|text`.

- [ ] **Step 2: المسار + القائمة** — `paths.js`: `ADMIN_GUIDES:'/admin/guides'`. `AppRoutes.jsx`:
```jsx
const AdminGuidesScreen = lazy(() => import('@screens/admin/AdminGuidesScreen'));
<Route path="/admin/guides" element={<AdminGuidesScreen />} />
```
`navigation.js` (ضمن قسم admin):
```js
{ id: 'admin-guides', label: 'إدارة الأدلة', icon: '📖', path: '/admin/guides', roles: [A, M], group: 'admin', perm: P.MANAGE_GUIDES },
```

- [ ] **Step 3: Commit**
```bash
git add src/screens/admin/AdminGuidesScreen.jsx src/routes/paths.js src/routes/AppRoutes.jsx src/data/navigation.js
git commit -m "feat(guides): admin CRUD panel /admin/guides (MANAGE_GUIDES)"
```

---

### Task 6: ربط HelpGuide بالخدمة

**Files:** Modify `src/components/ui/HelpGuide.jsx`

- [ ] **Step 1: استبدل مصدر البيانات** — بدّل استيراد `GUIDES` من `@data/guides` بـ:
```jsx
import { fetchGuides, guidesForUser, guidesForRoute } from '@services/guidesService';
```
وداخل المكوّن حمّل الأدلة بـ`useEffect(()=>{fetchGuides().then(setList)},[])`، طبّق `guidesForUser(list, permSet)` ثم `guidesForRoute(...)` بمسار `useLocation`. حوّل عرض `what/how/why` القديم إلى `why + steps[] + tips[]` (نفس عرض GuideScreen). أزل أي اعتماد على `guides.js`.

- [ ] **Step 2: تحقّق البناء** — `npm run build` → Expected: `✓ built`. أصلح أي استيراد مكسور.

- [ ] **Step 3: Commit**
```bash
git add src/components/ui/HelpGuide.jsx
git commit -m "refactor(guides): HelpGuide reads from guidesService (single source)"
```

---

### Task 7: تعليم لوزي ديناميكياً

**Files:** Modify `supabase/functions/ai-assistant/index.ts`; Create `test-lozy-guides.mjs`

- [ ] **Step 1: اكتب اختبار المُنسِّق** (`test-lozy-guides.mjs`)
```js
// نسخة مطابقة لدالة formatGuidesForPrompt المُضمَّنة في index.ts (اختبار منطق التنسيق)
function formatGuidesForPrompt(guides){
  if(!guides||!guides.length) return '';
  return guides.map(g=>{
    const steps=(g.steps||[]).map((s,i)=>`${i+1}. ${s}`).join('\n');
    return `### ${g.icon||''} ${g.title}\n${g.why?g.why+'\n':''}${steps}`;
  }).join('\n\n');
}
let p=0,f=0; const ok=(n,c)=>{c?(p++,console.log('  ✓',n)):(f++,console.error('  ✗',n));};
const out=formatGuidesForPrompt([{icon:'🇸🇾',title:'طلبات سوريا',why:'تنزل للجدول',steps:['افتح','احفظ']}]);
ok('فيه العنوان', out.includes('طلبات سوريا'));
ok('خطوات مرقّمة', out.includes('1. افتح') && out.includes('2. احفظ'));
ok('فارغ يرجّع نص فارغ', formatGuidesForPrompt([])==='');
console.log(`\n${f===0?'✅':'❌'} pass ${p} fail ${f}`); process.exit(f===0?0:1);
```

- [ ] **Step 2: شغّله ليمرّ** — `node test-lozy-guides.mjs` → PASS (3/3). (يثبت منطق التنسيق قبل دمجه في Deno.)

- [ ] **Step 3: عدّل edge fn** — في `supabase/functions/ai-assistant/index.ts`:
  1. أضف الدالة `formatGuidesForPrompt(guides)` (نفس المنطق أعلاه) قرب `buildSystemPrompt`.
  2. في كتلة جلب البيانات المتوازية (حيث تُجلب `lozy_knowledge`)، أضف:
  ```ts
  supabase.from('app_guides').select('title,icon,why,steps').eq('is_published', true).order('sort_order'),
  ```
  واقرأ نتيجتها في متغيّر `appGuides`.
  3. مرّر `appGuides` إلى `buildSystemPrompt`، واستبدل بلوك «📱 دليل استخدام التطبيق الكامل» الثابت بـ:
  ```ts
  `## 📱 دليل استخدام التطبيق (اشرحي منه خطوة بخطوة عند أي سؤال "كيف بدي…")\n${formatGuidesForPrompt(appGuides)}`
  ```
  احتفظ بالجملة التوجيهية «اشرحي الخطوات من دليل الاستخدام أعلاه».

- [ ] **Step 4: تحقّق صياغة Deno** — `deno check supabase/functions/ai-assistant/index.ts` (إن توفّر deno) أو راجع بصرياً عدم كسر الأقواس.

- [ ] **Step 5: Commit + نشر** — الـpush يشغّل `deploy-functions.yml`:
```bash
git add supabase/functions/ai-assistant/index.ts test-lozy-guides.mjs
git commit -m "feat(guides): Lozy builds usage guide dynamically from app_guides"
```

---

### Task 8: تنظيف + توثيق

**Files:** Modify `src/data/guides.js` (إزالة الاستخدام)، `HANDOFF.md`، ملفات الذاكرة

- [ ] **Step 1: أزل استيرادات `guides.js`** — تأكّد عبر بحث `from '@data/guides'` ألا مرجع متبقٍّ؛ احذف الملف أو أبقِه برأس «مُرحَّل إلى app_guides (مرجع تاريخي)».
- [ ] **Step 2: حدّث HANDOFF** — أضف قسماً علوياً: نظام الدليل (app_guides) + عملية «أضفنا مشروع: Admin→الأدلة→+دليل».
- [ ] **Step 3: حدّث الذاكرة** — ملف ذاكرة جديد `app_guide_system.md` + سطر بالـindex.
- [ ] **Step 4: Commit**
```bash
git add -A && git commit -m "docs(guides): HANDOFF + memory + retire guides.js runtime use"
```

---

### Task 9: تحقّق حيّ نهائي
- [ ] `npm run build` أخضر.
- [ ] معاينة: `/guide` يعرض أقسام مفلترة بالدور (موظف يرى العام فقط، مدير يرى المحمي).
- [ ] لوحة `/admin/guides`: إضافة دليل تجريبي → يظهر في `/guide` → احذفه.
- [ ] زر ❓ على شاشة طلبات سوريا يفتح دليلها أولاً.
- [ ] (بعد نشر edge fn) اسأل لوزي «كيف بدي أنزّل طلب سوريا؟» → تشرح الخطوات.

---

## Self-Review
- **تغطية الـspec:** الجدول (T1) · الخدمة+النقيّات (T2) · الصلاحية (T3) · شاشة /guide (T4) · لوحة الأدمن (T5) · HelpGuide (T6) · لوزي (T7) · التنظيف/التوثيق (T8) · التحقّق (T9). كل بنود الـspec مغطّاة.
- **اتساق الأنواع:** `guidesForUser/groupGuidesBySection/guidesForRoute/fetchGuides/invalidateGuides` ثابتة الأسماء عبر T2/T4/T5/T6. `formatGuidesForPrompt` ثابت T7. أعمدة الجدول ثابتة عبر SQL/الخدمة/اللوحة.
- **placeholders:** لا يوجد — كل خطوة فيها كود فعلي. (تحرير `tips` بالنموذج مؤجّل صراحةً، يُحرَّر بالقاعدة.)
- **مخاطر التنفيذ:** DDL يدوي عبر لوحة Supabase (T1 S3) · تأكيد اسم خاصية الصلاحيات بـuseAuth (T4) · تأكيد export لـ`GROUP_ORDER` (T2).
