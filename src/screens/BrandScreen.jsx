// =============================================================
// BrandScreen — كيت هوية LOWE'S للفريق (شعار/ألوان/خطوط/نبرة/شركة).
// مرجع بصري سريع يقرأ من المصدر الموحّد src/data/brand.js.
// =============================================================
import { useState } from 'react';
import { BRAND, COMPANY, BRAND_COLORS, BRAND_FONTS, BRAND_ASSETS, SUB_BRANDS, ENDORSEMENT } from '@data/brand';

const SWATCHES = [
  { key: 'gold',      label: 'Primary Gold ★', note: 'accent فقط' },
  { key: 'goldLight', label: 'Light Gold',     note: 'تدرّجات/حدود' },
  { key: 'black',     label: 'Black',          note: 'النصوص' },
  { key: 'white',     label: 'White',          note: 'الخلفية المسيطرة' },
  { key: 'cream',     label: 'Cream',          note: 'خلفيات دافئة' },
  { key: 'warmGray',  label: 'Warm Gray',      note: 'نص ثانوي' },
  { key: 'rose',      label: 'Rose 🎀',        note: 'أكتوبر الوردي (موسمي)' },
  { key: 'sage',      label: 'Sage 🌿',        note: 'البيئة (موسمي)' },
];

const DOS = ['أبيض مسيطر (تنفّس)', 'الذهبي accent فقط — لا يكون الغالب', 'مساحة تنفّس حول الشعار', 'رسالة واحدة لكل تصميم'];
const DONTS = ['تمطيط/تشويه الشعار', 'تغيير ألوان الهوية', 'إضافة ظلال/تأثيرات للشعار', 'نص ذهبي طويل على أبيض'];

function Section({ title, children }) {
  return (
    <div className="bg-surface border border-border/60 rounded-2xl p-4">
      <h2 className="text-sm font-extrabold text-text mb-3">{title}</h2>
      {children}
    </div>
  );
}

export default function BrandScreen() {
  const [copied, setCopied] = useState('');
  const copy = (hex) => { try { navigator.clipboard.writeText(hex); setCopied(hex); setTimeout(() => setCopied(''), 1200); } catch { /* noop */ } };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-4 bg-surface border border-border/60 rounded-2xl p-4">
        <img src={BRAND_ASSETS.logoUrl} alt="LOWE'S" className="w-24 h-24 object-contain" />
        <div>
          <h1 className="text-xl font-black text-text">LOWE'S <span style={{ color: BRAND_COLORS.gold }}>{BRAND.heart}</span> Professional</h1>
          <p className="text-sm italic" style={{ color: BRAND_COLORS.gold }}>{BRAND.sloganAr}</p>
          <p className="text-xs text-muted mt-1">{BRAND.sloganEn} · تأسّست {BRAND.founded}</p>
        </div>
      </div>

      {/* Colors */}
      <Section title="🎨 الألوان الرسمية (انقر للنسخ)">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SWATCHES.map(s => {
            const hex = BRAND_COLORS[s.key];
            const light = ['white', 'cream', 'goldLight'].includes(s.key);
            return (
              <button key={s.key} onClick={() => copy(hex)} className="text-start rounded-xl overflow-hidden border border-border/60 hover:opacity-90 transition">
                <div style={{ background: hex, height: 56, borderBottom: '1px solid rgba(0,0,0,.06)' }} />
                <div className="p-2">
                  <div className="text-[11px] font-bold text-text">{s.label}</div>
                  <div className="text-[10px] text-muted font-mono">{copied === hex ? 'نُسخ ✓' : hex}</div>
                  <div className="text-[9px] text-muted">{s.note}</div>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted mt-2">القاعدة: أبيض مسيطر · أسود للنص · الذهبي accent فقط.</p>
      </Section>

      {/* Fonts */}
      <Section title="🔤 الخطوط">
        <div className="space-y-2 text-text">
          <div style={{ fontFamily: BRAND_FONTS.display }} className="text-2xl">LOWE'S Professional</div>
          <div className="text-[11px] text-muted">Playfair Display — العناوين واسم البراند (لاتيني)</div>
          <div style={{ fontFamily: BRAND_FONTS.bodyAr }} className="text-lg pt-1">عنايةٌ تثقين بها، جمالٌ تستحقّينه</div>
          <div className="text-[11px] text-muted">Tajawal — النص العربي · El Messiri — العناوين العربية</div>
        </div>
      </Section>

      {/* Logo rules */}
      <Section title="🪪 الشعار — القواعد">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="font-bold text-green-fg mb-1">✅ افعل</div>
            <ul className="space-y-1 text-text list-disc pe-4">{DOS.map((d, i) => <li key={i}>{d}</li>)}</ul>
          </div>
          <div>
            <div className="font-bold text-red-fg mb-1">❌ لا تفعل</div>
            <ul className="space-y-1 text-text list-disc pe-4">{DONTS.map((d, i) => <li key={i}>{d}</li>)}</ul>
          </div>
        </div>
      </Section>

      {/* Voice */}
      <Section title="🗣️ نبرة الكلام (4 أعمدة)">
        <ul className="text-xs text-text space-y-1 list-disc pe-4">
          <li><b>علمي وواضح</b> — سمّ المكوّن واشرح آليته.</li>
          <li><b>عملي ومباشر</b> — اذكر النتيجة وتوقيتها.</li>
          <li><b>محترم وواثق</b> — لا مبالغة ولا تواضع زائف.</li>
          <li><b>بشري ودافئ</b> — افهم المشكلة قبل بيع الحل.</li>
        </ul>
        <p className="text-[11px] text-red-fg mt-2">ممنوع: «الأفضل بالعالم» · «سحري/معجزة» · «حصري جداً» · «ضمان 100%» · تخويف المنافس.</p>
      </Section>

      {/* Company */}
      <Section title="🏢 معلومات الشركة (للفاتورة/الرسمي)">
        <div className="text-xs text-text space-y-1">
          <div className="font-bold">{COMPANY.legalName}</div>
          <div className="text-muted">{COMPANY.address} — {COMPANY.city}, {COMPANY.country}</div>
          <div>سجل تجاري: <span className="font-mono">{COMPANY.tradeRegistryNo}</span></div>
          <div>📧 {COMPANY.email} · 🌐 {COMPANY.website} · 📱 {COMPANY.whatsapp}</div>
          <div>📷 {COMPANY.instagram}</div>
        </div>
      </Section>

      {/* Sub-brands */}
      <Section title="🏷️ البراندات الفرعية">
        <div className="flex flex-wrap gap-2">
          {SUB_BRANDS.map(b => (
            <span key={b.name} className="text-xs px-2.5 py-1 rounded-lg bg-surface-alt border border-border/60 text-text">
              {b.name}{b.status ? ` · ${b.status}` : ''}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-2">كلها تحمل توقيع: «{ENDORSEMENT}»</p>
      </Section>
    </div>
  );
}
