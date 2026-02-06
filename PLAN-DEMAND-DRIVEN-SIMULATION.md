# Demand-Driven Simulation & End-to-End Reporting Plan

## Summary
Add a demand-driven input mode so users can specify **exact demand per hour/day/week/month** and run a bounded simulation that **guarantees the requested arrivals** over the selected period. This enables executive-ready scenarios like “1000 coffees per week” and produces a clear end-of-period report (arrivals vs completions vs backlog).

This plan intentionally keeps **transit visual-only** and **VSM metrics completion-based** (default window = 50 completions).

---

## Goals
- Allow users to set **target demand** per hour/day/week/month.
- Ensure the simulator **generates exactly that many arrivals** by the end of the period.
- Provide a **clear end-of-period report** showing demand met vs capacity.
- Keep VSM metrics consistent, stable, and trustworthy.

## Non‑Goals (for now)
- Demand profiles (hourly peaks, day-of-week curves) — planned backlog.
- Advanced staffing schedules or shift calendars beyond the current working-hours model.
- Detailed cost/financial modeling.

---

## Key Decisions (Current Defaults)
- **Time model**: 1 tick = 1 simulated minute.
- **Working time**: 8‑hour workday, 5‑day week, 22 workdays/month (matches existing duration presets). ✅
- **Working hours per node**: each process/start/end node can define hours/day and days/week; processing + demand only occur during open hours. ✅
- **Demand mode**: deterministic arrivals using a fractional accumulator (exact totals).
- **Demand routing**: demand is **configured per start node** (not evenly split). ✅
- **VSM**: lead = active + waiting; transit excluded; completion‑window metrics (default 50).

---

## Functional Requirements

### 1) Demand Mode
Users can choose:
- **Demand rate unit**: per hour / per day / per week / per month
- **Target demand value** (integer)
- **Duration preset** aligned to demand unit (e.g., week = 2400 ticks)
- **Start node demand targets** (configured per start node)

### 2) Exact Arrival Generation
Guarantee exactly N arrivals over the chosen period.

Algorithm (per start node, across **open ticks only**):
```
openTicks = total open ticks in the period (based on node working hours)
ratePerTick = targetDemand / openTicks
if (node is open this tick):
  accumulator += ratePerTick
  spawn = floor(accumulator)
  accumulator -= spawn
```
On the **final open tick**, spawn any remainder needed to hit the target.

### 3) End‑of‑Period Report
At auto‑stop (or manual stop), generate:
- Target arrivals
- Actual arrivals generated
- Completed items
- Backlog at end
- Avg lead time (completion window)
- Avg WIP and peak WIP
- Bottleneck node(s)
- Throughput for the period: completed / elapsed simulated time

---

## Data Model Changes (types.ts)

Add a demand config object:
```
demandMode: 'auto' | 'target'
demandTarget: number
demandUnit: 'hour' | 'day' | 'week' | 'month'
demandTotalTicks: number
demandRemainder: number
demandArrivalsGenerated: number
demandStartNodeWeights: Record<nodeId, number>
```

Add per-node working hours:
```
workingHours: {
  enabled: boolean
  hoursPerDay: number // 0-8
  daysPerWeek: number // 0-5
}
```

Persist in:
- LocalStorage save/load
- IndexedDB canvas save/load

---

## Simulation Engine Changes (store.ts)

1) **Inject Demand Mode**:
- When `demandMode === 'target'`, ignore interval-based auto-injection.
- Generate arrivals via accumulator each tick.
- Distribute arrivals across start nodes (equal split, or weights if provided).

2) **Counters**:
- Track `demandArrivalsGenerated` and ensure it equals `demandTarget` by end.

3) **Auto‑Stop**:
- Stop at `targetDuration` (already exists) and trigger report generation.

---

## UI Changes

### Controls
- Add **Demand Mode toggle**: Manual vs Target Demand
- Input fields:
  - Target demand value
  - Unit selector (hour/day/week/month)
- Display:
  - Target vs generated arrivals (live)
  - Remaining arrivals to target

### Analytics / Report
- Add “End‑of‑Period Report” panel/modal.
- Include backlog, completions, lead time, WIP peak.

---

## VSM Metrics Impact

**Definitions stay the same**:
- Lead = active + waiting
- VAT = active
- PCE = VAT / lead
- Throughput = completion‑window rate

**What changes**:
- Higher demand increases queueing → lead time rises.
- Closed hours pause processing and waiting time accumulation (metrics are in working time).
- End‑of‑period report becomes the primary “capacity vs demand” narrative.

---

## Tests

1) **Exact demand**:
- 1000/week → exactly 1000 arrivals by end tick.
2) **Distribution**:
- Multiple start nodes split arrivals correctly.
3) **Metrics stability**:
- Lead time unaffected by transit.
4) **Report integrity**:
- Completed + backlog = arrivals.

---

## Rollout Plan

1) Implement data model + persistence.
2) Build demand generator + counters.
3) Add UI controls for demand target.
4) Implement end‑of‑period report.
5) Add tests + update docs.

---

## Open Decisions (if needed)
- Report delivery: modal, dashboard section, or export?
