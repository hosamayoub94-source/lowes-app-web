-- إضافة عمود market لجدول accounting_channels
-- يحدد في أي سوق تظهر شركة الشحن (سوريا / تركيا / الاثنان)
-- شركات الشحن بدون قيمة تُعامَل كـ syria (الوضع الافتراضي في shippingService)
ALTER TABLE accounting_channels
  ADD COLUMN IF NOT EXISTS market text
  CHECK (market IN ('syria', 'turkey', 'both'));
