import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Play, Pause, RotateCcw, Plus, Activity, Settings2, Zap, ZapOff, SkipForward } from 'lucide-react';

interface ControlsProps {
  selectedNodeId: string | null;
  onEditNode: () => void;
  onOpenAnalytics: () => void;
}

const Controls: React.FC<ControlsProps> = ({ selectedNodeId, onEditNode, onOpenAnalytics }) => {
  const {
    isRunning,
    startSimulation,
    pauseSimulation,
    resetSimulation,
    stepSimulation,
    tick,
    tickSpeed,
    setTickSpeed,
    addItem,
    tickCount,
    itemCounts,
    autoInjectionEnabled,
    toggleAutoInjection
  } = useStore();

  const [localSpeed, setLocalSpeed] = useState(tickSpeed);

  useEffect(() => {
    setTickSpeed(localSpeed);
  }, [localSpeed, setTickSpeed]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isRunning) {
      interval = setInterval(tick, tickSpeed);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isRunning, tickSpeed, tick]);

  // Performance: Use pre-computed counts instead of filtering
  const activeCount = itemCounts.wip;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-stretch gap-4 bg-white/90 backdrop-blur shadow-xl border border-slate-200 p-2 rounded-2xl z-50">
      
      {/* Playback Controls */}
      <div className="flex items-center gap-1 pr-4 border-r border-slate-200">
        {!isRunning ? (
          <>
            <button
                onClick={startSimulation}
                className="p-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition flex items-center gap-2 shadow-emerald-200 shadow-lg"
                title="Run Continuous"
            >
                <Play size={20} fill="currentColor" />
                <span className="font-semibold text-sm">Run</span>
            </button>
            <button
                onClick={stepSimulation}
                className="p-3 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-100 transition flex items-center shadow-sm"
                title="Step Forward (1 Tick)"
            >
                <SkipForward size={20} fill="currentColor" />
            </button>
          </>
        ) : (
          <button
            onClick={pauseSimulation}
            className="p-3 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition flex items-center gap-2 shadow-amber-200 shadow-lg"
          >
            <Pause size={20} fill="currentColor" />
            <span className="font-semibold text-sm">Pause</span>
          </button>
        )}
        
        <button
          onClick={resetSimulation}
          className="p-3 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
          title="Reset Data (Keep Layout)"
        >
          <RotateCcw size={20} />
        </button>
      </div>

      {/* Speed Control */}
      <div className="flex flex-col justify-center px-2 w-32 border-r border-slate-200">
        <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase mb-1">
          <span>Speed</span>
          <span>{localSpeed}ms</span>
        </div>
        <input
          type="range"
          min="50"
          max="1000"
          step="50"
          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          value={localSpeed}
          onChange={(e) => setLocalSpeed(Number(e.target.value))}
          dir="rtl" 
        />
      </div>

      {/* Auto Inject Toggle */}
      <div className="flex flex-col justify-center items-center px-4 border-r border-slate-200" title="Toggle Inputs">
         <span className="text-[10px] text-slate-500 font-bold uppercase mb-1">Inputs</span>
         <button 
           onClick={toggleAutoInjection}
           className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${autoInjectionEnabled ? 'bg-purple-500' : 'bg-slate-200'}`}
         >
            <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-300 flex items-center justify-center ${autoInjectionEnabled ? 'translate-x-6' : 'translate-x-0'}`}>
                {autoInjectionEnabled ? <Zap size={10} className="text-purple-500" fill="currentColor"/> : <ZapOff size={10} className="text-slate-400" />}
            </div>
         </button>
      </div>

      {/* Global Stats */}
      <div className="flex items-center gap-4 px-2 border-r border-slate-200 text-sm">
        <div className="flex flex-col items-center min-w-[50px]">
           <span className="text-[10px] text-slate-400 uppercase font-bold">Time</span>
           <span className="font-mono font-bold text-slate-700">{tickCount}</span>
        </div>
        <div className="flex flex-col items-center min-w-[50px]">
           <span className="text-[10px] text-blue-500 uppercase font-bold">WIP</span>
           <span className="font-mono font-bold text-slate-700">{activeCount}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pl-2">
         <button
            onClick={() => selectedNodeId && addItem(selectedNodeId)}
            disabled={!selectedNodeId}
            className={`hidden xl:flex items-center gap-2 px-4 py-2 rounded-xl transition font-medium text-sm border ${
              selectedNodeId 
                ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 cursor-pointer' 
                : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
            }`}
            title="Add Single Item to Selected Node"
          >
            <Plus size={16} />
            <span>Add Item</span>
          </button>
          
          <button
            onClick={onOpenAnalytics}
            className="p-3 rounded-xl transition text-slate-600 hover:bg-slate-100 border border-transparent hover:border-slate-200"
            title="Open Analytics Dashboard"
          >
             <Activity size={20} />
          </button>

          <button
            onClick={onEditNode}
            disabled={!selectedNodeId}
             className={`p-3 rounded-xl transition border ${
              selectedNodeId 
                ? 'text-slate-700 hover:bg-slate-100 border-slate-200' 
                : 'text-slate-300 border-transparent cursor-not-allowed'
            }`}
            title="Node Configuration"
          >
            <Settings2 size={20} />
          </button>
      </div>

    </div>
  );
};

export default Controls;