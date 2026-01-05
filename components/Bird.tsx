
import { BirdEntity, BirdState, Species, IdleAction, CustomBirdConfig } from '../types';
import { SPECIES_CONFIG } from '../constants';

export class Bird implements BirdEntity {
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
  state: BirdState;
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

  // Cached Image Elements
  private assetImgs: { head?: HTMLImageElement, body?: HTMLImageElement, wings?: HTMLImageElement, legs?: HTMLImageElement } = {};

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
    
    // Pick side
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
    
    // Check for custom configs
    if (customConfigs && customConfigs.length > 0 && Math.random() > 0.3) {
      const cfg = customConfigs[Math.floor(Math.random() * customConfigs.length)];
      this.customConfig = cfg;
      this.species = cfg.name;
      this.color = '#FFFFFF';
      this.loadAssets(cfg);
    } else {
      const speciesList: Species[] = ['sparrow', 'robin', 'bluejay', 'goldfinch', 'cardinal', 'swan', 'crow', 'eagle', 'owl', 'parrot', 'toucan'];
      this.species = speciesList[Math.floor(Math.random() * speciesList.length)];
      this.color = SPECIES_CONFIG[this.species as keyof typeof SPECIES_CONFIG].body;
    }
    
    let baseScale = Math.max(handPixelWidth, 50) / 100 * 0.75;
    if (this.targetId === 'Head') baseScale *= 0.5;

    let speciesBaseSize = 16;
    if (this.species === 'swan') speciesBaseSize = 45; 
    else if (['eagle', 'crow'].includes(this.species)) speciesBaseSize = 28;
    else if (['owl', 'parrot', 'toucan'].includes(this.species)) speciesBaseSize = 22;

    this.size = speciesBaseSize * baseScale * (0.85 + Math.random() * 0.3);
    this.size = Math.min(Math.max(this.size, 6), 100); 
    
    this.wingSpan = this.size * 2.5;
    this.flapSpeed = (0.12 + Math.random() * 0.1) * (15 / this.size); 
    this.flapPhase = Math.random() * Math.PI * 2;
    this.flightWobbleOffset = Math.random() * 100;
    this.flightWobbleSpeed = 0.05 + Math.random() * 0.05;

