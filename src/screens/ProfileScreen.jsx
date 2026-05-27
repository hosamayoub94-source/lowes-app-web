// =============================================================
// ProfileScreen 3.0 — بطاقة الموظف الموسعة
// avatar · level ring · معلومات شغل · شركاء الوردية ·
// طلبات الشراكة · إعدادات · PIN change
// =============================================================
import { useEffect, useState, useRef } from 'react';
import { useAuth }              from '@hooks/useAuth';
import { useTheme }             from '@hooks/useTheme';
import { useUiStore }           from '@stores/uiStore';
import { supabase }             from '@services/supabase';
import { changeMyPin }          from '@services/authService';
import { ROLE_LABELS }          from '@data/teams';
import { usePushNotifications } from '@hooks/usePushNotifications';

// ── Level system ───────────────────────────────────────────────
const LEVELS = [
  { min: 500, icon: '🏆', label: 'أسطورة',  ring: '#10b981', bg: 'from-emerald-500 to-teal-600' },
  { min: 300, icon: '💎', label: 'خبير',    ring: '#0d7377', bg: 'from-teal-500 to-cyan-600'    },
  { min: 150, icon: '🔥', label: 'محترف',   ring: '#f59e0b', bg: 'from-amber-500 to-orange-500' },
  { min: 50,  icon: '⭐', label: 'نجم',     ring: '#3b82f6', bg: 'from-blue-500 to-indigo-500'  },
  { min: 0,   icon: '🌱', label: 'مبتدئ',  ring: '#6b7280', bg: 'from-gray-400 to-slate-500'   },
];
function getLevel(pts = 0) { return LEVELS.find(l => pts >= l.min) ?? LEVELS[LEVELS.length - 1]; }

const SHIFT_ICONS = { morning:'🌅', evening:'🌇', night:'🌙', flexible:'🕐' };
const SHIFT_NAMES = { morning:'صباحي', evening:'مسائي', night:'ليلي', flexible:'مرن' };

const CATEGORY_LABELS = {
  general: 'عام',
  products: 'المنتجات',
  company: 'الشركة',
  skincare: 'العناية بالبشرة',
  ingredients: 'المكونات',
  customer_qa: 'أسئلة العملاء',
};

// ── Avatar color ───────────────────────────────────────────────
function avatarBg(name) {
  const colors = ['#0d7377','#0f1f3d','#f59e0b','#e11d48','#7c3aed','#059669'];
  let h = 0; for (const c of (name || '')) h = (h * 31 + c.charCodeAt(0)) % colors.length;
  return colors[h];
}

