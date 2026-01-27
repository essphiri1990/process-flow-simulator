import React, { memo, useMemo } from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath } from 'reactflow';
import { useStore } from '../store';
import { ItemStatus } from '../types';
import { X } from 'lucide-react';

// Cubic Bezier interpolation function
function getBezierPoint(t: number, p0: number, p1: number, p2: number, p3: number) {
  const cX = 3 * (p1 - p0);
  const bX = 3 * (p2 - p1) - cX;
  const aX = p3 - p0 - cX - bX;

  const x = (aX * Math.pow(t, 3)) + (bX * Math.pow(t, 2)) + (cX * t) + p0;
  return x;
}

const ProcessEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  source,
  target,
  selected
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const deleteEdge = useStore((state) => state.deleteEdge);
  const items = useStore((state) => state.items);
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const itemConfig = useStore((state) => state.itemConfig);

  // Memoize routing percentage calculation
  const percentageLabel = useMemo(() => {
    const sourceNode = nodes.find(n => n.id === source);
    const outgoingEdges = edges.filter(e => e.source === source);

    if (sourceNode && outgoingEdges.length > 1) {
      const weights = sourceNode.data.routingWeights || {};
      const weight = weights[target] ?? 1;
      const totalWeight = outgoingEdges.reduce((sum, e) => sum + (weights[e.target] ?? 1), 0);
      return `${Math.round((weight / totalWeight) * 100)}%`;
    }
    return null;
  }, [nodes, edges, source, target]);

  // Filter transit items for this specific edge
  const transitItems = useMemo(() => {
    const result = [];
    for (const item of items) {
      if (item.status === ItemStatus.TRANSIT && item.fromNodeId === source && item.currentNodeId === target) {
        result.push(item);
      }
    }
    return result;
  }, [items, source, target]);

  const dist = Math.abs(targetX - sourceX);
  const controlOffset = dist * 0.5; 
  const p1x = sourceX + controlOffset;
  const p1y = sourceY;
  const p2x = targetX - controlOffset;
  const p2y = targetY;

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ ...style, strokeWidth: 2, stroke: selected ? '#3b82f6' : '#94a3b8' }} />
      
      {/* Transit Items Visualization */}
      {transitItems.map((item) => {
        const t = item.transitProgress; // 0 to 1
        const x = getBezierPoint(t, sourceX, p1x, p2x, targetX);
        const y = getBezierPoint(t, sourceY, p1y, p2y, targetY);

        return (
          <g key={item.id} style={{ transform: `translate(${x}px, ${y}px)` }}>
            {itemConfig.shape === 'square' ? (
                <rect 
                    x="-5" y="-5" width="10" height="10" 
                    fill={itemConfig.color} 
                    stroke="white" 
                    strokeWidth="1"
                />
            ) : (
                <circle
                    r="5"
                    fill={itemConfig.color}
                    stroke="white"
                    strokeWidth="1"
                />
            )}
          </g>
        );
      })}

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="flex flex-col items-center gap-1"
        >
          {percentageLabel && (
            <div className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-300 shadow-sm">
                {percentageLabel}
            </div>
          )}

          <div className={`transition-opacity duration-200 ${selected ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}>
            <button
                className="w-5 h-5 bg-red-500 rounded-full text-white flex items-center justify-center shadow hover:bg-red-600 hover:scale-110 transition"
                onClick={(evt) => {
                evt.stopPropagation();
                deleteEdge(id);
                }}
                title="Delete Connection"
            >
                <X size={12} />
            </button>
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

export default memo(ProcessEdge);