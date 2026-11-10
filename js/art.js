// 2D 그림 재료: 클로버 잎(3D 잎 텍스처와 행운 카드 공용), 흙바닥 텍스처.

/** 하트 모양 잎 하나. (x,y)가 잎자루가 붙는 뾰족한 쪽, ang 방향(0 = 위쪽)으로 len만큼 뻗어요. */
export function paintLeaf(ctx, x, y, len, ang = 0, o = {}) {
  const L = len;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const path = new Path2D();
  path.moveTo(0, 0);
  path.bezierCurveTo(-0.18 * L, -0.08 * L, -0.6 * L, -0.4 * L, -0.5 * L, -0.76 * L);
  path.bezierCurveTo(-0.42 * L, -1.04 * L, -0.08 * L, -1.06 * L, 0, -0.84 * L);
  path.bezierCurveTo(0.08 * L, -1.06 * L, 0.42 * L, -1.04 * L, 0.5 * L, -0.76 * L);
  path.bezierCurveTo(0.6 * L, -0.4 * L, 0.18 * L, -0.08 * L, 0, 0);
  path.closePath();

  const g = ctx.createRadialGradient(0, -0.1 * L, 0.05 * L, 0, -0.55 * L, 0.75 * L);
  g.addColorStop(0, o.base || '#2f7a2a');
  g.addColorStop(0.55, o.mid || '#4ea83a');
  g.addColorStop(1, o.edge || '#3f9431');
  ctx.fillStyle = g;
  ctx.fill(path);

  ctx.save();
  ctx.clip(path);
  // 클로버 특유의 연한 V자 무늬
  ctx.strokeStyle = o.chevron || 'rgba(214,240,190,.36)';
  ctx.lineWidth = 0.08 * L;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-0.34 * L, -0.66 * L);
  ctx.quadraticCurveTo(-0.12 * L, -0.5 * L, 0, -0.36 * L);
  ctx.quadraticCurveTo(0.12 * L, -0.5 * L, 0.34 * L, -0.66 * L);
  ctx.stroke();
  // 잎맥
  ctx.strokeStyle = 'rgba(190,230,160,.45)';
  ctx.lineWidth = 0.022 * L;
  ctx.beginPath(); ctx.moveTo(0, -0.02 * L); ctx.lineTo(0, -0.82 * L); ctx.stroke();
  ctx.lineWidth = 0.012 * L;
  for (const s of [-1, 1]) for (let k = 1; k <= 4; k++) {
    const t = k / 5;
    ctx.beginPath(); ctx.moveTo(0, -t * 0.8 * L); ctx.lineTo(s * (0.18 + t * 0.28) * L, -(t * 0.8 + 0.12) * L); ctx.stroke();
  }
  // 잎 가장자리 살짝 진하게
  ctx.strokeStyle = 'rgba(20,70,20,.45)';
  ctx.lineWidth = 0.035 * L;
  ctx.stroke(path);
  ctx.restore();

  if (o.shine) {
    const sg = ctx.createRadialGradient(-0.2 * L, -0.7 * L, 0, -0.2 * L, -0.7 * L, 0.4 * L);
    sg.addColorStop(0, 'rgba(255,255,255,.35)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save(); ctx.clip(path); ctx.fillStyle = sg; ctx.fillRect(-L, -L * 1.2, 2 * L, 1.4 * L); ctx.restore();
  }
  ctx.restore();
}

/** 3D 잎 텍스처: 잎자루가 아래 가운데, 위로 뻗음 */
export function leafCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  paintLeaf(ctx, size / 2, size * 0.985, size * 0.95, 0);
  return c;
}

/** 흙 + 이끼 바닥 */
export function groundCanvas(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3b3a20';
  ctx.fillRect(0, 0, size, size);
  let s = 12345;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const blob = (n, rad, colors) => {
    for (let i = 0; i < n; i++) {
      const x = r() * size, y = r() * size, rr = rad * (0.4 + r());
      ctx.fillStyle = colors[(r() * colors.length) | 0];
      for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
        ctx.beginPath(); ctx.ellipse(x + dx, y + dy, rr, rr * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  };
  blob(260, 26, ['rgba(70,82,30,.35)', 'rgba(52,48,26,.45)', 'rgba(88,96,40,.25)']);
  blob(900, 5, ['rgba(110,128,52,.5)', 'rgba(40,36,20,.6)', 'rgba(126,110,70,.35)']);
  blob(1400, 1.6, ['rgba(150,170,80,.5)', 'rgba(30,28,16,.6)']);
  return c;
}
