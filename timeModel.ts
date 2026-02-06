// Single source of truth for simulation time math.
// 1 tick = 1 simulated minute.
// Transit animation can be decoupled from what the user-facing clock displays.

import {
  DEFAULT_WORKING_HOURS,
  TICKS_PER_MINUTE,
  TICKS_PER_HOUR,
  TICKS_PER_WORKDAY,
  TICKS_PER_WEEK,
  WorkingHoursConfig,
} from './types';

export interface ClockPolicy {
  /** If true, the user-facing clock includes transit ticks; if false, it excludes them. */
  countTransitInClock: boolean;
}

export const DEFAULT_CLOCK_POLICY: ClockPolicy = {
  countTransitInClock: false,
};

const clampNumber = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

export const normalizeWorkingHours = (config?: WorkingHoursConfig): WorkingHoursConfig => {
  const merged = { ...DEFAULT_WORKING_HOURS, ...(config || {}) };
  return {
    enabled: merged.enabled,
    hoursPerDay: clampNumber(Math.round(merged.hoursPerDay), 0, 8),
    daysPerWeek: clampNumber(Math.round(merged.daysPerWeek), 0, 5),
  };
};

export const isWorkingTick = (tickCount: number, config?: WorkingHoursConfig): boolean => {
  if (!config || !config.enabled) return true;
  const working = normalizeWorkingHours(config);
  if (working.hoursPerDay <= 0 || working.daysPerWeek <= 0) return false;

  const tickInWeek = ((tickCount % TICKS_PER_WEEK) + TICKS_PER_WEEK) % TICKS_PER_WEEK;
  const dayIndex = Math.floor(tickInWeek / TICKS_PER_WORKDAY);
  if (dayIndex >= working.daysPerWeek) return false;

  const minuteInDay = tickInWeek % TICKS_PER_WORKDAY;
  const openTicksPerDay = working.hoursPerDay * TICKS_PER_HOUR;
  return minuteInDay < openTicksPerDay;
};

export const computeOpenTicksForPeriod = (totalTicks: number, config?: WorkingHoursConfig): number => {
  const safeTotal = Math.max(0, Math.round(totalTicks));
  if (safeTotal === 0) return 0;
  if (!config || !config.enabled) return safeTotal;

  const working = normalizeWorkingHours(config);
  if (working.hoursPerDay <= 0 || working.daysPerWeek <= 0) return 0;

  const openTicksPerDay = working.hoursPerDay * TICKS_PER_HOUR;
  const openTicksPerWeek = openTicksPerDay * working.daysPerWeek;

  const fullWeeks = Math.floor(safeTotal / TICKS_PER_WEEK);
  let openTicks = fullWeeks * openTicksPerWeek;

  const remainder = safeTotal % TICKS_PER_WEEK;
  const fullDays = Math.floor(remainder / TICKS_PER_WORKDAY);
  for (let day = 0; day < fullDays; day++) {
    if (day < working.daysPerWeek) openTicks += openTicksPerDay;
  }

  const partialDayTicks = remainder % TICKS_PER_WORKDAY;
  if (partialDayTicks > 0 && fullDays < working.daysPerWeek) {
    openTicks += Math.min(openTicksPerDay, partialDayTicks);
  }

  return Math.min(openTicks, safeTotal);
};

/**
 * Compute the auto transit duration (in ticks) between two nodes based on Manhattan distance.
 * If a custom transit time is provided, it is used instead.
 * Keeps the original visual pacing (5–30 ticks) so multiple items can be seen in transit.
 */
export const computeTransitDuration = (distance: number, customTransitTime?: number): number => {
  if (customTransitTime !== undefined && customTransitTime > 0) return customTransitTime;
  return Math.max(5, Math.min(30, Math.round(distance / 25)));
};

/**
 * Update the display clock based on policy.
 * tickCount is total simulation ticks.
 * cumulativeTransitTicks is the total ticks items have spent in transit so far.
 */
export const computeDisplayTickCount = (
  tickCount: number,
  cumulativeTransitTicks: number,
  policy: ClockPolicy
): number => {
  if (policy.countTransitInClock) return tickCount;
  return Math.max(0, tickCount - cumulativeTransitTicks);
};

// Convenience exports for consumers that need the unit constants in one place.
export {
  TICKS_PER_MINUTE,
  TICKS_PER_HOUR,
  TICKS_PER_WORKDAY,
  TICKS_PER_WEEK
};
