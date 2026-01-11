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
    img.onerror = () => {
      if (img.src !== FALLBACK_PHOENIX_BASE64) {
        img.src = FALLBACK_PHOENIX_BASE64;
      }
    };
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
  velocityY: number = 0;
  velocityX: number = 0;
  color: string;
  size: number = 20;
  depthScale: number = 1.0;
  state: CreatureState;
  perchOffset: number;
  species: Species;
  customConfig?: CustomBirdConfig;
  idleAction: IdleAction = 'idle';
  actionTimer: number = 0;
  variantSeed: number;
  facing: number = 1;
  opacity: number = 1.0;
  private hopY: number = 0;
  private isHopping: boolean = false;
  private hopProgress: number = 0;
  private nextHopTime: number = 0;
  private screenWidth: number;
  private screenHeight: number;

  // Leaf drop callback
  onLeafDrop: (x: number, y: number, targetId: string, scale: number) => void;
  leafTimer: number = 0;
  leafCount: number = 0;
  nextLeafTime: number = 1000 + Math.random() * 1000;

  constructor(
    screenWidth: number, 
    screenHeight: number, 
    targetId: string, 
    onLeafDrop: (x: number, y: number, targetId: string, scale: number) => void,
    forcedOffset?: number,
    customConfigs?: CustomBirdConfig[]
  ) {
    this.id = Math.random().toString(36).substr(2, 9);
    this.targetId = targetId;
    this.onLeafDrop = onLeafDrop;
    this.variantSeed = Math.random();
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    const side = Math.floor(Math.random() * 3); 
    const buffer = 400;
    if (side === 0) { this.originX = Math.random() * screenWidth; this.originY = -buffer; }
    else if (side === 1) { this.originX = -buffer; this.originY = Math.random() * screenHeight * 0.4; }
    else { this.originX = screenWidth + buffer; this.originY = Math.random() * screenHeight * 0.4; }
    this.x = this.originX;
    this.y = this.originY;
    this.targetX = screenWidth / 2;
    this.targetY = screenHeight / 2;
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
    if (cfg.standingAsset) {
      forceAnimateInDOM(cfg.standingAsset);
    }
    const sizeVar = (cfg.sizeRange || 0.6);
    const randomScale = 0.7 + (this.variantSeed * sizeVar * 1.5); 
    this.size = cfg.baseSize * (cfg.globalScale || 1.0) * randomScale * 0.56;
  }

  update(dt: number, perchTarget: { x: number, y: number } | null, siblings?: Bird[], depthScale: number = 1.0) {
    this.depthScale = depthScale;
    this.actionTimer += dt;
    const smoothFactor = 1.0 - Math.pow(0.001, dt / 1000);

    if (this.state === CreatureState.FLYING_IN) {
      this.opacity = 1.0;
      let tx, ty;
      if (perchTarget && this.targetId !== "Searching" && this.targetId !== "none") {
        const swayX = Math.sin(this.actionTimer * 0.002 + this.variantSeed * 10) * 15;
        const swayY = Math.cos(this.actionTimer * 0.0015) * 8;
        tx = perchTarget.x + swayX;
        ty = perchTarget.y - (this.size * this.depthScale * 0.3) + swayY;
      } else {
        const t = this.actionTimer * 0.00015;
        tx = this.targetX + Math.sin(t + this.variantSeed * 10) * 300;
        ty = 150 + Math.cos(t * 0.8) * 50; 
      }
      const dx = tx - this.x, dy = ty - this.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const speed = Math.min(0.0006 * dist, 0.08) * dt; 
      const angle = Math.atan2(dy, dx);
      this.velocityX = Math.cos(angle) * speed;
      this.velocityY = Math.sin(angle) * speed;
      this.x += this.velocityX;
      this.y += this.velocityY;
      if (perchTarget && dist < 12 && this.targetId !== "Searching" && this.targetId !== "none") {
        this.state = CreatureState.PERCHED;
        this.nextHopTime = this.actionTimer + 1500 + Math.random() * 3000;
      }
    } 
    else if (this.state === CreatureState.PERCHED) {
      this.opacity = 1.0;
      let shouldFollow = false;
      if (perchTarget && !isNaN(perchTarget.x) && !isNaN(perchTarget.y)) {
         const distSq = Math.pow(perchTarget.x - this.x, 2) + Math.pow(perchTarget.y - this.y, 2);
         if (distSq < 250000) { 
            shouldFollow = true;
         }
      }

      if (shouldFollow && perchTarget) {
        const targetY = perchTarget.y - (this.size * this.depthScale * 0.35);
        const followFactor = Math.min(smoothFactor * 16, 0.8);
        this.x = this.x + (perchTarget.x - this.x) * followFactor;
        this.y = this.y + (targetY - this.y) * followFactor;

        // Leaf generation logic delegated to callback
        if (this.leafCount < 3) {
            this.leafTimer += dt;
            if (this.leafTimer > this.nextLeafTime) {
                this.onLeafDrop(
                    this.x, 
                    this.y + (this.size * this.depthScale * 0.4), 
                    this.targetId,
                    this.depthScale
                );
                this.leafCount++;
                this.leafTimer = 0;
                this.nextLeafTime = 1000 + Math.random() * 1000;
            }
        }
      } else {
        this.velocityX = 0;
        this.velocityY = 0;
      }
      
      if (!this.isHopping && this.actionTimer > this.nextHopTime) {
        this.isHopping = true;
        this.hopProgress = 0;
      }
      if (this.isHopping) {
        this.hopProgress += dt * 0.008;
        this.hopY = -Math.abs(Math.sin(this.hopProgress)) * (this.size * this.depthScale * 0.4);
        if (this.hopProgress >= Math.PI) { 
          this.hopY = 0;
          this.isHopping = false;
          this.nextHopTime = this.actionTimer + 2000 + Math.random() * 4000;
        }
      } else { this.hopY = 0; }
    } 
    else if (this.state === CreatureState.FLYING_AWAY) {
      const currentSpeed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);
      if (currentSpeed < 5) {
        const centerX = this.screenWidth / 2;
        const centerY = this.screenHeight / 2;
        let angle = Math.atan2(this.y - centerY, this.x - centerX);
        if (angle > 0) angle = -angle;
        const escapeSpeed = 5.6 + Math.random() * 5.6; 
        this.velocityX = Math.cos(angle) * escapeSpeed;
        this.velocityY = Math.sin(angle) * escapeSpeed;
        if (this.velocityY > 0) this.velocityY *= -1;
      }
      this.x += this.velocityX;
      this.y += this.velocityY;
    }
    if (Math.abs(this.velocityX) > 0.05) { this.facing = this.velocityX > 0 ? -1 : 1; }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.customConfig || this.opacity <= 0) return;
    const cfg = this.customConfig;

    const isPerched = this.state === CreatureState.PERCHED;
    const isUsingStanding = !!(isPerched && cfg.standingAsset);
    const currentAssetUrl = isUsingStanding ? cfg.standingAsset! : cfg.mainAsset;
    const asset = GlobalAssetManager[currentAssetUrl] || forceAnimateInDOM(currentAssetUrl);

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

    if (isPerched) {
      const stretch = Math.abs(this.hopY / currentSize) * 0.4;
      ctx.scale(1.0 - stretch, 1.0 + stretch);
    }

    if (!isReady) {
      ctx.fillStyle = 'rgba(45, 212, 191, 0.1)';
      ctx.beginPath(); ctx.roundRect(-currentSize, -currentSize, currentSize * 2, currentSize * 2, 12); ctx.fill();
      ctx.restore(); return;
    }

    try {
      if (cfg.isSpriteSheet) {
        const currentFrameCount = isUsingStanding ? (cfg.standingFrameCount || 39) : (cfg.frameCount || 1);
        const frameWidth = iw / currentFrameCount;
        const frameHeight = ih;
        
        let frameRate = cfg.frameRate || 24;
        if (isPerched && !this.isHopping) {
          if (isUsingStanding) {
            frameRate *= 0.7;
          } else {
            frameRate = 4;
          }
        }
        
        const timeOffset = this.variantSeed * 10000; 
        const currentFrame = Math.floor(((this.actionTimer + timeOffset) * frameRate) / 1000) % currentFrameCount;
        const sx = currentFrame * frameWidth;
        const aspect = frameWidth / frameHeight;
        const drawHeight = currentSize * 2.2; 
        const drawWidth = drawHeight * aspect;
        
        ctx.translate((cfg.globalX || 0), (cfg.globalY || 0));
        ctx.rotate((cfg.globalRotation || 0) * Math.PI / 180);
        ctx.drawImage(asset, sx, 0, frameWidth, frameHeight, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      } else {
        const aspect = iw / ih;
        const drawHeight = currentSize * 2.2; 
        const drawWidth = drawHeight * aspect;
        ctx.drawImage(asset, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      }
    } catch (e) {}
    ctx.restore();
  }
}