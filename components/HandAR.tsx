
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bird } from './Bird';
import { Butterfly } from './Butterfly';
import { CreatureState, CustomBirdConfig, CustomBirdTransforms, PartTransform, CreatureCategory } from '../types';
import { getDistance, getUpperHandHull, getPointOnPolyline } from '../utils/geometry';
import { PRESET_BIRDS, ASSET_LIBRARY } from '../constants';
import { saveBirdToDB, getAllBirdsFromDB, deleteBirdFromDB } from '../utils/db';
import { 
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
  ZapOff,
  Bird as BirdIcon,
  Bug,
  Check
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
const defaultTransforms = (): CustomBirdTransforms => ({ 
  head: defaultPart(), 
  body: defaultPart(), 
  wingsFront: defaultPart(), 
  wingsBack: defaultPart() 
});

const SHAKE_EXIT_THRESHOLD = 22.0; 

// --- Input Components ---

const NumericInput = ({ value, onChange, min, max, step }: { value: number, onChange: (v: number) => void, min: number, max: number, step?: number }) => (
  <input 
    type="number" 
    value={Number(value.toFixed(step === 1 ? 0 : 2))} 
    step={step || 1}
    onChange={(e) => {
      let v = parseFloat(e.target.value);
      if (isNaN(v)) return;
      v = Math.max(min, Math.min(max, v));
      onChange(v);
    }}
    onClick={(e) => e.stopPropagation()}
    className="bg-black/60 text-teal-400 font-mono text-[11px] font-bold px-3 py-1.5 rounded-lg border border-white/10 focus:border-teal-400/50 outline-none w-20 text-right transition-all shadow-inner"
  />
);

const ControlRow = ({ label, value, onChange, min, max, step }: { label: string, value: number, onChange: (v: number) => void, min: number, max: number, step?: number }) => (
  <div className="space-y-1.5 group" onClick={(e) => e.stopPropagation()}>
    <div className="flex justify-between items-center px-1">
      <span className="text-zinc-600 group-hover:text-zinc-400 text-[10px] font-black uppercase tracking-widest transition-colors">{label}</span>
      <NumericInput value={value} onChange={onChange} min={min} max={max} step={step} />
    </div>
    <div className="relative h-6 flex items-center">
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={step || 1} 
        value={value} 
        onInput={(e) => onChange(parseFloat((e.target as HTMLInputElement).value))} 
        className="w-full h-1.5 bg-black/50 rounded-full appearance-none cursor-pointer accent-teal-400" 
      />
    </div>
  </div>
);

// --- Dropdown Component ---

interface CustomDropdownProps {
  label: string;
  part: keyof CustomBirdTransforms;
  options: {id: string, url: string, label: string}[];
  currentAssets: Record<string, string>;
  openDropdown: string | null;
  setOpenDropdown: (val: string | null) => void;
  setNewAssets: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  newTransforms: CustomBirdTransforms;
  setNewTransforms: React.Dispatch<React.SetStateAction<CustomBirdTransforms>>;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({ 
  label, part, options, currentAssets, openDropdown, setOpenDropdown, setNewAssets, newTransforms, setNewTransforms 
}) => {
  const isOpen = openDropdown === part;
  const selectedOption = options.find(o => o.url === currentAssets[part]) || options[0];

  return (
    <div className="bg-zinc-800/80 p-6 rounded-[2rem] border border-white/10 space-y-6 relative shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-col gap-2 relative">
        <label className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">{label}</label>
        <div className="relative">
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              setOpenDropdown(isOpen ? null : part); 
            }}
            className="w-full bg-black/60 border border-white/10 rounded-2xl px-5 py-4 flex items-center justify-between text-white text-[12px] font-black hover:border-teal-400/50 transition-all shadow-inner"
          >
            <div className="flex items-center gap-4">
              <img src={selectedOption.url} className="w-8 h-8 rounded-lg bg-zinc-800 object-cover border border-white/10" alt="" />
              <span className="tracking-widest">{selectedOption.label}</span>
            </div>
            <ChevronDown className={`w-5 h-5 text-zinc-500 transition-transform ${isOpen ? 'rotate-180 text-teal-400' : ''}`} />
          </button>

          {isOpen && (
            <div className="absolute top-[calc(100%+12px)] left-0 w-full bg-zinc-950 border border-white/10 rounded-[1.5rem] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-[100] max-h-[300px] overflow-y-auto custom-scrollbar">
              {options.map(opt => (
                <button 
                  key={opt.id} 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setNewAssets(prev => ({...prev, [part]: opt.url})); 
                    setOpenDropdown(null); 
                  }}
                  className={`w-full text-left px-5 py-4 flex items-center justify-between hover:bg-white/5 transition-all border-b border-white/5 last:border-0 ${currentAssets[part] === opt.url ? 'bg-teal-400/10 text-teal-400' : 'text-zinc-500'}`}
                >
                  <div className="flex items-center gap-4">
                    <img src={opt.url} className="w-12 h-12 rounded-xl bg-black object-cover border border-white/10 shadow-lg" alt="" />
                    <span className="text-[11px] font-black tracking-widest">{opt.label}</span>
                  </div>
                  {currentAssets[part] === opt.url && <Check className="w-5 h-5" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <div className="space-y-5 pt-4 border-t border-white/5">
        <ControlRow label="X-Axis" value={newTransforms[part].x} onChange={(v) => setNewTransforms(p => ({...p, [part]: {...p[part], x: v}}))} min={-60} max={60} />
        <ControlRow label="Y-Axis" value={newTransforms[part].y} onChange={(v) => setNewTransforms(p => ({...p, [part]: {...p[part], y: v}}))} min={-60} max={60} />
        <ControlRow label="Spin" value={newTransforms[part].rotate} onChange={(v) => setNewTransforms(p => ({...p, [part]: {...p[part], rotate: v}}))} min={-180} max={180} />
        <ControlRow label="Scale" value={newTransforms[part].scale} onChange={(v) => setNewTransforms(p => ({...p, [part]: {...p[part], scale: v}}))} min={0.1} max={5.0} step={0.01} />
      </div>
    </div>
  );
};

// --- Main Component ---

const HandAR: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCreatureRef = useRef<any>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isMirrored, setIsMirrored] = useState(true);
  const [showAssetPanel, setShowAssetPanel] = useState(false);
  const [customCreatures, setCustomCreatures] = useState<CustomBirdConfig[]>([]);
  const customCreaturesRef = useRef<CustomBirdConfig[]>([]);
  
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [showCamMenu, setShowCamMenu] = useState(false);

  const [isSmiling, setIsSmiling] = useState(false);
  const [smileIntensity, setSmileIntensity] = useState(0);

  // DNA Lab State
  const [activeCategory, setActiveCategory] = useState<CreatureCategory>('bird');
  const [newName, setNewName] = useState("");
  const [newAssets, setNewAssets] = useState<Record<string, string>>({
    head: ASSET_LIBRARY.heads[0].url,
    body: ASSET_LIBRARY.bodies[2].url,
    wingsFront: ASSET_LIBRARY.wings[4].url,
    wingsBack: ASSET_LIBRARY.wings[5].url
  });
  const [newTransforms, setNewTransforms] = useState<CustomBirdTransforms>(defaultTransforms());
  const [newGlobalScale, setNewGlobalScale] = useState(1.0);
  const [newGlobalRotation, setNewGlobalRotation] = useState(0);
  const [newGlobalX, setNewGlobalX] = useState(0);
  const [newGlobalY, setNewGlobalY] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const creaturesRef = useRef<any[]>([]);
  const limbStatesRef = useRef<Map<string, LimbStateData>>(new Map());
  const holisticRef = useRef<any>(null);
  const isProcessingRef = useRef(false);
  const isSmilingRef = useRef(false);
  const lastSpawnTimeRef = useRef(0);

  // Helper to get current ephemeral config
  const getCurrentEphemeralConfig = (id: string, name: string): CustomBirdConfig => ({
    id,
    category: activeCategory,
    name: name || 'Unnamed Unit',
    assets: { ...newAssets },
    transforms: JSON.parse(JSON.stringify(newTransforms)),
    globalScale: newGlobalScale,
    globalRotation: newGlobalRotation,
    globalX: newGlobalX,
    globalY: newGlobalY,
    flapAmplitude: activeCategory === 'butterfly' ? 1.5 : 1.0,
    baseSize: 22,
    sizeRange: 0.1
  });

  // REAL-TIME SYNC EFFECT: Sync DNA Lab changes to flying creatures instantly
  useEffect(() => {
    if (!editingId) return;
    const currentCfg = getCurrentEphemeralConfig(editingId, newName);
    creaturesRef.current.forEach(c => {
      if (c.customConfig?.id === editingId) {
        c.updateConfig(currentCfg);
      }
    });
  }, [newTransforms, newGlobalScale, newGlobalRotation, newGlobalX, newGlobalY, newAssets, activeCategory, editingId, newName]);

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

      if (isSmilingRef.current) {
        if (time - lastSpawnTimeRef.current > 800) {
          const availableTargets = Array.from(limbStatesRef.current.keys()).filter(l => limbStatesRef.current.get(l)!.missingFrames < 15);
          if (availableTargets.length > 0) {
            const targetId = availableTargets[Math.floor(Math.random() * availableTargets.length)];
            const pool = customCreaturesRef.current;
            if (pool.length > 0) {
               const cfg = pool[Math.floor(Math.random() * pool.length)];
               const creature = cfg.category === 'butterfly' 
                  ? new Butterfly(canvas.width, canvas.height, targetId, undefined, cfg)
                  : new Bird(canvas.width, canvas.height, 100, targetId, undefined, [cfg]);
               creaturesRef.current.push(creature);
            }
            lastSpawnTimeRef.current = time;
          }
        }
      } else { lastSpawnTimeRef.current = time - 500; }

      const latestContours: Record<string, any[]> = {};
      limbStatesRef.current.forEach((s, l) => { latestContours[l] = s.prevContour; });

      creaturesRef.current = creaturesRef.current.filter(c => {
        const targetPoint = latestContours[c.targetId] ? getPointOnPolyline(latestContours[c.targetId], c.perchOffset) : null;
        c.update(dt, targetPoint, creaturesRef.current);
        c.draw(ctx);
        return !(c.state === CreatureState.FLYING_AWAY && (c.y < -300 || c.y > canvas.height + 300 || c.x < -300 || c.x > canvas.width + 300));
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

    if (results.faceLandmarks) {
      const mouthL = results.faceLandmarks[61];
      const mouthR = results.faceLandmarks[291];
      const faceL = results.faceLandmarks[234];
      const faceR = results.faceLandmarks[454];
      if (mouthL && mouthR && faceL && faceR) {
        const widthRatio = getDistance(mouthL, mouthR) / getDistance(faceL, faceR);
        const currentlySmiling = widthRatio > 0.38;
        isSmilingRef.current = currentlySmiling;
        setIsSmiling(currentlySmiling);
        setSmileIntensity(Math.min(1, (widthRatio - 0.35) * 10));
      }
    } else { isSmilingRef.current = false; setIsSmiling(false); }

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
        nCentroid = top;
        nContour = [toPx(results.faceLandmarks[332]), top, toPx(results.faceLandmarks[103])];
        state.width = getDistance(nContour[0], nContour[2]) * 1.5;
      } else if (type === 'shoulder') {
        const isLeft = label === 'LeftShoulder';
        const sIdx = isLeft ? 11 : 12;
        const oIdx = isLeft ? 12 : 11;
        if (!landmarks[sIdx] || !landmarks[oIdx]) return;
        const s = toPx(landmarks[sIdx]);
        const o = toPx(landmarks[oIdx]);
        const neck = { x: (s.x + o.x) / 2, y: (s.y + o.y) / 2 };
        const vx = s.x - neck.x, vy = s.y - neck.y;
        nCentroid = s;
        nContour = [{ x: s.x - vx * 0.5, y: s.y - vy * 0.5 }, s, { x: s.x + vx * 0.3, y: s.y + vy * 0.2 }];
        state.width = getDistance(nContour[0], nContour[2]);
      } else if (type === 'hand') {
        nCentroid = px[0];
        nContour = getUpperHandHull(px);
        state.width = getDistance(px[5], px[17]) * 3;
      }

      state.velocity = state.velocity * 0.7 + getDistance(state.centroid, nCentroid) * 0.3;
      state.centroid = nCentroid;
      if (state.velocity > SHAKE_EXIT_THRESHOLD) {
        creaturesRef.current.forEach(b => { if (b.targetId === label) b.state = CreatureState.FLYING_AWAY; });
      }
      state.prevContour = nContour;
      state.missingFrames = 0;
    };

    processLimb(results.faceLandmarks, 'Head', 'head');
    if (results.poseLandmarks) {
      if (results.poseLandmarks[11]?.visibility > 0.5) processLimb(results.poseLandmarks, 'LeftShoulder', 'shoulder');
      if (results.poseLandmarks[12]?.visibility > 0.5) processLimb(results.poseLandmarks, 'RightShoulder', 'shoulder');
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
          video: { deviceId: selectedCamera ? { exact: selectedCamera } : undefined, width: { ideal: 1920 }, height: { ideal: 1080 } } 
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
           customCreaturesRef.current = await getAllBirdsFromDB();
        } else { customCreaturesRef.current = existing; }
        setCustomCreatures(customCreaturesRef.current);
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

  // Preview Framing Logic (2/3 filling)
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !showAssetPanel) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentId = editingId || 'preview';
    const cfg = getCurrentEphemeralConfig(currentId, newName);
    cfg.baseSize = 280; // Ensure 2/3 coverage of the 400px canvas

    if (!previewCreatureRef.current || previewCreatureRef.current.customConfig.category !== activeCategory) {
      if (activeCategory === 'butterfly') {
        previewCreatureRef.current = new Butterfly(canvas.width, canvas.height, 'none', 0.5, cfg);
      } else {
        previewCreatureRef.current = new Bird(canvas.width, canvas.height, 100, 'none', 0.5, [cfg]);
      }
    } else {
      previewCreatureRef.current.updateConfig(cfg);
    }

    let reqId: number;
    const renderPreview = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (previewCreatureRef.current) {
        previewCreatureRef.current.x = canvas.width / 2;
        previewCreatureRef.current.y = canvas.height / 2;
        previewCreatureRef.current.state = CreatureState.PERCHED;
        previewCreatureRef.current.update(16, { x: canvas.width / 2, y: canvas.height / 2 }, []);
        previewCreatureRef.current.draw(ctx);
      }
      reqId = requestAnimationFrame(renderPreview);
    };
    reqId = requestAnimationFrame(renderPreview);
    return () => cancelAnimationFrame(reqId);
  }, [newTransforms, newGlobalScale, newGlobalRotation, newGlobalX, newGlobalY, newAssets, showAssetPanel, activeCategory, newName, editingId]);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none font-sans" onClick={() => setOpenDropdown(null)}>
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      
      {isLoading && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center">
          <RefreshCw className="w-10 h-10 text-teal-400 animate-spin mb-6" />
          <p className="text-white font-medium text-[11px] uppercase tracking-[0.5em] animate-pulse">Initializing Lab...</p>
        </div>
      )}

      {/* HUD Overlay */}
      <div className="absolute inset-x-0 top-0 p-4 flex justify-between items-start pointer-events-none z-20">
        <div className="flex flex-col gap-3">
          <div className={`transition-all duration-300 px-4 py-2 rounded-xl border flex flex-col gap-2 pointer-events-auto shadow-xl backdrop-blur-xl min-w-[160px] ${isSmiling ? 'bg-teal-500/10 border-teal-400/40 text-teal-300' : 'bg-black/40 border-white/5 text-zinc-600'}`}>
            <div className="flex items-center gap-3">
              {isSmiling ? <Smile className="w-5 h-5 animate-pulse" /> : <ZapOff className="w-5 h-5 opacity-40" />}
              <div className="flex flex-col">
                <span className="text-[10px] font-black tracking-[0.1em] uppercase leading-tight">{isSmiling ? 'Aura Peak' : 'Aura Stable'}</span>
                <span className="text-[8px] font-bold uppercase tracking-widest opacity-60">Frequency Sync</span>
              </div>
            </div>
            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
              <div className={`h-full transition-all duration-300 rounded-full ${isSmiling ? 'bg-teal-400 shadow-[0_0_12px_#2dd4bf]' : 'bg-zinc-800'}`} style={{ width: `${smileIntensity * 100}%` }} />
            </div>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); setShowCamMenu(!showCamMenu); }} 
            className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl border border-white/5 text-white/40 hover:text-white flex items-center gap-3 transition-all pointer-events-auto shadow-lg"
          >
            <Camera className="w-4 h-4" />
            <ChevronDown className={`w-3 h-3 transition-transform ${showCamMenu ? 'rotate-180' : ''}`} />
          </button>
        </div>
        
        <button 
          onClick={(e) => { e.stopPropagation(); setShowAssetPanel(true); }} 
          className="bg-black/40 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 text-teal-400 hover:scale-105 transition-all active:scale-95 shadow-2xl pointer-events-auto group"
        >
          <Settings2 className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
        </button>
      </div>

      {showAssetPanel && (
        <div 
          className="absolute inset-0 z-40 bg-black/95 backdrop-blur-3xl flex items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-500"
          onClick={() => { setOpenDropdown(null); setShowAssetPanel(false); }}
        >
          <div 
            className="bg-zinc-900/40 border border-white/10 w-full max-w-[1400px] rounded-[3rem] shadow-[0_0_150px_rgba(0,0,0,1)] flex flex-col h-[90vh] overflow-hidden backdrop-blur-2xl"
            onClick={(e) => { e.stopPropagation(); setOpenDropdown(null); }}
          >
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/5 shrink-0">
              <div className="flex items-center gap-6">
                <div className="p-3.5 bg-teal-400/10 rounded-2xl shadow-inner"><Sparkles className="w-6 h-6 text-teal-400" /></div>
                <div>
                  <h2 className="text-lg font-black text-white uppercase tracking-[0.3em]">Genome Studio</h2>
                  <div className="flex items-center gap-4 mt-1.5">
                    <button onClick={(e) => { e.stopPropagation(); setActiveCategory('bird'); }} className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all ${activeCategory === 'bird' ? 'bg-teal-400 border-teal-400 text-black' : 'border-white/10 text-zinc-500 hover:text-white'}`}><BirdIcon className="w-3 h-3"/> Avian</button>
                    <button onClick={(e) => { e.stopPropagation(); setActiveCategory('butterfly'); }} className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all ${activeCategory === 'butterfly' ? 'bg-teal-400 border-teal-400 text-black' : 'border-white/10 text-zinc-500 hover:text-white'}`}><Bug className="w-3 h-3"/> Lepidoptera</button>
                  </div>
                </div>
              </div>
              <button onClick={() => setShowAssetPanel(false)} className="bg-zinc-800 p-3.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all shadow-xl"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar bg-black/30">
                {/* Global Controls Section */}
                <div className="bg-zinc-800/40 p-8 rounded-[2.5rem] border border-teal-400/20 space-y-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-1.5 h-4 bg-teal-400 rounded-full" />
                    <h3 className="text-white text-[11px] font-black uppercase tracking-[0.2em]">Core Essence (Global)</h3>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-6">
                    <ControlRow label="Global X" value={newGlobalX} onChange={setNewGlobalX} min={-100} max={100} />
                    <ControlRow label="Global Y" value={newGlobalY} onChange={setNewGlobalY} min={-100} max={100} />
                    <ControlRow label="Global Scale" value={newGlobalScale} onChange={setNewGlobalScale} min={0.1} max={8.0} step={0.01} />
                    <ControlRow label="Global Rotation" value={newGlobalRotation} onChange={setNewGlobalRotation} min={-180} max={180} />
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <CustomDropdown label="Crown DNA" part="head" options={ASSET_LIBRARY.heads} currentAssets={newAssets} openDropdown={openDropdown} setOpenDropdown={setOpenDropdown} setNewAssets={setNewAssets} newTransforms={newTransforms} setNewTransforms={setNewTransforms} />
                  <CustomDropdown label="Biological Core" part="body" options={ASSET_LIBRARY.bodies} currentAssets={newAssets} openDropdown={openDropdown} setOpenDropdown={setOpenDropdown} setNewAssets={setNewAssets} newTransforms={newTransforms} setNewTransforms={setNewTransforms} />
                  <CustomDropdown label="Dorsal Stabilizer" part="wingsFront" options={ASSET_LIBRARY.wings} currentAssets={newAssets} openDropdown={openDropdown} setOpenDropdown={setOpenDropdown} setNewAssets={setNewAssets} newTransforms={newTransforms} setNewTransforms={setNewTransforms} />
                  <CustomDropdown label="Ventral Wing" part="wingsBack" options={ASSET_LIBRARY.wings} currentAssets={newAssets} openDropdown={openDropdown} setOpenDropdown={setOpenDropdown} setNewAssets={setNewAssets} newTransforms={newTransforms} setNewTransforms={setNewTransforms} />
                </div>
                
                <div className="flex gap-6 pb-12">
                   <div className="flex-1">
                     <input 
                       type="text" 
                       value={newName} 
                       onChange={e => setNewName(e.target.value)} 
                       onClick={e => e.stopPropagation()} 
                       placeholder="Species Identifier..." 
                       className="w-full bg-black/60 border border-white/10 rounded-[1.5rem] px-8 py-5 text-white text-sm font-black tracking-[0.25em] outline-none focus:border-teal-400/40 transition-all shadow-inner" 
                     />
                   </div>
                   <button 
                    onClick={async (e) => {
                        e.stopPropagation();
                        if (!newName) return;
                        const cfg = getCurrentEphemeralConfig(editingId || Math.random().toString(36).substr(2,9), newName);
                        await saveBirdToDB(cfg); 
                        const updatedList = await getAllBirdsFromDB();
                        setCustomCreatures(updatedList);
                        customCreaturesRef.current = updatedList; // Keep ref in sync
                        setEditingId(null); 
                        setNewName("");
                   }} 
                   disabled={!newName} 
                   className="px-10 bg-teal-400 hover:bg-teal-300 disabled:bg-zinc-800 text-black font-black rounded-2xl uppercase text-[12px] tracking-[0.3em] active:scale-95 transition-all shadow-[0_0_40px_rgba(45,212,191,0.2)] flex items-center gap-4"
                  >
                    <Zap className="w-5 h-5" /> {editingId ? 'Update Bio' : 'Initialize'}
                  </button>
                </div>
              </div>

              <div className="w-[450px] border-l border-white/10 bg-zinc-950/20 p-10 flex flex-col shrink-0">
                <div className="aspect-square w-full bg-black/60 rounded-[3.5rem] border border-white/5 flex items-center justify-center relative overflow-hidden shadow-2xl mb-10 group">
                  <canvas ref={previewCanvasRef} width={400} height={400} className="w-full h-full p-10 drop-shadow-[0_0_50px_rgba(45,212,191,0.2)]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-teal-400/5 to-transparent pointer-events-none" />
                </div>
                <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-4">
                  <h3 className="text-zinc-600 text-[11px] font-black uppercase tracking-[0.3em] flex items-center gap-3 px-2 mb-6"><div className="w-2 h-2 rounded-full bg-teal-400" /> Bio-Archive</h3>
                  <div className="space-y-3">
                    {customCreatures.map(c => (
                      <div key={c.id} className={`p-5 rounded-[1.5rem] flex items-center justify-between group border transition-all shadow-lg ${editingId === c.id ? 'bg-teal-400/10 border-teal-400/30' : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10'}`}>
                         <div className="flex flex-col">
                           <span className="text-white font-black text-[12px] uppercase tracking-wider">{c.name}</span>
                           <span className="text-[9px] text-zinc-500 font-bold uppercase mt-1 tracking-widest">{c.category === 'bird' ? 'Avian' : 'Lepidoptera'} Unit</span>
                         </div>
                         <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button onClick={(e) => { 
                             e.stopPropagation(); 
                             setEditingId(c.id); 
                             setNewName(c.name); 
                             setActiveCategory(c.category); 
                             setNewTransforms(JSON.parse(JSON.stringify(c.transforms))); 
                             setNewAssets({...c.assets}); 
                             setNewGlobalScale(c.globalScale);
                             setNewGlobalRotation(c.globalRotation);
                             setNewGlobalX(c.globalX || 0);
                             setNewGlobalY(c.globalY || 0);
                           }} className="p-3 text-zinc-500 hover:text-teal-400 hover:bg-teal-400/10 rounded-xl transition-all"><Edit2 className="w-4 h-4" /></button>
                           <button onClick={(e) => { e.stopPropagation(); deleteBirdFromDB(c.id).then(() => getAllBirdsFromDB()).then((list) => { setCustomCreatures(list); customCreaturesRef.current = list; }); }} className="p-3 text-zinc-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
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
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 10px; }
        input[type=range] { -webkit-appearance: none; background: transparent; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 26px; width: 26px; border-radius: 50%; background: #2dd4bf; border: 7px solid #09090b; cursor: pointer; margin-top: -8px; box-shadow: 0 6px 18px rgba(0,0,0,0.7); transition: transform 0.1s; }
        input[type=range]:active::-webkit-slider-thumb { transform: scale(1.1); background: #5eead4; }
        input[type=range]::-webkit-slider-runnable-track { height: 12px; background: #18181b; border-radius: 10px; border: 1px solid rgba(255,255,255,0.05); }
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
};
export default HandAR;
