/**
 * PipelineKanban — drag-and-drop Kanban board for deals.
 * Task #69/#8: Full mobile-first Tailwind rewrite.
 *
 * Drag strategy:
 *   • Desktop (mouse):   HTML5 DnD — native, no deps
 *   • Mobile (touch):    Pointer Events — global move/up listeners,
 *                        elementFromPoint for drop target, floating ghost tile
 *
 * Layout:
 *   • Horizontal scroll + momentum on mobile (overflow-x-auto + touch-pan-x)
 *   • Cards get touch-none so individual card touches don't trigger column pan
 *   • data-stage-id attribute on each column for efficient hit testing
 */
import React, { useState, useCallback, useRef } from 'react';
import { cn } from '@utils/classNames';
import DealCard from './DealCard.jsx';
import { formatCurrency } from '../types/crm.types.js';

// ── Loading skeleton ───────────────────────────────────────────
function KanbanSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3 touch-pan-x">
      {[1, 2, 3, 4].map(i => (
        <div
          key={i}
          className="shrink-0 w-[200px] sm:w-[240px] h-96 rounded-xl bg-surface-alt border border-border animate-pulse"
        />
      ))}
    </div>
  );
}

// ── Column header ──────────────────────────────────────────────
function ColumnHeader({ stage, dealsCount, colValue }) {
  return (
    <div
      className="px-3 pt-2.5 pb-2 flex items-center justify-between gap-2 border-b-2"
      style={{ borderColor: stage.color ?? '#64748b' }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm font-bold text-text truncate">{stage.name}</span>
        <span className="text-[10px] font-bold bg-surface-alt text-muted px-1.5 py-px rounded-full shrink-0">
          {dealsCount}
        </span>
      </div>
      {colValue > 0 && (
        <span className="text-[11px] text-muted font-semibold shrink-0 hidden sm:block">
          {formatCurrency(colValue, 'USD')}
        </span>
      )}
    </div>
  );
}

// ── Empty column placeholder ───────────────────────────────────
function EmptyColumn() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[80px] text-xs text-muted select-none">
      اسحب صفقة هنا
    </div>
  );
}

// ── Add deal button ────────────────────────────────────────────
function AddDealButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'mx-2 mb-2.5 w-[calc(100%-1rem)] py-1.5',
        'text-xs text-muted font-medium',
        'border border-dashed border-border rounded-lg',
        'hover:bg-surface-alt hover:text-text hover:border-teal/40',
        'transition-colors',
      )}
    >
      + إضافة صفقة
    </button>
  );
}

