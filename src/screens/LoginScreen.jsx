// =============================================================
// LoginScreen — channel select → login code + 4-digit PIN.
// لا تعرض أي أسماء (أمان): الدخول بكود شخصي + PIN فقط.
// =============================================================
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardSubtitle } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { useAuth } from '@hooks/useAuth';
import { useToast } from '@hooks/useToast';
import { signInWithCode } from '@services/authService';
import { useAuthStore } from '@stores/authStore';
import { CHANNELS, CHANNEL_LABELS } from '@data/teams';
import { ROUTES } from '@routes/paths';

const STEPS = { CHANNEL: 'channel', ENTRY: 'entry' };

const CHANNEL_TILES = [
  { key: CHANNELS.TEAM,  icon: '🏢', label: CHANNEL_LABELS[CHANNELS.TEAM],  hint: 'الإدارة والموظفون' },
  { key: CHANNELS.SALES, icon: '⭐', label: CHANNEL_LABELS[CHANNELS.SALES], hint: 'المسوّقون والموزّعون والوكلاء' },
];

export default function LoginScreen() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(STEPS.CHANNEL);
  const [channel, setChannel] = useState(null);
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate(ROUTES.HOME, { replace: true });
  }, [isAuthenticated, navigate]);

  const pickChannel = (c) => { setChannel(c); setCode(''); setPin(''); setStep(STEPS.ENTRY); };

  const back = () => { setPin(''); setCode(''); setChannel(null); setStep(STEPS.CHANNEL); };

  const onSubmit = async (digits) => {
    if (!code.trim()) { toast.error('أدخل كود الدخول أولاً'); setPin(''); return; }
    setVerifying(true);
    try {
      const { profile, session } = await signInWithCode(code, digits, channel);
      if (session?.manual) useAuthStore.getState().setSupaSession(session, profile);
      toast.success(`أهلاً ${profile.employee_name} 👋`);
      navigate(ROUTES.HOME, { replace: true });
    } catch (err) {
      toast.error(err?.message || 'كود أو PIN غير صحيح');
      setPin('');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Card padding="lg" className="w-full max-w-md">
      <CardHeader>
        <div>
          <CardTitle>تسجيل الدخول</CardTitle>
          <CardSubtitle>
            {step === STEPS.CHANNEL ? 'اختر قناة الدخول' : 'أدخل كودك والرمز السري'}
          </CardSubtitle>
        </div>
        {step !== STEPS.CHANNEL && (
          <Button size="sm" variant="ghost" onClick={back}>رجوع</Button>
        )}
      </CardHeader>

      {step === STEPS.CHANNEL && (
        <div className="grid grid-cols-1 gap-3">
          {CHANNEL_TILES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => pickChannel(t.key)}
              className="flex items-center gap-4 p-4 rounded-2xl border border-border bg-surface-alt hover:border-teal/40 text-text transition-colors text-start"
            >
              <span className="text-3xl">{t.icon}</span>
              <span className="flex-1">
                <span className="block font-black">{t.label}</span>
                <span className="block text-xs text-muted mt-0.5">{t.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {step === STEPS.ENTRY && (
        <div className="space-y-4">
          <div className="text-center text-sm font-bold text-muted">
            {CHANNEL_LABELS[channel]}
          </div>
          <input
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="كود الدخول (مثال: LW-1001)"
            className="w-full text-center tracking-widest font-black bg-surface-alt border border-border rounded-xl px-3 py-3"
          />
          <PinPad value={pin} onChange={setPin} onComplete={onSubmit} disabled={verifying} />
        </div>
      )}
    </Card>
  );
}

function PinPad({ value, onChange, onComplete, disabled }) {
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
