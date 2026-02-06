import { create } from 'zustand';
import {
  Connection,
  Edge,
  EdgeChange,
  NodeChange,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
} from 'reactflow';
import {
  SimulationState,
  ProcessNode,
  StartNode,
  EndNode,
  AnnotationNode,
  AppNode,
  ProcessItem,
  ItemStatus,
  ProcessNodeData,
  HistoryEntry,
  ItemCounts,
  DURATION_PRESETS,
  SPEED_PRESETS,
  applyVariability,
  SavedCanvas,
  CanvasFlowData,
  DEMAND_UNIT_TICKS,
  DemandMode,
  DemandUnit,
  DEFAULT_WORKING_HOURS,
  WorkingHoursConfig,
} from './types';
import {
  computeTransitDuration,
  computeDisplayTickCount,
  DEFAULT_CLOCK_POLICY,
  computeOpenTicksForPeriod,
  isWorkingTick,
  normalizeWorkingHours,
} from './timeModel';
import { showToast } from './components/Toast';
import * as canvasStorage from './canvas-storage';
import { computeThroughputFromCompletions } from './metrics';

// Simple UUID generator
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const DEFAULT_SOURCE_CONFIG = { enabled: false, interval: 20, batchSize: 1 };
const createDefaultWorkingHours = (): WorkingHoursConfig => ({ ...DEFAULT_WORKING_HOURS });

const hasWorkingHoursChanged = (
  prev?: WorkingHoursConfig,
  next?: WorkingHoursConfig
): boolean => {
  const prevNorm = normalizeWorkingHours(prev);
  const nextNorm = normalizeWorkingHours(next);
  return (
    prevNorm.enabled !== nextNorm.enabled ||
    prevNorm.hoursPerDay !== nextNorm.hoursPerDay ||
    prevNorm.daysPerWeek !== nextNorm.daysPerWeek
  );
};

const hasRoutingWeightsChanged = (prev: Record<string, number> = {}, next: Record<string, number> = {}): boolean => {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) return true;
  for (const key of prevKeys) {
    if (prev[key] !== next[key]) return true;
  }
  return false;
};

const shouldResetMetricsForNodeData = (
  prev: ProcessNodeData,
  nextPartial: Partial<ProcessNodeData>
): boolean => {
  if ('processingTime' in nextPartial && nextPartial.processingTime !== prev.processingTime) return true;
  if ('resources' in nextPartial && nextPartial.resources !== prev.resources) return true;
  if ('quality' in nextPartial && nextPartial.quality !== prev.quality) return true;
  if ('variability' in nextPartial && nextPartial.variability !== prev.variability) return true;
  if ('demandTarget' in nextPartial && nextPartial.demandTarget !== prev.demandTarget) return true;
  if ('workingHours' in nextPartial) {
    const nextWorking = nextPartial.workingHours
      ? { ...(prev.workingHours || DEFAULT_WORKING_HOURS), ...nextPartial.workingHours }
      : prev.workingHours;
    if (hasWorkingHoursChanged(prev.workingHours, nextWorking)) return true;
  }
  if ('routingWeights' in nextPartial && hasRoutingWeightsChanged(prev.routingWeights, nextPartial.routingWeights || {})) return true;
  if ('sourceConfig' in nextPartial) {
    const prevSource = prev.sourceConfig || DEFAULT_SOURCE_CONFIG;
    const nextSource = { ...prevSource, ...(nextPartial.sourceConfig || {}) };
    if (
      nextSource.enabled !== prevSource.enabled ||
      nextSource.interval !== prevSource.interval ||
      nextSource.batchSize !== prevSource.batchSize
    ) {
      return true;
    }
  }
  return false;
};

const buildMetricsReset = (state: SimulationState) => ({
  metricsEpoch: state.metricsEpoch + 1,
  metricsEpochTick: state.tickCount,
  throughput: 0,
  history: [],
  cumulativeCompleted: 0
});

const getDemandDurationPreset = (unit: DemandUnit): string => {
  switch (unit) {
    case 'hour': return '1hour';
    case 'day': return '1day';
    case 'week': return '1week';
    case 'month': return '1month';
  }
};


const getNextNodeId = (sourceNode: ProcessNode | StartNode, nodes: AppNode[], edges: Edge[]): string | null => {
  const outgoingEdges = edges.filter((edge) => edge.source === sourceNode.id);
  
  if (outgoingEdges.length === 0) return null;
  if (outgoingEdges.length === 1) return outgoingEdges[0].target;

  // Weighted Random Logic
  const weights = sourceNode.data.routingWeights || {};
  
  // Create a map of targetId -> weight (default to 1 if not set)
  const choices = outgoingEdges.map(edge => ({
    targetId: edge.target,
    weight: weights[edge.target] !== undefined ? weights[edge.target] : 1
  }));

  const totalWeight = choices.reduce((sum, choice) => sum + choice.weight, 0);
  let random = Math.random() * totalWeight;

  for (const choice of choices) {
    if (random < choice.weight) {
      return choice.targetId;
    }
    random -= choice.weight;
  }

  return outgoingEdges[outgoingEdges.length - 1].target; // Fallback
};

// --- SCENARIO DATA ---

