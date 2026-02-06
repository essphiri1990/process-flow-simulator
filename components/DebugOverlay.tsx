import React, { useMemo } from 'react';
import { useStore } from '../store';
import { computeLeadMetrics, formatCompletionWindowLabel } from '../metrics';

// Dev-only overlay, enabled when localStorage key 'pf-debug-overlay' === '1'
const DebugOverlay: React.FC = () => {
  const enabled =
    typeof window !== 'undefined' &&
    import.meta.env.DEV &&
    window.localStorage?.getItem('pf-debug-overlay') === '1';

  const {
    tickCount,
    displayTickCount,
    ticksPerSecond,
    speedPreset,
    durationPreset,
    simulationProgress,
    throughput,
    itemCounts,
    history,
    metricsEpoch,
    metricsWindowCompletions
  } = useStore();

  const { avgLeadTime, avgVAT, pce, sampleSize } = useMemo(
    () => computeLeadMetrics(useStore.getState().items, {
      windowSize: metricsWindowCompletions,
      metricsEpoch
    }),
    [history, metricsWindowCompletions, metricsEpoch]
  ); // re-run when history changes (proxy for progress)

  const recent = useMemo(() => {
    const items = useStore.getState().items
      .filter(it => it.status === 'COMPLETED' && it.completionTick !== null)
      .sort((a, b) => (b.completionTick || 0) - (a.completionTick || 0))
      .slice(0, 3)
      .map(it => {
        const cycle = (it.completionTick as number) - it.spawnTick;
        const lead = Math.max(0, cycle - it.timeTransit);
        return { id: it.id.slice(0, 4), lead, vat: it.timeActive, wait: it.timeWaiting };
      });
    return items;
  }, [history]);

  if (!enabled) return null;

  return (
    <div className="fixed top-4 left-4 z-50 w-[240px] rounded-xl border border-slate-200 bg-white/95 shadow-lg p-3 font-mono text-xs text-slate-700 pointer-events-none">
      <div className="font-semibold text-slate-900 mb-2">Debug Overlay</div>
      <div className="flex justify-between"><span>tick</span><span>{tickCount}</span></div>
      <div className="flex justify-between"><span>display</span><span>{displayTickCount}</span></div>
      <div className="flex justify-between"><span>tps</span><span>{ticksPerSecond}</span></div>
      <div className="flex justify-between"><span>speed</span><span>{speedPreset}</span></div>
      <div className="flex justify-between"><span>duration</span><span>{durationPreset}</span></div>
      <div className="flex justify-between"><span>progress</span><span>{simulationProgress.toFixed(1)}%</span></div>
      <div className="flex justify-between"><span>throughput</span><span>{throughput.toFixed(2)}/hr</span></div>
      <div className="flex justify-between"><span>wip/c/f</span><span>{itemCounts.wip}/{itemCounts.completed}/{itemCounts.failed}</span></div>
      <div className="mt-2 flex justify-between"><span>avg lead</span><span>{avgLeadTime.toFixed(2)}m</span></div>
      <div className="flex justify-between"><span>avg VAT</span><span>{avgVAT.toFixed(2)}m</span></div>
      <div className="flex justify-between"><span>PCE</span><span>{pce.toFixed(1)}%</span></div>
      <div className="flex justify-between"><span>n</span><span>{sampleSize}</span></div>
      <div className="flex justify-between"><span>window</span><span>{formatCompletionWindowLabel(metricsWindowCompletions)}</span></div>
      {recent.length > 0 && (
        <div className="mt-2 border-t border-slate-200 pt-1 space-y-1">
          {recent.map(r => (
            <div key={r.id} className="flex justify-between text-[10px] text-slate-500">
              <span>{r.id}</span>
              <span>lead {r.lead.toFixed(1)} | vat {r.vat.toFixed(1)} | wait {r.wait.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 text-[10px] text-slate-500">enable: localStorage["pf-debug-overlay"]="1"</div>
    </div>
  );
};

export default DebugOverlay;
