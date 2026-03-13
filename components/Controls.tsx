import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { DURATION_PRESETS, ItemStatus, ProcessNodeData, SPEED_PRESETS, TICKS_PER_HOUR, TICKS_PER_WORKDAY, TICKS_PER_WEEK } from '../types';
import { Play, Pause, RotateCcw, Plus, Activity, Settings2, SkipForward, ChevronDown, X, Clock } from 'lucide-react';
import { computeSchedule } from '../scheduler';
import {
  computeLeadMetrics,
  computeNodeStageMetrics,
  formatCompletionWindowLabel,
  getLatestKpiUtilizationAverage,
  getRollingNodeUtilization,
} from '../metrics';
import { computeOverallBudgetUtilization, computeOverallLiveUtilization } from '../capacityModel';

interface ControlsProps {
  selectedNodeId: string | null;
  onEditNode: () => void;
  onOpenAnalytics: () => void;
  onClearSelection: () => void;
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

const DurationDropdown: React.FC<{
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedPreset = DURATION_PRESETS[value];

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-1.5 h-9 rounded-lg px-2.5 text-xs font-medium transition-all ${
          disabled
            ? 'bg-slate-50 border border-slate-200 text-slate-400 cursor-not-allowed'
            : 'bg-slate-50 border border-slate-200 text-slate-700 cursor-pointer hover:bg-slate-100 hover:border-slate-300'
        }`}
        title="Simulation duration"
      >
        <Clock size={12} className="text-slate-400 shrink-0" />
        <span>{selectedPreset?.label ?? value}</span>
        <ChevronDown size={11} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 w-[220px] rounded-xl border-2 border-slate-900 bg-white py-1.5 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.9)] z-[100]">
          <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Simulation Period
          </div>
          {Object.entries(DURATION_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => { onChange(key); setIsOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-all ${
                key === value
                  ? 'bg-slate-900 text-white font-bold'
                  : 'text-slate-600 font-medium hover:bg-slate-50'
              }`}
            >
              <span>{preset.label}</span>
              {key === value && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const Controls: React.FC<ControlsProps> = ({ selectedNodeId, onEditNode, onOpenAnalytics, onClearSelection }) => {
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
  const nodeStageMetricsHistoryByNode = useStore((state) => state.nodeStageMetricsHistoryByNode);
  const nodeUtilizationHistoryByNode = useStore((state) => state.nodeUtilizationHistoryByNode);
  const capacityMode = useStore((state) => state.capacityMode);
  const sharedCapacityInputMode = useStore((state) => state.sharedCapacityInputMode);
  const sharedCapacityValue = useStore((state) => state.sharedCapacityValue);
  const resourcePools = useStore((state) => state.resourcePools);
  const sharedNodeBudgetStateByNode = useStore((state) => state.sharedNodeBudgetStateByNode);

  const vsmMetrics = useMemo(() => {
    return computeLeadMetrics(items, {
      windowSize: metricsWindowCompletions,
      metricsEpoch
    });
  }, [items, metricsWindowCompletions, metricsEpoch]);
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );
  const selectedWorkNode = useMemo(
    () =>
      selectedNode && (selectedNode.type === 'startNode' || selectedNode.type === 'processNode')
        ? selectedNode
        : null,
    [selectedNode],
  );
  const selectedWorkNodeData = selectedWorkNode ? (selectedWorkNode.data as ProcessNodeData) : null;
  const selectedNodeItems = useMemo(
    () => (selectedWorkNode ? itemsByNode.get(selectedWorkNode.id) || [] : []),
    [itemsByNode, selectedWorkNode],
  );
  const selectedNodeQueued = useMemo(
    () => selectedNodeItems.filter((item) => item.status === ItemStatus.QUEUED).length,
    [selectedNodeItems],
  );
  const selectedNodeProcessing = useMemo(
    () => selectedNodeItems.filter((item) => item.status === ItemStatus.PROCESSING).length,
    [selectedNodeItems],
  );
  const selectedNodeMetrics = useMemo(
    () =>
      selectedWorkNode
        ? computeNodeStageMetrics(nodeStageMetricsHistoryByNode[selectedWorkNode.id] || [], {
            windowSize: metricsWindowCompletions,
            metricsEpoch,
          })
        : null,
    [metricsEpoch, metricsWindowCompletions, nodeStageMetricsHistoryByNode, selectedWorkNode],
  );
  const activeMetrics = selectedNodeMetrics || vsmMetrics;
  const activeCount = selectedWorkNode ? selectedNodeItems.length : itemCounts.wip;
  const focusLabel = selectedWorkNodeData ? `Node: ${selectedWorkNodeData.label}` : 'Global';
  const lowSample = activeMetrics.sampleSize < 5;
  const hasLeadSample = activeMetrics.sampleSize >= 1;
  const hasPceSample = activeMetrics.sampleSize >= 1;
  const hasThroughputSample = activeMetrics.sampleSize >= 2;
  const windowLabel = formatCompletionWindowLabel(metricsWindowCompletions);
  const metricsTooltip = lowSample
    ? `${focusLabel}. Low sample size (n=${activeMetrics.sampleSize}). Window: ${windowLabel}`
    : `${focusLabel}. n=${activeMetrics.sampleSize}. Window: ${windowLabel}`;
  const throughputTooltip = hasThroughputSample
    ? `Throughput: ${activeMetrics.throughputWorkingPerHour.toFixed(1)}/h. ${metricsTooltip}`
    : `Need at least 2 completions for throughput. ${metricsTooltip}`;
  const wipTooltip = selectedWorkNodeData
    ? `Node: ${selectedWorkNodeData.label} · Q ${selectedNodeQueued} · P ${selectedNodeProcessing}`
    : `Q ${itemCounts.queued} · P ${itemCounts.processing} · S ${itemCounts.stuck}`;

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

  const overallUtilization = useMemo(
    () =>
      capacityMode === 'sharedAllocation'
        ? computeOverallBudgetUtilization(
            nodes,
            {
              capacityMode,
              sharedCapacityInputMode,
              sharedCapacityValue,
              resourcePools,
            },
            sharedNodeBudgetStateByNode,
          )
        : computeOverallLiveUtilization(nodes, itemsByNode, {
            capacityMode,
            sharedCapacityInputMode,
            sharedCapacityValue,
            resourcePools,
          }),
    [
      capacityMode,
      itemsByNode,
      nodes,
      resourcePools,
      sharedCapacityInputMode,
      sharedCapacityValue,
      sharedNodeBudgetStateByNode,
    ],
  );
  const periodAverageUtilization = useMemo(
    () => getLatestKpiUtilizationAverage(kpiHistoryByPeriod, demandUnit),
    [demandUnit, kpiHistoryByPeriod],
  );
  const selectedNodeUtilization = useMemo(
    () => (selectedWorkNode ? getRollingNodeUtilization(nodeUtilizationHistoryByNode, selectedWorkNode.id) : 0),
    [nodeUtilizationHistoryByNode, selectedWorkNode],
  );
  const displayedUtilization = selectedWorkNode ? selectedNodeUtilization : periodAverageUtilization;
  const utilizationTooltip = selectedWorkNodeData
    ? `Rolling utilisation for node ${selectedWorkNodeData.label} across the recent simulated hour.`
    : capacityMode === 'sharedAllocation'
      ? `Latest ${demandUnit} average resource utilisation across start and process nodes. Today budget used: ${overallUtilization.toFixed(0)}%.`
      : `Latest ${demandUnit} average resource utilisation across start and process nodes. Live now: ${overallUtilization.toFixed(0)}%.`;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="relative flex items-center gap-1 rounded-2xl border-2 border-slate-900 bg-white p-1.5 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.9)]">
        {selectedWorkNodeData ? (
          <div className="absolute -top-5 right-28 z-10 max-w-[220px]">
            <div className="inline-flex items-center gap-1.5 rounded-xl border-2 border-slate-900 bg-[#d9f99d] px-2 py-1 shadow-[2px_2px_0px_0px_rgba(15,23,42,0.9)]">
              <span className="max-w-[180px] truncate text-[11px] font-black text-slate-900">
                {`Stage: ${selectedWorkNodeData.label}`}
              </span>
              <button
                type="button"
                onClick={onClearSelection}
                className="rounded-full border-2 border-slate-900 bg-white p-0.5 text-slate-900 transition hover:bg-slate-100"
                title="Return to global metrics"
                aria-label="Return to global metrics"
              >
                <X size={10} />
              </button>
            </div>
          </div>
        ) : null}

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
        <DurationDropdown
          value={durationPreset}
          onChange={setDurationPreset}
          disabled={demandMode === 'target' || readOnlyMode}
        />

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
             {activeMetrics.pce.toFixed(0)}%
           </span>
        </div>
        <div className="flex flex-col items-center w-[44px]">
           <span className="text-[9px] text-amber-500 uppercase font-semibold tracking-wide leading-none mb-1">Lead</span>
           <span
             className={`font-mono font-bold text-xs leading-none whitespace-nowrap ${hasLeadSample ? 'text-slate-800' : 'text-slate-300'}`}
             title={`Lead: ${formatLeadTime(activeMetrics.avgLeadWorking)}. ${metricsTooltip}`}
           >
             {formatLeadTime(activeMetrics.avgLeadWorking)}
           </span>
        </div>
        <div className="flex flex-col items-center w-[44px]">
           <span className="text-[9px] text-violet-500 uppercase font-semibold tracking-wide leading-none mb-1">Thru</span>
           <span
             className={`font-mono font-bold text-xs leading-none ${hasThroughputSample ? 'text-slate-800' : 'text-slate-300'}`}
             title={throughputTooltip}
           >
             {activeMetrics.throughputWorkingPerHour.toFixed(1)}/h
           </span>
        </div>
        <div className="flex flex-col items-center w-[40px]">
           <span className="text-[9px] text-teal-500 uppercase font-semibold tracking-wide leading-none mb-1">Util</span>
           <span
             className="font-mono font-bold text-xs leading-none text-slate-800"
             title={utilizationTooltip}
           >
             {displayedUtilization.toFixed(0)}%
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
    </div>
  );
};

export default Controls;
