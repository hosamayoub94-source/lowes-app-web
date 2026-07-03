// =============================================================
// AnnouncementsScreen — نشرة الأخبار والإعلانات الداخلية
// =============================================================
import { useEffect, useState, useRef } from 'react';
import { Hero }        from '@components/ui/Hero';
import { Card }        from '@components/ui/Card';
import { Button }      from '@components/ui/Button';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@components/ui/Modal';
import { Input, Textarea, Field } from '@components/ui/Input';
import { useAuth }     from '@hooks/useAuth';
import { supabase }    from '@services/supabase';
import { ROLES }       from '@data/teams';

// ── helpers ───────────────────────────────────────────────────
function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)   return 'منذ لحظات';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  if (diff < 86400 * 7) return `منذ ${Math.floor(diff / 86400)} يوم`;
  return new Date(iso).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric' });
}

const EMOJIS = ['📢', '🎉', '⚠️', '✅', '📌', '💡', '🏆', '🔔', '📝', '🚀', '❤️', '🌟'];

const CATEGORY_COLORS = {
  '📢': 'bg-blue-500/10   text-blue-600',
  '🎉': 'bg-yellow-400/10 text-yellow-600',
  '⚠️': 'bg-red-400/10    text-red-600',
  '✅': 'bg-green-400/10  text-green-700',
  '📌': 'bg-purple-400/10 text-purple-600',
  '💡': 'bg-amber-400/10  text-amber-700',
  '🏆': 'bg-teal/10       text-teal',
  '🔔': 'bg-orange-400/10 text-orange-600',
  '📝': 'bg-slate-400/10  text-slate-600',
  '🚀': 'bg-indigo-400/10 text-indigo-600',
  '❤️': 'bg-rose-400/10   text-rose-600',
  '🌟': 'bg-amber-300/10  text-amber-600',
};

