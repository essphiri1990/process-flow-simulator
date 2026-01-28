import React, { memo, useMemo, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from 'reactflow';
import { useStore } from '../store';
import { ItemStatus } from '../types';
import { X, GripVertical } from 'lucide-react';

// Parse SVG path string into line segments (handles M, L, H, V, Q commands)
interface PathSegment {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  length: number;
}

function parsePathToSegments(pathString: string): PathSegment[] {
  const segments: PathSegment[] = [];

  // Split path into commands - match command letter followed by numbers/commas/spaces
  const commandRegex = /([MLHVQCZ])([^MLHVQCZ]*)/gi;
  const commands: { type: string; args: number[] }[] = [];

  let match;
  while ((match = commandRegex.exec(pathString)) !== null) {
    const type = match[1].toUpperCase();
    const argsStr = match[2].trim();
    const args = argsStr ? argsStr.split(/[\s,]+/).map(Number).filter(n => !isNaN(n)) : [];
    commands.push({ type, args });
  }

  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;

  for (const cmd of commands) {
    const { type, args } = cmd;

    switch (type) {
      case 'M': // Move to
        currentX = args[0];
        currentY = args[1];
        startX = currentX;
        startY = currentY;
        break;

      case 'L': // Line to
        {
          const endX = args[0];
          const endY = args[1];
          const length = Math.sqrt((endX - currentX) ** 2 + (endY - currentY) ** 2);
          if (length > 0) {
            segments.push({ startX: currentX, startY: currentY, endX, endY, length });
          }
          currentX = endX;
          currentY = endY;
        }
        break;

      case 'H': // Horizontal line to
        {
          const endX = args[0];
          const length = Math.abs(endX - currentX);
          if (length > 0) {
            segments.push({ startX: currentX, startY: currentY, endX, endY: currentY, length });
          }
          currentX = endX;
        }
        break;

      case 'V': // Vertical line to
        {
          const endY = args[0];
          const length = Math.abs(endY - currentY);
          if (length > 0) {
            segments.push({ startX: currentX, startY: currentY, endX: currentX, endY, length });
          }
          currentY = endY;
        }
        break;

      case 'Q': // Quadratic bezier (approximate as line for simplicity)
        {
          // Q has control point (args[0], args[1]) and end point (args[2], args[3])
          const endX = args[2];
          const endY = args[3];
          const length = Math.sqrt((endX - currentX) ** 2 + (endY - currentY) ** 2);
          if (length > 0) {
            segments.push({ startX: currentX, startY: currentY, endX, endY, length });
          }
          currentX = endX;
          currentY = endY;
        }
        break;

      case 'C': // Cubic bezier (approximate as line)
        {
          // C has two control points and end point
          const endX = args[4];
          const endY = args[5];
          const length = Math.sqrt((endX - currentX) ** 2 + (endY - currentY) ** 2);
          if (length > 0) {
            segments.push({ startX: currentX, startY: currentY, endX, endY, length });
          }
          currentX = endX;
          currentY = endY;
        }
        break;

      case 'Z': // Close path
        {
          const length = Math.sqrt((startX - currentX) ** 2 + (startY - currentY) ** 2);
          if (length > 0) {
            segments.push({ startX: currentX, startY: currentY, endX: startX, endY: startY, length });
          }
          currentX = startX;
          currentY = startY;
        }
        break;
    }
  }

  return segments;
}

// Get point along parsed path at position t (0 to 1)
function getPointAlongPath(segments: PathSegment[], t: number): { x: number; y: number } {
  if (segments.length === 0) return { x: 0, y: 0 };

  t = Math.max(0, Math.min(1, t));

  const totalLength = segments.reduce((sum, seg) => sum + seg.length, 0);
  if (totalLength === 0) return { x: segments[0].startX, y: segments[0].startY };

  const targetDist = t * totalLength;
  let distTraveled = 0;

  for (const seg of segments) {
    if (distTraveled + seg.length >= targetDist) {
      // This is the segment containing our point
      const segT = (targetDist - distTraveled) / seg.length;
      return {
        x: seg.startX + (seg.endX - seg.startX) * segT,
        y: seg.startY + (seg.endY - seg.startY) * segT
      };
    }
    distTraveled += seg.length;
  }

  // Return end point if we somehow exceed
  const lastSeg = segments[segments.length - 1];
  return { x: lastSeg.endX, y: lastSeg.endY };
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
  // Use orthogonal (step) path instead of bezier for clean, professional look
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8, // Slightly rounded corners for a polished look
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

  // Parse the actual SVG path once for accurate item positioning
  const pathSegments = useMemo(() => parsePathToSegments(edgePath), [edgePath]);

  // Hover state for showing reconnection indicators
  const [isHovered, setIsHovered] = useState(false);

  return (
    <>
      {/* Invisible wider path for easier selection/hover */}
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

      {/* Reconnection endpoint indicators - visible on hover/selection */}
      {(selected || isHovered) && (
        <>
          {/* Source endpoint indicator */}
          <g style={{ transform: `translate(${sourceX}px, ${sourceY}px)` }}>
            <circle
              r="6"
              fill="#3b82f6"
              stroke="white"
              strokeWidth="2"
              style={{ cursor: 'grab', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' }}
            />
          </g>
          {/* Target endpoint indicator */}
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

      {/* Transit Items Visualization - follows the actual rendered path */}
      {transitItems.map((item) => {
        const t = item.transitProgress; // 0 to 1
        const pos = getPointAlongPath(pathSegments, t);

        return (
          <g key={item.id} style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
            {itemConfig.shape === 'square' ? (
                <rect
                    x="-5" y="-5" width="10" height="10"
                    fill={itemConfig.color}
                    stroke="white"
                    strokeWidth="1.5"
                    rx="1"
                />
            ) : itemConfig.shape === 'rounded' ? (
                <rect
                    x="-5" y="-5" width="10" height="10"
                    fill={itemConfig.color}
                    stroke="white"
                    strokeWidth="1.5"
                    rx="3"
                />
            ) : (
                <circle
                    r="5"
                    fill={itemConfig.color}
                    stroke="white"
                    strokeWidth="1.5"
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
            <div className="bg-white text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-300 shadow-sm">
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
