// =============================================================
// AccountStatement — كشف حركة حساب (محفظة أو قناة) كنافذة منبثقة.
//   يُفتح عند النقر على محفظة في TreasuryPanel أو قناة في ChannelPnL.
//   يعرض: كل القيود وارد/صادر + رصيد جارٍ لكل عملة + فلترة تاريخ/بحث + تصدير.
// =============================================================
import { useMemo, useState } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@components/ui/Modal';
import { CCY } from './sourceBreakdown.logic.js';
import {
  walletStatementRows,
  channelStatementRows,
  buildStatement,
  statementHasCurrency,
} from './accountStatement.logic.js';
import { ENTRY_TYPE_LABELS, ENTRY_TYPE_ICONS } from '../types/accounting.types.js';

const fmtNum = (n, c) => `${c.sym}${Number(n).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: c.maxFrac })}`;

// خلية مبلغ متعدّد العملات (تعرض غير الصفر فقط).
function MoneyCell({ amounts, cols, tone = '' }) {
  const lines = cols.map(c => ({ c, v: amounts[c.key] || 0 })).filter(x => x.v);
  if (!lines.length) return <span className="text-muted">—</span>;
  return (
    <div className="space-y-0.5">
      {lines.map(({ c, v }) => (
        <div key={c.key} className={`font-mono text-xs font-semibold ${tone}`}>{fmtNum(v, c)}</div>
      ))}
    </div>
  );
}

// خلية الرصيد الجاري (موجب أخضر / سالب أحمر لكل عملة).
function BalanceCell({ amounts, cols }) {
  const lines = cols.map(c => ({ c, v: amounts[c.key] || 0 }));
  return (
    <div className="space-y-0.5">
      {lines.map(({ c, v }) => (
        <div key={c.key} className={`font-mono text-xs font-bold ${v >= 0 ? 'text-text' : 'text-red-500'}`}>
          {v < 0 ? '−' : ''}{c.sym}{Math.abs(v).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: c.maxFrac })}
        </div>
      ))}
    </div>
  );
}

async function exportStatement(rows, cols, title) {
  const XLSX = await import('xlsx');
  const data = rows.map(r => {
    const row = {
      'التاريخ': r.date,
      'النوع': ENTRY_TYPE_LABELS[r.entry_type] ?? r.entry_type,
      'الوصف': r.description,
      'الفئة / المصدر': r.category,
    };
    for (const c of cols) {
      row[`وارد ${c.sym}`]   = r.in[c.key] || 0;
      row[`صادر ${c.sym}`]   = r.out[c.key] || 0;
      row[`الرصيد ${c.sym}`] = r.balance[c.key] || 0;
    }
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'كشف الحركة');
  const safe = String(title).replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40);
  XLSX.writeFile(wb, `statement-${safe || 'account'}.xlsx`);
}

/**
 * @param {object}   props
 * @param {boolean}  props.open
 * @param {Function} props.onClose
 * @param {string}   props.title       اسم الحساب المعروض (مع الأيقونة)
 * @param {'wallet'|'channel'} props.kind
 * @param {Array}    props.entries     القيود التي يُبنى منها الكشف
 * @param {object}   [props.wallet]    لكشف المحفظة
 * @param {string}   [props.channelId] لكشف قناة مُدارة
 * @param {string}   [props.categoryKey] لكشف مصدر بلا قناة (اسم الفئة)
 */
