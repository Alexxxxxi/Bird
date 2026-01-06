
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bird } from './Bird';
import { CreatureState, PoopEntity, CustomBirdConfig, CustomBirdAssets, CustomBirdTransforms, PartTransform } from '../types';
import { isFist, getDistance, getUpperHandHull, getPointOnPolyline } from '../utils/geometry';
import { SHAKE_THRESHOLD, CLEAN_THRESHOLD, SPECIES_CONFIG } from '../constants';
import { saveBirdToDB, getAllBirdsFromDB, deleteBirdFromDB, syncBirdsWithCloud } from '../utils/db';
import { Loader2, FlipHorizontal, Upload, X, Settings2, Sparkles, Maximize, RotateCcw, BoxSelect, Trash2, Edit2, Zap, Share2, Globe, Cloud, RefreshCw } from 'lucide-react';

declare global {
  interface Window {
    Holistic: any;
  }
}

type LimbStateData = {
  lastPos: {x: number, y: number} | null; width: number; prevContour: {x: number, y: number}[]; missingFrames: number;
  lastCheckTime: number; lastMovement: number; isSmiling: boolean;
};

const createInitialLimbState = (): LimbStateData => ({
  lastPos: null, width: 0, prevContour: [], missingFrames: 0, lastCheckTime: 0, lastMovement: 0, isSmiling: false
});

const defaultPartTransform = (): PartTransform => ({ x: 0, y: 0, rotate: 0, scale: 1 });
const defaultTransforms = (): CustomBirdTransforms => ({
    head: defaultPartTransform(), body: defaultPartTransform(), wingsFront: defaultPartTransform(), wingsBack: defaultPartTransform(),
});

