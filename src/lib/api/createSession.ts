import { callCallable, callCallableStream } from "./callable";
import type { CreateSessionRequest, CreateSessionResponse } from "./types";
import { devRouteOverrideRequestField } from "@/lib/devroute/devRouteOverride";

/**
 * Callable 실호출 — API.md `createSession` 1:1 (Track B, T8, UX-006 진입, AC-003/AC-007).
 * T2 단계 더미 응답(Architecture.md §4 스텁 관례)을 T8에서 실호출로 교체했다(createVoiceClone.ts와
 * 동일 패턴). 서버(functions/src/session/index.ts)의 실제 로직은 T7이 크로스트랙으로 앞당겨
 * 구현해 두었다(해당 파일 상단 주석 참고) — 이 클라 래퍼만 T2 더미 상태로 남아 있었다.
 */
export async function createSession(
  request: CreateSessionRequest,
  /** §100(UX D-143) — 넘기면 스트리밍으로 부르고, 서버가 실제로 끝낸 준비 단계 이름을 차례로 알린다(준비 화면 체크용). */
  onPrepStage?: (stage: unknown) => void,
): Promise<CreateSessionResponse> {
  // 개발 단계 루트 강제 지정 — 이 탭에 `?route=fv-xxxx`가 저장돼 있으면 싣는다(적용 여부는 서버가 정한다 · devRouteOverride.ts).
  const payload: CreateSessionRequest = { ...request, ...devRouteOverrideRequestField() };
  if (onPrepStage) {
    return callCallableStream<CreateSessionRequest, CreateSessionResponse, { stage?: unknown }>(
      "createSession",
      payload,
      (chunk) => onPrepStage(chunk?.stage),
    );
  }
  return callCallable<CreateSessionRequest, CreateSessionResponse>("createSession", payload);
}
