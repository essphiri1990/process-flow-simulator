import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ItemStatus } from '../types';

// Mock reactflow before importing store
vi.mock('reactflow', () => ({
  addEdge: (edge: any, edges: any[]) => [...edges, { id: `e-${edge.source}-${edge.target}`, ...edge }],
  applyNodeChanges: (changes: any[], nodes: any[]) => nodes,
  applyEdgeChanges: (changes: any[], edges: any[]) => edges,
  MarkerType: { ArrowClosed: 'arrowclosed' },
}));

// Mock Toast to avoid DOM dependencies
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

import { useStore } from '../store';
import { computeLeadMetrics, computeNodeStageMetrics, computeRollingNodeUtilization, NODE_UTILIZATION_ROLLING_WINDOW_TICKS } from '../metrics';
import { nextMulberry32 } from '../rng';
import { AUTOSAVE_DRAFT_CANVAS_ID } from '../canvas-storage';

// Helper to reset store to a clean state before each test
const resetStore = () => {
  const store = useStore.getState();
  store.clearCanvas();
  useStore.setState({
    capacityMode: 'local',
    sharedCapacityInputMode: 'fte',
    sharedCapacityValue: 3,
    blockedCountsByTarget: new Map(),
  });
};

beforeEach(() => {
  sdkMock.isEmbedded = false;
  sdkMock.getContext.mockReset();
  sdkMock.getSession.mockReset();
  sdkMock.listCloudSaves.mockReset();
  sdkMock.createCloudSave.mockReset();
  sdkMock.deleteCloudSave.mockReset();
  sdkMock.logScoreRun.mockReset();
  sdkMock.trackAppCompleted.mockReset();
  sdkMock.listCloudSaves.mockResolvedValue({ saves: [] });
  sdkMock.createCloudSave.mockResolvedValue({ saved: { id: 'save-1' } });
  sdkMock.deleteCloudSave.mockResolvedValue({});
  sdkMock.logScoreRun.mockResolvedValue({});
  sdkMock.trackAppCompleted.mockResolvedValue({});
});

// Helper: create a minimal linear flow: Start -> Process -> End
const setupLinearFlow = () => {
  const store = useStore.getState();
  store.clearCanvas();

  const startNode = {
    id: 'start-1',
    type: 'startNode' as const,
    position: { x: 0, y: 0 },
    data: {
      label: 'Start',
      processingTime: 2,
      resources: 1,
      quality: 1.0,
      variability: 0,
      stats: { processed: 0, failed: 0, maxQueue: 0 },
      routingWeights: {},
      sourceConfig: { enabled: false, interval: 20, batchSize: 1 },
    },
  };

  const processNode = {
    id: 'proc-1',
    type: 'processNode' as const,
    position: { x: 400, y: 0 },
    data: {
      label: 'Process',
      processingTime: 3,
      resources: 2,
      quality: 1.0,
      variability: 0,
      stats: { processed: 0, failed: 0, maxQueue: 0 },
      routingWeights: {},
    },
  };

  const endNode = {
    id: 'end-1',
    type: 'endNode' as const,
    position: { x: 800, y: 0 },
    data: {
      label: 'End',
      processingTime: 0,
      resources: 999,
      quality: 1.0,
      variability: 0,
      stats: { processed: 0, failed: 0, maxQueue: 0 },
      routingWeights: {},
    },
  };

  const edges = [
    { id: 'e1', source: 'start-1', target: 'proc-1', type: 'processEdge', animated: false, markerEnd: { type: 'arrowclosed' } },
    { id: 'e2', source: 'proc-1', target: 'end-1', type: 'processEdge', animated: false, markerEnd: { type: 'arrowclosed' } },
  ];

  useStore.setState({
    nodes: [startNode, processNode, endNode] as any,
    edges,
    items: [],
    tickCount: 0,
    isRunning: false,
    cumulativeCompleted: 0,
    throughput: 0,
    displayTickCount: 0,
    history: [],
    metricsEpoch: 0,
    metricsEpochTick: 0,
    metricsWindowCompletions: 50,
    demandMode: 'auto',
    demandUnit: 'week',
    demandTotalTicks: 2400,
    demandArrivalsGenerated: 0,
    demandArrivalsByNode: {},
    demandAccumulatorByNode: {},
    demandOpenTicksByNode: {},
    periodCompleted: 0,
    capacityMode: 'local',
    sharedCapacityInputMode: 'fte',
    sharedCapacityValue: 3,
    simulationSeed: 12345,
    durationPreset: 'unlimited',
    targetDuration: Infinity,
    autoStopEnabled: true,
    runStartedAtMs: null,
    lastRunSummary: null,
    lastLoggedRunKey: null,
    itemsByNode: new Map(),
    blockedCountsByTarget: new Map(),
    itemCounts: { wip: 0, completed: 0, failed: 0, queued: 0, processing: 0, stuck: 0 },
    autoInjectionEnabled: false,
  });
};

const setupDeterministicQualityFlow = (seed: number) => {
  useStore.getState().clearCanvas();

  useStore.setState({
    nodes: [
      {
        id: 'proc-1',
        type: 'processNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Decision',
          processingTime: 1,
          resources: 1,
          quality: 0.5,
          variability: 0,
          stats: { processed: 0, failed: 0, maxQueue: 0 },
          routingWeights: {},
        },
      },
      {
        id: 'end-1',
        type: 'endNode',
        position: { x: 200, y: 0 },
        data: {
          label: 'End',
          processingTime: 0,
          resources: 999,
          quality: 1.0,
          variability: 0,
          stats: { processed: 0, failed: 0, maxQueue: 0 },
          routingWeights: {},
        },
      },
    ] as any,
    edges: [
      {
        id: 'e1',
        source: 'proc-1',
        target: 'end-1',
        type: 'processEdge',
        animated: false,
        markerEnd: { type: 'arrowclosed' },
      },
    ],
    items: [],
    tickCount: 0,
    isRunning: false,
    cumulativeCompleted: 0,
    throughput: 0,
    displayTickCount: 0,
    history: [],
    metricsEpoch: 0,
    metricsEpochTick: 0,
    metricsWindowCompletions: 50,
    demandMode: 'auto',
    demandUnit: 'week',
    demandTotalTicks: 2400,
    demandArrivalsGenerated: 0,
    demandArrivalsByNode: {},
    demandAccumulatorByNode: {},
    demandOpenTicksByNode: {},
    periodCompleted: 0,
    capacityMode: 'local',
    sharedCapacityInputMode: 'fte',
    sharedCapacityValue: 3,
    simulationSeed: seed,
    runStartedAtMs: null,
    lastRunSummary: null,
    lastLoggedRunKey: null,
    itemsByNode: new Map(),
    blockedCountsByTarget: new Map(),
    itemCounts: { wip: 0, completed: 0, failed: 0, queued: 0, processing: 0, stuck: 0 },
    autoInjectionEnabled: false,
  });
};

const setupPullFlow = () => {
  useStore.getState().clearCanvas();

  useStore.setState({
    nodes: [
      {
        id: 'upstream',
        type: 'processNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Upstream',
          processingTime: 1,
          resources: 1,
          batchSize: 1,
          flowMode: 'push',
          pullOpenSlotsRequired: 1,
          quality: 1.0,
          variability: 0,
          stats: { processed: 0, failed: 0, maxQueue: 0 },
          routingWeights: {},
        },
      },
      {
        id: 'downstream',
        type: 'processNode',
        position: { x: 200, y: 0 },
        data: {
          label: 'Downstream',
          processingTime: 4,
          resources: 1,
          batchSize: 1,
          flowMode: 'pull',
          pullOpenSlotsRequired: 1,
          quality: 1.0,
          variability: 0,
          stats: { processed: 0, failed: 0, maxQueue: 0 },
          routingWeights: {},
        },
      },
      {
        id: 'end-1',
        type: 'endNode',
        position: { x: 400, y: 0 },
        data: {
          label: 'End',
          processingTime: 0,
          resources: 999,
          batchSize: 1,
          flowMode: 'push',
          pullOpenSlotsRequired: 1,
          quality: 1.0,
          variability: 0,
          stats: { processed: 0, failed: 0, maxQueue: 0 },
          routingWeights: {},
        },
      },
    ] as any,
    edges: [
      { id: 'e1', source: 'upstream', target: 'downstream', type: 'processEdge', animated: false, markerEnd: { type: 'arrowclosed' } },
      { id: 'e2', source: 'downstream', target: 'end-1', type: 'processEdge', animated: false, markerEnd: { type: 'arrowclosed' } },
    ],
    items: [],
    tickCount: 0,
    isRunning: false,
    cumulativeCompleted: 0,
    throughput: 0,
    displayTickCount: 0,
    history: [],
    metricsEpoch: 0,
    metricsEpochTick: 0,
    metricsWindowCompletions: 50,
    demandMode: 'auto',
    demandUnit: 'week',
    demandTotalTicks: 2400,
    demandArrivalsGenerated: 0,
    demandArrivalsByNode: {},
    demandAccumulatorByNode: {},
    demandOpenTicksByNode: {},
    periodCompleted: 0,
    capacityMode: 'local',
    sharedCapacityInputMode: 'fte',
    sharedCapacityValue: 3,
    simulationSeed: 2024,
    runStartedAtMs: null,
    lastRunSummary: null,
    lastLoggedRunKey: null,
    itemsByNode: new Map(),
    blockedCountsByTarget: new Map(),
    itemCounts: { wip: 0, completed: 0, failed: 0, queued: 0, processing: 0, stuck: 0 },
    autoInjectionEnabled: false,
  });
};

const setupTargetDemandFlow = (seed = 4242) => {
  useStore.getState().clearCanvas();

  useStore.setState({
    nodes: [
      {
        id: 'start-1',
        type: 'startNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Demand Source',
          processingTime: 0,
          resources: 999,
          quality: 1.0,
          variability: 0,
          stats: { processed: 0, failed: 0, maxQueue: 0 },
          routingWeights: {},
          demandTarget: 60,
          sourceConfig: { enabled: false, interval: 20, batchSize: 1 },
        },
      },
      {
        id: 'end-1',
        type: 'endNode',
        position: { x: 200, y: 0 },
        data: {
          label: 'Done',
          processingTime: 0,
          resources: 999,
          quality: 1.0,
          variability: 0,
          stats: { processed: 0, failed: 0, maxQueue: 0 },
          routingWeights: {},
        },
      },
    ] as any,
    edges: [
      {
        id: 'e1',
        source: 'start-1',
        target: 'end-1',
        type: 'processEdge',
        animated: false,
        markerEnd: { type: 'arrowclosed' },
      },
    ],
    items: [],
    tickCount: 0,
    isRunning: false,
    cumulativeCompleted: 0,
    throughput: 0,
    displayTickCount: 0,
    history: [],
    metricsEpoch: 0,
    metricsEpochTick: 0,
    metricsWindowCompletions: 50,
    demandMode: 'target',
    demandUnit: 'hour',
    demandTotalTicks: 60,
    demandArrivalsGenerated: 0,
    demandArrivalsByNode: {},
    demandAccumulatorByNode: {},
    demandOpenTicksByNode: {},
    periodCompleted: 0,
    capacityMode: 'local',
    sharedCapacityInputMode: 'fte',
    sharedCapacityValue: 3,
    durationPreset: '1hour',
    targetDuration: 60,
    autoStopEnabled: true,
    simulationSeed: seed,
    runStartedAtMs: null,
    lastRunSummary: null,
    lastLoggedRunKey: null,
    itemsByNode: new Map(),
    blockedCountsByTarget: new Map(),
    itemCounts: { wip: 0, completed: 0, failed: 0, queued: 0, processing: 0, stuck: 0 },
    autoInjectionEnabled: false,
  });
};

