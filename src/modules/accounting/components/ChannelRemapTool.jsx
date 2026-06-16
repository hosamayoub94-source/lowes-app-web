// =============================================================
// ChannelRemapTool — أداة ربط القيود القديمة (نصّ حر) بالقنوات المُدارة.
//   القيود القديمة تستخدم category نصّاً (إيرادات أخرى، مبيعات مباشرة…) فلا
//   تنضمّ تحت قناة → التقرير مجزّأ. هنا نختار قناةً لكل category ونعيّن channel_id.
//   ⚠️ يعدّل بيانات فعلية (bulk) — يتطلّب تأكيداً صريحاً. قابل للتراجع بإلغاء الربط.
// =============================================================
import { useMemo, useState } from 'react';

export default function ChannelRemapTool({ entries = [], channels = [], updateEntry, onClose, onDone }) {
  // المجموعات: القيود التشغيلية بلا channel_id، مجمّعة حسب category النصّي.
  const groups = useMemo(() => {
    const m = new Map();
    for (const e of entries) {
      if (e.channel_id) continue;
      const cat = (e.category && String(e.category).trim()) || '(بلا تصنيف)';
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat).push(e);
    }
    return Array.from(m.entries())
      .map(([category, list]) => ({ category, list, count: list.length }))
      .sort((a, b) => b.count - a.count);
  }, [entries]);

  const [picks, setPicks] = useState({}); // category → channelId
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // {updated, errors}
  const [confirm, setConfirm] = useState(false);

  const plan = useMemo(
    () => groups.filter(g => picks[g.category]).map(g => ({ ...g, channelId: picks[g.category] })),
    [groups, picks],
  );
  const totalToUpdate = plan.reduce((s, g) => s + g.count, 0);

  async function apply() {
    setBusy(true);
    let updated = 0, errors = 0;
    for (const g of plan) {
      for (const e of g.list) {
        try { await updateEntry(e.id, { channel_id: g.channelId }); updated++; }
        catch { errors++; }
      }
    }
    setBusy(false);
    setDone({ updated, errors });
    setConfirm(false);
    if (onDone) onDone();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose} dir="rtl">
      <div className="bg-surface rounded-2xl w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg text-text">🔗 ربط القيود القديمة بالقنوات</h3>
            <p className="text-xs text-muted mt-0.5">اختر قناةً لكل تصنيف نصّي — يُعيّن channel_id لكل قيوده ليظهر تحت القناة في التقرير.</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text text-2xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-2">
          {done ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm text-text font-semibold">تم تحديث {done.updated} قيد</p>
              {done.errors > 0 && <p className="text-xs text-red-500 mt-1">{done.errors} قيد فشل تحديثه</p>}
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-10 text-muted text-sm">كل القيود مربوطة بقنوات — لا شيء للربط 🎉</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream text-xs text-muted">
                  <th className="py-2 px-3 text-right">التصنيف النصّي</th>
                  <th className="py-2 px-3 text-center">عدد القيود</th>
                  <th className="py-2 px-3 text-right">القناة الهدف</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => (
                  <tr key={g.category} className="border-t border-border">
                    <td className="py-2 px-3 text-text">{g.category}</td>
                    <td className="py-2 px-3 text-center font-mono text-xs text-muted">{g.count}</td>
                    <td className="py-2 px-3">
                      <select
                        value={picks[g.category] || ''}
                        onChange={e => setPicks(p => ({ ...p, [g.category]: e.target.value }))}
                        className="w-full border border-border rounded-lg px-2 py-1 text-xs bg-cream text-text"
                      >
                        <option value="">— تجاهُل —</option>
                        {channels.map(c => <option key={c.id} value={c.id}>{c.icon || '📌'} {c.name_ar}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!done && groups.length > 0 && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3">
            <span className="text-xs text-muted">
              {totalToUpdate > 0 ? `سيُحدَّث ${totalToUpdate} قيد عبر ${plan.length} تصنيف` : 'اختر قناةً لتصنيف واحد على الأقل'}
            </span>
            {confirm ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-amber-600 font-semibold">تأكيد؟</span>
                <button onClick={apply} disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-navy text-white text-xs font-bold hover:opacity-90 disabled:opacity-50">
                  {busy ? 'جارٍ الربط…' : 'نعم، اربط'}
                </button>
                <button onClick={() => setConfirm(false)} disabled={busy}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted">تراجع</button>
              </div>
            ) : (
              <button onClick={() => setConfirm(true)} disabled={totalToUpdate === 0}
                className="px-4 py-1.5 rounded-lg bg-teal text-navy text-xs font-bold hover:bg-teal/90 disabled:opacity-40">
                ربط الآن
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
