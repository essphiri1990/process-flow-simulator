import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

import Controls from '../components/Controls';
import { resetUiStore } from './componentTestUtils';

const baseNodes = [
  {
    id: 'start-1',
    type: 'startNode' as const,
    position: { x: 0, y: 0 },
    data: {
      label: 'Start',
      processingTime: 2,
      resources: 1,
      quality: 1,
      variability: 0,
      stats: { processed: 0, failed: 0, maxQueue: 0 },
      routingWeights: {},
      sourceConfig: { enabled: false, interval: 20, batchSize: 1 },
    },
  },
  {
    id: 'proc-1',
    type: 'processNode' as const,
    position: { x: 200, y: 0 },
    data: {
      label: 'Review',
      processingTime: 10,
      resources: 2,
      quality: 1,
      variability: 0,
      stats: { processed: 0, failed: 0, maxQueue: 0 },
      routingWeights: {},
    },
  },
  {
    id: 'end-1',
    type: 'endNode' as const,
    position: { x: 400, y: 0 },
    data: {
      label: 'Done',
      processingTime: 0,
      resources: 999,
      quality: 1,
      variability: 0,
      stats: { processed: 0, failed: 0, maxQueue: 0 },
      routingWeights: {},
    },
  },
];

const baseItems = [
  {
    id: 'global-1',
    currentNodeId: null,
    status: 'COMPLETED',
    progress: 100,
    remainingTime: 0,
    processingDuration: 60,
    totalTime: 60,
    nodeEnterTick: 0,
    metricsEpoch: 0,
    spawnTick: 0,
    completionTick: 60,
    terminalNodeId: 'end-1',
    timeActive: 60,
    timeWaiting: 0,
    nodeLeadTime: 60,
  },
  {
    id: 'global-2',
    currentNodeId: null,
    status: 'COMPLETED',
    progress: 100,
    remainingTime: 0,
    processingDuration: 60,
    totalTime: 120,
    nodeEnterTick: 0,
    metricsEpoch: 0,
    spawnTick: 0,
    completionTick: 120,
    terminalNodeId: 'end-1',
    timeActive: 60,
    timeWaiting: 0,
    nodeLeadTime: 60,
  },
];

const setupControlsState = () => {
  const itemsByNode = new Map<string, any[]>([
    [
      'start-1',
      [
        {
          id: 'start-q',
          currentNodeId: 'start-1',
          status: 'QUEUED',
          progress: 0,
          remainingTime: 0,
          processingDuration: 0,
          totalTime: 0,
          nodeEnterTick: 0,
          metricsEpoch: 0,
          spawnTick: 0,
          completionTick: null,
          terminalNodeId: null,
          timeActive: 0,
          timeWaiting: 0,
          nodeLeadTime: 0,
        },
      ],
    ],
    [
      'proc-1',
      [
        {
          id: 'proc-q',
          currentNodeId: 'proc-1',
          status: 'QUEUED',
          progress: 0,
          remainingTime: 0,
          processingDuration: 0,
          totalTime: 0,
          nodeEnterTick: 0,
          metricsEpoch: 0,
          spawnTick: 0,
          completionTick: null,
          terminalNodeId: null,
          timeActive: 0,
          timeWaiting: 0,
          nodeLeadTime: 0,
        },
        {
          id: 'proc-p',
          currentNodeId: 'proc-1',
          status: 'PROCESSING',
          progress: 50,
          remainingTime: 5,
          processingDuration: 10,
          totalTime: 5,
          nodeEnterTick: 0,
          metricsEpoch: 0,
          spawnTick: 0,
          completionTick: null,
          terminalNodeId: null,
          timeActive: 5,
          timeWaiting: 0,
          nodeLeadTime: 5,
        },
      ],
    ],
  ]);

  resetUiStore({
    nodes: baseNodes as any,
    items: baseItems as any,
    itemsByNode,
    displayTickCount: 120,
    demandUnit: 'day',
    itemCounts: {
      wip: 3,
      completed: 2,
      failed: 0,
      queued: 2,
      processing: 1,
      stuck: 0,
    },
    nodeStageMetricsHistoryByNode: {
      'start-1': [
        { nodeId: 'start-1', completionTick: 15, leadTicks: 10, valueAddedTicks: 10, waitingTicks: 0, metricsEpoch: 0 },
        { nodeId: 'start-1', completionTick: 25, leadTicks: 20, valueAddedTicks: 10, waitingTicks: 10, metricsEpoch: 0 },
      ],
      'proc-1': [
        { nodeId: 'proc-1', completionTick: 10, leadTicks: 20, valueAddedTicks: 10, waitingTicks: 10, metricsEpoch: 0 },
        { nodeId: 'proc-1', completionTick: 20, leadTicks: 40, valueAddedTicks: 20, waitingTicks: 20, metricsEpoch: 0 },
      ],
    },
    nodeUtilizationHistoryByNode: {
      'start-1': [{ tick: 0, busyResourceTicks: 1, availableResourceTicks: 2 }],
      'proc-1': [{ tick: 0, busyResourceTicks: 2, availableResourceTicks: 5 }],
    },
  });
};