const SCENARIOS = {
  'empty': { nodes: [], edges: [] },
  'devops': {
    nodes: [
      { id: 'start', type: 'startNode', position: { x: 50, y: 150 }, data: { label: 'Backlog Input', processingTime: 2, resources: 1, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {}, sourceConfig: { enabled: true, interval: 20, batchSize: 1 } } },

      { id: 'design', type: 'processNode', position: { x: 450, y: 150 }, data: { label: 'UX/UI Design', processingTime: 8, resources: 2, quality: 0.95, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'dev', type: 'processNode', position: { x: 850, y: 150 }, data: { label: 'Development', processingTime: 15, resources: 4, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'review', type: 'processNode', position: { x: 1250, y: 150 }, data: { label: 'Code Review', processingTime: 5, resources: 2, quality: 0.80, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'dev': 1, 'qa': 4 } } },

      { id: 'qa', type: 'processNode', position: { x: 1650, y: 150 }, data: { label: 'QA Testing', processingTime: 10, resources: 3, quality: 0.90, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'dev': 1, 'deploy': 5 } } },
      { id: 'deploy', type: 'processNode', position: { x: 2050, y: 150 }, data: { label: 'Deployment', processingTime: 3, resources: 1, quality: 0.99, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },

      { id: 'end-live', type: 'endNode', position: { x: 2450, y: 150 }, data: { label: 'Live Production', processingTime: 0, resources: 999, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },

      { id: 'note1', type: 'annotationNode', position: { x: 1250, y: 420 }, data: { label: '20% of PRs fail review and return to Dev (Rework Loop)' } },
      { id: 'note2', type: 'annotationNode', position: { x: 1650, y: 420 }, data: { label: '10% of tickets fail QA and return to Dev' } },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'design', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e2', source: 'design', target: 'dev', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e3', source: 'dev', target: 'review', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e4-pass', source: 'review', target: 'qa', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e4-fail', source: 'review', target: 'dev', type: 'processEdge', animated: false, style: { stroke: '#f87171' }, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e5-pass', source: 'qa', target: 'deploy', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e5-fail', source: 'qa', target: 'dev', type: 'processEdge', animated: false, style: { stroke: '#f87171' }, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e6', source: 'deploy', target: 'end-live', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
    ]
  },
  'hospital': {
    nodes: [
      { id: 'start-triage', type: 'startNode', position: { x: 50, y: 200 }, data: { label: 'Patient Arrival', processingTime: 3, resources: 2, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'wait': 7, 'critical': 3 }, sourceConfig: { enabled: true, interval: 15, batchSize: 1 } } },
      { id: 'wait', type: 'processNode', position: { x: 450, y: 50 }, data: { label: 'Waiting Room', processingTime: 1, resources: 50, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },

      { id: 'critical', type: 'processNode', position: { x: 450, y: 350 }, data: { label: 'Trauma Bay', processingTime: 20, resources: 2, quality: 0.95, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'nurse', type: 'processNode', position: { x: 850, y: 50 }, data: { label: 'Nurse Assessment', processingTime: 8, resources: 4, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'doctor', type: 'processNode', position: { x: 1250, y: 200 }, data: { label: 'Doctor Consult', processingTime: 12, resources: 3, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'labs': 6, 'discharge': 4 } } },
      { id: 'labs', type: 'processNode', position: { x: 1650, y: 350 }, data: { label: 'Labs / X-Ray', processingTime: 25, resources: 2, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'treatment': 1 } } },
      { id: 'treatment', type: 'processNode', position: { x: 2050, y: 350 }, data: { label: 'Treatment', processingTime: 15, resources: 5, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'discharge': 1 } } },
      { id: 'discharge', type: 'processNode', position: { x: 2050, y: 50 }, data: { label: 'Discharge Admin', processingTime: 5, resources: 2, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'end-home', type: 'endNode', position: { x: 2450, y: 200 }, data: { label: 'Sent Home', processingTime: 0, resources: 999, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },

      { id: 'note1', type: 'annotationNode', position: { x: 450, y: 560 }, data: { label: '30% Critical Cases skip Waiting Room' } },
      { id: 'note2', type: 'annotationNode', position: { x: 1650, y: 560 }, data: { label: 'Labs act as a major bottleneck' } },
    ],
    edges: [
      { id: 'e1', source: 'start-triage', target: 'wait', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e2', source: 'start-triage', target: 'critical', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e3', source: 'critical', target: 'doctor', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e4', source: 'wait', target: 'nurse', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e5', source: 'nurse', target: 'doctor', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e6', source: 'doctor', target: 'labs', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e7', source: 'doctor', target: 'discharge', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e8', source: 'labs', target: 'treatment', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e9', source: 'treatment', target: 'discharge', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e10', source: 'discharge', target: 'end-home', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
    ]
  },
  'manufacturing': {
    nodes: [
      { id: 'start-raw', type: 'startNode', position: { x: 50, y: 150 }, data: { label: 'Raw Materials', processingTime: 1, resources: 1, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {}, sourceConfig: { enabled: true, interval: 10, batchSize: 5 } } },
      { id: 'cut', type: 'processNode', position: { x: 450, y: 150 }, data: { label: 'Cutting & Machining', processingTime: 8, resources: 3, quality: 0.98, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },

      { id: 'weld', type: 'processNode', position: { x: 850, y: 150 }, data: { label: 'Welding', processingTime: 12, resources: 2, quality: 0.95, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'paint', type: 'processNode', position: { x: 1250, y: 150 }, data: { label: 'Painting', processingTime: 15, resources: 1, quality: 0.99, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'dry', type: 'processNode', position: { x: 1650, y: 150 }, data: { label: 'Drying Oven', processingTime: 20, resources: 10, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'assembly', type: 'processNode', position: { x: 2050, y: 150 }, data: { label: 'Final Assembly', processingTime: 10, resources: 4, quality: 0.99, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },

      { id: 'qc', type: 'processNode', position: { x: 2450, y: 150 }, data: { label: 'Quality Control', processingTime: 5, resources: 2, quality: 0.90, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'ship': 9, 'scrap': 1 } } },
      { id: 'ship', type: 'processNode', position: { x: 2850, y: 50 }, data: { label: 'Shipping', processingTime: 2, resources: 2, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'end-customer', type: 'endNode', position: { x: 3250, y: 150 }, data: { label: 'Customer', processingTime: 0, resources: 999, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'scrap', type: 'endNode', position: { x: 2850, y: 350 }, data: { label: 'Recycle Bin', processingTime: 0, resources: 999, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },

      { id: 'note1', type: 'annotationNode', position: { x: 1250, y: 420 }, data: { label: 'Painting is a specific bottleneck' } },
    ],
    edges: [
      { id: 'e1', source: 'start-raw', target: 'cut', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e2', source: 'cut', target: 'weld', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e3', source: 'weld', target: 'paint', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e4', source: 'paint', target: 'dry', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e5', source: 'dry', target: 'assembly', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e6', source: 'assembly', target: 'qc', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e7', source: 'qc', target: 'ship', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e8', source: 'qc', target: 'scrap', type: 'processEdge', animated: false, style: { stroke: '#ef4444' }, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e9', source: 'ship', target: 'end-customer', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
    ]
  }
};

const initialNodes: AppNode[] = SCENARIOS['devops'].nodes as AppNode[];
const initialEdges: Edge[] = SCENARIOS['devops'].edges as Edge[];

// Helper: Build itemsByNode map and counts in single pass
const computeDerivedState = (items: ProcessItem[]) => {
  const itemsByNode = new Map<string, ProcessItem[]>();
  let wip = 0, completed = 0, failed = 0;
  let queued = 0, processing = 0, transit = 0, stuck = 0;

  for (const item of items) {
    if (item.status === ItemStatus.COMPLETED) {
      completed++;
    } else if (item.status === ItemStatus.FAILED) {
      failed++;
    } else {
      wip++;
      if (!item.currentNodeId) {
        stuck++;
        continue;
      }
      if (item.status === ItemStatus.QUEUED) {
        queued++;
      } else if (item.status === ItemStatus.PROCESSING) {
        processing++;
      } else if (item.status === ItemStatus.TRANSIT) {
        transit++;
      } else {
        stuck++;
      }

      const nodeItems = itemsByNode.get(item.currentNodeId);
      if (nodeItems) {
        nodeItems.push(item);
      } else {
        itemsByNode.set(item.currentNodeId, [item]);
      }
    }
  }

  return { itemsByNode, itemCounts: { wip, completed, failed, queued, processing, transit, stuck } };
};

export const useStore = create<SimulationState>((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  items: [],
  isRunning: false,
  tickSpeed: 100,
  tickCount: 0,
  cumulativeCompleted: 0,
  throughput: 0,
  cumulativeTransitTicks: 0,
  displayTickCount: 0,
  countTransitInClock: DEFAULT_CLOCK_POLICY.countTransitInClock,
  history: [],
  metricsEpoch: 0,
  metricsEpochTick: 0,
  metricsWindowCompletions: 50,
  demandMode: 'auto',
  demandUnit: 'week',
  demandTotalTicks: DEMAND_UNIT_TICKS.week,
  demandArrivalsGenerated: 0,
  demandArrivalsByNode: {},
  demandAccumulatorByNode: {},
  demandOpenTicksByNode: {},
  periodCompleted: 0,

  // Performance: Pre-computed derived state
  itemsByNode: new Map(),
  itemCounts: { wip: 0, completed: 0, failed: 0, queued: 0, processing: 0, transit: 0, stuck: 0 },

  // Default Item Config
  itemConfig: {
    color: '#ec4899', // pink-500
    shape: 'circle',
    icon: 'none'
  },

  // Default node header color
  defaultHeaderColor: '#64748b', // Slate

  // Auto Injection (Master Switch)
  autoInjectionEnabled: true,

  // Time unit for VSM metrics display
  timeUnit: 'minutes',

  // Real-time simulation configuration
  durationPreset: 'unlimited',
  targetDuration: Infinity,
  speedPreset: '1x',
  ticksPerSecond: 60,
  simulationProgress: 0,
  autoStopEnabled: true,

  // Canvas identity
  currentCanvasId: null,
  currentCanvasName: 'Untitled Canvas',
  savedCanvasList: [],

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setItemConfig: (config) => set(state => ({ itemConfig: { ...state.itemConfig, ...config } })),
  setDefaultHeaderColor: (color) => set({ defaultHeaderColor: color }),
  setTimeUnit: (unit) => set({ timeUnit: unit }),
  setMetricsWindowCompletions: (count) => {
    if (!Number.isFinite(count) || count <= 0) return;
    set({ metricsWindowCompletions: Math.round(count) });
  },
  setDemandMode: (mode: DemandMode) => {
    set((state) => {
      if (mode === state.demandMode) return state;
      const demandTotalTicks = DEMAND_UNIT_TICKS[state.demandUnit];
      const durationPreset = mode === 'target' ? getDemandDurationPreset(state.demandUnit) : state.durationPreset;
      const targetDuration = mode === 'target' ? demandTotalTicks : state.targetDuration;
      return {
        demandMode: mode,
        demandTotalTicks,
        durationPreset,
        targetDuration,
        autoStopEnabled: mode === 'target' ? true : state.autoStopEnabled,
        demandArrivalsGenerated: 0,
        demandArrivalsByNode: {},
        demandAccumulatorByNode: {},
        demandOpenTicksByNode: {},
        periodCompleted: 0,
        items: [],
        history: [],
        cumulativeCompleted: 0,
        throughput: 0,
        tickCount: 0,
        displayTickCount: 0,
        cumulativeTransitTicks: 0,
        metricsEpoch: 0,
        metricsEpochTick: 0
      };
    });
  },
  setDemandUnit: (unit: DemandUnit) => {
    set((state) => {
      if (unit === state.demandUnit) return state;
      const demandTotalTicks = DEMAND_UNIT_TICKS[unit];
      const durationPreset = state.demandMode === 'target' ? getDemandDurationPreset(unit) : state.durationPreset;
      const targetDuration = state.demandMode === 'target' ? demandTotalTicks : state.targetDuration;
      return {
        demandUnit: unit,
        demandTotalTicks,
        durationPreset,
        targetDuration,
        demandArrivalsGenerated: 0,
        demandArrivalsByNode: {},
        demandAccumulatorByNode: {},
        demandOpenTicksByNode: {},
        periodCompleted: 0,
        items: [],
        history: [],
        cumulativeCompleted: 0,
        throughput: 0,
        tickCount: 0,
        displayTickCount: 0,
        cumulativeTransitTicks: 0,
        metricsEpoch: 0,
        metricsEpochTick: 0
      };
    });
  },

  setDurationPreset: (preset: string) => {
    const presetConfig = DURATION_PRESETS[preset];
    if (!presetConfig) return;
    set({
      durationPreset: preset,
      targetDuration: presetConfig.totalTicks,
      // Recalculate progress based on current tickCount
      simulationProgress: presetConfig.totalTicks === Infinity
        ? 0
        : Math.min(100, (get().tickCount / presetConfig.totalTicks) * 100)
    });
  },

  setSpeedPreset: (preset: string) => {
    const speedConfig = SPEED_PRESETS.find(s => s.key === preset);
    if (!speedConfig) return;
    set({
      speedPreset: preset,
      ticksPerSecond: speedConfig.ticksPerSecond
    });
  },

  setAutoStop: (enabled: boolean) => set({ autoStopEnabled: enabled }),

  setCountTransitInClock: (count: boolean) => set({ countTransitInClock: count }),

  onNodesChange: (changes: NodeChange[]) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes) as AppNode[],
    });
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },

  connect: (connection: Connection) => {
    set({
      edges: addEdge({
        ...connection,
        type: 'processEdge',
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed }
      }, get().edges),
    });
  },

  deleteEdge: (id: string) => {
    set({
        edges: get().edges.filter(e => e.id !== id)
    });
  },

  updateEdgeData: (id: string, data: Record<string, any>) => {
    set((state) => {
      const edge = state.edges.find(e => e.id === id);
      const prevTransit = (edge as any)?.data?.transitTime;
      const nextTransit = data?.transitTime;
      const transitChanged = Object.prototype.hasOwnProperty.call(data, 'transitTime') && nextTransit !== prevTransit;

      const nextEdges = state.edges.map(e =>
        e.id === id ? { ...e, data: { ...(e as any).data, ...data } } : e
      );

      if (!transitChanged) {
        return { edges: nextEdges };
      }

      return { edges: nextEdges, ...buildMetricsReset(state) };
    });
  },

  reconnectEdge: (oldEdge: Edge, newConnection: Connection) => {
    // Replace the old edge with a new connection
    const { edges } = get();
    const filteredEdges = edges.filter(e => e.id !== oldEdge.id);
    set({
      edges: addEdge({
        ...newConnection,
        type: 'processEdge',
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed }
      }, filteredEdges),
    });
  },

  deleteNode: (id: string) => {
    const { nodes, edges, items } = get();
    const nodeToDelete = nodes.find(n => n.id === id);
    
    if (!nodeToDelete) return;

    const updatedNodes = nodes.filter(n => n.id !== id);

    // Remove connected edges
    const updatedEdges = edges.filter(e => e.source !== id && e.target !== id);

    // Remove items in this node
    const updatedItems = items.filter(i => i.currentNodeId !== id && i.fromNodeId !== id);

    set({
        nodes: updatedNodes,
        edges: updatedEdges,
        items: updatedItems
    });
  },

  addNode: () => {
    const id = generateId();
    const newNode: ProcessNode = {
      id,
      type: 'processNode',
      position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
      data: {
        label: `Station ${get().nodes.filter(n => n.type === 'processNode').length + 1}`,
        processingTime: 10,
        resources: 1,
        quality: 1.0,
        variability: 0,
        stats: { processed: 0, failed: 0, maxQueue: 0 },
        routingWeights: {},
        sourceConfig: { enabled: false, interval: 20, batchSize: 1 },
        workingHours: createDefaultWorkingHours()
      },
    };
    set({ nodes: [...get().nodes, newNode] });
  },

  addStartNode: () => {
      const id = generateId();
      const newNode: StartNode = {
        id,
        type: 'startNode',
        position: { x: 100, y: 100 },
        data: {
          label: 'Start',
          processingTime: 2,
          resources: 1,
          quality: 1.0,
          variability: 0,
          stats: { processed: 0, failed: 0, maxQueue: 0 },
          routingWeights: {},
          demandTarget: 0,
          sourceConfig: { enabled: true, interval: 20, batchSize: 5 }, // Enabled by default
          workingHours: createDefaultWorkingHours()
        },
      };
      set({ nodes: [...get().nodes, newNode] });
  },

  addEndNode: () => {
      const id = generateId();
      const newNode: EndNode = {
        id,
        type: 'endNode',
        position: { x: 500, y: 100 },
        data: {
          label: 'End',
          processingTime: 0, // Instant
          resources: 999, // Infinite capacity
          quality: 1.0,
          variability: 0,
          stats: { processed: 0, failed: 0, maxQueue: 0 },
          routingWeights: {},
          sourceConfig: { enabled: false, interval: 0, batchSize: 0 },
          workingHours: createDefaultWorkingHours()
        },
      };
      set({ nodes: [...get().nodes, newNode] });
  },

  addAnnotation: () => {
    const id = generateId();
    const newNode: AnnotationNode = {
      id,
      type: 'annotationNode',
      position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
      data: {
        label: 'New Annotation',
      },
    };
    set({ nodes: [...get().nodes, newNode] });
  },

  updateNodeData: (id, data) => {
    set((state) => {
      const prevNode = state.nodes.find((node) => node.id === id);
      const isProcessNode = prevNode && (prevNode.type === 'processNode' || prevNode.type === 'startNode' || prevNode.type === 'endNode');
      const shouldReset = !!(isProcessNode && prevNode && shouldResetMetricsForNodeData(prevNode.data as ProcessNodeData, data as Partial<ProcessNodeData>));

      const nextNodes = state.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...data } } : node
      );

      if (!shouldReset) {
        return { nodes: nextNodes };
      }

      return { nodes: nextNodes, ...buildMetricsReset(state) };
    });
  },

  updateNode: (id, partialNode) => {
    set({
        nodes: get().nodes.map(n => n.id === id ? { ...n, ...partialNode } : n)
    });
  },

  startSimulation: () => set({ isRunning: true }),
  pauseSimulation: () => set({ isRunning: false }),
  stepSimulation: () => {
      // Manual step: pause first if running, then tick
      set({ isRunning: false });
      get().tick();
  },
  
  resetSimulation: () => {
    set((state) => ({
      isRunning: false,
      tickCount: 0,
      cumulativeCompleted: 0,
      throughput: 0,
      cumulativeTransitTicks: 0,
      displayTickCount: 0,
      items: [],
      history: [],
      metricsEpoch: 0,
      metricsEpochTick: 0,
      demandArrivalsGenerated: 0,
      demandArrivalsByNode: {},
      demandAccumulatorByNode: {},
      demandOpenTicksByNode: {},
      periodCompleted: 0,
      simulationProgress: 0, // Reset progress but preserve duration/speed settings
      itemsByNode: new Map(),
      itemCounts: { wip: 0, completed: 0, failed: 0, queued: 0, processing: 0, transit: 0, stuck: 0 },
      nodes: state.nodes.map(n => {
        if (n.type === 'processNode' || n.type === 'startNode' || n.type === 'endNode') {
            return {
                ...n,
                data: { ...n.data, stats: { processed: 0, failed: 0, maxQueue: 0 }, validationError: undefined }
            } as AppNode;
        }
        return n;
      })
    }));
  },

  clearCanvas: () => {
    set({ 
        nodes: [], 
        edges: [], 
        items: [], 
        history: [],
        isRunning: false, 
        tickCount: 0,
        cumulativeCompleted: 0,
        throughput: 0,
        cumulativeTransitTicks: 0,
        displayTickCount: 0,
        metricsEpoch: 0,
        metricsEpochTick: 0,
        demandArrivalsGenerated: 0,
        demandArrivalsByNode: {},
        demandAccumulatorByNode: {},
        demandOpenTicksByNode: {},
        periodCompleted: 0,
        itemsByNode: new Map(),
        itemCounts: { wip: 0, completed: 0, failed: 0, queued: 0, processing: 0, transit: 0, stuck: 0 }
    });
  },

  setTickSpeed: (tickSpeed) => set({ tickSpeed }),
  
  toggleAutoInjection: () => set((state) => ({ autoInjectionEnabled: !state.autoInjectionEnabled })),

  addItem: (targetNodeId) => {
    const currentTick = get().tickCount;
    const metricsEpoch = get().metricsEpoch;
    const newItem: ProcessItem = {
      id: generateId(),
      currentNodeId: targetNodeId,
      fromNodeId: null,
      status: ItemStatus.QUEUED,
      progress: 0,
      remainingTime: 0,
      processingDuration: 0,
      totalTime: 0,
      nodeEnterTick: currentTick,
      metricsEpoch,
      timeActive: 0,
      timeWaiting: 0,
      timeTransit: 0,
      spawnTick: currentTick,
      completionTick: null,
      terminalNodeId: null,
      transitProgress: 0
    };
    set({ items: [...get().items, newItem] });
  },

  clearItems: () => set({ items: [] }),

  // Persistence
  saveFlow: () => {
    const { nodes, edges, itemConfig, defaultHeaderColor, durationPreset, speedPreset, autoStopEnabled, countTransitInClock, metricsWindowCompletions, demandMode, demandUnit } = get();
    const flow = { nodes, edges, itemConfig, defaultHeaderColor, durationPreset, speedPreset, autoStopEnabled, countTransitInClock, metricsWindowCompletions, demandMode, demandUnit };
    localStorage.setItem('processFlowData', JSON.stringify(flow));
    showToast('success', 'Flow saved to browser storage');
  },

  loadFlow: () => {
    const flowStr = localStorage.getItem('processFlowData');
    if (flowStr) {
      const flow = JSON.parse(flowStr);
      if (flow.nodes && flow.edges) {
          const durationConfig = DURATION_PRESETS[flow.durationPreset] || DURATION_PRESETS['unlimited'];
          const speedConfig = SPEED_PRESETS.find(s => s.key === flow.speedPreset) || SPEED_PRESETS[1]; // Default to 1x
          const demandMode = (flow.demandMode as DemandMode) || 'auto';
          const demandUnit = (flow.demandUnit as DemandUnit) || 'week';
          const demandTotalTicks = DEMAND_UNIT_TICKS[demandUnit];
          const legacyWindow = Number.isFinite((flow as any).metricsWindowTicks) ? (flow as any).metricsWindowTicks : undefined;
          set({
              nodes: flow.nodes,
              edges: flow.edges,
              itemConfig: flow.itemConfig || get().itemConfig,
              defaultHeaderColor: flow.defaultHeaderColor || get().defaultHeaderColor,
              durationPreset: flow.durationPreset || 'unlimited',
              targetDuration: durationConfig.totalTicks,
              speedPreset: flow.speedPreset || '1x',
              ticksPerSecond: speedConfig.ticksPerSecond,
              autoStopEnabled: flow.autoStopEnabled !== undefined ? flow.autoStopEnabled : true,
              countTransitInClock: flow.countTransitInClock !== undefined ? flow.countTransitInClock : DEFAULT_CLOCK_POLICY.countTransitInClock,
              metricsWindowCompletions: Number.isFinite(flow.metricsWindowCompletions)
                ? flow.metricsWindowCompletions
                : (legacyWindow ?? get().metricsWindowCompletions),
              demandMode,
              demandUnit,
              demandTotalTicks,
              items: [],
              isRunning: false,
              tickCount: 0,
              displayTickCount: 0,
              cumulativeTransitTicks: 0,
              cumulativeCompleted: 0,
              throughput: 0,
              simulationProgress: 0,
              history: [],
              metricsEpoch: 0,
              metricsEpochTick: 0,
              demandArrivalsGenerated: 0,
              demandArrivalsByNode: {},
              demandAccumulatorByNode: {},
              demandOpenTicksByNode: {},
              periodCompleted: 0,
              itemsByNode: new Map(),
              itemCounts: { wip: 0, completed: 0, failed: 0, queued: 0, processing: 0, transit: 0, stuck: 0 }
            });
          showToast('success', 'Flow loaded successfully');
      }
    } else {
        showToast('warning', 'No saved flow found');
    }
  },

  exportJson: () => {
      const { nodes, edges, itemConfig, defaultHeaderColor } = get();
      const dataStr = JSON.stringify({ nodes, edges, itemConfig, defaultHeaderColor }, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const exportFileDefaultName = 'process_flow.json';
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
  },

  importJson: (fileContent) => {
      try {
        const flow = JSON.parse(fileContent);
        if (flow.nodes && flow.edges) {
            set({
                nodes: flow.nodes,
                edges: flow.edges,
                itemConfig: flow.itemConfig || get().itemConfig,
                defaultHeaderColor: flow.defaultHeaderColor || get().defaultHeaderColor,
                items: [],
                isRunning: false,
                tickCount: 0,
                displayTickCount: 0,
                cumulativeTransitTicks: 0,
                cumulativeCompleted: 0,
                throughput: 0,
                history: [],
                metricsEpoch: 0,
                metricsEpochTick: 0,
                demandMode: 'auto',
                demandUnit: 'week',
                demandTotalTicks: DEMAND_UNIT_TICKS.week,
                demandArrivalsGenerated: 0,
                demandArrivalsByNode: {},
                demandAccumulatorByNode: {},
                demandOpenTicksByNode: {},
                periodCompleted: 0,
                itemsByNode: new Map(),
                itemCounts: { wip: 0, completed: 0, failed: 0, queued: 0, processing: 0, transit: 0, stuck: 0 }
            });
            showToast('success', 'Flow imported successfully');
        } else {
            showToast('error', 'Invalid JSON structure');
        }
      } catch (e) {
          showToast('error', 'Failed to parse JSON file');
      }
  },
  
  loadScenario: (scenarioKey) => {
      const scenario = SCENARIOS[scenarioKey as keyof typeof SCENARIOS];
      if (scenario) {
          set({ 
              nodes: JSON.parse(JSON.stringify(scenario.nodes)), // Deep copy
              edges: JSON.parse(JSON.stringify(scenario.edges)),
              items: [],
              isRunning: false,
              tickCount: 0,
              displayTickCount: 0,
              cumulativeTransitTicks: 0,
              cumulativeCompleted: 0,
              throughput: 0,
              history: [],
              demandMode: 'auto',
              demandUnit: 'week',
              demandTotalTicks: DEMAND_UNIT_TICKS.week,
              demandArrivalsGenerated: 0,
              demandArrivalsByNode: {},
              demandAccumulatorByNode: {},
              demandOpenTicksByNode: {},
              periodCompleted: 0,
              metricsEpoch: 0,
              metricsEpochTick: 0,
              itemsByNode: new Map(),
              itemCounts: { wip: 0, completed: 0, failed: 0, queued: 0, processing: 0, transit: 0, stuck: 0 }
          });
      }
  },

  // --- Canvas Management ---

  refreshCanvasList: async () => {
    try {
      const list = await canvasStorage.getAllCanvases();
      set({ savedCanvasList: list });
    } catch (e) {
      showToast('error', 'Failed to load canvas list');
    }
  },

  saveCanvasToDb: async () => {
    const { nodes, edges, itemConfig, defaultHeaderColor, durationPreset, speedPreset, autoStopEnabled, countTransitInClock, metricsWindowCompletions, demandMode, demandUnit, currentCanvasId, currentCanvasName } = get();
    const now = Date.now();
    const id = currentCanvasId || generateId();
    const canvas: SavedCanvas = {
      id,
      name: currentCanvasName,
      createdAt: now,
      updatedAt: now,
      data: { nodes, edges, itemConfig, defaultHeaderColor, durationPreset, speedPreset, autoStopEnabled, countTransitInClock, metricsWindowCompletions, demandMode, demandUnit },
    };

    // If updating, preserve original createdAt
    if (currentCanvasId) {
      try {
        const existing = await canvasStorage.getCanvas(currentCanvasId);
        if (existing) canvas.createdAt = existing.createdAt;
      } catch { /* use now */ }
    }

    try {
      await canvasStorage.saveCanvas(canvas);
      canvasStorage.setLastCanvasId(id);
      set({ currentCanvasId: id });
      const list = await canvasStorage.getAllCanvases();
      set({ savedCanvasList: list });
      showToast('success', `Canvas "${currentCanvasName}" saved`);
    } catch (e) {
      showToast('error', 'Failed to save canvas');
    }
  },

  loadCanvasFromDb: async (id: string) => {
    try {
      const canvas = await canvasStorage.getCanvas(id);
      if (!canvas) {
        showToast('error', 'Canvas not found');
        return;
      }
      const { data } = canvas;
      const durationConfig = DURATION_PRESETS[data.durationPreset] || DURATION_PRESETS['unlimited'];
      const speedConfig = SPEED_PRESETS.find(s => s.key === data.speedPreset) || SPEED_PRESETS[1];
      const legacyWindow = Number.isFinite((data as any).metricsWindowTicks) ? (data as any).metricsWindowTicks : undefined;
      const demandMode = (data.demandMode as DemandMode) || 'auto';
      const demandUnit = (data.demandUnit as DemandUnit) || 'week';
      const demandTotalTicks = DEMAND_UNIT_TICKS[demandUnit];
      set({
        nodes: data.nodes,
        edges: data.edges,
        itemConfig: data.itemConfig || get().itemConfig,
        defaultHeaderColor: data.defaultHeaderColor || get().defaultHeaderColor,
        durationPreset: data.durationPreset || 'unlimited',
        targetDuration: durationConfig.totalTicks,
        speedPreset: data.speedPreset || '1x',
        ticksPerSecond: speedConfig.ticksPerSecond,
        autoStopEnabled: data.autoStopEnabled !== undefined ? data.autoStopEnabled : true,
        countTransitInClock: data.countTransitInClock !== undefined ? data.countTransitInClock : DEFAULT_CLOCK_POLICY.countTransitInClock,
        metricsWindowCompletions: Number.isFinite(data.metricsWindowCompletions)
          ? data.metricsWindowCompletions
          : (legacyWindow ?? get().metricsWindowCompletions),
        demandMode,
        demandUnit,
        demandTotalTicks,
        currentCanvasId: canvas.id,
        currentCanvasName: canvas.name,
        items: [],
        isRunning: false,
        tickCount: 0,
        displayTickCount: 0,
        cumulativeTransitTicks: 0,
        cumulativeCompleted: 0,
        throughput: 0,
        simulationProgress: 0,
        history: [],
        metricsEpoch: 0,
        metricsEpochTick: 0,
        demandArrivalsGenerated: 0,
        demandArrivalsByNode: {},
        demandAccumulatorByNode: {},
        demandOpenTicksByNode: {},
        periodCompleted: 0,
        itemsByNode: new Map(),
        itemCounts: { wip: 0, completed: 0, failed: 0, queued: 0, processing: 0, transit: 0, stuck: 0 },
      });
      canvasStorage.setLastCanvasId(canvas.id);
      showToast('success', `Loaded "${canvas.name}"`);
    } catch (e) {
      showToast('error', 'Failed to load canvas');
    }
  },

  newCanvas: () => {
    set({
      nodes: [],
      edges: [],
      items: [],
      isRunning: false,
      tickCount: 0,
      displayTickCount: 0,
      cumulativeTransitTicks: 0,
      cumulativeCompleted: 0,
      throughput: 0,
      simulationProgress: 0,
      history: [],
      metricsEpoch: 0,
      metricsEpochTick: 0,
      demandArrivalsGenerated: 0,
      demandArrivalsByNode: {},
      demandAccumulatorByNode: {},
      demandOpenTicksByNode: {},
      periodCompleted: 0,
      itemsByNode: new Map(),
      itemCounts: { wip: 0, completed: 0, failed: 0, queued: 0, processing: 0, transit: 0, stuck: 0 },
      currentCanvasId: null,
      currentCanvasName: 'Untitled Canvas',
    });
    canvasStorage.setLastCanvasId(null);
  },

  renameCurrentCanvas: async (name: string) => {
    const { currentCanvasId } = get();
    set({ currentCanvasName: name });
    if (currentCanvasId) {
      try {
        await canvasStorage.renameCanvas(currentCanvasId, name);
        const list = await canvasStorage.getAllCanvases();
        set({ savedCanvasList: list });
      } catch (e) {
        showToast('error', 'Failed to rename canvas');
      }
    }
  },

  deleteCanvasFromDb: async (id: string) => {
    try {
      await canvasStorage.deleteCanvas(id);
      const list = await canvasStorage.getAllCanvases();
      set({ savedCanvasList: list });
      // If we deleted the current canvas, reset identity
      if (get().currentCanvasId === id) {
        set({ currentCanvasId: null, currentCanvasName: 'Untitled Canvas' });
        canvasStorage.setLastCanvasId(null);
      }
      showToast('success', 'Canvas deleted');
    } catch (e) {
      showToast('error', 'Failed to delete canvas');
    }
  },

  tick: () => {
    set((state) => {
      const {
        nodes,
        edges,
        items,
        tickCount,
        autoInjectionEnabled,
        history,
        targetDuration,
        autoStopEnabled,
        cumulativeCompleted,
        cumulativeTransitTicks,
        countTransitInClock,
        metricsEpoch,
        metricsWindowCompletions,
        demandMode,
        demandUnit,
        demandTotalTicks,
        demandArrivalsGenerated,
        demandArrivalsByNode,
        demandAccumulatorByNode,
        demandOpenTicksByNode,
        periodCompleted
      } = state;

      // AUTO-STOP CHECK: Stop simulation when target duration reached
      if (autoStopEnabled && targetDuration !== Infinity && tickCount >= targetDuration) {
        return { ...state, isRunning: false, simulationProgress: 100 };
      }

      // Build node lookup map for O(1) access (instead of O(n) find calls)
      const nodeMap = new Map<string, AppNode>();
      for (const node of nodes) {
        nodeMap.set(node.id, node);
      }

      // Compute working-hours availability for each node at this tick
      const workingStatus = new Map<string, boolean>();
      for (const node of nodes) {
        if (node.type === 'annotationNode') continue;
        const pData = node.data as ProcessNodeData;
        workingStatus.set(node.id, isWorkingTick(tickCount, pData.workingHours));
      }

      // Build edge lookup by source+target for transit time overrides
      const edgeByPair = new Map<string, Edge>();
      for (const edge of edges) {
        edgeByPair.set(`${edge.source}->${edge.target}`, edge);
      }

      // Helper: Calculate transit duration - uses edge override if set, otherwise distance-based (5-30 ticks)
      const getTransitDuration = (sourceId: string, targetId: string): number => {
        const edge = edgeByPair.get(`${sourceId}->${targetId}`);
        const customTransitTime = (edge as any)?.data?.transitTime;

        const sourceNode = nodeMap.get(sourceId);
        const targetNode = nodeMap.get(targetId);
        if (!sourceNode || !targetNode) return computeTransitDuration(10, customTransitTime); // tiny fallback distance

        const dx = Math.abs(targetNode.position.x - sourceNode.position.x);
        const dy = Math.abs(targetNode.position.y - sourceNode.position.y);
        const distance = dx + dy;

        return computeTransitDuration(distance, customTransitTime);
      };

      // Build edge lookup by source for O(1) access
      const edgesBySource = new Map<string, Edge[]>();
      for (const edge of edges) {
        const existing = edgesBySource.get(edge.source);
        if (existing) {
          existing.push(edge);
        } else {
          edgesBySource.set(edge.source, [edge]);
        }
      }

      // --- AUTO INJECTION / DEMAND INJECTION ---
      const injectedItems: ProcessItem[] = [];
      let nextDemandArrivalsGenerated = demandArrivalsGenerated;
      let nextDemandArrivalsByNode: Record<string, number> = { ...demandArrivalsByNode };
      let nextDemandAccumulatorByNode: Record<string, number> = { ...demandAccumulatorByNode };
      let nextDemandOpenTicksByNode: Record<string, number> = { ...demandOpenTicksByNode };

      if (demandMode === 'target') {
        const totalTicks = demandTotalTicks || DEMAND_UNIT_TICKS[demandUnit];
        if (totalTicks > 0 && tickCount < totalTicks) {
          for (const node of nodes) {
            if (node.type !== 'startNode') continue;
            const pData = node.data as ProcessNodeData;
            const target = pData.demandTarget || 0;
            if (target <= 0) continue;

            const totalOpenTicks = computeOpenTicksForPeriod(totalTicks, pData.workingHours);
            if (totalOpenTicks <= 0) continue;

            const isWorking = workingStatus.get(node.id) ?? true;
            if (!isWorking) continue;

            const prevAcc = nextDemandAccumulatorByNode[node.id] || 0;
            const openTicksSoFar = (nextDemandOpenTicksByNode[node.id] || 0) + 1;
            nextDemandOpenTicksByNode[node.id] = openTicksSoFar;

            const ratePerTick = target / totalOpenTicks;
            let acc = prevAcc + ratePerTick;
            let spawnCount = Math.floor(acc);
            acc = acc - spawnCount;

            const generatedSoFar = nextDemandArrivalsByNode[node.id] || 0;
            const isFinalOpenTick = openTicksSoFar >= totalOpenTicks;

            if (isFinalOpenTick) {
              spawnCount = Math.max(0, target - generatedSoFar);
              acc = 0;
            } else if (generatedSoFar + spawnCount > target) {
              spawnCount = Math.max(0, target - generatedSoFar);
              acc = 0;
            }

            if (spawnCount > 0) {
              for (let i = 0; i < spawnCount; i++) {
                injectedItems.push({
                  id: generateId(),
                  currentNodeId: node.id,
                  fromNodeId: null,
                  status: ItemStatus.QUEUED,
                  progress: 0,
                  remainingTime: 0,
                  processingDuration: 0,
                  totalTime: 0,
                  nodeEnterTick: tickCount,
                  metricsEpoch,
                  timeActive: 0,
                  timeWaiting: 0,
                  timeTransit: 0,
                  spawnTick: tickCount,
                  completionTick: null,
                  terminalNodeId: null,
                  transitProgress: 0
                });
              }
              nextDemandArrivalsByNode[node.id] = generatedSoFar + spawnCount;
              nextDemandArrivalsGenerated += spawnCount;
            }

            nextDemandAccumulatorByNode[node.id] = acc;
          }
        }
      } else if (autoInjectionEnabled) {
        for (const node of nodes) {
          if ((node.type === 'processNode' || node.type === 'startNode') && (node.data as ProcessNodeData).sourceConfig?.enabled) {
            const config = (node.data as ProcessNodeData).sourceConfig!;
            const isWorking = workingStatus.get(node.id) ?? true;
            if (!isWorking) continue;
            if (tickCount % config.interval === 0) {
              for (let i = 0; i < config.batchSize; i++) {
                injectedItems.push({
                  id: generateId(),
                  currentNodeId: node.id,
                  fromNodeId: null,
                  status: ItemStatus.QUEUED,
                  progress: 0,
                  remainingTime: 0,
                  processingDuration: 0,
                  totalTime: 0,
                  nodeEnterTick: tickCount,
                  metricsEpoch,
                  timeActive: 0,
                  timeWaiting: 0,
                  timeTransit: 0,
                  spawnTick: tickCount,
                  completionTick: null,
                  terminalNodeId: null,
                  transitProgress: 0
                });
              }
            }
          }
        }
      }

      // Combine items (reuse array if no injections)
      const allItems = injectedItems.length > 0 ? [...items, ...injectedItems] : items;

      // --- SINGLE PASS: Process all items and collect stats ---
      const nodesUpdates = new Map<string, { processed: number; failed: number }>();
      const processingCounts = new Map<string, number>();
      let newlyCompleted = 0;
      let newlyCompletedInEpoch = 0;
      let hasTransitThisStep = false;
      let hasNonTransitActiveItem = false;

      // Initialize processing counts
      for (const node of nodes) {
        processingCounts.set(node.id, 0);
      }

      // Helper for weighted routing (inlined for performance)
      const getNextNode = (sourceId: string, routingWeights: Record<string, number>): string | null => {
        const outgoing = edgesBySource.get(sourceId);
        if (!outgoing || outgoing.length === 0) return null;
        if (outgoing.length === 1) return outgoing[0].target;

        const choices = outgoing.map(e => ({
          targetId: e.target,
          weight: Math.max(0, routingWeights[e.target] ?? 1)
        }));
        const totalWeight = choices.reduce((sum, c) => sum + c.weight, 0);
        // Guard against all-zero weights: fall back to uniform distribution
        if (totalWeight <= 0) {
          return outgoing[Math.floor(Math.random() * outgoing.length)].target;
        }
        let random = Math.random() * totalWeight;
        for (const choice of choices) {
          if (random < choice.weight) return choice.targetId;
          random -= choice.weight;
        }
        return outgoing[outgoing.length - 1].target;
      };

      // Process items - mutate in place for performance
      for (const item of allItems) {
        // Only increment totalTime for active items (not already finished)
        if (item.status !== ItemStatus.COMPLETED && item.status !== ItemStatus.FAILED) {
          item.totalTime++;
        }

        if (item.status === ItemStatus.PROCESSING && item.currentNodeId) {
          hasNonTransitActiveItem = true;
          const node = nodeMap.get(item.currentNodeId);
          if (node && node.type !== 'annotationNode') {
            const isWorking = workingStatus.get(node.id) ?? true;
            if (!isWorking) continue;
            const pData = node.data as ProcessNodeData;
            item.remainingTime--;
            item.timeActive++;

            const totalDuration = item.processingDuration || pData.processingTime;
            item.progress = totalDuration > 0
              ? Math.min(100, ((totalDuration - item.remainingTime) / totalDuration) * 100)
              : 100;

            if (item.remainingTime <= 0) {
              const passed = Math.random() <= pData.quality;

              // Track stats update
              const stats = nodesUpdates.get(node.id) || { processed: 0, failed: 0 };
              if (passed) stats.processed++;
              else stats.failed++;
              nodesUpdates.set(node.id, stats);

              if (passed) {
                const nextNodeId = getNextNode(node.id, pData.routingWeights);
                  if (nextNodeId) {
                    const transitDuration = getTransitDuration(node.id, nextNodeId);
                  item.status = ItemStatus.TRANSIT;
                  item.fromNodeId = node.id;
                  item.currentNodeId = nextNodeId;
                  item.remainingTime = transitDuration;
                  item.processingDuration = transitDuration; // Store for progress calculation
                  item.transitProgress = 0;
                  item.terminalNodeId = null;
                  hasTransitThisStep = true;
                } else {
                    item.status = ItemStatus.COMPLETED;
                    item.currentNodeId = null;
                  item.completionTick = tickCount;
                  item.terminalNodeId = node.type === 'endNode' ? node.id : null;
                  newlyCompleted++;
                  if (item.metricsEpoch === metricsEpoch) newlyCompletedInEpoch++;
                }
              } else {
                item.status = ItemStatus.FAILED;
                item.currentNodeId = null;
                item.completionTick = tickCount;
                item.terminalNodeId = null;
              }
            }
          }
        } else if (item.status === ItemStatus.TRANSIT) {
          item.remainingTime--;
          item.timeTransit++;
          hasTransitThisStep = true;
          // Use stored processingDuration for accurate progress (distance-based transit)
          const transitDuration = item.processingDuration || 10;
          item.transitProgress = Math.min(1, 1 - (item.remainingTime / transitDuration));

          if (item.remainingTime <= 0) {
            item.status = ItemStatus.QUEUED;
            item.fromNodeId = null;
            item.progress = 0;
            item.transitProgress = 0;
            item.nodeEnterTick = tickCount;
          }
        } else if (item.status === ItemStatus.QUEUED) {
          hasNonTransitActiveItem = true;
          if (item.currentNodeId) {
            const node = nodeMap.get(item.currentNodeId);
            if (node && node.type !== 'annotationNode') {
              const isWorking = workingStatus.get(node.id) ?? true;
              if (isWorking) item.timeWaiting++;
            }
          }
        }
        // Note: already-completed items are pre-counted above, not here
      }

      // Count current processing items
      for (const item of allItems) {
        if (item.status === ItemStatus.PROCESSING && item.currentNodeId) {
          processingCounts.set(item.currentNodeId, (processingCounts.get(item.currentNodeId) || 0) + 1);
        }
      }

      // Assign queued items to free slots
      for (const item of allItems) {
        if (item.status === ItemStatus.QUEUED && item.currentNodeId) {
          const node = nodeMap.get(item.currentNodeId);
          if (node && node.type !== 'annotationNode') {
            const pData = node.data as ProcessNodeData;
            const isWorking = workingStatus.get(node.id) ?? true;
            if (!isWorking) continue;
            const currentLoad = processingCounts.get(node.id) || 0;

            if (currentLoad < pData.resources) {
              processingCounts.set(node.id, currentLoad + 1);

              if (pData.processingTime === 0) {
                // Instant processing - still apply quality check
                const passed = Math.random() <= pData.quality;
                const stats = nodesUpdates.get(node.id) || { processed: 0, failed: 0 };

                if (passed) {
                  // Check for next node to route to
                  const nextNodeId = getNextNode(node.id, pData.routingWeights);
                  if (nextNodeId) {
                    const transitDuration = getTransitDuration(node.id, nextNodeId);
                    item.status = ItemStatus.TRANSIT;
                    item.fromNodeId = node.id;
                    item.currentNodeId = nextNodeId;
                    item.remainingTime = transitDuration;
                    item.processingDuration = transitDuration;
                    item.transitProgress = 0;
                    item.terminalNodeId = null;
                    hasTransitThisStep = true;
                  } else {
                    item.status = ItemStatus.COMPLETED;
                    item.currentNodeId = null;
                    item.completionTick = tickCount;
                    item.terminalNodeId = node.type === 'endNode' ? node.id : null;
                    newlyCompleted++;
                    if (item.metricsEpoch === metricsEpoch) newlyCompletedInEpoch++;
                  }
                  item.progress = 100;
                  stats.processed++;
                } else {
                  item.status = ItemStatus.FAILED;
                  item.currentNodeId = null;
                  item.completionTick = tickCount;
                  item.terminalNodeId = null;
                  item.progress = 100;
                  stats.failed++;
                }
                nodesUpdates.set(node.id, stats);
              } else {
                const actualTime = applyVariability(pData.processingTime, pData.variability || 0);
                item.status = ItemStatus.PROCESSING;
                item.remainingTime = actualTime;
                item.processingDuration = actualTime;
                item.progress = 0;
              }
            }
          }
        }
      }

      // --- THROUGHPUT (rolling time window, aligned with lead metrics) ---
      // Placed after both processing loops so all completions (including instant EndNode) are counted
      const cumulativeCompletedNext = cumulativeCompleted + newlyCompletedInEpoch;
      const periodCompletedNext = periodCompleted + newlyCompleted;
      const throughputResult = computeThroughputFromCompletions(allItems, {
        windowSize: Math.max(1, metricsWindowCompletions),
        metricsEpoch
      });
      const currentThroughput = throughputResult.throughput;

      // --- UPDATE NODES (only if stats changed or validation needed) ---
      const nextNodes = nodes.map(n => {
        const statsUpdate = nodesUpdates.get(n.id);
        if (n.type === 'processNode' || n.type === 'startNode' || n.type === 'endNode') {
          const pData = n.data as ProcessNodeData;
          let validationError: string | undefined;

          // Validation for nodes that need outgoing paths (not end nodes)
          if (n.type !== 'endNode') {
            const outgoing = edgesBySource.get(n.id);
            if (!outgoing || outgoing.length === 0) {
              validationError = 'No Output Path';
            }
            if (pData.resources === 0) {
              validationError = 'Zero Capacity';
            }
          }

          if (statsUpdate || validationError !== pData.validationError) {
            return {
              ...n,
              data: {
                ...pData,
                stats: statsUpdate
                  ? { ...pData.stats, processed: pData.stats.processed + statsUpdate.processed, failed: pData.stats.failed + statsUpdate.failed }
                  : pData.stats,
                validationError
              }
            };
          }
        }
        return n;
      });

      // --- HISTORY (every 5 ticks) ---
      let nextHistory = history;
      if (tickCount % 5 === 0) {
        let wipCount = 0;
        for (const item of allItems) {
          if (item.status !== ItemStatus.COMPLETED && item.status !== ItemStatus.FAILED) {
            wipCount++;
          }
        }

        // Use currentThroughput computed above (based on fixed window)
        nextHistory = [...history, { tick: tickCount, wip: wipCount, totalCompleted: periodCompletedNext, throughput: currentThroughput }];
        if (nextHistory.length > 500) nextHistory.shift();
      }

      // --- ITEM CLEANUP (prevent memory leak) ---
      // Keep all active items + limit completed/failed items for VSM metrics
      const MAX_FINISHED_ITEMS = 200;
      const activeItems: ProcessItem[] = [];
      const finishedItems: ProcessItem[] = [];

      for (const item of allItems) {
        if (item.status === ItemStatus.COMPLETED || item.status === ItemStatus.FAILED) {
          finishedItems.push(item);
        } else {
          activeItems.push(item);
        }
      }

      // Keep only most recent finished items (sorted by completionTick)
      let prunedItems: ProcessItem[];
      if (finishedItems.length > MAX_FINISHED_ITEMS) {
        finishedItems.sort((a, b) => (b.completionTick || 0) - (a.completionTick || 0));
        prunedItems = [...activeItems, ...finishedItems.slice(0, MAX_FINISHED_ITEMS)];
      } else {
        prunedItems = allItems;
      }

      // Compute derived state for UI
      const derived = computeDerivedState(prunedItems);

      // Calculate progress percentage
      const newTickCount = tickCount + 1;
      // Only count a tick as "transit-only" when ALL active items are in transit
      // (no items are being processed or waiting in queues). This prevents the
      // display clock from freezing when items are continuously flowing.
      const isTransitOnlyTick = hasTransitThisStep && !hasNonTransitActiveItem;
      const newCumulativeTransitTicks = cumulativeTransitTicks + (isTransitOnlyTick ? 1 : 0);
      const displayTickCount = computeDisplayTickCount(newTickCount, newCumulativeTransitTicks, { countTransitInClock });
      const simulationProgress = targetDuration === Infinity
        ? 0
        : Math.min(100, (newTickCount / targetDuration) * 100);

      return {
        items: prunedItems,
        nodes: nextNodes,
        tickCount: newTickCount,
        displayTickCount,
        cumulativeTransitTicks: newCumulativeTransitTicks,
        history: nextHistory,
        itemsByNode: derived.itemsByNode,
        itemCounts: derived.itemCounts,
        simulationProgress,
        cumulativeCompleted: cumulativeCompletedNext,
        periodCompleted: periodCompletedNext,
        throughput: currentThroughput,
        demandArrivalsGenerated: nextDemandArrivalsGenerated,
        demandArrivalsByNode: nextDemandArrivalsByNode,
        demandAccumulatorByNode: nextDemandAccumulatorByNode,
        demandOpenTicksByNode: nextDemandOpenTicksByNode
      };
    });
  }
}));
