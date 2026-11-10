# 🍀 네잎클로버 찾기

매일 낮 12시(한국 시간)에 새 들판이 열리고, 그 들판에 **전 세계 공용으로 딱 10개**의 네잎클로버가 숨어요.
손가락으로 클로버를 헤쳐서 먼저 찾는 사람이 임자예요. 한 사람당 하루 1개.

GitHub Pages(정적 호스팅) + three.js(3D) + Firebase Realtime Database(선착순 기록)로 동작해요.

## 플레이 방법

1. 닉네임을 적고 **들판으로 들어가기**. 사람마다 들판의 다른 곳에서 시작해요.
2. **한 손가락으로 쓸면** 키 큰 세잎들이 옆으로 눕고, 그 밑에 숨은 낮은 클로버가 드러나요. 3초쯤 지나면 다시 일어나요.
   - **두 손가락**: 이동·확대 (데스크톱은 휠 확대, 오른쪽 드래그나 Shift+드래그로 이동, WASD/방향키)
   - 오른쪽 아래 **✋ 헤치기 / 🧭 이동** 버튼으로 한 손가락 동작을 바꿀 수 있어요.
   - 왼쪽 아래 지도: 내가 둘러본 곳이 밝게 칠해지고, 누르면 그곳으로 이동해요. 이미 찾아간 자리는 노란 점.
   - 네잎마다 **난이도**가 달라요 (10개 중 쉬움 3 · 보통 4 · 어려움 3, 매일 섞여요).
     - ★☆☆ **쉬움**: 키가 커서 위로 솟아 있고, 위에서 🦋 노란 나비가 맴돌아요.
     - ★★☆ **보통**: 세잎들 사이에 섞여 있어요. 잘 보면 보여요.
     - ★★★ **어려움**: 키가 낮아서 세잎 밑에 숨어 있어요. 헤쳐야 보여요.
3. 네잎 같으면 **톡!**
   - 세잎이면 "☘️ 세잎"이 떴다 사라져요.
   - 네잎처럼 보이는 클로버는 눈앞으로 들어 올려서 잎을 세요. **가짜**(옆 클로버 잎이 틈에 끼어서 네잎처럼 보이는 세잎)도 섞여 있어요.
   - 진짜 네잎이면 바로 서버에 선착순 등록 → 도장 쾅 + 색종이 + **행운 카드**(1080×1350, 인스타 피드 비율, 난이도 별 포함)를 저장·공유할 수 있어요.
   - 거의 동시에 다른 사람이 먼저 집으면 "아깝다! ○○님이 한발 먼저…"
4. 누가 네잎을 찾으면 모든 사람 화면에 실시간 알림이 뜨고, 그 자리에 이름 팻말이 서요. 위쪽 🍀 버튼을 누르면 오늘의 행운아 명단이 보여요.

## 구조

| 파일 | 하는 일 |
| --- | --- |
| `js/config.js` | 하루 개수(10), 오픈 시각(12시), 들판 크기 같은 규칙 숫자 |
| `js/field.js` | 라운드 번호로 들판을 만들어요. 같은 날이면 모든 폰에서 같은 들판(32×32, 클로버 약 3천 개, 네잎 10개와 난이도, 가짜 네잎)이 나와요 |
| `js/meadow.js` | three.js 3D 들판. 화면에 보이는 칸만 인스턴스로 그리고, 헤친 자리는 셰이더에서 클로버를 눕혀요. 탭 판정, 들어 올리기, 나비, 팻말, 지도 |
| `js/net.js` | Firebase 선착순 등록과 접속자 수. 설정이 비어 있으면 로컬 테스트 모드 |
| `js/main.js` | 화면 흐름, 알림, 행운아 명단 |
| `js/card.js`, `js/art.js` | 행운 카드 이미지, 잎 그림 |
| `js/sound.js` | 효과음 (WebAudio 합성, 파일 없음) |
| `database.rules.json` | DB 규칙 |

서버에는 들판을 저장하지 않아요. `clover/spots/{0~9}`에 "그 번호를 오늘 누가 언제 찾았나"만 저장해요.

- `spots/$i`는 지난 라운드 기록일 때만 덮어쓸 수 있어서 **선착순 1명**만 성공해요.
- `users/$uid/r`를 같이 써야 해서 **한 사람당 하루 1개**예요.
- 라운드 번호는 서버 시각(`now`)으로 검사해서 **아직 열리지 않은 내일 들판은 미리 가져갈 수 없어요.**

> ⚠️ 들판이 클라이언트에서 만들어지기 때문에 개발자 도구를 잘 다루는 사람은 네잎 위치를 알아낼 수 있어요.
> 캐주얼 게임으로는 괜찮은 수준이고, 확실히 막으려면 Cloud Functions가 탭 위치를 검사하게 바꿔야 해요.

## 1. Firebase 설정

1. [Firebase 콘솔](https://console.firebase.google.com) → **프로젝트 추가** (이 게임 전용 프로젝트 권장).
2. 빌드 → **Realtime Database** → 데이터베이스 만들기 (위치는 싱가포르 `asia-southeast1` 추천).
3. Realtime Database → **규칙** 탭에 [`database.rules.json`](database.rules.json) 내용을 붙여넣고 **게시**.
4. 빌드 → **Authentication** → 시작하기 → 로그인 방법에서 **익명** 사용 설정.
5. Authentication → 설정 → **승인된 도메인**에 `dopasharp.github.io`가 있는지 확인.
6. 프로젝트 설정(⚙️) → 내 앱 → **웹 앱(</>) 추가** → `firebaseConfig` 값을 [`js/firebase-config.js`](js/firebase-config.js)에 붙여넣기 (`databaseURL` 필수).

### 규칙 숫자를 바꿀 때

- **하루 개수**(`CLOVERS_PER_ROUND`)를 10보다 크게 하면 규칙의 `$i.matches(/^[0-9]$/)`를 `/^[0-9]{1,2}$/` 등으로 바꿔요.
- **오픈 시각**(`OPEN_HOUR_KST`)을 바꾸면 규칙의 `10800000`(= 12시 KST = 03:00 UTC, ms)과 `97200000`(= 그 값 + 하루)을 같이 바꿔요.

## 2. GitHub Pages 배포

```bash
git init -b main
git add .
git commit -m "clover hunt"
git remote add origin https://github.com/dopasharp/clover-hunt.git
git push -u origin main
```

GitHub 저장소 → Settings → Pages → Source: `Deploy from a branch`, Branch: `main` / `(root)` → Save.
`https://dopasharp.github.io/clover-hunt/`에서 열려요. 허브의 `dopasharp.github.io/games.js`에 한 줄 추가하면 헤더에 GAME 번호가 붙어요.

## 로컬 테스트 (Firebase 없이)

`firebase-config.js`가 비어 있거나 주소에 `?local`을 붙이면 **로컬 테스트 모드**예요 (같은 브라우저의 탭끼리 BroadcastChannel로 연동).

```bash
npx serve .
```

브라우저 콘솔에서:

- `testReveal()` — 네잎 자리에 빨간 고리 표시 (`testReveal(false)`로 끄기)
- `testGoto(3)` — 3번 네잎으로 이동
- `testFake(2, '닉네임')` — 다른 사람이 2번을 찾은 것처럼 (실시간 알림·팻말 확인)
- `testReset()` — 로컬 기록 지우기
- `testInfo()` — 카메라·그리는 잎 수·삼각형 수
