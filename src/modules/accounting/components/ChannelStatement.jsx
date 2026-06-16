// =============================================================
// ChannelStatement — كشف حساب تراكمي لكل موزّع/مسوّق/قناة (له/عليه).
//   كل الحركات عبر الزمن + رصيد جارٍ — يجيب على «كم رصيد هذا الموزّع الآن».
//   تراكمي (غير مقيّد بالشهر) — بخلاف تقرير القنوات الشهري.
// =============================================================
import { useMemo, useState } from 'react';
import { computeChannelStatement } from './channelStatement.logic.js';
import { CCY } from './sourceBreakdown.logic.js';

function fmt(n, c) {
  if (!n) return null;
  return `${c.sym}${Number(n).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: c.maxFrac })}`;
}
function Multi({ amounts, signed = false, tone }) {
  const lines = CCY.map(c => {
    const v = amounts[c.key] || 0;
    if (!v) return null;
    const t = tone || (v >= 0 ? 'text-green-600' : 'text-red-500');
    const sign = signed ? (v >= 0 ? '+' : '−') : '';
    return { key: c.key, t, txt: `${sign}${c.sym}${Number(Math.abs(v)).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: c.maxFrac })}` };
  }).filter(Boolean);
  if (!lines.length) return <span className="text-muted">—</span>;
  return <div className="space-y-0.5">{lines.map(l => <div key={l.key} className={`font-mono text-xs font-semibold ${l.t}`}>{l.txt}</div>)}</div>;
}

export default function ChannelStatement({ entries = [], channels = [], onClose }) {
  // قائمة الجهات القابلة للكشف: القنوات المُدارة + أي category نصّي مستخدَم.
  const options = useMemo(() => {
    const opts = channels.map(c => ({ value: `ch:${c.id}`, label: `${c.icon || '📌'} ${c.name_ar}`, channelId: c.id }));
    const seen = new Set();
    for (const e of entries) {
      if (e.channel_id) continue;
      const cat = e.category && String(e.category).trim();
      if (cat && !seen.has(cat)) { seen.add(cat); opts.push({ value: `cat:${cat}`, label: `📝 ${cat}`, category: cat }); }
    }
    return opts;
  }, [entries, channels]);

  const [sel, setSel] = useState(options[0]?.value || '');
  const selected = options.find(o => o.value === sel) || null;

  const stmt = useMemo(
    () => selected ? computeChannelStatement(entries, { channelId: selected.channelId, category: selected.category }) : null,
    [entries, selected],
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose} dir="rtl">
      <div className="bg-surface rounded-2xl w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg text-text">📒 كشف حساب القناة (تراكمي)</h3>
            <p className="text-xs text-muted mt-0.5">كل الحركات عبر الزمن + رصيد جارٍ (له/عليه) — مستقلّ عن فلتر الشهر.</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text text-2xl leading-none">×</button>
        </div>

        <div className="px-5 py-3 border-b border-border">
          <select value={sel} onChange={e => setSel(e.target.value)}
            className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text font-semibold">
            {options.length === 0 && <option value="">— لا توجد قنوات/مصادر —</option>}
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="overflow-y-auto flex-1">
          {!stmt || stmt.count === 0 ? (
            <div className="text-center py-12 text-muted text-sm">لا توجد حركات لهذه الجهة</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-cream text-xs text-muted">
                  <th className="py-2 px-3 text-right">التاريخ</th>
                  <th className="py-2 px-3 text-right">البيان</th>
                  <th className="py-2 px-3 text-center">الحركة</th>
                  <th className="py-2 px-3 text-center">الرصيد الجاري</th>
                </tr>
              </thead>
              <tbody>
                {stmt.lines.map(l => (
                  <tr key={l.id} className="border-t border-border align-top">
                    <td className="py-2 px-3 text-xs text-muted whitespace-nowrap">{l.date || '—'}</td>
                    <td className="py-2 px-3">
                      <div className="text-text text-xs leading-tight">{l.description || '—'}</div>
                      {l.category && <div className="text-[10px] text-muted mt-0.5">{l.category}</div>}
                    </td>
                    <td className="py-2 px-3 text-center"><Multi amounts={l.delta} signed /></td>
                    <td className="py-2 px-3 text-center"><Multi amounts={l.balance} signed /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-cream text-xs font-bold align-top">
                  <td className="py-2 px-3 text-muted" colSpan={2}>الرصيد الختامي ({stmt.count} حركة)</td>
                  <td className="py-2 px-3 text-center text-muted text-[10px]">
                    <div>وارد: <Multi amounts={stmt.totalIn} tone="text-green-600" /></div>
                    <div className="mt-1">صادر: <Multi amounts={stmt.totalOut} tone="text-red-500" /></div>
                  </td>
                  <td className="py-2 px-3 text-center"><Multi amounts={stmt.closing} signed /></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
        <div className="px-5 py-2 text-[10px] text-muted border-t border-border">
          الرصيد الموجب = لنا عليه (دفعنا له أكثر / استلم منا) · السالب = له علينا. التحويلات الداخلية مستثناة.
        </div>
      </div>
    </div>
  );
}
