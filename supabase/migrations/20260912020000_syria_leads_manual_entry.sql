-- =============================================================
-- Migration 20260912(2) — Syria B2B Leads: إضافة يدوية من الفريق
--
-- طلب حسام: تمكين الفريق (Alice/ديانا) من إضافة Lead يعرفونه شخصياً مباشرة
-- من الشاشة، لا الاعتماد فقط على محرك البحث الأسبوعي. نميّزها بقيمة verified
-- جديدة ('manual_team_entry') فلا تختلط بمنهجية البحث الصارمة (verified_*/
-- discovered_unconfirmed) — إضافة يدوية = مصدر واحد (معرفة الفريق الشخصية)،
-- تُعامَل بنفس سقف "مصدر واحد" (لا تصل A/A+ أبداً، نفس قاعدة enforceTier).
--
-- SAFE: توسيع CHECK constraint فقط (يضيف قيمة، لا يحذف قيمة قائمة ولا يمس
-- أي صف موجود). لا تعديل على أي عمود أو صف حالي.
-- =============================================================

ALTER TABLE syria_b2b_leads DROP CONSTRAINT IF EXISTS syria_b2b_leads_verified_check;
ALTER TABLE syria_b2b_leads ADD CONSTRAINT syria_b2b_leads_verified_check
  CHECK (verified IN ('verified_multi_source','verified_single_source','discovered_unconfirmed','closed_or_uncertain','manual_team_entry'));

-- من أضاف هذا الـLead يدوياً (اسم المستخدم المسجَّل بالتطبيق وقت الإضافة) —
-- منفصل عن status_updated_by (يوثّق آخر تحديث لحالة التواصل لا الإضافة الأصلية).
ALTER TABLE syria_b2b_leads ADD COLUMN IF NOT EXISTS added_by text;
ALTER TABLE syria_b2b_leads ADD COLUMN IF NOT EXISTS added_manually boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_syria_leads_added_manually ON syria_b2b_leads (added_manually);

-- =============================================================
-- DONE — توسيع syria_b2b_leads لدعم الإضافة اليدوية، بلا مساس بأي صف قائم
-- =============================================================
