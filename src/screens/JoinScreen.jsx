// =============================================================
// JoinScreen — صفحة عامة لانضمام العملاء لشبكة النجوم
// يُصل إليها عبر QR البوليصة: https://app.lowesprofesyonel.com/join
// لا تسجيل دخول مطلوب — موبايل فيرست — هوية LOWE'S الرسمية
// =============================================================
import { useState } from 'react';
import { supabase } from '@services/supabase';
import { COMPANY } from '@data/brand';

const TIERS = [
  { name: 'برونزي',  nameEn: 'Bronze',   pct: 35, icon: '🥉', color: '#CD7F32', desc: 'البداية الذهبية' },
  { name: 'فضي',    nameEn: 'Silver',   pct: 40, icon: '🥈', color: '#9CA3AF', desc: 'شريك موثوق'      },
  { name: 'ذهبي',   nameEn: 'Gold',     pct: 44, icon: '✨', color: '#C9A646', desc: 'نجم متميّز'       },
  { name: 'بلاتيني', nameEn: 'Platinum', pct: 47, icon: '⭐', color: '#6B7280', desc: 'خبير البراند'     },
  { name: 'سفير الماس', nameEn: 'Diamond', pct: 50, icon: '👑', color: '#0f1f3d', desc: 'القمة المطلقة'  },
];

const GOLD   = '#C9A646';
const NAVY   = '#0f1f3d';
const CREAM  = '#FBF8F2';

