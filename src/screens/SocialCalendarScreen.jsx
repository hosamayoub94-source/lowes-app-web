// =============================================================
// SocialCalendarScreen — تقويم محتوى السوشال ميديا الأسبوعي.
// يعرض المنشورات المخططة لكل يوم × منصة.
// DB: جدول social_posts (id, post_date, platform, content_type,
//     caption, status, assigned_to, created_by, notes).
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@services/supabase';
import { useAuthStore } from '@stores/authStore';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '@components/ui/Modal';
import { Spinner } from '@components/ui/Loading';
import { cn } from '@utils/classNames';

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram', icon: '📸', color: 'bg-pink-50 border-pink-200 text-pink-700' },
  { key: 'tiktok',   label: 'TikTok',    icon: '🎵', color: 'bg-slate-50 border-slate-200 text-slate-700' },
  { key: 'facebook', label: 'Facebook',  icon: '👥', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { key: 'youtube',  label: 'YouTube',   icon: '▶️', color: 'bg-red-50 border-red-200 text-red-700' },
  { key: 'snapchat', label: 'Snapchat',  icon: '👻', color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
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
  draft:     { label: 'مسودة',   color: 'bg-gray-100 text-gray-600' },
  approved:  { label: 'معتمد',   color: 'bg-yellow-100 text-yellow-700' },
  scheduled: { label: 'مجدول',   color: 'bg-blue-100 text-blue-700' },
  published: { label: 'نُشر ✓',  color: 'bg-green-100 text-green-700' },
};

const INPUT_CLS = 'w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/40';

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekDates(anchor) {
  const d = new Date(anchor);
  d.setDate(d.getDate() - d.getDay()); // start of week (Sunday)
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return x;
  });
}

