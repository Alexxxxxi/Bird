
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bird } from './Bird';
import { BirdState, HandLandmark, PoopEntity, CustomBirdConfig, CustomBirdAssets } from '../types';
import { isFist, getDistance, getUpperHandHull, getPointOnPolyline } from '../utils/geometry';
import { STILLNESS_DURATION_MS, STILLNESS_THRESHOLD, SHAKE_THRESHOLD, CLEAN_THRESHOLD } from '../constants';
import { AlertCircle, Loader2, Camera, FlipHorizontal, Upload, X, Bird as BirdIcon, Check, Settings2 } from 'lucide-react';

declare global {
  interface Window {
    Holistic: any;
    drawConnectors: any;
    drawLandmarks: any;
  }
}

type LimbStateData = {
  lastPos: {x: number, y: number} | null;
  stillnessTimer: number;
  isStill: boolean;
  hasBursted: boolean;
  width: number;
  lastSpawnTime: number;
  prevContour: {x: number, y: number}[];
  missingFrames: number;
  isFistDetected: boolean;
  lastCheckTime: number;
  lastMovement: number;
  headShakeCount: number;
  lastYawDir: 'left' | 'right' | 'center';
  lastShakeTime: number;
};

const createInitialLimbState = (): LimbStateData => ({
  lastPos: null, stillnessTimer: 0, isStill: false, hasBursted: false, width: 0,
  lastSpawnTime: 0, prevContour: [], missingFrames: 0, isFistDetected: false,
  lastCheckTime: 0, lastMovement: 0, headShakeCount: 0, lastYawDir: 'center', lastShakeTime: 0
});

