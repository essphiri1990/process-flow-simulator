import { describe, it, expect } from 'vitest';
import { computeSchedule } from '../scheduler';

const simulateOneSecondTicks = (ticksPerSecond: number) => {
  const { ticksPerInterval, baseHz } = computeSchedule(ticksPerSecond);
  let accumulator = 0;
  let totalTicks = 0;
  for (let i = 0; i < baseHz; i++) {
    accumulator += ticksPerInterval;
    const ticksNow = Math.floor(accumulator);
    if (ticksNow > 0) {
      accumulator -= ticksNow;
      totalTicks += ticksNow;
    }
  }
  return totalTicks;
};

describe('computeSchedule', () => {
  it('delivers exact target ticks/sec for sub-60 rates', () => {
    expect(simulateOneSecondTicks(6)).toBe(6);
    expect(simulateOneSecondTicks(30)).toBe(30);
  });

  it('preserves target ticks/sec for 60–120 range using batching', () => {
    expect(simulateOneSecondTicks(60)).toBe(60);
    expect(simulateOneSecondTicks(90)).toBe(90);
    expect(simulateOneSecondTicks(120)).toBe(120);
  });

  it('handles high rates with batching at 60 Hz base', () => {
    expect(simulateOneSecondTicks(600)).toBe(600);
  });

  it('never schedules less than 1 tick per second', () => {
    expect(simulateOneSecondTicks(0.1)).toBe(1);
    expect(simulateOneSecondTicks(-5)).toBe(1);
  });
});
