# Process Flow Simulator - Project Context

## Overview

A visual, interactive process flow simulation tool for modeling business processes, identifying bottlenecks, and analyzing efficiency metrics using Value Stream Mapping (VSM) principles.

**Purpose**: Build visual process flows with drag-and-drop nodes, run discrete-event simulations, and analyze performance metrics in real-time.

---

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.x | UI framework |
| TypeScript | 5.x | Type safety |
| ReactFlow | 11.10.4 | Node-based canvas visualization |
| Zustand | 4.5.2 | State management & simulation engine |
| Recharts | 2.12.3 | Analytics charts |
| Lucide React | 0.292.0 | Icons |
| Vite | 6.x | Build tool & dev server |
| Tailwind CSS | (via classes) | Styling |

---

## Project Structure

```
process-flow-simulator/
├── App.tsx              # Main component - ReactFlow canvas, toolbar, modals
├── store.ts             # Zustand store - state management & simulation logic
├── types.ts             # TypeScript interfaces and types
├── index.tsx            # React entry point
├── index.html           # HTML shell
├── components/
│   ├── ProcessNode.tsx      # Process station nodes with queue visualization
│   ├── StartNode.tsx        # Entry point nodes (item generators)
│   ├── EndNode.tsx          # Terminal/sink nodes
│   ├── AnnotationNode.tsx   # Text note nodes
│   ├── ProcessEdge.tsx      # Connection edges with routing info
│   ├── Controls.tsx         # Playback controls (play/pause/step/speed)
│   ├── ConfigPanel.tsx      # Right-side node configuration panel
│   ├── VSMStats.tsx         # Real-time VSM metrics display
│   ├── SettingsModal.tsx    # Global item styling settings
│   └── AnalyticsDashboard.tsx # Full analytics with charts
├── vite.config.ts       # Vite configuration
├── tsconfig.json        # TypeScript configuration
└── package.json         # Dependencies
```

---

## Core Concepts

### Node Types

| Type | Purpose | Key Properties |
|------|---------|----------------|
| `startNode` | Entry point for items | `sourceConfig` (enabled, interval, batchSize) |
| `processNode` | Processing station | `processingTime`, `resources`, `quality`, `routingWeights` |
| `endNode` | Terminal/completion sink | Infinite capacity, instant processing |
| `annotationNode` | Non-functional text note | `label` only |

### Item Flow States

```
QUEUED → PROCESSING → TRANSIT → QUEUED (at next node) → ... → COMPLETED/FAILED
```

- **QUEUED**: Waiting in node's queue for available resource
- **PROCESSING**: Being processed (decrements `remainingTime` each tick)
- **TRANSIT**: Moving between nodes (20 ticks default)
- **COMPLETED**: Finished successfully (reached end node or no output)
- **FAILED**: Failed quality check

### Simulation Engine (Tick System)

Each tick (configurable 1-1000ms):
1. Auto-inject items at enabled start nodes (if `autoInjectionEnabled`)
2. Process items in PROCESSING state (decrement time, check quality)
3. Handle TRANSIT items (move progress, transition to QUEUED)
4. Assign QUEUED items to available resource slots
5. Record analytics history every 5 ticks

### Weighted Routing

When a node has multiple outputs, items are distributed based on `routingWeights`:
```typescript
routingWeights: { 'nodeA': 1, 'nodeB': 4 } // 20% to A, 80% to B
```

---

## State Management (store.ts)

### Key State

```typescript
{
  nodes: AppNode[]           // Visual nodes
  edges: Edge[]              // Connections
  items: ProcessItem[]       // Items in simulation
  isRunning: boolean         // Simulation active
  tickSpeed: number          // ms per tick
  tickCount: number          // Current tick
  history: HistoryEntry[]    // Analytics data
  itemConfig: ItemConfig     // Global item styling
  autoInjectionEnabled: boolean
}
```

### Key Actions

| Action | Description |
|--------|-------------|
| `addNode()`, `addStartNode()`, `addEndNode()` | Add nodes to canvas |
| `deleteNode(id)` | Remove node and connected edges |
| `connect(connection)` | Create edge between nodes |
| `startSimulation()`, `pauseSimulation()` | Control simulation |
| `stepSimulation()` | Manual single tick |
| `tick()` | Core simulation step |
| `resetSimulation()` | Keep nodes, clear items/stats |
| `loadScenario(key)` | Load pre-built scenario |
| `saveFlow()`, `loadFlow()` | LocalStorage persistence |
| `exportJson()`, `importJson()` | File-based persistence |

