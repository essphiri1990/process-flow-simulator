# Process Flow Simulator - Development Memory

This file tracks all changes made to the project to maintain context across development sessions.

---

## Session: 2026-01-27

### Initial State
- Project was a React 19 + TypeScript + ReactFlow process simulation tool
- Had swimlanes feature that wasn't adding value
- Performance issues on older hardware (MacBook Pro 2017)

---

### Change 1: Removed Swimlanes Feature

**Reason:** User requested removal as it wasn't adding value.

**Files Modified:**
- `App.tsx` - Removed swimlane imports, nodeTypes entry, addSwimlane button, onNodeDragStop handler for swimlanes, minimap color for swimlanes
- `store.ts` - Removed SwimlaneNode import, swimlanes from all scenarios, addSwimlane function, swimlane deletion logic
- `types.ts` - Removed SwimlaneNodeData interface, SwimlaneNode type, addSwimlane from SimulationState
- `components/ConfigPanel.tsx` - Removed swimlane configuration section, Layout icon import
- `components/SwimlaneNode.tsx` - Deleted entirely

**Scenarios Updated:**
- Removed parentNode references from all scenario nodes
- Repositioned nodes that were previously in swimlanes

---

### Change 2: Performance Optimizations (Round 1)

**Reason:** Simulation felt slow on MacBook Pro 2017.

**Files Modified:**

#### `types.ts`
- Added `ItemCounts` interface for pre-computed counts
- Added `itemsByNode: Map<string, ProcessItem[]>` to SimulationState
- Added `itemCounts: ItemCounts` to SimulationState

#### `store.ts`
- Added `computeDerivedState()` helper function for O(1) lookups
- Rewrote `tick()` function with:
  - `nodeMap` for O(1) node lookups (instead of O(n) find calls)
  - `edgesBySource` Map for O(1) edge lookups
  - Single-pass item processing where possible
  - In-place item mutation

#### `components/ProcessNode.tsx`
- Changed from filtering all items to using `itemsByNode` Map
- Single pass to separate queued/processing items

#### `components/StartNode.tsx`
- Changed to use `itemsByNode` Map for O(1) lookup

#### `components/EndNode.tsx`
- Changed to use `itemsByNode` Map for O(1) lookup

#### `components/Controls.tsx`
- Now uses pre-computed `itemCounts` instead of filtering

#### `components/VSMStats.tsx`
- Added `useMemo` for expensive metric calculations
- Uses `itemCounts.wip` instead of filtering

#### `components/ProcessEdge.tsx`
- Added `memo()` wrapper
- Added `useMemo` for percentageLabel and transitItems calculations

---

### Change 3: Performance Optimizations (Round 2)

**Reason:** Still experiencing slowness after first round of optimizations.

**Files Modified:**

#### `store.ts` - Disabled Edge Animations
Changed all edges in scenarios from `animated: true` to `animated: false`:
- DevOps scenario: 8 edges
- Hospital scenario: 10 edges
- Manufacturing scenario: 9 edges
- `connect()` function: new edges now created with `animated: false`

#### `store.ts` - Added Item Cleanup (Memory Leak Fix)
Added cleanup logic at end of `tick()` function:
```typescript
const MAX_FINISHED_ITEMS = 200;
// Separates active items from finished items
// Keeps only 200 most recent finished items (sorted by completionTick)
// Prevents unbounded memory growth during long simulations
```

#### `components/ProcessNode.tsx` - Simplified SVG Rendering
Replaced complex SVG `strokeDashoffset` progress rings with CSS transform-based progress:
```typescript
// Before: SVG with strokeDashoffset calculations
// After: Simple CSS transform overlay
<div
  className="absolute inset-0 bg-white/30"
  style={{ transform: `translateY(${100 - displayProgress}%)` }}
/>
```

#### `components/StartNode.tsx` - Simplified SVG Rendering
Same change as ProcessNode - replaced SVG progress with CSS transform overlay.

