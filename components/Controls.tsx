import React, { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { DURATION_PRESETS, SPEED_PRESETS, TICKS_PER_HOUR, TICKS_PER_WORKDAY, TICKS_PER_WEEK } from '../types';
import { Play, Pause, RotateCcw, Plus, Activity, Settings2, Zap, ZapOff, SkipForward, ChevronDown } from 'lucide-react';

interface ControlsProps {
  selectedNodeId: string | null;
  onEditNode: () => void;
  onOpenAnalytics: () => void;
}

// Format elapsed time based on tick count
const formatElapsedTime = (ticks: number): string => {
  if (ticks < TICKS_PER_HOUR) {
    return `${ticks}m`;
  } else if (ticks < TICKS_PER_WORKDAY) {
    const hours = Math.floor(ticks / TICKS_PER_HOUR);
    const mins = ticks % TICKS_PER_HOUR;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  } else if (ticks < TICKS_PER_WEEK) {
    const days = Math.floor(ticks / TICKS_PER_WORKDAY);
    const hours = Math.floor((ticks % TICKS_PER_WORKDAY) / TICKS_PER_HOUR);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  } else {
    const weeks = Math.floor(ticks / TICKS_PER_WEEK);
    const days = Math.floor((ticks % TICKS_PER_WEEK) / TICKS_PER_WORKDAY);
    return days > 0 ? `${weeks}w ${days}d` : `${weeks}w`;
  }
};

// Format total duration from preset
const formatTotalTime = (preset: string): string => {
  const config = DURATION_PRESETS[preset];
  if (!config || config.totalTicks === Infinity) return '∞';

  switch (preset) {
    case '1day': return '8h';
    case '1week': return '5d';
    case '1month': return '22d';
    case '3months': return '66d';
    case '12months': return '264d';
    default: return '∞';
  }
};

const Controls: React.FC<ControlsProps> = ({ selectedNodeId, onEditNode, onOpenAnalytics }) => {
  const {
    isRunning,
    startSimulation,
    pauseSimulation,
    resetSimulation,
    stepSimulation,
    tick,
    addItem,
    tickCount,
    itemCounts,
    autoInjectionEnabled,
    toggleAutoInjection,
    // New real-time simulation state
    durationPreset,
    targetDuration,
    speedPreset,
    ticksPerSecond,
    simulationProgress,
    setDurationPreset,
    setSpeedPreset
  } = useStore();

  // Refs for cleanup
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);

  // New interval logic based on ticksPerSecond
  useEffect(() => {
    // Clear any existing intervals/rafs
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (isRunning) {
      if (ticksPerSecond === -1) {
        // Max speed: use requestAnimationFrame for maximum performance
        const runFrame = () => {
          const state = useStore.getState();
          if (!state.isRunning) return;

          // Execute multiple ticks per frame for max throughput
          for (let i = 0; i < 100; i++) {
            tick();
            // Check if simulation should stop
            const newState = useStore.getState();
            if (!newState.isRunning) return;
          }
          rafRef.current = requestAnimationFrame(runFrame);
        };
        rafRef.current = requestAnimationFrame(runFrame);
      } else {
        // Normal speed: batch ticks to achieve target rate
        // Cap at 60 intervals/second, batch more ticks per interval for higher speeds
        const intervalMs = 1000 / Math.min(ticksPerSecond, 60);
        const ticksPerInterval = Math.max(1, Math.floor(ticksPerSecond / 60));

        intervalRef.current = setInterval(() => {
          for (let i = 0; i < ticksPerInterval; i++) {
            tick();
            // Check if simulation should stop
            const state = useStore.getState();
            if (!state.isRunning) {
              if (intervalRef.current) clearInterval(intervalRef.current);
              return;
            }
          }
        }, intervalMs);
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isRunning, ticksPerSecond, tick]);

  // Performance: Use pre-computed counts instead of filtering
  const activeCount = itemCounts.wip;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-stretch gap-3 bg-white/95 backdrop-blur shadow-xl border border-slate-200 p-2 rounded-2xl z-50">

      {/* Playback Controls */}
      <div className="flex items-center gap-1 pr-3 border-r border-slate-200">
        {!isRunning ? (
          <>
            <button
                onClick={startSimulation}
                className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition flex items-center gap-1.5 shadow-emerald-200 shadow-lg"
                title="Run Continuous"
            >
                <Play size={18} fill="currentColor" />
                <span className="font-semibold text-sm">Run</span>
            </button>
            <button
                onClick={stepSimulation}
                className="p-2.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-100 transition flex items-center shadow-sm"
                title="Step Forward (1 Tick)"
            >
                <SkipForward size={18} fill="currentColor" />
            </button>
          </>
        ) : (
          <button
            onClick={pauseSimulation}
            className="p-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition flex items-center gap-1.5 shadow-amber-200 shadow-lg"
          >
            <Pause size={18} fill="currentColor" />
            <span className="font-semibold text-sm">Pause</span>
          </button>
        )}

        <button
          onClick={resetSimulation}
          className="p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
          title="Reset Data (Keep Layout)"
        >
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Duration Selector */}
      <div className="flex flex-col justify-center px-2 border-r border-slate-200">
        <span className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Duration</span>
        <div className="relative">
          <select
            value={durationPreset}
            onChange={(e) => setDurationPreset(e.target.value)}
            className="appearance-none bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 pr-6 text-xs font-medium text-slate-700 cursor-pointer hover:bg-slate-200 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(DURATION_PRESETS).map(([key, preset]) => (
              <option key={key} value={key}>{preset.label}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Speed Preset Buttons */}
      <div className="flex flex-col justify-center px-2 border-r border-slate-200">
        <span className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Speed</span>
        <div className="flex gap-0.5">
          {SPEED_PRESETS.map((preset) => (
            <button
              key={preset.key}
              onClick={() => setSpeedPreset(preset.key)}
              className={`px-2 py-1 text-xs font-medium rounded transition ${
                speedPreset === preset.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title={preset.realTimeRatio}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Progress Bar (only when duration is set) */}
      {targetDuration !== Infinity && (
        <div className="flex flex-col justify-center px-2 border-r border-slate-200 min-w-[140px]">
          <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase mb-0.5">
            <span>Progress</span>
            <span>{formatElapsedTime(tickCount)} / {formatTotalTime(durationPreset)}</span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                simulationProgress >= 100 ? 'bg-emerald-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(100, simulationProgress)}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-500 text-right mt-0.5">
            {simulationProgress.toFixed(1)}%
          </div>
        </div>
      )}

      {/* Auto Inject Toggle */}
      <div className="flex flex-col justify-center items-center px-3 border-r border-slate-200" title="Toggle Inputs">
         <span className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Inputs</span>
         <button
           onClick={toggleAutoInjection}
           className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${autoInjectionEnabled ? 'bg-purple-500' : 'bg-slate-200'}`}
         >
            <div className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-300 flex items-center justify-center ${autoInjectionEnabled ? 'translate-x-5' : 'translate-x-0'}`}>
                {autoInjectionEnabled ? <Zap size={10} className="text-purple-500" fill="currentColor"/> : <ZapOff size={10} className="text-slate-400" />}
            </div>
         </button>
      </div>

      {/* Global Stats */}
      <div className="flex items-center gap-3 px-2 border-r border-slate-200 text-sm">
        <div className="flex flex-col items-center min-w-[45px]">
           <span className="text-[10px] text-slate-400 uppercase font-bold">Time</span>
           <span className="font-mono font-bold text-slate-700 text-xs">{formatElapsedTime(tickCount)}</span>
        </div>
        <div className="flex flex-col items-center min-w-[35px]">
           <span className="text-[10px] text-blue-500 uppercase font-bold">WIP</span>
           <span className="font-mono font-bold text-slate-700">{activeCount}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 pl-1">
         <button
            onClick={() => selectedNodeId && addItem(selectedNodeId)}
            disabled={!selectedNodeId}
            className={`hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition font-medium text-sm border ${
              selectedNodeId
                ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 cursor-pointer'
                : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
            }`}
            title="Add Single Item to Selected Node"
          >
            <Plus size={14} />
            <span>Add Item</span>
          </button>

          <button
            onClick={onOpenAnalytics}
            className="p-2.5 rounded-xl transition text-slate-600 hover:bg-slate-100 border border-transparent hover:border-slate-200"
            title="Open Analytics Dashboard"
          >
             <Activity size={18} />
          </button>

          <button
            onClick={onEditNode}
            disabled={!selectedNodeId}
             className={`p-2.5 rounded-xl transition border ${
              selectedNodeId
                ? 'text-slate-700 hover:bg-slate-100 border-slate-200'
                : 'text-slate-300 border-transparent cursor-not-allowed'
            }`}
            title="Node Configuration"
          >
            <Settings2 size={18} />
          </button>
      </div>

    </div>
  );
};

export default Controls;
