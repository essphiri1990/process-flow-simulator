import {
  AppNode,
  CapacityMode,
  ItemStatus,
  ProcessItem,
  ProcessNodeData,
  SharedCapacityInputMode,
  TICKS_PER_WORKDAY,
} from './types';
import { computeOpenTicksForPeriod } from './timeModel';

export const WORKDAY_HOURS = 8;
export const DEFAULT_SHARED_CAPACITY_INPUT_MODE: SharedCapacityInputMode = 'fte';
export const DEFAULT_SHARED_CAPACITY_VALUE = 3;

export interface SharedCapacitySettings {
  capacityMode: CapacityMode;
  sharedCapacityInputMode: SharedCapacityInputMode;
  sharedCapacityValue: number;
}

export interface NodeCapacityProfile {
  capacityMode: CapacityMode;
  usesSharedAllocation: boolean;
  allocationPercent: number;
  totalSharedHoursPerDay: number;
  allocatedHoursPerDay: number;
  equivalentResources: number;
  availableCapacityPerTick: number;
  maxConcurrentItems: number;
}

export interface SharedAllocationTotals {
  workNodeCount: number;
  totalAllocatedPercent: number;
  remainingPercent: number;
  totalSharedHoursPerDay: number;
  allocatedHoursPerDay: number;
  remainingHoursPerDay: number;
  isOverAllocated: boolean;
}

const isWorkNode = (
  node: AppNode,
): node is Extract<AppNode, { type: 'processNode' | 'startNode' }> =>
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

export const getWorkNodes = (nodes: AppNode[]): AppNode[] => nodes.filter(isWorkNode);

export const getNodeAllocationPercent = (
  nodeId: string,
  nodes: AppNode[],
): number => {
  const workNodes = getWorkNodes(nodes);
  if (workNodes.length === 0) return 0;

  const configuredTotal = workNodes.reduce(
    (sum, node) => sum + clampAllocationPercent((node.data as ProcessNodeData).allocationPercent || 0),
    0,
  );

  if (configuredTotal <= 0) {
    return 100 / workNodes.length;
  }

  const target = workNodes.find((node) => node.id === nodeId);
  if (!target) return 0;
  return clampAllocationPercent((target.data as ProcessNodeData).allocationPercent || 0);
};

export const getSharedAllocationTotals = (
  nodes: AppNode[],
  settings: SharedCapacitySettings,
): SharedAllocationTotals => {
  const workNodes = getWorkNodes(nodes);
  const totalAllocatedPercent = workNodes.reduce(
    (sum, node) => sum + clampAllocationPercent((node.data as ProcessNodeData).allocationPercent || 0),
    0,
  );
  const totalSharedHoursPerDay = getTotalSharedCapacityHoursPerDay(
    settings.sharedCapacityInputMode,
    settings.sharedCapacityValue,
  );
  const allocatedHoursPerDay = totalSharedHoursPerDay * (totalAllocatedPercent / 100);
  const remainingPercent = 100 - totalAllocatedPercent;
  const remainingHoursPerDay = totalSharedHoursPerDay - allocatedHoursPerDay;

  return {
    workNodeCount: workNodes.length,
    totalAllocatedPercent,
    remainingPercent,
    totalSharedHoursPerDay,
    allocatedHoursPerDay,
    remainingHoursPerDay,
    isOverAllocated: remainingPercent < 0,
  };
};

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
      totalSharedHoursPerDay: 0,
      allocatedHoursPerDay: 0,
      equivalentResources: 0,
      availableCapacityPerTick: 0,
      maxConcurrentItems: 0,
    };
  }

  const processData = node.data as ProcessNodeData;
  const resources = getLocalCapacityUnits(processData.resources || 0);
  const isSharedWorkNode = (node.type === 'processNode' || node.type === 'startNode')
    && settings.capacityMode === 'sharedAllocation';
  if (!isSharedWorkNode) {
    return {
      capacityMode: settings.capacityMode,
      usesSharedAllocation: false,
      allocationPercent: 0,
      totalSharedHoursPerDay: 0,
      allocatedHoursPerDay: 0,
      equivalentResources: resources,
      availableCapacityPerTick: resources,
      maxConcurrentItems: resources,
    };
  }

  const totalSharedHoursPerDay = getTotalSharedCapacityHoursPerDay(
    settings.sharedCapacityInputMode,
    settings.sharedCapacityValue,
  );
  const allocationPercent = getNodeAllocationPercent(node.id, nodes);
  const allocatedHoursPerDay = totalSharedHoursPerDay * (allocationPercent / 100);
  const openTicksPerDay = computeOpenTicksForPeriod(TICKS_PER_WORKDAY, processData.workingHours);
  const availableCapacityPerTick =
    openTicksPerDay > 0 ? (allocatedHoursPerDay * 60) / openTicksPerDay : 0;
  const equivalentResources = allocatedHoursPerDay / WORKDAY_HOURS;
  const maxConcurrentItems =
    availableCapacityPerTick > 0 ? Math.max(1, Math.ceil(availableCapacityPerTick)) : 0;

  return {
    capacityMode: settings.capacityMode,
    usesSharedAllocation: true,
    allocationPercent,
    totalSharedHoursPerDay,
    allocatedHoursPerDay,
    equivalentResources,
    availableCapacityPerTick,
    maxConcurrentItems,
  };
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
  return (totalBusy / totalCapacity) * 100;
};

export const computeNodeLiveUtilizationForLoad = (
  processingCount: number,
  profile: NodeCapacityProfile,
): number => {
  if (profile.availableCapacityPerTick <= 0) return 0;
  return (Math.min(processingCount, profile.availableCapacityPerTick) / profile.availableCapacityPerTick) * 100;
};
