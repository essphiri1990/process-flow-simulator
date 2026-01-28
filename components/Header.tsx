import React, { useRef } from 'react';
import { useStore } from '../store';
import {
  Layers,
  PlusCircle,
  PlayCircle,
  StopCircle,
  StickyNote,
  Save,
  Upload,
  Download,
  Trash2,
  Settings,
  BookOpen,
  FolderOpen,
  ChevronDown
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
    saveFlow,
    loadFlow,
    exportJson,
    importJson,
    loadScenario,
    clearCanvas
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

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
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  return (
    <header className="absolute top-0 left-0 right-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm">
      <div className="flex items-center justify-between h-14 px-4">

        {/* Left: Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-sm">
              <Layers size={18} className="text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold text-slate-800 leading-tight">Process Flow Sim</h1>
              <p className="text-[10px] text-slate-400">Value Stream Modeling</p>
            </div>
          </div>

          {/* Divider */}
          <div className="w-px h-8 bg-slate-200 mx-2 hidden lg:block" />

          {/* Node Tools */}
          <div className="hidden lg:flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={addStartNode}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-white hover:text-emerald-600 hover:shadow-sm transition"
              title="Add Start Node"
            >
              <PlayCircle size={14} className="text-emerald-500" />
              <span className="hidden xl:inline">Start</span>
            </button>
            <button
              onClick={addNode}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-white hover:text-blue-600 hover:shadow-sm transition"
              title="Add Process Node"
            >
              <PlusCircle size={14} className="text-blue-500" />
              <span className="hidden xl:inline">Process</span>
            </button>
            <button
              onClick={addEndNode}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-white hover:text-slate-800 hover:shadow-sm transition"
              title="Add End Node"
            >
              <StopCircle size={14} className="text-slate-600" />
              <span className="hidden xl:inline">End</span>
            </button>
            <button
              onClick={addAnnotation}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-white hover:text-yellow-600 hover:shadow-sm transition"
              title="Add Annotation"
            >
              <StickyNote size={14} className="text-yellow-500" />
              <span className="hidden xl:inline">Note</span>
            </button>
          </div>
        </div>

        {/* Center: Scenario Selector */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition cursor-pointer">
              <BookOpen size={14} className="text-slate-500" />
              <select
                className="bg-transparent text-xs font-medium text-slate-700 outline-none cursor-pointer pr-4 appearance-none"
                onChange={(e) => loadScenario(e.target.value)}
                defaultValue="devops"
              >
                <option value="devops">DevOps Pipeline</option>
                <option value="hospital">Hospital ER Triage</option>
                <option value="manufacturing">Manufacturing Line</option>
                <option value="empty">Empty Canvas</option>
              </select>
              <ChevronDown size={12} className="text-slate-400 absolute right-2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Right: File Operations & Settings */}
        <div className="flex items-center gap-1">
          {/* Quick Save/Load */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-100 p-1 rounded-lg mr-1">
            <button
              onClick={saveFlow}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-white hover:shadow-sm transition"
              title="Quick Save to Browser"
            >
              <Save size={14} />
              <span className="hidden md:inline">Save</span>
            </button>
            <button
              onClick={loadFlow}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-white hover:shadow-sm transition"
              title="Quick Load from Browser"
            >
              <FolderOpen size={14} />
              <span className="hidden md:inline">Load</span>
            </button>
          </div>

          {/* Export/Import */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={exportJson}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
              title="Export as JSON file"
            >
              <Download size={16} />
            </button>
            <button
              onClick={handleImportClick}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
              title="Import JSON file"
            >
              <Upload size={16} />
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
          <div className="w-px h-6 bg-slate-200 mx-1" />

          {/* Clear Canvas */}
          <button
            onClick={() => {
              if (confirm('Clear entire canvas? This cannot be undone.')) clearCanvas();
            }}
            className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition"
            title="Clear Canvas"
          >
            <Trash2 size={16} />
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
            title="Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Mobile: Condensed Node Tools (shown on smaller screens) */}
      <div className="lg:hidden flex items-center justify-center gap-1 px-4 pb-2 -mt-1">
        <button
          onClick={addStartNode}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
        >
          <PlayCircle size={12} className="text-emerald-500" />
          Start
        </button>
        <button
          onClick={addNode}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
        >
          <PlusCircle size={12} className="text-blue-500" />
          Process
        </button>
        <button
          onClick={addEndNode}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
        >
          <StopCircle size={12} className="text-slate-600" />
          End
        </button>
        <button
          onClick={addAnnotation}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
        >
          <StickyNote size={12} className="text-yellow-500" />
          Note
        </button>
      </div>
    </header>
  );
};

export default Header;
