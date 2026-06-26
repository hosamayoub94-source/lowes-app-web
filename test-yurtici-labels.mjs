// تست محلّل بوليصة يورتيتشي (label PDF → order_id ↔ GÖ) — node test-yurtici-labels.mjs
// المرجع: ملف حقيقي C:\Users\acer\Downloads\Barcode.pdf (5 طلبات) — النص المستخرج أدناه.
import { parseYurticiLabels } from './src/services/yurticiLabels.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('❌', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — توقّعت ${JSON.stringify(b)} فجاء ${JSON.stringify(a)}`);

// ── (1) النص الخطّي الحقيقي كما يستخرجه pypdf/قارئ PDF (سطر لكل عنصر) ──
// يتضمّن قسم كعوب المستلم بالأسفل (ALICI/TAHSİLAT + GÖ مجرّد بلا «N/N GÖ») —
// يجب تجاهله. والرقم الثابت 7731066 (Dosya) يجب ألّا يُحسب GÖ.
const REAL = `26/06/2026-02:45:24
TAHSİLATLI GÖND.
GÖNDERİCİ:YOUSEF ŞAMRO - LOWE'S PROF…
Adı:ISMIL HAMOD
Adresi:GÜÇLÜKAYA Mah. ŞAİR DERTLİ Sok. No:33 D:5 Keçiören Ankara
Ürün->KOZMETIK
Dosya POŞET NO:
Fatura NO: 1
İrsaliye NO: TS-11058
TAH.ED.ÜRÜN BEDELİ: 700
TAHSİLAT TİPİ:Nakit
422444626 1/1 GÖ
7731066
REF.NO:TS-11058
26/06/2026-02:45:24
TAHSİLATLI GÖND.
GÖNDERİCİ:YOUSEF ŞAMRO - LOWE'S PROF…
Adı:ABDUL HAMİD AL-YAHYA
Adresi:Hurmalı Bakımyurdu Cd. No: 18/D/Yurtiçi Kargo Hanedan Karataş Adana
Ürün->KOZMETIK
Dosya POŞET NO:
Fatura NO: 2
İrsaliye NO: TS-11062
TAH.ED.ÜRÜN BEDELİ: 1500
TAHSİLAT TİPİ:Nakit
422444628 1/1 GÖ
7731066
REF.NO:TS-11062
26/06/2026-02:45:24
TAHSİLATLI GÖND.
GÖNDERİCİ:YOUSEF ŞAMRO - LOWE'S PROF…
Adı:ABDURRAHMAN ZİYADE
Adresi:Sinanbey Mah. YENİŞEHİR Sok. No:69 D:0 İnegöl Bursa
Ürün->KOZMETIK
Dosya POŞET NO:
Fatura NO: 3
İrsaliye NO: TS-11063
TAH.ED.ÜRÜN BEDELİ: 1000
TAHSİLAT TİPİ:Nakit
422444630 1/1 GÖ
7731066
REF.NO:TS-11063
26/06/2026-02:45:24
TAHSİLATLI GÖND.
GÖNDERİCİ:YOUSEF ŞAMRO - LOWE'S PROF…
Adı:ZİAD ALAMİN
Adresi:ORTA Mah. DR.BAKİ ÖZPINAR CADDESI Sok. No:29 A / Yurtiçi Kargo Serik Serik Antalya
Ürün->KOZMETIK
Dosya POŞET NO:
Fatura NO: 4
İrsaliye NO: TL-28596
TAH.ED.ÜRÜN BEDELİ: 1500
TAHSİLAT TİPİ:Nakit
422444632 1/1 GÖ
7731066
REF.NO:TL-28596
26/06/2026-02:45:24
TAHSİLATLI GÖND.
GÖNDERİCİ:YOUSEF ŞAMRO - LOWE'S PROF…
Adı:FATİMA TALEB
Adresi:HACI ÖMER ALPAGOT Mah. 6227 Sok. No:3 C Antakya Hatay
Ürün->KOZMETIK
Dosya POŞET NO:
Fatura NO: 5
İrsaliye NO: TL-28597
TAH.ED.ÜRÜN BEDELİ: 1200
TAHSİLAT TİPİ:Nakit
422444634 1/1 GÖ
7731066
REF.NO:TL-28597
ALICI
TAHSİLAT
422444626
ALICI
TAHSİLAT
422444628
ALICI
TAHSİLAT
422444630
ALICI
TAHSİLAT
422444632
ALICI
TAHSİLAT
422444634`;

