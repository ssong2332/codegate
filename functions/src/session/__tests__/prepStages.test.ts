// §99(UX D-142 · DECISIONS #212) — createSession 준비 단계 신호. 준비 화면은 서버가 실제로 끝낸 단계만 체크한다(D-134 유지).
// `createSession`은 Firestore · 시크릿에 의존하는 `onCall` 핸들러라 유닛 계층에서 직접 실행할 수 없어(createSessionRateLimitOrdering.test.ts와
// 같은 이유 · 같은 관례) 호출 위치는 소스 순서로 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { CREATE_SESSION_PREP_STAGES, emitPrepStage, type CreateSessionPrepChunk } from "../prepStages";

const SRC = path.resolve(__dirname, "../../../src/session/index.ts");

function createSessionBody(): string {
  const src = readFileSync(SRC, "utf8");
  const start = src.indexOf("export const createSession = onCall");
  const end = src.indexOf("export const endSession = onCall");
  assert.ok(start > -1 && end > start, "createSession 본문을 찾지 못했다");
  return src.slice(start, end);
}

test("[G700] 단계는 scenario → opening → saved 세 개다(클라 PREP_STAGE_ORDER와 같은 순서)", () => {
  assert.deepEqual([...CREATE_SESSION_PREP_STAGES], ["scenario", "opening", "saved"]);
});

test("[G700] emitPrepStage — 단계 이름만 싣고, 받는 쪽이 없거나 전송이 실패해도 던지지 않는다(P-4 비차단)", async () => {
  const sent: CreateSessionPrepChunk[] = [];
  await emitPrepStage({ sendChunk: async (c) => (sent.push(c), true) }, "opening");
  assert.deepEqual(sent, [{ stage: "opening" }]);
  assert.deepEqual(Object.keys(sent[0]), ["stage"], "조각에 단계 이름 말고 다른 정보가 실렸다");
  await emitPrepStage(undefined, "scenario");
  await emitPrepStage({ sendChunk: async () => { throw new Error("끊김"); } }, "saved");
  await emitPrepStage({ sendChunk: async () => false }, "saved");
});

test("[G701] 신호는 실제로 끝난 지점에서만 — 모든 거부 게이트 뒤 · 해당 작업 바로 뒤", () => {
  const body = createSessionBody();
  const at = (needle: string) => {
    const i = body.indexOf(needle);
    assert.ok(i > -1, `${needle} 를 찾지 못했다`);
    return i;
  };
  const scenario = at('emitPrepStage(response, "scenario")');
  const opening = at('emitPrepStage(response, "opening")');
  const saved = at('emitPrepStage(response, "saved")');
  // 거부 게이트(동의 · 한도 · 사전 세션 id 재사용)보다 뒤 — 거절된 요청은 어떤 단계도 체크되지 않는다.
  assert.ok(at('"훈련 참여 동의가 필요합니다."') < scenario);
  assert.ok(at("isCreateSessionRateLimited({") < scenario);
  assert.ok(at('"이미 사용된 세션입니다.') < scenario);
  assert.ok(at("await assignFlowVariantForSession(") < scenario);
  // ② 오프닝 대사 생성 뒤 · 저장 앞.
  assert.ok(scenario < at("await generateOpeningLine(") && at("await generateOpeningLine(") < opening);
  assert.ok(opening < at("await commitSessionWithVariant("));
  // ③ 세션 문서 · 오프닝 메시지 커밋과 합성 시도 뒤 · 응답 바로 앞.
  assert.ok(at('await sessionRef.collection("messages").add(') < saved);
  assert.ok(at("await getVoiceProvider().synthesize(") < saved);
  assert.ok(saved < body.lastIndexOf("return {"));
  // 각 단계는 한 번씩만 보낸다.
  for (const stage of CREATE_SESSION_PREP_STAGES) {
    assert.equal(body.split(`emitPrepStage(response, "${stage}")`).length - 1, 1, stage);
  }
});
