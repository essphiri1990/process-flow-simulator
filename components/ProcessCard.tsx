import React from 'react';
import { ArrowUpRight, Clock3, FolderOpen, Share2, Trash2 } from 'lucide-react';
import { CanvasMetadata } from '../types';
import ProcessThumbnail from './ProcessThumbnail';

interface ProcessCardProps {
  process: CanvasMetadata;
  onOpen: (id: string) => void;
  onDelete?: (id: string, name: string) => void;
  onShare?: (process: CanvasMetadata) => void;
  canShare?: boolean;
  badgeLabel?: string;
  muted?: boolean;
}

const formatUpdatedAt = (value: number): string => {
  const elapsedMs = Date.now() - value;
  const minutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(elapsedMs / 3600000);
  const days = Math.floor(elapsedMs / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
};

const sourceStyles: Record<CanvasMetadata['source'], string> = {
  cloud: 'bg-blue-50 text-blue-700 border-slate-900',
  local: 'bg-emerald-50 text-emerald-700 border-slate-900',
};

const ProcessCard: React.FC<ProcessCardProps> = ({
  process,
  onOpen,
  onDelete,
  onShare,
  canShare = false,
  badgeLabel,
  muted = false,
}) => {
  const showShareAction = canShare && process.source === 'cloud' && Boolean(process.snapshotId) && Boolean(onShare);

  return (
    <article
      className={`group rounded-2xl border-2 border-slate-900 bg-white p-4 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.9)] transition hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(15,23,42,0.9)] active:translate-y-[2px] active:shadow-[1px_1px_0px_0px_rgba(15,23,42,0.9)] ${
        muted ? 'opacity-90' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`rounded-full border-2 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${sourceStyles[process.source]}`}>
          {process.source}
        </span>
        {badgeLabel ? (
          <span className="rounded-full border-2 border-slate-900 bg-slate-950 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
            {badgeLabel}
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        <ProcessThumbnail
          nodes={process.data?.nodes || []}
          edges={process.data?.edges || []}
          accentClassName={process.source === 'cloud' ? 'from-blue-500/15 via-indigo-500/10 to-cyan-500/10' : 'from-emerald-500/15 via-teal-500/10 to-slate-500/10'}
        />
      </div>

      <div className="mt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-950">{process.name}</h3>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <Clock3 size={12} />
              <span>{formatUpdatedAt(process.updatedAt)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpen(process.id)}
            className="rounded-full border-2 border-slate-900 bg-slate-950 p-2 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,0.9)] transition hover:bg-slate-800 active:translate-y-[1px] active:shadow-none"
            aria-label={`Open ${process.name}`}
            title={`Open ${process.name}`}
          >
            <ArrowUpRight size={14} />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
          <span className="rounded-full border-2 border-slate-300 bg-slate-100 px-2.5 py-1 font-medium">
            {process.nodeCount} nodes
          </span>
          <span className="rounded-full border-2 border-slate-300 bg-slate-100 px-2.5 py-1 font-medium">
            {process.edgeCount} links
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpen(process.id)}
          className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-900 bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,0.9)] transition hover:bg-slate-800 active:translate-y-[2px] active:shadow-[1px_1px_0px_0px_rgba(15,23,42,0.9)]"
        >
          <FolderOpen size={14} />
          Open
        </button>
        {showShareAction ? (
          <button
            type="button"
            onClick={() => onShare?.(process)}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-900 px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-[3px_3px_0px_0px_rgba(15,23,42,0.15)] transition hover:bg-blue-50 hover:text-blue-700 active:translate-y-[2px] active:shadow-[1px_1px_0px_0px_rgba(15,23,42,0.15)]"
          >
            <Share2 size={14} />
            Share
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(process.id, process.name)}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-900 px-3.5 py-2 text-sm font-semibold text-slate-600 shadow-[3px_3px_0px_0px_rgba(15,23,42,0.15)] transition hover:bg-rose-50 hover:text-rose-700 active:translate-y-[2px] active:shadow-[1px_1px_0px_0px_rgba(15,23,42,0.15)]"
          >
            <Trash2 size={14} />
            Delete
          </button>
        ) : null}
      </div>
    </article>
  );
};

export default ProcessCard;
