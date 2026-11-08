// ⭐ Edge 재시험 5(2026-11-08 · main `010acaab` · 정부지원금 스미싱 고급 · 세션 `f77fe096`) — #532의 `CALL_PHASE_NO_LINK_LINE`(끝난 화면 · 없는 버튼 금지 ·
// 말로 마무리)이 그 통화의 Live 시스템 프롬프트에 **실려 있었는데도**(같은 경로 · 같은 인자로 재현해 확인) 사기범이
// *"문자로 보내 드린 링크 화면 열어 주시면 …"* → *"화면에서 신청하기 버튼을 눌러 …"*(설치 화면에 그런 버튼 0)라고 했다.
// 원인(추정 — 모델 입력 문면 기준 · 확인 = 실 키 재시험): 그 줄은 앞쪽 페르소나 절에 있고, 뒤에 오는 더 센 공통 절이 반대로 말한다 —
// [진행 강제] *"상대가 '어떻게 하면 되냐'고 물으면 … 곧바로 구체적으로 지시해 다음 단계로 진행시킨다"* · *"요구는 … 네가 보낸 문자·링크 화면에서 진행하게 한다"* ·
// [실시간 통화 — 반드시 지킬 것] *링크는 "문자로 보내 드린 링크"처럼 말로만 가리킨다*. 참가자의 질문("다음엔 뭘 하면 되나요?")이 그 첫 문장을 정확히 건드렸다.
// ⇒ 화면 일이 다 끝난 상태를 **서버가 판정**해, 그 공통 절들보다 뒤(앞선 대화 맥락 · 턴 지시 자리 — 가드레일 바로 앞)에 이 통화의 남은 일을 싣는다.
//
// 판정표 S(메신저에서 넘어온 통화 — Live 토큰 · 폴백 턴 같은 판정 · 같은 문면):
// | # | If | Then |
// |---|---|---|
// | S1 | 넘어온 통화 ∧ 결말이 링크 화면인 루트(`routeEndsWithoutAccount` — 지원금 앱 · 택배 앱 · 재배송) ∧ 통화 중 문자 없음 ∧ 연 링크 화면이 1개 이상이고 전부 마쳤다(응낙 · 제출) | `CALL_SCREENS_DONE_RULE` |
// | S2 | 그 밖(화면을 아직 안 마침 · 화면을 안 엶 · 이체 · 현금 등 다른 결말 · 통화 중 문자 세션 · 메신저 단계) | 없음(종전) |
// ⛔ 끊기 판정(row 9 goal — `goalActionDone`)은 무변경 — 이 규칙은 무엇을 말하고 어떻게 끝내는지만 정한다.

/** S1 문면(따옴표 대사 예시 0 · 모의 · 훈련 어휘 0). 위 공통 절보다 뒤에 실린다. */
export const CALL_SCREENS_DONE_RULE = `[이 통화에서 남은 일 — 위 [진행 강제] · [실시간 통화]의 화면 · 링크 안내보다 이 절이 우선한다]
- 상대는 네가 문자로 보낸 링크 화면에서 할 일(설치 · 권한 허용 또는 입력)을 이미 다 마쳤다. 이 통화에서 상대가 화면에서 할 일은 남지 않았고, 새 문자나 링크도 보낼 수 없다.
- 상대가 다음엔 뭘 하면 되냐고 묻거나 하라는 대로 하겠다고 해도, 문자로 보낸 링크 화면 · 앱 화면 · 버튼(신청하기 · 최종 확인 · 승인 · 완료 같은 것)으로 보내지 않는다. 아직 받지 않은 본인 확인(성함 · 생년월일)이 있으면 그것만 말로 묻는다.
- 물을 것을 다 받았으면 신청이 접수돼 처리된다고 말로만 알리고, 설치한 앱이 있으면 지우지 말고 이 통화 내용을 다른 사람에게 알리지 말라는 당부를 한마디 한 뒤, 위 통화 끝내기 항목대로 통화를 끝낸다.`;

/** 링크 화면 기록(`sessions/{sid}/mockScreens` 문서 값) 중 연 것이 있고 전부 마쳤는가(응낙 · 제출). */
export function linkScreensAllDone(docs: readonly Record<string, unknown>[]): boolean {
  return docs.length > 0 && docs.every((doc) => Boolean(doc.consentedAt) || Boolean(doc.submittedAt));
}

/** 판정표 S. */
export function callScreensDoneRule(input: {
  escalatedCall: boolean;
  noAccountRoute: boolean;
  inCallSms: boolean;
  allScreensDone: boolean;
}): string | undefined {
  return input.escalatedCall && input.noAccountRoute && !input.inCallSms && input.allScreensDone ? CALL_SCREENS_DONE_RULE : undefined; // S1 · S2
}
