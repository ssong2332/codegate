import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type { CreateSessionRequest, CreateSessionResponse } from "./types";

/**
 * Callable 실호출 — API.md `createSession` 1:1 (Track B, T8, UX-006 진입, AC-003/AC-007).
 * T2 단계 더미 응답(Architecture.md §4 스텁 관례)을 T8에서 실호출로 교체했다(createVoiceClone.ts와
 * 동일 패턴). 서버(functions/src/session/index.ts)의 실제 로직은 T7이 크로스트랙으로 앞당겨
 * 구현해 두었다(해당 파일 상단 주석 참고) — 이 클라 래퍼만 T2 더미 상태로 남아 있었다.
 */
export async function createSession(
  request: CreateSessionRequest,
): Promise<CreateSessionResponse> {
  const callable = httpsCallable<CreateSessionRequest, CreateSessionResponse>(
    functionsClient,
    "createSession",
  );
  const { data } = await callable(request);
  return data;
}
