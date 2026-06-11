// =============================================================
// SocialStudioScreen — مساعد محتوى السوشال ميديا (#4)
// أوضاع: كابشن · أفكار ريلز · رد على عميل · تقويم أسبوعي
// يستدعي Edge Function social-content (Claude API)
// =============================================================
import { useState, useEffect } from 'react';
import { supabase } from '@services/supabase';
import { useToast } from '@hooks/useToast';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;

const MODES = [
  { key: 'caption',  label: 'كابشن منشور',   icon: '✍️', desc: 'كابشن جاهز لإنستغرام/فيسبوك', needsProduct: true,  placeholder: '' },
  { key: 'reels',    label: 'أفكار ريلز',     icon: '🎬', desc: 'أفكار فيديو قصير + سكربت',    needsProduct: true,  placeholder: '' },
  { key: 'reply',    label: 'رد على عميل',    icon: '💬', desc: 'رد احترافي على تعليق/رسالة',  needsProduct: false, placeholder: 'الصق تعليق أو رسالة العميل هنا…' },
  { key: 'calendar', label: 'تقويم أسبوعي',   icon: '📅', desc: 'خطة محتوى 7 أيام',           needsProduct: false, placeholder: 'أي تركيز معيّن؟ (اختياري)' },
];

export default function SocialStudioScreen() {
  const toast = useToast();
  const [mode, setMode]         = useState('caption');
  const [products, setProducts] = useState([]);
  const [product, setProduct]   = useState('');
  const [extra, setExtra]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState('');
  const [history, setHistory]   = useState([]);

  const activeMode = MODES.find(m => m.key === mode);

  // Load product names for the dropdown
  useEffect(() => {
    supabase.from('products')
      .select('name, name_en')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setProducts(data ?? []))
      .catch(() => {});
  }, []);

  const generate = async () => {
    setLoading(true); setResult('');
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/social-content`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, product, extra }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data.content);
      setHistory(h => [{ mode, product, content: data.content, at: Date.now() }, ...h].slice(0, 10));
    } catch (e) {
      toast.error('تعذّر توليد المحتوى — تأكد من نشر Edge Function');
      setResult('');
    } finally {
      setLoading(false);
    }
  };

  const copyResult = () => {
    navigator.clipboard.writeText(result).then(() => toast.success('تم النسخ ✓')).catch(() => {});
  };

  const canGenerate = !loading && (!activeMode.needsProduct || product.trim() || mode === 'caption' || mode === 'reels');

  return (
    <div className="max-w-3xl mx-auto pb-24 space-y-4" dir="rtl">

      {/* Header */}
      <div className="bg-navy rounded-2xl p-5 text-white">
        <h1 className="text-xl font-extrabold flex items-center gap-2">🌸 استوديو السوشال</h1>
        <p className="text-white/70 text-xs mt-1">مساعد محتوى لويز بالذكاء الاصطناعي — كابشن، ريلز، ردود، وتقويم محتوى</p>
      </div>

      {/* Mode tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {MODES.map(m => (
          <button key={m.key}
            onClick={() => { setMode(m.key); setResult(''); setProduct(''); setExtra(''); }}
            className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 transition-all ${
              mode === m.key
                ? 'border-teal bg-teal/10 text-teal'
                : 'border-border bg-surface text-text hover:border-teal/30'
            }`}>
            <span className="text-2xl">{m.icon}</span>
            <span className="text-xs font-bold">{m.label}</span>
          </button>
        ))}
      </div>

      {/* Input panel */}
      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5 space-y-3">
        <p className="text-xs text-muted">{activeMode.desc}</p>

        {/* Product picker (for caption/reels) */}
        {activeMode.needsProduct && (
          <div>
            <label className="text-xs font-semibold text-text mb-1.5 block">المنتج (اختياري — اتركه فارغاً لمحتوى عام)</label>
            <input
              list="products-list"
              value={product}
              onChange={e => setProduct(e.target.value)}
              placeholder="اختر منتج أو اكتب اسمه…"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
            <datalist id="products-list">
              {products.map((p, i) => (
                <option key={i} value={p.name}>{p.name_en}</option>
              ))}
            </datalist>
          </div>
        )}

        {/* Extra / message input */}
        <div>
          {!activeMode.needsProduct && (
            <label className="text-xs font-semibold text-text mb-1.5 block">
              {mode === 'reply' ? 'رسالة العميل' : 'ملاحظات (اختياري)'}
            </label>
          )}
          {activeMode.needsProduct && (
            <label className="text-xs font-semibold text-text mb-1.5 block">ملاحظات إضافية (اختياري)</label>
          )}
          <textarea
            value={extra}
            onChange={e => setExtra(e.target.value)}
            placeholder={activeMode.placeholder || 'مثال: ركّز على فائدة الترطيب، عرض خاص…'}
            rows={mode === 'reply' ? 4 : 2}
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30 resize-none"
          />
        </div>

        <button
          onClick={generate}
          disabled={!canGenerate || (mode === 'reply' && !extra.trim())}
          className="w-full py-3 rounded-xl bg-teal text-navy font-bold hover:bg-teal/90 transition disabled:opacity-40 flex items-center justify-center gap-2">
          {loading ? (
            <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> جارٍ التوليد…</>
          ) : (
            <>{activeMode.icon} توليد المحتوى</>
          )}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-surface border border-teal/30 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-teal/5 border-b border-teal/10">
            <p className="text-sm font-bold text-text">✨ المحتوى المُولّد</p>
            <button onClick={copyResult}
              className="text-xs font-semibold text-teal hover:text-teal/70 px-3 py-1.5 rounded-lg hover:bg-teal/10 transition">
              📋 نسخ الكل
            </button>
          </div>
          <div className="p-4 text-sm text-text leading-relaxed whitespace-pre-wrap">
            {result}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 1 && (
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-xs font-bold text-muted mb-2">📜 آخر ما تم توليده</p>
          <div className="space-y-1.5">
            {history.slice(1, 6).map((h, i) => (
              <button key={i} onClick={() => setResult(h.content)}
                className="w-full text-start flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-alt transition">
                <span className="text-sm">{MODES.find(m => m.key === h.mode)?.icon}</span>
                <span className="flex-1 text-xs text-text truncate">{h.product || MODES.find(m => m.key === h.mode)?.label}</span>
                <span className="text-[10px] text-muted">{new Date(h.at).toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
