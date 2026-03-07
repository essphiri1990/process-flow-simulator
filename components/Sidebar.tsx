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
  Settings,
  ChevronDown,
  Sparkles,
  X,
} from 'lucide-react';

interface SidebarProps {
  onOpenSettings: () => void;
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onOpenSettings, isOpen, onClose }) => {
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

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/10 z-20"
          onClick={onClose}
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed top-3 left-3 bottom-[80px] w-64 bg-white/95 backdrop-blur-lg border border-slate-200/60 shadow-2xl z-30 flex flex-col rounded-2xl transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-[calc(100%+12px)]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200/50">
              <Layers size={15} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-900 leading-none">Process Flow</h1>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Simulator</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-500 transition-all"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3">

          {/* Node Tools — 2x2 Grid */}
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1 mb-1.5 block">Nodes</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => { addStartNode(); onClose(); }}
                className="group flex flex-col items-center gap-1 py-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-emerald-50 hover:border-emerald-200 active:scale-[0.97] transition-all"
              >
                <PlayCircle size={18} className="text-emerald-500 group-hover:text-emerald-600 transition-colors" />
                <span className="text-[11px] font-medium text-slate-500 group-hover:text-emerald-700">Start</span>
              </button>
              <button
                onClick={() => { addNode(); onClose(); }}
                className="group flex flex-col items-center gap-1 py-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-blue-50 hover:border-blue-200 active:scale-[0.97] transition-all"
              >
                <PlusCircle size={18} className="text-blue-500 group-hover:text-blue-600 transition-colors" />
                <span className="text-[11px] font-medium text-slate-500 group-hover:text-blue-700">Process</span>
              </button>
              <button
                onClick={() => { addEndNode(); onClose(); }}
                className="group flex flex-col items-center gap-1 py-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 hover:border-slate-200 active:scale-[0.97] transition-all"
              >
                <StopCircle size={18} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                <span className="text-[11px] font-medium text-slate-500 group-hover:text-slate-700">End</span>
              </button>
              <button
                onClick={() => { addAnnotation(); onClose(); }}
                className="group flex flex-col items-center gap-1 py-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-amber-50 hover:border-amber-200 active:scale-[0.97] transition-all"
              >
                <StickyNote size={18} className="text-amber-400 group-hover:text-amber-500 transition-colors" />
                <span className="text-[11px] font-medium text-slate-500 group-hover:text-amber-700">Note</span>
              </button>
            </div>
          </div>

          {/* Scenario */}
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1 mb-1.5 block">Scenario</span>
            <div className="relative">
              <select
                className="w-full appearance-none bg-slate-50 border border-slate-100 hover:border-slate-200 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-600 outline-none cursor-pointer hover:bg-slate-100 transition-all pr-8"
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

          {/* Canvas */}
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1 mb-1.5 block">Canvas</span>
            <CanvasManager />
          </div>

          {/* File Actions — Compact Row */}
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1 mb-1.5 block">File</span>
            <div className="flex gap-1.5">
              <button
                onClick={exportJson}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:bg-slate-100 hover:border-slate-200 hover:text-slate-700 active:scale-[0.97] transition-all"
                title="Export JSON"
              >
                <Download size={14} />
                <span className="text-[11px] font-medium">Export</span>
              </button>
              <button
                onClick={handleImportClick}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:bg-slate-100 hover:border-slate-200 hover:text-slate-700 active:scale-[0.97] transition-all"
                title="Import JSON"
              >
                <Upload size={14} />
                <span className="text-[11px] font-medium">Import</span>
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
                className="flex items-center justify-center w-9 py-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:bg-red-50 hover:border-red-200 hover:text-red-500 active:scale-[0.97] transition-all"
                title="Clear Canvas"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-3 pb-3">
          <button
            onClick={() => { onOpenSettings(); onClose(); }}
            className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:bg-slate-100 hover:border-slate-200 hover:text-slate-700 active:scale-[0.97] transition-all"
          >
            <Settings size={14} />
            <span className="text-[11px] font-medium">Settings</span>
          </button>
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
