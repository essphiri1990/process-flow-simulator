import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { ProcessNodeData, ItemStatus } from '../types';
import { useStore } from '../store';
import { Play, Zap, Clock, Users, AlertTriangle, User, Box, FileText, Trash2 } from 'lucide-react';

const StartNode = ({ id, data, selected }: NodeProps<ProcessNodeData>) => {
  // Performance: Use pre-computed itemsByNode map (O(1) lookup)
  const items = useStore((state) => state.itemsByNode.get(id) || []);
  const itemConfig = useStore((state) => state.itemConfig);
  const deleteNode = useStore((state) => state.deleteNode);

  // Single pass to separate items by status
  const processingItems: typeof items = [];
  for (const item of items) {
    if (item.status === ItemStatus.PROCESSING) processingItems.push(item);
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

  const handleStyle = {
      width: '0.8rem',
      height: '0.8rem',
      background: '#10b981', // emerald-500
      border: '2px solid white',
      zIndex: 50,
      opacity: 0,
      transition: 'opacity 0.2s, transform 0.2s',
  };

  const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      deleteNode(id);
  };

  return (
    <div
      className={`group w-64 bg-white rounded-xl shadow-xl border-2 transition-all duration-300 relative ${borderColor} ${selected ? `ring-4 ${ringColor}` : ''} ${bgOverlay}`}
    >
      {/* Badge */}
      <div className="absolute -top-3 left-4 bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md z-50 flex items-center gap-1 uppercase tracking-wider">
          <Play size={10} fill="currentColor" /> Start
      </div>

      {data.validationError && (
          <div className="absolute -top-3 -right-2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md z-50 animate-bounce flex items-center gap-1">
              <AlertTriangle size={10} fill="currentColor" /> {data.validationError}
          </div>
      )}

      {/* Delete Button */}
      <button 
          onClick={handleDelete}
          className="absolute -top-3 -right-3 bg-white text-slate-400 border border-slate-200 hover:text-red-500 hover:border-red-500 p-1.5 rounded-full shadow-sm z-50 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Delete Node"
      >
          <Trash2 size={12} />
      </button>

      {/* Omni-Handles: Sources only */}
      <Handle type="source" position={Position.Right} id="right" className="group-hover:opacity-100" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" className="group-hover:opacity-100" style={handleStyle} />
      <Handle type="source" position={Position.Left} id="left" className="group-hover:opacity-100" style={handleStyle} />
      <Handle type="source" position={Position.Top} id="top" className="group-hover:opacity-100" style={handleStyle} />

      <div className="overflow-hidden rounded-[10px] w-full h-full">
          {/* Header */}
          <div className="bg-emerald-50/50 border-b border-emerald-100 px-4 pt-5 pb-2">
             <div className="flex justify-between items-start">
                <div>
                    <div className="font-bold text-slate-800 text-lg leading-tight">{data.label}</div>
                    {data.sourceConfig?.enabled && (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-medium mt-1">
                            <Zap size={10} fill="currentColor"/> Generates {data.sourceConfig.batchSize} every {data.sourceConfig.interval}t
                        </div>
                    )}
                </div>
             </div>
          </div>

          <div className="p-4 min-h-[100px] flex flex-col gap-3">
             
             {/* Simple Process Viz for Start Node */}
             <div className="flex gap-2 justify-center">
                 {processingItems.slice(0, 5).map((item) => (
                      <div key={item.id} className="relative w-8 h-8 flex items-center justify-center">
                        <div
                            className="flex items-center justify-center shadow-md text-white relative overflow-hidden"
                            style={{
                                width: '2rem',
                                height: '2rem',
                                backgroundColor: itemConfig.color,
                                borderRadius: itemConfig.shape === 'circle' ? '50%' : itemConfig.shape === 'rounded' ? '6px' : '0px',
                            }}
                        >
                            {/* Progress overlay (CSS transform instead of SVG) */}
                            <div
                              className="absolute inset-0 bg-white/30"
                              style={{ transform: `translateY(${100 - item.progress}%)` }}
                            />
                            {itemConfig.icon !== 'none' ? <span className="relative z-10">{getItemIcon()}</span> : null}
                        </div>
                    </div>
                 ))}
                 {processingItems.length === 0 && (
                     <div className="text-xs text-slate-400 italic py-2">Ready to generate...</div>
                 )}
             </div>

             {/* Stats Row */}
             <div className="flex gap-4 border-t border-slate-100 pt-2 mt-auto">
                 <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <Clock size={10} /> {data.processingTime}t Time
                 </div>
                 <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <Users size={10} /> {data.resources} Cap
                 </div>
             </div>

          </div>
      </div>
    </div>
  );
};

export default memo(StartNode);