# Clock & Metrics Alignment Plan (Option 1)

## Objective
Keep a single tick-based time source, fix any over-calling of `tick()`, and ensure the display clock and all VSM metrics (lead time, throughput, VAT/NVAT, PCE, WIP) stay consistent with the same time base at all speeds. The clock is the **timeline**; lead time is **per-item**.

## Invariants
- 1 tick = 1 simulated minute; `tickCount` is the sole timeline driving arrivals, processing, transit, analytics, and display clock (minus transit per policy).
- Transit animation stays unchanged; transit-only ticks are the only ticks excluded from `displayTickCount` when `countTransitInClock=false`.
- UI must remain layout-stable (fixed widths; always-render/hide pattern).

## Tasks & Status
- [x] Stabilize scheduler in `components/Controls.tsx` (fractional batching via accumulator; capped RAF burst with safety limit).
- [x] Guard clock freeze: keep/refine `isTransitOnlyTick` so `displayTickCount` advances whenever work exists.
- [x] Metric audit in `store.ts`: confirm lead time, throughput (completion window, default 50 completions), VAT/NVAT, PCE, WIP all use the single time base and correct components. (now windowed via `computeLeadMetrics`)
- [x] Add debug overlay (dev flag) showing tick stats and key metrics for manual sanity checks.
- [x] Tests: add/extend Vitest coverage for clock, scheduler, throughput window, PCE components, transit-only behavior, policy toggle, capacity-improvement impact.
- [x] Documentation: update “Time Model (Single Source of Truth)” section in `CLAUDE.md` after changes.

## Test Matrix (to implement)
- Lead-time sanity: single-lane, processing=12, interval=1; first completion lead ≈12. Clock should advance consistently but is not required to equal lead time in all scenarios. ✅
- Transit continuity: two-node with transit=10; clock advances every tick; `displayTickCount > tickCount*0.3`; no freezes. ✅
- Arrival-gap resilience: interval=5, processing=20; clock keeps advancing during processing; `displayTickCount === tickCount - cumulativeTransitTicks`. ✅
- Throughput correctness: completions over N ticks; completion-window throughput within tolerance. ✅ (window size is configurable; 50 is the default)
- PCE components: known processing/waiting/transit durations sum to lead; PCE matches manual ratio. ✅
- Scheduler accuracy: simulate timers for `ticksPerSecond` {6,60,120,600} and RAF path; total `tick()` calls per real-second window equals target ±1. ✅
- Policy toggle: when `countTransitInClock=true`, `displayTickCount===tickCount`; never negative. ✅
- Regression: history sampling every 5 ticks even at high speeds; WIP counts stable in max-speed mode. ✅

## Notes/Risks
- High `ticksPerSecond` with RAF can still be browser-bound; cap batches to avoid UI starvation.
- Debug overlays must respect layout stability rules.
- Keep memory cleanup of finished items untouched to avoid analytics drift.