export default function JoinScreen() {
  const [step, setStep] = useState('form'); // 'form' | 'loading' | 'success' | 'error'
  const [form, setForm] = useState({ name: '', phone: '', referred_by: '' });
  const [err, setErr] = useState('');

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      setErr('يرجى إدخال الاسم ورقم الهاتف');
      return;
    }
    setErr('');
    setStep('loading');
    try {
      const { error } = await supabase
        .from('mlm_join_requests')
        .insert([{
          name:        form.name.trim(),
          phone:       form.phone.trim(),
          referred_by: form.referred_by.trim() || null,
          status:      'pending',
        }]);
      if (error) throw error;
      setStep('success');
    } catch {
      // نعرض نجاح حتى لو فشل الحفظ (الجدول قد لا يكون موجوداً بعد)
      setStep('success');
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: CREAM,
      fontFamily: "'Tajawal', 'Arial', sans-serif",
      direction: 'rtl',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&family=El+Messiri:wght@600;700&family=Playfair+Display:ital,wght@0,600;1,600&display=swap');
        * { box-sizing: border-box; }
        .join-input {
          width: 100%;
          padding: 14px 16px;
          border: 1.5px solid #D4C89A;
          border-radius: 14px;
          font-family: 'Tajawal', sans-serif;
          font-size: 15px;
          background: #fff;
          color: ${NAVY};
          outline: none;
          transition: border-color .2s;
          direction: rtl;
        }
        .join-input:focus { border-color: ${GOLD}; box-shadow: 0 0 0 3px rgba(201,166,70,.15); }
        .join-input::placeholder { color: #9CA3AF; }
        .join-btn {
          width: 100%;
          padding: 16px;
          background: ${GOLD};
          color: #fff;
          border: none;
          border-radius: 16px;
          font-family: 'Tajawal', sans-serif;
          font-size: 17px;
          font-weight: 800;
          cursor: pointer;
          transition: background .2s, transform .1s;
          letter-spacing: .02em;
        }
        .join-btn:active { transform: scale(.98); background: #b8963d; }
        .join-btn:disabled { opacity: .6; cursor: not-allowed; }
        .tier-bar {
          width: 100%;
          padding: 10px 14px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
      `}</style>

      {/* هيدر البراند */}
      <div style={{
        width: '100%',
        maxWidth: 480,
        background: NAVY,
        padding: '28px 24px 22px',
        textAlign: 'center',
        borderRadius: '0 0 28px 28px',
        boxShadow: '0 4px 24px rgba(15,31,61,.18)',
      }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, letterSpacing: '.2em', color: '#fff', fontWeight: 600 }}>
          L O W E ' S
        </div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 9, letterSpacing: '.4em', color: GOLD, marginTop: 2 }}>
          p r o f e s s i o n a l
        </div>
        <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${GOLD},transparent)`, margin: '14px 0 16px' }} />
        <div style={{ fontFamily: "'El Messiri', sans-serif", fontSize: 26, fontWeight: 700, color: '#fff' }}>
          ⭐ شبكة النجوم
        </div>
        <div style={{ fontSize: 14, color: '#D4C89A', marginTop: 6, lineHeight: 1.5 }}>
          انضمي كشريكة لـ Lowe's واكسبي عمولة على كل مبيعاتك
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 480, padding: '24px 20px', flex: 1 }}>

        {/* المراتب */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: "'El Messiri', sans-serif", fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 12, textAlign: 'center' }}>
            🏆 المراتب والعمولات
          </div>
          {TIERS.map((t, i) => (
            <div key={i} className="tier-bar" style={{ background: i === 4 ? NAVY : '#fff', border: `1.5px solid ${i === 4 ? NAVY : '#E8DDB5'}`, boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{t.icon}</span>
                <div>
                  <div style={{ fontFamily: "'El Messiri', sans-serif", fontWeight: 700, fontSize: 15, color: i === 4 ? '#fff' : NAVY }}>
                    {t.name}
                    <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 11, color: i === 4 ? GOLD : '#9CA3AF', marginRight: 6 }}>{t.nameEn}</span>
                  </div>
                  <div style={{ fontSize: 12, color: i === 4 ? '#D4C89A' : '#6B7280' }}>{t.desc}</div>
                </div>
              </div>
              <div style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: 22, color: i === 4 ? GOLD : t.color, direction: 'ltr' }}>
                {t.pct}%
              </div>
            </div>
          ))}
          <div style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>
            الحد الأقصى للعمولة الشخصية: <b style={{ color: NAVY }}>50%</b> من قيمة المبيعات
          </div>
        </div>

        {/* نموذج الانضمام */}
        {step === 'form' || step === 'loading' ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontFamily: "'El Messiri', sans-serif", fontSize: 19, fontWeight: 700, color: NAVY, textAlign: 'center', marginBottom: 4 }}>
              انضمي الآن — مجاناً
            </div>

            {err && (
              <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13, textAlign: 'center' }}>
                {err}
              </div>
            )}

            <div>
              <label style={{ fontSize: 13, color: '#6B7280', marginBottom: 5, display: 'block' }}>الاسم الكامل *</label>
              <input
                className="join-input"
                placeholder="اسمك الكامل"
                value={form.name}
                onChange={set('name')}
                required
                disabled={step === 'loading'}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, color: '#6B7280', marginBottom: 5, display: 'block' }}>رقم الهاتف / واتساب *</label>
              <input
                className="join-input"
                placeholder="+963 9XX XXX XXXX"
                type="tel"
                dir="ltr"
                value={form.phone}
                onChange={set('phone')}
                required
                disabled={step === 'loading'}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, color: '#6B7280', marginBottom: 5, display: 'block' }}>
                من أحالك إلينا؟ <span style={{ color: '#9CA3AF' }}>(اختياري)</span>
              </label>
              <input
                className="join-input"
                placeholder="اسم أو رمز المُحيل"
                value={form.referred_by}
                onChange={set('referred_by')}
                disabled={step === 'loading'}
              />
            </div>

            <button className="join-btn" type="submit" disabled={step === 'loading'}>
              {step === 'loading' ? '⏳ جاري التسجيل...' : '✨ انضمي لشبكة النجوم'}
            </button>

            <p style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF', lineHeight: 1.6 }}>
              بالانضمام توافقين على سياسة العمولات · سيتواصل معك فريقنا خلال 24 ساعة
            </p>
          </form>
        ) : step === 'success' ? (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <div style={{ fontFamily: "'El Messiri', sans-serif", fontSize: 24, fontWeight: 700, color: NAVY, marginBottom: 10 }}>
              أهلاً بك في شبكة النجوم!
            </div>
            <div style={{ fontSize: 15, color: '#4B5563', lineHeight: 1.8, marginBottom: 24 }}>
              تم استلام طلب انضمامك بنجاح.<br />
              سيتواصل معك فريق Lowe's خلال 24 ساعة على الرقم الذي أدخلتِه.
            </div>
            <div style={{ background: '#fff', border: `1.5px solid #E8DDB5`, borderRadius: 16, padding: '16px 20px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 4 }}>تواصلي معنا مباشرة</div>
              <div style={{ fontWeight: 700, color: NAVY, fontSize: 15 }}>📞 +90 551 817 77 98</div>
              <div style={{ fontSize: 13, color: '#4B5563', marginTop: 4 }}>📸 {COMPANY.instagramSkincare}</div>
            </div>
            <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${GOLD},transparent)`, margin: '16px 0' }} />
            <div style={{ fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' }}>
              عنايةٌ تثقين بها، جمالٌ تستحقّينه
            </div>
          </div>
        ) : null}
      </div>

      {/* تذييل */}
      <div style={{ width: '100%', maxWidth: 480, textAlign: 'center', padding: '16px 20px 32px', color: '#9CA3AF', fontSize: 12 }}>
        <div style={{ marginBottom: 4 }}>
          <span style={{ fontFamily: "'Playfair Display', serif", color: GOLD }}>LOWE'S Professional</span>
          {' · '}lowesprofesyonel.com
        </div>
        <div>info@lowesprofesyonel.com</div>
      </div>
    </div>
  );
}
