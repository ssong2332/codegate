// T192 C6-R(Architecture.md §79.20 (3) · OQ-A152 User 결정 (가) · G596 · G598) — 판정표 4행(전환 전 끊기 금지)의
// "전환이 **이 경로에서** 일어날 수 있는가" 판정. ⭐ 입력은 전부 서버 값이다(경로 = 어느 진입점이 판정을 불렀는가 ·
// 계열 = 서버 카탈로그 · 오퍼 문서 = 서버 read). ⛔ 클라 값을 받지 않는다(그 값은 끊기 허용 범위를 넓힌다 — §79.20 (0) 2).
//
// 진리표(⛔ 표에 없는 경우는 행 추가를 묻는다 — §79.20 (3) ②):
// | # | path | 계열(verifySeriesFor) | offerDoc | → transferReachable |
// |---|---|---|---|---|
// | 1 | realtime | 무관 | 무관 | true(모델 도구 offer_verification_desk 경로가 있다) |
// | 2 | fallback | undefined(카탈로그 없음) | 무관 | true(4행은 verifyEnabled가 이미 거짓 — fail-closed 쪽) |
// | 3 | fallback | "A"(bank) | 무관 | true(앱 주도 announce) |
// | 4 | fallback | "B" | "present" | true(문서가 있으면 컨트롤 · 재연결 가능) |
// | 5 | fallback | "B" | "unknown"(읽기 실패 · 미조회) | true(⛔ fail-closed — 그 턴 4행 차단) |
// | 6 | fallback | "B" | "absent"(읽기 성공 · 문서 없음) | **false**(이 경로에서 오퍼가 열릴 길 0 — 클라 G393 · 트립와이어 G597) |
//
// `realtime/liveTools.ts`의 `verifySeriesFor`를 값 import하므로 잎 모듈 `decide.ts` 밖에 둔다(순환 0 — `decide.ts`는 이 파일을
// import하지 않는다). Firestore · LLM import 0.
import { verifySeriesFor } from "../realtime/liveTools";
import type { ScammerHangupPath } from "../shared/types";

/** 확인 무력화 오퍼 문서 상태. `unknown` = 읽기 실패 또는 읽지 않았다(→ 막는 쪽). */
export type VerifyOfferDocState = "present" | "absent" | "unknown";

export function isVerifyTransferReachable(input: {
  path: ScammerHangupPath;
  scenarioId: string;
  offerDoc: VerifyOfferDocState;
}): boolean {
  return !(input.path === "fallback" && verifySeriesFor(input.scenarioId) === "B" && input.offerDoc === "absent");
}