---

### Change 4: Created CLAUDE.md

**Reason:** User requested project documentation file.

**Content includes:**
- Project overview and purpose
- Tech stack table
- Project structure
- Core concepts (node types, item flow states, simulation engine)
- State management details
- Pre-built scenarios
- VSM metrics explanations
- Visual indicators guide
- Development commands
- Key implementation details (ProcessItem, ProcessNodeData structures)
- Conventions
- Performance optimizations documentation
- Zustand selector best practices

---

### Change 5: Created GitHub Repository

**Reason:** User requested to create a GitHub repo.

**Steps Completed:**
1. Initialized git repository in project directory
2. Verified .gitignore existed (was already present from Vite template)
3. Updated README.md with proper project documentation:
   - Features list
   - Tech stack
   - Getting started instructions
   - Usage guide
   - Node types table
   - VSM metrics explanation
   - Project structure
4. Installed GitHub CLI (gh) to `/tmp/gh_2.63.2_macOS_amd64/`
5. User authenticated with GitHub (HTTPS protocol)
6. Created public repository and pushed code

**Repository URL:** https://github.com/essphiri1990/process-flow-simulator

**Initial Commit:** "Initial commit: Process Flow Simulator"
- 23 files committed
- Includes all source code, documentation, and configuration

---

### Change 6: Created MEMORY.md

**Reason:** User requested a memory file to track all changes.

**This file** - Created to maintain development context across sessions.

---

## Performance Optimization Summary

| Optimization | Impact |
|--------------|--------|
| itemsByNode Map | O(1) node item lookups instead of O(n) filter |
| itemCounts pre-computed | Eliminates 3x filter calls in Controls |
| nodeMap in tick() | O(1) node lookups instead of O(n) find |
| edgesBySource Map | O(1) edge lookups for routing |
| Edge animations disabled | Eliminates 27+ constant CSS animations |
| Item cleanup (max 200) | Prevents memory leak from unbounded array growth |
| CSS transforms for progress | GPU-accelerated, cheaper than SVG strokeDashoffset |
| memo() on components | Prevents unnecessary re-renders |
| useMemo for calculations | Memoizes expensive computations |

---

## Files in Project

```
process-flow-simulator/
├── App.tsx              # Main component
├── store.ts             # Zustand store + simulation engine
├── types.ts             # TypeScript interfaces
├── index.tsx            # React entry point
├── index.html           # HTML shell
├── CLAUDE.md            # Technical documentation
├── MEMORY.md            # This file - change tracking
├── README.md            # GitHub readme
├── .gitignore           # Git ignore rules
├── package.json         # Dependencies
├── package-lock.json    # Dependency lock
├── tsconfig.json        # TypeScript config
├── vite.config.ts       # Vite config
├── metadata.json        # AI Studio metadata
└── components/
    ├── ProcessNode.tsx      # Process station nodes
    ├── StartNode.tsx        # Entry point nodes
    ├── EndNode.tsx          # Terminal nodes
    ├── AnnotationNode.tsx   # Text note nodes
    ├── ProcessEdge.tsx      # Connection edges
    ├── Controls.tsx         # Playback controls
    ├── ConfigPanel.tsx      # Node configuration
    ├── VSMStats.tsx         # Real-time metrics
    ├── SettingsModal.tsx    # Global settings
    └── AnalyticsDashboard.tsx
```

---

## Session: 2026-01-27 (Continued)

### Change 7: Orthogonal (Right-Angle) Connectors

**Reason:** User feedback that bezier curve connectors looked like "spaghetti" - wanted clean, professional Visio-style connectors.

**Files Modified:**

#### `components/ProcessEdge.tsx`
- Replaced `getBezierPath` with `getSmoothStepPath` from ReactFlow
- Added `getOrthogonalPoint()` helper function for item animation along orthogonal paths
- Items now animate along 3-segment paths (horizontal → vertical → horizontal)
- Added `borderRadius: 8` for slightly rounded corners on path bends
- Updated transit item shapes to include 'rounded' variant

