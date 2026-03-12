import {
  AppNode,
  CompletionMetrics,
  ItemStatus,
  KpiHistoryByPeriod,
  KpiPeriod,
  NodeUtilizationHistoryByNode,
  PoolUtilizationHistoryByPeriod,
  ProcessItem,
  ProcessNodeData,
  ResourceUtilizationSample,
  TICKS_PER_HOUR,
} from './types';
import { getLocalCapacityUnits } from './capacityModel';

export interface MetricsWindowConfig {
  windowSize?: number;
  metricsEpoch?: number;
}

const DEFAULT_COMPLETION_WINDOW = 50;
export const NODE_UTILIZATION_ROLLING_WINDOW_TICKS = TICKS_PER_HOUR;

const getCompleted = (items: ProcessItem[], metricsEpoch?: number): ProcessItem[] => {
  return items.filter(
    (it) =>
      it.status === ItemStatus.COMPLETED &&
      it.completionTick !== null &&
      it.terminalNodeId !== null &&
      (metricsEpoch === undefined || it.metricsEpoch === metricsEpoch)
  );
};

const getCompletionWindow = (items: ProcessItem[], windowSize: number, metricsEpoch?: number): ProcessItem[] => {
  const completed = getCompleted(items, metricsEpoch);
  completed.sort((a, b) => (b.completionTick || 0) - (a.completionTick || 0));
  return completed.slice(0, windowSize);
};

const getCompletionWindowWithFallback = (
  items: ProcessItem[],
  windowSize: number,
  metricsEpoch: number | undefined,
  minSamples: number
) => {
  const scoped = getCompletionWindow(items, windowSize, metricsEpoch);
  if (metricsEpoch === undefined || scoped.length >= minSamples) {
    return { completions: scoped, usedFallback: false };
  }
  const fallback = getCompletionWindow(items, windowSize, undefined);
  return { completions: fallback, usedFallback: fallback.length > 0 };
};

const getWorkingCompletionTick = (item: ProcessItem): number => {
  return item.spawnTick + Math.max(0, item.timeActive + item.timeWaiting);
};

const getElapsedCompletionTick = (item: ProcessItem): number => {
  if (item.completionTick !== null) return item.completionTick;
  return item.spawnTick + Math.max(0, item.totalTime);
};

const computeThroughputPerHour = (completionTicks: number[]) => {
  const sampleSize = completionTicks.length;
  if (sampleSize < 2) {
    return { throughput: 0, spanTicks: 0 };
  }

  const minTick = Math.min(...completionTicks);
  const maxTick = Math.max(...completionTicks);
  const spanTicks = Math.max(1, maxTick - minTick);
  const throughput = ((sampleSize - 1) / spanTicks) * TICKS_PER_HOUR;
  return { throughput, spanTicks };
};

export const computeLeadMetrics = (
  items: ProcessItem[],
  config: MetricsWindowConfig = {}
): CompletionMetrics => {
  const windowSize = config.windowSize ?? DEFAULT_COMPLETION_WINDOW;
  const { completions: completed } = getCompletionWindowWithFallback(items, windowSize, config.metricsEpoch, 1);
  const { completions: throughputCompleted } = getCompletionWindowWithFallback(items, windowSize, config.metricsEpoch, 2);
  let totalLeadWorking = 0;
  let totalLeadElapsed = 0;
  let totalClosed = 0;
  let totalVAT = 0;

  for (const item of completed) {
    const leadWorking = Math.max(0, item.timeActive + item.timeWaiting);
    const leadElapsed = Math.max(0, getElapsedCompletionTick(item) - item.spawnTick);
    const closed = Math.max(0, leadElapsed - leadWorking);
    totalLeadWorking += leadWorking;
    totalLeadElapsed += leadElapsed;
    totalClosed += closed;
    totalVAT += item.timeActive;
  }

  const sampleSize = completed.length;
  const avgLeadWorking = sampleSize > 0 ? totalLeadWorking / sampleSize : 0;
  const avgLeadElapsed = sampleSize > 0 ? totalLeadElapsed / sampleSize : 0;
  const avgClosed = sampleSize > 0 ? totalClosed / sampleSize : 0;
  const avgVAT = sampleSize > 0 ? totalVAT / sampleSize : 0;
  const pce = avgLeadWorking > 0 ? (avgVAT / avgLeadWorking) * 100 : 0;
  const workingThroughput = computeThroughputPerHour(throughputCompleted.map(getWorkingCompletionTick));
  const elapsedThroughput = computeThroughputPerHour(throughputCompleted.map(getElapsedCompletionTick));

  return {
    avgLeadWorking,
    avgLeadElapsed,
    avgClosed,
    avgVAT,
    pce,
    throughputWorkingPerHour: workingThroughput.throughput,
    throughputElapsedPerHour: elapsedThroughput.throughput,
    sampleSize,
    windowSize
  };
};

