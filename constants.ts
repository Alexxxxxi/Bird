
import { CustomBirdConfig, PartTransform } from './types';

export const SPECIES_CONFIG = {
  sparrow: { body: '#795548', belly: '#D7CCC8', wing: '#4E342E', beak: '#FFD54F', type: 'round', tail: 'short' },
  robin: { body: '#4E342E', belly: '#FF5722', wing: '#3E2723', beak: '#FFEB3B', type: 'round', tail: 'medium' }
};

const defaultPart = (): PartTransform => ({ x: 0, y: 0, rotate: 0, scale: 1 });

export const FIXED_ASSET_URLS = [
  'https://www.imgur.la/images/2026/01/07/-1.png',
  'https://www.imgur.la/images/2026/01/07/-5.png',
  'https://www.imgur.la/images/2026/01/07/-5-1.png'
];

export const PRESET_BIRDS: CustomBirdConfig[] = [
  {
    id: 'spirit-prime',
    name: 'Spirit Phoenix',
    assets: {
      body: FIXED_ASSET_URLS[0],
      wingsFront: FIXED_ASSET_URLS[1],
      wingsBack: FIXED_ASSET_URLS[1],
      head: FIXED_ASSET_URLS[2]
    },
    transforms: {
      head: { x: 8, y: -12, rotate: 0, scale: 0.8 },
      body: defaultPart(),
      wingsFront: { x: -4, y: -15, rotate: -15, scale: 1.2 },
      wingsBack: { x: -12, y: -8, rotate: -10, scale: 1.2 }
    },
    globalScale: 1.2,
    globalRotation: 0,
    flapAmplitude: 1.0,
    baseSize: 35,
    sizeRange: 0.1
  }
];

export const STILLNESS_THRESHOLD = 0.01; 
export const STILLNESS_DURATION_MS = 2000; 
export const SHAKE_THRESHOLD = 0.06; 
export const CLEAN_THRESHOLD = 0.15;
export const FIST_THRESHOLD = 0.1;