export default function AccountStatement({
  open, onClose, title, kind, entries = [], wallet = null, channelId = null, categoryKey = null,
}) {
  const [from, setFrom]   = useState('');
  const [to, setTo]       = useState('');
  const [query, setQuery] = useState('');

  const baseRows = useMemo(() => {
    if (!open) return [];
    return kind === 'wallet'
      ? walletStatementRows(entries, wallet)
      : channelStatementRows(entries, { channelId, categoryKey });
  }, [open, kind, entries, wallet, channelId, categoryKey]);

  const { rows, totals } = useMemo(
    () => buildStatement(baseRows, { from: from || null, to: to || null, query }),
    [baseRows, from, to, query],
  );

  // الأعمدة الظاهرة = العملات التي لها أي حركة (محفظة = عملة واحدة عادةً).
  const cols = useMemo(() => {
    const active = CCY.filter(c => statementHasCurrency(totals, c.key));
    if (active.length) return active;
    return wallet ? CCY.filter(c => c.key === wallet.amtField) : CCY;
  }, [totals, wallet]);

  const hasFilter = from || to || query;

  return (
    <Modal open={open} onClose={onClose} size="full">
      <ModalHeader
        title={`📑 كشف حركة — ${title}`}
        subtitle={kind === 'wallet' ? 'كل القيود الواردة والصادرة على هذه المحفظة' : 'كل القيود الواردة والصادرة عبر هذه القناة'}
        onClose={onClose}
      />

      {/* شريط الفلاتر */}
      <div className="px-5 pt-4 flex flex-wrap items-end gap-3 border-b border-border pb-4">
        <div>
          <label className="text-xs text-muted mb-1 block">من تاريخ</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" />
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">إلى تاريخ</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="text-xs text-muted mb-1 block">بحث</label>
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="ابحث في الوصف أو الفئة…"
            className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" />
        </div>
        {hasFilter && (
          <button onClick={() => { setFrom(''); setTo(''); setQuery(''); }}
            className="px-3 py-2 rounded-xl border border-border text-sm text-muted hover:text-text transition">
            مسح
          </button>
        )}
      </div>

      <ModalBody className="p-0">
        {rows.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-2">📭</div>
            <p className="text-muted text-sm">لا توجد حركات {hasFilter ? 'ضمن هذا الفلتر' : 'على هذا الحساب'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-cream z-10">
                <tr className="text-xs text-muted">
                  <th className="py-2 px-3 text-right">التاريخ</th>
                  <th className="py-2 px-3 text-right">النوع</th>
                  <th className="py-2 px-3 text-right">الوصف</th>
                  <th className="py-2 px-3 text-center">⬇️ وارد</th>
                  <th className="py-2 px-3 text-center">⬆️ صادر</th>
                  <th className="py-2 px-3 text-center">الرصيد الجاري</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-border hover:bg-cream/50 transition align-top">
                    <td className="py-2.5 px-3 text-xs text-muted whitespace-nowrap">{r.date || '—'}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="text-xs font-semibold">{ENTRY_TYPE_ICONS[r.entry_type]} {ENTRY_TYPE_LABELS[r.entry_type] ?? r.entry_type}</span>
                    </td>
                    <td className="py-2.5 px-3 max-w-xs">
                      <p className="text-text text-sm leading-tight">{r.description || '—'}</p>
                      {r.category && <p className="text-[10px] text-muted mt-0.5">{r.category}</p>}
                    </td>
                    <td className="py-2.5 px-3 text-center"><MoneyCell amounts={r.in}  cols={cols} tone="text-green-600" /></td>
                    <td className="py-2.5 px-3 text-center"><MoneyCell amounts={r.out} cols={cols} tone="text-red-500" /></td>
                    <td className="py-2.5 px-3 text-center"><BalanceCell amounts={r.balance} cols={cols} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-cream text-xs font-bold align-top">
                  <td className="py-2 px-3 text-muted" colSpan={3}>الإجمالي ({totals.count} حركة)</td>
                  <td className="py-2 px-3 text-center"><MoneyCell amounts={totals.in}  cols={cols} tone="text-green-600" /></td>
                  <td className="py-2 px-3 text-center"><MoneyCell amounts={totals.out} cols={cols} tone="text-red-500" /></td>
                  <td className="py-2 px-3 text-center"><BalanceCell amounts={totals.net} cols={cols} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <button
          onClick={() => exportStatement(rows, cols, title)}
          disabled={rows.length === 0}
          className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-text hover:bg-cream transition disabled:opacity-40">
          ⬇️ تصدير Excel
        </button>
        <button onClick={onClose}
          className="px-4 py-2 rounded-xl bg-teal text-navy text-sm font-semibold hover:bg-teal/90 transition">
          إغلاق
        </button>
      </ModalFooter>
    </Modal>
  );
}
