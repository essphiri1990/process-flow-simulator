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
  
  // Absolute Verification Timestamps
  spawnTick: number;
  completionTick: number | null;

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

export interface ProcessNodeData {
  label: string;
  processingTime: number; // Time to process one item (in ticks)
  resources: number; // Concurrent capacity
  quality: number; // 0.0 to 1.0 (pass rate)
  stats: NodeStats;
  // Map of TargetNodeId -> Weight (arbitrary number, relative to others)
  routingWeights: Record<string, number>; 
  sourceConfig?: SourceConfig; // Configuration for generating items (Start Nodes)
  isSelected?: boolean;
  validationError?: string; // "No Output", "Zero Capacity", etc.
}

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

// Performance: Pre-computed item counts to avoid filtering on every render
export interface ItemCounts {
  wip: number;
  completed: number;
  failed: number;
}

export interface SimulationState {
  nodes: AppNode[];
  edges: Edge[];
  items: ProcessItem[];
  isRunning: boolean;
  tickSpeed: number; // ms per tick
  tickCount: number;

  // Analytics
  history: HistoryEntry[];

  // Performance: Pre-computed derived state
  itemsByNode: Map<string, ProcessItem[]>;
  itemCounts: ItemCounts;

  // Configuration
  itemConfig: ItemConfig;
  autoInjectionEnabled: boolean;
  
  // Actions
  setNodes: (nodes: AppNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  connect: (connection: any) => void;
  deleteEdge: (id: string) => void;
  deleteNode: (id: string) => void;
  addNode: () => void;
  addStartNode: () => void;
  addEndNode: () => void;
  addAnnotation: () => void;
  updateNodeData: (id: string, data: Partial<ProcessNodeData> | Partial<AnnotationNodeData>) => void;
  updateNode: (id: string, node: Partial<AppNode>) => void;
  setItemConfig: (config: Partial<ItemConfig>) => void;

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

  // Persistence & Scenarios
  saveFlow: () => void;
  loadFlow: () => void;
  exportJson: () => void;
  importJson: (fileContent: string) => void;
  loadScenario: (scenarioKey: string) => void;
}