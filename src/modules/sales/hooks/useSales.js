// =============================================================
// Sales — Selector & compound hooks
// =============================================================
import { useEffect } from 'react';
import useSalesStore from '../store/useSalesStore.js';

export const useSalesReports     = () => useSalesStore(s => s.reports);
export const useSalesChannels    = () => useSalesStore(s => s.channels);
export const useSalesCampaigns   = () => useSalesStore(s => s.campaigns);
export const useChannelResults   = () => useSalesStore(s => s.channelResults);
export const useAdResults        = () => useSalesStore(s => s.adResults);
export const useSelectedReportId = () => useSalesStore(s => s.selectedReportId);
export const useSalesFilters     = () => useSalesStore(s => s.filters);
export const useSalesLoading     = () => useSalesStore(s => s.loading);
export const useSalesError       = () => useSalesStore(s => s.error);

export const useSalesKPIs = () => useSalesStore(s => s.getDashboardKPIs());
export const useSelectedReport = () => useSalesStore(s => s.reports.find(r => r.id === s.selectedReportId) ?? null);
export const usePendingReports = () => useSalesStore(s => s.reports.filter(r => r.status === 'submitted'));

export const useSalesActions = () =>
  useSalesStore(s => ({
    loadReports:        s.loadReports,
    createReport:       s.createReport,
    updateReport:       s.updateReport,
    submitReport:       s.submitReport,
    approveReport:      s.approveReport,
    deleteReport:       s.deleteReport,
    selectReport:       s.selectReport,
    loadChannels:       s.loadChannels,
    loadCampaigns:      s.loadCampaigns,
    createAdResult:     s.createAdResult,
    createChannelResult:s.createChannelResult,
    setFilters:         s.setFilters,
    clearError:         s.clearError,
  }));

export function useSalesBootstrap(userId) {
  const init     = useSalesStore(s => s.init);
  const teardown = useSalesStore(s => s.teardown);
  useEffect(() => {
    if (userId) init(userId);
    return () => teardown();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useSalesDashboard() {
  const reports = useSalesReports();
  const kpis    = useSalesKPIs();
  const loading = useSalesLoading();
  return { reports, kpis, isLoading: loading.reports };
}

export function useReportDetail() {
  const report         = useSelectedReport();
  const channelResults = useChannelResults();
  const adResults      = useAdResults();
  const loading        = useSalesLoading();
  return { report, channelResults, adResults, isLoading: loading.detail };
}
