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
  CanvasFlowData,
  DEMAND_UNIT_TICKS,
  DemandMode,
  DemandUnit,
  DEFAULT_WORKING_HOURS,
  WorkingHoursConfig,
  RunSummary,
  VisualTransfer,
} from './types';
import {
  computeOpenTicksForPeriod,
  isWorkingTick,
  normalizeWorkingHours,
} from './timeModel';
import { showToast } from './components/Toast';
import { computeLeadMetrics, computeThroughputFromCompletions } from './metrics';
import { getProcessBoxSdk } from './processBoxSdk';
import { createRandomSeed, nextMulberry32, normalizeSeed } from './rng';
import {
  deleteCanvas,
  getAllCanvases,
  getCanvas,
  getLastCanvasId,
  renameCanvas,
  saveCanvas,
  setLastCanvasId,
} from './canvas-storage';

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

const DEFAULT_SIMULATION_SEED = createRandomSeed();
let simulationRngState = DEFAULT_SIMULATION_SEED;
const visualTransferCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

const resetSimulationRng = (seed: number) => {
  simulationRngState = normalizeSeed(seed, DEFAULT_SIMULATION_SEED);
};

const nextSimulationRandom = () => {
  const next = nextMulberry32(simulationRngState);
  simulationRngState = next.state;
  return next.value;
};

const DEFAULT_SOURCE_CONFIG = { enabled: false, interval: 20, batchSize: 1 };
const DEFAULT_NODE_BATCH_SIZE = 1;
const DEFAULT_NODE_FLOW_MODE = 'push' as const;
const DEFAULT_PULL_OPEN_SLOTS_REQUIRED = 1;
const MAX_VISUAL_TRANSFERS = 120;
const SUN_MOON_CLOCK_PREF_KEY = 'pf-show-sun-moon-clock';
const createDefaultWorkingHours = (): WorkingHoursConfig => ({ ...DEFAULT_WORKING_HOURS });
const createEmptyItemCounts = () => ({
  wip: 0,
  completed: 0,
  failed: 0,
  queued: 0,
  processing: 0,
  stuck: 0,
});

const readShowSunMoonClockPreference = () => {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(SUN_MOON_CLOCK_PREF_KEY);
    if (raw === null) return true;
    return raw !== '0';
  } catch {
    return true;
  }
};

const persistShowSunMoonClockPreference = (enabled: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SUN_MOON_CLOCK_PREF_KEY, enabled ? '1' : '0');
  } catch {
    // ignore local preference write failures
  }
};

const getNodeBatchSize = (data: Partial<ProcessNodeData> | undefined) => {
  const raw = Number(data?.batchSize);
  return Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : DEFAULT_NODE_BATCH_SIZE;
};

const getNodeFlowMode = (data: Partial<ProcessNodeData> | undefined) =>
  data?.flowMode === 'pull' ? 'pull' : DEFAULT_NODE_FLOW_MODE;

const getNodePullOpenSlotsRequired = (data: Partial<ProcessNodeData> | undefined) => {
  const raw = Number(data?.pullOpenSlotsRequired);
  return Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : DEFAULT_PULL_OPEN_SLOTS_REQUIRED;
};

const normalizeProcessNodeSettings = (
  nextData: Partial<ProcessNodeData>,
  fallback?: Partial<ProcessNodeData>
): Partial<ProcessNodeData> => {
  const merged = { ...fallback, ...nextData };
  const resources = Number(merged.resources);
  const normalizedResources = Number.isFinite(resources) && resources > 0 ? Math.round(resources) : fallback?.resources;
  const maxSlots = Number.isFinite(normalizedResources) && normalizedResources && normalizedResources > 0
    ? Math.round(normalizedResources)
    : undefined;

  const batchSize = getNodeBatchSize(merged);
  const pullOpenSlotsRequired = getNodePullOpenSlotsRequired(merged);

  return {
    ...nextData,
    batchSize: maxSlots ? Math.min(batchSize, maxSlots) : batchSize,
    flowMode: getNodeFlowMode(merged),
    pullOpenSlotsRequired: maxSlots ? Math.min(pullOpenSlotsRequired, maxSlots) : pullOpenSlotsRequired,
  };
};

const createQueuedItem = (targetNodeId: string, tick: number, metricsEpoch: number): ProcessItem => ({
  id: generateId(),
  currentNodeId: targetNodeId,
  status: ItemStatus.QUEUED,
  handoffTargetNodeId: null,
  progress: 0,
  remainingTime: 0,
  processingDuration: 0,
  totalTime: 0,
  nodeEnterTick: tick,
  metricsEpoch,
  timeActive: 0,
  timeWaiting: 0,
  nodeLeadTime: 0,
  spawnTick: tick,
  completionTick: null,
  terminalNodeId: null,
});

const buildRunStateReset = () => ({
  items: [] as ProcessItem[],
  isRunning: false,
  tickCount: 0,
  displayTickCount: 0,
  cumulativeCompleted: 0,
  throughput: 0,
  simulationProgress: 0,
  history: [] as HistoryEntry[],
  metricsEpoch: 0,
  metricsEpochTick: 0,
  demandArrivalsGenerated: 0,
  demandArrivalsByNode: {} as Record<string, number>,
  demandAccumulatorByNode: {} as Record<string, number>,
  demandOpenTicksByNode: {} as Record<string, number>,
  periodCompleted: 0,
  itemsByNode: new Map<string, ProcessItem[]>(),
  itemCounts: createEmptyItemCounts(),
  visualTransfers: [] as VisualTransfer[],
  runStartedAtMs: null,
  lastRunSummary: null as RunSummary | null,
  lastLoggedRunKey: null as string | null,
});

const getVisualTransferDurationMs = (ticksPerSecond: number): number => {
  if (ticksPerSecond === -1) return 180;
  if (ticksPerSecond >= 3600) return 220;
  if (ticksPerSecond >= 600) return 280;
  if (ticksPerSecond >= 60) return 420;
  return 620;
};

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
  if ('batchSize' in nextPartial && getNodeBatchSize(nextPartial as Partial<ProcessNodeData>) !== getNodeBatchSize(prev)) return true;
  if ('flowMode' in nextPartial && getNodeFlowMode(nextPartial as Partial<ProcessNodeData>) !== getNodeFlowMode(prev)) return true;
  if (
    'pullOpenSlotsRequired' in nextPartial &&
    getNodePullOpenSlotsRequired(nextPartial as Partial<ProcessNodeData>) !== getNodePullOpenSlotsRequired(prev)
  ) {
    return true;
  }
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
  metricsEpochTick: state.tickCount
});

const getDemandDurationPreset = (unit: DemandUnit): string => {
  switch (unit) {
    case 'hour': return '1hour';
    case 'day': return '1day';
    case 'week': return '1week';
    case 'month': return '1month';
  }
};

const normalizeCanvasName = (value: unknown): string => {
  if (typeof value !== 'string') return 'Untitled Canvas';
  const trimmed = value.trim().slice(0, 80);
  return trimmed || 'Untitled Canvas';
};

const normalizeWorkspaceId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const resolveSnapshotWorkspaceId = (snapshot: any, fallbackId?: unknown): string | null => {
  return normalizeWorkspaceId(snapshot?.workspaceId) || normalizeWorkspaceId(fallbackId);
};

