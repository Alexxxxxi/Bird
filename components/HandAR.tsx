import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bird } from './Bird';
import { Butterfly } from './Butterfly';
import { CreatureState, CustomBirdConfig } from '../types';
import { getDistance, lerp, isFist, getUpperHandHull, getPointOnPolyline } from '../utils/geometry';
import { PRESET_BIRDS } from '../constants';
import { saveBirdToDB, getAllBirdsFromDB, deleteBirdFromDB } from '../utils/db';
import { 
  X, Sparkles, Trash2, RefreshCw, Camera as CameraIcon, ChevronDown, FlipHorizontal 
} from 'lucide-react';

declare global { interface Window { FaceMesh: any; Hands: any; Camera: any; } }

const APP_VERSION = "2.23"; 

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

const LEAF_ASSETS = [
  "https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/leaf%201.png",
  "https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/leaf%202.png",
  "https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/leaf%203.png",
  "https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/leaf%204.png"
];

const STAR_ASSETS = [
  "https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/star1.png",
  "https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/star2.png",
  "https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/star3.png",
  "https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/star4.png"
];

interface ActiveLeaf {
  id: string;
  img: HTMLImageElement;
  anchorId: string;
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
  opacity: number;
  x: number;
  y: number;
  isTransforming?: boolean;
}

interface ActiveStar {
  id: string;
  img: HTMLImageElement;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  heldByHandId?: string;
  isFadingOut?: boolean;
}

interface ActiveParticle {
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  opacity: number;
  size: number;
}

const isGestureC = (landmarks: any[]) => {
   if (!landmarks || landmarks.length < 21) return false;
   const palmSize = Math.hypot(landmarks[0].x - landmarks[9].x, landmarks[0].y - landmarks[9].y);
   const tipDist = Math.hypot(landmarks[4].x - landmarks[8].x, landmarks[4].y - landmarks[8].y);
   return tipDist > palmSize * 0.15 && tipDist < palmSize * 1.1;
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
    script.onload = () => resolve(); 
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
};

