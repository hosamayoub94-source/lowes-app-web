// Bookmarklet: استيراد شحنات بابل → تطبيق لويز
// الاستعمال: أنشئ إشارة مرجعية (Bookmark) في كروم والصق السطر الأخير (javascript:...)
// في خانة العنوان، ثم افتح https://www.babel-express.com/account/shipments واضغط الإشارة.
// يعمل: تمرير تلقائي حتى تحميل كل الشحنات → استخراج (رقم/اسم/تاريخ/حالة) →
// إرسال لـ import-babel-shipments (مطابقة بالاسم + كتابة أرقام التتبع + تحديث الحالات).
(async () => {
  if (!location.host.includes('babel-express.com')) { alert('افتح صفحة شحناتي في بابل اكسبرس أولاً'); return; }
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;top:10px;left:10px;z-index:99999;background:#0f1f3d;color:#fff;padding:10px 16px;border-radius:12px;font-family:sans-serif;font-size:14px';
  ov.textContent = 'جارٍ تحميل كل الشحنات…';
  document.body.appendChild(ov);
  let prev = 0, stable = 0;
  for (let i = 0; i < 60 && stable < 3; i++) {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r => setTimeout(r, 1500));
    const c = [...new Set(document.body.innerText.match(/\b26\d{10}\b/g) || [])].length;
    if (c === prev) stable++; else { stable = 0; prev = c; }
    ov.textContent = `جارٍ التحميل… ${c} شحنة`;
  }
  const cards = [...document.querySelectorAll('div')].filter(d => {
    const t = d.innerText || '';
    return /\b26\d{10}\b/.test(t) && t.length < 600 && !/\b26\d{10}\b[\s\S]*\b26\d{10}\b/.test(t);
  });
  const seen = new Set(); const rows = [];
  for (const c of cards) {
    const t = c.innerText;
    const awb = (t.match(/\b26\d{10}\b/) || [])[0];
    if (!awb || seen.has(awb)) continue; seen.add(awb);
    const L = t.split('\n').map(s => s.trim()).filter(Boolean);
    const di = L.findIndex(l => /^\d{2}\/\d{2}\/\d{4}$/.test(l));
    rows.push({ awb, dest: L[2] || '', name: L[4] || '', date: di > -1 ? L[di] : '', status: L.filter(l => !/تعقب|تقييم/.test(l)).pop() || '' });
  }
  ov.textContent = `إرسال ${rows.length} شحنة للتطبيق…`;
  const anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE3OTQsImV4cCI6MjA5MTc2Nzc5NH0.e9DiuJySh4WMp7x5ErVV5LqBFawHUESrlGDRb8N5zPM';
  try {
    const res = await fetch('https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/import-babel-shipments', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + anon, apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipments: rows }),
    }).then(r => r.json());
    ov.textContent = `✅ تم: ${res.updated} رقم جديد · ${res.already} موجود سابقاً · ${res.unmatched?.length || 0} بلا مطابقة`;
  } catch (e) { ov.textContent = '❌ فشل الإرسال: ' + e.message; }
  setTimeout(() => ov.remove(), 15000);
})();
