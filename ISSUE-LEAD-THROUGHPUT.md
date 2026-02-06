# Lead Time, Throughput & Demand Integrity – Evolved Problem & Plan

## Summary
The original issue was **lead/throughput trust** (metrics looked wrong after config changes). That has been mitigated with completion‑window metrics and reset semantics. The issue has now **evolved**: the **clock is not sufficient** for the primary use case, which is **demand‑driven simulation over a fixed period** (e.g., “1000 coffees per week” or “100 per day”). The system needs to generate **exact demand over a period**, not just run a clock.

## Initial Observations (from screenshot)
- Sim clock: 1h 37m (excl. transit).
- Lead: 8m (single completed item).
- Throughput: 1.0 items/hour.
- WIP: 32.
- Nodes show processed counts (26/20/13) despite empty queues and 1 completion at END node.
- Speed: 0.1x (6 ticks/sec). Auto feed on; arrival every 2 min (interval=2 ticks) from the start node.

Why this feels wrong:
- Throughput 1.0/h with only 1 completion over ~97 simulated minutes implies an actual rate ~0.6/h (1/1.62h).
- WIP 32 with empty queues suggests items exist in transit or stale state; UI doesn’t surface where they are.
- Lead is per-item (8m) but clock is system elapsed (97m); without sample size and freshness, it’s unclear if the number is representative.

## Root Causes Identified (original)
1) Metrics averaged over all retained completions (up to 200) → slow to reflect configuration changes; early slow items skew results upward.
2) No reset of metrics when node configs change (processing time/resources/interval) → stale history contaminates new runs.
3) Throughput is a 60-tick rolling window, but lead/VAT/PCE were lifetime averages → mixed window semantics caused mismatched signals.
4) UI lacks sample size and recent-item detail → users can’t judge freshness or spot outliers.
5) WIP count can include items in transit or stuck; queues shown empty create a perception gap.

## Changes Implemented (mitigations to original issue)
- Lead/PCE now use a **completion-based rolling window** aligned with throughput (default 50 completions) and applied across Controls, VSMStats, AnalyticsDashboard, and DebugOverlay.
- Added a **metrics window selector** (10/25/50/100 completions) so users can trade off responsiveness vs. stability.
- Throughput now uses **effective completion time** (spawn + active + waiting), so transit is visual-only and excluded from metrics.
- Introduced **metrics epoch resets** on processing/capacity/quality/variability/routing/arrival changes; pre-change items are excluded from metrics (auto-warm).
- UI now shows **sample size + window label** and **low-sample styling** (n < 5) to reduce misinterpretation.
- Added **WIP breakdown** (queued/processing/transit/stuck) to explain WIP vs. empty queues.
- DebugOverlay continues to show sample size and last completed items for sanity checks.
- Added regression test for metrics reset on config change; existing throughput and lead-window tests still pass.

## Remaining Risks / Gaps (original)
- Auto-feed toggles and speed changes do not reset metrics (by design); convergence still depends on new completions.
- Non-dev “Diagnostics” drawer is still optional; DebugOverlay remains dev-only.
- Sandbox test runs emit harmless Vite WebSocket bind warnings (noise).

## Why This Is Critical (Top Priority)
- **Trust & adoption:** If lead/throughput are perceived as wrong, users won’t trust any analytics, making the simulator ineffective for decision support.
- **Core value prop:** Accurate cycle/lead/PCE and throughput are the product’s main promise; visual polish cannot offset bad numbers.
- **Compounding confusion:** Mixed windows (lifetime vs rolling), hidden sample sizes, and WIP/queue mismatches create contradictory signals that block user learning.
- **Testing & demos:** Demo sessions hinge on credible metrics; a single visible mismatch (like 1 completion with 1.0/h throughput over 97m) undermines credibility immediately.
- **Roadmap dependency:** Planned real-time and duration presets rely on sound time/metrics foundations; shipping new features on shaky metrics increases rework risk.

## New Requirements (evolved issue)
1) **Demand‑driven input**: user specifies demand per hour/day/week/month.
2) **Exact arrivals**: running a week must generate exactly the requested demand (not approximate).
3) **Working hours model**: demand is defined over 8‑hour days, 5‑day weeks, 22‑day months.
4) **Per‑node working hours**: each node can set hours/day and days/week; processing + demand only occur while open.
5) **Per‑node demand targets**: demand is configured per start node (not evenly split).
6) **End‑of‑period report**: arrivals vs completions vs backlog for exec reporting.
7) **Clock = timeline, not demand**: the clock is useful only if demand is tied to time.

## Recommended Next Actions (comprehensive plan)
See `process-flow-simulator/PLAN-DEMAND-DRIVEN-SIMULATION.md` for the full plan. Summary:
1) Add **Demand Mode** (target demand per hour/day/week/month).
2) Implement **deterministic arrivals** via fractional accumulator to guarantee totals.
3) Add **end‑of‑period report** with arrivals/completions/backlog.
4) Keep VSM definitions stable (lead = active + waiting; transit excluded).

## Repro/Validation Scenarios
- Single-lane, processing=12→3, resources=1→4, arrival=1: lead should fall within ~30–50 completions; throughput should rise toward arrival-limited rate.
- Multi-stage with transit=10: ensure display clock advances; WIP breakdown matches visible queues + transit.
- Low-sample edge: with 1–3 completions, UI should indicate low confidence.

## Definition of “Reliable” Metrics Going Forward
- Lead/PCE and throughput share the same **completion-based window**, with the window size clearly displayed.
- Transit is excluded from lead/PCE/throughput (visual only).
- Metrics reset on configuration changes and warm up on new items (no stale history).
- WIP is decomposed into queue/processing/transit/stuck counts.
- Numbers update within a bounded convergence period (window-size dependent) after major config changes.

## Definition of “Reliable” Demand Simulation Going Forward
- A week/day/hour run generates **exactly** the target arrivals.
- End‑of‑period report shows **Arrivals = Completed + Backlog**.
- Demand is decoupled from clock speed; speed affects runtime only, not totals.
