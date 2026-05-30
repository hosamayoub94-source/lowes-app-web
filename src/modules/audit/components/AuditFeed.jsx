// =============================================================
// Audit — AuditFeed
// Scrollable log table with pagination and detail modal.
// =============================================================
import { memo, useState } from 'react';
import { cn } from '@utils/classNames';
import { AuditLogRow } from './AuditLogRow';
import { SeverityBadge } from './SeverityBadge';
import { ENTITY_META } from '../types/audit.types';

// ── Log Detail Modal ─────────────────────────────────────────
function LogDetailModal({ log, onClose }) {
  if (!log) return null;
  const entityMeta = ENTITY_META[log.entity_type] || { label: log.entity_type || '—', icon: '📄' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <SeverityBadge severity={log.severity} />
            <h3 className="font-semibold text-text">{log.action_label}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-text transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3 text-sm">
          <DetailRow label="التاريخ والوقت" value={
            new Date(log.created_at).toLocaleString('ar-SA-u-nu-latn', {
              year: 'numeric', month: 'long', day: 'numeric',
              hour: '2-digit', minute: '2-digit', second: '2-digit',
            })
          } />
          {log.user_name && <DetailRow label="المستخدم" value={log.user_name} />}
          {log.user_id   && <DetailRow label="معرف المستخدم" value={log.user_id} mono />}
          <DetailRow
            label="الكيان"
            value={log.entity_type
              ? `${entityMeta.icon} ${entityMeta.label}${log.entity_label ? ` — ${log.entity_label}` : ''}`
              : '—'
            }
          />
          {log.entity_id && <DetailRow label="معرف الكيان" value={log.entity_id} mono />}
          {log.ip_address && <DetailRow label="عنوان IP" value={log.ip_address} mono />}
          {log.session_id && <DetailRow label="معرف الجلسة" value={log.session_id} mono />}
          {log.device_info && <DetailRow label="الجهاز" value={log.device_info.slice(0, 80)} />}

          {/* Metadata */}
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                البيانات الإضافية
              </p>
              <pre className="bg-surface-alt rounded-lg p-3 text-xs text-text overflow-x-auto dir-ltr">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-muted w-32 flex-shrink-0 pt-0.5">{label}</span>
      <span className={cn('text-text break-all', mono && 'font-mono text-xs')}>
        {value}
      </span>
    </div>
  );
}

// ── Pagination ───────────────────────────────────────────────
const Pagination = memo(function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;

  const pages = [];
  const start = Math.max(1, page - 2);
  const end   = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-center gap-1 py-4">
      <PageBtn disabled={page === 1} onClick={() => onPage(page - 1)} label="‹" />
      {start > 1 && (
        <>
          <PageBtn label="1" onClick={() => onPage(1)} />
          <span className="px-1 text-muted">…</span>
        </>
      )}
      {pages.map((p) => (
        <PageBtn
          key={p} label={String(p)}
          active={p === page}
          onClick={() => onPage(p)}
        />
      ))}
      {end < totalPages && (
        <>
          <span className="px-1 text-muted">…</span>
          <PageBtn label={String(totalPages)} onClick={() => onPage(totalPages)} />
        </>
      )}
      <PageBtn disabled={page === totalPages} onClick={() => onPage(page + 1)} label="›" />
    </div>
  );
});

function PageBtn({ label, active, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
        active
          ? 'bg-teal text-white'
          : 'bg-surface text-muted hover:bg-border/30 disabled:opacity-40',
      )}
    >
      {label}
    </button>
  );
}

// ── Main component ───────────────────────────────────────────
/**
 * @param {object}   props
 * @param {object[]} props.logs
 * @param {boolean}  props.loading
 * @param {object}   props.pagination   — { page, pageSize, total }
 * @param {function} props.onPage
 */
export const AuditFeed = memo(function AuditFeed({ logs, loading, pagination, onPage }) {
  const [selected, setSelected] = useState(null);
  const totalPages = Math.max(1, Math.ceil((pagination?.total || 0) / (pagination?.pageSize || 50)));

  if (loading) {
    return (
      <div className="space-y-0 rounded-xl overflow-hidden border border-border">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0 animate-pulse">
            <div className="w-2 h-2 rounded-full bg-border/50" />
            <div className="w-28 h-3 rounded bg-border/50" />
            <div className="w-20 h-3 rounded bg-border/50" />
            <div className="flex-1 h-3 rounded bg-border/50" />
          </div>
        ))}
      </div>
    );
  }

  if (!logs?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted">
        <span className="text-4xl mb-3">📋</span>
        <p className="text-sm">لا توجد سجلات تطابق التصفية الحالية</p>
      </div>
    );
  }

  return (
    <>
      {/* Table — desktop */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm" dir="rtl">
          <thead>
            <tr className="bg-surface-alt border-b border-border">
              <th className="px-3 py-2 w-8" />
              <th className="px-3 py-2 text-xs font-semibold text-muted text-start">الوقت</th>
              <th className="px-3 py-2 text-xs font-semibold text-muted text-start">المستخدم</th>
              <th className="px-3 py-2 text-xs font-semibold text-muted text-start">الإجراء</th>
              <th className="px-3 py-2 text-xs font-semibold text-muted text-start">الكيان</th>
              <th className="px-3 py-2 text-xs font-semibold text-muted text-start">الخطورة</th>
            </tr>
          </thead>
          <tbody className="bg-surface">
            {logs.map((log) => (
              <AuditLogRow
                key={log.id}
                log={log}
                onClick={setSelected}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* List — mobile */}
      <div className="md:hidden rounded-xl border border-border overflow-hidden bg-surface">
        {logs.map((log) => (
          <AuditLogRow
            key={log.id}
            log={log}
            compact
            onClick={setSelected}
          />
        ))}
      </div>

      {/* Pagination */}
      <Pagination page={pagination?.page || 1} totalPages={totalPages} onPage={onPage} />

      {/* Detail modal */}
      {selected && <LogDetailModal log={selected} onClose={() => setSelected(null)} />}
    </>
  );
});