---

## Pre-built Scenarios

| Key | Description |
|-----|-------------|
| `devops` | DevOps pipeline: Backlog → Design → Dev → Review → QA → Deploy |
| `hospital` | ER Triage: Arrival → Triage → Nurse → Doctor → Labs → Discharge |
| `manufacturing` | Production line: Raw → Cut → Weld → Paint → Dry → Assembly → QC → Ship |
| `empty` | Blank canvas |

---

## VSM Metrics

| Metric | Calculation |
|--------|-------------|
| Lead Time | Total time in system (`totalTime`) |
| Value Added Time (VAT) | Processing time (`timeActive`) |
| Non-Value Added Time (NVAT) | Queue + Transit time (`timeWaiting + timeTransit`) |
| Process Cycle Efficiency (PCE) | `VAT / Lead Time * 100%` |
| Throughput | Items completed per time window |
| WIP | Items currently in system (not completed/failed) |

---

## Visual Indicators

| Indicator | Meaning |
|-----------|---------|
| Blue border | Selected node |
| Amber border | 3+ items in queue |
| Red border | 10+ items in queue (bottleneck) |
| Red badge | Validation error (no output, zero capacity) |

---

## Development

```bash
npm install --legacy-peer-deps  # React 19 peer dep conflicts
npm run dev                      # Start dev server (http://localhost:3000)
npm run build                    # Production build
npm run preview                  # Preview production build
```

---

## Key Implementation Details

### ProcessItem Structure
```typescript
{
  id: string
  currentNodeId: string | null
  fromNodeId: string | null      // For transit visualization
  status: ItemStatus
  progress: number               // 0-100 within current node
  remainingTime: number          // Ticks left
  processingDuration: number     // Snapshot of total duration
  totalTime: number              // Total ticks in system
  spawnTick: number
  completionTick: number | null
  timeActive: number             // VSM: processing time
  timeWaiting: number            // VSM: queue time
  timeTransit: number            // VSM: transit time
  transitProgress: number        // 0-1 for visual interpolation
}
```

### ProcessNodeData Structure
```typescript
{
  label: string
  processingTime: number         // Ticks per item
  resources: number              // Concurrent capacity
  quality: number                // Pass rate 0.0-1.0
  stats: { processed, failed, maxQueue }
  routingWeights: Record<string, number>
  sourceConfig?: { enabled, interval, batchSize }
  validationError?: string
}
```

---

## Conventions

- Use Zustand `get()` for reading state in actions
- Scenarios are deep-copied when loaded to prevent mutation
- Nodes use ReactFlow's coordinate system (position relative to canvas)
- Transit duration is fixed at 20 ticks
- History records every 5 ticks, max 500 entries
- Quality check happens when processing completes, not when starting

---

## Performance Optimizations

The simulation is optimized for smooth performance:

### Derived State (Pre-computed)

- `itemsByNode: Map<string, ProcessItem[]>` - O(1) lookup for items at each node
- `itemCounts: { wip, completed, failed }` - Pre-computed counts

### tick() Function Optimizations

- **Node Map**: O(1) lookups instead of O(n) `find()` calls
- **Edge Map by Source**: O(1) lookup for outgoing edges
- **Single Pass**: Items processed in one iteration where possible
- **In-place Mutation**: Items mutated directly (safe since we're updating state)

### Component Optimizations

- All node components use `memo()` to prevent unnecessary re-renders
- Components use `itemsByNode` selector instead of filtering all items
- `useMemo` for expensive calculations (VSMStats metrics, edge percentages)
- Controls uses `itemCounts` instead of filtering
- CSS transform-based progress indicators instead of SVG strokeDashoffset

### Memory Management

- **Item Cleanup**: Completed/failed items are pruned to max 200 most recent
- Prevents unbounded memory growth during long simulations
- Preserves enough finished items for accurate VSM metric calculations

### Edge Animations

- Edge animations disabled by default (`animated: false`)
- Eliminates constant CSS animation overhead across all connections

### Zustand Selectors

```typescript
// Good: O(1) lookup
const items = useStore((state) => state.itemsByNode.get(id) || []);

// Avoid: O(n) filter on every render
const items = useStore((state) => state.items.filter(i => i.currentNodeId === id));
```
