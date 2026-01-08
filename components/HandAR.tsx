import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bird } from './Bird';
import { Butterfly } from './Butterfly';
import { CreatureState, CustomBirdConfig, CreatureCategory } from '../types';
import { getDistance, lerp } from '../utils/geometry';
import { PRESET_BIRDS, ASSET_LIBRARY } from '../constants';
import { saveBirdToDB, getAllBirdsFromDB, deleteBirdFromDB } from '../utils/db';
import { 
  X, Settings2, Sparkles, Trash2, Edit2, Zap, RefreshCw, Smile, ZapOff
} from 'lucide-react';

declare global { interface Window { FaceMesh: any; Camera: any; } }

type LimbStateData = { 
  rawPoints: Record<string, {x: number, y: number}>;
  missingFrames: number;
  centroid: {x: number, y: number};
  velocity: number;
};

const createInitialLimbState = (): LimbStateData => ({ 
  rawPoints: {}, missingFrames: 0, centroid: {x: 0, y: 0}, velocity: 0 
});

// Sensitivity config
const VELOCITY_SMOOTHING = 0.7; 
const MOVEMENT_DEADZONE = 2.0;  

const THRESHOLDS: Record<string, number> = {
  'Head': 15.0,
  'Shoulders': 20.0
};

const HandAR: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAssetPanel, setShowAssetPanel] = useState(false);
  const [customCreatures, setCustomCreatures] = useState<CustomBirdConfig[]>([]);
  const customCreaturesRef = useRef<CustomBirdConfig[]>([]);
  const [anySmile, setAnySmile] = useState(false);

  const [activeCategory, setActiveCategory] = useState<CreatureCategory>('bird');
  const [newName, setNewName] = useState("");
  const [mainAsset, setMainAsset] = useState<string>(ASSET_LIBRARY[0].url);
  const [newGlobalScale, setNewGlobalScale] = useState(1.5);
  const [newGlobalRotation, setNewGlobalRotation] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const creaturesRef = useRef<any[]>([]);
  const limbStatesRef = useRef<Map<string, LimbStateData>>(new Map());
  const faceMeshRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  
  // Track last spawn time per targetId to avoid flood
  const lastSpawnTimesRef = useRef<Map<string, number>>(new Map());

  const getCurrentEphemeralConfig = (id: string, name: string): CustomBirdConfig => ({
    id, category: activeCategory, name: name || 'Spirit', mainAsset, 
    globalScale: newGlobalScale, globalRotation: newGlobalRotation, 
    flapAmplitude: 1.0, baseSize: 80, sizeRange: 0.6, 
    isSpriteSheet: true, frameCount: 25, frameRate: 24
  });

  const spawnCreature = useCallback((targetId: string) => {
    const pool = customCreaturesRef.current;
    if (pool.length === 0 || !canvasRef.current) return;
    const cfg = pool[Math.floor(Math.random() * pool.length)];
    const randomOffset = 0.1 + Math.random() * 0.8;
    const creature = cfg.category === 'butterfly' 
      ? new Butterfly(canvasRef.current.width, canvasRef.current.height, targetId, randomOffset, cfg) 
      : new Bird(canvasRef.current.width, canvasRef.current.height, 100, targetId, randomOffset, [cfg]);
    creaturesRef.current.push(creature);
  }, []);

  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();
    const render = (time: number) => {
      const dt = Math.min(time - lastTime, 100); 
      lastTime = time;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const video = videoRef.current;
      if (!canvas || !ctx || !video || video.readyState < 2) { 
        frameId = requestAnimationFrame(render); 
        return; 
      }
      
      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      }
      
      ctx.save();
      const ratio = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      const dw = video.videoWidth * ratio, dh = video.videoHeight * ratio;
      const ox = (canvas.width - dw) / 2, oy = (canvas.height - dh) / 2;
      ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
      ctx.drawImage(video, ox, oy, dw, dh);
      ctx.restore();

      // Update and Draw
      creaturesRef.current = creaturesRef.current.filter(c => {
        let targetPoint = null;
        const state = limbStatesRef.current.get(c.targetId);
        
        if (state && state.missingFrames < 30) {
          const t = c.perchOffset;
          // Perch logic for Face-based targets
          if (c.targetId.includes('Head')) {
            const { earL, earR } = state.rawPoints;
            if (earL && earR) {
              const faceWidth = getDistance(earL, earR);
              const tx = lerp(earL.x, earR.x, t);
              const baseTy = lerp(earL.y, earR.y, t) - faceWidth * 0.45;
              const archY = Math.sin(t * Math.PI) * faceWidth * 0.35;
              targetPoint = { x: tx, y: baseTy - archY };
            }
          } else if (c.targetId.includes('Shoulders')) {
            const { shoulderL, shoulderR } = state.rawPoints;
            if (shoulderL && shoulderR) {
              const shoulderVec = { x: shoulderR.x - shoulderL.x, y: shoulderR.y - shoulderL.y };
              let nx = shoulderVec.y, ny = -shoulderVec.x;
              const len = Math.sqrt(nx * nx + ny * ny);
              if (len > 0) { nx /= len; ny /= len; }
              const baseX = lerp(shoulderL.x, shoulderR.x, t);
              const baseY = lerp(shoulderL.y, shoulderR.y, t);
              const shoulderWidth = getDistance(shoulderL, shoulderR);
              const offset = shoulderWidth * 0.15;
              targetPoint = { x: baseX + nx * offset, y: baseY + ny * offset };
            }
          }
        } else {
          if (state && state.missingFrames > 60 && c.state !== CreatureState.FLYING_AWAY) {
            c.state = CreatureState.FLYING_AWAY;
          }
        }

        c.update(dt, targetPoint, creaturesRef.current);
        c.draw(ctx);
        
        const isOffScreen = (
          c.y < -500 || 
          c.y > canvas.height + 500 || 
          c.x < -500 || 
          c.x > canvas.width + 500
        );
        return !(c.state === CreatureState.FLYING_AWAY && isOffScreen);
      });

      frameId = requestAnimationFrame(render);
    };
    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [spawnCreature]);

  const onResults = useCallback((results: any) => {
    const canvas = canvasRef.current;
    if (!canvas || !results.multiFaceLandmarks) return;
    const ratio = Math.max(canvas.width / 1280, canvas.height / 720); // Using standard camera res
    const dw = 1280 * ratio, dh = 720 * ratio;
    const ox = (canvas.width - dw) / 2, oy = (canvas.height - dh) / 2;
    const toPx = (l: any) => ({ x: (1.0 - l.x) * dw + ox, y: l.y * dh + oy });
    
    const seenThisFrame = new Set<string>();
    let anyFaceSmiling = false;

    results.multiFaceLandmarks.forEach((landmarks: any[], faceIndex: number) => {
      // Smile Detection
      const mouthL = landmarks[61], mouthR = landmarks[291];
      const faceL = landmarks[234], faceR = landmarks[454];
      const widthRatio = getDistance(mouthL, mouthR) / getDistance(faceL, faceR);
      const isFaceSmiling = widthRatio > 0.44; 
      if (isFaceSmiling) anyFaceSmiling = true;

      // Update Head State
      const headId = `Face_${faceIndex}_Head`;
      seenThisFrame.add(headId);
      const earL = toPx(landmarks[234]), earR = toPx(landmarks[454]);
      updateLimbState(headId, { x: (earL.x + earR.x)/2, y: (earL.y + earR.y)/2 }, { earL, earR }, 'Head');

      // Estimate Shoulders based on head
      const shoulderId = `Face_${faceIndex}_Shoulders`;
      seenThisFrame.add(shoulderId);
      const chin = toPx(landmarks[152]);
      const forehead = toPx(landmarks[10]);
      const faceHeight = getDistance(forehead, chin);
      const faceWidth = getDistance(earL, earR);
      
      const shoulderL = { x: chin.x - faceWidth * 0.7, y: chin.y + faceHeight * 0.4 };
      const shoulderR = { x: chin.x + faceWidth * 0.7, y: chin.y + faceHeight * 0.4 };
      updateLimbState(shoulderId, { x: chin.x, y: chin.y + faceHeight * 0.4 }, { shoulderL, shoulderR }, 'Shoulders');

      // Spawn logic per smiling face
      if (isFaceSmiling && creaturesRef.current.length < 50) {
        const now = performance.now();
        const lastHeadSpawn = lastSpawnTimesRef.current.get(headId) || 0;
        if (now - lastHeadSpawn > 1000) {
          const count = Math.floor(Math.random() * 2) + 1;
          for(let i=0; i<count; i++) {
            spawnCreature(Math.random() > 0.5 ? headId : shoulderId);
          }
          lastSpawnTimesRef.current.set(headId, now);
        }
      }
    });

    setAnySmile(anyFaceSmiling);

    function updateLimbState(label: string, nCentroid: {x: number, y: number}, rawPoints: any, category: string) {
      if (!limbStatesRef.current.has(label)) limbStatesRef.current.set(label, createInitialLimbState());
      const s = limbStatesRef.current.get(label)!;
      
      const isNewOrReappearing = s.missingFrames > 5 || (s.centroid.x === 0 && s.centroid.y === 0);
      if (!isNewOrReappearing) {
        const rawDiff = getDistance(s.centroid, nCentroid);
        const diff = rawDiff < MOVEMENT_DEADZONE ? 0 : rawDiff - MOVEMENT_DEADZONE;
        s.velocity = s.velocity * VELOCITY_SMOOTHING + diff * (1 - VELOCITY_SMOOTHING);
        
        const threshold = THRESHOLDS[category] || 40.0;
        if (s.velocity > threshold) {
          creaturesRef.current.forEach(c => { 
            if (c.targetId === label && c.state !== CreatureState.FLYING_AWAY) {
              c.state = CreatureState.FLYING_AWAY; 
            }
          });
        }
      } else {
        s.velocity = 0;
      }
      s.centroid = nCentroid;
      s.rawPoints = rawPoints;
      s.missingFrames = 0;
    }

    limbStatesRef.current.forEach((s, l) => { if (!seenThisFrame.has(l)) s.missingFrames++; });
  }, [spawnCreature]);

  useEffect(() => {
    const init = async () => {
      try {
        const faceMesh = new window.FaceMesh({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
        faceMesh.setOptions({ 
          maxNumFaces: 4, 
          refineLandmarks: true, 
          minDetectionConfidence: 0.5, 
          minTrackingConfidence: 0.5 
        });
        faceMesh.onResults(onResults); faceMeshRef.current = faceMesh;
        if (videoRef.current) {
          cameraRef.current = new window.Camera(videoRef.current, {
            onFrame: async () => { if (faceMeshRef.current) await faceMeshRef.current.send({ image: videoRef.current! }); },
            width: 1280, height: 720
          });
          cameraRef.current.start();
        }
        const existing = await getAllBirdsFromDB();
        if (existing.length === 0) { 
          for (const p of PRESET_BIRDS) await saveBirdToDB(p); 
          customCreaturesRef.current = await getAllBirdsFromDB(); 
        } else { customCreaturesRef.current = existing; }
        setCustomCreatures(customCreaturesRef.current); setIsLoading(false);
      } catch (e) { console.error("FaceMesh Failed", e); }
    };
    init();
  }, [onResults]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !showAssetPanel) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cfg = getCurrentEphemeralConfig(editingId || 'preview', newName);
    const preview = cfg.category === 'butterfly' 
      ? new Butterfly(canvas.width, canvas.height, 'none', 0.5, cfg) 
      : new Bird(canvas.width, canvas.height, 100, 'none', 0.5, [cfg]);
    let reqId: number;
    const renderPreview = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      preview.x = canvas.width / 2; preview.y = canvas.height / 2; preview.state = CreatureState.PERCHED;
      preview.update(16, { x: canvas.width / 2, y: canvas.height / 2 }, []);
      preview.draw(ctx);
      reqId = requestAnimationFrame(renderPreview);
    };
    reqId = requestAnimationFrame(renderPreview);
    return () => cancelAnimationFrame(reqId);
  }, [newGlobalScale, newGlobalRotation, mainAsset, showAssetPanel, activeCategory, newName, editingId]);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none">
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />
      {isLoading && (
        <div className="absolute inset-0 z-[100] bg-black flex flex-col items-center justify-center text-teal-400 font-mono tracking-[0.5em] animate-pulse">
          <RefreshCw className="animate-spin mb-4" /> INITIALIZING MULTI-FACE SENSORS
        </div>
      )}
      <div className="absolute inset-x-0 top-0 p-6 flex justify-between items-start pointer-events-none z-20">
        <div className={`px-4 py-2 rounded-xl border pointer-events-auto backdrop-blur-xl transition-all duration-500 ${anySmile ? 'bg-teal-500/10 border-teal-400/40 text-teal-300' : 'bg-black/40 border-white/5 text-zinc-600'}`}>
          <div className="flex items-center gap-3">{anySmile ? <Smile className="animate-pulse" /> : <ZapOff className="opacity-40" />}<span className="text-[10px] font-black uppercase tracking-widest">{anySmile ? 'SUMMONING...' : 'SMILE TO SUMMON'}</span></div>
        </div>
        <button onClick={() => setShowAssetPanel(true)} className="bg-black/40 p-4 rounded-2xl border border-white/10 text-teal-400 pointer-events-auto hover:bg-white/10 transition-colors shadow-xl backdrop-blur-md"><Settings2 /></button>
      </div>

      {showAssetPanel && (
        <div className="absolute inset-0 z-40 bg-black/95 backdrop-blur-3xl flex items-center justify-center p-8 animate-in fade-in duration-300" onClick={() => setShowAssetPanel(false)}>
          <div className="bg-zinc-900 border border-white/10 w-full max-w-[1000px] rounded-[2.5rem] flex flex-col h-[85vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-white/5 flex justify-between items-center shrink-0">
              <h2 className="text-white font-black uppercase tracking-widest flex items-center gap-4"><Sparkles className="text-teal-400" /> SPECIES EDITOR</h2>
              <button onClick={() => setShowAssetPanel(false)} className="bg-zinc-800 p-2 rounded-full text-zinc-400 hover:text-white transition-colors"><X /></button>
            </div>
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 overflow-y-auto p-10 space-y-10 bg-black/20 custom-scrollbar">
                <div className="flex gap-4">
                  <button onClick={() => setActiveCategory('bird')} className={`px-8 py-4 rounded-2xl border uppercase text-[11px] font-black transition-all ${activeCategory === 'bird' ? 'bg-teal-400 border-teal-400 text-black shadow-lg scale-105' : 'border-white/10 text-zinc-500 hover:text-white'}`}>Bird</button>
                  <button onClick={() => setActiveCategory('butterfly')} className={`px-8 py-4 rounded-2xl border uppercase text-[11px] font-black transition-all ${activeCategory === 'butterfly' ? 'bg-teal-400 border-teal-400 text-black shadow-lg scale-105' : 'border-white/10 text-zinc-500 hover:text-white'}`}>Butterfly</button>
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">BASE SCALE</label>
                    <input type="range" min="0.5" max="5" step="0.1" value={newGlobalScale} onInput={(e) => setNewGlobalScale(parseFloat((e.target as HTMLInputElement).value))} className="w-full accent-teal-400" />
                  </div>
                  <div className="space-y-4">
                    <label className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">SPRITE ROTATION</label>
                    <input type="range" min="-180" max="180" value={newGlobalRotation} onInput={(e) => setNewGlobalRotation(parseFloat((e.target as HTMLInputElement).value))} className="w-full accent-teal-400" />
                  </div>
                </div>
                <div className="flex gap-4">
                  <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Enter Name..." className="flex-1 bg-black/60 border border-white/10 rounded-2xl px-6 py-5 text-white uppercase font-black tracking-widest outline-none focus:border-teal-400 transition-colors" />
                  <button onClick={async () => {
                    const cfg = getCurrentEphemeralConfig(editingId || Math.random().toString(36).substr(2,9), newName);
                    await saveBirdToDB(cfg); const l = await getAllBirdsFromDB(); setCustomCreatures(l); customCreaturesRef.current = l; setEditingId(null); setNewName("");
                  }} className="px-12 bg-teal-400 hover:bg-teal-300 text-black font-black uppercase text-[12px] rounded-2xl shadow-xl transition-all"><Zap className="inline mr-2 w-5 h-5" /> UPDATE DNA</button>
                </div>
              </div>
              <div className="w-[380px] border-l border-white/10 p-10 flex flex-col bg-zinc-950">
                <div className="aspect-square bg-black rounded-[2rem] border border-white/5 mb-10 flex items-center justify-center overflow-hidden relative shadow-inner group">
                  <canvas ref={previewCanvasRef} width={300} height={300} className="w-full h-full pointer-events-none group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute bottom-4 inset-x-0 text-center text-[8px] text-zinc-600 font-black uppercase tracking-widest">Physics Preview</div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar">
                  {customCreatures.map(c => (
                    <div key={c.id} className={`p-5 rounded-2xl flex items-center justify-between border transition-all ${editingId === c.id ? 'bg-teal-400/10 border-teal-400/40' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                       <span className="text-white font-black text-[11px] uppercase tracking-wider truncate">{c.name}</span>
                       <div className="flex gap-2">
                         <button onClick={() => { setEditingId(c.id); setNewName(c.name); setActiveCategory(c.category); setMainAsset(c.mainAsset); setNewGlobalScale(c.globalScale); setNewGlobalRotation(c.globalRotation); }} className="p-2.5 text-zinc-500 hover:text-teal-400 transition-colors"><Edit2 className="w-4 h-4"/></button>
                         <button onClick={() => deleteBirdFromDB(c.id).then(() => getAllBirdsFromDB()).then(l => { setCustomCreatures(l); customCreaturesRef.current = l; })} className="p-2.5 text-zinc-500 hover:text-rose-400 transition-colors"><Trash2 className="w-4 h-4"/></button>
                       </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        input[type=range] { -webkit-appearance: none; background: #111; height: 4px; border-radius: 2px; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%; background: #2dd4bf; cursor: pointer; box-shadow: 0 0 10px rgba(45,212,191,0.5); }
      `}</style>
    </div>
  );
};
export default HandAR;