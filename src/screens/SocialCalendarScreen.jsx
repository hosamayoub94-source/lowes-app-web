// =============================================================
// SocialCalendarScreen — تقويم محتوى السوشال ميديا
// عرضان: أسبوعي (grid) ومنصة (قائمة تفصيلية بكل المحتوى)
// تحسينات: بحث + تنبيه تعارض + pagination لتجاوز حد 1000 صف
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@services/supabase';
import { useAuthStore } from '@stores/authStore';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '@components/ui/Modal';
import { Spinner } from '@components/ui/Loading';
import { cn } from '@utils/classNames';

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram', icon: '📸', color: 'bg-pink-50 border-pink-200 text-pink-700',   tab: 'bg-pink-100 text-pink-700 border-pink-300' },
  { key: 'tiktok',   label: 'TikTok',    icon: '🎵', color: 'bg-slate-50 border-slate-200 text-slate-700', tab: 'bg-slate-100 text-slate-700 border-slate-300' },
  { key: 'facebook', label: 'Facebook',  icon: '👥', color: 'bg-blue-50 border-blue-200 text-blue-700',   tab: 'bg-blue-100 text-blue-700 border-blue-300' },
  { key: 'youtube',  label: 'YouTube',   icon: '▶️', color: 'bg-red-50 border-red-200 text-red-700',     tab: 'bg-red-100 text-red-700 border-red-300' },
  { key: 'snapchat', label: 'Snapchat',  icon: '👻', color: 'bg-yellow-50 border-yellow-200 text-yellow-700', tab: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
];

const CONTENT_TYPES = [
  { value: 'reel',     label: '🎬 ريلز' },
  { value: 'post',     label: '🖼️ بوست' },
  { value: 'story',    label: '📱 ستوري' },
  { value: 'carousel', label: '📑 كاروسيل' },
  { value: 'video',    label: '📹 فيديو' },
  { value: 'live',     label: '🔴 لايف' },
];