function AddPostModal({ open, onClose, defaultDate, defaultPlatform, onSaved }) {
  const session = useAuthStore((s) => s.session);
  const [form, setForm] = useState({ post_date: defaultDate || '', platform: defaultPlatform || 'instagram', content_type: 'post', status: 'draft', caption: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (open) setForm((p) => ({ ...p, post_date: defaultDate || p.post_date, platform: defaultPlatform || p.platform }));
  }, [open, defaultDate, defaultPlatform]);

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
              <input type="date" value={form.post_date} onChange={(e) => set('post_date', e.target.value)} required className={INPUT_CLS} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">المنصة</label>
              <select value={form.platform} onChange={(e) => set('platform', e.target.value)} className={INPUT_CLS}>
                {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.icon} {p.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">نوع المحتوى</label>
              <select value={form.content_type} onChange={(e) => set('content_type', e.target.value)} className={INPUT_CLS}>
                {CONTENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted">الحالة</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={INPUT_CLS}>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">الكابشن / الوصف <span className="font-normal text-muted/70">(اختياري)</span></label>
            <textarea rows={3} value={form.caption} onChange={(e) => set('caption', e.target.value)} placeholder="نص المنشور أو فكرته..." className={cn(INPUT_CLS, 'resize-none')} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted">ملاحظات <span className="font-normal text-muted/70">(اختياري)</span></label>
            <input type="text" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="رابط تصميم، ملاحظة للمصمم..." className={INPUT_CLS} />
          </div>
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl bg-surface-alt border border-border text-muted text-sm font-bold hover:text-text transition">إلغاء</button>
          <button type="submit" disabled={saving || !form.post_date} className="px-5 py-2.5 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 transition disabled:opacity-40 flex items-center gap-2">
            {saving && <Spinner size="sm" />}
            حفظ البوست
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function PostChip({ post, onClick }) {
  const cfg = STATUS_CFG[post.status] || STATUS_CFG.draft;
  const ct = CONTENT_TYPES.find((t) => t.value === post.content_type);
  return (
    <button
      onClick={() => onClick?.(post)}
      className={cn('w-full text-start rounded-lg border px-2 py-1.5 text-[11px] hover:shadow-sm transition-all', cfg.color)}
    >
      <div className="flex items-center gap-1 font-bold truncate">
        {ct?.label?.split(' ')[0]} <span className="truncate">{post.caption?.slice(0, 25) || post.content_type}</span>
      </div>
      {post.assigned_to && <div className="text-[10px] opacity-70 truncate">← {post.assigned_to}</div>}
    </button>
  );
}

function PostDetailModal({ post, open, onClose, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  if (!post) return null;
  const ct = CONTENT_TYPES.find((t) => t.value === post.content_type);
  const cfg = STATUS_CFG[post.status] || STATUS_CFG.draft;
  const pl = PLATFORMS.find((p) => p.key === post.platform);

  const handleDelete = async () => {
    if (!confirm('حذف هذا البوست؟')) return;
    setDeleting(true);
    await supabase.from('social_posts').delete().eq('id', post.id);
    setDeleting(false);
    onDelete?.();
    onClose?.();
  };

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <ModalHeader title={`${pl?.icon || ''} ${pl?.label || post.platform}`} onClose={onClose} />
      <ModalBody className="space-y-3 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-bold', cfg.color)}>{cfg.label}</span>
          {ct && <span className="text-muted">{ct.label}</span>}
          <span className="text-muted" dir="ltr">{post.post_date}</span>
        </div>
        {post.caption && <p className="text-text bg-surface-alt rounded-xl p-3 text-sm leading-relaxed">{post.caption}</p>}
        {post.notes && <p className="text-muted text-xs">{post.notes}</p>}
        {post.assigned_to && <p className="text-xs text-teal font-semibold">معيّن لـ: {post.assigned_to}</p>}
      </ModalBody>
      <ModalFooter>
        <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 rounded-xl bg-red-100 text-red-700 text-xs font-bold hover:bg-red-200 transition disabled:opacity-40">
          {deleting ? '...' : 'حذف'}
        </button>
        <button onClick={onClose} className="px-4 py-2 rounded-xl bg-surface-alt border border-border text-muted text-sm font-bold hover:text-text transition">إغلاق</button>
      </ModalFooter>
    </Modal>
  );
}

export default function SocialCalendarScreen() {
  const [anchor, setAnchor] = useState(() => new Date());
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState({ open: false, date: '', platform: '' });
  const [detailModal, setDetailModal] = useState({ open: false, post: null });
  const [viewMode, setViewMode] = useState('week'); // 'week' | 'month'

  const days = weekDates(anchor);
  const weekStart = isoDate(days[0]);
  const weekEnd = isoDate(days[6]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('social_posts')
      .select('*')
      .gte('post_date', viewMode === 'week' ? weekStart : `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}-01`)
      .lte('post_date', viewMode === 'week' ? weekEnd : `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}-31`)
      .order('post_date');
    setPosts(data || []);
    setLoading(false);
  }, [weekStart, weekEnd, anchor, viewMode]);

  useEffect(() => { load(); }, [load]);

  const postsByDayPlatform = (date, platform) => {
    const iso = isoDate(date);
    return posts.filter((p) => p.post_date === iso && p.platform === platform);
  };

  const shiftWeek = (dir) => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + dir * 7);
    setAnchor(d);
  };

  const totalByStatus = Object.keys(STATUS_CFG).reduce((acc, k) => {
    acc[k] = posts.filter((p) => p.status === k).length;
    return acc;
  }, {});

  return (
    <div className="max-w-full mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-text">تقويم المحتوى</h1>
          <p className="text-sm text-muted mt-0.5">خطط، جدول وتابع منشورات السوشال ميديا</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Stats chips */}
          {Object.entries(STATUS_CFG).map(([k, v]) => totalByStatus[k] > 0 && (
            <span key={k} className={cn('text-xs font-bold px-2.5 py-1 rounded-full', v.color)}>
              {totalByStatus[k]} {v.label}
            </span>
          ))}
          <button
            onClick={() => setAddModal({ open: true, date: isoDate(new Date()), platform: 'instagram' })}
            className="px-4 py-2 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 transition"
          >
            ➕ بوست جديد
          </button>
        </div>
      </div>

      {/* Week navigator */}
      <div className="flex items-center gap-3">
        <button onClick={() => shiftWeek(-1)} className="w-9 h-9 rounded-xl bg-surface border border-border grid place-items-center text-muted hover:text-text hover:border-teal/40 transition">‹</button>
        <span className="text-sm font-bold text-text flex-1 text-center">
          {days[0].toLocaleDateString('ar-SA', { day: 'numeric', month: 'long' })} — {days[6].toLocaleDateString('ar-SA', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
        <button onClick={() => shiftWeek(1)} className="w-9 h-9 rounded-xl bg-surface border border-border grid place-items-center text-muted hover:text-text hover:border-teal/40 transition">›</button>
        <button onClick={() => setAnchor(new Date())} className="px-3 py-2 rounded-xl bg-surface border border-border text-xs font-bold text-muted hover:text-teal transition">اليوم</button>
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner /></div>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="min-w-[700px]">
            {/* Day headers */}
            <div className="grid gap-1" style={{ gridTemplateColumns: '80px repeat(7, 1fr)' }}>
              <div />
              {days.map((d, i) => {
                const isToday = isoDate(d) === isoDate(new Date());
                return (
                  <div key={i} className={cn('text-center py-2 rounded-xl text-xs font-bold transition', isToday ? 'bg-teal text-navy' : 'bg-surface-alt text-muted')}>
                    <div>{DAYS_AR[d.getDay()]}</div>
                    <div className="text-base font-extrabold">{d.getDate()}</div>
                  </div>
                );
              })}
            </div>

            {/* Platform rows */}
            {PLATFORMS.map((pl) => (
              <div key={pl.key} className="grid gap-1 mt-1.5" style={{ gridTemplateColumns: '80px repeat(7, 1fr)' }}>
                {/* Platform label */}
                <div className="flex items-center gap-1.5 px-1 py-2">
                  <span className="text-base">{pl.icon}</span>
                  <span className="text-[11px] font-bold text-muted">{pl.label}</span>
                </div>
                {/* Day cells */}
                {days.map((d, i) => {
                  const cellPosts = postsByDayPlatform(d, pl.key);
                  return (
                    <div
                      key={i}
                      className="min-h-[64px] rounded-xl border border-border bg-surface hover:border-teal/30 transition p-1 space-y-1 cursor-pointer group"
                      onClick={() => setAddModal({ open: true, date: isoDate(d), platform: pl.key })}
                    >
                      {cellPosts.map((post) => (
                        <PostChip
                          key={post.id}
                          post={post}
                          onClick={(e) => { setDetailModal({ open: true, post: e }); }}
                        />
                      ))}
                      <div className="text-[10px] text-muted/40 group-hover:text-teal/50 text-center hidden group-hover:block transition">+</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-border">
        {Object.entries(STATUS_CFG).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className={cn('w-2.5 h-2.5 rounded-full', v.color.split(' ')[0])} />
            <span className="text-xs text-muted">{v.label}</span>
          </div>
        ))}
        <span className="text-xs text-muted me-auto">· اضغط على أي خلية لإضافة بوست</span>
      </div>

      {/* Modals */}
      <AddPostModal
        open={addModal.open}
        onClose={() => setAddModal((p) => ({ ...p, open: false }))}
        defaultDate={addModal.date}
        defaultPlatform={addModal.platform}
        onSaved={load}
      />
      <PostDetailModal
        open={detailModal.open}
        post={detailModal.post}
        onClose={() => setDetailModal((p) => ({ ...p, open: false }))}
        onDelete={load}
      />
    </div>
  );
}
