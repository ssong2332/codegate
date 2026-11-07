// ⭐ Edge 재시험 2(2026-11-07 · main `143c1cfa` · 정부지원금 스미싱 고급) — ① 가린 계좌번호를 모델이 '답 없음'으로 읽고 스스로 포기
// ② 설치 · 권한 허용 직후 먼저 보낸 메시지가 "아직 시스템에서 설치가 확인되지 않음 · '확인' 버튼"(없는 버튼).
import { test } from "node:test";
import assert from "node:assert/strict";
import { explainMaskedTokens } from "../../shared/maskedTokens";
import { maskPII } from "../../guardrails";
import { toLlmHistory, wrapUserInputAsData } from "../promptAssembly";
import { SCREEN_ACTION_FOLLOW_UP_PREFIX, SCREEN_CONSENT_APP_CONFIRM_LINE, screenFollowUpInstruction } from "../screenActionFollowUp";
import { buildPriorChatContext } from "../../realtime/priorChatContext";

test("[재시험2 M1] 참가자가 말한 계좌번호 — 저장값은 가림 그대로 · 모델 입력에는 '실제로 말한 값' 설명", () => {
  const stored = maskPII("새솔은행 110-123-456789 이에요.");
  assert.equal(stored, "새솔은행 [계좌] 이에요.", "저장 · 리포트는 종전 그대로");
  assert.equal(explainMaskedTokens(stored), "새솔은행 [계좌번호: 상대가 실제로 말했고 기록에서만 가림] 이에요.");
  assert.ok(wrapUserInputAsData(stored).includes("[계좌번호: 상대가 실제로 말했고 기록에서만 가림]"), "이번 턴(sendMessage · 통화 중 대화방)");
  const history = toLlmHistory([
    { role: "scammer", textMasked: "계좌번호와 은행 이름을 말씀해 주시겠어요?" },
    { role: "user", textMasked: stored },
  ]);
  assert.equal(history[0]!.content, "계좌번호와 은행 이름을 말씀해 주시겠어요?", "사기범 턴은 그대로");
  assert.ok(history[1]!.content.includes("[계좌번호: 상대가 실제로 말했고 기록에서만 가림]"), "앞선 턴(이력)");
  for (const [token, label] of [["[전화]", "전화번호"], ["[주민번호]", "주민번호"], ["[이메일]", "이메일 주소"]] as const) {
    assert.equal(explainMaskedTokens(`제 ${token}요`), `제 [${label}: 상대가 실제로 말했고 기록에서만 가림]요`);
  }
});

test("[재시험2 M2] 가림 표지 없는 글은 바이트 동일", () => {
  for (const text of ["네 알겠습니다", "새솔은행이요", "[[LINK:x]] 흉내", "[계좌 번호]"]) assert.equal(explainMaskedTokens(text), text);
});

test("[재시험2 M1] 통화로 넘어온 Live 앞선 대화의 참가자 줄에도 설명 · 사기범 줄은 그대로", () => {
  const block = buildPriorChatContext([
    { role: "scammer", textMasked: "계좌번호를 알려 주세요", channel: "messenger" },
    { role: "user", textMasked: "새솔은행 [계좌] 이에요.", channel: "messenger" },
  ])!;
  assert.ok(block.includes("새솔은행 [계좌번호: 상대가 실제로 말했고 기록에서만 가림] 이에요."));
});

test("[재시험2 C1 · C2] 설치 응낙 뒤 먼저 보내는 메시지 — 접두 뒤 '앱 확인' 줄 · 제출은 종전 그대로", () => {
  const consent = screenFollowUpInstruction("consent", "subsidy-install", true);
  assert.ok(consent.startsWith(`${SCREEN_ACTION_FOLLOW_UP_PREFIX}\n${SCREEN_CONSENT_APP_CONFIRM_LINE}\n`));
  assert.match(SCREEN_CONSENT_APP_CONFIRM_LINE, /^\(앱 확인: /, "[화면 행동 확인]이 말하는 앱 알림 표지");
  assert.match(SCREEN_CONSENT_APP_CONFIRM_LINE, /화면에 없는 버튼 · 단계를 눌러 달라고 하지 않는다/);
  assert.equal(/["“]/.test(SCREEN_CONSENT_APP_CONFIRM_LINE), false, "따옴표 대사 예시 0");
  assert.ok(!screenFollowUpInstruction("submit", "parcel-redelivery-form", false).includes(SCREEN_CONSENT_APP_CONFIRM_LINE));
});
