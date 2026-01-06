
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bird } from './Bird';
import { CreatureState, PoopEntity, CustomBirdConfig, CustomBirdAssets, CustomBirdTransforms, PartTransform } from '../types';
import { isFist, getDistance, getUpperHandHull, getPointOnPolyline } from '../utils/geometry';
import { SHAKE_THRESHOLD, CLEAN_THRESHOLD, SPECIES_CONFIG } from '../constants';
import { saveBirdToDB, getAllBirdsFromDB, deleteBirdFromDB } from '../utils/db';
import { Loader2, Camera, FlipHorizontal, Upload, X, Bird as BirdIcon, Settings2, Info, Sparkles, Ruler, Maximize, Smile, BookOpen, Layers, Move, RotateCcw, BoxSelect, Trash2, Edit2, Zap, Share2, Download } from 'lucide-react';

declare global {
  interface Window {
    Holistic: any;
    drawConnectors: any;
    drawLandmarks: any;
  }
}

type LimbStateData = {
  lastPos: {x: number, y: number} | null; width: number; prevContour: {x: number, y: number}[]; missingFrames: number;
  lastCheckTime: number; lastMovement: number; isSmiling: boolean; headShakeCount: number; lastYawDir: 'left' | 'right' | 'center'; lastShakeTime: number;
};

const createInitialLimbState = (): LimbStateData => ({
  lastPos: null, width: 0, prevContour: [], missingFrames: 0, lastCheckTime: 0, lastMovement: 0, isSmiling: false, headShakeCount: 0, lastYawDir: 'center', lastShakeTime: 0
});

const defaultPartTransform = (): PartTransform => ({ x: 0, y: 0, rotate: 0, scale: 1 });
const defaultTransforms = (): CustomBirdTransforms => ({
    head: defaultPartTransform(), body: defaultPartTransform(), wingsFront: defaultPartTransform(), wingsBack: defaultPartTransform(),
});

const CENTRAL_SPAWN_INTERVAL_MS = 800;

const SpeciesBlueprint: React.FC<{ species: string }> = ({ species }) => {
    const canvasRefs = { head: useRef<HTMLCanvasElement>(null), body: useRef<HTMLCanvasElement>(null), wings: useRef<HTMLCanvasElement>(null) };
    useEffect(() => {
        const size = 25;
        (['head', 'body', 'wings'] as const).forEach(part => {
            const canvas = canvasRefs[part].current;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) { ctx.clearRect(0, 0, canvas.width, canvas.height); Bird.drawPart(ctx, species, size, part); }
            }
        });
    }, [species]);
    return (
        <div className="bg-zinc-800/40 border border-white/5 p-4 rounded-3xl space-y-3">
            <div className="flex justify-between items-center mb-1"><span className="text-white font-black text-xs uppercase tracking-tighter">{species}</span><span className="text-zinc-600 text-[8px] font-bold tracking-widest uppercase">Template</span></div>
            <div className="grid grid-cols-3 gap-2">{(['head', 'body', 'wings'] as const).map(p => (<div key={p} className="flex flex-col items-center gap-1"><div className="bg-zinc-900 rounded-xl overflow-hidden aspect-square w-full border border-white/5 flex items-center justify-center"><canvas ref={canvasRefs[p]} width={64} height={64} className="w-full h-full" /></div><span className="text-zinc-500 text-[8px] font-black uppercase tracking-tighter">{p}</span></div>))}</div>
        </div>
    );
};

