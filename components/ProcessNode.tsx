import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { ProcessNodeData, ItemStatus } from '../types';
import { useStore } from '../store';
import { Users, Clock, AlertTriangle, Zap, User, Box, FileText, Trash2 } from 'lucide-react';

const ProcessNode = ({ id, data, selected }: NodeProps<ProcessNodeData>) => {
  // Performance: Use pre-computed itemsByNode map (O(1) lookup instead of O(n) filter)
  const items = useStore((state) => state.itemsByNode.get(id) || []);
  const itemConfig = useStore((state) => state.itemConfig);
  const deleteNode = useStore((state) => state.deleteNode);

  // Separate queued and processing in single pass
  const queuedItems: typeof items = [];
  const processingItems: typeof items = [];
  for (const item of items) {
    if (item.status === ItemStatus.QUEUED) queuedItems.push(item);
    else if (item.status === ItemStatus.PROCESSING) processingItems.push(item);
  }
  
  // Create resource slots
  const slots = Array.from({ length: data.resources });

  // Bottleneck & Validation Styles
  let borderColor = "border-slate-200";
  let ringColor = "ring-blue-500/20";
  let shadowColor = "";
  let bgOverlay = "";

  if (data.validationError) {
      borderColor = "border-red-500";
      shadowColor = "shadow-red-200";
      bgOverlay = "bg-red-50/30";
  } else if (selected) {
      borderColor = "border-blue-500";
  } else if (queuedItems.length >= 10) {
      borderColor = "border-red-400";
      shadowColor = "shadow-red-100";
  } else if (queuedItems.length >= 3) {
      borderColor = "border-amber-400";
      shadowColor = "shadow-amber-100";
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

  const handleStyle = {
      width: '0.8rem',
      height: '0.8rem',
      background: '#3b82f6',
      border: '2px solid white',
      zIndex: 50,
      opacity: 0, // Invisible by default
      transition: 'opacity 0.2s, transform 0.2s',
  };

  const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      deleteNode(id);
  };

  return (
    <div
      className={`group w-72 bg-white rounded-xl shadow-xl border-2 transition-all duration-300 relative ${borderColor} ${selected ? `ring-4 ${ringColor}` : ''} ${shadowColor} ${bgOverlay}`}
    >
      {/* Validation Warning Badge */}
      {data.validationError && (
          <div className="absolute -top-3 -right-2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md z-50 animate-bounce flex items-center gap-1">
              <AlertTriangle size={10} fill="currentColor" /> {data.validationError}
          </div>
      )}

      {/* Delete Button (On Hover) */}
      <button 
          onClick={handleDelete}
          className="absolute -top-3 -right-3 bg-white text-slate-400 border border-slate-200 hover:text-red-500 hover:border-red-500 p-1.5 rounded-full shadow-sm z-50 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Delete Node"
      >
          <Trash2 size={12} />
      </button>

      {/* OMNI-HANDLES: Top, Right, Bottom, Left. Each side has both Source and Target to allow full flexibility. */}
      
      {/* Left */}
      <Handle type="target" position={Position.Left} id="left-target" className="!bg-blue-500 group-hover:opacity-100" style={handleStyle} />
      <Handle type="source" position={Position.Left} id="left-source" className="!bg-blue-500 group-hover:opacity-100" style={handleStyle} />
      
      {/* Top */}
      <Handle type="target" position={Position.Top} id="top-target" className="!bg-blue-500 group-hover:opacity-100" style={handleStyle} />
      <Handle type="source" position={Position.Top} id="top-source" className="!bg-blue-500 group-hover:opacity-100" style={handleStyle} />

      {/* Right */}
      <Handle type="target" position={Position.Right} id="right-target" className="!bg-blue-500 group-hover:opacity-100" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right-source" className="!bg-blue-500 group-hover:opacity-100" style={handleStyle} />

      {/* Bottom */}
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="!bg-blue-500 group-hover:opacity-100" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className="!bg-blue-500 group-hover:opacity-100" style={handleStyle} />


      {/* Content Wrapper */}
      <div className="overflow-hidden rounded-[10px] w-full h-full">
          {/* Header */}
          <div className="bg-slate-50 border-b border-slate-100 px-4 py-3 flex justify-between items-center relative">
             <div className="flex items-center gap-2">
                {isSource && (
                    <div className="bg-purple-100 p-1 rounded-full text-purple-600 shadow-sm" title="Active Input Source">
                        <Zap size={12} fill="currentColor" />
                    </div>
                )}
                <div>
                    <div className="font-bold text-slate-800">{data.label}</div>
                    <div className="flex gap-3 text-[10px] text-slate-500 font-medium uppercase tracking-wider mt-1">
                        <span className="flex items-center gap-1"><Clock size={10} /> {data.processingTime}t</span>
                        <span className="flex items-center gap-1"><Users size={10} /> {data.resources}</span>
                    </div>
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
                    <span>{processingItems.length}/{data.resources}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                    {slots.map((_, idx) => {
                        const item = processingItems[idx];
                        // Safety: Ensure we don't display negative numbers or NaN
                        const displayTime = item ? Math.max(0, Math.ceil(item.remainingTime)) : 0;
                        const displayProgress = item ? item.progress : 0;

                        return (
                            <div key={idx} className="aspect-square rounded-lg bg-slate-100 border border-slate-200 shadow-inner flex items-center justify-center relative overflow-hidden">
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
                    <span className={`${queuedItems.length > 5 ? 'text-red-500 font-bold' : ''}`}>{queuedItems.length}</span>
                </div>
                <div className={`h-12 bg-slate-100/50 rounded-lg border border-dashed flex items-center px-2 gap-[-8px] overflow-hidden relative transition-colors duration-300 ${queuedItems.length >= 10 ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}>
                    {queuedItems.length === 0 && <span className="text-[10px] text-slate-400 w-full text-center">Empty</span>}
                    {queuedItems.map((item, i) => (
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
             <span className="font-mono font-bold text-green-600 bg-green-50 px-2 rounded border border-green-100">
                {data.stats.processed}
             </span>
          </div>
      </div>
    </div>
  );
};

export default memo(ProcessNode);