const r1 = parseYurticiLabels(REAL);
eq(r1.pairs, [
  { orderId: 'TS-11058', go: '422444626' },
  { orderId: 'TS-11062', go: '422444628' },
  { orderId: 'TS-11063', go: '422444630' },
  { orderId: 'TL-28596', go: '422444632' },
  { orderId: 'TL-28597', go: '422444634' },
], '(1) خمسة أزواج صحيحة بالترتيب من PDF الحقيقي');
ok(r1.warnings.length === 0, `(1) بلا تحذيرات (كان ${JSON.stringify(r1.warnings)})`);
ok(!r1.pairs.some(p => p.go === '7731066'), '(1) الرقم الثابت 7731066 ليس GÖ');
ok(r1.pairs.length === 5, '(1) كعوب المستلم المجرّدة بالأسفل لم تُحسب أزواجاً إضافية');

// ── (2) صيغة pdf.js المُجزّأة: كل رمز على سطر («GÖ» منفصل عن الرقم) ──
const SPLIT = `İrsaliye NO:
TS-11058
422444626
1
/
1
GÖ
7731066
REF.NO:
TS-11058
İrsaliye NO:
TL-28597
422444634
1
/
1
GÖ
7731066
REF.NO:
TL-28597`;
const r2 = parseYurticiLabels(SPLIT);
eq(r2.pairs, [
  { orderId: 'TS-11058', go: '422444626' },
  { orderId: 'TL-28597', go: '422444634' },
], '(2) صيغة pdf.js المُجزّأة (رموز مفصولة بأسطر) تُحلَّل صحيحاً');

// ── (3) تعارض İrsaliye مع REF.NO → الزوج يعتمد İrsaliye (المُرتكَز موضعياً) ويُعلَّم ambiguous ──
const MISMATCH = `İrsaliye NO: TS-99999
422444600 1/1 GÖ
REF.NO:TS-11058`;
const r3 = parseYurticiLabels(MISMATCH);
eq(r3.pairs, [{ orderId: 'TS-99999', go: '422444600', ambiguous: true }], '(3) تعارض → يعتمد İrsaliye ويُعلَّم ambiguous (لا يُربَط تلقائياً)');
ok(r3.warnings.length >= 1, '(3) تعارض İrsaliye/REF يُنتج تحذيراً');

// ── (4) نص فارغ/بلا بوالص → بلا أزواج ولا انهيار ──
const r4 = parseYurticiLabels('');
eq(r4.pairs, [], '(4) نص فارغ → بلا أزواج');
const r4b = parseYurticiLabels('مجرّد نص بلا أي بوليصة هنا 12345');
eq(r4b.pairs, [], '(4b) نص بلا بوالص → بلا أزواج');

// ── (5) علامة GÖ بلا أي معرّف طلب قريب → تحذير، لا يُنتج زوجاً ملوّثاً ──
const r5 = parseYurticiLabels(`422444777 1/1 GÖ\n7731066`);
ok(r5.pairs.length === 0 && r5.warnings.length >= 1, '(5) GÖ بلا معرّف → تحذير بلا زوج');

// ── (6) مدخلات غير نصّية لا تُسقط الدالة ──
ok(parseYurticiLabels(null).pairs.length === 0, '(6) null آمن');
ok(parseYurticiLabels(undefined).pairs.length === 0, '(6) undefined آمن');

