
import { CreatureEntity, CreatureState, Species, IdleAction, CustomBirdConfig, CustomBirdTransforms } from '../types';
import { SPECIES_CONFIG } from '../constants';

const ImageCache: Record<string, HTMLImageElement> = {};

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
  size: number;
  wingSpan: number;
  flapSpeed: number;
  flapPhase: number;
  state: CreatureState;
  perchOffset: number;
  species: Species;
  customConfig?: CustomBirdConfig;
  
  idleAction: IdleAction = 'idle';
  actionTimer: number = 0;
  blinkTimer: number = 0;
  facing: number = 1;
  variantSeed: number;
  
  flightWobbleOffset: number;
  flightWobbleSpeed: number;
  poopTimer: number;
  justPooped: boolean = false;

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
    
    const side = Math.floor(Math.random() * 3); 
    const buffer = 150;
    if (side === 0) { this.originX = Math.random() * screenWidth; this.originY = -buffer; }
    else if (side === 1) { this.originX = -buffer; this.originY = Math.random() * screenHeight * 0.5; }
    else { this.originX = screenWidth + buffer; this.originY = Math.random() * screenHeight * 0.5; }

    this.x = this.originX;
    this.y = this.originY;
    this.targetX = screenWidth / 2;
    this.targetY = screenHeight / 2;
    this.velocityX = 0;
    this.velocityY = 0;
    
    let speciesBaseSize = 12; 
    let sizeVar = 0.2;

    if (customConfigs && customConfigs.length > 0) {
      const cfg = customConfigs[Math.floor(Math.random() * customConfigs.length)];
      this.customConfig = cfg;
      this.species = cfg.name;
      this.color = '#FFFFFF';
      this.preloadImages(cfg);
      speciesBaseSize = cfg.baseSize * 0.6 * (cfg.globalScale || 1.0); 
      sizeVar = cfg.sizeRange;
    } else {
      this.species = 'sparrow';
      this.color = SPECIES_CONFIG.sparrow.body;
    }
    
    let baseScale = Math.max(handPixelWidth, 30) / 100 * 0.6;
    if (this.targetId === 'Head') baseScale *= 0.5;
    if (this.targetId.includes('Shoulder')) baseScale *= 0.7;

    this.size = speciesBaseSize * baseScale * (1.0 + (Math.random() - 0.5) * 2 * sizeVar);
    this.size = Math.min(Math.max(this.size, 5), 180); 
    
    this.wingSpan = this.size * 2.5;
    this.flapSpeed = (0.12 + Math.random() * 0.1) * (15 / this.size); 
    this.flapPhase = Math.random() * Math.PI * 2;
    this.flightWobbleOffset = Math.random() * 100;
    this.flightWobbleSpeed = 0.05 + Math.random() * 0.05;

    this.state = CreatureState.FLYING_IN;
    this.perchOffset = forcedOffset !== undefined ? forcedOffset : (0.15 + Math.random() * 0.7);

    this.actionTimer = Math.random() * 100;
    this.variantSeed = Math.random();
    this.poopTimer = 240 + Math.random() * 300; 
  }

  private preloadImages(cfg: CustomBirdConfig) {
    const urls = Object.values(cfg.assets).filter(Boolean) as string[];
    urls.forEach(u => {
      if (!ImageCache[u]) {
        ImageCache[u] = new Image();
        ImageCache[u].src = u;
      }
    });
  }

  update(dt: number, perchTarget: { x: number, y: number } | null, siblings?: Bird[]) {
    this.flapPhase += this.flapSpeed;
    this.actionTimer -= 1;
    this.blinkTimer -= 1;
    if (this.blinkTimer < -10) this.blinkTimer = Math.random() * 200 + 100;

    if (this.state === CreatureState.FLYING_IN && perchTarget) {
      const feetOffset = this.size * 1.7; 
      const targetY = perchTarget.y - feetOffset;
      const dx = perchTarget.x - this.x, dy = targetY - this.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const speed = Math.min(0.04 * dist, 12); 
      const angle = Math.atan2(dy, dx);
      this.velocityX = Math.cos(angle) * speed;
      this.velocityY = Math.sin(angle) * speed;
      this.x += this.velocityX;
      this.y += this.velocityY + Math.sin(this.flapPhase) * 2;
      if (dist < 15) this.state = CreatureState.PERCHED;
    } 
    else if (this.state === CreatureState.PERCHED && perchTarget) {
      if (this.actionTimer <= 0) this.pickNewAction();
      this.x = this.x * 0.8 + perchTarget.x * 0.2;
      const targetY = perchTarget.y - this.size * 1.5;
      if (this.idleAction === 'hop' && this.actionTimer > 10) this.velocityY = -2;
      this.y += this.velocityY;
      if (this.y >= targetY) { this.y = targetY; this.velocityY = 0; } 
      else { this.velocityY += 0.5; }
    } 
    else if (this.state === CreatureState.FLYING_AWAY) {
      const dx = this.originX - this.x, dy = this.originY - this.y;
      const angle = Math.atan2(dy, dx);
      this.velocityX += Math.cos(angle) * 0.8;
      this.velocityY += Math.sin(angle) * 0.8;
      this.x += this.velocityX;
      this.y += this.velocityY;
    }
  }

  pickNewAction() {
      const roll = Math.random();
      if (roll < 0.1) { this.idleAction = 'hop'; this.actionTimer = 15; this.velocityY = -4; } 
      else if (roll < 0.3) { this.idleAction = 'peck'; this.actionTimer = 40; } 
      else { this.idleAction = 'idle'; this.actionTimer = 80; }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.customConfig) return;
    ctx.save();
    ctx.translate(this.x, this.y);

    let scaleX = 1;
    if (this.state === CreatureState.PERCHED) scaleX = this.perchOffset < 0.5 ? 1 : -1;
    else scaleX = this.velocityX > 0 ? 1 : -1;
    ctx.scale(scaleX, 1);

    let rotation = 0;
    if (this.idleAction === 'peck') rotation = this.actionTimer > 20 ? (40 - this.actionTimer) * 0.05 : this.actionTimer * 0.05;
    if (this.state !== CreatureState.PERCHED) rotation = Math.min(Math.max(this.velocityY * 0.05, -0.6), 0.6);
    ctx.rotate(rotation);

    this.drawCustom(ctx, rotation, this.customConfig);
    ctx.restore();
  }

  private drawCustom(ctx: CanvasRenderingContext2D, rotation: number, cfg: CustomBirdConfig) {
    const flap = Math.sin(this.flapPhase) * (cfg.flapAmplitude || 1.0);
    const size = this.size;
    const t = cfg.transforms;

    if (cfg.globalRotation) ctx.rotate(cfg.globalRotation * Math.PI / 180);

    const drawP = (u: string | undefined, tr: any, opts: { isWing?: boolean, isBack?: boolean, isHead?: boolean } = {}) => {
      if (!u || !ImageCache[u]) return;
      ctx.save();
      const img = ImageCache[u];
      if (opts.isHead) {
        ctx.translate((size * 0.6) + (tr.x * size * 0.05), (-size * 0.6) + (tr.y * size * 0.05));
        ctx.rotate((tr.rotate * Math.PI / 180) + (this.idleAction === 'peck' ? rotation : 0));
        ctx.drawImage(img, -size * 0.5 * tr.scale, -size * 0.5 * tr.scale, size * tr.scale, size * tr.scale);
      } else if (opts.isWing) {
        const wingY = opts.isBack ? flap * size * 0.4 : -flap * size * 0.8;
        ctx.translate(tr.x * size * 0.05, (tr.y * size * 0.05) + wingY);
        ctx.rotate((tr.rotate + (opts.isBack ? -10 : 15) * flap) * Math.PI / 180);
        if (opts.isBack) { ctx.globalAlpha = 0.6; ctx.filter = 'brightness(70%)'; }
        ctx.drawImage(img, -size * (opts.isBack ? 1.5 : 0.2) * tr.scale, -size * 1.5 * tr.scale, size * 1.5 * tr.scale, size * 1.5 * tr.scale);
      } else {
        ctx.translate(tr.x * size * 0.05, tr.y * size * 0.05);
        ctx.rotate(tr.rotate * Math.PI / 180);
        ctx.drawImage(img, -size, -size, size * 2 * tr.scale, size * 2 * tr.scale);
      }
      ctx.restore();
    };

    drawP(cfg.assets.wingsBack, t.wingsBack, { isWing: true, isBack: true });
    drawP(cfg.assets.body, t.body);
    drawP(cfg.assets.wingsFront, t.wingsFront, { isWing: true });
    drawP(cfg.assets.head, t.head, { isHead: true });
  }

  public static drawCustomPreview(ctx: CanvasRenderingContext2D, cfg: CustomBirdConfig, size: number, flapPhase: number) {
      const t = cfg.transforms;
      const flap = Math.sin(flapPhase) * (cfg.flapAmplitude || 1.0);
      const urls = Object.values(cfg.assets).filter(Boolean) as string[];
      urls.forEach(u => { if(!ImageCache[u]) { ImageCache[u] = new Image(); ImageCache[u].src = u; } });

      ctx.save();
      ctx.translate(ctx.canvas.width/2, ctx.canvas.height/2);
      if (cfg.globalRotation) ctx.rotate(cfg.globalRotation * Math.PI / 180);

      const drawP = (u: string | undefined, tr: any, opts: any = {}) => {
          if (!u || !ImageCache[u]) return;
          const img = ImageCache[u];
          ctx.save();
          if (opts.isHead) {
              ctx.translate((size * 0.6) + (tr.x * size * 0.05), (-size * 0.6) + (tr.y * size * 0.05));
              ctx.rotate(tr.rotate * Math.PI / 180);
              ctx.drawImage(img, -size * 0.5 * tr.scale, -size * 0.5 * tr.scale, size * tr.scale, size * tr.scale);
          } else if (opts.isWing) {
              const wingY = opts.isBack ? flap * size * 0.4 : -flap * size * 0.8;
              ctx.translate(tr.x * size * 0.05, (tr.y * size * 0.05) + wingY);
              ctx.rotate((tr.rotate + (opts.isBack ? -10 : 15) * flap) * Math.PI / 180);
              if (opts.isBack) { ctx.globalAlpha = 0.6; ctx.filter = 'brightness(70%)'; }
              ctx.drawImage(img, -size * (opts.isBack ? 1.5 : 0.2) * tr.scale, -size * 1.5 * tr.scale, size * 1.5 * tr.scale, size * 1.5 * tr.scale);
          } else {
              ctx.translate(tr.x * size * 0.05, tr.y * size * 0.05);
              ctx.rotate(tr.rotate * Math.PI / 180);
              ctx.drawImage(img, -size, -size, size * 2 * tr.scale, size * 2 * tr.scale);
          }
          ctx.restore();
      };

      drawP(cfg.assets.wingsBack, t.wingsBack, { isWing: true, isBack: true });
      drawP(cfg.assets.body, t.body);
      drawP(cfg.assets.wingsFront, t.wingsFront, { isWing: true });
      drawP(cfg.assets.head, t.head, { isHead: true });
      ctx.restore();
  }
}
