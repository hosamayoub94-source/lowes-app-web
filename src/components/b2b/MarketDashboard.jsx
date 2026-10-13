// لوحة السوق — «دخول الأسواق وتوسيع القنوات»: أرقام مشتقّة من البيانات الموجودة فقط (b2bModel.marketDashboard).
// المراحل التي لا يمكن اشتقاقها اليوم تظهر «غير مُتتبَّعة» بدل أن نخترع لها رقماً (تحتاج حقل account_status — migration مقترحة).
import { useMemo } from 'react';
import { marketDashboard, STAGE_AR, PIPELINE, UNTRACKED_STAGES, ORG_TYPES } from '@services/b2bModel';
import { COUNTRIES, regionLabelAr, cityLabelAr } from '../../../supabase/functions/_shared/countries.js';

const Tile = ({ label, val, tone = 'default', onClick, testid }) => {
  const toneCls = tone === 'warn' ? 'border-amber-200 bg-amber-50' : tone === 'good' ? 'border-green-200 bg-green-50' : 'border-border bg-surface-alt';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} data-testid={testid}
      className={`rounded-2xl border px-2 py-3 text-center ${toneCls} ${onClick ? 'hover:border-teal cursor-pointer' : ''}`}>
      <p className="text-lg font-extrabold text-text">{val}</p>
      <p className="text-[10px] font-bold text-muted mt-0.5">{label}</p>
    </Tag>
  );
};

const Section = ({ title, children, hint }) => (
  <section className="bg-surface border border-border rounded-2xl p-4 space-y-2">
    <h3 className="text-sm font-extrabold text-text">{title}</h3>
    {hint && <p className="text-[11px] text-muted">{hint}</p>}
    {children}
  </section>
);

