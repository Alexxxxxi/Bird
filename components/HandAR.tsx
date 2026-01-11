
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bird } from './Bird';
import { Butterfly } from './Butterfly';
import { CreatureState, CustomBirdConfig } from '../types';
import { getDistance, lerp, isFist, getUpperHandHull, getPointOnPolyline } from '../utils/geometry';
import { PRESET_BIRDS } from '../constants';
import { saveBirdToDB, getAllBirdsFromDB, deleteBirdFromDB } from '../utils/db';
import { 
  X, Settings2, Sparkles, Trash2, RefreshCw 
} from 'lucide-react';

declare global { interface Window { FaceMesh: any; Hands: any; Camera: any; } }

const NO_FACE_TEXTS = [
  "人呢?快出来陪我玩...",
  "快来和你的新朋友们打个招呼..."
];

const WAITING_SMILE_TEXTS = [
  "微笑一下，让春天找到你..",
  "笑一个，你的微笑即将被回应...",
  "嘴角上扬，欢迎新朋友吧..",
  "笑一笑，他们就有方向了..."
];

const SMILING_TEXTS = [
  "轻轻摇晃，看看他们给你戴上了什么小礼物...",
  "轻轻晃一晃，看看他们送了什么给你..."
];

const AFTER_SMILE_TEXTS = [
  "让我们一起，手势比个\"C\"试试呢?",
  "用手比出一个\"C\"，把希望也带进来吧..."
];

const preloadImage = (url: string) => {
  const img = new Image();
  img.src = url;
};

type LimbStateData = { 
  rawPoints: Record<string, any>;
  missingFrames: number;
  centroid: {x: number, y: number};
  velocity: number;
};

const createInitialLimbState = (): LimbStateData => ({ 
  rawPoints: {}, missingFrames: 0, centroid: {x: 0, y: 0}, velocity: 0
});

const VELOCITY_SMOOTHING = 0.8;
const MOVEMENT_DEADZONE = 3.0;
const REFERENCE_FACE_WIDTH = 240; 
const MAX_CREATURES = 100;

const BIRD_LIMIT_PER_AREA = 3;
const BUTTERFLY_LIMIT_PER_AREA = 4;

const THRESHOLDS: Record<string, number> = {
  'Head': 8.0, 'Shoulders': 12.0, 'Hand': 15.0
};

const LOGO_URL = 'https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/LOGO.png';

const loadScript = (src: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src; 
    script.crossOrigin = "anonymous";
    script.onload = () => {
      console.log(`[Script] Loaded: ${src}`);
      resolve();
    }; 
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
};

