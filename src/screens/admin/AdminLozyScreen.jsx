// =============================================================
// AdminLozyScreen — manage what Lozy (AI assistant) has learned
// from the team. Admin can review, add, or remove facts that get
// injected into every Lozy conversation (lozy_knowledge table).
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@services/supabase';

export default function AdminLozyScreen() {
  const [facts, setFacts]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [newFact, setNewFact] = useState('');
  const [saving, setSaving]   = useState(false);
  const [busy, setBusy]       = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('lozy_knowledge')
        .select('*')
        .order('created_at', { ascending: false });
      setFacts(data ?? []);
    } catch { /* table may not exist */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addFact = async () => {
    const f = newFact.trim();
    if (!f) return;
    setSaving(true);
    try {
      await supabase.from('lozy_knowledge').insert({ fact: f, taught_by: 'الأدمن', is_active: true });
      setNewFact('');
      await load();
    } catch (e) { alert('خطأ: ' + e.message); }
    finally { setSaving(false); }
  };

  const toggleActive = async (row) => {
    setBusy(row.id);
    try {
      await supabase.from('lozy_knowledge').update({ is_active: !row.is_active }).eq('id', row.id);
      setFacts(p => p.map(r => r.id === row.id ? { ...r, is_active: !r.is_active } : r));
    } finally { setBusy(null); }
  };

  const remove = async (id) => {
    if (!confirm('حذف هذه المعلومة نهائياً من ذاكرة لوزي؟')) return;
    setBusy(id);
    try {
      await supabase.from('lozy_knowledge').delete().eq('id', id);
      setFacts(p => p.filter(r => r.id !== id));
    } finally { setBusy(null); }
  };

  const activeCount = facts.filter(f => f.is_active).length;

  return (
    <div className="space-y-4 pb-8" dir="rtl">
      <div>
        <h2 className="text-lg font-extrabold text-text">🌸 معرفة لوزي</h2>
        <p className="text-xs text-muted mt-0.5">
          ما تعلّمته لوزي من الفريق — يُستخدم في كل المحادثات · {activeCount} معلومة نشطة
        </p>
      </div>

      {/* Add new fact */}
      <div className="bg-surface border border-border rounded-2xl p-4 space-y-2">
        <label className="text-xs font-bold text-muted block">➕ علّم لوزي معلومة جديدة</label>
        <div className="flex gap-2">
          <input
            value={newFact}
            onChange={e => setNewFact(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addFact()}
            placeholder="مثال: واتساب خدمة العملاء هو 0090..."
            className="flex-1 border border-border rounded-xl px-3 py-2.5 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30"
          />
          <button onClick={addFact} disabled={saving || !newFact.trim()}
            className="px-5 py-2.5 rounded-xl bg-teal text-navy text-sm font-bold disabled:opacity-40 hover:bg-teal/90 transition shrink-0">
            {saving ? '…' : 'إضافة'}
          </button>
        </div>
      </div>

      {/* Facts list */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-surface-alt animate-pulse rounded-2xl" />)}</div>
      ) : facts.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <p className="text-3xl mb-2">🧠</p>
          <p className="text-sm">لوزي لم تتعلّم شيئاً بعد</p>
          <p className="text-xs mt-1">عندما يعلّمها موظف معلومة، تظهر هنا تلقائياً</p>
        </div>
      ) : (
        <div className="space-y-2">
          {facts.map(f => (
            <div key={f.id} className={`bg-surface border rounded-2xl p-3.5 flex items-start gap-3 ${f.is_active ? 'border-border' : 'border-border/40 opacity-60'}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text leading-relaxed">{f.fact}</p>
                <p className="text-[10px] text-muted mt-1">
                  {f.taught_by ? `علّمها: ${f.taught_by}` : 'مصدر غير معروف'}
                  {f.created_at && ` · ${new Date(f.created_at).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { day:'numeric', month:'short' })}`}
                  {!f.is_active && ' · معطّلة'}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => toggleActive(f)} disabled={busy === f.id}
                  title={f.is_active ? 'تعطيل' : 'تفعيل'}
                  className="w-7 h-7 rounded-lg bg-surface-alt flex items-center justify-center text-muted hover:text-teal transition text-xs disabled:opacity-40">
                  {f.is_active ? '🔕' : '🔔'}
                </button>
                <button onClick={() => remove(f.id)} disabled={busy === f.id}
                  title="حذف"
                  className="w-7 h-7 rounded-lg bg-surface-alt flex items-center justify-center text-muted hover:text-red-fg hover:bg-red-bg transition text-xs disabled:opacity-40">
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
