import { describe, expect, it } from 'vitest';
import { ItemStatus } from '../types';
import { computeOverallLiveUtilization, getNodeCapacityProfile, getSharedAllocationTotals } from '../capacityModel';

describe('capacityModel', () => {
  it('reports signed remaining budget when total allocation exceeds 100%', () => {
    const totals = getSharedAllocationTotals(
      [
        {
          id: 'start-1',
          type: 'startNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Start',
            processingTime: 1,
            resources: 1,
            allocationPercent: 60,
            quality: 1,
            variability: 0,
            stats: { processed: 0, failed: 0, maxQueue: 0 },
            routingWeights: {},
          },
        },
        {
          id: 'proc-1',
          type: 'processNode',
          position: { x: 200, y: 0 },
          data: {
            label: 'Build',
            processingTime: 1,
            resources: 1,
            allocationPercent: 55,
            quality: 1,
            variability: 0,
            stats: { processed: 0, failed: 0, maxQueue: 0 },
            routingWeights: {},
          },
        },
      ] as any,
      {
        capacityMode: 'sharedAllocation',
        sharedCapacityInputMode: 'fte',
        sharedCapacityValue: 3,
      },
    );

    expect(totals.totalAllocatedPercent).toBe(115);
    expect(totals.remainingPercent).toBe(-15);
    expect(totals.remainingHoursPerDay).toBeCloseTo(-3.6);
    expect(totals.isOverAllocated).toBe(true);
  });

  it('treats all-zero explicit allocations as full remaining budget for config feedback', () => {
    const totals = getSharedAllocationTotals(
      [
        {
          id: 'start-1',
          type: 'startNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Start',
            processingTime: 1,
            resources: 1,
            allocationPercent: 0,
            quality: 1,
            variability: 0,
            stats: { processed: 0, failed: 0, maxQueue: 0 },
            routingWeights: {},
          },
        },
        {
          id: 'proc-1',
          type: 'processNode',
          position: { x: 200, y: 0 },
          data: {
            label: 'Build',
            processingTime: 1,
            resources: 1,
            allocationPercent: 0,
            quality: 1,
            variability: 0,
            stats: { processed: 0, failed: 0, maxQueue: 0 },
            routingWeights: {},
          },
        },
      ] as any,
      {
        capacityMode: 'sharedAllocation',
        sharedCapacityInputMode: 'hours',
        sharedCapacityValue: 24,
      },
    );

    expect(totals.workNodeCount).toBe(2);
    expect(totals.totalAllocatedPercent).toBe(0);
    expect(totals.remainingPercent).toBe(100);
    expect(totals.remainingHoursPerDay).toBe(24);
    expect(totals.isOverAllocated).toBe(false);
  });

  it('computes live utilization from shared allocation capacity instead of local resources', () => {
    const nodes = [
      {
        id: 'start-1',
        type: 'startNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Start',
          processingTime: 1,
          resources: 1,
          allocationPercent: 50,
          quality: 1,
          variability: 0,
          stats: { processed: 0, failed: 0, maxQueue: 0 },
          routingWeights: {},
        },
      },
      {
        id: 'proc-1',
        type: 'processNode',
        position: { x: 200, y: 0 },
        data: {
          label: 'Build',
          processingTime: 1,
          resources: 1,
          allocationPercent: 50,
          quality: 1,
          variability: 0,
          stats: { processed: 0, failed: 0, maxQueue: 0 },
          routingWeights: {},
        },
      },
    ] as any;

    const utilization = computeOverallLiveUtilization(
      nodes,
      new Map([
        [
          'start-1',
          [{ status: ItemStatus.PROCESSING }],
        ],
        [
          'proc-1',
          [{ status: ItemStatus.PROCESSING }],
        ],
      ]) as any,
      {
        capacityMode: 'sharedAllocation',
        sharedCapacityInputMode: 'hours',
        sharedCapacityValue: 24,
      },
    );

    expect(utilization).toBeCloseTo(66.67, 2);
  });

  it('treats zero local resources as zero runnable capacity', () => {
    const node = {
      id: 'proc-1',
      type: 'processNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Build',
        processingTime: 1,
        resources: 0,
        quality: 1,
        variability: 0,
        stats: { processed: 0, failed: 0, maxQueue: 0 },
        routingWeights: {},
      },
    } as any;

    const profile = getNodeCapacityProfile(
      node,
      [node],
      {
        capacityMode: 'local',
        sharedCapacityInputMode: 'fte',
        sharedCapacityValue: 3,
      },
    );

    expect(profile.availableCapacityPerTick).toBe(0);
    expect(profile.maxConcurrentItems).toBe(0);
    expect(profile.equivalentResources).toBe(0);
  });
});