const HandAR: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Awakening the magical birds...");
  
  const [isMirrored, setIsMirrored] = useState(true);
  const isMirroredRef = useRef(true);

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
  const [editingId, setEditingId] = useState<string | null>(null);

  const [spacePressedTime, setSpacePressedTime] = useState<number | null>(null);
  const [spaceHoldProgress, setSpaceHoldProgress] = useState(0);

  const birdsRef = useRef<Bird[]>([]);
  const poopsRef = useRef<PoopEntity[]>([]);
  const limbStatesRef = useRef<Map<string, LimbStateData>>(new Map());
  const holisticRef = useRef<any>(null);
  const detectionActiveRef = useRef<boolean>(false);
  const wasSmilingGlobalRef = useRef(false);

  useEffect(() => { isMirroredRef.current = isMirrored; }, [isMirrored]);
  useEffect(() => { customBirdsRef.current = customBirds; }, [customBirds]);

  // Preview Render Effect
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !showAssetPanel) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let reqId: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const tempConfig: CustomBirdConfig = {
        id: 'preview',
        name: newBirdName || 'Unknown',
        assets: newBirdAssets,
        transforms: newBirdTransforms,
        globalScale: newBirdGlobalScale,
        globalRotation: newBirdGlobalRotation,
        flapAmplitude: newBirdFlapAmplitude,
        baseSize: 60,
        sizeRange: 0
      };
      Bird.drawCustomPreview(ctx, tempConfig, 60, frame * 0.1);
      frame++;
      reqId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(reqId);
  }, [newBirdAssets, newBirdTransforms, newBirdGlobalScale, newBirdGlobalRotation, newBirdFlapAmplitude, newBirdName, showAssetPanel]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 }, 
          facingMode: 'user' 
        }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise((resolve) => {
          if (!videoRef.current) return resolve(null);
          videoRef.current.onloadedmetadata = () => {
            videoRef.current!.play().then(resolve);
          };
        });
      }
    } catch (err) {
      console.error("Camera failed:", err);
      setStatusMessage("Camera Permission Denied. / 无法访问摄像头。");
    }
  }, []);

  const onResults = useCallback((results: any) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !results.image) return;

    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const img = results.image;
    const ratio = Math.max(canvas.width / img.width, canvas.height / img.height);
    const drawW = img.width * ratio;
    const drawH = img.height * ratio;
    const ox = (canvas.width - drawW) / 2;
    const oy = (canvas.height - drawH) / 2;

    if (isMirroredRef.current) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(img, ox, oy, drawW, drawH);

    const active = new Set<string>();
    const toPx = (l: any) => ({ x: l.x * drawW + ox, y: l.y * drawH + oy, z: l.z });

    let currentIsSmiling = false;
    if (results.faceLandmarks) {
        const mL = results.faceLandmarks[61], mR = results.faceLandmarks[291], fL = results.faceLandmarks[234], fR = results.faceLandmarks[454];
        if (mL && mR && fL && fR) currentIsSmiling = (getDistance(mL, mR) / getDistance(fL, fR)) > 0.46;
    }

    const processLimb = (lm: any, label: string) => {
      if (!lm || lm.length === 0) return;
      active.add(label);
      if (!limbStatesRef.current.has(label)) limbStatesRef.current.set(label, createInitialLimbState());
      const state = limbStatesRef.current.get(label)!;
      state.isSmiling = currentIsSmiling;
      
      const px = lm.map(toPx);
      let ref = (label === 'Head' ? px[10] : px[0]);
      let measured = (label === 'Head' ? getDistance(px[234], px[454]) : (label.includes('Shoulder') ? getDistance(px[0], px[1]) * 0.3 : getDistance(px[5], px[17])));
      state.width = measured || 100;
      
      if ((label === 'Left' || label === 'Right') && isFist(lm)) scareCreatures(label);

      let hull: any[] = [];
      if (label === 'Left' || label === 'Right') hull = getUpperHandHull(px);
      else if (label === 'Head') {
        const offset = state.width * 0.3;
        hull = [{x: ref.x - offset, y: ref.y - offset}, {x: ref.x, y: ref.y - offset*1.2}, {x: ref.x + offset, y: ref.y - offset}];
      } else {
        hull = [{x: ref.x - state.width * 0.4, y: ref.y - 40}, {x: ref.x + state.width * 0.4, y: ref.y - 40}];
      }
      state.prevContour = hull;
    };

    processLimb(results.leftHandLandmarks, 'Left');
    processLimb(results.rightHandLandmarks, 'Right');
    processLimb(results.faceLandmarks, 'Head');
    if (results.poseLandmarks) {
        processLimb([results.poseLandmarks[11], results.poseLandmarks[12]], 'L_Shoulder');
        processLimb([results.poseLandmarks[12], results.poseLandmarks[11]], 'R_Shoulder');
    }

    if (currentIsSmiling) {
      if (!wasSmilingGlobalRef.current) { 
        spawnCentral(1, canvas.width, canvas.height); 
        wasSmilingGlobalRef.current = true;
      }
    } else wasSmilingGlobalRef.current = false;

    const contours: Record<string, any[]> = {};
    limbStatesRef.current.forEach((s, l) => {
      if (active.has(l)) { s.missingFrames = 0; contours[l] = s.prevContour; }
      else { 
        s.missingFrames++; 
        if (s.missingFrames < 30) contours[l] = s.prevContour; 
        else { scareCreatures(l); limbStatesRef.current.delete(l); } 
      }
    });

    detectionActiveRef.current = limbStatesRef.current.size > 0;
    birdsRef.current.forEach(b => {
      let t = contours[b.targetId] ? getPointOnPolyline(contours[b.targetId], b.perchOffset) : null;
      b.update(16, t, birdsRef.current);
      b.draw(ctx);
    });
    
    ctx.restore();
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        let attempts = 0;
        while (!window.Holistic && attempts < 100) {
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }
        if (!window.Holistic) throw new Error("Holistic Script not loaded");

        const holistic = new window.Holistic({
          locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/${f}`
        });
        holistic.setOptions({ modelComplexity: 0, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        holistic.onResults(onResults);
        holisticRef.current = holistic;
        
        await startCamera();

        const local = await getAllBirdsFromDB();
        setCustomBirds(local);
        syncBirdsWithCloud(local).then(res => setCustomBirds(res));

        setIsLoading(false);
        const loop = async () => {
          if (videoRef.current?.readyState >= 2 && holisticRef.current) {
            try {
                await holisticRef.current.send({ image: videoRef.current });
            } catch (e) {}
          }
          requestAnimationFrame(loop);
        };
        loop();
      } catch (err) {
        console.error("Initialization failed:", err);
        setIsLoading(false);
        setStatusMessage("Initialization Error. Reload Page.");
      }
    };
    init();
  }, [startCamera, onResults]);

  const spawnCentral = (count: number, w: number, h: number) => {
    const activeLabels = Array.from(limbStatesRef.current.entries()).filter(([_, s]) => s.missingFrames < 5).map(([l, _]) => l);
    if (activeLabels.length === 0) return;
    for (let i = 0; i < count; i++) {
        const targetLabel = activeLabels[Math.floor(Math.random() * activeLabels.length)];
        const state = limbStatesRef.current.get(targetLabel)!;
        birdsRef.current.push(new Bird(w, h, state.width || 100, targetLabel, undefined, customBirdsRef.current));
    }
  };

  const scareCreatures = (l?: string) => birdsRef.current.forEach(b => { if (b.state !== CreatureState.FLYING_AWAY && (!l || b.targetId === l)) b.state = CreatureState.FLYING_AWAY; });

  const addOrUpdateBird = async () => {
    if (!newBirdName || !newBirdAssets.body) return;
    const nb: CustomBirdConfig = { 
      id: editingId || Math.random().toString(36).substr(2,9), 
      name: newBirdName, 
      assets: {...newBirdAssets}, 
      transforms: {...newBirdTransforms}, 
      globalScale: newBirdGlobalScale, 
      globalRotation: newBirdGlobalRotation, 
      flapAmplitude: newBirdFlapAmplitude,
      baseSize: 25, 
      sizeRange: 0.3
    };
    
    setIsSyncing(true);
    try {
        await saveBirdToDB(nb);
        const updated = await syncBirdsWithCloud([...customBirds, nb]);
        setCustomBirds(updated);
        resetLab();
    } catch (e) {
        console.error("Save Error:", e);
    }
    setIsSyncing(false);
  };

  const loadForEdit = (bird: CustomBirdConfig) => {
    setEditingId(bird.id);
    setNewBirdName(bird.name);
    setNewBirdAssets({...bird.assets});
    setNewBirdTransforms({...bird.transforms});
    setNewBirdGlobalScale(bird.globalScale);
    setNewBirdGlobalRotation(bird.globalRotation || 0);
    setNewBirdFlapAmplitude(bird.flapAmplitude || 1.0);
    setLabTab('synthesize');
  };

  const deleteBird = async (id: string) => {
    if (!window.confirm("Remove this DNA sequence from library?")) return;
    setIsSyncing(true);
    try {
        await deleteBirdFromDB(id);
        const remaining = customBirds.filter(b => b.id !== id);
        // Sync the reduction to cloud
        await syncBirdsWithCloud(remaining);
        setCustomBirds(remaining);
    } catch (e) {
        console.error("Delete Error:", e);
    }
    setIsSyncing(false);
  };

  const resetLab = () => {
    setNewBirdName(""); setNewBirdAssets({}); setNewBirdTransforms(defaultTransforms()); 
    setNewBirdGlobalScale(1.0); setNewBirdGlobalRotation(0); setNewBirdFlapAmplitude(1.0);
    setEditingId(null);
  };

  const syncManually = async () => {
    setIsSyncing(true);
    const synced = await syncBirdsWithCloud(customBirds);
    setCustomBirds(synced);
    setIsSyncing(false);
  };

  const PartEditor = ({ label, part }: { label: string, part: keyof CustomBirdTransforms }) => (
    <div className="bg-zinc-800/60 p-5 rounded-3xl border border-white/5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-white text-[10px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[
          { field: 'x', label: 'X', min: -80, max: 80 },
          { field: 'y', label: 'Y', min: -80, max: 80 },
          { field: 'rotate', label: 'ROT', min: -360, max: 360 },
          { field: 'scale', label: 'SIZE', min: 0.1, max: 10.0, step: 0.01 }
        ].map(ctrl => (
          <div key={ctrl.field} className="space-y-1">
            <span className="text-zinc-500 text-[8px] font-bold uppercase">{ctrl.label}</span>
            <input 
              type="range" 
              min={ctrl.min} max={ctrl.max} step={ctrl.step || 1} 
              value={newBirdTransforms[part][ctrl.field as keyof PartTransform]} 
              onInput={(e) => updateTransform(part, ctrl.field as keyof PartTransform, parseFloat((e.target as HTMLInputElement).value))} 
              className="w-full accent-teal-400 cursor-pointer" 
            />
          </div>
        ))}
      </div>
    </div>
  );

  const updateTransform = (part: keyof CustomBirdTransforms, field: keyof PartTransform, val: number) => {
    setNewBirdTransforms(prev => ({ ...prev, [part]: { ...prev[part], [field]: isNaN(val) ? 0 : val } }));
  };

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none">
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {isLoading && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-teal-400 mb-4" />
          <p className="text-zinc-500 text-xs font-black uppercase tracking-widest">{statusMessage}</p>
        </div>
      )}

      <div className="absolute inset-x-0 top-0 p-8 flex justify-between items-start pointer-events-none z-20">
        <div className="bg-black/60 backdrop-blur-xl px-6 py-3 rounded-2xl border border-white/10 text-white flex items-center gap-4 pointer-events-auto">
          <div className={`w-3 h-3 rounded-full ${detectionActiveRef.current ? 'bg-teal-400 animate-pulse' : 'bg-zinc-600'}`} />
          <span className="text-xs font-black tracking-widest uppercase">
            {detectionActiveRef.current ? 'Sensors Active' : 'Scanning Environment'}
          </span>
        </div>
        <div className="flex gap-4 pointer-events-auto">
          <button onClick={() => setIsMirrored(!isMirrored)} className="bg-black/60 backdrop-blur-xl p-4 rounded-2xl border border-white/10 text-white hover:bg-teal-400/20 transition-all">
            <FlipHorizontal className="w-6 h-6" />
          </button>
          <button onClick={() => setShowAssetPanel(true)} className="bg-black/60 backdrop-blur-xl p-4 rounded-2xl border border-white/10 text-teal-400 hover:scale-110 transition-all">
            <Settings2 className="w-6 h-6" />
          </button>
        </div>
      </div>

      {showAssetPanel && (
        <div className="absolute inset-0 z-40 bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6">
          <div className="bg-zinc-900 border border-white/10 w-full max-w-6xl rounded-[3rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95">
            <div className="p-8 border-b border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-6">
                <Sparkles className="w-8 h-8 text-teal-400" />
                <h2 className="text-xl font-black text-white uppercase tracking-tighter">Global DNA Registry</h2>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 text-[9px] font-black uppercase tracking-widest ${isSyncing ? 'text-teal-400' : 'text-zinc-500'}`}>
                  {isSyncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Cloud className="w-3 h-3" />}
                  {isSyncing ? 'Linking Cloud...' : 'Multi-Device Sync Ready'}
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={syncManually} disabled={isSyncing} className="bg-zinc-800 px-6 py-3 rounded-2xl text-teal-400 hover:bg-zinc-700 text-[10px] font-black uppercase flex items-center gap-2 disabled:opacity-50">
                  <Globe className="w-4 h-4" /> Fetch Global Library
                </button>
                <button onClick={() => setShowAssetPanel(false)} className="bg-zinc-800 p-3 rounded-full text-zinc-400 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-10 grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-8">
                <div className="grid grid-cols-4 gap-4">
                  {(['head', 'body', 'wingsFront', 'wingsBack'] as const).map(p => (
                    <label key={p} className="relative block aspect-square bg-black rounded-3xl border-2 border-dashed border-white/5 cursor-pointer hover:border-teal-400 transition-all overflow-hidden group">
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => setNewBirdAssets(prev => ({...prev, [p]: ev.target?.result as string}));
                          reader.readAsDataURL(file);
                        }
                      }} />
                      {newBirdAssets[p] ? <img src={newBirdAssets[p]} className="w-full h-full object-contain p-2" /> : <Upload className="absolute inset-0 m-auto w-6 h-6 text-zinc-800 group-hover:text-teal-400" />}
                    </label>
                  ))}
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                   <PartEditor label="Head Offset" part="head" />
                   <PartEditor label="Body Base" part="body" />
                   <PartEditor label="Wing Front" part="wingsFront" />
                   <PartEditor label="Wing Back" part="wingsBack" />
                </div>

                <div className="bg-zinc-800/40 p-6 rounded-3xl space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-white text-[10px] font-black uppercase tracking-widest">Global DNA Scaling & Balance</span>
                  </div>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-1">
                        <span className="text-zinc-500 text-[8px] font-bold uppercase">Master Scale</span>
                        <input type="range" min="0.1" max="5" step="0.01" value={newBirdGlobalScale} onInput={(e) => setNewBirdGlobalScale(parseFloat((e.target as HTMLInputElement).value))} className="w-full accent-teal-400 cursor-pointer" />
                    </div>
                    <div className="space-y-1">
                        <span className="text-zinc-500 text-[8px] font-bold uppercase">Base Rotation</span>
                        <input type="range" min="-180" max="180" value={newBirdGlobalRotation} onInput={(e) => setNewBirdGlobalRotation(parseFloat((e.target as HTMLInputElement).value))} className="w-full accent-teal-400 cursor-pointer" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <div className="aspect-square bg-black rounded-[3rem] border border-white/5 flex items-center justify-center p-8 relative overflow-hidden shadow-inner">
                   <canvas ref={previewCanvasRef} width={500} height={500} className="w-full max-w-sm" />
                   <div className="absolute top-8 right-8 text-white/20 text-[8px] font-black uppercase tracking-widest">Gene Sequence Preview</div>
                </div>
                <div className="space-y-4">
                   <input type="text" value={newBirdName} onChange={e => setNewBirdName(e.target.value)} placeholder="Assign Species Name..." className="w-full bg-black border border-white/10 rounded-2xl px-6 py-4 text-white font-bold outline-none" />
                   <button onClick={addOrUpdateBird} disabled={!newBirdName || !newBirdAssets.body || isSyncing} className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-20 text-black font-black py-5 rounded-2xl uppercase tracking-widest text-xs transition-all active:scale-95 flex items-center justify-center gap-3">
                     {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                     {editingId ? 'Apply Genome Changes' : 'Authorize & Broadcast to Cloud'}
                   </button>
                   {editingId && <button onClick={resetLab} className="w-full text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest">Discard Edits</button>}
                </div>

                <div className="space-y-4">
                  <h3 className="text-zinc-600 text-[10px] font-black uppercase tracking-widest px-2">Registered Global Population ({customBirds.length})</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {customBirds.map(b => (
                      <div key={b.id} className="bg-white/5 p-4 rounded-3xl flex items-center justify-between group hover:bg-white/10 transition-all">
                         <div className="flex items-center gap-4">
                           <div className="w-10 h-10 bg-black rounded-lg overflow-hidden p-1 border border-white/5">
                             {b.assets.body && <img src={b.assets.body} className="w-full h-full object-contain" />}
                           </div>
                           <span className="text-white text-xs font-bold truncate max-w-[100px]">{b.name}</span>
                         </div>
                         <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                           <button onClick={() => loadForEdit(b)} className="text-zinc-500 hover:text-teal-400 p-1"><Edit2 className="w-4 h-4" /></button>
                           <button onClick={() => deleteBird(b.id)} className="text-zinc-500 hover:text-rose-400 p-1"><Trash2 className="w-4 h-4" /></button>
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        input[type=range] { -webkit-appearance: none; background: transparent; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 24px; width: 24px; border-radius: 50%; background: #2dd4bf; border: 4px solid #18181b; cursor: pointer; margin-top: -8px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
        input[type=range]::-webkit-slider-runnable-track { height: 8px; background: #27272a; border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default HandAR;
