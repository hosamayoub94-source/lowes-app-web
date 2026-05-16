// =============================================================
// EmptyState — Consistent empty state component
//
// Covers: no data, no results, no permissions, first-time states.
// Usage: <EmptyState type="tasks" action={{ label: 'أضف مهمة', onClick: ... }} />
// =============================================================
import { memo } from 'react';

const PRESETS = {
  tasks: {
    icon:    '✅',
    title:   'لا توجد مهام',
    message: 'لم يتم تعيين أي مهام لك حتى الآن',
  },
  notifications: {
    icon:    '🔔',
    title:   'لا توجد إشعارات',
    message: 'أنت على اطلاع كامل!',
  },
  search: {
    icon:    '🔍',
    title:   'لا توجد نتائج',
    message: 'جرّب كلمة بحث مختلفة أو تحقق من التهجئة',
  },
  attendance: {
    icon:    '📅',
    title:   'لا يوجد سجل حضور',
    message: 'لم يتم تسجيل أي حضور بعد',
  },
  employees: {
    icon:    '👥',
    title:   'لا يوجد موظفون',
    message: 'لم يتم إضافة أي موظفين للفريق',
  },
  crm: {
    icon:    '📊',
    title:   'لا يوجد عملاء',
    message: 'أضف عميلك الأول للبدء',
  },
  error: {
    icon:    '⚠️',
    title:   'حدث خطأ',
    message: 'تعذّر تحميل البيانات. حاول مرة أخرى.',
  },
  offline: {
    icon:    '📡',
    title:   'غير متصل بالإنترنت',
    message: 'ستعود البيانات عند استعادة الاتصال',
  },
  permission: {
    icon:    '🔒',
    title:   'لا توجد صلاحية',
    message: 'ليس لديك إذن بالوصول لهذه الصفحة',
  },
  generic: {
    icon:    '📭',
    title:   'لا توجد بيانات',
    message: 'لم يتم العثور على أي عناصر',
  },
};

export const EmptyState = memo(function EmptyState({
  type    = 'generic',
  icon,
  title,
  message,
  action,
  compact = false,
  className = '',
}) {
  const preset = PRESETS[type] ?? PRESETS.generic;
  const _icon    = icon    ?? preset.icon;
  const _title   = title   ?? preset.title;
  const _message = message ?? preset.message;

  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-4 ${
        compact ? 'py-6' : 'py-12'
      } ${className}`}
      dir="rtl"
    >
      <div className={`${compact ? 'text-4xl mb-2' : 'text-6xl mb-4'}`}>{_icon}</div>
      <h3 className={`font-semibold text-gray-900 dark:text-white ${compact ? 'text-sm' : 'text-base'} mb-1`}>
        {_title}
      </h3>
      <p className={`text-gray-400 dark:text-gray-500 ${compact ? 'text-xs' : 'text-sm'} max-w-xs leading-relaxed`}>
        {_message}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-all duration-150 active:scale-95"
        >
          {action.label}
        </button>
      )}
    </div>
  );
});

export default EmptyState;
