import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { ProcessNodeData, ItemStatus } from '../types';
import { useStore } from '../store';
import { CheckCircle2, Clock, AlertTriangle, Trash2 } from 'lucide-react';

const EndNode = ({ id, data, selected }: NodeProps<ProcessNodeData>) => {
  // Performance: Use pre-computed itemsByNode map (O(1) lookup)
  const items = useStore((state) => state.itemsByNode.get(id) || []);
  const deleteNode = useStore((state) => state.deleteNode);
  
  // Visual Styling
  let borderColor = "border-slate-800";
  let ringColor = "ring-slate-800/20";
  
  if (selected) {
     ringColor = "ring-slate-800/40";
  }

  // For End Node, we mostly care about 'processed' stats
  const totalFinished = data.stats.processed;

  // Handle styling - visible on hover/selection with larger hit areas
  const handleBaseStyle = {
      width: '12px',
      height: '12px',
      background: '#334155', // slate-700
      border: '2px solid white',
      zIndex: 50,
      transition: 'all 0.2s ease',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  };

  // Show handles when selected OR hovered
  const handleVisibility = selected ? { opacity: 1 } : { opacity: 0 };

  const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      deleteNode(id);
  };

  return (
    <div
      className={`group w-64 bg-slate-900 text-white rounded-xl shadow-xl border-2 transition-all duration-300 relative ${borderColor} ${selected ? `ring-4 ${ringColor}` : ''}`}
    >
       {/* Badge */}
       <div className="absolute -top-3 right-4 bg-slate-700 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md z-50 flex items-center gap-1 uppercase tracking-wider border border-slate-600">
          End <CheckCircle2 size={10} />
      </div>

      {data.validationError && (
          <div className="absolute -top-3 -right-2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md z-50 animate-bounce flex items-center gap-1">
              <AlertTriangle size={10} fill="currentColor" /> {data.validationError}
          </div>
      )}

      {/* Delete Button */}
      <button 
          onClick={handleDelete}
          className="absolute -top-3 -left-3 bg-slate-700 text-slate-300 border border-slate-600 hover:text-white hover:bg-red-600 p-1.5 rounded-full shadow-sm z-50 opacity-0 group-hover:opacity-100 transition-all"
          title="Delete Node"
      >
          <Trash2 size={12} />
      </button>

      {/* Omni-Handles: Targets only - visible on hover AND when selected */}
      <Handle type="target" position={Position.Left} id="left" className="group-hover:!opacity-100 hover:!scale-125" style={{ ...handleBaseStyle, ...handleVisibility }} />
      <Handle type="target" position={Position.Top} id="top" className="group-hover:!opacity-100 hover:!scale-125" style={{ ...handleBaseStyle, ...handleVisibility }} />
      <Handle type="target" position={Position.Right} id="right" className="group-hover:!opacity-100 hover:!scale-125" style={{ ...handleBaseStyle, ...handleVisibility }} />
      <Handle type="target" position={Position.Bottom} id="bottom" className="group-hover:!opacity-100 hover:!scale-125" style={{ ...handleBaseStyle, ...handleVisibility }} />

      <div className="overflow-hidden rounded-[10px] w-full h-full p-5 flex flex-col items-center text-center">
          
          <h3 className="font-bold text-slate-300 uppercase tracking-widest text-xs mb-1">{data.label}</h3>
          
          <div className="my-3">
              <div className="text-5xl font-mono font-bold text-white tracking-tighter">
                  {totalFinished}
              </div>
              <div className="text-[10px] text-slate-400 mt-1 uppercase font-medium">Items Completed</div>
          </div>

          <div className="w-full bg-slate-800 rounded-lg p-2 mt-2 flex justify-between items-center text-xs text-slate-400">
              <span className="flex items-center gap-1"><Clock size={12}/> Processing</span>
              <span className="font-mono text-white">{data.processingTime}t</span>
          </div>
      </div>
    </div>
  );
};

export default memo(EndNode);