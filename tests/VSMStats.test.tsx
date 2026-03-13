import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

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

import VSMStats from '../components/VSMStats';
import { createCompletedItem, resetUiStore } from './componentTestUtils';

describe('VSMStats', () => {
  beforeEach(() => {
    resetUiStore();
  });

  it('renders derived metrics from store state and opens analytics', () => {
    const onOpenAnalytics = vi.fn();

    resetUiStore({
      items: [
        createCompletedItem({
          id: 'item-1',
          spawnTick: 0,
          completionTick: 80,
          totalTime: 80,
          timeActive: 40,
          timeWaiting: 20,
          nodeLeadTime: 60,
        }),
        createCompletedItem({
          id: 'item-2',
          spawnTick: 100,
          completionTick: 260,
          totalTime: 160,
          timeActive: 60,
          timeWaiting: 60,
          nodeLeadTime: 120,
        }),
      ],
      throughput: 2.5,
      metricsWindowCompletions: 25,
      itemCounts: {
        wip: 3,
        completed: 2,
        failed: 0,
        queued: 1,
        processing: 1,
        stuck: 1,
      },
    });

    render(<VSMStats onOpenAnalytics={onOpenAnalytics} />);

    expect(screen.getByText('VSM Metrics')).toBeInTheDocument();
    expect(screen.getByText('55.6%')).toBeInTheDocument();
    expect(screen.getByText('1h 30m')).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
    expect(screen.getByText('Q 1 · P 1 · S 1')).toBeInTheDocument();
    expect(screen.getByText('0.4/h')).toBeInTheDocument();
    expect(screen.getByText('Elapsed 0.3/h')).toBeInTheDocument();
    expect(screen.getByText(/Throughput:/)).toHaveTextContent('Throughput: 2.5 items/hr');
    expect(screen.getAllByTitle('Low sample size (n=2). Window: last 25 completions')).not.toHaveLength(0);

    fireEvent.click(screen.getByTitle('View Detailed Analytics'));
    expect(onOpenAnalytics).toHaveBeenCalledTimes(1);
  });

  it('renders zeroed values when there are no completed items', () => {
    render(<VSMStats />);

    expect(screen.getByText('0.0%')).toBeInTheDocument();
    expect(screen.getAllByText('0m')).not.toHaveLength(0);
    expect(screen.getByText('0.0/h')).toBeInTheDocument();
    expect(screen.getByText(/n=0/)).toBeInTheDocument();
    expect(screen.getAllByTitle('Low sample size (n=0). Window: last 50 completions')).not.toHaveLength(0);
  });
});
