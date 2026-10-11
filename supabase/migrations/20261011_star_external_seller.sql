-- اسم المسوّقة (صاحبة الطلب) كما يأتي من شبكة النجوم — للعرض بالعمود J بجدول تركيا فقط.
-- handler_name يبقى «شبكة النجوم» عمداً (لا يطابق أي profile ⇒ لا عمولة موظف مزدوجة
-- ولا إشعار بائع). هذا العمود منفصل ولا يقرؤه أي منطق عمولة/إشعار.
alter table public.orders add column if not exists external_seller text;
