// =============================================================
// SyriaLeadsScreen — «ليدز سوريا B2B»
// قاعدة بيانات مرشحين B2B بسوريا (صيدليات/عيادات جلدية/مراكز تجميل/
// متاجر ومورّدي مستحضرات) لفريق المبيعات. البيانات البحثية (اسم/هاتف/
// Score/تحقّق) تُملأ من خارج التطبيق بمنهجية صارمة (بحث حقيقي + تحقق من
// مصدرين، لا اختلاق — راجع SYRIA_B2B_LEADS بمركز القيادة). هذه الشاشة
// تعرضها وتسمح بتحديث حالة التواصل فقط (status/notes/assigned_to).
// Table: syria_b2b_leads · Permission: VIEW_SYRIA_LEADS
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@hooks/useAuth';
import { listLeads, updateLeadStatus, STATUS_LABELS, tierGroup, waLink } from '@services/syriaLeadsService';

const STATUS_COLOR = {
  not_contacted:  'text-muted bg-surface-alt border-border',
  contacted:      'text-blue-600 bg-blue-50 border-blue-200',
  interested:     'text-green-600 bg-green-50 border-green-200',
  not_interested: 'text-red-500 bg-red-50 border-red-200',
  customer:       'text-purple-600 bg-purple-50 border-purple-200',
};

