import React, { useRef, useState } from 'react';
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
  Sparkles
} from 'lucide-react';

interface HeaderProps {
  onOpenSettings: () => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenSettings }) => {
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
    <header className="absolute top-0 left-0 right-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between h-[56px] px-4 lg:px-5">

        {/* Left: Logo & Node Tools */}
        <div className="flex items-center gap-2.5">
          {/* Logo */}
          <div className="flex items-center gap-2.5 pr-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-[10px] flex items-center justify-center shadow-md shadow-indigo-200/50 ring-1 ring-indigo-500/10">
              <Layers size={16} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-[13px] font-semibold text-slate-900 tracking-tight leading-none">Process Flow</h1>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Simulator</p>
            </div>
          </div>

          {/* Divider */}
          <div className="w-px h-7 bg-slate-200 hidden lg:block" />

          {/* Node Tools */}
          <div className="hidden lg:flex items-center gap-0.5 bg-slate-100/80 p-0.5 rounded-lg">
            <button
              onClick={addStartNode}
              className="group flex items-center gap-1.5 px-2.5 py-[7px] rounded-md text-xs font-medium text-slate-500 hover:bg-white hover:text-emerald-600 hover:shadow-sm active:scale-[0.97] transition-all duration-150"
              title="Add Start Node"
            >
              <PlayCircle size={14} className="text-emerald-500 group-hover:text-emerald-600 transition-colors" />
              <span className="hidden xl:inline">Start</span>
            </button>
            <button
              onClick={addNode}
              className="group flex items-center gap-1.5 px-2.5 py-[7px] rounded-md text-xs font-medium text-slate-500 hover:bg-white hover:text-blue-600 hover:shadow-sm active:scale-[0.97] transition-all duration-150"
              title="Add Process Node"
            >
              <PlusCircle size={14} className="text-blue-500 group-hover:text-blue-600 transition-colors" />
              <span className="hidden xl:inline">Process</span>
            </button>
            <button
              onClick={addEndNode}
              className="group flex items-center gap-1.5 px-2.5 py-[7px] rounded-md text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-700 hover:shadow-sm active:scale-[0.97] transition-all duration-150"
              title="Add End Node"
            >
              <StopCircle size={14} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
              <span className="hidden xl:inline">End</span>
            </button>
            <button
              onClick={addAnnotation}
              className="group flex items-center gap-1.5 px-2.5 py-[7px] rounded-md text-xs font-medium text-slate-500 hover:bg-white hover:text-amber-600 hover:shadow-sm active:scale-[0.97] transition-all duration-150"
              title="Add Annotation"
            >
              <StickyNote size={14} className="text-amber-400 group-hover:text-amber-500 transition-colors" />
              <span className="hidden xl:inline">Note</span>
            </button>
          </div>
        </div>

        {/* Center: Scenario Selector */}
        <div className="flex items-center">
          <div className="relative">
            <div className="flex items-center gap-2 bg-slate-100/80 hover:bg-slate-100 border border-transparent hover:border-slate-200/60 px-3 py-[7px] rounded-lg transition-all duration-150 cursor-pointer">
              <Sparkles size={13} className="text-indigo-400" />
              <select
                className="bg-transparent text-xs font-medium text-slate-600 outline-none cursor-pointer pr-5 appearance-none"
                onChange={(e) => {
                  const val = e.target.value;
                  setConfirmAction({
                    title: 'Switch Scenario',
                    message: 'This will replace your current canvas. Any unsaved work will be lost.',
                    confirmLabel: 'Switch',
                    action: () => loadScenario(val),
                  });
                }}
                defaultValue="devops"
              >
                <option value="devops">DevOps Pipeline</option>
                <option value="hospital">Hospital ER Triage</option>
                <option value="manufacturing">Manufacturing Line</option>
                <option value="empty">Empty Canvas</option>
              </select>
              <ChevronDown size={12} className="text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Right: File Operations & Settings */}
        <div className="flex items-center gap-1">
          {/* Canvas Manager */}
          <div className="hidden sm:block mr-1">
            <CanvasManager />
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-slate-200/60 mx-0.5 hidden sm:block" />

          {/* Export/Import */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={exportJson}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:scale-[0.95] transition-all duration-150"
              title="Export as JSON file"
            >
              <Download size={15} />
            </button>
            <button
              onClick={handleImportClick}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:scale-[0.95] transition-all duration-150"
              title="Import JSON file"
            >
              <Upload size={15} />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".json"
            />
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-slate-200/60 mx-0.5" />

          {/* Clear Canvas */}
          <button
            onClick={() => {
              setConfirmAction({
                title: 'Clear Canvas',
                message: 'This will remove all nodes, edges, and simulation data. This cannot be undone.',
                confirmLabel: 'Clear All',
                action: () => clearCanvas(),
              });
            }}
            className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 active:scale-[0.95] transition-all duration-150"
            title="Clear Canvas"
          >
            <Trash2 size={15} />
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:scale-[0.95] transition-all duration-150"
            title="Settings"
          >
            <Settings size={15} />
          </button>
        </div>
      </div>

      {/* Mobile: Condensed Node Tools */}
      <div className="lg:hidden flex items-center justify-center gap-1 px-4 pb-2 -mt-0.5">
        <div className="flex items-center gap-0.5 bg-slate-100/80 p-0.5 rounded-lg">
          <button
            onClick={addStartNode}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-500 hover:bg-white hover:text-emerald-600 active:scale-[0.97] transition-all duration-150"
          >
            <PlayCircle size={12} className="text-emerald-500" />
            Start
          </button>
          <button
            onClick={addNode}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-500 hover:bg-white hover:text-blue-600 active:scale-[0.97] transition-all duration-150"
          >
            <PlusCircle size={12} className="text-blue-500" />
            Process
          </button>
          <button
            onClick={addEndNode}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-700 active:scale-[0.97] transition-all duration-150"
          >
            <StopCircle size={12} className="text-slate-400" />
            End
          </button>
          <button
            onClick={addAnnotation}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-500 hover:bg-white hover:text-amber-600 active:scale-[0.97] transition-all duration-150"
          >
            <StickyNote size={12} className="text-amber-400" />
            Note
          </button>
        </div>
      </div>

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
    </header>
  );
};

export default Header;
