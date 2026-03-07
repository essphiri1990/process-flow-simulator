import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from 'reactflow';
import { X } from 'lucide-react';

import { useStore } from '../store';
import { VisualTransfer } from '../types';

const EdgeTransferToken: React.FC<{
  transfer: VisualTransfer;
  edgePath: string;
  color: string;
  shape: 'circle' | 'square' | 'rounded';
}> = ({ transfer, edgePath, color, shape }) => {
  const motionRef = useRef<any>(null);

  useEffect(() => {
    motionRef.current?.beginElement?.();
  }, []);

  return (
    <g opacity="0.95" pointerEvents="none">
      <animateMotion
        ref={motionRef}
        dur={`${transfer.durationMs}ms`}
        path={edgePath}
        begin="indefinite"
        fill="freeze"
      />
      {shape === 'square' ? (
        <rect
          x="-5"
          y="-5"
          width="10"
          height="10"
          fill={color}
          stroke="white"
          strokeWidth="1.5"
        />
      ) : shape === 'rounded' ? (
        <rect
          x="-5"
          y="-5"
          width="10"
          height="10"
          rx="3"
          fill={color}
          stroke="white"
          strokeWidth="1.5"
        />
      ) : (
        <circle
          r="5"
          fill={color}
          stroke="white"
          strokeWidth="1.5"
        />
      )}
    </g>
  );
};

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
  const deleteEdge = useStore((state) => state.deleteEdge);
  const updateEdgeData = useStore((state) => state.updateEdgeData);
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const itemConfig = useStore((state) => state.itemConfig);
  const visualTransfers = useStore((state) => state.visualTransfers);

  const currentEdge = edges.find((edge) => edge.id === id);
  const customOffset = (currentEdge as any)?.data?.offset;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
    ...(customOffset !== undefined && { offset: customOffset }),
  });

  const percentageLabel = useMemo(() => {
    const sourceNode = nodes.find((node) => node.id === source);
    const outgoingEdges = edges.filter((edge) => edge.source === source);

    if (sourceNode && outgoingEdges.length > 1) {
      const weights = (sourceNode.data as import('../types').ProcessNodeData).routingWeights || {};
      const weight = weights[target] ?? 1;
      const totalWeight = outgoingEdges.reduce((sum, edge) => sum + (weights[edge.target] ?? 1), 0);
      return `${Math.round((weight / totalWeight) * 100)}%`;
    }

    return null;
  }, [edges, nodes, source, target]);

  const edgeTransfers = useMemo(
    () =>
      visualTransfers.filter(
        (transfer) => transfer.sourceNodeId === source && transfer.targetNodeId === target
      ),
    [source, target, visualTransfers]
  );

  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ y: number; startOffset: number } | null>(null);

  const handleDragStart = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const startY = event.clientY;
    const startOffset = customOffset ?? 20;
    dragStartRef.current = { y: startY, startOffset };
    setIsDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartRef.current) return;
      const deltaY = moveEvent.clientY - dragStartRef.current.y;
      const nextOffset = Math.max(0, Math.round(dragStartRef.current.startOffset + deltaY));
      updateEdgeData(id, { offset: nextOffset });
    };

    const handleMouseUp = () => {
      dragStartRef.current = null;
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [customOffset, id, updateEdgeData]);

  return (
    <>
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />

      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected || isHovered ? 3 : 2,
          stroke: selected ? '#3b82f6' : isHovered ? '#64748b' : '#94a3b8',
          transition: 'stroke-width 0.2s, stroke 0.2s',
        }}
      />

      {edgeTransfers.map((transfer) => (
        <EdgeTransferToken
          key={transfer.id}
          transfer={transfer}
          edgePath={edgePath}
          color={itemConfig.color}
          shape={itemConfig.shape}
        />
      ))}

      {(selected || isHovered) && (
        <>
          <g style={{ transform: `translate(${sourceX}px, ${sourceY}px)` }}>
            <circle
              r="6"
              fill="#3b82f6"
              stroke="white"
              strokeWidth="2"
              style={{ cursor: 'grab', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' }}
            />
          </g>
          <g style={{ transform: `translate(${targetX}px, ${targetY}px)` }}>
            <circle
              r="6"
              fill="#3b82f6"
              stroke="white"
              strokeWidth="2"
              style={{ cursor: 'grab', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' }}
            />
          </g>
        </>
      )}

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
            <div className="bg-white text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-300 shadow-sm">
              {percentageLabel}
            </div>
          )}

          {selected && (
            <div
              onMouseDown={handleDragStart}
              className={`w-6 h-6 rounded-full flex items-center justify-center shadow-md border-2 border-white transition-colors ${
                isDragging ? 'bg-blue-600 scale-110' : 'bg-blue-500 hover:bg-blue-600 hover:scale-110'
              }`}
              style={{ cursor: 'ns-resize' }}
              title="Drag up/down to adjust bend height"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 1L3 3.5H7L5 1Z" fill="white" />
                <path d="M5 9L3 6.5H7L5 9Z" fill="white" />
              </svg>
            </div>
          )}

          <div className={`transition-opacity duration-200 ${selected ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}>
            <button
              className="w-5 h-5 bg-red-500 rounded-full text-white flex items-center justify-center shadow hover:bg-red-600 hover:scale-110 transition"
              onClick={(event) => {
                event.stopPropagation();
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
