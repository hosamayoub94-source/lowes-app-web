// تست محلّل تقرير يورتيتشي (results.xlsx → order_id ↔ رقم تتبّع 1160 + حالة)
// node test-yurtici-report.mjs — مبني على ملف حقيقي C:\Users\acer\Downloads\results (1).xlsx
import { parseYurticiReport } from './src/services/yurticiReport.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('❌', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — توقّعت ${JSON.stringify(b)} فجاء ${JSON.stringify(a)}`);

// ترويسة يورتيتشي الحقيقية (٢٥ عمود) + صفوف حقيقية/تمثيلية.
const HEADER = ['Çıkış Tarihi','Gönderi Takip No','Belge No','Özel Alan','İade Durumu','Alıcı Adı','Gönderi Durumu','Konumu(Bulunduğu Birim / İl)','Teslim Tarihi','Teslim Alan','Sevk İrsaliye No','Tahsilatlı Teslimat Tipi','Tahsilatlı Teslimat Tutarı','Alıcı Adresi','Açıklama','Taşıma İrsaliyesi Açıklama','Oluşturan Kullanıcı','Çıkış Birim','Teslim Birim','Bedel','Desi','Kg','Gönderici','Ödeyecek','İşlem Kanalı'];
const row = (takip, ozel, iade, durumu, irsaliye) => {
  const r = new Array(25).fill('');
  r[1] = takip; r[3] = ozel; r[4] = iade; r[6] = durumu; r[10] = irsaliye;
  return r;
};

// ── (1) صفوف حقيقية من ملفك → استخراج صحيح + تعيين الحالة ──
const REAL = [HEADER,
  row('116083175079','422444632','','( YK/OK ) Kargo Yüklendi( Sorun Yok )','TL-28596'),
  row('116083175080','422444634','','( YK/OK ) Kargo Yüklendi( Sorun Yok )','TL-28597'),
  row('116083175081','422444626','','( YK/OK ) Kargo Yüklendi( Sorun Yok )','TS-11058'),
  row('116083175093','422442859','','( IN/OK ) Kargo İndirildi( Sorun Yok )','6S15'),
];
const r1 = parseYurticiReport(REAL);
eq(r1.updates, [
  { orderId: 'TL-28596', tracking: '116083175079', status: 'shipped' },
  { orderId: 'TL-28597', tracking: '116083175080', status: 'shipped' },
  { orderId: 'TS-11058', tracking: '116083175081', status: 'shipped' },
  { orderId: '6S15',     tracking: '116083175093', status: 'at_center' },
], '(1) استخراج رقم الطلب + التتبّع + الحالة من صفوف حقيقية');
ok(r1.warnings.length === 0, `(1) بلا تحذيرات (كان ${JSON.stringify(r1.warnings)})`);

// ── (2) استقلالية ترتيب الأعمدة (المطابقة بالاسم لا بالموضع) ──
const REORDERED = [
  ['Sevk İrsaliye No','Gönderi Takip No','Gönderi Durumu','İade Durumu'],
  ['TL-28596','116083175079','Kargo Yüklendi',''],
];
eq(parseYurticiReport(REORDERED).updates,
  [{ orderId: 'TL-28596', tracking: '116083175079', status: 'shipped' }],
  '(2) المطابقة بالاسم تشتغل مع ترتيب أعمدة مختلف');

// ── (3) تعيين الحالات المختلفة ──
const STATUSES = [HEADER,
  row('116000000001','1','','Teslim Edildi','A-1'),
  row('116000000002','2','İade Edildi','Kargo Yüklendi','A-2'),       // عمود الإرجاع ممتلئ → راجع
  row('116000000003','3','','Teslimat Adresinde Bulunamadı','A-3'),
  row('116000000004','4','','Dağıtımda','A-4'),
  row('116000000005','5','','İptal Edildi','A-5'),
];
const r3 = parseYurticiReport(STATUSES).updates;
eq(r3.find(u => u.orderId === 'A-1').status, 'delivered', '(3) Teslim Edildi → delivered');
eq(r3.find(u => u.orderId === 'A-2').status, 'returning', '(3) İade Durumu ممتلئ → returning');
eq(r3.find(u => u.orderId === 'A-3').status, 'not_received', '(3) Bulunamadı → not_received');
eq(r3.find(u => u.orderId === 'A-4').status, 'on_way', '(3) Dağıtımda → on_way');
eq(r3.find(u => u.orderId === 'A-5').status, 'cancelled', '(3) İptal → cancelled');

