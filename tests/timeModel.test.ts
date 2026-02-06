import { describe, it, expect } from 'vitest';
import { computeTransitDuration, computeDisplayTickCount } from '../timeModel';

describe('timeModel', () => {
  describe('computeTransitDuration', () => {
    it('uses custom transit time when provided', () => {
      expect(computeTransitDuration(999, 12)).toBe(12);
    });

    it('clamps small distances to minimum of 5 ticks', () => {
      expect(computeTransitDuration(50)).toBe(5);
    });

    it('scales distance to ticks (400px -> ~16 ticks)', () => {
      expect(computeTransitDuration(400)).toBe(16);
    });

    it('caps large distances at 30 ticks', () => {
      expect(computeTransitDuration(2000)).toBe(30);
    });
  });

  describe('computeDisplayTickCount', () => {
    it('excludes transit when policy is false', () => {
      const tickCount = 120; // 2 hours
      const cumulativeTransit = 30; // 30 minutes spent in transit
      expect(computeDisplayTickCount(tickCount, cumulativeTransit, { countTransitInClock: false })).toBe(90);
    });

    it('includes transit when policy is true', () => {
      const tickCount = 120;
      const cumulativeTransit = 30;
      expect(computeDisplayTickCount(tickCount, cumulativeTransit, { countTransitInClock: true })).toBe(120);
    });
  });
});
