import { describe, expect, it } from 'vitest';
import { ItemStatus } from '../types';
import { computeOverallBudgetUtilization, computeOverallLiveUtilization, getNodeCapacityProfile, getResourcePools, getSharedAllocationTotals } from '../capacityModel';

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

  it('computes allocation totals per selected resource pool', () => {
    const nodes = [
      {
        id: 'start-1',
        type: 'startNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Start',
          processingTime: 1,
          resources: 1,
          allocationPercent: 60,
          resourcePoolId: 'default-shared-pool',
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
          label: 'Contractor Visit',
          processingTime: 1,
          resources: 1,
          allocationPercent: 55,
          resourcePoolId: 'contractors',
          quality: 1,
          variability: 0,
          stats: { processed: 0, failed: 0, maxQueue: 0 },
          routingWeights: {},
        },
      },
    ] as any;

    const totals = getSharedAllocationTotals(
      nodes,
      {
        capacityMode: 'sharedAllocation',
        sharedCapacityInputMode: 'fte',
        sharedCapacityValue: 3,
        resourcePools: [
          { id: 'default-shared-pool', name: 'Shared Team', inputMode: 'fte', capacityValue: 3 },
          { id: 'contractors', name: 'Contractors', inputMode: 'hours', capacityValue: 16 },
        ],
      },
      'contractors',
    );

    expect(totals.resourcePoolName).toBe('Contractors');
    expect(totals.workNodeCount).toBe(1);
    expect(totals.totalAllocatedPercent).toBe(55);
    expect(totals.remainingPercent).toBe(45);
    expect(totals.totalSharedHoursPerDay).toBe(16);
    expect(totals.allocatedHoursPerDay).toBeCloseTo(8.8);
  });

  it('normalizes pool colors for older flows that only saved avatars', () => {
    const pools = getResourcePools({
      sharedCapacityInputMode: 'fte',
      sharedCapacityValue: 3,
      resourcePools: [
        {
          id: 'default-shared-pool',
          name: 'Shared Team',
          inputMode: 'fte',
          capacityValue: 3,
          avatarId: 'orbit',
        },
        {
          id: 'contractors',
          name: 'Contractors',
          inputMode: 'hours',
          capacityValue: 16,
          avatarId: 'bot',
        },
      ] as any,
    });

    expect(pools[0].colorId).toBe('amber');
    expect(pools[1].colorId).toBe('orange');
  });

  it('uses the assigned pool budget when building a node capacity profile', () => {
    const nodes = [
      {
        id: 'proc-1',
        type: 'processNode',
        position: { x: 200, y: 0 },
        data: {
          label: 'Contractor Visit',
          processingTime: 1,
          resources: 1,
          allocationPercent: 50,
          resourcePoolId: 'contractors',
          quality: 1,
          variability: 0,
          stats: { processed: 0, failed: 0, maxQueue: 0 },
          routingWeights: {},
        },
      },
    ] as any;

    const profile = getNodeCapacityProfile(
      nodes[0],
      nodes,
      {
        capacityMode: 'sharedAllocation',
        sharedCapacityInputMode: 'fte',
        sharedCapacityValue: 3,
        resourcePools: [
          { id: 'default-shared-pool', name: 'Shared Team', inputMode: 'fte', capacityValue: 3 },
          { id: 'contractors', name: 'Contractors', inputMode: 'hours', capacityValue: 16 },
        ],
      },
    );

    expect(profile.resourcePoolId).toBe('contractors');
    expect(profile.resourcePoolName).toBe('Contractors');
    expect(profile.totalSharedHoursPerDay).toBe(16);
    expect(profile.allocatedHoursPerDay).toBe(8);
    expect(profile.dailyBudgetMinutes).toBe(480);
    expect(profile.equivalentResources).toBe(1);
    expect(profile.maxConcurrentItems).toBe(1);
  });

  it('raises shared active cap when the daily budget supports more parallel work', () => {
    const node = {
      id: 'proc-1',
      type: 'processNode',
      position: { x: 200, y: 0 },
      data: {
        label: 'Wash',
        processingTime: 10,
        resources: 1,
        allocationPercent: 100,
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
        capacityMode: 'sharedAllocation',
        sharedCapacityInputMode: 'hours',
        sharedCapacityValue: 32,
      },
    );

    expect(profile.allocatedHoursPerDay).toBe(32);
    expect(profile.availableCapacityPerTick).toBe(4);
    expect(profile.maxConcurrentItems).toBe(4);
  });

  it('computes shared live utilization from today budget consumption', () => {
    const nodes = [
      {
        id: 'proc-1',
        type: 'processNode',
        position: { x: 200, y: 0 },
        data: {
          label: 'Contractor Visit',
          processingTime: 60,
          resources: 2,
          allocationPercent: 50,
          quality: 1,
          variability: 0,
          stats: { processed: 0, failed: 0, maxQueue: 0 },
          routingWeights: {},
        },
      },
    ] as any;

    const utilization = computeOverallBudgetUtilization(
      nodes,
      {
        capacityMode: 'sharedAllocation',
        sharedCapacityInputMode: 'hours',
        sharedCapacityValue: 8,
      },
      {
        'proc-1': {
          budgetDayKey: 0,
          dailyBudgetMinutes: 240,
          remainingBudgetMinutes: 60,
          consumedBudgetMinutes: 180,
        },
      },
    );

    expect(utilization).toBe(75);
  });
});
