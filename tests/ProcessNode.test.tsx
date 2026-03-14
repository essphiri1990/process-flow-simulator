import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('reactflow', () => ({
  Handle: ({ id }: { id?: string }) => <div data-testid={id ? `handle-${id}` : 'handle'} />,
  Position: { Right: 'right', Bottom: 'bottom', Left: 'left', Top: 'top' },
  useStore: (selector: (state: any) => unknown) =>
    selector({
      connectionStartHandle: null,
      connectionClickStartHandle: null,
    }),
  addEdge: (edge: any, edges: any[]) => [...edges, { id: `e-${edge.source}-${edge.target}`, ...edge }],
  applyNodeChanges: (_changes: any[], nodes: any[]) => nodes,
  applyEdgeChanges: (_changes: any[], edges: any[]) => edges,
  MarkerType: { ArrowClosed: 'arrowclosed' },
}));

vi.mock('../components/Toast', () => ({
  showToast: vi.fn(),
}));

const sdkMock = {
  isEmbedded: false,
  getContext: vi.fn(),
  getSession: vi.fn(),
  listCloudSaves: vi.fn(),
  createCloudSave: vi.fn(),
  deleteCloudSave: vi.fn(),
  logScoreRun: vi.fn(),
  trackAppCompleted: vi.fn(),
};

vi.mock('../processBoxSdk', () => ({
  getProcessBoxSdk: () => sdkMock,
}));

import ProcessNode from '../components/ProcessNode';
import { resetUiStore } from './componentTestUtils';

