import React, { memo, useRef } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { ProcessNodeData, ItemStatus, getTimeUnitAbbrev, ProcessItem } from '../types';
import { useStore } from '../store';
import { Users, Clock, AlertTriangle, Zap, User, Box, FileText, Trash2 } from 'lucide-react';
import { horizontalHandlePosition } from './nodeHandleLayout';
import { computeNodeUtilization, getRollingNodeUtilization } from '../metrics';
import { computeNodeLiveUtilizationForLoad, getLocalCapacityUnits, getNodeCapacityProfile } from '../capacityModel';

const ProcessNode = ({ id, data, selected }: NodeProps<ProcessNodeData>) => {
  // Performance: Use pre-computed itemsByNode map (O(1) lookup instead of O(n) filter)
  const items = useStore((state) => state.itemsByNode.get(id) || []);
  const itemConfig = useStore((state) => state.itemConfig);
  const defaultHeaderColor = useStore((state) => state.defaultHeaderColor);
  const deleteNode = useStore((state) => state.deleteNode);
  const readOnlyMode = useStore((state) => state.readOnlyMode);
  const timeUnit = useStore((state) => state.timeUnit);
  const nodes = useStore((state) => state.nodes);
  const capacityMode = useStore((state) => state.capacityMode);
  const sharedCapacityInputMode = useStore((state) => state.sharedCapacityInputMode);
  const sharedCapacityValue = useStore((state) => state.sharedCapacityValue);
  const blockedInboundCount = useStore((state) => state.blockedCountsByTarget.get(id) || 0);
  const rollingUtilization = useStore((state) => getRollingNodeUtilization(state.nodeUtilizationHistoryByNode, id));
  const unitAbbrev = getTimeUnitAbbrev(timeUnit);
  const batchingEnabled = Number.isFinite(Number(data.batchSize)) && Number(data.batchSize) > 1;
  const batchSize = batchingEnabled ? Math.max(2, Math.round(Number(data.batchSize))) : 0;
  const flowMode = data.flowMode === 'pull' ? 'pull' : 'push';
  const node = nodes.find((candidate) => candidate.id === id) as any;
  const capacityProfile = node
    ? getNodeCapacityProfile(node, nodes as any, {
        capacityMode,
        sharedCapacityInputMode,
        sharedCapacityValue,
      })
    : null;
  const usesSharedAllocation = capacityProfile?.usesSharedAllocation ?? false;
  const displayCapacity = Math.max(
    0,
    usesSharedAllocation ? capacityProfile?.maxConcurrentItems ?? 0 : getLocalCapacityUnits(data.resources || 0),
  );

  // Separate queued and processing in single pass
  const localQueuedItems: typeof items = [];
  const blockedQueuedItems: typeof items = [];
  const processingItems: typeof items = [];
  let waitTimeSum = 0;
  for (const item of items) {
    if (item.status === ItemStatus.QUEUED) {
      if (item.handoffTargetNodeId) {
        blockedQueuedItems.push(item);
      } else {
        localQueuedItems.push(item);
      }
      waitTimeSum += Math.max(0, item.nodeLeadTime);
    } else if (item.status === ItemStatus.PROCESSING) {
      processingItems.push(item);
      const processingSoFar = Math.max(0, item.processingDuration - item.remainingTime);
      waitTimeSum += Math.max(0, item.nodeLeadTime - processingSoFar);
    }
  }
  localQueuedItems.sort((left, right) => left.nodeEnterTick - right.nodeEnterTick);
  blockedQueuedItems.sort((left, right) => left.nodeEnterTick - right.nodeEnterTick);
  const totalQueuedCount = localQueuedItems.length + blockedQueuedItems.length;
  const blockedGroups = Array.from(
    blockedQueuedItems.reduce((groups, item) => {
      const targetId = item.handoffTargetNodeId || 'unknown';
      const targetNode = nodes.find((candidate) => candidate.id === targetId);
      const current = groups.get(targetId);
      groups.set(targetId, {
        label: targetNode?.data?.label || 'Downstream pull',
        count: (current?.count || 0) + 1,
      });
      return groups;
    }, new Map<string, { label: string; count: number }>()),
  );
  const activeCount = totalQueuedCount + processingItems.length;
  const avgWaitTime = activeCount > 0 ? waitTimeSum / activeCount : 0;
  const liveUtilization =
    usesSharedAllocation && capacityProfile
      ? computeNodeLiveUtilizationForLoad(processingItems.length, capacityProfile)
      : computeNodeUtilization(items, data.resources);

  const formatWaitTime = (ticks: number) => {
    if (ticks <= 0) return '0m';
    if (ticks < 60) return `${Math.round(ticks)}m`;
    const hours = Math.floor(ticks / 60);
    const mins = Math.round(ticks % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  // Stable slot assignment: each item keeps its slot for its entire processing lifetime.
  // Without this, items shift left when another item finishes, making countdowns jump.
  const slotMapRef = useRef<Map<string, number>>(new Map());
  const slotMap = slotMapRef.current;

  // Remove items no longer processing
  const activeIds = new Set(processingItems.map(item => item.id));
  for (const [itemId] of slotMap) {
    if (!activeIds.has(itemId)) slotMap.delete(itemId);
  }

  // Assign new items to the lowest available slot
  const usedSlots = new Set(slotMap.values());
  for (const item of processingItems) {
    if (!slotMap.has(item.id)) {
      for (let s = 0; s < displayCapacity; s++) {
        if (!usedSlots.has(s)) {
          slotMap.set(item.id, s);
          usedSlots.add(s);
          break;
        }
      }
    }
  }

  // Build slot-indexed array
  const slots: (ProcessItem | null)[] = Array.from({ length: displayCapacity }, () => null);
  for (const item of processingItems) {
    const slotIdx = slotMap.get(item.id);
    if (slotIdx !== undefined && slotIdx < slots.length) {
      slots[slotIdx] = item;
    }
  }

  // Bottleneck & Validation Styles
  let borderColor = "border-slate-300";
  let ringColor = "ring-blue-500/20";
  let bgOverlay = "";

  if (data.validationError) {
      borderColor = "border-red-500";
      bgOverlay = "bg-red-50/30";
  } else if (selected) {
      borderColor = "border-blue-500";
  } else if (totalQueuedCount >= 10) {
      borderColor = "border-red-400";
  } else if (totalQueuedCount >= 3) {
      borderColor = "border-amber-400";
  }

  // Active Source Indicator
  const isSource = data.sourceConfig?.enabled;

  // Item Icon Helper
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
      width: '14px',
      height: '14px',
      background: '#3b82f6',
      border: '2px solid white',
      zIndex: 50,
      transition: 'all 0.2s ease',
      boxShadow: '0 3px 8px rgba(15,23,42,0.18)',
  };

  // Show handles when selected OR hovered
  const handleVisibility = selected ? { opacity: 1 } : { opacity: 0 };
  const handleClassName = readOnlyMode ? 'process-flow-handle' : 'process-flow-handle group-hover:!opacity-100 hover:!scale-125';
  const handleStyle = readOnlyMode
    ? { ...handleBaseStyle, opacity: 0, pointerEvents: 'none' as const }
    : { ...handleBaseStyle, ...handleVisibility };

  const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      deleteNode(id);
  };

  return (
    <div
      className={`group w-72 bg-white rounded-xl border-2 transition-all duration-300 relative shadow-[4px_4px_0px_0px_rgba(15,23,42,0.15)] ${borderColor} ${selected ? `ring-4 ${ringColor}` : ''} ${bgOverlay}`}
    >
      {/* Validation Warning Badge */}
      {data.validationError && (
          <div className="absolute -top-3 -right-2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md z-50 animate-bounce flex items-center gap-1">
              <AlertTriangle size={10} fill="currentColor" /> {data.validationError}
          </div>
      )}

      {/* Delete Button (On Hover) */}
      {!readOnlyMode ? (
        <button
            onClick={handleDelete}
            className="absolute -top-3 -right-3 bg-white text-slate-400 border-2 border-slate-900 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-full shadow-[2px_2px_0px_0px_rgba(15,23,42,0.9)] z-50 opacity-0 group-hover:opacity-100 transition-all"
            title="Delete Node"
        >
            <Trash2 size={12} />
        </button>
      ) : null}

      {/* OMNI-HANDLES: Top, Right, Bottom, Left. Each side has both Source and Target to allow full flexibility. */}
      {/* Handles are visible on hover AND when selected for better discoverability */}

      {/* Left */}
      <Handle type="target" position={Position.Left} id="left-target" className={handleClassName} style={{ ...handleStyle, ...horizontalHandlePosition }} />
      <Handle type="source" position={Position.Left} id="left-source" className={handleClassName} style={{ ...handleStyle, ...horizontalHandlePosition }} />

      {/* Top */}
      <Handle type="target" position={Position.Top} id="top-target" className={handleClassName} style={handleStyle} />
      <Handle type="source" position={Position.Top} id="top-source" className={handleClassName} style={handleStyle} />

      {/* Right */}
      <Handle type="target" position={Position.Right} id="right-target" className={handleClassName} style={{ ...handleStyle, ...horizontalHandlePosition }} />
      <Handle type="source" position={Position.Right} id="right-source" className={handleClassName} style={{ ...handleStyle, ...horizontalHandlePosition }} />

      {/* Bottom */}
      <Handle type="target" position={Position.Bottom} id="bottom-target" className={handleClassName} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className={handleClassName} style={handleStyle} />


      {/* Content Wrapper */}
      <div className="overflow-hidden rounded-[10px] w-full h-full">
          {/* Header */}
          <div
            className="border-b px-4 py-3 flex justify-between items-start gap-3 relative"
            style={{
              backgroundColor: (data.headerColor || defaultHeaderColor) + '40',
              borderColor: (data.headerColor || defaultHeaderColor) + '60',
            }}
          >
             <div className="flex items-start gap-2 min-w-0 flex-1">
                {isSource && (
                    <div className="bg-purple-100 p-1 rounded-full text-purple-600 shadow-sm shrink-0" title="Active Input Source">
                        <Zap size={12} fill="currentColor" />
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-800 leading-tight truncate">{data.label}</div>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                        <span className="inline-flex items-center gap-1 whitespace-nowrap" title="Processing time">
                          <Clock size={11} className="text-slate-400 shrink-0" />
                          <span className="tabular-nums">{data.processingTime}{unitAbbrev}</span>
                        </span>
                        <span className="text-slate-300">·</span>
                        <span
                          className="inline-flex items-center gap-1 whitespace-nowrap"
                          title={usesSharedAllocation ? 'Shared team allocation for this node' : 'Resources'}
                        >
                          <Users size={11} className="text-slate-400 shrink-0" />
                          <span className="tabular-nums">
                            {usesSharedAllocation
                              ? `${(capacityProfile?.allocationPercent ?? 0).toFixed(0)}%`
                              : data.resources}
                          </span>
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="inline-flex items-center gap-1 whitespace-nowrap" title="Average wait time">
                          <Clock size={11} className="text-amber-500 shrink-0" />
                          <span className="tabular-nums">{formatWaitTime(avgWaitTime)}</span>
                        </span>
                        <span className="text-slate-300">·</span>
                        <span
                          className="inline-flex items-center gap-1 whitespace-nowrap"
                          title={`Rolling 1h average utilisation for this node. Live now: ${liveUtilization.toFixed(0)}%.`}
                        >
                          <Users size={11} className="text-emerald-500 shrink-0" />
                          <span className="tabular-nums">{rollingUtilization.toFixed(0)}%</span>
                        </span>
                    </div>
                    {(usesSharedAllocation || batchingEnabled || flowMode === 'pull' || blockedInboundCount > 0) && (
                      <div className="flex gap-2 mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {usesSharedAllocation && (
                          <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-blue-700">
                            {capacityProfile?.allocatedHoursPerDay.toFixed(1)}h/day
                          </span>
                        )}
                        {batchingEnabled && flowMode !== 'pull' && !usesSharedAllocation && (
                          <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-600">
                            Batch {batchSize}
                          </span>
                        )}
                        {flowMode === 'pull' && (
                          <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-blue-700">
                            Pull cap {displayCapacity}
                          </span>
                        )}
                        {blockedInboundCount > 0 && (
                          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-700">
                            Incoming blocked {blockedInboundCount}
                          </span>
                        )}
                      </div>
                    )}
                </div>
             </div>
             {data.stats.failed > 0 && (
                 <div className="flex items-center gap-1 text-xs text-red-600 font-bold bg-red-50 px-2 py-1 rounded-full border border-red-100">
                     <AlertTriangle size={12} /> {data.stats.failed}
                 </div>
             )}
          </div>

          <div className="p-4 bg-gradient-to-b from-white to-slate-50 min-h-[140px] flex flex-col gap-4">

            {/* Processing Area (Slots) */}
            <div className="flex flex-col gap-2">
                <div className="text-[10px] uppercase font-bold text-slate-400 flex justify-between">
                    <span>Active Processing</span>
                    <span>{processingItems.length}/{displayCapacity}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                    {slots.map((item, idx) => {
                        const displayTime = item ? Math.max(0, Math.ceil(item.remainingTime)) : 0;
                        const displayProgress = item ? item.progress : 0;

                        return (
                            <div key={item?.id ?? `empty-${idx}`} className="aspect-square rounded-lg bg-slate-100 border border-slate-200 shadow-inner flex items-center justify-center relative overflow-hidden">
                                {item ? (
                                    <div className="relative w-10 h-10 flex items-center justify-center">
                                        {/* Item Visual with CSS-based progress */}
                                        <div
                                          className="flex items-center justify-center shadow-lg text-white relative overflow-hidden"
                                          style={{
                                              width: '2.5rem',
                                              height: '2.5rem',
                                              backgroundColor: itemConfig.color,
                                              borderRadius: itemConfig.shape === 'circle' ? '50%' : itemConfig.shape === 'rounded' ? '8px' : '0px',
                                          }}
                                        >
                                            {/* Progress overlay (CSS transform instead of SVG) */}
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
                    <span className={`${localQueuedItems.length > 5 ? 'text-red-500 font-bold' : ''}`}>{localQueuedItems.length}</span>
                </div>
                <div className={`h-12 bg-slate-100/50 rounded-lg border border-dashed flex items-center px-2 gap-[-8px] overflow-hidden relative transition-colors duration-300 ${localQueuedItems.length >= 10 ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}>
                    {localQueuedItems.length === 0 && <span className="text-[10px] text-slate-400 w-full text-center">Empty</span>}
                    {localQueuedItems.slice(0, 20).map((item, i) => (
                        <div
                            key={item.id}
                            className="w-5 h-5 shadow-sm flex-shrink-0 border border-white/50 -ml-2 first:ml-0 flex items-center justify-center text-white"
                            style={{
                                backgroundColor: itemConfig.color,
                                borderRadius: itemConfig.shape === 'circle' ? '50%' : itemConfig.shape === 'rounded' ? '6px' : '0px',
                                zIndex: i,
                                opacity: 0.8
                            }}
                            title={`Item ${item.id}`}
                        >
                        </div>
                    ))}
                    {localQueuedItems.length > 10 && (
                         <div className="absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-slate-100 to-transparent z-20 flex items-center justify-end px-1">
                             <span className="text-xs font-bold text-slate-500">+</span>
                         </div>
                    )}
                </div>
            </div>

            {blockedQueuedItems.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-[10px] uppercase font-bold text-slate-400 flex justify-between">
                  <span>Blocked for Pull</span>
                  <span className="text-amber-600">{blockedQueuedItems.length}</span>
                </div>
                <div className="min-h-[48px] rounded-lg border border-amber-200 bg-amber-50/70 px-2 py-2 flex flex-wrap gap-2">
                  {blockedGroups.map(([targetId, group]) => (
                    <span
                      key={targetId}
                      className="inline-flex items-center rounded-full border border-amber-300 bg-white px-2 py-1 text-[10px] font-bold text-amber-700"
                    >
                      {group.label} {group.count}
                    </span>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Footer Stats */}
          <div className="bg-slate-50 border-t border-slate-100 py-2 px-4 flex justify-between items-center text-xs">
             <span className="text-slate-500 font-medium">Processed</span>
             <span className="font-mono font-bold text-green-700 bg-green-100 px-2 rounded-md border-2 border-green-600">
                {data.stats.processed}
             </span>
          </div>
      </div>
    </div>
  );
};

export default memo(ProcessNode);
