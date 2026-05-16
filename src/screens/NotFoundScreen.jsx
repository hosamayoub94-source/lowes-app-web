import { Link } from 'react-router-dom';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { ROUTES } from '@routes/paths';

export default function NotFoundScreen() {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <Card padding="lg" className="max-w-md text-center">
        <div className="text-7xl mb-4">🧭</div>
        <CardTitle>الصفحة غير موجودة</CardTitle>
        <CardSubtitle>الرابط الذي حاولت الوصول إليه غير صالح.</CardSubtitle>
        <div className="mt-5">
          <Button as={Link} to={ROUTES.HOME}>العودة للرئيسية</Button>
        </div>
      </Card>
    </div>
  );
}
