import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { EmptyState } from '@components/ui/EmptyState';

export default function AdminSettingsScreen() {
  return (
    <Card>
      <CardTitle>إعدادات النظام</CardTitle>
      <CardSubtitle>التحكم في إعدادات المؤسسة والصلاحيات.</CardSubtitle>
      <div className="mt-4"><EmptyState description="ستظهر الإعدادات هنا" /></div>
    </Card>
  );
}
