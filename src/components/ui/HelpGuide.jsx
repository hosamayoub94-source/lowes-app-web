// =============================================================
// HelpGuide — دليل الاستخدام السياقي (زر ❓ بالهيدر).
// يقرأ من المصدر الموحّد (app_guides) عبر guidesService، يعرض دليل
// الشاشة الحالية أولاً، مفلتراً بصلاحيات المستخدم.
// =============================================================
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { usePermissions } from '@hooks/usePermissions';
import { ROLE_TEMPLATES } from '@data/permissions';
import { fetchGuides, guidesForUser, guidesForRoute } from '@services/guidesService';

function GuideCard({ g, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-start hover:bg-surface-alt transition">
        <span className="text-xl shrink-0">{g.icon}</span>
        <span className="flex-1 text-sm font-bold text-text">{g.title}</span>
        <span className="text-muted text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-2 border-t border-border/50">
          {g.why && (
            <p className="text-sm text-muted leading-relaxed"><span className="font-bold text-amber-fg">💡 لماذا: </span>{g.why}</p>
          )}
          {Array.isArray(g.steps) && g.steps.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-navy mb-0.5">🛠️ الخطوات</p>
              <ol className="list-decimal pe-5 space-y-1 text-sm text-text leading-relaxed">
                {g.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          )}
          {(g.tips || []).map((t, i) => (
            <p key={i} className={`text-sm ${t.type === 'warning' ? 'text-red-fg' : 'text-amber-fg'}`}>
              {t.type === 'warning' ? '⚠️' : '💡'} {t.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HelpGuide({ open, onClose }) {
  const { permissions, role } = usePermissions();
  const { pathname } = useLocation();
  const [all, setAll] = useState([]);

  useEffect(() => { if (open) fetchGuides().then(setAll); }, [open]);

  const permSet = useMemo(
    () => (permissions instanceof Set ? permissions : new Set(permissions || [])),
    [permissions],
  );

  const visible = useMemo(
    () => guidesForRoute(guidesForUser(all, permSet), pathname),
    [all, permSet, pathname],
  );

  if (!open) return null;
  const tpl = ROLE_TEMPLATES[role];
  const onRoute = g => (g.routes || []).some(r => pathname === r || pathname.startsWith(r + '/') || pathname.startsWith(r));
  const firstOnRouteKey = visible.find(onRoute)?.key;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:max-w-lg bg-surface sm:rounded-2xl shadow-xl border border-border max-h-[92vh] flex flex-col" dir="rtl">
        <div className="px-5 py-4 border-b border-border shrink-0 bg-navy text-white sm:rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black">❓ دليل الاستخدام</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-lg leading-none">×</button>
          </div>
          {tpl && (
            <p className="text-[12px] text-white/85 mt-1.5 leading-relaxed">
              <span className="font-bold">{tpl.icon} {tpl.label}:</span> {tpl.responsibility}
            </p>
          )}
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2.5">
          <p className="text-[11px] text-muted">يظهر هنا ما يخصّ دورك فقط — اضغط أي بند للتفاصيل. للدليل الكامل افتح «📖 دليل التطبيق».</p>
          {visible.length === 0
            ? <p className="text-sm text-muted text-center py-8">لا يوجد دليل متاح لدورك حالياً.</p>
            : visible.map(g => <GuideCard key={g.key} g={g} defaultOpen={g.key === firstOnRouteKey} />)}
        </div>
      </div>
    </div>
  );
}
