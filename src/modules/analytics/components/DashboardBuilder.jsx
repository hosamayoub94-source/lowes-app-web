// =============================================================
// Analytics — DashboardBuilder
// Widget layout the user can customise (drag OR the move buttons — keyboard
// friendly) and hide. Columns follow the viewport so nothing overflows on a phone.
// =============================================================
import { memo, useState, useCallback } from 'react';
import { useWidgets } from '../hooks/useAnalytics';
import useAnalyticsStore from '../store/useAnalyticsStore';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { WIDGET_TYPE } from '../types/analytics.types';
import StatCard       from './StatCard';
import TrendChart     from './TrendChart';
import BarChartWidget from './BarChartWidget';
import DonutChart     from './DonutChart';
import ActivityFeed   from './ActivityFeed';
import HeatmapWidget  from './HeatmapWidget';
import ProgressWidget from './ProgressWidget';
import KPIAlertCard   from './KPIAlertCard';

function resolveWidget(widget) {
  const { widget_type, config = {}, title } = widget;
  const shared = { title, style: { height: '100%' } };

  switch (widget_type) {
    case WIDGET_TYPE.STAT_CARD:     return <StatCard      metric={config.metric}  {...shared} />;
    case WIDGET_TYPE.TREND_CHART:   return <TrendChart    metric={config.metric}  {...shared} />;
    case WIDGET_TYPE.BAR_CHART:     return <BarChartWidget metric={config.metric} {...shared} />;
    case WIDGET_TYPE.DONUT_CHART:   return <DonutChart    metrics={config.metrics ?? []} {...shared} />;
    case WIDGET_TYPE.ACTIVITY_FEED: return <ActivityFeed  limit={config.limit}    {...shared} />;
    case WIDGET_TYPE.HEATMAP:       return <HeatmapWidget metric={config.metric}  {...shared} />;
    case WIDGET_TYPE.PROGRESS:      return <ProgressWidget metrics={config.metrics ?? []} {...shared} />;
    case WIDGET_TYPE.KPI_ALERT:     return <KPIAlertCard  {...shared} />;
    default:
      return <div className="text-muted" style={{ padding: 16, fontSize: 12 }}>نوع widget غير معروف: {widget_type}</div>;
  }
}

const widgetKey = (w, idx) => w.id ?? w.sort_order ?? `w-${idx}`;

function DashboardBuilder({ editable = false, style = {} }) {
  const widgets = useWidgets();
  const saveWidgets = useAnalyticsStore((s) => s.saveWidgets);
  const isXl = useMediaQuery('(min-width: 1280px)');
  const isSm = useMediaQuery('(min-width: 640px)');
  const cols = isXl ? 4 : isSm ? 2 : 1;

  const [editMode, setEditMode] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  const persist = useCallback(async (next) => {
    setSaving(true);
    const res = await saveWidgets(next);
    setSaving(false);
    setSaveMsg(res?.ok ? null : (res?.reason || 'لم يُحفظ التخطيط على الخادم — التغيير مؤقت لهذه الجلسة.'));
  }, [saveWidgets]);

  const move = useCallback((id, delta) => {
    const arr = [...widgets];
    const from = arr.findIndex((w, i) => widgetKey(w, i) === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= arr.length) return;
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    persist(arr);
  }, [widgets, persist]);

  const handleDrop = useCallback((e, targetId) => {
    e.preventDefault();
    if (!dragging || dragging === targetId) return;
    const arr = [...widgets];
    const from = arr.findIndex((w, i) => widgetKey(w, i) === dragging);
    const to = arr.findIndex((w, i) => widgetKey(w, i) === targetId);
    if (from < 0 || to < 0) return;
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    persist(arr);
    setDragging(null);
  }, [dragging, widgets, persist]);

  const toggleVisibility = useCallback((id) => {
    persist(widgets.map((w, i) => (widgetKey(w, i) === id ? { ...w, is_visible: !w.is_visible } : w)));
  }, [widgets, persist]);

  const hidden = widgets.filter((w) => w.is_visible === false);
  const visible = widgets.filter((w) => w.is_visible !== false);

  const btn = { padding: '8px 14px', minHeight: 40, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' };

  return (
    <div style={{ ...style }}>
      {editable && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {saving && <span className="text-muted" style={{ fontSize: 12 }}>جارٍ الحفظ…</span>}
          {saveMsg && <span role="alert" style={{ fontSize: 12, color: '#d97706' }}>{saveMsg}</span>}
          <button
            type="button"
            aria-pressed={editMode}
            onClick={() => setEditMode((v) => !v)}
            className="text-text"
            style={{ ...btn, border: editMode ? '1.5px solid #3b82f6' : '1px solid rgb(var(--color-border) / 0.25)', background: editMode ? '#3b82f622' : 'transparent' }}
          >
            {editMode ? 'إنهاء التخصيص' : '⚙ تخصيص اللوحة'}
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 16 }}>
        {visible.map((widget, idx) => {
          const id = widgetKey(widget, idx);
          return (
            <div
              key={id}
              style={{
                gridColumn: `span ${Math.min(widget.width ?? 1, cols)}`,
                position: 'relative', minWidth: 0,
                opacity: dragging === id ? 0.5 : 1, transition: 'opacity 0.15s',
              }}
              draggable={editMode}
              onDragStart={editMode ? (e) => { setDragging(id); e.dataTransfer.effectAllowed = 'move'; } : undefined}
              onDragOver={editMode ? (e) => e.preventDefault() : undefined}
              onDrop={editMode ? (e) => handleDrop(e, id) : undefined}
            >
              {resolveWidget(widget)}

              {editMode && (
                <div className="bg-surface" style={{ position: 'absolute', inset: 0, opacity: 0.94, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', padding: 8 }}>
                  <button type="button" className="border border-border text-text" style={btn} onClick={() => move(id, -1)} aria-label={`تقديم ${widget.title ?? 'العنصر'}`}>↑ تقديم</button>
                  <button type="button" className="border border-border text-text" style={btn} onClick={() => move(id, 1)} aria-label={`تأخير ${widget.title ?? 'العنصر'}`}>↓ تأخير</button>
                  <button type="button" className="border border-border" style={{ ...btn, color: '#dc2626' }} onClick={() => toggleVisibility(id)} aria-label={`إخفاء ${widget.title ?? 'العنصر'}`}>إخفاء</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editMode && hidden.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="text-muted" style={{ fontSize: 12, marginBottom: 6 }}>عناصر مخفية:</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {hidden.map((w, i) => (
              <button key={widgetKey(w, i)} type="button" className="border border-border text-text" style={btn} onClick={() => toggleVisibility(widgetKey(w, i))}>
                إظهار «{w.title ?? w.widget_type}»
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(DashboardBuilder);
