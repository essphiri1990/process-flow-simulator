import React, { useMemo } from 'react';
import { Users, X } from 'lucide-react';
import { useStore } from '../store';
import {
  getAllSharedAllocationTotals,
  getNodeCapacityProfile,
  getNodeSharedBudgetSummary,
  getPoolSharedBudgetSummary,
  getResourcePools,
  WORKDAY_HOURS,
} from '../capacityModel';
import { getLatestPoolUtilizationAverage, getRollingNodeUtilization } from '../metrics';
import { ItemStatus, ProcessNodeData } from '../types';
import { RESOURCE_POOL_COLOR_THEMES } from '../resourcePoolVisuals';
import ResourcePoolAvatar from './ResourcePoolAvatar';

interface SharedResourcesCardProps {
  hasConfigPanel?: boolean;
  selectedNodeId: string | null;
}

const formatHours = (minutes: number) => `${(Math.max(0, minutes) / 60).toFixed(1)}h`;
const formatFte = (hoursPerDay: number) => `${(Math.max(0, hoursPerDay) / WORKDAY_HOURS).toFixed(1)} FTE`;

const getNodeTypeLabel = (nodeType: string) => (nodeType === 'startNode' ? 'Start node' : 'Process node');

const SharedResourcesCard: React.FC<SharedResourcesCardProps> = ({
  hasConfigPanel = false,
  selectedNodeId,
}) => {
  const capacityMode = useStore((state) => state.capacityMode);
  const nodes = useStore((state) => state.nodes);
  const itemsByNode = useStore((state) => state.itemsByNode);
  const nodeUtilizationHistoryByNode = useStore((state) => state.nodeUtilizationHistoryByNode);
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
  const sharedCapacitySettings = useMemo(
    () => ({
      capacityMode,
      sharedCapacityInputMode,
      sharedCapacityValue,
      resourcePools,
    }),
    [capacityMode, resourcePools, sharedCapacityInputMode, sharedCapacityValue],
  );
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
  const focusProfile = useMemo(
    () =>
      selectedWorkNode
        ? getNodeCapacityProfile(selectedWorkNode, nodes as any, sharedCapacitySettings)
        : null,
    [nodes, selectedWorkNode, sharedCapacitySettings],
  );
  const focusBudgetSummary = useMemo(
    () =>
      selectedWorkNode
        ? getNodeSharedBudgetSummary(selectedWorkNode.id, focusProfile, sharedNodeBudgetStateByNode)
        : null,
    [focusProfile, selectedWorkNode, sharedNodeBudgetStateByNode],
  );
  const focusPool = useMemo(() => {
    if (!focusProfile?.resourcePoolId) return null;
    return (
      normalizedResourcePools.find((pool) => pool.id === focusProfile.resourcePoolId) ||
      normalizedResourcePools[0] ||
      null
    );
  }, [focusProfile?.resourcePoolId, normalizedResourcePools]);
  const focusTheme = focusPool ? RESOURCE_POOL_COLOR_THEMES[focusPool.colorId!] : null;
  const focusItems = useMemo(
    () => (selectedWorkNode ? itemsByNode.get(selectedWorkNode.id) || [] : []),
    [itemsByNode, selectedWorkNode],
  );
  const focusQueued = useMemo(
    () => focusItems.filter((item) => item.status === ItemStatus.QUEUED).length,
    [focusItems],
  );
  const focusProcessing = useMemo(
    () => focusItems.filter((item) => item.status === ItemStatus.PROCESSING).length,
    [focusItems],
  );
  const focusUtilization = useMemo(
    () => (selectedWorkNode ? getRollingNodeUtilization(nodeUtilizationHistoryByNode, selectedWorkNode.id) : 0),
    [nodeUtilizationHistoryByNode, selectedWorkNode],
  );
  const isFocusMode = Boolean(selectedWorkNode && selectedWorkNodeData);
  const isSharedFocus = Boolean(isFocusMode && focusProfile?.usesSharedAllocation && focusPool && focusBudgetSummary);

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
      const utilization = getLatestPoolUtilizationAverage(poolUtilizationHistoryByPeriod, 'day', pool.id);
      const poolFte = (totals?.totalSharedHoursPerDay ?? 0) / WORKDAY_HOURS;
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
        poolFte,
        budgetSummary,
        allocationUsesEqualSplit,
        displayedAllocationPercent,
        barAllocationPercent,
      };
    });
  }, [
    capacityMode,
    nodes,
    normalizedResourcePools,
    poolUtilizationHistoryByPeriod,
    resourcePools,
    sharedNodeBudgetStateByNode,
    sharedCapacityInputMode,
    sharedCapacityValue,
  ]);

  if (capacityMode !== 'sharedAllocation' && !isFocusMode) return null;

  const positionClass = hasConfigPanel ? 'right-[21rem]' : 'right-3';
  const totalResourcesFte = rows.reduce((sum, row) => sum + row.poolFte, 0);
  const hiddenButtonLabel = isFocusMode ? 'Node Resources' : 'Shared Resources';

  if (!showSharedResourcesCard) {
    return (
      <button
        type="button"
        onClick={() => setShowSharedResourcesCard(true)}
        className={`fixed ${positionClass} bottom-[104px] z-20 inline-flex items-center gap-2 rounded-2xl border-2 border-slate-900 bg-[#fff3c7] px-3.5 py-2 text-sm font-semibold text-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.92)] transition hover:-translate-y-0.5 hover:bg-[#ffe38b]`}
        title={isFocusMode ? 'Show node resources' : 'Show shared resources'}
      >
        <Users size={16} />
        {hiddenButtonLabel}
      </button>
    );
  }

  return (
    <div
      className={`fixed ${positionClass} bottom-[104px] z-20 ${isFocusMode ? 'w-[268px]' : 'w-[240px]'} max-w-[calc(100vw-1.5rem)] rounded-2xl border-2 border-slate-900 bg-[#fff3c7] shadow-[5px_5px_0px_0px_rgba(15,23,42,0.95)]`}
    >
      {isFocusMode && selectedWorkNode && selectedWorkNodeData ? (
        <>
          <div className="rounded-t-[14px] border-b-2 border-slate-900 bg-[#8ecae6] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-900">
                  Node Resources
                </div>
                <div className="mt-1 truncate text-[13px] font-black text-slate-900">
                  {selectedWorkNodeData.label}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="shrink-0 whitespace-nowrap rounded-full border-2 border-slate-900 bg-white px-2 py-0.5 text-[9px] font-black text-slate-900">
                  {capacityMode === 'sharedAllocation' ? 'Shared' : 'Local'}
                </div>
                <button
                  type="button"
                  onClick={() => setShowSharedResourcesCard(false)}
                  className="rounded-full border-2 border-slate-900 bg-white p-1 text-slate-900 transition hover:bg-slate-100"
                  title="Hide resources card"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          </div>

          <div className="px-2.5 py-2.5">
            <div
              className="rounded-xl border-2 border-slate-900 p-2 shadow-[2px_2px_0px_0px_rgba(15,23,42,0.9)]"
              style={{ backgroundColor: isSharedFocus && focusTheme ? focusTheme.panel : '#dbeafe' }}
            >
              <div className="flex items-center gap-2">
                {isSharedFocus && focusPool ? (
                  <ResourcePoolAvatar avatarId={focusPool.avatarId!} colorId={focusPool.colorId} size={30} />
                ) : (
                  <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-slate-900 bg-white text-slate-900">
                    <Users size={14} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-700">
                    {getNodeTypeLabel(selectedWorkNode.type)}
                  </div>
                  <div className="truncate text-[11px] font-black leading-tight text-slate-900">
                    {isSharedFocus && focusPool ? focusPool.name : selectedWorkNodeData.label}
                  </div>
                </div>
                <div
                  className="shrink-0 w-[56px] min-w-[56px] rounded-lg border-2 border-slate-900 bg-white px-1.5 py-0.5 text-center"
                  title="Rolling node utilisation"
                >
                  <div className="font-mono text-[13px] font-black leading-tight text-slate-900 tabular-nums">
                    {focusUtilization.toFixed(0)}%
                  </div>
                  <div className="text-[7px] font-bold uppercase tracking-[0.1em] text-slate-700">Util</div>
                </div>
              </div>

              {isSharedFocus && focusProfile && focusBudgetSummary ? (
                <>
                  <div className="mt-2 rounded-lg border-2 border-slate-900 bg-white/80 px-2 py-1.5">
                    <div className="text-[8px] font-bold uppercase tracking-[0.08em] text-slate-600">
                      Remaining today
                    </div>
                    <div className="mt-0.5 text-[18px] font-black leading-none text-slate-900">
                      {formatHours(focusBudgetSummary.remainingBudgetMinutes)}
                    </div>
                  </div>

                  <div className="mt-2 space-y-1 text-[10px] font-bold text-slate-700">
                    <div className="flex items-center justify-between">
                      <span>Allocation</span>
                      <span>{focusProfile.allocationPercent.toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>FTE alloc</span>
                      <span>{formatFte(focusProfile.allocatedHoursPerDay)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Allocated / day</span>
                      <span>{focusProfile.allocatedHoursPerDay.toFixed(1)}h</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Budget used</span>
                      <span>{formatHours(focusBudgetSummary.consumedBudgetMinutes)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-2 rounded-lg border-2 border-slate-900 bg-white/80 px-2 py-1.5 text-[10px] font-bold text-slate-700">
                    Local mode - no daily budget tracking
                  </div>

                  <div className="mt-2 space-y-1 text-[10px] font-bold text-slate-700">
                    <div className="flex items-center justify-between">
                      <span>Resources</span>
                      <span>{selectedWorkNodeData.resources}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Capacity limit</span>
                      <span>{focusProfile?.maxConcurrentItems ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Queued</span>
                      <span>{focusQueued}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Processing</span>
                      <span>{focusProcessing}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-t-[14px] border-b-2 border-slate-900 bg-[#ff8fab] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="whitespace-nowrap text-[10px] font-black uppercase tracking-[0.16em] text-slate-900">
                  Resources · Day
                </div>
                <div className="shrink-0 whitespace-nowrap rounded-full border-2 border-slate-900 bg-white px-2 py-0.5 text-[9px] font-black text-slate-900">
                  {totalResourcesFte.toFixed(1)} FTE
                </div>
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

          <div className="max-h-[52vh] space-y-2 overflow-x-hidden overflow-y-auto pl-2.5 py-2.5 pr-3 [scrollbar-gutter:stable]">
            {rows.map(
              ({
                pool,
                totals,
                utilization,
                poolFte,
                budgetSummary,
                allocationUsesEqualSplit,
                displayedAllocationPercent,
                barAllocationPercent,
              }) => {
                const theme = RESOURCE_POOL_COLOR_THEMES[pool.colorId!];
                const isOverAllocated = (totals?.totalAllocatedPercent ?? 0) > 100;
                return (
                  <div
                    key={pool.id}
                    className="rounded-xl border-2 border-slate-900 p-2 shadow-[2px_2px_0px_0px_rgba(15,23,42,0.9)]"
                    style={{ backgroundColor: theme.panel }}
                  >
                    <div className="flex items-center gap-2">
                      <ResourcePoolAvatar avatarId={pool.avatarId!} colorId={pool.colorId} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-black leading-tight text-slate-900">{pool.name}</div>
                        <div className="text-[9px] font-semibold text-slate-600">
                          {allocationUsesEqualSplit
                            ? 'Auto split'
                            : `${totals?.workNodeCount ?? 0} step${(totals?.workNodeCount ?? 0) === 1 ? '' : 's'}`}
                          {' · '}
                          {poolFte.toFixed(1)} FTE
                        </div>
                      </div>
                      <div
                        className="shrink-0 w-[56px] min-w-[56px] rounded-lg border-2 border-slate-900 px-1.5 py-0.5 text-center"
                        style={{ backgroundColor: pool.capacityValue > 0 ? theme.circle : '#ffffff' }}
                        title="Avg utilization this day"
                      >
                        <div className="text-[13px] font-black leading-tight text-slate-900 font-mono tabular-nums">
                          {utilization.toFixed(0)}%
                        </div>
                        <div className="text-[7px] font-bold uppercase tracking-[0.1em] text-slate-700">Util</div>
                      </div>
                    </div>

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
                      {`${formatHours(budgetSummary.remainingBudgetMinutes)} left today`}
                    </div>

                    {isOverAllocated ? (
                      <div className="mt-1 text-[8px] font-bold text-rose-600">
                        Over by {((totals?.totalAllocatedPercent ?? 0) - 100).toFixed(0)}%
                      </div>
                    ) : null}
                  </div>
                );
              },
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SharedResourcesCard;
