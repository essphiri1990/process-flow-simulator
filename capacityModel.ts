import {
  AppNode,
  CapacityMode,
  ItemStatus,
  ProcessItem,
  ProcessNodeData,
  ResourcePool,
  SharedNodeBudgetStateByNode,
  SharedCapacityInputMode,
  TICKS_PER_WORKDAY,
} from './types';
import { computeOpenTicksForPeriod } from './timeModel';
import { normalizeResourcePoolAvatarId, normalizeResourcePoolColorId } from './resourcePoolVisuals';

export const WORKDAY_HOURS = 8;
export const DEFAULT_SHARED_CAPACITY_INPUT_MODE: SharedCapacityInputMode = 'fte';
export const DEFAULT_SHARED_CAPACITY_VALUE = 3;
export const DEFAULT_RESOURCE_POOL_ID = 'default-shared-pool';
export const DEFAULT_RESOURCE_POOL_NAME = 'Shared Team';

export interface SharedCapacitySettings {
  capacityMode: CapacityMode;
  sharedCapacityInputMode: SharedCapacityInputMode;
  sharedCapacityValue: number;
  resourcePools?: ResourcePool[];
}

export interface NodeCapacityProfile {
  capacityMode: CapacityMode;
  usesSharedAllocation: boolean;
  allocationPercent: number;
  resourcePoolId: string | null;
  resourcePoolName: string | null;
  totalSharedHoursPerDay: number;
  allocatedHoursPerDay: number;
  dailyBudgetMinutes: number;
  equivalentResources: number;
  availableCapacityPerTick: number;
  maxConcurrentItems: number;
}

export interface SharedAllocationTotals {
  resourcePoolId: string;
  resourcePoolName: string;
  workNodeCount: number;
  totalAllocatedPercent: number;
  remainingPercent: number;
  totalSharedHoursPerDay: number;
  allocatedHoursPerDay: number;
  remainingHoursPerDay: number;
  isOverAllocated: boolean;
}

export interface SharedBudgetSummary {
  dailyBudgetMinutes: number;
  remainingBudgetMinutes: number;
  consumedBudgetMinutes: number;
}

type WorkNode = AppNode & {
  type: 'processNode' | 'startNode';
  data: ProcessNodeData;
};

const isWorkNode = (
  node: AppNode,
): node is WorkNode =>
  node.type === 'processNode' || node.type === 'startNode';

export const clampAllocationPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

export const getLocalCapacityUnits = (resources: number): number => {
  if (!Number.isFinite(resources)) return 0;
  return Math.max(0, Math.round(resources));
};

export const getTotalSharedCapacityHoursPerDay = (
  inputMode: SharedCapacityInputMode,
  value: number,
): number => {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  return inputMode === 'fte' ? safeValue * WORKDAY_HOURS : safeValue;
};

const normalizePoolName = (name: string | undefined, fallback: string): string => {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed || fallback;
};

export const createDefaultResourcePool = (
  inputMode: SharedCapacityInputMode = DEFAULT_SHARED_CAPACITY_INPUT_MODE,
  capacityValue: number = DEFAULT_SHARED_CAPACITY_VALUE,
): ResourcePool => ({
  id: DEFAULT_RESOURCE_POOL_ID,
  name: DEFAULT_RESOURCE_POOL_NAME,
  inputMode,
  capacityValue: Number.isFinite(capacityValue) ? Math.max(0, capacityValue) : DEFAULT_SHARED_CAPACITY_VALUE,
  avatarId: normalizeResourcePoolAvatarId(undefined, 0, true),
  colorId: normalizeResourcePoolColorId(undefined, 0, true),
});

export const getResourcePoolHoursPerDay = (pool: ResourcePool): number =>
  getTotalSharedCapacityHoursPerDay(pool.inputMode, pool.capacityValue);

