// 2026-10-22 전수 검수(docs/research/full-scenario-live-audit-2026-10.md) 1차 수정 고정.
// 실 키 프로브에서 본 결함 → 프롬프트 문면 수정. 문면이 빠지면 같은 결함이 다시 난다(효과는 프로브 재측정으로 확인 — 이 테스트는 문면만 고정한다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIO_PROMPTS } from "../index";
import { buildSystemPrompt } from "../../roleplay/promptAssembly";
import { DIFFICULTY_LEVELS } from "../../shared/difficulty";
import { IN_CALL_SMS } from "../inCallSms";

const KIDNAPPING = "kidnapping-threat";
const BLACKMAIL = "reputation-blackmail-scam";

test("[전수 검수 ④] 공통 조립 산출물에 '국민안전지원센터' 예시가 없다(소속 · 예금주 누출 원천) — 전 시나리오 × 3난이도", () => {
  for (const [id, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    for (const level of DIFFICULTY_LEVELS) {
      assert.equal(buildSystemPrompt(prompt, { difficultyLevel: level }).includes("국민안전지원센터"), false, `${id}/${level}`);
    }
  }
});

test("[전수 검수 ④] 자산보호 계좌 문자의 예금주 값은 그대로다(문자 고유 값 — 프롬프트 예시만 뺐다)", () => {
  const bodies = Object.values(IN_CALL_SMS).flat().map((item) => item.body);
  assert.ok(bodies.some((body) => body.includes("예금주: 국민안전지원센터")));
});

test("[전수 검수 ②③] 자녀 납치 — 보냈다고 하면 받은 것으로 친다 · 같은 송금 재요구 금지 · 절차 지어내기 금지 · 예금주는 사람 이름", () => {
  const persona = SCENARIO_PROMPTS[KIDNAPPING].personaPrompt;
  assert.ok(persona.includes("상대가 돈을 보냈다고 하면 받은 것으로 친다"));
  assert.ok(persona.includes("같은 송금을 다시 요구하지 않는다"));
  assert.ok(persona.includes("같은 추가 요구를 되풀이하지 않고"));
  assert.ok(persona.includes("기관처럼 절차를 지어내거나 숫자를 불러 주고 입력하라고 하지 않는다"));
  assert.ok(persona.includes("예금주를 말한다면 사람 이름"));
});

test("[전수 검수 ②④] 유포 협박 — 보낸 뒤 송금 안내 되풀이 금지 · 소속 기관 지어내기 금지", () => {
  const persona = SCENARIO_PROMPTS[BLACKMAIL].personaPrompt;
  assert.ok(persona.includes("상대가 돈을 보냈다고 하면 받은 것으로 친다"));
  assert.ok(persona.includes("이미 끝난 송금 안내"));
  assert.ok(persona.includes("소속 기관·센터·회사 이름을 지어내 대지 않는다"));
});

test("[전수 검수 ②] 공통 [진행 강제] — 거절된 요구를 같은 형태로 다시 꺼내지 않는다(전 시나리오 1회)", () => {
  // §104(2026-10-22) — 문장을 "바로 다음 대답에서는 다시 꺼내지 않는다 · 다른 카드를 쓴 뒤에만"으로 바꿨다(옛 끝 "새 근거를 댄다"는 같은 요구를 다시 꺼내는 길이었다).
  for (const [id, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    const assembled = buildSystemPrompt(prompt, { difficultyLevel: "intermediate" });
    assert.equal(assembled.split("상대가 거절한 요구(예: 성함·생년월일)는 압박 문구나 근거만 바꿔 바로 다음 대답에서 다시 꺼내지 않는다").length - 1, 1, id);
    assert.equal(assembled.includes("그 요구가 왜 지금 필요한지 새 근거를 댄다"), false, `${id}: 옛 끝 구절이 남았다`);
  }
});
