// =============================================================
// Analytics — BreakdownTable
// One row per employee (attendance + tasks). Worst first: it is a to-do list
// for the manager, not a leaderboard. Scrolls horizontally on a phone.
// =============================================================
import { memo, useMemo, useState } from 'react';
import { useBreakdown, useIsAnalyticsLoading, useKpiMeta } from '../hooks/useAnalytics';
import { KPI } from '../types/analytics.types';
import StateBox from './StateBox';

const COLS = [
  { key: 'name',        label: 'الموظف',        num: false },
  { key: 'team',        label: 'الفريق',        num: false },
  { key: 'presentDays', label: 'أيام الحضور',   num: true },
  { key: 'lateDays',    label: 'أيام التأخير',  num: true },
  { key: 'hours',       label: 'ساعات العمل',   num: true },
  { key: 'completed',   label: 'مهام منجزة',    num: true },
  { key: 'overdue',     label: 'مهام متأخرة',   num: true },
];

function BreakdownTable({ title = 'أداء كل موظف', onlyOverdue = false, style = {} }) {
  const rows = useBreakdown();
  const loading = useIsAnalyticsLoading();
  const attMeta = useKpiMeta(KPI.ATTENDANCE_RATE);
  const taskMeta = useKpiMeta(KPI.OVERDUE_TASKS);
  const [sort, setSort] = useState(null); // { key, dir }

  const data = useMemo(() => {
    const base = onlyOverdue ? rows.filter((r) => r.overdue > 0) : rows;
    if (!sort) return base;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => (typeof a[sort.key] === 'string' ? a[sort.key].localeCompare(b[sort.key], 'ar') : a[sort.key] - b[sort.key]) * dir);
  }, [rows, sort, onlyOverdue]);

  const partial = attMeta?.status === 'error' || taskMeta?.status === 'error';

  let body;
  if (loading && rows.length === 0) body = <StateBox kind="loading" compact />;
  else if (partial && rows.length === 0) body = <StateBox kind="error" compact reason={attMeta?.reason || taskMeta?.reason} />;
  else if (data.length === 0) {
    body = <StateBox kind="empty" compact title={onlyOverdue ? 'لا مهام متأخرة ضمن الفلاتر الحالية' : 'لا توجد بيانات'} reason={onlyOverdue ? null : 'لا موظفين ضمن الفريق/الفلاتر المختارة أو لا سجلات في الفترة.'} />;
  } else {
    const cols = onlyOverdue ? COLS.filter((c) => ['name', 'team', 'overdue'].includes(c.key)) : COLS;
    body = (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: onlyOverdue ? 0 : 560 }}>
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              {cols.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className="text-muted" style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid rgb(var(--color-border) / 0.2)', whiteSpace: 'nowrap', fontWeight: 600 }}>
                    <button type="button" onClick={() => setSort((p) => ({ key: c.key, dir: p?.key === c.key && p.dir === 'desc' ? 'asc' : 'desc' }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit', padding: 0, minHeight: 32 }}>
                      {c.label}{active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                {cols.map((c) => {
                  const bad = (c.key === 'overdue' && r.overdue > 0) || (c.key === 'lateDays' && r.lateDays > 0);
                  return (
                    <td key={c.key} className="text-text" style={{ padding: '6px 8px', borderBottom: '1px solid rgb(var(--color-border) / 0.1)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: bad ? '#d97706' : undefined, fontWeight: bad ? 700 : 400 }}>
                      {r[c.key] === '' ? '—' : r[c.key]}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section className="bg-surface border border-border" aria-label={title} style={{ borderRadius: 12, padding: '16px 20px', minWidth: 0, ...style }}>
      <h3 className="text-muted" style={{ fontSize: 13, fontWeight: 600, margin: '0 0 10px' }}>{title}</h3>
      {body}
      <div className="text-muted" style={{ fontSize: 11, marginTop: 8 }}>
        المصدر: جدول الحضور + جدول المهام. الترتيب الافتراضي: الأكثر تأخراً أولاً.
      </div>
    </section>
  );
}

export default memo(BreakdownTable);
