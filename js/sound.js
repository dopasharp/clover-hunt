// 효과음 (WebAudio 합성, 파일 없음): 풀 헤치는 소리, 톡, 들어 올리기, 찾았다 팡파르, 아깝다.
let ctx = null, master = null, noiseBuf = null, rustle = null;
let muted = (() => { try { return localStorage.getItem('clover:mute') === '1'; } catch { return false; } })();

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('clover:mute', m ? '1' : '0'); } catch {}
  if (master) master.gain.value = m ? 0 : 0.8;
}

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone(freq, t, dur, { type = 'sine', vol = 0.2, to = null, attack = 0.005 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(t, dur, { freq = 3000, q = 0.8, vol = 0.2 } = {}) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

/** 헤치는 동안 계속 부르면 사각사각 (amount 0~1) */
export function brush(amount = 0.5) {
  if (!ctx || muted) return;
  if (!rustle) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.7;
    f2.type = 'highpass'; f2.frequency.value = 900;
    g.gain.value = 0;
    s.connect(f).connect(f2).connect(g).connect(master);
    s.start();
    rustle = { g, f };
  }
  const t = ctx.currentTime;
  rustle.f.frequency.setTargetAtTime(2000 + Math.random() * 1800, t, 0.03);
  rustle.g.gain.cancelScheduledValues(t);
  rustle.g.gain.setTargetAtTime(0.05 + amount * 0.2, t, 0.02);
  rustle.g.gain.setTargetAtTime(0, t + 0.08, 0.09);
}

export function tap() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(880, t, 0.07, { type: 'triangle', vol: 0.12, to: 600 });
  noise(t, 0.05, { freq: 4000, vol: 0.08 });
}
export function lift() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, 0.25, { freq: 2200, q: 0.6, vol: 0.12 });
  tone(330, t, 0.35, { type: 'sine', vol: 0.12, to: 990, attack: 0.03 });
}
export function nope() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(520, t, 0.12, { type: 'triangle', vol: 0.12 });
  tone(390, t + 0.11, 0.18, { type: 'triangle', vol: 0.12 });
}
export function sparkle() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [1568, 2093, 2637, 3136].forEach((f, i) => tone(f, t + i * 0.06, 0.5, { type: 'sine', vol: 0.07 }));
}
export function win() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((f, i) => { tone(f, t + i * 0.09, 0.6, { type: 'triangle', vol: 0.16 }); tone(f * 2, t + i * 0.09, 0.4, { type: 'sine', vol: 0.05 }); });
  [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(f, t + 0.55, 1.4, { type: 'sine', vol: 0.09, attack: 0.02 }));
  for (let i = 0; i < 10; i++) tone(2000 + Math.random() * 2500, t + 0.5 + i * 0.07, 0.25, { vol: 0.04 });
}
export function lose() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [392, 370, 349, 294].forEach((f, i) => tone(f, t + i * 0.22, i === 3 ? 0.7 : 0.24, { type: 'sawtooth', vol: 0.06 }));
}
export function ping() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(1318.5, t, 0.3, { vol: 0.08 }); tone(1975.5, t + 0.08, 0.4, { vol: 0.06 });
}