// ── (7) REF.NO مُجمَّعة بالأسفل (تبعثر التخطيط): İrsaliye يربط كل GÖ بشحنتها ──
// البُغ القديم كان يخطف 628 لـTS-1؛ الآن İrsaliye المُرتكَز يربط TS-2 بـ628 صحيحاً.
const GROUPED = `İrsaliye NO: TS-1
422444626 1/1 GÖ
İrsaliye NO: TS-2
422444628 1/1 GÖ
REF.NO:TS-1
REF.NO:TS-2`;
const r7 = parseYurticiLabels(GROUPED);
ok(r7.pairs.some(p => p.orderId === 'TS-1' && p.go === '422444626'), '(7) TS-1 ↔ 626');
ok(r7.pairs.some(p => p.orderId === 'TS-2' && p.go === '422444628'), '(7) TS-2 ↔ 628 (لا يخطفها REF مجاور)');
ok(!r7.pairs.some(p => p.orderId === 'TS-1' && p.go === '422444628'), '(7) 628 لا يُربط بـTS-1 (البُغ القديم اختفى)');

// ── (8) بوليصة مدفوعة مسبقاً (بلا أسطر TAHSİLAT) تُربَط طبيعياً ──
const PREPAID = `GÖNDERİCİ:YOUSEF
Adı:AHMET YILMAZ
İrsaliye NO: TL-30001
422450000 1/1 GÖ
7731066
REF.NO:TL-30001`;
eq(parseYurticiLabels(PREPAID).pairs, [{ orderId: 'TL-30001', go: '422450000' }], '(8) مدفوع مسبقاً (بلا TAHSİLAT) يُربَط');

// ── (9) صفحات متعددة / ≥٦ بوالص → كلها تُربَط بالترتيب ──
const ids9 = ['TS-1', 'TS-2', 'TS-3', 'TL-1', 'TL-2', 'TL-3'];
const gos9 = ['100001', '100002', '100003', '100004', '100005', '100006'];
let multi = '';
ids9.forEach((id, i) => { multi += `İrsaliye NO: ${id}\n${gos9[i]} 1/1 GÖ\n7731066\nREF.NO:${id}\n`; });
const r9 = parseYurticiLabels(multi);
ok(r9.pairs.length === 6, `(9) ٦ بوالص → ٦ أزواج (كان ${r9.pairs.length})`);
ok(ids9.every((id, i) => r9.pairs[i]?.orderId === id && r9.pairs[i]?.go === gos9[i]), '(9) كلها مربوطة صحيح بالترتيب');

// ── (10) كود طلب قديم بصيغة ARC-T-##### ──
eq(parseYurticiLabels(`İrsaliye NO: ARC-T-28579\n422460000 1/1 GÖ\nREF.NO:ARC-T-28579`).pairs,
  [{ orderId: 'ARC-T-28579', go: '422460000' }], '(10) كود قديم ARC-T-##### يُربَط');

// ── (11) طرود متعدّدة لنفس الشحنة (1/2 + 2/2 بنفس GÖ) → زوج واحد (إزالة التكرار) ──
const MULTIPIECE = `İrsaliye NO: TL-40000
422470000 1/2 GÖ
REF.NO:TL-40000
İrsaliye NO: TL-40000
422470000 2/2 GÖ
REF.NO:TL-40000`;
eq(parseYurticiLabels(MULTIPIECE).pairs, [{ orderId: 'TL-40000', go: '422470000' }], '(11) طرود متعدّدة → زوج واحد');

// ── (12) ثبات: الـPDF الحقيقي ما زال صفر تحذيرات وغير غامض (لا انحدار) ──
ok(r1.pairs.every(p => !p.ambiguous), '(12) الـPDF الحقيقي بلا أي زوج ambiguous');

console.log(`\n${fail === 0 ? '✅' : '⚠️'}  نجح ${pass} · فشل ${fail}`);
process.exit(fail === 0 ? 0 : 1);