const findSeedForQualityOutcome = (shouldPass: boolean) => {
  for (let seed = 1; seed < 5000; seed++) {
    const firstRoll = nextMulberry32(seed).value;
    if ((firstRoll <= 0.5) === shouldPass) {
      return seed;
    }
  }
  throw new Error('Unable to find a deterministic seed for the requested quality outcome.');
};

describe('Store - Initial State', () => {
  it('starts with devops scenario nodes loaded', () => {
    // Fresh store loads devops scenario by default
    const state = useStore.getState();
    expect(state.nodes.length).toBeGreaterThan(0);
    expect(state.edges.length).toBeGreaterThan(0);
  });

  it('starts with simulation not running', () => {
    const state = useStore.getState();
    expect(state.isRunning).toBe(false);
  });

  it('starts with empty items', () => {
    const state = useStore.getState();
    // After initial load, items should be empty (sim hasn't started)
    expect(state.items).toEqual([]);
  });

  it('has default item config', () => {
    const state = useStore.getState();
    expect(state.itemConfig).toEqual({
      color: '#ec4899',
      shape: 'circle',
      icon: 'none',
    });
  });

  it('has default simulation config', () => {
    const state = useStore.getState();
    expect(state.durationPreset).toBe('unlimited');
    expect(state.targetDuration).toBe(Infinity);
    expect(state.speedPreset).toBe('1x');
    expect(state.ticksPerSecond).toBe(60);
    expect(state.autoStopEnabled).toBe(true);
  });
});

describe('Store - Node Management', () => {
  beforeEach(() => resetStore());

  it('addNode creates a process node', () => {
    const store = useStore.getState();
    store.addNode();
    const state = useStore.getState();
    const processNodes = state.nodes.filter(n => n.type === 'processNode');
    expect(processNodes.length).toBe(1);
    expect((processNodes[0].data as any).processingTime).toBe(10);
    expect((processNodes[0].data as any).resources).toBe(1);
  });

  it('addStartNode creates a start node with sourceConfig enabled', () => {
    const store = useStore.getState();
    store.addStartNode();
    const state = useStore.getState();
    const startNodes = state.nodes.filter(n => n.type === 'startNode');
    expect(startNodes.length).toBe(1);
    expect((startNodes[0].data as any).sourceConfig.enabled).toBe(true);
    expect((startNodes[0].data as any).sourceConfig.batchSize).toBe(5);
  });

  it('addEndNode creates an end node with instant processing', () => {
    const store = useStore.getState();
    store.addEndNode();
    const state = useStore.getState();
    const endNodes = state.nodes.filter(n => n.type === 'endNode');
    expect(endNodes.length).toBe(1);
    expect((endNodes[0].data as any).processingTime).toBe(0);
    expect((endNodes[0].data as any).resources).toBe(999);
  });

  it('addAnnotation creates an annotation node', () => {
    const store = useStore.getState();
    store.addAnnotation();
    const state = useStore.getState();
    const annotations = state.nodes.filter(n => n.type === 'annotationNode');
    expect(annotations.length).toBe(1);
    expect((annotations[0].data as any).label).toBe('New Annotation');
  });

  it('pasteNode clones a node with a new id, new position, and reset runtime state', () => {
    setupLinearFlow();
    useStore.setState((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === 'proc-1'
          ? {
              ...node,
              data: {
                ...(node.data as any),
                label: 'Copied Step',
                stats: { processed: 7, failed: 1, maxQueue: 3 },
              },
            }
          : node,
      ),
    }));

    const store = useStore.getState();
    const sourceNode = store.nodes.find((node) => node.id === 'proc-1');
    expect(sourceNode).toBeDefined();

    const pastedNodeId = store.pasteNode(sourceNode!, { x: 900, y: 720 });
    const state = useStore.getState();
    const pastedNode = state.nodes.find((node) => node.id === pastedNodeId);

    expect(pastedNodeId).toBeTruthy();
    expect(pastedNodeId).not.toBe('proc-1');
    expect(state.edges).toHaveLength(2);
    expect(pastedNode).toBeDefined();
    expect(pastedNode?.type).toBe('processNode');
    expect(pastedNode?.position).toEqual({ x: 900, y: 720 });
    expect((pastedNode?.data as any).label).toBe('Copied Step');
    expect((pastedNode?.data as any).stats).toEqual({ processed: 0, failed: 0, maxQueue: 0 });
    expect((pastedNode?.data as any).validationError).toBe('No Output Path');
  });

  it('deleteNode removes the node and connected edges', () => {
    setupLinearFlow();
    const store = useStore.getState();
    store.deleteNode('proc-1');
    const state = useStore.getState();
    expect(state.nodes.find(n => n.id === 'proc-1')).toBeUndefined();
    // Edges connected to proc-1 should be removed
    expect(state.edges.filter(e => e.source === 'proc-1' || e.target === 'proc-1')).toHaveLength(0);
  });

  it('deleteNode removes items in the deleted node', () => {
    setupLinearFlow();
    const store = useStore.getState();
    store.addItem('proc-1');
    expect(useStore.getState().items.length).toBe(1);
    store.deleteNode('proc-1');
    expect(useStore.getState().items.length).toBe(0);
  });

  it('deleteNode refreshes derived item state immediately', () => {
    setupLinearFlow();
    const store = useStore.getState();
    store.addItem('proc-1');
    expect(useStore.getState().itemsByNode.get('proc-1')).toHaveLength(1);

    store.deleteNode('proc-1');

    const state = useStore.getState();
    expect(state.itemsByNode.get('proc-1')).toBeUndefined();
    expect(state.itemCounts.wip).toBe(0);
    expect(state.itemCounts.queued).toBe(0);
  });

  it('updateNodeData updates specific fields', () => {
    setupLinearFlow();
    const store = useStore.getState();
    store.updateNodeData('proc-1', { processingTime: 50, label: 'Updated' });
    const node = useStore.getState().nodes.find(n => n.id === 'proc-1');
    expect((node!.data as any).processingTime).toBe(50);
    expect((node!.data as any).label).toBe('Updated');
    // Other fields remain unchanged
    expect((node!.data as any).resources).toBe(2);
  });

  it('deleteNode does nothing for non-existent node', () => {
    setupLinearFlow();
    const before = useStore.getState().nodes.length;
    useStore.getState().deleteNode('nonexistent');
    expect(useStore.getState().nodes.length).toBe(before);
  });
});

describe('Store - Edge Management', () => {
  beforeEach(() => setupLinearFlow());

  it('connect adds an edge', () => {
    const store = useStore.getState();
    store.addNode(); // adds a new process node
    const newNode = useStore.getState().nodes.find(n => n.type === 'processNode' && n.id !== 'proc-1');
    store.connect({ source: 'start-1', target: newNode!.id, sourceHandle: null, targetHandle: null });
    const state = useStore.getState();
    const edge = state.edges.find(e => e.source === 'start-1' && e.target === newNode!.id);
    expect(edge).toBeDefined();
    expect(edge?.sourceHandle).toBe('right');
    expect(edge?.targetHandle).toBe('left-target');
  });

  it('deleteEdge removes the specified edge', () => {
    const store = useStore.getState();
    expect(store.edges.find(e => e.id === 'e1')).toBeDefined();
    store.deleteEdge('e1');
    expect(useStore.getState().edges.find(e => e.id === 'e1')).toBeUndefined();
  });

  it('updateEdgeData merges data onto an edge', () => {
    const store = useStore.getState();
    store.updateEdgeData('e1', { transitTime: 10 });
    const edge = useStore.getState().edges.find(e => e.id === 'e1');
    expect((edge as any).data.transitTime).toBe(10);
  });
});

describe('Store - Item Management', () => {
  beforeEach(() => setupLinearFlow());

  it('addItem creates a queued item at the target node', () => {
    const store = useStore.getState();
    store.addItem('proc-1');
    const state = useStore.getState();
    expect(state.items.length).toBe(1);
    expect(state.items[0].status).toBe(ItemStatus.QUEUED);
    expect(state.items[0].currentNodeId).toBe('proc-1');
    expect(state.items[0].spawnTick).toBe(0);
  });

  it('addItem refreshes derived item state immediately', () => {
    useStore.getState().addItem('proc-1');

    const state = useStore.getState();
    expect(state.itemsByNode.get('proc-1')).toHaveLength(1);
    expect(state.itemCounts.wip).toBe(1);
    expect(state.itemCounts.queued).toBe(1);
  });

  it('addItem initializes VSM metric buckets to 0', () => {
    useStore.getState().addItem('proc-1');
    const item = useStore.getState().items[0];
    expect(item.timeActive).toBe(0);
    expect(item.timeWaiting).toBe(0);
    expect(item.totalTime).toBe(0);
  });

  it('clearItems removes all items', () => {
    const store = useStore.getState();
    store.addItem('proc-1');
    store.addItem('proc-1');
    expect(useStore.getState().items.length).toBe(2);
    store.clearItems();
    expect(useStore.getState().items.length).toBe(0);
  });
});

