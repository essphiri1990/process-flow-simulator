import { describe, expect, it } from 'vitest';

import { computeThroughputFromCompletions } from '../metrics';
import { ItemStatus, ProcessItem } from '../types';

const createCompletedItem = (id: string, completionTick: number): ProcessItem => ({
  id,
  currentNodeId: null,
  status: ItemStatus.COMPLETED,
  progress: 100,
  remainingTime: 0,
  processingDuration: 0,
  totalTime: completionTick,
  nodeEnterTick: 0,
  metricsEpoch: 0,
  spawnTick: 0,
  completionTick,
  terminalNodeId: 'end-1',
  timeActive: completionTick,
  timeWaiting: 0,
  nodeLeadTime: 0,
});

describe('metrics throughput accuracy', () => {
  it('two completions 60 ticks apart return 1.0/h', () => {
    const result = computeThroughputFromCompletions([
      createCompletedItem('a', 0),
      createCompletedItem('b', 60),
    ]);

    expect(result.throughputWorkingPerHour).toBe(1);
  });

  it('50 completions one tick apart return 60.0/h', () => {
    const items = Array.from({ length: 50 }, (_, index) =>
      createCompletedItem(`item-${index}`, index)
    );

    const result = computeThroughputFromCompletions(items, { windowSize: 50 });

    expect(result.throughputWorkingPerHour).toBe(60);
  });
});
