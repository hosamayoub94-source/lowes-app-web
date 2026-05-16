// =============================================================
// TeamScreen — directory of employees grouped by team.
// =============================================================
import { Hero } from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { EmptyState } from '@components/ui/EmptyState';
import { TEAMS } from '@data/teams';

export default function TeamScreen() {
  return (
    <div className="space-y-5">
      <Hero
        eyebrow="الفريق"
        title="فريق العمل"
        subtitle="تعرّف على زملائك في الفريق وأدوارهم."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {Object.values(TEAMS).map((team) => (
          <Card key={team.key}>
            <CardTitle>{team.name}</CardTitle>
            <CardSubtitle>الأعضاء النشطون</CardSubtitle>
            <div className="mt-4"><EmptyState description="ستظهر بطاقات الأعضاء هنا" /></div>
          </Card>
        ))}
      </div>
    </div>
  );
}
