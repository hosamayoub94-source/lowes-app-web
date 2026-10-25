// =============================================================
// Tasks — links to ABOS objects: project (P##), decision (D-###), KPI.
// Pure, no aliases.
//
// Source of the lists: ABOS 05_Project_Portfolio.md (P05 was dropped
// officially on 1 Aug 2026 and is NOT offered) and 01_Command_Center.md
// § Company Scorecard. ABOS is the source of truth — if it changes, update
// these constants, not the other way round.
//
// Storage: real columns (project_code / decision_ref / kpi_key) once the
// migration is applied; BEFORE that the same data rides in `tags` as
// `P02` / `D-140` / `KPI:orders`, so nothing is lost and the migration can
// backfill from tags.
// =============================================================

export const ABOS_PROJECTS = [
  { code: 'P01', name: 'داتا المعرض → صفقات' },
  { code: 'P02', name: 'شبكة النجوم 76→1,000' },
  { code: 'P03', name: 'توزيع سوريا (B2B)' },
  { code: 'P04', name: 'منصات أونلاين سورية' },
  { code: 'P06', name: 'المندوبون العلميون' },
  { code: 'P07', name: 'La Rovén Iséra' },
  { code: 'P08', name: 'إطلاق @lowes_profesyonel' },
  { code: 'P09', name: 'نمو المبيعات (Meta)' },
  { code: 'P10', name: 'واتساب الرسمي' },
  { code: 'P11', name: 'قاعدة صناع المحتوى' },
];

export const KPI_OPTIONS = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'orders', label: 'Orders' },
  { key: 'customers', label: 'Customers' },
  { key: 'retention', label: 'Retention' },
  { key: 'expansion', label: 'Expansion' },
];

const P_RE = /^P\d{2}$/;
const D_RE = /^D-\d{3,4}$/;
const KPI_PREFIX = 'KPI:';
const KPI_KEYS = new Set(KPI_OPTIONS.map((k) => k.key));
const PROJECT_CODES = new Set(ABOS_PROJECTS.map((p) => p.code));

export const isProjectCode = (v) => P_RE.test(String(v || ''));
export const isDecisionRef = (v) => D_RE.test(String(v || '').trim().toUpperCase());
export const normalizeDecisionRef = (v) => String(v || '').trim().toUpperCase();
export const projectLabel = (code) => ABOS_PROJECTS.find((p) => p.code === code)?.name || null;
export const kpiLabel = (key) => KPI_OPTIONS.find((k) => k.key === key)?.label || null;

const isLinkTag = (t) => P_RE.test(t) || D_RE.test(t) || String(t).startsWith(KPI_PREFIX);

/** project_code / decision_ref / kpi_key — columns first, tags as fallback. */
export function readLinks(task) {
  const tags = Array.isArray(task?.tags) ? task.tags : [];
  const fromTags = {
    project_code: tags.find((t) => P_RE.test(t) && PROJECT_CODES.has(t)) || null,
    decision_ref: tags.find((t) => D_RE.test(t)) || null,
    kpi_key: (() => {
      const t = tags.find((x) => String(x).startsWith(KPI_PREFIX));
      const k = t ? t.slice(KPI_PREFIX.length) : null;
      return k && KPI_KEYS.has(k) ? k : null;
    })(),
  };
  return {
    project_code: task?.project_code || fromTags.project_code,
    decision_ref: task?.decision_ref || fromTags.decision_ref,
    kpi_key: task?.kpi_key || fromTags.kpi_key,
  };
}

/** tags array with the link tags replaced by the given links (other tags untouched). */
export function applyLinksToTags(tags, links) {
  const rest = (Array.isArray(tags) ? tags : []).filter((t) => !isLinkTag(t));
  const next = [...rest];
  if (links?.project_code && PROJECT_CODES.has(links.project_code)) next.push(links.project_code);
  if (links?.decision_ref && isDecisionRef(links.decision_ref)) next.push(normalizeDecisionRef(links.decision_ref));
  if (links?.kpi_key && KPI_KEYS.has(links.kpi_key)) next.push(KPI_PREFIX + links.kpi_key);
  return next;
}

/** Tags worth showing as ordinary chips (link tags are shown as links). */
export const plainTags = (tags) => (Array.isArray(tags) ? tags : []).filter((t) => !isLinkTag(t));
