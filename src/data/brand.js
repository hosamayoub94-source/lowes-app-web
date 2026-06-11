// =============================================================
// brand.js — مصدر هوية LOWE'S Professional الموحّد (مرجع واحد).
// مبني على دليل الهوية الرسمي (Cowork/00_Resources/brand_identity.md).
// تستخدمه: الفاتورة + وصل الدفع + أي مخرجات تخصّ العميل/البراند.
//
// ⚠️ قاعدة ذهبية: أبيض مسيطر · أسود للنص · الذهبي #C9A646 accent فقط
// (لا يكون اللون الغالب أبداً). لا تغيّر هذه الألوان (ممنوع رسمياً).
// ملاحظة: ثيم واجهة التطبيق الداخلي (navy/teal) منفصل عن هوية
// المخرجات الرسمية (فاتورة/سند) — هذه الأخيرة أبيض/ذهبي/أسود.
// =============================================================

// ── الهوية اللفظية ──────────────────────────────────────────
export const BRAND = {
  nameEn:   "LOWE'S Professional",
  nameTr:   "LOWE'S profesyonel",
  nameAr:   'لويز بروفيشنال',
  founded:  '02.02.2022',
  sloganEn: 'Trusted Care for the Beauty You Deserve',
  sloganAr: 'عنايةٌ تثقين بها، جمالٌ تستحقّينه',
  heart:    '💛', // التوقيع البصري (signature motif)
};

// ── معلومات الشركة الرسمية (للفاتورة/السند/التواصل) ──────────
export const COMPANY = {
  legalName:   'LOWES PROFESYONEL İÇ VE DIŞ TİCARET LİMİTED ŞİRKETİ',
  legalNameAr: 'شركة لويز بروفيشنال للتجارة الداخلية والخارجية المحدودة',
  tradeRegistryNo: '1120333',
  address:  'HASEKI SULTAN MAH. ATIK MEDRESESI CIKMAZI SK. TAC AP. NO: 3 IC KAPI NO: 1',
  city:     'Fatih, İstanbul',
  country:  'Türkiye',
  email:    'info@lowesprofesyonel.com',
  website:  'lowesprofesyonel.com',
  websiteUrl: 'https://lowesprofesyonel.com/',
  whatsapp: '+90 551 817 77 98',
  phoneAlt: '+90 850 762 8131',
  instagram: '@lowes.profesyonel.tr',
};

// ── الألوان الرسمية (Color Palette) — غير قابلة للتغيير ──────
export const BRAND_COLORS = {
  gold:       '#C9A646', // Primary Gold ★ (accent فقط)
  goldLight:  '#E5C97A', // Light Gold (تدرّجات/حدود)
  black:      '#000000',
  white:      '#FFFFFF',
  cream:      '#FBF7EC', // خلفيات دافئة (تصوير/مشاهد)
  warmGray:   '#6B5D4F', // نص ثانوي/تسميات
  // ألوان الحملات القيمية (موسمية فقط — لا تدخل الهوية الأساسية)
  rose:       '#E8A0A8', // أكتوبر الوردي / دعم المرأة
  roseDark:   '#C76B76',
  sage:       '#9CAE92', // البيئة والاستدامة
};

// ── الخطوط (Typography) ─────────────────────────────────────
export const BRAND_FONTS = {
  display:     "'Playfair Display', serif",       // العناوين + اسم البراند (لاتيني)
  displayItalic: "'Playfair Display', serif",     // التاغلاين (italic)
  headingAr:   "'El Messiri', sans-serif",        // عناوين عربية
  bodyAr:      "'Tajawal', sans-serif",           // نص عربي (المعتمد بالتطبيق)
};

// ── الأصول (روابط Drive — لجلب اللوغو/الختم عالي الدقة) ──────
// (ملفات PDF/صور على Drive؛ تُضاف كأصول محلية عند توفّرها.)
export const BRAND_ASSETS = {
  driveFolder: 'https://drive.google.com/drive/folders/1dbrfHKb8wM7C4nTL2vd0awDqn39-VFan',
  logoPdfId:   '1Cl58hXM8A6CK_KrI_MmukvfsqG6b_0gG',
  stampPdfId:  '1X5rB_8j8We1VbwR5677kmL5V87twoWdT', // الختم الرسمي للفواتير
  guidelinesPdfId: '1CH0xsfzSbUJxqex-_YZabsZ8lJ9MKjPi',
  // logoUrl / stampUrl: تُملأ عند رفع الأصول كملفات محلية (public/brand/)
  logoUrl:  null,
  stampUrl: null,
};

// ── هيكل البراندات (Brand Architecture) ─────────────────────
export const SUB_BRANDS = [
  { name: 'La Rovén Glow',   endorsed: true },
  { name: 'La Rovén Beauty', endorsed: true },
  { name: 'La Rovén Iséra',  endorsed: true, domain: 'larovenisera.com', status: 'قريباً' },
  { name: 'Rashm',           endorsed: true, status: 'قريباً' },
];
export const ENDORSEMENT = "A Lowe's Profesyonel Brand 🏷️";

export default BRAND;
