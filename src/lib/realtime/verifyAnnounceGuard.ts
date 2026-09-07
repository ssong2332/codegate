// §59 커밋 D 리뷰 REJECTED(Critical) 수정 — 확인 오퍼(offer_verification_desk) announce 요청의
// 클라이언트측 상호배제(mutex).
//
// ⚠️ 왜 신설했는가 — `result.status === "announced"` 응답값 검사만으로는 이중 발동을 못 막는다.
// `resolveVerifyOfferPlan`(`functions/src/verifyIntercept/buildDoc.ts:90-98`)의 announce 단계는
// **문서를 쓰지 않는다(`persist:false`)**(§38.4 후보 E) — `placed===false`인 한 몇 번을 불러도
// **무조건** `includeInstruction:true`를 돌려준다. SMS 쪽(`deliverInCallSms`)의 `.create()`
// 원자적 존재 검사 같은 서버측 상태가 announce에는 애초에 없다 — 서버가 멱등하지 않다는 뜻이다.
// 그래서 "요청을 보내고 응답을 본다"가 아니라 "요청을 **보내기 전에** 막는다"로 방어선을 옮긴다.
//
// 두 호출부가 **같은 상태 객체**를 공유해야 서로를 볼 수 있다:
//   - `session/play/page.tsx`의 백스톱(지연 발동) 이펙트 — `stage==="announce" && callMode==="realtime"`.
//   - `GeminiVoiceSession.tsx`의 `dispatchToolCall`(`offer_verification_desk` 분기, 모델이 직접
//     도구를 부른 경로).
// 부모(`page.tsx`)가 상태를 소유하고, 자식(`GeminiVoiceSession`)에는 claim/release 콜백 프롭으로
// 내려준다(이 저장소에 `RefObject`를 prop으로 직접 넘기는 전례가 없어, 기존 handlersRef 콜백
// 패턴을 그대로 따른다).
export type AnnounceSlotState = { inFlight: boolean };

/**
 * 요청을 **보내기 직전(동기)**에 부른다. 이미 다른 쪽이 요청 중이면 `false`를 돌려주고, 호출자는
 * 서버를 부르지 말고 그 자리에서 되돌아가야 한다. 아니면 즉시 `inFlight`를 세우고 `true`를
 * 돌려준다. check-and-set이 하나의 동기 실행 구간 안에서 끝나므로(두 호출부 모두 await 이전에
 * 이 함수를 부른다) JS의 단일 스레드 특성만으로 원자적이다 — 별도 락이 필요 없다.
 */
export function claimAnnounceSlot(state: AnnounceSlotState): boolean {
  if (state.inFlight) return false;
  state.inFlight = true;
  return true;
}

/**
 * 요청이 끝나면(성공·실패 무관) 슬롯을 되돌린다 — 그래야 이후 재시도(예: 실패 후
 * `rollbackVerifyOfferPhase`가 `idle`로 되돌린 뒤의 다음 사기범 턴 경계 재시도)가 막히지 않는다.
 */
export function releaseAnnounceSlot(state: AnnounceSlotState): void {
  state.inFlight = false;
}
