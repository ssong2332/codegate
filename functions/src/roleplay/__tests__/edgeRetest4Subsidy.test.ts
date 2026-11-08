// ⭐ Edge 재시험 4(2026-11-08 · main `94a18fa9` · 정부지원금 스미싱 고급 · 세션 `30d32f49`) — 설치 · 권한 허용을 마친 뒤 넘어온 통화에서
// "문자로 보내 드린 링크 화면에서 최종 확인 버튼을 눌러 신청을 완료해 주시면 됩니다"(그 화면은 이미 끝 · 그런 버튼 0) → 사기범 goal 끊기.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CALL_PHASE_BLOCK, CALL_PHASE_NO_LINK_LINE, callPhaseScenarioPrompt } from "../escalatedCall";
import { resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";

test("[재시험4 N] 끝난 화면으로 돌려보내던 옛 문면이 없고 N1 · N2 · N3 · 금지 버튼 목록이 있다", () => {
  assert.equal(CALL_PHASE_NO_LINK_LINE.includes("화면이 필요하면 앞서 문자로 보낸 링크 화면에서 하라고 한다"), false, "옛 문면(원인 추정) 제거");
  assert.match(CALL_PHASE_NO_LINK_LINE, /아직 마치지 않았을 때만 그 화면에서 마치라고/, "N1");
  assert.match(CALL_PHASE_NO_LINK_LINE, /이미 마쳤으면 그 화면을 다시 열거나 다시 누르라고 하지 않는다/, "N2");
  assert.match(CALL_PHASE_NO_LINK_LINE, /처리가 접수됐다고 말로만 알리고 통화를 마무리한다/, "N3");
  assert.match(CALL_PHASE_NO_LINK_LINE, /최종 확인 · 승인 · 완료 버튼/, "실측 버튼 이름");
  assert.match(CALL_PHASE_NO_LINK_LINE, /인증번호 입력/, "종전 금지 항목 유지");
  assert.equal(/["“”]|모의|훈련/.test(CALL_PHASE_NO_LINK_LINE), false, "따옴표 대사 예시 · 모의 · 훈련 어휘 0");
  assert.equal(CALL_PHASE_NO_LINK_LINE.split("\n").every((line) => line.startsWith("- ")), true, "페르소나 글머리 줄 형식");
});

test("[재시험4 N] 지원금 세 난이도 · 택배 고급의 넘어온 통화(Live 토큰 · 폴백 같은 함수)에 실린다 · 통화 중 문자 세션 · 문자 단계는 없다", () => {
  for (const [scenarioId, variantId] of [
    ["messenger-subsidy-smishing-sms", "fv-rizf"],
    ["messenger-subsidy-smishing-sms", "fv-afbr"],
    ["messenger-subsidy-smishing-sms", "fv-hu8w"],
    ["messenger-parcel-smishing-sms", "fv-g454"],
  ] as const) {
    const prompt = resolveSessionScenarioPrompt(scenarioId, variantId)!;
    const call = callPhaseScenarioPrompt(prompt, { escalatedCall: true, inCallSmsEnabled: false });
    assert.ok(call.personaPrompt.endsWith(`${CALL_PHASE_BLOCK}\n${CALL_PHASE_NO_LINK_LINE}`), variantId);
    assert.ok(!callPhaseScenarioPrompt(prompt, { escalatedCall: true, inCallSmsEnabled: true }).personaPrompt.includes(CALL_PHASE_NO_LINK_LINE), variantId);
    assert.ok(!prompt.personaPrompt.includes(CALL_PHASE_NO_LINK_LINE), `${variantId} 문자 단계 무변경`);
  }
});
