-- إضافة "إدخال خاطئ" لقيود المحاسبة (accounting_entries) — طلب مالك 9 آب 2026:
-- "بدل ما نحذف القيد الخاطئ (بيسبب مشاكل بالمحاسبة)، بدنا خيار نحدده كإدخال
-- خاطئ — يضل موجود بالسجل (ما ينحذف)، بيتظلل بالأسود، وما يُحتسب بأي رصيد."
--
-- شغّل هذا السكربت مرة واحدة بمحرر SQL بمشروع Supabase (fghdumrgimoeqsafdhhh).
alter table public.accounting_entries
  add column if not exists is_void boolean not null default false,
  add column if not exists void_reason text,
  add column if not exists voided_by uuid,
  add column if not exists voided_at timestamptz;
