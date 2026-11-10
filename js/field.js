// 들판 만들기: 라운드 번호만 같으면 누구 폰에서든 똑같은 들판이 나와요 (서버에는 "누가 몇 번을 찾았나"만 저장).
import { CLOVERS_PER_ROUND, FIELD, HALF } from './config.js';

export function hash(...ns) {
  let h = 0x811c9dc5;
  for (const n of ns) {
    h = Math.imul(h ^ (n | 0), 0x01000193);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  }
  return h >>> 0;
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 클로버 종류
export const NORMAL = 0;  // 세잎
export const DECOY = 1;   // 세잎인데 옆 클로버 잎이 틈에 끼어 네잎처럼 보임
export const LUCKY = 2;   // 진짜 네잎 (idx = 오늘의 몇 번 클로버)

const DECOY_RATE = 0.028;
const FLOWER_RATE = 0.05;

/**
 * @returns {{round:number, n:number, x:Float32Array, z:Float32Array, h:Float32Array, rot:Float32Array,
 *   size:Float32Array, tint:Uint8Array, kind:Uint8Array, idx:Int8Array, cellStart:Int32Array,
 *   lucky:{x:number,z:number,i:number,id:number}[], flowers:{x:number,z:number,h:number,c:number}[]}}
 */
export function buildField(round) {
  const R = rng(hash(round, 4242));
  // 1) 네잎 자리: 가장자리에서 4칸 안쪽, 서로 7 이상 떨어지게
  const spots = [];
  for (let tries = 0; spots.length < CLOVERS_PER_ROUND && tries < 5000; tries++) {
    const x = (R() * 2 - 1) * (HALF - 4), z = (R() * 2 - 1) * (HALF - 4);
    if (spots.every((s) => Math.hypot(s.x - x, s.z - z) >= 7)) spots.push({ x, z, i: spots.length });
  }
  const byCell = new Map();
  for (const s of spots) {
    const c = Math.floor(s.z + HALF) * FIELD + Math.floor(s.x + HALF);
    if (!byCell.has(c)) byCell.set(c, []);
    byCell.get(c).push(s);
  }

  // 2) 칸마다 클로버 2~4개
  const cap = FIELD * FIELD * 4 + spots.length;
  const x = new Float32Array(cap), z = new Float32Array(cap), h = new Float32Array(cap), rot = new Float32Array(cap), size = new Float32Array(cap);
  const tint = new Uint8Array(cap), kind = new Uint8Array(cap), idx = new Int8Array(cap).fill(-1);
  const cellStart = new Int32Array(FIELD * FIELD + 1);
  const flowers = [];
  const lucky = [];
  let n = 0;
  for (let iz = 0; iz < FIELD; iz++) {
    for (let ix = 0; ix < FIELD; ix++) {
      const c = iz * FIELD + ix;
      cellStart[c] = n;
      const r = rng(hash(round, ix, iz, 9));
      const count = 2 + (r() < 0.72 ? 1 : 0) + (r() < 0.18 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        x[n] = ix - HALF + r(); z[n] = iz - HALF + r();
        // 대부분 키가 크고, 가끔 낮은 것도 섞여서 진짜 네잎만 낮아 보이지 않게
        const t = r();
        h[n] = 0.22 + Math.pow(t, 0.6) * 0.58;
        rot[n] = r() * Math.PI * 2;
        size[n] = 0.82 + r() * 0.38;
        tint[n] = (r() * 6) | 0;
        kind[n] = r() < DECOY_RATE ? DECOY : NORMAL;
        n++;
      }
      if (r() < FLOWER_RATE) flowers.push({ x: ix - HALF + r(), z: iz - HALF + r(), h: 0.85 + r() * 0.35, c: r() });
      const here = byCell.get(c);
      if (here) for (const s of here) {
        x[n] = s.x; z[n] = s.z;
        h[n] = 0.2 + R() * 0.2;           // 조금 낮게 → 큰 세잎 밑에 숨어 있는 경우가 많아요
        rot[n] = R() * Math.PI * 2;
        size[n] = 0.9 + R() * 0.25;
        tint[n] = (R() * 6) | 0;
        kind[n] = LUCKY; idx[n] = s.i;
        lucky.push({ x: s.x, z: s.z, i: s.i, id: n });
        n++;
      }
    }
  }
  cellStart[FIELD * FIELD] = n;
  return { round, n, x, z, h, rot, size, tint, kind, idx, cellStart, lucky: lucky.sort((a, b) => a.i - b.i), flowers };
}

/** 잎 방향(라디안). 세잎은 120°씩, 네잎은 90°씩, 가짜는 틈 하나가 넓어요(그 틈에 옆 잎이 낌). */
export function leafAngles(f, id) {
  const r = rng(hash(f.round, id, 77));
  const j = () => (r() - 0.5) * 0.3;
  const b = f.rot[id];
  if (f.kind[id] === LUCKY) return [0, 1, 2, 3].map((k) => b + k * Math.PI / 2 + j() * 0.6);
  if (f.kind[id] === DECOY) return [b + j() * 0.5, b + 1.75 + j() * 0.5, b + 3.5 + j() * 0.5];
  return [0, 1, 2].map((k) => b + k * Math.PI * 2 / 3 + j());
}
/** 가짜 네잎의 "끼어든 잎" 방향 (넓은 틈의 가운데) */
export const strayAngle = (f, id) => f.rot[id] + 3.5 + (Math.PI * 2 - 3.5) / 2;
