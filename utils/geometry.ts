
import { HandLandmark, Point } from '../types';

export const getDistance = (p1: Point | HandLandmark, p2: Point | HandLandmark): number => {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
};

export const lerp = (start: number, end: number, amt: number) => {
  return (1 - amt) * start + amt * end;
};

// Calculate a point along a Cubic Bezier curve (4 control points)
// t is 0 to 1
export const getCubicBezierPoint = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point => {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
  };
};

export const isFist = (landmarks: HandLandmark[]): boolean => {
  const wrist = landmarks[0];
  const tips = [8, 12, 16, 20]; // Index, Middle, Ring, Pinky tips
  const mcp = [5, 9, 13, 17];
  let foldedCount = 0;
  
  tips.forEach((tipIdx, i) => {
    const tip = landmarks[tipIdx];
    const joint = landmarks[mcp[i]];
    const distToWrist = getDistance(tip, wrist);
    const jointToWrist = getDistance(joint, wrist);
    
    // If tip is closer to wrist than the knuckle is, it's curled.
    // Factor 0.8 (relaxed from 0.9) prevents false positives on open hands
    if (distToWrist < jointToWrist * 0.8) { 
        foldedCount++;
    }
  });

  return foldedCount >= 3;
};

export const getCentroid = (landmarks: HandLandmark[]): Point => {
  let x = 0, y = 0;
  landmarks.forEach(l => {
    x += l.x;
    y += l.y;
  });
  return { x: x / landmarks.length, y: y / landmarks.length };
};

// Monotone Chain Convex Hull Algorithm
// Returns the "Lower Chain" which corresponds to the Visual Top of the hand (Lower Y values)
export const getUpperHandHull = (landmarks: Point[]): Point[] => {
  // 1. Sort by X
  const sorted = [...landmarks].sort((a, b) => a.x - b.x);

  // 2. Build Lower Chain (Visual Top in screen coords where Y increases downwards)
  const lowerChain: Point[] = [];
  
  for (const p of sorted) {
    while (lowerChain.length >= 2) {
      const b = lowerChain[lowerChain.length - 1];
      const a = lowerChain[lowerChain.length - 2];
      
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      
      if (cross <= 0) { 
         lowerChain.pop();
      } else {
         break;
      }
    }
    lowerChain.push(p);
  }
  
  return lowerChain;
};

// Get a point at percentage t (0-1) along a polyline
export const getPointOnPolyline = (points: Point[], t: number): Point => {
    if (points.length === 0) return {x: 0, y: 0};
    if (points.length === 1) return points[0];

    // Calculate total length
    let totalLen = 0;
    const segLens: number[] = [];
    for(let i=0; i<points.length-1; i++) {
        const d = getDistance(points[i], points[i+1]);
        totalLen += d;
        segLens.push(d);
    }

    let targetDist = t * totalLen;
    
    // Find segment
    let currentDist = 0;
    for(let i=0; i<segLens.length; i++) {
        if (currentDist + segLens[i] >= targetDist) {
            // Found segment
            const segT = (targetDist - currentDist) / segLens[i];
            const p1 = points[i];
            const p2 = points[i+1];
            return {
                x: lerp(p1.x, p2.x, segT),
                y: lerp(p1.y, p2.y, segT)
            };
        }
        currentDist += segLens[i];
    }
    
    return points[points.length-1];
};
