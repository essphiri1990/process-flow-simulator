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
  DEFAULT_KPI_TARGETS,
  SimulationState,
  ProcessNode,
  StartNode,
  EndNode,
  AnnotationNode,
  AppNode,
  ProcessItem,
  ItemStatus,
  ProcessNodeData,
  DURATION_PRESETS,
  SPEED_PRESETS,
  applyVariability,
  CanvasFlowData,
  CapacityMode,
  DEMAND_UNIT_TICKS,
  DemandMode,
  DemandUnit,
  KpiBucket,
  KpiHistoryByPeriod,
  KpiPeriod,
  KpiTargets,
  KPI_PERIODS,
  NodeUtilizationHistoryByNode,
  PoolUtilizationBucket,
  PoolUtilizationHistoryByPeriod,
  ResourcePool,
  SharedNodeBudgetState,
  SharedNodeBudgetStateByNode,
  SharedCapacityInputMode,
  WorkingHoursConfig,
  RunSummary,
  VisualTransfer,
} from './types';
import {
  computeOpenTicksForPeriod,
  getWorkingDayBudgetKey,
  isWorkingTick,
  normalizeWorkingHours,
} from './timeModel';
import { showToast } from './components/Toast';
import { computeLeadMetrics, computeThroughputFromCompletions, NODE_UTILIZATION_ROLLING_WINDOW_TICKS } from './metrics';
import {
  DEFAULT_RESOURCE_POOL_ID,
  DEFAULT_SHARED_CAPACITY_INPUT_MODE,
  DEFAULT_SHARED_CAPACITY_VALUE,
  getDefaultResourcePool,
  getMaxPossibleProcessingTime,
  getLocalCapacityUnits,
  getNodeCapacityProfile,
} from './capacityModel';
import {
  getDefaultResourcePoolAvatarId,
  getDefaultResourcePoolColorId,
  normalizeResourcePoolAvatarId,
  normalizeResourcePoolColorId,
} from './resourcePoolVisuals';
import { getProcessBoxSdk } from './processBoxSdk';
import { createRandomSeed, nextMulberry32, normalizeSeed } from './rng';
import { SCENARIOS, SCENARIO_NAMES } from './scenarios';
import {
  buildRunStateReset,
  computeDerivedState,
  createDefaultCapacityState,
  createDefaultWorkingHours,
  createEmptyItemCounts,
  createEmptyKpiHistory,
  createEmptyNodeUtilizationHistory,
  createEmptyPoolUtilizationHistory,
  createEmptySharedNodeBudgetStateByNode,
  createPastedNode,
  createQueuedItem,
  DEFAULT_NODE_BATCH_SIZE,
  DEFAULT_NODE_FLOW_MODE,
  DEFAULT_PULL_OPEN_SLOTS_REQUIRED,
  getLegacySharedCapacityFields,
  getNormalizedResourcePools,
  getScenarioCapacityState,
  normalizeNodesForResourcePools,
  normalizeProcessNodeSettings,
} from './storeState';
import {
  AUTOSAVE_DRAFT_CANVAS_ID,
  deleteCanvas,
  getAllCanvases,
  getCanvas,
  isAutosaveDraftCanvasId,
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
const DEFAULT_NODE_BATCH_SIZE = 0;
const DEFAULT_NODE_FLOW_MODE = 'push' as const;
const DEFAULT_PULL_OPEN_SLOTS_REQUIRED = 1;
const MAX_VISUAL_TRANSFERS = 120;
const MAX_UNDO_SNAPSHOTS = 40;
const AUTOSAVE_DELAY_MS = 8000;
const SUN_MOON_CLOCK_PREF_KEY = 'pf-show-sun-moon-clock';
const SHARED_RESOURCES_CARD_PREF_KEY = 'pf-show-shared-resources-card';

type EditorSnapshot = Pick<
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
  | 'capacityMode'
  | 'sharedCapacityInputMode'
  | 'sharedCapacityValue'
  | 'resourcePools'
  | 'simulationSeed'
  | 'kpiTargets'
  | 'currentCanvasId'
  | 'currentCanvasName'
>;

const undoSnapshots: EditorSnapshot[] = [];
let autosaveTimer: number | null = null;

const cloneSerializable = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const createEditorSnapshot = (state: EditorSnapshot): EditorSnapshot =>
  cloneSerializable({
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
    capacityMode: state.capacityMode,
    sharedCapacityInputMode: state.sharedCapacityInputMode,
    sharedCapacityValue: state.sharedCapacityValue,
    resourcePools: state.resourcePools,
    simulationSeed: state.simulationSeed,
    kpiTargets: state.kpiTargets,
    currentCanvasId: state.currentCanvasId,
    currentCanvasName: state.currentCanvasName,
  });

const getKpiPeriodTicks = (period: KpiPeriod): number => {
  switch (period) {
    case 'hour':
      return DEMAND_UNIT_TICKS.hour;
    case 'day':
      return DEMAND_UNIT_TICKS.day;
    case 'week':
      return DEMAND_UNIT_TICKS.week;
    case 'month':
      return DEMAND_UNIT_TICKS.month;
  }
};

const getKpiPeriodLabel = (period: KpiPeriod, periodIndex: number): string => {
  const displayIndex = periodIndex + 1;
  switch (period) {
    case 'hour':
      return `H${displayIndex}`;
    case 'day':
      return `D${displayIndex}`;
    case 'week':
      return `W${displayIndex}`;
    case 'month':
      return `M${displayIndex}`;
  }
};

const upsertKpiBucket = (
  history: KpiHistoryByPeriod,
  period: KpiPeriod,
  tick: number,
  patch: Partial<Pick<KpiBucket, 'completions' | 'leadTimeTotal' | 'valueAddedTotal' | 'busyResourceTicks' | 'availableResourceTicks'>>,
): KpiHistoryByPeriod => {
  const nextHistory = { ...history };
  const ticksPerPeriod = getKpiPeriodTicks(period);
  const periodIndex = Math.floor(Math.max(0, tick) / ticksPerPeriod);
  const startTick = periodIndex * ticksPerPeriod;
  const endTick = startTick + ticksPerPeriod;
  const currentBuckets = [...nextHistory[period]];
  const lastBucket = currentBuckets[currentBuckets.length - 1];
  const baseBucket: KpiBucket =
    lastBucket && lastBucket.periodIndex === periodIndex
      ? lastBucket
      : {
          period,
          periodIndex,
          startTick,
          endTick,
          label: getKpiPeriodLabel(period, periodIndex),
          completions: 0,
          leadTimeTotal: 0,
          valueAddedTotal: 0,
          leadTimeAvg: 0,
          processEfficiencyAvg: 0,
          busyResourceTicks: 0,
          availableResourceTicks: 0,
          resourceUtilizationAvg: 0,
        };

  const nextBucket: KpiBucket = {
    ...baseBucket,
    completions: baseBucket.completions + (patch.completions || 0),
    leadTimeTotal: baseBucket.leadTimeTotal + (patch.leadTimeTotal || 0),
    valueAddedTotal: baseBucket.valueAddedTotal + (patch.valueAddedTotal || 0),
    busyResourceTicks: baseBucket.busyResourceTicks + (patch.busyResourceTicks || 0),
    availableResourceTicks: baseBucket.availableResourceTicks + (patch.availableResourceTicks || 0),
    leadTimeAvg:
      baseBucket.completions + (patch.completions || 0) > 0
        ? (baseBucket.leadTimeTotal + (patch.leadTimeTotal || 0)) /
          (baseBucket.completions + (patch.completions || 0))
        : 0,
    processEfficiencyAvg:
      baseBucket.leadTimeTotal + (patch.leadTimeTotal || 0) > 0
        ? ((baseBucket.valueAddedTotal + (patch.valueAddedTotal || 0)) /
            (baseBucket.leadTimeTotal + (patch.leadTimeTotal || 0))) *
          100
        : 0,
    resourceUtilizationAvg:
      baseBucket.availableResourceTicks + (patch.availableResourceTicks || 0) > 0
        ? Math.min(
            100,
            ((baseBucket.busyResourceTicks + (patch.busyResourceTicks || 0)) /
              (baseBucket.availableResourceTicks + (patch.availableResourceTicks || 0))) *
              100,
          )
        : 0,
  };

  if (lastBucket && lastBucket.periodIndex === periodIndex) {
    currentBuckets[currentBuckets.length - 1] = nextBucket;
  } else {
    currentBuckets.push(nextBucket);
  }
  nextHistory[period] = currentBuckets;
  return nextHistory;
};

const upsertPoolUtilizationBucket = (
  history: PoolUtilizationHistoryByPeriod,
  period: KpiPeriod,
  resourcePoolId: string,
  tick: number,
  patch: Pick<PoolUtilizationBucket, 'busyResourceTicks' | 'availableResourceTicks'>,
): PoolUtilizationHistoryByPeriod => {
  const nextHistory = {
    ...history,
    [period]: {
      ...history[period],
    },
  };
  const ticksPerPeriod = getKpiPeriodTicks(period);
  const periodIndex = Math.floor(Math.max(0, tick) / ticksPerPeriod);
  const startTick = periodIndex * ticksPerPeriod;
  const endTick = startTick + ticksPerPeriod;
  const currentBuckets = [...(nextHistory[period][resourcePoolId] || [])];
  const lastBucket = currentBuckets[currentBuckets.length - 1];
  const baseBucket: PoolUtilizationBucket =
    lastBucket && lastBucket.periodIndex === periodIndex
      ? lastBucket
      : {
          resourcePoolId,
          period,
          periodIndex,
          startTick,
          endTick,
          label: getKpiPeriodLabel(period, periodIndex),
          busyResourceTicks: 0,
          availableResourceTicks: 0,
          resourceUtilizationAvg: 0,
        };

  const nextBucket: PoolUtilizationBucket = {
    ...baseBucket,
    busyResourceTicks: baseBucket.busyResourceTicks + patch.busyResourceTicks,
    availableResourceTicks: baseBucket.availableResourceTicks + patch.availableResourceTicks,
    resourceUtilizationAvg:
      baseBucket.availableResourceTicks + patch.availableResourceTicks > 0
        ? Math.min(
            100,
            ((baseBucket.busyResourceTicks + patch.busyResourceTicks) /
              (baseBucket.availableResourceTicks + patch.availableResourceTicks)) *
              100,
          )
        : 0,
  };

  if (lastBucket && lastBucket.periodIndex === periodIndex) {
    currentBuckets[currentBuckets.length - 1] = nextBucket;
  } else {
    currentBuckets.push(nextBucket);
  }

  nextHistory[period][resourcePoolId] = currentBuckets;
  return nextHistory;
};

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

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

const readSharedResourcesCardPreference = () => {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(SHARED_RESOURCES_CARD_PREF_KEY);
    if (raw === null) return true;
    return raw !== '0';
  } catch {
    return true;
  }
};