**Visual Impact:**
- Connectors now use clean right-angle paths like Microsoft Visio
- Items smoothly animate through corner turns
- Much cleaner look especially when nodes aren't horizontally aligned

---

### Change 8: Distance-Based Transit Time

**Reason:** Transit time was a constant 20 ticks regardless of edge length - unrealistic for process simulation.

**Files Modified:**

#### `store.ts`
- Removed constant `TRANSIT_DURATION = 20`
- Added `getTransitDuration(sourceId, targetId)` helper function
- Calculates Manhattan distance between nodes (matching orthogonal path)
- Transit duration: `Math.max(5, Math.min(30, Math.round(distance / 25)))`
  - Minimum: 5 ticks
  - Maximum: 30 ticks
  - Scale: 1 tick per 25 pixels
- Stores transit duration in `item.processingDuration` for progress calculation
- Updated transit progress to use stored duration instead of constant

**Accuracy Impact:**
- Items take longer to travel between distant nodes
- Items take less time for nearby nodes
- More realistic simulation of physical processes

---

### Change 9: Time Unit Configuration

**Reason:** VSM professionals need to understand what each tick represents in real-world time (minutes, hours, days).

**Files Modified:**

#### `types.ts`
- Added `TimeUnitConfig` interface with `ticksPerUnit`, `unitName`, `unitNamePlural`, `unitAbbrev`
- Added `TIME_UNIT_PRESETS` constant with presets:
  - `ticks` (1:1 ratio)
  - `seconds` (1:1 ratio)
  - `minutes` (1:1 ratio, default)
  - `hours` (60:1 ratio)
  - `days` (480:1 ratio - 8-hour workday)
- Added `timeUnit: string` to `SimulationState`
- Added `setTimeUnit` action

#### `store.ts`
- Added `timeUnit: 'minutes'` initial state
- Added `setTimeUnit` action

#### `components/SettingsModal.tsx`
- Added time unit selector under "Time Settings" section
- Shows 5 preset options in grid layout
- Displays explanation of how selection affects metrics display

#### `components/VSMStats.tsx`
- Added `timeUnit` state subscription
- Added `formatTime()` helper that converts ticks to selected unit
- Updated all metric displays to use `unitAbbrev` instead of hardcoded 't'
- PCE breakdown tooltip now shows times in selected units

---

## Updated Accuracy & VSM Features

| Feature | Before | After |
|---------|--------|-------|
| Connectors | Bezier curves (spaghetti) | Orthogonal paths (Visio-style) |
| Transit time | Constant 20 ticks | Distance-based (5-30 ticks) |
| Time display | Always "ticks" | Configurable (min/hr/day) |
| Item animation | Bezier interpolation | Follows actual SVG path |

---

### Change 10: Accurate Item Path Following

**Reason:** Items were not following the actual connector lines between nodes - they used a simplified 3-segment approximation that didn't match the rendered path.

**Files Modified:**

#### `components/ProcessEdge.tsx`
- Removed `getOrthogonalPoint()` function (simplified approximation)
- Added `PathSegment` interface for parsed path segments
- Added `parsePathToSegments(pathString)` function:
  - Parses SVG path commands (M, L, H, V, Q, C, Z)
  - Converts path string into discrete line segments with lengths
  - Handles bezier curves by approximating as straight lines
- Added `getPointAlongPath(segments, t)` function:
  - Interpolates along parsed segments based on t (0-1)
  - Items now follow the exact same path as the rendered connector
- Added `pathSegments` memoized value to parse edgePath once per render

**Visual Impact:**
- Items now travel exactly along the rendered connector lines
- Smooth transitions through corners and bends
- Much more visually accurate and professional appearance

---

### Change 11: Analytics Dashboard Overhaul

**Reason:** The analytics dashboard only had 2 basic charts and lacked key VSM insights.

