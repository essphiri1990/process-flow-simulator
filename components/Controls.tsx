import React, { useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store';
import { DURATION_PRESETS, SPEED_PRESETS, TICKS_PER_HOUR, TICKS_PER_WORKDAY, TICKS_PER_WEEK } from '../types';
import { Play, Pause, RotateCcw, Plus, Activity, Settings2, Zap, ZapOff, SkipForward, ChevronDown } from 'lucide-react';
import { computeSchedule } from '../scheduler';
import { computeLeadMetrics, formatCompletionWindowLabel } from '../metrics';

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
    case '1hour': return '1h';
    case '1day': return '8h';
    case '1week': return '5d';
    case '1month': return '22d';
    case '3months': return '66d';
    case '12months': return '264d';
    default: return '∞';
  }
};

const METRICS_WINDOW_PRESETS = [
  { label: '10', count: 10 },
  { label: '25', count: 25 },
  { label: '50', count: 50 },
  { label: '100', count: 100 }
];

const Controls: React.FC<ControlsProps> = ({ selectedNodeId, onEditNode, onOpenAnalytics }) => {
  const {
    isRunning,
    startSimulation,
    pauseSimulation,
    resetSimulation,
    stepSimulation,
    tick,
    addItem,
    displayTickCount,
    countTransitInClock,
    metricsEpoch,
    metricsWindowCompletions,
    demandMode,
    itemCounts,
    autoInjectionEnabled,
    toggleAutoInjection,
    // New real-time simulation state
    durationPreset,
    targetDuration,
    speedPreset,
    ticksPerSecond,
    simulationProgress,
    throughput,
    setDurationPreset,
    setMetricsWindowCompletions,
    setSpeedPreset,
    setCountTransitInClock
  } = useStore();

  const items = useStore((state) => state.items);

  const vsmMetrics = useMemo(() => {
    const { avgLeadTime, pce, sampleSize } = computeLeadMetrics(items, {
      windowSize: metricsWindowCompletions,
      metricsEpoch
    });
    return { avgLeadTime, pce, throughput, sampleSize };
  }, [items, metricsWindowCompletions, metricsEpoch, throughput]);

  const lowSample = vsmMetrics.sampleSize < 5;
  const windowLabel = formatCompletionWindowLabel(metricsWindowCompletions);
  const metricsTooltip = lowSample
    ? `Low sample size (n=${vsmMetrics.sampleSize}). Window: ${windowLabel}`
    : `n=${vsmMetrics.sampleSize}. Window: ${windowLabel}`;
  const wipTooltip = `Q ${itemCounts.queued} · P ${itemCounts.processing} · T ${itemCounts.transit} · S ${itemCounts.stuck}`;

  // Format time as human-readable mixed units (e.g. "2h 15m", "1d 3h")
  const formatLeadTime = (ticks: number): string => {
    if (ticks <= 0) return '0m';
    const totalMinutes = Math.round(ticks);
    if (totalMinutes < 60) return `${totalMinutes}m`;

    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    if (hours < 8) {
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }

    const days = Math.floor(totalMinutes / TICKS_PER_WORKDAY);
    const remainingHours = Math.floor((totalMinutes % TICKS_PER_WORKDAY) / 60);
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  };

  // Refs for cleanup + fractional tick accumulation
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const tickAccumulatorRef = useRef<number>(0);

  // New interval logic based on ticksPerSecond with fractional batching
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
    tickAccumulatorRef.current = 0;

    // Helper: run N ticks but exit early if simulation stopped
    const runTicks = (count: number) => {
      for (let i = 0; i < count; i++) {
        tick();
        if (!useStore.getState().isRunning) return;
      }
    };

    if (isRunning) {
      if (ticksPerSecond === -1) {
        // Max speed: use requestAnimationFrame for best-effort throughput with a safety cap
        const MAX_TICKS_PER_FRAME = 300;
        const runFrame = () => {
          if (!useStore.getState().isRunning) return;
          runTicks(MAX_TICKS_PER_FRAME);
          rafRef.current = requestAnimationFrame(runFrame);
        };
        rafRef.current = requestAnimationFrame(runFrame);
      } else {
        const { intervalMs, ticksPerInterval } = computeSchedule(ticksPerSecond);
        intervalRef.current = setInterval(() => {
          tickAccumulatorRef.current += ticksPerInterval;
          const ticksToRun = Math.floor(tickAccumulatorRef.current);
          if (ticksToRun > 0) {
            tickAccumulatorRef.current -= ticksToRun;
            runTicks(ticksToRun);
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
        <button
            onClick={isRunning ? pauseSimulation : startSimulation}
            className={`p-2.5 w-[90px] justify-center text-white rounded-xl transition flex items-center gap-1.5 shadow-lg ${
              isRunning
                ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
            }`}
            title={isRunning ? 'Pause' : 'Run Continuous'}
        >
            {isRunning ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            <span className="font-semibold text-sm">{isRunning ? 'Pause' : 'Run'}</span>
        </button>
        <button
            onClick={stepSimulation}
            className="p-2.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-100 transition flex items-center shadow-sm"
            title="Step Forward (1 step)"
        >
            <SkipForward size={18} fill="currentColor" />
        </button>

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
            disabled={demandMode === 'target'}
            className={`appearance-none border border-slate-200 rounded-lg px-2 py-1 pr-6 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              demandMode === 'target'
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-slate-100 text-slate-700 cursor-pointer hover:bg-slate-200'
            }`}
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
        <span className="text-[9px] text-slate-400 mt-0.5 text-center">
          {SPEED_PRESETS.find(p => p.key === speedPreset)?.realTimeRatio || ''}
        </span>
      </div>

      {/* Metrics Window */}
      <div className="flex flex-col justify-center px-2 border-r border-slate-200">
        <span className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Window</span>
        <div className="relative">
          <select
            value={metricsWindowCompletions}
            onChange={(e) => setMetricsWindowCompletions(parseInt(e.target.value))}
            className="appearance-none bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 pr-6 text-xs font-medium text-slate-700 cursor-pointer hover:bg-slate-200 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
            title="Metrics window for lead time and throughput (completions)"
          >
            {METRICS_WINDOW_PRESETS.map((preset) => (
              <option key={preset.count} value={preset.count}>{preset.label}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <span className="text-[9px] text-slate-400 mt-0.5 text-center">Completions</span>
      </div>

      {/* Auto Generate Toggle */}
      <div className="flex flex-col justify-center items-center w-[72px] border-r border-slate-200" title={demandMode === 'target' ? 'Auto feed disabled in demand mode' : 'Auto-generate items at start nodes'}>
         <span className="text-[10px] text-slate-500 font-bold uppercase mb-1">Auto Feed</span>
         <button
           onClick={toggleAutoInjection}
           disabled={demandMode === 'target'}
           className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${autoInjectionEnabled ? 'bg-purple-500 ring-2 ring-purple-200' : 'bg-slate-200'}`}
         >
            <div className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full shadow-sm transform transition-transform duration-300 flex items-center justify-center ${autoInjectionEnabled ? 'translate-x-6' : 'translate-x-0'}`}>
                {autoInjectionEnabled ? <Zap size={12} className="text-purple-500" fill="currentColor"/> : <ZapOff size={12} className="text-slate-400" />}
            </div>
         </button>
      </div>

      {/* Global Stats */}
      <div className="flex items-center gap-3 px-2 border-r border-slate-200 text-sm">
        <div className="flex flex-col items-center w-[64px]">
           <span className="text-[10px] text-slate-400 uppercase font-bold">Time</span>
           <span className="font-mono font-bold text-slate-700 text-xs text-center">{formatElapsedTime(displayTickCount)}</span>
           <button
             onClick={() => setCountTransitInClock(!countTransitInClock)}
             className="text-[9px] text-slate-400 hover:text-slate-700 transition"
             title="Toggle whether transit ticks count toward the clock"
           >
             {countTransitInClock ? 'incl. transit' : 'excl. transit'}
           </button>
        </div>
        <div className="flex flex-col items-center w-[36px]">
           <span className="text-[10px] text-blue-500 uppercase font-bold">WIP</span>
           <span className="font-mono font-bold text-slate-700 text-center" title={wipTooltip}>{activeCount}</span>
        </div>
        <div className="flex flex-col items-center w-[40px]">
           <span className="text-[10px] text-emerald-500 uppercase font-bold">PCE</span>
           <span
             className={`font-mono font-bold text-xs text-center ${lowSample ? 'text-slate-400' : 'text-slate-700'}`}
             title={metricsTooltip}
           >
             {vsmMetrics.pce.toFixed(0)}%
           </span>
        </div>
        <div className="flex flex-col items-center min-w-[52px]">
           <span className="text-[10px] text-amber-500 uppercase font-bold">Lead</span>
           <span
             className={`font-mono font-bold text-xs text-center whitespace-nowrap ${lowSample ? 'text-slate-400' : 'text-slate-700'}`}
             title={metricsTooltip}
           >
             {formatLeadTime(vsmMetrics.avgLeadTime)}
           </span>
         </div>
        <div className="flex flex-col items-center w-[44px]">
           <span className="text-[10px] text-purple-500 uppercase font-bold">Thru</span>
           <span
             className={`font-mono font-bold text-xs text-center ${lowSample ? 'text-slate-400' : 'text-slate-700'}`}
             title={metricsTooltip}
           >
             {vsmMetrics.throughput.toFixed(1)}/h
           </span>
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
