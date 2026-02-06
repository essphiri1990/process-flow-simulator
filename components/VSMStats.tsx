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
  const { avgLeadTime, avgVAT, pce, sampleSize } = metrics;
  const lowSample = sampleSize < 5;
  const windowLabel = formatCompletionWindowLabel(metricsWindowCompletions);
  const metricsTooltip = lowSample
    ? `Low sample size (n=${sampleSize}). Window: ${windowLabel}`
    : `n=${sampleSize}. Window: ${windowLabel}`;

  // Use pre-computed WIP count
  const wip = itemCounts.wip;
  const wipBreakdown = `Q ${itemCounts.queued} · P ${itemCounts.processing} · T ${itemCounts.transit} · S ${itemCounts.stuck}`;

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
    <div className="fixed top-4 right-4 bg-white/90 backdrop-blur shadow-xl border border-slate-200 p-4 rounded-2xl z-40 w-64 transition-all hover:scale-105 group">
       <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp size={16} className="text-blue-600" />
                VSM Metrics
            </h3>
            {onOpenAnalytics && (
                <button
                    onClick={onOpenAnalytics}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600"
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
             <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                   className={`h-full transition-all duration-500 ${pce > 20 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                   style={{ width: `${Math.min(100, pce)}%` }}
                />
             </div>

             {/* Tooltip for PCE Breakdown */}
             <div className="absolute bottom-full mb-2 left-0 w-full bg-slate-800 text-white text-[10px] p-2 rounded opacity-0 group-hover/pce:opacity-100 transition-opacity pointer-events-none z-50">
                 <div className="flex justify-between"><span>Value Added:</span> <span>{formatTime(avgVAT)}</span></div>
                 <div className="flex justify-between"><span>Waiting:</span> <span>{formatTime(avgLeadTime - avgVAT)}</span></div>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
             {/* Lead Time */}
             <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                   <Clock size={10} /> Lead Time
                </div>
                <div
                  className={`text-lg font-mono font-bold whitespace-nowrap ${lowSample ? 'text-slate-400' : 'text-slate-700'}`}
                  title={metricsTooltip}
                >
                   {formatTime(avgLeadTime)}
                </div>
             </div>

             {/* WIP */}
             <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                   <Hourglass size={10} /> WIP
                </div>
                <div className="text-lg font-mono font-bold text-slate-700">
                   {wip}
                </div>
                <div className="text-[10px] text-slate-400 mt-1" title="Queued · Processing · Transit · Stuck">
                  {wipBreakdown}
                </div>
             </div>
          </div>

          <div className="text-xs text-center text-slate-400 pt-1 border-t border-slate-100 mt-2 flex items-center justify-center gap-2">
             <Activity size={12} /> Throughput: <strong className={lowSample ? 'text-slate-400' : 'text-slate-600'}>{throughput.toFixed(1)}</strong> items/hr
             <span className="text-slate-300">|</span> n={sampleSize} <span className="text-slate-300">|</span> {windowLabel}
          </div>
       </div>
    </div>
  );
};

export default VSMStats;
