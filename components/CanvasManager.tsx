import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import ConfirmDialog from './ConfirmDialog';
import {
  ChevronDown,
  Save,
  FilePlus,
  Pencil,
  Trash2,
  FolderOpen,
  Check,
  X,
} from 'lucide-react';

const CanvasManager: React.FC = () => {
  const {
    currentCanvasId,
    currentCanvasName,
    savedCanvasList,
    saveCanvasToDb,
    loadCanvasFromDb,
    newCanvas,
    renameCurrentCanvas,
    deleteCanvasFromDb,
    refreshCanvasList,
  } = useStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isSaveAsMode, setIsSaveAsMode] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    action: () => void;
  } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const saveAsInputRef = useRef<HTMLInputElement>(null);

  // Load canvas list on mount
  useEffect(() => {
    refreshCanvasList();
  }, [refreshCanvasList]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsSaveAsMode(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  // Focus save-as input
  useEffect(() => {
    if (isSaveAsMode && saveAsInputRef.current) {
      saveAsInputRef.current.focus();
    }
  }, [isSaveAsMode]);

  const handleRenameStart = () => {
    setRenameValue(currentCanvasName);
    setIsRenaming(true);
    setIsOpen(false);
  };

  const handleRenameConfirm = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== currentCanvasName) {
      renameCurrentCanvas(trimmed);
    }
    setIsRenaming(false);
  };

  const handleRenameCancel = () => {
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameConfirm();
    if (e.key === 'Escape') handleRenameCancel();
  };

  const handleSave = async () => {
    if (!currentCanvasId) {
      // First save — prompt for name
      setIsSaveAsMode(true);
      setSaveAsName(currentCanvasName === 'Untitled Canvas' ? '' : currentCanvasName);
      return;
    }
    await saveCanvasToDb();
    setIsOpen(false);
  };

  const handleSaveAs = async () => {
    const trimmed = saveAsName.trim();
    if (!trimmed) return;
    // Set the name then save as new
    const store = useStore.getState();
    useStore.setState({ currentCanvasId: null, currentCanvasName: trimmed });
    await store.saveCanvasToDb();
    setIsSaveAsMode(false);
    setIsOpen(false);
  };

  const handleSaveAsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveAs();
    if (e.key === 'Escape') {
      setIsSaveAsMode(false);
      setIsOpen(false);
    }
  };

  const handleNew = () => {
    setConfirmAction({
      title: 'New Canvas',
      message: 'This will clear the current canvas. Any unsaved work will be lost.',
      confirmLabel: 'Create New',
      action: () => {
        newCanvas();
        setIsOpen(false);
      },
    });
  };

  const handleLoad = async (id: string) => {
    setConfirmAction({
      title: 'Load Canvas',
      message: 'This will replace your current canvas. Any unsaved work will be lost.',
      confirmLabel: 'Load',
      action: async () => {
        await loadCanvasFromDb(id);
        setIsOpen(false);
      },
    });
  };

  const handleDelete = (id: string, name: string) => {
    setConfirmAction({
      title: 'Delete Canvas',
      message: `Are you sure you want to delete "${name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      action: async () => {
        await deleteCanvasFromDb(id);
      },
    });
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {/* Canvas Name / Trigger */}
        {isRenaming ? (
          <div className="flex items-center gap-1 bg-white border border-blue-300 rounded-lg px-2 py-1 shadow-sm">
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              className="text-xs font-medium text-slate-700 outline-none w-[140px] bg-transparent"
              maxLength={50}
            />
            <button
              onClick={handleRenameConfirm}
              className="p-0.5 text-emerald-500 hover:text-emerald-600"
            >
              <Check size={14} />
            </button>
            <button
              onClick={handleRenameCancel}
              className="p-0.5 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 bg-slate-100/80 hover:bg-slate-100 border border-transparent hover:border-slate-200/60 px-3 py-[7px] rounded-lg transition-all duration-150"
          >
            <FolderOpen size={13} className="text-indigo-400" />
            <span className="text-xs font-medium text-slate-600 max-w-[160px] truncate">
              {currentCanvasName}
            </span>
            {currentCanvasId && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Saved" />
            )}
            <ChevronDown size={12} className="text-slate-400" />
          </button>
        )}

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute top-full mt-1 left-0 w-[260px] bg-white rounded-xl shadow-xl border border-slate-200 z-[100] overflow-hidden">
            {/* Actions */}
            <div className="p-1.5 border-b border-slate-100">
              <button
                onClick={handleSave}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                <Save size={14} className="text-blue-500" />
                Save
                {!currentCanvasId && <span className="text-slate-400 ml-auto">New</span>}
              </button>
              <button
                onClick={() => {
                  setIsSaveAsMode(true);
                  setSaveAsName('');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                <Save size={14} className="text-slate-400" />
                Save As...
              </button>
              <button
                onClick={handleRenameStart}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                <Pencil size={14} className="text-amber-500" />
                Rename
              </button>
              <button
                onClick={handleNew}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                <FilePlus size={14} className="text-emerald-500" />
                New Canvas
              </button>
            </div>

            {/* Save As inline input */}
            {isSaveAsMode && (
              <div className="p-2 border-b border-slate-100 bg-blue-50/50">
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Canvas Name</label>
                <div className="flex gap-1">
                  <input
                    ref={saveAsInputRef}
                    type="text"
                    value={saveAsName}
                    onChange={(e) => setSaveAsName(e.target.value)}
                    onKeyDown={handleSaveAsKeyDown}
                    placeholder="My Canvas"
                    className="flex-1 text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
                    maxLength={50}
                  />
                  <button
                    onClick={handleSaveAs}
                    disabled={!saveAsName.trim()}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 rounded-lg transition"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* Saved Canvases List */}
            <div className="max-h-[240px] overflow-y-auto">
              {savedCanvasList.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-400">
                  No saved canvases yet
                </div>
              ) : (
                <div className="p-1.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase px-3 py-1">
                    Saved Canvases
                  </div>
                  {savedCanvasList.map((canvas) => (
                    <div
                      key={canvas.id}
                      className={`group flex items-center gap-2 px-3 py-2 rounded-lg transition cursor-pointer ${
                        canvas.id === currentCanvasId
                          ? 'bg-blue-50 border border-blue-100'
                          : 'hover:bg-slate-50'
                      }`}
                      onClick={() => {
                        if (canvas.id !== currentCanvasId) {
                          handleLoad(canvas.id);
                        }
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-700 truncate">
                          {canvas.name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {formatDate(canvas.updatedAt)}
                        </div>
                      </div>
                      {canvas.id === currentCanvasId && (
                        <span className="text-[10px] text-blue-500 font-medium shrink-0">Current</span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(canvas.id, canvas.name);
                        }}
                        className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition shrink-0"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
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
    </>
  );
};

export default CanvasManager;
