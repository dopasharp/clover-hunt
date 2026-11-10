// 게임 규칙 숫자는 여기 한 곳에서만 바꿔요.
// CLOVERS_PER_ROUND를 10보다 크게 바꾸면 database.rules.json의 spots/$i 정규식도 같이 바꿔야 해요.
export const CLOVERS_PER_ROUND = 10;   // 하루에 들판에 숨는 네잎클로버 수 (전 세계 공용)
export const OPEN_HOUR_KST = 12;       // 매일 이 시각(한국 시간)에 새 들판이 열려요
export const FIELD = 32;               // 들판 한 변 길이 (클로버 하나 지름이 약 0.8, 폰 한 화면에 약 6칸)
export const HALF = FIELD / 2;

const DAY = 86400000;
// 라운드 시작 = UTC 기준 (OPEN_HOUR_KST - 9)시. 12시 KST → 03:00 UTC → 10800000ms
export const ROUND_OFFSET = ((OPEN_HOUR_KST - 9 + 24) % 24) * 3600000;

/** 서버 시각(ms) → 라운드 번호. DB 규칙도 같은 계산(r * 86400000 + 10800000 <= now)으로 검사해요. */
export const roundAt = (ms) => Math.floor((ms - ROUND_OFFSET) / DAY);
export const roundStart = (r) => r * DAY + ROUND_OFFSET;
export const roundEnd = (r) => roundStart(r + 1);

/** 라운드 번호 → "2026.11.10" (그 라운드가 열린 한국 날짜) */
export function roundLabel(r) {
  const d = new Date(roundStart(r) + 9 * 3600000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())}`;
}

export function clockKST(ms) {
  const d = new Date(ms + 9 * 3600000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export function countdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
