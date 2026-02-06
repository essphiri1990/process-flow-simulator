# Real-Time Duration-Based Simulation - Implementation Plan

## Overview

Transform the tick-based simulation into a real-time system where:
- **1 tick = 1 minute** of simulated time
- **Default speed:** 1 second of real time = 1 hour of simulation (60 ticks/second)
- **Duration presets:** 1 day, 1 week, 1 month, 3 months, 12 months
- **Working hours model:** 8-hour workday, 5-day week

**New requirement (evolved use case):** Demand-driven simulation must generate **exact arrivals** over a chosen period (hour/day/week/month). See `PLAN-DEMAND-DRIVEN-SIMULATION.md` for the detailed plan.

---

## Duration Presets (8-hour workday)

| Preset | Working Time | Total Ticks | Real Time at 1x |
|--------|-------------|-------------|-----------------|
| 1 Day | 8 hours | 480 | 8 seconds |
| 1 Week | 5 days (40 hrs) | 2,400 | 40 seconds |
| 1 Month | 22 days | 10,560 | ~3 minutes |
| 3 Months | 66 days | 31,680 | ~9 minutes |
| 12 Months | 264 days | 126,720 | ~35 minutes |

## Speed Presets

| Preset | Ticks/Second | Real Time Ratio |
|--------|-------------|-----------------|
| 0.1x | 6 | 1s = 6 minutes |
| 1x (default) | 60 | 1s = 1 hour |
| 10x | 600 | 1s = 10 hours |
| 60x | 3,600 | 1s = 1 day |
| Max | unlimited | As fast as possible |

---

## Files to Modify

### 1. types.ts
- Add `DurationPreset` interface
- Add `SpeedPreset` interface
- Add `DURATION_PRESETS` constant
- Add `SPEED_PRESETS` constant
- Add time constants (`TICKS_PER_HOUR`, `TICKS_PER_WORKDAY`, etc.)
- Extend `SimulationState` with duration/speed properties

### 2. store.ts
- Add new state: `durationPreset`, `targetDuration`, `speedPreset`, `ticksPerSecond`, `simulationProgress`, `autoStopEnabled`
- Add actions: `setDurationPreset()`, `setSpeedPreset()`, `setAutoStop()`
- Modify `tick()`: Add auto-stop check when `tickCount >= targetDuration`
- Modify `resetSimulation()`: Reset progress, preserve duration settings
- Update `saveFlow()`/`loadFlow()`: Include simulation config

### 3. components/Controls.tsx
- Rewrite interval logic: Change from `tickSpeed` (ms per tick) to `ticksPerSecond`
- Add duration selector dropdown
- Add speed preset buttons (0.1x, 1x, 10x, 60x, Max)
- Add progress bar with elapsed/total time display
- Add helper functions: `formatElapsedTime()`, `formatTotalTime()`

### 4. components/VSMStats.tsx
- Add `getDisplayConfig()` for adaptive time unit selection
- Update `formatTime()` to scale based on duration (min/hr/day/week)

### 5. components/AnalyticsDashboard.tsx
- Update chart X-axis labels to scale with duration
- Add progress indicator to header

### 6. components/SettingsModal.tsx (optional)
- Add duration configuration section as alternative UI location

---

## Implementation Steps

### Phase 1: Types and Constants

```typescript
// types.ts - New interfaces and constants

// Duration presets for bounded simulations
export interface DurationPreset {
  key: string;
  label: string;
  totalTicks: number;
  displayUnit: string;
  displayUnitAbbrev: string;
}

export const DURATION_PRESETS: Record<string, DurationPreset> = {
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

// Time calculation constants
export const TICKS_PER_MINUTE = 1;
export const TICKS_PER_HOUR = 60;
export const TICKS_PER_WORKDAY = 480;    // 8 hours
export const TICKS_PER_WEEK = 2400;      // 5 working days
export const WORKING_DAYS_PER_MONTH = 22;
export const WORKING_DAYS_PER_YEAR = 264;
```

### Phase 2: Store Updates

