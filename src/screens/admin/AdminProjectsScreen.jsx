// =============================================================
// AdminProjectsScreen — manage projects + their members.
// Members of a project see that project's tab on the Tasks page
// and the full work plan inside it. Admin-only.
// =============================================================
import { useEffect, useState, useCallback } from 'react';
import { Button } from '@components/ui/Button';
import { Spinner } from '@components/ui/Loading';
import { listActiveProfiles } from '@services/authService';
import {
  listProjects, createProject, deleteProject, listProjectMemberIds,
  addProjectMember, removeProjectMember,
} from '@modules/tasks/services/projectService';

const INPUT = 'w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40';

export default function AdminProjectsScreen() {
  const [projects, setProjects]   = useState([]);
  const [profiles, setProfiles]   = useState([]);
  const [selected, setSelected]   = useState(null); // project object
  const [memberIds, setMemberIds] = useState(new Set());
  const [loading, setLoading]     = useState(true);
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState(null);

  // New-project form
  const [npName, setNpName] = useState('');
  const [npIcon, setNpIcon] = useState('📁');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, profs] = await Promise.all([
        listProjects(),
        listActiveProfiles().catch(() => []),
      ]);
      setProjects(pr);
      setProfiles(profs);
      if (pr.length && !selected) setSelected(pr[0]);
    } catch (e) {
      setErr(e?.message || 'تعذّر تحميل المشاريع');
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load members when the selected project changes
  useEffect(() => {
    if (!selected?.id) { setMemberIds(new Set()); return; }
    listProjectMemberIds(selected.id)
      .then((ids) => setMemberIds(new Set(ids)))
      .catch(() => setMemberIds(new Set()));
  }, [selected?.id]);

  const toggleMember = async (profileId) => {
    if (!selected?.id || busy) return;
    setBusy(true);
    const isMember = memberIds.has(profileId);
    // optimistic
    setMemberIds((prev) => {
      const next = new Set(prev);
      isMember ? next.delete(profileId) : next.add(profileId);
      return next;
    });
    try {
      if (isMember) await removeProjectMember(selected.id, profileId);
      else          await addProjectMember(selected.id, profileId);
    } catch (e) {
      // rollback
      setMemberIds((prev) => {
        const next = new Set(prev);
        isMember ? next.add(profileId) : next.delete(profileId);
        return next;
      });
      setErr(e?.message || 'فشل تحديث العضوية');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (proj, e) => {
    e.stopPropagation();
    if (busy) return;
    if (!window.confirm(`حذف مشروع «${proj.name}»؟\nالمهام لن تُحذف — فقط سيزول ربطها بالمشروع.`)) return;
    setBusy(true);
    try {
      await deleteProject(proj.id);
      setProjects((prev) => prev.filter((p) => p.id !== proj.id));
      if (selected?.id === proj.id) setSelected(null);
    } catch (e2) {
      setErr(e2?.message || 'فشل حذف المشروع');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const name = npName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const key = name.replace(/\s+/g, '_').toLowerCase().slice(0, 40) + '_' + Date.now().toString(36);
      const p = await createProject({ key, name, icon: npIcon || '📁' });
      setProjects((prev) => [...prev, p]);
      setSelected(p);
      setNpName(''); setNpIcon('📁');
    } catch (e2) {
      setErr(e2?.message || 'فشل إنشاء المشروع');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="py-20 flex justify-center"><Spinner size="lg" /></div>;
  }

  return (
    <div className="space-y-5 pb-24 sm:pb-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-text">المشاريع والفرق</h1>
        <p className="text-sm text-muted mt-0.5">أنشئ مشاريع وحدّد أعضاءها — العضو يرى تبويب مشروعه وخطة عمله كاملة.</p>
      </div>

      {err && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-red-bg border border-red/30 text-red-fg text-sm">
          <span className="flex-1">{err}</span>
          <button type="button" onClick={() => setErr(null)} className="underline text-xs">إغلاق</button>
        </div>
      )}

      {/* New project */}
      <form onSubmit={handleCreate} className="rounded-2xl border border-border bg-surface p-4 space-y-3">
        <p className="text-sm font-bold text-text">+ مشروع جديد</p>
        <div className="flex gap-2">
          <input value={npIcon} onChange={(e) => setNpIcon(e.target.value)} className={`${INPUT} w-16 text-center`} maxLength={2} aria-label="أيقونة" />
          <input value={npName} onChange={(e) => setNpName(e.target.value)} placeholder="اسم المشروع (مثل: معرض دمشق)" className={INPUT} />
          <Button type="submit" variant="teal" size="sm" disabled={busy || !npName.trim()}>إنشاء</Button>
        </div>
      </form>

      <div className="grid sm:grid-cols-[220px_1fr] gap-4">
        {/* Project list */}
        <div className="space-y-1.5">
          {projects.map((p) => (
            <div
              key={p.id}
              className={`group flex items-center gap-1 rounded-xl border transition ${
                selected?.id === p.id
                  ? 'bg-teal text-navy border-teal'
                  : 'bg-surface text-text border-border hover:border-teal/40'
              }`}
            >
              <button
                type="button"
                onClick={() => setSelected(p)}
                className="flex-1 text-start px-3 py-2.5 text-sm font-semibold"
              >
                <span className="me-1.5">{p.icon || '📁'}</span>{p.name}
              </button>
              <button
                type="button"
                onClick={(e) => handleDelete(p, e)}
                disabled={busy}
                title="حذف المشروع"
                className={`shrink-0 px-2.5 py-2.5 rounded-l-xl transition ${
                  selected?.id === p.id ? 'text-navy/60 hover:text-red-700' : 'text-muted hover:text-red-500'
                }`}
              >
                🗑
              </button>
            </div>
          ))}
          {projects.length === 0 && <p className="text-xs text-muted px-2">لا مشاريع بعد.</p>}
        </div>

        {/* Members of selected project */}
        <div className="rounded-2xl border border-border bg-surface p-4">
          {!selected ? (
            <p className="text-sm text-muted">اختر مشروعاً لإدارة أعضائه.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-text">
                  أعضاء «{selected.name}»
                </h2>
                <span className="text-xs text-muted bg-surface-alt px-2 py-0.5 rounded-full font-semibold">
                  {memberIds.size} عضو
                </span>
              </div>
              <div className="space-y-1 max-h-[55vh] overflow-y-auto">
                {profiles.map((prof) => {
                  const on = memberIds.has(prof.id);
                  return (
                    <label
                      key={prof.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer border transition ${
                        on ? 'bg-teal/5 border-teal/30' : 'bg-surface-alt/40 border-transparent hover:border-border'
                      }`}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggleMember(prof.id)} disabled={busy} className="w-4 h-4 accent-teal" />
                      <span className="flex-1 text-sm text-text">{prof.employee_name}</span>
                      {prof.team && <span className="text-[10px] text-muted bg-surface px-2 py-0.5 rounded-full">{prof.team}</span>}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