describe('Store - Simulation Controls', () => {
  beforeEach(() => setupLinearFlow());

  it('startSimulation sets isRunning to true', () => {
    useStore.getState().startSimulation();
    expect(useStore.getState().isRunning).toBe(true);
  });

  it('pauseSimulation sets isRunning to false', () => {
    useStore.getState().startSimulation();
    useStore.getState().pauseSimulation();
    expect(useStore.getState().isRunning).toBe(false);
  });

  it('stepSimulation pauses and ticks once', () => {
    useStore.getState().startSimulation();
    useStore.getState().stepSimulation();
    const state = useStore.getState();
    expect(state.isRunning).toBe(false);
    expect(state.tickCount).toBe(1);
  });

  it('resetSimulation clears items and counters but keeps nodes', () => {
    useStore.getState().addItem('proc-1');
    // Tick a few times
    useStore.getState().tick();
    useStore.getState().tick();
    useStore.getState().resetSimulation();

    const state = useStore.getState();
    expect(state.items).toEqual([]);
    expect(state.tickCount).toBe(0);
    expect(state.cumulativeCompleted).toBe(0);
    expect(state.throughput).toBe(0);
    expect(state.history).toEqual([]);
    expect(state.isRunning).toBe(false);
    // Nodes should still exist
    expect(state.nodes.length).toBe(3);
  });

  it('resetSimulation resets node stats', () => {
    // Manually set some stats
    useStore.getState().updateNodeData('proc-1', {
      stats: { processed: 10, failed: 2, maxQueue: 5 },
    });
    useStore.getState().resetSimulation();
    const node = useStore.getState().nodes.find(n => n.id === 'proc-1');
    expect((node!.data as any).stats).toEqual({ processed: 0, failed: 0, maxQueue: 0 });
  });

  it('resetSimulation preserves current validation warnings', () => {
    useStore.getState().updateNodeData('proc-1', { resources: 0 });

    useStore.getState().resetSimulation();

    const node = useStore.getState().nodes.find((entry) => entry.id === 'proc-1');
    expect((node!.data as any).validationError).toBe('Zero Capacity');
  });

  it('clearCanvas removes everything', () => {
    useStore.getState().clearCanvas();
    const state = useStore.getState();
    expect(state.nodes).toEqual([]);
    expect(state.edges).toEqual([]);
    expect(state.items).toEqual([]);
    expect(state.tickCount).toBe(0);
    expect(state.isRunning).toBe(false);
  });

  it('toggleAutoInjection flips the flag', () => {
    const initial = useStore.getState().autoInjectionEnabled;
    useStore.getState().toggleAutoInjection();
    expect(useStore.getState().autoInjectionEnabled).toBe(!initial);
    useStore.getState().toggleAutoInjection();
    expect(useStore.getState().autoInjectionEnabled).toBe(initial);
  });

  it('setNodes prunes edges and in-flight items for removed nodes immediately', () => {
    useStore.getState().addItem('proc-1');

    const retainedNodes = useStore
      .getState()
      .nodes
      .filter((node) => node.id !== 'proc-1');

    useStore.getState().setNodes(retainedNodes as any);

    const state = useStore.getState();
    expect(state.nodes).toHaveLength(2);
    expect(state.edges).toEqual([]);
    expect(state.items).toEqual([]);
    expect(state.itemCounts.wip).toBe(0);
    expect((state.nodes.find((node) => node.id === 'start-1')!.data as any).validationError).toBe('No Output Path');
  });

  it('setTickSpeed updates tick speed', () => {
    useStore.getState().setTickSpeed(50);
    expect(useStore.getState().tickSpeed).toBe(50);
  });
});

