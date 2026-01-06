
import { CreatureEntity, CreatureState, Species, IdleAction, CustomBirdConfig, CustomBirdTransforms, Particle } from '../types';

const ImageCache: Record<string, HTMLImageElement> = {};

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
  state: CreatureState;
  perchOffset: number;
  species: Species;
  idleAction: IdleAction = 'flutter';
  actionTimer: number = 0;
  facing: number = 1;
  
  private angle: number = Math.random() * Math.PI * 2;
  private flapPhase: number = Math.random() * Math.PI * 2;
  private floatOffset: number = Math.random() * 1000;
  private particles: Particle[] = [];
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
    
    const side = Math.floor(Math.random() * 4);
    const buffer = 100;
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
    this.size = config.baseSize * (0.8 + Math.random() * 0.4) * config.globalScale;
    this.size = Math.min(Math.max(this.size, 1), 500);
    this.preloadImages(config);
  }

  private preloadImages(cfg: CustomBirdConfig) {
    const urls = Object.values(cfg.assets).filter(Boolean) as string[];
    urls.forEach(u => {
      if (!ImageCache[u]) {
        const img = new Image();
        img.src = u;
        ImageCache[u] = img;
      }
    });
  }

  update(dt: number, perchTarget: { x: number, y: number } | null, siblings?: any[]) {
    this.angle += 0.002 * dt;
    this.flapPhase += (this.state === CreatureState.PERCHED ? 0.003 : 0.015) * dt;
    
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.001 * dt;
    });
    this.particles = this.particles.filter(p => p.life > 0);

    if (Math.random() > 0.9) {
      this.particles.push({
        x: this.x, y: this.y,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        life: 1.0,
        size: Math.random() * 2,
        color: `hsla(${200 + Math.sin(this.angle)*40}, 100%, 80%, 0.4)`
      });
    }

    if (this.state === CreatureState.FLYING_IN && perchTarget) {
      const dx = perchTarget.x - this.x;
      const dy = (perchTarget.y - 10) - this.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      const noiseX = Math.sin(this.angle + this.floatOffset) * 1.5;
      const noiseY = Math.cos(this.angle * 0.8 + this.floatOffset) * 1.5;
      
      this.velocityX = (dx * 0.03) + noiseX;
      this.velocityY = (dy * 0.03) + noiseY;
      
      this.x += this.velocityX;
      this.y += this.velocityY;
      
      if (dist < 10) this.state = CreatureState.PERCHED;
    } 
    else if (this.state === CreatureState.PERCHED && perchTarget) {
      const hoverY = Math.sin(this.angle) * 3;
      this.x = this.x * 0.9 + perchTarget.x * 0.1;
      this.y = this.y * 0.9 + (perchTarget.y - 12 + hoverY) * 0.1;
    } 
    else if (this.state === CreatureState.FLYING_AWAY) {
      this.velocityX += (Math.random() - 0.5) * 1;
      this.velocityY -= 0.05 * dt;
      this.x += this.velocityX;
      this.y += this.velocityY;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.save();
    ctx.translate(this.x, this.y);
    
    const rot = Math.atan2(this.velocityY, this.velocityX) + Math.PI/2;
    ctx.rotate(rot * 0.3 + Math.sin(this.angle) * 0.1);

    this.drawCustom(ctx);
    ctx.restore();
  }

  private drawCustom(ctx: CanvasRenderingContext2D) {
    const cfg = this.customConfig;
    const flap = Math.sin(this.flapPhase);
    const size = this.size;
    const t = cfg.transforms;

    // Apply Global Offsets
    if (cfg.globalX !== undefined || cfg.globalY !== undefined) {
      ctx.translate((cfg.globalX || 0) * size * 0.05, (cfg.globalY || 0) * size * 0.05);
    }
    if (cfg.globalRotation) {
      ctx.rotate(cfg.globalRotation * Math.PI / 180);
    }

    const drawP = (u: string | undefined, tr: any, opts: { isWing?: boolean, isBack?: boolean, isHead?: boolean } = {}) => {
      if (!u || !ImageCache[u]) return;
      ctx.save();
      const img = ImageCache[u];
      if (opts.isHead) {
        ctx.translate(tr.x * size * 0.05, tr.y * size * 0.05);
        ctx.drawImage(img, -size * 0.2 * tr.scale, -size * 0.2 * tr.scale, size * 0.4 * tr.scale, size * 0.4 * tr.scale);
      } else if (opts.isWing) {
        const flapScale = 0.2 + Math.abs(flap) * 0.8;
        ctx.translate(tr.x * size * 0.05, tr.y * size * 0.05);
        ctx.scale(opts.isBack ? -flapScale : flapScale, 1.0);
        ctx.rotate(tr.rotate * Math.PI / 180);
        if (opts.isBack) { ctx.globalAlpha = 0.7; ctx.filter = 'brightness(70%)'; }
        ctx.drawImage(img, -size * 1.2 * tr.scale, -size * 1.2 * tr.scale, size * 1.2 * tr.scale, size * 1.2 * tr.scale);
      } else {
        ctx.translate(tr.x * size * 0.05, tr.y * size * 0.05);
        ctx.rotate(tr.rotate * Math.PI / 180);
        ctx.drawImage(img, -size * 0.5, -size * 0.5, size * tr.scale, size * tr.scale);
      }
      ctx.restore();
    };

    drawP(cfg.assets.wingsBack, t.wingsBack, { isWing: true, isBack: true });
    drawP(cfg.assets.body, t.body);
    drawP(cfg.assets.wingsFront, t.wingsFront, { isWing: true });
    drawP(cfg.assets.head, t.head, { isHead: true });
  }
}
