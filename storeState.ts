import {
  AssetPool,
  AppNode,
  CapacityMode,
  DEFAULT_WORKING_HOURS,
  HistoryEntry,
  ItemCounts,
  ItemStatus,
  KpiHistoryByPeriod,
  NodeStageCompletionSample,
  NodeStageMetricsHistoryByNode,
  NodeUtilizationHistoryByNode,
  PoolUtilizationHistoryByPeriod,
  ProcessItem,
  ProcessNodeData,
  ResourcePool,
  SharedNodeBudgetStateByNode,
  SharedCapacityInputMode,
  WorkingHoursConfig,
} from './types';
import {
  clampAllocationPercent,
  getAssetPools,
  getNodeAssetPoolId,
  createDefaultResourcePool,
  DEFAULT_RESOURCE_POOL_ID,
  DEFAULT_SHARED_CAPACITY_INPUT_MODE,
  DEFAULT_SHARED_CAPACITY_VALUE,
  getNodeResourcePoolId,
  getResourcePools,
} from './capacityModel';

export const DEFAULT_NODE_BATCH_SIZE = 0;
export const DEFAULT_NODE_FLOW_MODE = 'push' as const;
export const DEFAULT_PULL_OPEN_SLOTS_REQUIRED = 1;

export const createDefaultWorkingHours = (): WorkingHoursConfig => ({ ...DEFAULT_WORKING_HOURS });

export const createEmptyItemCounts = (): ItemCounts => ({
  wip: 0,
  completed: 0,
  failed: 0,
  queued: 0,
  processing: 0,
  stuck: 0,
});

export const createEmptyKpiHistory = (): KpiHistoryByPeriod => ({
  hour: [],
  day: [],
  week: [],
  month: [],
});

export const createEmptyNodeUtilizationHistory = (): NodeUtilizationHistoryByNode => ({});

export const createEmptyNodeStageMetricsHistory = (): NodeStageMetricsHistoryByNode => ({});

export const createEmptyPoolUtilizationHistory = (): PoolUtilizationHistoryByPeriod => ({
  hour: {},
  day: {},
  week: {},
  month: {},
});

export const createEmptySharedNodeBudgetStateByNode = (): SharedNodeBudgetStateByNode => ({});

const MAX_NODE_STAGE_SAMPLES_PER_NODE = 100;
const MAX_NODE_STAGE_SAMPLES_TOTAL = 2000;

const sortByCompletionTickAscending = (left: NodeStageCompletionSample, right: NodeStageCompletionSample) =>
  left.completionTick - right.completionTick;

export const appendNodeStageCompletionSample = (
  history: NodeStageMetricsHistoryByNode,
  sample: NodeStageCompletionSample,
): NodeStageMetricsHistoryByNode => {
  const nextSamples = [...(history[sample.nodeId] || []), sample].sort(sortByCompletionTickAscending);
  const nextHistory: NodeStageMetricsHistoryByNode = {
    ...history,
    [sample.nodeId]:
      nextSamples.length > MAX_NODE_STAGE_SAMPLES_PER_NODE
        ? nextSamples.slice(nextSamples.length - MAX_NODE_STAGE_SAMPLES_PER_NODE)
        : nextSamples,
  };

  const totalSamples = Object.values(nextHistory).reduce((sum, samples) => sum + samples.length, 0);
  if (totalSamples <= MAX_NODE_STAGE_SAMPLES_TOTAL) {
    return nextHistory;
  }

  const trimmedHistory: NodeStageMetricsHistoryByNode = Object.fromEntries(
    Object.entries(nextHistory).map(([nodeId, samples]) => [nodeId, [...samples]]),
  );
  let overflow = totalSamples - MAX_NODE_STAGE_SAMPLES_TOTAL;
  while (overflow > 0) {
    let oldestNodeId: string | null = null;
    let oldestTick = Infinity;

    for (const [nodeId, samples] of Object.entries(trimmedHistory)) {
      const oldestSample = samples[0];
      if (!oldestSample) continue;
      if (oldestSample.completionTick < oldestTick) {
        oldestTick = oldestSample.completionTick;
        oldestNodeId = nodeId;
      }
    }

    if (!oldestNodeId) break;
    trimmedHistory[oldestNodeId].shift();
    overflow--;
  }

  return Object.fromEntries(
    Object.entries(trimmedHistory)
      .filter(([, samples]) => samples.length > 0)
      .map(([nodeId, samples]) => [nodeId, samples]),
  );
};

