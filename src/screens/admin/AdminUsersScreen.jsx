import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { EmptyState } from '@components/ui/EmptyState';
import { Button } from '@components/ui/Button';

export default function AdminUsersScreen() {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle>المستخدمون</CardTitle>
          <CardSubtitle>إضافة وتعديل وإلغاء تفعيل حسابات الموظفين.</CardSubtitle>
        </div>
        <Button variant="teal" size="md">+ مستخدم</Button>
      </div>
      <div className="mt-4"><EmptyState description="ستظهر قائمة المستخدمين هنا" /></div>
    </Card>
  );
}