export const getResourcePools = (
  settings: Pick<SharedCapacitySettings, 'resourcePools' | 'sharedCapacityInputMode' | 'sharedCapacityValue'>,
): ResourcePool[] => {
  const fallbackPool = createDefaultResourcePool(
    settings.sharedCapacityInputMode,
    settings.sharedCapacityValue,
  );
  const rawPools = Array.isArray(settings.resourcePools) ? settings.resourcePools : [];
  const normalizedPools: ResourcePool[] = [];
  const seenIds = new Set<string>();

  for (const [index, pool] of rawPools.entries()) {
    const id =
      typeof pool?.id === 'string' && pool.id.trim()
        ? pool.id.trim()
        : `resource-pool-${index + 1}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    normalizedPools.push({
      id,
      name: normalizePoolName(pool?.name, `Pool ${index + 1}`),
      inputMode: pool?.inputMode === 'hours' ? 'hours' : 'fte',
      capacityValue: Number.isFinite(pool?.capacityValue) ? Math.max(0, Number(pool.capacityValue)) : 0,
      avatarId: normalizeResourcePoolAvatarId(pool?.avatarId, index, id === DEFAULT_RESOURCE_POOL_ID),
      colorId: normalizeResourcePoolColorId(pool?.colorId, index, id === DEFAULT_RESOURCE_POOL_ID),
    });
  }

  const existingDefault = normalizedPools.find((pool) => pool.id === DEFAULT_RESOURCE_POOL_ID);
  if (existingDefault) {
    return normalizedPools.map((pool) =>
      pool.id === DEFAULT_RESOURCE_POOL_ID
        ? {
            ...pool,
            inputMode: settings.sharedCapacityInputMode,
            capacityValue: Number.isFinite(settings.sharedCapacityValue)
              ? Math.max(0, Number(settings.sharedCapacityValue))
              : DEFAULT_SHARED_CAPACITY_VALUE,
            avatarId: normalizeResourcePoolAvatarId(pool.avatarId, 0, true),
            colorId: normalizeResourcePoolColorId(pool.colorId, 0, true),
          }
        : pool,
    );
  }

  return [fallbackPool, ...normalizedPools];
};

export const getDefaultResourcePool = (
  settings: Pick<SharedCapacitySettings, 'resourcePools' | 'sharedCapacityInputMode' | 'sharedCapacityValue'>,
): ResourcePool => getResourcePools(settings)[0];

export const getResourcePoolById = (
  settings: Pick<SharedCapacitySettings, 'resourcePools' | 'sharedCapacityInputMode' | 'sharedCapacityValue'>,
  resourcePoolId?: string | null,
): ResourcePool => {
  const pools = getResourcePools(settings);
  const preferredId = typeof resourcePoolId === 'string' ? resourcePoolId.trim() : '';
  if (preferredId) {
    const match = pools.find((pool) => pool.id === preferredId);
    if (match) return match;
  }
  return pools[0];
};

export const getNodeResourcePoolId = (
  nodeData: Partial<ProcessNodeData> | undefined,
  settings: Pick<SharedCapacitySettings, 'resourcePools' | 'sharedCapacityInputMode' | 'sharedCapacityValue'>,
): string => getResourcePoolById(settings, nodeData?.resourcePoolId).id;

export const getWorkNodes = (
  nodes: AppNode[],
  settings?: Pick<SharedCapacitySettings, 'resourcePools' | 'sharedCapacityInputMode' | 'sharedCapacityValue'>,
  resourcePoolId?: string,
): WorkNode[] => {
  const workNodes = nodes.filter(isWorkNode);
  if (!settings || !resourcePoolId) return workNodes;
  return workNodes.filter((node) => getNodeResourcePoolId(node.data, settings) === resourcePoolId);
};

export const getNodeAllocationPercent = (
  nodeId: string,
  nodes: AppNode[],
  settings: Pick<SharedCapacitySettings, 'resourcePools' | 'sharedCapacityInputMode' | 'sharedCapacityValue'>,
): number => {
  const target = getWorkNodes(nodes).find((node) => node.id === nodeId);
  if (!target) return 0;

  const resourcePoolId = getNodeResourcePoolId(target.data, settings);
  const workNodes = getWorkNodes(nodes, settings, resourcePoolId);
  if (workNodes.length === 0) return 0;

  const configuredTotal = workNodes.reduce(
    (sum, node) => sum + clampAllocationPercent(node.data.allocationPercent || 0),
    0,
  );

  if (configuredTotal <= 0) {
    return 100 / workNodes.length;
  }

  return clampAllocationPercent(target.data.allocationPercent || 0);
};

export const getSharedAllocationTotals = (
  nodes: AppNode[],
  settings: SharedCapacitySettings,
  resourcePoolId?: string,
): SharedAllocationTotals => {
  const targetPool = getResourcePoolById(settings, resourcePoolId);
  const workNodes = getWorkNodes(nodes, settings, targetPool.id);
  const totalAllocatedPercent = workNodes.reduce(
    (sum, node) => sum + clampAllocationPercent(node.data.allocationPercent || 0),
    0,
  );
  const totalSharedHoursPerDay = getResourcePoolHoursPerDay(targetPool);
  const allocatedHoursPerDay = totalSharedHoursPerDay * (totalAllocatedPercent / 100);
  const remainingPercent = 100 - totalAllocatedPercent;
  const remainingHoursPerDay = totalSharedHoursPerDay - allocatedHoursPerDay;

  return {
    resourcePoolId: targetPool.id,
    resourcePoolName: targetPool.name,
    workNodeCount: workNodes.length,
    totalAllocatedPercent,
    remainingPercent,
    totalSharedHoursPerDay,
    allocatedHoursPerDay,
    remainingHoursPerDay,
    isOverAllocated: remainingPercent < 0,
  };
};

export const getAllSharedAllocationTotals = (
  nodes: AppNode[],
  settings: SharedCapacitySettings,
): SharedAllocationTotals[] =>
  getResourcePools(settings).map((pool) => getSharedAllocationTotals(nodes, settings, pool.id));

export const getNodeCapacityProfile = (
  node: AppNode,
  nodes: AppNode[],
  settings: SharedCapacitySettings,
): NodeCapacityProfile => {
  if (node.type === 'annotationNode') {
    return {
      capacityMode: settings.capacityMode,
      usesSharedAllocation: false,
      allocationPercent: 0,
      resourcePoolId: null,
      resourcePoolName: null,
      totalSharedHoursPerDay: 0,
      allocatedHoursPerDay: 0,
      dailyBudgetMinutes: 0,
      equivalentResources: 0,
      availableCapacityPerTick: 0,
      maxConcurrentItems: 0,
    };
  }

  const processData = node.data as ProcessNodeData;
  const resources = getLocalCapacityUnits(processData.resources || 0);
  const isSharedWorkNode =
    (node.type === 'processNode' || node.type === 'startNode') &&
    settings.capacityMode === 'sharedAllocation';

  if (!isSharedWorkNode) {
    return {
      capacityMode: settings.capacityMode,
      usesSharedAllocation: false,
      allocationPercent: 0,
      resourcePoolId: null,
      resourcePoolName: null,
      totalSharedHoursPerDay: 0,
      allocatedHoursPerDay: 0,
      dailyBudgetMinutes: 0,
      equivalentResources: resources,
      availableCapacityPerTick: resources,
      maxConcurrentItems: resources,
    };
  }

  const pool = getResourcePoolById(settings, processData.resourcePoolId);
  const totalSharedHoursPerDay = getResourcePoolHoursPerDay(pool);
  const allocationPercent = getNodeAllocationPercent(node.id, nodes, settings);
  const allocatedHoursPerDay = totalSharedHoursPerDay * (allocationPercent / 100);
  const dailyBudgetMinutes = allocatedHoursPerDay * 60;
  const openTicksPerDay = computeOpenTicksForPeriod(TICKS_PER_WORKDAY, processData.workingHours);
  const availableCapacityPerTick =
    openTicksPerDay > 0 ? dailyBudgetMinutes / openTicksPerDay : 0;
  const equivalentResources = allocatedHoursPerDay / WORKDAY_HOURS;
  const derivedCapacitySlots =
    availableCapacityPerTick > 0 ? Math.max(1, Math.ceil(availableCapacityPerTick)) : 0;
  const maxConcurrentItems = derivedCapacitySlots > 0 ? Math.max(resources, derivedCapacitySlots) : 0;

  return {
    capacityMode: settings.capacityMode,
    usesSharedAllocation: true,
    allocationPercent,
    resourcePoolId: pool.id,
    resourcePoolName: pool.name,
    totalSharedHoursPerDay,
    allocatedHoursPerDay,
    dailyBudgetMinutes,
    equivalentResources,
    availableCapacityPerTick,
    maxConcurrentItems,
  };
};

export const getMaxPossibleProcessingTime = (
  processingTime: number,
  variability = 0,
): number => {
  const safeProcessingTime = Number.isFinite(processingTime) ? Math.max(0, Math.round(processingTime)) : 0;
  if (safeProcessingTime <= 0) return 0;
  const safeVariability = Number.isFinite(variability) ? Math.max(0, variability) : 0;
  if (safeVariability <= 0) return safeProcessingTime;
  return Math.max(1, Math.round(safeProcessingTime + safeProcessingTime * safeVariability));
};

export const getNodeSharedBudgetSummary = (
  nodeId: string,
  profile: NodeCapacityProfile | null | undefined,
  sharedNodeBudgetStateByNode: SharedNodeBudgetStateByNode | undefined,
): SharedBudgetSummary => {
  const dailyBudgetMinutes = Math.max(0, profile?.usesSharedAllocation ? profile.dailyBudgetMinutes : 0);
  const saved = sharedNodeBudgetStateByNode?.[nodeId];
  if (!saved) {
    return {
      dailyBudgetMinutes,
      remainingBudgetMinutes: dailyBudgetMinutes,
      consumedBudgetMinutes: 0,
    };
  }

  return {
    dailyBudgetMinutes,
    remainingBudgetMinutes: Math.max(0, Math.min(dailyBudgetMinutes, saved.remainingBudgetMinutes)),
    consumedBudgetMinutes: Math.max(0, Math.min(dailyBudgetMinutes, saved.consumedBudgetMinutes)),
  };
};

export const getPoolSharedBudgetSummary = (
  nodes: AppNode[],
  settings: SharedCapacitySettings,
  sharedNodeBudgetStateByNode: SharedNodeBudgetStateByNode | undefined,
  resourcePoolId?: string,
): SharedBudgetSummary => {
  const targetPool = getResourcePoolById(settings, resourcePoolId);
  let dailyBudgetMinutes = 0;
  let remainingBudgetMinutes = 0;
  let consumedBudgetMinutes = 0;

  for (const node of getWorkNodes(nodes, settings, targetPool.id)) {
    const profile = getNodeCapacityProfile(node, nodes, settings);
    const summary = getNodeSharedBudgetSummary(node.id, profile, sharedNodeBudgetStateByNode);
    dailyBudgetMinutes += summary.dailyBudgetMinutes;
    remainingBudgetMinutes += summary.remainingBudgetMinutes;
    consumedBudgetMinutes += summary.consumedBudgetMinutes;
  }

  return {
    dailyBudgetMinutes,
    remainingBudgetMinutes,
    consumedBudgetMinutes,
  };
};

export const computeBudgetUtilization = (
  consumedBudgetMinutes: number,
  availableBudgetMinutes: number,
): number => {
  if (!Number.isFinite(availableBudgetMinutes) || availableBudgetMinutes <= 0) return 0;
  if (!Number.isFinite(consumedBudgetMinutes) || consumedBudgetMinutes <= 0) return 0;
  return Math.min(100, (consumedBudgetMinutes / availableBudgetMinutes) * 100);
};

export const computeOverallBudgetUtilization = (
  nodes: AppNode[],
  settings: SharedCapacitySettings,
  sharedNodeBudgetStateByNode: SharedNodeBudgetStateByNode | undefined,
): number => {
  let totalConsumedBudgetMinutes = 0;
  let totalDailyBudgetMinutes = 0;

  for (const node of getWorkNodes(nodes)) {
    const profile = getNodeCapacityProfile(node, nodes, settings);
    if (!profile.usesSharedAllocation) continue;
    const summary = getNodeSharedBudgetSummary(node.id, profile, sharedNodeBudgetStateByNode);
    totalConsumedBudgetMinutes += summary.consumedBudgetMinutes;
    totalDailyBudgetMinutes += summary.dailyBudgetMinutes;
  }

  return computeBudgetUtilization(totalConsumedBudgetMinutes, totalDailyBudgetMinutes);
};

export const getEstimatedItemsPerDay = (
  profile: NodeCapacityProfile | null | undefined,
  processingTime: number,
): number => {
  if (!profile?.usesSharedAllocation) return 0;
  const safeProcessingTime = Number.isFinite(processingTime) ? Math.max(0, processingTime) : 0;
  if (safeProcessingTime <= 0) return 0;
  return profile.dailyBudgetMinutes / safeProcessingTime;
};

export const computeOverallLiveUtilization = (
  nodes: AppNode[],
  itemsByNode: Map<string, ProcessItem[]>,
  settings: SharedCapacitySettings,
): number => {
  let totalBusy = 0;
  let totalCapacity = 0;

  for (const node of getWorkNodes(nodes)) {
    const capacityProfile = getNodeCapacityProfile(node, nodes, settings);
    const availableCapacity = Math.max(0, capacityProfile.availableCapacityPerTick);
    const processingCount = (itemsByNode.get(node.id) || []).reduce(
      (count, item) => count + (item.status === ItemStatus.PROCESSING ? 1 : 0),
      0,
    );

    totalCapacity += availableCapacity;
    totalBusy += Math.min(availableCapacity, processingCount);
  }

  if (totalCapacity <= 0) return 0;
  return Math.min(100, (totalBusy / totalCapacity) * 100);
};

export const computeNodeLiveUtilizationForLoad = (
  processingCount: number,
  profile: NodeCapacityProfile,
): number => {
  if (profile.availableCapacityPerTick <= 0) return 0;
  return Math.min(100, (Math.min(processingCount, profile.availableCapacityPerTick) / profile.availableCapacityPerTick) * 100);
};
