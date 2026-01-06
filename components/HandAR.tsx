
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bird } from './Bird';
import { CreatureState, CustomBirdConfig, CustomBirdTransforms, PartTransform } from '../types';
import { getDistance, getUpperHandHull, getPointOnPolyline } from '../utils/geometry';
import { PRESET_BIRDS, FIXED_ASSET_URLS } from '../constants';
import { saveBirdToDB, getAllBirdsFromDB, deleteBirdFromDB } from '../utils/db';
import { 
  FlipHorizontal, 
  X, 
  Settings2, 
  Sparkles, 
  Trash2, 
  Edit2, 
  Zap, 
  RefreshCw,
  Camera,
  ChevronDown,
  Smile,
  Circle,
  ZapOff
} from 'lucide-react';

declare global { interface Window { Holistic: any; } }

type LimbStateData = { 
  width: number; 
  prevContour: {x: number, y: number}[]; 
  missingFrames: number;
  centroid: {x: number, y: number};
  velocity: number;
};

const createInitialLimbState = (): LimbStateData => ({ 
  width: 0, prevContour: [], missingFrames: 0, centroid: {x: 0, y: 0}, velocity: 0 
});

const defaultPart = (): PartTransform => ({ x: 0, y: 0, rotate: 0, scale: 1 });
const defaultTransforms = (): CustomBirdTransforms => ({ head: defaultPart(), body: defaultPart(), wingsFront: defaultPart(), wingsBack: defaultPart() });

const SHAKE_EXIT_THRESHOLD = 22.0; 