export const computeThroughputFromCompletions = (items: ProcessItem[], config: MetricsWindowConfig = {}) => {
  const windowSize = config.windowSize ?? DEFAULT_COMPLETION_WINDOW;
  const { completions: completed } = getCompletionWindowWithFallback(items, windowSize, config.metricsEpoch, 2);
  const sampleSize = completed.length;

  if (sampleSize < 2) {
    return {
      throughput: 0,
      throughputWorkingPerHour: 0,
      throughputElapsedPerHour: 0,
      sampleSize,
      windowSize,
      spanTicks: 0,
      spanTicksElapsed: 0
    };
  }

  const workingThroughput = computeThroughputPerHour(completed.map(getWorkingCompletionTick));
  const elapsedThroughput = computeThroughputPerHour(completed.map(getElapsedCompletionTick));
  return {
    throughput: workingThroughput.throughput,
    throughputWorkingPerHour: workingThroughput.throughput,
    throughputElapsedPerHour: elapsedThroughput.throughput,
    sampleSize,
    windowSize,
    spanTicks: workingThroughput.spanTicks,
    spanTicksElapsed: elapsedThroughput.spanTicks
  };
};

export const formatCompletionWindowLabel = (windowSize: number): string => `last ${windowSize} completions`;

export const computeUtilizationFromResourceTicks = (
  busyResourceTicks: number,
  availableResourceTicks: number,
): number => {
  if (!Number.isFinite(availableResourceTicks) || availableResourceTicks <= 0) return 0;
  if (!Number.isFinite(busyResourceTicks) || busyResourceTicks <= 0) return 0;
  return Math.min(100, (busyResourceTicks / availableResourceTicks) * 100);
};

export const computeNodeUtilization = (items: ProcessItem[], resources: number): number => {
  const safeResources = getLocalCapacityUnits(resources || 0);
  if (safeResources <= 0) return 0;
  const busyCount = items.reduce(
    (count, item) => count + (item.status === ItemStatus.PROCESSING ? 1 : 0),
    0,
  );
  return (busyCount / safeResources) * 100;
};

export const computeOverallUtilization = (
  nodes: AppNode[],
  itemsByNode: Map<string, ProcessItem[]>,
): number => {
  let totalBusy = 0;
  let totalCapacity = 0;

  for (const node of nodes) {
    if (node.type !== 'processNode' && node.type !== 'startNode') continue;
    const data = node.data as ProcessNodeData;
    const capacity = getLocalCapacityUnits(data.resources || 0);
    totalCapacity += capacity;
    totalBusy += (itemsByNode.get(node.id) || []).reduce(
      (count, item) => count + (item.status === ItemStatus.PROCESSING ? 1 : 0),
      0,
    );
  }

  if (totalCapacity <= 0) return 0;
  return (totalBusy / totalCapacity) * 100;
};

export const computeRollingNodeUtilization = (
  samples: ResourceUtilizationSample[],
): number => {
  let busyResourceTicks = 0;
  let availableResourceTicks = 0;

  for (const sample of samples) {
    busyResourceTicks += sample.busyResourceTicks;
    availableResourceTicks += sample.availableResourceTicks;
  }

  return computeUtilizationFromResourceTicks(busyResourceTicks, availableResourceTicks);
};

export const getRollingNodeUtilization = (
  historyByNode: NodeUtilizationHistoryByNode,
  nodeId: string,
): number => computeRollingNodeUtilization(historyByNode[nodeId] || []);

export const getLatestKpiUtilizationAverage = (
  historyByPeriod: KpiHistoryByPeriod,
  period: KpiPeriod,
): number => {
  const buckets = historyByPeriod[period] || [];
  const latestBucket = buckets[buckets.length - 1];
  return latestBucket?.resourceUtilizationAvg || 0;
};

export const getLatestPoolUtilizationAverage = (
  historyByPeriod: PoolUtilizationHistoryByPeriod,
  period: KpiPeriod,
  resourcePoolId: string,
): number => {
  const buckets = historyByPeriod[period]?.[resourcePoolId] || [];
  const latestBucket = buckets[buckets.length - 1];
  return latestBucket?.resourceUtilizationAvg || 0;
};
