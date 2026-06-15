// =============================================================
// AdminScreen — admin landing with sub-screen navigation.
// =============================================================
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Hero } from '@components/ui/Hero';
import { Card, CardTitle, CardSubtitle } from '@components/ui/Card';
import { ROUTES } from '@routes/paths';
import { cn } from '@utils/classNames';

const SUB_TABS = [
  { id: 'users',    label: 'المستخدمون', path: ROUTES.ADMIN_USERS    },
  { id: 'resigned', label: '👋 المستقيلون', path: ROUTES.ADMIN_RESIGNED },
  { id: 'settings', label: 'الإعدادات',  path: ROUTES.ADMIN_SETTINGS },
  { id: 'reports',  label: 'التقارير',   path: ROUTES.ADMIN_REPORTS  },
  { id: 'audit',    label: '📋 سجل النشاط', path: ROUTES.ADMIN_AUDIT },
  { id: 'qa',          label: '🔬 QA Dashboard',    path: ROUTES.ADMIN_QA          },
  { id: 'maintenance', label: '🛠️ Maintenance',    path: ROUTES.ADMIN_MAINTENANCE },
  { id: 'operations',  label: '📊 Operations',      path: ROUTES.ADMIN_OPERATIONS  },
  { id: 'quiz',        label: '🧠 اختبارات التدريب', path: ROUTES.ADMIN_QUIZ        },
  { id: 'products',    label: '🏷️ كتالوج المنتجات',  path: ROUTES.ADMIN_PRODUCTS    },
  { id: 'lozy',        label: '🌸 معرفة لوزي',        path: ROUTES.ADMIN_LOZY        },
  { id: 'face-enroll', label: '🔐 تسجيل الوجوه',      path: ROUTES.ADMIN_FACE_ENROLL },
];

export default function AdminScreen() {
  const { pathname } = useLocation();
  const isRoot = pathname === ROUTES.ADMIN;

  return (
    <div className="space-y-5">
      <Hero
        eyebrow="لوحة الإدارة"
        title="إدارة النظام"
        subtitle="إدارة المستخدمين والإعدادات والتقارير."
      />
      <div className="flex flex-wrap gap-2">
        {SUB_TABS.map((tab) => {
          const active = pathname === tab.path;
          return (
            <Link
              key={tab.id}
              to={tab.path}
              className={cn(
                'px-4 h-10 inline-flex items-center rounded-xl text-sm font-semibold border transition-colors',
                active
                  ? 'bg-navy text-white border-transparent'
                  : 'bg-surface text-text border-border hover:border-teal/40',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      {isRoot ? (
        <Card>
          <CardTitle>أهلاً بك في لوحة الإدارة</CardTitle>
          <CardSubtitle>اختر تبويبًا للبدء.</CardSubtitle>
        </Card>
      ) : (
        <Outlet />
      )}
    </div>
  );
}