const resolveCloudSaveCanvasName = (entry: any): string => {
  const stateName = entry?.state_json?.canvasName;
  if (typeof stateName === 'string' && stateName.trim()) {
    return normalizeCanvasName(stateName);
  }
  if (typeof entry?.note === 'string' && entry.note.trim()) {
    return normalizeCanvasName(entry.note);
  }
  return 'Untitled Canvas';
};

const parseCloudSaveUpdatedAt = (entry: any): number => {
  const raw = typeof entry?.updated_at === 'string' ? entry.updated_at : entry?.created_at;
  const parsed = Date.parse(raw || '');
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const createWorkspaceId = () => `workspace_${generateId()}`;

const ensureWorkspaceId = (candidate: unknown): string => normalizeWorkspaceId(candidate) || createWorkspaceId();

const getDefaultSourceHandleForNode = (node?: AppNode): string | undefined => {
  if (!node) return undefined;
  if (node.type === 'startNode') return 'right';
  if (node.type === 'processNode') return 'right-source';
  return undefined;
};

const getDefaultTargetHandleForNode = (node?: AppNode): string | undefined => {
  if (!node) return undefined;
  if (node.type === 'processNode') return 'left-target';
  if (node.type === 'endNode') return 'left';
  return undefined;
};

const normalizeDirectionalEdgeHandles = <
  T extends {
    source?: string | null;
    target?: string | null;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }
>(
  edge: T,
  nodeById: Map<string, AppNode>
): T => {
  const sourceNode = edge.source ? nodeById.get(edge.source) : undefined;
  const targetNode = edge.target ? nodeById.get(edge.target) : undefined;

  const sourceHandle =
    edge.sourceHandle == null || edge.sourceHandle === ''
      ? getDefaultSourceHandleForNode(sourceNode) ?? edge.sourceHandle
      : edge.sourceHandle;
  const targetHandle =
    edge.targetHandle == null || edge.targetHandle === ''
      ? getDefaultTargetHandleForNode(targetNode) ?? edge.targetHandle
      : edge.targetHandle;

  return {
    ...edge,
    sourceHandle,
    targetHandle,
  };
};

const normalizeFlowEdgeHandles = <T extends Edge | Connection>(
  nodes: AppNode[],
  edges: T[]
): T[] => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return edges.map((edge) => normalizeDirectionalEdgeHandles(edge, nodeById));
};

const createFlowSnapshot = (
  state: Pick<
    SimulationState,
    | 'nodes'
    | 'edges'
    | 'itemConfig'
    | 'defaultHeaderColor'
    | 'durationPreset'
    | 'speedPreset'
    | 'autoStopEnabled'
    | 'metricsWindowCompletions'
    | 'demandMode'
    | 'demandUnit'
    | 'simulationSeed'
  >,
  options: {
    workspaceId?: string | null;
    canvasName?: string | null;
  } = {},
): CanvasFlowData & { canvasName: string } => ({
  workspaceId: normalizeWorkspaceId(options.workspaceId) || undefined,
  nodes: state.nodes,
  edges: state.edges,
  itemConfig: state.itemConfig,
  defaultHeaderColor: state.defaultHeaderColor,
  durationPreset: state.durationPreset,
  speedPreset: state.speedPreset,
  autoStopEnabled: state.autoStopEnabled,
  metricsWindowCompletions: state.metricsWindowCompletions,
  demandMode: state.demandMode,
  demandUnit: state.demandUnit,
  simulationSeed: state.simulationSeed,
  canvasName: normalizeCanvasName(options.canvasName),
});

const buildCanvasMetadataFromSnapshot = (
  source: 'cloud' | 'local',
  id: string,
  updatedAt: number,
  snapshot: any,
  snapshotId?: string | null,
) => ({
  id,
  name: normalizeCanvasName(snapshot?.canvasName),
  updatedAt,
  source,
  snapshotId: snapshotId ?? null,
  nodeCount: Array.isArray(snapshot?.nodes) ? snapshot.nodes.length : 0,
  edgeCount: Array.isArray(snapshot?.edges) ? snapshot.edges.length : 0,
  data: snapshot || null,
});

const applyCloudFlowSnapshot = (
  setState: (partial: Partial<SimulationState>) => void,
  getState: () => SimulationState,
  snapshot: any,
  options: {
    canvasId?: string | null;
    canvasName?: string | null;
    successToast?: string | null;
  } = {},
): boolean => {
  if (!snapshot || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) {
    return false;
  }

  const durationConfig = DURATION_PRESETS[snapshot.durationPreset] || DURATION_PRESETS.unlimited;
  const speedConfig = SPEED_PRESETS.find((s) => s.key === snapshot.speedPreset) || SPEED_PRESETS[1];
  const demandMode = (snapshot.demandMode as DemandMode) || 'auto';
  const demandUnit = (snapshot.demandUnit as DemandUnit) || 'week';
  const simulationSeed = normalizeSeed(snapshot.simulationSeed, getState().simulationSeed);
  const nextCanvasName = normalizeCanvasName(options.canvasName || snapshot.canvasName || getState().currentCanvasName);
  resetSimulationRng(simulationSeed);
  clearVisualTransferCleanupTimers();

  setState({
    nodes: snapshot.nodes,
    edges: normalizeFlowEdgeHandles(snapshot.nodes as AppNode[], snapshot.edges),
    itemConfig: snapshot.itemConfig || getState().itemConfig,
    defaultHeaderColor: snapshot.defaultHeaderColor || getState().defaultHeaderColor,
    durationPreset: snapshot.durationPreset || 'unlimited',
    targetDuration: durationConfig.totalTicks,
    speedPreset: snapshot.speedPreset || '1x',
    ticksPerSecond: speedConfig.ticksPerSecond,
    autoStopEnabled: snapshot.autoStopEnabled !== undefined ? snapshot.autoStopEnabled : true,
    metricsWindowCompletions: Number.isFinite(snapshot.metricsWindowCompletions)
      ? snapshot.metricsWindowCompletions
      : getState().metricsWindowCompletions,
    demandMode,
    demandUnit,
    demandTotalTicks: DEMAND_UNIT_TICKS[demandUnit],
    simulationSeed,
    ...buildRunStateReset(),
    currentCanvasId:
      options.canvasId === undefined
        ? resolveSnapshotWorkspaceId(snapshot, getState().currentCanvasId)
        : options.canvasId,
    currentCanvasName: nextCanvasName,
  });

  if (options.successToast) {
    showToast('success', options.successToast);
  }

  return true;
};

// --- SCENARIO DATA ---

