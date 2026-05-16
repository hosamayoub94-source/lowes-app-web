// =============================================================
// OnboardingFlow — Full guided onboarding overlay
//
// Shows on first login (or after scheduleReonboarding()).
// Steps are role-aware. Persists progress so refresh doesn't reset.
// Renders as a full-screen modal above everything.
// =============================================================
import { useEffect, useCallback, memo } from 'react';
import { useOnboardingStore, ONBOARDING_STEPS, ROLE_STEPS } from './useOnboardingStore';
import { useAuth } from '@hooks/useAuth';
import { ROLE_LABELS } from '@data/teams';

// ── Step content map ───────────────────────────────────────────
const ROLE_GUIDES = {
  admin: {
    title: 'أنت مسؤول النظام',
    icon:  '🛡️',
    points: [
      'يمكنك الوصول لمركز العمليات الإدارية من القائمة الجانبية',
      'راقب صحة النظام والموظفين المتصلين في الوقت الفعلي',
      'اعتمد الطلبات المعلقة وراجع تقارير الأنشطة اليومية',
      'استخدم Ctrl+Shift+I لفتح المفتش التقني في وضع التطوير',
    ],
  },
  manager: {
    title: 'أنت مدير فريق',
    icon:  '👔',
    points: [
      'تابع مهام فريقك من لوحة المهام اليومية',
      'راجع تقارير الحضور والغياب بشكل فوري',
      'استخدم نظام CRM لمتابعة العملاء والصفقات',
      'ستصلك إشعارات فورية لأي حدث يتعلق بفريقك',
    ],
  },
  sales_manager: {
    title: 'أنت مدير مبيعات',
    icon:  '📈',
    points: [
      'ركّز على لوحة CRM لمتابعة خط الصفقات',
      'تابع أداء فريق المبيعات يومياً',
      'استخدم التقارير اليومية لمعرفة معدل إتمام الصفقات',
      'فعّل إشعارات المتابعة المتأخرة لتجنب فقدان الفرص',
    ],
  },
  default: {
    title: 'مرحباً بك في المنظومة',
    icon:  '⚡',
    points: [
      'سجّل حضورك وانصرافك يومياً من الشاشة الرئيسية',
      'تابع مهامك المعيّنة وحدّث حالتها باستمرار',
      'ستصلك إشعارات فورية لأي تحديث مهم',
      'استخدم شريط البحث السريع للتنقل بين الأقسام',
    ],
  },
};

const WORKSPACE_HIGHLIGHTS = [
  { icon: '🏠', label: 'الرئيسية',     desc: 'لوحتك اليومية — حضور، مهام، إشعارات' },
  { icon: '✅', label: 'المهام',        desc: 'كل مهامك في مكان واحد مع الأولويات' },
  { icon: '👥', label: 'الحضور',       desc: 'تسجيل الحضور والانصراف وتاريخ الإجازات' },
  { icon: '🔔', label: 'الإشعارات',   desc: 'كل التنبيهات والرسائل من فريقك' },
  { icon: '💬', label: 'التعاون',      desc: 'تعليقات، @mentions، وتواصل الفريق' },
];

const SHORTCUT_HINTS = [
  { keys: ['Ctrl', 'K'],        desc: 'فتح البحث السريع' },
  { keys: ['G', 'ثم', 'H'],     desc: 'الانتقال للرئيسية' },
  { keys: ['G', 'ثم', 'T'],     desc: 'الانتقال للمهام' },
  { keys: ['G', 'ثم', 'A'],     desc: 'الانتقال للحضور' },
  { keys: ['?'],                 desc: 'عرض كل الاختصارات' },
];

// ── Sub-components ─────────────────────────────────────────────
const ProgressDots = memo(({ steps, current }) => (
  <div className="flex items-center gap-2 justify-center">
    {steps.map((s, i) => (
      <div
        key={s}
        className={`rounded-full transition-all duration-300 ${
          s === current
            ? 'w-6 h-2 bg-blue-500'
            : steps.indexOf(s) < steps.indexOf(current)
            ? 'w-2 h-2 bg-blue-300'
            : 'w-2 h-2 bg-gray-200 dark:bg-gray-600'
        }`}
      />
    ))}
  </div>
));

