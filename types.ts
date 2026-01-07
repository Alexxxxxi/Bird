
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

export type Species = string;

export type IdleAction = 'idle' | 'peck' | 'hop' | 'look_back' | 'fluff' | 'flutter' | 'suck';

export interface CustomBirdConfig {
  id: string;
  name: string;
  category: CreatureCategory;
  mainAsset: string; 
  globalScale: number;
  globalRotation: number;
  globalX?: number;
  globalY?: number;
  flapAmplitude: number;
  baseSize: number;
  sizeRange: number;
  // Sprite Sheet Configuration
  isSpriteSheet?: boolean;
  frameCount?: number;
  frameRate?: number;
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

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
}
