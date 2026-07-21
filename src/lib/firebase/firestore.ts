import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { firebaseApp } from "./app";
import { useEmulator } from "./emulator";

export const db = getFirestore(firebaseApp);

// 로컬 Firestore 에뮬레이터 연결(프로토타입 단계, src/lib/firebase/auth.ts와 동일 정책).
if (useEmulator) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
