// 행운 카드: 찾은 사람만 받는 인증 이미지 (1080×1350, 인스타 피드 비율)
import { paintLeaf } from './art.js';

export async function makeCard({ rank, total, nick, date, time }) {
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

  // 흐릿한 세잎들
  let s = (rank * 7919 + nick.length * 131) | 0 || 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.globalAlpha = 0.22;
  for (let i = 0; i < 26; i++) {
    const cx = r() * W, cy = H * 0.62 + r() * H * 0.45, L = 50 + r() * 60, a = r() * 6.28;
    for (let k = 0; k < 3; k++) paintLeaf(x, cx, cy, L, a + k * 2.094);
  }
  x.globalAlpha = 1;

  // 가운데 큰 네잎
  const cx = W / 2, cy = H * 0.43, L = 230;
  x.save();
  x.shadowColor = 'rgba(40,90,20,.35)'; x.shadowBlur = 40; x.shadowOffsetY = 18;
  for (let k = 0; k < 4; k++) paintLeaf(x, cx, cy, L, 0.2 + k * Math.PI / 2, { shine: true, base: '#2d7a27', mid: '#53b33d', edge: '#43a033' });
  x.restore();
  x.fillStyle = '#5f8f3c';
  x.beginPath(); x.ellipse(cx, cy, 16, 16, 0, 0, Math.PI * 2); x.fill();
  // 줄기
  x.strokeStyle = '#6e9c48'; x.lineWidth = 14; x.lineCap = 'round';
  x.beginPath(); x.moveTo(cx + 4, cy + 12); x.quadraticCurveTo(cx + 40, cy + 200, cx - 10, cy + 330); x.stroke();

  // 글자
  x.textAlign = 'center';
  x.fillStyle = '#2b5a1f';
  x.font = '800 44px "Pretendard Variable", system-ui, sans-serif';
  x.fillText(`${date} 오늘의 네잎클로버`, W / 2, 130);
  x.font = '400 128px "Black Han Sans", "Pretendard Variable", sans-serif';
  x.fillStyle = '#1f4716';
  x.fillText(`${total}개 중 ${rank}번째`, W / 2, 1030);
  x.font = '800 54px "Pretendard Variable", system-ui, sans-serif';
  x.fillStyle = '#2b5a1f';
  x.fillText(`${nick} 님이 찾았어요`, W / 2, 1110);
  x.font = '600 34px "Pretendard Variable", system-ui, sans-serif';
  x.fillStyle = 'rgba(31,71,22,.7)';
  x.fillText(`${time} · 전 세계 선착순 ${total}개`, W / 2, 1168);

  // 도장
  x.save();
  x.translate(W - 190, 250); x.rotate(-0.22);
  x.strokeStyle = 'rgba(214,60,90,.85)'; x.lineWidth = 8;
  x.beginPath(); x.arc(0, 0, 104, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 90, 0, Math.PI * 2); x.stroke();
  x.fillStyle = 'rgba(214,60,90,.9)';
  x.font = '400 56px "Black Han Sans", sans-serif';
  x.fillText('행운', 0, 6);
  x.font = '800 24px "Pretendard Variable", sans-serif';
  x.fillText(`No.${String(rank).padStart(2, '0')}`, 0, 46);
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
