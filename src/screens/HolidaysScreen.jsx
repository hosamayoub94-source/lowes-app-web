// =============================================================
// HolidaysScreen — leave requests and balances.
// =============================================================
import { Hero } from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { StatCard } from '@components/ui/StatCard';
import { Button } from '@components/ui/Button';
import { EmptyState } from '@components/ui/EmptyState';

export default function HolidaysScreen() {
  return (
    <div className="space-y-5">
      <Hero
        eyebrow="الإجازات"
        title="إجازاتي"
        subtitle="تابع رصيدك وقدّم طلباتك بسهولة."
        actions={<Button variant="teal" size="lg">+ طلب إجازة</Button>}
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="رصيد متبقٍ" value="—" tone="green" />
        <StatCard label="مستخدم" value="—" tone="amber" />
        <StatCard label="بانتظار اعتماد" value="—" tone="blue" />
        <StatCard label="مرفوضة" value="—" tone="red" />
      </div>
      <Card>
        <CardTitle>طلباتي السابقة</CardTitle>
        <CardSubtitle>كافة طلبات الإجازة المُقدَّمة</CardSubtitle>
        <div className="mt-4"><EmptyState description="لا توجد طلبات إجازة بعد" /></div>
      </Card>
    </div>
  );
}