**Files Modified:**

#### `components/AnalyticsDashboard.tsx`

**New Features Added:**

1. **Summary Statistics Panel** (4 cards at top):
   - Current WIP with peak indicator
   - Total Completed items
   - Average Throughput rate
   - Average WIP over time

2. **Time Unit Support**:
   - All axis labels now use configured time unit
   - Tooltips show times in selected unit (min/hr/day)
   - Elapsed time shown in header

3. **Cumulative Output Chart** (new):
   - Shows total completed items over time
   - Area chart with gradient fill
   - Steeper slope = higher productivity

4. **Per-Node Performance Table** (new):
   - Shows all process nodes with statistics
   - Columns: Node name, Processed, Failed, Queue length, Utilization %, Quality %, Processing time
   - Visual utilization bars (green/amber/red based on load)
   - Quality badges with color coding
   - Highlights bottlenecks (queue > 5, utilization > 80%)

5. **Visual Improvements**:
   - Switched WIP chart to AreaChart with gradient
   - Better tooltips with formatted values
   - Responsive 2-column layout for charts
   - Larger modal (max-w-5xl, 90vh)
   - Added memo() wrapper for performance
   - Color-coded indicators throughout

**VSM Value:**
- Easier identification of bottlenecks through utilization % and queue lengths
- Quality issues visible per-node
- Cumulative output shows productivity trends
- All metrics in user-selected time units

---

### Change 12: End Node Stats Fix

**Reason:** End nodes were not updating their "Items Completed" counter - items would reach the end node but the stats weren't being recorded.

**Root Cause:** In `store.ts` tick() function, the node stats update logic at line 688 only included `processNode` and `startNode` - it excluded `endNode`.

**Files Modified:**

#### `store.ts`
- Added `n.type === 'endNode'` to the stats update condition (line 688)
- Moved validation logic (No Output Path, Zero Capacity) to only apply to non-end nodes
- End nodes now correctly increment their `processed` stat when items complete

**Impact:**
- End node "Items Completed" counter now updates correctly
- Analytics Dashboard per-node table shows accurate end node stats

---

### Change 13: Improved Connector Usability

**Reason:** User feedback that connectors were not easy or intuitive to move and change.

**Files Modified:**

#### `types.ts`
- Added `reconnectEdge` action to `SimulationState` interface

#### `store.ts`
- Added `reconnectEdge(oldEdge, newConnection)` action for edge reconnection
- Allows replacing an existing edge with a new connection while preserving styling

#### `App.tsx`
- Added imports for `Edge`, `Connection`, `ConnectionLineType` from ReactFlow
- Added `edgeReconnectSuccessful` ref to track reconnection state
- Added `onReconnectStart`, `onReconnect`, `onReconnectEnd` handlers
- Added `connectionLineType={ConnectionLineType.SmoothStep}` for consistent preview
- Added `connectionLineStyle` with dashed blue line for connection preview
- Updated instructions legend to mention edge reconnection capability

#### `components/ProcessNode.tsx`
- Increased handle size from 0.8rem to 12px for easier targeting
- Added `boxShadow` for better visibility
- Handles now visible when node is selected (not just on hover)
- Added `hover:!scale-125` for visual feedback on handle hover

#### `components/StartNode.tsx`
- Same handle improvements as ProcessNode
- Emerald-colored handles to match node theme

#### `components/EndNode.tsx`
- Same handle improvements as ProcessNode
- Slate-colored handles to match node theme

#### `components/ProcessEdge.tsx`
- Added `useState` for hover state tracking
- Added invisible wider path (20px) for easier edge selection
- Edge stroke thickens on hover (2px → 3px) with color change
- Added reconnection endpoint indicators (blue circles) at source and target
- Indicators appear on hover or selection to show edges are reconnectable

**New Connector Features:**

