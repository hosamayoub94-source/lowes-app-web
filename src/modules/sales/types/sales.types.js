// =============================================================
// Daily Sales Report — Type definitions & constants
// =============================================================

export const REPORT_STATUS = {
  DRAFT:    'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
};

export const REPORT_STATUS_LABELS = {
  [REPORT_STATUS.DRAFT]:     'مسودة',
  [REPORT_STATUS.SUBMITTED]: 'مرسل',
  [REPORT_STATUS.APPROVED]:  'معتمد',
};

export const CHANNEL_TYPE = {
  WEBSITE:   'website',
  INSTAGRAM: 'instagram',
  TIKTOK:    'tiktok',
  STORE:     'store',
  WHATSAPP:  'whatsapp',
  OTHER:     'other',
};

export const CHANNEL_TYPE_LABELS = {
  [CHANNEL_TYPE.WEBSITE]:   'موقع',
  [CHANNEL_TYPE.INSTAGRAM]: 'إنستاغرام',
  [CHANNEL_TYPE.TIKTOK]:    'تيك توك',
  [CHANNEL_TYPE.STORE]:     'متجر',
  [CHANNEL_TYPE.WHATSAPP]:  'واتساب',
  [CHANNEL_TYPE.OTHER]:     'أخرى',
};

export const CHANNEL_ICONS = {
  [CHANNEL_TYPE.WEBSITE]:   '🌐',
  [CHANNEL_TYPE.INSTAGRAM]: '📸',
  [CHANNEL_TYPE.TIKTOK]:    '🎵',
  [CHANNEL_TYPE.STORE]:     '🏪',
  [CHANNEL_TYPE.WHATSAPP]:  '💬',
  [CHANNEL_TYPE.OTHER]:     '📦',
};

export const AD_PLATFORM = {
  META:    'meta',
  TIKTOK:  'tiktok',
  GOOGLE:  'google',
  SNAPCHAT: 'snapchat',
};

export const AD_PLATFORM_LABELS = {
  [AD_PLATFORM.META]:     'Meta',
  [AD_PLATFORM.TIKTOK]:   'TikTok',
  [AD_PLATFORM.GOOGLE]:   'Google',
  [AD_PLATFORM.SNAPCHAT]: 'Snapchat',
};

export const SALES_REALTIME_INTERVAL_MS = 30_000;

// ── Helpers ────────────────────────────────────────────────────────────────

export function calcROAS(revenue, adSpend) {
  if (!adSpend || adSpend === 0) return 0;
  return Number(revenue) / Number(adSpend);
}

export function calcCPA(adSpend, orders) {
  if (!orders || orders === 0) return 0;
  return Number(adSpend) / Number(orders);
}

export function formatROAS(roas) {
  return `${Number(roas).toFixed(2)}x`;
}

export function roasColor(roas) {
  if (roas >= 3) return 'text-green-600';
  if (roas >= 1.5) return 'text-yellow-600';
  return 'text-red-500';
}
