// Builds the per-product net-profit model (xlsx with live formulas). Unknown inputs are left BLANK; the sheet shows what is missing per product
// and computes only when all required inputs exist. Fee tables = official noon (helpcenter.noon.partners) and Amazon.ae (sell.amazon.ae/pricing) pages fetched 2026-10-10.
// usage: node build_profit_model.cjs <kitDir> <outXlsx>
const fs = require('fs'); const path = require('path'); const XLSX = require('xlsx');
const [kitDir, outFile] = process.argv.slice(2);
const kit = JSON.parse(fs.readFileSync(path.join(kitDir, 'LOWES_UAE_Product_Sheet_DRAFT.json'), 'utf8')).products;
const wb = XLSX.utils.book_new();

// ---- Settings
const settings = [
  ['الإعداد', 'القيمة', 'المصدر / ملاحظة'],
  ['نسبة VAT على رسوم المنصة (مثال 0.05 إن كانت تنطبق) — اتركها فارغة إن لم تُحسم', null, 'تُحسم مع المحاسب؛ رسوم المنصتين تُعرض دون VAT ويُضاف VAT عليها'],
  ['noon FBN — تخزين شهري لكل قدم³ (د)', 1.75, 'noon FBN fees page، نافذ من 1/10/2026'],
  ['Amazon FBA — تخزين شهري لكل قدم³ (د)', 2, 'sell.amazon.ae/pricing (قد يكون قديماً — C-17)'],
  ['عتبة سعر العمولة (د)', 50, 'الجمال/العناية: 8% حتى العتبة و15% فوقها على السعر كله'],
  ['نسبة العمولة المنخفضة', 0.08, 'noon + Amazon'],
  ['نسبة العمولة العالية', 0.15, 'noon + Amazon'],
  ['حد أدنى للعمولة (د)', 1, 'noon + Amazon'],
  ['عتبة سعر رسم الشحن (د)', 25, 'FBN/FBA: عمود ≤25 أو >25 درهم'],
  ['قدم³ بالسنتيمتر³', 28316.84, 'Amazon + noon (28317)'],
];
const wsS = XLSX.utils.aoa_to_sheet(settings); wsS['!cols'] = [{ wch: 70 }, { wch: 14 }, { wch: 70 }];
XLSX.utils.book_append_sheet(wb, wsS, 'Settings');

// ---- Fees (standard parcel, per unit; upper-bound weights in kg)
const noon = [[0.25, 7.2, 9.2], [0.5, 7.5, 9.5], [1, 8.5, 10.5], [1.5, 9, 11], [2, 9.5, 11.5], [3, 10.5, 12.5]];
const amz = [[0.25, 7.2, 9.2], [0.5, 7.5, 9.5], [1, 8.5, 10.5], [1.5, 9, 11], [2, 9.5, 11.5], [3, 10.5, 12.5]];
const fees = [['noon FBN (من 10/9/2026) — Standard parcel', '', ''], ['الوزن الأعلى (كغ)', 'سعر ≤25 د', 'سعر >25 د'], ...noon, [], ['Amazon FBA (سارية من 1/8/2025) — Standard parcel', '', ''], ['الوزن الأعلى (كغ)', 'سعر ≤25 د', 'سعر >25 د'], ...amz, [], ['ملاحظة: المغلفات (Envelope) والأوزان >3 كغ تُدخل يدوياً في عمود Override. الأرقام من الصفحات الرسمية بتاريخ 10/10/2026.']];
const wsF = XLSX.utils.aoa_to_sheet(fees); wsF['!cols'] = [{ wch: 46 }, { wch: 14 }, { wch: 14 }];
XLSX.utils.book_append_sheet(wb, wsF, 'Fees');
// noon upper bounds: Fees!A3:A8 ; values B3:C8. Amazon: header row 11 -> data rows 12..17
const N = { up: 'Fees!$A$3:$A$8', lo: 'Fees!$B$3:$B$8', hi: 'Fees!$C$3:$C$8' };
const A = { up: 'Fees!$A$12:$A$17', lo: 'Fees!$B$12:$B$17', hi: 'Fees!$C$12:$C$17' };