| Feature | Description |
|---------|-------------|
| Edge Reconnection | Drag edge endpoints to connect to different nodes |
| Connection Preview | Dashed blue line shows while creating connections |
| Larger Handles | 12px handles with shadows for easier targeting |
| Selection Visibility | Handles visible when node is selected |
| Hover Feedback | Handles scale up on hover, edges thicken |
| Endpoint Indicators | Blue circles at edge endpoints show reconnection points |
| Wider Hit Area | 20px invisible path for easier edge selection |

**User Experience Improvements:**
- Edges can now be reconnected by dragging endpoints to different nodes
- Visual feedback when hovering over connectors and handles
- Easier to discover connection points through improved visibility
- More intuitive manipulation of the process flow diagram

---

### Change 14: Real-Time Duration-Based Simulation

**Reason:** User wanted simulation timing to equate to real time (1 second = 1 hour) and the ability to run simulations for specific time periods (1 day, 1 week, 1 month, etc.).

**Files Modified:**

#### `types.ts`
- Added time calculation constants:
  - `TICKS_PER_MINUTE = 1`
  - `TICKS_PER_HOUR = 60`
  - `TICKS_PER_WORKDAY = 480` (8 hours)
  - `TICKS_PER_WEEK = 2400` (5 working days)
  - `WORKING_DAYS_PER_MONTH = 22`
  - `WORKING_DAYS_PER_YEAR = 264`
- Added `DurationPreset` interface with `key`, `label`, `totalTicks`, `displayUnit`, `displayUnitAbbrev`
- Added `DURATION_PRESETS` constant with presets: 1day, 1week, 1month, 3months, 12months, unlimited
- Added `SpeedPreset` interface with `key`, `label`, `ticksPerSecond`, `realTimeRatio`
- Added `SPEED_PRESETS` array: 0.1x (6 tps), 1x (60 tps), 10x (600 tps), 60x (3600 tps), Max (-1)
- Extended `SimulationState` with: `durationPreset`, `targetDuration`, `speedPreset`, `ticksPerSecond`, `simulationProgress`, `autoStopEnabled`
- Added actions: `setDurationPreset()`, `setSpeedPreset()`, `setAutoStop()`

#### `store.ts`
- Added imports for `DURATION_PRESETS`, `SPEED_PRESETS`
- Added initial state: `durationPreset: 'unlimited'`, `targetDuration: Infinity`, `speedPreset: '1x'`, `ticksPerSecond: 60`, `simulationProgress: 0`, `autoStopEnabled: true`
- Added `setDurationPreset()` action - updates preset and recalculates progress
- Added `setSpeedPreset()` action - updates speed from preset
- Added `setAutoStop()` action
- Modified `tick()`: Added auto-stop check at start, calculates `simulationProgress` on each tick
- Modified `resetSimulation()`: Resets progress to 0, preserves duration/speed settings
- Updated `saveFlow()`/`loadFlow()`: Includes `durationPreset`, `speedPreset`, `autoStopEnabled`

#### `components/Controls.tsx`
- Complete rewrite of interval logic:
  - Changed from `tickSpeed` (ms per tick) to `ticksPerSecond`
  - Uses refs for cleanup (`intervalRef`, `rafRef`)
  - Max speed uses `requestAnimationFrame` with 100 ticks per frame
  - Normal speeds batch ticks to achieve target rate (caps at 60 intervals/second)
- Added duration selector dropdown with all presets
- Added speed preset buttons (0.1x, 1x, 10x, 60x, Max)
- Added progress bar showing elapsed/total time and percentage
- Added helper functions: `formatElapsedTime()`, `formatTotalTime()`
- Time display now shows human-readable format (e.g., "6h 24m" instead of tick count)

#### `components/VSMStats.tsx`
- Added `getDisplayConfig()` function for adaptive time unit selection
- Selects display unit based on duration preset:
  - Day simulation → hours
  - Week/Month simulation → days
  - Quarter simulation → weeks
  - Year simulation → months
  - Unlimited → auto-scales based on current lead time
