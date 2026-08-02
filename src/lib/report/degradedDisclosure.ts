// T158(§48.3·§48.5.1, AC-084, docs/UX.md P-31) — 강등(Mock) 고지 공통 로직·문면.
//
// ⛔ 문면은 여기서 새로 짓지 않는다 — 전부 ux-design이 P-31 (2)에서 확정한 채택 3건(ⓔ/ⓕ/ⓖ)을
// 문안 그대로 옮긴 것이다(자기 고지: implementer는 카피를 선점하지 않는다). 이 파일이 존재하는
// 이유는 UX-003·UX-014·UX-022 세 화면이 각자 문자열을 손으로 반복하면 드리프트가 생기기
// 때문이다(한 곳이 문구를 고치면 다른 화면이 뒤처진다).
//
// ⛔ 축 분리(48.3) — 대사 축(dialogue, `llmProvider`)과 목소리 축(voice, `voiceProvider`)은
// 값도 문면도 절대 섞지 않는다. UX-003은 목소리 축만, UX-014/UX-022/UX-008은 대사 축만 쓴다.

export type LlmProviderName = "mock" | "claude" | "gemini";
export type VoiceProviderName = "mock" | "elevenlabs";

/** P-31 ⓔ — 대사 축(UX-014 텍스트 폴백 phase·UX-022) 채택 문면. */
export const DIALOGUE_DEGRADED_NOTICE =
  "지금은 AI 응답을 사용할 수 없어 미리 준비된 대사로 진행합니다.";

/** P-31 ⓕ — 목소리 축(UX-003 "준비 완료" 상태) 채택 문면. */
export const VOICE_DEGRADED_NOTICE = "내 목소리로 만든 음성이 아니라 임시 음성으로 진행됩니다.";

/** P-31 ⓖ — 리포트(UX-008) 채택 문면. 과거형·사실 진술(판정을 무효로 선언하지 않는다). */
export const REPORT_DEGRADED_NOTICE = "이 훈련의 대화 일부는 미리 준비된 대사로 진행됐습니다.";

/**
 * §48.5.1 sticky OR-fold. 한 번 true가 되면 이후 신호가 false여도 false로 되돌리지 않는다
 * (G278 — "sticky는 OR 폴드로만", `setDegraded(false)` 형태의 대입은 이 함수를 거치지 않고는
 * 만들 수 없다).
 */
export function foldDegraded(current: boolean, signal: boolean | null | undefined): boolean {
  return current || signal === true;
}

/**
 * UX-014 텍스트 폴백 phase — 기존 상태 1줄(모달리티 안내)에 대사 출처 사실을 합친다
 * (P-31 (1) "신규 요소 0건" — 새 문단·새 컴포넌트를 만들지 않고 문자열을 이어 붙인다).
 * dialogueDegraded가 아니면 원문 그대로 반환한다(긍정 표기 0건).
 */
export function buildFallbackStatusLine(baseText: string, dialogueDegraded: boolean): string {
  return dialogueDegraded ? `${baseText} ${DIALOGUE_DEGRADED_NOTICE}` : baseText;
}

/** UX-008 — `reports/{id}.llmProvider === "mock"` 하나만 조건자로 쓴다(§48.2.1). 부재는 false
 * (침묵) — "정상이었다"는 긍정 표기로 렌더하지 않는다(G274). */
export function isReportDialogueDegraded(llmProvider: LlmProviderName | undefined): boolean {
  return llmProvider === "mock";
}

/** UX-003 — `sessions/{sid}.voiceProvider === "mock"`(§48.3, 대사 축과 다른 값·다른 write 규칙). */
export function isVoiceDegraded(voiceProvider: VoiceProviderName | null | undefined): boolean {
  return voiceProvider === "mock";
}
