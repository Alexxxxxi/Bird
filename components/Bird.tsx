
import { CreatureEntity, CreatureState, Species, IdleAction, CustomBirdConfig, CustomBirdTransforms } from '../types';
import { SPECIES_CONFIG } from '../constants';

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

  private assetImgs: { head?: HTMLImageElement, body?: HTMLImageElement, wingsFront?: HTMLImageElement, wingsBack?: HTMLImageElement } = {};

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

    if (customConfigs && customConfigs.length > 0 && Math.random() > 0.3) {
      const cfg = customConfigs[Math.floor(Math.random() * customConfigs.length)];
      this.customConfig = cfg;
      this.species = cfg.name;
      this.color = '#FFFFFF';
      this.loadAssets(cfg);
      speciesBaseSize = cfg.baseSize * 0.6 * (cfg.globalScale || 1.0); 
      sizeVar = cfg.sizeRange;
    } else {
      const speciesList: Species[] = ['sparrow', 'robin', 'bluejay', 'goldfinch', 'cardinal', 'swan', 'crow', 'eagle', 'owl', 'parrot', 'toucan'];
      this.species = speciesList[Math.floor(Math.random() * speciesList.length)];
      this.color = SPECIES_CONFIG[this.species as keyof typeof SPECIES_CONFIG].body;
      
      if (this.species === 'swan') speciesBaseSize = 28; 
      else if (['eagle', 'crow'].includes(this.species)) speciesBaseSize = 18;
      else if (['owl', 'parrot', 'toucan'].includes(this.species)) speciesBaseSize = 15;
    }
    
    let baseScale = Math.max(handPixelWidth, 30) / 100 * 0.6;
    if (this.targetId === 'Head' || this.targetId.includes('Shoulder')) {
      baseScale *= 0.65;
    }

    this.size = speciesBaseSize * baseScale * (1.0 + (Math.random() - 0.5) * 2 * sizeVar);
    this.size = Math.min(Math.max(this.size, 2), 250); 
    
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

  private loadAssets(cfg: CustomBirdConfig) {
    const keys: (keyof typeof cfg.assets)[] = ['head', 'body', 'wingsFront', 'wingsBack'];
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

    if (this.state === CreatureState.FLYING_IN && perchTarget) {
      // Offset slightly more so they truly sit on top
      const feetOffset = this.size * 1.7; 
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
      if (dist < 15) this.state = CreatureState.PERCHED;
    } 
    else if (this.state === CreatureState.PERCHED && perchTarget) {
      this.poopTimer -= 1;
      if (this.poopTimer <= 0) { this.justPooped = true; this.poopTimer = 400 + Math.random() * 400; }
      if (siblings) {
        let push = 0;
        siblings.forEach(sib => {
          if (sib.id === this.id || sib.targetId !== this.targetId || sib.state !== CreatureState.PERCHED) return;
          const dist = Math.abs(this.perchOffset - sib.perchOffset);
          const neededSep = (this.size + sib.size) / 200; 
          if (dist < neededSep) push += (this.perchOffset > sib.perchOffset ? 1 : -1) * (neededSep - dist) * 0.08;
        });
        this.perchOffset = Math.max(0.05, Math.min(0.95, this.perchOffset + push));
      }
      if (this.actionTimer <= 0) this.pickNewAction();
      this.x = this.x * 0.9 + perchTarget.x * 0.1;
      
      const targetY = perchTarget.y - this.size * 1.6;
      if (this.idleAction === 'hop' && this.actionTimer > 10) this.velocityY = -1.8;
      this.y += this.velocityY;
      if (this.y >= targetY) { this.y = targetY; this.velocityY = 0; } 
      else { this.velocityY += 0.45; }
    } 
    else if (this.state === CreatureState.FLYING_AWAY) {
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
    if (this.state === CreatureState.PERCHED) {
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
    if (this.state !== CreatureState.PERCHED) rotation = Math.min(Math.max(this.velocityY * 0.05, -0.6), 0.6);
    ctx.rotate(rotation);

    if (this.customConfig) {
      this.drawCustom(ctx, rotation, this.customConfig);
    } else {
      this.drawProcedural(ctx, this.species, this.size, this.state, this.flapPhase, 100);
    }

    ctx.restore();
  }

  private drawCustom(ctx: CanvasRenderingContext2D, rotation: number, cfg: CustomBirdConfig) {
    const flapMult = (cfg.flapAmplitude !== undefined ? cfg.flapAmplitude : 1.0);
    const flap = Math.sin(this.flapPhase) * flapMult;
    const size = this.size;
    const t = cfg.transforms;

    // Global rotation applied to the whole stack
    if (cfg.globalRotation) {
        ctx.rotate(cfg.globalRotation * Math.PI / 180);
    }

    // Wings Back Layer
    if (this.assetImgs.wingsBack) {
      ctx.save();
      const wt = t.wingsBack;
      const wingY = flap * size * 0.4;
      ctx.translate(wt.x * size * 0.05, (wt.y * size * 0.05) + wingY);
      ctx.rotate((wt.rotate - 10 * flap) * Math.PI / 180);
      ctx.globalAlpha = 0.6;
      ctx.filter = 'brightness(70%)';
      ctx.drawImage(this.assetImgs.wingsBack, -size * 1.5 * wt.scale, -size * 1.5 * wt.scale, size * 1.5 * wt.scale, size * 1.5 * wt.scale);
      ctx.restore();
    }

    // Body Layer
    if (this.assetImgs.body) {
      ctx.save();
      let bScale = (this.idleAction === 'fluff' ? 1.1 : 1.0) * t.body.scale;
      ctx.translate(t.body.x * size * 0.05, t.body.y * size * 0.05);
      ctx.rotate(t.body.rotate * Math.PI / 180);
      ctx.drawImage(this.assetImgs.body, -size, -size, size * 2 * bScale, size * 2 * bScale);
      ctx.restore();
    }

    // Wings Front Layer
    if (this.assetImgs.wingsFront) {
      ctx.save();
      const wt = t.wingsFront;
      const wingY = this.state === CreatureState.PERCHED ? 0 : flap * size * 0.8;
      ctx.translate(wt.x * size * 0.05, (wt.y * size * 0.05) - wingY);
      ctx.rotate((wt.rotate + 15 * flap) * Math.PI / 180);
      ctx.drawImage(this.assetImgs.wingsFront, -size * 0.2 * wt.scale, -size * 1.5 * wt.scale, size * 1.5 * wt.scale, size * 1.5 * wt.scale);
      ctx.restore();
    }

    // Head Layer
    if (this.assetImgs.head) {
      ctx.save();
      ctx.translate((size * 0.6) + (t.head.x * size * 0.05), (-size * 0.6) + (t.head.y * size * 0.05));
      ctx.rotate((t.head.rotate * Math.PI / 180) + (this.idleAction === 'peck' ? rotation : 0));
      ctx.drawImage(this.assetImgs.head, -size * 0.5 * t.head.scale, -size * 0.5 * t.head.scale, size * t.head.scale, size * t.head.scale);
      ctx.restore();
    }
  }

  public static drawCustomPreview(ctx: CanvasRenderingContext2D, cfg: CustomBirdConfig, size: number, flapPhase: number) {
      const t = cfg.transforms;
      const flapMult = (cfg.flapAmplitude !== undefined ? cfg.flapAmplitude : 1.0);
      const flap = Math.sin(flapPhase) * flapMult;
      
      ctx.save();
      ctx.translate(ctx.canvas.width/2, ctx.canvas.height/2);

      // Apply Global Preview Rotation
      if (cfg.globalRotation) {
          ctx.rotate(cfg.globalRotation * Math.PI / 180);
      }

      const drawPartImg = (src: string | undefined, transform: any, isBack: boolean = false, isHead: boolean = false, isWing: boolean = false) => {
          if (!src) return;
          const img = new Image(); img.src = src;
          ctx.save();
          if (isHead) {
              ctx.translate((size * 0.6) + (transform.x * size * 0.05), (-size * 0.6) + (transform.y * size * 0.05));
              ctx.rotate(transform.rotate * Math.PI / 180);
              ctx.drawImage(img, -size * 0.5 * transform.scale, -size * 0.5 * transform.scale, size * transform.scale, size * transform.scale);
          } else if (isWing) {
              const wingY = isBack ? flap * size * 0.4 : -flap * size * 0.8;
              ctx.translate(transform.x * size * 0.05, (transform.y * size * 0.05) + wingY);
              ctx.rotate((transform.rotate + (isBack ? -10 : 15) * flap) * Math.PI / 180);
              if (isBack) { ctx.globalAlpha = 0.6; ctx.filter = 'brightness(70%)'; }
              ctx.drawImage(img, -size * (isBack ? 1.5 : 0.2) * transform.scale, -size * 1.5 * transform.scale, size * 1.5 * transform.scale, size * 1.5 * transform.scale);
          } else {
              ctx.translate(transform.x * size * 0.05, transform.y * size * 0.05);
              ctx.rotate(transform.rotate * Math.PI / 180);
              ctx.drawImage(img, -size, -size, size * 2 * transform.scale, size * 2 * transform.scale);
          }
          ctx.restore();
      };

      drawPartImg(cfg.assets.wingsBack, t.wingsBack, true, false, true);
      drawPartImg(cfg.assets.body, t.body);
      drawPartImg(cfg.assets.wingsFront, t.wingsFront, false, false, true);
      drawPartImg(cfg.assets.head, t.head, false, true, false);

      ctx.restore();
  }

  public drawProcedural(ctx: CanvasRenderingContext2D, species: string, size: number, state: CreatureState, flapPhase: number, blinkTimer: number) {
    const config = SPECIES_CONFIG[species as keyof typeof SPECIES_CONFIG] || SPECIES_CONFIG.sparrow;
    const flap = Math.sin(flapPhase);

    if (state === CreatureState.PERCHED) {
        ctx.strokeStyle = '#FFA000';
        ctx.lineWidth = Math.max(1.5, size * 0.1);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(size*0.1, size * 0.6); ctx.lineTo(size*0.15, size * 0.95 + 4); 
        ctx.moveTo(-size*0.1, size * 0.6); ctx.lineTo(-size*0.15, size * 0.95 + 4);
        ctx.stroke();
    }

    const tailGrad = ctx.createLinearGradient(-size, 0, 0, 0);
    tailGrad.addColorStop(0, config.wing); tailGrad.addColorStop(1, config.body);
    ctx.fillStyle = tailGrad;
    ctx.beginPath();
    const tailY = (state !== CreatureState.PERCHED) ? flap * 2 : 0;
    ctx.moveTo(-size * 0.5, 0);
    ctx.lineTo(-size * 1.6, size * 0.5 + tailY);
    ctx.lineTo(-size * 0.5, size * 0.9);
    ctx.fill();

    const bodyGrad = ctx.createRadialGradient(-size * 0.2, -size * 0.2, size * 0.2, 0, 0, size * 1.2);
    bodyGrad.addColorStop(0, config.belly); bodyGrad.addColorStop(0.4, config.body);
    ctx.fillStyle = bodyGrad; 
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.0, size * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    const headX = size * 0.6, headY = -size * 0.6, headRad = size * 0.55;
    ctx.fillStyle = config.body;
    ctx.beginPath(); ctx.arc(headX, headY, headRad, 0, Math.PI * 2); ctx.fill();

    if (blinkTimer > 0) {
        ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(headX + size*0.2, headY - size*0.1, size*0.18, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(headX + size*0.25, headY - size*0.1, size*0.1, 0, Math.PI*2); ctx.fill();
    }

    ctx.fillStyle = config.beak;
    ctx.beginPath();
    ctx.moveTo(headX + headRad * 0.7, headY);
    ctx.lineTo(headX + headRad * 1.6, headY + size * 0.1);
    ctx.lineTo(headX + headRad * 0.8, headY + size * 0.3);
    ctx.fill();

    ctx.fillStyle = config.wing;
    ctx.beginPath();
    if (state === CreatureState.PERCHED) {
        ctx.ellipse(-size * 0.2, 0, size * 0.85, size * 0.55, 0.2, 0, Math.PI*2);
    } else {
        const wingY = flap * size * 1.2;
        ctx.ellipse(size * 0.5, -size * 0.8 - wingY, size * 0.8, size * 0.3, -0.5, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  public static drawPart(ctx: CanvasRenderingContext2D, species: string, size: number, part: 'head' | 'body' | 'wings') {
    const config = SPECIES_CONFIG[species as keyof typeof SPECIES_CONFIG] || SPECIES_CONFIG.sparrow;
    ctx.save();
    ctx.translate(ctx.canvas.width/2, ctx.canvas.height/2);
    
    if (part === 'body') {
      const bodyGrad = ctx.createRadialGradient(-size * 0.2, -size * 0.2, size * 0.2, 0, 0, size * 1.2);
      bodyGrad.addColorStop(0, config.belly); bodyGrad.addColorStop(0.4, config.body);
      ctx.fillStyle = bodyGrad; 
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.0, size * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (part === 'head') {
      const headRad = size * 0.55;
      ctx.fillStyle = config.body;
      ctx.beginPath(); ctx.arc(0, 0, headRad, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(size*0.2, -size*0.1, size*0.18, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(size*0.25, -size*0.1, size*0.1, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = config.beak;
      ctx.beginPath();
      ctx.moveTo(headRad * 0.7, 0); ctx.lineTo(headRad * 1.6, size * 0.1); ctx.lineTo(headRad * 0.8, size * 0.3); ctx.fill();
    } else if (part === 'wings') {
      ctx.fillStyle = config.wing;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.85, size * 0.55, 0.2, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }
}
