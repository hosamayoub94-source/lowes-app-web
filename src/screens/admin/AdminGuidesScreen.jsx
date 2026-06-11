// =============================================================
// AdminGuidesScreen — لوحة إدارة الأدلة (CRUD على app_guides).
// مصدر واحد: ما يُضاف هنا يظهر في /guide ولوزي تعرفه. محميّة MANAGE_GUIDES.
// =============================================================
import { useEffect, useState } from 'react';
import { supabase } from '@services/supabase';
import { invalidateGuides } from '@services/guidesService';
import { NAV_GROUPS } from '@data/navigation';
import { PERMISSIONS, PERMISSION_DESCRIPTIONS } from '@data/permissions';

const BLANK = {
  key: '', section_key: 'core', title: '', icon: '📄', why: '',
  steps: [''], tips: [], routes: [], permission: '', sort_order: 100, is_published: true,
};

export default function AdminGuidesScreen() {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('app_guides').select('*').order('sort_order', { ascending: true });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    const g = {
      ...edit,
      permission: edit.permission || null,
      steps: (edit.steps || []).map(s => s.trim()).filter(Boolean),
      routes: (edit.routes || []).map(s => s.trim()).filter(Boolean),
      sort_order: Number(edit.sort_order) || 100,
      updated_at: new Date().toISOString(),
    };
    if (!g.key.trim() || !g.title.trim()) { alert('المفتاح والعنوان مطلوبان'); return; }
    setBusy(true);
    const { error } = await supabase.from('app_guides').upsert(g, { onConflict: 'key' });
    setBusy(false);
    if (error) { alert('خطأ: ' + error.message); return; }
    invalidateGuides(); setEdit(null); load();
  };

  const del = async (key) => {
    if (!confirm('حذف الدليل نهائياً؟')) return;
    await supabase.from('app_guides').delete().eq('key', key);
    invalidateGuides(); load();
  };

  const INP = 'w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-surface text-text';

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="font-extrabold text-text flex items-center gap-2"><span>📖</span> إدارة الأدلة</h1>
        <button onClick={() => setEdit({ ...BLANK })}
          className="bg-teal-600 text-white rounded-xl px-3 py-1.5 text-sm font-bold hover:bg-teal-700">+ دليل جديد</button>
      </div>
      <p className="text-xs text-muted">ما تضيفه هنا يظهر في «دليل التطبيق» لأصحاب الصلاحية، ولوزي تعرفه تلقائياً.</p>

      {rows.length === 0 && <div className="text-muted text-sm py-8 text-center">لا توجد أدلة بعد — اضغط «+ دليل جديد».</div>}
      {rows.map(g => (
        <div key={g.key} className="flex items-center justify-between bg-surface border border-border/60 rounded-xl px-3 py-2">
          <span className="text-sm text-text">
            {g.icon} {g.title}
            <span className="text-muted text-xs"> · {NAV_GROUPS[g.section_key] || g.section_key}
              {g.permission ? ` · 🔒 ${g.permission}` : ' · 👁 للجميع'}
              {!g.is_published ? ' · ⏸ مخفي' : ''}
            </span>
          </span>
          <span className="flex gap-3 shrink-0">
            <button onClick={() => setEdit({ ...g, permission: g.permission || '', steps: g.steps || [''], routes: g.routes || [] })}
              className="text-xs text-teal-700 font-bold">تعديل</button>
            <button onClick={() => del(g.key)} className="text-xs text-red-600 font-bold">حذف</button>
          </span>
        </div>
      ))}

      {edit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setEdit(null)}>
          <div className="bg-surface rounded-2xl p-4 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-2"
            onClick={e => e.stopPropagation()} dir="rtl">
            <h2 className="font-bold text-text">{edit.id ? 'تعديل دليل' : 'دليل جديد'}</h2>
            <label className="text-xs text-muted">المفتاح (إنجليزي ثابت، مثل orders_syria):</label>
            <input className={INP} value={edit.key} onChange={e => setEdit({ ...edit, key: e.target.value })} />
            <label className="text-xs text-muted">العنوان:</label>
            <input className={INP} value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} />
            <div className="flex gap-2">
              <div className="w-24">
                <label className="text-xs text-muted">أيقونة:</label>
                <input className={INP} value={edit.icon} onChange={e => setEdit({ ...edit, icon: e.target.value })} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted">القسم:</label>
                <select className={INP} value={edit.section_key} onChange={e => setEdit({ ...edit, section_key: e.target.value })}>
                  {Object.entries(NAV_GROUPS).map(([k, v]) => <option key={k} value={k}>{v || k}</option>)}
                </select>
              </div>
            </div>
            <label className="text-xs text-muted">لماذا (الفائدة):</label>
            <textarea className={INP} rows={2} value={edit.why} onChange={e => setEdit({ ...edit, why: e.target.value })} />
            <label className="text-xs text-muted">الخطوات (سطر لكل خطوة):</label>
            <textarea className={`${INP} h-28`} value={(edit.steps || []).join('\n')}
              onChange={e => setEdit({ ...edit, steps: e.target.value.split('\n') })} />
            <label className="text-xs text-muted">المسارات (مفصولة بفاصلة، مثل /orders/syria):</label>
            <input className={INP} value={(edit.routes || []).join(', ')}
              onChange={e => setEdit({ ...edit, routes: e.target.value.split(',') })} />
            <label className="text-xs text-muted">الصلاحية (من يرى هذا الدليل):</label>
            <select className={INP} value={edit.permission} onChange={e => setEdit({ ...edit, permission: e.target.value })}>
              <option value="">— للجميع —</option>
              {Object.values(PERMISSIONS).map(p => <option key={p} value={p}>{PERMISSION_DESCRIPTIONS[p] || p}</option>)}
            </select>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-muted">الترتيب:</label>
                <input type="number" className={INP} value={edit.sort_order}
                  onChange={e => setEdit({ ...edit, sort_order: e.target.value })} />
              </div>
              <label className="flex items-center gap-1.5 text-sm text-text mt-5">
                <input type="checkbox" checked={edit.is_published}
                  onChange={e => setEdit({ ...edit, is_published: e.target.checked })} /> منشور
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={save} disabled={busy}
                className="flex-1 bg-teal-600 text-white rounded-xl py-2 text-sm font-bold disabled:opacity-50">
                {busy ? '⏳ جارٍ الحفظ…' : 'حفظ'}</button>
              <button onClick={() => setEdit(null)} className="flex-1 bg-surface-alt rounded-xl py-2 text-sm">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
