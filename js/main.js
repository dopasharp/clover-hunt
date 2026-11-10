// 네잎클로버 찾기 — 화면 흐름: 시작 화면 → 들판 → 톡 → 들어 올려 확인 → (진짜면) 선착순 등록 → 행운 카드
import { CLOVERS_PER_ROUND as N, HALF, roundAt, roundEnd, roundLabel, clockKST, countdown } from './config.js';
import { buildField, NORMAL, DECOY, LUCKY } from './field.js';
import { createMeadow } from './meadow.js';
import { connect, explainError } from './net.js';
import { makeCard, shareCard } from './card.js';
import * as sound from './sound.js';

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dopa = () => window.DopaSharp;

const meadow = createMeadow($('#scene'), { minimap: $('#minimap') });

let net = null;
let round = roundAt(Date.now());
let field = null;
let found = new Map();       // idx → {rank, nick, uid, at}
let loadedSpots = false;
let myRound = null;          // 내가 마지막으로 네잎을 찾은 라운드
let started = false, busy = false;
let lastWin = null;

// ---------------------------------------------------------------- 닉네임
const BAD = ['시발', '씨발', 'ㅅㅂ', '병신', 'ㅂㅅ', '개새', '좆', '존나', 'fuck', 'shit', 'bitch'];
function cleanNick(s) {
  let t = Array.from(String(s || '').replace(/\s+/g, ' ').trim()).slice(0, 10).join('');
  for (const w of BAD) t = t.split(w).join('♡'.repeat(Array.from(w).length));
  return t || '익명의 행운아';
}
try { $('#nick').value = localStorage.getItem('clover:nick') || ''; } catch {}
const nick = () => cleanNick($('#nick').value);

// ---------------------------------------------------------------- 라운드
function loadRound() {
  field = buildField(round);
  meadow.setField(field);
  // 사람마다 다른 곳에서 시작해서 한 자리에 몰리지 않게
  const r = Math.random(), a = Math.random() * Math.PI * 2;
  meadow.lookAt(Math.cos(a) * r * (HALF - 6), Math.sin(a) * r * (HALF - 6), 1);
  found = new Map();
  meadow.setFound(found);
  $('#intro-date').textContent = `${roundLabel(round)} 들판`;
  render();
}

function onSpots(raw) {
  const list = [];
  for (let i = 0; i < N; i++) {
    const s = raw && raw[i];
    if (s && s.r === round && typeof s.at === 'number') list.push({ i, ...s });
  }
  list.sort((a, b) => a.at - b.at);
  const next = new Map(list.map((s, k) => [s.i, { rank: k + 1, nick: s.nick, uid: s.uid, at: s.at }]));
  if (loadedSpots) {
    for (const [i, s] of next) {
      if (found.has(i) || s.uid === net.uid) continue;
      const left = N - next.size;
      feed(`🍀 <b>${esc(s.nick)}</b>님이 ${s.rank}번째 네잎을 찾았어요! ${left ? `남은 ${left}개` : '오늘 완판!'}`);
      sound.ping();
    }
  }
  loadedSpots = true;
  found = next;
  meadow.setFound(found);
  if (found.size && [...found.values()].some((s) => s.uid === net.uid)) myRound = round;
  render();
}

function render() {
  const left = N - found.size;
  $('#left').textContent = left;
  $('#left-of').textContent = `/ ${N} 남음`;
  $('#left-pill').classList.toggle('sold', left === 0);
  $('#intro-left').textContent = left;
  $('#intro-total').textContent = `/ ${N}`;
  if (!net) return;
  const start = $('#start');
  start.disabled = false;
  $('#board-btn').hidden = found.size === 0;
  if (left === 0) {
    $('#intro-sub').innerHTML = `오늘의 네잎 ${N}개를 모두 찾았어요!<br>다음 들판은 <b id="intro-cd"></b> 뒤에 열려요.`;
    start.textContent = '그래도 들판 구경하기';
  } else if (myRound === round) {
    $('#intro-sub').textContent = '오늘은 이미 하나 찾았어요. 들판 구경은 언제든 OK!';
    start.textContent = '들판 구경하기';
  } else {
    $('#intro-sub').textContent = `전 세계에 딱 ${N}개. 먼저 집는 사람이 임자예요.`;
    start.textContent = '들판으로 들어가기';
  }
  tick();
}