// ── Avatar mini chip ───────────────────────────────────────────
function AvatarChip({ name, size = 36 }) {
  return (
    <div
      className="rounded-xl flex items-center justify-center text-white font-extrabold text-xs shrink-0"
      style={{ width: size, height: size, background: avatarBg(name) }}
    >
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

// ── Circular progress (SVG) ────────────────────────────────────
function LevelRing({ pct, color, icon, size = 96 }) {
  const r    = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - pct / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-border/30" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={circ} strokeDashoffset={dash}
          strokeLinecap="round" className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-3xl">{icon}</div>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────
function Skel({ className = '' }) {
  return <div className={`bg-surface-alt animate-pulse rounded-xl ${className}`} />;
}

// ── Toggle switch ──────────────────────────────────────────────
function Toggle({ checked, onChange, label, sub }) {
  return (
    <button onClick={onChange} className="flex items-center justify-between w-full py-3 gap-3 text-start">
      <div>
        <p className="text-sm font-semibold text-text">{label}</p>
        {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
      </div>
      <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${checked ? 'bg-teal' : 'bg-border'}`}>
        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0.5 rtl:translate-x-[-2px]'}`} />
      </div>
    </button>
  );
}

// ══════════════════════════════════════════════════════════════
export default function ProfileScreen() {
  const { id, name, role, team, avatar_url, logout } = useAuth();
  const { theme, toggleTheme }   = useTheme();
  const lang       = useUiStore(s => s.lang);
  const toggleLang = useUiStore(s => s.toggleLang);

  const {
    supported:   pushSupported,
    permission:  pushPermission,
    subscribed:  pushSubscribed,
    loading:     pushLoading,
    error:       pushError,
    subscribe:   subscribePush,
    unsubscribe: unsubscribePush,
  } = usePushNotifications();

  // ── Core profile state ─────────────────────────────────────
  const [profile, setProfile]         = useState(null);
  const [monthPts, setMonthPts]       = useState(0);
  const [attStats, setAttStats]       = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [uploading, setUploading]     = useState(false);
  const fileRef = useRef(null);

  // ── Work info edit state ───────────────────────────────────
  const [editMode, setEditMode]       = useState(false);
  const [editData, setEditData]       = useState({ job_title: '', phone: '', personal_email: '', work_location: '', bio: '' });
  const [editSaving, setEditSaving]   = useState(false);
  const [editMsg, setEditMsg]         = useState(null); // { type: 'ok'|'err', text }

  // ── Shift partners state ───────────────────────────────────
  const [partners, setPartners]             = useState([]);          // all shift_partners rows
  const [allEmployees, setAllEmployees]     = useState([]);          // for the picker
  const [showAddPartner, setShowAddPartner] = useState(false);
  const [partnerSearch, setPartnerSearch]   = useState('');
  const [partnerNote, setPartnerNote]       = useState('');
  const [partnerSending, setPartnerSending] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState('');
  const [partnerMsg, setPartnerMsg]         = useState(null);

  // ── PIN change state ───────────────────────────────────────
  const [pinModal, setPinModal]       = useState(false);
  const [newPin, setNewPin]           = useState('');
  const [confirmPin, setConfirmPin]   = useState('');
  const [pinSaving, setPinSaving]     = useState(false);
  const [pinMsg, setPinMsg]           = useState(null);

  // ── Load everything in parallel ────────────────────────────
  useEffect(() => {
    if (!id || !name) return;
    const today     = new Date();
    const monthStr  = today.toISOString().slice(0, 7);
    const monthStart = monthStr + '-01';

    Promise.allSettled([
      supabase.from('profiles').select('*').eq('id', id).single(),

      supabase.from('task_points').select('points')
        .eq('employee_name', name)
        .gte('created_at', monthStart + 'T00:00:00'),

      supabase.from('attendance').select('date,type,time_in')
        .eq('employee_name', name)
        .in('type', ['in', 'out'])
        .gte('date', monthStart.replace(/-/g, '/'))
        .lte('date', today.toISOString().slice(0, 10).replace(/-/g, '/')),

      supabase.from('tasks').select('id,title,completed_at,priority')
        .ilike('assigned_to', `%${name}%`)
        .in('status', ['done', 'completed', 'مكتملة'])
        .order('completed_at', { ascending: false })
        .limit(5),
    ]).then(([pRes, ptRes, attRes, taskRes]) => {
      if (pRes.status === 'fulfilled' && pRes.value.data) {
        const p = pRes.value.data;
        setProfile(p);
        setEditData({
          job_title:      p.job_title      || '',
          phone:          p.phone          || '',
          personal_email: p.personal_email || '',
          work_location:  p.work_location  || '',
          bio:            p.bio            || '',
        });
      }

      const pts = (ptRes.value?.data ?? []).reduce((s, r) => s + (r.points || 0), 0);
      setMonthPts(pts);

      const logs     = attRes.value?.data ?? [];
      const inDates  = new Set(logs.filter(l => l.type === 'in').map(l => l.date));
      const outDates = new Set(logs.filter(l => l.type === 'out').map(l => l.date));
      const allDates = new Set([...inDates, ...outDates]);
      setAttStats({ daysPresent: inDates.size, daysComplete: [...inDates].filter(d => outDates.has(d)).length, daysTotal: allDates.size });

      setRecentTasks(taskRes.value?.data ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id, name]);

  // ── Load shift partners ────────────────────────────────────
  const loadPartners = async () => {
    if (!name) return;
    try {
      const { data } = await supabase
        .from('shift_partners')
        .select('*')
        .or(`requester.eq.${name},partner.eq.${name}`)
        .order('created_at', { ascending: false });
      setPartners(data ?? []);
    } catch {
      // Table may not exist yet — silently ignore
    }
  };

  // ── Load all employees for partner picker ──────────────────
  const loadEmployees = async () => {
    if (!name) return;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('employee_name, job_title')
        .eq('is_active', true)
        .neq('employee_name', name)
        .order('employee_name');
      setAllEmployees(data ?? []);
    } catch {}
  };

  useEffect(() => { loadPartners(); loadEmployees(); }, [name]);

  // ── Realtime: shift partner requests ───────────────────────
  useEffect(() => {
    if (!name) return;
    let channel;
    try {
      channel = supabase
        .channel(`shift_partners:${name}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'shift_partners' },
          (payload) => {
            // Refresh only if this user is involved
            const row = payload.new || payload.old || {};
            if (row.requester === name || row.partner === name) {
              loadPartners();
            }
          },
        )
        .subscribe();
    } catch {
      // Realtime unavailable or table doesn't exist — silently ignore
    }
    return () => {
      try { if (channel) supabase.removeChannel(channel); } catch {}
    };
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Level calculations ─────────────────────────────────────
  const totalPoints = profile?.total_points ?? 0;
  const level       = getLevel(totalPoints);
  const nextLevel   = LEVELS.slice().reverse().find(l => l.min > totalPoints);
  const levelPct    = nextLevel
    ? Math.min(Math.round(((totalPoints - level.min) / (nextLevel.min - level.min)) * 100), 99)
    : 100;

  // ── Avatar upload ──────────────────────────────────────────
  const handleAvatarChange = async e => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const ext  = file.name.split('.').pop();
      const path = `${id}.${ext}`;
      const { data, error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: u } = supabase.storage.from('avatars').getPublicUrl(data.path);
      await supabase.from('profiles').update({ avatar_url: u.publicUrl }).eq('id', id);
      setProfile(p => ({ ...p, avatar_url: u.publicUrl }));
    } catch (e) { alert('فشل رفع الصورة: ' + e.message); }
    finally { setUploading(false); e.target.value = ''; }
  };

  // ── Save work info ─────────────────────────────────────────
  const saveWorkInfo = async () => {
    setEditSaving(true); setEditMsg(null);
    try {
      const { error } = await supabase.from('profiles').update({
        job_title:      editData.job_title.trim()      || null,
        phone:          editData.phone.trim()           || null,
        personal_email: editData.personal_email.trim() || null,
        work_location:  editData.work_location.trim()  || null,
        bio:            editData.bio.trim()             || null,
      }).eq('id', id);
      if (error) throw error;
      setProfile(p => ({ ...p, ...editData }));
      setEditMsg({ type: 'ok', text: '✅ تم حفظ المعلومات' });
      setTimeout(() => { setEditMode(false); setEditMsg(null); }, 1400);
    } catch (e) {
      setEditMsg({ type: 'err', text: e.message || 'حدث خطأ أثناء الحفظ' });
    } finally {
      setEditSaving(false);
    }
  };

  // ── Partner operations ─────────────────────────────────────
  const sendPartnerRequest = async () => {
    if (!selectedPartner) return;
    setPartnerSending(true); setPartnerMsg(null);
    try {
      const { error } = await supabase.from('shift_partners').insert({
        requester: name,
        partner:   selectedPartner,
        note:      partnerNote.trim() || null,
      });
      if (error) {
        if (error.code === '23505') throw new Error('طلب شراكة موجود مسبقاً مع هذا الزميل');
        throw error;
      }
      setPartnerMsg({ type: 'ok', text: '✅ تم إرسال طلب الشراكة' });
      setSelectedPartner(''); setPartnerNote(''); setPartnerSearch('');
      setTimeout(() => { setShowAddPartner(false); setPartnerMsg(null); }, 1800);
      await loadPartners();
    } catch (e) {
      setPartnerMsg({ type: 'err', text: e.message });
    } finally {
      setPartnerSending(false);
    }
  };

  const respondToRequest = async (requestId, accept) => {
    try {
      await supabase.from('shift_partners').update({
        status: accept ? 'accepted' : 'rejected',
        responded_at: new Date().toISOString(),
      }).eq('id', requestId);
      await loadPartners();
    } catch {}
  };

  // ── Derived partner lists ──────────────────────────────────
  const acceptedPartners  = partners.filter(r => r.status === 'accepted');
  const incomingRequests  = partners.filter(r => r.partner === name && r.status === 'pending');
  const outgoingRequests  = partners.filter(r => r.requester === name && r.status === 'pending');

  const filteredEmployees = allEmployees.filter(e =>
    !partnerSearch || e.employee_name.toLowerCase().includes(partnerSearch.toLowerCase())
  );

  const avatarSrc = profile?.avatar_url ?? avatar_url;
  const shiftMeta = profile?.shift_type ? { icon: SHIFT_ICONS[profile.shift_type], name: SHIFT_NAMES[profile.shift_type] } : null;

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-24 sm:pb-8" dir="rtl">

      {/* ── Hero card ────────────────────────────────────────── */}
      <div className={`bg-gradient-to-br ${level.bg} rounded-3xl p-6 text-white shadow-xl relative overflow-hidden`}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -start-8 w-40 h-40 rounded-full bg-white" />
          <div className="absolute -bottom-12 -end-12 w-56 h-56 rounded-full bg-white" />
        </div>
        <div className="relative flex items-center gap-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="relative block group">
              <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-lg border-2 border-white/30">
                {avatarSrc
                  ? <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-3xl font-extrabold text-white"
                      style={{ background: avatarBg(name) }}>
                      {name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                }
              </div>
              <div className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                {uploading
                  ? <span className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  : <span className="text-white opacity-0 group-hover:opacity-100 text-lg">📷</span>
                }
              </div>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-extrabold truncate leading-tight">{name || '—'}</p>
            <p className="text-sm text-white/80 mt-0.5">{profile?.job_title || ROLE_LABELS[role] || role || ''}</p>
            {team && <p className="text-xs text-white/60 mt-0.5">الفريق: {team}</p>}
            <span className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-white/20 text-sm font-bold">
              {level.icon} {level.label}
            </span>
          </div>

          {/* Level ring */}
          <LevelRing pct={levelPct} color="rgba(255,255,255,0.85)" icon={level.icon} />
        </div>

        {/* Points bar */}
        <div className="relative mt-5">
          <div className="flex items-center justify-between text-xs text-white/70 mb-1.5">
            <span>{totalPoints} نقطة</span>
            {nextLevel && <span>{nextLevel.min - totalPoints} للـ {nextLevel.icon}</span>}
          </div>
          <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden">
            <div className="h-2 rounded-full bg-white transition-all duration-700" style={{ width: `${levelPct}%` }} />
          </div>
        </div>
      </div>

      {/* ── Stats row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: '⭐', val: loading ? '…' : totalPoints,                   label: 'إجمالي النقاط',  color: 'text-teal' },
          { icon: '📈', val: loading ? '…' : `+${monthPts}`,               label: 'نقاط هذا الشهر', color: 'text-emerald-600' },
          { icon: '📅', val: loading ? '…' : (attStats?.daysPresent ?? '—'), label: 'أيام الحضور',    color: 'text-blue-600' },
        ].map(s => (
          <div key={s.label} className="bg-surface border border-border rounded-2xl p-3.5 text-center">
            <p className="text-lg mb-1">{s.icon}</p>
            <p className={`text-2xl font-extrabold tabular-nums ${s.color}`}>{s.val}</p>
            <p className="text-[10px] text-muted mt-0.5 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Work Info ─────────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-bold text-text">🏢 معلومات الشغل</p>
          {!editMode ? (
            <button onClick={() => setEditMode(true)}
              className="text-xs font-semibold text-teal hover:opacity-80 transition px-2 py-1 rounded-lg bg-teal/10">
              ✏️ تعديل
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={saveWorkInfo} disabled={editSaving}
                className="text-xs font-bold text-white bg-teal hover:opacity-90 px-3 py-1 rounded-lg transition disabled:opacity-60">
                {editSaving ? '…' : 'حفظ'}
              </button>
              <button onClick={() => { setEditMode(false); setEditMsg(null); setEditData({ job_title: profile?.job_title || '', phone: profile?.phone || '', personal_email: profile?.personal_email || '', work_location: profile?.work_location || '', bio: profile?.bio || '' }); }}
                className="text-xs font-semibold text-muted hover:text-red-fg px-2 py-1 rounded-lg transition">
                إلغاء
              </button>
            </div>
          )}
        </div>
        <div className="p-4 space-y-3">
          {editMsg && (
            <p className={`text-xs font-semibold text-center ${editMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
              {editMsg.text}
            </p>
          )}
          {[
            { key: 'job_title',      icon: '💼', label: 'المسمى الوظيفي',  placeholder: 'مثال: مدير سوشال ميديا' },
            { key: 'work_location',  icon: '📍', label: 'مكان العمل',      placeholder: 'مثال: تركيا — إسطنبول' },
            { key: 'phone',          icon: '📱', label: 'رقم الهاتف',      placeholder: '+90 555 xxx xxxx' },
            { key: 'personal_email', icon: '✉️', label: 'البريد الإلكتروني', placeholder: 'name@example.com' },
          ].map(({ key, icon, label, placeholder }) => (
            <div key={key} className="flex items-start gap-3">
              <span className="text-lg mt-0.5 shrink-0">{icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5">{label}</p>
                {editMode ? (
                  <input
                    value={editData[key]}
                    onChange={e => setEditData(d => ({ ...d, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2 text-sm text-text placeholder:text-muted/50 focus:border-teal focus:outline-none transition"
                  />
                ) : (
                  <p className={`text-sm font-semibold ${editData[key] ? 'text-text' : 'text-muted/50 italic'}`}>
                    {editData[key] || 'لم يُضف بعد'}
                  </p>
                )}
              </div>
            </div>
          ))}

          {/* Bio */}
          <div className="flex items-start gap-3">
            <span className="text-lg mt-0.5 shrink-0">📝</span>
            <div className="flex-1">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5">نبذة شخصية</p>
              {editMode ? (
                <textarea
                  value={editData.bio}
                  onChange={e => setEditData(d => ({ ...d, bio: e.target.value }))}
                  placeholder="أكتب نبذة قصيرة عن نفسك..."
                  rows={3}
                  className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2 text-sm text-text placeholder:text-muted/50 focus:border-teal focus:outline-none transition resize-none"
                />
              ) : (
                <p className={`text-sm font-semibold ${editData.bio ? 'text-text' : 'text-muted/50 italic'}`}>
                  {editData.bio || 'لم تُضف نبذة بعد'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Shift Partners ────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-text">👥 شركاء الوردية</p>
            {incomingRequests.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full mt-0.5">
                🔔 {incomingRequests.length} طلب وارد
              </span>
            )}
          </div>
          <button onClick={() => { setShowAddPartner(s => !s); setPartnerMsg(null); }}
            className="text-xs font-bold text-white bg-teal hover:opacity-90 px-3 py-1.5 rounded-xl transition">
            {showAddPartner ? '✕ إغلاق' : '+ إضافة شريك'}
          </button>
        </div>

        {/* Accepted partners */}
        <div className="px-4 pt-3 pb-1">
          {acceptedPartners.length === 0 ? (
            <p className="text-xs text-muted/60 text-center py-3 italic">لا يوجد شركاء في الوردية بعد</p>
          ) : (
            <div className="space-y-2">
              {acceptedPartners.map(r => {
                const partnerName = r.requester === name ? r.partner : r.requester;
                return (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
                    <AvatarChip name={partnerName} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-text truncate">{partnerName}</p>
                      {r.note && <p className="text-[10px] text-muted truncate">{r.note}</p>}
                    </div>
                    <span className="text-xs text-emerald-600 font-bold bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">✅ شريك</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Incoming requests */}
        {incomingRequests.length > 0 && (
          <div className="px-4 pb-3 mt-2">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">طلبات واردة</p>
            <div className="space-y-2">
              {incomingRequests.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100">
                  <AvatarChip name={r.requester} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-text truncate">{r.requester}</p>
                    {r.note && <p className="text-[10px] text-muted truncate">{r.note}</p>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => respondToRequest(r.id, true)}
                      className="text-[11px] font-bold text-white bg-emerald-500 hover:opacity-90 px-2.5 py-1.5 rounded-xl transition">
                      قبول ✓
                    </button>
                    <button onClick={() => respondToRequest(r.id, false)}
                      className="text-[11px] font-bold text-muted hover:text-red-fg border border-border px-2 py-1.5 rounded-xl transition">
                      رفض
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outgoing pending requests */}
        {outgoingRequests.length > 0 && (
          <div className="px-4 pb-3 mt-1">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">طلبات مُرسلة (قيد الانتظار)</p>
            <div className="flex flex-wrap gap-2">
              {outgoingRequests.map(r => (
                <span key={r.id} className="flex items-center gap-1.5 text-xs text-muted bg-surface-alt px-3 py-1.5 rounded-full border border-border">
                  <AvatarChip name={r.partner} size={20} />
                  {r.partner}
                  <span className="text-[10px] text-amber-500">⏳</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Add partner form */}
        {showAddPartner && (
          <div className="px-4 pb-4 mt-1 border-t border-border/50 pt-4 space-y-3">
            <p className="text-xs font-bold text-muted">إرسال طلب شراكة</p>
            {partnerMsg && (
              <p className={`text-xs font-semibold ${partnerMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
                {partnerMsg.text}
              </p>
            )}
            {/* Search field */}
            <input
              value={partnerSearch}
              onChange={e => { setPartnerSearch(e.target.value); setSelectedPartner(''); }}
              placeholder="ابحث عن زميل..."
              className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text placeholder:text-muted/50 focus:border-teal focus:outline-none transition"
            />
            {/* Employee list */}
            {partnerSearch && filteredEmployees.length > 0 && (
              <div className="border border-border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                {filteredEmployees.map(e => (
                  <button key={e.employee_name}
                    onClick={() => { setSelectedPartner(e.employee_name); setPartnerSearch(e.employee_name); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-start hover:bg-surface-alt transition border-b border-border/50 last:border-0 ${selectedPartner === e.employee_name ? 'bg-teal/10' : ''}`}>
                    <AvatarChip name={e.employee_name} size={32} />
                    <div>
                      <p className="text-sm font-semibold text-text">{e.employee_name}</p>
                      {e.job_title && <p className="text-[10px] text-muted">{e.job_title}</p>}
                    </div>
                    {selectedPartner === e.employee_name && <span className="text-teal me-auto">✓</span>}
                  </button>
                ))}
              </div>
            )}
            {/* Note */}
            <input
              value={partnerNote}
              onChange={e => setPartnerNote(e.target.value)}
              placeholder="ملاحظة (اختياري)"
              className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text placeholder:text-muted/50 focus:border-teal focus:outline-none transition"
            />
            {/* Send button */}
            <button
              onClick={sendPartnerRequest}
              disabled={!selectedPartner || partnerSending}
              className="w-full py-2.5 rounded-xl bg-teal text-white text-sm font-bold hover:opacity-90 transition disabled:opacity-50">
              {partnerSending ? 'جاري الإرسال…' : '📨 إرسال طلب الشراكة'}
            </button>
          </div>
        )}
      </div>

      {/* ── Level ladder ──────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-bold text-text">🏅 سلّم المستويات</p>
        </div>
        <div className="p-3 space-y-1.5">
          {[...LEVELS].reverse().map(l => {
            const isCurrent = l.label === level.label;
            return (
              <div key={l.label}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${isCurrent ? `bg-gradient-to-l ${l.bg} text-white font-bold` : 'text-muted hover:bg-surface-alt'}`}>
                <span className="text-xl shrink-0">{l.icon}</span>
                <span className="flex-1 text-sm">{l.label}</span>
                <span className={`text-xs tabular-nums font-semibold ${isCurrent ? 'text-white/80' : ''}`}>{l.min}+ نقطة</span>
                {isCurrent && <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">أنت هنا</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Work schedule ─────────────────────────────────────── */}
      {(shiftMeta || profile?.work_start || profile?.rest_day) && (
        <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
          <p className="text-sm font-bold text-text">🗓️ جدول العمل</p>
          <div className="space-y-0">
            {shiftMeta && (
              <div className="flex items-center justify-between py-2.5 border-b border-border/50">
                <span className="text-xs text-muted">نوع الوردية</span>
                <span className="text-sm font-semibold text-text">{shiftMeta.icon} {shiftMeta.name}</span>
              </div>
            )}
            {profile?.work_start && profile?.work_end && (
              <div className="flex items-center justify-between py-2.5 border-b border-border/50">
                <span className="text-xs text-muted">ساعات الدوام</span>
                <span className="text-sm font-semibold text-text font-mono">{profile.work_start} – {profile.work_end}</span>
              </div>
            )}
            {profile?.rest_day && (
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs text-muted">يوم الراحة</span>
                <span className="text-sm font-semibold text-text">{profile.rest_day}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Recent completed tasks ────────────────────────────── */}
      {recentTasks.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-bold text-text">✅ آخر المهام المنجزة</p>
          </div>
          <div className="divide-y divide-border/50">
            {recentTasks.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <p className="flex-1 text-sm text-text truncate font-medium">{t.title}</p>
                {t.completed_at && (
                  <span className="text-[10px] text-muted shrink-0">
                    {new Date(t.completed_at).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Push Notifications ────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-4 pt-4 pb-1">
          <p className="text-sm font-bold text-text mb-0.5">🔔 الإشعارات</p>
          <p className="text-xs text-muted">إشعارات النظام حتى عندما يكون التطبيق مغلقاً</p>
        </div>
        <div className="px-4 pb-3">
          {!pushSupported ? (
            <p className="text-xs text-muted py-2">⚠️ المتصفح الحالي لا يدعم إشعارات Push</p>
          ) : pushPermission === 'denied' ? (
            <div className="py-2">
              <p className="text-xs text-red-500">🚫 تم رفض إذن الإشعارات — يرجى السماح من إعدادات المتصفح</p>
              <p className="text-[11px] text-muted mt-1">Settings → Site Settings → Notifications → Allow</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              <Toggle
                checked={pushSubscribed}
                onChange={pushSubscribed ? unsubscribePush : subscribePush}
                label={pushSubscribed ? 'الإشعارات مفعّلة 🟢' : 'تفعيل الإشعارات'}
                sub={pushLoading ? 'جاري المعالجة…' : pushSubscribed ? 'ستصلك إشعارات المهام والحضور والرسائل' : 'اضغط لتلقّي إشعارات النظام'}
              />
              {pushError && <p className="text-[11px] text-red-500 pt-2 pb-1 leading-relaxed">⚠️ {pushError}</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── Preferences ───────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-4 pt-4 pb-1">
          <p className="text-sm font-bold text-text mb-1">⚙️ التفضيلات</p>
        </div>
        <div className="px-4 divide-y divide-border/50 pb-2">
          <Toggle checked={theme === 'dark'} onChange={toggleTheme} label="الوضع المظلم" sub={theme === 'dark' ? 'مفعّل 🌙' : 'غير مفعّل ☀️'} />
          <Toggle checked={lang !== 'ar'} onChange={toggleLang} label="اللغة الإنجليزية" sub={lang === 'ar' ? 'العربية حالياً' : 'English mode'} />
        </div>
      </div>

      {/* ── Change PIN ────────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <p className="text-sm font-bold text-text">🔐 الأمان</p>
        </div>
        {!pinModal ? (
          <div className="px-4 pb-4">
            <button
              onClick={() => { setPinModal('new'); setNewPin(''); setConfirmPin(''); setPinMsg(null); }}
              className="w-full py-2.5 rounded-xl border border-border bg-surface-alt hover:border-teal/40 text-sm font-semibold text-text transition-colors">
              تغيير الرمز السري (PIN)
            </button>
          </div>
        ) : (
          <div className="px-4 pb-4 space-y-3">
            <p className="text-xs text-muted">
              {pinModal === 'new' ? 'أدخل الرمز السري الجديد (4 أرقام)' : 'أعد إدخال الرمز السري للتأكيد'}
            </p>
            <div className="flex items-center justify-center gap-3">
              {[0, 1, 2, 3].map(i => {
                const filled = pinModal === 'new' ? newPin.length > i : confirmPin.length > i;
                return <span key={i} className={`w-4 h-4 rounded-full transition-colors ${filled ? 'bg-teal' : 'bg-border'}`} />;
              })}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[1,2,3,4,5,6,7,8,9].map(d => (
                <button key={d} type="button" disabled={pinSaving}
                  onClick={() => {
                    if (pinModal === 'new' && newPin.length < 4) setNewPin(p => p + d);
                    if (pinModal === 'confirm' && confirmPin.length < 4) setConfirmPin(p => p + d);
                  }}
                  className="h-11 rounded-xl bg-surface-alt hover:bg-surface border border-border text-base font-extrabold disabled:opacity-50 transition-colors">
                  {d}
                </button>
              ))}
              <button type="button" disabled={pinSaving}
                onClick={() => { if (pinModal === 'new') setNewPin(p => p.slice(0,-1)); else setConfirmPin(p => p.slice(0,-1)); }}
                className="h-11 rounded-xl bg-surface-alt hover:bg-surface border border-border text-xs font-bold disabled:opacity-50 transition-colors">مسح</button>
              <button type="button" disabled={pinSaving}
                onClick={() => {
                  if (pinModal === 'new' && newPin.length < 4) setNewPin(p => p + '0');
                  if (pinModal === 'confirm' && confirmPin.length < 4) setConfirmPin(p => p + '0');
                }}
                className="h-11 rounded-xl bg-surface-alt hover:bg-surface border border-border text-base font-extrabold disabled:opacity-50 transition-colors">0</button>
              <div />
            </div>
            {pinModal === 'new' && newPin.length === 4 && (
              <button onClick={() => { setPinModal('confirm'); setConfirmPin(''); setPinMsg(null); }}
                className="w-full py-2.5 rounded-xl bg-teal text-white text-sm font-bold hover:opacity-90 transition">
                التالي — تأكيد الرمز
              </button>
            )}
            {pinModal === 'confirm' && confirmPin.length === 4 && (
              <button disabled={pinSaving}
                onClick={async () => {
                  if (newPin !== confirmPin) { setPinMsg({ type: 'err', text: 'الرمزان غير متطابقَين' }); setConfirmPin(''); return; }
                  setPinSaving(true); setPinMsg(null);
                  try {
                    await changeMyPin(newPin);
                    setPinMsg({ type: 'ok', text: '✅ تم تغيير الرمز السري بنجاح!' });
                    setTimeout(() => { setPinModal(false); setPinMsg(null); }, 1800);
                  } catch (e) { setPinMsg({ type: 'err', text: e?.message || 'حدث خطأ' }); }
                  finally { setPinSaving(false); }
                }}
                className="w-full py-2.5 rounded-xl bg-navy text-white text-sm font-bold hover:opacity-90 transition disabled:opacity-60">
                {pinSaving ? 'جاري الحفظ…' : 'حفظ الرمز السري'}
              </button>
            )}
            {pinMsg && (
              <p className={`text-xs text-center font-semibold ${pinMsg.type === 'ok' ? 'text-green-fg' : 'text-red-fg'}`}>
                {pinMsg.text}
              </p>
            )}
            <button onClick={() => { setPinModal(false); setPinMsg(null); }} className="w-full text-xs text-muted hover:text-red-fg transition">إلغاء</button>
          </div>
        )}
      </div>

      {/* ── Logout ────────────────────────────────────────────── */}
      <button onClick={logout}
        className="w-full py-3.5 rounded-2xl bg-red-bg border border-red/20 text-red-fg font-bold text-sm hover:opacity-80 transition-all hover:scale-[1.01] active:scale-[0.99]">
        🚪 تسجيل الخروج
      </button>

    </div>
  );
}