const HandAR: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showAssetPanel, setShowAssetPanel] = useState(false);
  const [customCreatures, setCustomCreatures] = useState<CustomBirdConfig[]>([]);
  const customCreaturesRef = useRef<CustomBirdConfig[]>([]);
  const [anySmile, setAnySmile] = useState(false);
  
  const [hintText, setHintText] = useState("");
  const [hintVisible, setHintVisible] = useState(true);
  const hasSmiledRef = useRef(false);
  const isFaceVisibleRef = useRef(false);

  const creaturesRef = useRef<any[]>([]);
  const limbStatesRef = useRef<Map<string, LimbStateData>>(new Map());
  const faceMeshRef = useRef<any>(null);
  const handsRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const globalFaceWidthRef = useRef<number>(240);
  const lastSpawnTimesRef = useRef<Map<string, number>>(new Map());

  const spawnSpecificCreature = useCallback((targetId: string, category: 'bird' | 'butterfly') => {
    const pool = customCreaturesRef.current.filter(c => c.category === category);
    if (pool.length === 0 || !canvasRef.current || creaturesRef.current.length >= MAX_CREATURES) return;
    
    const cfg = pool[Math.floor(Math.random() * pool.length)];
    const randomOffset = 0.05 + Math.random() * 0.9;
    const creature = category === 'butterfly' 
      ? new Butterfly(canvasRef.current.width, canvasRef.current.height, targetId, randomOffset, cfg) 
      : new Bird(canvasRef.current.width, canvasRef.current.height, 100, targetId, randomOffset, [cfg]);
    creaturesRef.current.push(creature);
  }, []);

  useEffect(() => {
    const logo = new Image();
    logo.crossOrigin = "anonymous";
    logo.src = LOGO_URL;
    logo.onload = () => { logoImgRef.current = logo; };
  }, []);

  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();
    const render = (time: number) => {
      const dt = Math.min(time - lastTime, 100); 
      lastTime = time;
      const canvas = canvasRef.current; const ctx = canvas?.getContext('2d'); const video = videoRef.current;
      if (!canvas || !ctx || !video || video.readyState < 2) { frameId = requestAnimationFrame(render); return; }
      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      }

      ctx.save();
      const ratio = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      const dw = video.videoWidth * ratio, dh = video.videoHeight * ratio;
      const ox = (canvas.width - dw) / 2, oy = (canvas.height - dh) / 2;
      ctx.translate(canvas.width, 0); ctx.scale(-1, 1); ctx.drawImage(video, ox, oy, dw, dh); ctx.restore();

      creaturesRef.current = creaturesRef.current.filter(c => {
        let targetPoint = null;
        let depthScale = Math.min(Math.max(globalFaceWidthRef.current / REFERENCE_FACE_WIDTH, 0.3), 3.0);
        const state = limbStatesRef.current.get(c.targetId);
        
        if (state && state.missingFrames < 30) {
          const t = c.perchOffset;
          if (c.targetId === 'Primary_Head') {
            const { earL, earR } = state.rawPoints;
            if (earL && earR) {
              const tx = lerp(earL.x, earR.x, t);
              const faceWidth = getDistance(earL, earR);
              const baseTy = lerp(earL.y, earR.y, t) - faceWidth * 0.45;
              const archY = Math.sin(t * Math.PI) * faceWidth * 0.35;
              targetPoint = { x: tx, y: baseTy - archY };
            }
          } else if (c.targetId === 'Left_Shoulder') {
            const { start, end } = state.rawPoints;
            if (start && end) targetPoint = { x: lerp(start.x, end.x, t), y: lerp(start.y, end.y, t) };
          } else if (c.targetId === 'Right_Shoulder') {
            const { start, end } = state.rawPoints;
            if (start && end) targetPoint = { x: lerp(start.x, end.x, t), y: lerp(start.y, end.y, t) };
          } else if (c.targetId.startsWith('Hand_')) {
            const { hull, palm } = state.rawPoints;
            targetPoint = (hull && hull.length > 1) ? getPointOnPolyline(hull, t) : palm;
          }
        } else if (state && state.missingFrames > 150 && c.state !== CreatureState.FLYING_AWAY) {
          c.state = CreatureState.FLYING_AWAY;
        }
        
        c.update(dt, targetPoint, creaturesRef.current, depthScale);
        c.draw(ctx);
        return !(c.state === CreatureState.FLYING_AWAY && (c.y < -500 || c.y > canvas.height + 500));
      });

      const logoImg = logoImgRef.current;
      if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
        const logoRatio = lerp(0.25, 0.10, Math.min(Math.max((canvas.width - 375) / 1225, 0), 1));
        const logoTargetWidth = canvas.width * logoRatio;
        const logoScale = logoTargetWidth / logoImg.naturalWidth;
        const ldw = logoImg.naturalWidth * logoScale;
        const ldh = logoImg.naturalHeight * logoScale;
        const ldx = (canvas.width - ldw) / 2;
        const ldy = canvas.height * 0.05; 
        ctx.drawImage(logoImg, ldx, ldy, ldw, ldh);
      }

      frameId = requestAnimationFrame(render);
    };
    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const onFaceResultsRef = useRef<(results: any) => void>(() => {});
  const onHandResultsRef = useRef<(results: any) => void>(() => {});

  onFaceResultsRef.current = (results: any) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      setAnySmile(false); isFaceVisibleRef.current = false; return;
    }
    isFaceVisibleRef.current = true;
    const ratio = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const dw = video.videoWidth * ratio, dh = video.videoHeight * ratio;
    const ox = (canvas.width - dw) / 2, oy = (canvas.height - dh) / 2;
    const toPx = (l: any) => ({ x: (1.0 - l.x) * dw + ox, y: l.y * dh + oy });

    const landmarks = results.multiFaceLandmarks[0];
    const earL = toPx(landmarks[234]), earR = toPx(landmarks[454]);
    const faceWidth = getDistance(earL, earR);
    globalFaceWidthRef.current = faceWidth;

    const headId = `Primary_Head`;
    const mouthL = toPx(landmarks[61]), mouthR = toPx(landmarks[291]);
    const isSmiling = (getDistance(mouthL, mouthR) / faceWidth) > 0.35;
    
    if (isSmiling !== anySmile) setAnySmile(isSmiling);

    updateLimbState(headId, { x: (earL.x + earR.x)/2, y: (earL.y + earR.y)/2 }, { earL, earR }, 'Head');
    
    const chin = toPx(landmarks[152]), forehead = toPx(landmarks[10]);
    const faceHeight = getDistance(forehead, chin);
    const neck = { x: chin.x, y: chin.y + faceHeight * 0.05 };
    const leftTip = { x: chin.x - faceWidth * 1.5, y: neck.y + faceHeight * 0.6 };
    const rightTip = { x: chin.x + faceWidth * 1.5, y: neck.y + faceHeight * 0.6 };
    
    updateLimbState('Left_Shoulder', { x: (leftTip.x + neck.x)/2, y: (leftTip.y + neck.y)/2 }, { start: leftTip, end: neck }, 'Shoulders');
    updateLimbState('Right_Shoulder', { x: (neck.x + rightTip.x)/2, y: (neck.y + rightTip.y)/2 }, { start: neck, end: rightTip }, 'Shoulders');

    if (isSmiling) {
      const now = performance.now();
      const lastTime = lastSpawnTimesRef.current.get('GLOBAL_SPAWN_LOCK') || 0;
      if (now - lastTime > (500 + Math.random() * 500)) {
        const potentialTargets = [
          { id: 'Primary_Head', type: 'Head' },
          { id: 'Left_Shoulder', type: 'Shoulders' },
          { id: 'Right_Shoulder', type: 'Shoulders' }
        ];
        for (let i = 0; i < 2; i++) {
            const hId = `Hand_${i}`;
            const hState = limbStatesRef.current.get(hId);
            if (hState && hState.missingFrames < 10) potentialTargets.push({ id: hId, type: 'Hand' });
        }
        const validOptions: { targetId: string, category: 'bird' | 'butterfly' }[] = [];
        potentialTargets.forEach(target => {
          const areaCreatures = creaturesRef.current.filter(c => c.targetId === target.id && c.state !== CreatureState.FLYING_AWAY);
          const birdCount = areaCreatures.filter(c => c.customConfig?.category === 'bird').length;
          const butterflyCount = areaCreatures.filter(c => c.customConfig?.category === 'butterfly').length;
          if (birdCount < BIRD_LIMIT_PER_AREA) validOptions.push({ targetId: target.id, category: 'bird' });
          if (butterflyCount < BUTTERFLY_LIMIT_PER_AREA) validOptions.push({ targetId: target.id, category: 'butterfly' });
        });
        
        if (validOptions.length > 0) {
          const choice = validOptions[Math.floor(Math.random() * validOptions.length)];
          spawnSpecificCreature(choice.targetId, choice.category);
          lastSpawnTimesRef.current.set('GLOBAL_SPAWN_LOCK', now);
        }
      }
    }
  };

  onHandResultsRef.current = (results: any) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !results.multiHandLandmarks) return;
    const ratio = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const dw = video.videoWidth * ratio, dh = video.videoHeight * ratio;
    const ox = (canvas.width - dw) / 2, oy = (canvas.height - dh) / 2;
    const toPx = (l: any) => ({ x: (1.0 - l.x) * dw + ox, y: l.y * dh + oy });
    results.multiHandLandmarks.forEach((landmarks: any, index: number) => {
      const handId = `Hand_${index}`;
      const pxLandmarks = landmarks.map(toPx);
      const palm = pxLandmarks[9];
      const hull = getUpperHandHull(pxLandmarks);
      updateLimbState(handId, palm, { palm, hull }, 'Hand');
      if (isFist(landmarks)) {
        creaturesRef.current.forEach(c => { 
            if (c.targetId === handId && c.state !== CreatureState.FLYING_AWAY) c.state = CreatureState.FLYING_AWAY; 
        });
      }
    });
  };

  function updateLimbState(label: string, nCentroid: {x: number, y: number}, rawPoints: any, category: string) {
    if (!limbStatesRef.current.has(label)) limbStatesRef.current.set(label, createInitialLimbState());
    const s = limbStatesRef.current.get(label)!;
    const diff = Math.max(0, getDistance(s.centroid, nCentroid) - MOVEMENT_DEADZONE);
    s.velocity = s.velocity * VELOCITY_SMOOTHING + diff * (1 - VELOCITY_SMOOTHING);
    if (s.velocity > (THRESHOLDS[category] || 10)) {
      creaturesRef.current.forEach(c => { if (c.targetId === label && c.state !== CreatureState.FLYING_AWAY) c.state = CreatureState.FLYING_AWAY; });
    }
    s.centroid = nCentroid; s.rawPoints = rawPoints; s.missingFrames = 0;
  }

  useEffect(() => {
    let ignore = false;
    const init = async () => {
      try {
        if (ignore) return;
        setIsLoading(true);

        const ASSETS_TO_PRELOAD = [
          "https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/_1-ezgif.com-gif-to-sprite-converter.png",
          "https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/bird_stand%20V2.png",
          "https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/Butterfly%20V2.gif",
          "https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/Background%201.png",
          "https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/LOGO.png"
        ];
        ASSETS_TO_PRELOAD.forEach(url => preloadImage(url));

        const cameraScriptPromise = loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
        const faceScriptPromise = loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js");
        const handScriptPromise = loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");
        await cameraScriptPromise;
        if (videoRef.current && window.Camera) {
          cameraRef.current = new window.Camera(videoRef.current, {
            onFrame: async () => {
              if (!videoRef.current || ignore) return;
              if (faceMeshRef.current) await faceMeshRef.current.send({ image: videoRef.current });
              if (handsRef.current) await handsRef.current.send({ image: videoRef.current });
            },
            width: 1280, height: 720
          });
          await cameraRef.current.start();
        }
        await Promise.all([faceScriptPromise, handScriptPromise]);
        if (window.FaceMesh) {
          const faceMesh = new window.FaceMesh({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
          faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
          faceMesh.onResults((r: any) => onFaceResultsRef.current(r));
          faceMeshRef.current = faceMesh;
        }
        if (window.Hands) {
          const hands = new window.Hands({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
          hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
          hands.onResults((r: any) => onHandResultsRef.current(r));
          handsRef.current = hands;
        }

        // Force-sync presets from constants into IndexedDB every time to ensure stale configurations are overwritten.
        for (const p of PRESET_BIRDS) {
          await saveBirdToDB(p);
        }
        
        customCreaturesRef.current = await getAllBirdsFromDB();
        setCustomCreatures(customCreaturesRef.current);
        setIsLoading(false);
      } catch (e: any) {
        if (!ignore) { setErrorMsg(e.message); setIsLoading(false); }
      }
    };
    init();
    return () => { ignore = true; if (cameraRef.current) cameraRef.current.stop(); };
  }, []);

  useEffect(() => {
    const updateText = () => {
      setHintVisible(false);
      setTimeout(() => {
        let texts = !isFaceVisibleRef.current 
          ? NO_FACE_TEXTS 
          : (anySmile 
              ? SMILING_TEXTS 
              : (hasSmiledRef.current ? AFTER_SMILE_TEXTS : WAITING_SMILE_TEXTS));
              
        setHintText(texts[Math.floor(Math.random() * texts.length)]);
        setHintVisible(true);
        if (anySmile) hasSmiledRef.current = true;
      }, 500); 
    };
    const interval = setInterval(updateText, 3500); 
    return () => clearInterval(interval);
  }, [anySmile]);

  useEffect(() => {
    const timer = setInterval(() => limbStatesRef.current.forEach(s => s.missingFrames++), 100);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none">
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover z-0" />
      
      <div 
        className="absolute bottom-0 left-0 w-full h-[28%] md:h-[32%] lg:h-[38%] z-10 pointer-events-none transition-all duration-500"
        style={{
          backgroundImage: "url('https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/Background%201.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center 10%',
          backgroundRepeat: 'no-repeat'
        }}
      />

      <div className="absolute top-6 left-6 z-30 pointer-events-none flex items-center gap-4">
        <div className={`w-3 h-3 rounded-full transition-all duration-300 ${anySmile ? 'bg-teal-400 shadow-[0_0_10px_#2dd4bf]' : 'bg-white/20'}`} />
        <span className="text-white/40 text-[10px] font-mono tracking-widest uppercase">Smile Sensor</span>
      </div>
      
      <div className={`absolute bottom-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none transition-all duration-700 ${hintVisible ? 'opacity-90' : 'opacity-0 translate-y-2'}`}>
        <div className="bg-black/60 backdrop-blur-lg px-10 py-4 rounded-full border border-white/10 shadow-2xl">
           <span 
             className="text-white text-lg font-bold tracking-widest text-center block whitespace-nowrap drop-shadow-lg"
             style={{ fontFamily: '"Microsoft YaHei", "微软雅黑", sans-serif' }}
           >
             {hintText}
           </span>
        </div>
      </div>
      
      <div className="absolute top-0 right-0 p-6 z-20 pointer-events-none">
        <button onClick={() => setShowAssetPanel(true)} className="bg-black/40 p-4 rounded-2xl border border-white/10 text-teal-400 pointer-events-auto hover:bg-white/10 transition-colors shadow-xl backdrop-blur-md">
            <Settings2 />
        </button>
      </div>

      {isLoading && (
        <div className="absolute inset-0 z-[100] bg-black flex flex-col items-center justify-center text-teal-400 font-mono tracking-[0.5em] animate-pulse">
          <RefreshCw className="animate-spin mb-4" /> 
          <span className="text-center px-10 uppercase">{errorMsg ? `ERROR: ${errorMsg}` : "Synchronizing Reality..."}</span>
        </div>
      )}

      {showAssetPanel && (
        <div className="absolute inset-0 z-40 bg-black/95 backdrop-blur-3xl flex items-center justify-center p-8 animate-in fade-in duration-300" onClick={() => setShowAssetPanel(false)}>
          <div className="bg-zinc-900 border border-white/10 w-full max-w-[1000px] rounded-[2.5rem] flex flex-col h-[80vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-white/5 flex justify-between items-center shrink-0">
              <h2 className="text-white font-black uppercase tracking-widest flex items-center gap-4"><Sparkles className="text-teal-400" /> SPECIES DNA</h2>
              <button onClick={() => setShowAssetPanel(false)} className="bg-zinc-800 p-2 rounded-full text-zinc-400 hover:text-white transition-colors"><X /></button>
            </div>
            <div className="flex-1 p-10 overflow-y-auto">
                <div className="grid gap-4">
                    {customCreatures.map(c => (
                        <div key={c.id} className="p-6 rounded-[2rem] flex items-center justify-between border bg-white/5 border-white/5">
                           <div className="flex flex-col">
                              <span className="text-white font-black text-sm uppercase tracking-wider">{c.name}</span>
                              <span className="text-white/20 font-mono text-[9px] uppercase tracking-widest">{c.id}</span>
                           </div>
                           <div className="flex items-center gap-4">
                             <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${c.category === 'bird' ? 'bg-teal-500/10 text-teal-400' : 'bg-purple-500/10 text-purple-400'}`}>
                                {c.category}
                             </span>
                             <button onClick={() => deleteBirdFromDB(c.id).then(() => getAllBirdsFromDB()).then(l => { setCustomCreatures(l); customCreaturesRef.current = l; })} className="p-4 text-zinc-500 hover:text-rose-400"><Trash2 className="w-5 h-5"/></button>
                           </div>
                        </div>
                    ))}
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HandAR;
