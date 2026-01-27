import React, { memo } from 'react';
import { NodeProps } from 'reactflow';
import { AnnotationNodeData } from '../types';
import { useStore } from '../store';
import { StickyNote } from 'lucide-react';

const AnnotationNode = ({ id, data, selected }: NodeProps<AnnotationNodeData>) => {
  const updateNodeData = useStore((state) => state.updateNodeData);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNodeData(id, { label: e.target.value });
  };

  return (
    <div
      className={`relative w-48 min-h-[100px] bg-yellow-100 rounded-lg shadow-md border transition-all duration-200 flex flex-col ${
        selected ? 'border-yellow-400 ring-2 ring-yellow-400/50' : 'border-yellow-200'
      }`}
    >
      <div className="bg-yellow-200/50 px-2 py-1 rounded-t-lg flex items-center gap-1 text-yellow-700">
         <StickyNote size={12} />
         <span className="text-[10px] font-bold uppercase tracking-wider">Note</span>
      </div>
      <textarea 
        className="w-full h-full min-h-[80px] bg-transparent resize-y p-2 text-xs text-slate-700 outline-none leading-relaxed font-medium"
        value={data.label}
        onChange={handleChange}
        placeholder="Add process notes..."
      />
    </div>
  );
};

export default memo(AnnotationNode);