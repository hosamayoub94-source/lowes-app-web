// =============================================================
// LoginScreen — role select → name select → 4-digit PIN.
// Reproduces the v4 flow but as three small steps in one page.
// =============================================================
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardSubtitle } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Avatar } from '@components/ui/Avatar';
import { Spinner } from '@components/ui/Loading';
import { useAuth } from '@hooks/useAuth';
import { useToast } from '@hooks/useToast';
import { signInWithPin, listActiveProfiles } from '@services/authService';
import { ROLES, ROLE_LABELS } from '@data/teams';
import { ROUTES } from '@routes/paths';

const STEPS = { ROLE: 'role', NAME: 'name', PIN: 'pin' };

// هذه الأدوار لا تحتاج اختيار اسم — تنتقل مباشرة لإدخال PIN
const DIRECT_ROLES = new Set([
  ROLES.MANAGER, ROLES.ADMIN, ROLES.MEDIA_BUYER,
  ROLES.SALES_MANAGER, ROLES.SOCIAL_MANAGER,
]);

export default function LoginScreen() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(STEPS.ROLE);
  const [role, setRole] = useState(null);
  const [name, setName] = useState(null);
  const [pin, setPin] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate(ROUTES.HOME, { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (!role) return;
    setLoadingProfiles(true);
    listActiveProfiles({ roleType: role })
      .then((data) => setProfiles(data || []))
      .catch((err) => toast.error(err?.message || 'تعذر تحميل قائمة المستخدمين'))
      .finally(() => setLoadingProfiles(false));
  }, [role, toast]);

  const filteredProfiles = useMemo(() => profiles, [profiles]);

  const onPickRole = (r) => {
    setRole(r);
    setPin('');
    if (DIRECT_ROLES.has(r)) {
      // دور إداري — استخدم المسمى الوظيفي مباشرة وانتقل للـ PIN
      setName(ROLE_LABELS[r]);
      setStep(STEPS.PIN);
    } else {
      setName(null);
      setStep(STEPS.NAME);
    }
  };

  const onPickName = (n) => {
    setName(n);
    setPin('');
    setStep(STEPS.PIN);
  };

  const onSubmitPin = async (digits) => {
    setVerifying(true);
    try {
      // signInWithPin handles Supabase Auth — AuthBoot's
      // onAuthStateChange listener will populate the auth store
      // automatically. We just navigate after success.
      const { profile } = await signInWithPin(name, digits);
      toast.success(`أهلاً ${profile.employee_name}`);
      navigate(ROUTES.HOME, { replace: true });
    } catch (err) {
      toast.error(err?.message || 'PIN غير صحيح');
      setPin('');
    } finally {
      setVerifying(false);
    }
  };

  const back = () => {
    setPin('');
    if (step === STEPS.PIN) setStep(STEPS.NAME);
    else if (step === STEPS.NAME) setStep(STEPS.ROLE);
  };

  return (
    <Card padding="lg" className="w-full max-w-md">
      <CardHeader>
        <div>
          <CardTitle>تسجيل الدخول</CardTitle>
          <CardSubtitle>
            {step === STEPS.ROLE && 'اختر دورك للمتابعة'}
            {step === STEPS.NAME && 'اختر اسمك من القائمة'}
            {step === STEPS.PIN && 'أدخل الرمز السري المكوّن من 4 أرقام'}
          </CardSubtitle>
        </div>
        {step !== STEPS.ROLE && (
          <Button size="sm" variant="ghost" onClick={back}>
            رجوع
          </Button>
        )}
      </CardHeader>

      {step === STEPS.ROLE && (
        <div className="grid grid-cols-2 gap-2.5">
          {Object.values(ROLES).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onPickRole(r)}
              className="h-20 rounded-2xl border border-border bg-surface-alt hover:border-teal/40 text-text font-bold transition-colors text-sm"
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
      )}

      {step === STEPS.NAME && (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {loadingProfiles ? (
            <div className="py-10 grid place-items-center"><Spinner /></div>
          ) : filteredProfiles.length === 0 ? (
            <div className="py-10 text-center text-muted text-sm">لا يوجد مستخدمون لهذا الدور.</div>
          ) : (
            filteredProfiles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPickName(p.employee_name)}
                className="w-full text-start flex items-center gap-3 p-3 rounded-xl border border-border bg-surface hover:border-teal/40 transition-colors"
              >
                <Avatar name={p.employee_name} src={p.avatar_url} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold truncate">{p.employee_name}</div>
                  <div className="text-xs text-muted truncate">{p.position || ROLE_LABELS[p.role_type]}</div>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {step === STEPS.PIN && (
        <PinPad
          value={pin}
          onChange={setPin}
          onComplete={onSubmitPin}
          disabled={verifying}
          name={name}
        />
      )}
    </Card>
  );
}

function PinPad({ value, onChange, onComplete, disabled, name }) {
  const press = (digit) => {
    if (disabled) return;
    if (value.length >= 4) return;
    const next = value + String(digit);
    onChange(next);
    if (next.length === 4) onComplete(next);
  };
  const backspace = () => onChange(value.slice(0, -1));

  return (
    <div>
      <div className="text-center text-sm text-muted mb-2">{name}</div>
      <div className="flex items-center justify-center gap-2 mb-5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-3.5 h-3.5 rounded-full transition-colors ${value.length > i ? 'bg-teal' : 'bg-border'}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button
            key={d}
            type="button"
            disabled={disabled}
            onClick={() => press(d)}
            className="h-14 rounded-xl bg-surface-alt hover:bg-surface border border-border text-lg font-extrabold disabled:opacity-50"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={backspace}
          disabled={disabled}
          className="h-14 rounded-xl bg-surface-alt hover:bg-surface border border-border text-sm font-bold disabled:opacity-50"
        >
          مسح
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => press(0)}
          className="h-14 rounded-xl bg-surface-alt hover:bg-surface border border-border text-lg font-extrabold disabled:opacity-50"
        >
          0
        </button>
        <div />
      </div>
    </div>
  );
}
