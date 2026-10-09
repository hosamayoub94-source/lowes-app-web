// one-off: annotations for batches 7-8
const fs = require('fs');
const f = __dirname + '/platform_annotations_2026-10-09.json';
const a = JSON.parse(fs.readFileSync(f, 'utf8'));
a.exclude['Health Nation'] = { kind: 'url_not_verified', reason: 'النطاق غير مربوط بالموقع (Wix 404) — الرابط الرسمي غير معروف' };
Object.assign(a.byName, {
  'Beauty Nation': { tier: 'D', priority: 'C', notes: 'الموقع يطلب مصادقة (401) فلم يُفحص ولم يُتجاوز. المنصة مذكورة بمصدر 2022 كمنصة متعددة العلامات لـChalhoub — يلزم فتحها يدوياً.' },
  'Brandkyu': { tier: 'D', priority: 'D', notes: 'موقع نشط لكن لا دليل على نشاط تجميل/عناية.' },
  'Omni The Label': { tier: 'D', priority: 'D', notes: 'موقع نشط لكن لا دليل على نشاط تجميل/عناية.' },
  'Beauty Solutions': { tier: 'D', priority: 'D', notes: 'عنوان الصفحة يوحي بصالون/خدمات تجميل في دبي لا متجر منتجات — يحتاج تحققاً.' },
  'Gomyz': { priority: 'C', notes: 'متجر عناية وتجميل أونلاين بنسخة إماراتية؛ لا صفحة موردين ظهرت.' },
  'Glamazle': { priority: 'C', notes: 'متجر جمال وأزياء أونلاين بدبي؛ لا صفحة موردين ظهرت.' },
  'Beauty Tribe': { priority: 'C', notes: 'متجر جمال متعدد العلامات بتوصيل خلال ساعتين (بحسب موقعه)؛ لا صفحة موردين ظهرت.' }
});
fs.writeFileSync(f, JSON.stringify(a, null, 1));
console.log('ok');
