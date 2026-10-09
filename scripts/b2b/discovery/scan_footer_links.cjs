// Scans the homepage HTML already saved by audit_platforms.cjs (no new requests) for supplier / partner / contact links and role mailboxes.
// usage: node scan_footer_links.cjs <p2dir> name1,name2,...
const fs = require('fs');
const [dir, namesArg] = process.argv.slice(2);
const want = namesArg.split(',');
const sets = [['audit51.json', 'raw_audit'], ['audit_exp1.json', 'exp1/raw_audit'], ['audit_exp2.json', 'exp2/raw_audit'], ['audit_exp3.json', 'exp3/raw_audit']];
const RE = /(supplier|vendor|partner|procure|wholesale|b2b|contact|sell|مورد|اتصل|شراكة)/i;
for (const [af, rd] of sets) {
  let a; try { a = JSON.parse(fs.readFileSync(`${dir}/${af}`, 'utf8')); } catch { continue; }
  a.forEach((r, i) => {
    if (!want.includes(r.name)) return;
    let h = ''; try { h = fs.readFileSync(`${dir}/${rd}/p${i}.html`, 'utf8'); } catch { console.log('##', r.name, '(no saved html)'); return; }
    const links = [];
    const re = /<a\b[^>]*?href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(h))) {
      const t = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (RE.test(m[1] + ' ' + t) && !/^(mailto|tel|javascript)/i.test(m[1])) links.push(`${t} => ${m[1].slice(0, 90)}`);
    }
    const em = [...new Set(h.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [])].filter((e) => !/\.(png|jpe?g|svg|webp)$/i.test(e)).slice(0, 4);
    console.log('##', r.name, '| status', r.audit.http_status, '\n  ', [...new Set(links)].slice(0, 8).join('\n   '), '\n   emails:', em.join(', '));
  });
}
