
import { CreatureEntity, CreatureState, Species, IdleAction, Particle } from '../types';

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
  size: number;
  state: CreatureState;
  perchOffset: number;
  species: Species = 'butterfly';
  idleAction: IdleAction = 'flutter';
  actionTimer: number = 0;
  facing: number = 1;

  private angle: number = 0;
  private floatOffset: number = Math.random() * 1000;
  private particles: Particle[] = [];

  constructor(
    screenWidth: number, 
    screenHeight: number, 
    targetId: string, 
    forcedOffset?: number
  ) {
    this.id = Math.random().toString(36).substr(2, 9);
    this.targetId = targetId;
    
    const side = Math.floor(Math.random() * 4);
    if (side === 0) { this.originX = Math.random() * screenWidth; this.originY = -50; }
    else if (side === 1) { this.originX = screenWidth + 50; this.originY = Math.random() * screenHeight; }
    else if (side === 2) { this.originX = Math.random() * screenWidth; this.originY = screenHeight + 50; }
    else { this.originX = -50; this.originY = Math.random() * screenHeight; }

    this.x = this.originX;
    this.y = this.originY;
    this.targetX = screenWidth / 2;
    this.targetY = screenHeight / 2;
    this.velocityX = 0;
    this.velocityY = 0;
    this.size = 35 + Math.random() * 25;
    this.color = '#00FFFF';
    this.state = CreatureState.FLYING_IN;
    this.perchOffset = forcedOffset !== undefined ? forcedOffset : Math.random();
  }

  update(dt: number, perchTarget: { x: number, y: number } | null) {
    this.angle += 0.05;
    
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
    });
    this.particles = this.particles.filter(p => p.life > 0);

    if (Math.random() > 0.6) {
      this.particles.push({
        x: this.x, y: this.y,
        vx: (Math.random() - 0.5) * 1,
        vy: (Math.random() - 0.5) * 1,
        life: 1.0,
        size: Math.random() * 3,
        color: `hsla(${180 + Math.sin(this.angle)*40}, 100%, 80%, 0.6)`
      });
    }

    if (this.state === CreatureState.FLYING_IN && perchTarget) {
      const dx = perchTarget.x - this.x;
      const dy = (perchTarget.y - 15) - this.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      const noiseX = Math.sin(this.angle + this.floatOffset) * 2.5;
      const noiseY = Math.cos(this.angle * 0.8 + this.floatOffset) * 2.5;
      
      this.velocityX = (dx * 0.02) + noiseX;
      this.velocityY = (dy * 0.02) + noiseY;
      
      this.x += this.velocityX;
      this.y += this.velocityY;
      
      if (dist < 10) this.state = CreatureState.PERCHED;
    } 
    else if (this.state === CreatureState.PERCHED && perchTarget) {
      const hoverY = Math.sin(this.angle) * 8;
      this.x = this.x * 0.85 + perchTarget.x * 0.15;
      this.y = this.y * 0.85 + (perchTarget.y - 25 + hoverY) * 0.15;
    } 
    else if (this.state === CreatureState.FLYING_AWAY) {
      this.velocityX += (Math.random() - 0.5) * 2;
      this.velocityY -= 0.8;
      this.x += this.velocityX;
      this.y += this.velocityY;
    }
  }

  draw(ctx: CanvasRenderingContext2D, videoSource: HTMLVideoElement | null) {
    this.particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    if (!videoSource || videoSource.readyState < 2) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    
    if (this.state !== CreatureState.PERCHED) {
      const rot = Math.atan2(this.velocityY, this.velocityX);
      ctx.rotate(rot + Math.PI / 2);
    }
    
    ctx.globalCompositeOperation = 'screen';
    
    const aspect = videoSource.videoWidth / videoSource.videoHeight || 1;
    const w = this.size * aspect;
    const h = this.size;
    
    const pulse = 1.0 + Math.sin(this.angle * 2.5) * 0.1;
    ctx.scale(pulse, pulse);
    
    ctx.drawImage(videoSource, -w/2, -h/2, w, h);
    
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }
}
