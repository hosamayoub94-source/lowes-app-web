// =============================================================
// ProfileScreen — current user profile + theme/lang preferences.
// =============================================================
import { Hero } from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { Avatar } from '@components/ui/Avatar';
import { Button } from '@components/ui/Button';
import { useAuth } from '@hooks/useAuth';
import { useTheme } from '@hooks/useTheme';
import { useUiStore } from '@stores/uiStore';
import { ROLE_LABELS } from '@data/teams';

export default function ProfileScreen() {
  const { name, role, team, avatar_url, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const lang = useUiStore((s) => s.lang);
  const toggleLang = useUiStore((s) => s.toggleLang);

  return (
    <div className="space-y-5">
      <Hero eyebrow="الملف الشخصي" title="حسابي" subtitle="إدارة بياناتك وتفضيلاتك." />
      <Card>
        <div className="flex items-center gap-4">
          <Avatar name={name || ''} src={avatar_url} size="2xl" />
          <div className="min-w-0">
            <div className="text-xl font-extrabold truncate">{name || '—'}</div>
            <div className="text-sm text-muted truncate">{ROLE_LABELS[role] || ''}</div>
            {team && <div className="text-xs text-muted mt-1">الفريق: {team}</div>}
          </div>
        </div>
      </Card>
      <Card>
        <CardTitle>التفضيلات</CardTitle>
        <CardSubtitle>تخصيص واجهة الاستخدام</CardSubtitle>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" onClick={toggleTheme}>
            الثيم: {theme === 'dark' ? 'ليلي' : 'نهاري'} — تبديل
          </Button>
          <Button variant="secondary" size="lg" onClick={toggleLang}>
            اللغة: {lang === 'ar' ? 'العربية' : 'English'} — تبديل
          </Button>
        </div>
      </Card>
      <Card>
        <CardTitle>الجلسة</CardTitle>
        <CardSubtitle>إدارة الجلسة الحالية</CardSubtitle>
        <div className="mt-4">
          <Button variant="danger" onClick={logout}>تسجيل الخروج</Button>
        </div>
      </Card>
    </div>
  );
}
