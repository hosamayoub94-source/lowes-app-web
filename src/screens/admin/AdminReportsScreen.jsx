import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { EmptyState } from '@components/ui/EmptyState';

export default function AdminReportsScreen() {
  return (
    <Card>
      <CardTitle>التقارير</CardTitle>
      <CardSubtitle>تقارير الحضور، الإيرادات، الأداء، والتوظيف.</CardSubtitle>
      <div className="mt-4"><EmptyState description="ستظهر التقارير هنا" /></div>
    </Card>
  );
}
