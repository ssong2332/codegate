// §59.10 커밋 D — 천장(백스톱) 순수 판정. docs/Architecture.md §59.8·§59.9(R6) · G388·G390.
// ⭐ T191 — `shouldFireBackstop`은 이제 확인 오퍼 백스톱 전용이다. 문자 백스톱은 파일 끝 `shouldRequestSmsBackstop`.
//
// ⛔ 이 모듈은 `src/lib/verifyintercept/verifyIntercept.ts`에 얹지 않는다(architect 지시 —
// 그 파일은 이미 4개 축이 들어 있다, §59.8). 여기는 Live 도구(모델 주도 발동)의 **상한**만 다룬다.
// 하한(바닥, `afterScammerTurns`/`availableAfterScammerTurns`)은 §59.7이 이미 §59.10 커밋 B로
// 서버에 재검증을 넣었고 값 자체는 이 모듈에서 손대지 않는다(무변경).
//
// ⚠️ `INSTRUCTION_DRAIN_MAX_SUPPRESSED_BOUNDARIES`/`INSTRUCTION_DRAIN_BACKSTOP_SEC`
// (`src/lib/verifyintercept/verifyIntercept.ts`)와 **같은 형식의 판단값**이다 — 측정이 아니다.
// 근거는 `docs/Architecture.md` §59.8 표 그대로다.

/**
 * ⭐ 판단값(§59.8). 하한 도달 이후 완료된 사기범 턴 경계가 이 수에 닿으면(도구 미호출) 백스톱을
 * 연다. 0은 오늘 동작(지연 없음)과 같아 최솟값은 1이고, 한 시나리오 안에서 두 트리거의 최소
 * 간격이 1턴이라 3 이상이면 다음 트리거를 밀어낸다 — 그래서 2로 고정한다.
 */
export const TOOL_WINDOW_MAX_BOUNDARIES = 2;

/**
 * ⭐ 판단값(§59.8). 사기범 턴 경계 자체가 끊기는(모델이 `turnComplete`를 더 내지 않는) 정지를
 * 잡기 위한 별도 안전장치 — `INSTRUCTION_DRAIN_BACKSTOP_SEC`와 정확히 같은 형태다. 이 초는
 * **마지막 사기범 턴 경계**(경계가 아직 없으면 하한 도달 시점)부터 잰다.
 */
export const TOOL_WINDOW_STALL_SEC = 90;

export type ShouldFireBackstopInput = {
  /** `credentials.liveTools`에 이 항목의 도구 이름이 실려 있는가(세션/항목 단위). */
  toolAvailable: boolean;
  /** 하한 도달 이후 완료된 사기범 턴 경계 수(0 = 하한에 막 도달한 경계 그 자체). */
  boundariesSinceDue: number;
  /** 마지막 사기범 턴 경계(없으면 하한 도달) 이후 경과 초. */
  secondsSinceLastBoundary: number;
  /** 이 항목에 대해 모델의 도구 호출 경로가 실패했는가(G390 — 콜러블이 아예 닿지 못함 포함). */
  toolCallFailed: boolean;
};

/**
 * §59.8 판정 함수(순수·결정론적). ⛔ **이 순서 그대로 평가한다**(architect 원문 그대로 — 규칙마다
 * 독립적으로 `true`를 낼 수 있고 먼저 걸리는 규칙이 우선한다는 뜻은 아니지만, 구현이 원문 순서를
 * 그대로 따르는지 회귀 테스트가 이 순서 자체를 스캔으로도 고정한다).
 *
 * 1. `toolAvailable === false` ⇒ `true` — **회귀 0의 유일한 레버**(G388). 도구가 없는 세션/항목은
 *    지연 없이 오늘과 바이트 단위로 같은 타이밍으로 떨어진다.
 * 2. `toolCallFailed === true` ⇒ `true`(G390) — 창을 즉시 닫는다.
 * 3. `boundariesSinceDue >= TOOL_WINDOW_MAX_BOUNDARIES` ⇒ `true`.
 * 4. `secondsSinceLastBoundary >= TOOL_WINDOW_STALL_SEC` ⇒ `true`.
 * 5. 그 외 ⇒ `false`(아직 모델에게 시점을 넘긴 창 안이다 — 기다린다).
 */
