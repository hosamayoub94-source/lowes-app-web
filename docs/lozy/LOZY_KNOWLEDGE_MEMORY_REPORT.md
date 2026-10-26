# Lozy — جرد المعرفة وطبقات الذاكرة (26 تشرين الأول 2026)

> مرجع تقني للمشروع (لا معرفة شركة). الحالة: تعديلات محلية فقط، **غير منشورة**. لم يُنفَّذ أي SQL.

## 1) جرد مصادر معرفة لوزي الحالية (قراءة فقط)

| المصدر | الموقع | العدد | ملاحظة |
|---|---|---|---|
| كتالوج احتياطي ثابت `CATALOG_FALLBACK` | `supabase/functions/ai-assistant/index.ts` | 29 منتجاً (بشرة/شعر/جسم) | لم يُمسّ. محمي باختبار في `test-lozy.mjs` |
| كتالوج حي | `https://lowesprofesyonel.com/products-data.js` (يُجلب بكل طلب) | يتغير | يتفوق على الاحتياطي عند توفره، بلا أسعار |
| أدلة الاستخدام `app_guides` | قاعدة fghdumrgimoeqsafdhhh | 21 (21 منشور) | تُحقن حياً بكل طلب |
| معرفة الفريق `lozy_knowledge` | نفس القاعدة | 7 (7 نشطة) | أعمدة: fact, taught_by, taught_by_id, category, is_active, created_at |
| محادثات المستخدمين `lozy_chats` | نفس القاعدة | 46 صفاً (صف لكل مستخدم) | آخر 40 رسالة؛ ليست مصدر معرفة |
| ثوابت البرومبت | نفس الملف | هوية البراند، أسلوب الاستشارة، العمولات، KPI، دفتر الحسابات، تدريب الاعتراضات، مراجعة الرسائل | لم تُحذف |

## 2) ما أُثبت وما لم يُثبت

- `clearChat` يكتب فقط على صف `lozy_chats` الخاص بالمستخدم، ولا يلمس `lozy_knowledge` ولا `app_guides` ولا الكتالوج (اختبار مصدر في `test-lozy.mjs`).
- **خطر قائم (لم يُعالج، يحتاج قرارك):** سياسات RLS على `lozy_chats` و`lozy_knowledge` و`app_guides` مفتوحة بالكامل (`USING true`، لكل الأدوار بما فيها anon). أي حامل للمفتاح العام يستطيع قراءة ذاكرة أي مستخدم أو الكتابة بها. عزل الذاكرة الشخصية بين المستخدمين **غير مضمون على مستوى قاعدة البيانات اليوم**. إغلاقها يكسر الحسابات اليدوية (بلا جلسة Supabase Auth حقيقية) — لذلك لم أنفذه.

## 3) طبقات الذاكرة — الوضع والمنفَّذ

| الطبقة | الوضع الحالي | ما نُفِّذ الآن | المتبقي |
|---|---|---|---|
| A دائمة (كتالوج/أدلة/سياسات) | موجودة وتُحقن | حمايتها باختبارات + قاعدة «القديم أولاً» بالبرومبت | أعمدة source/confidence/updated_at تحتاج DDL (غير منفذ) |
| B فريق | `[[LEARN]]` → `lozy_knowledge` + شاشة `AdminLozyScreen` (تعطيل/حذف) | منع التكرار، حجز المعلومات الشخصية/المؤقتة/السرية، **التعارض يُحفظ معطَّلاً** بفئة `pending_conflict:<id>` مع إظهار القديم بشاشة الأدمن، وملاحظة للمستخدم بالرد | — |
| C شخصية | لا يوجد جدول؛ `lozy_chats` فقط | لا شيء (يتطلب جدولاً جديداً + RLS) | SQL مقترح بالأسفل، غير مطبَّق |
| D تشغيلية | تُجلب حياً (مهام، حضور، إجازة، KPI، أدوات بصلاحية) | `get_customer_history` ببحث آمن | — |

## 4) get_customer_history

- الصلاحية: `manage_orders` (admin/manager/sales_manager/media_buyer). الدور `employee` بلا صلاحيات، فلا يرى الأداة. فُحصت بالاختبار.
- ملاحظة: حاملو `manage_orders` يرون كل الطلبات (ليس فقط طلباتهم). إن احتاج موظفو المبيعات الأداة فالأنسب صلاحية جديدة ضيقة (مثل `view_customer_history`) مع تقييد بطلباتهم — قرار منتج + تعديل `permissions.js`، لم يُنفَّذ.
- البحث: رقم طلب (`ARC-1691`، يدعم ` / `)، هاتف (آخر 9 أرقام، أرقام عربية، عمودا `wa_number`/`phone_1`)، اسم (`customer_name`). كل رمز يغيّر تعبير `.or()` يُحذف. عند عدم الإيجاد: رسالة بطرق بحث بديلة.
- حد معروف: إن خُزّن الهاتف بمسافات داخلية قد لا يتطابق مع بحث الذيل؛ لم أتحقق من تنسيق التخزين.

## 5) SQL مقترح — غير مطبَّق (للمراجعة قبل أي تنفيذ)

```sql
-- C) ذاكرة شخصية: لا يقرأها غير صاحبها (بالـ service role من الدالة فقط)
create table if not exists public.lozy_user_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  note text not null check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
alter table public.lozy_user_memory enable row level security;
-- لا سياسات = لا وصول لـ anon/authenticated؛ الدالة تستخدم service role.

-- A/B) أعمدة وصفية على معرفة الفريق (إضافية فقط)
alter table public.lozy_knowledge
  add column if not exists source text default 'team',
  add column if not exists confidence text default 'medium',
  add column if not exists updated_at timestamptz default now();
```

## 6) الاختبارات

`node test-lozy.mjs` → 26 ناجحة / 0 فاشلة. الاختبارات القائمة `test-guides.mjs` و`test-lozy-guides.mjs` و`test-chat-merge.mjs` ناجحة. `npm run build` ناجح.
ESLint على الويدجت: 3 تحذيرات **قديمة** (`saving/setSaving` غير مستخدمين، وتبعيات `useCallback` الزائدة) موجودة بنفس الشكل في `HEAD` — ليست من هذا التغيير.

## 7) ملفات تغيير لوزي (لا غيرها يدخل النشر)

1. `src/components/ai/AIAssistantWidget.jsx`
2. `src/screens/admin/AdminLozyScreen.jsx`
3. `supabase/functions/ai-assistant/index.ts`
4. `supabase/functions/_shared/customerSearch.ts` (جديد)
5. `supabase/functions/_shared/lozyKnowledge.ts` (جديد)
6. `test-lozy.mjs` (جديد)
7. هذا التقرير

لا تُنشر معها: `src/data/permissions.js` (تغييره صلاحيات طلبات سوريا/تركيا، لا علاقة له بلوزي)، `HANDOFFlowes.md`، ولا ملفات المهام/المستودع/الأرباح.
