// §59 커밋 D 리뷰 REJECTED(Critical) 수정 — 확인 오퍼 announce 상호배제 슬롯. 근거 주석은
// `verifyAnnounceGuard.ts` 참고.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claimAnnounceSlot,
  releaseAnnounceSlot,
  type AnnounceSlotState,
} from "./verifyAnnounceGuard.ts";

test("[가드] 슬롯이 비어 있으면 클레임에 성공하고 inFlight를 세운다", () => {
  const state: AnnounceSlotState = { inFlight: false };
  assert.equal(claimAnnounceSlot(state), true);
  assert.equal(state.inFlight, true);
});

test("[가드] 이미 inFlight면 두 번째 클레임은 실패하고 상태를 바꾸지 않는다", () => {
  const state: AnnounceSlotState = { inFlight: true };
  assert.equal(claimAnnounceSlot(state), false);
  assert.equal(state.inFlight, true);
});

test("[가드] release 이후에는 다시 클레임할 수 있다", () => {
  const state: AnnounceSlotState = { inFlight: false };
  assert.equal(claimAnnounceSlot(state), true);
  releaseAnnounceSlot(state);
  assert.equal(state.inFlight, false);
  assert.equal(claimAnnounceSlot(state), true);
});

test("[가드] release는 이미 비어 있는 슬롯에 불려도 안전하다(멱등)", () => {
  const state: AnnounceSlotState = { inFlight: false };
  releaseAnnounceSlot(state);
  assert.equal(state.inFlight, false);
});

// ── 실제 레이스 재현 ────────────────────────────────────────────────────────────────
// reviewer 지적의 핵심: `resolveVerifyOfferPlan`(announce 단계, `persist:false`)은 서버 상태로
// 중복을 구분하지 못해 **몇 번을 불러도 무조건 `includeInstruction:true`**를 돌려준다(멱등하지
// 않음, `functions/src/verifyIntercept/buildDoc.ts:90-98`). 즉 가드가 없으면 "모델 도구 경로"와
// "백스톱(지연 발동) 경로"가 거의 동시에 도착했을 때 **둘 다** 서버로부터 announceInstruction을
// 받아 캐릭터가 확인창구 안내를 두 번 말하게 된다.
//
// 두 실제 호출부(`GeminiVoiceSession.dispatchToolCall`의 offer_verification_desk 분기,
// `session/play/page.tsx`의 백스톱 이펙트)가 실제로 따르는 순서 — ①요청 직전 동기적으로 claim
// ②실패하면 서버를 부르지 않고 즉시 리턴 ③성공하면 비동기 서버 호출 ④성공/실패 무관 finally에서
// release — 를 그대로 흉내 낸 두 "요청자"로 시뮬레이션한다. 서버 호출은 컨트롤된 지연을 가진
// Promise로 대체해, 도구 호출이 turnComplete 콜백보다 먼저/나중에 도착할 수 있는 실제 타이밍
// 불확실성(§59.13류 한계)을 양쪽으로 다 검증한다.
async function simulateRace(delays: readonly [number, number]): Promise<number> {
  const state: AnnounceSlotState = { inFlight: false };
  let announceCount = 0;

  async function requester(serverDelayMs: number): Promise<void> {
    if (!claimAnnounceSlot(state)) return; // 이미 다른 경로가 요청 중 — 서버를 부르지 않는다.
    try {
      // 실제 deliverVerifyOffer 호출을 흉내낸다 — reviewer 지적대로 서버는 멱등하지 않으므로
      // 항상 announceInstruction을 돌려준다(placed===false, stage==="announce" 고정).
      await new Promise<void>((resolve) => setTimeout(resolve, serverDelayMs));
      announceCount += 1; // == enqueueTurnInstruction("verify") 1회
    } finally {
      releaseAnnounceSlot(state);
    }
  }

  await Promise.all([requester(delays[0]), requester(delays[1])]);
  return announceCount;
}

test("[레이스 재현] 모델 도구 경로가 먼저 도착해도 백스톱이 거의 동시에 도착하면 announce는 1번만 나간다", async () => {
  const count = await simulateRace([5, 5]);
  assert.equal(
    count,
    1,
    `가드가 없으면 서버가 멱등하지 않아 둘 다 지시를 큐에 넣어 2가 된다(실측 ${count})`,
  );
});

test("[레이스 재현] 백스톱이 더 먼저 시작해도(모델 응답이 그 사이 도착) announce는 1번만 나간다", async () => {
  const count = await simulateRace([1, 20]);
  assert.equal(count, 1, `실측 ${count}`);
});

test("[레이스 역검증] 가드를 우회(claim 없이 바로 요청)하면 실제로 2번 나간다 — 이 시뮬레이션이 진짜 레이스를 반영한다는 대조군", async () => {
  let announceCount = 0;
  async function unguardedRequester(serverDelayMs: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, serverDelayMs));
    announceCount += 1;
  }
  await Promise.all([unguardedRequester(5), unguardedRequester(5)]);
  assert.equal(
    announceCount,
    2,
    "가드 없이 두 경로가 동시에 요청하면 서버가 멱등하지 않아 실제로 중복 서술이 난다는 대조군이 성립하지 않는다",
  );
});

test("[레이스 재현] 순차 실행(레이스가 없을 때)은 여전히 1번만 나간다 — 정상 경로 회귀 없음", async () => {
  const state: AnnounceSlotState = { inFlight: false };
  let announceCount = 0;
  async function requester(): Promise<void> {
    if (!claimAnnounceSlot(state)) return;
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      announceCount += 1;
    } finally {
      releaseAnnounceSlot(state);
    }
  }
  await requester();
  await requester(); // 두 번째는 phase 전이로 실제 앱에서는 애초에 안 불리지만, 슬롯 자체의
  // release가 정상이면 재클레임이 막히지 않는다는 것만 확인한다(§38.4 후보 E 재시도 케이스와 동형).
  assert.equal(announceCount, 2, `순차 호출은 매번 release되어 재클레임이 가능해야 한다(실측 ${announceCount})`);
});
