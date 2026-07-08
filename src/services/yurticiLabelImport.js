// ════════════════════════════════════════════════════════════════════
// yurticiLabelImport.js — استخراج نصّ بوليصة يورتيتشي (PDF) في المتصفّح
// ────────────────────────────────────────────────────────────────────
// يستعمل pdf.js (build legacy لأوسع توافق مع أجهزة الفريق) محمّلاً عند الطلب
// فقط (dynamic import) — لا يثقل الحزمة الأولى (نفس نمط xlsx). يعيد النصّ
// الخطّي ثم نمرّره لمحلّل نقيّ مُختبَر (parseYurticiLabels).
//
// المنطق النقيّ (التحليل) في yurticiLabels.js ومُغطّى بـtest-yurtici-labels.mjs.
// هذا الملف غلاف متصفّح فقط (worker) — لا يُستورد في اختبارات node.
// ════════════════════════════════════════════════════════════════════
import { parseYurticiLabels } from './yurticiLabels.js';

export { parseYurticiLabels };

let _pdfjs = null;
async function getPdfjs() {
  if (_pdfjs) return _pdfjs;
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // عامل pdf.js كأصل مُجزّأ من Vite (?url) — يتجنّب مشاكل CORS/المسار.
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  _pdfjs = pdfjs;
  return pdfjs;
}

// يحوّل ملف PDF (File/Blob/ArrayBuffer) إلى نصّ خطّي (سطر لكل عنصر).
export async function extractTextFromPdf(input) {
  const buf = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  const pdfjs = await getPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  let text = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    text += tc.items.map((i) => i.str).join('\n') + '\n';
  }
  return text;
}

// راحة: ملف PDF → { pairs, warnings } مباشرةً.
export async function parsePdfLabels(input) {
  const text = await extractTextFromPdf(input);
  return parseYurticiLabels(text);
}
