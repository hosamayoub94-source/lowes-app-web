# مواصفة: نظام عقود ووثائق الموظفين (المرحلة 3 — للتنفيذ لاحقاً)

> طلب المالك: حفظ بيانات الموظفين الحقيقية + عقود عمل رسمية باسم الشركة + ملفات
> ووثائق تُحفظ عند الأدمن. **قال صراحةً: «سجّلها منعملها لاحقاً».** هذه المواصفة
> جاهزة للتنفيذ المباشر في جلسة قادمة. أُعدّت 17 يونيو 2026.

## الهدف
لوحة عند الأدمن لكل موظف: عقد عمل رسمي (PDF باسم الشركة) + وثائق (هوية/إقامة/شهادات)
تُرفَع وتُخزَّن بأمان، مع تواريخ إصدار/انتهاء وتذكيرات.

## قاعدة البيانات (Supabase)
### جدول `employment_contracts`
```
id UUID PK
employee_id UUID REFERENCES profiles(id)
contract_no TEXT            -- رقم تسلسلي (LOWES-EMP-YYYY-NNN)
position TEXT               -- المسمّى الوظيفي
contract_type TEXT          -- full_time | part_time | temporary | probation
start_date DATE
end_date DATE               -- NULL = غير محدّد المدة
base_salary NUMERIC
salary_currency TEXT        -- USD | TRY | SYP
allowances JSONB            -- {housing, transport, ...}
status TEXT                 -- draft | active | ended | terminated
company_snapshot JSONB      -- لقطة معلومات الشركة وقت التوقيع (من brand.js COMPANY)
signed_doc_path TEXT        -- مسار PDF الموقّع في Storage
created_by UUID, created_at TIMESTAMPTZ DEFAULT now()
```
### جدول `employee_documents`
```
id UUID PK
employee_id UUID REFERENCES profiles(id)
doc_type TEXT              -- contract | id | residence | certificate | other
title TEXT
storage_path TEXT
issued_date DATE, expiry_date DATE
status TEXT                -- valid | expiring | expired
uploaded_by UUID, created_at TIMESTAMPTZ DEFAULT now()
```
### أمان
- **RLS أدمن فقط** على الجدولين (وثائق حسّاسة). Manager يقرأ فقط إن قرّر المالك.
- **bucket خاص `employee-docs`** (private) — روابط موقّعة بإعادة استخدام
  `src/modules/files/services/fileService.js` (`uploadFile`/`generateSignedUrl`).
- ⚠️ **أي عمود جديد على `profiles`** يحتاج `GRANT SELECT (col) ON profiles TO anon, authenticated;`
  وإلا يكسر تسجيل الدخول (column-level grants — قاعدة المشروع الحرجة).

## معلومات الشركة الرسمية (من `src/data/brand.js` — جاهزة)
- `COMPANY.legalName`: LOWES PROFESYONEL İÇ VE DIŞ TİCARET LİMİTED ŞİRKETİ
- `legalNameAr`: شركة لويز بروفيشنال للتجارة الداخلية والخارجية المحدودة
- `tradeRegistryNo`: 1120333 · العنوان: HASEKI SULTAN MAH… Fatih, İstanbul
- `email` info@lowesprofesyonel.com · `website` lowesprofesyonel.com · `whatsapp` +90 551 817 77 98
- المفوّض بالتوقيع `AUTHORIZED_BY` = Amany Alkshky · الختم `public/brand/lowes-seal.png`

## الواجهة
- تبويب «📄 الوثائق والعقد» داخل بطاقة الموظف في `AdminUsersScreen.jsx`
  (أو مسار `/admin/employees/:id/docs`).
- قائمة العقود + الوثائق + رفع جديد + توليد قالب عقد PDF (نفس نمط طباعة
  الفاتورة/السند في `paymentVoucher`/`printInvoice` — html→PDF بالهوية والختم).
- بطاقة تنبيهات: وثائق منتهية/قاربت الانتهاء (تربط لاحقاً مع نظام التذكيرات م3 بالخارطة).

## التفاصيل المهمة التي طلب المالك حفظها (لإدراجها في العقد)
- اسم الموظف الكامل · المسمّى · تاريخ المباشرة · الراتب الأساسي + البدلات + العملة ·
  نوع العقد ومدّته · بيانات الشركة القانونية أعلاه · توقيع المفوّض والختم.
- (يُستكمَل مع المالك عند التنفيذ: بنود الإجازات/الإنذار/السرّية حسب رغبته.)

## إعادة الاستخدام
- نظام الملفات الكامل (`modules/files`) للرفع/المشاركة/الروابط الموقّعة.
- `manage-employee` edge function + `profiles` الموسّع (راتب/تعيين موجودة).
- مولّد PDF الحالي (`utils/paymentVoucher.js`) كنموذج لقالب العقد.
