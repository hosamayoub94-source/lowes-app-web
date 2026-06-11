// =============================================================
// GuideScreen — «📖 دليل التطبيق»: مرجع مقسّم لأقسام، مفلتر بصلاحية
// المستخدم، مع بحث. يقرأ من المصدر الموحّد (app_guides) عبر guidesService.
// =============================================================
import { useEffect, useMemo, useState } from 'react';
import { usePermissions } from '@hooks/usePermissions';
import { fetchGuides, guidesForUser, groupGuidesBySection } from '@services/guidesService';

function GuideCard({ g }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-3">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-start">
        <span className="flex items-center gap-2 font-bold text-text text-sm">
          <span className="text-lg">{g.icon}</span>{g.title}
        </span>
        <span className="text-muted text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-sm">
          {g.why && <p className="text-muted leading-relaxed">💡 {g.why}</p>}
          {Array.isArray(g.steps) && g.steps.length > 0 && (
            <ol className="list-decimal pe-5 space-y-1 text-text leading-relaxed">
              {g.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          )}
          {(g.tips || []).map((t, i) => (
            <p key={i} className={t.type === 'warning' ? 'text-red-fg' : 'text-amber-fg'}>
              {t.type === 'warning' ? '⚠️' : '💡'} {t.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GuideScreen() {
  const { permissions } = usePermissions();
  const [guides, setGuides] = useState([]);
  const [q, setQ] = useState('');

  useEffect(() => { fetchGuides().then(setGuides); }, []);

  const permSet = useMemo(
    () => (permissions instanceof Set ? permissions : new Set(permissions || [])),
    [permissions],
  );

  const sections = useMemo(() => {
    const mine = guidesForUser(guides, permSet);
    const term = q.trim();
    const filtered = term
      ? mine.filter(g =>
          (g.title + ' ' + (g.why || '') + ' ' + (Array.isArray(g.steps) ? g.steps.join(' ') : '')).includes(term))
      : mine;
    return groupGuidesBySection(filtered);
  }, [guides, permSet, q]);

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <span className="text-2xl">📖</span>
        <h1 className="text-lg font-extrabold text-text">دليل التطبيق</h1>
      </div>
      <p className="text-xs text-muted">مرجع لاستخدام التطبيق — يظهر ما يخصّ صلاحياتك فقط. اضغط أي بند للخطوات.</p>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث في الأدلة…"
        className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text" />
      {sections.length === 0 && (
        <div className="text-muted text-sm py-10 text-center">لا توجد أدلة مطابقة ضمن صلاحياتك.</div>
      )}
      {sections.map(sec => (
        <div key={sec.key} className="bg-surface border border-border/60 rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 bg-surface-alt font-bold text-sm text-text">{sec.label}</div>
          <div className="divide-y divide-border/40">
            {sec.items.map(g => <GuideCard key={g.key} g={g} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
