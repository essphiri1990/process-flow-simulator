import React, { memo, useMemo } from 'react';
import { useStore } from '../store';
import { X, TrendingUp, Activity, BarChart3, Clock, CheckCircle2, Gauge, AlertTriangle } from 'lucide-react';
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from 'recharts';

import { DURATION_PRESETS, TICKS_PER_HOUR, TICKS_PER_WORKDAY, TICKS_PER_WEEK, ItemStatus } from '../types';
import { computeLeadMetrics, formatCompletionWindowLabel } from '../metrics';

interface AnalyticsDashboardProps {
  onClose: () => void;
}

// Get adaptive display config based on duration preset
const getDisplayConfig = (durationPreset: string, tickCount: number): { divisor: number; abbrev: string; unitName: string } => {
  const preset = DURATION_PRESETS[durationPreset];

  if (durationPreset === 'unlimited' || !preset) {
    // Auto-scale based on current elapsed time
    if (tickCount < TICKS_PER_HOUR) return { divisor: 1, abbrev: 'min', unitName: 'minutes' };
    if (tickCount < TICKS_PER_WORKDAY) return { divisor: TICKS_PER_HOUR, abbrev: 'hr', unitName: 'hours' };
    if (tickCount < TICKS_PER_WEEK) return { divisor: TICKS_PER_WORKDAY, abbrev: 'd', unitName: 'days' };
    return { divisor: TICKS_PER_WEEK, abbrev: 'wk', unitName: 'weeks' };
  }

  // Use preset's recommended unit
  switch (preset.displayUnit) {
    case 'hours': return { divisor: TICKS_PER_HOUR, abbrev: 'hr', unitName: 'hours' };
    case 'days': return { divisor: TICKS_PER_WORKDAY, abbrev: 'd', unitName: 'days' };
    case 'weeks': return { divisor: TICKS_PER_WEEK, abbrev: 'wk', unitName: 'weeks' };
    case 'months': return { divisor: TICKS_PER_WORKDAY * 22, abbrev: 'mo', unitName: 'months' };
    default: return { divisor: 1, abbrev: 'min', unitName: 'minutes' };
  }
};

