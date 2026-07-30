// babel-autosync — مزامنة شحنات بابل اكسبرس تلقائياً (بدون تدخل)
// ─────────────────────────────────────────────────────────────
// يفتح كروم بجلسة محفوظة (بروفايل مستقل عن كرومك اليومي)، يدخل صفحة «شحناتي»
// في بابل، يمرّر حتى تحميل كل الشحنات، يستخرج (رقم/اسم/تاريخ/حالة) ويرسلها
// لوظيفة import-babel-shipments (مطابقة بالاسم + كتابة أرقام التتبع + تحديث الحالات).
//
// الاستعمال:
//   node sync.mjs --setup   ← أول مرة فقط: يفتح نافذة، سجّل دخولك ببابل ثم اتركها
//   node sync.mjs           ← التشغيل الدوري (مجدول بويندوز) — صامت تماماً
//
// لو انتهت جلسة بابل: يفتح نافذة تسجيل دخول تلقائياً (لو المستخدم موجود) ويكمل بعدها.
import { chromium } from 'playwright-core';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE = join(HERE, 'chrome-profile');
const LOG = join(HERE, 'sync.log');
const SETUP = process.argv.includes('--setup');

const SUPABASE_FN = 'https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/import-babel-shipments';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE3OTQsImV4cCI6MjA5MTc2Nzc5NH0.e9DiuJySh4WMp7x5ErVV5LqBFawHUESrlGDRb8N5zPM';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG, line + '\n'); } catch {}
}

// فحص تشخيصي غني: نميّز «غير مسجَّل دخول» عن «مسجَّل لكن الحساب الشخصي بلا
// شحنات» (يحتاج تبديل لحساب الشركة «Lowes Profesyonel» عبر المبدّل بالهيدر) عن
// «صفحة محظورة/تحدّي بوت». يطبع أول 200 حرف لتشخيص أي حالة غير متوقعة.
async function inspect(page) {
  try {
    await page.goto('https://www.babel-express.com/account/shipments', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    const [txt, hasAwb, hasLogout, url] = await Promise.all([
      page.evaluate(() => document.body.innerText.slice(0, 200)),
      page.evaluate(() => /\b26\d{10}\b/.test(document.body.innerText)),
      page.evaluate(() => /تسجيل الخروج/.test(document.body.innerText)),
      page.evaluate(() => location.href),
    ]);
    return { hasAwb, hasLogout, url, snippet: txt.replace(/\s+/g, ' ') };
  } catch (e) { return { hasAwb: false, hasLogout: false, url: 'ERR', snippet: e.message }; }
}

// يحاول تبديل حساب الشركة «Lowes Profesyonel» من مبدّل الحساب بالهيدر إن وُجد
// (تسجيل الدخول برقم هاتف شخصي قد يفتح على حساب فردي بلا شحنات).
async function trySwitchCompany(page) {
  try {
    const btn = page.getByText('Lowes Profesyonel', { exact: false }).first();
    if (await btn.count() > 0) { await btn.click({ timeout: 5000 }); await page.waitForTimeout(2000); return true; }
  } catch {}
  return false;
}

async function loggedIn(page) {
  let info = await inspect(page);
  log(`  فحص: url=${info.url} logout=${info.hasLogout} awb=${info.hasAwb} :: ${info.snippet}`);
  if (info.hasAwb) return true;
  if (info.hasLogout && !info.hasAwb) {
    // مسجَّل دخول لكن بلا شحنات ظاهرة — جرّب تبديل الحساب لشركة Lowes Profesyonel.
    if (await trySwitchCompany(page)) {
      info = await inspect(page);
      log(`  بعد تبديل الحساب: url=${info.url} awb=${info.hasAwb} :: ${info.snippet}`);
      if (info.hasAwb) return true;
    }
  }
  return false;
}

async function run() {
  let headless = !SETUP;
  let ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless, viewport: { width: 1400, height: 900 } });
  let page = ctx.pages()[0] || await ctx.newPage();

  let ok = await loggedIn(page);
  if (!ok && headless) {
    // الجلسة انتهت — أعد الفتح بنافذة مرئية ليسجّل المالك دخوله (لو موجود).
    log('الجلسة منتهية — فتح نافذة لتسجيل الدخول…');
    await ctx.close();
    ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: false, viewport: { width: 1400, height: 900 } });
    page = ctx.pages()[0] || await ctx.newPage();
    ok = await loggedIn(page);
  }
  if (!ok) {
    // انتظر تسجيل الدخول اليدوي حتى 15 دقيقة. ⚠️ التحقق يجري في تبويب منفصل
    // حتى لا يُعاد تحميل تبويب المستخدم ويمسح رمز OTP وهو يكتبه.
    log('بانتظار تسجيل الدخول في النافذة المفتوحة (15 دقيقة كحد أقصى)…');
    try { await page.goto('https://www.babel-express.com/login', { waitUntil: 'domcontentloaded' }); } catch {}
    const check = await ctx.newPage();
    await page.bringToFront();
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline && !ok) {
      await check.waitForTimeout(15000);
      ok = await loggedIn(check).catch(() => false);
    }
    try { await check.close(); } catch {}
    // بعد نجاح الدخول: أعد تبويب العمل لصفحة الشحنات (الآمن الآن).
    if (ok) ok = await loggedIn(page).catch(() => false);
  }
  if (!ok) { log('❌ فشل: لا جلسة بابل. شغّل: node sync.mjs --setup'); await ctx.close(); process.exit(2); }

  // تمرير حتى تحميل كل الشحنات (infinite scroll، 25/دفعة).
  let prev = 0, stable = 0;
  for (let i = 0; i < 60 && stable < 3; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    const c = await page.evaluate(() => [...new Set(document.body.innerText.match(/\b26\d{10}\b/g) || [])].length);
    if (c === prev) stable++; else { stable = 0; prev = c; }
  }
  log(`تحميل ${prev} شحنة — استخراج…`);

  const rows = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('div')].filter(d => {
      const t = d.innerText || '';
      return /\b26\d{10}\b/.test(t) && t.length < 600 && !/\b26\d{10}\b[\s\S]*\b26\d{10}\b/.test(t);
    });
    const seen = new Set(); const out = [];
    for (const c of cards) {
      const t = c.innerText;
      const awb = (t.match(/\b26\d{10}\b/) || [])[0];
      if (!awb || seen.has(awb)) continue; seen.add(awb);
      const L = t.split('\n').map(s => s.trim()).filter(Boolean);
      const di = L.findIndex(l => /^\d{2}\/\d{2}\/\d{4}$/.test(l));
      out.push({ awb, dest: L[2] || '', name: L[4] || '', date: di > -1 ? L[di] : '', status: L.filter(l => !/تعقب|تقييم/.test(l)).pop() || '' });
    }
    return out;
  });
  await ctx.close();

  if (rows.length === 0) { log('❌ لا شحنات مستخرجة — تغيّرت بنية الصفحة؟'); process.exit(3); }

  const res = await fetch(SUPABASE_FN, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + ANON, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ shipments: rows }),
  }).then(r => r.json());
  log(`✅ أُرسل ${rows.length} — جديد: ${res.updated} · موجود: ${res.already} · بلا مطابقة: ${res.unmatched?.length ?? '?'}`);
  if ((res.unmatched?.length || 0) > 0) log('بلا مطابقة: ' + res.unmatched.map(u => u.name).join(' | '));
}

run().catch(e => { log('❌ خطأ: ' + e.message); process.exit(1); });
