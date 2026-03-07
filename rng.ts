const UINT32_MAX = 0xffffffff;

export const createRandomSeed = (): number => {
  return Math.floor(Math.random() * UINT32_MAX) >>> 0;
};

export const normalizeSeed = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value) >>> 0;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed) >>> 0;
    }
  }

  return Math.trunc(fallback) >>> 0;
};

export const nextMulberry32 = (state: number): { state: number; value: number } => {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let t = nextState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { state: nextState, value };
};
