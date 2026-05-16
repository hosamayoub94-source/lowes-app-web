// =============================================================
// HomeScreen — landing dashboard once authenticated.
// Shows role-specific KPI tiles + quick links.
// Real data wiring belongs in feature files; this renders shape only.
// =============================================================
import { Hero } from '@components/ui/Hero';
import { StatCard } from '@components/ui/StatCard';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { useAuth } from '@hooks/useAuth';
import { navItemsForRole } from '@data/navigation';
import { Link } from 'react-router-dom';

export default function HomeScreen() {
  const { name, role } = useAuth();
  const items = navItemsForRole(role);

  return (
    <div className="space-y-5">
      <Hero
        eyebrow="لوحة التحكم"
        title={`أهلاً ${name || ''} 👋`}
        subtitle="تابع حضورك ومهامك وأرقام يومك من مكان واحد."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="الحضور اليوم" value="—" hint="آخر تحديث الآن" tone="teal" />
        <StatCard label="مهام مفتوحة" value="—" tone="blue" />
        <StatCard label="نقاط الشهر" value="—" tone="amber" />
        <StatCard label="رصيد الإجازات" value="—" tone="purple" />
      </div>

      <Card>
        <CardTitle>اختصارات سريعة</CardTitle>
        <CardSubtitle>الوصول السريع للأقسام التي تستخدمها بشكل متكرر</CardSubtitle>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {items.map((item) => (
            <Button
              key={item.id}
              as={Link}
              to={item.path}
              variant="secondary"
              size="lg"
              leftIcon={<span aria-hidden>{item.icon}</span>}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
