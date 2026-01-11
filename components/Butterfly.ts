import { CreatureEntity, CreatureState, Species, IdleAction, CustomBirdConfig } from '../types';
import { FALLBACK_PHOENIX_BASE64 } from '../constants';

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
    video.setAttribute('data-src', url);
    video.crossOrigin = "anonymous";
    container.appendChild(video);
    video.play().catch(() => {});
    GlobalAssetManager[url] = video;
    return video;
  } else {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    img.setAttribute('data-src', url);
    img.onerror = () => { if (img.src !== FALLBACK_PHOENIX_BASE64) img.src = FALLBACK_PHOENIX_BASE64; };
    container.appendChild(img);
    GlobalAssetManager[url] = img;
    return img;
  }
};

export class Butterfly implements CreatureEntity {
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
  size: number = 10;
  depthScale: number = 1.0;
  state: CreatureState;
  perchOffset: number;
  species: Species;
  idleAction: IdleAction = 'flutter';
  actionTimer: number = 0;
  facing: number = 1;
  variantSeed: number = Math.random();
  opacity: number = 1.0;
  private floatOffset: number = Math.random() * 1000;
  private hopY: number = 0;
  private nextHopTime: number = 0;
  private isHopping: boolean = false;
  private hopProgress: number = 0;
  private screenWidth: number;
  private screenHeight: number;
  customConfig: CustomBirdConfig;

  constructor(
    screenWidth: number, 
    screenHeight: number, 
    targetId: string, 
    forcedOffset: number | undefined,
    config: CustomBirdConfig
  ) {
    this.id = Math.random().toString(36).substr(2, 9);
    this.targetId = targetId;
    this.customConfig = config;
    this.species = config.name;
    this.color = '#FFFFFF';
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    const side = Math.floor(Math.random() * 4);
    const buffer = 300;
    if (side === 0) { this.originX = Math.random() * screenWidth; this.originY = -buffer; }
    else if (side === 1) { this.originX = screenWidth + buffer; this.originY = Math.random() * screenHeight; }
    else if (side === 2) { this.originX = Math.random() * screenWidth; this.originY = screenHeight + buffer; }
    else { this.originX = -buffer; this.originY = Math.random() * screenHeight; }
    this.x = this.originX;
    this.y = this.originY;
    this.targetX = screenWidth / 2;
    this.targetY = screenHeight / 2;
    this.velocityX = 0;
    this.velocityY = 0;
    this.state = CreatureState.FLYING_IN;
    this.perchOffset = forcedOffset !== undefined ? forcedOffset : Math.random();
    this.updateConfig(config);
  }

  updateConfig(config: CustomBirdConfig) {
    this.customConfig = config;
    this.species = config.name;
    const sizeVar = (config.sizeRange || 0.6);
    const randomScale = 0.6 + (this.variantSeed * sizeVar * 1.8); 
    this.size = config.baseSize * (config.globalScale || 1.0) * randomScale * 0.56;
    forceAnimateInDOM(config.mainAsset);
  }