export const getNormalizedResourcePools = (
  resourcePools?: ResourcePool[],
  sharedCapacityInputMode: SharedCapacityInputMode = DEFAULT_SHARED_CAPACITY_INPUT_MODE,
  sharedCapacityValue: number = DEFAULT_SHARED_CAPACITY_VALUE,
) =>
  getResourcePools({
    resourcePools,
    sharedCapacityInputMode,
    sharedCapacityValue,
  });

export const getNormalizedAssetPools = (assetPools?: AssetPool[]) => getAssetPools(assetPools);

export const getLegacySharedCapacityFields = (resourcePools: ResourcePool[]) => {
  const defaultPool =
    resourcePools.find((pool) => pool.id === DEFAULT_RESOURCE_POOL_ID) || createDefaultResourcePool();
  return {
    sharedCapacityInputMode: defaultPool.inputMode === 'hours' ? 'hours' : 'fte',
    sharedCapacityValue: Number.isFinite(defaultPool.capacityValue)
      ? Math.max(0, Number(defaultPool.capacityValue))
      : DEFAULT_SHARED_CAPACITY_VALUE,
  };
};

export interface CapacityStateDefaults {
  capacityMode: CapacityMode;
  sharedCapacityInputMode: SharedCapacityInputMode;
  sharedCapacityValue: number;
  resourcePools: ResourcePool[];
  assetPools: AssetPool[];
}

export const createDefaultCapacityState = (): CapacityStateDefaults => {
  const resourcePools = getNormalizedResourcePools(
    undefined,
    DEFAULT_SHARED_CAPACITY_INPUT_MODE,
    DEFAULT_SHARED_CAPACITY_VALUE,
  );
  const legacySharedCapacityFields = getLegacySharedCapacityFields(resourcePools);

  return {
    capacityMode: 'local',
    sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
    sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
    resourcePools,
    assetPools: [],
  };
};

export const getScenarioCapacityState = (scenario: {
  capacityMode?: CapacityMode;
  sharedCapacityInputMode?: SharedCapacityInputMode;
  sharedCapacityValue?: number;
  resourcePools?: ResourcePool[];
  assetPools?: AssetPool[];
}): CapacityStateDefaults => {
  const capacityMode = scenario.capacityMode ?? 'local';
  const sharedCapacityInputMode =
    scenario.sharedCapacityInputMode ?? DEFAULT_SHARED_CAPACITY_INPUT_MODE;
  const sharedCapacityValue = Number.isFinite(scenario.sharedCapacityValue)
    ? Math.max(0, Number(scenario.sharedCapacityValue))
    : DEFAULT_SHARED_CAPACITY_VALUE;
  const resourcePools = getNormalizedResourcePools(
    scenario.resourcePools,
    sharedCapacityInputMode,
    sharedCapacityValue,
  );
  const legacySharedCapacityFields = getLegacySharedCapacityFields(resourcePools);

  return {
    capacityMode,
    sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
    sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
    resourcePools,
    assetPools: getNormalizedAssetPools(scenario.assetPools),
  };
};

export const normalizeNodesForResourcePools = (
  nodes: AppNode[],
  resourcePools: ResourcePool[],
): AppNode[] => {
  const settings = {
    resourcePools,
    sharedCapacityInputMode: getLegacySharedCapacityFields(resourcePools).sharedCapacityInputMode,
    sharedCapacityValue: getLegacySharedCapacityFields(resourcePools).sharedCapacityValue,
  };

  return nodes.map((node) => {
    if (node.type !== 'processNode' && node.type !== 'startNode') return node;
    const pData = node.data as ProcessNodeData;
    const resolvedPoolId = getNodeResourcePoolId(pData, settings);
    if (pData.resourcePoolId === resolvedPoolId) return node;
    return {
      ...node,
      data: {
        ...pData,
        resourcePoolId: resolvedPoolId,
      },
    } as AppNode;
  });
};

