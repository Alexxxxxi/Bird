
export interface Point {
  x: number;
  y: number;
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface Results {
  multiHandLandmarks: HandLandmark[][];
  multiHandedness: any[];
  image: any;
}

export enum CreatureState {
  SPAWNING,
  FLYING_IN,
  PERCHED,
  FLYING_AWAY,
}

export type CreatureCategory = 'bird' | 'butterfly';

export type Species = 'sparrow' | 'robin' | 'bluejay' | 'goldfinch' | 'cardinal' | 'swan' | 'crow' | 'eagle' | 'owl' | 'parrot' | 'toucan' | string;

export type IdleAction = 'idle' | 'peck' | 'hop' | 'look_back' | 'fluff' | 'flutter' | 'suck';

export interface PartTransform {
  x: number;
  y: number;
  rotate: number;
  scale: number;
}

export interface CustomBirdTransforms {
  head: PartTransform;
  body: PartTransform;
  wingsFront: PartTransform;
  wingsBack: PartTransform;
}

export interface CustomBirdAssets {
  head?: string;
  body?: string;
  wingsFront?: string;
  wingsBack?: string;
}

export interface CustomBirdConfig {
  id: string;
  name: string;
  category: CreatureCategory;
  assets: CustomBirdAssets;
  transforms: CustomBirdTransforms;
  globalScale: number;
  globalRotation: number;
  globalX?: number; // New: Global horizontal offset
  globalY?: number; // New: Global vertical offset
  flapAmplitude: number;
  baseSize: number;
  sizeRange: number;
}

export interface CreatureEntity {
  id: string;
  targetId: string;
  x: number;
  y: number;
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  velocityX: number;
  velocityY: number;
  color: string;
  size: number;
  state: CreatureState;
  perchOffset: number;
  species: Species;
  idleAction: IdleAction;
  actionTimer: number;
  facing: number;
}

export interface PoopEntity {
  id: string;
  targetId: string;
  offset: number;
  scale: number;
  rotation: number;
  seed: number;
  scatterOffset: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
}
