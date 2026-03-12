import React, { useMemo } from 'react';
import { Users, X } from 'lucide-react';
import { useStore } from '../store';
import { getAllSharedAllocationTotals, getPoolSharedBudgetSummary, getResourcePools } from '../capacityModel';
import { getLatestPoolUtilizationAverage } from '../metrics';
import { RESOURCE_POOL_COLOR_THEMES } from '../resourcePoolVisuals';
import ResourcePoolAvatar from './ResourcePoolAvatar';

interface SharedResourcesCardProps {
  hasConfigPanel?: boolean;
}

const PERIOD_LABELS = {
  hour: 'Hour',
  day: 'Day',
  week: 'Week',
  month: 'Month',
} as const;

const SharedResourcesCard: React.FC<SharedResourcesCardProps> = ({ hasConfigPanel = false }) => {
  const capacityMode = useStore((state) => state.capacityMode);
  const demandUnit = useStore((state) => state.demandUnit);
  const nodes = useStore((state) => state.nodes);
  const resourcePools = useStore((state) => state.resourcePools);
  const sharedCapacityInputMode = useStore((state) => state.sharedCapacityInputMode);
  const sharedCapacityValue = useStore((state) => state.sharedCapacityValue);
  const poolUtilizationHistoryByPeriod = useStore((state) => state.poolUtilizationHistoryByPeriod);
  const sharedNodeBudgetStateByNode = useStore((state) => state.sharedNodeBudgetStateByNode);
  const showSharedResourcesCard = useStore((state) => state.showSharedResourcesCard);
  const setShowSharedResourcesCard = useStore((state) => state.setShowSharedResourcesCard);

  const normalizedResourcePools = useMemo(
    () => getResourcePools({ resourcePools, sharedCapacityInputMode, sharedCapacityValue }),
    [resourcePools, sharedCapacityInputMode, sharedCapacityValue],
  );

  const rows = useMemo(() => {
    const poolTotals = getAllSharedAllocationTotals(nodes as any, {
      capacityMode,
      sharedCapacityInputMode,
      sharedCapacityValue,
      resourcePools,
    });
    const totalsById = new Map(poolTotals.map((totals) => [totals.resourcePoolId, totals]));

    return normalizedResourcePools.map((pool) => {
      const totals = totalsById.get(pool.id);
      const allocationUsesEqualSplit =
        (totals?.totalAllocatedPercent ?? 0) <= 0 && (totals?.workNodeCount ?? 0) > 0;
      const displayedAllocationPercent = allocationUsesEqualSplit ? 100 : totals?.totalAllocatedPercent ?? 0;
      const barAllocationPercent = Math.max(0, Math.min(100, displayedAllocationPercent));
      const utilization = getLatestPoolUtilizationAverage(
        poolUtilizationHistoryByPeriod,
        demandUnit,
        pool.id,
      );
      const budgetSummary = getPoolSharedBudgetSummary(
        nodes as any,
        {
          capacityMode,
          sharedCapacityInputMode,
          sharedCapacityValue,
          resourcePools,
        },
        sharedNodeBudgetStateByNode,
        pool.id,
      );

      return {
        pool,
        totals,
        utilization,
        budgetSummary,
        allocationUsesEqualSplit,
        displayedAllocationPercent,
        barAllocationPercent,
      };
    });
  }, [
    capacityMode,
    demandUnit,
    nodes,
    normalizedResourcePools,
    poolUtilizationHistoryByPeriod,
    resourcePools,
    sharedNodeBudgetStateByNode,
    sharedCapacityInputMode,
    sharedCapacityValue,
  ]);

  if (capacityMode !== 'sharedAllocation') return null;

  const positionClass = hasConfigPanel ? 'right-[21rem]' : 'right-3';
  const periodLabel = PERIOD_LABELS[demandUnit] || 'Period';

  if (!showSharedResourcesCard) {
    return (
      <button
        type="button"
        onClick={() => setShowSharedResourcesCard(true)}
        className={`fixed ${positionClass} bottom-[104px] z-20 inline-flex items-center gap-2 rounded-2xl border-2 border-slate-900 bg-[#fff3c7] px-3.5 py-2 text-sm font-semibold text-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.92)] transition hover:-translate-y-0.5 hover:bg-[#ffe38b]`}
        title="Show shared resources"
      >
        <Users size={16} />
        Shared Resources
      </button>
    );
  }

  return (
    <div
      className={`fixed ${positionClass} bottom-[104px] z-20 w-[240px] max-w-[calc(100vw-1.5rem)] rounded-2xl border-2 border-slate-900 bg-[#fff3c7] shadow-[5px_5px_0px_0px_rgba(15,23,42,0.95)]`}
    >
      {/* Header */}
      <div className="rounded-t-[14px] border-b-2 border-slate-900 bg-[#ff8fab] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-900">
            Resources · {periodLabel}
          </div>
          <button
            type="button"
            onClick={() => setShowSharedResourcesCard(false)}
            className="rounded-full border-2 border-slate-900 bg-white p-1 text-slate-900 transition hover:bg-slate-100"
            title="Hide shared resources"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Pool rows */}
      <div className="max-h-[52vh] space-y-2 overflow-y-auto px-2.5 py-2.5">
        {rows.map(({ pool, totals, utilization, budgetSummary, allocationUsesEqualSplit, displayedAllocationPercent, barAllocationPercent }) => {
          const theme = RESOURCE_POOL_COLOR_THEMES[pool.colorId!];
          const isOverAllocated = (totals?.totalAllocatedPercent ?? 0) > 100;
          return (
            <div
              key={pool.id}
              className="rounded-xl border-2 border-slate-900 p-2 shadow-[2px_2px_0px_0px_rgba(15,23,42,0.9)]"
              style={{ backgroundColor: theme.panel }}
            >
              {/* Top row: avatar + name + util */}
              <div className="flex items-center gap-2">
                <ResourcePoolAvatar avatarId={pool.avatarId!} colorId={pool.colorId} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-black leading-tight text-slate-900">{pool.name}</div>
                  <div className="text-[9px] font-semibold text-slate-600">
                    {allocationUsesEqualSplit
                      ? 'Auto split'
                      : `${totals?.workNodeCount ?? 0} step${(totals?.workNodeCount ?? 0) === 1 ? '' : 's'}`}
                    {' · '}
                    {(totals?.totalSharedHoursPerDay ?? 0).toFixed(1)}h/day pool
                  </div>
                </div>
                <div
                  className="shrink-0 rounded-lg border-2 border-slate-900 px-1.5 py-0.5 text-center"
                  style={{ backgroundColor: pool.capacityValue > 0 ? theme.circle : '#ffffff' }}
                  title={`Avg utilization this ${periodLabel.toLowerCase()}`}
                >
                  <div className="text-[13px] font-black leading-tight text-slate-900 font-mono">{utilization.toFixed(0)}%</div>
                  <div className="text-[7px] font-bold uppercase tracking-[0.1em] text-slate-700">Util</div>
                </div>
              </div>

              {/* Allocation bar */}
              <div className="mt-1.5">
                <div className="flex items-center justify-between text-[9px] font-bold text-slate-700">
                  <span>{displayedAllocationPercent.toFixed(0)}% alloc</span>
                  <span>{(totals?.allocatedHoursPerDay ?? 0).toFixed(1)}h</span>
                </div>
                <div className="mt-0.5 rounded-full border-2 border-slate-900 bg-slate-200 p-px">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: `${barAllocationPercent}%`,
                      backgroundColor: isOverAllocated ? '#e11d48' : theme.accent,
                    }}
                  />
                </div>
              </div>

              <div className="mt-1 text-[8px] font-bold uppercase tracking-[0.08em] text-slate-600">
                {`${(budgetSummary.remainingBudgetMinutes / 60).toFixed(1)}h left today`}
              </div>

              {isOverAllocated ? (
                <div className="mt-1 text-[8px] font-bold text-rose-600">
                  Over by {((totals?.totalAllocatedPercent ?? 0) - 100).toFixed(0)}%
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SharedResourcesCard;
