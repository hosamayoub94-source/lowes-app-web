// =============================================================
// AccountingScreen — multi-currency ledger summary + entries.
// =============================================================
import { Hero } from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { StatCard } from '@components/ui/StatCard';
import { Button } from '@components/ui/Button';
import { EmptyState } from '@components/ui/EmptyState';

export default function AccountingScreen() {
  return (
    <div className="space-y-5">
      <Hero
        eyebrow="المحاسبة"
        title="الحسابات والصندوق"
        subtitle="عرض الإيرادات والمصاريف وتصفية حسب العملة والشهر."
        actions={<Button variant="teal" size="lg">+ قيد جديد</Button>}
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="إيرادات USD" value="—" tone="green" />
        <StatCard label="مصاريف USD" value="—" tone="red" />
        <StatCard label="إيرادات SYP" value="—" tone="green" />
        <StatCard label="مصاريف SYP" value="—" tone="red" />
      </div>
      <Card>
        <CardTitle>أحدث القيود</CardTitle>
        <CardSubtitle>آخر العمليات المُسجَّلة على الصندوق</CardSubtitle>
        <div className="mt-4"><EmptyState description="لا توجد قيود في هذا الشهر" /></div>
      </Card>
    </div>
  );
}
