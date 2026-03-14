import { ItemStatus, type ProcessItem } from '../types';
import { useStore } from '../store';

type PartialStoreState = Partial<ReturnType<typeof useStore.getState>>;

export const resetUiStore = (overrides: PartialStoreState = {}) => {
  useStore.getState().clearCanvas();
  useStore.setState({
    isRunning: false,
    displayTickCount: 0,
    simulationProgress: 0,
    targetDuration: Infinity,
    throughput: 0,
    metricsEpoch: 0,
    metricsWindowCompletions: 50,
    nodeStageMetricsHistoryByNode: {},
    nodeUtilizationHistoryByNode: {},
    items: [],
    assetPools: [],
    itemCounts: {
      wip: 0,
      completed: 0,
      failed: 0,
      queued: 0,
      processing: 0,
      stuck: 0,
    },
    showSharedResourcesCard: true,
    ...overrides,
  });
};

export const createCompletedItem = (
  overrides: Partial<ProcessItem> = {},
): ProcessItem => ({
  id: 'item-1',
  currentNodeId: null,
  status: ItemStatus.COMPLETED,
  progress: 100,
  remainingTime: 0,
  processingDuration: 40,
  totalTime: 80,
  nodeEnterTick: 0,
  metricsEpoch: 0,
  spawnTick: 0,
  completionTick: 80,
  terminalNodeId: 'end-1',
  timeActive: 40,
  timeWaiting: 20,
  nodeLeadTime: 60,
  ...overrides,
});
