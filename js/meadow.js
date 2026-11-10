// 3D 클로버 들판: 화면에 보이는 칸의 클로버만 인스턴스로 그리고, 손가락이 지나간 자리는 셰이더에서 클로버를 옆으로 눕혀요.
import * as THREE from '../vendor/three.module.min.js';
import { FIELD, HALF } from './config.js';
import { leafAngles, strayAngle, DECOY, LUCKY, hash, rng } from './field.js';
import { leafCanvas, groundCanvas } from './art.js';

const NP = 24;                    // 동시에 기억하는 "헤친 자리" 수
const CAP_LEAF = 18000, CAP_STEM = 6000, CAP_FLOWER = 800;
const LEAF_LEN = 0.42;
const TINTS = [[1, 1, 1], [0.9, 1.0, 0.8], [0.84, 0.95, 0.9], [1.07, 1.05, 0.84], [0.95, 1.03, 0.93], [0.8, 0.9, 0.78]];
const PITCH = 0.98;               // 카메라 내려다보는 각도 (rad, 약 56°)
const FOV = 50;

export function createMeadow(canvas, { minimap } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  const SKY = new THREE.Color('#cfe3a8');
  scene.background = SKY;
  scene.fog = new THREE.Fog(SKY, 22, 48);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 120);

  scene.add(new THREE.HemisphereLight('#fff8dc', '#43602c', 1.25));
  const sun = new THREE.DirectionalLight('#fff0cc', 1.7);
  sun.position.set(6, 12, 4);
  scene.add(sun);

  // ---------------------------------------------------------------- 공용 셰이더 조각
  const U = { uPush: { value: Array.from({ length: NP }, () => new THREE.Vector4()) }, uTime: { value: 0 } };
  const DISP_GLSL = `
    attribute vec4 aRoot;
    uniform vec4 uPush[${NP}];
    uniform float uTime;
    varying float vLow;
    vec3 cloverDisp(vec4 r){
      vec2 p = r.xy; float h = r.z;
      vec3 d = vec3(0.0);
      float tall = smoothstep(0.16, 0.72, h);
      for (int i = 0; i < ${NP}; i++) {
        vec4 q = uPush[i];
        if (q.z <= 0.001) continue;
        vec2 v = p - q.xy;
        float dist = length(v);
        float f = q.z * (1.0 - smoothstep(q.w * 0.3, q.w, dist));
        vec2 dir = dist > 1e-4 ? v / dist : vec2(0.0, 1.0);
        d.xz += dir * f * q.w * 0.8 * tall;
        d.y -= f * h * 0.4 * tall;
      }
      float l = length(d.xz);
      if (l > 0.95) d.xz *= 0.95 / l;
      float w = sin(uTime * 1.3 + p.x * 0.6 + p.y * 0.45 + r.w) * 0.6 + sin(uTime * 2.3 + p.x * 1.7 - p.y * 1.1) * 0.3;
      d.x += w * 0.03 * h; d.z += w * 0.02 * h;
      return d;
    }`;
  function patch(mat, stem) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uPush = U.uPush;
      sh.uniforms.uTime = U.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + DISP_GLSL)
        .replace('#include <project_vertex>', `
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          wp = modelMatrix * wp;
          float kk = ${stem ? 'pow(clamp(wp.y / max(aRoot.z, 0.01), 0.0, 1.0), 1.6)' : '1.0'};
          wp.xyz += cloverDisp(aRoot) * kk;
          vLow = clamp(wp.y / 0.8, 0.0, 1.0);
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vLow;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(0.38, 1.1, vLow);');
    };
    return mat;
  }
  // 셰이더와 같은 계산 (탭한 클로버 찾기용, 바람은 뺌)
  function dispJS(x, z, h, out) {
    const tall = smoothstep(0.16, 0.72, h);
    let dx = 0, dy = 0, dz = 0;
    for (const q of U.uPush.value) {
      if (q.z <= 0.001) continue;
      const vx = x - q.x, vz = z - q.y, dist = Math.hypot(vx, vz);
      const f = q.z * (1 - smoothstep(q.w * 0.3, q.w, dist));
      const nx = dist > 1e-4 ? vx / dist : 0, nz = dist > 1e-4 ? vz / dist : 1;
      dx += nx * f * q.w * 0.8 * tall; dz += nz * f * q.w * 0.8 * tall; dy -= f * h * 0.4 * tall;
    }
    const l = Math.hypot(dx, dz);
    if (l > 0.95) { dx *= 0.95 / l; dz *= 0.95 / l; }
    out.set(dx, dy, dz);
    return out;
  }

  // ---------------------------------------------------------------- 재료
  const leafTex = new THREE.CanvasTexture(leafCanvas(256));
  leafTex.colorSpace = THREE.SRGBColorSpace;
  leafTex.anisotropy = 4;
  const leafGeo = makeLeafGeometry();
  const stemGeo = new THREE.CylinderGeometry(0.014, 0.02, 1, 5, 4, true).translate(0, 0.5, 0);
  { const p = stemGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + 0.05 * p.getY(i) * p.getY(i)); }
  const flowerGeo = new THREE.IcosahedronGeometry(1, 2).scale(0.085, 0.095, 0.085);
  {
    // 토끼풀 꽃: 하얀 꽃잎이 송송 (꼭짓점마다 살짝 울퉁불퉁)
    const p = flowerGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + (hash(i, 3) / 4294967296 - 0.5) * 0.35;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    flowerGeo.computeVertexNormals();
  }

  const leafMat = patch(new THREE.MeshLambertMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide }), false);
  const stemMat = patch(new THREE.MeshLambertMaterial({ color: '#7fae58' }), true);
  const flowerMat = patch(new THREE.MeshLambertMaterial({ color: '#ffffff' }), false);

  function instanced(geo, mat, cap) {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const root = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    root.setUsage(THREE.DynamicDrawUsage);
    m.geometry = geo.clone();
    m.geometry.setAttribute('aRoot', root);
    m.frustumCulled = false;
    m.count = 0;
    scene.add(m);
    return m;
  }
  const leaves = instanced(leafGeo, leafMat, CAP_LEAF);
  const stems = instanced(stemGeo, stemMat, CAP_STEM);
  const flowers = instanced(flowerGeo, flowerMat, CAP_FLOWER);

  const groundTex = new THREE.CanvasTexture(groundCanvas(512));
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set((FIELD + 60) / 5, (FIELD + 60) / 5);
  groundTex.anisotropy = 4;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(FIELD + 60, FIELD + 60), new THREE.MeshLambertMaterial({ map: groundTex }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  // 들판 경계: 나무 울타리 대신 낮은 돌 테두리
  {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const stones = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: '#a59c86' }), 4 * Math.ceil(FIELD / 0.9) + 8);
    const d = new THREE.Object3D(); let k = 0; const r = rng(99);
    for (let side = 0; side < 4; side++) for (let t = -HALF; t <= HALF; t += 0.9) {
      const e = HALF + 0.6;
      const [x, z] = side === 0 ? [t, -e] : side === 1 ? [t, e] : side === 2 ? [-e, t] : [e, t];
      d.position.set(x, 0.08, z); d.rotation.set(r() * 0.3, r() * 3, r() * 0.3);
      const s = 0.45 + r() * 0.35; d.scale.set(s, 0.25 + r() * 0.15, s * 0.8);
      d.updateMatrix(); stones.setMatrixAt(k++, d.matrix);
    }
    stones.count = k;
    scene.add(stones);
  }

  // ---------------------------------------------------------------- 상태
  let F = null;                         // 들판 데이터
  let angCache = null, tiltCache = null;
  const hidden = new Set();             // 그리지 않을 클로버 id (누가 찾아간 네잎)
  let heroId = -1;                      // 지금 들어 올린 클로버
  const target = new THREE.Vector2(0, 0);
  let dist = 10, dist0 = 10;
  let lastBuild = { x: 1e9, z: 1e9, d: 0 }, dirty = true;
  const visited = new Uint8Array(FIELD * FIELD);
  let visitedKey = null, visitedDirty = false;
  const markers = new Map();            // idx → sprite
  const luckyRings = [];
  let showLucky = false;
  const listeners = { pick: [], brush: [], view: [] };
  const emit = (n, v) => listeners[n].forEach((f) => f(v));

  // ---------------------------------------------------------------- 카메라
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  function placeCamera() {
    target.x = clamp(target.x, -HALF + 1, HALF - 1);
    target.y = clamp(target.y, -HALF + 1, HALF - 1);
    dist = clamp(dist, dist0 * 0.42, dist0 * 2.3);
    camera.position.set(target.x, Math.sin(PITCH) * dist, target.y + Math.cos(PITCH) * dist);
    camera.lookAt(target.x, 0, target.y);
    camera.updateMatrixWorld();
  }
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    if (!w || !h) return;   // 숨겨진 탭·창에서는 크기가 0일 수 있어요
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const old = dist0;
    // 화면 짧은 쪽에 땅 약 6칸이 보이게
    dist0 = 6 / (2 * Math.tan((FOV / 2) * Math.PI / 180) * Math.min(camera.aspect, 1));
    dist *= dist0 / old;
    if (!Number.isFinite(dist)) dist = dist0;
    placeCamera();
    dirty = true;
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  /** 화면 좌표 → 높이 y 평면 위 점 */
  function groundAt(px, py, y = 0, out = new THREE.Vector3()) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    if (Math.abs(d.y) < 1e-5) return null;
    const t = (y - o.y) / d.y;
    if (t < 0) return null;
    return out.copy(d).multiplyScalar(t).add(o);
  }
  function viewRect(margin = 0) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ndc.set(nx, ny);
      ray.setFromCamera(ndc, camera);
      const o = ray.ray.origin, d = ray.ray.direction;
      const t = d.y < -1e-3 ? -o.y / d.y : 60;
      const px = o.x + d.x * t, pz = o.z + d.z * t;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz);
    }
    return { x0: x0 - margin, x1: x1 + margin, z0: z0 - margin, z1: z1 + margin };
  }

  // ---------------------------------------------------------------- 인스턴스 채우기
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Qy = new THREE.Quaternion(), Qz = new THREE.Quaternion();
  const P = new THREE.Vector3(), S = new THREE.Vector3();
  const AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);

  function prepare(f) {
    angCache = new Float32Array(f.n * 5).fill(NaN);
    tiltCache = new Float32Array(f.n * 5);
    for (let id = 0; id < f.n; id++) {
      const a = leafAngles(f, id);
      const r = rng(hash(f.round, id, 5));
      for (let k = 0; k < a.length; k++) { angCache[id * 5 + k] = a[k]; tiltCache[id * 5 + k] = 0.1 + r() * 0.28; }
      if (f.kind[id] === DECOY) { angCache[id * 5 + 4] = strayAngle(f, id); tiltCache[id * 5 + 4] = 0.05; }
    }
  }

  function leafAt(i, x, y, z, ang, tilt, len, tint, rootX, rootZ, rootH, phase) {
    Qy.setFromAxisAngle(AY, ang); Qz.setFromAxisAngle(AZ, tilt); Q.multiplyQuaternions(Qy, Qz);
    P.set(x, y, z); S.set(len, len, len);
    M.compose(P, Q, S);
    leaves.setMatrixAt(i, M);
    const c = TINTS[tint];
    leaves.instanceColor.setXYZ(i, c[0], c[1], c[2]);
    leaves.geometry.attributes.aRoot.setXYZW(i, rootX, rootZ, rootH, phase);
  }

  function rebuild() {
    if (!F) return;
    const r = viewRect(2.2);
    const ix0 = Math.max(0, Math.floor(r.x0 + HALF)), ix1 = Math.min(FIELD - 1, Math.floor(r.x1 + HALF));
    const iz0 = Math.max(0, Math.floor(r.z0 + HALF)), iz1 = Math.min(FIELD - 1, Math.floor(r.z1 + HALF));
    let nl = 0, ns = 0;
    const sroot = stems.geometry.attributes.aRoot;
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const c = iz * FIELD + ix;
      for (let id = F.cellStart[c]; id < F.cellStart[c + 1]; id++) {
        const x = F.x[id], z = F.z[id], h = F.h[id], sz = F.size[id], tint = F.tint[id];
        const phase = (id * 0.618) % 6.28;
        if (F.kind[id] === DECOY && nl < CAP_LEAF) {
          // 틈에 끼어든 옆 클로버 잎: 들어 올려도 땅에 남아요
          const a = angCache[id * 5 + 4];
          leafAt(nl++, x - Math.cos(a) * 0.05, h - 0.05, z + Math.sin(a) * 0.05, a, tiltCache[id * 5 + 4], LEAF_LEN * sz * 0.95, tint, x, z, h - 0.05, phase);
        }
        if (hidden.has(id) || id === heroId) continue;
        if (nl + 4 > CAP_LEAF || ns >= CAP_STEM) break;
        for (let k = 0; k < 4; k++) {
          const a = angCache[id * 5 + k];
          if (Number.isNaN(a)) break;
          leafAt(nl++, x, h, z, a, tiltCache[id * 5 + k], LEAF_LEN * sz, tint, x, z, h, phase);
        }
        Qy.setFromAxisAngle(AY, F.rot[id]); P.set(x, 0, z); S.set(1, h, 1);
        M.compose(P, Qy, S); stems.setMatrixAt(ns, M);
        stems.instanceColor.setXYZ(ns, 1, 1, 1);
        sroot.setXYZW(ns++, x, z, h, phase);
      }
    }
    // 토끼풀 꽃
    let nf = 0;
    const froot = flowers.geometry.attributes.aRoot;
    for (const fl of F.flowers) {
      if (fl.x < r.x0 || fl.x > r.x1 || fl.z < r.z0 || fl.z > r.z1 || nf >= CAP_FLOWER || ns >= CAP_STEM) continue;
      const phase = (fl.x * 3.1 + fl.z) % 6.28;
      P.set(fl.x, fl.h + 0.06, fl.z); Q.identity(); S.set(1, 1, 1);
      M.compose(P, Q, S); flowers.setMatrixAt(nf, M);
      const pink = fl.c > 0.7 ? 0.86 : 1;
      flowers.instanceColor.setXYZ(nf, 1.02, pink, pink * 0.97 + 0.03);
      froot.setXYZW(nf++, fl.x, fl.z, fl.h + 0.06, phase);
      Qy.setFromAxisAngle(AY, fl.c * 6.28); P.set(fl.x, 0, fl.z); S.set(1.1, fl.h + 0.04, 1.1);
      M.compose(P, Qy, S); stems.setMatrixAt(ns, M);
      stems.instanceColor.setXYZ(ns, 0.95, 1, 0.9);
      sroot.setXYZW(ns++, fl.x, fl.z, fl.h + 0.04, phase);
    }
    for (const [m, n] of [[leaves, nl], [stems, ns], [flowers, nf]]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
      m.geometry.attributes.aRoot.needsUpdate = true;
    }
    lastBuild = { x: target.x, z: target.y, d: dist };
    dirty = false;
  }

  // ---------------------------------------------------------------- 헤치기
  const pushes = [];      // {x,z,r,born,held}
  let brushPt = null;
  function brushAt(p) {
    const r = 0.8 + Math.min(0.5, (dist / dist0 - 1) * 0.3);
    const last = pushes[pushes.length - 1];
    const now = performance.now();
    // 손가락이 0.25 이상 움직일 때마다 자국을 하나씩 남겨요 (그 사이 작은 움직임은 무시)
    if (last && last.held && Math.hypot(last.x - p.x, last.z - p.z) < 0.25) return 0;
    if (last) last.held = false;
    const moved = last ? Math.min(1, Math.hypot(last.x - p.x, last.z - p.z)) : 0.3;
    pushes.push({ x: p.x, z: p.z, r, born: now, held: true, rel: 0 });
    while (pushes.length > NP) pushes.shift();
    return moved;
  }
  function releaseBrush() { for (const p of pushes) if (p.held) { p.held = false; } }
  function updatePushes(now) {
    const arr = U.uPush.value;
    for (let i = pushes.length - 1; i >= 0; i--) {
      const p = pushes[i];
      if (p.held) p.rel = now;
      else if (!p.rel) p.rel = now;
      const age = (now - p.born) / 1000;
      const since = (now - p.rel) / 1000;
      // 손가락이 지나가면 1.6초 버티다가 2초 동안 천천히 일어나요
      const s = Math.min(1, age / 0.12) * (p.held ? 1 : 1 - smoothstep(1.6, 3.6, since));
      p.s = s;
      if (!p.held && s <= 0.001) pushes.splice(i, 1);
    }
    for (let i = 0; i < NP; i++) {
      const p = pushes[i];
      if (p) arr[i].set(p.x, p.z, p.s, p.r); else arr[i].set(0, 0, 0, 1);
    }
  }

  // ---------------------------------------------------------------- 탭한 클로버 찾기
  const dsp = new THREE.Vector3();
  function pickAt(px, py) {
    if (!F) return null;
    const a = groundAt(px, py, 0), b = groundAt(px, py, 0.8);
    if (!a || !b) return null;
    const rect = canvas.getBoundingClientRect();
    let best = null, bestY = -1;
    const cx0 = Math.floor(Math.min(a.x, b.x) + HALF) - 1, cx1 = Math.floor(Math.max(a.x, b.x) + HALF) + 1;
    const cz0 = Math.floor(Math.min(a.z, b.z) + HALF) - 1, cz1 = Math.floor(Math.max(a.z, b.z) + HALF) + 1;
    for (let iz = Math.max(0, cz0); iz <= Math.min(FIELD - 1, cz1); iz++) for (let ix = Math.max(0, cx0); ix <= Math.min(FIELD - 1, cx1); ix++) {
      const c = iz * FIELD + ix;
      for (let id = F.cellStart[c]; id < F.cellStart[c + 1]; id++) {
        if (hidden.has(id) || id === heroId) continue;
        const h = F.h[id];
        dispJS(F.x[id], F.z[id], h, dsp);
        // 잎이 펼쳐진 가운데(줄기 끝)를 화면에 투영
        tmpV.set(F.x[id] + dsp.x, h + dsp.y + 0.03, F.z[id] + dsp.z).project(camera);
        const sx = (tmpV.x + 1) / 2 * rect.width + rect.left, sy = (1 - tmpV.y) / 2 * rect.height + rect.top;
        tmpV2.set(F.x[id] + dsp.x + LEAF_LEN * F.size[id] * 0.75, h + dsp.y, F.z[id] + dsp.z).project(camera);
        const rad = Math.max(10, Math.hypot((tmpV2.x - tmpV.x) / 2 * rect.width, (tmpV2.y - tmpV.y) / 2 * rect.height));
        const dd = Math.hypot(sx - px, sy - py);
        if (dd > rad) continue;
        // 위에 있는(높은) 클로버가 아래 것을 가려요. 가운데에 가까울수록 살짝 가산점.
        const score = h + dsp.y + (1 - dd / rad) * 0.12;
        if (score > bestY) { bestY = score; best = { id, sx, sy }; }
      }
    }
    if (!best) return null;
    const id = best.id;
    return { id, kind: F.kind[id], idx: F.idx[id], x: best.sx, y: best.sy };
  }

  // ---------------------------------------------------------------- 들어 올려 보기
  let hero = null;
  const heroLeafMat = new THREE.MeshLambertMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide });
  const heroStemMat = new THREE.MeshLambertMaterial({ color: '#7fae58' });
  const heroLight = new THREE.PointLight('#fff6c0', 0, 4, 1.5);
  scene.add(heroLight);
  const sparkleTex = new THREE.CanvasTexture((() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.25, 'rgba(255,240,160,.8)'); g.addColorStop(1, 'rgba(255,220,120,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(30, 4, 4, 56); x.fillRect(4, 30, 56, 4);
    return c;
  })());
  const sparkles = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(48 * 3), 3)),
    new THREE.PointsMaterial({ map: sparkleTex, size: 0.09, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
  );
  sparkles.frustumCulled = false;
  scene.add(sparkles);

  function buildHero(id) {
    const g = new THREE.Group();
    const h = F.h[id], sz = F.size[id];
    const stem = new THREE.Mesh(stemGeo, heroStemMat);
    stem.scale.set(1.3, h, 1.3);
    stem.rotation.y = F.rot[id];
    g.add(stem);
    const c = TINTS[F.tint[id]];
    const mat = heroLeafMat.clone();
    mat.color.setRGB(c[0], c[1], c[2]);
    for (let k = 0; k < 4; k++) {
      const a = angCache[id * 5 + k];
      if (Number.isNaN(a)) break;
      const m = new THREE.Mesh(leafGeo, mat);
      Qy.setFromAxisAngle(AY, a); Qz.setFromAxisAngle(AZ, tiltCache[id * 5 + k]);
      m.quaternion.multiplyQuaternions(Qy, Qz);
      m.position.set(0, h, 0);
      m.scale.setScalar(LEAF_LEN * sz);
      g.add(m);
    }
    return g;
  }

  /** 클로버를 들어 올려 눈앞에 보여줘요. 다 올라오면 resolve */
  function lift(id) {
    dropNow();
    const g = buildHero(id);
    const h = F.h[id];
    dispJS(F.x[id], F.z[id], h, dsp);
    const from = new THREE.Vector3(F.x[id] + dsp.x, 0, F.z[id] + dsp.z);
    g.position.copy(from);
    scene.add(g);
    heroId = id; dirty = true;
    return new Promise((resolve) => {
      hero = { id, g, h, from, t0: performance.now(), dur: 520, phase: 'up', resolve, spin: 0, glow: 0 };
    });
  }
  /** 다시 땅에 내려놓기 */
  function drop() {
    if (!hero || hero.phase === 'down') return Promise.resolve();
    return new Promise((resolve) => { Object.assign(hero, { phase: 'down', t0: performance.now(), dur: 380, resolve }); });
  }
  function dropNow() {
    if (!hero) return;
    scene.remove(hero.g);
    heroId = -1;
    hero.resolve && hero.resolve();
    hero = null; dirty = true;
    heroLight.intensity = 0; sparkles.material.opacity = 0;
  }
  /** 네잎: 반짝이게 */
  function glow(on = true) { if (hero) hero.glow = on ? 1 : 0; }
  /** 찾은 네잎은 날아가듯 사라짐 (들판에서도 안 그림) */
  function vanish() {
    if (!hero) return Promise.resolve();
    return new Promise((resolve) => { Object.assign(hero, { phase: 'gone', t0: performance.now(), dur: 900, resolve }); });
  }

  const camDir = new THREE.Vector3(), camUp = new THREE.Vector3(), endPos = new THREE.Vector3(), qEnd = new THREE.Quaternion(), qSpin = new THREE.Quaternion();
  function animateHero(now, dt) {
    if (!hero) return;
    const { g, h } = hero;
    camera.getWorldDirection(camDir);
    camUp.copy(camera.up).applyQuaternion(camera.quaternion);
    // 눈앞 2.1 앞, 살짝 위 (아래쪽엔 판정 문구가 떠요)
    endPos.copy(camera.position).addScaledVector(camDir, 2.1).addScaledVector(camUp, 0.08);
    qEnd.setFromUnitVectors(AY, tmpV.copy(camDir).negate());
    hero.spin += dt * (hero.glow ? 0.9 : 0.5);
    qSpin.setFromAxisAngle(AY, hero.spin);
    const t = clamp((now - hero.t0) / hero.dur, 0, 1);
    let k;
    if (hero.phase === 'up') k = easeOutBack(t);
    else if (hero.phase === 'hold') k = 1;
    else if (hero.phase === 'down') k = 1 - easeInOut(t);
    else k = 1;
    // 회전: 땅에 서 있는 모습 → 얼굴(잎)이 나를 보게
    g.quaternion.identity().slerp(qEnd, clamp(k, 0, 1)).multiply(qSpin);
    // 잎 가운데가 endPos에 오도록
    const pivot = tmpV2.set(0, h, 0).applyQuaternion(g.quaternion);
    const a = hero.from, bx = endPos.x - pivot.x, by = endPos.y - pivot.y, bz = endPos.z - pivot.z;
    g.position.set(a.x + (bx - a.x) * k, a.y + (by - a.y) * k + Math.sin(Math.PI * clamp(k, 0, 1)) * 0.25, a.z + (bz - a.z) * k);
    if (hero.phase === 'gone') {
      const s = 1 + t * 0.6;
      g.scale.setScalar(s);
      g.position.addScaledVector(camUp, t * 0.9);
      g.children.forEach((m) => { m.material.transparent = true; m.material.opacity = 1 - easeInOut(t); });
    }
    heroLight.position.copy(endPos).addScaledVector(camDir, -0.4);
    heroLight.intensity += ((hero.glow ? 3.2 : 0) - heroLight.intensity) * Math.min(1, dt * 5);
    sparkles.material.opacity += ((hero.glow ? 1 : 0) - sparkles.material.opacity) * Math.min(1, dt * 4);
    if (sparkles.material.opacity > 0.01) {
      const pos = sparkles.geometry.attributes.position;
      for (let i = 0; i < 48; i++) {
        const ang = i * 2.399 + now / 900 * (i % 2 ? 1 : -1), rr = 0.2 + (i % 7) * 0.035 + Math.sin(now / 500 + i) * 0.02;
        tmpV.set(Math.cos(ang) * rr, Math.sin(ang) * rr, Math.sin(now / 300 + i * 1.7) * 0.05);
        tmpV.applyQuaternion(camera.quaternion).add(endPos);
        pos.setXYZ(i, tmpV.x, tmpV.y, tmpV.z);
      }
      pos.needsUpdate = true;
      sparkles.material.size = 0.05 + 0.03 * Math.sin(now / 160);
    }
    if (t >= 1 && hero.phase === 'up') { hero.phase = 'hold'; const r = hero.resolve; hero.resolve = null; r && r(); }
    else if (t >= 1 && hero.phase === 'down') dropNow();
    else if (t >= 1 && hero.phase === 'gone') {
      scene.remove(g); hidden.add(hero.id); heroId = -1; dirty = true; const r = hero.resolve; hero = null; r && r();
      heroLight.intensity = 0; sparkles.material.opacity = 0;
    }
  }

  // ---------------------------------------------------------------- 찾은 자리 팻말
  function markerSprite(text) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(255,253,240,.94)';
    roundRect(x, 6, 10, 244, 62, 30); x.fill();
    x.strokeStyle = 'rgba(60,110,40,.5)'; x.lineWidth = 3; x.stroke();
    x.beginPath(); x.moveTo(118, 72); x.lineTo(128, 90); x.lineTo(138, 72); x.closePath(); x.fillStyle = 'rgba(255,253,240,.94)'; x.fill();
    x.fillStyle = '#244a1c';
    x.font = '700 30px "Pretendard Variable", system-ui, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 128, 42, 228);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.center.set(0.5, 0.05);
    s.renderOrder = 10;
    return s;
  }
  /** found: Map idx → {rank, nick} */
  function setFound(found) {
    if (!F) return;
    for (const l of F.lucky) {
      const f = found.get(l.i);
      if (f) {
        if (!hidden.has(l.id)) { hidden.add(l.id); dirty = true; }
        const label = `🍀 ${f.rank}. ${f.nick}`;
        let m = markers.get(l.i);
        if (m && m.userData.label !== label) { scene.remove(m); m = null; }
        if (!m) {
          m = markerSprite(label);
          m.userData = { label, born: performance.now() };
          m.position.set(l.x, 0.3, l.z);
          scene.add(m);
          markers.set(l.i, m);
        }
      } else {
        if (hidden.has(l.id)) { hidden.delete(l.id); dirty = true; }
        const m = markers.get(l.i);
        if (m) { scene.remove(m); markers.delete(l.i); }
      }
    }
  }

  function setField(f) {
    F = f;
    prepare(f);
    hidden.clear();
    if (hero) { scene.remove(hero.g); hero = null; }
    heroId = -1;
    markers.forEach((m) => scene.remove(m)); markers.clear();
    luckyRings.forEach((m) => scene.remove(m)); luckyRings.length = 0;
    pushes.length = 0;
    visitedKey = `clover:seen:${f.round}`;
    visited.fill(0);
    try { const s = localStorage.getItem(visitedKey); if (s) { const b = atob(s); for (let i = 0; i < Math.min(b.length, visited.length); i++) visited[i] = b.charCodeAt(i); } } catch {}
    if (showLucky) debugLucky(true);
    dirty = true;
  }

  function debugLucky(on) {
    showLucky = on;
    luckyRings.forEach((m) => scene.remove(m)); luckyRings.length = 0;
    if (!on || !F) return;
    for (const l of F.lucky) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 24), new THREE.MeshBasicMaterial({ color: '#ff3355', depthTest: false, transparent: true, opacity: 0.8 }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(l.x, 0.35, l.z); ring.renderOrder = 9;
      scene.add(ring); luckyRings.push(ring);
    }
  }

  // ---------------------------------------------------------------- 입력
  let oneFinger = 'brush';   // 'brush' | 'move'
  const ptrs = new Map();
  let gesture = null;        // 두 손가락
  let single = null;         // 한 손가락 / 마우스
  const grabV = new THREE.Vector3(), curV = new THREE.Vector3();

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) {
      const pan = oneFinger === 'move' || e.button === 2 || e.button === 1 || e.shiftKey;
      single = { id: e.pointerId, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, pan, multi: false };
      if (pan) groundAt(e.clientX, e.clientY, 0, grabV);
    } else if (ptrs.size === 2) {
      if (single) { single.multi = true; releaseBrush(); }
      const [p, q] = [...ptrs.values()];
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      gesture = { d0: Math.hypot(p.x - q.x, p.y - q.y), dist0: dist, grab: groundAt(mx, my, 0, new THREE.Vector3()) };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) { hover(e); return; }
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size >= 2 && gesture) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      dist = gesture.dist0 * (gesture.d0 / Math.max(20, d));
      placeCamera();
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (gesture.grab && groundAt(mx, my, 0, curV)) { target.x += gesture.grab.x - curV.x; target.y += gesture.grab.z - curV.z; placeCamera(); }
      emit('view');
      return;
    }
    if (!single || single.id !== e.pointerId || single.multi) return;
    if (!single.moved && Math.hypot(e.clientX - single.sx, e.clientY - single.sy) > 7) single.moved = true;
    if (!single.moved) return;
    if (single.pan) {
      if (groundAt(e.clientX, e.clientY, 0, curV)) { target.x += grabV.x - curV.x; target.y += grabV.z - curV.z; placeCamera(); emit('view'); }
    } else {
      const g = groundAt(e.clientX, e.clientY, 0.35, curV);
      if (g) { brushPt = g; const m = brushAt(g); if (m) emit('brush', m); }
    }
  });
  const end = (e) => {
    const was = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) gesture = null;
    if (single && single.id === e.pointerId) {
      const quick = performance.now() - single.t < 450;
      if (!single.moved && !single.multi && quick && was && e.type === 'pointerup') {
        const hit = pickAt(single.sx, single.sy);
        emit('pick', hit || { id: -1, x: single.sx, y: single.sy });
      }
      releaseBrush();
      single = null; brushPt = null;
    }
    if (ptrs.size === 1) {
      // 두 손가락 중 하나를 떼면 남은 손가락으로 이어서 움직이지 않게
      const [id] = ptrs.keys();
      single = { id, sx: 0, sy: 0, t: 0, moved: true, pan: false, multi: true };
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const before = groundAt(e.clientX, e.clientY, 0, grabV);
    dist *= Math.exp(e.deltaY * 0.0012);
    placeCamera();
    if (before && groundAt(e.clientX, e.clientY, 0, curV)) { target.x += before.x - curV.x; target.y += before.z - curV.z; placeCamera(); }
    emit('view');
  }, { passive: false });
  function hover(e) {
    if (e.pointerType !== 'mouse') return;
    canvas.style.cursor = oneFinger === 'move' || e.shiftKey ? 'grab' : 'pointer';
  }
  const keys = new Set();
  addEventListener('keydown', (e) => { if (e.target.closest && e.target.closest('input,textarea')) return; keys.add(e.key.toLowerCase()); });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  // ---------------------------------------------------------------- 미니맵
  const mm = minimap ? minimap.getContext('2d') : null;
  let mmLast = 0;
  function drawMinimap(now, force) {
    if (!mm || (!force && now - mmLast < 200)) return;
    mmLast = now;
    const W = minimap.width, s = W / FIELD;
    mm.clearRect(0, 0, W, W);
    mm.fillStyle = '#2f5a24'; mm.fillRect(0, 0, W, W);
    mm.fillStyle = 'rgba(214,255,150,.42)';
    for (let i = 0; i < visited.length; i++) if (visited[i]) mm.fillRect((i % FIELD) * s, Math.floor(i / FIELD) * s, s + 0.5, s + 0.5);
    for (const [i, m] of markers) {
      const l = F.lucky[i]; if (!l) continue;
      mm.fillStyle = '#fff6b0';
      mm.beginPath(); mm.arc((l.x + HALF) * s, (l.z + HALF) * s, Math.max(2.5, s * 0.9), 0, Math.PI * 2); mm.fill();
    }
    const r = viewRect(0);
    mm.strokeStyle = '#ffffff'; mm.lineWidth = 2;
    mm.strokeRect((clamp(r.x0, -HALF, HALF) + HALF) * s, (clamp(r.z0, -HALF, HALF) + HALF) * s, (clamp(r.x1, -HALF, HALF) - clamp(r.x0, -HALF, HALF)) * s, (clamp(r.z1, -HALF, HALF) - clamp(r.z0, -HALF, HALF)) * s);
  }
  if (minimap) {
    const jump = (e) => {
      const r = minimap.getBoundingClientRect();
      target.set(((e.clientX - r.left) / r.width) * FIELD - HALF, ((e.clientY - r.top) / r.height) * FIELD - HALF);
      // 화면 가운데(조금 아래쪽)가 그 자리에 오게
      placeCamera(); emit('view'); drawMinimap(performance.now(), true);
    };
    minimap.addEventListener('pointerdown', (e) => { e.preventDefault(); try { minimap.setPointerCapture(e.pointerId); } catch {} jump(e); minimap.onpointermove = jump; });
    minimap.addEventListener('pointerup', () => { minimap.onpointermove = null; });
    minimap.addEventListener('pointercancel', () => { minimap.onpointermove = null; });
  }

  function markVisited() {
    // 충분히 확대했을 때 화면 가운데 근처(잘 보이는 곳)만 "탐험함"으로 칠해요
    if (!F || dist > dist0 * 1.35) return;
    const rad = 3 * dist / dist0;
    const ix0 = Math.max(0, Math.floor(target.x - rad + HALF)), ix1 = Math.min(FIELD - 1, Math.floor(target.x + rad + HALF));
    const iz0 = Math.max(0, Math.floor(target.y - rad + HALF)), iz1 = Math.min(FIELD - 1, Math.floor(target.y + rad + HALF));
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      if (Math.hypot(ix + 0.5 - HALF - target.x, iz + 0.5 - HALF - target.y) > rad) continue;
      const c = iz * FIELD + ix;
      if (!visited[c]) { visited[c] = 1; visitedDirty = true; }
    }
  }
  setInterval(() => {
    if (!visitedDirty || !visitedKey) return;
    visitedDirty = false;
    try { localStorage.setItem(visitedKey, btoa(String.fromCharCode(...visited))); } catch {}
  }, 3000);
  const explored = () => { let n = 0; for (const v of visited) n += v; return n / visited.length; };

  // ---------------------------------------------------------------- 루프
  let last = performance.now(), running = true;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    step(now);
  }
  function step(now) {
    const dt = Math.min(0.05, Math.max(0, now - last) / 1000);
    last = now;
    if (keys.size) {
      const sp = dist * 0.9 * dt;
      if (keys.has('arrowleft') || keys.has('a')) target.x -= sp;
      if (keys.has('arrowright') || keys.has('d')) target.x += sp;
      if (keys.has('arrowup') || keys.has('w')) target.y -= sp;
      if (keys.has('arrowdown') || keys.has('s')) target.y += sp;
      if (keys.has('=') || keys.has('+')) dist *= 1 - dt;
      if (keys.has('-')) dist *= 1 + dt;
      placeCamera(); emit('view');
    }
    U.uTime.value = now / 1000;
    updatePushes(now);
    if (dirty || Math.hypot(target.x - lastBuild.x, target.y - lastBuild.z) > 0.7 || Math.abs(dist - lastBuild.d) > lastBuild.d * 0.08) {
      rebuild();
      markVisited();
    }
    animateHero(now, dt);
    for (const m of markers.values()) {
      const k = Math.min(1, (now - m.userData.born) / 400);
      const sc = (0.45 + dist / dist0 * 0.35) * easeOutBack(k);
      m.scale.set(sc * 2.67, sc, 1);
      m.position.y = 0.55 + Math.sin(now / 700 + m.position.x) * 0.03;
    }
    renderer.render(scene, camera);
    drawMinimap(now);
  }

  addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  return {
    setField, setFound, lift, drop, glow, vanish,
    on(n, f) { listeners[n].push(f); },
    setMode(m) { oneFinger = m; },
    get mode() { return oneFinger; },
    lookAt(x, z, zoom) { target.set(x, z); if (zoom) dist = dist0 * zoom; placeCamera(); dirty = true; },
    explored,
    debugLucky,
    pause() { running = false; },
    resume() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } },
    // 테스트용: 화면이 숨겨져 rAF가 멈췄을 때 프레임을 직접 돌림
    _debug: { U, pushes, ptrs, pickAt, get field() { return F; }, step: () => step(performance.now()) },
    get info() { return { target: target.clone(), dist, dist0, leaves: leaves.count, stems: stems.count, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },
  };
}

// ---------------------------------------------------------------- 잎 모양
function makeLeafGeometry() {
  // u: 잎자루(0) → 잎끝(1) = +X, v: 가로 = Z. 가운데 잎맥을 따라 살짝 접히고 끝이 아래로 휨.
  const NU = 6, NV = 4;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
    const u = i / NU, v = j / NV - 0.5;
    const y = 0.14 * u - 0.16 * u * u + 0.12 * Math.abs(v) * u;
    pos.push(u, y, v);
    uv.push(v + 0.5, u);
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * (NV + 1) + j, b = a + NV + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function roundRect(x, l, t, w, h, r) {
  x.beginPath();
  x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r); x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r);
  x.closePath();
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
