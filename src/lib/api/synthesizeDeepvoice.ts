import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type {
  SynthesizeDeepvoiceRequest,
  SynthesizeDeepvoiceResponse,
} from "./types";

/**
 * Callable 실호출 — API.md `synthesizeDeepvoice` 1:1 (Track A, T5, UX-005, AC-019/AC-022).
 * T2 단계 더미 응답(Architecture.md §4 스텁 관례)을 크로스트랙 버그픽스로 실호출로 교체했다
 * (createVoiceClone.ts/createSession.ts/endSession.ts와 동일 패턴). 서버
 * (functions/src/voice/index.ts)의 실제 로직은 T19/T5가 이미 구현해 두었다(MockVoiceProvider
 * 기반, isMock:true) — 이 클라 래퍼만 T2 더미 상태로 남아 `session/play/page.tsx`(T5)가
 * 실제로는 백엔드를 호출하지 않고 하드코딩된 mock 오디오 경로를 반환하던 버그였다.
 */
export async function synthesizeDeepvoice(
  request: SynthesizeDeepvoiceRequest,
): Promise<SynthesizeDeepvoiceResponse> {
  const callable = httpsCallable<SynthesizeDeepvoiceRequest, SynthesizeDeepvoiceResponse>(
    functionsClient,
    "synthesizeDeepvoice",
  );
  const { data } = await callable(request);
  return data;
}