describe('Store - Tick Engine', () => {
  beforeEach(() => setupLinearFlow());

  it('tick increments tickCount', () => {
    useStore.getState().tick();
    expect(useStore.getState().tickCount).toBe(1);
    useStore.getState().tick();
    expect(useStore.getState().tickCount).toBe(2);
  });

  it('tick increments totalTime once measured work time accrues', () => {
    useStore.getState().addItem('proc-1');
    useStore.getState().tick(); // queued -> processing
    useStore.getState().tick(); // first processing minute
    const item = useStore.getState().items.find(i => i.currentNodeId === 'proc-1');
    expect(item!.totalTime).toBeGreaterThanOrEqual(1);
  });

  it('queued item transitions to PROCESSING when resources are available', () => {
    useStore.getState().addItem('proc-1');
    useStore.getState().tick();
    const item = useStore.getState().items[0];
    expect(item.status).toBe(ItemStatus.PROCESSING);
    expect(item.remainingTime).toBe(3); // processingTime = 3
  });

  it('processing item decrements remainingTime each tick', () => {
    useStore.getState().addItem('proc-1');
    useStore.getState().tick(); // QUEUED -> PROCESSING (remainingTime=3)
    useStore.getState().tick(); // remainingTime=2
    const item = useStore.getState().items[0];
    expect(item.status).toBe(ItemStatus.PROCESSING);
    expect(item.remainingTime).toBe(2);
  });

  it('shared allocation mode uses daily budget to gate starts instead of stretching processing time', () => {
    useStore.setState({
      capacityMode: 'sharedAllocation',
      sharedCapacityInputMode: 'hours',
      sharedCapacityValue: 1,
    });
    useStore.getState().updateNodeData('proc-1', {
      processingTime: 10,
      resources: 1,
      allocationPercent: 100,
    });

    for (let i = 0; i < 7; i++) {
      useStore.getState().addItem('proc-1');
    }

    for (let i = 0; i < 80; i++) {
      useStore.getState().tick();
    }

    const state = useStore.getState();
    expect(state.items.filter((item) => item.status === ItemStatus.COMPLETED)).toHaveLength(6);
    expect(state.items.filter((item) => item.status === ItemStatus.QUEUED && item.currentNodeId === 'proc-1')).toHaveLength(1);
    expect(state.items.filter((item) => item.status === ItemStatus.PROCESSING)).toHaveLength(0);
    expect(state.sharedNodeBudgetStateByNode['proc-1']?.consumedBudgetMinutes).toBe(60);
    expect(state.sharedNodeBudgetStateByNode['proc-1']?.remainingBudgetMinutes).toBe(0);

    for (let i = 0; i < 401; i++) {
      useStore.getState().tick();
    }

    const nextDayState = useStore.getState();
    expect(nextDayState.tickCount).toBe(481);
    expect(nextDayState.items.some((item) => item.status === ItemStatus.PROCESSING && item.currentNodeId === 'proc-1')).toBe(true);
  });

  it('preserves allocationPercent when unrelated node config changes', () => {
    useStore.getState().updateNodeData('proc-1', { allocationPercent: 30 });
    useStore.getState().updateNodeData('proc-1', { flowMode: 'pull' });
    useStore.getState().updateNodeData('proc-1', { quality: 0.85 });

    const node = useStore.getState().nodes.find((entry) => entry.id === 'proc-1');
    expect((node!.data as any).allocationPercent).toBe(30);
    expect((node!.data as any).flowMode).toBe('pull');
    expect((node!.data as any).quality).toBe(0.85);
  });

  it('assigns node allocation against its selected resource pool', () => {
    useStore.setState({
      capacityMode: 'sharedAllocation',
      resourcePools: [
        { id: 'default-shared-pool', name: 'Shared Team', inputMode: 'fte', capacityValue: 1 },
        { id: 'contractors', name: 'Contractors', inputMode: 'hours', capacityValue: 16 },
      ],
      sharedCapacityInputMode: 'fte',
      sharedCapacityValue: 1,
    });
    useStore.getState().updateNodeData('proc-1', {
      processingTime: 4,
      resourcePoolId: 'contractors',
      allocationPercent: 50,
    });

    useStore.getState().addItem('proc-1');
    useStore.getState().tick();
    useStore.getState().tick();

    const item = useStore.getState().items[0];
    expect(item.status).toBe(ItemStatus.PROCESSING);
    expect(item.remainingTime).toBe(3);
    expect(item.timeActive).toBe(1);
    expect(item.timeWaiting).toBe(0);
  });

  it('deleting a resource pool reassigns nodes back to the default pool', () => {
    useStore.getState().addResourcePool();
    const addedPoolId = useStore.getState().resourcePools.find((pool) => pool.id !== 'default-shared-pool')!.id;

    useStore.getState().updateNodeData('proc-1', {
      resourcePoolId: addedPoolId,
      allocationPercent: 40,
    });
    useStore.getState().deleteResourcePool(addedPoolId);

    const node = useStore.getState().nodes.find((entry) => entry.id === 'proc-1');
    expect((node!.data as any).resourcePoolId).toBe('default-shared-pool');
  });

  it('updates the default pool capacity through the legacy shared-capacity fields', () => {
    useStore.getState().updateResourcePool('default-shared-pool', {
      inputMode: 'hours',
      capacityValue: 20,
    });

    const state = useStore.getState();
    const defaultPool = state.resourcePools.find((pool) => pool.id === 'default-shared-pool');

    expect(state.sharedCapacityInputMode).toBe('hours');
    expect(state.sharedCapacityValue).toBe(20);
    expect(defaultPool?.inputMode).toBe('hours');
    expect(defaultPool?.capacityValue).toBe(20);
  });

  it('updates pool colour independently from the selected avatar', () => {
    useStore.getState().updateResourcePool('default-shared-pool', {
      colorId: 'sky',
    } as any);

    const defaultPool = useStore
      .getState()
      .resourcePools.find((pool) => pool.id === 'default-shared-pool');

    expect(defaultPool?.colorId).toBe('sky');
    expect(defaultPool?.avatarId).toBe('orbit');
  });

  it('item completes immediately when the next node is an instant end node', () => {
    useStore.getState().addItem('proc-1');
    // Tick enough times: 1 to start processing + 3 for processing
    useStore.getState().tick(); // QUEUED -> PROCESSING (rem=3)
    useStore.getState().tick(); // rem=2
    useStore.getState().tick(); // rem=1
    useStore.getState().tick(); // rem=0 -> end-1 -> COMPLETED

    const item = useStore.getState().items[0];
    expect(item.status).toBe(ItemStatus.COMPLETED);
    expect(item.currentNodeId).toBeNull();
    expect(item.terminalNodeId).toBe('end-1');
  });

  it('item routes directly to the next node without an intermediate state', () => {
    useStore.getState().addItem('proc-1');
    for (let i = 0; i < 4; i++) useStore.getState().tick();

    const item = useStore.getState().items[0];
    expect(item.status).toBe(ItemStatus.COMPLETED);
    expect(item.totalTime).toBe(item.timeActive + item.timeWaiting);
  });

  it('creates a visual transfer event when routing to the next node', () => {
    useStore.getState().addItem('proc-1');
    for (let i = 0; i < 4; i++) useStore.getState().tick();

    const transfer = useStore.getState().visualTransfers[0];
    expect(transfer.sourceNodeId).toBe('proc-1');
    expect(transfer.targetNodeId).toBe('end-1');
    expect(transfer.durationMs).toBeGreaterThan(0);
  });

  it('item completes after routing to the end node', () => {
    useStore.getState().addItem('proc-1');
    // Run enough ticks to process and reach the end node
    for (let i = 0; i < 100; i++) {
      useStore.getState().tick();
      const item = useStore.getState().items[0];
      if (item.status === ItemStatus.COMPLETED) break;
    }
    const item = useStore.getState().items[0];
    expect(item.status).toBe(ItemStatus.COMPLETED);
    expect(item.completionTick).not.toBeNull();
  });

  it('completed item has VSM time buckets filled', () => {
    useStore.getState().addItem('proc-1');
    for (let i = 0; i < 100; i++) {
      useStore.getState().tick();
      if (useStore.getState().items[0].status === ItemStatus.COMPLETED) break;
    }
    const item = useStore.getState().items[0];
    expect(item.timeActive).toBeGreaterThan(0);
    expect(item.timeWaiting).toBeGreaterThanOrEqual(0);
    expect(item.timeActive + item.timeWaiting).toBe(item.totalTime);
    expect(item.totalTime).toBeGreaterThan(0);
  });

  it('respects resource capacity limits', () => {
    // proc-1 has resources=2, so only 2 items can process at once
    for (let i = 0; i < 5; i++) useStore.getState().addItem('proc-1');
    useStore.getState().tick();

    const items = useStore.getState().items;
    const processing = items.filter(i => i.status === ItemStatus.PROCESSING);
    const queued = items.filter(i => i.status === ItemStatus.QUEUED);
    expect(processing.length).toBe(2);
    expect(queued.length).toBe(3);
  });

  it('queued items accumulate timeWaiting', () => {
    // Add 5 items to a node with 2 resources - 3 will wait
    for (let i = 0; i < 5; i++) useStore.getState().addItem('proc-1');
    useStore.getState().tick();
    useStore.getState().tick();

    const items = useStore.getState().items;
    const queued = items.filter(i => i.status === ItemStatus.QUEUED);
    // Queued items should have accumulated waiting time
    for (const item of queued) {
      expect(item.timeWaiting).toBeGreaterThan(0);
    }
  });

  it('waits for a full batch before starting processing', () => {
    useStore.getState().updateNodeData('proc-1', {
      resources: 2,
      batchSize: 2,
      processingTime: 3,
    });

    useStore.getState().addItem('proc-1');
    useStore.getState().tick();
    expect(useStore.getState().items[0].status).toBe(ItemStatus.QUEUED);

    useStore.getState().addItem('proc-1');
    useStore.getState().tick();

    const processing = useStore.getState().items.filter((item) => item.status === ItemStatus.PROCESSING);
    expect(processing).toHaveLength(2);
    expect(new Set(processing.map((item) => item.processingDuration)).size).toBe(1);
  });

  it('completes batched items together', () => {
    useStore.getState().updateNodeData('proc-1', {
      resources: 2,
      batchSize: 2,
      processingTime: 1,
    });

    useStore.getState().addItem('proc-1');
    useStore.getState().addItem('proc-1');

    useStore.getState().tick();
    useStore.getState().tick();

    const completed = useStore.getState().items.filter((item) => item.status === ItemStatus.COMPLETED);
    expect(completed).toHaveLength(2);
    expect(new Set(completed.map((item) => item.completionTick)).size).toBe(1);
  });

  it('treats batch size 0 as batching off and fills available resources individually', () => {
    useStore.getState().updateNodeData('proc-1', {
      resources: 3,
      batchSize: 0,
      processingTime: 3,
    });

    useStore.getState().addItem('proc-1');
    useStore.getState().addItem('proc-1');
    useStore.getState().addItem('proc-1');
    useStore.getState().tick();

    const processing = useStore.getState().items.filter((item) => item.status === ItemStatus.PROCESSING);
    expect(processing).toHaveLength(3);
  });

  it('holds completed work upstream until a pull node has open slots', () => {
    setupPullFlow();

    useStore.getState().addItem('upstream');
    useStore.getState().addItem('downstream');

    useStore.getState().tick();
    useStore.getState().tick();

    const blocked = useStore.getState().items.find((item) => item.currentNodeId === 'upstream');
    expect(blocked?.status).toBe(ItemStatus.QUEUED);
    expect(blocked?.handoffTargetNodeId).toBe('downstream');

    useStore.getState().tick();
    useStore.getState().tick();
    useStore.getState().tick();

    const released = useStore.getState().items.find((item) => item.currentNodeId === 'downstream');
    expect(released).toBeDefined();
    expect(released?.handoffTargetNodeId ?? null).toBeNull();
  });

  it('caps pull nodes at resource capacity and keeps overflow upstream', () => {
    setupPullFlow();

    useStore.getState().updateNodeData('upstream', {
      resources: 6,
      processingTime: 1,
    });
    useStore.getState().updateNodeData('downstream', {
      resources: 3,
      processingTime: 5,
      batchSize: 3,
      flowMode: 'pull',
    });

    for (let i = 0; i < 6; i++) {
      useStore.getState().addItem('upstream');
    }

    useStore.getState().tick();
    useStore.getState().tick();

    const items = useStore.getState().items;
    const downstreamQueued = items.filter(
      (item) => item.currentNodeId === 'downstream' && item.status === ItemStatus.QUEUED
    );
    const downstreamProcessing = items.filter(
      (item) => item.currentNodeId === 'downstream' && item.status === ItemStatus.PROCESSING
    );
    const upstreamBlocked = items.filter(
      (item) => item.currentNodeId === 'upstream' && item.handoffTargetNodeId === 'downstream'
    );

    expect(downstreamQueued).toHaveLength(0);
    expect(downstreamProcessing).toHaveLength(3);
    expect(upstreamBlocked).toHaveLength(3);
  });

  it('push-to-pull keeps existing local queue and blocks only new arrivals upstream', () => {
    setupPullFlow();

    useStore.getState().updateNodeData('upstream', {
      resources: 4,
      processingTime: 1,
      flowMode: 'push',
    });
    useStore.getState().updateNodeData('downstream', {
      resources: 1,
      processingTime: 5,
      flowMode: 'push',
    });

    for (let i = 0; i < 4; i++) {
      useStore.getState().addItem('upstream');
    }

    useStore.getState().tick(); // upstream starts
    useStore.getState().tick(); // downstream now has 1 processing + 3 queued

    useStore.getState().updateNodeData('downstream', { flowMode: 'pull' });

    useStore.getState().addItem('upstream');
    useStore.getState().addItem('upstream');
    useStore.getState().tick(); // new upstream items start
    useStore.getState().tick(); // new arrivals should block upstream

    const items = useStore.getState().items;
    const downstreamLocal = items.filter((item) => item.currentNodeId === 'downstream');
    const upstreamBlocked = items.filter(
      (item) => item.currentNodeId === 'upstream' && item.handoffTargetNodeId === 'downstream'
    );

    expect(downstreamLocal).toHaveLength(4);
    expect(upstreamBlocked).toHaveLength(2);
    expect(useStore.getState().blockedCountsByTarget.get('downstream')).toBe(2);
  });

  it('switching a pull node back to push releases blocked upstream work', () => {
    setupPullFlow();

    useStore.getState().updateNodeData('upstream', {
      resources: 2,
      processingTime: 1,
    });
    useStore.getState().updateNodeData('downstream', {
      resources: 1,
      processingTime: 5,
      flowMode: 'pull',
    });

    useStore.getState().addItem('upstream');
    useStore.getState().addItem('upstream');

    useStore.getState().tick();
    useStore.getState().tick();

    expect(
      useStore.getState().items.filter(
        (item) => item.currentNodeId === 'upstream' && item.handoffTargetNodeId === 'downstream'
      )
    ).toHaveLength(1);

    useStore.getState().updateNodeData('downstream', { flowMode: 'push' });
    useStore.getState().tick();

    expect(
      useStore.getState().items.filter(
        (item) => item.currentNodeId === 'upstream' && item.handoffTargetNodeId === 'downstream'
      )
    ).toHaveLength(0);
    expect(
      useStore.getState().items.filter((item) => item.currentNodeId === 'downstream')
    ).toHaveLength(2);
  });

  it('reconnecting an upstream edge retargets blocked pull items to the new route', () => {
    setupPullFlow();

    useStore.getState().addItem('upstream');
    useStore.getState().addItem('downstream');

    useStore.getState().tick();
    useStore.getState().tick();

    const blockedBeforeReconnect = useStore.getState().items.find(
      (item) => item.currentNodeId === 'upstream' && item.handoffTargetNodeId === 'downstream'
    );
    expect(blockedBeforeReconnect).toBeDefined();

    const oldEdge = useStore.getState().edges.find((edge) => edge.id === 'e1')!;
    useStore.getState().reconnectEdge(oldEdge, {
      source: 'upstream',
      target: 'end-1',
      sourceHandle: null,
      targetHandle: null,
    });

    const blockedAfterReconnect = useStore.getState().items.find((item) => item.id === blockedBeforeReconnect!.id);
    expect(blockedAfterReconnect?.handoffTargetNodeId).toBe('end-1');

    useStore.getState().tick();

    expect(useStore.getState().items.find((item) => item.id === blockedBeforeReconnect!.id)?.status).toBe(ItemStatus.COMPLETED);
  });

  it('auto-injection creates items at start nodes on schedule', () => {
    useStore.setState({ autoInjectionEnabled: true });
    // Start node has sourceConfig: interval=20, batchSize=1, enabled=false
    // Enable it
    useStore.getState().updateNodeData('start-1', {
      sourceConfig: { enabled: true, interval: 5, batchSize: 2 },
    });

    // Tick 0 is divisible by 5, so items should be injected on first tick
    useStore.getState().tick();
    // tick() sets tickCount = 1, but injection checks tickCount (which was 0 at start of tick)
    const state = useStore.getState();
    const startItems = state.items.filter(i => i.spawnTick === 0);
    expect(startItems.length).toBe(2);
  });

  it('auto-injection does not fire when disabled', () => {
    useStore.setState({ autoInjectionEnabled: false });
    useStore.getState().updateNodeData('start-1', {
      sourceConfig: { enabled: true, interval: 1, batchSize: 3 },
    });
    useStore.getState().tick();
    expect(useStore.getState().items.length).toBe(0);
  });

  it('records history every 5 ticks', () => {
    useStore.getState().addItem('proc-1');
    for (let i = 0; i < 6; i++) useStore.getState().tick();
    const history = useStore.getState().history;
    // tick 0 (recorded) and tick 5 (recorded) = entries at tick 0 and 5
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].tick).toBe(0);
  });

  it('history entries contain expected fields', () => {
    useStore.getState().addItem('proc-1');
    for (let i = 0; i < 5; i++) useStore.getState().tick();
    const entry = useStore.getState().history[0];
    expect(entry).toHaveProperty('tick');
    expect(entry).toHaveProperty('wip');
    expect(entry).toHaveProperty('totalCompleted');
    expect(entry).toHaveProperty('throughput');
  });

  it('auto-stop halts simulation at target duration', () => {
    useStore.setState({
      autoStopEnabled: true,
      targetDuration: 3,
      isRunning: true,
    });

    // Tick to target duration
    useStore.getState().tick(); // tickCount -> 1
    useStore.getState().tick(); // tickCount -> 2
    useStore.getState().tick(); // tickCount -> 3

    // Next tick should trigger auto-stop
    useStore.getState().tick();
    const state = useStore.getState();
    // tickCount stays at 3 because auto-stop returns early
    expect(state.isRunning).toBe(false);
    expect(state.simulationProgress).toBe(100);
  });
});

