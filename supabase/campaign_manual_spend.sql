-- ================================================================
-- إنفاق الحملة اليدوي (للـ ROAS بدون ميتا API) — مطبّق حيّاً (يونيو 2026).
-- ROAS = مبيعات الحملة (بعملة الإنفاق) ÷ الإنفاق. يكمّل ربط ميتا التلقائي
-- (لو وُجد إنفاق ميتا في meta_ad_insights فهو الأولوية، وإلا هذا اليدوي).
-- ================================================================
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS spend          numeric DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS spend_currency text DEFAULT 'TRY';
