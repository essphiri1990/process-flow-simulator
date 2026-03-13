import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('reactflow', () => ({
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

import SharedResourcesCard from '../components/SharedResourcesCard';
import { resetUiStore } from './componentTestUtils';

const sharedNodes = [
  {
    id: 'proc-1',
    type: 'processNode' as const,
    position: { x: 0, y: 0 },
    data: {
      label: 'Review',
      processingTime: 30,
      resources: 2,
      allocationPercent: 50,
      resourcePoolId: 'pool-a',
      quality: 1,
      variability: 0,
      stats: { processed: 0, failed: 0, maxQueue: 0 },
      routingWeights: {},
    },
  },
  {
    id: 'proc-2',
    type: 'processNode' as const,
    position: { x: 200, y: 0 },
    data: {
      label: 'Deploy',
      processingTime: 30,
      resources: 1,
      allocationPercent: 100,
      resourcePoolId: 'pool-b',
      quality: 1,
      variability: 0,
      stats: { processed: 0, failed: 0, maxQueue: 0 },
      routingWeights: {},
    },
  },
];

const sharedResourcePools = [
  {
    id: 'pool-a',
    name: 'Alpha Team',
    inputMode: 'hours' as const,
    capacityValue: 8,
    avatarId: 'orbit' as const,
    colorId: 'amber' as const,
  },
  {
    id: 'pool-b',
    name: 'Beta Team',
    inputMode: 'hours' as const,
    capacityValue: 4,
    avatarId: 'wave' as const,
    colorId: 'sky' as const,
  },
];

describe('SharedResourcesCard node focus mode', () => {
  beforeEach(() => {
    resetUiStore();
  });

  it('replaces the pool list with one focused shared-allocation card that shows remaining time today', () => {
    resetUiStore({
      capacityMode: 'sharedAllocation',
      nodes: sharedNodes as any,
      resourcePools: sharedResourcePools,
      sharedCapacityInputMode: 'hours',
      sharedCapacityValue: 8,
      itemsByNode: new Map([
        [
          'proc-1',
          [
            { id: 'queued', currentNodeId: 'proc-1', status: 'QUEUED' },
            { id: 'processing', currentNodeId: 'proc-1', status: 'PROCESSING' },
          ],
        ],
      ]) as any,
      nodeUtilizationHistoryByNode: {
        'proc-1': [{ tick: 0, busyResourceTicks: 2, availableResourceTicks: 4 }],
      },
      sharedNodeBudgetStateByNode: {
        'proc-1': {
          budgetDayKey: 0,
          dailyBudgetMinutes: 240,
          remainingBudgetMinutes: 120,
          consumedBudgetMinutes: 120,
          budgetExhausted: false,
        },
        'proc-2': {
          budgetDayKey: 0,
          dailyBudgetMinutes: 240,
          remainingBudgetMinutes: 180,
          consumedBudgetMinutes: 60,
          budgetExhausted: false,
        },
      },
    });

    render(<SharedResourcesCard selectedNodeId="proc-1" />);

    expect(screen.getByText('Node Resources')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Remaining today')).toBeInTheDocument();
    expect(screen.getAllByText('2.0h').length).toBeGreaterThan(0);
    expect(screen.getByText('FTE alloc')).toBeInTheDocument();
    expect(screen.getByText('0.5 FTE')).toBeInTheDocument();
    expect(screen.getByText('Alpha Team')).toBeInTheDocument();
    expect(screen.queryByText('Beta Team')).not.toBeInTheDocument();
  });

  it('shows the minimal local-capacity card for a selected work node', () => {
    resetUiStore({
      capacityMode: 'local',
      nodes: [
        {
          id: 'proc-1',
          type: 'processNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Review',
            processingTime: 30,
            resources: 3,
            quality: 1,
            variability: 0,
            stats: { processed: 0, failed: 0, maxQueue: 0 },
            routingWeights: {},
          },
        },
      ] as any,
      itemsByNode: new Map([
        [
          'proc-1',
          [
            { id: 'queued', currentNodeId: 'proc-1', status: 'QUEUED' },
            { id: 'processing', currentNodeId: 'proc-1', status: 'PROCESSING' },
          ],
        ],
      ]) as any,
    });

    render(<SharedResourcesCard selectedNodeId="proc-1" />);

    expect(screen.getByText('Node Resources')).toBeInTheDocument();
    expect(screen.getByText('Local mode - no daily budget tracking')).toBeInTheDocument();
    expect(screen.getByText('Capacity limit')).toBeInTheDocument();
    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
  });

  it('restores the global pool list when selection is cleared', () => {
    resetUiStore({
      capacityMode: 'sharedAllocation',
      nodes: sharedNodes as any,
      resourcePools: sharedResourcePools,
      sharedCapacityInputMode: 'hours',
      sharedCapacityValue: 8,
      sharedNodeBudgetStateByNode: {
        'proc-1': {
          budgetDayKey: 0,
          dailyBudgetMinutes: 240,
          remainingBudgetMinutes: 120,
          consumedBudgetMinutes: 120,
          budgetExhausted: false,
        },
        'proc-2': {
          budgetDayKey: 0,
          dailyBudgetMinutes: 240,
          remainingBudgetMinutes: 180,
          consumedBudgetMinutes: 60,
          budgetExhausted: false,
        },
      },
    });

    const { rerender } = render(<SharedResourcesCard selectedNodeId="proc-1" />);
    expect(screen.queryByText('Beta Team')).not.toBeInTheDocument();

    rerender(<SharedResourcesCard selectedNodeId={null} />);

    expect(screen.getByText('Resources · Day')).toBeInTheDocument();
    expect(screen.getByText('Alpha Team')).toBeInTheDocument();
    expect(screen.getByText('Beta Team')).toBeInTheDocument();
  });

  it('keeps the card hidden while selection changes and updates the button label by mode', () => {
    resetUiStore({
      capacityMode: 'sharedAllocation',
      nodes: sharedNodes as any,
      resourcePools: sharedResourcePools,
      sharedCapacityInputMode: 'hours',
      sharedCapacityValue: 8,
      showSharedResourcesCard: false,
    });

    const { rerender } = render(<SharedResourcesCard selectedNodeId="proc-1" />);
    expect(screen.getByRole('button', { name: /Node Resources/i })).toBeInTheDocument();

    rerender(<SharedResourcesCard selectedNodeId={null} />);
    expect(screen.getByRole('button', { name: /Shared Resources/i })).toBeInTheDocument();
  });
});
