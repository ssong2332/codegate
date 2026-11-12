// ⭐ PR-B(2026-11-07 · 사용자 결정 "앱 안 대출 체험" D-L1 · D-L2 — docs/research/institution-advanced-loan-design-2026-11-07.md §3 F7 · §7) —
// 다통화 변형의 **정당한 제3자 레그**(`FlowVariantLeg.genuine` — 대출 실행 확인 상담원) 시스템 프롬프트. 잎 모듈(Firestore · 네트워크 0).
//
// | 블록 | 내용 |
// |---|---|
// | 페르소나 | 레그 `personaPrompt`(사기범 아님 · 고객 보호가 목적) |
// | [이 통화의 흐름] | 레그 `stages` 그대로(번호 매김) |
// | [언어] | 사기범 프롬프트와 같은 언어 규칙(`LANGUAGE_RULE`) |
// | [말투 — 실시간 음성 통화] | 짧고 차분한 업무 통화 말투(이 파일 고정 문면) |
// | [도구] | 결과를 정했으면 `report_loan_review`를 먼저 · 안내를 마치면 `end_call`(goal) |
// | [지킬 것] | 대출 금액 · 계좌 · 비밀번호 · 인증번호를 묻지 않는다 · 실제 금융회사 이름 0 · 훈련이라는 말 0 |
//
// ⛔ 사기범 조립(`buildSystemPrompt`)을 쓰지 않는다 — 그쪽 블록(수법 · 진행 강제 · 문자 · 확인 창구)은 이 인물에게 맞지 않는다.
// "○○캐피탈"은 세션 가상 캐피탈명으로 바뀐다(§83 — 문자 발신 표기와 같은 이름 · `applyFictionalBank`).
import type { FlowVariantLeg } from "../scenarios/flowVariants";
import { applyFictionalBank } from "../shared/fictionalBank";
import { LANGUAGE_RULE } from "./promptAssembly";

export const LIVE_TOOL_REPORT_LOAN_REVIEW_NAME = "report_loan_review";

export const GENUINE_LEG_SPEECH_STYLE = `[말투 — 실시간 음성 통화]
- 금융회사 상담원이 업무 전화를 거는 말투로 짧게 말한다. 한 번에 한두 문장만 말하고 상대 답을 기다린다.
- 문장 끝을 자연스럽게 내리고, 대본을 읽는 듯한 말투나 같은 말 되풀이를 하지 않는다.
- 통화 내내 같은 한 사람의 목소리로 말한다.`;

export const GENUINE_LEG_TOOL_RULE = `[도구 — 반드시 지킨다]
- 확인 질문은 한 번에 하나만 묻고, 고객의 답을 들은 뒤에 다음 질문으로 넘어간다. 답이 질문과 맞지 않으면 그 질문을 한 번 다시 묻는다. 실행은 본인 신청 · 용도 · 누가 권했는지(지금 누구와 통화하며 안내받는지)의 답을 모두 들은 뒤에만 정한다.
- 흐름의 판단 단계에서 실행 · 보류를 정했으면, 결과를 말하기 **전에** \`${LIVE_TOOL_REPORT_LOAN_REVIEW_NAME}\` 도구를 outcome(approved = 실행 · held = 보류)으로 한 번 부른다. 도구 결과를 받은 뒤에 그 결과를 고객에게 안내한다. 한 번 정한 결과는 바꾸지 않는다. 도구가 아직 결과를 정할 수 없다고 하면 결과 · 입금 이야기 없이 그 지시대로 남은 질문을 이어 간다.
- 안내와 인사를 마쳐 통화를 끝낼 때는 그 응답에서 어떤 말보다도 먼저 \`end_call\` 도구를 reason goal로 부르고, 결과가 허락한 뒤에만 짧게 인사한다.
- 고객이 이 통화 도중 먼저 끊겠다고 하면 붙잡지 않는다.`;

export const GENUINE_LEG_LIMITS = `[지킬 것]
- 대출 금액 · 계좌번호 · 비밀번호 · 인증번호 · 주민등록번호를 묻지 않는다. 이 전화는 신청 사실 · 용도 · 제3자 개입 여부만 확인한다.
- 실제 금융회사 · 기관 이름을 지어내 말하지 않는다. 네 회사 이름은 위에 적힌 이름만 쓴다.
- 이것이 연습이나 훈련이라는 말, 화면이나 앱에 관한 말은 하지 않는다.
- 고객이 수사기관 · 금융감독원 · 안전계좌 이야기를 하면 그것이 보이스피싱의 전형적인 수법이라고 차분히 알려 준다. 겁주거나 꾸짖지 않는다.`;

/** 정당한 제3자 레그의 시스템 프롬프트(위 표 순서). `fictionalBankName` 부재 = 자리표시("○○캐피탈") 그대로. */
export function buildGenuineLegPrompt(leg: Pick<FlowVariantLeg, "personaPrompt" | "stages">, fictionalBankName?: string): string {
  const flow = ["[이 통화의 흐름]", ...(leg.stages ?? []).map((stage, i) => `${i + 1}. ${stage}`)].join("\n");
  const prompt = [leg.personaPrompt ?? "", flow, LANGUAGE_RULE, GENUINE_LEG_SPEECH_STYLE, GENUINE_LEG_TOOL_RULE, GENUINE_LEG_LIMITS]
    .filter((block) => block.length > 0)
    .join("\n\n");
  return fictionalBankName ? applyFictionalBank(prompt, fictionalBankName) : prompt;
}
