import React, { useMemo } from 'react';
import { useStore } from '../store';
import { TrendingUp, Clock, Hourglass, BarChart2, Activity } from 'lucide-react';
import { TICKS_PER_WORKDAY } from '../types';
import { computeLeadMetrics, formatCompletionWindowLabel } from '../metrics';

interface VSMStatsProps {
    onOpenAnalytics?: () => void;
}

const VSMStats: React.FC<VSMStatsProps> = ({ onOpenAnalytics }) => {
  const items = useStore((state) => state.items);
  const throughput = useStore((state) => state.throughput);
  const itemCounts = useStore((state) => state.itemCounts);
  const metricsEpoch = useStore((state) => state.metricsEpoch);
  const metricsWindowCompletions = useStore((state) => state.metricsWindowCompletions);

  const metrics = useMemo(
    () => computeLeadMetrics(items, {
      windowSize: metricsWindowCompletions,
      metricsEpoch
    }),
    [items, metricsWindowCompletions, metricsEpoch]
  );
  const { avgLeadWorking, avgLeadElapsed, avgClosed, avgVAT, pce, sampleSize } = metrics;
  const lowSample = sampleSize < 5;
  const windowLabel = formatCompletionWindowLabel(metricsWindowCompletions);
  const metricsTooltip = lowSample
    ? `Low sample size (n=${sampleSize}). Window: ${windowLabel}`
    : `n=${sampleSize}. Window: ${windowLabel}`;

  // Use pre-computed WIP count
  const wip = itemCounts.wip;
  const wipBreakdown = `Q ${itemCounts.queued} · P ${itemCounts.processing} · S ${itemCounts.stuck}`;

  // Format time as human-readable mixed units (e.g. "2h 15m", "1d 3h")
  const formatTime = (ticks: number): string => {
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

  return (
    <div className="fixed top-4 right-4 bg-white border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.9)] p-4 rounded-2xl z-40 w-64 transition-all group">
       <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp size={16} className="text-blue-600" />
                VSM Metrics
            </h3>
            {onOpenAnalytics && (
                <button
                    onClick={onOpenAnalytics}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg border-2 border-slate-300 text-slate-500 hover:text-blue-600 transition-all active:translate-y-[1px]"
                    title="View Detailed Analytics"
                >
                    <BarChart2 size={16} />
                </button>
            )}
       </div>

       <div className="space-y-3">
          {/* PCE */}
          <div className="flex flex-col group/pce relative">
             <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Flow Efficiency (PCE)</span>
                <span
                  className={`font-bold ${lowSample ? 'text-slate-400' : 'text-slate-700'}`}
                  title={metricsTooltip}
                >
                  {pce.toFixed(1)}%
                </span>
             </div>
             <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden border border-slate-300">
                <div
                   className={`h-full transition-all duration-500 ${pce > 20 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                   style={{ width: `${Math.min(100, pce)}%` }}
                />
             </div>

             {/* Tooltip for PCE Breakdown */}
             <div className="absolute bottom-full mb-2 left-0 w-full bg-slate-800 text-white text-[10px] p-2 rounded opacity-0 group-hover/pce:opacity-100 transition-opacity pointer-events-none z-50">
                 <div className="flex justify-between"><span>Value Added:</span> <span>{formatTime(avgVAT)}</span></div>
                 <div className="flex justify-between"><span>Waiting:</span> <span>{formatTime(Math.max(0, avgLeadWorking - avgVAT))}</span></div>
                 <div className="flex justify-between"><span>Closed:</span> <span>{formatTime(avgClosed)}</span></div>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
             <div className="bg-slate-50 p-2 rounded-lg border-2 border-slate-200">
                <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                   <Clock size={10} /> Lead (Working)
                </div>
                <div
                  className={`text-lg font-mono font-bold whitespace-nowrap ${lowSample ? 'text-slate-400' : 'text-slate-700'}`}
                  title={metricsTooltip}
                >
                   {formatTime(avgLeadWorking)}
                </div>
             </div>

             <div className="bg-slate-50 p-2 rounded-lg border-2 border-slate-200">
                <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                   <Clock size={10} /> Lead (Elapsed)
                </div>
                <div
                  className={`text-lg font-mono font-bold whitespace-nowrap ${lowSample ? 'text-slate-400' : 'text-slate-700'}`}
                  title={metricsTooltip}
                >
                   {formatTime(avgLeadElapsed)}
                </div>
             </div>

             {/* WIP */}
             <div className="bg-slate-50 p-2 rounded-lg border-2 border-slate-200">
                <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                   <Hourglass size={10} /> WIP
                </div>
                <div className="text-lg font-mono font-bold text-slate-700">
                   {wip}
                </div>
                <div className="text-[10px] text-slate-400 mt-1" title="Queued · Processing · Stuck">
                  {wipBreakdown}
                </div>
             </div>

             <div className="bg-slate-50 p-2 rounded-lg border-2 border-slate-200">
                <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                   <Activity size={10} /> Thru (Working)
                </div>
                <div className={`text-lg font-mono font-bold ${lowSample ? 'text-slate-400' : 'text-slate-700'}`}>
                  {metrics.throughputWorkingPerHour.toFixed(1)}/h
                </div>
                <div className="text-[10px] text-slate-400">Elapsed {metrics.throughputElapsedPerHour.toFixed(1)}/h</div>
             </div>
          </div>

          <div className="text-xs text-center text-slate-400 pt-1 border-t-2 border-slate-200 mt-2 flex items-center justify-center gap-2">
             <Activity size={12} /> Throughput: <strong className={lowSample ? 'text-slate-400' : 'text-slate-600'}>{throughput.toFixed(1)}</strong> items/hr
             <span className="text-slate-300">|</span> n={sampleSize} <span className="text-slate-300">|</span> {windowLabel}
          </div>
          <div className="text-[10px] text-center text-slate-400">
            Run Time = observation window. Working = queue + processing. Elapsed = spawn to completion.
          </div>
       </div>
    </div>
  );
};

export default VSMStats;
