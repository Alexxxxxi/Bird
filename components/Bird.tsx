
import { CreatureEntity, CreatureState, Species, IdleAction, CustomBirdConfig } from '../types';

const GlobalAssetManager: Record<string, HTMLImageElement | HTMLVideoElement> = {};

const forceAnimateInDOM = (url: string): HTMLImageElement | HTMLVideoElement => {
  if (GlobalAssetManager[url]) return GlobalAssetManager[url];
  const isVideo = /\.(mp4|webm|mov)$/i.test(url);
  let container = document.getElementById('ar-asset-pool');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ar-asset-pool';
    Object.assign(container.style, {
      position: 'fixed', top: '0', left: '0', width: '1px', height: '1px',
      opacity: '0.01', zIndex: '-1', pointerEvents: 'none', overflow: 'hidden'
    });
    document.body.appendChild(container);
  }

  if (isVideo) {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true; video.loop = true; video.autoplay = true;
    video.setAttribute('playsinline', '');
    container.appendChild(video);
    video.play().catch(() => {});
    GlobalAssetManager[url] = video;
    return video;
  } else {
    const img = new Image();
    img.src = url;
    img.crossOrigin = "anonymous";
    container.appendChild(img);
    GlobalAssetManager[url] = img;
    return img;
  }
};

export class Bird implements CreatureEntity {
  id: string;
  targetId: string;
  x: number;
  y: number;
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  velocityY: number;
  velocityX: number;
  color: string;
  size: number = 20;
  state: CreatureState;
  perchOffset: number;
  species: Species;
  customConfig?: CustomBirdConfig;
  
  idleAction: IdleAction = 'idle';
  actionTimer: number = 0;
  variantSeed: number;
  facing: number = 1;

  private hopY: number = 0;
  private landedTime: number = 0;
  private nextHopTime: number = 0;
  private isHopping: boolean = false;
  private hopProgress: number = 0;

  constructor(
    screenWidth: number, 
    screenHeight: number, 
    handPixelWidth: number = 100, 
    targetId: string, 
    forcedOffset?: number,
    customConfigs?: CustomBirdConfig[]
  ) {
    this.id = Math.random().toString(36).substr(2, 9);
    this.targetId = targetId;
    this.variantSeed = Math.random();
    
    const side = Math.floor(Math.random() * 3); 
    const buffer = 400;
    if (side === 0) { this.originX = Math.random() * screenWidth; this.originY = -buffer; }
    else if (side === 1) { this.originX = -buffer; this.originY = Math.random() * screenHeight * 0.4; }
    else { this.originX = screenWidth + buffer; this.originY = Math.random() * screenHeight * 0.4; }

    this.x = this.originX;
    this.y = this.originY;
    this.targetX = screenWidth / 2;
    this.targetY = screenHeight / 2;
    this.velocityX = 0;
    this.velocityY = 0;
    this.state = CreatureState.FLYING_IN;
    this.perchOffset = forcedOffset !== undefined ? forcedOffset : (0.1 + Math.random() * 0.8);

    if (customConfigs && customConfigs.length > 0) {
      this.updateConfig(customConfigs[0]);
    }
  }

  updateConfig(cfg: CustomBirdConfig) {
    this.customConfig = cfg;
    this.species = cfg.name;
    forceAnimateInDOM(cfg.mainAsset);
    const randomScale = 1.0 + (this.variantSeed - 0.5) * 2 * (cfg.sizeRange || 0.2);
    // 基础尺寸全局乘以 0.8 缩小 20%
    const speciesBaseSize = cfg.baseSize * (cfg.globalScale || 1.0) * randomScale * 0.8; 
    
    let targetScale = 1.0;
    if (this.targetId === 'Head') targetScale = 0.75;
    else if (this.targetId === 'Shoulders') targetScale = 0.9;
    this.size = speciesBaseSize * targetScale;
  }