const formatLeadTimeAbsolute = (ticks: number): string => {
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

const truncateNodeLabel = (label: string): string => (
  label.length > 14 ? `${label.slice(0, 14)}…` : label
);

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ onClose }) => {
  const history = useStore((state) => state.history);
  const isRunning = useStore((state) => state.isRunning);
  const nodes = useStore((state) => state.nodes);
  const items = useStore((state) => state.items);
  const displayTickCount = useStore((state) => state.displayTickCount);
  const durationPreset = useStore((state) => state.durationPreset);
  const targetDuration = useStore((state) => state.targetDuration);
  const simulationProgress = useStore((state) => state.simulationProgress);
  const metricsWindowCompletions = useStore((state) => state.metricsWindowCompletions);
  const metricsEpoch = useStore((state) => state.metricsEpoch);
  const itemCounts = useStore((state) => state.itemCounts);
  const demandMode = useStore((state) => state.demandMode);
  const demandUnit = useStore((state) => state.demandUnit);
  const demandArrivalsGenerated = useStore((state) => state.demandArrivalsGenerated);
  const periodCompleted = useStore((state) => state.periodCompleted);
  const lastRunSummary = useStore((state) => state.lastRunSummary);

  // Get adaptive display configuration
  const displayConfig = useMemo(() => getDisplayConfig(durationPreset, displayTickCount), [durationPreset, displayTickCount]);

  // End-to-end lead time & PCE (matches toolbar logic: only items that reached an end node)
  const leadMetrics = useMemo(
    () => computeLeadMetrics(items, {
      windowSize: metricsWindowCompletions,
      metricsEpoch
    }),
    [items, metricsWindowCompletions, metricsEpoch]
  );
  const lowSample = leadMetrics.sampleSize < 5;
  const windowLabel = formatCompletionWindowLabel(metricsWindowCompletions);

  const demandTotals = useMemo(() => {
    let total = 0;
    const perNode: { id: string; label: string; target: number }[] = [];
    for (const node of nodes) {
      if (node.type === 'startNode') {
        const target = (node.data as any).demandTarget || 0;
        if (target > 0) {
          total += target;
          perNode.push({ id: node.id, label: (node.data as any).label || 'Start', target });
        }
      }
    }
    return { total, perNode };
  }, [nodes]);

  // Calculate summary statistics
  const stats = useMemo(() => {
    if (history.length === 0) {
      return { currentWip: 0, totalCompleted: 0, avgThroughput: 0, peakWip: 0, avgWip: 0 };
    }

    const latest = history[history.length - 1];
    const peakWip = Math.max(...history.map(h => h.wip));
    const avgWip = history.reduce((sum, h) => sum + h.wip, 0) / history.length;
    const avgThroughput = history.reduce((sum, h) => sum + h.throughput, 0) / history.length;

    return {
      currentWip: latest.wip,
      totalCompleted: latest.totalCompleted,
      avgThroughput: avgThroughput,
      peakWip,
      avgWip
    };
  }, [history]);

  // Calculate per-node statistics
  const nodeStats = useMemo(() => {
    const processNodes = nodes.filter(n => n.type === 'processNode' || n.type === 'startNode' || n.type === 'endNode');

    return processNodes.map(node => {
      const data = node.data as any;
      const nodeItems = items.filter(item => item.currentNodeId === node.id);
      const queuedCount = nodeItems.filter(item => item.status === 'QUEUED').length;
      const processingCount = nodeItems.filter(item => item.status === 'PROCESSING').length;

      return {
        id: node.id,
        label: data.label || 'Unknown',
        type: node.type,
        processed: data.stats?.processed || 0,
        failed: data.stats?.failed || 0,
        queueLength: queuedCount,
        processingCount,
        activeWip: queuedCount + processingCount,
        utilization: data.resources > 0 ? (processingCount / data.resources) * 100 : 0,
        quality: (data.quality || 1) * 100,
        processingTime: data.processingTime || 0,
        resources: data.resources || 1
      };
    }).sort((a, b) => b.processed - a.processed);
  }, [nodes, items]);

  const nodeWipData = useMemo(() => {
    const activeNodes = nodeStats.filter((node) => node.type !== 'endNode');
    const sortedNodes = [...activeNodes].sort((a, b) => {
      if (b.activeWip !== a.activeWip) return b.activeWip - a.activeWip;
      if (b.queueLength !== a.queueLength) return b.queueLength - a.queueLength;
      return b.processingCount - a.processingCount;
    });

    return sortedNodes.slice(0, 8).map((node) => ({
      node: truncateNodeLabel(node.label),
      queued: node.queueLength,
      processing: node.processingCount,
      total: node.activeWip,
    }));
  }, [nodeStats]);

  const leadCompositionData = useMemo(
    () => [
      { name: 'Value-Added', ticks: Number(leadMetrics.avgVAT.toFixed(2)) },
      { name: 'Waiting', ticks: Number(Math.max(0, leadMetrics.avgLeadWorking - leadMetrics.avgVAT).toFixed(2)) },
      { name: 'Closed', ticks: Number(leadMetrics.avgClosed.toFixed(2)) },
    ],
    [leadMetrics.avgClosed, leadMetrics.avgLeadWorking, leadMetrics.avgVAT]
  );

  const demandBalanceData = useMemo(
    () => [
      { metric: 'Target', value: demandTotals.total },
      { metric: 'Arrivals', value: demandArrivalsGenerated },
      { metric: 'Completed', value: periodCompleted },
      { metric: 'Backlog', value: itemCounts.wip },
    ],
    [demandArrivalsGenerated, demandTotals.total, itemCounts.wip, periodCompleted]
  );

  const nodeOutputData = useMemo(
    () => {
      const processSteps = nodeStats.filter((node) => node.type === 'processNode');
      const outputSteps = processSteps.length > 0 ? processSteps : nodeStats.filter((node) => node.type !== 'endNode');

      return outputSteps.slice(0, 8).map((node) => ({
        node: truncateNodeLabel(node.label),
        processed: node.processed,
        failed: node.failed,
      }));
    },
    [nodeStats]
  );

  const primaryConstraint = useMemo(() => {
    const candidates = nodeStats
      .filter((n) => n.type === 'processNode')
      .sort((a, b) => {
        if (b.queueLength !== a.queueLength) return b.queueLength - a.queueLength;
        return b.utilization - a.utilization;
      });
    return candidates[0] || null;
  }, [nodeStats]);

  const executiveSummary = useMemo(() => {
    const demandGap = demandMode === 'target' ? Math.max(0, demandArrivalsGenerated - periodCompleted) : 0;
    if (!primaryConstraint) {
      return {
        title: 'System Stable',
        message: 'No clear constraint detected yet. Keep running to build a larger sample for diagnostics.'
      };
    }
    if (primaryConstraint.queueLength >= 8 || primaryConstraint.utilization >= 90) {
      return {
        title: `Constraint at ${primaryConstraint.label}`,
        message: `High queue (${primaryConstraint.queueLength}) and utilization (${primaryConstraint.utilization.toFixed(0)}%) suggest this node is limiting flow.`
      };
    }
    if (demandGap > 0) {
      return {
        title: 'Demand Risk',
        message: `${demandGap} items are not yet completed for the current demand window. Focus on reducing waiting at key handoffs.`
      };
    }
    return {
      title: 'Flow Improving',
      message: 'Throughput and queue profile look balanced. Continue monitoring lead-time composition for new waiting spikes.'
    };
  }, [demandArrivalsGenerated, demandMode, periodCompleted, primaryConstraint]);

  const sampleConfidence = useMemo(() => {
    if (leadMetrics.sampleSize >= 20) {
      return { label: 'High', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    }
    if (leadMetrics.sampleSize >= 5) {
      return { label: 'Medium', className: 'bg-amber-100 text-amber-800 border-amber-200' };
    }
    return { label: 'Low', className: 'bg-slate-100 text-slate-700 border-slate-200' };
  }, [leadMetrics.sampleSize]);

  const waitingShare = useMemo(() => {
    if (leadMetrics.avgLeadWorking <= 0) return 0;
    const waiting = Math.max(0, leadMetrics.avgLeadWorking - leadMetrics.avgVAT);
    return (waiting / leadMetrics.avgLeadWorking) * 100;
  }, [leadMetrics.avgLeadWorking, leadMetrics.avgVAT]);

  const deliveryRate = useMemo(() => {
    if (demandMode !== 'target' || demandTotals.total <= 0) return null;
    return (periodCompleted / demandTotals.total) * 100;
  }, [demandMode, demandTotals.total, periodCompleted]);

  // Format time based on adaptive display config
  const formatTime = (ticks: number) => {
    if (displayConfig.divisor === 1) return ticks.toFixed(0);
    return (ticks / displayConfig.divisor).toFixed(1);
  };

  // If no history, show empty state
  if (history.length < 2) {
    return (
      <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border-2 border-slate-900 shadow-[6px_6px_0px_0px_rgba(15,23,42,0.9)] max-w-2xl w-full p-8 text-center">
          <div className="bg-slate-100 w-16 h-16 rounded-xl border-2 border-slate-900 flex items-center justify-center mx-auto mb-4 text-slate-500">
            <Activity size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">No Data Available</h2>
          <p className="text-slate-500 mb-6">Run the simulation for a few seconds to gather analytics data.</p>
          <button onClick={onClose} className="bg-slate-950 text-white px-6 py-2 rounded-xl border-2 border-slate-900 font-bold shadow-[3px_3px_0px_0px_rgba(15,23,42,0.9)] hover:bg-slate-800 active:translate-y-[2px] active:shadow-[1px_1px_0px_0px_rgba(15,23,42,0.9)] transition-all">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border-2 border-slate-900 shadow-[6px_6px_0px_0px_rgba(15,23,42,0.9)] max-w-5xl w-full h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b-2 border-slate-900 flex justify-between items-center bg-slate-950 text-white shrink-0">
          <div className="flex-1">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <TrendingUp size={20} />
              Performance Analytics
            </h2>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-xs text-slate-300">
                {formatTime(displayTickCount)} {displayConfig.unitName} observed
              </p>
              {isRunning && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                  ● Live
                </span>
              )}
            </div>
          </div>

          {/* Progress indicator (when duration is set) */}
          {targetDuration !== Infinity && (
            <div className="flex items-center gap-4 mr-4">
              <div className="text-right">
                <div className="text-[10px] text-slate-400 font-medium uppercase">Progress</div>
                <div className="text-sm font-bold">{simulationProgress.toFixed(1)}%</div>
              </div>
              <div className="w-28 h-2.5 bg-slate-700 rounded-full overflow-hidden border border-slate-600">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    simulationProgress >= 100 ? 'bg-emerald-400' : 'bg-blue-400'
                  }`}
                  style={{ width: `${Math.min(100, simulationProgress)}%` }}
                />
              </div>
            </div>
          )}

          <button onClick={onClose} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition border border-slate-700">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
          {lastRunSummary && (
            <div className="bg-white p-5 rounded-2xl border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.9)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold">Latest Run Summary</div>
                  <div className="text-lg font-bold text-slate-800 mt-1">
                    {lastRunSummary.outcome === 'target_run_completed' ? 'Target run completed' : 'Target run stopped early'}
                  </div>
                </div>
                <span
                  className={`text-[11px] px-2.5 py-1 rounded-full border-2 font-bold ${
                    lastRunSummary.outcome === 'target_run_completed'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-600'
                      : 'bg-amber-50 text-amber-700 border-amber-600'
                  }`}
                >
                  {lastRunSummary.outcome === 'target_run_completed' ? 'Logged' : 'Local'}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <div className="bg-slate-50 p-3 rounded-xl border-2 border-slate-200">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Arrivals</div>
                  <div className="text-2xl font-bold text-slate-700">{lastRunSummary.arrivals}</div>
                </div>
                <div className="bg-emerald-50 p-3 rounded-xl border-2 border-emerald-300">
                  <div className="text-[10px] text-emerald-600 uppercase font-bold">Completed</div>
                  <div className="text-2xl font-bold text-emerald-700">{lastRunSummary.completed}</div>
                </div>
                <div className="bg-amber-50 p-3 rounded-xl border-2 border-amber-300">
                  <div className="text-[10px] text-amber-600 uppercase font-bold">Backlog</div>
                  <div className="text-2xl font-bold text-amber-700">{lastRunSummary.backlogEnd}</div>
                </div>
                <div className="bg-blue-50 p-3 rounded-xl border-2 border-blue-300">
                  <div className="text-[10px] text-blue-600 uppercase font-bold">Service Level</div>
                  <div className="text-2xl font-bold text-blue-700">{lastRunSummary.score.toFixed(1)}%</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="bg-slate-50 p-3 rounded-xl border-2 border-slate-200">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Lead (Working)</div>
                  <div className="text-lg font-bold text-slate-700">{formatLeadTimeAbsolute(lastRunSummary.workingLeadAvg)}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border-2 border-slate-200">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Thru (Working)</div>
                  <div className="text-lg font-bold text-slate-700">{lastRunSummary.workingThroughput.toFixed(1)}/h</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border-2 border-slate-200">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Seed</div>
                  <div className="text-lg font-bold font-mono text-slate-500">{lastRunSummary.seed}</div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-slate-950 text-white p-5 rounded-2xl border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.9)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold">Operational Snapshot</div>
                <div className="text-lg font-bold mt-1">{executiveSummary.title}</div>
                <p className="text-sm text-slate-300 mt-1 leading-relaxed max-w-3xl">
                  {executiveSummary.message}
                </p>
              </div>
              <span className={`text-[11px] px-2.5 py-1 rounded-full border-2 font-bold shrink-0 ${sampleConfidence.className}`}>
                {sampleConfidence.label}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="bg-white/10 rounded-xl p-3 border-2 border-white/15">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Thru (Working)</div>
                <div className="text-2xl font-bold mt-1">{leadMetrics.throughputWorkingPerHour.toFixed(1)}<span className="text-sm text-slate-400 ml-1">/hr</span></div>
              </div>
              <div className="bg-white/10 rounded-xl p-3 border-2 border-white/15">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Lead (Working)</div>
                <div className="text-2xl font-bold mt-1">{formatLeadTimeAbsolute(leadMetrics.avgLeadWorking)}</div>
              </div>
            </div>
          </div>

          {demandMode === 'target' && (
            <div className="bg-white p-5 rounded-2xl border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.15)]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <BarChart3 size={16} className="text-slate-500" />
                  End-of-Period Demand Report
                </h3>
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider border-2 border-slate-300 rounded-full px-2.5 py-0.5">
                  per {demandUnit}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border-2 border-slate-200">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Target Arrivals</div>
                  <div className="text-xl font-bold text-slate-700">{demandTotals.total}</div>
                </div>
                <div className="bg-blue-50 p-3 rounded-xl border-2 border-blue-300">
                  <div className="text-[10px] text-blue-600 uppercase font-bold">Arrivals Generated</div>
                  <div className="text-xl font-bold text-blue-700">{demandArrivalsGenerated}</div>
                </div>
                <div className="bg-emerald-50 p-3 rounded-xl border-2 border-emerald-300">
                  <div className="text-[10px] text-emerald-600 uppercase font-bold">Completed</div>
                  <div className="text-xl font-bold text-emerald-700">{periodCompleted}</div>
                </div>
                <div className="bg-amber-50 p-3 rounded-xl border-2 border-amber-300">
                  <div className="text-[10px] text-amber-600 uppercase font-bold">Backlog (WIP)</div>
                  <div className="text-xl font-bold text-amber-700">{itemCounts.wip}</div>
                </div>
              </div>
              {deliveryRate !== null && (
                <div className="mt-3 text-xs text-slate-500">
                  Delivery attainment: <span className={`font-bold ${deliveryRate >= 100 ? 'text-emerald-600' : 'text-amber-600'}`}>{deliveryRate.toFixed(1)}%</span>
                </div>
              )}
              {demandTotals.perNode.length > 0 && (
                <div className="mt-3 text-xs text-slate-500">
                  <div className="font-semibold text-slate-600 mb-1">Per-start-node targets</div>
                  <div className="flex flex-wrap gap-2">
                    {demandTotals.perNode.map((n) => (
                      <span key={n.id} className="px-2 py-0.5 bg-slate-100 border-2 border-slate-300 rounded-lg text-slate-700 font-medium">
                        {n.label}: {n.target}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Summary Statistics */}
          <div className="flex items-end justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Gauge size={16} className="text-slate-500" />
                Core KPIs
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Windowed metrics from end-of-line completions ({windowLabel}).</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider border-2 border-slate-300 rounded-full px-2.5 py-0.5 text-slate-500">
              n={leadMetrics.sampleSize}
            </span>
          </div>

          {/* Hero KPIs — 3 promoted metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.15)] flex gap-4 items-start">
              <div className="w-1.5 h-14 rounded-full bg-blue-500 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Current WIP</div>
                <div className="text-3xl font-bold text-blue-600 mt-1">{stats.currentWip}</div>
                <div className="text-xs text-slate-400 mt-1">Peak {stats.peakWip} · Q {itemCounts.queued} · P {itemCounts.processing} · S {itemCounts.stuck}</div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.15)] flex gap-4 items-start">
              <div className="w-1.5 h-14 rounded-full bg-purple-500 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Thru (Working)</div>
                <div className={`text-3xl font-bold mt-1 ${lowSample ? 'text-slate-400' : 'text-purple-600'}`}>
                  {leadMetrics.throughputWorkingPerHour.toFixed(1)}<span className="text-base text-slate-400 ml-1">/hr</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">avg {stats.avgThroughput.toFixed(1)} · {windowLabel}</div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.15)] flex gap-4 items-start">
              <div className="w-1.5 h-14 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">PCE</div>
                <div className={`text-3xl font-bold font-mono mt-1 ${lowSample ? 'text-slate-400' : 'text-emerald-600'}`}>
                  {leadMetrics.pce.toFixed(0)}%
                </div>
                <div className="text-xs text-slate-400 mt-1">Value-added efficiency</div>
              </div>
            </div>
          </div>

          {/* Supporting KPIs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl border-2 border-slate-300 flex gap-3 items-start">
              <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold">Completed</div>
                <div className="text-xl font-bold text-emerald-600">{stats.totalCompleted}</div>
                <div className="text-xs text-slate-400">Total items finished</div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border-2 border-slate-300 flex gap-3 items-start">
              <Clock size={16} className="text-amber-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold">Lead (Working)</div>
                <div className={`text-xl font-bold font-mono ${lowSample ? 'text-slate-400' : 'text-amber-600'}`}>
                  {formatLeadTimeAbsolute(leadMetrics.avgLeadWorking)}
                </div>
                <div className="text-xs text-slate-400">Queue + processing · {windowLabel}</div>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-2xl border-2 border-blue-300 flex gap-4 items-start">
            <TrendingUp size={20} className="text-blue-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-blue-900">Consultant Readout</h3>
              <p className="text-sm text-blue-800 leading-relaxed mt-1">
                Focus on where work is sitting, which step is producing output, and how much lead time is waiting.
                Tall queue bars point to bottlenecks; low output or rising failures highlight the step to improve first.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="px-2.5 py-1 rounded-lg border-2 border-blue-400 bg-white text-xs font-bold text-blue-700">
                  Queue visible
                </span>
                <span className="px-2.5 py-1 rounded-lg border-2 border-blue-400 bg-white text-xs font-bold text-blue-700">
                  Output by step
                </span>
                <span className="px-2.5 py-1 rounded-lg border-2 border-blue-400 bg-white text-xs font-bold text-blue-700">
                  Waiting controlled
                </span>
              </div>
            </div>
          </div>

          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Activity size={16} className="text-purple-500" />
            Flow Diagnostics
          </h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.15)] overflow-hidden">
              <div className="h-1.5 bg-purple-500" />
              <div className="p-4">
                <h3 className="text-sm font-bold text-slate-700">Current WIP by Node</h3>
                <p className="text-xs text-slate-500 mt-1 mb-3">
                  Queue shows waiting. Processing shows work actively being handled right now.
                </p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={nodeWipData} barSize={30}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="node" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="queued" name="Queued" stackId="wip" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="processing" name="Processing" stackId="wip" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.15)] overflow-hidden">
              <div className="h-1.5 bg-emerald-500" />
              <div className="p-4">
                <h3 className="text-sm font-bold text-slate-700">Process Output by Step</h3>
                <p className="text-xs text-slate-500 mt-1 mb-3">
                  Compare completed work and failures across steps to spot weak stations quickly.
                </p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={nodeOutputData} barSize={30}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="node" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="processed" name="Processed" fill="#16a34a" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="failed" name="Failed" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <BarChart3 size={16} className="text-amber-500" />
            Composition & Demand
          </h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.15)] overflow-hidden">
              <div className="h-1.5 bg-amber-500" />
              <div className="p-4">
                <h3 className="text-sm font-bold text-slate-700 mb-3">Lead-Time Composition</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={leadCompositionData} barSize={48}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="ticks" name="Minutes" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {demandMode === 'target' && (
              <div className="bg-white rounded-2xl border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.15)] overflow-hidden">
                <div className="h-1.5 bg-blue-500" />
                <div className="p-4">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">Demand vs Delivery Balance</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={demandBalanceData} barSize={48}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="value" name="Items" fill="#2563eb" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>

          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <BarChart3 size={16} className="text-emerald-500" />
            Node Diagnostics
          </h3>
          {/* Per-Node Statistics Table */}
          {nodeStats.length > 0 && (
            <div className="bg-white rounded-2xl border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.15)] overflow-hidden">
              <div className="px-4 py-3 bg-slate-950 text-white flex items-center gap-2">
                <BarChart3 size={16} />
                <h3 className="text-sm font-bold">Node Performance</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200 bg-slate-50">
                      <th className="text-left py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Node</th>
                      <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Processed</th>
                      <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Failed</th>
                      <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Queue</th>
                      <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Utilization</th>
                      <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quality</th>
                      <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodeStats.map((node, idx) => (
                      <tr key={node.id} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-slate-50/50' : ''}`}>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full border-2 ${
                              node.type === 'startNode' ? 'bg-emerald-500 border-emerald-700' :
                              node.type === 'endNode' ? 'bg-slate-800 border-slate-950' : 'bg-blue-500 border-blue-700'
                            }`}></span>
                            <span className="font-semibold text-slate-700">{node.label}</span>
                          </div>
                        </td>
                        <td className="text-right py-2.5 px-3 font-mono font-bold text-slate-700">{node.processed}</td>
                        <td className="text-right py-2.5 px-3 font-mono">
                          {node.failed > 0 ? (
                            <span className="text-red-600 font-bold flex items-center justify-end gap-1">
                              <AlertTriangle size={12} />
                              {node.failed}
                            </span>
                          ) : (
                            <span className="text-slate-300">0</span>
                          )}
                        </td>
                        <td className="text-right py-2.5 px-3">
                          <span className={`font-mono font-bold ${node.queueLength > 5 ? 'text-amber-600' : 'text-slate-600'}`}>
                            {node.queueLength}
                          </span>
                        </td>
                        <td className="text-right py-2.5 px-3">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2.5 bg-slate-200 rounded-full overflow-hidden border border-slate-300">
                              <div
                                className={`h-full transition-all ${
                                  node.utilization > 80 ? 'bg-red-500' :
                                  node.utilization > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(100, node.utilization)}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono font-bold text-slate-600 w-10 text-right">
                              {node.utilization.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="text-right py-2.5 px-3">
                          <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-lg border-2 ${
                            node.quality >= 95 ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                            node.quality >= 80 ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-red-50 text-red-700 border-red-300'
                          }`}>
                            {node.quality.toFixed(0)}%
                          </span>
                        </td>
                        <td className="text-right py-2.5 px-3 font-mono font-bold text-slate-600">
                          {formatTime(node.processingTime)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-400">
                High queue lengths and utilization over 80% may indicate bottlenecks.
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default memo(AnalyticsDashboard);