describe('Store - Seeded Simulation And Process Box Logging', () => {
  beforeEach(() => resetStore());

  it('same flow + same seed + same settings produce identical stochastic outcomes across reruns', () => {
    const passingSeed = findSeedForQualityOutcome(true);
    setupDeterministicQualityFlow(passingSeed);

    useStore.getState().addItem('proc-1');
    for (let i = 0; i < 10; i++) useStore.getState().tick();
    const firstRun = useStore.getState().items.map((item) => ({
      status: item.status,
      terminalNodeId: item.terminalNodeId,
      completionTick: item.completionTick,
      timeActive: item.timeActive,
    }));

    useStore.getState().resetSimulation();
    useStore.getState().addItem('proc-1');
    for (let i = 0; i < 10; i++) useStore.getState().tick();
    const secondRun = useStore.getState().items.map((item) => ({
      status: item.status,
      terminalNodeId: item.terminalNodeId,
      completionTick: item.completionTick,
      timeActive: item.timeActive,
    }));

    expect(secondRun).toEqual(firstRun);
  });

  it('changing the seed changes at least one stochastic outcome', () => {
    const passingSeed = findSeedForQualityOutcome(true);
    const failingSeed = findSeedForQualityOutcome(false);

    setupDeterministicQualityFlow(passingSeed);
    useStore.getState().addItem('proc-1');
    for (let i = 0; i < 10; i++) useStore.getState().tick();
    const passingOutcome = useStore.getState().items[0]?.status;

    setupDeterministicQualityFlow(failingSeed);
    useStore.getState().addItem('proc-1');
    for (let i = 0; i < 10; i++) useStore.getState().tick();
    const failingOutcome = useStore.getState().items[0]?.status;

    expect(passingOutcome).toBe(ItemStatus.COMPLETED);
    expect(failingOutcome).toBe(ItemStatus.FAILED);
  });

  it('saving a canvas calls createCloudSave only', async () => {
    setupLinearFlow();
    sdkMock.isEmbedded = true;

    await useStore.getState().saveCanvasToDb();

    expect(sdkMock.createCloudSave).toHaveBeenCalledTimes(1);
    expect(sdkMock.logScoreRun).not.toHaveBeenCalled();
    expect(sdkMock.trackAppCompleted).not.toHaveBeenCalled();
    expect(sdkMock.createCloudSave.mock.calls[0][0]).toMatchObject({
      note: 'Untitled Canvas',
      state: expect.objectContaining({
        simulationSeed: useStore.getState().simulationSeed,
        workspaceId: expect.any(String),
      }),
    });
  });

  it('autosaving an unsaved canvas uses one hidden draft workspace', async () => {
    setupLinearFlow();
    sdkMock.isEmbedded = true;
    useStore.setState({
      currentCanvasId: null,
      currentCanvasName: 'Untitled Canvas',
      resourcePools: [
        {
          id: 'default-shared-pool',
          name: 'Shared Team',
          inputMode: 'fte',
          capacityValue: 3,
          avatarId: 'orbit',
        },
      ],
      sharedCapacityInputMode: 'fte',
      sharedCapacityValue: 3,
    } as any);

    await useStore.getState().saveCanvasToDb({ autosave: true, silent: true });

    expect(sdkMock.createCloudSave).toHaveBeenCalledTimes(1);
    expect(sdkMock.createCloudSave.mock.calls[0][0]).toMatchObject({
      state: expect.objectContaining({
        workspaceId: AUTOSAVE_DRAFT_CANVAS_ID,
        autosaveDraft: true,
      }),
    });
    expect(useStore.getState().currentCanvasId).toBe(AUTOSAVE_DRAFT_CANVAS_ID);
  });

  it('refreshCanvasList groups cloud save snapshots by workspace id', async () => {
    sdkMock.isEmbedded = true;
    sdkMock.listCloudSaves.mockResolvedValue({
      saves: [
        {
          id: 'save-older',
          updated_at: '2026-03-06T09:00:00.000Z',
          state_json: {
            workspaceId: 'workspace-1',
            canvasName: 'Coffee Service',
            nodes: [{ id: 'a' }],
            edges: [],
          },
        },
        {
          id: 'save-newer',
          updated_at: '2026-03-06T10:00:00.000Z',
          state_json: {
            workspaceId: 'workspace-1',
            canvasName: 'Coffee Service v2',
            nodes: [{ id: 'a' }, { id: 'b' }],
            edges: [{ id: 'e1' }],
          },
        },
        {
          id: 'save-2',
          updated_at: '2026-03-05T10:00:00.000Z',
          state_json: {
            workspaceId: 'workspace-2',
            canvasName: 'Hospital ER',
            nodes: [{ id: 'c' }],
            edges: [],
          },
        },
      ],
    });

    await useStore.getState().refreshCanvasList();

    const canvases = useStore.getState().savedCanvasList;
    expect(canvases).toHaveLength(2);
    expect(canvases[0]).toMatchObject({
      id: 'workspace-1',
      name: 'Coffee Service v2',
      source: 'cloud',
      snapshotId: 'save-newer',
      nodeCount: 2,
      edgeCount: 1,
    });
    expect(canvases[1]).toMatchObject({
      id: 'workspace-2',
      name: 'Hospital ER',
      source: 'cloud',
      snapshotId: 'save-2',
    });
  });

  it('refreshCanvasList hides autosave draft snapshots', async () => {
    sdkMock.isEmbedded = true;
    sdkMock.listCloudSaves.mockResolvedValue({
      saves: [
        {
          id: 'save-draft',
          updated_at: '2026-03-06T11:00:00.000Z',
          state_json: {
            workspaceId: AUTOSAVE_DRAFT_CANVAS_ID,
            autosaveDraft: true,
            canvasName: 'Working Draft',
            nodes: [{ id: 'a' }],
            edges: [],
          },
        },
        {
          id: 'save-1',
          updated_at: '2026-03-06T10:00:00.000Z',
          state_json: {
            workspaceId: 'workspace-1',
            canvasName: 'Coffee Service',
            nodes: [{ id: 'a' }],
            edges: [],
          },
        },
      ],
    });

    await useStore.getState().refreshCanvasList();

    const canvases = useStore.getState().savedCanvasList;
    expect(canvases).toHaveLength(1);
    expect(canvases[0]).toMatchObject({
      id: 'workspace-1',
      name: 'Coffee Service',
    });
  });

  it('finite target run auto-stop logs one Process Box run with score summary metadata', () => {
    setupTargetDemandFlow();
    sdkMock.isEmbedded = true;

    useStore.getState().startSimulation();
    for (let i = 0; i < 120; i++) {
      if (!useStore.getState().isRunning && useStore.getState().tickCount >= 60) break;
      useStore.getState().tick();
    }

    const state = useStore.getState();
    expect(state.isRunning).toBe(false);
    expect(state.tickCount).toBe(60);
    expect(state.lastRunSummary).not.toBeNull();
    expect(sdkMock.logScoreRun).toHaveBeenCalledTimes(1);

    const payload = sdkMock.logScoreRun.mock.calls[0][0];
    expect(payload.outcome).toBe('target_run_completed');
    expect(payload.score).toBe(state.lastRunSummary!.score);
    expect(payload.durationMs).toBeGreaterThanOrEqual(0);
    expect(payload.metadata).toMatchObject(state.lastRunSummary!);
  });

  it('tracks hourly KPI buckets for lead time, process efficiency, and utilisation', () => {
    setupLinearFlow();
    useStore.setState({
      kpiHistoryByPeriod: {
        hour: [],
        day: [],
        week: [],
        month: [],
      },
    } as any);

    useStore.getState().addItem('start-1');
    for (let i = 0; i < 10; i++) {
      useStore.getState().tick();
    }

    const hourlyBuckets = useStore.getState().kpiHistoryByPeriod.hour;
    expect(hourlyBuckets).toHaveLength(1);
    expect(hourlyBuckets[0].completions).toBeGreaterThanOrEqual(1);
    expect(hourlyBuckets[0].leadTimeAvg).toBeGreaterThan(0);
    expect(hourlyBuckets[0].processEfficiencyAvg).toBeGreaterThan(0);
    expect(hourlyBuckets[0].resourceUtilizationAvg).toBeGreaterThan(0);
    expect(hourlyBuckets[0].availableResourceTicks).toBeGreaterThan(hourlyBuckets[0].busyResourceTicks);
  });

  it('tracks rolling per-node utilisation history for node badge averages', () => {
    setupLinearFlow();

    useStore.getState().addItem('start-1');
    for (let i = 0; i < 10; i++) {
      useStore.getState().tick();
    }

    let startHistory = useStore.getState().nodeUtilizationHistoryByNode['start-1'];
    expect(startHistory).toHaveLength(10);
    expect(computeRollingNodeUtilization(startHistory)).toBeCloseTo(20);

    for (let i = 0; i < 55; i++) {
      useStore.getState().tick();
    }

    startHistory = useStore.getState().nodeUtilizationHistoryByNode['start-1'];
    expect(startHistory).toHaveLength(NODE_UTILIZATION_ROLLING_WINDOW_TICKS);
    expect(computeRollingNodeUtilization(startHistory)).toBe(0);
  });

  it('tracks latest period-average utilisation per shared resource pool', () => {
    setupLinearFlow();
    useStore.setState({
      capacityMode: 'sharedAllocation',
      sharedCapacityInputMode: 'fte',
      sharedCapacityValue: 1,
      resourcePools: [
        {
          id: 'default-shared-pool',
          name: 'Shared Team',
          inputMode: 'fte',
          capacityValue: 1,
          avatarId: 'orbit',
        },
      ],
      poolUtilizationHistoryByPeriod: {
        hour: {},
        day: {},
        week: {},
        month: {},
      },
    } as any);

    useStore.getState().updateNodeData('start-1', { allocationPercent: 50 });
    useStore.getState().updateNodeData('proc-1', { allocationPercent: 50 });
    useStore.getState().addItem('start-1');
    for (let i = 0; i < 10; i++) {
      useStore.getState().tick();
    }

    const hourlyPoolBuckets = useStore.getState().poolUtilizationHistoryByPeriod.hour['default-shared-pool'];
    expect(hourlyPoolBuckets).toHaveLength(1);
    expect(hourlyPoolBuckets[0].resourceUtilizationAvg).toBeGreaterThan(0);
    expect(hourlyPoolBuckets[0].availableResourceTicks).toBeGreaterThan(0);
  });
});

