import React, { memo, useRef } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { ProcessNodeData, ItemStatus, getTimeUnitAbbrev, ProcessItem } from '../types';
import { useStore } from '../store';
import { Play, Zap, Clock, Users, AlertTriangle, User, Box, FileText, Trash2 } from 'lucide-react';

const StartNode = ({ id, data, selected }: NodeProps<ProcessNodeData>) => {
  // Performance: Use pre-computed itemsByNode map (O(1) lookup)
  const items = useStore((state) => state.itemsByNode.get(id) || []);
  const itemConfig = useStore((state) => state.itemConfig);
  const defaultHeaderColor = useStore((state) => state.defaultHeaderColor);
  const deleteNode = useStore((state) => state.deleteNode);
  const readOnlyMode = useStore((state) => state.readOnlyMode);
  const timeUnit = useStore((state) => state.timeUnit);
  const unitAbbrev = getTimeUnitAbbrev(timeUnit);

  // Single pass to separate items by status
  const queuedItems: typeof items = [];
  const processingItems: typeof items = [];
  for (const item of items) {
    if (item.status === ItemStatus.QUEUED) queuedItems.push(item);
    else if (item.status === ItemStatus.PROCESSING) processingItems.push(item);
  }
  queuedItems.sort((a, b) => a.spawnTick - b.spawnTick);
  // Sort by spawnTick so items stay in stable slot positions across renders
  processingItems.sort((a, b) => a.spawnTick - b.spawnTick);

  // Keep processing items in stable slots so capacity changes read cleanly.
  const slotMapRef = useRef<Map<string, number>>(new Map());
  const slotMap = slotMapRef.current;

  const activeIds = new Set(processingItems.map((item) => item.id));
  for (const [itemId] of slotMap) {
    if (!activeIds.has(itemId)) slotMap.delete(itemId);
  }

  const usedSlots = new Set(slotMap.values());
  for (const item of processingItems) {
    if (!slotMap.has(item.id)) {
      for (let slotIndex = 0; slotIndex < data.resources; slotIndex++) {
        if (!usedSlots.has(slotIndex)) {
          slotMap.set(item.id, slotIndex);
          usedSlots.add(slotIndex);
          break;
        }
      }
    }
  }

  const slots: (ProcessItem | null)[] = Array.from({ length: data.resources }, () => null);
  for (const item of processingItems) {
    const slotIndex = slotMap.get(item.id);
    if (slotIndex !== undefined && slotIndex < slots.length) {
      slots[slotIndex] = item;
    }
  }

  // Visual Styling
  let borderColor = "border-emerald-500";
  let ringColor = "ring-emerald-500/20";
  let bgOverlay = "bg-emerald-50/10";

  if (selected) {
     ringColor = "ring-emerald-500/40";
  }

  // Helper for item icons
  const getItemIcon = () => {
      switch(itemConfig.icon) {
          case 'user': return <User size={12} strokeWidth={3} className="opacity-80"/>;
          case 'box': return <Box size={12} strokeWidth={3} className="opacity-80"/>;
          case 'file': return <FileText size={12} strokeWidth={3} className="opacity-80"/>;
          default: return null;
      }
  };

  // Handle styling - visible on hover/selection with larger hit areas
  const handleBaseStyle = {
      width: '12px',
      height: '12px',
      background: '#10b981', // emerald-500
      border: '2px solid white',
      zIndex: 50,
      transition: 'all 0.2s ease',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  };

  // Show handles when selected OR hovered
  const handleVisibility = selected ? { opacity: 1 } : { opacity: 0 };
  const handleClassName = readOnlyMode ? '' : 'group-hover:!opacity-100 hover:!scale-125';
  const handleStyle = readOnlyMode
    ? { ...handleBaseStyle, opacity: 0, pointerEvents: 'none' as const }
    : { ...handleBaseStyle, ...handleVisibility };

  const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      deleteNode(id);
  };

  return (
    <div
      className={`group w-72 bg-white rounded-xl border-2 transition-all duration-300 relative shadow-[4px_4px_0px_0px_rgba(16,185,129,0.3)] ${borderColor} ${selected ? `ring-4 ${ringColor}` : ''} ${bgOverlay}`}
    >
      {/* Badge */}
      <div className="absolute -top-3 left-4 bg-emerald-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full border-2 border-emerald-800 shadow-[2px_2px_0px_0px_rgba(6,95,70,0.8)] z-50 flex items-center gap-1 uppercase tracking-wider">
          <Play size={10} fill="currentColor" /> Start
      </div>

      {data.validationError && (
          <div className="absolute -top-3 -right-2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md z-50 animate-bounce flex items-center gap-1">
              <AlertTriangle size={10} fill="currentColor" /> {data.validationError}
          </div>
      )}

      {/* Delete Button */}
      {!readOnlyMode ? (
        <button
            onClick={handleDelete}
            className="absolute -top-3 -right-3 bg-white text-slate-400 border-2 border-slate-900 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-full shadow-[2px_2px_0px_0px_rgba(15,23,42,0.9)] z-50 opacity-0 group-hover:opacity-100 transition-all"
            title="Delete Node"
        >
            <Trash2 size={12} />
        </button>
      ) : null}

      {/* Omni-Handles: Sources only - visible on hover AND when selected */}
      <Handle type="source" position={Position.Right} id="right" className={handleClassName} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={handleClassName} style={handleStyle} />
      <Handle type="source" position={Position.Left} id="left" className={handleClassName} style={handleStyle} />
      <Handle type="source" position={Position.Top} id="top" className={handleClassName} style={handleStyle} />

      <div className="overflow-hidden rounded-[10px] w-full h-full">
          {/* Header */}
          <div
            className="border-b px-4 py-3 relative"
            style={{
              backgroundColor: (data.headerColor || defaultHeaderColor) + '40',
              borderColor: (data.headerColor || defaultHeaderColor) + '60',
            }}
          >
             <div className="flex items-center gap-2">
                <div className="bg-emerald-100 p-1 rounded-full text-emerald-700 shadow-sm" title="Start Node">
                    <Zap size={12} fill="currentColor" />
                </div>
                <div>
                    <div className="font-bold text-slate-800">{data.label}</div>
                    <div className="flex gap-3 text-[10px] text-slate-500 font-medium uppercase tracking-wider mt-1">
                        <span className="flex items-center gap-1"><Clock size={10} /> {data.processingTime} {unitAbbrev}</span>
                        <span className="flex items-center gap-1"><Users size={10} /> {data.resources}</span>
                    </div>
                    {data.sourceConfig?.enabled ? (
                      <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-medium mt-1">
                        <Zap size={10} fill="currentColor" /> Generates {data.sourceConfig.batchSize} every {data.sourceConfig.interval} {unitAbbrev}
                      </div>
                    ) : null}
                </div>
             </div>
          </div>

          <div className="p-4 bg-gradient-to-b from-white to-emerald-50/20 min-h-[140px] flex flex-col gap-4">

             {/* Processing Area */}
             <div className="flex flex-col gap-2">
                <div className="text-[10px] uppercase font-bold text-slate-400 flex justify-between">
                    <span>Active Processing</span>
                    <span>{processingItems.length}/{data.resources}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                    {slots.map((item, index) => {
                      const displayTime = item ? Math.max(0, Math.ceil(item.remainingTime)) : 0;
                      const displayProgress = item ? item.progress : 0;

                      return (
                        <div
                          key={item?.id ?? `empty-${index}`}
                          className="aspect-square rounded-lg bg-slate-100 border border-slate-200 shadow-inner flex items-center justify-center relative overflow-hidden"
                        >
                          {item ? (
                            <div className="relative w-10 h-10 flex items-center justify-center">
                              <div
                                className="flex items-center justify-center shadow-lg text-white relative overflow-hidden"
                                style={{
                                  width: '2.5rem',
                                  height: '2.5rem',
                                  backgroundColor: itemConfig.color,
                                  borderRadius: itemConfig.shape === 'circle' ? '50%' : itemConfig.shape === 'rounded' ? '8px' : '0px',
                                }}
                              >
                                <div
                                  className="absolute inset-0 bg-white/30"
                                  style={{ transform: `translateY(${100 - displayProgress}%)` }}
                                />
                                {itemConfig.icon !== 'none' ? getItemIcon() : (
                                  <span className="text-[9px] font-bold opacity-90 relative z-10">
                                    {displayTime}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-slate-200/50" />
                          )}
                        </div>
                      );
                    })}
                </div>
             </div>

             {/* Queue Area */}
             <div className="flex flex-col gap-2">
                <div className="text-[10px] uppercase font-bold text-slate-400 flex justify-between">
                    <span>Queue</span>
                    <span className={`${queuedItems.length > 5 ? 'text-red-500 font-bold' : ''}`}>{queuedItems.length}</span>
                </div>
                <div className={`h-12 bg-slate-100/50 rounded-lg border border-dashed flex items-center px-2 gap-[-8px] overflow-hidden relative transition-colors duration-300 ${queuedItems.length >= 10 ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}>
                    {queuedItems.length === 0 && <span className="text-[10px] text-slate-400 w-full text-center">Empty</span>}
                    {queuedItems.slice(0, 20).map((item, index) => (
                        <div
                            key={item.id}
                            className="w-5 h-5 shadow-sm flex-shrink-0 border border-white/50 -ml-2 first:ml-0 flex items-center justify-center text-white"
                            style={{
                                backgroundColor: itemConfig.color,
                                borderRadius: itemConfig.shape === 'circle' ? '50%' : itemConfig.shape === 'rounded' ? '6px' : '0px',
                                zIndex: index,
                                opacity: 0.8
                            }}
                            title={`Item ${item.id}`}
                        />
                    ))}
                    {queuedItems.length > 10 && (
                         <div className="absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-slate-100 to-transparent z-20 flex items-center justify-end px-1">
                             <span className="text-xs font-bold text-slate-500">+</span>
                         </div>
                    )}
                </div>
             </div>

          </div>

          {/* Footer Stats */}
          <div className="bg-slate-50 border-t border-slate-100 py-2 px-4 flex justify-between items-center text-xs">
             <span className="text-slate-500 font-medium">Processed</span>
             <span className="font-mono font-bold text-emerald-700 bg-emerald-100 px-2 rounded-md border-2 border-emerald-600">
                {data.stats.processed}
             </span>
          </div>
      </div>
    </div>
  );
};

export default memo(StartNode);
