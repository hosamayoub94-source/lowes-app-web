// =============================================================
// LoginScreen — group select → name select → 4-digit PIN.
// الفئات مجمّعة (≤6) بمسميات إنجليزية؛ كل فئة تضم عدة أدوار.
// =============================================================
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardSubtitle } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Avatar } from '@components/ui/Avatar';
import { Spinner } from '@components/ui/Loading';
import { useAuth } from '@hooks/useAuth';
import { useToast } from '@hooks/useToast';
import { signInWithPin, listActiveProfiles } from '@services/authService';
import { useAuthStore } from '@stores/authStore';
import { LOGIN_GROUPS, ROLE_LABELS } from '@data/teams';
import { ROUTES } from '@routes/paths';

const STEPS = { GROUP: 'group', NAME: 'name', PIN: 'pin' };

export default function LoginScreen() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(STEPS.GROUP);
  const [group, setGroup] = useState(null);
  const [name, setName] = useState(null);
  const [pin, setPin] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate(ROUTES.HOME, { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (!group) return;
    setLoadingProfiles(true);
    listActiveProfiles({ roleTypes: group.roles })
      .then((data) => setProfiles(data || []))
      .catch((err) => toast.error(err?.message || 'تعذر تحميل القائمة'))
      .finally(() => setLoadingProfiles(false));
  }, [group, toast]);

  const onPickGroup = (g) => {
    setGroup(g);
    setName(null);
    setPin('');
    setStep(STEPS.NAME);
  };

  const onPickName = (n) => {
    setName(n);
    setPin('');
    setStep(STEPS.PIN);
  };

  const onSubmitPin = async (digits) => {
    setVerifying(true);
    try {
      const { profile, session } = await signInWithPin(name, digits);
      if (session?.manual) useAuthStore.getState().setSupaSession(session, profile);
      toast.success(`أهلاً ${profile.employee_name} 👋`);
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
    if (step === STEPS.PIN) {
      setStep(STEPS.NAME);
    } else if (step === STEPS.NAME) {
      setGroup(null);
      setName(null);
      setProfiles([]);
      setStep(STEPS.GROUP);
    }
  };

  return (
    <Card padding="lg" className="w-full max-w-md">
      <CardHeader>
        <div>
          <CardTitle>تسجيل الدخول</CardTitle>
          <CardSubtitle>
            {step === STEPS.GROUP && 'اختر فئتك للمتابعة'}
            {step === STEPS.NAME && 'اختر اسمك من القائمة'}
            {step === STEPS.PIN && 'أدخل الرمز السري المكوّن من 4 أرقام'}
          </CardSubtitle>
        </div>
        {step !== STEPS.GROUP && (
          <Button size="sm" variant="ghost" onClick={back}>رجوع</Button>
        )}
      </CardHeader>

      {step === STEPS.GROUP && (
        <div className="grid grid-cols-2 gap-2.5">
          {LOGIN_GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => onPickGroup(g)}
              className="h-24 rounded-2xl border border-border bg-surface-alt hover:border-teal/40 text-text transition-colors flex flex-col items-center justify-center gap-1.5"
            >
              <span className="text-2xl">{g.icon}</span>
              <span className="font-black text-sm">{g.label}</span>
            </button>
          ))}
        </div>
      )}

      {step === STEPS.NAME && (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {loadingProfiles ? (
            <div className="py-10 grid place-items-center"><Spinner /></div>
          ) : profiles.length === 0 ? (
            <div className="py-10 text-center text-muted text-sm">لا يوجد مستخدمون لهذه الفئة.</div>
          ) : (
            profiles.map((p) => (
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
        <PinPad value={pin} onChange={setPin} onComplete={onSubmitPin} disabled={verifying} name={name} />
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
          <span key={i}
            className={`w-3.5 h-3.5 rounded-full transition-colors ${value.length > i ? 'bg-teal' : 'bg-border'}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button key={d} type="button" disabled={disabled} onClick={() => press(d)}
            className="h-14 rounded-xl bg-surface-alt hover:bg-surface border border-border text-lg font-extrabold disabled:opacity-50">
            {d}
          </button>
        ))}
        <button type="button" onClick={backspace} disabled={disabled}
          className="h-14 rounded-xl bg-surface-alt hover:bg-surface border border-border text-sm font-bold disabled:opacity-50">
          مسح
        </button>
        <button type="button" disabled={disabled} onClick={() => press(0)}
          className="h-14 rounded-xl bg-surface-alt hover:bg-surface border border-border text-lg font-extrabold disabled:opacity-50">
          0
        </button>
        <div />
      </div>
    </div>
  );
}