export const normalizeNodesForAssetPools = (
  nodes: AppNode[],
  assetPools: AssetPool[],
): AppNode[] =>
  nodes.map((node) => {
    if (node.type !== 'processNode' && node.type !== 'startNode') return node;
    const pData = node.data as ProcessNodeData;
    const resolvedPoolId = getNodeAssetPoolId(pData, assetPools);
    if (pData.assetPoolId === resolvedPoolId) return node;
    return {
      ...node,
      data: {
        ...pData,
        assetPoolId: resolvedPoolId,
      },
    } as AppNode;
  });

export const normalizeNodesForCapacityPools = (
  nodes: AppNode[],
  resourcePools: ResourcePool[],
  assetPools: AssetPool[],
): AppNode[] => normalizeNodesForAssetPools(normalizeNodesForResourcePools(nodes, resourcePools), assetPools);

const getNodeBatchSize = (data: Partial<ProcessNodeData> | undefined) => {
  const raw = Number(data?.batchSize);
  if (!Number.isFinite(raw)) return DEFAULT_NODE_BATCH_SIZE;
  const rounded = Math.max(0, Math.round(raw));
  return rounded > 1 ? rounded : 0;
};

const getNodeFlowMode = (data: Partial<ProcessNodeData> | undefined) =>
  data?.flowMode === 'pull' ? 'pull' : DEFAULT_NODE_FLOW_MODE;

const getNodePullOpenSlotsRequired = (data: Partial<ProcessNodeData> | undefined) => {
  const raw = Number(data?.pullOpenSlotsRequired);
  return Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : DEFAULT_PULL_OPEN_SLOTS_REQUIRED;
};

export const normalizeProcessNodeSettings = (
  nextData: Partial<ProcessNodeData>,
  fallback?: Partial<ProcessNodeData>,
): Partial<ProcessNodeData> => {
  const merged = { ...fallback, ...nextData };
  const resources = Number(merged.resources);
  const normalizedResources =
    Number.isFinite(resources) && resources > 0 ? Math.round(resources) : fallback?.resources;
  const maxSlots =
    Number.isFinite(normalizedResources) && normalizedResources && normalizedResources > 0
      ? Math.round(normalizedResources)
      : undefined;

  const batchSize = getNodeBatchSize(merged);
  const pullOpenSlotsRequired = getNodePullOpenSlotsRequired(merged);

  const normalized: Partial<ProcessNodeData> = {
    ...nextData,
    batchSize: maxSlots ? (batchSize > 1 ? Math.min(batchSize, maxSlots) : 0) : batchSize,
    flowMode: getNodeFlowMode(merged),
    pullOpenSlotsRequired: maxSlots
      ? Math.min(pullOpenSlotsRequired, maxSlots)
      : pullOpenSlotsRequired,
  };

  if (Object.prototype.hasOwnProperty.call(nextData, 'allocationPercent')) {
    normalized.allocationPercent = clampAllocationPercent(Number(merged.allocationPercent));
  }
  if (Object.prototype.hasOwnProperty.call(nextData, 'resourcePoolId')) {
    const resourcePoolId =
      typeof merged.resourcePoolId === 'string' && merged.resourcePoolId.trim()
        ? merged.resourcePoolId.trim()
        : undefined;
    normalized.resourcePoolId = resourcePoolId;
  }
  if (Object.prototype.hasOwnProperty.call(nextData, 'assetPoolId')) {
    const assetPoolId =
      typeof merged.assetPoolId === 'string' && merged.assetPoolId.trim()
        ? merged.assetPoolId.trim()
        : undefined;
    normalized.assetPoolId = assetPoolId;
  }

  return normalized;
};

