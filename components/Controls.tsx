import React, { useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store';
import { DURATION_PRESETS, SPEED_PRESETS, TICKS_PER_HOUR, TICKS_PER_WORKDAY, TICKS_PER_WEEK } from '../types';
import { Play, Pause, RotateCcw, Plus, Activity, Settings2, Zap, ZapOff, SkipForward, ChevronDown } from 'lucide-react';
import { computeSchedule } from '../scheduler';
import {
  computeLeadMetrics,
  formatCompletionWindowLabel,
  getLatestKpiUtilizationAverage,
} from '../metrics';
import { computeOverallLiveUtilization } from '../capacityModel';

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
    metricsEpoch,
    metricsWindowCompletions,
    demandMode,
    demandUnit,
    itemCounts,
    autoInjectionEnabled,
    toggleAutoInjection,
    // New real-time simulation state
    durationPreset,
    speedPreset,
    ticksPerSecond,
    readOnlyMode,
    setDurationPreset,
    setMetricsWindowCompletions,
    setSpeedPreset,
  } = useStore();

  const items = useStore((state) => state.items);
  const nodes = useStore((state) => state.nodes);
  const itemsByNode = useStore((state) => state.itemsByNode);
  const kpiHistoryByPeriod = useStore((state) => state.kpiHistoryByPeriod);
  const capacityMode = useStore((state) => state.capacityMode);
  const sharedCapacityInputMode = useStore((state) => state.sharedCapacityInputMode);
  const sharedCapacityValue = useStore((state) => state.sharedCapacityValue);

  const vsmMetrics = useMemo(() => {
    return computeLeadMetrics(items, {
      windowSize: metricsWindowCompletions,
      metricsEpoch
    });
  }, [items, metricsWindowCompletions, metricsEpoch]);

  const lowSample = vsmMetrics.sampleSize < 5;
  const hasLeadSample = vsmMetrics.sampleSize >= 1;
  const hasPceSample = vsmMetrics.sampleSize >= 1;
  const hasThroughputSample = vsmMetrics.sampleSize >= 2;
  const windowLabel = formatCompletionWindowLabel(metricsWindowCompletions);
  const metricsTooltip = lowSample
    ? `Low sample size (n=${vsmMetrics.sampleSize}). Window: ${windowLabel}`
    : `n=${vsmMetrics.sampleSize}. Window: ${windowLabel}`;
  const throughputTooltip = hasThroughputSample
    ? `Throughput (Working): ${vsmMetrics.throughputWorkingPerHour.toFixed(1)}/h. ${metricsTooltip}`
    : `Need at least 2 completions for throughput. ${metricsTooltip}`;
  const wipTooltip = `Q ${itemCounts.queued} · P ${itemCounts.processing} · S ${itemCounts.stuck}`;

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
  const overallUtilization = useMemo(
    () =>
      computeOverallLiveUtilization(nodes, itemsByNode, {
        capacityMode,
        sharedCapacityInputMode,
        sharedCapacityValue,
      }),
    [capacityMode, itemsByNode, nodes, sharedCapacityInputMode, sharedCapacityValue],
  );
  const periodAverageUtilization = useMemo(
    () => getLatestKpiUtilizationAverage(kpiHistoryByPeriod, demandUnit),
    [demandUnit, kpiHistoryByPeriod],
  );

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white border-2 border-slate-900 p-1.5 rounded-2xl z-50 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.9)]">

      {/* Playback Controls */}
      <div className="flex items-center gap-1 px-1">
        <button
            onClick={isRunning ? pauseSimulation : startSimulation}
            className={`h-9 w-20 justify-center text-white rounded-xl transition-all flex items-center gap-1.5 font-semibold text-sm border-2 active:translate-y-[1px] active:shadow-none ${
              isRunning
                ? 'bg-amber-500 hover:bg-amber-600 border-amber-700 shadow-[2px_2px_0px_0px_rgba(180,83,9,0.8)]'
                : 'bg-emerald-600 hover:bg-emerald-700 border-emerald-800 shadow-[2px_2px_0px_0px_rgba(6,95,70,0.8)]'
            }`}
            title={isRunning ? 'Pause' : 'Run Continuous'}
        >
            {isRunning ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
            {isRunning ? 'Pause' : 'Run'}
        </button>
        <button
            onClick={stepSimulation}
            className="h-9 w-9 flex items-center justify-center text-blue-600 bg-blue-50 border-2 border-blue-300 rounded-xl hover:bg-blue-100 transition-all shadow-[2px_2px_0px_0px_rgba(37,99,235,0.3)] active:translate-y-[1px] active:shadow-none"
            title="Step Forward (1 tick)"
        >
            <SkipForward size={15} fill="currentColor" />
        </button>
        <button
          onClick={resetSimulation}
          className="h-9 w-9 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl border-2 border-slate-200 transition-all active:translate-y-[1px]"
          title="Reset Data (Keep Layout)"
        >
          <RotateCcw size={15} />
        </button>
      </div>

      <div className="w-px h-7 bg-slate-200" />

      {/* Simulation Settings */}
      <div className="flex items-center gap-2 px-2">
        {/* Duration */}
        <div className="relative" title="Simulation duration">
          <select
            value={durationPreset}
            onChange={(e) => setDurationPreset(e.target.value)}
            disabled={demandMode === 'target' || readOnlyMode}
            className={`appearance-none h-9 border rounded-lg pl-2.5 pr-7 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 ${
              demandMode === 'target' || readOnlyMode
                ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-slate-50 border-slate-200 text-slate-700 cursor-pointer hover:bg-slate-100 hover:border-slate-300'
            }`}
          >
            {Object.entries(DURATION_PRESETS).map(([key, preset]) => (
              <option key={key} value={key}>{preset.label}</option>
            ))}
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {/* Speed */}
        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden h-9">
          {SPEED_PRESETS.map((preset) => (
            <button
              key={preset.key}
              onClick={() => setSpeedPreset(preset.key)}
              className={`px-2.5 h-full text-xs font-medium transition-all ${
                speedPreset === preset.key
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
              title={preset.realTimeRatio}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Window */}
        <div className="relative" title={`Metrics window (${windowLabel})`}>
          <select
            value={metricsWindowCompletions}
            onChange={(e) => setMetricsWindowCompletions(parseInt(e.target.value))}
            className="appearance-none h-9 bg-slate-50 border border-slate-200 rounded-lg pl-2.5 pr-7 text-xs font-medium text-slate-700 cursor-pointer hover:bg-slate-100 hover:border-slate-300 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {METRICS_WINDOW_PRESETS.map((preset) => (
              <option key={preset.count} value={preset.count}>{preset.label} items</option>
            ))}
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {/* Auto Feed */}
        <button
          onClick={toggleAutoInjection}
          disabled={demandMode === 'target' || readOnlyMode}
          className={`h-9 px-2.5 flex items-center gap-1.5 rounded-lg text-xs font-medium transition-all border ${
            autoInjectionEnabled
              ? 'bg-purple-50 border-purple-200 text-purple-700'
              : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-100'
          }`}
          title={
            readOnlyMode
              ? 'Auto feed is locked in read-only mode'
              : demandMode === 'target'
                ? 'Auto feed disabled in demand mode'
                : 'Auto-generate items at start nodes'
          }
        >
          {autoInjectionEnabled ? <Zap size={13} fill="currentColor" /> : <ZapOff size={13} />}
          <span className="hidden xl:inline">Feed</span>
        </button>
      </div>

      <div className="w-px h-7 bg-slate-200" />

      {/* Metrics */}
      <div className="flex items-center gap-3 px-2" title={metricsTooltip}>
        <div className="flex flex-col items-center w-[52px]">
           <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wide leading-none mb-1">Time</span>
           <span className="font-mono font-bold text-slate-800 text-xs leading-none">{formatElapsedTime(displayTickCount)}</span>
        </div>
        <div className="flex flex-col items-center w-[28px]">
           <span className="text-[9px] text-blue-500 uppercase font-semibold tracking-wide leading-none mb-1">WIP</span>
           <span className="font-mono font-bold text-slate-800 text-xs leading-none" title={wipTooltip}>{activeCount}</span>
        </div>
        <div className="flex flex-col items-center w-[32px]">
           <span className="text-[9px] text-emerald-500 uppercase font-semibold tracking-wide leading-none mb-1">PCE</span>
           <span
             className={`font-mono font-bold text-xs leading-none ${hasPceSample ? 'text-slate-800' : 'text-slate-300'}`}
             title={metricsTooltip}
           >
             {vsmMetrics.pce.toFixed(0)}%
           </span>
        </div>
        <div className="flex flex-col items-center w-[44px]">
           <span className="text-[9px] text-amber-500 uppercase font-semibold tracking-wide leading-none mb-1">Lead</span>
           <span
             className={`font-mono font-bold text-xs leading-none whitespace-nowrap ${hasLeadSample ? 'text-slate-800' : 'text-slate-300'}`}
             title={`Lead (Working): ${formatLeadTime(vsmMetrics.avgLeadWorking)}. ${metricsTooltip}`}
           >
             {formatLeadTime(vsmMetrics.avgLeadWorking)}
           </span>
        </div>
        <div className="flex flex-col items-center w-[44px]">
           <span className="text-[9px] text-violet-500 uppercase font-semibold tracking-wide leading-none mb-1">Thru</span>
           <span
             className={`font-mono font-bold text-xs leading-none ${hasThroughputSample ? 'text-slate-800' : 'text-slate-300'}`}
             title={throughputTooltip}
           >
             {vsmMetrics.throughputWorkingPerHour.toFixed(1)}/h
           </span>
        </div>
        <div className="flex flex-col items-center w-[40px]">
           <span className="text-[9px] text-teal-500 uppercase font-semibold tracking-wide leading-none mb-1">Util</span>
           <span
             className="font-mono font-bold text-xs leading-none text-slate-800"
             title={`Latest ${demandUnit} average resource utilisation across start and process nodes. Live now: ${overallUtilization.toFixed(0)}%.`}
           >
             {periodAverageUtilization.toFixed(0)}%
           </span>
        </div>
      </div>

      <div className="w-px h-7 bg-slate-200" />

      {/* Actions */}
      <div className="flex items-center gap-0.5 px-1">
         <button
            onClick={() => selectedNodeId && addItem(selectedNodeId)}
            disabled={!selectedNodeId || readOnlyMode}
            className={`hidden xl:flex h-9 items-center gap-1 px-2.5 rounded-xl transition-all text-xs font-medium ${
              selectedNodeId && !readOnlyMode
                ? 'text-blue-600 hover:bg-blue-50'
                : 'text-slate-300 cursor-not-allowed'
            }`}
            title="Add Single Item to Selected Node"
          >
            <Plus size={14} />
            Add
          </button>
          <button
            onClick={onOpenAnalytics}
            className="h-9 w-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
            title="Analytics"
          >
             <Activity size={16} />
          </button>

          <button
            onClick={onEditNode}
            disabled={!selectedNodeId || readOnlyMode}
             className={`h-9 w-9 flex items-center justify-center rounded-xl transition-all ${
              selectedNodeId && !readOnlyMode
                ? 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                : 'text-slate-300 cursor-not-allowed'
            }`}
            title="Node Configuration"
          >
            <Settings2 size={16} />
          </button>
      </div>

    </div>
  );
};

export default Controls;
