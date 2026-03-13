import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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

import SunMoonCycle from '../components/SunMoonCycle';
import { resetUiStore } from './componentTestUtils';

describe('SunMoonCycle', () => {
  beforeEach(() => {
    resetUiStore();
  });

  it('renders current workday progress and bounded run progress from store state', () => {
    resetUiStore({
      displayTickCount: 120,
      isRunning: false,
      simulationProgress: 42,
      targetDuration: 480,
    });

    const { container } = render(<SunMoonCycle />);

    expect(screen.getByTitle('Workday progress: 25%')).toBeInTheDocument();
    expect(screen.getByText('Simulation Progress')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(container.querySelector('div[style="width: 42%;"]')).not.toBeNull();
  });

  it('shows unlimited duration without a filled progress bar', () => {
    resetUiStore({
      displayTickCount: 0,
      isRunning: true,
      simulationProgress: 88,
      targetDuration: Infinity,
    });

    const { container } = render(<SunMoonCycle />);

    expect(screen.getByTitle('Workday progress: 0%')).toBeInTheDocument();
    expect(screen.getByText('--')).toBeInTheDocument();
    expect(container.querySelector('div[style="width: 0%;"]')).not.toBeNull();
  });
});