export default function MarketDashboard({ leads, country, onView }) {
  const C = COUNTRIES[country];
  const D = useMemo(() => marketDashboard(leads, country, C.regions), [leads, country, C.regions]);
  const maxStage = Math.max(1, ...Object.values(D.stages));
  const bare = C.regionLabel.replace(/^ال/, ''); // «الإمارة» -> «إمارة» للعبارات مثل «لأي إمارة»
  const covered = D.regions.rows.filter((r) => r.total > 0);
  const channelStateAr = { no_leads: 'لم نكتشف أحداً', not_present: 'لسنا موجودين', present: 'موجودون' };
  const channelTone = { no_leads: 'text-muted bg-surface-alt border-border', not_present: 'text-amber-700 bg-amber-50 border-amber-200', present: 'text-green-700 bg-green-50 border-green-200' };

  return (
    <div className="space-y-4" data-testid="market-dashboard">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Tile label="إجمالي الجهات" val={D.total} />
        <Tile label="فرص فتح حساب (منصات/سلاسل)" val={D.accountOpening} />
        <Tile label="مؤهَّلة / جاهزة للتواصل" val={D.qualified} />
        <Tile label="قيد التواصل" val={D.inContact} />
        <Tile label="حسابات مفتوحة/نشطة" val={D.live} tone="good" />
        <Tile label="وصلنا لأول طلب" val={D.firstOrder} tone="good" />
        <Tile label="تحتاج متابعة" val={D.followUp} tone={D.followUp ? 'warn' : 'default'} onClick={() => onView?.('follow_up')} testid="tile-followup" />
        <Tile label="بلا مسؤول" val={D.unownedTotal} tone={D.unownedTotal ? 'warn' : 'default'} onClick={() => onView?.('no_owner')} />
        <Tile label="بلا مصدر مسجّل" val={D.noSource} tone={D.noSource ? 'warn' : 'default'} />
        <Tile label="بلا جهة اتصال" val={D.noContact} tone={D.noContact ? 'warn' : 'default'} onClick={() => onView?.('no_contact')} />
        <Tile label={`بيانات قديمة (${D.stalePct}%)`} val={D.stale} tone={D.stale ? 'warn' : 'default'} onClick={() => onView?.('stale')} />
        <Tile label="غير متحقَّق منها" val={D.weakSource} tone={D.weakSource ? 'warn' : 'default'} onClick={() => onView?.('unverified')} />
      </div>

      <Section title="مسار فتح الحساب (Pipeline) — عرض مشتق، غير محفوظ" hint="الأرقام مشتقّة من حالة التواصل + تواجد Lowe's. المراحل الرمادية غير مُتتبَّعة بعد — تحتاج حقل «حالة الحساب» (migration مقترحة، لم تُطبَّق).">
        <ul className="space-y-1" data-testid="pipeline">
          {PIPELINE.map((s) => {
            const untracked = UNTRACKED_STAGES.includes(s);
            return (
              <li key={s} className="flex items-center gap-2 text-xs" data-stage={s}>
                <span className={`w-36 shrink-0 font-bold ${untracked ? 'text-muted' : 'text-text'}`}>{STAGE_AR[s]}</span>
                {untracked ? (
                  <span className="text-[10px] text-muted border border-dashed border-border rounded-full px-2 py-0.5">غير مُتتبَّعة بعد</span>
                ) : (
                  <>
                    <span className="flex-1 h-2 rounded-full bg-surface-alt overflow-hidden"><span className="block h-full bg-teal" style={{ width: `${(D.stages[s] / maxStage) * 100}%` }} /></span>
                    <span className="w-8 text-left font-extrabold text-text">{D.stages[s]}</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={`التغطية — ${C.regionPlural}`} hint={`${D.regions.covered} من ${D.regions.total} ${C.regionPlural} فيها جهات. «${C.nationwideLabel}» تُعدّ منفصلة ولا تدخل في أي ${bare}.`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="region-table">
            <thead><tr className="text-muted text-right"><th className="py-1 font-bold">{C.regionLabel}</th><th className="font-bold">الجهات</th><th className="font-bold">قنوات</th><th className="font-bold">محلية</th><th className="font-bold">تواصلنا</th><th className="font-bold">موجودون</th><th className="font-bold">مدن/أحياء</th></tr></thead>
            <tbody>
              {covered.sort((a, b) => b.total - a.total).map((r) => (
                <tr key={r.region} className="border-t border-border">
                  <td className="py-1 font-bold">{regionLabelAr(country, r.region)}</td><td>{r.total}</td><td>{r.channel}</td><td>{r.local}</td><td>{r.contacted}</td><td>{r.live}</td>
                  <td className="text-muted">{[...r.cities.map((c) => cityLabelAr(country, c)), ...r.districts].slice(0, 4).join('، ') || '—'}</td>
                </tr>
              ))}
              <tr className="border-t border-border bg-surface-alt/60"><td className="py-1 font-bold">{C.nationwideLabel}</td><td>{D.regions.nationwide}</td><td colSpan={5} className="text-muted">لا تُحسب لأي {bare}</td></tr>
            </tbody>
          </table>
        </div>
        {D.regions.uncovered.length > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2" data-testid="uncovered-regions">
            بلا أي جهة: {D.regions.uncovered.map((r) => regionLabelAr(country, r)).join('، ')}
          </p>
        )}
        {D.regions.unknownRegion.length > 0 && <p className="text-[11px] text-red-600">{D.regions.unknownRegion.length} جهة بقيمة {C.regionLabel} غير معروفة — راجعها.</p>}
      </Section>

      <Section title="القنوات المستهدفة" hint="غياب جهة عن القائمة ≠ غيابها عن السوق؛ «لم نكتشف أحداً» يعني لم نبحث/لم نجد بعد.">
        <div className="flex flex-wrap gap-1.5" data-testid="channel-coverage">
          {D.channels.map((c) => (
            <span key={c.type} className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${channelTone[c.state]}`}>
              {ORG_TYPES[c.type].icon} {c.ar}: {channelStateAr[c.state]}{c.discovered ? ` (${c.discovered})` : ''}
            </span>
          ))}
        </div>
      </Section>

      {D.sellerPlatformsGap.length > 0 && (
        <Section title="تقبل بائعين ولسنا عليها بعد" hint="أسرع طريق للتواجد — لكن «تقبل بائعين» لا تعني قبول منتجات Lowe's: الفئة والمستندات تُتحقق منفصلة.">
          <ul className="space-y-1">{D.sellerPlatformsGap.slice(0, 8).map((l) => <li key={l.id} className="text-xs"><b>{l.name}</b> <span className="text-muted">· {regionLabelAr(country, l.province)}</span></li>)}</ul>
        </Section>
      )}

      {D.chains.length > 0 && (
        <Section title="سلاسل محتملة (مشتقّة من الأسماء/المواقع)" hint="تجميع مؤقت حتى يُضاف حقل «الجهة الأم» — راجعه يدوياً قبل الاعتماد.">
          <ul className="space-y-1" data-testid="chains">{D.chains.map((g) => <li key={g.key} className="text-xs"><b>{g.name}</b> <span className="text-muted">· {g.members.length} فروع مسجّلة · {g.regions.map((r) => regionLabelAr(country, r)).join('، ')}</span></li>)}</ul>
        </Section>
      )}
    </div>
  );
}
