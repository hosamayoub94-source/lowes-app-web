// =============================================================
// ManagementScreen — الهيكل الإداري (Management org chart).
// يعرض المناصب بمسميات إنجليزية + الشاغل أو «Vacant».
// =============================================================
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@services/supabase';
import { Avatar } from '@components/ui/Avatar';
import { ORG_POSITIONS } from '@data/orgChart';

export default function ManagementScreen() {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, employee_name, role_type, avatar_url, manager_scope, is_active')
        .eq('is_active', true);
      setPeople(data || []);
      setLoading(false);
    })();
  }, []);

  // منصب → الأشخاص الذين يحملون دوره.
  const holdersByRole = useMemo(() => {
    const m = {};
    for (const p of people) (m[p.role_type] ||= []).push(p);
    return m;
  }, [people]);

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      <div>
        <h1 className="font-black text-lg">Management</h1>
        <p className="text-muted text-sm">الهيكل الإداري للشركة</p>
      </div>

      {loading ? (
        <p className="text-muted text-sm">جارٍ التحميل…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ORG_POSITIONS.map((pos) => {
            const holders = holdersByRole[pos.role] || [];
            return (
              <div key={pos.key} className="rounded-2xl bg-surface border border-border p-4">
                <p className="font-black text-sm" dir="ltr" style={{ textAlign: 'right' }}>{pos.title_en}</p>
                <p className="text-muted text-xs mb-3">{pos.title_ar}</p>
                {holders.length === 0 ? (
                  <span className="inline-block text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                    Vacant
                  </span>
                ) : (
                  <div className="space-y-2">
                    {holders.map((h) => (
                      <div key={h.id} className="flex items-center gap-2.5">
                        <Avatar name={h.employee_name} src={h.avatar_url} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate">{h.employee_name}</p>
                          {h.manager_scope && <p className="text-muted text-[11px] truncate">{h.manager_scope}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
