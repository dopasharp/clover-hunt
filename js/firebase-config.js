// Firebase 웹 앱 공개 식별자 (서비스 계정 키는 절대 넣지 마세요). 보안은 database.rules.json 규칙이 지킵니다.
// 네잎클로버 찾기 전용 Firebase 프로젝트: clover-hunt
// databaseURL은 Realtime Database 화면 맨 위에 보이는 주소와 같아야 합니다 (싱가포르 리전).
// 값이 비어 있거나 주소에 ?local 을 붙이면 "로컬 테스트 모드"(같은 브라우저의 탭끼리만 연동)로 동작해요.
export const firebaseConfig = {
  apiKey: 'AIzaSyAOx88BaH1dSWdtzPSu50sMeUyId83WJf0',
  authDomain: 'clover-hunt.firebaseapp.com',
  databaseURL: 'https://clover-hunt-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'clover-hunt',
  storageBucket: 'clover-hunt.firebasestorage.app',
  messagingSenderId: '62545832931',
  appId: '1:62545832931:web:1652a472b005100ff18ed6',
};
