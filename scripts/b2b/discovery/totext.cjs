// usage: node totext.cjs raw/<name>.html  -> prints readable text (scripts/styles/tags removed), max N chars
const fs = require('fs');
const f = process.argv[2];
const max = Number(process.argv[3] || 6000);
let h = fs.readFileSync(f, 'utf8');
h = h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
h = h.replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ');
h = h.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
h = h.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
console.log(h.slice(0, max));