const TIER_LABEL = {
  ready: { label: '🟢 جاهز الآن',   color: 'text-green-600 bg-green-50 border-green-200' },
  check: { label: '🟡 يحتاج تأكيد', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  raw:   { label: '⚪ اكتشاف فقط',  color: 'text-muted bg-surface-alt border-border' },
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLOR[status] || STATUS_COLOR.not_contacted}`}>
      {STATUS_LABELS[status] || STATUS_LABELS.not_contacted}
    </span>
  );
}

function ContactActions({ lead }) {
  const wa = waLink(lead.whatsapp);
  return (
    <div className="flex flex-wrap gap-1.5">
      {wa && (
        <a href={wa} target="_blank" rel="noreferrer"
          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-green-50 border border-green-200 text-green-700">💬 واتساب</a>
      )}
      {lead.phone_tel && (
        <a href={lead.phone_tel}
          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-teal/10 border border-teal/30 text-teal">📞 اتصال</a>
      )}
      {lead.instagram_link && (
        <a href={lead.instagram_link} target="_blank" rel="noreferrer"
          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-surface-alt border border-border text-text">📷 إنستغرام</a>
      )}
      {lead.facebook && (
        <a href={lead.facebook} target="_blank" rel="noreferrer"
          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-surface-alt border border-border text-text">👍 فيسبوك</a>
      )}
      {!wa && !lead.phone_tel && !lead.instagram_link && !lead.facebook && (
        <span className="text-[11px] text-muted">لا وسيلة تواصل مباشرة</span>
      )}
    </div>
  );
}

function StatusEditor({ lead, myName, onSaved }) {
  const [status, setStatus] = useState(lead.status || 'not_contacted');
  const [notes, setNotes]   = useState(lead.notes || '');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setFlash] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateLeadStatus(lead.id, { status, notes, assigned_to: lead.assigned_to }, myName);
      setFlash(true);
      onSaved?.();
      setTimeout(() => setFlash(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  const touched = lead.status_updated_at
    ? `آخر تحديث: ${lead.status_updated_by || '—'} · ${new Date(lead.status_updated_at).toLocaleDateString('ar')}`
    : 'لم يُحدَّث بعد';

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2.5 mt-1" dir="rtl">
      <select
        value={status}
        onChange={e => setStatus(e.target.value)}
        className="text-xs font-bold bg-surface-alt border border-border rounded-lg px-2 py-1.5 text-text"
      >
        {Object.entries(STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <input
        type="text"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="ملاحظة (اختياري)"
        className="flex-1 min-w-[140px] text-xs bg-surface-alt border border-border rounded-lg px-2 py-1.5 text-text"
      />
      <button
        onClick={save}
        disabled={saving}
        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-teal text-navy disabled:opacity-50"
      >
        {saving ? '...' : savedFlash ? '✓ تم' : 'حفظ'}
      </button>
      <span className="text-[10px] text-muted w-full">{touched}</span>
    </div>
  );
}

function LeadCard({ lead, myName, onSaved, dense }) {
  return (
    <div className={`bg-surface border rounded-2xl p-4 space-y-2 ${lead.priority === 'A' || lead.priority === 'A+' ? 'border-green-300' : 'border-border'}`} dir="rtl">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="font-extrabold text-sm text-text">{lead.name}</p>
        <div className="flex gap-1.5 items-center">
          <span className="text-[10px] font-bold text-muted">Score {lead.score}</span>
          <StatusBadge status={lead.status} />
        </div>
      </div>
      <p className="text-xs text-muted">
        {[lead.province, lead.category, lead.district, lead.contact_person].filter(Boolean).join(' · ')}
      </p>
      {!dense && <ContactActions lead={lead} />}
      {dense && lead.status !== 'closed_or_uncertain' && <ContactActions lead={lead} />}
      {lead.reason && <p className="text-[11px] text-muted leading-relaxed">{lead.reason}</p>}
      <StatusEditor lead={lead} myName={myName} onSaved={onSaved} />
    </div>
  );
}

export default function SyriaLeadsScreen() {
  const { name } = useAuth();
  const [leads, setLeads]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]             = useState('');
  const [province, setProvince] = useState('all');
  const [tier, setTier]       = useState('all');
  const [status, setStatus]   = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try { setLeads(await listLeads()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const provinces = useMemo(() => Array.from(new Set(leads.map(l => l.province).filter(Boolean))).sort(), [leads]);

  const filtered = useMemo(() => leads.filter(l => {
    if (q) {
      const s = q.toLowerCase();
      if (!(l.name?.toLowerCase().includes(s) || l.district?.toLowerCase().includes(s) || l.category?.toLowerCase().includes(s))) return false;
    }
    if (province !== 'all' && l.province !== province) return false;
    if (tier !== 'all' && tierGroup(l.priority) !== tier) return false;
    if (status !== 'all' && (l.status || 'not_contacted') !== status) return false;
    return true;
  }), [leads, q, province, tier, status]);

  const ready = filtered.filter(l => tierGroup(l.priority) === 'ready');
  const check = filtered.filter(l => tierGroup(l.priority) === 'check');
  const raw   = filtered.filter(l => tierGroup(l.priority) === 'raw');
  const contactedCount = filtered.filter(l => (l.status || 'not_contacted') !== 'not_contacted').length;

  const Chip = ({ active, onClick, children }) => (
    <button
      onClick={onClick}
      className={`text-xs font-bold px-3 py-1.5 rounded-full border transition ${
        active ? 'bg-teal/10 border-teal text-teal' : 'border-border text-muted hover:text-text'
      }`}
    >{children}</button>
  );

  return (
    <div className="space-y-5 pb-6" dir="rtl">
      <div className="pt-1">
        <h1 className="text-2xl font-extrabold text-text">ليدز سوريا B2B</h1>
        <p className="text-xs text-muted mt-0.5">
          مرشحون محتملون (صيدليات/عيادات/مراكز تجميل/موزعين) — بحث حقيقي متعدد المصادر، لا بيانات مُختلَقة.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        {[
          { label: 'بالعرض الحالي', val: filtered.length },
          { label: 'جاهز الآن',     val: ready.length },
          { label: 'يحتاج تأكيد',   val: check.length },
          { label: 'تم تحديثهم',   val: contactedCount },
        ].map(s => (
          <div key={s.label} className="bg-surface-alt rounded-2xl px-2 py-3 text-center border border-border">
            <p className="text-lg font-extrabold text-text">{s.val}</p>
            <p className="text-[10px] font-bold text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <input
        type="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="دوّر باسم المحل أو المنطقة…"
        className="w-full bg-surface border border-border rounded-2xl px-4 py-2.5 text-sm text-text focus:outline-none focus:border-teal"
      />

      <div className="flex flex-wrap gap-1.5">
        <Chip active={province === 'all'} onClick={() => setProvince('all')}>كل المحافظات</Chip>
        {provinces.map(p => <Chip key={p} active={province === p} onClick={() => setProvince(p)}>{p}</Chip>)}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {['all', 'ready', 'check', 'raw'].map(t => (
          <Chip key={t} active={tier === t} onClick={() => setTier(t)}>
            {t === 'all' ? 'كل المستويات' : TIER_LABEL[t].label}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip active={status === 'all'} onClick={() => setStatus('all')}>كل الحالات</Chip>
        {Object.entries(STATUS_LABELS).map(([k, l]) => (
          <Chip key={k} active={status === k} onClick={() => setStatus(k)}>{l}</Chip>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-surface-alt animate-pulse rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm font-semibold">ولا نتيجة مطابقة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...ready, ...check, ...raw].map(l => (
            <LeadCard key={l.id} lead={l} myName={name} onSaved={load} dense={tierGroup(l.priority) === 'raw'} />
          ))}
        </div>
      )}
    </div>
  );
}