describe('Controls node focus mode', () => {
  beforeEach(() => {
    resetUiStore();
    setupControlsState();
  });

  it('shows selected-node metrics for a process node while keeping the global clock', () => {
    render(
      <Controls
        selectedNodeId="proc-1"
        onEditNode={vi.fn()}
        onOpenAnalytics={vi.fn()}
        onClearSelection={vi.fn()}
      />,
    );

    expect(screen.getByText('Stage: Review')).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
    expect(screen.getByTitle('Node: Review · Q 1 · P 1')).toHaveTextContent('2');
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByTitle(/Lead: 30m/)).toHaveTextContent('30m');
    expect(screen.getByTitle(/Throughput: 6.0\/h/)).toHaveTextContent('6.0/h');
    expect(
      screen.getByTitle('Rolling utilisation for node Review across the recent simulated hour.'),
    ).toHaveTextContent('40%');
  });

  it('shows node metrics for a start node selection', () => {
    render(
      <Controls
        selectedNodeId="start-1"
        onEditNode={vi.fn()}
        onOpenAnalytics={vi.fn()}
        onClearSelection={vi.fn()}
      />,
    );

    expect(screen.getByText('Stage: Start')).toBeInTheDocument();
    expect(screen.getByTitle('Node: Start · Q 1 · P 0')).toHaveTextContent('1');
    expect(screen.getByTitle(/Lead: 15m/)).toHaveTextContent('15m');
  });

  it('returns to the global toolbar view when focus is cleared', () => {
    const Harness = () => {
      const [selectedId, setSelectedId] = useState<string | null>('proc-1');
      return (
        <Controls
          selectedNodeId={selectedId}
          onEditNode={vi.fn()}
          onOpenAnalytics={vi.fn()}
          onClearSelection={() => setSelectedId(null)}
        />
      );
    };

    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Return to global metrics' }));

    expect(screen.queryByText('Stage: Review')).not.toBeInTheDocument();
    expect(screen.getByTitle('Q 2 · P 1 · S 0')).toHaveTextContent('3');
    expect(screen.getByTitle(/Lead: 1h/)).toHaveTextContent('1h');
  });

  it('keeps the global metrics view for an end node selection', () => {
    render(
      <Controls
        selectedNodeId="end-1"
        onEditNode={vi.fn()}
        onOpenAnalytics={vi.fn()}
        onClearSelection={vi.fn()}
      />,
    );

    expect(screen.queryByText('Stage: Done')).not.toBeInTheDocument();
    expect(screen.getByTitle('Q 2 · P 1 · S 0')).toHaveTextContent('3');
    expect(screen.getByTitle(/Lead: 1h/)).toHaveTextContent('1h');
  });
});
