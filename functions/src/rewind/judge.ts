// 즉시 되감기(UX-028) 판정 로직 (T70, Architecture.md §15.2.3, ADR-0008).
//
// 판정은 2단계다: ① LLM 1차 ② 실패·Mock·형식 불일치면 **규칙 폴백**. 규칙 폴백은
// analyzeConversation.ts의 RESISTANCE_PATTERN/COMPLIANCE_PATTERN을 **그대로 재사용**한다(복제 금지
// — §15.6 G7). 어느 쪽이 판정했는지는 응답의 judgedBy로 항상 드러낸다(숨기지 않는다, ADR-0008).
//
// Firestore·onCall에 의존하지 않는 순수 로직만 둔다(rewind/index.ts가 부수효과 담당) —
// roleplay/sessionLimits.ts·report/analyzeConversation.ts와 동일한 테스트 가능성 원칙.
import { logger } from "firebase-functions";
import type { LlmClient } from "../llm";
import { COMPLIANCE_PATTERN, RESISTANCE_PATTERN } from "../report/analyzeConversation";
import { buildRewindJudgePrompt, type RewindJudgeContext } from "./judgePrompt";

export type RewindVerdict = "good" | "risky" | "unclear";
export type RewindJudgedBy = "llm" | "rule";
export type RewindJudgement = { verdict: RewindVerdict; reason: string };

/** API.md judgeRewindAnswer Request "answerText ≤500자". 클라도 같은 값으로 사전 차단한다(P-5). */
export const REWIND_ANSWER_MAX_LENGTH = 500;
/** §15.2.2 "리포트당 시도 50건 상한"(초과 시 resource-exhausted). 학습 흐름에서 도달하지 않는 값. */
export const REWIND_ATTEMPT_LIMIT = 50;

// 규칙 폴백의 이유 문구. 판정 근거를 그대로 설명하며, 과신("이제 안전")·질책("또 틀렸습니다")
// 표현을 쓰지 않는다(P-8/P-21, AC-062).
const RULE_REASONS: Record<RewindVerdict, string> = {
  good: "확인하거나 거절하는 표현이 있어 요구를 그대로 따르지 않았습니다.",
  risky: "요구에 응하는 표현이 있어 아직 위험한 대응입니다.",
  unclear: "이번 답변만으로는 안전한 대응인지 판단하기 어렵습니다.",
};

/**
 * 규칙 기반 판정(폴백). analyzeConversation과 **같은 우선순위**를 유지한다 — 저항 신호가 있으면
 * 순응 신호가 함께 있어도 저항이 이긴다(저항 우선, analyzeConversation.ts:139-141과 동형).
 * 둘 다 아니면 `unclear`이며 이것은 오류가 아니라 정상 결과다(ADR-0008).
 */
export function judgeByRule(answerMasked: string): RewindJudgement {
  if (RESISTANCE_PATTERN.test(answerMasked)) return { verdict: "good", reason: RULE_REASONS.good };
  if (COMPLIANCE_PATTERN.test(answerMasked)) return { verdict: "risky", reason: RULE_REASONS.risky };
  return { verdict: "unclear", reason: RULE_REASONS.unclear };
}

const VERDICT_LINE = /verdict\s*[:：]\s*(good|risky|unclear)/i;
const REASON_LINE = /reason\s*[:：]\s*(.+)/;

/**
 * LLM 응답에서 `verdict:`/`reason:` 두 줄을 뽑는다. 형식이 어긋나면 null을 돌려 호출부가 규칙
 * 폴백으로 내려가게 한다 — 모델 출력이 이상할 때 억지로 해석해 근거 없는 판정을 만들지 않는다.
 */
export function parseLlmJudgement(raw: string): RewindJudgement | null {
  const verdictMatch = VERDICT_LINE.exec(raw);
  if (!verdictMatch) return null;
  const verdict = verdictMatch[1].toLowerCase() as RewindVerdict;
  const reason = REASON_LINE.exec(raw)?.[1]?.trim();
  return { verdict, reason: reason && reason.length > 0 ? reason : RULE_REASONS[verdict] };
}

/**
 * LLM 1차 → 규칙 폴백. `judgedBy`로 어느 경로였는지 항상 명시한다.
 *
 * Mock 클라이언트(GEMINI_API_KEY 미설정)는 사기범 대사 생성기라 판정에 쓸 수 없으므로 호출 자체를
 * 건너뛰고 곧바로 규칙 판정한다(ADR-0008 "키 미설정 시 판정이 무의미해진다"). 실 LLM 호출이
 * 실패·타임아웃·형식 불일치여도 예외를 밖으로 던지지 않는다 — 되감기는 학습 화면이라 판정 경로가
 * 막혀도 `correctAction`은 반드시 돌아가야 한다(P-4 조용한 실패 금지, AC-062).
 */
export async function judgeRewindAnswerWith(
  client: LlmClient,
  context: RewindJudgeContext,
): Promise<RewindJudgement & { judgedBy: RewindJudgedBy }> {
  if (client.providerName !== "mock") {
    try {
      const result = await client.complete(buildRewindJudgePrompt(context));
      if (!result.isMock) {
        const parsed = parseLlmJudgement(result.text);
        if (parsed) return { ...parsed, judgedBy: "llm" };
        logger.warn("되감기 판정 — LLM 응답 형식 불일치, 규칙 폴백", {
          providerName: client.providerName,
        });
      }
    } catch (error) {
      logger.warn("되감기 판정 — LLM 실패, 규칙 폴백", {
        providerName: client.providerName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { ...judgeByRule(context.answerMasked), judgedBy: "rule" };
}
