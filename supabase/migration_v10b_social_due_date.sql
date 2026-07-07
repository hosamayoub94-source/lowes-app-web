-- migration_v10b_social_due_date.sql
-- يضيف عمود due_date على جدول social_posts
-- لتحديد الموعد النهائي لانجاز العمل (قبل تاريخ النشر).

ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS due_date date;
