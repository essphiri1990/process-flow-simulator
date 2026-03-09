import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { X, TrendingUp, Activity, BarChart3, Clock, CheckCircle2 } from 'lucide-react';
import {
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ComposedChart,
  Bar,
  Line,
} from 'recharts';

import { KpiBucket, KpiPeriod, TICKS_PER_WORKDAY } from '../types';
import { computeLeadMetrics, formatCompletionWindowLabel } from '../metrics';

interface AnalyticsDashboardProps {
  onClose: () => void;
}

type OverlayMode = 'average' | 'trend';

const PERIOD_OPTIONS: { id: KpiPeriod; label: string }[] = [
  { id: 'hour', label: 'Hourly' },
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

const buildChartWidth = (count: number) => Math.max(720, count * 72);

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

const formatLeadTimeCompact = (ticks: number): string => {
  if (ticks < 60) return `${ticks.toFixed(0)}m`;
  if (ticks < TICKS_PER_WORKDAY) return `${(ticks / 60).toFixed(1)}h`;
  return `${(ticks / TICKS_PER_WORKDAY).toFixed(1)}d`;
};

const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

const buildKpiChartData = (
  buckets: KpiBucket[],
  selector: (bucket: KpiBucket) => number,
  target: number,
) => {
  const actualValues = buckets.map(selector);
  const average = actualValues.length > 0
    ? actualValues.reduce((sum, value) => sum + value, 0) / actualValues.length
    : 0;

  return buckets.map((bucket, index) => {
    const actual = selector(bucket);
    const trailingWindow = actualValues.slice(Math.max(0, index - 2), index + 1);
    const trend = trailingWindow.length > 0
      ? trailingWindow.reduce((sum, value) => sum + value, 0) / trailingWindow.length
      : actual;

    return {
      label: bucket.label,
      actual,
      target: target > 0 ? target : null,
      average,
      trend,
    };
  });
};

const computeAttainment = (actual: number, target: number, lowerIsBetter = false): number | null => {
  if (target <= 0) return null;
  if (lowerIsBetter) {
    return actual <= 0 ? 0 : (target / actual) * 100;
  }
  return (actual / target) * 100;
};

const getAttainmentTone = (value: number | null): string => {
  if (value === null) return 'text-slate-500';
  if (value >= 100) return 'text-emerald-600';
  if (value >= 85) return 'text-amber-600';
  return 'text-rose-600';
};

const TrendChartCard = ({
  title,
  description,
  overlayMode,
  actualLabel,
  targetLabel,
  actualValue,
  targetValue,
  attainment,
  attainmentLabel,
  actualFormatter,
  axisFormatter,
  chartData,
  actualColor,
  targetColor,
  overlayColor,
}: {
  title: string;
  description: string;
  overlayMode: OverlayMode;
  actualLabel: string;
  targetLabel: string;
  actualValue: number;
  targetValue: number;
  attainment: number | null;
  attainmentLabel: string;
  actualFormatter: (value: number) => string;
  axisFormatter: (value: number) => string;
  chartData: Array<{ label: string; actual: number; target: number | null; average: number; trend: number }>;
  actualColor: string;
  targetColor: string;
  overlayColor: string;
}) => {
  const hasTarget = targetValue > 0;
  const overlayDataKey = overlayMode === 'average' ? 'average' : 'trend';
  const overlayLabel = overlayMode === 'average' ? 'Average' : 'Trend';
  const overlayValue = chartData.length > 0 ? chartData[chartData.length - 1][overlayDataKey] : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        <div className="flex items-baseline gap-3 mt-2">
          <span className="text-lg font-bold text-slate-900">{actualFormatter(actualValue)}</span>
          <span className="text-[11px] text-slate-400">
            {hasTarget ? `Target ${actualFormatter(targetValue)}` : 'No target'}
          </span>
          {attainment !== null && (
            <span className={`text-[11px] font-semibold ${getAttainmentTone(attainment)}`}>
              {attainment.toFixed(0)}%
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="overflow-x-auto pb-1">
          <ComposedChart width={buildChartWidth(chartData.length)} height={220} data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={axisFormatter} />
            <Tooltip
              formatter={(value: number, name: string) => [
                actualFormatter(Number(value)),
                name,
              ]}
            />
            <Bar dataKey="actual" name={actualLabel} fill={actualColor} radius={[3, 3, 0, 0]} />
            {hasTarget ? (
              <Line
                type="monotone"
                dataKey="target"
                name={targetLabel}
                stroke={targetColor}
                strokeWidth={1.5}
                strokeDasharray="6 6"
                dot={false}
                connectNulls
              />
            ) : null}
            <Line
              type="monotone"
              dataKey={overlayDataKey}
              name={overlayLabel}
              stroke={overlayColor}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </div>
      </div>
    </div>
  );
};

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ onClose }) => {
  const history = useStore((state) => state.history);
  const isRunning = useStore((state) => state.isRunning);
  const nodes = useStore((state) => state.nodes);
  const items = useStore((state) => state.items);
  const displayTickCount = useStore((state) => state.displayTickCount);
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
  const kpiHistoryByPeriod = useStore((state) => state.kpiHistoryByPeriod);
  const kpiTargets = useStore((state) => state.kpiTargets);
  const setKpiTargets = useStore((state) => state.setKpiTargets);

  const [selectedPeriod, setSelectedPeriod] = useState<KpiPeriod>('day');
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('average');

  const leadMetrics = useMemo(
    () =>
      computeLeadMetrics(items, {
        windowSize: metricsWindowCompletions,
        metricsEpoch,
      }),
    [items, metricsEpoch, metricsWindowCompletions],
  );

  const selectedBuckets = kpiHistoryByPeriod[selectedPeriod] || [];
  const latestBucket = selectedBuckets[selectedBuckets.length - 1] || null;
  const windowLabel = formatCompletionWindowLabel(metricsWindowCompletions);

  const demandTotals = useMemo(() => {
    let total = 0;
    const perNode: { id: string; label: string; target: number }[] = [];
    for (const node of nodes) {
      if (node.type !== 'startNode') continue;
      const target = (node.data as any).demandTarget || 0;
      if (target > 0) {
        total += target;
        perNode.push({ id: node.id, label: (node.data as any).label || 'Start', target });
      }
    }
    return { total, perNode };
  }, [nodes]);

  const deliveryRate = useMemo(() => {
    if (demandMode !== 'target' || demandTotals.total <= 0) return null;
    return (periodCompleted / demandTotals.total) * 100;
  }, [demandMode, demandTotals.total, periodCompleted]);

  const leadChartData = useMemo(
    () => buildKpiChartData(selectedBuckets, (bucket) => bucket.leadTimeAvg, kpiTargets.leadTime),
    [kpiTargets.leadTime, selectedBuckets],
  );

  const pceChartData = useMemo(
    () => buildKpiChartData(selectedBuckets, (bucket) => bucket.processEfficiencyAvg, kpiTargets.processEfficiency),
    [kpiTargets.processEfficiency, selectedBuckets],
  );

  const utilizationChartData = useMemo(
    () => buildKpiChartData(selectedBuckets, (bucket) => bucket.resourceUtilizationAvg, kpiTargets.resourceUtilization),
    [kpiTargets.resourceUtilization, selectedBuckets],
  );

  const leadAttainment = useMemo(
    () => computeAttainment(latestBucket?.leadTimeAvg || 0, kpiTargets.leadTime, true),
    [kpiTargets.leadTime, latestBucket?.leadTimeAvg],
  );
  const pceAttainment = useMemo(
    () => computeAttainment(latestBucket?.processEfficiencyAvg || 0, kpiTargets.processEfficiency),
    [kpiTargets.processEfficiency, latestBucket?.processEfficiencyAvg],
  );
  const utilizationAttainment = useMemo(
    () => computeAttainment(latestBucket?.resourceUtilizationAvg || 0, kpiTargets.resourceUtilization),
    [kpiTargets.resourceUtilization, latestBucket?.resourceUtilizationAvg],
  );

  if (history.length < 2 && selectedBuckets.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full p-8 text-center">
          <div className="bg-slate-50 w-14 h-14 rounded-xl border border-slate-200 flex items-center justify-center mx-auto mb-4 text-slate-400">
            <Activity size={28} />
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">No Data Available</h2>
          <p className="text-sm text-slate-500 mb-6">Run the simulation to generate KPI history and throughput data.</p>
          <button onClick={onClose} className="bg-slate-900 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 transition">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-6xl w-full h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp size={18} className="text-slate-500" />
              Performance Analytics
            </h2>
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-xs text-slate-400">{formatLeadTimeAbsolute(displayTickCount)} observed</p>
              {isRunning ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              ) : null}
            </div>
          </div>

          {targetDuration !== Infinity ? (
            <div className="flex items-center gap-3 mr-4">
              <span className="text-sm font-semibold text-slate-600">{simulationProgress.toFixed(1)}%</span>
              <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    simulationProgress >= 100 ? 'bg-emerald-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(100, simulationProgress)}%` }}
                />
              </div>
            </div>
          ) : null}

          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/50">
          {lastRunSummary ? (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Latest Run</div>
                  <div className="text-sm font-bold text-slate-800 mt-0.5">
                    {lastRunSummary.outcome === 'target_run_completed' ? 'Target run completed' : 'Target run stopped early'}
                  </div>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    lastRunSummary.outcome === 'target_run_completed'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {lastRunSummary.outcome === 'target_run_completed' ? 'Logged' : 'Local'}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="bg-slate-50 px-3 py-2 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Arrivals</div>
                  <div className="text-xl font-bold text-slate-700">{lastRunSummary.arrivals}</div>
                </div>
                <div className="bg-emerald-50 px-3 py-2 rounded-lg">
                  <div className="text-[10px] text-emerald-500 uppercase font-semibold">Completed</div>
                  <div className="text-xl font-bold text-emerald-700">{lastRunSummary.completed}</div>
                </div>
                <div className="bg-amber-50 px-3 py-2 rounded-lg">
                  <div className="text-[10px] text-amber-500 uppercase font-semibold">Backlog</div>
                  <div className="text-xl font-bold text-amber-700">{lastRunSummary.backlogEnd}</div>
                </div>
                <div className="bg-blue-50 px-3 py-2 rounded-lg">
                  <div className="text-[10px] text-blue-500 uppercase font-semibold">Service Level</div>
                  <div className="text-xl font-bold text-blue-700">{lastRunSummary.score.toFixed(1)}%</div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Lead (Working)</div>
              <div className="text-2xl font-bold text-amber-600 mt-1">{formatLeadTimeAbsolute(leadMetrics.avgLeadWorking)}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{windowLabel}</div>
            </div>

            <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">PCE</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1">{leadMetrics.pce.toFixed(1)}%</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Completion window</div>
            </div>

            <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Utilisation</div>
              <div className="text-2xl font-bold text-teal-600 mt-1">{(latestBucket?.resourceUtilizationAvg || 0).toFixed(1)}%</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Latest {selectedPeriod} average</div>
            </div>

            <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Current WIP</div>
              <div className="text-2xl font-bold text-blue-600 mt-1">{itemCounts.wip}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Q {itemCounts.queued} · P {itemCounts.processing} · S {itemCounts.stuck}</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <div className="text-sm font-bold text-slate-800">Period KPI View</div>
                <p className="text-xs text-slate-400 mt-0.5">Historical averages by {selectedPeriod}</p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {PERIOD_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedPeriod(option.id)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                      selectedPeriod === option.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
                <span className="w-px bg-slate-200 mx-1" />
                <button
                  type="button"
                  onClick={() => setOverlayMode('average')}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    overlayMode === 'average'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Average
                </button>
                <button
                  type="button"
                  onClick={() => setOverlayMode('trend')}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    overlayMode === 'trend'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Trend
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
              <div className="bg-slate-50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Latest {selectedPeriod} Lead</div>
                <div className="text-xl font-bold text-slate-800 mt-0.5">{formatLeadTimeAbsolute(latestBucket?.leadTimeAvg || 0)}</div>
                <div className={`text-[11px] mt-0.5 ${getAttainmentTone(leadAttainment)}`}>
                  {leadAttainment === null ? 'Set a target below' : `Attainment ${leadAttainment.toFixed(0)}%`}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Latest {selectedPeriod} PCE</div>
                <div className="text-xl font-bold text-slate-800 mt-0.5">{(latestBucket?.processEfficiencyAvg || 0).toFixed(1)}%</div>
                <div className={`text-[11px] mt-0.5 ${getAttainmentTone(pceAttainment)}`}>
                  {pceAttainment === null ? 'Set a target below' : `Attainment ${pceAttainment.toFixed(0)}%`}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Latest {selectedPeriod} Util</div>
                <div className="text-xl font-bold text-slate-800 mt-0.5">{(latestBucket?.resourceUtilizationAvg || 0).toFixed(1)}%</div>
                <div className={`text-[11px] mt-0.5 ${getAttainmentTone(utilizationAttainment)}`}>
                  {utilizationAttainment === null ? 'Set a target below' : `Attainment ${utilizationAttainment.toFixed(0)}%`}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <label className="block">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Lead Time Target</div>
                <input
                  type="number"
                  min="0"
                  value={kpiTargets.leadTime}
                  onChange={(event) => setKpiTargets({ leadTime: Number(event.target.value) })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
                <div className="mt-1 text-[11px] text-slate-400">Minutes. 0 hides target.</div>
              </label>
              <label className="block">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">PCE Target</div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={kpiTargets.processEfficiency}
                  onChange={(event) => setKpiTargets({ processEfficiency: Number(event.target.value) })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
                <div className="mt-1 text-[11px] text-slate-400">Percentage target.</div>
              </label>
              <label className="block">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Utilisation Target</div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={kpiTargets.resourceUtilization}
                  onChange={(event) => setKpiTargets({ resourceUtilization: Number(event.target.value) })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-300"
                />
                <div className="mt-1 text-[11px] text-slate-400">Percentage target.</div>
              </label>
            </div>
          </div>

          {demandMode === 'target' ? (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <BarChart3 size={15} className="text-slate-400" />
                  Demand Report
                </h3>
                <span className="text-[10px] text-slate-400 uppercase font-medium tracking-wider bg-slate-100 rounded-full px-2 py-0.5">
                  per {demandUnit}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="bg-slate-50 px-3 py-2 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Target</div>
                  <div className="text-xl font-bold text-slate-700">{demandTotals.total}</div>
                </div>
                <div className="bg-blue-50 px-3 py-2 rounded-lg">
                  <div className="text-[10px] text-blue-500 uppercase font-semibold">Generated</div>
                  <div className="text-xl font-bold text-blue-700">{demandArrivalsGenerated}</div>
                </div>
                <div className="bg-emerald-50 px-3 py-2 rounded-lg">
                  <div className="text-[10px] text-emerald-500 uppercase font-semibold">Completed</div>
                  <div className="text-xl font-bold text-emerald-700">{periodCompleted}</div>
                </div>
                <div className="bg-amber-50 px-3 py-2 rounded-lg">
                  <div className="text-[10px] text-amber-500 uppercase font-semibold">Backlog</div>
                  <div className="text-xl font-bold text-amber-700">{itemCounts.wip}</div>
                </div>
              </div>
              {deliveryRate !== null ? (
                <div className="mt-2 text-xs text-slate-500">
                  Delivery attainment:{' '}
                  <span className={deliveryRate >= 100 ? 'font-semibold text-emerald-600' : 'font-semibold text-amber-600'}>
                    {deliveryRate.toFixed(1)}%
                  </span>
                </div>
              ) : null}
              {demandTotals.perNode.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {demandTotals.perNode.map((node) => (
                    <span key={node.id} className="px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-md text-[11px] font-medium text-slate-600">
                      {node.label}: {node.target}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <TrendChartCard
              title="Lead Time Trend"
              description={`Average completed-item lead time by ${selectedPeriod}. Lower is better.`}
              overlayMode={overlayMode}
              actualLabel="Actual Lead"
              targetLabel="Lead Target"
              actualValue={latestBucket?.leadTimeAvg || 0}
              targetValue={kpiTargets.leadTime}
              attainment={leadAttainment}
              attainmentLabel="Attainment"
              actualFormatter={formatLeadTimeAbsolute}
              axisFormatter={formatLeadTimeCompact}
              chartData={leadChartData}
              actualColor="#f59e0b"
              targetColor="#64748b"
              overlayColor="#1d4ed8"
            />

            <TrendChartCard
              title="Process Efficiency Trend"
              description={`Average process cycle efficiency by ${selectedPeriod}. Higher is better.`}
              overlayMode={overlayMode}
              actualLabel="Actual PCE"
              targetLabel="PCE Target"
              actualValue={latestBucket?.processEfficiencyAvg || 0}
              targetValue={kpiTargets.processEfficiency}
              attainment={pceAttainment}
              attainmentLabel="Attainment"
              actualFormatter={formatPercent}
              axisFormatter={formatPercent}
              chartData={pceChartData}
              actualColor="#10b981"
              targetColor="#64748b"
              overlayColor="#1d4ed8"
            />

            <TrendChartCard
              title="Resource Utilisation Trend"
              description={`Average resource utilisation by ${selectedPeriod}. Higher is better.`}
              overlayMode={overlayMode}
              actualLabel="Actual Util"
              targetLabel="Util Target"
              actualValue={latestBucket?.resourceUtilizationAvg || 0}
              targetValue={kpiTargets.resourceUtilization}
              attainment={utilizationAttainment}
              attainmentLabel="Attainment"
              actualFormatter={formatPercent}
              axisFormatter={formatPercent}
              chartData={utilizationChartData}
              actualColor="#0f766e"
              targetColor="#64748b"
              overlayColor="#1d4ed8"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm flex gap-3 items-center">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <CheckCircle2 size={16} className="text-emerald-500" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Throughput (Working)</div>
                <div className="text-lg font-bold text-emerald-600">{leadMetrics.throughputWorkingPerHour.toFixed(1)}/h</div>
              </div>
            </div>

            <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm flex gap-3 items-center">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <Clock size={16} className="text-amber-500" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Lead (Elapsed)</div>
                <div className="text-lg font-bold text-amber-600">{formatLeadTimeAbsolute(leadMetrics.avgLeadElapsed)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
