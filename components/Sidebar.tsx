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
        className={`fixed top-0 left-0 bottom-0 w-72 bg-white/95 backdrop-blur-md border-r border-slate-200/60 shadow-xl z-30 flex flex-col transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header: Logo + Close */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-[10px] flex items-center justify-center shadow-md shadow-indigo-200/50 ring-1 ring-indigo-500/10">
              <Layers size={16} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-[13px] font-semibold text-slate-900 tracking-tight leading-none">Process Flow</h1>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Simulator</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all duration-150"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Node Tools */}
          <div className="px-4 py-3 border-b border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">Node Tools</span>
            <div className="space-y-0.5">
              <button
                onClick={() => { addStartNode(); onClose(); }}
                className="group flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 active:scale-[0.98] transition-all duration-150"
              >
                <PlayCircle size={16} className="text-emerald-500 group-hover:text-emerald-600 transition-colors" />
                Start
              </button>
              <button
                onClick={() => { addNode(); onClose(); }}
                className="group flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700 active:scale-[0.98] transition-all duration-150"
              >
                <PlusCircle size={16} className="text-blue-500 group-hover:text-blue-600 transition-colors" />
                Process
              </button>
              <button
                onClick={() => { addEndNode(); onClose(); }}
                className="group flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 active:scale-[0.98] transition-all duration-150"
              >
                <StopCircle size={16} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                End
              </button>
              <button
                onClick={() => { addAnnotation(); onClose(); }}
                className="group flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-amber-50 hover:text-amber-700 active:scale-[0.98] transition-all duration-150"
              >
                <StickyNote size={16} className="text-amber-400 group-hover:text-amber-500 transition-colors" />
                Note
              </button>
            </div>
          </div>

          {/* Scenario Selector */}
          <div className="px-4 py-3 border-b border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">Scenario</span>
            <div className="relative">
              <div className="flex items-center gap-2 bg-slate-100/80 hover:bg-slate-100 border border-transparent hover:border-slate-200/60 px-3 py-2 rounded-lg transition-all duration-150 cursor-pointer">
                <Sparkles size={13} className="text-indigo-400" />
                <select
                  className="bg-transparent text-xs font-medium text-slate-600 outline-none cursor-pointer pr-5 appearance-none w-full"
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
                  <option value="hospital">Hospital ER Triage</option>
                  <option value="manufacturing">Manufacturing Line</option>
                  <option value="empty">Empty Canvas</option>
                </select>
                <ChevronDown size={12} className="text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Canvas Manager */}
          <div className="px-4 py-3 border-b border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">Canvas</span>
            <CanvasManager />
          </div>

          {/* File Operations */}
          <div className="px-4 py-3 border-b border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">File</span>
            <div className="space-y-0.5">
              <button
                onClick={exportJson}
                className="group flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 active:scale-[0.98] transition-all duration-150"
              >
                <Download size={16} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                Export JSON
              </button>
              <button
                onClick={handleImportClick}
                className="group flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 active:scale-[0.98] transition-all duration-150"
              >
                <Upload size={16} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                Import JSON
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
                className="group flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-500 active:scale-[0.98] transition-all duration-150"
              >
                <Trash2 size={16} className="text-slate-400 group-hover:text-red-500 transition-colors" />
                Clear Canvas
              </button>
            </div>
          </div>
        </div>

        {/* Footer: Settings */}
        <div className="flex-shrink-0 border-t border-slate-100 px-4 py-3">
          <button
            onClick={() => { onOpenSettings(); onClose(); }}
            className="group flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 active:scale-[0.98] transition-all duration-150"
          >
            <Settings size={16} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
            Settings
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
