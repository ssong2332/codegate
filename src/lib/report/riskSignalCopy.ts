// 사용자 결정 2026-10-21 ② — "속음은 아니지만 위험했던 행동" 표기(리포트 · 되짚어보기 공용 · 순수 함수).
//
// 판정은 서버(`functions/src/report/analyzeConversation.ts` `resolveRiskSignalKind`)가 하고 리포트 문서 `riskSignals`에 싣는다.
// 이 파일은 그 값을 읽어 문면만 고른다(판정 0).
// | kind | 제목 | 설명 |
// |---|---|---|
// | secrecy_promise | 비밀로 하겠다고 약속했어요 | 확인을 막는 수법 · 바로 알리기 |
// | bank_disclosed | 거래 은행을 알려 줬어요 | 다음 사칭에 쓰일 수 있음 · 거래 은행도 말하지 않기 |
// | fake_info | 가짜 정보로 맞대응했어요 | 대화가 길어질수록 설득당하기 쉬움 · 끊기 |
// ⛔ 속은 순간이 아니다 — 되감기 버튼 0 · "여기가 신호였어요" 카드 수(`countSignalCards`)에 넣지 않는다 · 질책 · 과신 표현 0(P-8).

export type RiskSignalKind = "secrecy_promise" | "bank_disclosed" | "fake_info";
export type RiskSignalView = { turnIndex: number; timeLabel: string; kind: RiskSignalKind };

/** 되짚어보기 주석 · 리포트 블록의 소제목(같은 문자열). */
export const RISK_SIGNAL_HEADING = "⚠️ 이 행동은 위험했어요";
/** 리포트 블록 제목. */
export const RISK_SIGNAL_SECTION_TITLE = "속지는 않았지만 위험했던 행동";

const COPY: Record<RiskSignalKind, { title: string; explanation: string }> = {
  secrecy_promise: {
    title: "비밀로 하겠다고 약속했어요",
    explanation:
      "'아무에게도 말하지 말라'는 요구는 가족이나 은행에 확인하지 못하게 막는 수법이에요. 이런 요구를 받으면 바로 가족이나 은행에 알리세요.",
  },
  bank_disclosed: {
    title: "거래 은행을 알려 줬어요",
    explanation:
      "은행 이름만으로도 그 은행 직원인 척하는 다음 사기에 쓰일 수 있어요. 모르는 전화에는 거래 은행도 말하지 마세요.",
  },
  fake_info: {
    title: "가짜 정보로 맞대응했어요",
    explanation:
      "가짜 정보를 줘도 대화가 길어질수록 설득당하기 쉬워요. 맞대응하지 말고 끊은 뒤 알고 있는 번호로 직접 확인하세요.",
  },
};

export function riskSignalCopy(kind: RiskSignalKind): { title: string; explanation: string } {
  return COPY[kind];
}

/** 리포트 문서 `riskSignals`(부재 = 빈 배열 · 무백필)를 읽는다. 모양이 어긋난 항목은 버린다. */
export function readRiskSignals(raw: unknown): RiskSignalView[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): RiskSignalView[] => {
    if (typeof item !== "object" || item === null) return [];
    const { turnIndex, timeLabel, kind } = item as Record<string, unknown>;
    if (typeof turnIndex !== "number" || typeof timeLabel !== "string") return [];
    if (kind !== "secrecy_promise" && kind !== "bank_disclosed" && kind !== "fake_info") return [];
    return [{ turnIndex, timeLabel, kind }];
  });
}
