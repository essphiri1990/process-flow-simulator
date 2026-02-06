import { ProcessItem, ItemStatus, TICKS_PER_HOUR } from './types';

export interface LeadMetrics {
  avgLeadTime: number;
  avgVAT: number;
  pce: number;
  sampleSize: number;
  windowSize: number;
}

export interface MetricsWindowConfig {
  windowSize?: number;
  metricsEpoch?: number;
}

const DEFAULT_COMPLETION_WINDOW = 50;

const getCompleted = (items: ProcessItem[], metricsEpoch?: number): ProcessItem[] => {
  return items.filter(
    (it) =>
      it.status === ItemStatus.COMPLETED &&
      it.completionTick !== null &&
      (metricsEpoch === undefined || it.metricsEpoch === metricsEpoch)
  );
};

const getCompletionWindow = (items: ProcessItem[], windowSize: number, metricsEpoch?: number): ProcessItem[] => {
  const completed = getCompleted(items, metricsEpoch);
  completed.sort((a, b) => (b.completionTick || 0) - (a.completionTick || 0));
  return completed.slice(0, windowSize);
};

export const computeLeadMetrics = (items: ProcessItem[], config: MetricsWindowConfig = {}): LeadMetrics => {
  const windowSize = config.windowSize ?? DEFAULT_COMPLETION_WINDOW;
  const completed = getCompletionWindow(items, windowSize, config.metricsEpoch);
  let totalLead = 0;
  let totalVAT = 0;

  for (const item of completed) {
    const lead = Math.max(0, item.timeActive + item.timeWaiting);
    totalLead += lead;
    totalVAT += item.timeActive;
  }

  const sampleSize = completed.length;
  const avgLeadTime = sampleSize > 0 ? totalLead / sampleSize : 0;
  const avgVAT = sampleSize > 0 ? totalVAT / sampleSize : 0;
  const pce = avgLeadTime > 0 ? (avgVAT / avgLeadTime) * 100 : 0;

  return {
    avgLeadTime,
    avgVAT,
    pce,
    sampleSize,
    windowSize
  };
};

export const computeThroughputFromCompletions = (items: ProcessItem[], config: MetricsWindowConfig = {}) => {
  const windowSize = config.windowSize ?? DEFAULT_COMPLETION_WINDOW;
  const completed = getCompletionWindow(items, windowSize, config.metricsEpoch);
  const sampleSize = completed.length;

  if (sampleSize < 2) {
    return { throughput: 0, sampleSize, windowSize, spanTicks: 0 };
  }

  const effectiveCompletionTicks = completed.map(
    (item) => item.spawnTick + item.timeActive + item.timeWaiting
  );
  const minTick = Math.min(...effectiveCompletionTicks);
  const maxTick = Math.max(...effectiveCompletionTicks);
  const spanTicks = Math.max(1, maxTick - minTick);

  const throughput = (sampleSize / spanTicks) * TICKS_PER_HOUR;
  return { throughput, sampleSize, windowSize, spanTicks };
};

export const formatCompletionWindowLabel = (windowSize: number): string => `last ${windowSize} completions`;
