import { ResourcePoolAvatarId, ResourcePoolColorId } from './types';

export const RESOURCE_POOL_AVATAR_IDS: ResourcePoolAvatarId[] = [
  'orbit',
  'bloom',
  'spark',
  'wave',
  'stack',
  'kite',
  'bot',
  'brain',
];

export const RESOURCE_POOL_COLOR_IDS: ResourcePoolColorId[] = [
  'amber',
  'rose',
  'orange',
  'sky',
  'mint',
  'lilac',
  'blue',
  'orchid',
];

export interface ResourcePoolAvatarPalette {
  label: string;
  panel: string;
  circle: string;
  primary: string;
  accent: string;
}

export interface ResourcePoolColorTheme {
  label: string;
  panel: string;
  tab: string;
  circle: string;
  primary: string;
  accent: string;
}

export const RESOURCE_POOL_AVATAR_PALETTES: Record<ResourcePoolAvatarId, ResourcePoolAvatarPalette> = {
  orbit: {
    label: 'Spiky',
    panel: '#fff2c7',
    circle: '#ffd166',
    primary: '#1f2937',
    accent: '#ff6b6b',
  },
  bloom: {
    label: 'Bun',
    panel: '#ffe5ef',
    circle: '#ff8fab',
    primary: '#1f2937',
    accent: '#f3722c',
  },
  spark: {
    label: 'Glasses',
    panel: '#ffeccf',
    circle: '#f8961e',
    primary: '#1f2937',
    accent: '#577590',
  },
  wave: {
    label: 'Wink',
    panel: '#dff6ff',
    circle: '#4cc9f0',
    primary: '#1f2937',
    accent: '#4361ee',
  },
  stack: {
    label: 'Beanie',
    panel: '#e6fff3',
    circle: '#80ed99',
    primary: '#1f2937',
    accent: '#2d6a4f',
  },
  kite: {
    label: 'Headband',
    panel: '#efe4ff',
    circle: '#b388eb',
    primary: '#1f2937',
    accent: '#ff006e',
  },
  bot: {
    label: 'Robot',
    panel: '#e0f2fe',
    circle: '#7dd3fc',
    primary: '#1f2937',
    accent: '#0284c7',
  },
  brain: {
    label: 'AI',
    panel: '#fae8ff',
    circle: '#e879f9',
    primary: '#1f2937',
    accent: '#7c3aed',
  },
};

export const RESOURCE_POOL_COLOR_THEMES: Record<ResourcePoolColorId, ResourcePoolColorTheme> = {
  amber: {
    label: 'Amber',
    panel: '#fff2c7',
    tab: '#ffe38b',
    circle: '#ffd166',
    primary: '#1f2937',
    accent: '#ff6b6b',
  },
  rose: {
    label: 'Rose',
    panel: '#ffe5ef',
    tab: '#ffbfd3',
    circle: '#ff8fab',
    primary: '#1f2937',
    accent: '#f3722c',
  },
  orange: {
    label: 'Orange',
    panel: '#ffeccf',
    tab: '#ffd39c',
    circle: '#f8961e',
    primary: '#1f2937',
    accent: '#577590',
  },
  sky: {
    label: 'Sky',
    panel: '#dff6ff',
    tab: '#b9edff',
    circle: '#4cc9f0',
    primary: '#1f2937',
    accent: '#4361ee',
  },
  mint: {
    label: 'Mint',
    panel: '#e6fff3',
    tab: '#c8f5d8',
    circle: '#80ed99',
    primary: '#1f2937',
    accent: '#2d6a4f',
  },
  lilac: {
    label: 'Lilac',
    panel: '#efe4ff',
    tab: '#dac2ff',
    circle: '#b388eb',
    primary: '#1f2937',
    accent: '#ff006e',
  },
  blue: {
    label: 'Blue',
    panel: '#e0f2fe',
    tab: '#bae6fd',
    circle: '#7dd3fc',
    primary: '#1f2937',
    accent: '#0284c7',
  },
  orchid: {
    label: 'Orchid',
    panel: '#fae8ff',
    tab: '#f5c8ff',
    circle: '#e879f9',
    primary: '#1f2937',
    accent: '#7c3aed',
  },
};

export const normalizeResourcePoolAvatarId = (
  value: string | undefined,
  index = 0,
  isDefaultPool = false,
): ResourcePoolAvatarId => {
  if (value && RESOURCE_POOL_AVATAR_IDS.includes(value as ResourcePoolAvatarId)) {
    return value as ResourcePoolAvatarId;
  }
  if (isDefaultPool) return 'orbit';
  return RESOURCE_POOL_AVATAR_IDS[(Math.max(0, index) + 1) % RESOURCE_POOL_AVATAR_IDS.length];
};

export const getDefaultResourcePoolAvatarId = (
  index = 0,
  isDefaultPool = false,
): ResourcePoolAvatarId => normalizeResourcePoolAvatarId(undefined, index, isDefaultPool);

export const normalizeResourcePoolColorId = (
  value: string | undefined,
  index = 0,
  isDefaultPool = false,
): ResourcePoolColorId => {
  if (value && RESOURCE_POOL_COLOR_IDS.includes(value as ResourcePoolColorId)) {
    return value as ResourcePoolColorId;
  }
  if (isDefaultPool) return 'amber';
  return RESOURCE_POOL_COLOR_IDS[(Math.max(0, index) + 1) % RESOURCE_POOL_COLOR_IDS.length];
};

export const getDefaultResourcePoolColorId = (
  index = 0,
  isDefaultPool = false,
): ResourcePoolColorId => normalizeResourcePoolColorId(undefined, index, isDefaultPool);