const StepBtn = memo(({ onClick, children, variant = 'primary' }) => (
  <button
    onClick={onClick}
    className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95 ${
      variant === 'primary'
        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25'
        : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
    }`}
  >
    {children}
  </button>
));

// ── Step screens ───────────────────────────────────────────────
function WelcomeStep({ name, role }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'صباح الخير' : hour < 17 ? 'مساء الخير' : 'أهلاً';

  return (
    <div className="text-center space-y-6 py-4">
      <div className="text-7xl animate-bounce">👋</div>
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {greeting}، {name || 'زميلنا'}!
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-base">
          مرحباً بك في منظومة لوز — سنأخذك في جولة سريعة لتبدأ بشكل صحيح.
        </p>
      </div>
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 text-right">
        <p className="text-blue-800 dark:text-blue-300 text-sm">
          🎯 الجولة تستغرق أقل من دقيقتين وستوفر عليك الكثير من الوقت لاحقاً.
        </p>
      </div>
    </div>
  );
}

function RoleGuideStep({ role }) {
  const guide = ROLE_GUIDES[role] ?? ROLE_GUIDES.default;
  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="text-5xl mb-3">{guide.icon}</div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{guide.title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {ROLE_LABELS[role] ?? 'موظف'} — هذا ما يهمك معرفته:
        </p>
      </div>
      <ul className="space-y-3">
        {guide.points.map((p, i) => (
          <li key={i} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
            <span className="text-blue-500 font-bold mt-0.5">✓</span>
            <span className="text-sm text-gray-700 dark:text-gray-300">{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WalkthroughStep() {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">مناطق النظام</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">تعرّف على أقسام التطبيق الرئيسية</p>
      </div>
      <div className="space-y-2.5">
        {WORKSPACE_HIGHLIGHTS.map(({ icon, label, desc }) => (
          <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-700 flex items-center justify-center text-xl shadow-sm flex-shrink-0">
              {icon}
            </div>
            <div>
              <div className="font-semibold text-sm text-gray-900 dark:text-white">{label}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShortcutsStep() {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-4xl mb-2">⌨️</div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">اختصارات سريعة</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">وفّر وقتك بهذه الاختصارات اليومية</p>
      </div>
      <div className="space-y-2">
        {SHORTCUT_HINTS.map(({ keys, desc }, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
            <span className="text-sm text-gray-700 dark:text-gray-300">{desc}</span>
            <div className="flex items-center gap-1">
              {keys.map((k, j) => (
                k === 'ثم'
                  ? <span key={j} className="text-xs text-gray-400 mx-0.5">ثم</span>
                  : <kbd key={j} className="px-2 py-0.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono shadow-sm">{k}</kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center">
        <p className="text-sm text-green-700 dark:text-green-400">
          💡 اضغط <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded text-xs border border-green-200">?</kbd> في أي وقت لعرض كل الاختصارات
        </p>
      </div>
    </div>
  );
}

// ── Main flow ──────────────────────────────────────────────────
export function OnboardingFlow() {
  const { id: userId, name, role, isAuthenticated } = useAuth();
  const {
    completed, skipped, currentStep,
    checkShouldOnboard, startOnboarding,
    nextStep, prevStep, skipOnboarding,
  } = useOnboardingStore();

  const shouldShow = isAuthenticated && checkShouldOnboard(userId);

  useEffect(() => {
    if (isAuthenticated && userId && checkShouldOnboard(userId)) {
      startOnboarding(userId);
    }
  }, [isAuthenticated, userId]);

  const handleNext = useCallback(() => nextStep(role), [nextStep, role]);
  const handlePrev = useCallback(() => prevStep(role), [prevStep, role]);
  const handleSkip = useCallback(() => skipOnboarding(), [skipOnboarding]);

  if (!shouldShow || completed || skipped) return null;

  const steps    = ROLE_STEPS[role] ?? ROLE_STEPS.default;
  const stepIdx  = steps.indexOf(currentStep);
  const isLast   = stepIdx === steps.length - 1;
  const isFirst  = stepIdx === 0;

  const StepContent = {
    [ONBOARDING_STEPS.WELCOME]:     <WelcomeStep name={name} role={role} />,
    [ONBOARDING_STEPS.ROLE_GUIDE]:  <RoleGuideStep role={role} />,
    [ONBOARDING_STEPS.WALKTHROUGH]: <WalkthroughStep />,
    [ONBOARDING_STEPS.SHORTCUTS]:   <ShortcutsStep />,
  }[currentStep] ?? null;

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
      dir="rtl"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header bar */}
        <div className="h-1.5 bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
            style={{ width: `${((stepIdx + 1) / steps.length) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-6">
          {StepContent}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between gap-3">
          <button
            onClick={handleSkip}
            className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            تخطي
          </button>

          <ProgressDots steps={steps} current={currentStep} />

          <div className="flex gap-2">
            {!isFirst && (
              <StepBtn onClick={handlePrev} variant="secondary">السابق</StepBtn>
            )}
            <StepBtn onClick={handleNext} variant="primary">
              {isLast ? '🎉 ابدأ الآن' : 'التالي'}
            </StepBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OnboardingFlow;