    this.state = BirdState.FLYING_IN;
    this.perchOffset = forcedOffset !== undefined ? forcedOffset : (0.05 + Math.random() * 0.9); 
    this.actionTimer = Math.random() * 100;
    this.variantSeed = Math.random();
    this.poopTimer = 180 + Math.random() * 240; 
  }

  private loadAssets(cfg: CustomBirdConfig) {
    const keys: (keyof typeof cfg.assets)[] = ['head', 'body', 'wings', 'legs'];
    keys.forEach(k => {
      if (cfg.assets[k]) {
        const img = new Image();
        img.src = cfg.assets[k]!;
        this.assetImgs[k] = img;
      }
    });
  }

  update(dt: number, perchTarget: { x: number, y: number } | null, siblings?: Bird[]) {
    this.flapPhase += this.flapSpeed;
    this.actionTimer -= 1;
    this.blinkTimer -= 1;
    if (this.blinkTimer < -10) this.blinkTimer = Math.random() * 200 + 100;

    if (this.state === BirdState.FLYING_IN && perchTarget) {
      const feetOffset = this.size * 1.5; 
      const targetY = perchTarget.y - feetOffset;
      const dx = perchTarget.x - this.x;
      const dy = targetY - this.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const speed = Math.min(0.02 * dist, 8); 
      const angle = Math.atan2(dy, dx);
      this.velocityX = Math.cos(angle) * speed;
      this.velocityY = Math.sin(angle) * speed;
      this.velocityY += Math.sin(this.flapPhase) * 2; 
      this.x += this.velocityX;
      this.y += this.velocityY;
      if (dist < 15) this.state = BirdState.PERCHED;
    } 
    else if (this.state === BirdState.PERCHED && perchTarget) {
      this.poopTimer -= 1;
      if (this.poopTimer <= 0) { this.justPooped = true; this.poopTimer = 300 + Math.random() * 300; }
      if (siblings) {
        let push = 0;
        siblings.forEach(sib => {
          if (sib.id === this.id || sib.targetId !== this.targetId || sib.state !== BirdState.PERCHED) return;
          const dist = Math.abs(this.perchOffset - sib.perchOffset);
          const neededSep = (this.size + sib.size) / 250; 
          if (dist < neededSep) push += (this.perchOffset > sib.perchOffset ? 1 : -1) * (neededSep - dist) * 0.08;
        });
        this.perchOffset = Math.max(0.05, Math.min(0.95, this.perchOffset + push));
      }
      if (this.actionTimer <= 0) this.pickNewAction();
      this.x = this.x * 0.9 + perchTarget.x * 0.1;
      const targetY = perchTarget.y - this.size * 1.6;
      if (this.idleAction === 'hop' && this.actionTimer > 10) this.velocityY = -2.0;
      this.y += this.velocityY;
      if (this.y >= targetY) { this.y = targetY; this.velocityY = 0; } 
      else { this.velocityY += 0.5; }
    } 
    else if (this.state === BirdState.FLYING_AWAY) {
      const dx = this.originX - this.x, dy = this.originY - this.y;
      const angle = Math.atan2(dy, dx);
      this.velocityX += Math.cos(angle) * 0.5;
      this.velocityY += Math.sin(angle) * 0.5;
      const speed = Math.sqrt(this.velocityX**2 + this.velocityY**2);
      if (speed > 10) { this.velocityX *= 10/speed; this.velocityY *= 10/speed; }
      const wobble = Math.sin(Date.now() * 0.005 + this.flightWobbleOffset) * 1.5; 
      this.x += this.velocityX - Math.sin(angle) * wobble;
      this.y += this.velocityY + Math.cos(angle) * wobble;
    }
  }

  pickNewAction() {
      const roll = Math.random();
      if (roll < 0.05) { this.idleAction = 'hop'; this.actionTimer = 20; this.velocityY = -3; } 
      else if (roll < 0.25) { this.idleAction = 'peck'; this.actionTimer = 35; } 
      else if (roll < 0.45) { this.idleAction = 'look_back'; this.actionTimer = 80; } 
      else if (roll < 0.6) { this.idleAction = 'fluff'; this.actionTimer = 40; } 
      else { this.idleAction = 'idle'; this.actionTimer = 60 + Math.random() * 100; }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);

    let scaleX = 1;
    if (this.state === BirdState.PERCHED) {
       scaleX = this.perchOffset < 0.5 ? 1 : -1;
       if (this.idleAction === 'look_back') scaleX *= -1;
    } else {
       scaleX = this.velocityX > 0 ? 1 : -1;
    }
    ctx.scale(scaleX, 1);

    let rotation = 0;
    if (this.idleAction === 'peck') {
        rotation = this.actionTimer > 15 ? (35 - this.actionTimer) * 0.08 : this.actionTimer * 0.08;
    }
    if (this.state !== BirdState.PERCHED) rotation = Math.min(Math.max(this.velocityY * 0.05, -0.6), 0.6);
    ctx.rotate(rotation);

    if (this.customConfig) {
      // Pass rotation to drawCustom to fix "Cannot find name 'rotation'" error
      this.drawCustom(ctx, rotation);
    } else {
      this.drawProcedural(ctx);
    }

    ctx.restore();
  }

  // Updated signature to accept rotation value
  private drawCustom(ctx: CanvasRenderingContext2D, rotation: number) {
    const flap = Math.sin(this.flapPhase);
    const size = this.size;

    // Legs
    if (this.assetImgs.legs && this.state === BirdState.PERCHED) {
      ctx.drawImage(this.assetImgs.legs, -size * 0.5, size * 0.5, size, size * 0.5);
    }

    // Wings (Back)
    if (this.assetImgs.wings && this.state !== BirdState.PERCHED) {
      ctx.save();
      const wingY = flap * size * 0.5;
      ctx.translate(0, wingY);
      ctx.globalAlpha = 0.6;
      ctx.drawImage(this.assetImgs.wings, -size * 1.5, -size * 1.5, size * 1.5, size * 1.5);
      ctx.restore();
    }

    // Body
    if (this.assetImgs.body) {
      let bScale = this.idleAction === 'fluff' ? 1.1 : 1.0;
      ctx.drawImage(this.assetImgs.body, -size, -size, size * 2 * bScale, size * 2 * bScale);
    }

    // Wings (Front)
    if (this.assetImgs.wings) {
      ctx.save();
      if (this.state === BirdState.PERCHED) {
        ctx.drawImage(this.assetImgs.wings, -size * 0.8, -size * 0.4, size * 1.2, size * 0.8);
      } else {
        const wingY = flap * size * 0.8;
        ctx.translate(0, -wingY);
        ctx.drawImage(this.assetImgs.wings, -size * 0.2, -size * 1.5, size * 1.5, size * 1.5);
      }
      ctx.restore();
    }

    // Head
    if (this.assetImgs.head) {
      ctx.save();
      ctx.translate(size * 0.6, -size * 0.6);
      if (this.idleAction === 'peck') ctx.rotate(rotation);
      ctx.drawImage(this.assetImgs.head, -size * 0.5, -size * 0.5, size, size);
      ctx.restore();
    }
  }

  private drawProcedural(ctx: CanvasRenderingContext2D) {
    const config = SPECIES_CONFIG[this.species as keyof typeof SPECIES_CONFIG] || SPECIES_CONFIG.sparrow;
    const flap = Math.sin(this.flapPhase);

    // Legs
    if (this.state === BirdState.PERCHED) {
        ctx.strokeStyle = '#FFA000';
        ctx.lineWidth = Math.max(1.5, this.size * 0.1);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.size*0.1, this.size * 0.6); ctx.lineTo(this.size*0.15, this.size * 0.95 + 4); 
        ctx.moveTo(-this.size*0.1, this.size * 0.6); ctx.lineTo(-this.size*0.15, this.size * 0.95 + 4);
        ctx.stroke();
    }

    // Tail
    const tailGrad = ctx.createLinearGradient(-this.size, 0, 0, 0);
    tailGrad.addColorStop(0, config.wing); tailGrad.addColorStop(1, config.body);
    ctx.fillStyle = tailGrad;
    ctx.beginPath();
    const tailY = (this.state !== BirdState.PERCHED) ? flap * 2 : 0;
    ctx.moveTo(-this.size * 0.5, 0);
    ctx.lineTo(-this.size * 1.6, this.size * 0.5 + tailY);
    ctx.lineTo(-this.size * 0.5, this.size * 0.9);
    ctx.fill();

    // Body
    let bodyScale = this.idleAction === 'fluff' ? 1.15 : 1.0;
    const bodyGrad = ctx.createRadialGradient(-this.size * 0.2, -this.size * 0.2, this.size * 0.2, 0, 0, this.size * 1.2 * bodyScale);
    bodyGrad.addColorStop(0, config.belly); bodyGrad.addColorStop(0.4, config.body);
    ctx.fillStyle = bodyGrad; 
    ctx.beginPath();
    ctx.ellipse(0, 0, this.size * 1.0 * bodyScale, this.size * 0.9 * bodyScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    const headX = this.size * 0.6, headY = -this.size * 0.6, headRad = this.size * 0.55;
    ctx.fillStyle = config.body;
    ctx.beginPath(); ctx.arc(headX, headY, headRad, 0, Math.PI * 2); ctx.fill();

    // Eye
    if (this.blinkTimer > 0) {
        ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(headX + this.size*0.2, headY - this.size*0.1, this.size*0.18, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(headX + this.size*0.25, headY - this.size*0.1, this.size*0.1, 0, Math.PI*2); ctx.fill();
    }

    // Beak
    ctx.fillStyle = config.beak;
    ctx.beginPath();
    ctx.moveTo(headX + headRad * 0.7, headY);
    ctx.lineTo(headX + headRad * 1.6, headY + this.size * 0.1);
    ctx.lineTo(headX + headRad * 0.8, headY + this.size * 0.3);
    ctx.fill();

    // Wing
    ctx.fillStyle = config.wing;
    ctx.beginPath();
    if (this.state === BirdState.PERCHED) {
        ctx.ellipse(-this.size * 0.2, 0, this.size * 0.85, this.size * 0.55, 0.2, 0, Math.PI*2);
    } else {
        const wingY = flap * this.size * 1.2;
        ctx.ellipse(this.size * 0.5, -this.size * 0.8 - wingY, this.size * 0.8, this.size * 0.3, -0.5, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}