function tick() {
  const now = net ? net.now() : Date.now();
  const r = roundAt(now);
  if (r !== round) {
    round = r;
    loadedSpots = false;
    loadRound();
    feed('🌱 새 들판이 열렸어요! 오늘의 네잎을 찾아봐요');
  }
  const cd = countdown(roundEnd(round) - now);
  $('#timer').textContent = `⏱ ${cd}`;
  $('#timer').title = '새 들판이 열리기까지';
  const el = $('#intro-cd'); if (el) el.textContent = cd;
}

// ---------------------------------------------------------------- 알림
function feed(html) {
  const box = $('#feed');
  const el = document.createElement('div');
  el.className = 'feed-item';
  el.innerHTML = html;
  box.prepend(el);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, 5200);
}
function floatText(x, y, text) {
  const el = document.createElement('div');
  el.className = 'float';
  el.textContent = text;
  el.style.left = x + 'px'; el.style.top = y + 'px';
  $('#floats').appendChild(el);
  setTimeout(() => el.remove(), 1000);
}
let verdictTimer;
function verdict(title, sub = '', bad = false) {
  const v = $('#verdict');
  clearTimeout(verdictTimer);
  v.querySelector('b').textContent = title;
  v.querySelector('span').textContent = sub;
  v.querySelector('span').hidden = !sub;
  v.classList.toggle('bad', bad);
  v.hidden = false;
  v.style.animation = 'none'; void v.offsetWidth; v.style.animation = '';
}
const hideVerdict = (ms = 0) => { clearTimeout(verdictTimer); verdictTimer = setTimeout(() => { $('#verdict').hidden = true; }, ms); };

function hype(rank) {
  const root = document.createElement('div');
  root.className = 'hype';
  root.innerHTML = `<div class="hype-flash"></div><div class="hype-rays"></div><div class="hype-stamp"><b>행운!</b><small>${rank ? `오늘의 ${rank}번째 네잎` : '네잎클로버'}</small></div>`;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const colors = ['#ffd36b', '#7be38f', '#ff8fb1', '#ffffff', '#d9ff44', '#4fd1a8'];
    const n = innerWidth < 600 ? 48 : 80;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      const leaf = i % 5 === 0;
      c.className = leaf ? 'hype-leaf' : 'hype-bit';
      if (leaf) c.textContent = '🍀'; else c.style.background = colors[i % colors.length];
      c.style.setProperty('--dx', ((Math.random() * 2 - 1) * 50).toFixed(1) + 'vw');
      c.style.setProperty('--up', (16 + Math.random() * 34).toFixed(1) + 'vh');
      c.style.setProperty('--fall', (55 + Math.random() * 50).toFixed(1) + 'vh');
      c.style.setProperty('--rot', ((Math.random() * 2 - 1) * 800).toFixed(0) + 'deg');
      c.style.setProperty('--d', (2.2 + Math.random() * 1.4).toFixed(2) + 's');
      c.style.setProperty('--delay', (Math.random() * 0.25).toFixed(2) + 's');
      c.style.setProperty('--w', (7 + Math.random() * 8).toFixed(0) + 'px');
      root.appendChild(c);
    }
  }
  document.body.appendChild(root);
  setTimeout(() => root.remove(), 4000);
  navigator.vibrate?.([30, 40, 30, 40, 120]);
}

