
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

export enum BirdState {
  SPAWNING,
  FLYING_IN,
  PERCHED,
  FLYING_AWAY,
}

export type Species = 'sparrow' | 'robin' | 'bluejay' | 'goldfinch' | 'cardinal' | 'swan' | 'crow' | 'eagle' | 'owl' | 'parrot' | 'toucan' | string;

export type IdleAction = 'idle' | 'peck' | 'hop' | 'look_back' | 'fluff';

export interface CustomBirdAssets {
  head?: string; // base64
  body?: string;
  wings?: string;
  legs?: string;
}

export interface CustomBirdConfig {
  id: string;
  name: string;
  assets: CustomBirdAssets;
}

export interface BirdEntity {
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
  wingSpan: number;
  flapSpeed: number;
  flapPhase: number;
  state: BirdState;
  perchOffset: number;
  species: Species;
  idleAction: IdleAction;
  actionTimer: number;
  facing: number;
  customConfig?: CustomBirdConfig;
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
