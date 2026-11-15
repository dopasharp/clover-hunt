// 행운 카드: 찾은 사람만 받는 인증 이미지 (1080×1350, 인스타 피드 비율)
import { paintLeaf } from './art.js';
import { TIERS, starText, hash, rng } from './field.js';

// 네잎마다 생김새가 달라요: 같은 라운드·같은 번호면 언제 다시 그려도 같은 모양 (그 네잎만의 얼굴)
const PALETTES = [
  { name: '에메랄드', base: '#1f6a2a', mid: '#3fa042', edge: '#2f8a33', dot: '#4f7f2c' },
  { name: '연둣빛',   base: '#4c9a1e', mid: '#8bd13c', edge: '#6dbb2c', dot: '#6f9a32' },
  { name: '청록',     base: '#17695a', mid: '#36a580', edge: '#2a8a6a', dot: '#3e7a5c' },
  { name: '깊은 숲',  base: '#1a4a1d', mid: '#2f7a2c', edge: '#28672a', dot: '#3c6a2a' },
  { name: '햇살',     base: '#5d8f1a', mid: '#b0d64e', edge: '#8cbf35', dot: '#7a9a30' },
  { name: '올리브',   base: '#46591a', mid: '#7f9c36', edge: '#6a862a', dot: '#5f7232' },
  { name: '민트',     base: '#2c8658', mid: '#6ed39a', edge: '#4fb67e', dot: '#4a8a62' },
  { name: '자줏빛',   base: '#3d4a22', mid: '#6f8a3a', edge: '#5d7531', dot: '#6a3a4a', chev: 2, blotch: 0 },
];
const CHEVRONS = [
  { name: '은빛 V무늬',   c: 'rgba(232,248,220,.6)' },
  { name: '연한 V무늬',   c: 'rgba(214,240,190,.32)' },
  { name: '자줏빛 V무늬', c: 'rgba(110,30,70,.55)' },
  { name: '붉은 V무늬',   c: 'rgba(168,42,42,.5)' },
  { name: '금빛 V무늬',   c: 'rgba(246,216,110,.6)' },
  { name: '민무늬',       c: 'rgba(0,0,0,0)' },
];
const BLOTCHES = ['rgba(105,25,60,.38)', 'rgba(255,255,225,.28)', 'rgba(20,50,15,.3)'];

/** (round, idx) → 이 네잎의 생김새 */
export function cloverLook(round, idx) {
  const seed = hash(round, idx, 0xc10e);
  const R = rng(seed);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const pal = pick(PALETTES);
  const chev = pal.chev != null ? CHEVRONS[pal.chev] : pick(CHEVRONS);
  const blotch = pal.blotch != null ? BLOTCHES[pal.blotch] : (R() < 0.28 ? pick(BLOTCHES) : null);
  const w = 0.84 + R() * 0.34, notch = R(), round_ = R(), vchev = R();
  const tilt = (R() * 2 - 1) * 0.7;
  const small = R() < 0.45 ? Math.floor(R() * 4) : -1;        // 진짜 네잎은 넷째 잎이 작은 경우가 많아요
  const leaves = Array.from({ length: 4 }, (_, k) => ({
    a: tilt + k * Math.PI / 2 + (R() * 2 - 1) * 0.16,
    s: (k === small ? 0.74 + R() * 0.08 : 0.88 + R() * 0.2),
  }));
  const stem = { bend: (R() * 2 - 1) * 90, len: 280 + R() * 90 };
  const shape = w > 1.06 ? '넓적한' : w < 0.94 ? '갸름한' : notch > 0.7 ? '깊은 하트' : notch < 0.3 ? '동글동글' : '하트';
  const name = `${pal.name} · ${shape} 잎 · ${chev.name}${blotch ? ' · 반점' : ''}${small >= 0 ? ' · 막내 잎' : ''}`;
  const code = seed.toString(16).toUpperCase().padStart(8, '0').slice(0, 6);
  return { pal, chev, blotch, w, notch, round: round_, vchev, leaves, stem, name, code, seed };
}

/** 네잎 하나 그리기 (카드 가운데, 미리보기 공용) */
export function paintClover(x, look, cx, cy, L, { shadow = true } = {}) {
  const { pal, chev, blotch, w, notch, round, vchev, leaves, stem } = look;
  // 줄기
  x.strokeStyle = '#6e9c48'; x.lineWidth = L * 0.06; x.lineCap = 'round';
  x.beginPath(); x.moveTo(cx + 4, cy + 12); x.quadraticCurveTo(cx + stem.bend, cy + stem.len * L / 230 * 0.6, cx - stem.bend * 0.2, cy + stem.len * L / 230); x.stroke();
  x.save();
  if (shadow) { x.shadowColor = 'rgba(40,90,20,.35)'; x.shadowBlur = L * 0.17; x.shadowOffsetY = L * 0.08; }
  for (const lf of leaves) {
    paintLeaf(x, cx, cy, L * lf.s, lf.a, {
      shine: true, base: pal.base, mid: pal.mid, edge: pal.edge,
      chevron: chev.c, chevW: 0.07 + vchev * 0.04, vchev, w, notch, round, blotch,
    });
  }
  x.restore();
  x.fillStyle = pal.dot;
  x.beginPath(); x.ellipse(cx, cy, L * 0.07, L * 0.07, 0, 0, Math.PI * 2); x.fill();
}

