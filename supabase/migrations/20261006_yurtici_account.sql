-- 20261006_yurtici_account.sql
-- عقد يورتيتشي الثاني (1279282180، LOWES PROFESYONEL — فرع Yenikapı).
-- يحفظ الحساب الذي أُنشئت به شحنة API (YK2_GO_NORMAL / YK2_GO_COD / YK2_AO_NORMAL /
-- YK2_AO_COD / YK1_COD / YK1_NORMAL) كي يستعلمها track-yurtici بنفس الحساب.
-- NULL = شحنات العقد 1 (1200681314) السابقة لهذا التاريخ.
-- الصلاحيات على مستوى الجدول (لا أعمدة) — لا GRANT إضافي.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS yurtici_account text;

COMMENT ON COLUMN public.orders.yurtici_account IS
  'حساب يورتيتشي الذي أُنشئت به الشحنة عبر API (انظر supabase/functions/_shared/yurticiAccounts.ts). NULL = العقد 1.';
