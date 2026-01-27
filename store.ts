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
import { SimulationState, ProcessNode, StartNode, EndNode, AnnotationNode, AppNode, ProcessItem, ItemStatus, ProcessNodeData, HistoryEntry, ItemCounts } from './types';

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
      { id: 'start', type: 'startNode', position: { x: 100, y: 100 }, data: { label: 'Backlog Input', processingTime: 2, resources: 1, quality: 1.0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {}, sourceConfig: { enabled: true, interval: 20, batchSize: 1 } } },

      { id: 'design', type: 'processNode', position: { x: 350, y: 100 }, data: { label: 'UX/UI Design', processingTime: 8, resources: 2, quality: 0.95, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'dev', type: 'processNode', position: { x: 600, y: 100 }, data: { label: 'Development', processingTime: 15, resources: 4, quality: 1.0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'review', type: 'processNode', position: { x: 850, y: 100 }, data: { label: 'Code Review', processingTime: 5, resources: 2, quality: 0.80, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'dev': 1, 'qa': 4 } } },

      { id: 'qa', type: 'processNode', position: { x: 1100, y: 100 }, data: { label: 'QA Testing', processingTime: 10, resources: 3, quality: 0.90, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'dev': 1, 'deploy': 5 } } },
      { id: 'deploy', type: 'processNode', position: { x: 1350, y: 100 }, data: { label: 'Deployment', processingTime: 3, resources: 1, quality: 0.99, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },

      { id: 'end-live', type: 'endNode', position: { x: 1600, y: 100 }, data: { label: 'Live Production', processingTime: 0, resources: 999, quality: 1.0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },

      { id: 'note1', type: 'annotationNode', position: { x: 850, y: 250 }, data: { label: '20% of PRs fail review and return to Dev (Rework Loop)' } },
      { id: 'note2', type: 'annotationNode', position: { x: 1100, y: 250 }, data: { label: '10% of tickets fail QA and return to Dev' } },
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
      { id: 'start-triage', type: 'startNode', position: { x: 100, y: 100 }, data: { label: 'Patient Arrival', processingTime: 3, resources: 2, quality: 1.0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'wait': 7, 'critical': 3 }, sourceConfig: { enabled: true, interval: 15, batchSize: 1 } } },
      { id: 'wait', type: 'processNode', position: { x: 350, y: 50 }, data: { label: 'Waiting Room', processingTime: 1, resources: 50, quality: 1.0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },

      { id: 'critical', type: 'processNode', position: { x: 350, y: 200 }, data: { label: 'Trauma Bay', processingTime: 20, resources: 2, quality: 0.95, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'nurse', type: 'processNode', position: { x: 600, y: 50 }, data: { label: 'Nurse Assessment', processingTime: 8, resources: 4, quality: 1.0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'doctor', type: 'processNode', position: { x: 850, y: 100 }, data: { label: 'Doctor Consult', processingTime: 12, resources: 3, quality: 1.0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'labs': 6, 'discharge': 4 } } },
      { id: 'treatment', type: 'processNode', position: { x: 1350, y: 200 }, data: { label: 'Treatment', processingTime: 15, resources: 5, quality: 1.0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'discharge': 1 } } },
      { id: 'discharge', type: 'processNode', position: { x: 1350, y: 50 }, data: { label: 'Discharge Admin', processingTime: 5, resources: 2, quality: 1.0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'end-home', type: 'endNode', position: { x: 1600, y: 100 }, data: { label: 'Sent Home', processingTime: 0, resources: 999, quality: 1.0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },

      { id: 'labs', type: 'processNode', position: { x: 1100, y: 200 }, data: { label: 'Labs / X-Ray', processingTime: 25, resources: 2, quality: 1.0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'treatment': 1 } } },

      { id: 'note1', type: 'annotationNode', position: { x: 350, y: 300 }, data: { label: '30% Critical Cases skip Waiting Room' } },
      { id: 'note2', type: 'annotationNode', position: { x: 1100, y: 300 }, data: { label: 'Labs act as a major bottleneck' } },
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
      { id: 'start-raw', type: 'startNode', position: { x: 100, y: 100 }, data: { label: 'Raw Materials', processingTime: 1, resources: 1, quality: 1.0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {}, sourceConfig: { enabled: true, interval: 10, batchSize: 5 } } },
      { id: 'cut', type: 'processNode', position: { x: 350, y: 100 }, data: { label: 'Cutting & Machining', processingTime: 8, resources: 3, quality: 0.98, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },

      { id: 'weld', type: 'processNode', position: { x: 600, y: 100 }, data: { label: 'Welding', processingTime: 12, resources: 2, quality: 0.95, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'paint', type: 'processNode', position: { x: 850, y: 100 }, data: { label: 'Painting', processingTime: 15, resources: 1, quality: 0.99, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'dry', type: 'processNode', position: { x: 1100, y: 100 }, data: { label: 'Drying Oven', processingTime: 20, resources: 10, quality: 1.0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'assembly', type: 'processNode', position: { x: 1350, y: 100 }, data: { label: 'Final Assembly', processingTime: 10, resources: 4, quality: 0.99, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },

      { id: 'qc', type: 'processNode', position: { x: 1600, y: 100 }, data: { label: 'Quality Control', processingTime: 5, resources: 2, quality: 0.90, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: { 'ship': 9, 'scrap': 1 } } },
      { id: 'ship', type: 'processNode', position: { x: 1850, y: 50 }, data: { label: 'Shipping', processingTime: 2, resources: 2, quality: 1.0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'end-customer', type: 'endNode', position: { x: 2100, y: 100 }, data: { label: 'Customer', processingTime: 0, resources: 999, quality: 1.0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },
      { id: 'scrap', type: 'endNode', position: { x: 1850, y: 200 }, data: { label: 'Recycle Bin', processingTime: 0, resources: 999, quality: 1.0, stats: { processed: 0, failed: 0, maxQueue: 0 }, routingWeights: {} } },

      { id: 'note1', type: 'annotationNode', position: { x: 850, y: 250 }, data: { label: 'Painting is a specific bottleneck' } },
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

  for (const item of items) {
    if (item.status === ItemStatus.COMPLETED) {
      completed++;
    } else if (item.status === ItemStatus.FAILED) {
      failed++;
    } else {
      wip++;
      if (item.currentNodeId) {
        const nodeItems = itemsByNode.get(item.currentNodeId);
        if (nodeItems) {
          nodeItems.push(item);
        } else {
          itemsByNode.set(item.currentNodeId, [item]);
        }
      }
    }
  }

  return { itemsByNode, itemCounts: { wip, completed, failed } };
};

export const useStore = create<SimulationState>((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  items: [],
  isRunning: false,
  tickSpeed: 100,
  tickCount: 0,
  history: [],

  // Performance: Pre-computed derived state
  itemsByNode: new Map(),
  itemCounts: { wip: 0, completed: 0, failed: 0 },

  // Default Item Config
  itemConfig: {
    color: '#d97706', // amber-600
    shape: 'circle',
    icon: 'none'
  },

  // Auto Injection (Master Switch)
  autoInjectionEnabled: false,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setItemConfig: (config) => set(state => ({ itemConfig: { ...state.itemConfig, ...config } })),

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
        stats: { processed: 0, failed: 0, maxQueue: 0 },
        routingWeights: {},
        sourceConfig: { enabled: false, interval: 20, batchSize: 1 }
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
          stats: { processed: 0, failed: 0, maxQueue: 0 },
          routingWeights: {},
          sourceConfig: { enabled: true, interval: 20, batchSize: 5 } // Enabled by default
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
          stats: { processed: 0, failed: 0, maxQueue: 0 },
          routingWeights: {},
          sourceConfig: { enabled: false, interval: 0, batchSize: 0 }
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
    set({
      nodes: get().nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...data } } : node
      ),
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
      items: [],
      history: [],
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
        tickCount: 0 
    });
  },

  setTickSpeed: (tickSpeed) => set({ tickSpeed }),
  
  toggleAutoInjection: () => set((state) => ({ autoInjectionEnabled: !state.autoInjectionEnabled })),

  addItem: (targetNodeId) => {
    const currentTick = get().tickCount;
    const newItem: ProcessItem = {
      id: generateId(),
      currentNodeId: targetNodeId,
      fromNodeId: null,
      status: ItemStatus.QUEUED,
      progress: 0,
      remainingTime: 0,
      processingDuration: 0,
      totalTime: 0,
      timeActive: 0,
      timeWaiting: 0,
      timeTransit: 0,
      spawnTick: currentTick,
      completionTick: null,
      transitProgress: 0
    };
    set({ items: [...get().items, newItem] });
  },

  clearItems: () => set({ items: [] }),

  // Persistence
  saveFlow: () => {
    const { nodes, edges, itemConfig } = get();
    const flow = { nodes, edges, itemConfig };
    localStorage.setItem('processFlowData', JSON.stringify(flow));
    alert('Flow saved to local storage!');
  },

  loadFlow: () => {
    const flowStr = localStorage.getItem('processFlowData');
    if (flowStr) {
      const flow = JSON.parse(flowStr);
      if (flow.nodes && flow.edges) {
          set({ 
              nodes: flow.nodes, 
              edges: flow.edges, 
              itemConfig: flow.itemConfig || get().itemConfig,
              items: [], 
              isRunning: false, 
              tickCount: 0,
              history: []
            });
      }
    } else {
        alert('No saved flow found.');
    }
  },

  exportJson: () => {
      const { nodes, edges, itemConfig } = get();
      const dataStr = JSON.stringify({ nodes, edges, itemConfig }, null, 2);
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
                items: [], 
                isRunning: false, 
                tickCount: 0,
                history: []
            });
        } else {
            alert('Invalid JSON structure.');
        }
      } catch (e) {
          alert('Failed to parse JSON.');
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
              history: []
          });
      }
  },

  tick: () => {
    set((state) => {
      const { nodes, edges, items, tickCount, autoInjectionEnabled, history } = state;
      const TRANSIT_DURATION = 20;

      // Build node lookup map for O(1) access (instead of O(n) find calls)
      const nodeMap = new Map<string, AppNode>();
      for (const node of nodes) {
        nodeMap.set(node.id, node);
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

      // --- AUTO INJECTION (only check nodes with sourceConfig) ---
      const injectedItems: ProcessItem[] = [];
      if (autoInjectionEnabled) {
        for (const node of nodes) {
          if ((node.type === 'processNode' || node.type === 'startNode') && node.data.sourceConfig?.enabled) {
            const config = node.data.sourceConfig;
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
                  timeActive: 0,
                  timeWaiting: 0,
                  timeTransit: 0,
                  spawnTick: tickCount,
                  completionTick: null,
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
      let totalCompleted = 0;

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
          weight: routingWeights[e.target] ?? 1
        }));
        const totalWeight = choices.reduce((sum, c) => sum + c.weight, 0);
        let random = Math.random() * totalWeight;
        for (const choice of choices) {
          if (random < choice.weight) return choice.targetId;
          random -= choice.weight;
        }
        return outgoing[outgoing.length - 1].target;
      };

      // Process items - mutate in place for performance
      for (const item of allItems) {
        item.totalTime++;

        if (item.status === ItemStatus.PROCESSING && item.currentNodeId) {
          const node = nodeMap.get(item.currentNodeId);
          if (node && node.type !== 'annotationNode') {
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
                  item.status = ItemStatus.TRANSIT;
                  item.fromNodeId = node.id;
                  item.currentNodeId = nextNodeId;
                  item.remainingTime = TRANSIT_DURATION;
                  item.transitProgress = 0;
                } else {
                  item.status = ItemStatus.COMPLETED;
                  item.currentNodeId = null;
                  item.completionTick = tickCount;
                  totalCompleted++;
                }
              } else {
                item.status = ItemStatus.FAILED;
                item.currentNodeId = null;
                item.completionTick = tickCount;
              }
            }
          }
        } else if (item.status === ItemStatus.TRANSIT) {
          item.remainingTime--;
          item.timeTransit++;
          item.transitProgress = 1 - (item.remainingTime / TRANSIT_DURATION);

          if (item.remainingTime <= 0) {
            item.status = ItemStatus.QUEUED;
            item.fromNodeId = null;
            item.progress = 0;
            item.transitProgress = 0;
          }
        } else if (item.status === ItemStatus.QUEUED) {
          item.timeWaiting++;
        } else if (item.status === ItemStatus.COMPLETED) {
          totalCompleted++;
        }
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
            const currentLoad = processingCounts.get(node.id) || 0;

            if (currentLoad < pData.resources) {
              processingCounts.set(node.id, currentLoad + 1);

              if (pData.processingTime === 0) {
                // Instant processing
                item.status = ItemStatus.COMPLETED;
                item.processingDuration = 0;
                item.remainingTime = 0;
                item.progress = 100;
                item.completionTick = tickCount;
                item.currentNodeId = null;
                totalCompleted++;

                const stats = nodesUpdates.get(node.id) || { processed: 0, failed: 0 };
                stats.processed++;
                nodesUpdates.set(node.id, stats);
              } else {
                item.status = ItemStatus.PROCESSING;
                item.remainingTime = pData.processingTime;
                item.processingDuration = pData.processingTime;
                item.progress = 0;
              }
            }
          }
        }
      }

      // --- UPDATE NODES (only if stats changed or validation needed) ---
      const nextNodes = nodes.map(n => {
        const statsUpdate = nodesUpdates.get(n.id);
        if (n.type === 'processNode' || n.type === 'startNode') {
          const pData = n.data as ProcessNodeData;
          const outgoing = edgesBySource.get(n.id);
          let validationError: string | undefined;

          if (!outgoing || outgoing.length === 0) {
            const lowerLabel = pData.label.toLowerCase();
            if (!lowerLabel.includes('end') && !lowerLabel.includes('ship') && !lowerLabel.includes('scrap') && !lowerLabel.includes('discharge')) {
              validationError = 'No Output Path';
            }
          }
          if (pData.resources === 0) {
            validationError = 'Zero Capacity';
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

        let rollingThroughput = 0;
        if (history.length >= 1) {
          const lookbackIndex = Math.max(0, history.length - 10);
          const prevEntry = history[lookbackIndex];
          const deltaCompleted = totalCompleted - prevEntry.totalCompleted;
          const deltaTicks = tickCount - prevEntry.tick;
          if (deltaTicks > 0) {
            rollingThroughput = (deltaCompleted / deltaTicks) * 100;
          }
        }

        nextHistory = [...history, { tick: tickCount, wip: wipCount, totalCompleted, throughput: rollingThroughput }];
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

      return {
        items: prunedItems,
        nodes: nextNodes,
        tickCount: tickCount + 1,
        history: nextHistory,
        itemsByNode: derived.itemsByNode,
        itemCounts: derived.itemCounts
      };
    });
  }
}));