const HandAR: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("Smile to invite the magical birds! / 笑一笑，神奇的小鸟就会飞向你！");
  const [isStatusVisible, setIsStatusVisible] = useState(true);
  
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [isMirrored, setIsMirrored] = useState(true);
  const isMirroredRef = useRef(true);

  const wasSmilingGlobalRef = useRef(false);
  const globalSpawnTimerRef = useRef(0);

  const [showAssetPanel, setShowAssetPanel] = useState(false);
  const [labTab, setLabTab] = useState<'synthesize' | 'blueprints'>('synthesize');
  const [customBirds, setCustomBirds] = useState<CustomBirdConfig[]>([]);
  const customBirdsRef = useRef<CustomBirdConfig[]>([]);

  const [newBirdName, setNewBirdName] = useState("");
  const [newBirdAssets, setNewBirdAssets] = useState<CustomBirdAssets>({});
  const [newBirdTransforms, setNewBirdTransforms] = useState<CustomBirdTransforms>(defaultTransforms());
  const [newBirdGlobalScale, setNewBirdGlobalScale] = useState(1.0);
  const [newBirdGlobalRotation, setNewBirdGlobalRotation] = useState(0);
  const [newBirdFlapAmplitude, setNewBirdFlapAmplitude] = useState(1.0);
  const [newBirdBaseSize, setNewBirdBaseSize] = useState(25);
  const [newBirdSizeRange, setNewBirdSizeRange] = useState(0.3);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [spacePressedTime, setSpacePressedTime] = useState<number | null>(null);
  const [spaceHoldProgress, setSpaceHoldProgress] = useState(0);

  const birdsRef = useRef<Bird[]>([]);
  const poopsRef = useRef<PoopEntity[]>([]);
  const limbStatesRef = useRef<Map<string, LimbStateData>>(new Map());
  const holisticRef = useRef<any>(null);
  const detectionActiveRef = useRef<boolean>(false);

  // Persistence: Load on mount
  useEffect(() => {
    const loadSaved = async () => {
      try {
        const saved = await getAllBirdsFromDB();
        if (saved) setCustomBirds(saved);
      } catch (e) { console.error("Database loading failed:", e); }
    };
    loadSaved();
  }, []);

  useEffect(() => {
    let frameId: number; let phase = 0;
    const loop = () => {
        phase += 0.15;
        const canvas = previewCanvasRef.current;
        if (canvas && Object.keys(newBirdAssets).length > 0) {
            const ctx = canvas.getContext('2d');
            if (ctx) { ctx.clearRect(0, 0, canvas.width, canvas.height); Bird.drawCustomPreview(ctx, { id: 'preview', name: newBirdName, assets: newBirdAssets, transforms: newBirdTransforms, globalScale: newBirdGlobalScale, globalRotation: newBirdGlobalRotation, flapAmplitude: newBirdFlapAmplitude, baseSize: newBirdBaseSize, sizeRange: newBirdSizeRange }, 80 * newBirdGlobalScale, phase); }
        }
        frameId = requestAnimationFrame(loop);
    };
    if (showAssetPanel) frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [showAssetPanel, newBirdAssets, newBirdTransforms, newBirdName, newBirdBaseSize, newBirdSizeRange, newBirdGlobalScale, newBirdGlobalRotation, newBirdFlapAmplitude]);

  useEffect(() => { isMirroredRef.current = isMirrored; }, [isMirrored]);
  useEffect(() => { customBirdsRef.current = customBirds; }, [customBirds]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.code === 'Space' && !spacePressedTime) setSpacePressedTime(Date.now()); };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') { setSpacePressedTime(null); setSpaceHoldProgress(0); } };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [spacePressedTime]);

  useEffect(() => {
    if (spacePressedTime) {
      const interval = setInterval(() => {
        const elapsed = Date.now() - spacePressedTime; const progress = Math.min(elapsed / 3000, 1); setSpaceHoldProgress(progress);
        if (progress >= 1) { setShowAssetPanel(prev => !prev); setSpacePressedTime(null); setSpaceHoldProgress(0); clearInterval(interval); }
      }, 50);
      return () => clearInterval(interval);
    }
  }, [spacePressedTime]);

  const startCamera = useCallback(async (deviceId?: string) => {
      if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      try {
        const constraints = { video: deviceId ? { deviceId: { exact: deviceId }, width: 1280, height: 720 } : { facingMode: 'user', width: 1280, height: 720 } };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) { videoRef.current.srcObject = stream; await new Promise(r => videoRef.current!.onloadedmetadata = () => r(null)); videoRef.current.play(); }
        const all = await navigator.mediaDevices.enumerateDevices(); setDevices(all.filter(d => d.kind === 'videoinput')); setCurrentDeviceId(stream.getVideoTracks()[0].getSettings().deviceId || '');
      } catch (err) { setIsLoading(false); }
  }, []);

  useEffect(() => {
    const init = async () => {
      let attempts = 0; while (!window.Holistic && attempts < 50) { await new Promise(r => setTimeout(r, 200)); attempts++; }
      if (!window.Holistic) return;
      const holistic = new window.Holistic({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${f}` });
      holistic.setOptions({ modelComplexity: 0, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      holistic.onResults(onResults); holisticRef.current = holistic; await startCamera(); setIsLoading(false); requestAnimationFrame(loop);
    };
    const loop = async () => { if (videoRef.current?.readyState >= 2 && holisticRef.current) { try { await holisticRef.current.send({ image: videoRef.current }); } catch (e) {} } requestAnimationFrame(loop); };
    const onResults = (results: any) => {
      const canvas = canvasRef.current; const ctx = canvas?.getContext('2d'); if (!canvas || !ctx) return;
      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
      ctx.save(); ctx.clearRect(0, 0, canvas.width, canvas.height);
      const img = results.image; if (!img) { ctx.restore(); return; }
      const ratio = Math.max(canvas.width / img.width, canvas.height / img.height);
      const drawW = img.width * ratio, drawH = img.height * ratio; const ox = (canvas.width - drawW) / 2, oy = (canvas.height - drawH) / 2;
      if (isMirroredRef.current) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(img, ox, oy, drawW, drawH);
      const now = performance.now(); const active = new Set<string>();
      const toPx = (l: any) => ({ x: l.x * drawW + ox, y: l.y * drawH + oy, z: l.z });
      let currentIsSmiling = false;
      if (results.faceLandmarks) {
          const mL = results.faceLandmarks[61], mR = results.faceLandmarks[291], fL = results.faceLandmarks[234], fR = results.faceLandmarks[454];
          if (mL && mR && fL && fR) currentIsSmiling = (getDistance(mL, mR) / getDistance(fL, fR)) > 0.46;
      }
      const process = (lm: any, label: string) => {
        if (!lm || lm.some((l: any) => !l)) return;
        active.add(label); if (!limbStatesRef.current.has(label)) limbStatesRef.current.set(label, createInitialLimbState());
        const state = limbStatesRef.current.get(label)!; state.isSmiling = currentIsSmiling;
        let px = lm.map(toPx); processTargetLogic(px, label, state, canvas.width, canvas.height, now);
        let hull: {x:number, y:number}[] = [];
        if (label === 'Left' || label === 'Right') {
            hull = getUpperHandHull(px);
        } else if (label === 'Head') {
            const faceScale = getDistance(toPx(lm[10]), toPx(lm[152]));
            const topPoint = toPx(lm[10]);
            const crownOffset = faceScale * 0.28; 
            hull = [
                {x: topPoint.x - crownOffset * 0.7, y: topPoint.y - crownOffset * 0.9},
                {x: topPoint.x, y: topPoint.y - crownOffset},
                {x: topPoint.x + crownOffset * 0.7, y: topPoint.y - crownOffset * 0.9}
            ];
        } else if (label.includes('Shoulder')) {
            const self = px[0];
            const width = state.width || 100;
            hull = [
                { x: self.x - width * 0.45, y: self.y - 45 },
                { x: self.x + width * 0.45, y: self.y - 45 }
            ];
        }
        state.prevContour = hull;
      };
      process(results.leftHandLandmarks, 'Left'); process(results.rightHandLandmarks, 'Right'); process(results.faceLandmarks, 'Head');
      if (results.poseLandmarks) {
          process([results.poseLandmarks[11], results.poseLandmarks[12], results.poseLandmarks[13]], 'L_Shoulder');
          process([results.poseLandmarks[12], results.poseLandmarks[11], results.poseLandmarks[14]], 'R_Shoulder');
      }
      if (currentIsSmiling) {
          if (!wasSmilingGlobalRef.current) { spawnCentral(1, canvas.width, canvas.height); wasSmilingGlobalRef.current = true; globalSpawnTimerRef.current = CENTRAL_SPAWN_INTERVAL_MS; }
          else { globalSpawnTimerRef.current -= 16; if (globalSpawnTimerRef.current <= 0) { spawnCentral(1, canvas.width, canvas.height); globalSpawnTimerRef.current = CENTRAL_SPAWN_INTERVAL_MS; } }
      } else wasSmilingGlobalRef.current = false;
      const contours: Record<string, any[]> = {};
      limbStatesRef.current.forEach((s, l) => {
        if (active.has(l)) { s.missingFrames = 0; contours[l] = s.prevContour; }
        else { s.missingFrames++; if (s.missingFrames < 30) contours[l] = s.prevContour; else { scareCreatures(l); poopsRef.current = poopsRef.current.filter(p => p.targetId !== l); limbStatesRef.current.delete(l); } }
      });
      detectionActiveRef.current = limbStatesRef.current.size > 0;
      checkWipeInteraction(contours); updateGlobalStatus(limbStatesRef.current); drawPoops(ctx, contours); updateAndDrawCreatures(ctx, contours, canvas.width, canvas.height); ctx.restore();
    };
    init();
  }, [startCamera]);

  const spawnCentral = (count: number, w: number, h: number) => {
    const activeLabels = Array.from(limbStatesRef.current.entries()).filter(([_, s]) => s.missingFrames < 5).map(([l, _]) => l);
    if (activeLabels.length === 0) return;
    for (let i = 0; i < count; i++) {
        const targetLabel = activeLabels[Math.floor(Math.random() * activeLabels.length)];
        const state = limbStatesRef.current.get(targetLabel)!;
        birdsRef.current.push(new Bird(w, h, state.width || 100, targetLabel, undefined, customBirdsRef.current));
    }
  };

  const processTargetLogic = (landmarks: any[], label: string, state: LimbStateData, width: number, height: number, now: number) => {
    let dt = state.lastCheckTime ? now - state.lastCheckTime : 16; state.lastCheckTime = now;
    let ref = (label === 'Head' ? landmarks[10] : landmarks[0]);
    let measured = (label === 'Head' ? getDistance(landmarks[234], landmarks[454]) : (label.includes('Shoulder') ? getDistance(landmarks[0], landmarks[1]) * 0.25 : getDistance(landmarks[5], landmarks[17])));
    state.width = measured || 100;
    const norm = { x: ref.x / width, y: ref.y / height };
    if ((label === 'Left' || label === 'Right') && isFist(landmarks)) scareCreatures(label);
    if (state.lastPos) {
      const dist = getDistance(norm, state.lastPos) * (16 / dt); state.lastMovement = dist;
      if (dist > SHAKE_THRESHOLD) { scareCreatures(label); if (dist > CLEAN_THRESHOLD) poopsRef.current = poopsRef.current.filter(p => p.targetId !== label); }
    }
    state.lastPos = norm;
  };

  const scareCreatures = (l?: string) => birdsRef.current.forEach(b => { if (b.state !== CreatureState.FLYING_AWAY && (!l || b.targetId === l)) b.state = CreatureState.FLYING_AWAY; });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, part: keyof CustomBirdAssets) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setNewBirdAssets(prev => ({...prev, [part]: ev.target?.result as string}));
      reader.readAsDataURL(file);
    }
  };

  const updateTransform = (part: keyof CustomBirdTransforms, field: keyof PartTransform, val: number) => {
      setNewBirdTransforms(prev => ({ ...prev, [part]: { ...prev[part], [field]: isNaN(val) ? 0 : val } }));
  };

  const addOrUpdateBird = async () => {
    if (!newBirdName) return;
    const nb: CustomBirdConfig = { 
      id: editingId || Math.random().toString(36).substr(2,9), 
      name: newBirdName, assets: {...newBirdAssets}, transforms: {...newBirdTransforms}, globalScale: newBirdGlobalScale, globalRotation: newBirdGlobalRotation, flapAmplitude: newBirdFlapAmplitude, baseSize: newBirdBaseSize, sizeRange: newBirdSizeRange
    };
    
    // Persist to DB
    try {
      await saveBirdToDB(nb);
      if (editingId) setCustomBirds(prev => prev.map(b => b.id === editingId ? nb : b));
      else setCustomBirds(prev => [...prev, nb]);
      resetLab();
    } catch (e) { console.error("Failed to save DNA:", e); alert("Save failed. Disk full?"); }
  };

  const deleteBird = async (id: string) => {
    try {
      await deleteBirdFromDB(id);
      setCustomBirds(prev => prev.filter(b => b.id !== id));
    } catch (e) { console.error("Deletion failed:", e); }
  };

  const resetLab = () => {
    setNewBirdName(""); setNewBirdAssets({}); setNewBirdTransforms(defaultTransforms()); setNewBirdGlobalScale(1.0); setNewBirdGlobalRotation(0); setNewBirdFlapAmplitude(1.0); setEditingId(null);
  };

  const loadForEdit = (bird: CustomBirdConfig) => {
    setEditingId(bird.id); 
    setNewBirdName(bird.name); 
    setNewBirdAssets(bird.assets); 
    setNewBirdTransforms(bird.transforms); 
    setNewBirdGlobalScale(bird.globalScale); 
    setNewBirdGlobalRotation(bird.globalRotation || 0);
    setNewBirdFlapAmplitude(bird.flapAmplitude || 1.0);
    setLabTab('synthesize');
  };

  const exportDNA = (bird: CustomBirdConfig) => {
    const dnaCode = btoa(JSON.stringify(bird));
    navigator.clipboard.writeText(dnaCode).then(() => alert("DNA Code copied! Paste this on another device to clone this bird."));
  };

  const importDNA = () => {
    const code = prompt("Paste DNA Code here:");
    if (code) {
      try {
        const bird = JSON.parse(atob(code));
        bird.id = Math.random().toString(36).substr(2,9); // New ID for local
        saveBirdToDB(bird).then(() => setCustomBirds(prev => [...prev, bird]));
      } catch (e) { alert("Invalid DNA Code."); }
    }
  };

  const checkWipeInteraction = (contours: any) => {
    poopsRef.current = poopsRef.current.filter(poop => {
      const target = contours[poop.targetId]; if (!target) return true;
      const pPos = getPointOnPolyline(target, poop.offset);
      const wipers = ['Left', 'Right'].filter(w => w !== poop.targetId || (poop.targetId !== 'Left' && poop.targetId !== 'Right'));
      return !wipers.some(w => {
        const c = contours[w]; if (!c) return false;
        let cx=0, cy=0; c.forEach((p:any) => {cx+=p.x; cy+=p.y;}); cx/=c.length; cy/=c.length;
        return Math.sqrt((cx-pPos.x)**2 + (cy-(pPos.y+poop.scatterOffset))**2) < (limbStatesRef.current.get(w)?.width || 80) * 0.8;
      });
    });
  };

  const updateGlobalStatus = (s: Map<string, any>) => {
    let t = 0, move = 0, smiling = false;
    s.forEach((v) => { if (v.missingFrames < 10) t++; if (v.lastMovement > move) move = v.lastMovement; if (v.isSmiling) smiling = true; });
    if (t === 0) { setStatusMessage("Where are you? / 人呢？快出来陪我玩..."); return; }
    if (move > SHAKE_THRESHOLD) { setStatusMessage("Whoa! Too much movement! \n 哎呀！别晃得这么厉害，小鸟会怕！"); return; }
    setStatusMessage(birdsRef.current.filter(b => b.state !== CreatureState.FLYING_AWAY).length > 0 ? "Keep smiling and stay still! \n 保持微笑并定住，看它们多喜欢你！" : (smiling ? "Birds are coming! Stay still... \n 小鸟来啦！定住别动哦..." : "Smile to call the birds! \n 笑一笑，小鸟就会飞过来找你！"));
  };

  const drawPoops = (ctx: any, contours: any) => poopsRef.current.forEach(p => {
       const c = contours[p.targetId]; if (!c) return;
       const pos = getPointOnPolyline(c, p.offset);
       ctx.save(); ctx.translate(pos.x, pos.y + p.scatterOffset); ctx.rotate(p.rotation); ctx.scale(p.scale, p.scale);
       ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.moveTo(0,0); ctx.bezierCurveTo(5,-2,8,5,0,8); ctx.bezierCurveTo(-8,5,-5,-2,0,0); ctx.fill(); ctx.restore();
  });

  const updateAndDrawCreatures = (ctx: any, contours: any, w: number, h: number) => {
    birdsRef.current.forEach(b => {
      let t = contours[b.targetId] ? getPointOnPolyline(contours[b.targetId], b.perchOffset) : (b.state !== CreatureState.FLYING_AWAY ? {x:b.x, y:b.y} : null);
      if (b.justPooped) { poopsRef.current.push({ id: Math.random().toString(36).substr(2,9), targetId: b.targetId, offset: b.perchOffset, scale: (0.4+Math.random()*0.4), rotation: Math.random()*Math.PI*2, seed: Math.random(), scatterOffset: (Math.random()-0.5)*5 }); b.justPooped = false; }
      b.update(16, t, birdsRef.current); b.draw(ctx);
    });
    birdsRef.current = birdsRef.current.filter(b => b.x > -200 && b.x < w+200 && b.y > -200 && b.y < h+200);
  };

  const PartEditor = ({ label, part }: { label: string, part: keyof CustomBirdTransforms }) => (
      <div className="bg-zinc-800/60 p-5 rounded-[2rem] space-y-5 border border-white/5 pointer-events-auto">
          <div className="flex items-center justify-between">
              <span className="text-white text-[10px] font-black uppercase tracking-widest">{label} Refinement</span>
              <div className="flex gap-3">
                  <button onClick={() => updateTransform(part, 'rotate', newBirdTransforms[part].rotate - 15)} className="text-zinc-500 hover:text-white transition-colors"><RotateCcw className="w-3.5 h-3.5" /></button>
                  <button onClick={() => updateTransform(part, 'scale', 1)} className="text-zinc-500 hover:text-white transition-colors"><BoxSelect className="w-3.5 h-3.5" /></button>
              </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
              {[
                { field: 'x', label: 'X OFFSET', min: -80, max: 80 },
                { field: 'y', label: 'Y OFFSET', min: -80, max: 80 },
                { field: 'rotate', label: 'ROTATION', min: -360, max: 360 },
                { field: 'scale', label: 'SCALE', min: 0.1, max: 10.0, step: 0.01 }
              ].map(ctrl => (
                <div key={ctrl.field} className="space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-zinc-500 text-[8px] font-bold tracking-widest uppercase">{ctrl.label}</span>
                        <input type="number" step={ctrl.step || 1} value={newBirdTransforms[part][ctrl.field as keyof PartTransform]} onChange={(e) => updateTransform(part, ctrl.field as keyof PartTransform, parseFloat(e.target.value))} className="bg-zinc-900/50 border border-white/5 rounded px-2 py-0.5 text-teal-400 text-[9px] font-black w-14 text-right outline-none" />
                    </div>
                    <input 
                      type="range" 
                      min={ctrl.min} max={ctrl.max} step={ctrl.step || 0.1} 
                      value={newBirdTransforms[part][ctrl.field as keyof PartTransform]} 
                      onInput={(e) => updateTransform(part, ctrl.field as keyof PartTransform, parseFloat((e.target as HTMLInputElement).value))} 
                      className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-teal-400 pointer-events-auto relative z-50 block" 
                    />
                </div>
              ))}
          </div>
      </div>
  );

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans select-none">
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      <div className="absolute inset-0 pointer-events-none z-20 p-10 flex flex-col justify-between">
        <div className="flex justify-between items-start pointer-events-auto">
          <div className="bg-black/40 backdrop-blur-2xl px-6 py-3 rounded-2xl border border-white/10 text-white flex items-center gap-4 shadow-2xl">
            <div className={`w-3 h-3 rounded-full ${detectionActiveRef.current ? 'bg-teal-400 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="text-xs font-black tracking-widest uppercase">{detectionActiveRef.current ? 'SENSORS ONLINE' : 'SCANNING...'}</span>
          </div>
          <button onClick={() => setIsMirrored(!isMirrored)} className={`bg-black/40 backdrop-blur-2xl p-4 rounded-2xl border border-white/10 text-white transition-all hover:scale-110 active:scale-95 ${isMirrored ? 'text-teal-400 border-teal-400/30' : ''}`}>
            <FlipHorizontal className="w-6 h-6" />
          </button>
        </div>
        {isLoading && <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-50"><Loader2 className="w-12 h-12 animate-spin text-teal-400" /></div>}
        <div className="flex flex-col items-center gap-6">
          {!isLoading && isStatusVisible && statusMessage && (
            <div className="relative group pointer-events-auto">
              <div className="bg-zinc-900/90 backdrop-blur-3xl px-12 py-8 rounded-[3rem] text-white text-2xl font-black border border-white/10 shadow-2xl text-center max-w-3xl whitespace-pre-line leading-relaxed tracking-tight">{statusMessage}</div>
              <button onClick={() => setIsStatusVisible(false)} className="absolute -top-4 -right-4 w-10 h-10 bg-zinc-900 border border-white/20 rounded-full flex items-center justify-center text-white/40 hover:text-white opacity-0 group-hover:opacity-100 transition-all"><X className="w-5 h-5" /></button>
            </div>
          )}
        </div>
      </div>
      
      {spaceHoldProgress > 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.2)" strokeWidth="6" fill="transparent" />
              <circle cx="48" cy="48" r="40" stroke="#2dd4bf" strokeWidth="6" fill="transparent" strokeDasharray={2 * Math.PI * 40} strokeDashoffset={2 * Math.PI * 40 * (1 - spaceHoldProgress)} strokeLinecap="round" />
            </svg>
            <Settings2 className="absolute w-8 h-8 text-teal-400 animate-pulse" />
          </div>
        </div>
      )}

      {showAssetPanel && (
         <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-3xl flex items-center justify-center p-4 pointer-events-auto">
          <div className="bg-zinc-900 border border-white/10 w-full max-w-[95vw] rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[96vh] animate-in zoom-in-95 duration-300 pointer-events-auto">
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-zinc-800/30">
              <div className="flex items-center gap-8">
                <div className="flex items-center gap-3"><Sparkles className="w-8 h-8 text-teal-400" /><h2 className="text-xl font-black text-white uppercase tracking-tighter">DNA Laboratory</h2></div>
                <div className="flex bg-black/40 rounded-xl p-1 border border-white/5">
                    <button onClick={() => setLabTab('synthesize')} className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${labTab === 'synthesize' ? 'bg-zinc-800 text-teal-400 shadow-xl' : 'text-zinc-500'}`}>Synthesize</button>
                    <button onClick={() => setLabTab('blueprints')} className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${labTab === 'blueprints' ? 'bg-zinc-800 text-teal-400 shadow-xl' : 'text-zinc-500'}`}>Blueprints</button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={importDNA} className="bg-zinc-800 p-3 rounded-full text-teal-400 hover:bg-zinc-700 transition-all flex items-center gap-2 px-6"><Download className="w-5 h-5" /><span className="text-[10px] font-black uppercase tracking-widest">Import DNA</span></button>
                <button onClick={() => setShowAssetPanel(false)} className="bg-zinc-800 p-3 rounded-full text-zinc-400 hover:text-white transition-all hover:rotate-90"><X className="w-6 h-6" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-10">
              {labTab === 'synthesize' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 h-full">
                      <div className="space-y-10">
                        <div className="grid grid-cols-4 gap-4">
                          {(['head', 'body', 'wingsFront', 'wingsBack'] as const).map(part => (
                            <div key={part} className="space-y-2">
                              <label className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">{part.replace('wings', 'wing ')}</label>
                              <label className="relative block aspect-square bg-zinc-900 border-2 border-dashed border-white/5 rounded-3xl cursor-pointer hover:border-teal-400/30 transition-all group overflow-hidden">
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, part)} />
                                {newBirdAssets[part] ? <img src={newBirdAssets[part]} className="w-full h-full object-contain p-3" /> : <div className="absolute inset-0 flex items-center justify-center text-zinc-600 group-hover:text-teal-400 transition-colors"><Upload className="w-7 h-7" /></div>}
                              </label>
                            </div>
                          ))}
                        </div>

                        {Object.keys(newBirdAssets).length > 0 && (
                            <div className="space-y-6 pt-6 border-t border-white/5">
                                <PartEditor label="Head" part="head" />
                                <PartEditor label="Body" part="body" />
                                <PartEditor label="Wing Front" part="wingsFront" />
                                <PartEditor label="Wing Back" part="wingsBack" />
                                
                                <div className="grid grid-cols-3 gap-4 pointer-events-auto">
                                    <div className="bg-zinc-800/40 p-5 rounded-[2rem] border border-white/5 space-y-4 pointer-events-auto">
                                        <div className="flex justify-between items-center"><span className="text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Maximize className="w-3 h-3" /> Size</span><input type="number" step="0.01" value={newBirdGlobalScale} onChange={(e) => setNewBirdGlobalScale(parseFloat(e.target.value))} className="bg-zinc-900/50 border border-white/5 rounded px-2 py-0.5 text-teal-400 text-[10px] font-black w-16 text-right outline-none" /></div>
                                        <input type="range" min="0.1" max="10.0" step="0.01" value={newBirdGlobalScale} onInput={(e) => setNewBirdGlobalScale(parseFloat((e.target as HTMLInputElement).value))} className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-teal-400 pointer-events-auto" />
                                    </div>
                                    <div className="bg-zinc-800/40 p-5 rounded-[2rem] border border-white/5 space-y-4 pointer-events-auto">
                                        <div className="flex justify-between items-center"><span className="text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><RotateCcw className="w-3 h-3" /> Rotate</span><input type="number" step="1" value={newBirdGlobalRotation} onChange={(e) => setNewBirdGlobalRotation(parseFloat(e.target.value))} className="bg-zinc-900/50 border border-white/5 rounded px-2 py-0.5 text-teal-400 text-[10px] font-black w-16 text-right outline-none" /></div>
                                        <input type="range" min="-180" max="180" step="1" value={newBirdGlobalRotation} onInput={(e) => setNewBirdGlobalRotation(parseFloat((e.target as HTMLInputElement).value))} className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-teal-400 pointer-events-auto" />
                                    </div>
                                    <div className="bg-zinc-800/40 p-5 rounded-[2rem] border border-white/5 space-y-4 pointer-events-auto">
                                        <div className="flex justify-between items-center"><span className="text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Zap className="w-3 h-3" /> Flap</span><input type="number" step="0.01" value={newBirdFlapAmplitude} onChange={(e) => setNewBirdFlapAmplitude(parseFloat(e.target.value))} className="bg-zinc-900/50 border border-white/5 rounded px-2 py-0.5 text-teal-400 text-[10px] font-black w-16 text-right outline-none" /></div>
                                        <input type="range" min="0.0" max="3.0" step="0.01" value={newBirdFlapAmplitude} onInput={(e) => setNewBirdFlapAmplitude(parseFloat((e.target as HTMLInputElement).value))} className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-teal-400 pointer-events-auto" />
                                    </div>
                                </div>
                            </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-10">
                        <div className="flex-1 bg-zinc-950 rounded-[3.5rem] border border-white/5 relative flex flex-col items-center justify-center p-10 overflow-hidden shadow-inner min-h-[400px]">
                            <canvas ref={previewCanvasRef} width={600} height={600} className="w-full max-w-[450px] aspect-square" />
                            <div className="absolute top-10 right-10 flex flex-col items-end gap-1"><span className="text-white/20 text-[8px] font-black tracking-[0.4em] uppercase">Fusion Preview</span><div className="h-0.5 w-16 bg-teal-400/20 rounded-full overflow-hidden"><div className="h-full w-1/3 bg-teal-400 animate-[shimmer_2s_infinite]" /></div></div>
                        </div>
                        <div className="bg-zinc-800/30 p-10 rounded-[3rem] border border-white/5 space-y-8 shadow-2xl">
                            <div className="space-y-2"><label className="text-zinc-500 text-[10px] font-black uppercase tracking-widest ml-1">{editingId ? 'Modify biological signature' : 'New biological signature'}</label><input type="text" value={newBirdName} onChange={(e) => setNewBirdName(e.target.value)} placeholder="Species Name..." className="w-full bg-zinc-900/80 border border-white/10 rounded-2xl px-8 py-5 text-white font-bold outline-none focus:border-teal-400/50 transition-all placeholder:text-zinc-700" /></div>
                            <div className="flex gap-4">
                                {editingId && <button onClick={resetLab} className="flex-1 bg-zinc-800 text-white font-black py-6 rounded-2xl transition-all uppercase tracking-widest text-xs">Cancel Edit</button>}
                                <button onClick={addOrUpdateBird} disabled={!newBirdName || Object.keys(newBirdAssets).length === 0} className="flex-[2] bg-teal-500 hover:bg-teal-400 disabled:opacity-10 text-zinc-900 font-black py-6 rounded-2xl shadow-2xl transition-all active:scale-[0.98] uppercase tracking-[0.2em] text-xs">{editingId ? 'Update DNA Structure' : 'Authorize DNA Sequence'}</button>
                            </div>
                        </div>
                        {customBirds.length > 0 && (
                            <div className="space-y-4"><h3 className="text-zinc-600 text-[10px] font-black uppercase tracking-widest px-2">Stored Population ({customBirds.length})</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    {customBirds.map(bird => (
                                        <div key={bird.id} className="bg-zinc-800/40 p-4 rounded-3xl border border-white/5 flex items-center justify-between group hover:bg-zinc-800/60 transition-all">
                                            <div className="flex items-center gap-4"><div className="w-12 h-12 bg-zinc-950 rounded-xl overflow-hidden p-1 border border-white/5">{bird.assets.body && <img src={bird.assets.body} className="w-full h-full object-contain" />}</div><div><div className="text-white text-xs font-black tracking-tight">{bird.name}</div><div className="text-zinc-500 text-[9px] font-bold">DNA Scale: {bird.globalScale.toFixed(1)}x</div></div></div>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                <button onClick={() => loadForEdit(bird)} className="text-zinc-700 hover:text-teal-400 transition-colors p-2"><Edit2 className="w-4 h-4" /></button>
                                                <button onClick={() => exportDNA(bird)} className="text-zinc-700 hover:text-blue-400 transition-colors p-2"><Share2 className="w-4 h-4" /></button>
                                                <button onClick={() => deleteBird(bird.id)} className="text-zinc-700 hover:text-rose-400 transition-colors p-2"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                      </div>
                  </div>
              ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 animate-in fade-in duration-700">{Object.keys(SPECIES_CONFIG).map(species => <SpeciesBlueprint key={species} species={species} />)}</div>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{` 
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } } 
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; } 
        input[type=range] { -webkit-appearance: none; cursor: pointer; background: transparent; width: 100%; display: block; position: relative; z-index: 60; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 32px; width: 32px; border-radius: 50%; background: #2dd4bf; cursor: grab; margin-top: -12px; border: 4px solid #18181b; box-shadow: 0 6px 15px rgba(0,0,0,0.6); position: relative; pointer-events: auto; }
        input[type=range]::-webkit-slider-thumb:active { cursor: grabbing; transform: scale(1.15); background: #5eead4; }
        input[type=range]::-webkit-slider-runnable-track { width: 100%; height: 8px; cursor: pointer; background: #3f3f46; border-radius: 6px; }
      `}</style>
    </div>
  );
};
export default HandAR;
