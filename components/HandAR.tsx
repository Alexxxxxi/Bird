
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bird } from './Bird';
import { CreatureState, CustomBirdConfig, CustomBirdTransforms, PartTransform } from '../types';
import { isFist, getDistance, getUpperHandHull, getPointOnPolyline } from '../utils/geometry';
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
  ChevronDown
} from 'lucide-react';

declare global { interface Window { Holistic: any; } }

type LimbStateData = { width: number; prevContour: {x: number, y: number}[]; missingFrames: number; };
const createInitialLimbState = (): LimbStateData => ({ width: 0, prevContour: [], missingFrames: 0 });
const defaultPart = (): PartTransform => ({ x: 0, y: 0, rotate: 0, scale: 1 });
const defaultTransforms = (): CustomBirdTransforms => ({ head: defaultPart(), body: defaultPart(), wingsFront: defaultPart(), wingsBack: defaultPart() });

const HandAR: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const processCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas')); // Offscreen for MP processing

  const [isLoading, setIsLoading] = useState(true);
  const [isMirrored, setIsMirrored] = useState(true);
  const [showAssetPanel, setShowAssetPanel] = useState(false);
  const [customBirds, setCustomBirds] = useState<CustomBirdConfig[]>([]);
  const customBirdsRef = useRef<CustomBirdConfig[]>([]);
  
  // Camera selection state
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [showCamMenu, setShowCamMenu] = useState(false);

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
  const [newBirdFlapAmplitude, setNewBirdFlapAmplitude] = useState(1.0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const birdsRef = useRef<Bird[]>([]);
  const limbStatesRef = useRef<Map<string, LimbStateData>>(new Map());
  const holisticRef = useRef<any>(null);
  const isProcessingRef = useRef(false);
  const detectionActiveRef = useRef(false);

  // Load available cameras
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setCameras(videoDevices);
      if (videoDevices.length > 0 && !selectedCamera) {
        setSelectedCamera(videoDevices[0].deviceId);
      }
    });
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { customBirdsRef.current = customBirds; }, [customBirds]);

  // DNA Lab Preview - Fixed Aspect
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !showAssetPanel) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame = 0; let reqId: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cfg: CustomBirdConfig = {
        id: 'preview', name: 'Preview',
        assets: newBirdAssets,
        transforms: newBirdTransforms, globalScale: newBirdGlobalScale, globalRotation: newBirdGlobalRotation, flapAmplitude: newBirdFlapAmplitude, baseSize: 60, sizeRange: 0
      };
      Bird.drawCustomPreview(ctx, cfg, 60, frame * 0.1);
      frame++; reqId = requestAnimationFrame(render);
    };
    render(); return () => cancelAnimationFrame(reqId);
  }, [newBirdTransforms, newBirdGlobalScale, newBirdGlobalRotation, newBirdFlapAmplitude, newBirdAssets, showAssetPanel]);

  const onResults = useCallback((results: any) => {
    isProcessingRef.current = false;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !results.image) return;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const img = results.image;
    // We draw the original video frame to fill the screen
    const ratio = Math.max(canvas.width / img.width, canvas.height / img.height);
    const dw = img.width * ratio, dh = img.height * ratio;
    const ox = (canvas.width - dw) / 2, oy = (canvas.height - dh) / 2;

    if (isMirrored) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(img, ox, oy, dw, dh);

    const activeSet = new Set<string>();
    const toPx = (l: any) => ({ x: l.x * dw + ox, y: l.y * dh + oy });

    // Process Head
    if (results.faceLandmarks) {
        const label = 'Head';
        activeSet.add(label);
        if (!limbStatesRef.current.has(label)) limbStatesRef.current.set(label, createInitialLimbState());
        const state = limbStatesRef.current.get(label)!;
        const top = toPx(results.faceLandmarks[10]);
        const left = toPx(results.faceLandmarks[332]);
        const right = toPx(results.faceLandmarks[103]);
        state.width = getDistance(left, right) * 2.2;
        state.prevContour = [
            {x: left.x, y: left.y},
            {x: top.x, y: top.y - 12},
            {x: right.x, y: right.y}
        ];
    }

    // Process Shoulders
    if (results.poseLandmarks) {
        const check = (idx: number, label: string) => {
            const sh = results.poseLandmarks[idx];
            if (sh.visibility > 0.5) {
                activeSet.add(label);
                if (!limbStatesRef.current.has(label)) limbStatesRef.current.set(label, createInitialLimbState());
                const state = limbStatesRef.current.get(label)!;
                const p = toPx(sh);
                state.width = 110;
                state.prevContour = [
                    {x: p.x - 25, y: p.y - 8},
                    {x: p.x, y: p.y - 18},
                    {x: p.x + 25, y: p.y - 8}
                ];
            }
        };
        check(11, 'LeftShoulder');
        check(12, 'RightShoulder');
    }

    // Process Hands
    const processHand = (lm: any, label: string) => {
      if (!lm || lm.length === 0) return;
      activeSet.add(label);
      if (!limbStatesRef.current.has(label)) limbStatesRef.current.set(label, createInitialLimbState());
      const state = limbStatesRef.current.get(label)!;
      const px = lm.map(toPx);
      state.width = getDistance(px[5], px[17]) * 4.5;
      if (isFist(lm)) {
        birdsRef.current.forEach(b => { if (b.targetId === label) b.state = CreatureState.FLYING_AWAY; });
      }
      state.prevContour = getUpperHandHull(px);
    };
    processHand(results.leftHandLandmarks, 'LeftHand');
    processHand(results.rightHandLandmarks, 'RightHand');

    const contours: Record<string, any[]> = {};
    limbStatesRef.current.forEach((s, l) => {
      if (activeSet.has(l)) { s.missingFrames = 0; contours[l] = s.prevContour; }
      else { 
        s.missingFrames++; 
        if (s.missingFrames < 10) contours[l] = s.prevContour; 
        else { birdsRef.current.forEach(b => { if (b.targetId === l) b.state = CreatureState.FLYING_AWAY; }); limbStatesRef.current.delete(l); }
      }
    });

    detectionActiveRef.current = limbStatesRef.current.size > 0;
    birdsRef.current.forEach(b => {
      let t = contours[b.targetId] ? getPointOnPolyline(contours[b.targetId], b.perchOffset) : null;
      b.update(16, t, birdsRef.current);
      b.draw(ctx);
    });
    
    // Controlled Spawning - Reduced rate for performance
    if (detectionActiveRef.current && birdsRef.current.length < 5 && Math.random() < 0.01) {
       const labels = Array.from(limbStatesRef.current.keys());
       const target = labels[Math.floor(Math.random()*labels.length)];
       birdsRef.current.push(new Bird(canvas.width, canvas.height, 100, target, undefined, customBirdsRef.current));
    }

    if (birdsRef.current.length > 12) birdsRef.current = birdsRef.current.slice(-12);
    ctx.restore();
  }, [isMirrored]);

  useEffect(() => {
    let active = true;
    const startAR = async () => {
      try {
        while (!window.Holistic && active) await new Promise(r => setTimeout(r, 100));
        if (!active) return;
        const holistic = new window.Holistic({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${f}` });
        holistic.setOptions({ 
          modelComplexity: 0, 
          smoothLandmarks: true, 
          minDetectionConfidence: 0.5, 
          minTrackingConfidence: 0.5 
        });
        holistic.onResults(onResults);
        holisticRef.current = holistic;
        
        const constraints = { video: { deviceId: selectedCamera ? { exact: selectedCamera } : undefined, width: 640, height: 480 } };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }

        let local = await getAllBirdsFromDB();
        if (local.length === 0) { for (const p of PRESET_BIRDS) await saveBirdToDB(p); local = await getAllBirdsFromDB(); }
        setCustomBirds(local);
        setIsLoading(false);

        // Downsampled processing loop for mobile speed
        const pCanvas = processCanvasRef.current;
        pCanvas.width = 320; 
        pCanvas.height = 240;
        const pCtx = pCanvas.getContext('2d');

        const loop = async () => {
          if (!active) return;
          if (!isProcessingRef.current && videoRef.current?.readyState >= 2) {
            isProcessingRef.current = true;
            pCtx?.drawImage(videoRef.current, 0, 0, pCanvas.width, pCanvas.height);
            try { await holisticRef.current.send({ image: pCanvas }); } catch (e) { isProcessingRef.current = false; }
          }
          setTimeout(loop, 50); // Lower refresh for MP, smooth bird drawing via high-frequency UI updates is separate
        };
        loop();
      } catch (e) { console.error(e); }
    };
    startAR(); return () => { active = false; };
  }, [onResults, selectedCamera]);

  const updateTransform = (part: keyof CustomBirdTransforms, field: keyof PartTransform, val: number) => {
    setNewBirdTransforms(prev => ({ ...prev, [part]: { ...prev[part], [field]: isNaN(val) ? 0 : val } }));
  };

  const PartEditor = ({ label, part }: { label: string, part: keyof CustomBirdTransforms }) => (
    <div className="bg-zinc-800/80 p-5 rounded-[2rem] border border-white/10 space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-white text-[10px] font-black uppercase tracking-[0.2em]">{label}</span>
        <div className="flex gap-2">
           {FIXED_ASSET_URLS.map((url, i) => (
             <button key={i} onClick={() => setNewBirdAssets(prev => ({...prev, [part]: url}))} 
               className={`w-10 h-10 rounded-xl border-2 transition-all overflow-hidden ${newBirdAssets[part] === url ? 'border-teal-400 scale-110 shadow-lg shadow-teal-400/40' : 'border-transparent opacity-40 hover:opacity-100'}`}>
               <img src={url} className="w-full h-full object-cover" alt="asset" />
             </button>
           ))}
        </div>
      </div>
      <div className="space-y-4">
        {[{f: 'x', l: 'X-Pos', min: -50, max: 50}, {f: 'y', l: 'Y-Pos', min: -50, max: 50}, {f: 'rotate', l: 'Rotation', min: -360, max: 360}, {f: 'scale', l: 'Size', min: 0.2, max: 3.0, step: 0.01}].map(c => (
          <div key={c.f} className="space-y-2">
            <div className="flex justify-between items-center"><span className="text-zinc-500 text-[9px] font-bold uppercase">{c.l}</span><span className="text-teal-400 text-[9px] font-black">{newBirdTransforms[part][c.f as keyof PartTransform].toFixed(c.f === 'scale' ? 2 : 0)}</span></div>
            <input type="range" min={c.min} max={c.max} step={c.step || 1} value={newBirdTransforms[part][c.f as keyof PartTransform]} onInput={(e) => updateTransform(part, c.f as keyof PartTransform, parseFloat((e.target as HTMLInputElement).value))} className="w-full h-2 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-teal-400" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none">
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      
      {isLoading && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center">
          <RefreshCw className="w-14 h-14 text-teal-400 animate-spin mb-8" />
          <p className="text-white font-black text-xs uppercase tracking-[0.5em] animate-pulse">Syncing Biosphere...</p>
        </div>
      )}

      {/* Main Overlay */}
      <div className="absolute inset-x-0 top-0 p-6 flex justify-between items-start pointer-events-none z-20">
        <div className="flex flex-col gap-2">
          <div className="bg-black/50 backdrop-blur-2xl px-5 py-3 rounded-2xl border border-white/10 text-white flex items-center gap-4 pointer-events-auto">
            <div className={`w-2 h-2 rounded-full ${detectionActiveRef.current ? 'bg-teal-400 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="text-[10px] font-black tracking-widest uppercase">Spirit Link Active</span>
          </div>
          
          <div className="relative pointer-events-auto">
            <button onClick={() => setShowCamMenu(!showCamMenu)} className="bg-black/50 backdrop-blur-2xl p-3 rounded-xl border border-white/10 text-white/60 hover:text-white flex items-center gap-2 transition-all">
              <Camera className="w-4 h-4" />
              <ChevronDown className={`w-3 h-3 transition-transform ${showCamMenu ? 'rotate-180' : ''}`} />
            </button>
            {showCamMenu && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-zinc-900 border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50">
                {cameras.map(cam => (
                  <button key={cam.deviceId} onClick={() => { setSelectedCamera(cam.deviceId); setShowCamMenu(false); }} className={`w-full text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider hover:bg-white/5 transition-colors ${selectedCamera === cam.deviceId ? 'text-teal-400' : 'text-zinc-400'}`}>
                    {cam.label || `Camera ${cameras.indexOf(cam)}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4 pointer-events-auto">
          <button onClick={() => setIsMirrored(!isMirrored)} className="bg-black/50 backdrop-blur-2xl p-5 rounded-3xl border border-white/10 text-white hover:text-teal-400 transition-all active:scale-90"><FlipHorizontal className="w-6 h-6" /></button>
          <button onClick={() => setShowAssetPanel(true)} className="bg-black/50 backdrop-blur-2xl p-5 rounded-3xl border border-white/10 text-teal-400 hover:scale-110 transition-all active:scale-90 shadow-[0_0_30px_rgba(45,212,191,0.2)]"><Settings2 className="w-6 h-6" /></button>
        </div>
      </div>

      {showAssetPanel && (
        <div className="absolute inset-0 z-40 bg-black/98 backdrop-blur-3xl flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 w-full max-w-6xl rounded-[3rem] shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-zinc-800/20">
              <div className="flex items-center gap-6"><Sparkles className="w-8 h-8 text-teal-400" /><h2 className="text-xl font-black text-white uppercase tracking-tighter">Genome Architect</h2></div>
              <button onClick={() => setShowAssetPanel(false)} className="bg-zinc-800 p-5 rounded-full text-zinc-400 hover:text-white transition-all active:scale-90"><X className="w-6 h-6" /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 md:p-10 grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <PartEditor label="Crown Structure" part="head" />
                  <PartEditor label="Core Anatomy" part="body" />
                  <PartEditor label="Front Wing" part="wingsFront" />
                  <PartEditor label="Rear Wing" part="wingsBack" />
                </div>
                <div className="bg-zinc-800/60 p-8 rounded-[2rem] border border-white/5 grid grid-cols-2 gap-8">
                  <div className="space-y-3"><span className="text-zinc-500 text-[10px] font-black uppercase">Master Size</span><input type="range" min="0.5" max="3" step="0.01" value={newBirdGlobalScale} onInput={(e) => setNewBirdGlobalScale(parseFloat((e.target as HTMLInputElement).value))} className="w-full h-2 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-teal-400" /></div>
                  <div className="space-y-3"><span className="text-zinc-500 text-[10px] font-black uppercase">Species Tilt</span><input type="range" min="-180" max="180" value={newBirdGlobalRotation} onInput={(e) => setNewBirdGlobalRotation(parseFloat((e.target as HTMLInputElement).value))} className="w-full h-2 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-teal-400" /></div>
                </div>
              </div>
              
              <div className="space-y-8 flex flex-col">
                <div className="aspect-square w-full max-w-md mx-auto bg-black rounded-[3rem] border border-white/10 flex items-center justify-center relative overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)]">
                   <canvas ref={previewCanvasRef} width={500} height={500} className="w-full h-full p-10 drop-shadow-[0_0_40px_rgba(45,212,191,0.2)]" />
                   <div className="absolute top-8 right-8 text-white/10 text-[10px] font-black uppercase tracking-[0.4em]">Simulator v1.0</div>
                </div>
                
                <div className="space-y-6">
                   <input type="text" value={newBirdName} onChange={e => setNewBirdName(e.target.value)} placeholder="Assign Species Tag..." className="w-full bg-black border border-white/10 rounded-3xl px-8 py-6 text-white font-black tracking-widest outline-none focus:border-teal-400 transition-all text-center" />
                   <div className="grid grid-cols-2 gap-4">
                        <button onClick={async () => {
                            if (!newBirdName) return;
                            const nb = { id: editingId || Math.random().toString(36).substr(2,9), name: newBirdName, assets: {...newBirdAssets}, transforms: {...newBirdTransforms}, globalScale: newBirdGlobalScale, globalRotation: newBirdGlobalRotation, flapAmplitude: newBirdFlapAmplitude, baseSize: 25, sizeRange: 0.1 };
                            await saveBirdToDB(nb); setCustomBirds(await getAllBirdsFromDB()); setEditingId(null); setNewBirdName("");
                        }} disabled={!newBirdName} className="w-full bg-teal-500 hover:bg-teal-400 text-black font-black py-6 rounded-3xl uppercase text-[12px] tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(45,212,191,0.4)] active:scale-95 transition-all"><Zap className="w-5 h-5 inline mr-2" /> Inject DNA</button>
                        {editingId && <button onClick={() => { setEditingId(null); setNewBirdName(""); setNewBirdTransforms(defaultTransforms()); }} className="bg-zinc-800 text-white font-black py-6 rounded-3xl uppercase text-[10px] tracking-widest active:scale-95 transition-all">Abort Edit</button>}
                   </div>
                </div>
                
                <div className="space-y-4 flex-1">
                  <h3 className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.3em] px-2">Genetic History</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {customBirds.map(b => (
                    <div key={b.id} className="bg-white/5 p-5 rounded-3xl flex items-center justify-between group hover:bg-white/10 border border-white/5">
                       <span className="text-white text-[11px] font-black uppercase truncate pr-4">{b.name}</span>
                       <div className="flex gap-1">
                         <button onClick={() => { setEditingId(b.id); setNewBirdName(b.name); setNewBirdTransforms({...b.transforms}); setNewBirdGlobalScale(b.globalScale); setNewBirdGlobalRotation(b.globalRotation); setNewBirdAssets({...b.assets}); }} className="p-3 text-zinc-500 hover:text-teal-400 transition-colors"><Edit2 className="w-5 h-5" /></button>
                         <button onClick={() => deleteBirdFromDB(b.id).then(() => getAllBirdsFromDB()).then(setCustomBirds)} className="p-3 text-zinc-500 hover:text-rose-400 transition-colors"><Trash2 className="w-5 h-5" /></button>
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
        input[type=range]::-webkit-slider-runnable-track { height: 8px; background: #27272a; border-radius: 8px; }
      `}</style>
    </div>
  );
};
export default HandAR;