// ── (4) صف بلا رقم طلب أو بلا تتبّع → تحذير، يُتجاهَل ──
const PARTIAL = [HEADER,
  row('116000000009','9','','Kargo Yüklendi',''),     // بلا order_id
  row('','9','','Kargo Yüklendi','A-9'),              // بلا تتبّع
];
const r4 = parseYurticiReport(PARTIAL);
ok(r4.updates.length === 0, '(4) صفوف ناقصة لا تُنتج تحديثات');
ok(r4.warnings.length >= 1, '(4) صفوف ناقصة تُنتج تحذيراً');

// ── (5) رقم تتبّع بفواصل/فراغات يُنظَّف لأرقام فقط ──
eq(parseYurticiReport([HEADER, row(' 116083175079 ','1','','Kargo Yüklendi','A-X')]).updates[0].tracking,
  '116083175079', '(5) تنظيف رقم التتبّع');

// ── (7) «Yolda» (على الطريق) → on_way (كان لا يتطابق فلا يتقدّم) ──
eq(parseYurticiReport([HEADER, row('116000000010','x','','Yolda','Y-1')]).updates[0].status,
  'on_way', '(7) Yolda → on_way');

// ── (8) قيم İade سلبية لا تُحسب إرجاعاً («Yapılmadı/Reddedildi/Yok») ──
const NEG = parseYurticiReport([HEADER,
  row('116000000021','1','İadesi Yapılmadı','Kargo Yüklendi','N-1'),
  row('116000000022','2','Yok','Kargo Yüklendi','N-2'),
  row('116000000023','3','İade Reddedildi','Teslim Edildi','N-3'),
]).updates;
eq(NEG.find(u => u.orderId === 'N-1').status, 'shipped', '(8) «İadesi Yapılmadı» ليست إرجاعاً → shipped');
eq(NEG.find(u => u.orderId === 'N-2').status, 'shipped', '(8) «Yok» ليست إرجاعاً → shipped');
eq(NEG.find(u => u.orderId === 'N-3').status, 'delivered', '(8) «İade Reddedildi» ليست إرجاعاً → delivered');

// ── (9) تكرار نفس الطلب → نبقي أرفع حالة (most-advanced) ──
const DUP = parseYurticiReport([HEADER,
  row('116000000030','x','','Kargo Yüklendi','D-1'),   // shipped (أقدم/أعلى الملف)
  row('116000000030','x','','Teslim Edildi','D-1'),    // delivered (أحدث/أسفل)
]).updates;
ok(DUP.length === 1, '(9) صفّان لنفس الطلب → تحديث واحد');
eq(DUP[0].status, 'delivered', '(9) إزالة التكرار تبقي الأرفع (delivered) لا الأقدم');

// ── (10) رقم تتبّع رقميّ (لا نصّي) من xlsx يُقرأ صحيحاً ──
eq(parseYurticiReport([HEADER, row(116083175079, 'x', '', 'Kargo Yüklendi', 'Z-1')]).updates[0].tracking,
  '116083175079', '(10) رقم تتبّع رقميّ → نصّ أرقام صحيح');

// ── (6) مدخلات غير صالحة آمنة ──
ok(parseYurticiReport(null).updates.length === 0, '(6) null آمن');
ok(parseYurticiReport([]).updates.length === 0, '(6) فارغ آمن');
ok(parseYurticiReport([HEADER]).updates.length === 0, '(6) ترويسة بلا صفوف آمنة');
// ملف غير تقرير يورتيتشي (أعمدة ناقصة) → بلا تحديثات + تحذير
ok(parseYurticiReport([['col1','col2'],['a','b']]).warnings.length >= 1, '(6) ملف خاطئ → تحذير');

console.log(`\n${fail === 0 ? '✅' : '⚠️'}  نجح ${pass} · فشل ${fail}`);
process.exit(fail === 0 ? 0 : 1);
