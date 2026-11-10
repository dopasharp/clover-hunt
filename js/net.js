// 서버 연동: 누가 오늘 몇 번 네잎을 찾았는지(선착순)와 지금 접속자 수만 주고받아요.
// - firebase: Realtime Database + 익명 로그인
// - local:    localStorage + BroadcastChannel (같은 브라우저의 탭끼리, Firebase 설정 전 테스트용)
import { firebaseConfig } from './firebase-config.js';
import { roundAt } from './config.js';

const ROOT = 'clover';
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const params = new URLSearchParams(location.search);
const cfg = firebaseConfig || {};
const configured = !!cfg.databaseURL && !/YOUR_/.test(`${cfg.apiKey}${cfg.databaseURL}`);
export const mode = params.has('local') || !configured ? 'local' : 'firebase';

/**
 * @typedef {{r:number, uid:string, nick:string, at:number}} Spot
 * @typedef {{ok:true, at:number} | {ok:false, reason:'taken', by:Spot} | {ok:false, reason:'already'} | {ok:false, reason:'closed'}} ClaimResult
 */

export async function connect() {
  return mode === 'local' ? localApi() : firebaseApi();
}

export function explainError(e) {
  const code = String((e && (e.code || e.message)) || e || '');
  if (/operation-not-allowed|admin-restricted/i.test(code)) return '익명 로그인이 꺼져 있어요 → Firebase 콘솔 Authentication › 로그인 방법 › 익명 사용 설정';
  if (/configuration-not-found/i.test(code)) return 'Authentication이 시작되지 않았어요 → Firebase 콘솔 Authentication › 시작하기';
  if (/unauthorized-domain|referer/i.test(code)) return '이 사이트 주소가 허용되지 않았어요 → Authentication › 설정 › 승인된 도메인 확인';
  if (/permission[_ -]denied/i.test(code)) return 'DB 규칙이 막고 있어요 → database.rules.json을 다시 게시해 주세요';
  if (/network-request-failed|Failed to fetch|dynamically imported/i.test(code)) return '서버에 접속하지 못했어요 → 인터넷 확인 후 새로고침';
  return '연결 오류: ' + code.slice(0, 120);
}

async function firebaseApi() {
  const [{ initializeApp }, d, a] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-database.js`),
    import(`${SDK}/firebase-auth.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = a.getAuth(app);
  let uid = null, authError = null;
  try { uid = (await a.signInAnonymously(auth)).user.uid; } catch (e) { authError = e; console.error('[clover] 익명 로그인 실패', e); }
  const db = d.getDatabase(app);
  const ref = (p = '') => d.ref(db, `${ROOT}${p ? '/' + p : ''}`);

  let offset = 0;
  d.onValue(d.ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });

  const me = ref(`presence/${uid || 'anon'}`);
  d.onValue(d.ref(db, '.info/connected'), (s) => {
    if (s.val() !== true || !uid) return;
    d.onDisconnect(me).remove();
    d.set(me, d.serverTimestamp());
  });

  return {
    mode, uid, authError,
    now: () => Date.now() + offset,
    /** cb({ [i]: Spot }) — 들판 전체 상태 (최대 10줄이라 통째로 받아요) */
    watchSpots(cb) { d.onValue(ref('spots'), (s) => cb(s.val() || {})); },
    watchOnline(cb) { d.onValue(ref('presence'), (s) => cb(s.size || 0)); },
    async myRound() {
      if (!uid) return null;
      try { return (await d.get(ref(`users/${uid}/r`))).val(); } catch { return null; }
    },
    /** @returns {Promise<ClaimResult>} */
    async claim(i, nick) {
      if (!uid) throw authError || new Error('NO_AUTH');
      const r = roundAt(Date.now() + offset);
      try {
        await d.update(ref(), {
          [`spots/${i}`]: { r, uid, nick, at: d.serverTimestamp() },
          [`users/${uid}/r`]: r,
        });
        const s = (await d.get(ref(`spots/${i}`))).val();
        return { ok: true, at: s?.at || Date.now() + offset };
      } catch (e) {
        if (!/permission[_ -]denied/i.test(String(e?.code || e?.message))) throw e;
        // 규칙이 막은 이유 찾기: 누가 먼저 가져갔나 / 내가 오늘 이미 찾았나 / 라운드가 바뀌었나
        const [spot, mine] = await Promise.all([d.get(ref(`spots/${i}`)), d.get(ref(`users/${uid}/r`))]);
        const sv = spot.val();
        if (sv && sv.r === r && sv.uid !== uid) return { ok: false, reason: 'taken', by: sv };
        if (mine.val() === r) return { ok: false, reason: 'already' };
        if (roundAt(Date.now() + offset) !== r) return { ok: false, reason: 'closed' };
        throw e;
      }
    },
    sleep() { d.goOffline(db); },
    wake() { d.goOnline(db); },
  };
}

// ---------------------------------------------------------------- local mode
function localApi() {
  const KEY = 'clover:local';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = (x) => { try { localStorage.setItem(KEY, JSON.stringify(x)); } catch {} };
  let uid = sessionStorage.getItem('clover:uid');
  if (!uid) { uid = 'L' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('clover:uid', uid); }
  const ch = new BroadcastChannel('clover');
  const subs = { spots: [], online: [] };
  const peers = new Map();
  const db = () => { const x = load(); x.spots ||= {}; x.users ||= {}; return x; };
  const emitSpots = () => subs.spots.forEach((f) => f(db().spots));
  const emitOnline = () => {
    const t = Date.now();
    let n = 1;
    peers.forEach((at) => { if (t - at < 9000) n++; });
    subs.online.forEach((f) => f(n));
  };
  ch.onmessage = ({ data: m }) => {
    if (m.type === 'spots') emitSpots();
    else if (m.type === 'hello') { peers.set(m.uid, Date.now()); emitOnline(); }
    else if (m.type === 'bye') { peers.delete(m.uid); emitOnline(); }
  };
  const hello = () => ch.postMessage({ type: 'hello', uid });
  hello(); setInterval(() => { hello(); emitOnline(); }, 3000);
  addEventListener('pagehide', () => ch.postMessage({ type: 'bye', uid }));

  return {
    mode, uid, authError: null,
    now: () => Date.now(),
    watchSpots(cb) { subs.spots.push(cb); cb(db().spots); },
    watchOnline(cb) { subs.online.push(cb); emitOnline(); },
    async myRound() { return db().users[uid] ?? null; },
    async claim(i, nick) {
      await new Promise((r) => setTimeout(r, 250)); // 서버 왕복 느낌
      const x = db();
      const r = roundAt(Date.now());
      const s = x.spots[i];
      if (s && s.r >= r && s.uid !== uid) return { ok: false, reason: 'taken', by: s };
      if (x.users[uid] >= r) return { ok: false, reason: 'already' };
      const at = Date.now();
      x.spots[i] = { r, uid, nick, at };
      x.users[uid] = r;
      save(x);
      ch.postMessage({ type: 'spots' });
      emitSpots();
      return { ok: true, at };
    },
    sleep() {}, wake() {},
    /** 테스트용: 다른 사람이 i번을 찾은 것처럼 */
    _fake(i, nick = '테스트') {
      const x = db(); x.spots[i] = { r: roundAt(Date.now()), uid: 'fake' + i, nick, at: Date.now() }; save(x);
      ch.postMessage({ type: 'spots' }); emitSpots();
    },
    _reset() { save({}); sessionStorage.removeItem('clover:uid'); ch.postMessage({ type: 'spots' }); emitSpots(); },
  };
}
