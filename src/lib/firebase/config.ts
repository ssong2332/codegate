// Firebase 클라이언트 SDK 설정값 — 공개(public) 웹 앱 config다(비밀키 아님, Firebase 문서 기준
// Security Rules가 실제 접근 제어를 담당). 값은 NEXT_PUBLIC_* 환경변수로 주입한다
// (.env.example 참조). Cloud Functions 전용 시크릿(ELEVENLABS_API_KEY 등)은 이 파일과
// 무관하며 functions/.env(서버 전용)에서만 관리한다 — 절대 이 파일/클라 번들에 섞지 않는다.
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (process.env.NODE_ENV !== "production") {
  const missing = Object.entries(firebaseConfig)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    console.warn(
      `[lib/firebase/config] Missing NEXT_PUBLIC_FIREBASE_* env vars: ${missing.join(", ")}. ` +
        "Firebase 프로젝트 생성 후 .env에 채워주세요 (.env.example 참조).",
    );
  }
}