describe('ProcessNode shared budget warning', () => {
  beforeEach(() => {
    resetUiStore();
  });

  it('shows the warning triangle when shared budget is exhausted for queued work', () => {
    const node = {
      id: 'proc-1',
      type: 'processNode' as const,
      position: { x: 0, y: 0 },
      data: {
        label: 'Review',
        processingTime: 50,
        resources: 2,
        quality: 1,
        variability: 0,
        stats: { processed: 0, failed: 0, maxQueue: 0 },
        routingWeights: {},
        allocationPercent: 100,
        resourcePoolId: 'default-shared-pool',
      },
    };

    resetUiStore({
      nodes: [node] as any,
      capacityMode: 'sharedAllocation',
      sharedCapacityInputMode: 'hours',
      sharedCapacityValue: 1,
      resourcePools: [
        {
          id: 'default-shared-pool',
          name: 'Shared Team',
          inputMode: 'hours',
          capacityValue: 1,
          avatarId: 'orbit',
          colorId: 'amber',
        },
      ],
      sharedNodeBudgetStateByNode: {
        'proc-1': {
          budgetDayKey: 0,
          dailyBudgetMinutes: 60,
          remainingBudgetMinutes: 10,
          consumedBudgetMinutes: 50,
          budgetExhausted: true,
        },
      },
    });

    render(
      <ProcessNode
        id={node.id}
        data={node.data as any}
        type={node.type}
        selected={false}
        isConnectable
        xPos={0}
        yPos={0}
        zIndex={0}
        dragging={false}
      />,
    );

    expect(
      screen.getByTitle('Daily shared capacity is used up. New items wait until the next working day.'),
    ).toBeInTheDocument();
  });

  it('shows the warning triangle when incoming work is blocked at a downstream node', () => {
    const node = {
      id: 'proc-1',
      type: 'processNode' as const,
      position: { x: 0, y: 0 },
      data: {
        label: 'Review',
        processingTime: 10,
        resources: 1,
        quality: 1,
        variability: 0,
        stats: { processed: 0, failed: 0, maxQueue: 0 },
        routingWeights: {},
        flowMode: 'pull' as const,
      },
    };

    const blockedCountsByTarget = new Map<string, number>();
    blockedCountsByTarget.set('proc-1', 2);

    resetUiStore({
      nodes: [node] as any,
      blockedCountsByTarget,
    });

    render(
      <ProcessNode
        id={node.id}
        data={node.data as any}
        type={node.type}
        selected={false}
        isConnectable
        xPos={0}
        yPos={0}
        zIndex={0}
        dragging={false}
      />,
    );

    expect(
      screen.getByTitle('Incoming items are blocked because this node is waiting for available staff.'),
    ).toBeInTheDocument();
  });

  it('shows both people and equipment limits when an equipment pool is configured', () => {
    const node = {
      id: 'proc-1',
      type: 'processNode' as const,
      position: { x: 0, y: 0 },
      data: {
        label: 'Styling',
        processingTime: 30,
        resources: 6,
        quality: 1,
        variability: 0,
        stats: { processed: 0, failed: 0, maxQueue: 0 },
        routingWeights: {},
        assetPoolId: 'chairs',
      },
    };

    resetUiStore({
      nodes: [node] as any,
      assetPools: [{ id: 'chairs', name: 'Chairs', units: 4 }],
    });

    render(
      <ProcessNode
        id={node.id}
        data={node.data as any}
        type={node.type}
        selected={false}
        isConnectable
        xPos={0}
        yPos={0}
        zIndex={0}
        dragging={false}
      />,
    );

    expect(screen.getByTitle('People capacity limit')).toHaveTextContent('6');
    expect(screen.getByTitle('Chairs equipment units')).toHaveTextContent('4');
    expect(screen.getByText('0/4')).toBeInTheDocument();
  });

  it('shows an equipment-specific warning when equipment is the blocking constraint', () => {
    const node = {
      id: 'proc-1',
      type: 'processNode' as const,
      position: { x: 0, y: 0 },
      data: {
        label: 'Styling',
        processingTime: 30,
        resources: 4,
        quality: 1,
        variability: 0,
        stats: { processed: 0, failed: 0, maxQueue: 0 },
        routingWeights: {},
        assetPoolId: 'chairs',
      },
    };
    const items = [
      {
        id: 'item-1',
        currentNodeId: 'proc-1',
        status: 'PROCESSING',
        handoffTargetNodeId: null,
        progress: 50,
        remainingTime: 10,
        processingDuration: 20,
        totalTime: 20,
        nodeEnterTick: 0,
        metricsEpoch: 0,
        spawnTick: 0,
        completionTick: null,
        terminalNodeId: null,
        timeActive: 10,
        timeWaiting: 0,
        nodeLeadTime: 10,
      },
      {
        id: 'item-2',
        currentNodeId: 'proc-1',
        status: 'PROCESSING',
        handoffTargetNodeId: null,
        progress: 50,
        remainingTime: 10,
        processingDuration: 20,
        totalTime: 20,
        nodeEnterTick: 0,
        metricsEpoch: 0,
        spawnTick: 0,
        completionTick: null,
        terminalNodeId: null,
        timeActive: 10,
        timeWaiting: 0,
        nodeLeadTime: 10,
      },
      {
        id: 'item-3',
        currentNodeId: 'proc-1',
        status: 'QUEUED',
        handoffTargetNodeId: null,
        progress: 0,
        remainingTime: 0,
        processingDuration: 0,
        totalTime: 0,
        nodeEnterTick: 5,
        metricsEpoch: 0,
        spawnTick: 5,
        completionTick: null,
        terminalNodeId: null,
        timeActive: 0,
        timeWaiting: 5,
        nodeLeadTime: 5,
      },
    ] as any;

    resetUiStore({
      nodes: [node] as any,
      assetPools: [{ id: 'chairs', name: 'Chairs', units: 2 }],
      itemsByNode: new Map([['proc-1', items]]),
    });

    render(
      <ProcessNode
        id={node.id}
        data={node.data as any}
        type={node.type}
        selected={false}
        isConnectable
        xPos={0}
        yPos={0}
        zIndex={0}
        dragging={false}
      />,
    );

    expect(
      screen.getByTitle('Node is waiting for available equipment.'),
    ).toBeInTheDocument();
  });
});
