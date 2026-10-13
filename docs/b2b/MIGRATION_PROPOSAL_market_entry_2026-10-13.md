# مقترح migration — «دخول الأسواق» لليدز B2B (13 تشرين الأول 2026)

> **مقترح فقط — لم يُطبَّق ولم يُنشر.** أي تطبيق يحتاج موافقة صريحة، وبعده تعديل الدالة `b2b-leads` ونشرها (الدالة الحالية ترفض أي `status` خارج القيم الخمس).

## 1. تصنيف الحقول المطلوبة
### أ) موجودة ونستعملها الآن
`country, province, city, district, name, category, address, contact_person, phone, whatsapp, email, instagram, facebook, telegram, website, channel, lead_type, accepts_sellers, sells_beauty, delivery_coverage, lowes_presence, lowes_listing_url, status, notes, assigned_to (سوريا فقط فعلياً), status_updated_at/by, presence_updated_at/by, source_urls, verified, last_verified_at, discovered_at, discovery_source, priority, score, added_by, added_manually`.

### ب) تُشتَق الآن بالمنطق (`src/services/b2bModel.js`) بلا migration
| الحقل المطلوب | الاشتقاق | حدّه |
|---|---|---|
| `organization_type` / `opportunity_type` | من `category` + `channel` + `lead_type` | تقريبي لفئات نصية حرة |
| `target_market` / `target_region` | `country` / `province` | موجود |
| `neighborhood` | `district` | موجود |
| `account_status` (جزئياً) | من `status` + `lowes_presence` | 8 من 14 مرحلة فقط |
| `source_quality` | من `verified` + عدد/تنوّع المصادر + حداثة | مشتق، لا مخزَّن |
| `opportunity_score` / `readiness` / `ease` / `execution priority` | قواعد صريحة بأسبابها | تعتمد على حقول قد تكون فارغة (المجهول يبقى مجهولاً) |
| `owner` | `assigned_to` ثم `status_updated_by` | الإمارات: آخر محدِّث |
| `parent_organization` / `branch_count` | تجميع بالاسم الأساس/النطاق | **مشتق وغير مؤكَّد** |

### ج) تحتاج migration
| الحقل | النوع | لماذا |
|---|---|---|
| `account_status` | text + CHECK (14 قيمة المطلوبة) | تتبّع حقيقي لفتح الحساب (documents_requested … approved … first_order) |
| `first_order_at` | timestamptz | معرفة متى بدأ أول بيع |
| `next_action`, `next_action_due_at` | text, timestamptz | خطوة ومتابعة بموعد (اليوم تُشتق بعدد الأيام فقط) |
| `blocker` | text | العائق الحالي |
| `parent_organization_id` | text → نفس الجدول | سلسلة أم + فروع حقيقية |
| `branch_count` | int | عدد فروع معلن |
| `accepts_new_brands`, `accepts_beauty_products` | boolean null | فصل «تقبل بائعين» عن «تقبل براندات جديدة» وعن «تقبل التجميل» |
| `seller_registration_url`, `supplier_contact_url` | text | روابط التسجيل |
| `registration_requirements` | **jsonb** `[{item, answer, evidence:'official'|'secondary'|'not_stated', source, checked_at}]` | شروط التسجيل بمصدر لكل شرط (مثل dossier المنصات) — Montaji منفصل |
| `required_documents`, `missing_documents` | jsonb / text[] | وثائق مطلوبة وناقصة |
| `contact_role`, `contact_source` | text | دور جهة الاتصال + مصدر معلومة الاتصال |
| `deleted_at`, `deleted_by` | timestamptz/text | حذف ناعم (غير موجود بالقسم) |
| جدول `b2b_lead_events` | (lead_id, at, actor, kind, from, to, note) | سجل تغييرات كامل بدل الطوابع المبسّطة |

### د) لا يجب إضافتها
- `score` ثانٍ مخزَّن: التقييمات الخمسة تُحسب وتُفسَّر، ولا يُخزَّن رقم غامض.
- حقل مستقل لكل نوع منصة (amazon/noon…): `registration_requirements` + `category` يكفيان.
- أي حقل لكلمات مرور/مفاتيح حسابات المنصات: ممنوع تخزينها بالتطبيق.
- `branch_count` منفصل إن اعتمدنا `parent_organization_id` وعدّ الفروع منه.

## 2. مسودة SQL (للنقاش — غير مُطبَّقة)
```sql
-- 20261013_b2b_market_entry.sql  (DRAFT)
alter table public.syria_b2b_leads
  add column if not exists account_status text,
  add column if not exists first_order_at timestamptz,
  add column if not exists next_action text,
  add column if not exists next_action_due_at timestamptz,
  add column if not exists blocker text,
  add column if not exists parent_organization_id text references public.syria_b2b_leads(id),
  add column if not exists accepts_new_brands boolean,
  add column if not exists accepts_beauty_products boolean,
  add column if not exists seller_registration_url text,
  add column if not exists supplier_contact_url text,
  add column if not exists registration_requirements jsonb not null default '[]'::jsonb,
  add column if not exists required_documents jsonb not null default '[]'::jsonb,
  add column if not exists missing_documents jsonb not null default '[]'::jsonb,
  add column if not exists contact_role text,
  add column if not exists contact_source text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text;

alter table public.syria_b2b_leads
  add constraint b2b_account_status_chk check (account_status is null or account_status in (
    'discovered','qualified','contact_needed','contacted','replied','documents_requested','application_started',
    'submitted','pending_approval','approved','live','first_order','rejected','paused'));

create table if not exists public.b2b_lead_events (
  id bigint generated always as identity primary key,
  lead_id text not null references public.syria_b2b_leads(id),
  at timestamptz not null default now(),
  actor text, kind text not null, from_value text, to_value text, note text
);
alter table public.b2b_lead_events enable row level security;  -- بلا سياسات: الوصول عبر الدالة فقط
-- لا UPDATE على الصفوف الموجودة: الأعمدة الجديدة null/افتراضية (فهرس/بيانات سوريا لا تتأثر).
```
**الترتيب المقترح للتطبيق (كل خطوة بموافقة):** بصمة سوريا قبل ← migration ← بصمة بعد (نفس الـ155) ← تعديل الدالة (قبول `account_status` + الحقول، حذف ناعم، ترشيح الاتصال) ← نشرها ← نشر الواجهة.
**الرجوع:** `drop` للأعمدة/الجدول الجديدة (لا بيانات قديمة تتأثر).

## 3. أمان مقترح (قرار منفصل — انظر AUDIT §3)
1. إغلاق وصول `anon` لجدول سوريا: سحب `GRANT … FROM anon` أو تقييد السياسة بـ`authenticated` + دالة `has_permission('view_syria_leads')`، أو نقل سوريا للدالة كالإمارات.
2. طبقة «عرض فقط» بلا هاتف/بريد (مثل `creator-prospects`).
3. تسوية سجل migrations (إدخال مكرر `b2b_leads_country`) توثيقياً.
