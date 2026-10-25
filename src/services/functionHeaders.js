// Headers for calling our own Edge Functions with fetch().
// Functions that spend money or change data now require a REAL signed-in session (audit F-07): the public credential alone
// is rejected, so callers must send the user's session credential, exactly as supabase.functions.invoke() does.
import { supabase } from './supabase';

export async function functionAuthHeaders(extra = {}) {
  let session = null;
  try {
    ({ data: { session } } = await supabase.auth.getSession());
  } catch { /* no storage / no session: the function will answer 401 */ }
  const bearer = session ? session.access_token : supabase.supabaseKey;
  return { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', ...extra };
}
