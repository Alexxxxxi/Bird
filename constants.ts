
import { CustomBirdConfig } from './types';

export const SPECIES_CONFIG = {
  sparrow: { body: '#795548', belly: '#D7CCC8', wing: '#4E342E', beak: '#FFD54F' }
};

export const ASSET_LIBRARY = [
  { 
    id: 'phoenix-sprite', 
    url: 'https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/_1-ezgif.com-gif-to-sprite-converter.png', 
    label: 'Flying Phoenix Sprite' 
  }
];

export const PRESET_BIRDS: CustomBirdConfig[] = [
  {
    id: 'spirit-phoenix',
    name: 'Spirit Phoenix',
    category: 'butterfly', // 关键：设置为 butterfly 以便 HandAR 调用 Butterfly 类
    mainAsset: ASSET_LIBRARY[0].url,
    globalScale: 1.5,
    globalRotation: 0,
    globalX: 0,
    globalY: 0,
    flapAmplitude: 1.0,
    baseSize: 100, // 稍微调低基础值，配合代码中的 0.8 乘积
    sizeRange: 0.1,
    isSpriteSheet: true, 
    frameCount: 25,      
    frameRate: 24        
  }
];