const persistSharedResourcesCardPreference = (enabled: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SHARED_RESOURCES_CARD_PREF_KEY, enabled ? '1' : '0');
  } catch {
    // ignore local preference write failures
  }
};

const getNodeBatchSize = (data: Partial<ProcessNodeData> | undefined) => {
  const raw = Number(data?.batchSize);
  if (!Number.isFinite(raw)) return DEFAULT_NODE_BATCH_SIZE;
  const rounded = Math.max(0, Math.round(raw));
  return rounded > 1 ? rounded : 0;
};

const getNodeFlowMode = (data: Partial<ProcessNodeData> | undefined) =>
  data?.flowMode === 'pull' ? 'pull' : DEFAULT_NODE_FLOW_MODE;

const getNodePullOpenSlotsRequired = (data: Partial<ProcessNodeData> | undefined) => {
  const raw = Number(data?.pullOpenSlotsRequired);
  return Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : DEFAULT_PULL_OPEN_SLOTS_REQUIRED;
};

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
  if ('allocationPercent' in nextPartial && nextPartial.allocationPercent !== prev.allocationPercent) return true;
  if ('resourcePoolId' in nextPartial && nextPartial.resourcePoolId !== prev.resourcePoolId) return true;
  if ('workingHours' in nextPartial) {
    const nextWorking = nextPartial.workingHours
      ? { ...(prev.workingHours || createDefaultWorkingHours()), ...nextPartial.workingHours }
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
  kpiHistoryByPeriod: createEmptyKpiHistory(),
  nodeUtilizationHistoryByNode: createEmptyNodeUtilizationHistory(),
  poolUtilizationHistoryByPeriod: createEmptyPoolUtilizationHistory(),
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
const isAutosaveDraftSnapshot = (snapshot: any, workspaceId?: unknown): boolean =>
  snapshot?.autosaveDraft === true ||
  isAutosaveDraftCanvasId(
    normalizeWorkspaceId(snapshot?.workspaceId) || normalizeWorkspaceId(workspaceId),
  );

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
    | 'capacityMode'
    | 'sharedCapacityInputMode'
    | 'sharedCapacityValue'
    | 'resourcePools'
    | 'simulationSeed'
    | 'kpiTargets'
  >,
  options: {
    workspaceId?: string | null;
    canvasName?: string | null;
  } = {},
): CanvasFlowData & { canvasName: string } => ({
  workspaceId: normalizeWorkspaceId(options.workspaceId) || undefined,
  autosaveDraft: false,
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
  capacityMode: state.capacityMode,
  sharedCapacityInputMode: state.sharedCapacityInputMode,
  sharedCapacityValue: state.sharedCapacityValue,
  resourcePools: state.resourcePools,
  simulationSeed: state.simulationSeed,
  kpiTargets: state.kpiTargets,
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
  const capacityMode = (snapshot.capacityMode as CapacityMode) || 'local';
  const sharedCapacityInputMode =
    (snapshot.sharedCapacityInputMode as SharedCapacityInputMode) || DEFAULT_SHARED_CAPACITY_INPUT_MODE;
  const sharedCapacityValue = Number.isFinite(snapshot.sharedCapacityValue)
    ? Math.max(0, Number(snapshot.sharedCapacityValue))
    : DEFAULT_SHARED_CAPACITY_VALUE;
  const resourcePools = getNormalizedResourcePools(
    snapshot.resourcePools as ResourcePool[] | undefined,
    sharedCapacityInputMode,
    sharedCapacityValue,
  );
  const legacySharedCapacityFields = getLegacySharedCapacityFields(resourcePools);
  const simulationSeed = normalizeSeed(snapshot.simulationSeed, getState().simulationSeed);
  const kpiTargets = {
    ...getState().kpiTargets,
    ...(snapshot.kpiTargets || {}),
  };
  const nextCanvasName = normalizeCanvasName(options.canvasName || snapshot.canvasName || getState().currentCanvasName);
  const normalizedNodesForPools = normalizeNodesForResourcePools(snapshot.nodes as AppNode[], resourcePools);
  const normalizedEdges = normalizeFlowEdgeHandles<Edge>(normalizedNodesForPools as AppNode[], snapshot.edges as Edge[]);
  const nextNodes = resetRuntimeNodeState(normalizedNodesForPools as AppNode[], normalizedEdges, {
    capacityMode,
    sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
    sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
    resourcePools,
  });
  resetSimulationRng(simulationSeed);
  clearVisualTransferCleanupTimers();

  setState({
    nodes: nextNodes,
    edges: normalizedEdges,
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
    capacityMode,
    sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
    sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
    resourcePools,
    demandTotalTicks: DEMAND_UNIT_TICKS[demandUnit],
    simulationSeed,
    kpiTargets,
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

const initialNodes: AppNode[] = cloneSerializable(SCENARIOS.devops.nodes) as AppNode[];
const initialEdges: Edge[] = normalizeFlowEdgeHandles(
  initialNodes,
  cloneSerializable(SCENARIOS.devops.edges) as Edge[],
);

const buildEdgesBySource = (edges: Edge[]) => {
  const map = new Map<string, Edge[]>();
  for (const edge of edges) {
    if (!edge.source) continue;
    const existing = map.get(edge.source);
    if (existing) {
      existing.push(edge);
    } else {
      map.set(edge.source, [edge]);
    }
  }
  return map;
};

const normalizeGraphEdges = (nodes: AppNode[], edges: Edge[]) => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const connectedEdges = edges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );
  return normalizeFlowEdgeHandles(nodes, connectedEdges);
};

const reconcileItemsForGraph = (
  items: ProcessItem[],
  nodes: AppNode[],
  edges: Edge[],
) => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const retainedItems = items.filter(
    (item) => item.currentNodeId === null || nodeIds.has(item.currentNodeId),
  );
  return reconcileBlockedItemsForFlow(retainedItems, nodes, edges);
};

const buildNodeCapacityProfiles = (
  nodes: AppNode[],
  settings: {
    capacityMode: CapacityMode;
    sharedCapacityInputMode: SharedCapacityInputMode;
    sharedCapacityValue: number;
    resourcePools: ResourcePool[];
  }
) => {
  const profiles = new Map<string, ReturnType<typeof getNodeCapacityProfile>>();
  for (const node of nodes) {
    if (node.type === 'annotationNode') continue;
    profiles.set(node.id, getNodeCapacityProfile(node, nodes, settings));
  }
  return profiles;
};

const createSharedNodeBudgetState = (
  budgetDayKey: number | null,
  dailyBudgetMinutes: number,
): SharedNodeBudgetState => ({
  budgetDayKey,
  dailyBudgetMinutes,
  remainingBudgetMinutes: dailyBudgetMinutes,
  consumedBudgetMinutes: 0,
  budgetExhausted: false,
});

const getSharedNodeBudgetStateForTick = (
  node: AppNode,
  capacityProfile: ReturnType<typeof getNodeCapacityProfile> | undefined,
  tick: number,
  isWorking: boolean,
  sharedNodeBudgetStateByNode: SharedNodeBudgetStateByNode,
): SharedNodeBudgetState | null => {
  if (!capacityProfile?.usesSharedAllocation || (node.type !== 'processNode' && node.type !== 'startNode')) {
    return null;
  }

  const dailyBudgetMinutes = Math.max(0, capacityProfile.dailyBudgetMinutes);
  const previousState = sharedNodeBudgetStateByNode[node.id];
  if (!isWorking) {
    if (!previousState) {
      return createSharedNodeBudgetState(null, dailyBudgetMinutes);
    }
    return {
      ...previousState,
      dailyBudgetMinutes,
      remainingBudgetMinutes: Math.max(0, Math.min(dailyBudgetMinutes, previousState.remainingBudgetMinutes)),
      consumedBudgetMinutes: Math.max(0, Math.min(dailyBudgetMinutes, previousState.consumedBudgetMinutes)),
      budgetExhausted: false,
    };
  }

  const budgetDayKey = getWorkingDayBudgetKey(tick, (node.data as ProcessNodeData).workingHours);
  if (!previousState || previousState.budgetDayKey !== budgetDayKey || previousState.dailyBudgetMinutes !== dailyBudgetMinutes) {
    return createSharedNodeBudgetState(budgetDayKey, dailyBudgetMinutes);
  }

  return {
    ...previousState,
    dailyBudgetMinutes,
    remainingBudgetMinutes: Math.max(0, Math.min(dailyBudgetMinutes, previousState.remainingBudgetMinutes)),
    consumedBudgetMinutes: Math.max(0, Math.min(dailyBudgetMinutes, previousState.consumedBudgetMinutes)),
    budgetExhausted: false,
  };
};

const computeValidationErrorForNode = (
  node: AppNode,
  edgesBySource: Map<string, Edge[]>,
  nodeCapacityProfiles: Map<string, ReturnType<typeof getNodeCapacityProfile>>
): string | undefined => {
  if (node.type === 'annotationNode' || node.type === 'endNode') return undefined;

  const pData = node.data as ProcessNodeData;
  const capacityProfile = nodeCapacityProfiles.get(node.id);
  let validationError: string | undefined;
  const outgoing = edgesBySource.get(node.id);

  if (!outgoing || outgoing.length === 0) {
    validationError = 'No Output Path';
  }
  if (capacityProfile?.usesSharedAllocation) {
    if (capacityProfile.dailyBudgetMinutes <= 0) {
      validationError = 'Zero Allocation';
    } else if (getLocalCapacityUnits(pData.resources) === 0) {
      validationError = 'Zero Capacity';
    } else if (getMaxPossibleProcessingTime(pData.processingTime, pData.variability || 0) > capacityProfile.dailyBudgetMinutes) {
      validationError = 'Step Exceeds Daily Budget';
    }
    if (node.type === 'processNode' && getNodeBatchSize(pData) > 1) {
      validationError = 'Batch needs Local Cap';
    }
  } else if (getLocalCapacityUnits(pData.resources) === 0) {
    validationError = 'Zero Capacity';
  }
  if (
    !capacityProfile?.usesSharedAllocation &&
    node.type === 'processNode' &&
    getLocalCapacityUnits(pData.resources) > 0 &&
    getNodeBatchSize(pData) > getLocalCapacityUnits(pData.resources)
  ) {
    validationError = 'Batch > Capacity';
  }

  return validationError;
};

const applyValidationToNodes = (
  nodes: AppNode[],
  edges: Edge[],
  settings: {
    capacityMode: CapacityMode;
    sharedCapacityInputMode: SharedCapacityInputMode;
    sharedCapacityValue: number;
    resourcePools: ResourcePool[];
  }
): AppNode[] => {
  const edgesBySource = buildEdgesBySource(edges);
  const nodeCapacityProfiles = buildNodeCapacityProfiles(nodes, settings);

  return nodes.map((node) => {
    if (node.type === 'annotationNode') return node;
    const nextValidationError = computeValidationErrorForNode(node, edgesBySource, nodeCapacityProfiles);
    if ((node.data as ProcessNodeData).validationError === nextValidationError) {
      return node;
    }
    return {
      ...node,
      data: {
        ...node.data,
        validationError: nextValidationError,
      },
    } as AppNode;
  });
};

const reconcileGraphState = (
  state: Pick<SimulationState, 'items' | 'edges' | 'nodes' | 'capacityMode' | 'sharedCapacityInputMode' | 'sharedCapacityValue' | 'resourcePools'>,
  nextNodes: AppNode[],
  nextEdges: Edge[],
) => {
  const resourcePools = getNormalizedResourcePools(
    state.resourcePools,
    state.sharedCapacityInputMode,
    state.sharedCapacityValue,
  );
  const normalizedNodes = normalizeNodesForResourcePools(nextNodes, resourcePools);
  const normalizedEdges = normalizeGraphEdges(normalizedNodes, nextEdges);
  const nextItems = reconcileItemsForGraph(state.items, normalizedNodes, normalizedEdges);
  return {
    nodes: applyValidationToNodes(normalizedNodes, normalizedEdges, getSharedCapacitySettings(state)),
    edges: normalizedEdges,
    items: nextItems,
    ...computeDerivedState(nextItems),
  };
};

const resetRuntimeNodeState = (
  nodes: AppNode[],
  edges: Edge[],
  settings: {
    capacityMode: CapacityMode;
    sharedCapacityInputMode: SharedCapacityInputMode;
    sharedCapacityValue: number;
    resourcePools: ResourcePool[];
  }
): AppNode[] =>
  applyValidationToNodes(
    nodes.map((node) => {
      if (node.type !== 'processNode' && node.type !== 'startNode' && node.type !== 'endNode') {
        return node;
      }
      const pData = node.data as ProcessNodeData;
      const hasRuntimeState =
        pData.stats.processed !== 0 ||
        pData.stats.failed !== 0 ||
        pData.stats.maxQueue !== 0 ||
        pData.validationError !== undefined;
      if (!hasRuntimeState) {
        return node;
      }
      return {
        ...node,
        data: {
          ...pData,
          stats: { processed: 0, failed: 0, maxQueue: 0 },
          validationError: undefined,
        },
      } as AppNode;
    }),
    edges,
    settings
  );

const getSharedCapacitySettings = (
  state: Pick<SimulationState, 'capacityMode' | 'sharedCapacityInputMode' | 'sharedCapacityValue' | 'resourcePools'>
) => ({
  capacityMode: state.capacityMode,
  sharedCapacityInputMode: state.sharedCapacityInputMode,
  sharedCapacityValue: state.sharedCapacityValue,
  resourcePools: state.resourcePools,
});

const resolveBlockedItemTarget = (
  item: ProcessItem,
  nodeMap: Map<string, AppNode>,
  edgesBySource: Map<string, Edge[]>
): string | null => {
  if (!item.currentNodeId || !item.handoffTargetNodeId) return null;
  const sourceNode = nodeMap.get(item.currentNodeId);
  if (!sourceNode || sourceNode.type === 'annotationNode') return null;

  const outgoing = edgesBySource.get(item.currentNodeId) || [];
  if (
    nodeMap.has(item.handoffTargetNodeId) &&
    outgoing.some((edge) => edge.target === item.handoffTargetNodeId)
  ) {
    return item.handoffTargetNodeId;
  }
  if (outgoing.length === 0) return null;
  if (outgoing.length === 1) return outgoing[0].target;

  const routingWeights = (sourceNode.data as ProcessNodeData).routingWeights || {};
  let preferredTarget = outgoing[0].target;
  let preferredWeight = Math.max(0, routingWeights[preferredTarget] ?? 1);

  for (const edge of outgoing.slice(1)) {
    const edgeWeight = Math.max(0, routingWeights[edge.target] ?? 1);
    if (edgeWeight > preferredWeight) {
      preferredTarget = edge.target;
      preferredWeight = edgeWeight;
    }
  }

  return preferredTarget;
};

const reconcileBlockedItemsForFlow = (
  items: ProcessItem[],
  nodes: AppNode[],
  edges: Edge[]
): ProcessItem[] => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edgesBySource = buildEdgesBySource(edges);
  let changed = false;

  const nextItems = items.map((item) => {
    if (item.status !== ItemStatus.QUEUED || !item.currentNodeId || !item.handoffTargetNodeId) {
      return item;
    }

    const nextTarget = resolveBlockedItemTarget(item, nodeMap, edgesBySource);
    if (!nextTarget || nextTarget === item.handoffTargetNodeId) {
      return item;
    }

    changed = true;
    return {
      ...item,
      handoffTargetNodeId: nextTarget,
    };
  });

  return changed ? nextItems : items;
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

const pushUndoSnapshot = (
  state: EditorSnapshot,
  setState: (partial: Partial<SimulationState>) => void,
) => {
  undoSnapshots.push(createEditorSnapshot(state));
  if (undoSnapshots.length > MAX_UNDO_SNAPSHOTS) {
    undoSnapshots.splice(0, undoSnapshots.length - MAX_UNDO_SNAPSHOTS);
  }
  setState({ canUndo: undoSnapshots.length > 0 });
};

const restoreEditorSnapshot = (
  snapshot: EditorSnapshot,
  currentState: SimulationState,
): Partial<SimulationState> => {
  const durationConfig = DURATION_PRESETS[snapshot.durationPreset] || DURATION_PRESETS.unlimited;
  const speedConfig = SPEED_PRESETS.find((preset) => preset.key === snapshot.speedPreset) || SPEED_PRESETS[1];
  const resourcePools = getNormalizedResourcePools(
    snapshot.resourcePools,
    snapshot.sharedCapacityInputMode,
    snapshot.sharedCapacityValue,
  );
  const legacySharedCapacityFields = getLegacySharedCapacityFields(resourcePools);
  const clonedNodes = normalizeNodesForResourcePools(
    cloneSerializable(snapshot.nodes) as AppNode[],
    resourcePools,
  );
  const clonedEdges = cloneSerializable(snapshot.edges) as Edge[];
  const normalizedEdges = normalizeFlowEdgeHandles(clonedNodes, clonedEdges);
  const restoredNodes = resetRuntimeNodeState(clonedNodes, normalizedEdges, {
    capacityMode: snapshot.capacityMode,
    sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
    sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
    resourcePools,
  });
  resetSimulationRng(snapshot.simulationSeed);
  clearVisualTransferCleanupTimers();

  return {
    nodes: restoredNodes,
    edges: normalizedEdges,
    itemConfig: cloneSerializable(snapshot.itemConfig),
    defaultHeaderColor: snapshot.defaultHeaderColor,
    durationPreset: snapshot.durationPreset,
    targetDuration: durationConfig.totalTicks,
    speedPreset: snapshot.speedPreset,
    ticksPerSecond: speedConfig.ticksPerSecond,
    autoStopEnabled: snapshot.autoStopEnabled,
    metricsWindowCompletions: snapshot.metricsWindowCompletions,
    demandMode: snapshot.demandMode,
    demandUnit: snapshot.demandUnit,
    capacityMode: snapshot.capacityMode,
    sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
    sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
    resourcePools,
    demandTotalTicks: DEMAND_UNIT_TICKS[snapshot.demandUnit],
    simulationSeed: snapshot.simulationSeed,
    kpiTargets: cloneSerializable(snapshot.kpiTargets),
    currentCanvasId: snapshot.currentCanvasId,
    currentCanvasName: snapshot.currentCanvasName,
    ...buildRunStateReset(),
    lastAutoSavedAt: currentState.lastAutoSavedAt,
    canUndo: undoSnapshots.length > 0,
  };
};

const clearAutosaveTimer = () => {
  if (!autosaveTimer) return;
  window.clearTimeout(autosaveTimer);
  autosaveTimer = null;
};

const scheduleAutosave = (getState: () => SimulationState) => {
  if (typeof window === 'undefined') return;
  clearAutosaveTimer();
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null;
    const state = getState();
    if (state.readOnlyMode) return;
    void state.saveCanvasToDb({ silent: true, autosave: true, skipRefresh: true });
  }, AUTOSAVE_DELAY_MS);
};

