/**
 * Compute scheduling parameters for driving ticks at a target rate.
 * Keeps the real-time timer frequency reasonable while allowing fractional ticks per interval.
 */
export const computeSchedule = (ticksPerSecond: number) => {
  const target = Math.max(1, ticksPerSecond);
  const baseHz = target >= 60 ? 60 : target; // cap interval frequency at 60 Hz
  const intervalMs = 1000 / baseHz;
  const ticksPerInterval = target / baseHz; // may be fractional; use accumulator in caller
  return { intervalMs, ticksPerInterval, baseHz };
};