// ── Touch drag ghost ───────────────────────────────────────────
function DragGhost({ deal, x, y }) {
  if (!deal) return null;
  return (
    <div
      className="fixed z-[9999] pointer-events-none touch-none select-none"
      style={{ left: x - 100, top: y - 36, width: 200 }}
    >
      <div className="bg-surface border-2 border-teal rounded-xl shadow-2xl px-3 py-2 rotate-2 opacity-90">
        <span className="text-sm font-semibold text-text truncate block">{deal.title}</span>
        {Number(deal.value) > 0 && (
          <span className="text-xs text-teal">{formatCurrency(deal.value, 'USD')}</span>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────
export default function PipelineKanban({
  stages = [],
  dealsMap = {},
  onMoveDeal,
  onSelectDeal,
  onCreateDeal,
  isLoading = false,
}) {
  const [draggingId, setDraggingId]   = useState(null);
  const [overStageId, setOverStageId] = useState(null);
  const [ghost, setGhost]             = useState(null); // { deal, x, y }
  const touchDragRef                  = useRef(null);   // active touch drag state

  // ── HTML5 DnD — mouse/desktop ────────────────────────────────
  const handleDragStart = useCallback((e, deal) => {
    setDraggingId(deal.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('dealId', deal.id);
  }, []);

  const handleDragOver = useCallback((e, stageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverStageId(stageId);
  }, []);

  const handleDrop = useCallback((e, stageId) => {
    e.preventDefault();
    const dealId = e.dataTransfer.getData('dealId');
    if (dealId) onMoveDeal?.(dealId, stageId);
    setDraggingId(null);
    setOverStageId(null);
  }, [onMoveDeal]);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setOverStageId(null);
  }, []);

  // ── Pointer Events — touch/mobile ────────────────────────────
  // We register global move/up listeners during the drag so events
  // are received even when the pointer leaves the Kanban container.
  const handlePointerDown = useCallback((e, deal) => {
    // Only intercept touch; mouse is handled by HTML5 DnD above
    if (e.pointerType === 'mouse') return;
    // Prevent browser-generated click and scroll on this element
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const state  = { deal, dealId: deal.id, pointerId: e.pointerId, startX, startY, moved: false };
    touchDragRef.current = state;

    function onMove(ev) {
      if (ev.pointerId !== state.pointerId) return;
      const dx = Math.abs(ev.clientX - state.startX);
      const dy = Math.abs(ev.clientY - state.startY);

      if (!state.moved) {
        if (dx < 8 && dy < 8) return; // still a potential tap
        state.moved = true;
        setDraggingId(state.dealId);
      }

      setGhost({ deal: state.deal, x: ev.clientX, y: ev.clientY });

      // Find the column under the pointer. Ghost has pointer-events-none,
      // so elementFromPoint correctly sees through it.
      const el  = document.elementFromPoint(ev.clientX, ev.clientY);
      const col = el?.closest('[data-stage-id]');
      setOverStageId(col?.dataset.stageId ?? null);
    }

    function onUp(ev) {
      if (ev.pointerId !== state.pointerId) return;
      cleanup();

      if (state.moved) {
        // Re-check drop target at release position
        const el  = document.elementFromPoint(ev.clientX, ev.clientY);
        const col = el?.closest('[data-stage-id]');
        if (col?.dataset.stageId) {
          onMoveDeal?.(state.dealId, col.dataset.stageId);
        }
      } else {
        // Pure tap — treat as card select
        onSelectDeal?.(state.deal);
      }

      setDraggingId(null);
      setOverStageId(null);
      setGhost(null);
      touchDragRef.current = null;
    }

    function cleanup() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
      window.removeEventListener('pointercancel', onUp);
    }

    window.addEventListener('pointermove',   onMove);
    window.addEventListener('pointerup',     onUp);
    window.addEventListener('pointercancel', onUp);
  }, [onMoveDeal, onSelectDeal]);

  if (isLoading) return <KanbanSkeleton />;

  const activeStages = stages.filter(s => !s.is_lost);

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-3 touch-pan-x -mx-1 px-1 min-h-[420px]">
        {activeStages.map(stage => {
          const deals    = dealsMap[stage.id] ?? [];
          const colValue = deals.reduce((s, d) => s + Number(d.value || 0), 0);
          const isOver   = overStageId === stage.id;

          return (
            <div
              key={stage.id}
              data-stage-id={stage.id}
              onDragOver={e => handleDragOver(e, stage.id)}
              onDrop={e => handleDrop(e, stage.id)}
              className={cn(
                /* width: 200px mobile → 240px sm → 280px max */
                'shrink-0 w-[200px] sm:w-[240px] max-w-[280px]',
                'flex flex-col rounded-xl border-2 transition-colors duration-150',
                isOver
                  ? 'bg-blue-bg border-teal border-dashed'
                  : 'bg-surface-alt border-border',
              )}
            >
              <ColumnHeader stage={stage} dealsCount={deals.length} colValue={colValue} />

              {/* Deals list */}
              <div className="flex-1 flex flex-col gap-2 p-2 overflow-y-auto min-h-[60px]">
                {deals.length === 0
                  ? <EmptyColumn />
                  : deals.map(deal => (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={e => handleDragStart(e, deal)}
                        onDragEnd={handleDragEnd}
                        onPointerDown={e => handlePointerDown(e, deal)}
                        /* touch-none: prevent column horizontal pan when touching
                           a card — gives pointer events full control on touch */
                        className="touch-none select-none"
                      >
                        <DealCard
                          deal={deal}
                          onSelect={onSelectDeal}
                          isDragging={draggingId === deal.id}
                        />
                      </div>
                    ))
                }
              </div>

              {onCreateDeal && <AddDealButton onClick={() => onCreateDeal(stage.id)} />}
            </div>
          );
        })}
      </div>

      {/* Floating ghost — only visible during touch drag */}
      <DragGhost deal={ghost?.deal} x={ghost?.x} y={ghost?.y} />
    </>
  );
}