const SCENARIOS = {
  'empty': { nodes: [], edges: [] },
  'coffee': {
    nodes: [
      { id: 'coffee-start', type: 'startNode', position: { x: 80, y: 180 }, data: { label: 'Customer Order', processingTime: 1, resources: 1, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {}, sourceConfig: { enabled: true, interval: 6, batchSize: 1 } } },
      { id: 'coffee-grind', type: 'processNode', position: { x: 460, y: 180 }, data: { label: 'Grind Beans', processingTime: 3, resources: 1, quality: 1.0, variability: 0.05, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'coffee-brew', type: 'processNode', position: { x: 840, y: 180 }, data: { label: 'Brew Coffee', processingTime: 6, resources: 1, quality: 1.0, variability: 0.1, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'coffee-serve', type: 'processNode', position: { x: 1220, y: 180 }, data: { label: 'Serve Cup', processingTime: 2, resources: 1, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'coffee-end', type: 'endNode', position: { x: 1600, y: 180 }, data: { label: 'Customer Served', processingTime: 0, resources: 999, quality: 1.0, variability: 0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'coffee-note', type: 'annotationNode', position: { x: 840, y: 420 }, data: { label: 'Lead = queue + processing time. Run Time = the observation window.' } },
    ],
    edges: [
      { id: 'c1', source: 'coffee-start', target: 'coffee-grind', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'c2', source: 'coffee-grind', target: 'coffee-brew', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'c3', source: 'coffee-brew', target: 'coffee-serve', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'c4', source: 'coffee-serve', target: 'coffee-end', type: 'processEdge', animated: false, markerEnd: { type: MarkerType.ArrowClosed } },
    ]
  },
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

const SCENARIO_NAMES: Record<string, string> = {
  empty: 'Untitled Canvas',
  coffee: 'Coffee Service',
  devops: 'DevOps Pipeline',
  hospital: 'Hospital ER Triage',
  manufacturing: 'Manufacturing Line',
};

const initialNodes: AppNode[] = SCENARIOS['devops'].nodes as AppNode[];
const initialEdges: Edge[] = normalizeFlowEdgeHandles(initialNodes, SCENARIOS['devops'].edges as Edge[]);

// Helper: Build itemsByNode map and counts in single pass
const computeDerivedState = (items: ProcessItem[]) => {
  const itemsByNode = new Map<string, ProcessItem[]>();
  let wip = 0, completed = 0, failed = 0;
  let queued = 0, processing = 0, stuck = 0;

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

  return { itemsByNode, itemCounts: { wip, completed, failed, queued, processing, stuck } };
};

const buildRunSummaryKey = (summary: RunSummary) =>
  [
    summary.canvasId || 'local',
    summary.canvasName,
    summary.seed,
    summary.durationPreset,
    summary.demandMode,
    summary.simulatedTicks,
    summary.arrivals,
    summary.completed,
    summary.outcome
  ].join(':');

const buildRunSummary = (
  state: Pick<
    SimulationState,
    | 'items'
    | 'itemCounts'
    | 'metricsWindowCompletions'
    | 'metricsEpoch'
    | 'demandArrivalsGenerated'
    | 'periodCompleted'
    | 'simulationSeed'
    | 'durationPreset'
    | 'demandMode'
    | 'runStartedAtMs'
    | 'currentCanvasId'
    | 'currentCanvasName'
  >,
  simulatedTicks: number,
  outcome: string
): RunSummary => {
  const metrics = computeLeadMetrics(state.items, {
    windowSize: Math.max(1, state.metricsWindowCompletions),
    metricsEpoch: state.metricsEpoch
  });
  const arrivals = state.demandArrivalsGenerated;
  const completed = state.periodCompleted;
  const score = arrivals > 0 ? (completed / Math.max(arrivals, 1)) * 100 : 0;
  const wallClockDurationMs = state.runStartedAtMs ? Math.max(0, Date.now() - state.runStartedAtMs) : 0;

  return {
    score: Number(score.toFixed(2)),
    outcome,
    arrivals,
    completed,
    backlogEnd: Math.max(0, arrivals - completed),
    wipEnd: state.itemCounts.wip,
    workingLeadAvg: Number(metrics.avgLeadWorking.toFixed(2)),
    elapsedLeadAvg: Number(metrics.avgLeadElapsed.toFixed(2)),
    workingThroughput: Number(metrics.throughputWorkingPerHour.toFixed(2)),
    elapsedThroughput: Number(metrics.throughputElapsedPerHour.toFixed(2)),
    seed: state.simulationSeed,
    durationPreset: state.durationPreset,
    demandMode: state.demandMode,
    wallClockDurationMs,
    simulatedTicks,
    canvasId: state.currentCanvasId,
    canvasName: normalizeCanvasName(state.currentCanvasName)
  };
};

const scheduleVisualTransferCleanup = (
  transferId: string,
  durationMs: number,
  setState: (partial: Partial<SimulationState> | ((state: SimulationState) => Partial<SimulationState>)) => void,
) => {
  const timer = setTimeout(() => {
    visualTransferCleanupTimers.delete(transferId);
    setState((state) => ({
      visualTransfers: state.visualTransfers.filter((transfer) => transfer.id !== transferId)
    }));
  }, Math.max(0, durationMs));
  visualTransferCleanupTimers.set(transferId, timer);
};

const clearVisualTransferCleanupTimers = () => {
  for (const timer of visualTransferCleanupTimers.values()) {
    clearTimeout(timer);
  }
  visualTransferCleanupTimers.clear();
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
  displayTickCount: 0,
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
  itemCounts: createEmptyItemCounts(),
  visualTransfers: [],

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
  simulationSeed: DEFAULT_SIMULATION_SEED,
  showSunMoonClock: readShowSunMoonClockPreference(),
  readOnlyMode: false,
  runStartedAtMs: null,
  lastRunSummary: null,
  lastLoggedRunKey: null,

  // Canvas identity
  currentCanvasId: null,
  currentCanvasName: 'Untitled Canvas',
  savedCanvasList: [],

  setNodes: (nodes) => {
    if (get().readOnlyMode) return;
    set({ nodes });
  },
  setEdges: (edges) => {
    if (get().readOnlyMode) return;
    set({ edges });
  },
  setItemConfig: (config) => {
    if (get().readOnlyMode) return;
    set(state => ({ itemConfig: { ...state.itemConfig, ...config } }));
  },
  setDefaultHeaderColor: (color) => {
    if (get().readOnlyMode) return;
    set({ defaultHeaderColor: color });
  },
  // Time base is fixed to 1 tick = 1 simulated minute.
  // Keep this action for API compatibility with older UI code.
  setTimeUnit: () => set({ timeUnit: 'minutes' }),
  setMetricsWindowCompletions: (count) => {
    if (!Number.isFinite(count) || count <= 0) return;
    set({ metricsWindowCompletions: Math.round(count) });
  },
  setDemandMode: (mode: DemandMode) => {
    if (get().readOnlyMode) return;
    set((state) => {
      if (mode === state.demandMode) return state;
      const demandTotalTicks = DEMAND_UNIT_TICKS[state.demandUnit];
      const durationPreset = mode === 'target' ? getDemandDurationPreset(state.demandUnit) : state.durationPreset;
      const targetDuration = mode === 'target' ? demandTotalTicks : state.targetDuration;
      resetSimulationRng(state.simulationSeed);
      return {
        demandMode: mode,
        demandTotalTicks,
        durationPreset,
        targetDuration,
        autoStopEnabled: mode === 'target' ? true : state.autoStopEnabled,
        ...buildRunStateReset()
      };
    });
  },
  setDemandUnit: (unit: DemandUnit) => {
    if (get().readOnlyMode) return;
    set((state) => {
      if (unit === state.demandUnit) return state;
      const demandTotalTicks = DEMAND_UNIT_TICKS[unit];
      const durationPreset = state.demandMode === 'target' ? getDemandDurationPreset(unit) : state.durationPreset;
      const targetDuration = state.demandMode === 'target' ? demandTotalTicks : state.targetDuration;
      resetSimulationRng(state.simulationSeed);
      return {
        demandUnit: unit,
        demandTotalTicks,
        durationPreset,
        targetDuration,
        ...buildRunStateReset()
      };
    });
  },

  setDurationPreset: (preset: string) => {
    if (get().readOnlyMode) return;
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

  setAutoStop: (enabled: boolean) => {
    if (get().readOnlyMode) return;
    set({ autoStopEnabled: enabled });
  },

  setSimulationSeed: (seed: number) => {
    if (get().readOnlyMode) return;
    const normalized = normalizeSeed(seed, get().simulationSeed);
    resetSimulationRng(normalized);
    set({ simulationSeed: normalized });
  },

  randomizeSimulationSeed: () => {
    if (get().readOnlyMode) return;
    const simulationSeed = createRandomSeed();
    resetSimulationRng(simulationSeed);
    set({ simulationSeed });
  },

  setShowSunMoonClock: (enabled: boolean) => {
    persistShowSunMoonClockPreference(Boolean(enabled));
    set({ showSunMoonClock: Boolean(enabled) });
  },

  setReadOnlyMode: (enabled: boolean) => set({ readOnlyMode: Boolean(enabled) }),

  onNodesChange: (changes: NodeChange[]) => {
    if (get().readOnlyMode) return;
    set({
      nodes: applyNodeChanges(changes, get().nodes) as AppNode[],
    });
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    if (get().readOnlyMode) return;
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },

  connect: (connection: Connection) => {
    if (get().readOnlyMode) return;
    const normalizedConnection = normalizeFlowEdgeHandles(get().nodes, [connection])[0];
    set({
      edges: addEdge({
        ...normalizedConnection,
        type: 'processEdge',
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed }
      }, get().edges),
    });
  },

  deleteEdge: (id: string) => {
    if (get().readOnlyMode) return;
    set({
        edges: get().edges.filter(e => e.id !== id)
    });
  },

  updateEdgeData: (id: string, data: Record<string, any>) => {
    if (get().readOnlyMode) return;
    set((state) => ({
      edges: state.edges.map(e =>
        e.id === id ? { ...e, data: { ...(e as any).data, ...data } } : e
      )
    }));
  },

  reconnectEdge: (oldEdge: Edge, newConnection: Connection) => {
    if (get().readOnlyMode) return;
    // Replace the old edge with a new connection
    const { edges } = get();
    const filteredEdges = edges.filter(e => e.id !== oldEdge.id);
    const normalizedConnection = normalizeFlowEdgeHandles(get().nodes, [newConnection])[0];
    set({
      edges: addEdge({
        ...normalizedConnection,
        type: 'processEdge',
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed }
      }, filteredEdges),
    });
  },

  deleteNode: (id: string) => {
    if (get().readOnlyMode) return;
    const { nodes, edges, items } = get();
    const nodeToDelete = nodes.find(n => n.id === id);
    
    if (!nodeToDelete) return;

    const updatedNodes = nodes.filter(n => n.id !== id);

    // Remove connected edges
    const updatedEdges = edges.filter(e => e.source !== id && e.target !== id);

    // Remove items in this node
    const updatedItems = items.filter(i => i.currentNodeId !== id);

    set({
        nodes: updatedNodes,
        edges: updatedEdges,
        items: updatedItems
    });
  },

  addNode: () => {
    if (get().readOnlyMode) return;
    const id = generateId();
    const newNode: ProcessNode = {
      id,
      type: 'processNode',
      position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
      data: {
        label: `Station ${get().nodes.filter(n => n.type === 'processNode').length + 1}`,
        processingTime: 10,
        resources: 1,
        batchSize: DEFAULT_NODE_BATCH_SIZE,
        flowMode: DEFAULT_NODE_FLOW_MODE,
        pullOpenSlotsRequired: DEFAULT_PULL_OPEN_SLOTS_REQUIRED,
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
      if (get().readOnlyMode) return;
      const id = generateId();
      const newNode: StartNode = {
        id,
        type: 'startNode',
        position: { x: 100, y: 100 },
        data: {
          label: 'Start',
          processingTime: 2,
          resources: 1,
          batchSize: DEFAULT_NODE_BATCH_SIZE,
          flowMode: DEFAULT_NODE_FLOW_MODE,
          pullOpenSlotsRequired: DEFAULT_PULL_OPEN_SLOTS_REQUIRED,
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
      if (get().readOnlyMode) return;
      const id = generateId();
      const newNode: EndNode = {
        id,
        type: 'endNode',
        position: { x: 500, y: 100 },
        data: {
          label: 'End',
          processingTime: 0, // Instant
          resources: 999, // Infinite capacity
          batchSize: DEFAULT_NODE_BATCH_SIZE,
          flowMode: DEFAULT_NODE_FLOW_MODE,
          pullOpenSlotsRequired: DEFAULT_PULL_OPEN_SLOTS_REQUIRED,
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
    if (get().readOnlyMode) return;
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
    if (get().readOnlyMode) return;
    set((state) => {
      const prevNode = state.nodes.find((node) => node.id === id);
      const isProcessNode = prevNode && (prevNode.type === 'processNode' || prevNode.type === 'startNode' || prevNode.type === 'endNode');
      const nextData = isProcessNode && prevNode
        ? normalizeProcessNodeSettings(data as Partial<ProcessNodeData>, prevNode.data as ProcessNodeData)
        : data;
      const shouldReset = !!(
        isProcessNode &&
        prevNode &&
        shouldResetMetricsForNodeData(prevNode.data as ProcessNodeData, nextData as Partial<ProcessNodeData>)
      );

      const nextNodes = state.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...nextData } } : node
      );

      if (!shouldReset) {
        return { nodes: nextNodes };
      }

      return { nodes: nextNodes, ...buildMetricsReset(state) };
    });
  },

  updateNode: (id, partialNode) => {
    if (get().readOnlyMode) return;
    set({
        nodes: get().nodes.map(n => n.id === id ? { ...n, ...partialNode } : n)
    });
  },

  startSimulation: () => {
    set((state) => {
      const isFreshRun = state.tickCount === 0;
      if (isFreshRun) {
        resetSimulationRng(state.simulationSeed);
      }

      return {
        isRunning: true,
        runStartedAtMs:
          state.targetDuration !== Infinity && state.runStartedAtMs === null ? Date.now() : state.runStartedAtMs,
        lastRunSummary: isFreshRun ? null : state.lastRunSummary,
        lastLoggedRunKey: isFreshRun ? null : state.lastLoggedRunKey,
      };
    });
  },
  pauseSimulation: () =>
    set((state) => {
      const shouldCaptureTargetSummary =
        state.demandMode === 'target' &&
        state.targetDuration !== Infinity &&
        state.tickCount > 0 &&
        state.tickCount < state.targetDuration;

      return {
        isRunning: false,
        lastRunSummary: shouldCaptureTargetSummary
          ? buildRunSummary(state, state.tickCount, 'target_run_stopped_early')
          : state.lastRunSummary,
      };
    }),
  stepSimulation: () => {
      const state = get();
      if (state.tickCount === 0) {
        resetSimulationRng(state.simulationSeed);
      }
      set({
        isRunning: false,
        runStartedAtMs:
          state.targetDuration !== Infinity && state.runStartedAtMs === null ? Date.now() : state.runStartedAtMs,
        lastRunSummary: state.tickCount === 0 ? null : state.lastRunSummary,
        lastLoggedRunKey: state.tickCount === 0 ? null : state.lastLoggedRunKey,
      });
      get().tick();
  },
  
  resetSimulation: () => {
    clearVisualTransferCleanupTimers();
    set((state) => ({
      ...(() => {
        resetSimulationRng(state.simulationSeed);
        return buildRunStateReset();
      })(),
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
    if (get().readOnlyMode) return;
    clearVisualTransferCleanupTimers();
    resetSimulationRng(get().simulationSeed);
    set({ 
        nodes: [], 
        edges: [], 
        ...buildRunStateReset()
    });
  },

  setTickSpeed: (tickSpeed) => set({ tickSpeed }),
  
  toggleAutoInjection: () => {
    if (get().readOnlyMode) return;
    set((state) => ({ autoInjectionEnabled: !state.autoInjectionEnabled }));
  },

  addItem: (targetNodeId) => {
    if (get().readOnlyMode) return;
    const currentTick = get().tickCount;
    const metricsEpoch = get().metricsEpoch;
    const newItem = createQueuedItem(targetNodeId, currentTick, metricsEpoch);
    set({ items: [...get().items, newItem] });
  },

  clearItems: () => {
    clearVisualTransferCleanupTimers();
    set({
      items: [],
      itemsByNode: new Map(),
      itemCounts: createEmptyItemCounts(),
      visualTransfers: [],
    });
  },

  // Persistence
  restoreLatestCloudSave: () => {
    if (get().readOnlyMode) return;
    const lastCanvasId = getLastCanvasId();
    if (lastCanvasId) {
      void get().loadCanvasFromDb(lastCanvasId);
      return;
    }

    const sdk = getProcessBoxSdk();
    if (!sdk?.isEmbedded) return;

    void sdk
      .listCloudSaves(1)
      .then((payload) => {
        const latestEntry = payload?.saves?.[0];
        const latest = latestEntry?.state_json;
        if (!latestEntry || !latest) return;

        const workspaceId = resolveSnapshotWorkspaceId(latest, latestEntry?.id);
        const loaded = applyCloudFlowSnapshot(set, get, latest, {
          canvasId: workspaceId,
          canvasName: resolveCloudSaveCanvasName(latestEntry),
          successToast: null,
        });

        if (loaded) {
          setLastCanvasId(workspaceId);
          void get().refreshCanvasList();
        }
      })
      .catch(() => {
        // Silent by design: app still works when not authenticated.
      });
  },

  loadSnapshot: (snapshot, options = {}) =>
    applyCloudFlowSnapshot(set, get, snapshot, {
      canvasId: options.canvasId,
      canvasName: options.canvasName,
      successToast: options.successToast ?? null,
    }),

  saveFlow: () => {
    if (get().readOnlyMode) return;
    void get().saveCanvasToDb();
  },

  loadFlow: () => {
    if (get().readOnlyMode) return;
    const lastCanvasId = getLastCanvasId();
    if (lastCanvasId) {
      void get().loadCanvasFromDb(lastCanvasId);
      return;
    }

    void get()
      .refreshCanvasList()
      .then(() => {
        const latestCanvas = get().savedCanvasList[0];
        if (!latestCanvas) {
          showToast('warning', 'No saved process found yet.');
          return;
        }
        return get().loadCanvasFromDb(latestCanvas.id);
      })
      .catch(() => {
        showToast('error', 'Failed to load saved process.');
      });
  },

  exportJson: () => {
      if (get().readOnlyMode) return;
      const state = get();
      const dataStr = JSON.stringify(
        createFlowSnapshot(state, {
          workspaceId: state.currentCanvasId,
          canvasName: state.currentCanvasName,
        }),
        null,
        2
      );
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const exportFileDefaultName = 'process_flow.json';
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
  },

  importJson: (fileContent) => {
      if (get().readOnlyMode) return;
      try {
        const flow = JSON.parse(fileContent);
        if (flow.nodes && flow.edges) {
            clearVisualTransferCleanupTimers();
            const durationPreset = flow.durationPreset || get().durationPreset;
            const durationConfig = DURATION_PRESETS[durationPreset] || DURATION_PRESETS.unlimited;
            const speedPreset = flow.speedPreset || get().speedPreset;
            const speedConfig = SPEED_PRESETS.find((s) => s.key === speedPreset) || SPEED_PRESETS[1];
            const demandUnit = (flow.demandUnit as DemandUnit) || 'week';
            const simulationSeed = normalizeSeed(flow.simulationSeed, get().simulationSeed);
            resetSimulationRng(simulationSeed);
            set({
                nodes: flow.nodes,
                edges: normalizeFlowEdgeHandles(flow.nodes as AppNode[], flow.edges),
                itemConfig: flow.itemConfig || get().itemConfig,
                defaultHeaderColor: flow.defaultHeaderColor || get().defaultHeaderColor,
                durationPreset,
                targetDuration: durationConfig.totalTicks,
                speedPreset,
                ticksPerSecond: speedConfig.ticksPerSecond,
                autoStopEnabled:
                  flow.autoStopEnabled !== undefined ? Boolean(flow.autoStopEnabled) : get().autoStopEnabled,
                metricsWindowCompletions:
                  Number.isFinite(flow.metricsWindowCompletions)
                    ? flow.metricsWindowCompletions
                    : get().metricsWindowCompletions,
                demandMode: (flow.demandMode as DemandMode) || 'auto',
                demandUnit,
                demandTotalTicks: DEMAND_UNIT_TICKS[demandUnit],
                simulationSeed,
                currentCanvasId: null,
                currentCanvasName: normalizeCanvasName(flow.canvasName || 'Imported Process'),
                ...buildRunStateReset()
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
      if (get().readOnlyMode) return;
      const scenario = SCENARIOS[scenarioKey as keyof typeof SCENARIOS];
      if (scenario) {
          clearVisualTransferCleanupTimers();
          resetSimulationRng(get().simulationSeed);
          const nodes = JSON.parse(JSON.stringify(scenario.nodes)) as AppNode[];
          const edges = normalizeFlowEdgeHandles(
            nodes,
            JSON.parse(JSON.stringify(scenario.edges)) as Edge[]
          );
          set({ 
              nodes,
              edges,
              demandMode: 'auto',
              demandUnit: 'week',
              demandTotalTicks: DEMAND_UNIT_TICKS.week,
              currentCanvasId: null,
              currentCanvasName: SCENARIO_NAMES[scenarioKey] || 'Untitled Canvas',
              ...buildRunStateReset()
          });
      }
  },

  // --- Canvas Management ---

  refreshCanvasList: async () => {
    const sdk = getProcessBoxSdk();
    if (!sdk?.isEmbedded) {
      try {
        const savedCanvasList = await getAllCanvases();
        set({ savedCanvasList });
      } catch {
        set({ savedCanvasList: [] });
      }
      return;
    }

    try {
      const payload = await sdk.listCloudSaves(50);
      const saves = Array.isArray(payload?.saves) ? payload.saves : [];
      const latestByWorkspace = new Map<string, { entry: any; updatedAt: number }>();

      for (const entry of saves) {
        const snapshot = entry?.state_json;
        if (!snapshot || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) continue;
        const workspaceId = resolveSnapshotWorkspaceId(snapshot, entry?.id);
        if (!workspaceId) continue;
        const updatedAt = parseCloudSaveUpdatedAt(entry);
        const existing = latestByWorkspace.get(workspaceId);
        if (!existing || updatedAt >= existing.updatedAt) {
          latestByWorkspace.set(workspaceId, { entry, updatedAt });
        }
      }

      const savedCanvasList = Array.from(latestByWorkspace.entries())
        .map(([workspaceId, value]) => {
          const snapshot = value.entry?.state_json;
          return buildCanvasMetadataFromSnapshot(
            'cloud',
            workspaceId,
            value.updatedAt,
            {
              ...snapshot,
              canvasName: resolveCloudSaveCanvasName(value.entry),
            },
            typeof value.entry?.id === 'string' ? value.entry.id : null,
          );
        })
        .sort((left, right) => right.updatedAt - left.updatedAt);

      set({ savedCanvasList });
    } catch {
      set({ savedCanvasList: [] });
    }
  },

  saveCanvasToDb: async () => {
    if (get().readOnlyMode) return;
    const sdk = getProcessBoxSdk();
    const state = get();
    const workspaceId = ensureWorkspaceId(state.currentCanvasId);
    const canvasName = normalizeCanvasName(state.currentCanvasName);
    const flow = createFlowSnapshot(state, {
      workspaceId,
      canvasName,
    });

    if (!sdk?.isEmbedded) {
      try {
        const existing = await getCanvas(workspaceId);
        await saveCanvas({
          id: workspaceId,
          name: canvasName,
          createdAt: existing?.createdAt || Date.now(),
          updatedAt: Date.now(),
          data: flow,
        });
        set({
          currentCanvasId: workspaceId,
          currentCanvasName: canvasName,
        });
        setLastCanvasId(workspaceId);
        await get().refreshCanvasList();
        showToast('success', 'Flow saved locally');
      } catch {
        showToast('error', 'Local save failed in this browser.');
      }
      return;
    }

    try {
      const payload = await sdk.createCloudSave({
        note: flow.canvasName,
        state: flow as unknown as Record<string, unknown>,
        tier: 'registered',
      });

      set({
        currentCanvasId: workspaceId,
        currentCanvasName: flow.canvasName,
      });

      setLastCanvasId(workspaceId);
      await get().refreshCanvasList();
      showToast('success', 'Flow saved to cloud');
    } catch {
      showToast('error', 'Cloud save failed. Please check sign-in and try again.');
    }
  },

  loadCanvasFromDb: async (id: string) => {
    if (get().readOnlyMode) return;
    const workspaceId = typeof id === 'string' ? id.trim() : '';
    if (!workspaceId) {
      showToast('error', 'Invalid process id.');
      return;
    }

    const sdk = getProcessBoxSdk();
    if (!sdk?.isEmbedded) {
      try {
        const canvas = await getCanvas(workspaceId);
        if (!canvas?.data) {
          showToast('warning', 'Saved process not found.');
          return;
        }

        const loaded = applyCloudFlowSnapshot(set, get, canvas.data, {
          canvasId: workspaceId,
          canvasName: canvas.name,
          successToast: 'Loaded saved process.',
        });
        if (!loaded) {
          showToast('warning', 'Saved process is invalid for this app version.');
          return;
        }
        setLastCanvasId(workspaceId);
        await get().refreshCanvasList();
      } catch {
        showToast('error', 'Local load failed in this browser.');
      }
      return;
    }

    try {
      const payload = await sdk.listCloudSaves(50);
      const saves = Array.isArray(payload?.saves) ? payload.saves : [];
      const matchingEntries = saves
        .filter((entry) => {
          const snapshot = entry?.state_json;
          if (!snapshot) return false;
          const snapshotWorkspaceId = resolveSnapshotWorkspaceId(snapshot, entry?.id);
          return snapshotWorkspaceId === workspaceId || String(entry?.id) === workspaceId;
        })
        .sort((left, right) => parseCloudSaveUpdatedAt(right) - parseCloudSaveUpdatedAt(left));
      const target = matchingEntries[0];

      if (!target?.state_json) {
        showToast('warning', 'Saved process not found.');
        return;
      }

      const resolvedWorkspaceId = resolveSnapshotWorkspaceId(target.state_json, target?.id) || workspaceId;
      const loaded = applyCloudFlowSnapshot(set, get, target.state_json, {
        canvasId: resolvedWorkspaceId,
        canvasName: resolveCloudSaveCanvasName(target),
        successToast: 'Loaded saved process.',
      });
      if (!loaded) {
        showToast('warning', 'Saved process is invalid for this app version.');
        return;
      }

      setLastCanvasId(resolvedWorkspaceId);
      await get().refreshCanvasList();
    } catch {
      showToast('error', 'Cloud load failed. Please check sign-in and try again.');
    }
  },

  newCanvas: () => {
    if (get().readOnlyMode) return;
    resetSimulationRng(get().simulationSeed);
    set({
      nodes: [],
      edges: [],
      ...buildRunStateReset(),
      currentCanvasId: null,
      currentCanvasName: 'Untitled Canvas',
    });
  },

  renameCurrentCanvas: async (name: string) => {
    if (get().readOnlyMode) return;
    const nextName = normalizeCanvasName(name);
    const currentCanvasId = get().currentCanvasId;
    set({ currentCanvasName: nextName });
    if (!currentCanvasId) return;

    const sdk = getProcessBoxSdk();
    if (sdk?.isEmbedded) return;

    try {
      await renameCanvas(currentCanvasId, nextName);
      await get().refreshCanvasList();
    } catch {
      // The in-memory rename already succeeded; local persistence can catch up on next save.
    }
  },

  deleteCanvasFromDb: async (id: string) => {
    if (get().readOnlyMode) return;
    const workspaceId = typeof id === 'string' ? id.trim() : '';
    if (!workspaceId) {
      showToast('error', 'Invalid process id.');
      return;
    }

    const sdk = getProcessBoxSdk();
    if (!sdk?.isEmbedded) {
      try {
        await deleteCanvas(workspaceId);
        if (get().currentCanvasId === workspaceId) {
          set({
            currentCanvasId: null,
            currentCanvasName: 'Untitled Canvas',
          });
        }
        if (getLastCanvasId() === workspaceId) {
          setLastCanvasId(null);
        }
        await get().refreshCanvasList();
        showToast('success', 'Saved process deleted.');
      } catch {
        showToast('error', 'Local delete failed in this browser.');
      }
      return;
    }

    try {
      const payload = await sdk.listCloudSaves(50);
      const saves = Array.isArray(payload?.saves) ? payload.saves : [];
      const matchingEntries = saves.filter((entry) => {
        const snapshot = entry?.state_json;
        if (!snapshot) return false;
        const snapshotWorkspaceId = resolveSnapshotWorkspaceId(snapshot, entry?.id);
        return snapshotWorkspaceId === workspaceId || String(entry?.id) === workspaceId;
      });

      await Promise.all(
        matchingEntries.map((entry) => sdk.deleteCloudSave(String(entry.id))),
      );

      if (get().currentCanvasId === workspaceId) {
        set({
          currentCanvasId: null,
          currentCanvasName: 'Untitled Canvas',
        });
      }
      if (getLastCanvasId() === workspaceId) {
        setLastCanvasId(null);
      }
      await get().refreshCanvasList();
      showToast('success', 'Saved process deleted.');
    } catch {
      showToast('error', 'Cloud delete failed. Please check sign-in and try again.');
    }
  },

  tick: () => {
    let pendingRunLog:
      | { score: number; durationMs: number; outcome: string; metadata: Record<string, unknown> }
      | null = null;
    let pendingVisualTransfers: VisualTransfer[] = [];
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
        metricsEpoch,
        metricsWindowCompletions,
        demandMode,
        demandUnit,
        demandTotalTicks,
        demandArrivalsGenerated,
        demandArrivalsByNode,
        demandAccumulatorByNode,
        demandOpenTicksByNode,
        periodCompleted,
        visualTransfers,
        runStartedAtMs,
        simulationSeed,
        ticksPerSecond,
        durationPreset,
        currentCanvasId,
        currentCanvasName,
        lastRunSummary,
        lastLoggedRunKey
      } = state;

      if (tickCount === 0 && history.length === 0) {
        resetSimulationRng(simulationSeed);
      }

      const effectiveRunStartedAtMs =
        runStartedAtMs === null && state.isRunning && targetDuration !== Infinity ? Date.now() : runStartedAtMs;

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
                injectedItems.push(createQueuedItem(node.id, tickCount, metricsEpoch));
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
                injectedItems.push(createQueuedItem(node.id, tickCount, metricsEpoch));
              }
            }
          }
        }
      }

      // Combine items (reuse array if no injections)
      const allItems = injectedItems.length > 0 ? [...items, ...injectedItems] : items;
      const activeWipCounts = new Map<string, number>();
      for (const item of allItems) {
        if (
          item.currentNodeId &&
          item.status !== ItemStatus.COMPLETED &&
          item.status !== ItemStatus.FAILED
        ) {
          activeWipCounts.set(item.currentNodeId, (activeWipCounts.get(item.currentNodeId) || 0) + 1);
        }
      }

      // --- SINGLE PASS: Process all items and collect stats ---
      const nodesUpdates = new Map<string, { processed: number; failed: number }>();
      const processingCounts = new Map<string, number>();
      let newlyCompleted = 0;
      let newlyCompletedInEpoch = 0;

      const registerCompletion = (item: ProcessItem) => {
        if (item.terminalNodeId === null) return;
        newlyCompleted++;
        if (item.metricsEpoch === metricsEpoch) newlyCompletedInEpoch++;
      };

      const enqueueVisualTransfer = (sourceNodeId: string, targetNodeId: string) => {
        const transfer: VisualTransfer = {
          id: generateId(),
          sourceNodeId,
          targetNodeId,
          startedAtMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
          durationMs: getVisualTransferDurationMs(ticksPerSecond),
        };
        pendingVisualTransfers.push(transfer);
      };

      const canAcceptTransfer = (targetNodeId: string) => {
        const targetNode = nodeMap.get(targetNodeId);
        if (!targetNode || targetNode.type === 'annotationNode') return false;
        if (targetNode.type === 'endNode') return true;

        const targetData = targetNode.data as ProcessNodeData;
        if (getNodeFlowMode(targetData) !== 'pull') return true;

        const localCapacity = Math.max(1, targetData.resources);
        const localWip = activeWipCounts.get(targetNodeId) || 0;
        return localWip < localCapacity;
      };

      const moveItemToQueuedNode = (item: ProcessItem, targetNodeId: string) => {
        item.status = ItemStatus.QUEUED;
        item.currentNodeId = targetNodeId;
        item.handoffTargetNodeId = null;
        item.remainingTime = 0;
        item.processingDuration = 0;
        item.progress = 0;
        item.nodeEnterTick = tickCount;
        item.nodeLeadTime = 0;
        item.terminalNodeId = null;
      };

      const blockItemAtSource = (item: ProcessItem, sourceNodeId: string, targetNodeId: string) => {
        item.status = ItemStatus.QUEUED;
        item.currentNodeId = sourceNodeId;
        item.handoffTargetNodeId = targetNodeId;
        item.remainingTime = 0;
        item.processingDuration = 0;
        item.progress = 100;
        item.terminalNodeId = null;
      };

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
          return outgoing[Math.floor(nextSimulationRandom() * outgoing.length)].target;
        }
        let random = nextSimulationRandom() * totalWeight;
        for (const choice of choices) {
          if (random < choice.weight) return choice.targetId;
          random -= choice.weight;
        }
        return outgoing[outgoing.length - 1].target;
      };

      // Process items - mutate in place for performance
      for (const item of allItems) {
        if (item.status === ItemStatus.PROCESSING && item.currentNodeId) {
          const node = nodeMap.get(item.currentNodeId);
          if (node && node.type !== 'annotationNode') {
            const isWorking = workingStatus.get(node.id) ?? true;
            if (!isWorking) continue;
            const pData = node.data as ProcessNodeData;
            item.remainingTime--;
            item.timeActive++;
            item.nodeLeadTime++;
            item.totalTime++;

            const totalDuration = item.processingDuration || pData.processingTime;
            item.progress = totalDuration > 0
              ? Math.min(100, ((totalDuration - item.remainingTime) / totalDuration) * 100)
              : 100;

            if (item.remainingTime <= 0) {
              const passed = nextSimulationRandom() <= pData.quality;

              // Track stats update
              const stats = nodesUpdates.get(node.id) || { processed: 0, failed: 0 };
              if (passed) stats.processed++;
              else stats.failed++;
              nodesUpdates.set(node.id, stats);

              if (passed) {
                const sourceNodeId = node.id;
                const nextNodeId = getNextNode(node.id, pData.routingWeights);
                if (nextNodeId) {
                  if (canAcceptTransfer(nextNodeId)) {
                    activeWipCounts.set(sourceNodeId, Math.max(0, (activeWipCounts.get(sourceNodeId) || 0) - 1));
                    activeWipCounts.set(nextNodeId, (activeWipCounts.get(nextNodeId) || 0) + 1);
                    enqueueVisualTransfer(sourceNodeId, nextNodeId);
                    moveItemToQueuedNode(item, nextNodeId);
                  } else {
                    blockItemAtSource(item, sourceNodeId, nextNodeId);
                  }
                } else {
                  activeWipCounts.set(sourceNodeId, Math.max(0, (activeWipCounts.get(sourceNodeId) || 0) - 1));
                  item.status = ItemStatus.COMPLETED;
                  item.currentNodeId = null;
                  item.handoffTargetNodeId = null;
                  item.progress = 100;
                  item.completionTick = tickCount;
                  item.terminalNodeId = node.type === 'endNode' ? node.id : null;
                  registerCompletion(item);
                }
              } else {
                activeWipCounts.set(node.id, Math.max(0, (activeWipCounts.get(node.id) || 0) - 1));
                item.status = ItemStatus.FAILED;
                item.currentNodeId = null;
                item.handoffTargetNodeId = null;
                item.completionTick = tickCount;
                item.terminalNodeId = null;
              }
            }
          }
        }
        // Note: already-completed items are pre-counted above, not here
      }

      const blockedItems = allItems
        .filter(
          (item) =>
            item.status === ItemStatus.QUEUED &&
            item.currentNodeId &&
            item.handoffTargetNodeId
        )
        .sort((left, right) => left.nodeEnterTick - right.nodeEnterTick);

      for (const item of blockedItems) {
        const sourceNodeId = item.currentNodeId!;
        const targetNodeId = item.handoffTargetNodeId!;
        if (!canAcceptTransfer(targetNodeId)) continue;

        activeWipCounts.set(sourceNodeId, Math.max(0, (activeWipCounts.get(sourceNodeId) || 0) - 1));
        activeWipCounts.set(targetNodeId, (activeWipCounts.get(targetNodeId) || 0) + 1);
        enqueueVisualTransfer(sourceNodeId, targetNodeId);
        moveItemToQueuedNode(item, targetNodeId);
      }

      // Count current processing items
      for (const item of allItems) {
        if (item.status === ItemStatus.PROCESSING && item.currentNodeId) {
          processingCounts.set(item.currentNodeId, (processingCounts.get(item.currentNodeId) || 0) + 1);
        }
      }

      const queuedByNode = new Map<string, ProcessItem[]>();
      for (const item of allItems) {
        if (item.status !== ItemStatus.QUEUED || !item.currentNodeId || item.handoffTargetNodeId) continue;
        const existing = queuedByNode.get(item.currentNodeId);
        if (existing) {
          existing.push(item);
        } else {
          queuedByNode.set(item.currentNodeId, [item]);
        }
      }
      for (const queueItems of queuedByNode.values()) {
        queueItems.sort((left, right) => left.nodeEnterTick - right.nodeEnterTick);
      }

      for (const node of nodes) {
        if (node.type === 'annotationNode') continue;
        const queueItems = queuedByNode.get(node.id);
        if (!queueItems || queueItems.length === 0) continue;

        const pData = node.data as ProcessNodeData;
        const isWorking = workingStatus.get(node.id) ?? true;
        if (!isWorking) continue;

        const batchSize =
          node.type === 'processNode'
            ? (getNodeFlowMode(pData) === 'pull'
              ? 1
              : Math.min(getNodeBatchSize(pData), Math.max(1, pData.resources)))
            : 1;

        let currentLoad = processingCounts.get(node.id) || 0;
        while (queueItems.length >= batchSize && currentLoad + batchSize <= pData.resources) {
          const batch = queueItems.splice(0, batchSize);
          currentLoad += batchSize;
          processingCounts.set(node.id, currentLoad);

          if (pData.processingTime === 0) {
            for (const item of batch) {
              const passed = nextSimulationRandom() <= pData.quality;
              const stats = nodesUpdates.get(node.id) || { processed: 0, failed: 0 };

              if (passed) {
                const sourceNodeId = node.id;
                const nextNodeId = getNextNode(node.id, pData.routingWeights);
                if (nextNodeId) {
                  if (canAcceptTransfer(nextNodeId)) {
                    activeWipCounts.set(sourceNodeId, Math.max(0, (activeWipCounts.get(sourceNodeId) || 0) - 1));
                    activeWipCounts.set(nextNodeId, (activeWipCounts.get(nextNodeId) || 0) + 1);
                    enqueueVisualTransfer(sourceNodeId, nextNodeId);
                    moveItemToQueuedNode(item, nextNodeId);
                  } else {
                    blockItemAtSource(item, sourceNodeId, nextNodeId);
                  }
                } else {
                  activeWipCounts.set(sourceNodeId, Math.max(0, (activeWipCounts.get(sourceNodeId) || 0) - 1));
                  item.status = ItemStatus.COMPLETED;
                  item.currentNodeId = null;
                  item.handoffTargetNodeId = null;
                  item.completionTick = tickCount;
                  item.terminalNodeId = node.type === 'endNode' ? node.id : null;
                  registerCompletion(item);
                }
                item.progress = 100;
                stats.processed++;
              } else {
                activeWipCounts.set(node.id, Math.max(0, (activeWipCounts.get(node.id) || 0) - 1));
                item.status = ItemStatus.FAILED;
                item.currentNodeId = null;
                item.handoffTargetNodeId = null;
                item.completionTick = tickCount;
                item.terminalNodeId = null;
                item.progress = 100;
                stats.failed++;
              }
              nodesUpdates.set(node.id, stats);
            }
            continue;
          }

          const actualTime = applyVariability(
            pData.processingTime,
            pData.variability || 0,
            nextSimulationRandom
          );

          for (const item of batch) {
            item.status = ItemStatus.PROCESSING;
            item.handoffTargetNodeId = null;
            item.remainingTime = actualTime;
            item.processingDuration = actualTime;
            item.progress = 0;
          }
        }
      }

      // Queue waiting is counted only for items that remain queued after assignment.
      // This avoids adding an artificial +1 wait tick when capacity is immediately available.
      for (const item of allItems) {
        if (item.status !== ItemStatus.QUEUED || !item.currentNodeId) continue;
        const node = nodeMap.get(item.currentNodeId);
        if (!node || node.type === 'annotationNode') continue;
        const isWorking = workingStatus.get(node.id) ?? true;
        if (!isWorking) continue;
        item.timeWaiting++;
        item.nodeLeadTime++;
        item.totalTime++;
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
            if (n.type === 'processNode' && getNodeBatchSize(pData) > Math.max(1, pData.resources)) {
              validationError = 'Batch > Capacity';
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
      const nextVisualTransfers =
        pendingVisualTransfers.length > 0
          ? [...visualTransfers, ...pendingVisualTransfers].slice(-MAX_VISUAL_TRANSFERS)
          : visualTransfers;

      // Calculate progress percentage
      const newTickCount = tickCount + 1;
      const displayTickCount = newTickCount;
      let simulationProgress = targetDuration === Infinity
        ? 0
        : Math.min(100, (newTickCount / targetDuration) * 100);
      const shouldAutoStop = autoStopEnabled && targetDuration !== Infinity && newTickCount >= targetDuration;

      let nextLastRunSummary = lastRunSummary;
      let nextLastLoggedRunKey = lastLoggedRunKey;
      if (shouldAutoStop) {
        simulationProgress = 100;

        if (demandMode === 'target') {
          const summary = buildRunSummary(
            {
              items: prunedItems,
              itemCounts: derived.itemCounts,
              metricsWindowCompletions,
              metricsEpoch,
              demandArrivalsGenerated: nextDemandArrivalsGenerated,
              periodCompleted: periodCompletedNext,
              simulationSeed,
              durationPreset,
              demandMode,
              runStartedAtMs: effectiveRunStartedAtMs,
              currentCanvasId,
              currentCanvasName
            },
            newTickCount,
            'target_run_completed'
          );
          const runKey = buildRunSummaryKey(summary);
          nextLastRunSummary = summary;

          if (!state.readOnlyMode && runKey !== lastLoggedRunKey) {
            pendingRunLog = {
              score: summary.score,
              durationMs: summary.wallClockDurationMs,
              outcome: summary.outcome,
              metadata: summary as unknown as Record<string, unknown>
            };
            nextLastLoggedRunKey = runKey;
          }
        }
      }

      return {
        items: prunedItems,
        nodes: nextNodes,
        isRunning: shouldAutoStop ? false : state.isRunning,
        tickCount: newTickCount,
        displayTickCount,
        history: nextHistory,
        itemsByNode: derived.itemsByNode,
        itemCounts: derived.itemCounts,
        visualTransfers: nextVisualTransfers,
        simulationProgress,
        cumulativeCompleted: cumulativeCompletedNext,
        periodCompleted: periodCompletedNext,
        throughput: currentThroughput,
        demandArrivalsGenerated: nextDemandArrivalsGenerated,
        demandArrivalsByNode: nextDemandArrivalsByNode,
        demandAccumulatorByNode: nextDemandAccumulatorByNode,
        demandOpenTicksByNode: nextDemandOpenTicksByNode,
        runStartedAtMs: effectiveRunStartedAtMs,
        lastRunSummary: nextLastRunSummary,
        lastLoggedRunKey: nextLastLoggedRunKey
      };
    });

    if (pendingRunLog) {
      const sdk = getProcessBoxSdk();
      if (sdk?.isEmbedded) {
        void sdk.logScoreRun(pendingRunLog).catch(() => {
          showToast('warning', 'Process Box run history could not be recorded.');
        });
      }
    }

    if (pendingVisualTransfers.length > 0) {
      for (const transfer of pendingVisualTransfers) {
        scheduleVisualTransferCleanup(transfer.id, transfer.durationMs, set);
      }
    }
  }
}));
