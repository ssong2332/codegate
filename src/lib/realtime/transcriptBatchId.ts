import type { SubmitRealtimeTranscriptRequest } from "../api/types";

/**
 * 전사 재전송(외부 보안 점검 2차 · 2026-11-02) — 제출 1회마다 새 batch ID를 붙인다(호출부가 이미 넣었으면 그대로). 서버는 같은 ID로
 * 다시 온 제출을 저장하지 않는다(`functions/src/realtime/transcriptRequest.ts` 표). 형식 = 하이픈 뺀 UUID 32자(서버 허용 8~64자).
 * 잎 모듈(Firebase import 0) — 테스트가 직접 부른다.
 */
export function withTranscriptBatchId(request: SubmitRealtimeTranscriptRequest): SubmitRealtimeTranscriptRequest {
  if (request.batchId) return request;
  return { ...request, batchId: crypto.randomUUID().replace(/-/g, "") };
}