const STATUS_CFG = {
  draft:     { label: 'مسودة',   color: 'bg-gray-100 text-gray-600',   dot: 'bg-gray-400' },
  approved:  { label: 'معتمد',   color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400' },
  scheduled: { label: 'مجدول',   color: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-400' },
  published: { label: 'نُشر ✓',  color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
};

const INPUT_CLS = 'w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/40';
const SELECT_CLS = INPUT_CLS;

// ─── Helpers ─────────────────────────────────────────────────
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function weekDates(anchor) {
  const d = new Date(anchor);
  d.setDate(d.getDate() - d.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return x;
  });
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('ar-SA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── fetchAllPlatformPosts — يتجاوز حد 1000 صف ───────────────
async function fetchAllPlatformPosts(platform) {
  const PAGE = 500;
  let all = [], from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('social_posts')
      .select('*')
      .eq('platform', platform)
      .order('post_date', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ─── AddPostModal ─────────────────────────────────────────────
function AddPostModal({ open, onClose, defaultDate, defaultPlatform, onSaved }) {
  const session = useAuthStore((s) => s.session);
  const [form, setForm] = useState({
    post_date: defaultDate || '', platform: defaultPlatform || 'instagram',
    content_type: 'post', status: 'draft', caption: '', assigned_to: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [conflict, setConflict] = useState([]);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!open) return;
    supabase.from('profiles').select('id, employee_name').eq('is_active', true)
      .then(({ data }) => {
        if (data) setEmployees(data.filter(e => e.employee_name).sort((a,b) => a.employee_name.localeCompare(b.employee_name, 'ar')));
      });
  }, [open]);

  useEffect(() => {
    if (open) {
      setForm((p) => ({ ...p, post_date: defaultDate || p.post_date, platform: defaultPlatform || p.platform }));
      setConflict([]);
    }
  }, [open, defaultDate, defaultPlatform]);

  // تنبيه تعارض: نفس الموظف + نفس اليوم
  useEffect(() => {
    if (!form.post_date || !form.assigned_to) { setConflict([]); return; }
    supabase
      .from('social_posts')
      .select('platform, content_type, status')
      .eq('post_date', form.post_date)
      .eq('assigned_to', form.assigned_to)
      .then(({ data }) => setConflict(data || []));
  }, [form.post_date, form.assigned_to]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.post_date || !form.platform) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('social_posts').insert({
        ...form,
        created_by: session?.employee_name || session?.name || session?.id,
      });
      if (!error) { onSaved?.(); onClose?.(); }
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader title="➕ إضافة بوست" onClose={onClose} />
      <form onSubmit={handleSubmit}>
        <ModalBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">التاريخ</label>
              <input type="date" value={form.post_date} onChange={e => set('post_date', e.target.value)} required className={INPUT_CLS} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">المنصة</label>
              <select value={form.platform} onChange={e => set('platform', e.target.value)} className={SELECT_CLS}>
                {PLATFORMS.map(p => <option key={p.key} value={p.key}>{p.icon} {p.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">نوع المحتوى</label>
              <select value={form.content_type} onChange={e => set('content_type', e.target.value)} className={SELECT_CLS}>
                {CONTENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">الحالة</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={SELECT_CLS}>
                {Object.entries(STATUS_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">معيّن لـ <span className="font-normal text-muted/70">(اختياري)</span></label>
            <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} className={SELECT_CLS}>
              <option value="">— اختر موظف —</option>
              {employees.map(e => <option key={e.id} value={e.employee_name}>{e.employee_name}</option>)}
            </select>
            {/* ── تنبيه تعارض ── */}
            {conflict.length > 0 && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-xs mt-1">
                <span className="shrink-0 mt-0.5">⚠️</span>
                <span>
                  <b>{form.assigned_to}</b> لديه/ها {conflict.length} بوست{conflict.length > 1 ? 'ات' : ''} بنفس التاريخ:{' '}
                  {conflict.map(c => {
                    const pl = PLATFORMS.find(p => p.key === c.platform);
                    return `${pl?.icon || ''} ${pl?.label || c.platform}`;
                  }).join(' · ')}
                </span>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">الكابشن / الوصف <span className="font-normal text-muted/70">(اختياري)</span></label>
            <textarea rows={3} value={form.caption} onChange={e => set('caption', e.target.value)} placeholder="نص المنشور أو فكرته..." className={cn(INPUT_CLS,'resize-none')} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">ملاحظات <span className="font-normal text-muted/70">(اختياري)</span></label>
            <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="رابط تصميم، ملاحظة للمصمم..." className={INPUT_CLS} />
          </div>
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl bg-surface-alt border border-border text-muted text-sm font-bold hover:text-text transition">إلغاء</button>
          <button type="submit" disabled={saving || !form.post_date} className="px-5 py-2.5 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 transition disabled:opacity-40 flex items-center gap-2">
            {saving && <Spinner size="sm" />}حفظ البوست
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ─── PostDetailModal (قراءة + تعديل + حذف) ───────────────────
function PostDetailModal({ post, open, onClose, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [conflict, setConflict] = useState([]);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (post) setForm({ status: post.status, assigned_to: post.assigned_to || '', caption: post.caption || '', notes: post.notes || '' });
    setEditing(false);
    setConflict([]);
  }, [post]);

  useEffect(() => {
    if (!open || !editing) return;
    supabase.from('profiles').select('id, employee_name').eq('is_active', true)
      .then(({ data }) => {
        if (data) setEmployees(data.filter(e => e.employee_name).sort((a,b) => a.employee_name.localeCompare(b.employee_name,'ar')));
      });
  }, [open, editing]);

  // تنبيه تعارض في وضع التعديل
  useEffect(() => {
    if (!editing || !post?.post_date || !form.assigned_to) { setConflict([]); return; }
    supabase
      .from('social_posts')
      .select('platform, content_type, status')
      .eq('post_date', post.post_date)
      .eq('assigned_to', form.assigned_to)
      .neq('id', post.id)
      .then(({ data }) => setConflict(data || []));
  }, [editing, post?.post_date, post?.id, form.assigned_to]);

  if (!post) return null;
  const cfg = STATUS_CFG[post.status] || STATUS_CFG.draft;
  const ct  = CONTENT_TYPES.find(t => t.value === post.content_type);
  const pl  = PLATFORMS.find(p => p.key === post.platform);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('social_posts').update(form).eq('id', post.id);
    setSaving(false);
    if (!error) { onUpdate?.(); setEditing(false); }
  };

  const handleDelete = async () => {
    if (!confirm('حذف هذا البوست؟')) return;
    setDeleting(true);
    await supabase.from('social_posts').delete().eq('id', post.id);
    setDeleting(false);
    onDelete?.(); onClose?.();
  };

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <ModalHeader title={`${pl?.icon || ''} ${pl?.label || post.platform}`} onClose={onClose} />
      <ModalBody className="space-y-3 text-sm">
        {/* Meta row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-bold', cfg.color)}>{cfg.label}</span>
          {ct && <span className="text-muted text-xs">{ct.label}</span>}
          <span className="text-muted text-xs" dir="ltr">{fmtDate(post.post_date)}</span>
        </div>

        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">الحالة</label>
                <select value={form.status} onChange={e => set('status', e.target.value)} className={SELECT_CLS}>
                  {Object.entries(STATUS_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted">معيّن لـ</label>
                <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} className={SELECT_CLS}>
                  <option value="">— بدون —</option>
                  {employees.map(e => <option key={e.id} value={e.employee_name}>{e.employee_name}</option>)}
                </select>
              </div>
            </div>
            {conflict.length > 0 && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-xs">
                <span className="shrink-0">⚠️</span>
                <span>
                  <b>{form.assigned_to}</b> لديه/ها {conflict.length} بوست آخر في نفس اليوم:{' '}
                  {conflict.map(c => PLATFORMS.find(p => p.key === c.platform)?.icon || '').join(' ')}
                </span>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">الكابشن</label>
              <textarea rows={3} value={form.caption} onChange={e => set('caption', e.target.value)} className={cn(INPUT_CLS,'resize-none text-xs')} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">ملاحظات</label>
              <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)} className={cn(INPUT_CLS,'text-xs')} />
            </div>
          </div>
        ) : (
          <>
            {post.caption && <p className="text-text bg-surface-alt rounded-xl p-3 text-sm leading-relaxed">{post.caption}</p>}
            {post.notes   && <p className="text-muted text-xs">{post.notes}</p>}
            {post.assigned_to && <p className="text-xs text-teal font-semibold">معيّن لـ: {post.assigned_to}</p>}
            {post.created_by  && <p className="text-xs text-muted">أُضيف بواسطة: {post.created_by}</p>}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 rounded-xl bg-red-100 text-red-700 text-xs font-bold hover:bg-red-200 transition disabled:opacity-40">
          {deleting ? '...' : 'حذف'}
        </button>
        {editing ? (
          <>
            <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-xl bg-surface-alt border border-border text-muted text-xs font-bold hover:text-text transition">إلغاء</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl bg-teal text-navy text-xs font-bold hover:bg-teal/90 transition disabled:opacity-40 flex items-center gap-1">
              {saving && <Spinner size="sm" />}حفظ
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)} className="px-4 py-2 rounded-xl bg-surface-alt border border-border text-muted text-xs font-bold hover:text-teal transition">تعديل</button>
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-surface-alt border border-border text-muted text-xs font-bold hover:text-text transition">إغلاق</button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}

// ─── PostChip (للعرض الأسبوعي) ───────────────────────────────
function PostChip({ post, onClick }) {
  const cfg = STATUS_CFG[post.status] || STATUS_CFG.draft;
  const ct  = CONTENT_TYPES.find(t => t.value === post.content_type);
  return (
    <button onClick={() => onClick?.(post)}
      className={cn('w-full text-start rounded-lg border px-2 py-1.5 text-[11px] hover:shadow-sm transition-all', cfg.color)}>
      <div className="flex items-center gap-1 font-bold truncate">
        {ct?.label?.split(' ')[0]} <span className="truncate">{post.caption?.slice(0,25) || post.content_type}</span>
      </div>
      {post.assigned_to && <div className="text-[10px] opacity-70 truncate">← {post.assigned_to}</div>}
    </button>
  );
}

// ─── PostRow (للعرض التفصيلي) ─────────────────────────────────
function PostRow({ post, onClick }) {
  const cfg = STATUS_CFG[post.status] || STATUS_CFG.draft;
  const ct  = CONTENT_TYPES.find(t => t.value === post.content_type);
  return (
    <div
      onClick={() => onClick?.(post)}
      className="flex items-center gap-3 py-3 px-3 hover:bg-surface-alt/60 cursor-pointer rounded-xl transition-colors group"
    >
      <span className={cn('shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold min-w-[56px] text-center', cfg.color)}>{cfg.label}</span>
      <span className="shrink-0 text-xs text-muted w-28 truncate" dir="ltr">{fmtDate(post.post_date)}</span>
      <span className="shrink-0 text-xs text-muted w-20">{ct?.label || post.content_type || '—'}</span>
      <span className="flex-1 text-sm text-text truncate min-w-0">{post.caption || <span className="text-muted/50">بدون كابشن</span>}</span>
      <span className="shrink-0 text-xs text-teal font-semibold w-24 truncate text-end">{post.assigned_to || '—'}</span>
      {post.notes && <span className="shrink-0 text-xs text-muted max-w-[140px] truncate hidden sm:block">{post.notes}</span>}
      <span className="shrink-0 text-[10px] text-muted/30 group-hover:text-teal/50 transition">تفاصيل ›</span>
    </div>
  );
}

// ─── PlatformListView ─────────────────────────────────────────
function PlatformListView({ platform, posts, loading, statusFilter, onStatusFilter, searchTerm, onSearch, onAdd, onSelectPost }) {
  const q = searchTerm.trim().toLowerCase();
  const filtered = posts
    .filter(p => !statusFilter || p.status === statusFilter)
    .filter(p => !q ||
      (p.caption     || '').toLowerCase().includes(q) ||
      (p.assigned_to || '').toLowerCase().includes(q) ||
      (p.notes       || '').toLowerCase().includes(q)
    );

  const stats = Object.keys(STATUS_CFG).reduce((acc, k) => {
    acc[k] = posts.filter(p => p.status === k).length;
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <span className="absolute inset-y-0 start-3 flex items-center text-muted text-sm pointer-events-none">🔍</span>
        <input
          type="text"
          value={searchTerm}
          onChange={e => onSearch(e.target.value)}
          placeholder="بحث في الكابشن، الموظف، الملاحظات..."
          className="w-full rounded-xl border border-border bg-surface-alt ps-9 pe-4 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/40"
        />
        {searchTerm && (
          <button onClick={() => onSearch('')} className="absolute inset-y-0 end-3 flex items-center text-muted hover:text-text text-lg">×</button>
        )}
      </div>

      {/* Stats + filter bar */}
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onStatusFilter('')}
            className={cn('text-xs font-bold px-3 py-1.5 rounded-full border transition',
              !statusFilter ? 'bg-navy text-white border-navy' : 'bg-surface border-border text-muted hover:border-teal/40'
            )}
          >
            الكل ({posts.length}{q ? ` · يظهر ${filtered.length}` : ''})
          </button>
          {Object.entries(STATUS_CFG).map(([k, v]) => stats[k] > 0 && (
            <button key={k}
              onClick={() => onStatusFilter(statusFilter === k ? '' : k)}
              className={cn('text-xs font-bold px-3 py-1.5 rounded-full border transition', v.color,
                statusFilter === k ? 'ring-2 ring-offset-1 ring-current' : 'opacity-80 hover:opacity-100'
              )}
            >
              {v.label} ({stats[k]})
            </button>
          ))}
        </div>
        <button
          onClick={onAdd}
          className="px-4 py-2 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 transition shrink-0"
        >
          ➕ بوست جديد
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted gap-2">
          <span className="text-3xl">{q ? '🔍' : platform?.icon || '📋'}</span>
          <p className="text-sm">
            {q
              ? `لا توجد نتائج لـ "${searchTerm}"`
              : statusFilter
                ? `لا يوجد محتوى بحالة "${STATUS_CFG[statusFilter]?.label}"`
                : `لا يوجد محتوى مسجّل لـ ${platform?.label}`}
          </p>
          {!q && !statusFilter && (
            <button onClick={onAdd} className="mt-2 text-teal text-sm font-semibold hover:underline">+ أضف أول بوست</button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-3 py-2 bg-surface-alt/80 border-b border-border text-[11px] font-bold text-muted">
            <span className="min-w-[56px]">الحالة</span>
            <span className="w-28">التاريخ</span>
            <span className="w-20">النوع</span>
            <span className="flex-1">الكابشن / الوصف</span>
            <span className="w-24 text-end">معيّن لـ</span>
            <span className="hidden sm:block max-w-[140px]">ملاحظات</span>
            <span className="w-12" />
          </div>
          <div className="divide-y divide-border/50">
            {filtered.map(post => (
              <PostRow key={post.id} post={post} onClick={onSelectPost} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── WeeklyGrid ──────────────────────────────────────────────
function WeeklyGrid({ days, posts, onAddPost, onSelectPost }) {
  const postsByCell = (date, platform) => {
    const iso = isoDate(date);
    return posts.filter(p => p.post_date === iso && p.platform === platform);
  };

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <div className="min-w-[700px]">
        <div className="grid gap-1" style={{ gridTemplateColumns: '80px repeat(7,1fr)' }}>
          <div />
          {days.map((d, i) => {
            const isToday = isoDate(d) === isoDate(new Date());
            return (
              <div key={i} className={cn('text-center py-2 rounded-xl text-xs font-bold', isToday ? 'bg-teal text-navy' : 'bg-surface-alt text-muted')}>
                <div>{DAYS_AR[d.getDay()]}</div>
                <div className="text-base font-extrabold">{d.getDate()}</div>
              </div>
            );
          })}
        </div>
        {PLATFORMS.map(pl => (
          <div key={pl.key} className="grid gap-1 mt-1.5" style={{ gridTemplateColumns: '80px repeat(7,1fr)' }}>
            <div className="flex items-center gap-1.5 px-1 py-2">
              <span className="text-base">{pl.icon}</span>
              <span className="text-[11px] font-bold text-muted">{pl.label}</span>
            </div>
            {days.map((d, i) => {
              const cellPosts = postsByCell(d, pl.key);
              return (
                <div key={i}
                  className="min-h-[64px] rounded-xl border border-border bg-surface hover:border-teal/30 transition p-1 space-y-1 cursor-pointer group"
                  onClick={() => onAddPost(isoDate(d), pl.key)}
                >
                  {cellPosts.map(post => (
                    <PostChip key={post.id} post={post} onClick={p => { onSelectPost(p); }} />
                  ))}
                  <div className="text-[10px] text-muted/40 group-hover:text-teal/50 text-center hidden group-hover:block">+</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Screen ─────────────────────────────────────────────
export default function SocialCalendarScreen() {
  const [tab, setTab] = useState('week');

  // Week view
  const [anchor, setAnchor]       = useState(() => new Date());
  const [weekPosts, setWeekPosts] = useState([]);
  const [weekLoading, setWeekLoading] = useState(false);

  // Platform view
  const [platPosts, setPlatPosts]     = useState([]);
  const [platLoading, setPlatLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm]   = useState('');

  // Modals
  const [addModal, setAddModal]       = useState({ open: false, date: '', platform: '' });
  const [detailModal, setDetailModal] = useState({ open: false, post: null });

  const days      = weekDates(anchor);
  const weekStart = isoDate(days[0]);
  const weekEnd   = isoDate(days[6]);

  // ── Load week posts ──
  const loadWeek = useCallback(async () => {
    setWeekLoading(true);
    const { data } = await supabase
      .from('social_posts')
      .select('*')
      .gte('post_date', weekStart)
      .lte('post_date', weekEnd)
      .order('post_date');
    setWeekPosts(data || []);
    setWeekLoading(false);
  }, [weekStart, weekEnd]);

  // ── Load platform posts (يتجاوز حد 1000 صف) ──
  const loadPlatform = useCallback(async (platform) => {
    setPlatLoading(true);
    const all = await fetchAllPlatformPosts(platform);
    setPlatPosts(all);
    setPlatLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'week') loadWeek();
    else loadPlatform(tab);
  }, [tab, loadWeek, loadPlatform]);

  const reload = useCallback(() => {
    if (tab === 'week') loadWeek();
    else loadPlatform(tab);
  }, [tab, loadWeek, loadPlatform]);

  const handleTabChange = (key) => {
    setTab(key);
    setStatusFilter('');
    setSearchTerm('');
  };

  const allPosts = tab === 'week' ? weekPosts : platPosts;
  const totalByStatus = Object.keys(STATUS_CFG).reduce((acc, k) => {
    acc[k] = allPosts.filter(p => p.status === k).length;
    return acc;
  }, {});

  const activePlatform = PLATFORMS.find(p => p.key === tab);

  return (
    <div className="max-w-full mx-auto px-4 py-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-text">تقويم المحتوى</h1>
          <p className="text-sm text-muted mt-0.5">خطط وجدول وتابع منشورات السوشال ميديا</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {Object.entries(STATUS_CFG).map(([k, v]) => totalByStatus[k] > 0 && (
            <span key={k} className={cn('text-xs font-bold px-2.5 py-1 rounded-full', v.color)}>
              {totalByStatus[k]} {v.label}
            </span>
          ))}
          {tab === 'week' && (
            <button
              onClick={() => setAddModal({ open: true, date: isoDate(new Date()), platform: 'instagram' })}
              className="px-4 py-2 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 transition"
            >
              ➕ بوست جديد
            </button>
          )}
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 border-b border-border">
        <button
          onClick={() => handleTabChange('week')}
          className={cn('shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition border',
            tab === 'week'
              ? 'bg-navy text-white border-navy'
              : 'bg-surface border-border text-muted hover:border-teal/40 hover:text-text'
          )}
        >
          📅 أسبوعي
        </button>
        {PLATFORMS.map(pl => {
          const count = (tab === pl.key ? platPosts : []).length;
          return (
            <button
              key={pl.key}
              onClick={() => handleTabChange(pl.key)}
              className={cn('shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition border',
                tab === pl.key
                  ? pl.tab
                  : 'bg-surface border-border text-muted hover:border-teal/40 hover:text-text'
              )}
            >
              <span>{pl.icon}</span>
              <span className="hidden sm:inline">{pl.label}</span>
              {tab === pl.key && count > 0 && (
                <span className="text-xs bg-white/30 px-1.5 rounded-full">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Week View ── */}
      {tab === 'week' && (
        <>
          <div className="flex items-center gap-3">
            <button onClick={() => { const d = new Date(anchor); d.setDate(d.getDate()-7); setAnchor(d); }}
              className="w-9 h-9 rounded-xl bg-surface border border-border grid place-items-center text-muted hover:text-text hover:border-teal/40 transition">‹</button>
            <span className="text-sm font-bold text-text flex-1 text-center">
              {days[0].toLocaleDateString('ar-SA',{day:'numeric',month:'long'})} — {days[6].toLocaleDateString('ar-SA',{day:'numeric',month:'long',year:'numeric'})}
            </span>
            <button onClick={() => { const d = new Date(anchor); d.setDate(d.getDate()+7); setAnchor(d); }}
              className="w-9 h-9 rounded-xl bg-surface border border-border grid place-items-center text-muted hover:text-text hover:border-teal/40 transition">›</button>
            <button onClick={() => setAnchor(new Date())}
              className="px-3 py-2 rounded-xl bg-surface border border-border text-xs font-bold text-muted hover:text-teal transition">اليوم</button>
          </div>

          {weekLoading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : (
            <WeeklyGrid
              days={days}
              posts={weekPosts}
              onAddPost={(date, platform) => setAddModal({ open: true, date, platform })}
              onSelectPost={(post) => setDetailModal({ open: true, post })}
            />
          )}
        </>
      )}

      {/* ── Platform List View ── */}
      {tab !== 'week' && (
        <PlatformListView
          platform={activePlatform}
          posts={platPosts}
          loading={platLoading}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          searchTerm={searchTerm}
          onSearch={setSearchTerm}
          onAdd={() => setAddModal({ open: true, date: isoDate(new Date()), platform: tab })}
          onSelectPost={(post) => setDetailModal({ open: true, post })}
        />
      )}

      {/* ── Legend (week only) ── */}
      {tab === 'week' && (
        <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-border">
          {Object.entries(STATUS_CFG).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className={cn('w-2.5 h-2.5 rounded-full', v.dot)} />
              <span className="text-xs text-muted">{v.label}</span>
            </div>
          ))}
          <span className="text-xs text-muted me-auto">· اضغط على أي خلية لإضافة بوست</span>
        </div>
      )}

      {/* ── Modals ── */}
      <AddPostModal
        open={addModal.open}
        onClose={() => setAddModal(p => ({ ...p, open: false }))}
        defaultDate={addModal.date}
        defaultPlatform={addModal.platform}
        onSaved={reload}
      />
      <PostDetailModal
        open={detailModal.open}
        post={detailModal.post}
        onClose={() => setDetailModal(p => ({ ...p, open: false }))}
        onDelete={reload}
        onUpdate={() => {
          reload();
          setDetailModal(p => ({ ...p, post: null, open: false }));
        }}
      />
    </div>
  );
}
