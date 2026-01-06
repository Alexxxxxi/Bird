
import { CustomBirdConfig, PartTransform } from './types';

export const SPECIES_CONFIG = {
  sparrow: { body: '#795548', belly: '#D7CCC8', wing: '#4E342E', beak: '#FFD54F', type: 'round', tail: 'short' },
  robin: { body: '#4E342E', belly: '#FF5722', wing: '#3E2723', beak: '#FFEB3B', type: 'round', tail: 'medium' }
};

const defaultPart = (): PartTransform => ({ x: 0, y: 0, rotate: 0, scale: 1 });

const ALL_ASSETS = [
  { id: 'dna-1', url: 'https://pic1.imgdb.cn/item/695d5f3fa9c8408628b86b49.png', label: 'Ethereal Crest' },
  { id: 'dna-2', url: 'https://pic1.imgdb.cn/item/695d5f3fa9c8408628b86b4a.png', label: 'Stellar Crown' },
  { id: 'dna-3', url: 'https://pic1.imgdb.cn/item/695d5f3ea9c8408628b86b48.png', label: 'Bio-Chassis' },
  { id: 'dna-4', url: 'https://pic1.imgdb.cn/item/695d5f32a9c8408628b86b46.png', label: 'Plasma Shell' },
  { id: 'dna-5', url: 'https://pic1.imgdb.cn/item/695d5f32a9c8408628b86b47.png', label: 'Nebula Wing' },
  { id: 'dna-6', url: 'https://pic1.imgdb.cn/item/695d5f31a9c8408628b86b45.png', label: 'Void Wing' }
];

export const ASSET_LIBRARY = {
  heads: ALL_ASSETS,
  bodies: ALL_ASSETS,
  wings: ALL_ASSETS
};

export const FIXED_ASSET_URLS = ALL_ASSETS.map(a => a.url);

export const PRESET_BIRDS: CustomBirdConfig[] = [
  {
    id: 'spirit-prime',
    name: 'Spirit Phoenix',
    category: 'bird',
    assets: {
      head: ALL_ASSETS[0].url,
      body: ALL_ASSETS[2].url,
      wingsFront: ALL_ASSETS[4].url,
      wingsBack: ALL_ASSETS[4].url
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
  },
  {
    id: 'void-butterfly',
    name: 'Void Morpho',
    category: 'butterfly',
    assets: {
      head: ALL_ASSETS[1].url,
      body: ALL_ASSETS[3].url,
      wingsFront: ALL_ASSETS[5].url,
      wingsBack: ALL_ASSETS[5].url
    },
    transforms: {
      head: { x: 0, y: -15, rotate: 0, scale: 0.4 },
      body: { x: 0, y: 0, rotate: 0, scale: 0.5 },
      wingsFront: { x: 5, y: -5, rotate: 10, scale: 1.5 },
      wingsBack: { x: 5, y: 5, rotate: -10, scale: 1.3 }
    },
    globalScale: 1.0,
    globalRotation: 0,
    flapAmplitude: 1.5,
    baseSize: 30,
    sizeRange: 0.2
  }
];
