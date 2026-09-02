// =============================================================
// MyPartnerGroupCard — بطاقة «شركاء دوامي» بالصفحة الرئيسية
//
// تعرض مجموعة الموظف الحالي فقط، مبنيّة تلقائياً من ملفات الموظفين
// (profiles.shift_partner + profiles.page_name القائم مسبقاً).
//
// لا تظهر إطلاقاً إن لم يكن للموظف مجموعة — لا بطاقة فارغة بالرئيسية.
// عرض فقط، لا تكتب شيئاً.
// =============================================================
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDerivedPartnerGroups } from '@services/shiftPartnersService';

export default function MyPartnerGroupCard({ name }) {
  const [group, setGroup] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!name) return undefined;
    (async () => {
      const { groups } = await fetchDerivedPartnerGroups();
      if (!alive) return;
      setGroup(groups.find(g => g.members.some(m => m.employee_name === name)) ?? null);
    })();
    return () => { alive = false; };
  }, [name]);

  if (!group) return null;

  const partners = group.members.filter(m => m.employee_name !== name);

  return (
    <Link to="/partner-groups" className="block">
      <div className="bg-surface border border-border rounded-2xl p-4 hover:border-teal/40 transition-all active:scale-[0.99]">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-bold text-muted uppercase tracking-wider">👥 شركاء دوامي</p>
          <span className="text-muted text-lg shrink-0">←</span>
        </div>

        <p className="text-sm font-black text-text">{group.name}</p>
        <p className="text-[11px] text-muted mt-0.5 truncate" dir="ltr" style={{ textAlign: 'right' }}>
          {group.page}
        </p>

        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {partners.map(m => (
            <span key={m.id}
              className="px-2.5 py-1 rounded-full bg-teal/10 text-teal border border-teal/25 text-xs font-semibold">
              {m.employee_name}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
