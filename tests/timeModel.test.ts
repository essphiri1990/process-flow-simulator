import { describe, expect, it } from 'vitest';

import {
  computeOpenTicksForPeriod,
  isWorkingTick,
  normalizeWorkingHours,
} from '../timeModel';

describe('timeModel', () => {
  describe('normalizeWorkingHours', () => {
    it('clamps hours per day and days per week into supported bounds', () => {
      expect(normalizeWorkingHours({ enabled: true, hoursPerDay: 12, daysPerWeek: 9 })).toEqual({
        enabled: true,
        hoursPerDay: 8,
        daysPerWeek: 5,
      });
    });
  });

  describe('isWorkingTick', () => {
    it('returns true during configured working time', () => {
      expect(isWorkingTick(120, { enabled: true, hoursPerDay: 8, daysPerWeek: 5 })).toBe(true);
    });

    it('returns false outside configured working time', () => {
      expect(isWorkingTick(300, { enabled: true, hoursPerDay: 4, daysPerWeek: 5 })).toBe(false);
    });
  });

  describe('computeOpenTicksForPeriod', () => {
    it('returns total ticks when working hours are disabled', () => {
      expect(computeOpenTicksForPeriod(120, { enabled: false, hoursPerDay: 8, daysPerWeek: 5 })).toBe(120);
    });

    it('returns open ticks for one simulated week', () => {
      expect(computeOpenTicksForPeriod(2400, { enabled: true, hoursPerDay: 8, daysPerWeek: 5 })).toBe(2400);
    });

    it('caps partial days to configured open hours', () => {
      expect(computeOpenTicksForPeriod(480, { enabled: true, hoursPerDay: 4, daysPerWeek: 5 })).toBe(240);
    });
  });
});
