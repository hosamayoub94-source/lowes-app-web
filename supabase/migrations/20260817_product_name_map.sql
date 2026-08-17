-- تخطيط أسماء المنتجات — يدمج الأسماء الخام المتعدّدة لنفس المنتج (عربي/إنجليزي/
-- أخطاء إملائية بالطلبات) تحت اسم موحّد واحد، ويصنّف كل صنف ببراند (lowes/strong)
-- وحالة نشاط (is_active) — الشاشة تستبعد صنف سترونغ المُعلَّم مجمَّد تلقائياً.
--
-- طلب مالك 17 آب 2026: ربحية المنتج كانت تعرض نفس الصنف بسطرين منفصلين (اسم
-- عربي + اسم إنجليزي) فتُشتّت الأرقام، وما كان فيه فرز بين LOWE'S وسترونغ ولا
-- طريقة لإخفاء أصناف سترونغ المجمَّدة (المُلغاة).
--
-- التصنيف الأولي مبني على فحص مباشر لـ92 اسماً حقيقياً بالطلبات (آخر 3 شهور،
-- 17 آب 2026) — الدمج تم فقط للأسماء المتطابقة يقيناً (نفس المنتج بلغتين/تهجئة)،
-- أي حالة غير مؤكَّدة تُركت منفصلة عمداً بدل تخمين دمج خاطئ.
create table if not exists public.product_name_map (
  id uuid primary key default gen_random_uuid(),
  alias_name text not null unique,   -- الاسم الخام كما يظهر بـorders.items[].name
  canonical_name text not null,      -- الاسم الموحَّد الذي تُجمَّع تحته ربحية المنتج
  brand text not null default 'lowes' check (brand in ('lowes', 'strong')),
  is_active boolean not null default true,  -- false = مجمَّد/مُلغى، يُستبعد كلياً من التقرير
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_name_map_canonical_idx on public.product_name_map (canonical_name);

alter table public.product_name_map enable row level security;
drop policy if exists "product_name_map_read" on public.product_name_map;
create policy "product_name_map_read" on public.product_name_map for select using (true);
drop policy if exists "product_name_map_write" on public.product_name_map;
create policy "product_name_map_write" on public.product_name_map for all using (true) with check (true);

insert into public.product_name_map (alias_name, canonical_name, brand) values
  ('جل شد الجسم و السيليوليت', 'جل شد الجسم والسيليوليت', 'lowes'),
  ('FIRMING GEL', 'جل شد الجسم والسيليوليت', 'lowes'),
  ('شامبو الروزماري', 'شامبو الروزماري', 'lowes'),
  ('ROSEMARY SHAMPOO', 'شامبو الروزماري', 'lowes'),
  ('ماء الروزماري للشعر و البشرة', 'ماء الروزماري للشعر والبشرة', 'lowes'),
  ('ROSEMARY WATER', 'ماء الروزماري للشعر والبشرة', 'lowes'),
  ('مشط السيليكون', 'مشط السيليكون', 'lowes'),
  ('SHOWER COMB', 'مشط السيليكون', 'lowes'),
  ('ديرما رول 1mm', 'ديرما رول 1mm', 'lowes'),
  ('Derma rolle 1mm', 'ديرما رول 1mm', 'lowes'),
  ('ديرما رول 0.5mm', 'ديرما رول 0.5mm', 'lowes'),
  ('Derma rolle 0.5 mm', 'ديرما رول 0.5mm', 'lowes'),
  ('كريم تفتيح البشرة', 'كريم تفتيح البشرة', 'lowes'),
  ('WHITENING CREAM', 'كريم تفتيح البشرة', 'lowes'),
  ('كريم التفتيح والتبييض', 'كريم تفتيح البشرة', 'lowes'),
  ('سيروم اللحية', 'سيروم اللحية', 'lowes'),
  ('BEARD SERUM', 'سيروم اللحية', 'lowes'),
  ('كريم الترطيب المكثف', 'كريم الترطيب المكثف', 'lowes'),
  ('MOISTURIZING CREAM', 'كريم الترطيب المكثف', 'lowes'),
  ('ريتينال شوت', 'ريتينال شوت', 'lowes'),
  ('Retinal shot', 'ريتينال شوت', 'lowes'),
  ('واقي الشمس الوردي بالكالامين', 'واقي الشمس الوردي بالكالامين', 'lowes'),
  ('Sunscreen Pink Up Tone', 'واقي الشمس الوردي بالكالامين', 'lowes'),
  ('كريم العناية بالثدي', 'كريم العناية بالثدي', 'lowes'),
  ('BREAST CARE CREAM', 'كريم العناية بالثدي', 'lowes'),
  ('سيروم العناية بالثدي', 'سيروم العناية بالثدي', 'lowes'),
  ('BREAST CARE SERUM', 'سيروم العناية بالثدي', 'lowes'),
  ('واقي الشمس المضاد للبقع', 'واقي الشمس المضاد للبقع', 'lowes'),
  ('ANTI BLEMISH SUNSCREEN', 'واقي الشمس المضاد للبقع', 'lowes'),
  ('سيروم فيتامين سي', 'سيروم فيتامين سي', 'lowes'),
  ('VITAMIN C SERUM', 'سيروم فيتامين سي', 'lowes'),
  ('سيروم مصحح البقع الداكنة', 'سيروم مصحح البقع الداكنة', 'lowes'),
  ('Dark Spot Corrector Serum', 'سيروم مصحح البقع الداكنة', 'lowes'),
  ('سيروم الريتينول', 'سيروم الريتينول', 'lowes'),
  ('RETINOL SERUM', 'سيروم الريتينول', 'lowes'),
  ('سيروم الهالات و انتفاخ العين', 'سيروم الهالات وانتفاخ العين', 'lowes'),
  ('UNDER EYE SERUM', 'سيروم الهالات وانتفاخ العين', 'lowes'),
  ('غسول البشرة العادية و الجافة', 'غسول البشرة العادية والجافة', 'lowes'),
  ('Cleanser for normal and dry skin', 'غسول البشرة العادية والجافة', 'lowes'),
  ('تونر تنقية البشرة و تضييق المسام', 'تونر تنقية البشرة وتضييق المسام', 'lowes'),
  ('PORE TIHGTENNING & PURIFINE TONER', 'تونر تنقية البشرة وتضييق المسام', 'lowes'),
  ('سيروم مضاد لحب الشباب', 'سيروم مضاد لحب الشباب', 'lowes'),
  ('ANTI ACNE SERUM', 'سيروم مضاد لحب الشباب', 'lowes'),
  ('تونر الجسم', 'تونر الجسم', 'lowes'),
  ('Body toner', 'تونر الجسم', 'lowes'),
  ('ماسك الكولاجين المائي', 'ماسك الكولاجين المائي', 'lowes'),
  ('COLLAGEN HYDRO BOMB MASK', 'ماسك الكولاجين المائي', 'lowes'),
  ('كريم العناية بالقدمين', 'كريم العناية بالقدمين', 'lowes'),
  ('FOOT CARE CREAM', 'كريم العناية بالقدمين', 'lowes'),
  ('COLLAGEN SERUM', 'سيروم الكولاجين', 'lowes'),
  ('سيروم الكولاجين', 'سيروم الكولاجين', 'lowes'),
  ('Facial peeling gel', 'جيل مقشر الوجه', 'lowes'),
  ('جيل مقشر الوجه', 'جيل مقشر الوجه', 'lowes'),
  ('كريم ازالة شعر', 'كريم إزالة الشعر', 'lowes'),
  ('كريم ازالة الشعر', 'كريم إزالة الشعر', 'lowes'),
  ('كريم ازاله الشعر', 'كريم إزالة الشعر', 'lowes'),
  ('STRAWBERRY BODY SCRUB', 'سكراب الجسم بالفراولة', 'lowes'),
  ('سكراب الجسم بالفراوله', 'سكراب الجسم بالفراولة', 'lowes'),
  ('سكراب الجسم', 'سكراب الجسم', 'lowes'),
  ('مقشر الجسم', 'سكراب الجسم', 'lowes'),
  ('سيروم الروزماري', 'سيروم الروزماري', 'lowes'),
  ('ROSEMARY SERUM', 'سيروم الروزماري', 'lowes'),
  ('super viga blue', 'Super Viga Blue', 'strong'),
  ('super viga  blue', 'Super Viga Blue', 'strong'),
  ('Spray super viga blue', 'Super Viga Blue', 'strong'),
  ('super viga   red', 'Super Viga Red', 'strong'),
  ('Super viga red', 'Super Viga Red', 'strong'),
  ('cialis 100mg', 'Cialis 100mg', 'strong'),
  ('Cialis 100', 'Cialis 100mg', 'strong'),
  ('100 Cialis', 'Cialis 100mg', 'strong'),
  ('زيت الروزماري', 'زيت الروزماري', 'lowes'),
  ('viagra 100', 'viagra 100', 'strong'),
  ('super viga black', 'super viga black', 'strong'),
  ('تونر تجديد وتفتيح الجسم', 'تونر تجديد وتفتيح الجسم', 'lowes'),
  ('كريم الارز', 'كريم الارز', 'lowes'),
  ('كريم التشققات', 'كريم التشققات', 'lowes'),
  ('رول مساج الوجه', 'رول مساج الوجه', 'lowes'),
  ('غسول البشرة الدهنية والحساسة', 'غسول البشرة الدهنية والحساسة', 'lowes'),
  ('RICE MILK SPOT CREAM', 'RICE MILK SPOT CREAM', 'lowes'),
  ('تونر حليب الارز', 'تونر حليب الارز', 'lowes'),
  ('سيروم الارز', 'سيروم الارز', 'lowes'),
  ('Spray super viga', 'Spray super viga', 'strong'),
  ('سيروم الترطيب المكثف', 'سيروم الترطيب المكثف', 'lowes'),
  ('Lovegra drop', 'Lovegra drop', 'strong'),
  ('Max man', 'Max man', 'strong'),
  ('زيت اللحية', 'زيت اللحية', 'lowes'),
  ('Cialis 5', 'Cialis 5', 'strong'),
  ('تونر الروز ماري', 'تونر الروز ماري', 'lowes'),
  ('Blue Drops', 'Blue Drops', 'strong'),
  ('ديرما رول', 'ديرما رول', 'lowes'),
  ('فرشاة تنظيف الوجه', 'فرشاة تنظيف الوجه', 'lowes'),
  ('سيروم البقع والتصبغات', 'سيروم البقع والتصبغات', 'lowes')
on conflict (alias_name) do nothing;