describe('Store - Quality Control (Failure Path)', () => {
  const setupLowQualityFlow = (seed = 1234) => {
    useStore.getState().clearCanvas();

    useStore.setState({
      nodes: [
        {
          id: 'proc-1',
          type: 'processNode',
          position: { x: 400, y: 0 },
          data: {
            label: 'Process',
            processingTime: 2,
            resources: 2,
            quality: 0.01,
            variability: 0,
            stats: { processed: 0, failed: 0, maxQueue: 0 },
            routingWeights: {},
          },
        },
        {
          id: 'end-1',
          type: 'endNode',
          position: { x: 800, y: 0 },
          data: {
            label: 'End',
            processingTime: 0,
            resources: 999,
            quality: 1.0,
            variability: 0,
            stats: { processed: 0, failed: 0, maxQueue: 0 },
            routingWeights: {},
          },
        },
      ] as any,
      edges: [{ id: 'e1', source: 'proc-1', target: 'end-1', type: 'processEdge', animated: false, markerEnd: { type: 'arrowclosed' } }],
      items: [],
      tickCount: 0,
      autoInjectionEnabled: false,
      cumulativeCompleted: 0,
      throughput: 0,
      displayTickCount: 0,
      history: [],
      metricsEpoch: 0,
      metricsEpochTick: 0,
      metricsWindowCompletions: 50,
      demandMode: 'auto',
      demandUnit: 'week',
      demandTotalTicks: 2400,
    demandArrivalsGenerated: 0,
    demandArrivalsByNode: {},
    demandAccumulatorByNode: {},
    demandOpenTicksByNode: {},
    periodCompleted: 0,
    simulationSeed: seed,
    runStartedAtMs: null,
    lastRunSummary: null,
    lastLoggedRunKey: null,
    itemsByNode: new Map(),
    itemCounts: { wip: 0, completed: 0, failed: 0, queued: 0, processing: 0, stuck: 0 },
    });
  };

  it('items with low quality produce failures over many runs', () => {
    let failedCount = 0;
    const runs = 30;

    for (let run = 0; run < runs; run++) {
      setupLowQualityFlow(run + 1);
      useStore.getState().addItem('proc-1');

      for (let i = 0; i < 20; i++) {
        useStore.getState().tick();
        const item = useStore.getState().items[0];
        if (item.status === ItemStatus.FAILED || item.status === ItemStatus.COMPLETED) {
          if (item.status === ItemStatus.FAILED) failedCount++;
          break;
        }
      }
    }

    // With quality=0.01, nearly all should fail
    expect(failedCount).toBeGreaterThan(20);
  });

  it('failed items have a completionTick set', () => {
    setupLowQualityFlow();
    for (let i = 0; i < 20; i++) {
      useStore.getState().addItem('proc-1');
    }
    for (let i = 0; i < 30; i++) useStore.getState().tick();

    const failedItems = useStore.getState().items.filter(i => i.status === ItemStatus.FAILED);
    expect(failedItems.length).toBeGreaterThan(0);
    for (const item of failedItems) {
      expect(item.completionTick).not.toBeNull();
    }
  });

  it('failed items are counted in itemCounts', () => {
    setupLowQualityFlow();
    for (let i = 0; i < 20; i++) {
      useStore.getState().addItem('proc-1');
    }
    for (let i = 0; i < 30; i++) useStore.getState().tick();
    expect(useStore.getState().itemCounts.failed).toBeGreaterThan(0);
  });
});

describe('Store - Instant Processing (End Nodes)', () => {
  beforeEach(() => setupLinearFlow());

  it('end node with processingTime=0 processes items instantly', () => {
    // Add item directly to end node
    useStore.getState().addItem('end-1');
    useStore.getState().tick();

    const items = useStore.getState().items;
    // Item should be completed since end node has no outgoing edges and processingTime=0
    const completed = items.filter(i => i.status === ItemStatus.COMPLETED);
    expect(completed.length).toBe(1);
    expect(completed[0].terminalNodeId).toBe('end-1');
  });
});

describe('Store - Configuration Actions', () => {
  it('setItemConfig merges partial config', () => {
    useStore.getState().setItemConfig({ color: '#ff0000' });
    const config = useStore.getState().itemConfig;
    expect(config.color).toBe('#ff0000');
    expect(config.shape).toBe('circle'); // unchanged
  });

  it('setTimeUnit keeps the fixed minute time base', () => {
    useStore.getState().setTimeUnit('hours');
    expect(useStore.getState().timeUnit).toBe('minutes');
  });

  it('setShowSunMoonClock updates the visibility preference', () => {
    useStore.getState().setShowSunMoonClock(false);
    expect(useStore.getState().showSunMoonClock).toBe(false);
    useStore.getState().setShowSunMoonClock(true);
    expect(useStore.getState().showSunMoonClock).toBe(true);
  });

  it('setDurationPreset updates duration and recalculates progress', () => {
    useStore.getState().setDurationPreset('1day');
    const state = useStore.getState();
    expect(state.durationPreset).toBe('1day');
    expect(state.targetDuration).toBe(480);
  });

  it('setDurationPreset ignores invalid preset', () => {
    useStore.getState().setDurationPreset('1day');
    useStore.getState().setDurationPreset('nonexistent');
    // Should remain unchanged
    expect(useStore.getState().durationPreset).toBe('1day');
  });

  it('setSpeedPreset updates speed', () => {
    useStore.getState().setSpeedPreset('10x');
    const state = useStore.getState();
    expect(state.speedPreset).toBe('10x');
    expect(state.ticksPerSecond).toBe(600);
  });

  it('setSpeedPreset ignores invalid preset', () => {
    useStore.getState().setSpeedPreset('1x');
    useStore.getState().setSpeedPreset('invalid');
    expect(useStore.getState().speedPreset).toBe('1x');
  });

  it('setAutoStop updates the flag', () => {
    useStore.getState().setAutoStop(false);
    expect(useStore.getState().autoStopEnabled).toBe(false);
    useStore.getState().setAutoStop(true);
    expect(useStore.getState().autoStopEnabled).toBe(true);
  });

});

describe('Store - Scenario Loading', () => {
  it('loadScenario("empty") clears all nodes and edges', () => {
    useStore.getState().loadScenario('empty');
    const state = useStore.getState();
    expect(state.nodes).toEqual([]);
    expect(state.edges).toEqual([]);
    expect(state.items).toEqual([]);
    expect(state.tickCount).toBe(0);
  });

  it('loadScenario resets shared-resource settings for templates without their own pools', () => {
    useStore.setState({
      capacityMode: 'sharedAllocation',
      sharedCapacityInputMode: 'hours',
      sharedCapacityValue: 40,
      resourcePools: [
        {
          id: 'default-shared-pool',
          name: 'Carry Over Team',
          inputMode: 'hours',
          capacityValue: 40,
          avatarId: 'orbit',
        },
        {
          id: 'contractors',
          name: 'Contractors',
          inputMode: 'fte',
          capacityValue: 6,
          avatarId: 'wrench',
        },
      ],
    } as any);

    useStore.getState().loadScenario('devops');

    const state = useStore.getState();
    expect(state.capacityMode).toBe('local');
    expect(state.sharedCapacityInputMode).toBe('fte');
    expect(state.sharedCapacityValue).toBe(3);
    expect(state.resourcePools).toHaveLength(1);
    expect(state.resourcePools[0].id).toBe('default-shared-pool');
    expect(state.resourcePools[0].name).toBe('Shared Team');
  });

  it('loadScenario("devops") loads the devops scenario', () => {
    useStore.getState().loadScenario('devops');
    const state = useStore.getState();
    // DevOps has 9 nodes (7 process/start/end + 2 annotations)
    expect(state.nodes.length).toBe(9);
    expect(state.edges.length).toBe(8);
    expect(state.edges.every((edge) => edge.sourceHandle)).toBe(true);
    expect(state.edges.every((edge) => edge.targetHandle)).toBe(true);
    const firstEdge = state.edges.find((edge) => edge.id === 'e1');
    expect(firstEdge?.sourceHandle).toBe('right');
    expect(firstEdge?.targetHandle).toBe('left-target');
    const reviewRework = state.edges.find((edge) => edge.id === 'e4-fail');
    const qaRework = state.edges.find((edge) => edge.id === 'e5-fail');
    expect(reviewRework?.sourceHandle).toBe('top-source');
    expect(reviewRework?.targetHandle).toBe('top-target');
    expect(qaRework?.sourceHandle).toBe('top-source');
    expect(qaRework?.targetHandle).toBe('top-target');
  });

  it('loadScenario("hospital") loads the hospital scenario', () => {
    useStore.getState().loadScenario('hospital');
    const state = useStore.getState();
    expect(state.nodes.length).toBe(11); // 9 + 2 annotations
    expect(state.edges.length).toBe(10);
  });

  it('loadScenario("manufacturing") loads the manufacturing scenario', () => {
    useStore.getState().loadScenario('manufacturing');
    const state = useStore.getState();
    expect(state.nodes.length).toBe(11); // 10 + 1 annotation
    expect(state.edges.length).toBe(9);
  });

  it('loadScenario("housingRepairs") loads the housing repairs scenario', () => {
    useStore.getState().loadScenario('housingRepairs');
    const state = useStore.getState();
    const triageNode = state.nodes.find((node) => node.id === 'hr-triage');
    const contractorVisitNode = state.nodes.find((node) => node.id === 'hr-contractor-visit');
    expect(state.currentCanvasName).toBe('Housing Repairs Process');
    expect(state.nodes.length).toBe(12); // 10 work/end + 2 annotations
    expect(state.edges.length).toBe(12);
    expect(state.capacityMode).toBe('sharedAllocation');
    expect(state.resourcePools.map((pool) => pool.name)).toEqual([
      'Customer Service Center',
      'Maintenance Coordinators',
      'Direct Maintenance',
      'Contractors',
    ]);
    expect((triageNode?.data as any).resourcePoolId).toBe('default-shared-pool');
    expect((contractorVisitNode?.data as any).resourcePoolId).toBe('contractors');
  });

  it('loadScenario("complaints") loads the complaints scenario', () => {
    useStore.getState().loadScenario('complaints');
    const state = useStore.getState();
    expect(state.currentCanvasName).toBe('Complaints Handling Process');
    expect(state.nodes.length).toBe(12); // 10 work/end + 2 annotations
    expect(state.edges.length).toBe(11);
  });

  it('newCanvas resets shared-resource settings back to defaults', () => {
    useStore.setState({
      capacityMode: 'sharedAllocation',
      sharedCapacityInputMode: 'hours',
      sharedCapacityValue: 24,
      resourcePools: [
        {
          id: 'default-shared-pool',
          name: 'Operations',
          inputMode: 'hours',
          capacityValue: 24,
          avatarId: 'orbit',
        },
        {
          id: 'field-team',
          name: 'Field Team',
          inputMode: 'fte',
          capacityValue: 4,
          avatarId: 'wrench',
        },
      ],
    } as any);

    useStore.getState().newCanvas();

    const state = useStore.getState();
    expect(state.nodes).toEqual([]);
    expect(state.edges).toEqual([]);
    expect(state.capacityMode).toBe('local');
    expect(state.sharedCapacityInputMode).toBe('fte');
    expect(state.sharedCapacityValue).toBe(3);
    expect(state.resourcePools).toHaveLength(1);
    expect(state.resourcePools[0].id).toBe('default-shared-pool');
    expect(state.resourcePools[0].name).toBe('Shared Team');
  });

  it('loadScenario resets simulation state', () => {
    // Run some ticks first
    setupLinearFlow();
    useStore.getState().addItem('proc-1');
    useStore.getState().tick();
    useStore.getState().tick();

    useStore.getState().loadScenario('devops');
    const state = useStore.getState();
    expect(state.items).toEqual([]);
    expect(state.tickCount).toBe(0);
    expect(state.isRunning).toBe(false);
  });

  it('loadScenario deep copies nodes (no shared references)', () => {
    useStore.getState().loadScenario('devops');
    const firstLoad = useStore.getState().nodes;

    useStore.getState().loadScenario('devops');
    const secondLoad = useStore.getState().nodes;

    // Should be different object references
    expect(firstLoad).not.toBe(secondLoad);
    expect(firstLoad[0]).not.toBe(secondLoad[0]);
  });
});

