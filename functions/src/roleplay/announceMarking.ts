// D2/F2(docs/Architecture.md §54.2 (3) · §54.9 (4) 4, **G343**) — *"말하지 않은 예고"* 를 예고
// 완료로 기록하지 않는다.
//
// 무엇이 결함이었나: 폴백(텍스트) 턴의 `turnInstruction`(문자 예고·확인 오퍼 예고·재연결·설치 응낙)은
// `buildSystemPrompt` 안으로만 흘러 들어간다. 그런데 **`MockLlmClient.complete()`는 `systemPrompt`를
// 한 번도 읽지 않는다**(읽는 것은 `messages`와 `mockTacticHints`뿐 — 같은 폴더의
// `__tests__/announceMarking.test.ts`가 그것을 단언한다). ⇒ **Mock으로 강등된 턴에서는 그 지시가
// 0효과**인데, 예전 구현은 LLM 호출 **앞에서** `announcedAt`/`consentAnnouncedAt`을 마크했다.
// 그 결과 *"말했다고 기록했는데 말하지 않았다"* 가 성립하고, 폴백의 노출 조건이 그 값을 참으로 읽어
// **예고 대사 없이 확인 데스크 전환이 열린다**(§38이 실시간에서 닫은 결함의 재발).
//
// ⇒ 처방은 **마킹을 LLM 결과에 종속시키는 것**이다. 이 판정자를 순수 함수 한 곳으로 모아 두어
// 호출부가 각자 `completion.isMock`을 해석하지 않게 한다(§38.4 후보 C의 근거 *"폴백은 응답이 곧
// 대사라 그 턴에 반드시 발화된다"* 를 **실제로 참으로 만드는** 조각 — 그 근거는 실 LLM 전제
// 위에서만 참이었다, G347).
//
// ⚠️ 전수 확인(§54.9 (4) 4): 폴백 턴 지시 4종 중 **부작용 기록을 남기는 것은 2종**이다 —
// `verify_announce`(`announcedAt` + `offerAnchorScammerTurn`)와 `install_consent`
// (`consentAnnouncedAt`). `sms_announce`·`verify_reconnect`는 마킹이 없어 무해하다.
// 마크하지 않으면 다음 턴에 같은 분기가 다시 잡혀 예고가 재시도된다(중복이 아니라 **재시도**다).

/**
 * 이번 턴의 `turnInstruction`이 **실제로 발화됐다고 볼 수 있는가**.
 *
 * Mock 강등 응답(`isMock: true`)은 시스템 프롬프트를 읽지 않으므로 발화되지 않았다.
 * ⛔ 이 판정을 `isMock`이 아닌 다른 신호(강등 고지·프로바이더 이름 등)로 바꾸지 말 것 —
 * 대사 출처는 **턴 단위**로 갈리고(§54.6 (3) — 한 세션 안에서 실 LLM 턴과 Mock 턴이 섞인다)
 * 세션 단위 sticky 값은 이 질문에 답하지 못한다.
 */
export function wasTurnInstructionSpoken(completion: { readonly isMock: boolean }): boolean {
  return completion.isMock !== true;
}
