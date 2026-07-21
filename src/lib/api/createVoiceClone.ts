import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type {
  CreateVoiceCloneRequest,
  CreateVoiceCloneResponse,
} from "./types";

/**
 * Callable 실호출 — API.md `createVoiceClone` 1:1 (Track A, T4, UX-003, AC-018).
 * T2 단계 더미 응답(Architecture.md §4 스텁 관례)을 T4에서 실호출로 교체했다.
 * 서버(functions/src/voice/index.ts)가 Storage 녹음 확인 → VoiceProvider(현재 Mock, T19) →
 * `sessions/{sid}` 반영까지 수행하고, `isMock`으로 목업 여부를 알려준다.
 */
export async function createVoiceClone(
  request: CreateVoiceCloneRequest,
): Promise<CreateVoiceCloneResponse> {
  const callable = httpsCallable<CreateVoiceCloneRequest, CreateVoiceCloneResponse>(
    functionsClient,
    "createVoiceClone",
  );
  const { data } = await callable(request);
  return data;
}