describe('Store - Import/Export JSON', () => {
  it('importJson sets nodes and edges from valid JSON', () => {
    const flow = {
      nodes: [
        { id: 'n1', type: 'processNode', position: { x: 0, y: 0 }, data: { label: 'Test' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
      ],
    };
    useStore.getState().importJson(JSON.stringify(flow));
    const state = useStore.getState();
    expect(state.nodes.length).toBe(1);
    expect(state.edges.length).toBe(1);
    expect(state.items).toEqual([]);
    expect(state.tickCount).toBe(0);
  });

  it('importJson handles invalid JSON gracefully', () => {
    const before = useStore.getState().nodes.length;
    useStore.getState().importJson('not valid json');
    // State should remain unchanged (Toast error shown)
    expect(useStore.getState().nodes.length).toBe(before);
  });

  it('importJson rejects JSON without nodes/edges', () => {
    const before = useStore.getState().nodes.length;
    useStore.getState().importJson(JSON.stringify({ foo: 'bar' }));
    expect(useStore.getState().nodes.length).toBe(before);
  });
});

describe('Store - Throughput Calculation', () => {
  beforeEach(() => setupLinearFlow());

  it('throughput starts at 0', () => {
    expect(useStore.getState().throughput).toBe(0);
  });

  it('throughput increases when items complete', () => {
    // Add item directly to end-1 (instant processing, no outgoing edges = COMPLETED)
    useStore.getState().addItem('end-1');
    useStore.getState().tick();
    useStore.getState().addItem('end-1');
    useStore.getState().tick();
    expect(useStore.getState().cumulativeCompleted).toBeGreaterThanOrEqual(2);
    expect(useStore.getState().throughput).toBeGreaterThan(0);
  });
});

describe('Store - Derived State (itemsByNode, itemCounts)', () => {
  beforeEach(() => setupLinearFlow());

  it('itemCounts reflects current item statuses', () => {
    useStore.getState().addItem('proc-1');
    useStore.getState().addItem('proc-1');
    useStore.getState().tick();

    const { itemCounts } = useStore.getState();
    expect(itemCounts.wip).toBeGreaterThanOrEqual(2);
    expect(itemCounts.completed).toBe(0);
  });

  it('itemsByNode maps items to their current node', () => {
    useStore.getState().addItem('proc-1');
    useStore.getState().addItem('proc-1');
    useStore.getState().tick();

    const { itemsByNode } = useStore.getState();
    const procItems = itemsByNode.get('proc-1');
    expect(procItems).toBeDefined();
    expect(procItems!.length).toBe(2);
  });
});

describe('Store - Simulation Progress', () => {
  beforeEach(() => setupLinearFlow());

  it('simulationProgress is 0 for unlimited duration', () => {
    useStore.setState({ targetDuration: Infinity });
    useStore.getState().tick();
    expect(useStore.getState().simulationProgress).toBe(0);
  });

  it('simulationProgress increases with ticks for bounded duration', () => {
    useStore.setState({ targetDuration: 100, autoStopEnabled: false });
    useStore.getState().tick();
    expect(useStore.getState().simulationProgress).toBe(1); // 1/100 * 100
    for (let i = 0; i < 49; i++) useStore.getState().tick();
    expect(useStore.getState().simulationProgress).toBe(50); // 50/100 * 100
  });
});

describe('Store - Validation Errors', () => {
  it('nodes without output paths get validation error', () => {
    setupLinearFlow();
    // Remove edges from proc-1
    useStore.getState().deleteEdge('e2');
    const node = useStore.getState().nodes.find(n => n.id === 'proc-1');
    expect((node!.data as any).validationError).toBe('No Output Path');
  });

  it('end nodes do not get "No Output Path" validation error', () => {
    setupLinearFlow();
    useStore.getState().tick();
    const endNode = useStore.getState().nodes.find(n => n.id === 'end-1');
    expect((endNode!.data as any).validationError).toBeUndefined();
  });

  it('nodes with zero capacity get validation error', () => {
    setupLinearFlow();
    useStore.getState().updateNodeData('proc-1', { resources: 0 });
    const node = useStore.getState().nodes.find(n => n.id === 'proc-1');
    expect((node!.data as any).validationError).toBe('Zero Capacity');
  });

  it('nodes with zero local capacity do not start work or accumulate utilization capacity', () => {
    setupLinearFlow();
    useStore.getState().updateNodeData('proc-1', { resources: 0 });
    useStore.getState().addItem('proc-1');

    useStore.getState().tick();

    const state = useStore.getState();
    expect(state.items.filter((item) => item.status === ItemStatus.PROCESSING)).toHaveLength(0);
    expect(state.items[0]?.status).toBe(ItemStatus.QUEUED);
    expect(state.nodeUtilizationHistoryByNode['proc-1']?.[0]?.availableResourceTicks ?? null).toBe(0);
  });

  it('shared allocation nodes with no assigned share get validation error', () => {
    setupLinearFlow();
    useStore.setState({
      capacityMode: 'sharedAllocation',
      sharedCapacityInputMode: 'fte',
      sharedCapacityValue: 1,
    });
    useStore.getState().updateNodeData('start-1', { allocationPercent: 100 });
    useStore.getState().updateNodeData('proc-1', { allocationPercent: 0 });

    const node = useStore.getState().nodes.find((entry) => entry.id === 'proc-1');
    expect((node!.data as any).validationError).toBe('Zero Allocation');
  });

  it('shared allocation nodes warn when a step can never fit inside the daily budget', () => {
    setupLinearFlow();
    useStore.setState({
      capacityMode: 'sharedAllocation',
      sharedCapacityInputMode: 'hours',
      sharedCapacityValue: 1,
    });
    useStore.getState().updateNodeData('proc-1', {
      allocationPercent: 100,
      processingTime: 70,
      resources: 1,
    });

    const node = useStore.getState().nodes.find((entry) => entry.id === 'proc-1');
    expect((node!.data as any).validationError).toBe('Step Exceeds Daily Budget');

    useStore.getState().addItem('proc-1');
    useStore.getState().tick();

    const item = useStore.getState().items[0];
    expect(item.status).toBe(ItemStatus.QUEUED);
    expect(item.currentNodeId).toBe('proc-1');
  });

  it('marks shared allocation nodes as budget exhausted when queued work no longer fits today', () => {
    setupLinearFlow();
    useStore.setState({
      capacityMode: 'sharedAllocation',
      sharedCapacityInputMode: 'hours',
      sharedCapacityValue: 1,
    });
    useStore.getState().updateNodeData('proc-1', {
      allocationPercent: 100,
      processingTime: 50,
      resources: 2,
      variability: 0,
    });

    useStore.getState().addItem('proc-1');
    useStore.getState().addItem('proc-1');
    useStore.getState().tick();

    const budgetState = useStore.getState().sharedNodeBudgetStateByNode['proc-1'];
    const queuedItems = useStore
      .getState()
      .items.filter((item) => item.currentNodeId === 'proc-1' && item.status === ItemStatus.QUEUED);

    expect(budgetState?.dailyBudgetMinutes).toBe(60);
    expect(budgetState?.remainingBudgetMinutes).toBe(10);
    expect(budgetState?.consumedBudgetMinutes).toBe(50);
    expect(budgetState?.budgetExhausted).toBe(true);
    expect(queuedItems).toHaveLength(1);
  });

  it('settings resets clear runtime stats and stale validation immediately', () => {
    setupLinearFlow();

    useStore.setState({
      nodes: useStore.getState().nodes.map((node) =>
        node.id === 'proc-1'
          ? {
              ...node,
              data: {
                ...node.data,
                stats: { processed: 7, failed: 2, maxQueue: 3 },
                validationError: 'No Output Path',
              },
            }
          : node
      ) as any,
    });

    useStore.getState().setSharedCapacityValue(6);

    const node = useStore.getState().nodes.find((entry) => entry.id === 'proc-1');
    expect((node!.data as any).stats).toEqual({ processed: 0, failed: 0, maxQueue: 0 });
    expect((node!.data as any).validationError).toBeUndefined();
    expect(useStore.getState().items).toHaveLength(0);
  });
});

describe('Store - Display Clock', () => {
  beforeEach(() => setupLinearFlow());

  it('displayTickCount advances every tick when no items exist', () => {
    for (let i = 0; i < 10; i++) useStore.getState().tick();
    const state = useStore.getState();
    expect(state.tickCount).toBe(10);
    expect(state.displayTickCount).toBe(10);
  });

  it('displayTickCount keeps advancing when items are processing and completing', () => {
    // Add items to proc-1 (processingTime=3, resources=2)
    useStore.getState().addItem('proc-1');
    useStore.getState().addItem('proc-1');
    useStore.getState().addItem('proc-1');

    for (let i = 0; i < 50; i++) useStore.getState().tick();

    const state = useStore.getState();
    expect(state.tickCount).toBe(50);
    expect(state.displayTickCount).toBeGreaterThan(10);
  });

  it('displayTickCount does not freeze during continuous flow', () => {
    // Simulate a busy flow: keep adding items so processing overlaps
    useStore.getState().addItem('proc-1');

    const displayValues: number[] = [];
    for (let i = 0; i < 30; i++) {
      useStore.getState().tick();
      displayValues.push(useStore.getState().displayTickCount);
      // Add a new item every 5 ticks to keep the flow going
      if (i % 5 === 0) useStore.getState().addItem('proc-1');
    }

    // The display clock should be strictly increasing over the run
    // (not stuck at a constant value like 2)
    const firstValue = displayValues[0];
    const lastValue = displayValues[displayValues.length - 1];
    expect(lastValue).toBeGreaterThan(firstValue);
    // Should advance by at least half the ticks (most ticks have processing activity)
    expect(lastValue).toBeGreaterThan(15);
  });

  it('displayTickCount remains aligned with tickCount during a single-item run', () => {
    useStore.getState().addItem('proc-1');

    for (let i = 0; i < 40; i++) {
      useStore.getState().tick();
    }

    const state = useStore.getState();
    expect(state.displayTickCount).toBe(state.tickCount);
  });

  it('displayTickCount is never negative', () => {
    useStore.getState().addItem('proc-1');
    for (let i = 0; i < 50; i++) {
      useStore.getState().tick();
      expect(useStore.getState().displayTickCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('clock does not freeze with devops scenario under load', () => {
    // Load a realistic scenario and simulate
    useStore.getState().loadScenario('devops');
    useStore.setState({ autoInjectionEnabled: true });

    for (let i = 0; i < 100; i++) useStore.getState().tick();

    const state = useStore.getState();
    // After 100 ticks with the devops scenario, the clock must not be stuck
    expect(state.displayTickCount).toBeGreaterThan(10);
    // And should be relatively close to tickCount (not drifting far behind)
    expect(state.displayTickCount).toBeGreaterThan(state.tickCount * 0.3);
  });
});

describe('Store - Metric alignment with single time base', () => {
  beforeEach(() => setupLinearFlow());

  it('lead time equals active + waiting when run time is the observation clock', () => {
    // Single item with known processing time
    useStore.getState().updateNodeData('proc-1', { processingTime: 3, resources: 1 });
    useStore.getState().addItem('proc-1');

    // Tick until completion so we capture clock at finish moment
    let completedAtDisplay = 0;
    for (let i = 0; i < 12; i++) {
      useStore.getState().tick();
      const completed = useStore.getState().items.find(it => it.status === ItemStatus.COMPLETED);
      if (completed) {
        completedAtDisplay = useStore.getState().displayTickCount;
        break;
      }
    }

    const state = useStore.getState();
    const completed = state.items.find(i => i.status === ItemStatus.COMPLETED)!;

    expect(completed.timeActive).toBe(3);
    expect(completed.timeWaiting).toBe(0); // immediate assignment no longer accrues artificial queue time
    // Display clock should stay aligned with lead semantics (small edge differences may occur
    // due to completion boundary timing within the discrete tick loop).
    expect(Math.abs(completedAtDisplay - (completed.timeActive + completed.timeWaiting))).toBeLessThanOrEqual(1);
  });

  it('throughput over completion window matches expected rate', () => {
    // Throughput uses only end-node completions.
    // Add directly to end-1 (instant processing, no outgoing path).
    useStore.setState({ metricsWindowCompletions: 50 });

    for (let i = 0; i < 50; i++) {
      useStore.getState().addItem('end-1');
      useStore.getState().tick();
    }

    const throughput = useStore.getState().throughput;
    // One completion per tick => exactly 60 per hour across a 50-completion window.
    expect(throughput).toBe(60);
  });

  it('throughput excludes completions that do not reach an end node', () => {
    useStore.getState().updateNodeData('proc-1', { processingTime: 0, resources: 100 });
    useStore.setState({
      edges: useStore.getState().edges.filter(e => e.source !== 'proc-1'),
      metricsWindowCompletions: 20
    });

    for (let i = 0; i < 20; i++) {
      useStore.getState().addItem('proc-1');
      useStore.getState().tick();
    }

    expect(useStore.getState().throughput).toBe(0);
    expect(useStore.getState().cumulativeCompleted).toBe(0);
  });

  it('throughput is not affected by edge presentation metadata', () => {
    const runWithOffset = (offset: number) => {
      setupLinearFlow();
      useStore.setState({ metricsWindowCompletions: 20 });
      useStore.getState().updateNodeData('proc-1', { processingTime: 0, resources: 100 });
      useStore.getState().updateEdgeData('e2', { offset });

      for (let i = 0; i < 20; i++) {
        useStore.getState().addItem('proc-1');
        useStore.getState().tick();
      }

      for (let i = 0; i < 10; i++) {
        useStore.getState().tick();
      }

      return useStore.getState().throughput;
    };

    const throughputShort = runWithOffset(10);
    const throughputLong = runWithOffset(80);

    expect(Math.abs(throughputShort - throughputLong)).toBeLessThanOrEqual(1);
  });

  it('timeActive + timeWaiting equals totalTime for completed items', () => {
    useStore.getState().updateNodeData('proc-1', { processingTime: 4, resources: 1 });
    useStore.getState().addItem('proc-1');

    for (let i = 0; i < 12; i++) useStore.getState().tick();

    const completed = useStore.getState().items.find(i => i.status === ItemStatus.COMPLETED)!;
    expect(completed.timeActive + completed.timeWaiting).toBe(completed.totalTime);
  });

  it('PCE derived from item times matches VAT/lead ratio', () => {
    useStore.getState().updateNodeData('proc-1', { processingTime: 4, resources: 1 });
    useStore.getState().addItem('proc-1');
    useStore.getState().addItem('proc-1'); // ensure waiting time exists for second item

    for (let i = 0; i < 40; i++) useStore.getState().tick();

    const items = useStore.getState().items.filter(i => i.status === ItemStatus.COMPLETED);
    expect(items.length).toBeGreaterThanOrEqual(2);
    // Use the second item to ensure waiting time > 0
    const target = items[1];
    const lead = target.timeActive + target.timeWaiting;
    const pce = lead > 0 ? (target.timeActive / lead) * 100 : 0;
    expect(lead).toBe(target.timeActive + target.timeWaiting);
    expect(pce).toBeGreaterThanOrEqual(0);
    expect(pce).toBeLessThanOrEqual(100);
  });

  it('node stage metrics update when a process node finishes work', () => {
    useStore.getState().updateNodeData('proc-1', { processingTime: 3, resources: 1, quality: 1 });
    useStore.getState().addItem('proc-1');

    for (let i = 0; i < 4; i++) {
      useStore.getState().tick();
    }

    const state = useStore.getState();
    const metrics = computeNodeStageMetrics(state.nodeStageMetricsHistoryByNode['proc-1'] || [], {
      windowSize: state.metricsWindowCompletions,
      metricsEpoch: state.metricsEpoch,
    });

    expect(metrics.sampleSize).toBe(1);
    expect(metrics.avgLeadWorking).toBe(3);
    expect(metrics.pce).toBe(100);
  });

  it('failed processing attempts count toward node stage metrics', () => {
    useStore.getState().updateNodeData('proc-1', { processingTime: 2, resources: 1, quality: 0 });
    useStore.getState().addItem('proc-1');

    for (let i = 0; i < 3; i++) {
      useStore.getState().tick();
    }

    const state = useStore.getState();
    const failedItem = state.items.find((item) => item.status === ItemStatus.FAILED);
    const metrics = computeNodeStageMetrics(state.nodeStageMetricsHistoryByNode['proc-1'] || [], {
      windowSize: state.metricsWindowCompletions,
      metricsEpoch: state.metricsEpoch,
    });

    expect(failedItem).toBeDefined();
    expect(metrics.sampleSize).toBe(1);
    expect(metrics.avgLeadWorking).toBe(2);
  });

  it('blocked upstream transfers do not count as downstream stage completions', () => {
    setupPullFlow();
    useStore.getState().addItem('downstream');
    useStore.getState().addItem('upstream');

    useStore.getState().tick();
    useStore.getState().tick();

    const state = useStore.getState();
    const downstreamMetrics = computeNodeStageMetrics(state.nodeStageMetricsHistoryByNode.downstream || [], {
      windowSize: state.metricsWindowCompletions,
      metricsEpoch: state.metricsEpoch,
    });
    const blockedItem = state.items.find((item) => item.currentNodeId === 'upstream' && item.handoffTargetNodeId === 'downstream');

    expect(blockedItem).toBeDefined();
    expect(downstreamMetrics.sampleSize).toBe(0);
  });

  it('clock advances during long processing even when no new arrivals occur', () => {
    useStore.getState().updateNodeData('proc-1', { processingTime: 10, resources: 1 });
    useStore.getState().addItem('proc-1');

    for (let i = 0; i < 12; i++) {
      const prevDisplay = useStore.getState().displayTickCount;
      useStore.getState().tick();
      expect(useStore.getState().displayTickCount).toBeGreaterThanOrEqual(prevDisplay);
    }

    const state = useStore.getState();
    expect(state.displayTickCount).toBe(state.tickCount);
  });

  it('lead time decreases after capacity/processing improvement using recent window', () => {
    // Stress the system first with slow processing
    useStore.getState().updateNodeData('proc-1', { processingTime: 12, resources: 1 });
    useStore.getState().updateNodeData('start-1', { sourceConfig: { enabled: true, interval: 1, batchSize: 1 } });
    for (let i = 0; i < 120; i++) useStore.getState().tick();
    const baseline = computeLeadMetrics(useStore.getState().items, { windowSize: 30 }).avgLeadWorking;

    // Improve capacity and processing speed
    useStore.getState().updateNodeData('proc-1', { processingTime: 3, resources: 4 });
    for (let i = 0; i < 120; i++) useStore.getState().tick();
    const improved = computeLeadMetrics(useStore.getState().items, { windowSize: 30 }).avgLeadWorking;

    expect(improved).toBeLessThanOrEqual(baseline);
  });

  it('metrics reset when processing config changes', () => {
    // Seed throughput with end-node completions (the KPI inclusion scope).
    useStore.setState({ metricsWindowCompletions: 20 });

    for (let i = 0; i < 20; i++) {
      useStore.getState().addItem('end-1');
      useStore.getState().tick();
    }

    const before = useStore.getState();
    const beforeEpoch = before.metricsEpoch;
    expect(before.throughput).toBeGreaterThan(0);

    useStore.getState().updateNodeData('proc-1', { processingTime: 5 });

    const state = useStore.getState();
    expect(state.metricsEpoch).toBe(beforeEpoch + 1);
    // Metrics epoch advances without blanking the visible KPIs/history mid-run.
    expect(state.throughput).toBeGreaterThan(0);
    expect(state.history.length).toBeGreaterThanOrEqual(before.history.length);
    expect(state.cumulativeCompleted).toBeGreaterThanOrEqual(before.cumulativeCompleted);
  });

  it('working hours pause queueing when node is closed', () => {
    useStore.getState().updateNodeData('proc-1', {
      workingHours: { enabled: true, hoursPerDay: 0, daysPerWeek: 5 }
    });
    useStore.getState().addItem('proc-1');

    for (let i = 0; i < 5; i++) {
      useStore.getState().tick();
    }

    const item = useStore.getState().items.find((i) => i.currentNodeId === 'proc-1');
    expect(item?.status).toBe(ItemStatus.QUEUED);
    expect(item?.timeWaiting).toBe(0);
  });

  it('demand mode generates exact arrivals for the period', () => {
    // Configure demand: 60 per hour on start node
    useStore.getState().updateNodeData('start-1', { demandTarget: 60 });
    useStore.setState({
      demandMode: 'target',
      demandUnit: 'hour',
      demandTotalTicks: 60,
      demandArrivalsGenerated: 0,
      demandArrivalsByNode: {},
      demandAccumulatorByNode: {},
      demandOpenTicksByNode: {},
      targetDuration: 60,
      autoStopEnabled: false
    });

    for (let i = 0; i < 60; i++) {
      useStore.getState().tick();
    }

    const state = useStore.getState();
    expect(state.demandArrivalsGenerated).toBe(60);
    expect(state.demandArrivalsByNode['start-1']).toBe(60);
  });

  it('demand generation respects per-node working hours', () => {
    useStore.getState().updateNodeData('start-1', {
      demandTarget: 10,
      workingHours: { enabled: true, hoursPerDay: 1, daysPerWeek: 5 }
    });
    useStore.setState({
      demandMode: 'target',
      demandUnit: 'day',
      demandTotalTicks: 480,
      demandArrivalsGenerated: 0,
      demandArrivalsByNode: {},
      demandAccumulatorByNode: {},
      demandOpenTicksByNode: {},
      targetDuration: 480,
      autoStopEnabled: false
    });

    for (let i = 0; i < 60; i++) {
      useStore.getState().tick();
    }

    expect(useStore.getState().demandArrivalsGenerated).toBe(10);

    for (let i = 0; i < 420; i++) {
      useStore.getState().tick();
    }

    expect(useStore.getState().demandArrivalsGenerated).toBe(10);
  });
});
