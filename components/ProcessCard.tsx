import React from 'react';
import { ArrowUpRight, Clock3, FolderOpen, Trash2 } from 'lucide-react';
import { CanvasMetadata } from '../types';
import ProcessThumbnail from './ProcessThumbnail';

interface ProcessCardProps {
  process: CanvasMetadata;
  onOpen: (id: string) => void;
  onDelete?: (id: string, name: string) => void;
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
  cloud: 'bg-blue-50 text-blue-700 border-blue-100',
  local: 'bg-emerald-50 text-emerald-700 border-emerald-100',
};

const ProcessCard: React.FC<ProcessCardProps> = ({
  process,
  onOpen,
  onDelete,
  badgeLabel,
  muted = false,
}) => {
  return (
    <article
      className={`group rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_20px_48px_rgba(15,23,42,0.12)] ${
        muted ? 'opacity-90' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${sourceStyles[process.source]}`}>
          {process.source}
        </span>
        {badgeLabel ? (
          <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
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
            className="rounded-full bg-slate-950 p-2 text-white transition hover:bg-slate-800"
            aria-label={`Open ${process.name}`}
            title={`Open ${process.name}`}
          >
            <ArrowUpRight size={14} />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium">
            {process.nodeCount} nodes
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium">
            {process.edgeCount} links
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpen(process.id)}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <FolderOpen size={14} />
          Open
        </button>
        {onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(process.id, process.name)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
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
