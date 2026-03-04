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
  LineChart,
  Line,
  AreaChart,
  Area,
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
  const throughput = useStore((state) => state.throughput);
  const itemCounts = useStore((state) => state.itemCounts);
  const demandMode = useStore((state) => state.demandMode);
  const demandUnit = useStore((state) => state.demandUnit);
  const demandArrivalsGenerated = useStore((state) => state.demandArrivalsGenerated);
  const periodCompleted = useStore((state) => state.periodCompleted);

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
        utilization: data.resources > 0 ? (processingCount / data.resources) * 100 : 0,
        quality: (data.quality || 1) * 100,
        processingTime: data.processingTime || 0,
        resources: data.resources || 1
      };
    }).sort((a, b) => b.processed - a.processed);
  }, [nodes, items]);

  const trendData = useMemo(
    () =>
      history.map((h) => ({
        elapsed: Number((h.tick / displayConfig.divisor).toFixed(1)),
        throughput: Number(h.throughput.toFixed(2)),
        wip: h.wip,
        completed: h.totalCompleted,
      })),
    [history, displayConfig.divisor]
  );

  const leadCompositionData = useMemo(
    () => [
      { name: 'Value-Added', ticks: Number(leadMetrics.avgVAT.toFixed(2)) },
      { name: 'Waiting', ticks: Number(Math.max(0, leadMetrics.avgLeadTime - leadMetrics.avgVAT).toFixed(2)) },
    ],
    [leadMetrics.avgLeadTime, leadMetrics.avgVAT]
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
    () =>
      nodeStats.slice(0, 8).map((node) => ({
        node: node.label.length > 14 ? `${node.label.slice(0, 14)}…` : node.label,
        processed: node.processed,
        failed: node.failed,
      })),
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
    if (leadMetrics.avgLeadTime <= 0) return 0;
    const waiting = Math.max(0, leadMetrics.avgLeadTime - leadMetrics.avgVAT);
    return (waiting / leadMetrics.avgLeadTime) * 100;
  }, [leadMetrics.avgLeadTime, leadMetrics.avgVAT]);

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
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 text-center border border-slate-200">
          <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
            <Activity size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">No Data Available</h2>
          <p className="text-slate-500 mb-6">Run the simulation for a few seconds to gather analytics data.</p>
          <button onClick={onClose} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full h-[90vh] overflow-hidden border border-slate-200 flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp className="text-blue-600" />
              Performance Analytics
            </h2>
            <p className="text-xs text-slate-500">
              Real-time simulation metrics • {formatTime(displayTickCount)} {displayConfig.unitName} elapsed
              {isRunning && <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 font-bold animate-pulse">● Live</span>}
            </p>
          </div>

          {/* Progress indicator (when duration is set) */}
          {targetDuration !== Infinity && (
            <div className="flex items-center gap-4 mr-4">
              <div className="text-right">
                <div className="text-xs text-slate-500 font-medium">Progress</div>
                <div className="text-sm font-bold text-slate-700">{simulationProgress.toFixed(1)}%</div>
              </div>
              <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    simulationProgress >= 100 ? 'bg-emerald-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(100, simulationProgress)}%` }}
                />
              </div>
            </div>
          )}

          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 rounded-2xl border border-slate-700 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-300 font-semibold">Operational Snapshot</div>
                <div className="text-lg font-semibold mt-1">{executiveSummary.title}</div>
                <p className="text-sm text-slate-300 mt-1 leading-relaxed max-w-3xl">
                  {executiveSummary.message}
                </p>
              </div>
              <span className={`text-[11px] px-2 py-1 rounded-full border font-semibold shrink-0 ${sampleConfidence.className}`}>
                {sampleConfidence.label} confidence
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
              <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                <div className="text-[10px] uppercase tracking-wider text-slate-300 font-semibold">Throughput</div>
                <div className="text-xl font-bold mt-1">{throughput.toFixed(1)}<span className="text-sm text-slate-300">/hr</span></div>
              </div>
              <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                <div className="text-[10px] uppercase tracking-wider text-slate-300 font-semibold">Lead Time</div>
                <div className="text-xl font-bold mt-1">{formatLeadTimeAbsolute(leadMetrics.avgLeadTime)}</div>
              </div>
              <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                <div className="text-[10px] uppercase tracking-wider text-slate-300 font-semibold">Waiting Share</div>
                <div className="text-xl font-bold mt-1">{waitingShare.toFixed(0)}%</div>
              </div>
              <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                <div className="text-[10px] uppercase tracking-wider text-slate-300 font-semibold">Current WIP</div>
                <div className="text-xl font-bold mt-1">{stats.currentWip}</div>
              </div>
            </div>
          </div>

          {demandMode === 'target' && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <BarChart3 size={16} className="text-slate-500" />
                  End-of-Period Demand Report
                </h3>
                <span className="text-xs text-slate-400 uppercase">
                  per {demandUnit}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Target Arrivals</div>
                  <div className="text-xl font-bold text-slate-700">{demandTotals.total}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Arrivals Generated</div>
                  <div className="text-xl font-bold text-blue-600">{demandArrivalsGenerated}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Completed</div>
                  <div className="text-xl font-bold text-emerald-600">{periodCompleted}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Backlog (WIP)</div>
                  <div className="text-xl font-bold text-amber-600">{itemCounts.wip}</div>
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
                      <span key={n.id} className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded">
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
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Core KPIs</h3>
              <p className="text-xs text-slate-500 mt-0.5">Windowed metrics from end-of-line completions ({windowLabel}).</p>
            </div>
            <div className="text-xs text-slate-500">
              Sample size: <span className="font-semibold text-slate-700">{leadMetrics.sampleSize}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Gauge size={14} />
                <span className="text-xs font-bold uppercase">Current WIP</span>
              </div>
              <div className="text-2xl font-bold text-blue-600">{stats.currentWip}</div>
              <div className="text-xs text-slate-400">Peak: {stats.peakWip}</div>
              <div className="text-xs text-slate-400 mt-1">
                Q {itemCounts.queued} · P {itemCounts.processing} · T {itemCounts.transit} · S {itemCounts.stuck}
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <CheckCircle2 size={14} />
                <span className="text-xs font-bold uppercase">Completed</span>
              </div>
              <div className="text-2xl font-bold text-emerald-600">{stats.totalCompleted}</div>
              <div className="text-xs text-slate-400">Total items finished</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Activity size={14} />
                <span className="text-xs font-bold uppercase">Throughput</span>
              </div>
              <div className={`text-2xl font-bold ${lowSample ? 'text-slate-400' : 'text-purple-600'}`}>
                {throughput.toFixed(1)}
              </div>
              <div className="text-xs text-slate-400">
                items / hour • n={leadMetrics.sampleSize} • {windowLabel}
              </div>
              <div className="text-xs text-slate-400">avg: {stats.avgThroughput.toFixed(1)}</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Clock size={14} />
                <span className="text-xs font-bold uppercase">Avg WIP</span>
              </div>
              <div className="text-2xl font-bold text-amber-600">{stats.avgWip.toFixed(1)}</div>
              <div className="text-xs text-slate-400">Items in system</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Clock size={14} />
                <span className="text-xs font-bold uppercase">Lead Time</span>
              </div>
              <div className={`text-2xl font-bold font-mono ${lowSample ? 'text-slate-400' : 'text-amber-600'}`}>
                {formatLeadTimeAbsolute(leadMetrics.avgLeadTime)}
              </div>
              <div className="text-xs text-slate-400">Queue + processing (transit excluded)</div>
              <div className="text-xs text-slate-400">n={leadMetrics.sampleSize} • {windowLabel}</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Activity size={14} />
                <span className="text-xs font-bold uppercase">PCE</span>
              </div>
              <div className={`text-2xl font-bold font-mono ${lowSample ? 'text-slate-400' : 'text-emerald-600'}`}>
                {leadMetrics.pce.toFixed(0)}%
              </div>
              <div className="text-xs text-slate-400">Value-added efficiency</div>
              <div className="text-xs text-slate-400">n={leadMetrics.sampleSize} • {windowLabel}</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-600" />
              Consultant Readout
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              This snapshot shows how well current capacity is converting incoming demand into completed output.
              Throughput and lead time are calculated from recent end-of-line completions, so the KPIs reflect
              actual delivered outcomes rather than in-flight visual movement.
            </p>
            <p className="text-sm text-slate-600 leading-relaxed mt-2">
              For operations reviews, focus on three signals together: sustained throughput trend, WIP buildup,
              and lead-time composition (value-added vs waiting). Rising WIP with flat throughput is a bottleneck
              warning; rising waiting share indicates queue pressure that should be addressed with capacity,
              balancing, or arrival smoothing.
            </p>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="text-xs uppercase tracking-widest text-slate-400 font-bold">Interpretation Checklist</div>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="px-2 py-1 rounded-md border border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  Throughput trend stable
                </span>
                <span className="px-2 py-1 rounded-md border border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  WIP not rising faster than output
                </span>
                <span className="px-2 py-1 rounded-md border border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  Waiting share controlled
                </span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Trend Analysis</h3>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-3">Throughput & WIP Trend</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="elapsed" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="throughput" name="Throughput (items/hr)" stroke="#7c3aed" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="wip" name="WIP" stroke="#0284c7" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-3">Completion Accumulation</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="elapsed" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="completed" name="Completed Items" stroke="#16a34a" fill="#86efac" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Composition & Demand</h3>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-3">Lead-Time Composition</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={leadCompositionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="ticks" name="Minutes" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {demandMode === 'target' && (
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-3">Demand vs Delivery Balance</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={demandBalanceData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="value" name="Items" fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Node Diagnostics</h3>
          </div>
          {nodeOutputData.length > 0 && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-3">Node Output Comparison</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={nodeOutputData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="node" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="processed" name="Processed" fill="#16a34a" />
                    <Bar dataKey="failed" name="Failed" fill="#dc2626" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Per-Node Statistics Table */}
          {nodeStats.length > 0 && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <BarChart3 size={16} className="text-slate-500" />
                Node Performance
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 px-3 text-xs font-bold text-slate-500 uppercase">Node</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-slate-500 uppercase">Processed</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-slate-500 uppercase">Failed</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-slate-500 uppercase">Queue</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-slate-500 uppercase">Utilization</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-slate-500 uppercase">Quality</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-slate-500 uppercase">Time/{displayConfig.unitName}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodeStats.map((node, idx) => (
                      <tr key={node.id} className={idx % 2 === 0 ? 'bg-slate-50/50' : ''}>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${
                              node.type === 'startNode' ? 'bg-emerald-500' :
                              node.type === 'endNode' ? 'bg-red-500' : 'bg-blue-500'
                            }`}></span>
                            <span className="font-medium text-slate-700">{node.label}</span>
                          </div>
                        </td>
                        <td className="text-right py-2 px-3 font-mono text-slate-600">{node.processed}</td>
                        <td className="text-right py-2 px-3 font-mono">
                          {node.failed > 0 ? (
                            <span className="text-red-500 flex items-center justify-end gap-1">
                              <AlertTriangle size={12} />
                              {node.failed}
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="text-right py-2 px-3">
                          <span className={`font-mono ${node.queueLength > 5 ? 'text-amber-600 font-bold' : 'text-slate-600'}`}>
                            {node.queueLength}
                          </span>
                        </td>
                        <td className="text-right py-2 px-3">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  node.utilization > 80 ? 'bg-red-500' :
                                  node.utilization > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(100, node.utilization)}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono text-slate-500 w-10 text-right">
                              {node.utilization.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="text-right py-2 px-3">
                          <span className={`font-mono text-xs px-2 py-0.5 rounded ${
                            node.quality >= 95 ? 'bg-emerald-100 text-emerald-700' :
                            node.quality >= 80 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {node.quality.toFixed(0)}%
                          </span>
                        </td>
                        <td className="text-right py-2 px-3 font-mono text-slate-600">
                          {formatTime(node.processingTime)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400 mt-3">
                High queue lengths and utilization over 80% may indicate bottlenecks.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default memo(AnalyticsDashboard);