export const createQueuedItem = (
  targetNodeId: string,
  tick: number,
  metricsEpoch: number,
  createId: () => string,
): ProcessItem => ({
  id: createId(),
  currentNodeId: targetNodeId,
  status: ItemStatus.QUEUED,
  handoffTargetNodeId: null,
  progress: 0,
  remainingTime: 0,
  processingDuration: 0,
  totalTime: 0,
  nodeEnterTick: tick,
  metricsEpoch,
  timeActive: 0,
  timeWaiting: 0,
  nodeLeadTime: 0,
  spawnTick: tick,
  completionTick: null,
  terminalNodeId: null,
});

export const createPastedNode = (
  sourceNode: AppNode,
  cloneValue: <T>(value: T) => T,
  createId: () => string,
  position?: { x: number; y: number },
): AppNode => {
  const nextPosition = {
    x: Number.isFinite(position?.x) ? Number(position?.x) : sourceNode.position.x,
    y: Number.isFinite(position?.y) ? Number(position?.y) : sourceNode.position.y,
  };

  if (sourceNode.type === 'annotationNode') {
    return {
      id: createId(),
      type: 'annotationNode',
      position: nextPosition,
      data: cloneValue(sourceNode.data),
    };
  }

  const sourceData = cloneValue(sourceNode.data as ProcessNodeData);
  return {
    id: createId(),
    type: sourceNode.type,
    position: nextPosition,
    data: {
      ...sourceData,
      isSelected: undefined,
      stats: { processed: 0, failed: 0, maxQueue: 0 },
      validationError: undefined,
    },
  } as AppNode;
};

export const buildRunStateReset = () => ({
  items: [] as ProcessItem[],
  isRunning: false,
  tickCount: 0,
  displayTickCount: 0,
  cumulativeCompleted: 0,
  throughput: 0,
  simulationProgress: 0,
  history: [] as HistoryEntry[],
  metricsEpoch: 0,
  metricsEpochTick: 0,
  demandArrivalsGenerated: 0,
  demandArrivalsByNode: {} as Record<string, number>,
  demandAccumulatorByNode: {} as Record<string, number>,
  demandOpenTicksByNode: {} as Record<string, number>,
  periodCompleted: 0,
  kpiHistoryByPeriod: createEmptyKpiHistory(),
  nodeUtilizationHistoryByNode: createEmptyNodeUtilizationHistory(),
  nodeStageMetricsHistoryByNode: createEmptyNodeStageMetricsHistory(),
  poolUtilizationHistoryByPeriod: createEmptyPoolUtilizationHistory(),
  sharedNodeBudgetStateByNode: createEmptySharedNodeBudgetStateByNode(),
  itemsByNode: new Map<string, ProcessItem[]>(),
  blockedCountsByTarget: new Map<string, number>(),
  itemCounts: createEmptyItemCounts(),
  visualTransfers: [],
  runStartedAtMs: null,
  lastRunSummary: null,
  lastLoggedRunKey: null,
});

export const computeDerivedState = (items: ProcessItem[]) => {
  const itemsByNode = new Map<string, ProcessItem[]>();
  const blockedCountsByTarget = new Map<string, number>();
  let wip = 0;
  let completed = 0;
  let failed = 0;
  let queued = 0;
  let processing = 0;
  let stuck = 0;

  for (const item of items) {
    if (item.status === ItemStatus.COMPLETED) {
      completed++;
    } else if (item.status === ItemStatus.FAILED) {
      failed++;
    } else {
      wip++;
      if (!item.currentNodeId) {
        stuck++;
        continue;
      }
      if (item.status === ItemStatus.QUEUED) {
        queued++;
        if (item.handoffTargetNodeId) {
          blockedCountsByTarget.set(
            item.handoffTargetNodeId,
            (blockedCountsByTarget.get(item.handoffTargetNodeId) || 0) + 1,
          );
        }
      } else if (item.status === ItemStatus.PROCESSING) {
        processing++;
      } else {
        stuck++;
      }

      const nodeItems = itemsByNode.get(item.currentNodeId);
      if (nodeItems) {
        nodeItems.push(item);
      } else {
        itemsByNode.set(item.currentNodeId, [item]);
      }
    }
  }

  return {
    itemsByNode,
    blockedCountsByTarget,
    itemCounts: {
      wip,
      completed,
      failed,
      queued,
      processing,
      stuck,
    },
  };
};