  update(dt: number, perchTarget: { x: number, y: number } | null, siblings?: any[], depthScale: number = 1.0) {
    this.depthScale = depthScale;
    this.actionTimer += dt;
    const smoothFactor = 1.0 - Math.pow(0.001, dt / 1000);
    
    if (this.state === CreatureState.FLYING_IN) {
      this.opacity = 1.0;
      let tx, ty;
      if (perchTarget && this.targetId !== "Searching" && this.targetId !== "none") {
        const swayX = Math.sin(this.actionTimer * 0.003 + this.floatOffset) * 20;
        const swayY = Math.cos(this.actionTimer * 0.002) * 10;
        tx = perchTarget.x + swayX;
        ty = perchTarget.y + swayY;
      } else {
        const t = this.actionTimer * 0.0001;
        tx = this.targetX + Math.sin(t + this.floatOffset) * 350;
        ty = 100 + Math.cos(t) * 40;
      }
      this.velocityX = (tx - this.x) * 0.005;
      this.velocityY = (ty - this.y) * 0.005;
      this.x += this.velocityX;
      this.y += this.velocityY;
      if (perchTarget && Math.abs(tx - this.x) < 12 && this.targetId !== "Searching" && this.targetId !== "none") {
        this.state = CreatureState.PERCHED;
        this.nextHopTime = this.actionTimer + 2000 + Math.random() * 4000;
      }
    } 
    else if (this.state === CreatureState.PERCHED) {
      this.opacity = 1.0;
      
      // Strengthened stability: Anti-teleportation & NaN protection
      let isValidTarget = false;
      if (perchTarget && !isNaN(perchTarget.x) && !isNaN(perchTarget.y)) {
         const distSq = Math.pow(perchTarget.x - this.x, 2) + Math.pow(perchTarget.y - this.y, 2);
         // 25000 (approx 150px) jitter threshold
         if (distSq < 25000 || this.actionTimer < 500) {
            isValidTarget = true;
         }
      }

      if (perchTarget && isValidTarget) {
        this.x = this.x + (perchTarget.x - this.x) * (smoothFactor * 16);
        this.y = this.y + (perchTarget.y - this.y) * (smoothFactor * 16);
      } else {
        // Target lost or detection jumped: stay static
        this.velocityX = 0;
        this.velocityY = 0;
      }
      
      if (!this.isHopping && this.actionTimer > this.nextHopTime) { this.isHopping = true; this.hopProgress = 0; }
      if (this.isHopping) {
        this.hopProgress += dt * 0.006; 
        this.hopY = -Math.abs(Math.sin(this.hopProgress)) * (this.size * this.depthScale * 0.4);
        if (this.hopProgress >= Math.PI) { 
          this.hopY = 0; this.isHopping = false;
          this.nextHopTime = this.actionTimer + 2500 + Math.random() * 5000;
        }
      } else { this.hopY = 0; }
    } 
    else if (this.state === CreatureState.FLYING_AWAY) {
      const centerX = this.screenWidth / 2;
      const centerY = this.screenHeight / 2;
      let angle = Math.atan2(this.y - centerY, this.x - centerX);
      if (angle > 0) angle = -angle;
      const escapeSpeed = 5.6 + Math.random() * 5.6; 
      this.velocityX = Math.cos(angle) * escapeSpeed;
      this.velocityY = Math.sin(angle) * escapeSpeed;
      if (this.velocityY > 0) this.velocityY *= -1;
      this.x += this.velocityX;
      this.y += this.velocityY;
    }
    if (Math.abs(this.velocityX) > 0.05) { this.facing = this.velocityX > 0 ? -1 : 1; }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.customConfig || this.opacity <= 0) return;
    const cfg = this.customConfig;
    const asset = GlobalAssetManager[cfg.mainAsset] || forceAnimateInDOM(cfg.mainAsset);
    
    let isReady = false;
    let iw = 0, ih = 0;
    if (asset instanceof HTMLImageElement) {
      isReady = asset.complete && asset.naturalWidth > 0;
      iw = asset.naturalWidth; ih = asset.naturalHeight;
    } else if (asset instanceof HTMLVideoElement) {
      isReady = asset.readyState >= 2 && asset.videoWidth > 0;
      iw = asset.videoWidth; ih = asset.videoHeight;
    }

    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.translate(this.x, this.y + this.hopY);
    ctx.scale(this.facing, 1);

    const currentSize = this.size * this.depthScale;

    if (this.state === CreatureState.PERCHED) {
      const stretch = Math.abs(this.hopY / currentSize) * 0.3;
      ctx.scale(1.0 - stretch, 1.0 + stretch);
    }

    if (!isReady) {
      ctx.fillStyle = 'rgba(45, 212, 191, 0.1)';
      ctx.beginPath(); ctx.arc(0, 0, currentSize, 0, Math.PI * 2); ctx.fill();
      ctx.restore(); return;
    }

    try {
      if (cfg.isSpriteSheet && cfg.frameCount && cfg.frameCount > 0) {
        const frameWidth = iw / cfg.frameCount;
        const frameHeight = ih;
        // Slower wing beat when perched
        let frameRate = (this.state === CreatureState.PERCHED && !this.isHopping) ? 8 : (cfg.frameRate || 24);
        
        const timeOffset = this.variantSeed * 10000;
        const currentFrame = Math.floor(((this.actionTimer + timeOffset) * frameRate) / 1000) % cfg.frameCount;
        const sx = currentFrame * frameWidth;
        const aspect = frameWidth / frameHeight;
        
        // Butterfly frames are 300x300, aspect 1.
        const drawHeight = currentSize * 2.5; 
        const drawWidth = drawHeight * aspect;

        ctx.translate((cfg.globalX || 0), (cfg.globalY || 0));
        ctx.rotate((cfg.globalRotation || 0) * Math.PI / 180);
        
        ctx.drawImage(asset, sx, 0, frameWidth, frameHeight, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      } else {
        const aspect = iw / ih;
        const drawHeight = currentSize * 2.5;
        const drawWidth = drawHeight * aspect;
        ctx.drawImage(asset, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      }
    } catch (e) {}
    ctx.restore();
  }
}