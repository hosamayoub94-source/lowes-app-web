// =============================================================
// useToast — convenience accessor over the toast store.
// Returns a STABLE object reference so consumers can put `toast`
// in useEffect dependency arrays without causing render loops.
// Each underlying action is already stable in Zustand — we just
// memoize the wrapping object to preserve identity across renders.
// =============================================================
import { useMemo } from 'react';
import { useToastStore } from '@stores/toastStore';

export function useToast() {
  const show = useToastStore((s) => s.show);
  const success = useToastStore((s) => s.success);
  const error = useToastStore((s) => s.error);
  const info = useToastStore((s) => s.info);
  const warning = useToastStore((s) => s.warning);
  const dismiss = useToastStore((s) => s.dismiss);
  return useMemo(
    () => ({ show, success, error, info, warning, dismiss }),
    [show, success, error, info, warning, dismiss],
  );
}

export default useToast;