export function shouldFireBackstop(input: ShouldFireBackstopInput): boolean {
  if (!input.toolAvailable) return true;
  if (input.toolCallFailed) return true;
  if (input.boundariesSinceDue >= TOOL_WINDOW_MAX_BOUNDARIES) return true;
  if (input.secondsSinceLastBoundary >= TOOL_WINDOW_STALL_SEC) return true;
  return false;
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// ⭐ T191 문자 도달 조건(PRD AC-099 (e) · 설계 "백스톱 — 필수 목적만 강제 · 선택 목적은 건너뛰기")
//
// 문자에는 위 `shouldFireBackstop`(사기범 턴 경계 · 90초)을 **더 이상 쓰지 않는다** — 그 함수는 확인 오퍼
// (`offer_verification_desk`) 백스톱에만 남는다. 문자 백스톱의 계수는 **사용자 발화**이고, 무엇을 · 언제 넛지/발송할지는
// 서버(`functions/src/inCallSms/smsGate.ts` `planSmsBackstop`)가 정한다 — 화면에는 목적 · 시점이 없다(설계 금지 X1).
// 화면이 정하는 것은 "지금 서버에 물어볼까" 하나다(아래 표).
//
// | If | Then |
// |---|---|
// | 이 세션에 문자 선언이 없다(`credentials.inCallSmsBackstop` 부재) | 묻지 않는다 |
// | 서버가 이미 `none_pending`(남은 필수 문자 없음)을 줬다 | 묻지 않는다 |
// | 직전 질의가 아직 진행 중 | 묻지 않는다(다음 사용자 발화에서 최신 값으로 묻는다) |
// | 이 사용자 발화 수로 이미 물었다 | 묻지 않는다(발화 1회당 최대 1회 — 서버 넛지가 "정확히 그 발화"에서만 나가는 근거) |
// | 그 외(새 사용자 발화) | 묻는다 |

export type ShouldRequestSmsBackstopInput = {
  enabled: boolean;
  /** 비어 있지 않은 사용자 전사 flush 수(`countTranscriptFlush`). */
  userTurns: number;
  /** 마지막으로 물은 시점의 `userTurns`(아직 묻지 않았으면 -1). */
  lastRequestedUserTurns: number;
  nonePending: boolean;
  inFlight: boolean;
};

// ── §104(2026-10-22 · 사용자 실기 신고 *"자산 검수 안내 등 문자를 보냈다고 하는데, 실제로는 안 와 있는"*) — 사기범 "보냈다" 주장 ──
// 원인: 모델이 도구를 안 부르거나(또는 거절된 뒤) "문자로 보내 드린 …"이라고 말해도, 백스톱은 게이트가 열린 뒤 넛지 → 발송까지 사용자 발화를
// 더 기다렸다(`planSmsBackstop` — 개방 + 4발화). 통화가 그 전에 끝나면 문자는 끝내 오지 않는다. ⇒ 사기범 전사가 문자를 보냈다고 말하면 화면이
// 그 사실(불리언 1개)을 다음 백스톱 질의에 싣고, 서버는 게이트가 열린 순간 바로 보낸다(하한은 그대로 — 일찍 열지는 않는다).
// ⚠️ 표기를 본다(의미 아님). 오탐 비용 = 이미 열린 게이트의 필수 문자가 몇 발화 일찍 오는 것뿐이다(없는 문자를 만들지 않는다).
export const SMS_SENT_CLAIM =
  /문자(?:로)?\s*(?:를\s*)?(?:보내\s*드렸|보내드렸|보냈|보내\s*드린|보내드린|보낸|발송(?:해\s*드렸|했|됐|한|된))|(?:보내\s*드린|보내드린|보낸|발송한|발송된)\s*(?:문자|링크|안내|주소)/;
export function scammerClaimsSmsSent(scammerText: string): boolean {
  return SMS_SENT_CLAIM.test(scammerText);
}

export function shouldRequestSmsBackstop(input: ShouldRequestSmsBackstopInput): boolean {
  if (!input.enabled) return false;
  if (input.nonePending) return false;
  if (input.inFlight) return false;
  return input.userTurns > input.lastRequestedUserTurns;
}
