import { Node, Edge } from 'reactflow';

export enum ItemStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  TRANSIT = 'TRANSIT',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface ProcessItem {
  id: string;
  currentNodeId: string | null; // Destination or Current Node
  fromNodeId: string | null; // Previous Node (for transit)
  status: ItemStatus;
  progress: number; // 0 to 100
  remainingTime: number; // in ticks
  processingDuration: number; // Snapshot of the total duration assigned to this item
  totalTime: number;
  nodeEnterTick: number; // when the item entered its current node (for per-node lead time)
  metricsEpoch: number; // Metrics epoch at spawn time (for metric resets)
  
  // Absolute Verification Timestamps
  spawnTick: number;
  completionTick: number | null;
  // Terminal node where the item exited the system (used for end-to-end metrics)
  terminalNodeId: string | null;

  // VSM Metrics (Buckets)
  timeActive: number; // Value Added Time (Processing)
  timeWaiting: number; // Non-Value Added Time (Queue)
  timeTransit: number; // Non-Value Added Time (Transit)
  
  // Transit specific
  transitProgress: number; // 0 to 1 (linear interpolation factor)
}

export interface NodeStats {
  processed: number;
  failed: number;
  maxQueue: number;
}

export interface SourceConfig {
  enabled: boolean;
  interval: number; // Ticks between generations
  batchSize: number; // Items per generation
}

export interface WorkingHoursConfig {
  enabled: boolean;
  hoursPerDay: number; // 0-8 (workday hours)
  daysPerWeek: number; // 0-5 (workweek days)
}

export const DEFAULT_WORKING_HOURS: WorkingHoursConfig = {
  enabled: true,
  hoursPerDay: 8,
  daysPerWeek: 5,
};

export interface ProcessNodeData {
  label: string;
  processingTime: number; // Time to process one item (in ticks)
  resources: number; // Concurrent capacity
  quality: number; // 0.0 to 1.0 (pass rate)
  variability: number; // 0.0 to 1.0 - how much processing time varies (0 = fixed, 1 = +/- 100%)
  stats: NodeStats;
  // Map of TargetNodeId -> Weight (arbitrary number, relative to others)
  routingWeights: Record<string, number>;
  sourceConfig?: SourceConfig; // Configuration for generating items (Start Nodes)
  demandTarget?: number; // Target demand for this start node (per selected unit)
  workingHours?: WorkingHoursConfig; // Per-node working hours schedule
  isSelected?: boolean;
  validationError?: string; // "No Output", "Zero Capacity", etc.
  headerColor?: string; // Per-node header color override (hex). Falls back to global defaultHeaderColor.
}

// Curated palette of bright and earthy node header colors
export const NODE_HEADER_COLORS = [
  '#64748b', // Slate
  '#78716c', // Stone
  '#ca8a04', // Yellow
  '#d97706', // Amber
  '#c2410c', // Terracotta
  '#e11d48', // Rose
  '#4f46e5', // Indigo
  '#0d9488', // Teal
  '#059669', // Emerald
  '#7c3aed', // Violet
  '#0284c7', // Sky
];

export interface AnnotationNodeData {
  label: string;
}

export type ProcessNode = Node<ProcessNodeData>;
export type StartNode = Node<ProcessNodeData>;
export type EndNode = Node<ProcessNodeData>;
export type AnnotationNode = Node<AnnotationNodeData>;

export type AppNode = ProcessNode | AnnotationNode | StartNode | EndNode;

// --- ANALYTICS & SETTINGS ---

export interface HistoryEntry {
  tick: number;
  wip: number;
  totalCompleted: number; // Cumulative count
  throughput: number; // Rolling average
}

export interface ItemConfig {
  color: string; // hex
  shape: 'circle' | 'square' | 'rounded';
  icon: 'none' | 'user' | 'box' | 'file';
}

// Time unit configuration for realistic VSM metrics
export interface TimeUnitConfig {
  ticksPerUnit: number; // How many ticks = 1 time unit
  unitName: string; // e.g., "minute", "hour"
  unitNamePlural: string; // e.g., "minutes", "hours"
  unitAbbrev: string; // e.g., "min", "hr"
}

export const TIME_UNIT_PRESETS: Record<string, TimeUnitConfig> = {
  seconds: { ticksPerUnit: 1, unitName: 'second', unitNamePlural: 'seconds', unitAbbrev: 's' },
  minutes: { ticksPerUnit: 1, unitName: 'minute', unitNamePlural: 'minutes', unitAbbrev: 'min' },
  hours: { ticksPerUnit: 60, unitName: 'hour', unitNamePlural: 'hours', unitAbbrev: 'hr' },
  days: { ticksPerUnit: 480, unitName: 'day', unitNamePlural: 'days', unitAbbrev: 'd' }, // 8-hour workday
};

