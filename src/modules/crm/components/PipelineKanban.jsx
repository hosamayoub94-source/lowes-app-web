/**
 * PipelineKanban — drag-and-drop Kanban board for deals.
 *
 * Uses native HTML5 drag-and-drop (no external DnD library needed).
 * Each stage column shows deals from useDealsGroupedByStage().
 */
import React, { useState, useCallback } from 'react';
import DealCard from './DealCard.jsx';
import { formatCurrency } from '../types/crm.types.js';

export default function PipelineKanban({
  stages = [],
  dealsMap = {},
  onMoveDeal,
  onSelectDeal,
  onCreateDeal,
  isLoading = false,
}) {
  const [draggingId, setDraggingId] = useState(null);
  const [overStageId, setOverStageId] = useState(null);

  const handleDragStart = useCallback((e, dealId) => {
    setDraggingId(dealId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('dealId', dealId);
  }, []);

  const handleDragOver = useCallback((e, stageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverStageId(stageId);
  }, []);

  const handleDrop = useCallback((e, stageId) => {
    e.preventDefault();
    const dealId = e.dataTransfer.getData('dealId');
    if (dealId && dealId !== draggingId) return; // safety
    if (dealId) onMoveDeal?.(dealId, stageId);
    setDraggingId(null);
    setOverStageId(null);
  }, [draggingId, onMoveDeal]);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setOverStageId(null);
  }, []);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', gap: 16, overflowX: 'auto', padding: '8px 0' }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{
            minWidth: 240, background: '#f8fafc', borderRadius: 10,
            padding: 16, height: 400, animation: 'pulse 1.5s infinite',
          }} />
        ))}
      </div>
    );
  }

  const activeStages = stages.filter(s => !s.is_lost);

  return (
    <div style={{
      display: 'flex',
      gap: 12,
      overflowX: 'auto',
      padding: '4px 0 12px',
      direction: 'rtl',
      minHeight: 500,
    }}>
      {activeStages.map(stage => {
        const deals = dealsMap[stage.id] ?? [];
        const colValue = deals.reduce((s, d) => s + Number(d.value || 0), 0);
        const isOver = overStageId === stage.id;

        return (
          <div
            key={stage.id}
            onDragOver={e => handleDragOver(e, stage.id)}
            onDrop={e => handleDrop(e, stage.id)}
            style={{
              minWidth: 240,
              maxWidth: 280,
              flex: '0 0 240px',
              background: isOver ? '#f0f9ff' : '#f8fafc',
              border: `2px ${isOver ? 'dashed' : 'solid'} ${isOver ? '#0ea5e9' : '#e2e8f0'}`,
              borderRadius: 10,
              display: 'flex',
              flexDirection: 'column',
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            {/* Column header */}
            <div style={{
              padding: '10px 14px 8px',
              borderBottom: `3px solid ${stage.color ?? '#64748b'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <span style={{
                  fontSize: 13, fontWeight: 700, color: '#0f172a',
                }}>
                  {stage.name}
                </span>
                <span style={{
                  marginRight: 6, fontSize: 11, background: '#e2e8f0',
                  color: '#475569', padding: '1px 7px', borderRadius: 20,
                }}>
                  {deals.length}
                </span>
              </div>
              {colValue > 0 && (
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                  {formatCurrency(colValue, 'SAR')}
                </span>
              )}
            </div>

            {/* Deals list */}
            <div style={{
              flex: 1,
              padding: '10px 10px 6px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              overflowY: 'auto',
              minHeight: 60,
            }}>
              {deals.map(deal => (
                <div
                  key={deal.id}
                  draggable
                  onDragStart={e => handleDragStart(e, deal.id)}
                  onDragEnd={handleDragEnd}
                >
                  <DealCard
                    deal={deal}
                    onSelect={onSelectDeal}
                    isDragging={draggingId === deal.id}
                  />
                </div>
              ))}

              {deals.length === 0 && (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#94a3b8', fontSize: 12, minHeight: 80,
                }}>
                  اسحب صفقة هنا
                </div>
              )}
            </div>

            {/* Add deal button */}
            {onCreateDeal && (
              <button
                onClick={() => onCreateDeal(stage.id)}
                style={{
                  margin: '4px 10px 10px',
                  background: 'transparent',
                  border: '1px dashed #cbd5e1',
                  borderRadius: 6,
                  padding: '6px 0',
                  color: '#64748b',
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.target.style.background = '#f1f5f9'; }}
                onMouseLeave={e => { e.target.style.background = 'transparent'; }}
              >
                + إضافة صفقة
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
