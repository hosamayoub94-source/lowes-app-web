// =============================================================
// PromptStudioScreen — استوديو برومبتات الصور الرسمية.
// 3 تبويبات:
//   1. برومبتات البراند — 26 منتج (منتج / مودل)
//   2. مولّد سريع — منتج + نمط → برومبت فوري
//   3. طلب مخصص — AI يولّد برومبت حسب وصفك
// =============================================================
import { useState, useCallback } from 'react';
import { BRAND_PROMPTS, CATEGORIES } from '@data/brandPrompts';
import { supabase } from '@services/supabase';
import { cn } from '@utils/classNames';

// ── نسخ للحافظة ─────────────────────────────────────────────
function useCopy() {
  const [copied, setCopied] = useState('');
  const copy = useCallback(async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(key);
    setTimeout(() => setCopied((k) => (k === key ? '' : k)), 2000);
  }, []);
  return { copied, copy };
}

const CAT_ICONS = { skin: '✨', hair: '💇', body: '🫧' };

// ── تبويب 1: برومبتات البراند ────────────────────────────────
function BrandKitTab() {
  const [mode, setMode] = useState('product');
  const [filter, setFilter] = useState('all');
  const [done, setDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lw_prompts_done') || '{}'); } catch { return {}; }
  });
  const { copied, copy } = useCopy();

  const toggle = (id) => {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    try { localStorage.setItem('lw_prompts_done', JSON.stringify(next)); } catch {}
  };

  const products = filter === 'all' ? BRAND_PROMPTS : BRAND_PROMPTS.filter((p) => p.category === filter);
  const doneCount = BRAND_PROMPTS.filter((p) => done[p.id]).length;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center bg-surface border border-border rounded-xl overflow-hidden">
          <button onClick={() => setMode('product')} className={cn('px-3 py-2 text-sm font-bold transition', mode === 'product' ? 'bg-teal text-navy' : 'text-muted hover:text-text')}>📷 منتج</button>
          <button onClick={() => setMode('model')}   className={cn('px-3 py-2 text-sm font-bold transition', mode === 'model'   ? 'bg-teal text-navy' : 'text-muted hover:text-text')}>👤 مودل</button>
        </div>
        <div className="flex items-center gap-1.5">
          {['all', 'skin', 'hair', 'body'].map((c) => (
            <button key={c} onClick={() => setFilter(c)} className={cn('px-3 py-1.5 rounded-xl text-xs font-bold border transition', filter === c ? 'bg-teal text-navy border-teal' : 'bg-surface border-border text-muted hover:text-text')}>
              {c === 'all' ? 'الكل' : `${CAT_ICONS[c]} ${CATEGORIES[c]}`}
            </button>
          ))}
        </div>
        <div className="ms-auto flex items-center gap-2">
          <div className="text-xs text-muted">{doneCount}/{BRAND_PROMPTS.length} خلص ✓</div>
          <div className="w-24 h-2 bg-surface-alt rounded-full overflow-hidden">
            <div className="h-full bg-teal rounded-full transition-all" style={{ width: `${(doneCount / BRAND_PROMPTS.length) * 100}%` }} />
          </div>
          <button onClick={() => { setDone({}); try { localStorage.removeItem('lw_prompts_done'); } catch {} }} className="text-xs text-muted hover:text-red-500 transition">إعادة</button>
        </div>
      </div>

      {/* Instructions */}
      <div className="rounded-xl bg-navy/5 dark:bg-navy/30 border border-navy/10 px-4 py-3 text-xs text-muted leading-relaxed">
        ① اضغط <b className="text-teal">نسخ</b> → الصق في Seedream / Midjourney / Flux
        · ② لا تضيف reference images لصور المنتج النقية
        · ③ بعد الموافقة اضغط <b className="text-green-600">✓</b>
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {products.map((p) => {
          const prompt = mode === 'model' ? p.modelPrompt : p.productPrompt;
          const isDone = !!done[p.id];
          return (
            <div key={p.id} className={cn('rounded-2xl border bg-surface transition-all', isDone ? 'opacity-60 border-border' : p.hero ? 'border-amber-300 bg-amber-50/30 dark:bg-amber-900/10' : 'border-border hover:border-teal/30')}>
              {/* Card head */}
              <div className={cn('flex items-center justify-between gap-3 px-4 py-3 rounded-t-2xl', p.hero ? 'bg-navy/90' : 'bg-surface-alt')}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn('text-sm font-bold shrink-0', p.hero ? 'text-amber-400' : 'text-muted/60')}>{p.id.replace('c', '').padStart(2, '0')}</span>
                  <span className={cn('font-bold text-sm', p.hero ? 'text-white' : 'text-text')}>{p.ar}</span>
                  <span className={cn('text-xs italic shrink-0 hidden sm:block', p.hero ? 'text-amber-300/80' : 'text-muted')}>{p.en}</span>
                  {p.hero && <span className="text-xs bg-amber-400/20 text-amber-400 px-2 py-0.5 rounded-full font-bold">HERO</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted" dir="ltr">{p.sku} · {p.size}</span>
                  <button onClick={() => toggle(p.id)} className={cn('w-7 h-7 rounded-lg text-sm font-bold transition', isDone ? 'bg-green-100 text-green-600' : 'bg-surface-alt text-muted/40 hover:text-amber-500')}>✓</button>
                </div>
              </div>

              {/* Prompt */}
              <div className="relative px-4 py-3">
                <pre className="text-xs text-muted leading-relaxed whitespace-pre-wrap font-mono bg-surface-alt/60 rounded-xl p-3 pe-14 max-h-24 overflow-y-auto select-all">{prompt}</pre>
                <button
                  onClick={() => copy(prompt, p.id)}
                  className={cn('absolute top-5 end-6 px-3 py-1.5 rounded-lg text-xs font-bold transition', copied === p.id ? 'bg-green-500 text-white' : 'bg-amber-500 hover:bg-amber-400 text-white')}
                >
                  {copied === p.id ? '✓ تم' : 'نسخ'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── تبويب 2: مولّد سريع ──────────────────────────────────────
const QUICK_FORMATS = [
  { key: '1:1',  label: '1:1 — مربّع',  size: '2480x2480', tag: 'Square 1:1' },
  { key: '4:5',  label: '4:5 — بوست',   size: '1080x1350', tag: 'Portrait 4:5' },
  { key: '9:16', label: '9:16 — ستوري/Reels', size: '1080x1920', tag: 'Vertical 9:16' },
];

const QUICK_MODES = [
  { key: 'product',      label: '📷 منتج فقط' },
  { key: 'model',        label: '👤 مع مودل' },
  { key: 'video',        label: '🎬 فيديو' },
  { key: 'before-after', label: '↔️ قبل / بعد' },
  { key: 'ugc',          label: '📱 UGC' },
  { key: 'carousel',     label: '🖼️ كاروسيل' },
];

// يسحب وصف العبوة الحقيقي من productPrompt (شكل، مادة، لون) عشان يُعاد استخدامه
// بالأنماط الجديدة بدل كتابة وصف عام يفقد تفاصيل المنتج الحقيقية.
function extractPackagingDesc(productPrompt) {
  const m = productPrompt.match(/— (a[n]? .+?)\. Centered on a seamless/s);
  return m ? m[1] : 'the product';
}

function fmtTag(format) {
  const f = QUICK_FORMATS.find((x) => x.key === format) || QUICK_FORMATS[0];
  return `${f.tag}, ${f.size}px`;
}

function buildBeforeAfterPrompt(product, format) {
  const desc = extractPackagingDesc(product.productPrompt);
  return `Split-frame before/after result photography for LOWE'S Profesyonel ${product.en}.
Left half ("before"): skin appears dull, uneven tone, slightly tired — neutral cool lighting.
Right half ("after"): skin appears radiant, smooth, visibly improved — same angle, warm glowing lighting.
A thin vertical gold line divides both halves. ${fmtTag(format)}.
${desc} sits small in the bottom corner, styled identically on both sides.
Camera: identical framing and angle on both halves — the comparison must feel honest and clinical, not exaggerated.
Photorealistic, editorial skincare photography. --no burned-in "before/after" text (add captions in post), no heavy retouching, no unrealistic skin, no watermark`;
}

function buildUgcPrompt(product, format) {
  const desc = extractPackagingDesc(product.productPrompt);
  return `Authentic UGC-style photo/video of a real customer using LOWE'S Profesyonel ${product.en}.
Setting: home bathroom mirror or bedroom vanity, lived-in and unstyled — not a studio.
Framing: ${fmtTag(format)}, handheld phone-camera feel, natural imperfect composition.
Lighting: everyday indoor light — window light or ring-light glow, no professional rig.
The person speaks naturally toward the camera while holding ${desc}, casual first-person testimonial energy, trustworthy and unscripted.
Camera: front-facing selfie angle or handheld arm's-length shot.
--no studio lighting, no posed stock-photo energy, no on-screen branding overlays, no watermark`;
}

function buildVideoPrompt(product, format) {
  const desc = extractPackagingDesc(product.productPrompt);
  const cam = format === '9:16'
    ? 'Slow vertical push-in, camera drifting upward from base to cap.'
    : 'Slow orbital pan 120° around the product, camera at eye level.';
  return `Product showcase video of the LOWE'S Profesyonel ${product.en} — ${desc}.
${fmtTag(format)}, 6–8 seconds.
Camera: ${cam} Camera motion only — the product stays completely still.
Setting: seamless warm-cream (#FBF7EC) background, soft diffused light from the upper-left, cap and label catch a soft gold highlight as the camera moves.
A faint embossed gold heart motif is barely visible beneath the product base.
--no people, no text overlays, no cuts, no watermark`;
}

function buildCarouselPrompt(product, format) {
  const siblings = BRAND_PROMPTS.filter((x) => x.category === product.category && x.id !== product.id).slice(0, 3);
  const slides = [product, ...siblings];
  const catLabel = CATEGORIES[product.category];
  return `Carousel set — ${catLabel} routine, ${fmtTag(format)}. Keep camera angle, warm-cream surface tone (#FBF7EC) and light direction identical across every slide so the set reads as one system.

Slide 1 (Cover): ${slides.map((s) => s.en).join(', ')} arranged together in an evenly-spaced flatlay grid, labels facing camera, faint embossed gold heart motif in the background.
${slides.map((s, i) => `Slide ${i + 2}: ${s.en} alone — single hero shot, same styling and lighting as Slide 1.`).join('\n')}

--no people, no clutter, no harsh shadows, no watermark`;
}

function buildQuickPrompt(product, mode, format) {
  if (!product) return '';
  if (mode === 'model') return product.modelPrompt.replace('Square 1:1, 2480x2480px', fmtTag(format));
  if (mode === 'product') return product.productPrompt.replace('Square 1:1, 2480x2480px', fmtTag(format));
  if (mode === 'video') return buildVideoPrompt(product, format);
  if (mode === 'before-after') return buildBeforeAfterPrompt(product, format);
  if (mode === 'ugc') return buildUgcPrompt(product, format);
  if (mode === 'carousel') return buildCarouselPrompt(product, format);
  return product.productPrompt;
}

function QuickGeneratorTab() {
  const [selectedId, setSelectedId] = useState('c01');
  const [mode, setMode] = useState('product');
  const [format, setFormat] = useState('1:1');
  const { copied, copy } = useCopy();

  const product = BRAND_PROMPTS.find((p) => p.id === selectedId);
  const prompt = buildQuickPrompt(product, mode, format);

  return (
    <div className="space-y-4">
      {/* Product picker */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted block">المنتج</label>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40">
          {Object.entries(CATEGORIES).map(([cat, label]) => (
            <optgroup key={cat} label={`${CAT_ICONS[cat]} ${label}`}>
              {BRAND_PROMPTS.filter((p) => p.category === cat).map((p) => (
                <option key={p.id} value={p.id}>{p.ar}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Mode */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted block">نوع المحتوى</label>
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_MODES.map((m) => (
              <button key={m.key} onClick={() => setMode(m.key)} className={cn('px-3 py-2 rounded-xl text-sm font-bold border transition text-center', mode === m.key ? 'bg-teal text-navy border-teal' : 'bg-surface border-border text-muted hover:text-text')}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Format */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted block">التنسيق</label>
          <div className="flex flex-col gap-1.5">
            {QUICK_FORMATS.map((f) => (
              <button key={f.key} onClick={() => setFormat(f.key)} className={cn('px-3 py-2 rounded-xl text-sm font-bold border transition text-start', format === f.key ? 'bg-teal text-navy border-teal' : 'bg-surface border-border text-muted hover:text-text')}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Generated prompt */}
      {product && (
        <div className="rounded-2xl border border-teal/30 bg-teal/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-sm font-bold text-text">{product.ar}</span>
              <span className="text-xs text-muted ms-2">{product.sku}</span>
            </div>
            <button
              onClick={() => copy(prompt, 'quick')}
              className={cn('px-4 py-2 rounded-xl text-sm font-bold transition', copied === 'quick' ? 'bg-green-500 text-white' : 'bg-amber-500 hover:bg-amber-400 text-white')}
            >
              {copied === 'quick' ? '✓ تم النسخ' : 'نسخ'}
            </button>
          </div>
          <pre className="text-xs text-muted leading-relaxed whitespace-pre-wrap font-mono bg-white/60 dark:bg-black/10 rounded-xl p-3 max-h-48 overflow-y-auto select-all">
            {prompt}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── تبويب 3: طلب مخصص (AI) ──────────────────────────────────
function AICustomTab() {
  const [request, setRequest] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { copied, copy } = useCopy();

  const generate = async () => {
    if (!request.trim()) return;
    setLoading(true);
    setError('');
    setResult('');
    try {
      const systemContext = `أنت مولّد برومبتات صور احترافية لماركة LOWE'S Professional للعناية بالبشرة. الماركة: أسلوب تحريري راقٍ، خلفية كريمية دافئة (#FBF7EC)، لمسات ذهبية (#C9A646). أجب فقط بالبرومبت جاهز للنسخ، بدون شرح.`;

      const { data, error: fnErr } = await supabase.functions.invoke('social-content', {
        body: {
          type: 'image_prompt',
          system: systemContext,
          message: request,
          products: BRAND_PROMPTS.map((p) => ({ id: p.id, ar: p.ar, en: p.en, sku: p.sku, category: p.category })),
        },
      });
      if (fnErr) throw fnErr;
      setResult(data?.content || data?.text || data?.prompt || JSON.stringify(data));
    } catch (e) {
      setError('حدث خطأ أثناء الإنشاء. تحقق من اتصال الـ Edge Function.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-navy/5 dark:bg-navy/30 border border-navy/10 px-4 py-3 text-xs text-muted">
        اشرح ما تريده: المنتج، الأسلوب، المشهد، المنصة — والـ AI يولّد البرومبت المثالي.
      </div>

      <div className="space-y-2">
        <textarea
          rows={4}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="مثال: أريد برومبت لصورة سيروم فيتامين سي مع موديل تُمسك القطّارة، للإنستغرام نسبة 4:5، جو صباحي دافئ، بشرة مُشرقة..."
          className="w-full rounded-xl border border-border bg-surface-alt px-3 py-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/40 resize-none"
        />
        <button
          onClick={generate}
          disabled={loading || !request.trim()}
          className="w-full py-3 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy/90 transition disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {loading ? (
            <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 2a10 10 0 0 1 10 10" /></svg> جارٍ الإنشاء...</>
          ) : '🤖 إنشاء البرومبت'}
        </button>
      </div>

      {error && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}

      {result && (
        <div className="rounded-2xl border border-teal/30 bg-teal/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-text">البرومبت المُنشأ</span>
            <button
              onClick={() => copy(result, 'ai')}
              className={cn('px-4 py-2 rounded-xl text-sm font-bold transition', copied === 'ai' ? 'bg-green-500 text-white' : 'bg-amber-500 hover:bg-amber-400 text-white')}
            >
              {copied === 'ai' ? '✓ تم النسخ' : 'نسخ'}
            </button>
          </div>
          <pre className="text-xs text-muted leading-relaxed whitespace-pre-wrap font-mono bg-white/60 dark:bg-black/10 rounded-xl p-3 max-h-64 overflow-y-auto select-all">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── الشاشة الرئيسية ──────────────────────────────────────────
const TABS = [
  { key: 'brand',  label: '📷 برومبتات البراند', desc: '26 منتج رسمي' },
  { key: 'quick',  label: '✨ مولّد سريع',        desc: 'منتج + نمط + نسبة' },
  { key: 'ai',     label: '🤖 طلب مخصص',         desc: 'AI يكتب البرومبت' },
];

export default function PromptStudioScreen() {
  const [tab, setTab] = useState('brand');

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-text">✨ استوديو البرومبت</h1>
        <p className="text-sm text-muted mt-0.5">برومبتات الصور الرسمية لـ LOWE'S Professional — جاهزة للنسخ والاستخدام</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn('px-4 py-2.5 rounded-xl text-sm font-bold border transition', tab === t.key ? 'bg-teal text-navy border-teal' : 'bg-surface border-border text-muted hover:text-text hover:border-teal/30')}
          >
            {t.label}
            <span className={cn('text-xs ms-1.5 font-normal', tab === t.key ? 'text-navy/70' : 'text-muted/60')}>{t.desc}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'brand' && <BrandKitTab />}
        {tab === 'quick' && <QuickGeneratorTab />}
        {tab === 'ai'    && <AICustomTab />}
      </div>
    </div>
  );
}
