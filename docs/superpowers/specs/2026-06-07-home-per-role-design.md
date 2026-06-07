# تصميم: صفحة رئيسية مخصّصة لكل دور (Home per-role)

التاريخ: 2026-06-07 · الحالة: معتمد (المالك اختار «هوم مختلف كليّاً لكل دور» + إضافة widgetين)

## المشكلة
`HomeScreen.jsx` تعرض ~13 قسماً مكدّساً عمودياً **لكل المستخدمين** بلا تمييز، مع تكرار واضح:
- شريط KPI (مهام/إشعارات/إجازة) يكرّر بطاقة مهامي + جرس الإشعارات + شاشة طلباتي.
- «وصول سريع» يكرّر القائمة الجانبية/السفلية.
- العملة/الرسوم/الليدربورد ثانوية للموظف العادي.

## القرار المعماري: تركيب بلوكات حسب الدور
بدل 6 شاشات منفصلة: نُبقي مكوّنات «البلوكات» الموجودة، ونضيف خريطة `HOME_LAYOUT` تُرجِع **قائمة بلوكات مرتّبة لكل أرشيتايب دور**. `HomeScreen` يحسب الأرشيتايب من `role`/`role_type` ويرندر البلوكات بالترتيب. هكذا كل دور يرى هوم مختلفاً فعلاً، بإعادة استخدام لا إعادة بناء.

### الأرشيتايبات
- `manager` ← ADMIN, MANAGER
- `sales_manager` ← SALES_MANAGER
- `media` ← SOCIAL_MANAGER, MEDIA_BUYER
- `storage` ← role_type==='storage'
- `seller` ← الافتراضي (EMPLOYEE وكل من سواه)

### البلوكات (مفاتيح)
مشترك دائماً أعلى: `hero` (تحية+جرس) · `emergency`.
البلوكات القابلة للترتيب: `attendance` · `myTasks` · `myTarget`(جديد) · `announcement` · `celebration` · `training` · `teamStatus` · `attendanceChart` · `salesChart` · `leaderboard` · `currency` · `campaignsLink` · `lowStock`(جديد).
**يُحذف نهائياً:** `kpiStrip` · `quickShortcuts`.

### الخريطة
| أرشيتايب | البلوكات بالترتيب |
|---|---|
| seller | attendance, myTasks, myTarget, announcement, celebration, training |
| manager | attendance, myTasks, teamStatus, salesChart, attendanceChart, leaderboard, currency, announcement |
| sales_manager | attendance, myTasks, salesChart, leaderboard, currency, campaignsLink, announcement |
| media | attendance, myTasks, campaignsLink, announcement, training |
| storage | attendance, myTasks, lowStock, announcement |

## widgets جديدة (بسيطة، بيانات موجودة)
1. **MyTargetCard (seller):** يقرأ طلبات الموظف للشهر الحالي، يحسب Σ USD عبر منطق `orderUsd`/`product_economics` الموجود، مقابل التارجت من `src/data/targets.js` (USD 1000 / TRY 65000 حسب سوق الموظف). يعرض شريط تقدّم + «X% من الهدف» + رابط «طلباتي». بلا DDL.
2. **LowStockCard (storage):** يقرأ `wh_stock`/`products` (عبر `warehouseService`) للمنتجات تحت حدّ منخفض، يعرض أعلى 5 نواقص + رابط `/warehouses`. بلا DDL.
3. **CampaignsLinkCard:** بطاقة رابط بسيطة (نمط بطاقة التدريب) إلى `/campaigns` مع عدد الحملات النشطة إن سهُل.

## غير المتأثّر
- نفس الثيم/الألوان (navy/teal/plum). لا تغيير ألوان.
- المكوّنات الحالية تبقى كما هي؛ فقط `HomeScreen` يتغيّر ليركّب حسب الدور + ملف خريطة جديد.

## الاختبار
- build أخضر.
- اختبار حيّ: دخول كأدمن (هوم مدير) + التحقق أن البلوكات المحذوفة اختفت والترتيب صحيح. (اختبار أدوار أخرى منطقياً عبر تبديل role إن أمكن.)
