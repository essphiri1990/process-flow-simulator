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
});
