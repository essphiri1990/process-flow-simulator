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
│   ├── Controls.tsx         # Bottom toolbar: playback, settings, VSM metrics
│   ├── ConfigPanel.tsx      # Right-side node configuration panel
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
| Lead Time | Active + waiting time (`timeActive + timeWaiting`) |
| Value Added Time (VAT) | Processing time (`timeActive`) |
| Non-Value Added Time (NVAT) | Queue time (`timeWaiting`) |
| Process Cycle Efficiency (PCE) | `VAT / Lead Time * 100%` |
| Throughput | Items completed per completion window (default 50) |
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
  metricsEpoch: number           // Metrics epoch at spawn time (for resets)
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
- Transit duration is distance-based or edge-override (not included in VSM lead time calculations)
- History records every 5 ticks, max 500 entries
- Quality check happens when processing completes, not when starting

---

## UI Quality Standards

Every feature must be implemented with attention to layout stability, clarity, and polish. These rules are non-negotiable:

### Layout Stability

- **No layout shifts**: UI elements must never cause surrounding content to resize, reflow, or jump when state changes. Use fixed widths/heights for containers whose children change dynamically (e.g. toggle labels, stat values, play/pause buttons).
- **Fixed-width containers for dynamic content**: Any element that displays changing values (numbers, text that toggles) must use a fixed `w-[Npx]` instead of `min-w` or auto-width. This prevents the toolbar and surrounding elements from shifting as values grow/shrink.
- **Always-render, visually-hide pattern**: Prefer making elements invisible (`opacity-0`, `text-transparent`, `pointer-events-none`) over conditionally removing them from the DOM. Conditional rendering (`{condition && <div>}`) causes parent containers to resize.
- **Single-element state swaps**: When an element changes between states (e.g. Run/Pause button), use a single element that swaps its content rather than conditionally rendering different elements. This keeps the container size constant.

### Node Layout (Scenarios)

- **Spacing**: Nodes are 256-288px wide (`w-64` to `w-72`). Horizontal spacing between nodes must be at least 400px to leave visible room for edge connectors.
- **Left-to-right flow**: Process flows must read left-to-right. Items enter nodes on the left handle and exit on the right.
- **Branching lanes**: When a process branches (e.g. pass/fail, triage split), use distinct vertical lanes with enough vertical separation (250-300px) so edges don't overlap nodes.
- **Annotations below**: Annotation nodes should be placed well below the process flow (150-200px gap) so they don't crowd working nodes.

### Visual Clarity

- **Self-evident states**: Don't add redundant labels for obvious states (e.g. no "Off" label on a clearly-off toggle).
- **Color-coded metrics**: Each metric type gets a consistent, distinct color across the UI (e.g. PCE = emerald, Lead = amber, Throughput = purple, WIP = blue).
- **Monospace for values**: All numeric/metric values use `font-mono` for consistent character widths, preventing micro-shifts as digits change.
- **Tooltips over labels**: Prefer hover tooltips for secondary information rather than always-visible labels that clutter the UI.

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

### Time Model (Single Source of Truth)

- 1 tick = 1 simulated minute. `tickCount` is the only time axis; arrivals, processing, transit, analytics, and the display clock all derive from it.
- Display clock: `displayTickCount = computeDisplayTickCount(tickCount, cumulativeTransitTicks, policy)`. When `countTransitInClock=false`, only ticks where *all* active items are in TRANSIT are excluded (tracked via `isTransitOnlyTick` in `store.ts`).
- Transit: auto duration is distance-based 5–30 ticks via `computeTransitDuration`; per-edge `data.transitTime` overrides when >0. Transit animation remains unchanged.
- Scheduler: `components/Controls.tsx` uses fractional batching (`computeSchedule`) capped at 60 Hz with an accumulator; max-speed mode uses `requestAnimationFrame` with a 300-tick safety cap per frame. Goal: actual `tick()` calls per second ≈ configured `ticksPerSecond`.
- State fields updated every tick: `cumulativeTransitTicks`, `displayTickCount`, `countTransitInClock`, `simulationProgress`, `ticksPerSecond`, `speedPreset`.
- Metrics: lead time, VAT/NVAT, PCE, throughput (completion-window, default 50 completions) and WIP all derive from per-tick item timers and `tickCount`; transit is excluded from lead/PCE/throughput.
- Tests: `tests/scheduler.test.ts`, `tests/store.test.ts` cover scheduler accuracy, clock advancement, transit-only handling, lead/VAT/NVAT sums, throughput window alignment, policy toggle, and PCE sanity. Run with `npm test`.

### Demand-Driven Simulation

- Demand mode allows exact arrivals per hour/day/week/month over a bounded period (working hours model).
- Deterministic fractional accumulator ensures arrivals match the target exactly.
- Per-node working hours (hours/day, days/week) gate both demand arrivals and processing.
- Demand is configured per start node (not evenly split).
- See `PLAN-DEMAND-DRIVEN-SIMULATION.md` for the full implementation plan.

### Clock Semantics (NON-NEGOTIABLE)

The display clock represents **elapsed simulated time**, while lead time represents **per‑item time in system** (active + waiting). These are related but not identical, and the UI must label them clearly so executives don’t confuse timeline with item experience.

**Rules:**

- The clock must never freeze or get stuck at a constant value while items are actively processing and flowing.
- The clock must advance on every tick where any item is being processed or waiting in a queue. A tick only counts as "transit-only" (excluded from display clock when `countTransitInClock=false`) if ALL active items are exclusively in transit and nothing else is happening.
- The clock is the system timeline; lead time is a separate KPI. Do not force them to match.
- Transit animation between nodes is a **non-negotiable visual feature** — it adds significant value by making the simulation feel alive. Any clock fix must preserve the visual transit animation untouched. The transit animation (items visually moving between nodes) is decoupled from clock accounting.
- The `cumulativeTransitTicks` counter must NOT grow at the same rate as `tickCount` during steady-state flow. If it does, `displayTickCount = tickCount - cumulativeTransitTicks` becomes constant and the clock freezes.

**Implementation detail (store.ts tick function):**

- `hasTransitThisStep`: true if any item is in TRANSIT this tick.
- `hasNonTransitActiveItem`: true if any item is PROCESSING or QUEUED this tick.
- `isTransitOnlyTick = hasTransitThisStep && !hasNonTransitActiveItem` — only this combination increments `cumulativeTransitTicks`.
- This ensures the clock advances whenever productive work is happening, and only pauses when the entire system is idle waiting for transit to complete.