```typescript
// store.ts - New state properties
durationPreset: 'unlimited',
targetDuration: Infinity,
speedPreset: '1x',
ticksPerSecond: 60,
simulationProgress: 0,
autoStopEnabled: true,

// New actions
setDurationPreset: (preset: string) => {
  const presetConfig = DURATION_PRESETS[preset];
  if (!presetConfig) return;
  set({
    durationPreset: preset,
    targetDuration: presetConfig.totalTicks
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

// Modified tick() - add auto-stop check at start
tick: () => {
  set((state) => {
    const { tickCount, targetDuration, autoStopEnabled } = state;

    // AUTO-STOP CHECK
    if (autoStopEnabled && targetDuration !== Infinity && tickCount >= targetDuration) {
      return { ...state, isRunning: false, simulationProgress: 100 };
    }

    // ... existing tick logic ...

    // Calculate progress at end
    const newTickCount = tickCount + 1;
    const simulationProgress = targetDuration === Infinity
      ? 0
      : Math.min(100, (newTickCount / targetDuration) * 100);

    return {
      // ... existing return values ...
      tickCount: newTickCount,
      simulationProgress
    };
  });
}
```

### Phase 3: Controls UI Updates

```typescript
// Controls.tsx - New interval logic
useEffect(() => {
  let interval: ReturnType<typeof setInterval> | undefined;
  let rafId: number | undefined;

  if (isRunning) {
    if (ticksPerSecond === -1) {
      // Max speed: use requestAnimationFrame
      const runFrame = () => {
        const state = useStore.getState();
        if (!state.isRunning) return;

        // Execute multiple ticks per frame
        for (let i = 0; i < 100; i++) {
          tick();
        }
        rafId = requestAnimationFrame(runFrame);
      };
      rafId = requestAnimationFrame(runFrame);
    } else {
      // Normal speed: batch ticks to achieve target rate
      const intervalMs = 1000 / Math.min(ticksPerSecond, 60);
      const ticksPerInterval = Math.max(1, Math.floor(ticksPerSecond / 60));

      interval = setInterval(() => {
        for (let i = 0; i < ticksPerInterval; i++) {
          tick();
        }
      }, intervalMs);
    }
  }

  return () => {
    if (interval) clearInterval(interval);
    if (rafId) cancelAnimationFrame(rafId);
  };
}, [isRunning, ticksPerSecond, tick]);
```

### Phase 4: Metrics Adaptation

```typescript
// VSMStats.tsx - Adaptive time unit selection
const getDisplayConfig = (durationPreset: string, avgLeadTime: number) => {
  const preset = DURATION_PRESETS[durationPreset];

  if (durationPreset === 'unlimited' || !preset) {
    // Auto-scale based on current lead time
    if (avgLeadTime < TICKS_PER_HOUR) return { divisor: 1, abbrev: 'min' };
    if (avgLeadTime < TICKS_PER_WORKDAY) return { divisor: TICKS_PER_HOUR, abbrev: 'hr' };
    return { divisor: TICKS_PER_WORKDAY, abbrev: 'd' };
  }

  // Use preset's recommended unit
  switch (preset.displayUnit) {
    case 'hours': return { divisor: TICKS_PER_HOUR, abbrev: 'hr' };
    case 'days': return { divisor: TICKS_PER_WORKDAY, abbrev: 'd' };
    case 'weeks': return { divisor: TICKS_PER_WEEK, abbrev: 'wk' };
    default: return { divisor: 1, abbrev: 'min' };
  }
};
```

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Pause/Resume | Continues from current tickCount, progress preserved |
| Reset | tickCount=0, progress=0, duration settings preserved |
| Change duration mid-sim | Recalculate progress, auto-stop if already past new target |
| Speed change | Takes effect on next interval cycle |
| Max speed performance | Batch ticks, use requestAnimationFrame |

---

## Verification Checklist

- [ ] Duration presets auto-stop at correct tick count
- [ ] Speed presets achieve expected ticks/second rate
- [ ] Progress bar accurately reflects simulation progress
- [ ] KPIs display in appropriate time units for selected duration
- [ ] Pause/Resume maintains correct state
- [ ] Reset clears progress but preserves duration config
- [ ] Max speed mode performs well without UI freezing

---

## UI Mockup (Controls Bar)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ [▶ Run] [⏸] [↺] │ Duration: [1 Day ▼] │ [0.1x][1x][10x][60x][Max] │ ████████░░ 80% │ 6h 24m / 8h │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Notes

- The existing `tickSpeed` (ms per tick) will be replaced with `ticksPerSecond` for more intuitive control
- All existing KPI calculations remain unchanged - they work in ticks internally
- Only the display formatting changes based on duration scale
- The `timeUnit` setting in SettingsModal may become redundant or could be kept for manual override

---

*Plan created: 2026-01-27*
