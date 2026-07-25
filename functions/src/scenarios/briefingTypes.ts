// getBeginnerBriefing 요청/응답 타입 — src/lib/api/types.ts(클라 계약)와 1:1(API.md 관례).
// T72 · UX-029 초급 사전 브리핑 · Architecture.md §15.3.4 · AC-066.
export type GetBeginnerBriefingRequest = { scenarioId: string };
export type GetBeginnerBriefingResponse = {
  /** 이 시나리오에서 나올 수 있는 위험 신호의 **라벨만**(설명부·인용구는 서버에 남는다, ADR-0004). */
  signals: string[];
};
