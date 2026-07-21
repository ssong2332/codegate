import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { firebaseApp } from "./app";
import { useEmulator } from "./emulator";

// Callable 함수 클라이언트. 리전은 functions/ 배포 리전과 일치해야 한다(기본 us-central1).
export const functionsClient = getFunctions(firebaseApp);

// 로컬 Functions 에뮬레이터 연결(프로토타입 단계, src/lib/firebase/auth.ts와 동일 정책).
if (useEmulator) {
  connectFunctionsEmulator(functionsClient, "127.0.0.1", 5001);
}
