// ليدز B2B — بند واحد بالقائمة لكل الدول (D-119). التبديل بين الدول من داخل الشاشة.
// كل دولة لها مسارها وصلاحيتها (ProtectedRoute لكل مسار كما هو)؛ هنا فقط: أي دول يراها المستخدم وأين يفتح البند.
import { enabledCountries } from '../../supabase/functions/_shared/countries.js';
import { ROUTES } from '../routes/paths.js';

export const COUNTRY_ROUTE = { SY: ROUTES.SYRIA_LEADS, AE: ROUTES.UAE_LEADS };
export const LAST_COUNTRY_KEY = 'lowes:b2b-leads:last-country';

/** الدول اللي يملك المستخدم صلاحيتها، بترتيب الإعداد المركزي. `can` = (permission) => boolean */
export function allowedLeadCountries(can) {
  return enabledCountries().filter((c) => c.leadsPermission && COUNTRY_ROUTE[c.code] && can(c.leadsPermission)).map((c) => c.code);
}

/** وين يفتح بند «ليدز B2B»: آخر دولة استعملها (إذا لسا مسموحة)، وإلا أول دولة مسموحة، وإلا الرئيسية. */
export function leadsEntryRoute(can, lastCountry) {
  const allowed = allowedLeadCountries(can);
  if (!allowed.length) return ROUTES.HOME;
  return COUNTRY_ROUTE[allowed.includes(lastCountry) ? lastCountry : allowed[0]];
}

export function readLastCountry() {
  try { return localStorage.getItem(LAST_COUNTRY_KEY); } catch { return null; }
}
export function saveLastCountry(code) {
  try { localStorage.setItem(LAST_COUNTRY_KEY, code); } catch { /* private mode */ }
}
