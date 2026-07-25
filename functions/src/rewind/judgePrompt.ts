// 즉시 되감기(UX-028) 판정 프롬프트 전용 빌더 (T70, Architecture.md §15.2.3, ADR-0008).
//
// ⚠️ 이 파일은 역할극 프롬프트 조립(roleplay/promptAssembly.ts)과 **의도적으로 다른 프롬프트**다.
// 되감기는 사기범 역할극의 재개가 아니라 **단발 평가**이므로:
//   - `personaPrompt`·`weakenedTactics` 원문을 넣지 않는다(AC-005/013 — 새 사기 대사를 만들 근거를
//     모델에게 주지 않는다). 입력은 그 순간의 `tactic` 라벨·`correctAction`·마스킹된 사기범 대사뿐이다.
//   - 사용자 답변은 `wrapUserInputAsData`로 감싸 지시가 아니라 데이터로 전달한다(AC-024, ADR-0004).
// 저장·전달되는 텍스트는 전부 maskPII를 이미 거친 값이다(호출부 rewind/index.ts 책임).
import type { LlmCompletionInput } from "../llm";
import { wrapUserInputAsData } from "../roleplay/promptAssembly";

export type RewindJudgeContext = {
  /** 그 순간 사용된 수법 라벨(리포트 deceivedMoments[i].tactic — 이미 라벨만 남은 값). */
  tactic: string;
  /** 그 순간의 올바른 대처(리포트 deceivedMoments[i].correctAction). */
  correctAction: string;
  /** 그 순간 사기범 대사(마스킹됨). 없으면 빈 문자열 — 그 줄만 빠지고 판정은 계속된다. */
  scammerLineMasked: string;
  /** 사용자가 다시 답한 문장(마스킹됨). */
  answerMasked: string;
};

const JUDGE_INSTRUCTION = `당신은 보이스피싱 예방 훈련의 "대응 평가자"다. 사기범 역할을 연기하지 않으며, 새로운 사기 대사·설득 문구를 절대 만들지 않는다. 훈련 참가자가 다시 답한 한 문장이 이 상황에서 안전한 대응이었는지만 판정한다.

[판정 기준 — 셋 중 하나]
- good: 요구를 따르지 않고 확인·거절·통화 종료 등 스스로 사실을 확인하려는 대응
- risky: 요구에 응하거나 개인정보·금전·행동을 넘겨주거나 약속하는 대응
- unclear: 위 둘 중 어느 쪽인지 이 문장만으로는 판단하기 어려운 경우(정상적인 결과다 — 억지로 good/risky를 고르지 않는다)

[작성 규칙]
- 이유는 한 문장, 존댓말, 40자 이내.
- "이제 안전합니다"·"면역" 같은 과신 표현과 "또 틀렸습니다" 같은 질책 표현을 쓰지 않는다.
- 실제 계좌·링크·앱 이름 등 사기 실행에 쓰일 수 있는 정보를 쓰지 않는다.

[출력 형식 — 아래 두 줄만 출력한다]
verdict: good|risky|unclear
reason: <한 문장>`;

/** 판정용 LLM 입력을 조립한다. 반환값은 그대로 LlmClient.complete()에 넘긴다. */
export function buildRewindJudgePrompt(context: RewindJudgeContext): LlmCompletionInput {
  const situation = [
    "[상황]",
    `- 이 순간 상대가 쓴 수법: ${context.tactic}`,
    `- 이 순간의 올바른 대처: ${context.correctAction}`,
    context.scammerLineMasked
      ? `- 상대가 한 말(마스킹됨): ${context.scammerLineMasked}`
      : "- 상대가 한 말: (기록 없음)",
  ].join("\n");

  return {
    systemPrompt: `${JUDGE_INSTRUCTION}\n\n${situation}`,
    messages: [{ role: "user", content: wrapUserInputAsData(context.answerMasked) }],
  };
}