// ── AnnouncementCard ──────────────────────────────────────────
function AnnouncementCard({ item, canManage, onPin, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = item.body?.length > 180;
  const displayBody = isLong && !expanded ? item.body.slice(0, 180) + '…' : item.body;
  const badgeClass = CATEGORY_COLORS[item.emoji] || 'bg-muted/10 text-muted';

  return (
    <div
      className={`relative rounded-2xl border p-4 transition-shadow hover:shadow-soft ${
        item.is_pinned
          ? 'border-teal/40 bg-teal/5'
          : 'border-border bg-surface'
      }`}
    >
      {/* Pinned ribbon */}
      {item.is_pinned && (
        <span className="absolute top-3 left-3 text-[10px] font-bold text-teal bg-teal/10 px-2 py-0.5 rounded-full">
          📌 مثبّت
        </span>
      )}

      {/* Header */}
      <div className={`flex items-start gap-3 ${item.is_pinned ? 'mt-5' : ''}`}>
        <span
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${badgeClass}`}
        >
          {item.emoji || '📢'}
        </span>

        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-text text-sm leading-snug">{item.title}</h3>
          <p className="text-xs text-muted mt-0.5">
            {item.created_by} · {timeAgo(item.created_at)}
          </p>
        </div>

        {/* Actions */}
        {canManage && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onPin(item)}
              title={item.is_pinned ? 'إلغاء التثبيت' : 'تثبيت'}
              className="w-8 h-8 rounded-lg hover:bg-surface-alt grid place-items-center text-muted hover:text-teal transition-colors"
            >
              {item.is_pinned ? '📍' : '📌'}
            </button>
            <button
              onClick={() => onDelete(item.id)}
              title="حذف"
              className="w-8 h-8 rounded-lg hover:bg-red-50 grid place-items-center text-muted hover:text-red-500 transition-colors"
            >
              🗑️
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <p className="mt-3 text-sm text-text/80 leading-relaxed whitespace-pre-wrap">
        {displayBody}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 text-xs font-semibold text-teal"
        >
          {expanded ? 'عرض أقل ▲' : 'عرض المزيد ▼'}
        </button>
      )}

      {/* WhatsApp Share Button */}
      <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
        <span className="text-[10px] text-muted">{timeAgo(item.created_at)}</span>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`📢 *${item.title}*\n\n${item.body ?? ''}\n\n— لويز Professional`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] font-semibold text-green-700 bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-950/50 px-2.5 py-1.5 rounded-xl transition"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          شارك واتساب
        </a>
      </div>
    </div>
  );
}

// ── Create Modal ──────────────────────────────────────────────
function CreateModal({ open, onClose, onCreate, authorName }) {
  const [form, setForm] = useState({ title: '', body: '', emoji: '📢', is_emergency: false, expires_hours: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const titleRef = useRef(null);

  useEffect(() => {
    if (open) {
      setForm({ title: '', body: '', emoji: '📢', is_emergency: false, expires_hours: '' });
      setError('');
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('العنوان مطلوب'); return; }
    if (!form.body.trim())  { setError('النص مطلوب');    return; }
    setSaving(true);
    setError('');
    try {
      const expires_at = form.is_emergency && form.expires_hours
        ? new Date(Date.now() + Number(form.expires_hours) * 3600000).toISOString()
        : null;
      const bodyText = form.body.trim();
      const { error: err } = await supabase.from('announcements').insert({
        title:        form.title.trim(),
        body:         bodyText,
        // عمود legacy `message` بالجدول NOT NULL — نكتبه (نسخة من body) كي لا يفشل الإدراج
        message:      bodyText,
        is_active:    true,
        emoji:        form.is_emergency ? '🚨' : form.emoji,
        created_by:   authorName,
        is_pinned:    false,
        is_emergency: form.is_emergency,
        expires_at,
      });
      if (err) throw err;
      onCreate();
      onClose();
    } catch (e) {
      setError(e.message || 'حصل خطأ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <ModalHeader title="📢 إعلان جديد" onClose={onClose} />
      <ModalBody className="space-y-4">
        {/* Emoji picker */}
        <Field label="أيقونة الإعلان">
          <div className="flex flex-wrap gap-2 mt-1">
            {EMOJIS.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => setForm(f => ({ ...f, emoji: e }))}
                className={`w-10 h-10 text-xl rounded-xl transition-all ${
                  form.emoji === e
                    ? 'bg-teal/20 ring-2 ring-teal scale-110'
                    : 'bg-surface-alt hover:bg-teal/10'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>

        <Field label="العنوان" required htmlFor="ann-title">
          <Input
            id="ann-title"
            ref={titleRef}
            placeholder="مثال: إجازة رسمية يوم الخميس"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            maxLength={120}
          />
        </Field>

        <Field label="التفاصيل" required htmlFor="ann-body">
          <Textarea
            id="ann-body"
            rows={5}
            placeholder="اكتب تفاصيل الإعلان هنا…"
            value={form.body}
            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            maxLength={1000}
          />
          <span className="block text-left text-xs text-muted mt-1">
            {form.body.length} / 1000
          </span>
        </Field>

        {/* Emergency toggle */}
        <div className={`rounded-2xl border p-3.5 transition-colors ${form.is_emergency ? 'border-red-300 bg-red-50' : 'border-border bg-surface-alt'}`}>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setForm(f => ({ ...f, is_emergency: !f.is_emergency }))}
              className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${form.is_emergency ? 'bg-red-500' : 'bg-border'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${form.is_emergency ? 'right-0.5' : 'left-0.5'}`} />
            </div>
            <div>
              <p className={`text-sm font-bold ${form.is_emergency ? 'text-red-600' : 'text-text'}`}>🚨 إعلان طارئ</p>
              <p className="text-xs text-muted">يظهر شريط أحمر مميز في الصفحة الرئيسية</p>
            </div>
          </label>
          {form.is_emergency && (
            <div className="mt-3">
              <label className="text-xs font-bold text-muted mb-1.5 block">ينتهي بعد (اختياري)</label>
              <select
                value={form.expires_hours}
                onChange={e => setForm(f => ({ ...f, expires_hours: e.target.value }))}
                className="w-full bg-white border border-red-200 rounded-xl px-3 py-2 text-sm text-text focus:outline-none focus:border-red-400"
              >
                <option value="">لا ينتهي تلقائياً</option>
                <option value="1">ساعة واحدة</option>
                <option value="3">3 ساعات</option>
                <option value="6">6 ساعات</option>
                <option value="12">12 ساعة</option>
                <option value="24">يوم كامل</option>
              </select>
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-xl">{error}</p>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={saving}>إلغاء</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'جاري النشر…' : (form.is_emergency ? 'نشر الإعلان الطارئ 🚨' : 'نشر الإعلان 📢')}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ── SetupBanner — first-time SQL hint ────────────────────────
function SetupBanner({ onDismiss }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm">
      <p className="font-bold text-amber-800 mb-2">⚠️ جدول الإعلانات غير موجود</p>
      <p className="text-amber-700 mb-3">نفّذ هذا الـ SQL في Supabase &rarr; SQL Editor:</p>
      <pre className="bg-white border border-amber-200 rounded-xl p-3 text-xs overflow-x-auto text-gray-800 leading-relaxed whitespace-pre-wrap">
{`CREATE TABLE IF NOT EXISTS announcements (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title      text NOT NULL,
  body       text NOT NULL,
  emoji      text DEFAULT '📢',
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now(),
  is_pinned  boolean DEFAULT false
);
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ann_read"   ON announcements FOR SELECT USING (true);
CREATE POLICY "ann_insert" ON announcements FOR INSERT WITH CHECK (true);
CREATE POLICY "ann_update" ON announcements FOR UPDATE USING (true);
CREATE POLICY "ann_delete" ON announcements FOR DELETE USING (true);`}
      </pre>
      <button
        onClick={onDismiss}
        className="mt-3 text-xs text-amber-600 underline"
      >
        تجاهل (عرض واجهة فقط)
      </button>
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function AnnouncementsScreen() {
  const { name, role } = useAuth();
  const isManager = [ROLES.ADMIN, ROLES.MANAGER].includes(role);

  const [items,         setItems]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showCreate,    setShowCreate]    = useState(false);
  const [dbMissing,     setDbMissing]     = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [filter,        setFilter]        = useState('all'); // 'all' | 'pinned'

  // ── Fetch ──────────────────────────────────────────────────
  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('created_at',  { ascending: false });

      if (error) {
        if (error.code === '42P01') { setDbMissing(true); setItems([]); }
        else throw error;
      } else {
        setDbMissing(false);
        setItems(data || []);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnnouncements(); }, []);

  // ── Realtime subscription ──────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('announcements-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        fetchAnnouncements();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Actions ────────────────────────────────────────────────
  const handlePin = async (item) => {
    await supabase.from('announcements').update({ is_pinned: !item.is_pinned }).eq('id', item.id);
    fetchAnnouncements();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف هذا الإعلان؟')) return;
    await supabase.from('announcements').delete().eq('id', id);
    fetchAnnouncements();
  };

  // ── Filter ────────────────────────────────────────────────
  const displayed = filter === 'pinned'
    ? items.filter(i => i.is_pinned)
    : items;

  const pinnedCount  = items.filter(i => i.is_pinned).length;
  const newThisWeek  = items.filter(i => {
    const diff = (Date.now() - new Date(i.created_at)) / 86400000;
    return diff <= 7;
  }).length;

  return (
    <div className="space-y-5">
      <Hero
        eyebrow="الشركة"
        title="نشرة الأخبار والإعلانات 📢"
        subtitle="كل إعلانات وأخبار الشركة في مكان واحد"
      />

      {/* Stats + action row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-3">
          <div className="bg-surface border border-border rounded-2xl px-4 py-2.5 text-center min-w-[80px]">
            <p className="text-2xl font-black text-text">{items.length}</p>
            <p className="text-xs text-muted">إعلان</p>
          </div>
          <div className="bg-surface border border-border rounded-2xl px-4 py-2.5 text-center min-w-[80px]">
            <p className="text-2xl font-black text-teal">{newThisWeek}</p>
            <p className="text-xs text-muted">هذا الأسبوع</p>
          </div>
          {pinnedCount > 0 && (
            <div className="bg-teal/5 border border-teal/30 rounded-2xl px-4 py-2.5 text-center min-w-[80px]">
              <p className="text-2xl font-black text-teal">{pinnedCount}</p>
              <p className="text-xs text-muted">مثبّت</p>
            </div>
          )}
        </div>

        {isManager && (
          <Button
            variant="primary"
            onClick={() => setShowCreate(true)}
            leftIcon={<span>📢</span>}
          >
            إعلان جديد
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      {pinnedCount > 0 && (
        <div className="flex gap-2">
          {[
            { key: 'all',    label: 'الكل' },
            { key: 'pinned', label: '📌 المثبّتة' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                filter === tab.key
                  ? 'bg-navy text-white'
                  : 'bg-surface border border-border text-muted hover:text-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* DB missing banner */}
      {dbMissing && !bannerDismissed && (
        <SetupBanner onDismiss={() => setBannerDismissed(true)} />
      )}

      {/* Feed */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-28 rounded-2xl bg-surface-alt animate-pulse" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-5xl mb-4">📭</p>
          <p className="font-bold text-text text-lg">لا توجد إعلانات بعد</p>
          <p className="text-muted text-sm mt-1">
            {isManager
              ? 'اضغط "إعلان جديد" لنشر أول إعلان للفريق'
              : 'ستظهر هنا إعلانات الشركة والإدارة'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(item => (
            <AnnouncementCard
              key={item.id}
              item={item}
              canManage={isManager}
              onPin={handlePin}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      <CreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={fetchAnnouncements}
        authorName={name || 'الإدارة'}
      />
    </div>
  );
}
