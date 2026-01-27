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

## Pending/Future Considerations

- Further performance testing on older hardware
- Potential for requestAnimationFrame-based tick scheduling
- Consider throttling/debouncing state updates if needed
- Edge animations could be made optional via settings

---

*Last updated: 2026-01-27*
