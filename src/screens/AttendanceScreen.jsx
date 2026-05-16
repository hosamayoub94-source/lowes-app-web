// =============================================================
// AttendanceScreen — daily check-in/out + monthly summary.
// Wires through attendanceService once feature work begins.
// =============================================================
import { Hero } from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { StatCard } from '@components/ui/StatCard';
import { Button } from '@components/ui/Button';
import { EmptyState } from '@components/ui/EmptyState';

export default function AttendanceScreen() {
  return (
    <div className="space-y-5">
      <Hero
        eyebrow="الحضور والانصراف"
        title="سجل يومك"
        subtitle="تحقّق من حالتك اليومية وسجّل الحضور أو الانصراف."
        actions={
          <>
            <Button variant="success" size="lg">حضور</Button>
            <Button variant="danger" size="lg">انصراف</Button>
          </>
        }
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="أيام الحضور" value="—" tone="green" />
        <StatCard label="أيام الإجازة" value="—" tone="blue" />
        <StatCard label="أيام الغياب" value="—" tone="red" />
        <StatCard label="ساعات العمل" value="—" tone="amber" />
      </div>
      <Card>
        <CardTitle>سجل اليوم</CardTitle>
        <CardSubtitle>آخر العمليات المُسجّلة</CardSubtitle>
        <div className="mt-4">
          <EmptyState description="لم يتم تسجيل أي حركات بعد" />
        </div>
      </Card>
    </div>
  );
}