// Helper: Apply variability to a base processing time
// Uses triangular distribution centered on the base time
export const applyVariability = (baseTime: number, variability: number): number => {
  if (variability <= 0 || baseTime <= 0) return baseTime;
  // Generate triangular-distributed random value
  const u = Math.random();
  const spread = baseTime * variability;
  // Triangular distribution: peaks at center, ranges from -spread to +spread
  const offset = spread * (u + Math.random() - 1); // sum of 2 uniforms approximates triangular
  return Math.max(1, Math.round(baseTime + offset));
};

// Helper: Get the abbreviated time unit label for display
export const getTimeUnitAbbrev = (timeUnit: string): string => {
  const preset = TIME_UNIT_PRESETS[timeUnit];
  return preset ? preset.unitAbbrev : 'min';
};

// Helper: Get the plural time unit name for display
export const getTimeUnitPlural = (timeUnit: string): string => {
  const preset = TIME_UNIT_PRESETS[timeUnit];
  return preset ? preset.unitNamePlural : 'minutes';
};

// Helper: Format a tick count into the appropriate time unit display value
export const formatTimeValue = (ticks: number, timeUnit: string): string => {
  const preset = TIME_UNIT_PRESETS[timeUnit];
  if (!preset || preset.ticksPerUnit === 1) return `${ticks}`;
  return (ticks / preset.ticksPerUnit).toFixed(1);
};

// --- REAL-TIME SIMULATION CONSTANTS ---

// Time calculation constants (1 tick = 1 minute of simulated time)
export const TICKS_PER_MINUTE = 1;
export const TICKS_PER_HOUR = 60;
export const TICKS_PER_WORKDAY = 480;    // 8 hours
export const TICKS_PER_WEEK = 2400;      // 5 working days
export const WORKING_DAYS_PER_MONTH = 22;
export const WORKING_DAYS_PER_YEAR = 264;

export type DemandMode = 'auto' | 'target';
export type DemandUnit = 'hour' | 'day' | 'week' | 'month';

export const DEMAND_UNIT_TICKS: Record<DemandUnit, number> = {
  hour: TICKS_PER_HOUR,
  day: TICKS_PER_WORKDAY,
  week: TICKS_PER_WEEK,
  month: TICKS_PER_WORKDAY * WORKING_DAYS_PER_MONTH,
};

export const DEMAND_UNIT_LABELS: Record<DemandUnit, string> = {
  hour: 'hour',
  day: 'day',
  week: 'week',
  month: 'month',
};

// Duration presets for bounded simulations
export interface DurationPreset {
  key: string;
  label: string;
  totalTicks: number;
  displayUnit: string;
  displayUnitAbbrev: string;
}

export const DURATION_PRESETS: Record<string, DurationPreset> = {
  '1hour': {
    key: '1hour',
    label: '1 Hour',
    totalTicks: 60,
    displayUnit: 'hours',
    displayUnitAbbrev: 'hr'
  },
  '1day': {
    key: '1day',
    label: '1 Day (8 hours)',
    totalTicks: 480,
    displayUnit: 'hours',
    displayUnitAbbrev: 'hr'
  },
  '1week': {
    key: '1week',
    label: '1 Week (5 days)',
    totalTicks: 2400,
    displayUnit: 'days',
    displayUnitAbbrev: 'd'
  },
  '1month': {
    key: '1month',
    label: '1 Month (22 days)',
    totalTicks: 10560,
    displayUnit: 'days',
    displayUnitAbbrev: 'd'
  },
  '3months': {
    key: '3months',
    label: '3 Months (66 days)',
    totalTicks: 31680,
    displayUnit: 'weeks',
    displayUnitAbbrev: 'wk'
  },
  '12months': {
    key: '12months',
    label: '1 Year (264 days)',
    totalTicks: 126720,
    displayUnit: 'months',
    displayUnitAbbrev: 'mo'
  },
  'unlimited': {
    key: 'unlimited',
    label: 'No Limit',
    totalTicks: Infinity,
    displayUnit: 'auto',
    displayUnitAbbrev: ''
  }
};

// Speed presets for simulation execution rate
export interface SpeedPreset {
  key: string;
  label: string;
  ticksPerSecond: number;
  realTimeRatio: string;
}

export const SPEED_PRESETS: SpeedPreset[] = [
  { key: '0.1x', label: '0.1x', ticksPerSecond: 6, realTimeRatio: '1s = 6min' },
  { key: '1x', label: '1x', ticksPerSecond: 60, realTimeRatio: '1s = 1hr' },
  { key: '10x', label: '10x', ticksPerSecond: 600, realTimeRatio: '1s = 10hr' },
  { key: '60x', label: '60x', ticksPerSecond: 3600, realTimeRatio: '1s = 1day' },
  { key: 'max', label: 'Max', ticksPerSecond: -1, realTimeRatio: 'As fast as possible' }
];