const HandAR: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(true); 
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [customCreatures, setCustomCreatures] = useState<CustomBirdConfig[]>([]);
  const customCreaturesRef = useRef<CustomBirdConfig[]>([]);
  const [anySmile, setAnySmile] = useState(false);
  
  const [hintText, setHintText] = useState("");
  const [hintVisible, setHintVisible] = useState(true);
  const hasSmiledRef = useRef(false);
  const isFaceVisibleRef = useRef(false);
  const lastFaceSeenTimeRef = useRef<number>(performance.now());

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isMirrored, setIsMirrored] = useState(true); 
  const isMirroredRef = useRef(true); 

  const creaturesRef = useRef<any[]>([]);
  const activeLeaves = useRef<ActiveLeaf[]>([]);
  const activeStars = useRef<ActiveStar[]>([]);
  const activeParticles = useRef<ActiveParticle[]>([]);
  const limbStatesRef = useRef<Map<string, LimbStateData>>(new Map());
  
  const gestureHoldStates = useRef<Map<string, { startTime: number, startX: number, startY: number }>>(new Map());

  const faceMeshRef = useRef<any>(null);
  const handsRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const globalFaceWidthRef = useRef<number>(240);
  const lastSpawnTimesRef = useRef<Map<string, number>>(new Map());

  const isFaceProcessing = useRef(false);
  const isHandProcessing = useRef(false);

  useEffect(() => {
    isMirroredRef.current = isMirrored;
  }, [isMirrored]);

  const handleLeafDrop = useCallback((x: number, y: number, targetId: string, depthScale: number) => {
    const tracker = limbStatesRef.current.get(targetId);
    if (!tracker) return;

    const anchor = tracker.centroid;
    const img = new Image();
    img.src = LEAF_ASSETS[Math.floor(Math.random() * LEAF_ASSETS.length)];

    activeLeaves.current.push({
      id: Math.random().toString(36),
      img: img,
      anchorId: targetId,
      offsetX: x - anchor.x,
      offsetY: y - anchor.y,
      scale: (0.5 + Math.random() * 0.5) * depthScale,
      rotation: Math.random() * Math.PI * 2,
      opacity: 0,
      x: x,
      y: y
    });
  }, []);

  const spawnSpecificCreature = useCallback((targetId: string, category: 'bird' | 'butterfly') => {
    const pool = customCreaturesRef.current.filter(c => c.category === category);
    if (pool.length === 0 || !canvasRef.current || creaturesRef.current.length >= MAX_CREATURES) return;
    
    const cfg = pool[Math.floor(Math.random() * pool.length)];
    const randomOffset = 0.05 + Math.random() * 0.9;
    const creature = category === 'butterfly' 
      ? new Butterfly(canvasRef.current.width, canvasRef.current.height, targetId, handleLeafDrop, randomOffset, cfg) 
      : new Bird(canvasRef.current.width, canvasRef.current.height, targetId, handleLeafDrop, randomOffset, [cfg]);
    creaturesRef.current.push(creature);
  }, [handleLeafDrop]);

  useEffect(() => {
    const logo = new Image();
    logo.crossOrigin = "anonymous";
    logo.src = LOGO_URL;
    logo.onload = () => { logoImgRef.current = logo; };
  }, []);

  useEffect(() => {
    const getCameras = async () => {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
           throw new Error("浏览器不支持媒体访问");
        }
        await navigator.mediaDevices.getUserMedia({ video: true });
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
        setDevices(videoDevices);
        if (videoDevices.length > 0 && !selectedDeviceId) {
           setSelectedDeviceId(videoDevices[0].deviceId);
        }
      } catch (err: any) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.toLowerCase().includes('permission denied')) {
            setErrorMsg("摄像头权限被拒绝。请在浏览器地址栏点击“锁”图标允许访问摄像头。");
        } else {
            setErrorMsg("无法访问摄像头: " + err.message);
        }
        setIsLoading(false);
      }
    };
    getCameras();
  }, []);

  useEffect(() => {
    if (!selectedDeviceId) return;
    let active = true;

    const startCamera = async () => {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        if (cameraRef.current) {
          try { await cameraRef.current.stop(); } catch(e) {}
        }
        
        await Promise.all([
          loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"),
          loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js"),
          loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js")
        ]);

        if (videoRef.current && window.Camera) {
          // Native Video Settings for High Definition & Performance
          videoRef.current.muted = true;
          videoRef.current.playsInline = true;

          cameraRef.current = new window.Camera(videoRef.current, {
            onFrame: async () => {
              const video = videoRef.current;
              if (!video || !active || video.readyState < 2) return;
              
              if (video.paused) {
                video.play().catch(() => {});
              }

              if (faceMeshRef.current && !isFaceProcessing.current) {
                isFaceProcessing.current = true;
                try {
                  await faceMeshRef.current.send({ image: video });
                } catch (e) {
                  console.warn("FaceMesh send error:", e);
                } finally {
                  isFaceProcessing.current = false;
                }
              }

              if (handsRef.current && !isHandProcessing.current) {
                isHandProcessing.current = true;
                try {
                  await handsRef.current.send({ image: video });
                } catch (e) {
                  console.warn("Hands send error:", e);
                } finally {
                  isHandProcessing.current = false;
                }
              }
            },
            width: 1920, height: 1080, // Request HD Resolution
            deviceId: selectedDeviceId
          });

          await cameraRef.current.start();
          if (active) setIsLoading(false);
        }
      } catch (e: any) {
        if (active) {
          if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError' || e.message?.toLowerCase().includes('permission denied')) {
            setErrorMsg("摄像头权限被拒绝。请确保浏览器已获得授权。");
          } else {
            setErrorMsg("启动摄像头失败: " + e.message);
          }
          setIsLoading(false);
        }
      }
    };

    startCamera();

    return () => {
      active = false;
    };
  }, [selectedDeviceId]);

  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();
    const render = (time: number) => {
      const dt = Math.max(Math.min(time - lastTime, 100), 1); 
      lastTime = time;
      
      const timeScale = dt / 16.0;
      const now = performance.now();

      if (!isFaceVisibleRef.current && now - lastFaceSeenTimeRef.current > 2000) {
        creaturesRef.current = [];
        activeLeaves.current = [];
        activeStars.current = [];
        activeParticles.current = [];
        gestureHoldStates.current.clear();
      }

      const canvas = canvasRef.current; 
      const ctx = canvas?.getContext('2d'); 
      const video = videoRef.current;
      
      if (!canvas || !ctx || !video || video.readyState < 2 || video.videoWidth === 0) { 
        frameId = requestAnimationFrame(render); return; 
      }
      
      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      }

      // 1. CLEAR HIGH-RES CANVAS (Transparent layer)
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 2. NO DRAWIMAGE FOR VIDEO - Native <video> handles the background layer!
      
      // 3. DRAW AR ELEMENTS
      // Coordinate mirroring is handled in toPx mapping, so no global ctx.scale needed here.
      
      activeLeaves.current = activeLeaves.current.filter(leaf => {
        const tracker = limbStatesRef.current.get(leaf.anchorId);
        if (leaf.anchorId.startsWith('Hand_')) {
            if (!tracker || tracker.missingFrames > 5) return false; 
        }
        if (tracker && tracker.missingFrames < 30) {
          leaf.x = tracker.centroid.x + leaf.offsetX;
          leaf.y = tracker.centroid.y + leaf.offsetY;
        } else {
          leaf.opacity -= 0.02 * timeScale; 
        }

        if (handsRef.current && !leaf.isTransforming) {
          ['Hand_0', 'Hand_1'].forEach(handId => {
            const handTracker = limbStatesRef.current.get(handId);
            if (handTracker && handTracker.missingFrames < 5) {
              const dist = Math.hypot(leaf.x - handTracker.centroid.x, leaf.y - handTracker.centroid.y);
              if (dist < 50) leaf.isTransforming = true;
            }
          });
        }

        if (leaf.isTransforming) {
          leaf.opacity -= 0.05 * timeScale;
          leaf.scale *= Math.pow(0.92, timeScale);
          if (leaf.opacity <= 0) {
            const isCrowded = activeStars.current.some(star => Math.hypot(star.x - leaf.x, star.y - leaf.y) < 60);
            if (!isCrowded) {
              const starImg = new Image();
              starImg.src = STAR_ASSETS[Math.floor(Math.random() * STAR_ASSETS.length)];
              activeStars.current.push({
                id: Math.random().toString(36),
                img: starImg,
                x: leaf.x,
                y: leaf.y,
                scale: 0.1, 
                rotation: Math.random() * Math.PI * 0.5,
                opacity: 0.0
              });
              for (let i = 0; i < 20; i++) {
                const angle = Math.random() * Math.PI * 2;
                const startDist = 60 + Math.random() * 60; 
                activeParticles.current.push({
                  x: leaf.x + Math.cos(angle) * startDist,
                  y: leaf.y + Math.sin(angle) * startDist,
                  tx: leaf.x,
                  ty: leaf.y,
                  speed: 0.03 + Math.random() * 0.03,
                  opacity: 1.0,
                  size: 1.5 + Math.random() * 2.0
                });
              }
            }
            return false;
          }
        } else {
          if (leaf.opacity < 1 && leaf.opacity > -0.2) leaf.opacity += 0.06 * timeScale;
        }

        if (leaf.img.complete && leaf.img.naturalWidth > 0 && leaf.opacity > 0) {
          ctx.save();
          ctx.globalAlpha = Math.min(leaf.opacity, 1);
          ctx.translate(leaf.x, leaf.y);
          ctx.rotate(leaf.rotation);
          const s = 65 * leaf.scale * 0.6;
          ctx.drawImage(leaf.img, -s/2, -s/2, s, s);
          ctx.restore();
          return true;
        }
        return leaf.opacity > 0;
      });

      activeParticles.current = activeParticles.current.filter(p => {
        p.x += (p.tx - p.x) * p.speed * timeScale;
        p.y += (p.ty - p.y) * p.speed * timeScale;
        const distToCenter = Math.hypot(p.tx - p.x, p.ty - p.y);
        if (distToCenter < 20) {
          p.size *= Math.pow(0.85, timeScale);
          p.opacity -= 0.1 * timeScale;
        } else {
          p.size *= Math.pow(0.99, timeScale);
        }
        if (p.opacity > 0 && p.size > 0.1) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.opacity);
          ctx.fillStyle = '#FFD700'; 
          ctx.shadowColor = '#FFFACD';
          ctx.shadowBlur = 4;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          return true;
        }
        return false;
      });

      if (handsRef.current) {
          ['Hand_0', 'Hand_1'].forEach(handId => {
              const tracker = limbStatesRef.current.get(handId);
              if (tracker && tracker.missingFrames < 5 && tracker.rawPoints.fullLandmarks) {
                  const landmarks = tracker.rawPoints.fullLandmarks;
                  const thumbTip = landmarks[4];
                  const indexTip = landmarks[8];
                  const midX = (thumbTip.x + indexTip.x) / 2;
                  const midY = (thumbTip.y + indexTip.y) / 2;
                  const isC = isGestureC(landmarks);
                  const heldStar = activeStars.current.find(s => s.heldByHandId === handId);
                  
                  if (isC) {
                      if (!heldStar) {
                          let holdState = gestureHoldStates.current.get(handId);
                          if (!holdState) {
                              holdState = { startTime: performance.now(), startX: midX, startY: midY };
                              gestureHoldStates.current.set(handId, holdState);
                          } else {
                              const distMoved = Math.hypot(midX - holdState.startX, midY - holdState.startY);
                              if (distMoved > 30) {
                                  holdState.startTime = performance.now();
                                  holdState.startX = midX;
                                  holdState.startY = midY;
                              } else if (performance.now() - holdState.startTime > 800) {
                                  const starImg = new Image();
                                  starImg.src = STAR_ASSETS[Math.floor(Math.random() * STAR_ASSETS.length)];
                                  activeStars.current.push({
                                      id: Math.random().toString(36),
                                      img: starImg,
                                      x: midX,
                                      y: midY,
                                      scale: 0.05,
                                      rotation: 0,
                                      opacity: 0,
                                      heldByHandId: handId,
                                      isFadingOut: false
                                  });
                                  for (let i = 0; i < 15; i++) {
                                      const angle = Math.random() * Math.PI * 2;
                                      const startDist = 50 + Math.random() * 30;
                                      activeParticles.current.push({
                                          x: midX + Math.cos(angle) * startDist,
                                          y: midY + Math.sin(angle) * startDist,
                                          tx: midX, 
                                          ty: midY,
                                          speed: 0.15,
                                          opacity: 1.0,
                                          size: 2.0 + Math.random() * 2.0
                                      });
                                  }
                                  gestureHoldStates.current.delete(handId);
                              }
                          }
                      } else {
                          heldStar.x = midX; heldStar.y = midY;
                          gestureHoldStates.current.delete(handId);
                      }
                  } else {
                      gestureHoldStates.current.delete(handId);
                      if (heldStar) heldStar.heldByHandId = undefined;
                  }
              } else {
                  gestureHoldStates.current.delete(handId);
              }
          });
      }

      activeStars.current = activeStars.current.filter(star => {
        if (star.heldByHandId) {
            const handTracker = limbStatesRef.current.get(star.heldByHandId);
            if (!handTracker || handTracker.missingFrames > 5) return false; 
            if (!star.isFadingOut) {
                if (star.scale < 0.8) star.scale += 0.02 * timeScale; 
                if (star.opacity < 1.0) star.opacity += 0.05 * timeScale; 
                if (star.scale >= 0.8 && star.opacity >= 1.0) star.isFadingOut = true; 
            } else {
                star.opacity -= 0.03 * timeScale; 
                if (star.opacity <= 0) return false; 
            }
            if (star.img.complete && star.img.naturalWidth > 0) {
                ctx.save();
                ctx.globalAlpha = Math.max(0, star.opacity);
                ctx.translate(star.x, star.y);
                const s = 120 * star.scale; 
                ctx.drawImage(star.img, -s/2, -s/2, s, s);
                ctx.restore();
            }
            return true;
        }
        star.scale += 0.006 * timeScale; star.y -= 0.4 * timeScale; 
        if (star.scale < 1.0) {
          if (star.scale > 0.2) star.opacity += 0.03 * timeScale; 
        } else if (star.scale > 1.5) star.opacity -= 0.01 * timeScale; 
        if (star.opacity > 1) star.opacity = 1;
        if (star.img.complete && star.img.naturalWidth > 0 && star.opacity > 0) {
          ctx.save(); ctx.globalAlpha = Math.max(0, star.opacity);
          ctx.translate(star.x, star.y); ctx.rotate(star.rotation);
          const s = 120 * star.scale; ctx.drawImage(star.img, -s/2, -s/2, s, s);
          ctx.restore();
        }
        return star.opacity > 0 || star.scale < 1.0; 
      });

      creaturesRef.current = creaturesRef.current.filter(c => {
        if (c.targetId.startsWith('Hand_')) {
            const handTracker = limbStatesRef.current.get(c.targetId);
            if (!handTracker || handTracker.missingFrames > 5) return false; 
        }
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
          } else if (c.targetId === 'Left_Shoulder' || c.targetId === 'Right_Shoulder') {
            const { start, end } = state.rawPoints;
            if (start && end) targetPoint = { x: lerp(start.x, end.x, t), y: lerp(start.y, end.y, t) };
          } else if (c.targetId.startsWith('Hand_')) {
            const { hull, palm } = state.rawPoints;
            targetPoint = (hull && hull.length > 1) ? getPointOnPolyline(hull, t) : palm;
          }
        } else if (state && state.missingFrames > 150 && c.state !== CreatureState.FLYING_AWAY) {
          c.state = CreatureState.FLYING_AWAY;
        }
        if (targetPoint && (isNaN(targetPoint.x) || isNaN(targetPoint.y))) targetPoint = null;
        c.update(dt, targetPoint, creaturesRef.current, depthScale);
        c.draw(ctx);
        return !(c.state === CreatureState.FLYING_AWAY && (c.y < -500 || c.y > canvas.height + 500));
      });

      const logoImg = logoImgRef.current;
      if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
        const logoRatio = lerp(0.25, 0.10, Math.min(Math.max((canvas.width - 375) / 1225, 0), 1));
        const logoTargetWidth = canvas.width * logoRatio;
        const logoScale = logoTargetWidth / logoImg.naturalWidth;
        const ldw = logoImg.naturalWidth * logoScale, ldh = logoImg.naturalHeight * logoScale;
        const ldx = (canvas.width - ldw) / 2, ldy = canvas.height * 0.05; 
        ctx.drawImage(logoImg, ldx, ldy, ldw, ldh);
      }
      frameId = requestAnimationFrame(render);
    };
    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [handleLeafDrop]);

  const onFaceResultsRef = useRef<(results: any) => void>(() => {});
  const onHandResultsRef = useRef<(results: any) => void>(() => {});

  onFaceResultsRef.current = (results: any) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || !results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      setAnySmile(false); isFaceVisibleRef.current = false; return;
    }
    isFaceVisibleRef.current = true; lastFaceSeenTimeRef.current = performance.now();
    
    // Mapping 0-1 coordinates to the viewport
    const ratio = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const dw = video.videoWidth * ratio, dh = video.videoHeight * ratio;
    const ox = (canvas.width - dw) / 2, oy = (canvas.height - dh) / 2;
    // Mirrored coordinate mapping logic
    const toPx = (l: any) => ({ 
      x: (isMirroredRef.current ? (1.0 - l.x) : l.x) * dw + ox, 
      y: l.y * dh + oy 
    });

    const landmarks = results.multiFaceLandmarks[0];
    const earL = toPx(landmarks[234]), earR = toPx(landmarks[454]);
    const faceWidth = getDistance(earL, earR);
    globalFaceWidthRef.current = faceWidth;
    const headId = `Primary_Head`;
    const mouthL = toPx(landmarks[61]), mouthR = toPx(landmarks[291]);
    const isSmiling = (getDistance(mouthL, mouthR) / (faceWidth || 1)) > 0.35;
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
      if (now - (lastSpawnTimesRef.current.get('GLOBAL_SPAWN_LOCK') || 0) > (500 + Math.random() * 500)) {
        const potentialTargets = [{ id: 'Primary_Head', type: 'Head' }, { id: 'Left_Shoulder', type: 'Shoulders' }, { id: 'Right_Shoulder', type: 'Shoulders' }];
        for (let i = 0; i < 2; i++) {
            const hId = `Hand_${i}`, hState = limbStatesRef.current.get(hId);
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
    if (!video || !canvas || video.videoWidth === 0 || !results.multiHandLandmarks) return;
    const ratio = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const dw = video.videoWidth * ratio, dh = video.videoHeight * ratio;
    const ox = (canvas.width - dw) / 2, oy = (canvas.height - dh) / 2;
    const toPx = (l: any) => ({ 
      x: (isMirroredRef.current ? (1.0 - l.x) : l.x) * dw + ox, 
      y: l.y * dh + oy 
    });
    results.multiHandLandmarks.forEach((landmarks: any, index: number) => {
      const handId = `Hand_${index}`, pxLandmarks = landmarks.map(toPx), palm = pxLandmarks[9], hull = getUpperHandHull(pxLandmarks);
      updateLimbState(handId, palm, { palm, hull, fullLandmarks: pxLandmarks }, 'Hand');
      if (isFist(landmarks)) {
        creaturesRef.current.forEach(c => { if (c.targetId === handId && c.state !== CreatureState.FLYING_AWAY) c.state = CreatureState.FLYING_AWAY; });
      }
    });
  };

  function updateLimbState(label: string, nCentroid: {x: number, y: number}, rawPoints: any, category: string) {
    if (!nCentroid) return;
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
    const initModels = async () => {
      try {
        await Promise.all([
          loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"),
          loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js"),
          loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js")
        ]);
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
        for (const p of PRESET_BIRDS) { await deleteBirdFromDB(p.id); await saveBirdToDB(p); }
        customCreaturesRef.current = PRESET_BIRDS; setCustomCreatures(PRESET_BIRDS);
      } catch (e: any) { if (!ignore) setErrorMsg(e.message); }
    };
    initModels(); return () => { ignore = true; };
  }, [spawnSpecificCreature]);

  useEffect(() => {
    const updateText = () => {
      setHintVisible(false);
      setTimeout(() => {
        const hasNoCreatures = creaturesRef.current.length === 0;
        let texts = !isFaceVisibleRef.current ? NO_FACE_TEXTS : (anySmile ? SMILING_TEXTS : (hasNoCreatures ? WAITING_SMILE_TEXTS : (hasSmiledRef.current ? AFTER_SMILE_TEXTS : WAITING_SMILE_TEXTS)));
        setHintText(texts[Math.floor(Math.random() * texts.length)]);
        setHintVisible(true);
        if (anySmile) hasSmiledRef.current = true;
      }, 500); 
    };
    const interval = setInterval(updateText, 3500); return () => clearInterval(interval);
  }, [anySmile]);

  useEffect(() => {
    const timer = setInterval(() => limbStatesRef.current.forEach(s => s.missingFrames++), 100);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none">
      {/* BACKGROUND VIDEO LAYER: Native browser rendering for maximum clarity and speed */}
      <video 
        ref={videoRef} 
        className="absolute inset-0 w-full h-full object-cover z-0" 
        style={{ transform: isMirrored ? 'scaleX(-1)' : 'none' }}
        playsInline 
        muted 
        autoPlay 
      />

      {/* AR OVERLAY LAYER: Transparent canvas for sprites & particles */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none" />
      
      <div className="absolute bottom-0 left-0 w-full h-[28%] md:h-[32%] lg:h-[38%] z-10 pointer-events-none transition-all duration-500"
        style={{ backgroundImage: "url('https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/Background%201.png')", backgroundSize: 'cover', backgroundPosition: 'center 10%', backgroundRepeat: 'no-repeat' }} />

      <div className="absolute top-6 left-6 z-30 pointer-events-none flex items-center gap-4">
        <div className={`w-3 h-3 rounded-full transition-all duration-300 ${anySmile ? 'bg-teal-400 shadow-[0_0_10px_#2dd4bf]' : 'bg-white/20'}`} />
      </div>
      
      {/* Dynamic Subtitle Box: Positioned higher (bottom-36) to avoid TIPS overlap */}
      <div className={`absolute bottom-36 left-1/2 -translate-x-1/2 z-30 pointer-events-none transition-all duration-700 ${hintVisible ? 'opacity-90' : 'opacity-0 translate-y-2'} w-[90%] max-w-md mx-auto`}>
        <div className="bg-black/60 backdrop-blur-lg px-6 py-4 rounded-3xl border border-white/10 shadow-2xl flex justify-center">
           <span className="text-white text-lg font-bold tracking-widest text-center block whitespace-normal break-words drop-shadow-lg leading-relaxed" style={{ fontFamily: '"Microsoft YaHei", "微软雅黑", sans-serif' }}>
             {hintText}
           </span>
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex flex-col items-center w-full max-w-[90%]">
        <div className="text-center text-white drop-shadow-md flex flex-col gap-0.5" style={{ fontFamily: '"Microsoft YaHei", "微软雅黑", sans-serif' }}>
          <p className="text-[10px] font-black tracking-widest">互动小TIPS:</p>
          <div className="text-[10px] flex flex-col items-center leading-tight">
            <span>1. 对着镜头微笑，小动物们就会来到你的身旁</span>
            <span>2. 晃动身子赶跑他们，留下的茶叶试着用手擦擦</span>
            <span>3. 对着镜头用手比个C试试</span>
          </div>
        </div>
      </div>
      
      <div className="absolute top-0 right-0 p-6 z-20 pointer-events-auto flex flex-col items-end gap-3">
        <button onClick={() => setIsMirrored(!isMirrored)} className={`bg-black/40 p-4 rounded-2xl border border-white/10 hover:bg-white/10 transition-colors shadow-xl backdrop-blur-md flex items-center justify-center ${isMirrored ? 'text-teal-400 border-teal-400/30' : 'text-zinc-400'}`}>
            <FlipHorizontal className="w-6 h-6" />
        </button>
      </div>

      <div className="absolute bottom-4 left-4 z-50 pointer-events-none">
        <span className="text-black/30 text-[10px] font-mono font-bold tracking-widest uppercase" style={{ fontFamily: '"Microsoft YaHei", "微软雅黑", sans-serif' }}>{APP_VERSION}</span>
      </div>

      {showGuide && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 transition-opacity duration-500 animate-in fade-in">
          <div className="relative w-full max-w-[310px] rounded-[2.5rem] overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] border border-white/20 flex flex-col animate-in zoom-in-95 duration-300">
            <img 
              src="https://bird-1394762829.cos.ap-guangzhou.myqcloud.com/Background%201.png" 
              className="absolute inset-0 w-full h-full object-cover object-bottom scale-[2.9] origin-bottom" 
              alt=""
            />
            <div className="absolute inset-0 bg-black/15 pointer-events-none" />

            <button onClick={() => setShowGuide(false)} className="absolute top-6 right-6 z-20 p-2 bg-black/30 hover:bg-black/50 rounded-full text-white transition-all active:scale-90">
              <X className="w-6 h-6" />
            </button>

            <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="bg-white px-6 py-2 rounded-full mb-3 shadow-lg shadow-black/20 transform -rotate-1">
                <h2 className="text-[#1a4d2e] text-xl font-black tracking-[0.2em]" style={{ fontFamily: '"Microsoft YaHei", "微软雅黑", sans-serif' }}>互动小TIPS</h2>
              </div>

              <div className="space-y-3 text-left w-full max-w-[260px]">
                {[
                  "如启动失败可试着点击右上角浏览器打开试试", 
                  "对着镜头微笑，小动物们就会来到你的身旁", 
                  "晃动身子赶跑他们，留下的茶叶试着用手擦擦", 
                  "对着镜头用手比个C试试"
                ].map((text, i) => (
                  <div key={i} className="flex gap-4 items-start group">
                    <span className="flex-shrink-0 w-5 h-5 bg-white/30 backdrop-blur-md rounded-full flex items-center justify-center text-white font-bold text-[10px] border border-white/40 shadow-sm">{i + 1}</span>
                    <p className="text-white text-sm font-bold leading-tight drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]" style={{ fontFamily: '"Microsoft YaHei", "微软雅黑", sans-serif' }}>{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {(isLoading || errorMsg) && (
        <div className="absolute inset-0 z-[100] bg-black flex flex-col items-center justify-center text-teal-400 font-mono tracking-[0.5em] animate-pulse">
          <RefreshCw className="animate-spin mb-4" /> 
          <span className="text-center px-10 uppercase">{errorMsg ? errorMsg : "Synchronizing Reality..."}</span>
          {errorMsg && (
            <button onClick={() => window.location.reload()} className="mt-6 px-6 py-2 border border-teal-400 rounded-full text-xs hover:bg-teal-400 hover:text-black transition-colors pointer-events-auto">RETRY CONNECTION</button>
          )}
        </div>
      )}
    </div>
  );
};

export default HandAR;