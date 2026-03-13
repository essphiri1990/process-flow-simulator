import React, { useRef, useState, useEffect } from 'react';
import { useStore } from '../store';
import ConfirmDialog from './ConfirmDialog';
import CanvasManager from './CanvasManager';
import {
  Layers,
  PlusCircle,
  PlayCircle,
  StopCircle,
  StickyNote,
  Upload,
  Download,
  Trash2,
  ChevronDown,
  X,
} from 'lucide-react';

interface SidebarProps {
  onOpenSettings: () => void;
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const {
    addNode,
    addStartNode,
    addEndNode,
    addAnnotation,
    exportJson,
    importJson,
    loadScenario,
    clearCanvas
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    action: () => void;
  } | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      importJson(content);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 mb-2">{children}</div>
  );

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-[#0f172a]/12 z-40"
          onClick={onClose}
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed top-3 left-3 bottom-[80px] w-64 bg-white border-2 border-slate-900 z-50 flex flex-col rounded-2xl transform transition-all duration-300 ease-in-out ${
          isOpen
            ? 'translate-x-0 opacity-100 shadow-[6px_6px_0px_0px_rgba(15,23,42,0.9)]'
            : '-translate-x-[calc(100%+24px)] opacity-0 pointer-events-none shadow-none'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-slate-900 bg-slate-50 px-4 py-3 flex-shrink-0 rounded-t-[14px]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border-2 border-slate-900 bg-white shadow-[2px_2px_0px_0px_rgba(15,23,42,0.9)]">
              <Layers size={15} className="text-slate-900" strokeWidth={2.6} />
            </div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-[0.08em] text-slate-900 leading-none">Process Flow</h1>
              <p className="text-[10px] text-slate-400 mt-0.5 font-bold uppercase tracking-[0.1em]">Simulator</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border-2 border-slate-900 bg-white p-1.5 text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700 active:translate-y-[1px]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* Nodes — Primary action area */}
          <div>
            <SectionLabel>Add Node</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { addStartNode(); onClose(); }}
                className="group flex flex-col items-center gap-2 rounded-xl border-2 border-slate-200 bg-white py-4 transition-all hover:border-slate-900 hover:shadow-[2px_2px_0px_0px_rgba(15,23,42,0.9)] hover:-translate-y-0.5 active:translate-y-[1px] active:shadow-none"
              >
                <PlayCircle size={28} className="text-emerald-500" strokeWidth={1.8} />
                <span className="text-xs font-bold text-slate-500 group-hover:text-slate-700">Start</span>
              </button>
              <button
                onClick={() => { addNode(); onClose(); }}
                className="group flex flex-col items-center gap-2 rounded-xl border-2 border-slate-200 bg-white py-4 transition-all hover:border-slate-900 hover:shadow-[2px_2px_0px_0px_rgba(15,23,42,0.9)] hover:-translate-y-0.5 active:translate-y-[1px] active:shadow-none"
              >
                <PlusCircle size={28} className="text-blue-500" strokeWidth={1.8} />
                <span className="text-xs font-bold text-slate-500 group-hover:text-slate-700">Process</span>
              </button>
              <button
                onClick={() => { addEndNode(); onClose(); }}
                className="group flex flex-col items-center gap-2 rounded-xl border-2 border-slate-200 bg-white py-4 transition-all hover:border-slate-900 hover:shadow-[2px_2px_0px_0px_rgba(15,23,42,0.9)] hover:-translate-y-0.5 active:translate-y-[1px] active:shadow-none"
              >
                <StopCircle size={28} className="text-slate-400" strokeWidth={1.8} />
                <span className="text-xs font-bold text-slate-500 group-hover:text-slate-700">End</span>
              </button>
              <button
                onClick={() => { addAnnotation(); onClose(); }}
                className="group flex flex-col items-center gap-2 rounded-xl border-2 border-slate-200 bg-white py-4 transition-all hover:border-slate-900 hover:shadow-[2px_2px_0px_0px_rgba(15,23,42,0.9)] hover:-translate-y-0.5 active:translate-y-[1px] active:shadow-none"
              >
                <StickyNote size={28} className="text-amber-400" strokeWidth={1.8} />
                <span className="text-xs font-bold text-slate-500 group-hover:text-slate-700">Note</span>
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100" />

          {/* Scenario */}
          <div>
            <SectionLabel>Scenario</SectionLabel>
            <div className="relative">
              <select
                className="w-full appearance-none rounded-xl border-2 border-slate-900 bg-white px-3 py-2 pr-8 text-xs font-bold text-slate-700 outline-none cursor-pointer transition-all hover:bg-slate-50"
                onChange={(e) => {
                  const val = e.target.value;
                  setConfirmAction({
                    title: 'Switch Scenario',
                    message: 'This will replace your current canvas. Any unsaved work will be lost.',
                    confirmLabel: 'Switch',
                    action: () => { loadScenario(val); onClose(); },
                  });
                }}
                defaultValue="devops"
              >
                <option value="devops">DevOps Pipeline</option>
                <option value="coffee">Coffee Service</option>
                <option value="hospital">Hospital ER Triage</option>
                <option value="manufacturing">Manufacturing Line</option>
                <option value="empty">Empty Canvas</option>
              </select>
              <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100" />

          {/* Canvas */}
          <div>
            <SectionLabel>Canvas</SectionLabel>
            <CanvasManager />
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100" />

          {/* File */}
          <div>
            <SectionLabel>File</SectionLabel>
            <div className="flex gap-2">
              <button
                onClick={exportJson}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border-2 border-slate-900 bg-white py-2 text-slate-600 transition-all hover:bg-slate-50 hover:-translate-y-0.5 active:translate-y-[1px]"
                title="Export JSON"
              >
                <Download size={13} />
                <span className="text-[11px] font-bold">Export</span>
              </button>
              <button
                onClick={handleImportClick}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border-2 border-slate-900 bg-white py-2 text-slate-600 transition-all hover:bg-slate-50 hover:-translate-y-0.5 active:translate-y-[1px]"
                title="Import JSON"
              >
                <Upload size={13} />
                <span className="text-[11px] font-bold">Import</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".json"
              />
              <button
                onClick={() => {
                  setConfirmAction({
                    title: 'Clear Canvas',
                    message: 'This will remove all nodes, edges, and simulation data. This cannot be undone.',
                    confirmLabel: 'Clear All',
                    action: () => { clearCanvas(); onClose(); },
                  });
                }}
                className="flex items-center justify-center w-9 rounded-xl border-2 border-slate-200 bg-white py-2 text-slate-400 transition-all hover:border-red-300 hover:text-red-500 hover:bg-red-50 active:translate-y-[1px]"
                title="Clear Canvas"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </div>

      </aside>

      {/* Confirm Dialog */}
      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          variant="warning"
          onConfirm={() => {
            confirmAction.action();
            setConfirmAction(null);
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </>
  );
};

export default Sidebar;