// Performance: Pre-computed item counts to avoid filtering on every render
export interface ItemCounts {
  wip: number;
  completed: number;
  failed: number;
  queued: number;
  processing: number;
  transit: number;
  stuck: number;
}

// --- CANVAS MANAGEMENT ---

export interface CanvasFlowData {
  nodes: AppNode[];
  edges: Edge[];
  itemConfig: ItemConfig;
  defaultHeaderColor: string;
  durationPreset: string;
  speedPreset: string;
  autoStopEnabled: boolean;
  countTransitInClock: boolean;
  metricsWindowCompletions: number;
  demandMode: DemandMode;
  demandUnit: DemandUnit;
}

export interface SavedCanvas {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  data: CanvasFlowData;
}

export interface CanvasMetadata {
  id: string;
  name: string;
  updatedAt: number;
}

export interface SimulationState {
  nodes: AppNode[];
  edges: Edge[];
  items: ProcessItem[];
  isRunning: boolean;
  tickSpeed: number; // ms per tick
  tickCount: number;
  cumulativeCompleted: number;
  throughput: number;                 // rolling items/hour
  cumulativeTransitTicks: number;     // total ticks spent in transit (for display clock policy)
  displayTickCount: number;           // user-facing clock, may exclude transit depending on policy
  countTransitInClock: boolean;       // policy toggle

  // Analytics
  history: HistoryEntry[];
  metricsEpoch: number;
  metricsEpochTick: number;
  metricsWindowCompletions: number;
  demandMode: DemandMode;
  demandUnit: DemandUnit;
  demandTotalTicks: number;
  demandArrivalsGenerated: number;
  demandArrivalsByNode: Record<string, number>;
  demandAccumulatorByNode: Record<string, number>;
  demandOpenTicksByNode: Record<string, number>;
  periodCompleted: number;

  // Performance: Pre-computed derived state
  itemsByNode: Map<string, ProcessItem[]>;
  itemCounts: ItemCounts;

  // Configuration
  itemConfig: ItemConfig;
  defaultHeaderColor: string; // Global default header color for nodes (hex)
  autoInjectionEnabled: boolean;
  timeUnit: string; // Key for TIME_UNIT_PRESETS

  // Real-time simulation configuration
  durationPreset: string; // Key for DURATION_PRESETS
  targetDuration: number; // Total ticks for simulation (from preset)
  speedPreset: string; // Key for SPEED_PRESETS
  ticksPerSecond: number; // Current simulation speed
  simulationProgress: number; // 0 to 100
  autoStopEnabled: boolean; // Stop when targetDuration reached

  // Actions
  setNodes: (nodes: AppNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  connect: (connection: any) => void;
  reconnectEdge: (oldEdge: Edge, newConnection: any) => void;
  deleteEdge: (id: string) => void;
  updateEdgeData: (id: string, data: Record<string, any>) => void;
  deleteNode: (id: string) => void;
  addNode: () => void;
  addStartNode: () => void;
  addEndNode: () => void;
  addAnnotation: () => void;
  updateNodeData: (id: string, data: Partial<ProcessNodeData> | Partial<AnnotationNodeData>) => void;
  updateNode: (id: string, node: Partial<AppNode>) => void;
  setItemConfig: (config: Partial<ItemConfig>) => void;
  setDefaultHeaderColor: (color: string) => void;
  setTimeUnit: (unit: string) => void;
  setMetricsWindowCompletions: (count: number) => void;
  setDemandMode: (mode: DemandMode) => void;
  setDemandUnit: (unit: DemandUnit) => void;
  setDurationPreset: (preset: string) => void;
  setSpeedPreset: (preset: string) => void;
  setAutoStop: (enabled: boolean) => void;
  setCountTransitInClock: (count: boolean) => void;

  // Simulation Actions
  startSimulation: () => void;
  pauseSimulation: () => void;
  stepSimulation: () => void; // Debug step
  resetSimulation: () => void; // Keep nodes, clear items
  clearCanvas: () => void; // Clear all
  setTickSpeed: (speed: number) => void;
  toggleAutoInjection: () => void;
  tick: () => void;
  addItem: (targetNodeId: string) => void;
  clearItems: () => void;

  // Canvas Identity
  currentCanvasId: string | null;
  currentCanvasName: string;
  savedCanvasList: CanvasMetadata[];

  // Persistence & Scenarios
  saveFlow: () => void;
  loadFlow: () => void;
  exportJson: () => void;
  importJson: (fileContent: string) => void;
  loadScenario: (scenarioKey: string) => void;

  // Canvas Management
  saveCanvasToDb: () => Promise<void>;
  loadCanvasFromDb: (id: string) => Promise<void>;
  newCanvas: () => void;
  renameCurrentCanvas: (name: string) => Promise<void>;
  deleteCanvasFromDb: (id: string) => Promise<void>;
  refreshCanvasList: () => Promise<void>;
}