const HandAR: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isMirrored, setIsMirrored] = useState(true);
  const [showAssetPanel, setShowAssetPanel] = useState(false);
  const [customBirds, setCustomBirds] = useState<CustomBirdConfig[]>([]);
  const customBirdsRef = useRef<CustomBirdConfig[]>([]);
  
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [showCamMenu, setShowCamMenu] = useState(false);

  // Reactive state for UI updates
  const [isSmiling, setIsSmiling] = useState(false);
  const [smileIntensity, setSmileIntensity] = useState(0);

  // DNA Lab State
  const [newBirdName, setNewBirdName] = useState("");
  const [newBirdAssets, setNewBirdAssets] = useState<Record<string, string>>({
    head: FIXED_ASSET_URLS[2],
    body: FIXED_ASSET_URLS[0],
    wingsFront: FIXED_ASSET_URLS[1],
    wingsBack: FIXED_ASSET_URLS[1]
  });
  const [newBirdTransforms, setNewBirdTransforms] = useState<CustomBirdTransforms>(defaultTransforms());
  const [newBirdGlobalScale, setNewBirdGlobalScale] = useState(1.0);
  const [newBirdGlobalRotation, setNewBirdGlobalRotation] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const birdsRef = useRef<Bird[]>([]);
  const limbStatesRef = useRef<Map<string, LimbStateData>>(new Map());
  const holisticRef = useRef<any>(null);
  const isProcessingRef = useRef(false);
  const isSmilingRef = useRef(false);
  const lastSpawnTimeRef = useRef(0);

  // High-performance Render loop
  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const video = videoRef.current;
      if (!canvas || !ctx || !video || video.readyState < 2) {
        frameId = requestAnimationFrame(render);
        return;
      }

      ctx.save();
      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const ratio = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      const dw = video.videoWidth * ratio, dh = video.videoHeight * ratio;
      const ox = (canvas.width - dw) / 2, oy = (canvas.height - dh) / 2;

      if (isMirrored) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, ox, oy, dw, dh);

      // SPAWN LOGIC: ONLY IF SMILING
      if (isSmilingRef.current) {
        if (time - lastSpawnTimeRef.current > 750) {
          const availableTargets = Array.from(limbStatesRef.current.keys()).filter(l => limbStatesRef.current.get(l)!.missingFrames < 15);
          if (availableTargets.length > 0) {
            const targetId = availableTargets[Math.floor(Math.random() * availableTargets.length)];
            birdsRef.current.push(new Bird(canvas.width, canvas.height, 100, targetId, undefined, customBirdsRef.current));
            lastSpawnTimeRef.current = time;
          }
        }
      } else {
        lastSpawnTimeRef.current = time - 500; 
      }

      const latestContours: Record<string, any[]> = {};
      limbStatesRef.current.forEach((s, l) => { latestContours[l] = s.prevContour; });

      birdsRef.current = birdsRef.current.filter(b => {
        const targetPoint = latestContours[b.targetId] ? getPointOnPolyline(latestContours[b.targetId], b.perchOffset) : null;
        b.update(dt, targetPoint, birdsRef.current);
        b.draw(ctx);
        return !(b.state === CreatureState.FLYING_AWAY && (b.y < -300 || b.y > canvas.height + 300 || b.x < -300 || b.x > canvas.width + 300));
      });

      ctx.restore();
      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [isMirrored]);

  const onResults = useCallback((results: any) => {
    isProcessingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas || !results.image) return;

    const ratio = Math.max(canvas.width / results.image.width, canvas.height / results.image.height);
    const dw = results.image.width * ratio, dh = results.image.height * ratio;
    const ox = (canvas.width - dw) / 2, oy = (canvas.height - dh) / 2;
    const toPx = (l: any) => ({ x: l.x * dw + ox, y: l.y * dh + oy });
    const seenThisFrame = new Set<string>();

    // SMILE DETECTION
    if (results.faceLandmarks) {
      const mouthL = results.faceLandmarks[61];
      const mouthR = results.faceLandmarks[291];
      const upperLip = results.faceLandmarks[0];
      const faceL = results.faceLandmarks[234];
      const faceR = results.faceLandmarks[454];
      
      if (mouthL && mouthR && upperLip && faceL && faceR) {
        const mouthWidth = getDistance(mouthL, mouthR);
        const faceWidth = getDistance(faceL, faceR);
        const widthRatio = mouthWidth / faceWidth;
        const cornerAvgY = (mouthL.y + mouthR.y) / 2;
        const liftFactor = (upperLip.y - cornerAvgY) * 10;

        const rawIntensity = Math.max(0, (widthRatio - 0.35) * 10 + liftFactor);
        const intensity = Math.min(1, rawIntensity);
        
        const currentlySmiling = (widthRatio > 0.40) || (widthRatio > 0.36 && liftFactor > 0.08);
        
        isSmilingRef.current = currentlySmiling;
        setIsSmiling(currentlySmiling);
        setSmileIntensity(intensity);
      }
    } else {
      isSmilingRef.current = false;
      setIsSmiling(false);
      setSmileIntensity(0);
    }

    const processLimb = (landmarks: any, label: string, type: 'head' | 'shoulder' | 'hand') => {
      if (!landmarks || (Array.isArray(landmarks) && landmarks.length === 0)) return;
      seenThisFrame.add(label);
      if (!limbStatesRef.current.has(label)) limbStatesRef.current.set(label, createInitialLimbState());
      const state = limbStatesRef.current.get(label)!;
      const px = Array.isArray(landmarks) ? landmarks.map(toPx) : [];
      let nCentroid = { x: 0, y: 0 };
      let nContour: {x: number, y: number}[] = [];

      if (type === 'head') {
        const top = toPx(results.faceLandmarks[10]);
        const lS = toPx(results.faceLandmarks[332]);
        const rS = toPx(results.faceLandmarks[103]);
        nCentroid = top;
        nContour = [lS, {x: top.x, y: top.y - 12}, rS];
        state.width = getDistance(lS, rS) * 1.5;
      } else if (type === 'shoulder') {
        const isLeft = label === 'LeftShoulder';
        const sIdx = isLeft ? 11 : 12;
        const oIdx = isLeft ? 12 : 11;
        const s = toPx(landmarks[sIdx]);
        const o = toPx(landmarks[oIdx]);
        const neck = { x: (s.x + o.x) / 2, y: (s.y + o.y) / 2 };
        const vx = s.x - neck.x;
        const vy = s.y - neck.y;
        const outerPoint = { x: s.x + vx * 0.3, y: s.y + vy * 0.2 };
        const innerPoint = { x: s.x - vx * 0.5, y: s.y - vy * 0.5 };
        nCentroid = s;
        nContour = [innerPoint, s, outerPoint];
        state.width = getDistance(innerPoint, outerPoint);
      } else if (type === 'hand') {
        nCentroid = px[0];
        nContour = getUpperHandHull(px);
        state.width = getDistance(px[5], px[17]) * 3;
      }

      const m = getDistance(state.centroid, nCentroid);
      state.velocity = state.velocity * 0.7 + m * 0.3;
      state.centroid = nCentroid;
      
      if (state.velocity > SHAKE_EXIT_THRESHOLD) {
        birdsRef.current.forEach(b => { if (b.targetId === label) b.state = CreatureState.FLYING_AWAY; });
      }
      state.prevContour = nContour;
      state.missingFrames = 0;
    };

    processLimb(results.faceLandmarks, 'Head', 'head');
    if (results.poseLandmarks) {
      if (results.poseLandmarks[11].visibility > 0.5) processLimb(results.poseLandmarks, 'LeftShoulder', 'shoulder');
      if (results.poseLandmarks[12].visibility > 0.5) processLimb(results.poseLandmarks, 'RightShoulder', 'shoulder');
    }
    processLimb(results.leftHandLandmarks, 'LeftHand', 'hand');
    processLimb(results.rightHandLandmarks, 'RightHand', 'hand');

    limbStatesRef.current.forEach((s, l) => { if (!seenThisFrame.has(l)) s.missingFrames++; });
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            deviceId: selectedCamera ? { exact: selectedCamera } : undefined,
            width: { ideal: 1920 }, height: { ideal: 1080 } 
          } 
        });
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const devs = await navigator.mediaDevices.enumerateDevices();
        setCameras(devs.filter(d => d.kind === 'videoinput'));
        while (!window.Holistic && active) await new Promise(r => setTimeout(r, 100));
        if (!active) return;
        const holistic = new window.Holistic({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${f}` });
        holistic.setOptions({ modelComplexity: 0, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        holistic.onResults(onResults);
        holisticRef.current = holistic;
        
        const existing = await getAllBirdsFromDB();
        if (existing.length === 0) {
           for (const p of PRESET_BIRDS) await saveBirdToDB(p);
           customBirdsRef.current = await getAllBirdsFromDB();
        } else {
           customBirdsRef.current = existing;
        }
        setCustomBirds(customBirdsRef.current);
        setIsLoading(false);
        const loop = async () => {
          if (!active) return;
          if (!isProcessingRef.current && videoRef.current?.readyState >= 2) {
            isProcessingRef.current = true;
            try { await holisticRef.current.send({ image: videoRef.current }); } catch (e) { isProcessingRef.current = false; }
          }
          setTimeout(loop, 40); 
        };
        loop();
      } catch (e) { console.error(e); }
    };
    init(); return () => { active = false; };
  }, [selectedCamera, onResults]);

  // DNA Lab Preview
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !showAssetPanel) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame = 0; let reqId: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cfg: CustomBirdConfig = {
        id: 'preview', name: 'Preview', assets: newBirdAssets, transforms: newBirdTransforms, 
        globalScale: newBirdGlobalScale, globalRotation: newBirdGlobalRotation, flapAmplitude: 1.0, baseSize: 40, sizeRange: 0
      };
      Bird.drawCustomPreview(ctx, cfg, 40, frame * 0.12);
      frame++; reqId = requestAnimationFrame(render);
    };
    render(); return () => cancelAnimationFrame(reqId);
  }, [newBirdTransforms, newBirdGlobalScale, newBirdGlobalRotation, newBirdAssets, showAssetPanel]);

  const PartEditor = ({ label, part }: { label: string, part: keyof CustomBirdTransforms }) => (
    <div className="bg-zinc-800/80 p-5 rounded-xl border border-white/10 space-y-4 shadow-xl">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <span className="text-zinc-400 text-[10px] font-black uppercase tracking-[0.15em]">{label}</span>
        <div className="flex gap-2">
           {FIXED_ASSET_URLS.map((url, i) => (
             <button key={i} onClick={() => setNewBirdAssets(prev => ({...prev, [part]: url}))} 
               className={`w-9 h-9 rounded-lg border-2 transition-all overflow-hidden ${newBirdAssets[part] === url ? 'border-teal-400 shadow-[0_0_12px_rgba(45,212,191,0.4)]' : 'border-transparent opacity-30 hover:opacity-100 hover:border-white/20'}`}>
               <img src={url} className="w-full h-full object-cover" alt="asset" />
             </button>
           ))}
        </div>
      </div>
      <div className="space-y-4">
        {[{f: 'x', l: 'X Pos', min: -40, max: 40}, {f: 'y', l: 'Y Pos', min: -40, max: 40}, {f: 'rotate', l: 'Rotation', min: -180, max: 180}, {f: 'scale', l: 'Scale', min: 0.1, max: 3.0, step: 0.01}].map(c => (
          <div key={c.f} className="group">
            <div className="flex justify-between items-center mb-1.5 px-1">
              <span className="text-zinc-500 text-[9px] font-bold uppercase tracking-wider group-hover:text-zinc-300 transition-colors">{c.l}</span>
              <span className="text-teal-400 font-mono text-[10px] font-bold bg-black/40 px-2 py-0.5 rounded-md border border-white/5">
                {newBirdTransforms[part][c.f as keyof PartTransform].toFixed(c.f === 'scale' ? 2 : 0)}
              </span>
            </div>
            <input 
              type="range" 
              min={c.min} 
              max={c.max} 
              step={c.step || 1} 
              value={newBirdTransforms[part][c.f as keyof PartTransform]} 
              onInput={(e) => setNewBirdTransforms(prev => ({ ...prev, [part]: { ...prev[part], [c.f as keyof PartTransform]: parseFloat((e.target as HTMLInputElement).value) } }))} 
              className="w-full h-2 bg-black/50 rounded-full appearance-none cursor-pointer accent-teal-400 hover:accent-teal-300 transition-all" 
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none font-sans">
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      
      {isLoading && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center">
          <RefreshCw className="w-8 h-8 text-teal-400 animate-spin mb-4" />
          <p className="text-white font-medium text-[10px] uppercase tracking-[0.4em] animate-pulse">Syncing Biosphere...</p>
        </div>
      )}

      {/* COMPACT HUD */}
      <div className="absolute inset-x-0 top-0 p-3 flex justify-between items-start pointer-events-none z-20">
        <div className="flex flex-col gap-2">
          {/* SMILE DETECTION INDICATOR */}
          <div className={`transition-all duration-300 px-3 py-1.5 rounded-lg border flex flex-col gap-2 pointer-events-auto shadow-md backdrop-blur-md min-w-[140px] ${isSmiling ? 'bg-teal-500/10 border-teal-400/40 text-teal-300' : 'bg-black/40 border-white/5 text-zinc-600'}`}>
            <div className="flex items-center gap-2">
              {isSmiling ? <Smile className="w-4 h-4" /> : <ZapOff className="w-4 h-4 opacity-40" />}
              <div className="flex flex-col">
                <span className="text-[8px] font-bold tracking-widest uppercase leading-tight">
                  {isSmiling ? 'Joy Resonance' : 'Waiting for Joy'}
                </span>
                <span className="text-[6px] font-medium uppercase tracking-tight opacity-70">
                  {isSmiling ? 'Summoning birds...' : 'Smile to attract birds'}
                </span>
              </div>
            </div>
            <div className="w-full h-[2px] bg-white/10 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-200 rounded-full ${isSmiling ? 'bg-teal-400 shadow-[0_0_8px_#2dd4bf]' : 'bg-zinc-800'}`}
                style={{ width: `${smileIntensity * 100}%` }}
              />
            </div>
          </div>

          <div className="relative pointer-events-auto">
            <button onClick={() => setShowCamMenu(!showCamMenu)} className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 text-white/30 hover:text-white flex items-center gap-2 transition-all">
              <Camera className="w-3.5 h-3.5" /><ChevronDown className={`w-2.5 h-2.5 transition-transform ${showCamMenu ? 'rotate-180' : ''}`} />
            </button>
            {showCamMenu && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-zinc-900/98 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50">
                {cameras.map(cam => (
                  <button key={cam.deviceId} onClick={() => { setSelectedCamera(cam.deviceId); setShowCamMenu(false); }} className={`w-full text-left px-4 py-2.5 text-[9px] font-bold uppercase tracking-wider hover:bg-white/5 transition-all ${selectedCamera === cam.deviceId ? 'text-teal-400 bg-teal-400/5' : 'text-zinc-400'}`}>
                    {cam.label || `Camera ${cameras.indexOf(cam) + 1}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 pointer-events-auto">
          <button onClick={() => setIsMirrored(!isMirrored)} className="bg-black/40 backdrop-blur-md p-2.5 rounded-xl border border-white/5 text-white/40 hover:text-teal-400 transition-all active:scale-95 shadow-md"><FlipHorizontal className="w-4 h-4" /></button>
          <button onClick={() => setShowAssetPanel(true)} className="bg-black/40 backdrop-blur-md p-2.5 rounded-xl border border-white/5 text-teal-400/40 hover:scale-105 transition-all active:scale-95 shadow-md"><Settings2 className="w-4 h-4" /></button>
        </div>
      </div>

      {showAssetPanel && (
        <div className="absolute inset-0 z-40 bg-black/95 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-zinc-900 border border-white/10 w-full max-w-6xl rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col h-[85vh] overflow-hidden">
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-zinc-800/20 shrink-0">
              <div className="flex items-center gap-4 px-4">
                <div className="p-2 bg-teal-500/10 rounded-xl"><Sparkles className="w-5 h-5 text-teal-400" /></div>
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-[0.2em]">Genome Studio</h2>
                  <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">Custom DNA Sequencing Unit</p>
                </div>
              </div>
              <button onClick={() => setShowAssetPanel(false)} className="bg-zinc-800 p-2.5 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-700 transition-all shadow-lg mr-2"><X className="w-4 h-4" /></button>
            </div>
            
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-black/20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <PartEditor label="Crown Structure" part="head" />
                  <PartEditor label="Core Biologicals" part="body" />
                  <PartEditor label="Ventral Stabilizers" part="wingsFront" />
                  <PartEditor label="Dorsal Wings" part="wingsBack" />
                </div>

                <div className="bg-zinc-800/40 p-6 rounded-2xl border border-white/5 grid grid-cols-2 gap-8 shadow-inner">
                  <div className="space-y-3">
                    <div className="flex justify-between px-1">
                      <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Global Scale</span>
                      <span className="text-teal-400 font-mono text-[10px] font-bold">{newBirdGlobalScale.toFixed(2)}</span>
                    </div>
                    <input type="range" min="0.3" max="3.0" step="0.01" value={newBirdGlobalScale} onInput={(e) => setNewBirdGlobalScale(parseFloat((e.target as HTMLInputElement).value))} className="w-full h-2 bg-black/60 rounded-full appearance-none cursor-pointer accent-teal-400" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between px-1">
                      <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Axis Correction</span>
                      <span className="text-teal-400 font-mono text-[10px] font-bold">{newBirdGlobalRotation}°</span>
                    </div>
                    <input type="range" min="-180" max="180" value={newBirdGlobalRotation} onInput={(e) => setNewBirdGlobalRotation(parseFloat((e.target as HTMLInputElement).value))} className="w-full h-2 bg-black/60 rounded-full appearance-none cursor-pointer accent-teal-400" />
                  </div>
                </div>
                
                <div className="flex gap-4 pb-8">
                   <div className="flex-1 relative">
                     <input 
                       type="text" 
                       value={newBirdName} 
                       onChange={e => setNewBirdName(e.target.value)} 
                       placeholder="Assign Species Tag..." 
                       className="w-full bg-black border border-white/10 rounded-2xl px-6 py-4 text-white text-xs font-black tracking-[0.2em] outline-none focus:border-teal-400/50 focus:ring-4 focus:ring-teal-400/5 transition-all placeholder:text-zinc-800 shadow-inner" 
                     />
                   </div>
                   <div className="flex gap-3">
                        <button 
                          onClick={async () => {
                              if (!newBirdName) return;
                              const nb = { id: editingId || Math.random().toString(36).substr(2,9), name: newBirdName, assets: {...newBirdAssets}, transforms: {...newBirdTransforms}, globalScale: newBirdGlobalScale, globalRotation: newBirdGlobalRotation, flapAmplitude: 1.0, baseSize: 22, sizeRange: 0.1 };
                              await saveBirdToDB(nb); setCustomBirds(await getAllBirdsFromDB()); setEditingId(null); setNewBirdName("");
                          }} 
                          disabled={!newBirdName} 
                          className="px-8 bg-teal-400 hover:bg-teal-300 disabled:bg-zinc-800 text-black font-black rounded-2xl uppercase text-[10px] tracking-[0.2em] active:scale-95 transition-all shadow-[0_0_25px_rgba(45,212,191,0.2)] flex items-center gap-3 disabled:text-zinc-600"
                        >
                          <Zap className="w-4 h-4" /> {editingId ? 'Update DNA' : 'Initialize'}
                        </button>
                        {editingId && (
                          <button 
                            onClick={() => { setEditingId(null); setNewBirdName(""); setNewBirdTransforms(defaultTransforms()); }} 
                            className="px-6 bg-zinc-800 text-zinc-400 font-bold rounded-2xl uppercase text-[10px] tracking-widest hover:bg-zinc-700 hover:text-white transition-all border border-white/5"
                          >
                            Abort
                          </button>
                        )}
                   </div>
                </div>
              </div>

              <div className="w-[320px] border-l border-white/10 bg-zinc-950/40 p-6 flex flex-col shrink-0">
                <div className="sticky top-0 space-y-6 h-full flex flex-col">
                   <div className="aspect-square w-full bg-black/60 rounded-[2rem] border border-white/5 flex items-center justify-center relative overflow-hidden shadow-2xl group">
                      <canvas ref={previewCanvasRef} width={400} height={400} className="w-full h-full p-6 drop-shadow-[0_0_40px_rgba(45,212,191,0.15)]" />
                      <div className="absolute top-4 right-4 text-white/10 text-[8px] font-black uppercase tracking-[0.3em]">Holographic Output</div>
                      <div className="absolute inset-0 bg-gradient-to-t from-teal-400/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                   </div>
                   
                   <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar pr-2 mt-2">
                      <h3 className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-teal-400/50" /> Biological Archive
                      </h3>
                      <div className="space-y-2">
                        {customBirds.map(b => (
                          <div key={b.id} className="bg-white/5 p-3 rounded-xl flex items-center justify-between group hover:bg-white/10 border border-transparent hover:border-white/10 transition-all shadow-sm">
                             <div className="flex flex-col">
                               <span className="text-white font-black text-[10px] uppercase tracking-wider truncate max-w-[140px]">{b.name}</span>
                               <span className="text-[8px] text-zinc-500 font-bold uppercase mt-0.5 tracking-tight">Sequence {b.id.toUpperCase()}</span>
                             </div>
                             <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                               <button onClick={() => { setEditingId(b.id); setNewBirdName(b.name); setNewBirdTransforms({...b.transforms}); setNewBirdGlobalScale(b.globalScale); setNewBirdGlobalRotation(b.globalRotation); setNewBirdAssets({...b.assets}); }} className="p-2 text-zinc-500 hover:text-teal-400 hover:bg-teal-400/10 rounded-lg transition-all"><Edit2 className="w-3.5 h-3.5" /></button>
                               <button onClick={() => deleteBirdFromDB(b.id).then(() => getAllBirdsFromDB()).then(setCustomBirds)} className="p-2 text-zinc-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                             </div>
                          </div>
                        ))}
                      </div>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 10px; }
        
        input[type=range] { -webkit-appearance: none; background: transparent; }
        input[type=range]::-webkit-slider-thumb { 
          -webkit-appearance: none; 
          height: 18px; 
          width: 18px; 
          border-radius: 50%; 
          background: #2dd4bf; 
          border: 4px solid #09090b; 
          cursor: pointer; 
          margin-top: -6px; 
          box-shadow: 0 4px 10px rgba(0,0,0,0.5), 0 0 10px rgba(45,212,191,0.3);
          transition: transform 0.1s ease, border-width 0.1s ease;
        }
        input[type=range]:active::-webkit-slider-thumb {
          transform: scale(1.2);
          border-width: 2px;
        }
        input[type=range]::-webkit-slider-runnable-track { 
          height: 6px; 
          background: #18181b; 
          border-radius: 10px; 
          border: 1px solid rgba(255,255,255,0.05);
        }
      `}</style>
    </div>
  );
};
export default HandAR;
