// Lets KPI cards navigate (to another report tab or an existing screen)
// without every widget knowing about the router.
import { createContext, useContext } from 'react';

export const AnalyticsNavContext = createContext({ open: null });

/** @returns {{ open: null | ((metric:string)=>void) }} */
export const useAnalyticsNav = () => useContext(AnalyticsNavContext);
