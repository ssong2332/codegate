// T158(§48.2.1, AC-084) — 리포트 문서의 대사 축 강등 표기(`ReportDoc.llmProvider`) 파생.
//
// 부수효과 없는 순수 함수다(smsTimeline.ts·verifyTimeline.ts와 동일 관례) — Firestore read는
// 호출부(generateReportCore.ts)가 이미 하고 있으므로(`session`은 함수 첫 줄에서 읽는다, G281),
// 여기서는 값 변환만 한다.
//
// ⛔ 이 모듈이 하지 않는 것: 목소리 축(`voiceProvider`)을 읽거나 반환하지 않는다(§48.3 축 분리 —
// 리포트 1줄은 대사 축만 읽는다). boolean이 아니라 값을 그대로 복사하는 이유는 §48.2.1 "왜
// boolean이 아니라 값 복사인가"를 그대로 따른다(장래 claude/gemini 구분 대비, 이름 충돌 회피).
import type { LlmProviderName, ReportDoc, SessionDoc } from "../shared/types";

/**
 * 세션의 `llmProvider`(mock일 때만 write되는 sticky 태그, §48.1 실측 6)를 리포트 필드로 그대로
 * 복사한다. 무백필 원칙(G274/G276) — 값이 없으면 스프레드해도 아무 필드도 생기지 않는다(부재는
 * "정상이었다"는 긍정 표기가 아니라 "강등을 관측하지 못했다"는 침묵이다).
 */
export function deriveReportLlmProviderField(
  session: Pick<SessionDoc, "llmProvider">,
): Pick<ReportDoc, "llmProvider"> | Record<string, never> {
  return session.llmProvider ? { llmProvider: session.llmProvider } : {};
}

// 재노출(호출부·테스트 편의) — 이 모듈이 다루는 값의 타입임을 명확히 한다.
export type { LlmProviderName };
