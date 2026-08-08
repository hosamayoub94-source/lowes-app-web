// =============================================================
// LineSwitcher — تبديل خط واتساب (رئيسي/حملات) للأدمن/المدير،
// شارة قراءة فقط للموظف العادي. يلف مكوّن Tabs الجاهز. عرض بحت.
// =============================================================
import { Tabs, Badge } from '@components/ui';

export function LineSwitcher({ isManager, lines, line, onChange }) {
  if (!isManager) {
    const l = lines[line];
    return <Badge tone="teal">{l.label} · {l.number}</Badge>;
  }
  const tabs = Object.entries(lines).map(([key, l]) => ({ key, label: `${l.label} · ${l.number}` }));
  return <Tabs tabs={tabs} value={line} onChange={onChange} size="sm" />;
}

export default LineSwitcher;