export async function makeCard({ rank, total, nick, date, time, tier = 'normal', round = 0, idx = rank }) {
  const look = cloverLook(round, idx);
  try { await document.fonts.load('400 120px "Black Han Sans"'); } catch {}
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  // 배경: 햇살 든 풀밭
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#f6fbe4'); bg.addColorStop(0.55, '#d6efb0'); bg.addColorStop(1, '#8cc56a');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const sun = x.createRadialGradient(W * 0.5, H * 0.43, 40, W * 0.5, H * 0.43, 620);
  sun.addColorStop(0, 'rgba(255,248,200,.95)'); sun.addColorStop(1, 'rgba(255,248,200,0)');
  x.fillStyle = sun; x.fillRect(0, 0, W, H);

  // 흐릿한 세잎들 (배치도 네잎마다 달라요)
  const r = rng(look.seed ^ 0x5eed);
  x.globalAlpha = 0.22;
  for (let i = 0; i < 26; i++) {
    const cx = r() * W, cy = H * 0.62 + r() * H * 0.45, L = 50 + r() * 60, a = r() * 6.28;
    for (let k = 0; k < 3; k++) paintLeaf(x, cx, cy, L, a + k * 2.094);
  }
  x.globalAlpha = 1;

  // 가운데 큰 네잎: 세상에 하나뿐인 생김새
  paintClover(x, look, W / 2, H * 0.43, 230);

  // 글자
  x.textAlign = 'center';
  x.fillStyle = '#2b5a1f';
  x.font = '800 44px "Pretendard Variable", system-ui, sans-serif';
  x.fillText(`${date} 오늘의 네잎클로버`, W / 2, 130);
  x.font = '600 28px "Pretendard Variable", system-ui, sans-serif';
  x.fillStyle = 'rgba(31,71,22,.62)';
  x.fillText(`${look.name}  #${look.code}`, W / 2, 178);
  x.font = '400 128px "Black Han Sans", "Pretendard Variable", sans-serif';
  x.fillStyle = '#1f4716';
  x.fillText(`${total}개 중 ${rank}번째`, W / 2, 1000);
  x.font = '800 54px "Pretendard Variable", system-ui, sans-serif';
  x.fillStyle = '#2b5a1f';
  x.fillText(`${nick} 님이 찾았어요`, W / 2, 1076);
  x.font = '600 34px "Pretendard Variable", system-ui, sans-serif';
  x.fillStyle = 'rgba(31,71,22,.7)';
  x.fillText(`${time} · 전 세계 선착순 ${total}개`, W / 2, 1132);
  x.font = '800 40px "Pretendard Variable", system-ui, sans-serif';
  x.fillStyle = '#c98a10';
  x.fillText(`난이도 ${starText(tier)} ${TIERS[tier].label}`, W / 2, 1194);

  // 도장
  x.save();
  x.translate(W - 165, 330); x.rotate(-0.22);
  x.strokeStyle = 'rgba(214,60,90,.85)'; x.lineWidth = 8;
  x.beginPath(); x.arc(0, 0, 104, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 90, 0, Math.PI * 2); x.stroke();
  x.fillStyle = 'rgba(214,60,90,.9)';
  x.font = '400 56px "Black Han Sans", sans-serif';
  x.fillText('행운', 0, 6);
  x.font = '800 24px "Pretendard Variable", sans-serif';
  x.fillText(`No.${String(rank).padStart(2, '0')}`, 0, 46);
  x.font = '400 26px sans-serif';
  x.fillText(starText(tier), 0, -52);
  x.restore();

  // 바닥 띠
  x.fillStyle = '#0b0e0d';
  x.fillRect(0, H - 110, W, 110);
  x.fillStyle = '#d9ff44';
  x.font = '900 36px "Pretendard Variable", sans-serif';
  x.textAlign = 'left';
  x.fillText('도파#', 56, H - 44);
  x.fillStyle = '#f7f6f2';
  x.font = '600 30px "Pretendard Variable", sans-serif';
  x.textAlign = 'right';
  x.fillText('dopasharp.github.io/clover-hunt', W - 56, H - 46);
  return c;
}

/** 폰이면 공유 시트(인스타 스토리 등), 아니면 파일 저장 */
export async function shareCard(canvas, name = 'lucky-clover.png') {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: '네잎클로버 찾기 🍀' }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancel'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'saved';
}
