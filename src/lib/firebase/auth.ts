import { connectAuthEmulator, getAuth, GoogleAuthProvider } from "firebase/auth";
import { firebaseApp } from "./app";
import { useEmulator } from "./emulator";

// Firebase Auth — Google Provider only (Architecture.md §1/§7, OQ-U5 확정).
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

// 로컬 Auth 에뮬레이터 연결(프로토타입 단계 — 사용자 결정 2026-07-21: 실 Firebase 프로젝트
// 연결 전까지 에뮬레이터로 진행). 프로덕션 빌드(NODE_ENV=production)에서는 연결하지 않는다.
if (useEmulator) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}
