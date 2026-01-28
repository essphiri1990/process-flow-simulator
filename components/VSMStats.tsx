import React, { useMemo } from 'react';
import { useStore } from '../store';
import { TrendingUp, Clock, Hourglass, BarChart2, Activity } from 'lucide-react';
import { ItemStatus, DURATION_PRESETS, TICKS_PER_HOUR, TICKS_PER_WORKDAY, TICKS_PER_WEEK } from '../types';

interface VSMStatsProps {
    onOpenAnalytics?: () => void;
}

// Adaptive time unit selection based on duration preset and current values
const getDisplayConfig = (durationPreset: string, avgLeadTime: number): { divisor: number; abbrev: string } => {
  const preset = DURATION_PRESETS[durationPreset];

  if (durationPreset === 'unlimited' || !preset) {
    // Auto-scale based on current lead time
    if (avgLeadTime < TICKS_PER_HOUR) return { divisor: 1, abbrev: 'min' };
    if (avgLeadTime < TICKS_PER_WORKDAY) return { divisor: TICKS_PER_HOUR, abbrev: 'hr' };
    if (avgLeadTime < TICKS_PER_WEEK) return { divisor: TICKS_PER_WORKDAY, abbrev: 'd' };
    return { divisor: TICKS_PER_WEEK, abbrev: 'wk' };
  }

  // Use preset's recommended unit
  switch (preset.displayUnit) {
    case 'hours': return { divisor: TICKS_PER_HOUR, abbrev: 'hr' };
    case 'days': return { divisor: TICKS_PER_WORKDAY, abbrev: 'd' };
    case 'weeks': return { divisor: TICKS_PER_WEEK, abbrev: 'wk' };
    case 'months': return { divisor: TICKS_PER_WORKDAY * 22, abbrev: 'mo' };
    default: return { divisor: 1, abbrev: 'min' };
  }
};

const VSMStats: React.FC<VSMStatsProps> = ({ onOpenAnalytics }) => {
  const items = useStore((state) => state.items);
  const history = useStore((state) => state.history);
  const itemCounts = useStore((state) => state.itemCounts);
  const durationPreset = useStore((state) => state.durationPreset);

  // Memoize expensive calculations - only recalculate when items change
  const metrics = useMemo(() => {
    let totalLeadTime = 0;
    let totalVAT = 0;
    let totalTransit = 0;
    let completedCount = 0;

    // Single pass through items for completed metrics
    for (const item of items) {
      if (item.status === ItemStatus.COMPLETED) {
        completedCount++;
        totalLeadTime += (item.completionTick && item.spawnTick)
          ? (item.completionTick - item.spawnTick)
          : item.totalTime;
        totalVAT += item.timeActive;
        totalTransit += item.timeTransit;
      }
    }

    const avgLeadTime = completedCount > 0 ? totalLeadTime / completedCount : 0;
    const avgVAT = completedCount > 0 ? totalVAT / completedCount : 0;
    const avgTransit = completedCount > 0 ? totalTransit / completedCount : 0;
    const pce = avgLeadTime > 0 ? (avgVAT / avgLeadTime) * 100 : 0;

    return { avgLeadTime, avgVAT, avgTransit, pce, totalCompleted: completedCount };
  }, [items]);

  const { avgLeadTime, avgVAT, avgTransit, pce } = metrics;

  // Use pre-computed WIP count
  const wip = itemCounts.wip;

  // Get current rolling throughput from the latest history entry
  const currentThroughput = history.length > 0 ? history[history.length - 1].throughput : 0;

  // Get adaptive display config based on duration preset and current values
  const displayConfig = useMemo(() =>
    getDisplayConfig(durationPreset, avgLeadTime),
    [durationPreset, avgLeadTime]
  );

  // Format time with adaptive units
  const formatTime = (ticks: number) => {
    if (displayConfig.divisor === 1) return ticks.toFixed(1);
    return (ticks / displayConfig.divisor).toFixed(1);
  };

  return (
    <div className="fixed bottom-6 right-6 bg-white/90 backdrop-blur shadow-xl border border-slate-200 p-4 rounded-2xl z-40 w-64 transition-all hover:scale-105 group">
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
                <span className="font-bold text-slate-700">{pce.toFixed(1)}%</span>
             </div>
             <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                   className={`h-full transition-all duration-500 ${pce > 20 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                   style={{ width: `${Math.min(100, pce)}%` }}
                />
             </div>

             {/* Tooltip for PCE Breakdown */}
             <div className="absolute bottom-full mb-2 left-0 w-full bg-slate-800 text-white text-[10px] p-2 rounded opacity-0 group-hover/pce:opacity-100 transition-opacity pointer-events-none z-50">
                 <div className="flex justify-between"><span>Value Added:</span> <span>{formatTime(avgVAT)} {displayConfig.abbrev}</span></div>
                 <div className="flex justify-between"><span>Transit:</span> <span>{formatTime(avgTransit)} {displayConfig.abbrev}</span></div>
                 <div className="flex justify-between"><span>Waiting:</span> <span>{formatTime(avgLeadTime - avgVAT - avgTransit)} {displayConfig.abbrev}</span></div>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
             {/* Lead Time */}
             <div className="bg-slate-50 p-2 rounded-lg border border-slate-100" title={`Avg Transit: ${formatTime(avgTransit)} ${displayConfig.abbrev}`}>
                <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                   <Clock size={10} /> Lead Time
                </div>
                <div className="text-lg font-mono font-bold text-slate-700">
                   {formatTime(avgLeadTime)}<span className="text-xs font-sans font-normal text-slate-400">{displayConfig.abbrev}</span>
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
             </div>
          </div>

          <div className="text-xs text-center text-slate-400 pt-1 border-t border-slate-100 mt-2 flex items-center justify-center gap-2">
             <Activity size={12} /> Throughput: <strong className="text-slate-600">{currentThroughput.toFixed(1)}</strong> / 100{displayConfig.abbrev}
          </div>
       </div>
    </div>
  );
};

export default VSMStats;
