import { connectStorageEmulator, getStorage } from "firebase/storage";
import { firebaseApp } from "./app";
import { useEmulator } from "./emulator";

export const storage = getStorage(firebaseApp);

// 로컬 Storage 에뮬레이터 연결(프로토타입 단계, src/lib/firebase/auth.ts와 동일 정책).
if (useEmulator) {
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}
