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

import { useStore } from '../store';
import { computeLeadMetrics } from '../metrics';

// Helper to reset store to a clean state before each test
const resetStore = () => {
  const store = useStore.getState();
  store.clearCanvas();
};

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
    cumulativeTransitTicks: 0,
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
    itemsByNode: new Map(),
    itemCounts: { wip: 0, completed: 0, failed: 0, queued: 0, processing: 0, transit: 0, stuck: 0 },
    autoInjectionEnabled: false,
  });
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

  it('addItem initializes VSM metric buckets to 0', () => {
    useStore.getState().addItem('proc-1');
    const item = useStore.getState().items[0];
    expect(item.timeActive).toBe(0);
    expect(item.timeWaiting).toBe(0);
    expect(item.timeTransit).toBe(0);
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

  it('tick increments totalTime for active items', () => {
    useStore.getState().addItem('proc-1');
    useStore.getState().tick();
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

  it('item transitions to TRANSIT after processing completes', () => {
    useStore.getState().addItem('proc-1');
    // Tick enough times: 1 to start processing + 3 for processing
    useStore.getState().tick(); // QUEUED -> PROCESSING (rem=3)
    useStore.getState().tick(); // rem=2
    useStore.getState().tick(); // rem=1
    useStore.getState().tick(); // rem=0 -> TRANSIT to end-1

    const item = useStore.getState().items[0];
    expect(item.status).toBe(ItemStatus.TRANSIT);
    expect(item.currentNodeId).toBe('end-1');
    expect(item.fromNodeId).toBe('proc-1');
  });

  it('item in transit decrements remainingTime and increments timeTransit', () => {
    useStore.getState().addItem('proc-1');
    // Get to transit
    for (let i = 0; i < 4; i++) useStore.getState().tick();

    const transitItem = useStore.getState().items[0];
    expect(transitItem.status).toBe(ItemStatus.TRANSIT);
    const transitTime = transitItem.remainingTime;

    useStore.getState().tick();
    const afterTick = useStore.getState().items[0];
    expect(afterTick.remainingTime).toBe(transitTime - 1);
    expect(afterTick.timeTransit).toBeGreaterThan(0);
  });

  it('item completes after transit to end node', () => {
    useStore.getState().addItem('proc-1');
    // Run enough ticks to process + transit + end node processing
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
    expect(item.timeTransit).toBeGreaterThanOrEqual(0);
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

describe('Store - Quality Control (Failure Path)', () => {
  const setupLowQualityFlow = () => {
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
      cumulativeTransitTicks: 0,
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
    itemsByNode: new Map(),
    itemCounts: { wip: 0, completed: 0, failed: 0, queued: 0, processing: 0, transit: 0, stuck: 0 },
    });
  };

  it('items with low quality produce failures over many runs', () => {
    let failedCount = 0;
    const runs = 30;

    for (let run = 0; run < runs; run++) {
      setupLowQualityFlow();
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

  it('setTimeUnit updates the time unit', () => {
    useStore.getState().setTimeUnit('hours');
    expect(useStore.getState().timeUnit).toBe('hours');
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

  it('setCountTransitInClock updates clock policy', () => {
    useStore.getState().setCountTransitInClock(true);
    expect(useStore.getState().countTransitInClock).toBe(true);
    useStore.getState().setCountTransitInClock(false);
    expect(useStore.getState().countTransitInClock).toBe(false);
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

  it('loadScenario("devops") loads the devops scenario', () => {
    useStore.getState().loadScenario('devops');
    const state = useStore.getState();
    // DevOps has 9 nodes (7 process/start/end + 2 annotations)
    expect(state.nodes.length).toBe(9);
    expect(state.edges.length).toBe(8);
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
    useStore.getState().tick();
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
    useStore.getState().tick();
    const node = useStore.getState().nodes.find(n => n.id === 'proc-1');
    expect((node!.data as any).validationError).toBe('Zero Capacity');
  });
});

describe('Store - Display Clock (cumulativeTransitTicks)', () => {
  beforeEach(() => setupLinearFlow());

  it('displayTickCount advances every tick when no items exist', () => {
    // With no items, no transit can happen, so displayTickCount = tickCount
    for (let i = 0; i < 10; i++) useStore.getState().tick();
    const state = useStore.getState();
    expect(state.tickCount).toBe(10);
    expect(state.displayTickCount).toBe(10);
    expect(state.cumulativeTransitTicks).toBe(0);
  });

  it('displayTickCount keeps advancing when items are processing and in transit', () => {
    // Add items to proc-1 (processingTime=3, resources=2)
    // This creates a flow where items process then transit to end-1
    useStore.getState().addItem('proc-1');
    useStore.getState().addItem('proc-1');
    useStore.getState().addItem('proc-1');

    // Run 50 ticks - items will be processing AND in transit simultaneously
    for (let i = 0; i < 50; i++) useStore.getState().tick();

    const state = useStore.getState();
    expect(state.tickCount).toBe(50);
    // The display clock must NOT get stuck - it should advance well beyond 2
    // With items processing concurrently with transit, most ticks have non-transit activity
    expect(state.displayTickCount).toBeGreaterThan(10);
  });

  it('displayTickCount does not freeze during continuous flow', () => {
    // Simulate a busy flow: keep adding items so processing + transit overlap
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

  it('cumulativeTransitTicks only increments when ALL active items are in transit', () => {
    // Add a single item. It will process (3 ticks), then transit, then complete.
    useStore.getState().addItem('proc-1');

    // Track transit tick increments
    let prevCumulativeTransit = 0;
    const transitIncrementTicks: number[] = [];

    for (let i = 0; i < 40; i++) {
      useStore.getState().tick();
      const state = useStore.getState();
      if (state.cumulativeTransitTicks > prevCumulativeTransit) {
        transitIncrementTicks.push(state.tickCount);
        prevCumulativeTransit = state.cumulativeTransitTicks;
      }
    }

    // Transit-only ticks should only happen when the single item is in transit
    // AND no other items are processing/queued. Since we have only 1 item,
    // the transit-only ticks should match when that item is in TRANSIT status.
    // There should be SOME transit-only ticks (when the single item is transiting alone)
    // but NOT every tick after the first transit.
    expect(transitIncrementTicks.length).toBeGreaterThan(0);
    expect(transitIncrementTicks.length).toBeLessThan(30);
  });

  it('displayTickCount equals tickCount when countTransitInClock is true', () => {
    useStore.setState({ countTransitInClock: true });
    useStore.getState().addItem('proc-1');
    for (let i = 0; i < 20; i++) useStore.getState().tick();

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
    useStore.setState({ autoInjectionEnabled: true, countTransitInClock: false });

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

  it('lead time equals active + waiting when transit is excluded from display clock', () => {
    // Minimize transit to a single tick for determinism
    useStore.getState().updateEdgeData('e2', { transitTime: 1 });
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
    expect(completed.timeWaiting).toBe(1); // queued on first tick before assignment
    expect(completed.timeTransit).toBe(1);
    // Display clock should match value-added + waiting (lead time without transit)
    expect(completedAtDisplay).toBe(completed.timeActive + completed.timeWaiting);
  });

  it('throughput over completion window matches expected rate', () => {
    // Instant processing, no routing -> complete immediately on assignment
    useStore.getState().updateNodeData('proc-1', { processingTime: 0, resources: 100 });
    // Remove outgoing edge to force completion
    useStore.setState({ edges: useStore.getState().edges.filter(e => e.source !== 'proc-1') });
    useStore.setState({ metricsWindowCompletions: 50 });

    for (let i = 0; i < 50; i++) {
      useStore.getState().addItem('proc-1');
      useStore.getState().tick();
    }

    const throughput = useStore.getState().throughput;
    // One completion per tick => ~60 per hour (completion window uses span between first/last)
    expect(throughput).toBeGreaterThanOrEqual(60);
    expect(throughput).toBeLessThanOrEqual(63);
  });

  it('throughput is not affected by transit duration', () => {
    const runWithTransit = (transitTime: number) => {
      setupLinearFlow();
      useStore.setState({ metricsWindowCompletions: 20 });
      useStore.getState().updateNodeData('proc-1', { processingTime: 0, resources: 100 });
      useStore.getState().updateEdgeData('e2', { transitTime });

      for (let i = 0; i < 20; i++) {
        useStore.getState().addItem('proc-1');
        useStore.getState().tick();
      }

      for (let i = 0; i < transitTime + 5; i++) {
        useStore.getState().tick();
      }

      return useStore.getState().throughput;
    };

    const throughputShort = runWithTransit(1);
    const throughputLong = runWithTransit(20);

    expect(Math.abs(throughputShort - throughputLong)).toBeLessThanOrEqual(1);
  });

  it('timeActive + timeWaiting + timeTransit equals totalTime for completed items', () => {
    useStore.getState().updateEdgeData('e2', { transitTime: 2 });
    useStore.getState().updateNodeData('proc-1', { processingTime: 4, resources: 1 });
    useStore.getState().addItem('proc-1');

    for (let i = 0; i < 12; i++) useStore.getState().tick();

    const completed = useStore.getState().items.find(i => i.status === ItemStatus.COMPLETED)!;
    expect(completed.timeActive + completed.timeWaiting + completed.timeTransit).toBe(completed.totalTime);
  });

  it('PCE derived from item times matches VAT/lead ratio', () => {
    useStore.getState().updateEdgeData('e2', { transitTime: 1 });
    useStore.getState().updateNodeData('proc-1', { processingTime: 4, resources: 1 });
    useStore.getState().addItem('proc-1');
    useStore.getState().addItem('proc-1'); // ensure waiting time exists for second item

    for (let i = 0; i < 40; i++) useStore.getState().tick();

    const items = useStore.getState().items.filter(i => i.status === ItemStatus.COMPLETED);
    expect(items.length).toBeGreaterThanOrEqual(2);
    // Use the second item to ensure waiting time > 0
    const target = items[1];
    const lead = Math.max(0, (target.completionTick! - target.spawnTick) - target.timeTransit);
    const pce = lead > 0 ? (target.timeActive / lead) * 100 : 0;
    // Lead should roughly equal VAT + NVAT (waiting here), off by at most 1 tick due to transition timing
    expect(Math.abs(lead - (target.timeActive + target.timeWaiting))).toBeLessThanOrEqual(1);
    expect(pce).toBeGreaterThanOrEqual(0);
    expect(pce).toBeLessThanOrEqual(100);
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
    expect(state.displayTickCount).toBe(state.tickCount - state.cumulativeTransitTicks);
  });

  it('lead time decreases after capacity/processing improvement using recent window', () => {
    // Stress the system first with slow processing
    useStore.getState().updateNodeData('proc-1', { processingTime: 12, resources: 1 });
    useStore.getState().updateNodeData('start-1', { sourceConfig: { enabled: true, interval: 1, batchSize: 1 } });
    for (let i = 0; i < 120; i++) useStore.getState().tick();
    const baseline = computeLeadMetrics(useStore.getState().items, { windowSize: 30 }).avgLeadTime;

    // Improve capacity and processing speed
    useStore.getState().updateNodeData('proc-1', { processingTime: 3, resources: 4 });
    for (let i = 0; i < 120; i++) useStore.getState().tick();
    const improved = computeLeadMetrics(useStore.getState().items, { windowSize: 30 }).avgLeadTime;

    expect(improved).toBeLessThanOrEqual(baseline);
  });

  it('metrics reset when processing config changes', () => {
    useStore.getState().updateNodeData('proc-1', { processingTime: 0, resources: 100 });
    // Remove outgoing edge to force completion on proc-1
    useStore.setState({ edges: useStore.getState().edges.filter(e => e.source !== 'proc-1') });

    for (let i = 0; i < 20; i++) {
      useStore.getState().addItem('proc-1');
      useStore.getState().tick();
    }

    const beforeEpoch = useStore.getState().metricsEpoch;
    expect(useStore.getState().throughput).toBeGreaterThan(0);

    useStore.getState().updateNodeData('proc-1', { processingTime: 5 });

    const state = useStore.getState();
    expect(state.metricsEpoch).toBe(beforeEpoch + 1);
    expect(state.throughput).toBe(0);
    expect(state.history.length).toBe(0);
    expect(state.cumulativeCompleted).toBe(0);
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
