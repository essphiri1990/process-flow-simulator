import { describe, it, expect, vi } from 'vitest';
import {
  applyVariability,
  getTimeUnitAbbrev,
  getTimeUnitPlural,
  formatTimeValue,
  ItemStatus,
  TIME_UNIT_PRESETS,
  DURATION_PRESETS,
  SPEED_PRESETS,
  TICKS_PER_MINUTE,
  TICKS_PER_HOUR,
  TICKS_PER_WORKDAY,
  TICKS_PER_WEEK,
} from '../types';

describe('applyVariability', () => {
  it('returns base time when variability is 0', () => {
    expect(applyVariability(10, 0)).toBe(10);
  });

  it('returns base time when variability is negative', () => {
    expect(applyVariability(10, -0.5)).toBe(10);
  });

  it('returns base time when base time is 0', () => {
    expect(applyVariability(0, 0.5)).toBe(0);
  });

  it('returns base time when base time is negative', () => {
    expect(applyVariability(-5, 0.5)).toBe(-5);
  });

  it('always returns at least 1 when variability is applied', () => {
    // Run multiple times since it's stochastic
    for (let i = 0; i < 50; i++) {
      const result = applyVariability(1, 1.0);
      expect(result).toBeGreaterThanOrEqual(1);
    }
  });

  it('returns an integer', () => {
    for (let i = 0; i < 20; i++) {
      const result = applyVariability(10, 0.5);
      expect(Number.isInteger(result)).toBe(true);
    }
  });

  it('produces values near the base time on average', () => {
    // With variability 0.5, base 100, results should cluster around 100
    const results: number[] = [];
    // Seed-like approach: run many iterations
    for (let i = 0; i < 500; i++) {
      results.push(applyVariability(100, 0.5));
    }
    const avg = results.reduce((a, b) => a + b, 0) / results.length;
    // Average should be within ~15% of base time
    expect(avg).toBeGreaterThan(85);
    expect(avg).toBeLessThan(115);
  });

  it('produces varied results with high variability', () => {
    const results = new Set<number>();
    for (let i = 0; i < 50; i++) {
      results.add(applyVariability(20, 1.0));
    }
    // With full variability, we expect multiple distinct values
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('getTimeUnitAbbrev', () => {
  it('returns "s" for seconds', () => {
    expect(getTimeUnitAbbrev('seconds')).toBe('s');
  });

  it('returns "min" for minutes', () => {
    expect(getTimeUnitAbbrev('minutes')).toBe('min');
  });

  it('returns "hr" for hours', () => {
    expect(getTimeUnitAbbrev('hours')).toBe('hr');
  });

  it('returns "d" for days', () => {
    expect(getTimeUnitAbbrev('days')).toBe('d');
  });

  it('defaults to "min" for unknown time unit', () => {
    expect(getTimeUnitAbbrev('unknown')).toBe('min');
    expect(getTimeUnitAbbrev('')).toBe('min');
  });
});

describe('getTimeUnitPlural', () => {
  it('returns "seconds" for seconds', () => {
    expect(getTimeUnitPlural('seconds')).toBe('seconds');
  });

  it('returns "minutes" for minutes', () => {
    expect(getTimeUnitPlural('minutes')).toBe('minutes');
  });

  it('returns "hours" for hours', () => {
    expect(getTimeUnitPlural('hours')).toBe('hours');
  });

  it('returns "days" for days', () => {
    expect(getTimeUnitPlural('days')).toBe('days');
  });

  it('defaults to "minutes" for unknown time unit', () => {
    expect(getTimeUnitPlural('unknown')).toBe('minutes');
  });
});

describe('formatTimeValue', () => {
  it('returns raw tick count for minutes (ticksPerUnit = 1)', () => {
    expect(formatTimeValue(120, 'minutes')).toBe('120');
  });

  it('returns raw tick count for seconds (ticksPerUnit = 1)', () => {
    expect(formatTimeValue(45, 'seconds')).toBe('45');
  });

  it('converts ticks to hours (60 ticks per hour)', () => {
    expect(formatTimeValue(120, 'hours')).toBe('2.0');
    expect(formatTimeValue(90, 'hours')).toBe('1.5');
  });

  it('converts ticks to days (480 ticks per workday)', () => {
    expect(formatTimeValue(480, 'days')).toBe('1.0');
    expect(formatTimeValue(240, 'days')).toBe('0.5');
  });

  it('handles 0 ticks', () => {
    expect(formatTimeValue(0, 'hours')).toBe('0.0');
    expect(formatTimeValue(0, 'minutes')).toBe('0');
  });

  it('defaults to raw ticks for unknown time unit', () => {
    expect(formatTimeValue(100, 'unknown')).toBe('100');
  });
});

describe('ItemStatus enum', () => {
  it('has all expected statuses', () => {
    expect(ItemStatus.QUEUED).toBe('QUEUED');
    expect(ItemStatus.PROCESSING).toBe('PROCESSING');
    expect(ItemStatus.TRANSIT).toBe('TRANSIT');
    expect(ItemStatus.COMPLETED).toBe('COMPLETED');
    expect(ItemStatus.FAILED).toBe('FAILED');
  });
});

describe('TIME_UNIT_PRESETS', () => {
  it('has all expected presets', () => {
    expect(TIME_UNIT_PRESETS).toHaveProperty('seconds');
    expect(TIME_UNIT_PRESETS).toHaveProperty('minutes');
    expect(TIME_UNIT_PRESETS).toHaveProperty('hours');
    expect(TIME_UNIT_PRESETS).toHaveProperty('days');
  });

  it('hours preset has 60 ticks per unit', () => {
    expect(TIME_UNIT_PRESETS['hours'].ticksPerUnit).toBe(60);
  });

  it('days preset has 480 ticks per unit (8hr workday)', () => {
    expect(TIME_UNIT_PRESETS['days'].ticksPerUnit).toBe(480);
  });
});

describe('constants', () => {
  it('TICKS_PER_MINUTE is 1', () => {
    expect(TICKS_PER_MINUTE).toBe(1);
  });

  it('TICKS_PER_HOUR is 60', () => {
    expect(TICKS_PER_HOUR).toBe(60);
  });

  it('TICKS_PER_WORKDAY is 480 (8 hours)', () => {
    expect(TICKS_PER_WORKDAY).toBe(480);
  });

  it('TICKS_PER_WEEK is 2400 (5 working days)', () => {
    expect(TICKS_PER_WEEK).toBe(2400);
  });
});

describe('DURATION_PRESETS', () => {
  it('has expected preset keys', () => {
    expect(DURATION_PRESETS).toHaveProperty('1day');
    expect(DURATION_PRESETS).toHaveProperty('1week');
    expect(DURATION_PRESETS).toHaveProperty('1month');
    expect(DURATION_PRESETS).toHaveProperty('3months');
    expect(DURATION_PRESETS).toHaveProperty('12months');
    expect(DURATION_PRESETS).toHaveProperty('unlimited');
  });

  it('1day preset is 480 ticks', () => {
    expect(DURATION_PRESETS['1day'].totalTicks).toBe(480);
  });

  it('unlimited preset has Infinity ticks', () => {
    expect(DURATION_PRESETS['unlimited'].totalTicks).toBe(Infinity);
  });

  it('presets are ordered by increasing duration', () => {
    const ordered = ['1day', '1week', '1month', '3months', '12months'];
    for (let i = 1; i < ordered.length; i++) {
      expect(DURATION_PRESETS[ordered[i]].totalTicks).toBeGreaterThan(
        DURATION_PRESETS[ordered[i - 1]].totalTicks
      );
    }
  });
});

describe('SPEED_PRESETS', () => {
  it('has 5 presets', () => {
    expect(SPEED_PRESETS).toHaveLength(5);
  });

  it('max preset has -1 ticksPerSecond', () => {
    const max = SPEED_PRESETS.find(s => s.key === 'max');
    expect(max).toBeDefined();
    expect(max!.ticksPerSecond).toBe(-1);
  });

  it('1x preset runs at 60 ticks per second', () => {
    const oneX = SPEED_PRESETS.find(s => s.key === '1x');
    expect(oneX).toBeDefined();
    expect(oneX!.ticksPerSecond).toBe(60);
  });
});