// ---------------------------------------------------------------- 톡!
meadow.on('pick', async (hit) => {
  if (!started || busy) return;
  hideHint();
  sound.tap();
  navigator.vibrate?.(8);
  if (hit.id < 0) { floatText(hit.x, hit.y, '🌱 흙이에요'); return; }
  if (hit.kind === NORMAL) { floatText(hit.x, hit.y, '☘️ 세잎'); return; }
  busy = true;
  try {
    sound.lift();
    await meadow.lift(hit.id);
    if (hit.kind === DECOY) {
      verdict('하나, 둘, 셋… 세잎!', '옆 클로버 잎이 겹쳐서 네잎처럼 보였네요 😅', true);
      sound.nope();
      await sleep(1700);
      hideVerdict();
      await meadow.drop();
      return;
    }
    if (hit.kind !== LUCKY) { await meadow.drop(); return; }
    meadow.glow(true);
    sound.sparkle();
    verdict('하나, 둘, 셋, 넷!', '진짜 네잎클로버예요 🍀');
    if (myRound === round) {
      await sleep(900);
      verdict('진짜 네잎이에요!', '오늘은 이미 하나 찾았으니, 다른 사람 몫으로 남겨 둘게요 🌱');
      await sleep(2300);
      hideVerdict(); meadow.glow(false); await meadow.drop();
      return;
    }
    const [res] = await Promise.all([net.claim(hit.idx, nick()), sleep(700)]);
    if (res.ok) {
      myRound = round;
      hideVerdict();
      // 내 기록이 목록에 들어오면 순번 확정 (보통 바로 들어와요)
      for (let t = 0; t < 30 && !(found.get(hit.idx)?.uid === net.uid); t++) await sleep(100);
      const me = found.get(hit.idx);
      const rank = me?.rank || found.size || 1;
      sound.win();
      hype(rank);
      dopa()?.track('game_complete', { rank });
      await meadow.vanish();
      await sleep(600);
      showWin(rank, me?.at || res.at);
    } else if (res.reason === 'taken') {
      sound.lose();
      verdict('아깝다!', `${res.by.nick}님이 한발 먼저 가져갔어요 😭`, true);
      await sleep(2200);
      hideVerdict(); await meadow.vanish();
    } else if (res.reason === 'already') {
      myRound = round;
      verdict('진짜 네잎이에요!', '오늘은 이미 하나 찾았어요 🌱');
      await sleep(2200);
      hideVerdict(); meadow.glow(false); await meadow.drop();
    } else {
      verdict('들판이 바뀌었어요', '새 들판에서 다시 찾아봐요!', true);
      await sleep(2000);
      hideVerdict(); await meadow.drop();
    }
  } catch (e) {
    console.error(e);
    verdict('앗, 연결 오류', explainError(e), true);
    await sleep(2600);
    hideVerdict(); meadow.glow(false); await meadow.drop();
  } finally {
    busy = false;
    render();
  }
});

let brushT = 0;
meadow.on('brush', (m) => {
  hideHint();
  const now = performance.now();
  if (now - brushT > 40) { brushT = now; sound.brush(m); }
});
meadow.on('view', () => hideHint());
let hintTimer = null;
function hideHint() {
  if (hintTimer || !started) return;
  hintTimer = setTimeout(() => $('#hint').classList.add('gone'), 2500);
}

// ---------------------------------------------------------------- 결과
async function showWin(rank, at) {
  const date = roundLabel(round), time = clockKST(at);
  const canvas = await makeCard({ rank, total: N, nick: nick(), date, time });
  lastWin = { rank, canvas };
  $('#win-stat').textContent = `오늘의 네잎 ${N}개 중 ${rank}번째 · ${time}`;
  $('#win-img').src = canvas.toDataURL('image/png');
  $('#win').hidden = false;
}
$('#win-save').onclick = async () => {
  if (!lastWin) return;
  dopa()?.track('share_click', { method: 'card' });
  const r = await shareCard(lastWin.canvas, `lucky-clover-${roundLabel(round).replace(/\./g, '')}.png`);
  if (r === 'saved') dopa()?.toast('행운 카드를 저장했어요 🍀');
};
$('#win-share').onclick = () => {
  if (!lastWin) return;
  dopa()?.showResult({
    art: '🍀',
    title: '네잎클로버를 찾았어요!',
    stat: `${N}개 중 ${lastWin.rank}번째`,
    detail: `${roundLabel(round)} 들판에서 전 세계 ${N}개뿐인 네잎을 찾았어요.`,
    shareText: `🍀 오늘의 네잎클로버 ${N}개 중 ${lastWin.rank}번째로 찾았어요!`,
  });
};
$('#win-close').onclick = () => { $('#win').hidden = true; };

