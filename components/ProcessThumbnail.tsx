import React, { useId } from 'react';
import { Edge } from 'reactflow';
import { AppNode } from '../types';

interface ProcessThumbnailProps {
  nodes: AppNode[];
  edges: Edge[];
  accentClassName?: string;
}

const WIDTH = 240;
const HEIGHT = 120;
const PADDING = 18;

const ProcessThumbnail: React.FC<ProcessThumbnailProps> = ({
  nodes,
  edges,
  accentClassName = 'from-indigo-500/10 via-blue-500/10 to-cyan-500/10',
}) => {
  const patternId = useId();
  const renderableNodes = nodes.filter((node) => node.type !== 'annotationNode');

  if (renderableNodes.length === 0) {
    return (
      <div className={`relative h-32 overflow-hidden rounded-xl border-2 border-slate-900 bg-gradient-to-br ${accentClassName}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.65),_transparent_45%)]" />
        <div className="absolute inset-4 rounded-lg border-2 border-dashed border-slate-400 bg-white/50" />
        <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-slate-500">
          Blank canvas
        </div>
      </div>
    );
  }

  const xs = renderableNodes.map((node) => node.position.x);
  const ys = renderableNodes.map((node) => node.position.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scaleX = (WIDTH - PADDING * 2) / spanX;
  const scaleY = (HEIGHT - PADDING * 2) / spanY;
  const scale = Math.min(scaleX, scaleY);

  const project = (node: AppNode) => ({
    x: PADDING + (node.position.x - minX) * scale,
    y: PADDING + (node.position.y - minY) * scale,
  });

  const projectedNodes = new Map(renderableNodes.map((node) => [node.id, project(node)]));
  const renderableEdges = edges.filter(
    (edge) => projectedNodes.has(edge.source) && projectedNodes.has(edge.target),
  );

  return (
    <div className={`relative h-32 overflow-hidden rounded-xl border-2 border-slate-900 bg-gradient-to-br ${accentClassName}`}>
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.82),rgba(255,255,255,0.45))]" />
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="relative z-10 h-full w-full"
        role="img"
        aria-label="Process preview"
      >
        <defs>
          <pattern id={patternId} width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width={WIDTH} height={HEIGHT} fill={`url(#${patternId})`} />

        {renderableEdges.map((edge) => {
          const source = projectedNodes.get(edge.source);
          const target = projectedNodes.get(edge.target);
          if (!source || !target) return null;
          return (
            <line
              key={edge.id}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke="rgba(71,85,105,0.35)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          );
        })}

        {renderableNodes.map((node) => {
          const point = projectedNodes.get(node.id);
          if (!point) return null;

          if (node.type === 'startNode') {
            return (
              <circle
                key={node.id}
                cx={point.x}
                cy={point.y}
                r="7"
                fill="#10b981"
                stroke="white"
                strokeWidth="2"
              />
            );
          }

          if (node.type === 'endNode') {
            return (
              <circle
                key={node.id}
                cx={point.x}
                cy={point.y}
                r="7"
                fill="#0f172a"
                stroke="white"
                strokeWidth="2"
              />
            );
          }

          return (
            <rect
              key={node.id}
              x={point.x - 10}
              y={point.y - 7}
              width="20"
              height="14"
              rx="5"
              fill="#3b82f6"
              stroke="white"
              strokeWidth="2"
            />
          );
        })}
      </svg>
    </div>
  );
};

export default ProcessThumbnail;
