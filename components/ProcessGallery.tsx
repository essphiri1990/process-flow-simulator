import React, { useMemo, useRef } from 'react';
import {
  Activity,
  Coffee,
  Factory,
  FileUp,
  FolderPlus,
  Layers3,
  Plus,
  Stethoscope,
  Workflow,
} from 'lucide-react';
import { AppNode, CanvasMetadata } from '../types';
import { Edge } from 'reactflow';
import ProcessCard from './ProcessCard';
import ProcessThumbnail from './ProcessThumbnail';

interface CurrentDraftCard {
  name: string;
  nodes: AppNode[];
  edges: Edge[];
}

interface ProcessGalleryProps {
  savedProcesses: CanvasMetadata[];
  currentDraft: CurrentDraftCard | null;
  lastOpenedProcessId: string | null;
  onResumeCurrent: () => void;
  onOpenProcess: (id: string) => void;
  onCreateBlank: () => void;
  onCreateTemplate: (scenarioKey: string) => void;
  onImportJson: (fileContent: string) => void;
  onDeleteProcess: (id: string, name: string) => void;
}

const TEMPLATE_CARDS = [
  {
    key: 'coffee',
    title: 'Coffee Service',
    description: 'Simple, fast flow for showing lead time, queueing, and service rate.',
    icon: Coffee,
    className: 'from-amber-300/20 via-orange-400/15 to-rose-400/10',
  },
  {
    key: 'devops',
    title: 'DevOps Pipeline',
    description: 'A software delivery flow with rework loops and constrained review capacity.',
    icon: Workflow,
    className: 'from-blue-400/20 via-indigo-500/15 to-cyan-400/10',
  },
  {
    key: 'hospital',
    title: 'Hospital ER',
    description: 'A more branched service system with triage, parallel demand, and bottlenecks.',
    icon: Stethoscope,
    className: 'from-emerald-400/20 via-teal-500/15 to-sky-400/10',
  },
  {
    key: 'manufacturing',
    title: 'Manufacturing',
    description: 'Physical production flow with high volume, inspection, and scrap decisions.',
    icon: Factory,
    className: 'from-slate-400/20 via-stone-500/15 to-amber-400/10',
  },
];

const ProcessGallery: React.FC<ProcessGalleryProps> = ({
  savedProcesses,
  currentDraft,
  lastOpenedProcessId,
  onResumeCurrent,
  onOpenProcess,
  onCreateBlank,
  onCreateTemplate,
  onImportJson,
  onDeleteProcess,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lastOpenedProcess = useMemo(
    () => savedProcesses.find((process) => process.id === lastOpenedProcessId) || null,
    [lastOpenedProcessId, savedProcesses],
  );

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const fileContent = loadEvent.target?.result;
      if (typeof fileContent === 'string') {
        onImportJson(fileContent);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_48%,#f8fafc_100%)] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[32px] border border-white/60 bg-white/80 px-6 py-6 shadow-[0_22px_60px_rgba(15,23,42,0.08)] backdrop-blur-md">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-300/40">
                  <Layers3 size={20} />
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Process Gallery
                </span>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Pick up an existing process or start a new simulation workspace.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                Saved processes live here as cards so you can reopen previous work, jump into a template, or import a process JSON without landing directly in the editor first.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={onCreateBlank}
                className="rounded-[24px] bg-slate-950 px-4 py-4 text-left text-white transition hover:bg-slate-800"
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Plus size={16} />
                  New Blank
                </div>
                <div className="mt-2 text-xs text-slate-300">Start from an empty canvas.</div>
              </button>
              <button
                type="button"
                onClick={handleImportClick}
                className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FileUp size={16} />
                  Import JSON
                </div>
                <div className="mt-2 text-xs text-slate-500">Open a process exported from the editor.</div>
              </button>
              <button
                type="button"
                onClick={() => onCreateTemplate('coffee')}
                className="rounded-[24px] border border-blue-200 bg-blue-50 px-4 py-4 text-left transition hover:border-blue-300 hover:bg-blue-100/70"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-950">
                  <Coffee size={16} />
                  Quick Demo
                </div>
                <div className="mt-2 text-xs text-blue-700">Jump straight into the coffee scenario.</div>
              </button>
            </div>
          </div>
        </header>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              <Activity size={14} />
              Continue
            </div>

            {currentDraft ? (
              <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-semibold text-slate-950">{currentDraft.name}</div>
                    <p className="mt-2 max-w-xl text-sm text-slate-600">
                      Resume the process currently sitting in the editor. Leaving the gallery does not reset the canvas.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="rounded-full bg-white px-2.5 py-1 font-medium">{currentDraft.nodes.length} nodes</span>
                      <span className="rounded-full bg-white px-2.5 py-1 font-medium">{currentDraft.edges.length} links</span>
                    </div>
                    <button
                      type="button"
                      onClick={onResumeCurrent}
                      className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      <FolderPlus size={14} />
                      Resume Current Process
                    </button>
                  </div>

                  <div className="w-full max-w-sm">
                    <ProcessThumbnail
                      nodes={currentDraft.nodes}
                      edges={currentDraft.edges}
                      accentClassName="from-slate-500/15 via-blue-500/10 to-emerald-500/10"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[24px] border border-dashed border-slate-300 bg-slate-50/70 px-5 py-6 text-sm text-slate-500">
                No editor session is open yet. Start from a blank process, a template, or one of your saved cards below.
              </div>
            )}
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Resume Last</div>
            {lastOpenedProcess ? (
              <div className="mt-4">
                <ProcessCard
                  process={lastOpenedProcess}
                  onOpen={onOpenProcess}
                  onDelete={onDeleteProcess}
                  badgeLabel="Last Opened"
                  muted
                />
              </div>
            ) : (
              <div className="mt-4 rounded-[24px] border border-dashed border-slate-300 bg-slate-50/70 px-5 py-6 text-sm text-slate-500">
                No previous saved process has been opened on this device yet.
              </div>
            )}
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Recent Processes</h2>
              <p className="mt-1 text-sm text-slate-500">Latest saved workspaces from Process Box cloud save or local browser storage.</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              {savedProcesses.length} saved
            </span>
          </div>

          {savedProcesses.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {savedProcesses.map((process) => (
                <ProcessCard
                  key={process.id}
                  process={process}
                  onOpen={onOpenProcess}
                  onDelete={onDeleteProcess}
                  badgeLabel={process.id === lastOpenedProcessId ? 'Recent' : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[28px] border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center shadow-[0_18px_48px_rgba(15,23,42,0.04)]">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <Layers3 size={22} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">No saved processes yet</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">
                Create a process and save it from the editor. It will come back here as a reusable card.
              </p>
            </div>
          )}
        </section>

        <section className="mt-8 pb-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Templates</h2>
            <p className="mt-1 text-sm text-slate-500">Curated starting points for common process teaching scenarios.</p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {TEMPLATE_CARDS.map((template) => {
              const Icon = template.icon;
              return (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => onCreateTemplate(template.key)}
                  className={`group rounded-[28px] border border-slate-200 bg-gradient-to-br ${template.className} p-5 text-left shadow-[0_16px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(15,23,42,0.1)]`}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 text-slate-900 shadow-sm">
                    <Icon size={20} />
                  </div>
                  <div className="mt-6 text-lg font-semibold text-slate-950">{template.title}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{template.description}</p>
                  <div className="mt-4 text-sm font-semibold text-slate-950">Open template</div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ProcessGallery;