const shouldRecordUndoForNodeChanges = (changes: NodeChange[]) =>
  changes.some((change: any) => {
    if (change?.type === 'select') return false;
    if (change?.type === 'position' && change?.dragging === true) return false;
    return true;
  });

const shouldRecordUndoForEdgeChanges = (changes: EdgeChange[]) =>
  changes.some((change: any) => change?.type !== 'select');

const initialCapacityState = createDefaultCapacityState();

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
  capacityMode: initialCapacityState.capacityMode,
  sharedCapacityInputMode: initialCapacityState.sharedCapacityInputMode,
  sharedCapacityValue: initialCapacityState.sharedCapacityValue,
  resourcePools: initialCapacityState.resourcePools,
  demandTotalTicks: DEMAND_UNIT_TICKS.week,
  demandArrivalsGenerated: 0,
  demandArrivalsByNode: {},
  demandAccumulatorByNode: {},
  demandOpenTicksByNode: {},
  periodCompleted: 0,
  kpiHistoryByPeriod: createEmptyKpiHistory(),
  nodeUtilizationHistoryByNode: createEmptyNodeUtilizationHistory(),
  poolUtilizationHistoryByPeriod: createEmptyPoolUtilizationHistory(),
  sharedNodeBudgetStateByNode: createEmptySharedNodeBudgetStateByNode(),

  // Performance: Pre-computed derived state
  itemsByNode: new Map(),
  blockedCountsByTarget: new Map(),
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
  kpiTargets: { ...DEFAULT_KPI_TARGETS },
  showSunMoonClock: readShowSunMoonClockPreference(),
  showSharedResourcesCard: readSharedResourcesCardPreference(),
  readOnlyMode: false,
  runStartedAtMs: null,
  lastRunSummary: null,
  lastLoggedRunKey: null,
  lastAutoSavedAt: null,
  canUndo: false,

  // Canvas identity
  currentCanvasId: null,
  currentCanvasName: 'Untitled Canvas',
  savedCanvasList: [],

  setNodes: (nodes) => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    set((state) => reconcileGraphState(state, nodes, state.edges));
    scheduleAutosave(get);
  },
  setEdges: (edges) => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    set((state) => reconcileGraphState(state, state.nodes, edges));
    scheduleAutosave(get);
  },
  setItemConfig: (config) => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    set(state => ({ itemConfig: { ...state.itemConfig, ...config } }));
    scheduleAutosave(get);
  },
  setDefaultHeaderColor: (color) => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    set({ defaultHeaderColor: color });
    scheduleAutosave(get);
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
    pushUndoSnapshot(get(), set);
    set((state) => {
      if (mode === state.demandMode) return state;
      const demandTotalTicks = DEMAND_UNIT_TICKS[state.demandUnit];
      const durationPreset = mode === 'target' ? getDemandDurationPreset(state.demandUnit) : state.durationPreset;
      const targetDuration = mode === 'target' ? demandTotalTicks : state.targetDuration;
      const nextSettings = getSharedCapacitySettings(state);
      resetSimulationRng(state.simulationSeed);
      return {
        demandMode: mode,
        demandTotalTicks,
        durationPreset,
        targetDuration,
        autoStopEnabled: mode === 'target' ? true : state.autoStopEnabled,
        ...buildRunStateReset(),
        nodes: resetRuntimeNodeState(state.nodes, state.edges, nextSettings),
      };
    });
    scheduleAutosave(get);
  },
  setDemandUnit: (unit: DemandUnit) => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    set((state) => {
      if (unit === state.demandUnit) return state;
      const demandTotalTicks = DEMAND_UNIT_TICKS[unit];
      const durationPreset = state.demandMode === 'target' ? getDemandDurationPreset(unit) : state.durationPreset;
      const targetDuration = state.demandMode === 'target' ? demandTotalTicks : state.targetDuration;
      const nextSettings = getSharedCapacitySettings(state);
      resetSimulationRng(state.simulationSeed);
      return {
        demandUnit: unit,
        demandTotalTicks,
        durationPreset,
        targetDuration,
        ...buildRunStateReset(),
        nodes: resetRuntimeNodeState(state.nodes, state.edges, nextSettings),
      };
    });
    scheduleAutosave(get);
  },
  setCapacityMode: (mode: CapacityMode) => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    set((state) => {
      if (mode === state.capacityMode) return state;
      const nextSettings = {
        capacityMode: mode,
        sharedCapacityInputMode: state.sharedCapacityInputMode,
        sharedCapacityValue: state.sharedCapacityValue,
        resourcePools: state.resourcePools,
      };
      resetSimulationRng(state.simulationSeed);
      return {
        capacityMode: mode,
        ...buildRunStateReset(),
        nodes: resetRuntimeNodeState(state.nodes, state.edges, nextSettings),
      };
    });
    scheduleAutosave(get);
  },
  setSharedCapacityInputMode: (mode: SharedCapacityInputMode) => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    set((state) => {
      if (mode === state.sharedCapacityInputMode) return state;
      const resourcePools = getNormalizedResourcePools(state.resourcePools, mode, state.sharedCapacityValue).map((pool) =>
        pool.id === DEFAULT_RESOURCE_POOL_ID ? { ...pool, inputMode: mode } : pool,
      );
      const legacySharedCapacityFields = getLegacySharedCapacityFields(resourcePools);
      const nextSettings = {
        capacityMode: state.capacityMode,
        sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
        sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
        resourcePools,
      };
      resetSimulationRng(state.simulationSeed);
      return {
        sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
        sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
        resourcePools,
        ...buildRunStateReset(),
        nodes: resetRuntimeNodeState(state.nodes, state.edges, nextSettings),
      };
    });
    scheduleAutosave(get);
  },
  setSharedCapacityValue: (value: number) => {
    if (get().readOnlyMode) return;
    const nextValue = Number.isFinite(value) ? Math.max(0, value) : get().sharedCapacityValue;
    pushUndoSnapshot(get(), set);
    set((state) => {
      if (nextValue === state.sharedCapacityValue) return state;
      const resourcePools = getNormalizedResourcePools(state.resourcePools, state.sharedCapacityInputMode, nextValue).map((pool) =>
        pool.id === DEFAULT_RESOURCE_POOL_ID ? { ...pool, capacityValue: nextValue } : pool,
      );
      const legacySharedCapacityFields = getLegacySharedCapacityFields(resourcePools);
      const nextSettings = {
        capacityMode: state.capacityMode,
        sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
        sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
        resourcePools,
      };
      resetSimulationRng(state.simulationSeed);
      return {
        sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
        sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
        resourcePools,
        ...buildRunStateReset(),
        nodes: resetRuntimeNodeState(state.nodes, state.edges, nextSettings),
      };
    });
    scheduleAutosave(get);
  },
  addResourcePool: () => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    set((state) => {
      const currentPools = getNormalizedResourcePools(
        state.resourcePools,
        state.sharedCapacityInputMode,
        state.sharedCapacityValue,
      );
      const resourcePools: ResourcePool[] = [
        ...currentPools,
        {
          id: `resource-pool-${generateId()}`,
          name: `Pool ${currentPools.length}`,
          inputMode: 'fte',
          capacityValue: 1,
          avatarId: getDefaultResourcePoolAvatarId(currentPools.length),
          colorId: getDefaultResourcePoolColorId(currentPools.length),
        },
      ];
      const legacySharedCapacityFields = getLegacySharedCapacityFields(resourcePools);
      const nextNodes = applyValidationToNodes(
        normalizeNodesForResourcePools(state.nodes, resourcePools),
        state.edges,
        {
          capacityMode: state.capacityMode,
          sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
          sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
          resourcePools,
        },
      );
      return {
        resourcePools,
        sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
        sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
        nodes: nextNodes,
      };
    });
    scheduleAutosave(get);
  },
  updateResourcePool: (id: string, patch: Partial<ResourcePool>) => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    set((state) => {
      const currentPools = getNormalizedResourcePools(
        state.resourcePools,
        state.sharedCapacityInputMode,
        state.sharedCapacityValue,
      );
      const resourcePools: ResourcePool[] = currentPools.map((pool): ResourcePool => {
        if (pool.id !== id) return pool;
        const nextInputMode: SharedCapacityInputMode =
          patch.inputMode === 'hours' ? 'hours' : 'fte';
        return {
          ...pool,
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.inputMode !== undefined ? { inputMode: nextInputMode } : {}),
          ...(patch.capacityValue !== undefined
            ? { capacityValue: Number.isFinite(patch.capacityValue) ? Math.max(0, Number(patch.capacityValue)) : pool.capacityValue }
            : {}),
          ...(patch.avatarId !== undefined
            ? { avatarId: normalizeResourcePoolAvatarId(patch.avatarId, 0, pool.id === DEFAULT_RESOURCE_POOL_ID) }
            : {}),
          ...(patch.colorId !== undefined
            ? { colorId: normalizeResourcePoolColorId(patch.colorId, 0, pool.id === DEFAULT_RESOURCE_POOL_ID) }
            : {}),
        };
      });
      const legacySharedCapacityFields = getLegacySharedCapacityFields(resourcePools);
      const shouldReset = patch.inputMode !== undefined || patch.capacityValue !== undefined;
      const normalizedNodes = normalizeNodesForResourcePools(state.nodes, resourcePools);
      const nextSettings = {
        capacityMode: state.capacityMode,
        sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
        sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
        resourcePools,
      };

      if (!shouldReset) {
        return {
          resourcePools,
          sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
          sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
          nodes: applyValidationToNodes(normalizedNodes, state.edges, nextSettings),
        };
      }

      resetSimulationRng(state.simulationSeed);
      return {
        resourcePools,
        sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
        sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
        ...buildRunStateReset(),
        nodes: resetRuntimeNodeState(normalizedNodes, state.edges, nextSettings),
      };
    });
    scheduleAutosave(get);
  },
  deleteResourcePool: (id: string) => {
    if (get().readOnlyMode) return;
    if (!id || id === DEFAULT_RESOURCE_POOL_ID) return;
    pushUndoSnapshot(get(), set);
    set((state) => {
      const currentPools = getNormalizedResourcePools(
        state.resourcePools,
        state.sharedCapacityInputMode,
        state.sharedCapacityValue,
      );
      if (currentPools.length <= 1 || !currentPools.some((pool) => pool.id === id)) {
        return state;
      }
      const resourcePools: ResourcePool[] = currentPools.filter((pool) => pool.id !== id);
      const legacySharedCapacityFields = getLegacySharedCapacityFields(resourcePools);
      const normalizedNodes = normalizeNodesForResourcePools(state.nodes, resourcePools);
      const nextSettings = {
        capacityMode: state.capacityMode,
        sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
        sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
        resourcePools,
      };
      resetSimulationRng(state.simulationSeed);
      return {
        resourcePools,
        sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
        sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
        ...buildRunStateReset(),
        nodes: resetRuntimeNodeState(normalizedNodes, state.edges, nextSettings),
      };
    });
    scheduleAutosave(get);
  },

  setDurationPreset: (preset: string) => {
    if (get().readOnlyMode) return;
    const presetConfig = DURATION_PRESETS[preset];
    if (!presetConfig) return;
    pushUndoSnapshot(get(), set);
    set({
      durationPreset: preset,
      targetDuration: presetConfig.totalTicks,
      // Recalculate progress based on current tickCount
      simulationProgress: presetConfig.totalTicks === Infinity
        ? 0
        : Math.min(100, (get().tickCount / presetConfig.totalTicks) * 100)
    });
    scheduleAutosave(get);
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
    pushUndoSnapshot(get(), set);
    set({ autoStopEnabled: enabled });
    scheduleAutosave(get);
  },

  setSimulationSeed: (seed: number) => {
    if (get().readOnlyMode) return;
    const normalized = normalizeSeed(seed, get().simulationSeed);
    pushUndoSnapshot(get(), set);
    resetSimulationRng(normalized);
    set({ simulationSeed: normalized });
    scheduleAutosave(get);
  },

  setKpiTargets: (targets) => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    set((state) => ({
      kpiTargets: {
        leadTime:
          Number.isFinite(Number(targets.leadTime)) && Number(targets.leadTime) >= 0
            ? Math.round(Number(targets.leadTime))
            : state.kpiTargets.leadTime,
        processEfficiency:
          targets.processEfficiency === undefined
            ? state.kpiTargets.processEfficiency
            : clampPercent(Number(targets.processEfficiency)),
        resourceUtilization:
          targets.resourceUtilization === undefined
            ? state.kpiTargets.resourceUtilization
            : clampPercent(Number(targets.resourceUtilization)),
      },
    }));
    scheduleAutosave(get);
  },

  randomizeSimulationSeed: () => {
    if (get().readOnlyMode) return;
    const simulationSeed = createRandomSeed();
    pushUndoSnapshot(get(), set);
    resetSimulationRng(simulationSeed);
    set({ simulationSeed });
    scheduleAutosave(get);
  },

  setShowSunMoonClock: (enabled: boolean) => {
    persistShowSunMoonClockPreference(Boolean(enabled));
    set({ showSunMoonClock: Boolean(enabled) });
  },

  setShowSharedResourcesCard: (enabled: boolean) => {
    persistSharedResourcesCardPreference(Boolean(enabled));
    set({ showSharedResourcesCard: Boolean(enabled) });
  },

  setReadOnlyMode: (enabled: boolean) => set({ readOnlyMode: Boolean(enabled) }),

  undoEditorChange: () => {
    if (get().readOnlyMode) return;
    const snapshot = undoSnapshots.pop();
    if (!snapshot) {
      set({ canUndo: false });
      return;
    }
    set((state) => restoreEditorSnapshot(snapshot, state));
    set({ canUndo: undoSnapshots.length > 0 });
    scheduleAutosave(get);
  },

  onNodesChange: (changes: NodeChange[]) => {
    if (get().readOnlyMode) return;
    if (shouldRecordUndoForNodeChanges(changes)) {
      pushUndoSnapshot(get(), set);
    }
    set((state) =>
      reconcileGraphState(
        state,
        applyNodeChanges(changes, state.nodes) as AppNode[],
        state.edges,
      ),
    );
    if (shouldRecordUndoForNodeChanges(changes)) {
      scheduleAutosave(get);
    }
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    if (get().readOnlyMode) return;
    if (shouldRecordUndoForEdgeChanges(changes)) {
      pushUndoSnapshot(get(), set);
    }
    set((state) => reconcileGraphState(state, state.nodes, applyEdgeChanges(changes, state.edges)));
    if (shouldRecordUndoForEdgeChanges(changes)) {
      scheduleAutosave(get);
    }
  },

  connect: (connection: Connection) => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    set((state) => {
      const normalizedConnection = normalizeFlowEdgeHandles(state.nodes, [connection])[0];
      const nextEdges = addEdge({
        ...normalizedConnection,
        type: 'processEdge',
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed }
      }, state.edges);
      return reconcileGraphState(state, state.nodes, nextEdges);
    });
    scheduleAutosave(get);
  },

  deleteEdge: (id: string) => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    set((state) => reconcileGraphState(state, state.nodes, state.edges.filter((edge) => edge.id !== id)));
    scheduleAutosave(get);
  },

  updateEdgeData: (id: string, data: Record<string, any>) => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    set((state) => ({
      edges: state.edges.map(e =>
        e.id === id ? { ...e, data: { ...(e as any).data, ...data } } : e
      )
    }));
    scheduleAutosave(get);
  },

  reconnectEdge: (oldEdge: Edge, newConnection: Connection) => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    set((state) => {
      const filteredEdges = state.edges.filter((edge) => edge.id !== oldEdge.id);
      const normalizedConnection = normalizeFlowEdgeHandles(state.nodes, [newConnection])[0];
      const nextEdges = addEdge({
        ...normalizedConnection,
        type: 'processEdge',
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed }
      }, filteredEdges);
      return reconcileGraphState(state, state.nodes, nextEdges);
    });
    scheduleAutosave(get);
  },

  deleteNode: (id: string) => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    const { nodes, edges, items } = get();
    const nodeToDelete = nodes.find(n => n.id === id);
    
    if (!nodeToDelete) return;

    const updatedNodes = nodes.filter(n => n.id !== id);

    // Remove connected edges
    const updatedEdges = edges.filter(e => e.source !== id && e.target !== id);

    set((state) =>
      reconcileGraphState(
        { ...state, items: items.filter((item) => item.currentNodeId !== id) },
        updatedNodes,
        updatedEdges,
      ),
    );
    scheduleAutosave(get);
  },

  addNode: () => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    const id = generateId();
    const defaultResourcePoolId = getDefaultResourcePool(getSharedCapacitySettings(get())).id;
    const newNode: ProcessNode = {
      id,
      type: 'processNode',
      position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
      data: {
        label: `Station ${get().nodes.filter(n => n.type === 'processNode').length + 1}`,
        processingTime: 10,
        resources: 1,
        resourcePoolId: defaultResourcePoolId,
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
    set((state) => {
      const nextNodes = [...state.nodes, newNode];
      return {
        nodes: applyValidationToNodes(nextNodes, state.edges, getSharedCapacitySettings(state)),
      };
    });
    scheduleAutosave(get);
  },

  addStartNode: () => {
      if (get().readOnlyMode) return;
      pushUndoSnapshot(get(), set);
      const id = generateId();
      const defaultResourcePoolId = getDefaultResourcePool(getSharedCapacitySettings(get())).id;
      const newNode: StartNode = {
        id,
        type: 'startNode',
        position: { x: 100, y: 100 },
        data: {
          label: 'Start',
          processingTime: 2,
          resources: 1,
          resourcePoolId: defaultResourcePoolId,
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
	      set((state) => {
	        const nextNodes = [...state.nodes, newNode];
	        return {
	          nodes: applyValidationToNodes(nextNodes, state.edges, getSharedCapacitySettings(state)),
	        };
	      });
	      scheduleAutosave(get);
  },

  addEndNode: () => {
      if (get().readOnlyMode) return;
      pushUndoSnapshot(get(), set);
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
	      set((state) => {
	        const nextNodes = [...state.nodes, newNode];
	        return {
	          nodes: applyValidationToNodes(nextNodes, state.edges, getSharedCapacitySettings(state)),
	        };
	      });
	      scheduleAutosave(get);
  },

  addAnnotation: () => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
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
    scheduleAutosave(get);
  },

  pasteNode: (copiedNode, position) => {
    if (get().readOnlyMode) return null;
    pushUndoSnapshot(get(), set);
    const pastedNode = createPastedNode(copiedNode, cloneSerializable, generateId, position);
    set((state) => reconcileGraphState(state, [...state.nodes, pastedNode], state.edges));
    scheduleAutosave(get);
    return pastedNode.id;
  },

  updateNodeData: (id, data) => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
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

      const nextNodes = applyValidationToNodes(
        state.nodes.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, ...nextData } } : node
        ),
        state.edges,
        getSharedCapacitySettings(state)
      );

      if (!shouldReset) {
        return { nodes: nextNodes };
      }

      return { nodes: nextNodes, ...buildMetricsReset(state) };
    });
    scheduleAutosave(get);
  },

  updateNode: (id, partialNode) => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    set((state) => ({
      nodes: applyValidationToNodes(
        state.nodes.map((node) => (node.id === id ? { ...node, ...partialNode } : node)),
        state.edges,
        getSharedCapacitySettings(state)
      ),
    }));
    scheduleAutosave(get);
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
      nodes: resetRuntimeNodeState(state.nodes, state.edges, getSharedCapacitySettings(state)),
    }));
  },

  clearCanvas: () => {
    if (get().readOnlyMode) return;
    pushUndoSnapshot(get(), set);
    clearVisualTransferCleanupTimers();
    resetSimulationRng(get().simulationSeed);
    set({ 
        nodes: [], 
        edges: [], 
        ...buildRunStateReset()
    });
    scheduleAutosave(get);
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
    const newItem = createQueuedItem(targetNodeId, currentTick, metricsEpoch, generateId);
    set((state) => {
      const nextItems = [...state.items, newItem];
      return {
        items: nextItems,
        ...computeDerivedState(nextItems),
      };
    });
  },

  clearItems: () => {
    clearVisualTransferCleanupTimers();
    set({
      items: [],
      itemsByNode: new Map(),
      blockedCountsByTarget: new Map(),
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
            pushUndoSnapshot(get(), set);
            clearVisualTransferCleanupTimers();
            const durationPreset = flow.durationPreset || get().durationPreset;
            const durationConfig = DURATION_PRESETS[durationPreset] || DURATION_PRESETS.unlimited;
            const speedPreset = flow.speedPreset || get().speedPreset;
            const speedConfig = SPEED_PRESETS.find((s) => s.key === speedPreset) || SPEED_PRESETS[1];
            const demandUnit = (flow.demandUnit as DemandUnit) || 'week';
            const capacityMode = (flow.capacityMode as CapacityMode) || 'local';
            const sharedCapacityInputMode =
              (flow.sharedCapacityInputMode as SharedCapacityInputMode) || DEFAULT_SHARED_CAPACITY_INPUT_MODE;
            const sharedCapacityValue = Number.isFinite(flow.sharedCapacityValue)
              ? Math.max(0, Number(flow.sharedCapacityValue))
              : DEFAULT_SHARED_CAPACITY_VALUE;
            const resourcePools = getNormalizedResourcePools(
              flow.resourcePools as ResourcePool[] | undefined,
              sharedCapacityInputMode,
              sharedCapacityValue,
            );
            const legacySharedCapacityFields = getLegacySharedCapacityFields(resourcePools);
            const simulationSeed = normalizeSeed(flow.simulationSeed, get().simulationSeed);
            resetSimulationRng(simulationSeed);
            const nextNodes = normalizeNodesForResourcePools(flow.nodes as AppNode[], resourcePools);
            set({
                nodes: nextNodes,
                edges: normalizeFlowEdgeHandles(nextNodes, flow.edges),
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
                capacityMode,
                sharedCapacityInputMode: legacySharedCapacityFields.sharedCapacityInputMode,
                sharedCapacityValue: legacySharedCapacityFields.sharedCapacityValue,
                resourcePools,
                demandTotalTicks: DEMAND_UNIT_TICKS[demandUnit],
                simulationSeed,
                kpiTargets: {
                  ...get().kpiTargets,
                  ...(flow.kpiTargets || {}),
                },
                currentCanvasId: null,
                currentCanvasName: normalizeCanvasName(flow.canvasName || 'Imported Process'),
                ...buildRunStateReset()
            });
            scheduleAutosave(get);
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
          pushUndoSnapshot(get(), set);
          clearVisualTransferCleanupTimers();
          resetSimulationRng(get().simulationSeed);
          const capacityState = getScenarioCapacityState({
            capacityMode: scenario.capacityMode,
            sharedCapacityInputMode: scenario.sharedCapacityInputMode,
            sharedCapacityValue: scenario.sharedCapacityValue,
            resourcePools: scenario.resourcePools,
          });
          const nodes = normalizeNodesForResourcePools(
            JSON.parse(JSON.stringify(scenario.nodes)) as AppNode[],
            capacityState.resourcePools,
          );
          const edges = normalizeFlowEdgeHandles(
            nodes,
            JSON.parse(JSON.stringify(scenario.edges)) as Edge[]
          );
          const nextNodes = resetRuntimeNodeState(nodes, edges, {
            capacityMode: capacityState.capacityMode,
            sharedCapacityInputMode: capacityState.sharedCapacityInputMode,
            sharedCapacityValue: capacityState.sharedCapacityValue,
            resourcePools: capacityState.resourcePools,
          });
          const demandMode = scenario.demandMode ?? 'auto';
          const demandUnit = scenario.demandUnit ?? 'week';
          set({ 
              nodes: nextNodes,
              edges,
              demandMode,
              demandUnit,
              demandTotalTicks: DEMAND_UNIT_TICKS[demandUnit],
              capacityMode: capacityState.capacityMode,
              sharedCapacityInputMode: capacityState.sharedCapacityInputMode,
              sharedCapacityValue: capacityState.sharedCapacityValue,
              resourcePools: capacityState.resourcePools,
              currentCanvasId: null,
              currentCanvasName: SCENARIO_NAMES[scenarioKey] || 'Untitled Canvas',
              ...buildRunStateReset()
          });
          scheduleAutosave(get);
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
        if (isAutosaveDraftSnapshot(snapshot, workspaceId)) continue;
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

  saveCanvasToDb: async (options = {}) => {
    if (get().readOnlyMode) return;
    clearAutosaveTimer();
    const sdk = getProcessBoxSdk();
    const state = get();
    const currentCanvasId = normalizeWorkspaceId(state.currentCanvasId);
    const currentIsAutosaveDraft = isAutosaveDraftCanvasId(currentCanvasId);
    const saveAsAutosaveDraft = Boolean(options.autosave) && (!currentCanvasId || currentIsAutosaveDraft);
    const workspaceId = saveAsAutosaveDraft
      ? AUTOSAVE_DRAFT_CANVAS_ID
      : currentIsAutosaveDraft
        ? createWorkspaceId()
        : ensureWorkspaceId(currentCanvasId);
    const canvasName = normalizeCanvasName(state.currentCanvasName);
    const flow = {
      ...createFlowSnapshot(state, {
      workspaceId,
      canvasName,
      }),
      autosaveDraft: saveAsAutosaveDraft,
    };
    const nextSavedAt = Date.now();

    if (!sdk?.isEmbedded) {
      try {
        const existing = await getCanvas(workspaceId);
        await saveCanvas({
          id: workspaceId,
          name: canvasName,
          createdAt: existing?.createdAt || nextSavedAt,
          updatedAt: nextSavedAt,
          data: flow,
        });
        if (!saveAsAutosaveDraft && currentIsAutosaveDraft) {
          await deleteCanvas(AUTOSAVE_DRAFT_CANVAS_ID).catch(() => undefined);
        }
        set({
          currentCanvasId: workspaceId,
          currentCanvasName: canvasName,
          lastAutoSavedAt: nextSavedAt,
        });
        setLastCanvasId(workspaceId);
        if (!options.skipRefresh) {
          await get().refreshCanvasList();
        }
        if (!options.silent) {
          showToast('success', options.autosave ? 'Flow autosaved locally' : 'Flow saved locally');
        }
      } catch {
        if (!options.silent) {
          showToast('error', 'Local save failed in this browser.');
        }
      }
      return;
    }

    try {
      await sdk.createCloudSave({
        note: flow.canvasName,
        state: flow as unknown as Record<string, unknown>,
        tier: 'registered',
      });

      set({
        currentCanvasId: workspaceId,
        currentCanvasName: flow.canvasName,
        lastAutoSavedAt: nextSavedAt,
      });

      setLastCanvasId(workspaceId);
      if (!options.skipRefresh) {
        await get().refreshCanvasList();
      }
      if (!options.silent) {
        showToast('success', options.autosave ? 'Flow autosaved to cloud' : 'Flow saved to cloud');
      }
    } catch {
      if (!options.silent) {
        showToast('error', 'Cloud save failed. Please check sign-in and try again.');
      }
    }
  },

  loadCanvasFromDb: async (id: string) => {
    if (get().readOnlyMode) return;
    const workspaceId = typeof id === 'string' ? id.trim() : '';
    if (!workspaceId) {
      showToast('error', 'Invalid process id.');
      return;
    }
    pushUndoSnapshot(get(), set);

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
    pushUndoSnapshot(get(), set);
    resetSimulationRng(get().simulationSeed);
    const defaultCapacityState = createDefaultCapacityState();
    set({
      nodes: [],
      edges: [],
      capacityMode: defaultCapacityState.capacityMode,
      sharedCapacityInputMode: defaultCapacityState.sharedCapacityInputMode,
      sharedCapacityValue: defaultCapacityState.sharedCapacityValue,
      resourcePools: defaultCapacityState.resourcePools,
      ...buildRunStateReset(),
      currentCanvasId: null,
      currentCanvasName: 'Untitled Canvas',
    });
    scheduleAutosave(get);
  },

  renameCurrentCanvas: async (name: string) => {
    if (get().readOnlyMode) return;
    const nextName = normalizeCanvasName(name);
    const currentCanvasId = get().currentCanvasId;
    pushUndoSnapshot(get(), set);
    set({ currentCanvasName: nextName });
    scheduleAutosave(get);
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
        capacityMode,
        sharedCapacityInputMode,
        sharedCapacityValue,
        resourcePools,
        demandTotalTicks,
        demandArrivalsGenerated,
        demandArrivalsByNode,
        demandAccumulatorByNode,
        demandOpenTicksByNode,
        periodCompleted,
        kpiHistoryByPeriod,
        nodeUtilizationHistoryByNode,
        poolUtilizationHistoryByPeriod,
        sharedNodeBudgetStateByNode,
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
      const sharedCapacitySettings = {
        capacityMode,
        sharedCapacityInputMode,
        sharedCapacityValue,
        resourcePools,
      };
      const nodeCapacityProfiles = new Map<string, ReturnType<typeof getNodeCapacityProfile>>();
      for (const node of nodes) {
        if (node.type === 'annotationNode') continue;
        nodeCapacityProfiles.set(node.id, getNodeCapacityProfile(node, nodes, sharedCapacitySettings));
      }

      // Compute working-hours availability for each node at this tick
      const workingStatus = new Map<string, boolean>();
      for (const node of nodes) {
        if (node.type === 'annotationNode') continue;
        const pData = node.data as ProcessNodeData;
        workingStatus.set(node.id, isWorkingTick(tickCount, pData.workingHours));
      }

      const nextSharedNodeBudgetStateByNode: SharedNodeBudgetStateByNode = {};
      for (const node of nodes) {
        if (node.type !== 'processNode' && node.type !== 'startNode') continue;
        const budgetState = getSharedNodeBudgetStateForTick(
          node,
          nodeCapacityProfiles.get(node.id),
          tickCount,
          workingStatus.get(node.id) ?? true,
          sharedNodeBudgetStateByNode,
        );
        if (budgetState) {
          nextSharedNodeBudgetStateByNode[node.id] = budgetState;
        }
      }

      // Build edge lookup by source for O(1) access
      const edgesBySource = buildEdgesBySource(edges);

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
                injectedItems.push(createQueuedItem(node.id, tickCount, metricsEpoch, generateId));
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
                injectedItems.push(createQueuedItem(node.id, tickCount, metricsEpoch, generateId));
              }
            }
          }
        }
      }

      // Combine items (reuse array if no injections)
      const allItems = injectedItems.length > 0 ? [...items, ...injectedItems] : items;
      const activeWipCounts = new Map<string, number>();
      const processingItemsByNode = new Map<string, ProcessItem[]>();
      for (const item of allItems) {
        if (
          item.currentNodeId &&
          item.status !== ItemStatus.COMPLETED &&
          item.status !== ItemStatus.FAILED
        ) {
          activeWipCounts.set(item.currentNodeId, (activeWipCounts.get(item.currentNodeId) || 0) + 1);
        }
        if (item.status === ItemStatus.PROCESSING && item.currentNodeId) {
          const existing = processingItemsByNode.get(item.currentNodeId);
          if (existing) {
            existing.push(item);
          } else {
            processingItemsByNode.set(item.currentNodeId, [item]);
          }
        }
      }

      // --- SINGLE PASS: Process all items and collect stats ---
      const nodesUpdates = new Map<string, { processed: number; failed: number }>();
      const processingCounts = new Map<string, number>();
      const reservedBudgetMinutesThisTickByNode = new Map<string, number>();
      let newlyCompleted = 0;
      let newlyCompletedInEpoch = 0;
      let nextKpiHistory = kpiHistoryByPeriod;
      let nextPoolUtilizationHistory = poolUtilizationHistoryByPeriod;

      const registerCompletion = (item: ProcessItem) => {
        if (item.terminalNodeId === null) return;
        newlyCompleted++;
        if (item.metricsEpoch === metricsEpoch) newlyCompletedInEpoch++;
        const leadTime = Math.max(0, item.timeActive + item.timeWaiting);
        const valueAddedTime = Math.max(0, item.timeActive);
        for (const period of KPI_PERIODS) {
          nextKpiHistory = upsertKpiBucket(nextKpiHistory, period, tickCount, {
            completions: 1,
            leadTimeTotal: leadTime,
            valueAddedTotal: valueAddedTime,
          });
        }
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

        const localCapacity = Math.max(
          0,
          nodeCapacityProfiles.get(targetNodeId)?.maxConcurrentItems ?? getLocalCapacityUnits(targetData.resources),
        );
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
            item.remainingTime = Math.max(0, item.remainingTime - 1);
            item.timeActive += 1;
            item.nodeLeadTime++;
            item.totalTime++;

            const totalDuration = item.processingDuration || pData.processingTime;
            item.progress = totalDuration > 0
              ? Math.min(100, (Math.max(0, totalDuration - item.remainingTime) / totalDuration) * 100)
              : 100;

            if (item.remainingTime <= 0.000001) {
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
        const outgoing = edgesBySource.get(sourceNodeId) || [];
        if (!nodeMap.has(targetNodeId) || !outgoing.some((edge) => edge.target === targetNodeId)) continue;
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
        const capacityProfile = nodeCapacityProfiles.get(node.id);
        const capacityLimit = Math.max(
          0,
          capacityProfile?.maxConcurrentItems ?? getLocalCapacityUnits(pData.resources),
        );
        if (capacityLimit <= 0) continue;
        const isWorking = workingStatus.get(node.id) ?? true;
        if (!isWorking) continue;

        const configuredBatchSize = node.type === 'processNode' ? getNodeBatchSize(pData) : 0;
        const batchSize =
          node.type === 'processNode'
              ? ((capacityProfile?.usesSharedAllocation ?? false)
              ? 1
              : getNodeFlowMode(pData) === 'pull'
              ? 1
              : configuredBatchSize > 1
                ? Math.min(configuredBatchSize, Math.max(1, getLocalCapacityUnits(pData.resources)))
                : 1)
            : 1;

        let currentLoad = processingCounts.get(node.id) || 0;
        while (queueItems.length >= batchSize && currentLoad + batchSize <= capacityLimit) {
          const usesSharedBudget = capacityProfile?.usesSharedAllocation ?? false;
          const actualTime =
            pData.processingTime === 0
              ? 0
              : applyVariability(
                  pData.processingTime,
                  pData.variability || 0,
                  nextSimulationRandom
                );

          if (usesSharedBudget) {
            const budgetState =
              nextSharedNodeBudgetStateByNode[node.id] ||
              createSharedNodeBudgetState(
                getWorkingDayBudgetKey(tickCount, pData.workingHours),
                Math.max(0, capacityProfile?.dailyBudgetMinutes ?? 0),
              );
            nextSharedNodeBudgetStateByNode[node.id] = budgetState;

            if (actualTime > budgetState.dailyBudgetMinutes + 0.000001) {
              break;
            }
            if (actualTime > budgetState.remainingBudgetMinutes + 0.000001) {
              budgetState.budgetExhausted = true;
              break;
            }
          }

          const batch = queueItems.splice(0, batchSize);
          currentLoad += batchSize;
          processingCounts.set(node.id, currentLoad);

          if (usesSharedBudget) {
            const budgetState = nextSharedNodeBudgetStateByNode[node.id]!;
            budgetState.remainingBudgetMinutes = Math.max(0, budgetState.remainingBudgetMinutes - actualTime);
            budgetState.consumedBudgetMinutes = Math.min(
              budgetState.dailyBudgetMinutes,
              budgetState.consumedBudgetMinutes + actualTime,
            );
            reservedBudgetMinutesThisTickByNode.set(
              node.id,
              (reservedBudgetMinutesThisTickByNode.get(node.id) || 0) + actualTime,
            );
          }

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

          for (const item of batch) {
            item.status = ItemStatus.PROCESSING;
            item.handoffTargetNodeId = null;
            item.remainingTime = actualTime;
            item.processingDuration = actualTime;
            item.progress = 0;
          }
        }
      }

      let busyResourceTicksThisTick = 0;
      let availableResourceTicksThisTick = 0;
      const poolResourceTicksThisTick = new Map<string, { busyResourceTicks: number; availableResourceTicks: number }>();
      const minNodeUtilizationTick = tickCount - NODE_UTILIZATION_ROLLING_WINDOW_TICKS + 1;
      const nextNodeUtilizationHistory: NodeUtilizationHistoryByNode = {};
      for (const node of nodes) {
        if (node.type !== 'processNode' && node.type !== 'startNode') continue;
        const existingSamples = (nodeUtilizationHistoryByNode[node.id] || []).filter(
          (sample) => sample.tick >= minNodeUtilizationTick,
        );
        const isWorking = workingStatus.get(node.id) ?? true;
        if (!isWorking) {
          if (existingSamples.length > 0) {
            nextNodeUtilizationHistory[node.id] = existingSamples;
          }
          continue;
        }
        const capacityProfile = nodeCapacityProfiles.get(node.id);
        const usesSharedBudget = capacityProfile?.usesSharedAllocation ?? false;
        const availableResourceTicks = Math.max(
          0,
          usesSharedBudget
            ? capacityProfile?.availableCapacityPerTick ?? 0
            : getLocalCapacityUnits((node.data as ProcessNodeData).resources || 0),
        );
        const busyResourceTicks = usesSharedBudget
          ? Math.max(0, reservedBudgetMinutesThisTickByNode.get(node.id) || 0)
          : Math.min(availableResourceTicks, processingCounts.get(node.id) || 0);
        availableResourceTicksThisTick += availableResourceTicks;
        busyResourceTicksThisTick += busyResourceTicks;
        if (capacityMode === 'sharedAllocation' && usesSharedBudget && capacityProfile?.resourcePoolId) {
          const currentPoolTicks = poolResourceTicksThisTick.get(capacityProfile.resourcePoolId) || {
            busyResourceTicks: 0,
            availableResourceTicks: 0,
          };
          currentPoolTicks.busyResourceTicks += busyResourceTicks;
          currentPoolTicks.availableResourceTicks += availableResourceTicks;
          poolResourceTicksThisTick.set(capacityProfile.resourcePoolId, currentPoolTicks);
        }
        nextNodeUtilizationHistory[node.id] = [
          ...existingSamples,
          {
            tick: tickCount,
            busyResourceTicks,
            availableResourceTicks,
          },
        ];
      }

      for (const period of KPI_PERIODS) {
        nextKpiHistory = upsertKpiBucket(nextKpiHistory, period, tickCount, {
          busyResourceTicks: busyResourceTicksThisTick,
          availableResourceTicks: availableResourceTicksThisTick,
        });
        for (const [resourcePoolId, totals] of poolResourceTicksThisTick.entries()) {
          nextPoolUtilizationHistory = upsertPoolUtilizationBucket(
            nextPoolUtilizationHistory,
            period,
            resourcePoolId,
            tickCount,
            totals,
          );
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
          const validationError = computeValidationErrorForNode(n, edgesBySource, nodeCapacityProfiles);

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
        blockedCountsByTarget: derived.blockedCountsByTarget,
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
        kpiHistoryByPeriod: nextKpiHistory,
        nodeUtilizationHistoryByNode: nextNodeUtilizationHistory,
        poolUtilizationHistoryByPeriod: nextPoolUtilizationHistory,
        sharedNodeBudgetStateByNode: nextSharedNodeBudgetStateByNode,
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