function openBoard() {
  const list = [...found.entries()].sort((a, b) => a[1].rank - b[1].rank);
  const left = N - found.size;
  $('#board-sub').textContent = `${roundLabel(round)} 들판 · ${left ? `아직 ${left}개 남았어요` : '오늘 완판!'}`;
  const rows = list.map(([, s]) => `<li class="${s.uid === net?.uid ? 'me' : ''}"><span class="rk">${s.rank}</span><span class="nm">${esc(s.nick)}${s.uid === net?.uid ? ' (나)' : ''}</span><span class="tm">${clockKST(s.at)}</span></li>`);
  for (let k = list.length; k < N; k++) rows.push(`<li class="empty"><span class="rk">${k + 1}</span><span class="nm">아직 숨어 있어요…</span></li>`);
  $('#board-list').innerHTML = rows.join('');
  $('#board').hidden = false;
}
$('#left-pill').onclick = openBoard;
$('#board-btn').onclick = openBoard;
$('#board-close').onclick = () => { $('#board').hidden = true; };
$('#board').addEventListener('click', (e) => { if (e.target.id === 'board') $('#board').hidden = true; });

// ---------------------------------------------------------------- 도구
function syncMode() {
  const move = meadow.mode === 'move';
  $('#mode-btn').textContent = move ? '🧭 이동' : '✋ 헤치기';
  $('#mode-btn').setAttribute('aria-pressed', String(move));
}
$('#mode-btn').onclick = () => { meadow.setMode(meadow.mode === 'move' ? 'brush' : 'move'); syncMode(); };
function syncSound() { $('#sound-btn').textContent = sound.isMuted() ? '🔇' : '🔊'; $('#sound-btn').setAttribute('aria-label', sound.isMuted() ? '소리 켜기' : '소리 끄기'); }
$('#sound-btn').onclick = () => { sound.unlock(); sound.setMuted(!sound.isMuted()); syncSound(); };
syncSound(); syncMode();

setInterval(() => { $('#explored').textContent = `탐험 ${Math.round(meadow.explored() * 100)}%`; }, 1000);

document.addEventListener('visibilitychange', () => { if (document.hidden) meadow.pause(); else meadow.resume(); });

$('#start').onclick = () => {
  sound.unlock();
  try { localStorage.setItem('clover:nick', $('#nick').value.trim()); } catch {}
  $('#intro').hidden = true;
  started = true;
  dopa()?.track('game_start');
};
$('#nick').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('#start').disabled) $('#start').click(); });

// ---------------------------------------------------------------- 시작
loadRound();
(async () => {
  try {
    net = await connect();
  } catch (e) {
    console.error(e);
    const n = $('#intro-note'); n.hidden = false; n.textContent = explainError(e);
    return;
  }
  round = roundAt(net.now());
  loadRound();
  if (net.authError) { const n = $('#intro-note'); n.hidden = false; n.textContent = explainError(net.authError); }
  if (net.mode === 'local') {
    const m = $('#mode-note'); m.hidden = false; m.textContent = '로컬 테스트 모드 (Firebase 설정 전)';
  }
  myRound = await net.myRound();
  net.watchSpots(onSpots);
  net.watchOnline((n) => { $('#online').textContent = `👀 ${n}명`; $('#online').title = '지금 들판에 있는 사람'; });
  setInterval(tick, 1000);
  render();
})();

// 콘솔 테스트 도구 (로컬 모드에서 쓰기 좋아요)
Object.assign(window, {
  testReveal: (on = true) => meadow.debugLucky(on),
  testGoto: (i = 0) => { const l = field.lucky[i]; if (l) meadow.lookAt(l.x, l.z, 0.7); return l; },
  testFake: (i = 0, who = '테스트') => net?._fake?.(i, who),
  testReset: () => { net?._reset?.(); myRound = null; render(); },
  testInfo: () => meadow.info,
  testMeadow: meadow,
});