- Removed dependency on `timeUnit` setting (now auto-adapts)
- All metrics (Lead Time, Transit, Waiting, Throughput) use adaptive units

#### `components/AnalyticsDashboard.tsx`
- Added imports for `DURATION_PRESETS` and time constants
- Added `getDisplayConfig()` for adaptive time unit selection
- Added state subscriptions for `durationPreset`, `targetDuration`, `simulationProgress`
- Added progress indicator in header (shows % and progress bar when duration is set)
- Chart X-axis labels scale based on duration:
  - Uses adaptive time units for formatting
  - Tooltip shows times in appropriate units
- Removed dependency on `TIME_UNIT_PRESETS`

**Duration Presets (8-hour workday model):**

| Preset | Working Time | Total Ticks | Real Time at 1x |
|--------|-------------|-------------|-----------------|
| 1 Day | 8 hours | 480 | 8 seconds |
| 1 Week | 5 days | 2,400 | 40 seconds |
| 1 Month | 22 days | 10,560 | ~3 minutes |
| 3 Months | 66 days | 31,680 | ~9 minutes |
| 12 Months | 264 days | 126,720 | ~35 minutes |

**Speed Presets:**

| Preset | Ticks/Second | Real Time Ratio |
|--------|-------------|-----------------|
| 0.1x | 6 | 1s = 6 minutes |
| 1x | 60 | 1s = 1 hour |
| 10x | 600 | 1s = 10 hours |
| 60x | 3,600 | 1s = 1 day |
| Max | unlimited | As fast as possible |

**Key Features:**
- Auto-stop: Simulation automatically stops when target duration is reached
- Progress tracking: Real-time progress bar with percentage display
- Adaptive display: KPIs and charts automatically use appropriate time units
- Max speed mode: Uses requestAnimationFrame for maximum performance
- Preserved settings: Duration/speed settings survive reset and are saved with flow

---

### Change 15: Top Header Bar & UI Reorganization

**Reason:** User requested a top header to organize tools and create a cleaner, more modern interface.

**Files Created:**

#### `components/Header.tsx` (new)
- Full-width header bar at top of screen (56px height)
- Organized into three sections: Left, Center, Right

**Left Section:**
- Logo with gradient background and app title
- Node tools toolbar (Start, Process, End, Note buttons)
- Grouped in pill-shaped container with hover effects

**Center Section:**
- Scenario selector dropdown (DevOps, Hospital, Manufacturing, Empty)
- Clean dropdown with icon

**Right Section:**
- Quick Save/Load buttons (browser localStorage)
- Export/Import JSON file buttons
- Clear Canvas button (with confirmation)
- Settings button

**Responsive Design:**
- On smaller screens (< lg), node tools move to a secondary row below header
- On very small screens (< sm), some labels hide to save space
- XL screens show full labels on all buttons

**Files Modified:**

#### `App.tsx`
- Imported new Header component
- Removed old top-left stacked panels (logo, scenario selector, tools, persistence buttons)
- Added `pt-14` padding to canvas container to account for header height
- Added collapsible Help button (top right) with quick guide panel
- Simplified imports (removed unused icons)
- Cleaner separation of concerns

**UI Changes:**

| Before | After |
|--------|-------|
| Stacked panels in top-left | Clean horizontal header bar |
| Tools scattered vertically | Tools grouped by function |
| Always-visible instructions | Collapsible help panel |
| Multiple floating panels | Single cohesive header |

**Visual Improvements:**
- Modern gradient logo icon
- Grouped tool buttons with subtle backgrounds
- Consistent hover states throughout
- Responsive layout for different screen sizes
- Collapsible help panel reduces visual clutter
- Better use of horizontal space

---

## Pending/Future Considerations

- Further performance testing on older hardware
- Consider throttling/debouncing state updates if needed
- Edge animations could be made optional via settings
- Consider adding cycle time vs lead time per node
- Custom duration input for specific simulation lengths

---

*Last updated: 2026-01-28*
