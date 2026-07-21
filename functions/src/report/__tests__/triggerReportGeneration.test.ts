import { test } from "node:test";
import assert from "node:assert/strict";
import { triggerReportGeneration } from "../index";

// triggerReportGeneration은 endSession(T8)과 sendMessage의 limit_reached 자동종료 경로(T8이
// roleplay/index.ts에 추가한 최소 배선)가 공통으로 호출하는 리포트 생성 "개시" 지점이다
// (AC-007). 실제 리포트 생성 로직은 아직 없다(T9) — 이 테스트는 그 로직이 채워지기 전까지도
// 이 함수가 (1) Firestore/외부 의존 없이 안전하게 resolve하고 (2) 세션 종료 응답 자체를 막지
// 않는다(에러를 흡수한다)는 배선 계약만 증명한다.
test("triggerReportGeneration(): 임의 sessionId로 호출하면 예외 없이 resolve된다(호출부의 세션 종료 응답을 막지 않음)", async () => {
  await assert.doesNotReject(() => triggerReportGeneration("session-1"));
});

test("triggerReportGeneration(): 여러 세션에 대해 동시 호출해도 서로 간섭 없이 모두 resolve된다", async () => {
  await assert.doesNotReject(() =>
    Promise.all([
      triggerReportGeneration("session-a"),
      triggerReportGeneration("session-b"),
      triggerReportGeneration("session-c"),
    ]),
  );
});
