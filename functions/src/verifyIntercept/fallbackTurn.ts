// 폴백(텍스트) 경로의 **턴 지시 1개 선택** — 순수 함수 (T83, §16.2/§16.6 G31).
//
// ⚠️ **왜 "1개 선택"인가(실측 근거)**: `buildSystemPrompt`의 `turnInstruction`은 **문자열 1개**다
// (`functions/src/roleplay/promptAssembly.ts`). 같은 턴에 두 지시가 due이면 하나가 조용히 유실된다.
// G31이 그 상황에 대해 규칙을 고정했고, 여기서 그 규칙을 **코드로** 옮긴다. 두 지시를 이어 붙이지
// 않는다(조립 순서·길이 모두 위험 — G31 명시).
export type FallbackTurnState = {
  /** 이번 턴에 통화 중 문자가 도착하는가(T68 `findDueInCallSms`). */
  smsDue: boolean;
  /** 확인 오퍼 문서의 현재 상태(문서가 없으면 undefined). */
  verify?: {
    /** `announcedAt` 존재 = 권유 대사를 이미 주입했다(중복 주입 방지). */
    announced: boolean;
    /** `placedAt` 존재 = 참가자가 확인 전화를 걸었다. */
    placed: boolean;
    reconnectAnchorScammerTurn?: number;
  };
  /** 지금까지 `messages`에 존재하는 `role==="scammer"` 문서 수(이번 응답을 만들기 **전**). */
  scammerDocCount: number;
  /**
   * T84(§15.9.3) — 참가자가 모의 설치의 가짜 "권한 허용"에 응했고(`consentedAt` 존재) 아직 사기범이
   * 그 사실을 언급하지 않은(`consentAnnouncedAt` 부재) 항목이 있는가.
   * ⚠️ **이 값이 true라고 채널이 전이되지 않는다**(§15.9.7 G54) — 응낙은 전이 신호가 아니라
   * 다음 턴 프롬프트 1줄 지시일 뿐이다.
   */
  installConsentDue?: boolean;
};

export type FallbackTurnChoice =
  | "verify_reconnect"
  | "sms_announce"
  | "verify_announce"
  | "install_consent"
  | "none";

/**
 * 우선순위(위에서 첫 매치) — **이 순서가 설계다**:
 *
 * | # | 조건 | 선택 | 왜 이 순위인가 |
 * |---|---|---|---|
 * | 1 | `placed && reconnectAnchorScammerTurn === scammerDocCount` | `verify_reconnect` | 재연결 대사는 **이번 턴 하나에만** 자리가 있다 — `reconnectAnchorScammerTurn`은 이미 서버에 기록됐고 리포트의 판정 앵커가 `scammers[그 값]`(=이번 턴에 만들어질 대사)을 가리키기 때문이다(§16.3.2). 미루면 큐가 없어 **영영 유실**된다 |
 * | 2 | `smsDue && !placed` | `sms_announce` | G31의 고정 규칙 그대로 — 문자 announce가 확인 **announce**보다 우선한다. ⭐ **§53.6 (3)/G337** — `placed`(전환 완료) 뒤에는 원 사기범이 이미 없으므로 announce하지 않는다. `findDueInCallSms`는 정확 일치라 이 announce는 다음 턴으로 **이월되지 않는다**(의도된 열화 — 문서 자체는 그대로 도착한다, `inCallSms/buildDoc.ts`의 `resolveInCallSmsPlan`과 같은 판정을 폴백 경로에도 적용한 것) |
 * | 3 | 오퍼 문서가 있고 아직 `announced`가 아님 | `verify_announce` | 2에 밀렸어도 **버리지 않는다**(G31 (2)) — `announcedAt` 부재가 곧 큐라서 다음 턴에 다시 due가 된다 |
 * | 4 | `installConsentDue` | `install_consent` | T84(§15.9.3 G55). **문자 announce가 이긴다** — 문자는 이미 화면에 떠 있어 언급이 없으면 즉시 불일치가 보이지만, 설치 지시는 다음 턴으로 이월돼도 사실이 사라지지 않는다(`consentAnnouncedAt` 미세팅 → 다음 턴 재시도). 현행 콘텐츠에서 `MOCK_SCREENS`는 `IN_CALL_SMS`·`VERIFY_INTERCEPT`와 **scenarioId를 공유하지 않아** 실제로 경합하지 않으며, 그 비공유를 테스트로 고정한다 |
 *
 * ⚠️ **1이 2보다 앞선 것은 implementer 판정이다**(G31이 규율한 것은 "문자 announce ↔ 확인
 * **announce**"이고 재연결 대사는 그 표에 없다). 근거: (a) 확인 announce는 `announcedAt` 부재로
 * 자연 큐잉되지만 재연결은 앵커가 고정돼 **재시도 창이 없다**, (b) 이 충돌에서 문자를 미루면
 * 문자 **문서 자체는 그대로 도착**해 참가자 화면·리포트 타임라인에 남고 사기범이 그 턴에 언급만
 * 안 한다(열화), 반대로 재연결을 미루면 **AC-071 재현 자체가 그 세션에서 무너진다**(파손).
 */
export function pickFallbackTurnInstruction(state: FallbackTurnState): FallbackTurnChoice {
  const verify = state.verify;
  if (
    verify?.placed &&
    verify.reconnectAnchorScammerTurn !== undefined &&
    verify.reconnectAnchorScammerTurn === state.scammerDocCount
  ) {
    return "verify_reconnect";
  }
  // §53.6 (3)/G337 — 전환(placed)이 끝난 뒤에는 원 사기범이 이미 없다. 그 상태에서 문자 announce를
  // 내보내면 "존재하지 않는 화자가 방금 문자를 보냈다"고 말하는 모순이 된다.
  if (state.smsDue && !verify?.placed) return "sms_announce";
  if (verify && !verify.announced) return "verify_announce";
  if (state.installConsentDue === true) return "install_consent";
  return "none";
}
