// =============================================================
// Analytics — DashboardBuilder
// Drag-and-drop widget layout editor. Saves layout to store.
// Uses CSS Grid; no heavy DnD library required for MVP.
// =============================================================
import { memo, useState, useCallback } from 'react';
import { useWidgets, useSaveWidgets } from '../hooks/useAnalytics';
import { WIDGET_TYPE, KPI_LABELS } from '../types/analytics.types';
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
    case WIDGET_TYPE.STAT_CARD:     return <StatCard     metric={config.metric}  {...shared} />;
    case WIDGET_TYPE.TREND_CHART:   return <TrendChart   metric={config.metric}  {...shared} />;
    case WIDGET_TYPE.BAR_CHART:     return <BarChartWidget metric={config.metric} {...shared} />;
    case WIDGET_TYPE.DONUT_CHART:   return <DonutChart   metrics={config.metrics ?? []} {...shared} />;
    case WIDGET_TYPE.ACTIVITY_FEED: return <ActivityFeed limit={config.limit}   {...shared} />;
    case WIDGET_TYPE.HEATMAP:       return <HeatmapWidget metric={config.metric} {...shared} />;
    case WIDGET_TYPE.PROGRESS:      return <ProgressWidget metrics={config.metrics ?? []} {...shared} />;
    case WIDGET_TYPE.KPI_ALERT:     return <KPIAlertCard {...shared} />;
    default:
      return <div style={{ padding: 16, color: '#64748b', fontSize: 12 }}>نوع widget غير معروف: {widget_type}</div>;
  }
}

function DashboardBuilder({ editable = false, style = {} }) {
  const widgets     = useWidgets();
  const saveWidgets = useSaveWidgets();
  const [editMode,  setEditMode]  = useState(false);
  const [dragging,  setDragging]  = useState(null);  // widget id being dragged
  const [saving,    setSaving]    = useState(false);

  const handleDragStart = useCallback((e, widgetId) => {
    setDragging(widgetId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDrop = useCallback((e, targetId) => {
    e.preventDefault();
    if (!dragging || dragging === targetId) return;
    const arr     = [...widgets];
    const fromIdx = arr.findIndex((w) => (w.id ?? w.sort_order) === dragging);
    const toIdx   = arr.findIndex((w) => (w.id ?? w.sort_order) === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    saveWidgets(arr);
    setDragging(null);
  }, [dragging, widgets, saveWidgets]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    await saveWidgets(widgets);
    setSaving(false);
    setEditMode(false);
  }, [widgets, saveWidgets]);

  const toggleVisibility = useCallback((widgetId) => {
    const next = widgets.map((w) =>
      (w.id ?? w.sort_order) === widgetId ? { ...w, is_visible: !w.is_visible } : w,
    );
    saveWidgets(next);
  }, [widgets, saveWidgets]);

  const visibleWidgets = widgets.filter((w) => w.is_visible !== false);

  return (
    <div style={{ ...style }}>
      {/* Toolbar */}
      {editable && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => setEditMode((e) => !e)}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: editMode ? '1.5px solid #3b82f6' : '1px solid #334155',
              background: editMode ? '#3b82f622' : 'transparent',
              color: editMode ? '#3b82f6' : '#94a3b8',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {editMode ? '✕ إلغاء' : '⚙ تخصيص'}
          </button>
          {editMode && (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                background: '#3b82f6',
                color: '#fff',
                fontSize: 12,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'جارٍ الحفظ…' : 'حفظ التخطيط'}
            </button>
          )}
        </div>
      )}

      {/* Widget grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {visibleWidgets.map((widget, idx) => {
          // مفتاح مستقر دائماً — يتراجع للفهرس لو غاب id/sort_order (يمنع تحذير React key)
          const id = widget.id ?? widget.sort_order ?? `w-${idx}`;
          return (
            <div
              key={id}
              style={{
                gridColumn: `span ${widget.width ?? 1}`,
                gridRow:    `span ${widget.height ?? 1}`,
                position:   'relative',
                opacity:    dragging === id ? 0.5 : 1,
                transition: 'opacity 0.15s',
              }}
              draggable={editMode}
              onDragStart={editMode ? (e) => handleDragStart(e, id) : undefined}
              onDragOver={editMode ? (e) => e.preventDefault() : undefined}
              onDrop={editMode ? (e) => handleDrop(e, id) : undefined}
            >
              {resolveWidget(widget)}

              {/* Edit mode overlay */}
              {editMode && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: '#0f172acc',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'grab',
                }}>
                  <span style={{ color: '#94a3b8', fontSize: 20 }}>⠿</span>
                  <button
                    onClick={() => toggleVisibility(id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid #334155',
                      background: '#1e293b',
                      color: '#ef4444',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    إخفاء
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(DashboardBuilder);
