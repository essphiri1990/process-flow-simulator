import { describe, expect, it } from 'vitest';

import {
  computeNodeStageMetrics,
  computeOverallUtilization,
  computeRollingNodeUtilization,
  computeThroughputFromCompletions,
  getLatestKpiUtilizationAverage,
} from '../metrics';
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

  it('computes weighted overall resource utilisation across active work nodes', () => {
    const itemsByNode = new Map<string, ProcessItem[]>([
      [
        'start-1',
        [
          { ...createCompletedItem('queued-placeholder', 0), id: 'start-processing', currentNodeId: 'start-1', status: ItemStatus.PROCESSING, completionTick: null, terminalNodeId: null },
        ],
      ],
      [
        'proc-1',
        [
          { ...createCompletedItem('proc-a', 0), id: 'proc-a', currentNodeId: 'proc-1', status: ItemStatus.PROCESSING, completionTick: null, terminalNodeId: null },
          { ...createCompletedItem('proc-b', 0), id: 'proc-b', currentNodeId: 'proc-1', status: ItemStatus.PROCESSING, completionTick: null, terminalNodeId: null },
        ],
      ],
    ]);

    const utilisation = computeOverallUtilization(
      [
        { id: 'start-1', type: 'startNode', data: { resources: 2 } },
        { id: 'proc-1', type: 'processNode', data: { resources: 4 } },
        { id: 'end-1', type: 'endNode', data: { resources: 999 } },
      ] as any,
      itemsByNode,
    );

    expect(utilisation).toBeCloseTo(50);
  });

  it('computes rolling node utilisation from resource samples', () => {
    const utilisation = computeRollingNodeUtilization([
      { tick: 0, busyResourceTicks: 1, availableResourceTicks: 2 },
      { tick: 1, busyResourceTicks: 2, availableResourceTicks: 2 },
    ]);

    expect(utilisation).toBeCloseTo(75);
  });

  it('reads the latest period-average utilisation from KPI history', () => {
    const utilisation = getLatestKpiUtilizationAverage(
      {
        hour: [
          {
            period: 'hour',
            periodIndex: 0,
            startTick: 0,
            endTick: 60,
            label: 'H1',
            completions: 0,
            leadTimeTotal: 0,
            valueAddedTotal: 0,
            leadTimeAvg: 0,
            processEfficiencyAvg: 0,
            busyResourceTicks: 12,
            availableResourceTicks: 20,
            resourceUtilizationAvg: 60,
          },
          {
            period: 'hour',
            periodIndex: 1,
            startTick: 60,
            endTick: 120,
            label: 'H2',
            completions: 0,
            leadTimeTotal: 0,
            valueAddedTotal: 0,
            leadTimeAvg: 0,
            processEfficiencyAvg: 0,
            busyResourceTicks: 7,
            availableResourceTicks: 10,
            resourceUtilizationAvg: 70,
          },
        ],
        day: [],
        week: [],
        month: [],
      },
      'hour',
    );

    expect(utilisation).toBe(70);
  });

  it('computes node-stage metrics from the recent completion window and falls back across epochs', () => {
    const samples = [
      { nodeId: 'proc-1', completionTick: 10, leadTicks: 20, valueAddedTicks: 10, waitingTicks: 10, metricsEpoch: 0 },
      { nodeId: 'proc-1', completionTick: 20, leadTicks: 40, valueAddedTicks: 20, waitingTicks: 20, metricsEpoch: 0 },
      { nodeId: 'proc-1', completionTick: 30, leadTicks: 30, valueAddedTicks: 15, waitingTicks: 15, metricsEpoch: 1 },
    ];

    const currentEpoch = computeNodeStageMetrics(samples, { windowSize: 2, metricsEpoch: 1 });
    expect(currentEpoch.sampleSize).toBe(1);
    expect(currentEpoch.avgLeadWorking).toBe(30);
    expect(currentEpoch.pce).toBe(50);

    const fallback = computeNodeStageMetrics(samples, { windowSize: 2, metricsEpoch: 2 });
    expect(fallback.sampleSize).toBe(2);
    expect(fallback.avgLeadWorking).toBe(35);
  });
});