// ---- Products
const head = ['SKU', 'المنتج', 'الحجم (كتالوج)', 'سعر البيع د (إدخال)', 'وزن العبوة مع الكرتون كغ (إدخال)', 'طول سم', 'عرض سم', 'ارتفاع سم', 'تكلفة المنتج COGS د/وحدة', 'شحن للمستودع د/وحدة', 'أشهر التخزين (متوسط)', 'إعلانات د/وحدة', 'تكاليف أخرى د/وحدة', 'Override شحن noon د', 'Override شحن Amazon د',
  'الناقص', 'قدم³', 'نسبة العمولة', 'عمولة د', 'noon: شحن/تجهيز د', 'noon: تخزين د', 'noon: VAT على الرسوم د', 'noon: صافي الربح د', 'noon: هامش %', 'Amazon: شحن/تجهيز د', 'Amazon: تخزين د', 'Amazon: VAT على الرسوم د', 'Amazon: صافي الربح د', 'Amazon: هامش %'];
const rows = [head];
kit.forEach((p, i) => {
  const r = i + 2;
  const miss = `=IF(D${r}="","السعر ","")&IF(E${r}="","الوزن ","")&IF(COUNT(F${r}:H${r})<3,"الأبعاد ","")&IF(I${r}="","COGS ","")&IF(J${r}="","شحن-مستودع ","")&IF(K${r}="","أشهر-تخزين ","")&IF(Settings!$B$2="","VAT ","")`;
  const cbf = `=IF(COUNT(F${r}:H${r})=3,F${r}*G${r}*H${r}/Settings!$B$10,"")`;
  const rate = `=IF(D${r}="","",IF(D${r}<=Settings!$B$5,Settings!$B$6,Settings!$B$7))`;
  const ref = `=IF(D${r}="","",MAX(Settings!$B$8,R${r}*D${r}))`;
  const fee = (t, ov) => `=IF(${ov}${r}<>"",${ov}${r},IF(OR(D${r}="",E${r}=""),"",IF(E${r}>3,"",IF(D${r}<=Settings!$B$9,INDEX(${t.lo},COUNTIF(${t.up},"<"&E${r})+1),INDEX(${t.hi},COUNTIF(${t.up},"<"&E${r})+1)))))`;
  const stor = (rateCell) => `=IF(OR(Q${r}="",K${r}=""),"",Q${r}*Settings!${rateCell}*K${r})`;
  const vat = (fc, sc) => `=IF(OR(S${r}="",${fc}${r}="",${sc}${r}="",Settings!$B$2=""),"",Settings!$B$2*(S${r}+${fc}${r}+${sc}${r}))`;
  const net = (fc, sc, vc) => `=IF(OR(P${r}<>"",S${r}="",${fc}${r}="",${sc}${r}="",${vc}${r}=""),"",D${r}-S${r}-${fc}${r}-${sc}${r}-${vc}${r}-I${r}-J${r}-N(L${r})-N(M${r}))`;
  const mar = (nc) => `=IF(${nc}${r}="","",${nc}${r}/D${r})`;
  rows.push([p.internal_sku, p.product_name_en, p.pack_size, null, null, null, null, null, null, null, null, null, null, null, null, miss, cbf, rate, ref,
    fee(N, 'N'), stor('$B$3'), vat('T', 'U'), net('T', 'U', 'V'), mar('W'),
    fee(A, 'O'), stor('$B$4'), vat('Y', 'Z'), net('Y', 'Z', 'AA'), mar('AB')]);
});
const wsP = XLSX.utils.aoa_to_sheet(rows.map((row) => row.map((c) => (typeof c === 'string' && c.startsWith('=') ? { t: 's', v: '', f: c.slice(1) } : c))));
wsP['!cols'] = head.map((h, i) => ({ wch: i < 2 ? 34 : 16 }));
XLSX.utils.book_append_sheet(wb, wsP, 'Products');
const readme = [['نموذج صافي الربح لكل منتج — اقرأ أولاً'], ['1) أدخل فقط الحقول الزرقاء (D–O). لا تُملأ بتخمين: اترك المجهول فارغاً.'], ['2) عمود «الناقص» يعرض ما ينقص قبل أن تُحسب النتيجة؛ لا يُحسب صافي الربح إلا عند اكتمال المدخلات.'], ['3) الصافي = السعر − العمولة − شحن/تجهيز المنصة − تخزين − VAT على الرسوم − COGS − شحن للمستودع − إعلانات − أخرى.'], ['4) الجداول للشحن القياسي (Standard parcel) حتى 3 كغ؛ غير ذلك: Override يدوي.'], ['5) الرسوم من صفحات رسمية بتاريخ 10/10/2026؛ رسوم Amazon قد تكون أقدم (C-17). لا يشمل ضريبة الشركات ولا رسوم تسجيل المنتجات.']];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), 'README');
XLSX.writeFile(wb, outFile);
console.log('written', outFile, 'products', kit.length);