  update(dt: number, perchTarget: { x: number, y: number } | null, siblings?: Bird[]) {
    this.actionTimer += dt;
    const smoothFactor = 1.0 - Math.pow(0.001, dt / 1000);

    if (this.state === CreatureState.FLYING_IN) {
      this.hopY = 0;
      this.isHopping = false;
      let tx, ty;
      if (perchTarget && this.targetId !== "Searching") {
        const swayX = Math.sin(this.actionTimer * 0.002 + this.variantSeed * 10) * 15;
        const swayY = Math.cos(this.actionTimer * 0.0015) * 8;
        tx = perchTarget.x + swayX;
        ty = perchTarget.y - (this.size * 0.3) + swayY;
      } else {
        const t = this.actionTimer * 0.00015;
        tx = this.targetX + Math.sin(t + this.variantSeed * 10) * 300;
        ty = 150 + Math.cos(t * 0.8) * 50; 
      }

      const dx = tx - this.x, dy = ty - this.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const speed = Math.min(0.0018 * dist, 0.25) * dt; 
      const angle = Math.atan2(dy, dx);
      this.velocityX = Math.cos(angle) * speed;
      this.velocityY = Math.sin(angle) * speed;
      this.x += this.velocityX;
      this.y += this.velocityY;

      if (perchTarget && dist < 8 && this.targetId !== "Searching") {
        this.state = CreatureState.PERCHED;
        this.landedTime = this.actionTimer;
        this.nextHopTime = this.actionTimer + 1500 + Math.random() * 3000;
      }
    } 
    else if (this.state === CreatureState.PERCHED && perchTarget) {
      const targetY = perchTarget.y - (this.size * 0.35);
      this.x = this.x + (perchTarget.x - this.x) * (smoothFactor * 16);
      this.y = this.y + (targetY - this.y) * (smoothFactor * 16);
      this.velocityX = 0;

      if (!this.isHopping && this.actionTimer > this.nextHopTime) {
        this.isHopping = true;
        this.hopProgress = 0;
      }

      if (this.isHopping) {
        this.hopProgress += dt * 0.008;
        this.hopY = -Math.abs(Math.sin(this.hopProgress)) * (this.size * 0.4);
        if (this.hopProgress >= Math.PI) { 
          this.hopY = 0;
          this.isHopping = false;
          this.nextHopTime = this.actionTimer + 2000 + Math.random() * 4000;
        }
      } else {
        this.hopY = 0;
      }
    } 
    else if (this.state === CreatureState.PERCHED && (!perchTarget || this.targetId === "Searching")) {
      this.state = CreatureState.FLYING_IN;
    }
    else if (this.state === CreatureState.FLYING_AWAY) {
      this.hopY = 0;
      this.isHopping = false;
      this.velocityY -= 0.15 * dt;
      this.x += this.velocityX * 1.5;
      this.y += this.velocityY;
    }

    if (Math.abs(this.velocityX) > 0.05) {
      this.facing = this.velocityX > 0 ? -1 : 1;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.customConfig) return;
    const asset = GlobalAssetManager[this.customConfig.mainAsset] || forceAnimateInDOM(this.customConfig.mainAsset);
    const isReady = (asset instanceof HTMLImageElement) ? asset.naturalWidth > 0 : (asset as HTMLVideoElement).readyState >= 2;
    if (!isReady) return;

    ctx.save();
    ctx.translate(this.x, this.y + this.hopY);
    ctx.scale(this.facing, 1);

    if (this.state === CreatureState.PERCHED) {
      const stretch = Math.abs(this.hopY / this.size) * 0.4;
      ctx.scale(1.0 - stretch, 1.0 + stretch);
    }

    const cfg = this.customConfig;
    if (cfg.isSpriteSheet && cfg.frameCount) {
      const iw = (asset as HTMLImageElement).naturalWidth;
      const ih = (asset as HTMLImageElement).naturalHeight;
      const frameWidth = iw / cfg.frameCount;
      const frameHeight = ih;
      const frameRate = this.state === CreatureState.PERCHED && !this.isHopping ? 4 : (cfg.frameRate || 24);
      const currentFrame = Math.floor((this.actionTimer * frameRate) / 1000) % cfg.frameCount;
      const sx = currentFrame * frameWidth;
      const aspect = frameWidth / frameHeight;
      const drawHeight = this.size * 2.2; 
      const drawWidth = drawHeight * aspect;
      ctx.translate((cfg.globalX || 0), (cfg.globalY || 0));
      ctx.rotate((cfg.globalRotation || 0) * Math.PI / 180);
      ctx.drawImage(asset, sx, 0, frameWidth, frameHeight, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    } else {
      const iw = (asset instanceof HTMLImageElement) ? asset.naturalWidth : (asset as HTMLVideoElement).videoWidth;
      const ih = (asset instanceof HTMLImageElement) ? asset.naturalHeight : (asset as HTMLVideoElement).videoHeight;
      const aspect = iw / ih;
      const drawHeight = this.size * 2.2; 
      const drawWidth = drawHeight * aspect;
      ctx.drawImage(asset, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    }
    ctx.restore();
  }
}
