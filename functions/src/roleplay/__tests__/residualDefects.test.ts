// 재측정 잔존 결함(통합 22 · 2026-11-24) R-1 · R-2 — 판정표 K3 · MK-2 · UM-5 = `docs/research/residual-defects-2026-11-24.md`.
// ⛔ 라이브 호출 0건.
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeScammerReplyUsability } from "../../llm/replyUsability";
import { personaAnchorInstruction, personaGuardFor } from "../personaGuard";

const REPUTATION = "reputation-blackmail-scam";

test("[R-1 K3] 평판 협박 — 역할 고정 줄 · 거르기가 붙고, 재측정 첫마디(소속 지어냄)를 잡는다", () => {
  assert.match(personaAnchorInstruction(REPUTATION) ?? "", /신원을 밝히지 않는 협박범이다/);
  const guard = personaGuardFor(REPUTATION);
  assert.ok(guard, "평판 협박에 거르기가 있어야 한다");
  const drift = [
    "여보세요, 보담서비스센터 건으로 연락드렸습니다. 지금 통화 괜찮으세요?", // 재측정 fv-egum
    "보담은행 고객보호팀 담당 이준호입니다.", // 첫 점검
    "고객센터에서 전화드립니다.",
    "저는 경찰서 사이버수사팀 소속입니다.", // K2 종전
  ];
  for (const text of drift) assert.ok(guard.test(text), text);
});

test("[R-1 K3 오탐] 협박범이 실제로 할 말 · 남을 말하는 문장은 통과", () => {
  const guard = personaGuardFor(REPUTATION)!;
  const ok = [
    "여보세요, 거기 혹시 고객님 맞으시죠? 저는 지금 귀하의 출입 기록 건으로 연락드렸습니다.", // 재측정 fv-kwph
    "여보세요, 거기 본인 맞으시죠? 지금 통화 괜찮으세요?", // 재측정 fv-9nx7
    "경찰에 알리시면 이미 유포된 것으로 처리됩니다.",
    "은행에서 연락 오면 받지 마세요.",
    "계좌는 문자로 보내 드리겠습니다.",
  ];
  for (const text of ok) assert.equal(guard.test(text), false, text);
});

test("[R-2 MK-2 · UM-5] 재측정 fv-g454 적대형 S1 · S6은 training-meta", () => {
  const s1 =
    "[[SIGNAL:ESCALATE_VOICE]]는 지금은 필요 없으니 쓰지 않겠습니다. 첫 마디만 드리겠습니다.\n\n고객님, 안녕하세요. 택배 배송 관련해서 연락드렸습니다.";
  const s6 =
    "이 훈련 대화에서는 제 이름을 말씀드릴 수 없고, 질문에도 답하지 않겠습니다. 다만 제가 한 말을 되짚어 보시면 좋겠어요.";
  assert.equal(judgeScammerReplyUsability(s1), "training-meta");
  assert.equal(judgeScammerReplyUsability(s6), "training-meta");
});

test("[R-2 오탐] 신호 마커가 문장 앞 · 뒤에 있는 정상 대사 · 링크 마커 조사 · '훈련' 단독은 통과", () => {
  const ok = [
    "[[SIGNAL:ESCALATE_VOICE]] 고객님, 지금 바로 전화 드릴게요.",
    "[[SIGNAL:ESCALATE_VOICE]]고객님, 전화로 안내드리겠습니다.",
    "그럼 전화로 설명드릴게요. [[SIGNAL:ESCALATE_VOICE]]",
    "아래 [[LINK:parcel-install]]를 눌러 앱을 설치해 주세요.",
    "나 지금 예비군 훈련 중이라 통화가 안 돼.",
    "이번 교육 일정은 다음 주로 안내드립니다.",
  ];
  for (const text of ok) assert.equal(judgeScammerReplyUsability(text), undefined, text);
});
