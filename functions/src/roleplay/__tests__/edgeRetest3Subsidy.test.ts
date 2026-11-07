// ⭐ Edge 재시험 3(2026-11-08 · main `1d61b7b5` · 정부지원금 스미싱 고급 · 세션 `e4ee87f2`) — ① 설치 뒤 통화로 넘어가지 않고 문자로
// "본인 확인 소액 이체"를 지어냄(이 루트엔 이체 화면 0) ② 사기범 말풍선으로 "이번 훈련은 여기서 마치겠습니다"(포기 신호와 같은 응답).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { judgeScammerReplyUsability } from "../../llm/replyUsability";
import {
  followUpSkipsEscalationFloor,
  INSTALL_DONE_CALL_NEXT_INSTRUCTION,
  installDoneCallNextInstruction,
  installLeadsToCall,
} from "../installCallNext";
import { screenFollowUpInstruction } from "../screenActionFollowUp";
import { MOCK_INSTALL_CONSENT_INSTRUCTION, MOCK_INSTALL_CONSENT_INSTRUCTION_NO_CALL } from "../../scenarios/mockScreens";

const SRC = path.resolve(__dirname, "../../../src");
const read = (file: string) => readFileSync(path.join(SRC, file), "utf8").replace(/\r\n/g, "\n");

test("[재시험3 D4] 실측 훈련 종료 문장은 사기범 대사로 쓸 수 없다 · 훈련 결합형이 아닌 문장은 그대로", () => {
  assert.equal(
    judgeScammerReplyUsability("이번 훈련은 여기서 마치겠습니다. 이체 절차는 진행하지 않으셔도 됩니다. 수고하셨습니다."),
    "training-meta",
  );
  assert.equal(judgeScammerReplyUsability("훈련은 이만 마칠게요."), "training-meta");
  assert.equal(judgeScammerReplyUsability("훈련을 여기까지 종료합니다."), "training-meta");
  for (const ok of [
    "신청은 여기서 마치시면 됩니다.",
    "오늘 예비군 훈련 있어서 연락이 늦었어.",
    "이번 접수는 여기서 마무리하겠습니다. 담당자가 곧 전화드릴게요.",
    "확인했습니다. 수고하셨습니다.",
  ]) {
    assert.equal(judgeScammerReplyUsability(ok), undefined, ok);
  }
});

test("[재시험3 T1] 설치 뒤 통화가 설계인 항목의 응낙만 전환 하한을 건너뛴다 · 그때 지시는 전화 예고형", () => {
  assert.equal(followUpSkipsEscalationFloor("consent", "subsidy-install"), true);
  assert.equal(followUpSkipsEscalationFloor("consent", "parcel-install"), true);
  assert.equal(followUpSkipsEscalationFloor("consent", "child-insurance-install"), false, "설치 뒤 신분증 · 송금(통화 아님)");
  assert.equal(followUpSkipsEscalationFloor("submit", "subsidy-install"), false);
  assert.ok(screenFollowUpInstruction("consent", "subsidy-install", true).endsWith(MOCK_INSTALL_CONSENT_INSTRUCTION));
  assert.ok(screenFollowUpInstruction("consent", "subsidy-install", false).endsWith(MOCK_INSTALL_CONSENT_INSTRUCTION_NO_CALL), "전환 불가면 종전");
  const src = read("roleplay/screenActionFollowUp.ts");
  assert.match(
    src,
    /resolveTransitionNow\(session, PUBLIC_SCENARIOS\) !== undefined &&\n\s*\(followUpSkipsEscalationFloor\(kind, landingId\) \|\|\n\s*!isEscalationTooEarly\(/,
    "전환 설정(resolveTransitionNow)은 그대로 보고 하한만 건너뛴다",
  );
});

test("[재시험3 T2] 설치를 알린 뒤 아직 메신저면 '다음은 통화' 1줄 — 행마다 하나라도 어긋나면 없음", () => {
  const base = {
    messengerStage: true,
    everEscalated: false,
    installCallAnnounced: true,
    otherAppInstruction: false,
    canTransitionNow: true,
  };
  assert.equal(installDoneCallNextInstruction(base), INSTALL_DONE_CALL_NEXT_INSTRUCTION);
  for (const key of ["messengerStage", "installCallAnnounced", "canTransitionNow"] as const) {
    assert.equal(installDoneCallNextInstruction({ ...base, [key]: false }), undefined, key);
  }
  for (const key of ["everEscalated", "otherAppInstruction"] as const) {
    assert.equal(installDoneCallNextInstruction({ ...base, [key]: true }), undefined, key);
  }
  assert.equal(installLeadsToCall("child-insurance-install"), false);
  assert.match(INSTALL_DONE_CALL_NEXT_INSTRUCTION, /^\(앱 확인: /);
  assert.match(INSTALL_DONE_CALL_NEXT_INSTRUCTION, /이체 · 송금 · 추가 인증을 더 요구하지 않는다/);
  assert.equal(/["“]|모의|훈련/.test(INSTALL_DONE_CALL_NEXT_INSTRUCTION), false, "따옴표 대사 예시 · 모의 · 훈련 어휘 0");
});

test("[재시험3 T2] sendMessage 배선 — 메신저 링크 설치 알림 기록에서 읽고, 화면 · 통화 맥락 줄에 싣는다(전환은 여전히 모델 신호 · 예고로만)", () => {
  const src = read("roleplay/index.ts");
  assert.match(src, /installCallAnnounced = mockSnap\.docs\.some\(/);
  assert.match(src, /entrySurface === "messenger-link" &&\n\s*installLeadsToCall\(doc\.id\)/);
  assert.match(src, /callAfterExcuseInstruction,\n\s*installCallNextInstruction,\n/);
  assert.match(src, /otherAppInstruction: turnChoice !== "none"/);
});