const HandAR: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Summoning Bird Gods... / 正在祈祷鸟神降临...");
  
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [isMirrored, setIsMirrored] = useState(true);
  const isMirroredRef = useRef(true);

  // Custom Asset State
  const [showAssetPanel, setShowAssetPanel] = useState(false);
  const [spacePressedTime, setSpacePressedTime] = useState<number | null>(null);
  const [spaceHoldProgress, setSpaceHoldProgress] = useState(0);
  const [customBirds, setCustomBirds] = useState<CustomBirdConfig[]>([]);
  const customBirdsRef = useRef<CustomBirdConfig[]>([]);

  // New Bird Form State
  const [newBirdName, setNewBirdName] = useState("");
  const [newBirdAssets, setNewBirdAssets] = useState<CustomBirdAssets>({});

  const birdsRef = useRef<Bird[]>([]);
  const poopsRef = useRef<PoopEntity[]>([]);
  const limbStatesRef = useRef<Map<string, LimbStateData>>(new Map());
  const holisticRef = useRef<any>(null);
  const detectionActiveRef = useRef<boolean>(false);

  useEffect(() => {
    isMirroredRef.current = isMirrored;
  }, [isMirrored]);

  useEffect(() => {
    customBirdsRef.current = customBirds;
  }, [customBirds]);

  // Space key hold logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spacePressedTime) {
        setSpacePressedTime(Date.now());
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressedTime(null);
        setSpaceHoldProgress(0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [spacePressedTime]);

  useEffect(() => {
    if (spacePressedTime) {
      const interval = setInterval(() => {
        const elapsed = Date.now() - spacePressedTime;
        const progress = Math.min(elapsed / 3000, 1);
        setSpaceHoldProgress(progress);
        if (progress >= 1) {
          setShowAssetPanel(prev => !prev);
          setSpacePressedTime(null);
          setSpaceHoldProgress(0);
          clearInterval(interval);
        }
      }, 50);
      return () => clearInterval(interval);
    }
  }, [spacePressedTime]);

  const startCamera = useCallback(async (deviceId?: string) => {
      if (videoRef.current?.srcObject) {
          (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
      try {
        const constraints = { video: deviceId ? { deviceId: { exact: deviceId }, width: 1280, height: 720 } : { facingMode: 'user', width: 1280, height: 720 } };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await new Promise(r => videoRef.current!.onloadedmetadata = () => r(null));
          videoRef.current.play();
        }
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter(d => d.kind === 'videoinput'));
        setCurrentDeviceId(stream.getVideoTracks()[0].getSettings().deviceId || '');
      } catch (err) { setError("Camera Error"); setIsLoading(false); }
  }, []);

  useEffect(() => {
    const init = async () => {
      while (!window.Holistic) await new Promise(r => setTimeout(r, 100));
      const holistic = new window.Holistic({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${f}` });
      holistic.setOptions({ modelComplexity: 0, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      holistic.onResults(onResults);
      holisticRef.current = holistic;
      await startCamera();
      setIsLoading(false);
      requestAnimationFrame(loop);
    };
    const loop = async () => {
      if (videoRef.current?.readyState >= 2 && holisticRef.current) await holisticRef.current.send({ image: videoRef.current });
      requestAnimationFrame(loop);
    };
    const onResults = (results: any) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
      ctx.save(); ctx.clearRect(0, 0, canvas.width, canvas.height);
      const img = results.image;
      const ratio = Math.max(canvas.width / img.width, canvas.height / img.height);
      const drawW = img.width * ratio, drawH = img.height * ratio;
      const ox = (canvas.width - drawW) / 2, oy = (canvas.height - drawH) / 2;
      if (isMirroredRef.current) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(img, ox, oy, drawW, drawH);
      const now = performance.now();
      const active = new Set<string>();
      const toPx = (l: any) => ({ x: l.x * drawW + ox, y: l.y * drawH + oy, z: l.z });
      const process = (lm: any, label: string) => {
        if (!lm) return; active.add(label);
        if (!limbStatesRef.current.has(label)) limbStatesRef.current.set(label, createInitialLimbState());
        const state = limbStatesRef.current.get(label)!;
        const px = lm.map(toPx);
        processTargetLogic(px, label, state, canvas.width, canvas.height, now);
        let hull = getUpperHandHull(px);
        if (label === 'Head') hull = hull.map(p => ({...p, y: p.y - state.width * 0.25}));
        state.prevContour = hull;
      };
      process(results.leftHandLandmarks, 'Left');
      process(results.rightHandLandmarks, 'Right');
      process(results.faceLandmarks, 'Head');
      const contours: Record<string, any[]> = {};
      limbStatesRef.current.forEach((s, l) => {
        if (active.has(l)) { s.missingFrames = 0; contours[l] = s.prevContour; }
        else { s.missingFrames++; if (s.missingFrames < 30) contours[l] = s.prevContour; else { scareBirds(l); poopsRef.current = poopsRef.current.filter(p => p.targetId !== l); limbStatesRef.current.delete(l); }}
      });
      detectionActiveRef.current = limbStatesRef.current.size > 0;
      checkWipeInteraction(contours);
      updateGlobalStatus(limbStatesRef.current);
      drawPoops(ctx, contours);
      updateAndDrawBirds(ctx, contours, canvas.width, canvas.height);
      ctx.restore();
    };
    init();
  }, [startCamera]);

  const processTargetLogic = (landmarks: any[], label: string, state: LimbStateData, width: number, height: number, now: number) => {
    let dt = state.lastCheckTime ? now - state.lastCheckTime : 16;
    state.lastCheckTime = now;
    const ref = label === 'Head' ? landmarks[1] : landmarks[0];
    const measured = label === 'Head' ? getDistance(landmarks[234], landmarks[454]) : getDistance(landmarks[5], landmarks[17]);
    state.width = measured || 100;
    const norm = { x: ref.x / width, y: ref.y / height };
    if (label !== 'Head' && isFist(landmarks)) { scareBirds(label); state.isStill = false; state.isFistDetected = true; return; }
    state.isFistDetected = false;
    if (state.lastPos) {
      const dist = getDistance(norm, state.lastPos) * (16 / dt);
      state.lastMovement = dist;
      if (dist > SHAKE_THRESHOLD) {
        if (label !== 'Head') { scareBirds(label); if (dist > CLEAN_THRESHOLD) poopsRef.current = poopsRef.current.filter(p => p.targetId !== label); }
        state.stillnessTimer = 0; state.isStill = false; state.hasBursted = false;
      } else if (dist < STILLNESS_THRESHOLD) {
        state.stillnessTimer += dt;
        if (state.stillnessTimer > STILLNESS_DURATION_MS) {
          state.isStill = true;
          if (!state.hasBursted) {
            if (label === 'Head' && (limbStatesRef.current.has('Left') || limbStatesRef.current.has('Right'))) {
              if (!birdsRef.current.some(b => (b.targetId === 'Left' || b.targetId === 'Right') && b.state !== BirdState.FLYING_AWAY)) return;
            }
            spawnBurst(width, height, label, state.width);
            state.hasBursted = true; state.lastSpawnTime = now;
          } else if (now - state.lastSpawnTime > 2000) { spawnSingleBird(width, height, label, state.width); state.lastSpawnTime = now + Math.random()*1000; }
        }
      } else { state.stillnessTimer = 0; state.isStill = false; }
    }
    if (label === 'Head') {
        const r = (landmarks[1].x - landmarks[234].x) / Math.abs(landmarks[454].x - landmarks[234].x);
        let d: any = r < 0.35 ? 'left' : r > 0.65 ? 'right' : 'center';
        if (d !== 'center' && d !== state.lastYawDir) {
            if (now - state.lastShakeTime < 1000) state.headShakeCount++; else state.headShakeCount = 1;
            state.lastShakeTime = now; state.lastYawDir = d;
        } else if (now - state.lastShakeTime > 1200) state.headShakeCount = 0;
        if (state.headShakeCount >= 6) { scareBirds('Head'); state.headShakeCount = 0; }
    }
    state.lastPos = norm;
  };

  const spawnBurst = (w: number, h: number, l: string, lw: number) => {
    [0.1, 0.3, 0.5, 0.7, 0.9].forEach(o => birdsRef.current.push(new Bird(w, h, lw, l, o, customBirdsRef.current)));
  };
  const spawnSingleBird = (w: number, h: number, l: string, lw: number) => {
    if (birdsRef.current.filter(b => b.state !== BirdState.FLYING_AWAY).length < 60)
      birdsRef.current.push(new Bird(w, h, lw, l, undefined, customBirdsRef.current));
  };
  const scareBirds = (l?: string) => {
    birdsRef.current.forEach(b => { if (b.state !== BirdState.FLYING_AWAY && (!l || b.targetId === l)) b.state = BirdState.FLYING_AWAY; });
    if (l && limbStatesRef.current.has(l)) limbStatesRef.current.get(l)!.hasBursted = false;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, part: keyof CustomBirdAssets) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setNewBirdAssets(prev => ({...prev, [part]: ev.target?.result as string}));
      reader.readAsDataURL(file);
    }
  };

  const addCustomBird = () => {
    if (!newBirdName) return;
    const nb: CustomBirdConfig = { id: Math.random().toString(36).substr(2,9), name: newBirdName, assets: {...newBirdAssets} };
    setCustomBirds(prev => [...prev, nb]);
    setNewBirdName(""); setNewBirdAssets({});
  };

  const checkWipeInteraction = (contours: any) => {
    poopsRef.current = poopsRef.current.filter(poop => {
      const target = contours[poop.targetId]; if (!target) return true;
      const pPos = getPointOnPolyline(target, poop.offset);
      const wipers = ['Left', 'Right'].filter(w => w !== poop.targetId || poop.targetId === 'Head');
      const isWiped = wipers.some(w => {
        const c = contours[w]; if (!c) return false;
        let cx=0, cy=0; c.forEach((p:any) => {cx+=p.x; cy+=p.y;}); cx/=c.length; cy/=c.length;
        const dist = Math.sqrt((cx-pPos.x)**2 + (cy-(pPos.y+poop.scatterOffset))**2);
        return dist < (limbStatesRef.current.get(w)?.width || 80) * 0.8;
      });
      return !isWiped;
    });
  };

  const updateGlobalStatus = (s: Map<string, any>) => {
    let t = 0, still = true, move = 0, shakes = 0;
    const handP = poopsRef.current.some(p => p.targetId !== 'Head'), headP = poopsRef.current.some(p => p.targetId === 'Head');
    s.forEach(v => { if (v.missingFrames < 10) t++; if (!v.isStill) still = false; if (v.lastMovement > move) move = v.lastMovement; if (v.headShakeCount > shakes) shakes = v.headShakeCount; });
    if (t === 0) { setStatusMessage("Where are you? / 人呢？快出来陪我玩..."); return; }
    if (headP) { setStatusMessage("Souvenir on your head! Wipe it! \n 头顶有个'纪念品'！快用手擦掉！"); return; }
    if (shakes >= 2) { setStatusMessage("Keep shaking! Dizzy birds! \n 继续摇！小鸟要晕啦！"); return; }
    if (handP) { setStatusMessage(move > CLEAN_THRESHOLD*0.5 ? "Harder! Shake it! \n 没吃饭吗？用力甩！" : "Eww! Shake it off! \n 咦！好脏！快甩手或者擦掉！"); return; }
    if (move > SHAKE_THRESHOLD) { setStatusMessage("Earthquake! Run! \n 地震啦！快跑啊！"); return; }
    const bc = birdsRef.current.filter(b => b.state !== BirdState.FLYING_AWAY).length;
    if (bc > 5) setStatusMessage("Disney Princess mode! \n 哇，你是迪士尼在逃公主吗！");
    else if (bc > 0) setStatusMessage("Shhh... don't move... \n 嘘... 别把它们吓跑了...");
    else setStatusMessage(still ? "Calling the flock... \n 正在召唤鸟群..." : "Freeze! Be a statue! \n 定住别动！做个木头人！");
  };

  const drawPoops = (ctx: any, contours: any) => {
    poopsRef.current.forEach(p => {
       const c = contours[p.targetId]; if (!c) return;
       const pos = getPointOnPolyline(c, p.offset);
       ctx.save(); ctx.translate(pos.x, pos.y + p.scatterOffset); ctx.rotate(p.rotation); ctx.scale(p.scale, p.scale);
       ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.moveTo(0,0); ctx.bezierCurveTo(5,-2,8,5,0,8); ctx.bezierCurveTo(-8,5,-5,-2,0,0); ctx.fill();
       ctx.restore();
    });
  };

  const updateAndDrawBirds = (ctx: any, contours: any, w: number, h: number) => {
    birdsRef.current.forEach(b => {
      let t = contours[b.targetId] ? getPointOnPolyline(contours[b.targetId], b.perchOffset) : (b.state !== BirdState.FLYING_AWAY ? {x:b.x, y:b.y} : null);
      if (b.justPooped) {
        poopsRef.current.push({ id: Math.random().toString(36).substr(2,9), targetId: b.targetId, offset: b.perchOffset, scale: (0.5+Math.random()*0.5)*(b.targetId==='Head'?0.4:1), rotation: Math.random()*Math.PI*2, seed: Math.random(), scatterOffset: (b.targetId==='Head'?(Math.random()-0.5)*b.size*2:(Math.random()-0.5)*5) });
        b.justPooped = false;
      }
      b.update(16, t, birdsRef.current); b.draw(ctx);
    });
    birdsRef.current = birdsRef.current.filter(b => b.x > -200 && b.x < w+200 && b.y > -200 && b.y < h+200);
  };

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans">
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* SPACE HOLD PROGRESS */}
      {spaceHoldProgress > 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.2)" strokeWidth="6" fill="transparent" />
              <circle cx="48" cy="48" r="40" stroke="#2dd4bf" strokeWidth="6" fill="transparent"
                strokeDasharray={2 * Math.PI * 40}
                strokeDashoffset={2 * Math.PI * 40 * (1 - spaceHoldProgress)}
                strokeLinecap="round"
              />
            </svg>
            <Settings2 className="absolute w-8 h-8 text-teal-400 animate-pulse" />
          </div>
          <div className="text-white text-center mt-4 font-bold tracking-widest text-sm drop-shadow-lg">HOLDING SPACE...</div>
        </div>
      )}

      {/* ASSET PANEL */}
      {showAssetPanel && (
        <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <BirdIcon className="w-8 h-8 text-teal-400" />
                <h2 className="text-2xl font-bold text-white tracking-tight">Bird DNA Lab / 小鸟实验室</h2>
              </div>
              <button onClick={() => setShowAssetPanel(false)} className="text-zinc-400 hover:text-white transition-colors">
                <X className="w-8 h-8" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Creator Section */}
              <div className="space-y-8">
                <div className="space-y-2">
                  <label className="text-zinc-400 text-sm font-bold uppercase tracking-wider">Species Name / 种类名称</label>
                  <input 
                    type="text" value={newBirdName} onChange={(e) => setNewBirdName(e.target.value)}
                    placeholder="e.g. Phoenix / 凤凰"
                    className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-teal-400/50 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {(['head', 'body', 'wings', 'legs'] as const).map(part => (
                    <div key={part} className="space-y-2">
                      <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider">{part} / {part === 'head' ? '头部' : part === 'body' ? '身体' : part === 'wings' ? '翅膀' : '腿部'}</label>
                      <label className="relative block h-32 bg-zinc-800 border-2 border-dashed border-white/5 rounded-2xl cursor-pointer hover:border-teal-400/30 transition-all group overflow-hidden">
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, part)} />
                        {newBirdAssets[part] ? (
                          <img src={newBirdAssets[part]} className="w-full h-full object-contain p-2" />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 group-hover:text-teal-400/70 transition-colors">
                            <Upload className="w-8 h-8 mb-1" />
                            <span className="text-[10px] font-bold">UPLOAD</span>
                          </div>
                        )}
                      </label>
                    </div>
                  ))}
                </div>

                <button 
                  onClick={addCustomBird}
                  disabled={!newBirdName || Object.keys(newBirdAssets).length === 0}
                  className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-30 disabled:hover:bg-teal-500 text-zinc-900 font-black py-4 rounded-2xl shadow-xl shadow-teal-500/10 transition-all active:scale-95"
                >
                  CREATE SPECIES / 创造物种
                </button>
              </div>

              {/* List Section */}
              <div className="space-y-6">
                <h3 className="text-zinc-400 text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                  Current Flock / 当前鸟群 <span className="bg-zinc-800 px-2 py-0.5 rounded text-[10px]">{customBirds.length}</span>
                </h3>
                <div className="space-y-3">
                  {customBirds.map(bird => (
                    <div key={bird.id} className="bg-zinc-800/50 border border-white/5 p-4 rounded-2xl flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-zinc-800 rounded-lg overflow-hidden border border-white/5">
                          {bird.assets.body && <img src={bird.assets.body} className="w-full h-full object-contain" />}
                        </div>
                        <span className="text-white font-bold">{bird.name}</span>
                      </div>
                      <button 
                        onClick={() => setCustomBirds(prev => prev.filter(b => b.id !== bird.id))}
                        className="p-2 text-zinc-500 hover:text-rose-400 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                  {customBirds.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-600 py-12">
                      <BirdIcon className="w-16 h-16 mb-4 opacity-10" />
                      <p className="text-sm">No custom species yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-teal-500/5 border-t border-white/5 text-center">
              <p className="text-teal-400/50 text-[10px] font-bold tracking-widest uppercase">Hold SPACE for 3s to return to reality</p>
            </div>
          </div>
        </div>
      )}

      {/* Main UI */}
      <div className="absolute inset-0 pointer-events-none z-20 p-8 flex flex-col justify-between">
        <div className="flex justify-end gap-3">
          <div className="bg-black/40 backdrop-blur-md px-5 py-2 rounded-full border border-white/10 text-white flex items-center gap-3 shadow-2xl">
            <div className={`w-2.5 h-2.5 rounded-full ${detectionActiveRef.current ? 'bg-teal-400 shadow-[0_0_12px_#2dd4bf]' : 'bg-zinc-600'}`} />
            <span className="text-xs font-black tracking-widest uppercase">{detectionActiveRef.current ? 'LIVE' : 'IDLE'}</span>
          </div>
          
          <div className="flex gap-2 pointer-events-auto">
            <button onClick={() => setIsMirrored(!isMirrored)} className={`bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/10 text-white transition-all hover:scale-110 ${isMirrored ? 'text-teal-400 border-teal-400/30' : ''}`}>
              <FlipHorizontal className="w-5 h-5" />
            </button>
            {devices.length > 1 && (
              <div className="bg-black/40 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 text-white flex items-center gap-2">
                <Camera className="w-4 h-4 text-teal-400" />
                <select value={currentDeviceId} onChange={(e) => startCamera(e.target.value)} className="bg-transparent text-xs font-bold outline-none cursor-pointer max-w-[100px]">
                  {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId} className="bg-zinc-900">{d.label || `CAM ${i+1}`}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-white bg-black">
            <div className="relative">
              <Loader2 className="w-16 h-16 animate-spin text-teal-400" />
              <div className="absolute inset-0 animate-ping opacity-20"><Loader2 className="w-16 h-16 text-teal-400" /></div>
            </div>
            <span className="text-2xl font-black tracking-widest uppercase animate-pulse">Initializing DNA...</span>
          </div>
        )}

        <div className="flex justify-center mb-8">
          {!isLoading && statusMessage && (
            <div className="bg-black/70 backdrop-blur-xl px-10 py-5 rounded-3xl text-white text-xl font-bold border border-white/10 shadow-2xl text-center max-w-2xl transition-all whitespace-pre-line leading-relaxed">
              {statusMessage}
              <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-teal-400/50 w-1/3 animate-[shimmer_2s_infinite]" />
              </div>
            </div>
          )}
        </div>
      </div>
      
      <style>{`
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
        select option { background: #18181b; }
      `}</style>
    </div>
  );
};

export default HandAR;
