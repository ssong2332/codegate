// 확인 시도 무력화(UX-031/UF-011) 클라 순수 로직 (T83, AC-071/AC-019/AC-006).
//
// 브라우저 API·React에 의존하지 않는 부분만 여기 모아 단위 테스트로 고정한다 — 화면 쪽(page.tsx·
// VerifyCallOverlay.tsx)은 이 함수들의 결과를 그리기만 한다(`src/lib/incallsms/`와 동일 관례).
//
// ⚠️ 이 파일은 **트리거·순서(언제)만** 다룬다. 창구명·번호 같은 **내용은 어디에도 없다** — 100%
// 서버 카탈로그가 원천이며 Firestore 구독으로만 화면에 들어온다(AC-033/AC-005).
// ⚠️ 실 발신 경로(`tel:`·다이얼·외부 이동)에 해당하는 함수가 이 파일에 **존재하지 않는다**(AC-019).

/** Firestore `sessions/{sid}/verifyIntercept/{offerId}` 문서의 클라 표현(읽기 전용). */
export type VerifyInterceptView = {
  offerId: string;
  deskLabel: string;
  /** 존재 = 참가자가 이미 확인 부서 연결을 요청했다(호 전환 완료 상태). */
  placedAtMs?: number;
  /**
   * ⭐ **§38.4 후보 C — 폴백 경로에서 "사기범이 예고를 실제로 말했다"의 유일한 관측점.**
   * 서버(`roleplay/index.ts`)가 **예고 지시를 이번 턴 프롬프트에 실은 그 자리에서** 마크한다.
   * 폴백은 *"응답이 곧 대사"* 라 그 턴에 반드시 발화된다 ⇒ 관측 강도가 실시간보다 오히려 높다.
   *
   * ⛔ **읽기 전용이다(G188).** 뜻을 바꾸거나 **실시간 경로에 같은 이름을 찍지 말 것** — §25.6이
   * 이미 기각했고 그 근거(의미 오버로드)는 지금도 유효하다. 실시간은 **문서 존재 자체**를
   * 판별자로 쓴다(후보 E) — 신규 필드 0건.
   */
  announcedAtMs?: number;
  /**
   * 호 전환 후 통화 셸에 표시할 발신자 라벨(모의값).
   *
   * ⚠️ **T110(§22.1 C8)** — 이것이 원 화자 퇴장의 **유일한 시각적 보증**이다. 모델이 흔들려도
   * 화면은 흔들리지 않는다. `play/page.tsx`의 우선순위(`reconnectedCallerLabel ?? callerLabel ??
   * "발신번호 표시제한"`)를 통화 필/상단 고정 필도 그대로 계승해야 한다(**G87**, T103 인계).
   */
  reconnectedCallerLabel?: string;
};

/**
 * 지금 확인 권유를 도착시켜야 하는가(결정론적).
 *
 * 규칙: "게이트가 내려왔고(=자격 있음), 완료된 사기범 턴이 게이트 이상이며, 아직 요청하지 않았다".
 * 게이트가 없으면(`trigger === undefined`) **항상 false** — 컨트롤이 존재하지 않는 세션이다
 * (카탈로그 없음 / 고급 아님 / 난이도 미반영 경로 — 서버가 필드를 붙이지 않는다, §16.1.5).
 */
export function shouldOfferVerify(input: {
  trigger?: { availableAfterScammerTurns: number };
  scammerTurns: number;
  alreadyRequested: boolean;
}): boolean {
  if (!input.trigger || input.alreadyRequested) return false;
  return input.scammerTurns >= input.trigger.availableAfterScammerTurns;
}

// ══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ §38 런타임 층 — **컨트롤은 예고보다 먼저 열리지 않는다**(후보 E + C)
//
// 사용자 신고: *"내가 보안확인창구로 넘긴다고 한 적이 없는데, 연결한다고 혼자서 하면서 사용자가
// 부자연스럽게 느낄 거 같아."* 런타임 쪽 원인은 **컨트롤 가시성의 유일한 조건이 오퍼 문서의
// 존재**였다는 것이다 — 그 문서는 예고가 큐에 들어가기도 전에 쓰였다(§38.1 (3)).
//
// ⛔ **이 게이트가 보증하지 않는 것(§38.11 (c) — 보고 문구가 여기서 갈린다)**:
//   말할 수 있는 최대치는 ***"예고 지시가 들어간 뒤 사기범 턴이 한 번 끝나기 전에는 컨트롤이
//   열리지 않는다"*** 다. ⛔ ***"이제 반드시 말한 뒤 전환된다"* 로 쓰지 말 것** — 실시간 경로가
//   관측하는 것은 **턴 완료**이지 **대사 내용**이 아니다(Gemini Live가 오디오 전용이라 서버가
//   사기범 텍스트를 쥐는 지점이 없다).
//
// ⛔ **게이트 값(`availableAfterScammerTurns` 계열 4 · 전용 2)을 내려 이 지연을 상쇄하지 말 것** —
// 사용자가 명시적으로 기각했다(§38.13 (2)). 실효 노출 시점이 5턴(계열)/3턴(전용)으로 밀리는 것은
// **알고 받아들인 결정**이며, 짧은 세션에서 컨트롤이 뜨지 않고 끝나는 회차가 생기는 것도 마찬가지다.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 지금 확인 컨트롤을 노출해도 되는가(결정론적).
 *
 * | callMode | 조건 | 후보 | 왜 그 값인가 |
 * |---|---|---|---|
 * | `realtime` | **문서 존재**(+ 미전환) | **E** | 문서는 예고 턴이 **끝난 뒤**(`commit`)에만 만들어진다 |
 * | `fallback` | 문서 존재 **+ `announcedAtMs`**(+ 미전환) | **C** | 폴백은 문서가 곧 announce 트리거라 존재만으로는 부족하다 |
 *
 * ⭐ **왜 클라 ref가 아니라 문서인가(G184 — 이것이 후보 D를 단독 기각한 판별자다)**: `verifyOffer`가
 * 문서 구독인 이유가 *"새로고침·재마운트 후에도 상태가 유지되게"* 다(§16.2). ref 단독이면 기본값이
 * hidden일 때 **새로고침 후 기능이 영구 소실**되고, shown일 때 **구멍이 그대로** 남는다.
 * ⇒ 이 함수의 입력에는 **ref·타이머·렌더 상태가 하나도 없다.**
 */
export function shouldRevealVerifyOffer(input: {
  callMode: "realtime" | "fallback";
  offer: Pick<VerifyInterceptView, "placedAtMs" | "announcedAtMs"> | null;
}): boolean {
  if (!input.offer) return false;
  // 전환이 끝나면 컨트롤은 사라진다(세션당 한 번 — §16.1.3, 종전 규칙 그대로).
  if (input.offer.placedAtMs !== undefined) return false;
  if (input.callMode === "fallback") return input.offer.announcedAtMs !== undefined;
  return true;
}

/**
 * ⭐ **§38.4 E / G187 — 오퍼 요청의 단계 상태.** ⛔ **boolean(`requestedVerifyRef`)으로 되돌리지 말 것.**
 *
 * 요청이 2단계가 되면 *"1단계 성공 · 2단계 실패"* 라는 상태가 처음으로 존재하는데, boolean 하나로는
 * 그것을 *"이미 요청했다(=다시 하지 않는다)"* 로밖에 표현할 수 없다 ⇒ **오퍼가 영영 안 뜬다**
 * (T118 R-2가 막으려던 바로 그 실패 방향).
 */
export type VerifyOfferPhase = "idle" | "announced" | "committed";

/**
 * 다음에 보낼 요청 단계(없으면 `null` = 지금은 보내지 않는다).
 *
 * | 상태 | 예고 턴이 끝났는가 | 다음 단계 |
 * |---|---|---|
 * | `idle` | — | `announce` (게이트 판정은 `shouldOfferVerify`가 따로 한다) |
 * | `announced` | ❌ | `null` — **기다린다**(이 대기가 곧 순서 교정이다) |
 * | `announced` | ✅ | `commit` |
 * | `committed` | — | `null` |
 */
export function nextVerifyOfferStage(input: {
  phase: VerifyOfferPhase;
  announceTurnComplete: boolean;
}): "announce" | "commit" | null {
  if (input.phase === "idle") return "announce";
  if (input.phase === "committed") return null;
  return input.announceTurnComplete ? "commit" : null;
}

/**
 * 요청 실패 시 되돌릴 상태(§25.5 (4) R-2를 **단계별로** 확장한다).
 *
 * ⛔ **2단계 실패에서 `idle`로 되돌리지 말 것** — 예고는 이미 발화됐으므로 다시 `announce`를 보내면
 * **같은 권유가 두 번 나간다**(중복 주입). `announced`에 남아 다음 턴 경계에서 `commit`만 재시도한다.
 * ⚠️ 재시도 불가 오류(세션 비활성·카탈로그 불일치·소유권)에서는 단계를 **그대로 굳힌다** — 그 세션은
 * 애초에 자격이 없으므로 컨트롤이 뜨지 않는 것이 옳다.
 */
export function rollbackVerifyOfferPhase(input: {
  /** 요청 **직전에 이미 전진시킨** 현재 단계(`announced` 또는 `committed`). */
  currentPhase: VerifyOfferPhase;
  stage: "announce" | "commit";
  retryable: boolean;
}): VerifyOfferPhase {
  if (!input.retryable) return input.currentPhase;
  return input.stage === "announce" ? "idle" : "announced";
}

// ── 실시간 경로의 지시 주입 큐(§16.6 G31 실시간 보강) ────────────────────────────
// ⚠️ **왜 큐가 필요한가(실측)**: `deliverInCallSms`와 `deliverVerifyOffer`/`deliverVerifyReconnect`는
// 각각 독립 콜러블인데, 세 결과가 클라이언트의 **같은 `instructionTurn` prop**
// (`src/lib/realtime/GeminiVoiceSession.tsx`의 `{text, seq}` 단일 슬롯)으로 들어간다. 같은 턴
// 경계에 둘 이상이 due면 **나중 것이 앞것을 덮어써 조용히 유실된다**(prop 교체라 에러도 나지 않는다).
//
// 계약(G31 (1)~(3)):
//   (1) 한 턴 경계에 due가 2건이면 **문자 announce를 먼저** 주입하고 확인 지시는 보류한다.
//   (2) 보류분은 **버리지 않는다** — 다음 사기범 턴 완료 시 이어서 주입한다.
//   (3) `seq`는 단조 증가시킨다(늦게 도착한 앞 순번이 뒤 순번을 덮어쓰지 않게).
export type InstructionPriority = "sms" | "verify";
export type PendingInstruction = { text: string; priority: InstructionPriority };

/** 우선순위 순위값 — 낮을수록 먼저 나간다(문자 announce 우선, G31 고정 규칙). */
const PRIORITY_RANK: Record<InstructionPriority, number> = { sms: 0, verify: 1 };

/**
 * 큐에 넣는다 — **같은 우선순위 안에서는 도착 순서가 보존**되고(안정 삽입), 문자 지시는 대기 중인
 * 확인 지시보다 앞으로 들어간다. 빈 문자열은 넣지 않는다(주입해 봐야 모델이 받을 게 없다).
 */
export function enqueueInstruction(
  queue: readonly PendingInstruction[],
  item: PendingInstruction,
): PendingInstruction[] {
  if (!item.text.trim()) return [...queue];
  const next = [...queue];
  const insertAt = next.findIndex(
    (pending) => PRIORITY_RANK[pending.priority] > PRIORITY_RANK[item.priority],
  );
  if (insertAt < 0) next.push(item);
  else next.splice(insertAt, 0, item);
  return next;
}

/** 큐에서 하나를 꺼낸다(FIFO + 우선순위). 비어 있으면 `item`이 null이다. */
export function takeNextInstruction(queue: readonly PendingInstruction[]): {
  item: PendingInstruction | null;
  rest: PendingInstruction[];
} {
  if (queue.length === 0) return { item: null, rest: [] };
  const [first, ...rest] = queue;
  return { item: first, rest };
}

// ── T118 / 층 A5 — 전환 상태 재확인 1줄의 발동 조건(§25.3 (3)) ──────────────────
//
// ⚠️ **왜 순수 함수인가**: 이 판정은 브라우저 이벤트(턴 경계·전사 콜백) 위에서만 관측되는데, 그
// 자리에 조건을 직접 쓰면 게이트를 전건 통과해도 조건이 틀린 것을 아무도 잡지 못한다(이 저장소가
// 반복해서 데인 양식). 판정을 여기로 내려 단위 테스트로 고정한다.

/** `shouldReinjectTransferState`의 입력 — 세 조건 전부가 필수다(하나라도 빠지면 아래 주석 참조). */
export type TransferStateReinjectInput = {
  /** `deliverVerifyReconnect` 성공 이후인가. 전환 전에는 상태 단언이 **거짓**이다. */
  placed: boolean;
  /** 직전 주입 이후 참가자가 말한 턴 수(관측 지점: `onTranscriptTurn("user", …)`). */
  userTurnsSinceLastInjection: number;
  /** 사기범 발화 1턴이 끝난 경계인가(기존 주입과 같은 경계 — `handleScammerTurnComplete`). */
  atScammerTurnBoundary: boolean;
};

/**
 * 지금 전환 상태 단언을 **다시** 넣어야 하는가(결정론적).
 *
 * ⛔ **`userTurnsSinceLastInjection >= 1`을 빼지 말 것(G99).** 빼면 *"매 사기범 턴마다 재주입"* 이
 * 되는데, 주입 자체가 모델 응답을 유발할 수 있어 **주입 → 발화 → 턴 완료 → 주입**의 자기 구동
 * 루프가 된다 — 참가자가 끼어들 수 없고 **에러가 나지 않아 조용히 망가진다.**
 * ⚠️ 회수 상한은 두지 않는다 — 사용자 발화가 조건이라 자기 구동이 불가능하고, 세션 시간 한도
 * (AC-007)가 이미 상한이다. 근거 없는 임의 상한은 두지 않는다(§25.3 (3)).
 */
export function shouldReinjectTransferState(input: TransferStateReinjectInput): boolean {
  if (!input.placed) return false;
  if (!input.atScammerTurnBoundary) return false;
  return input.userTurnsSinceLastInjection >= 1;
}

// ── T118 / R-2 — 오퍼 전달 실패의 롤백 범위(§25.5 (4)) ────────────────────────────

/**
 * 이 오류로 실패했을 때 **재시도 창을 다시 열어도 되는가**(= `requestedVerifyRef`를 되돌려도 되는가).
 *
 * 되돌리지 않는 셋(`failed-precondition`·`invalid-argument`·`permission-denied`)은 서버가 **같은
 * 입력에 항상 같은 판정**을 내리는 자리라(세션 비활성·카탈로그 불일치·소유권 불일치) 재시도해도
 * 결과가 같고, 그 재시도가 곧 **중복 주입 경로**다.
 * ⛔ 롤백을 통째로 없애지 말 것 — 일시 오류(`unavailable`·`internal`·네트워크)에서 되돌리지 않으면
 * 그 세션에서 확인 무력화가 **영영 뜨지 않는다**(기능 소실 > 중복 주입).
 */
export function shouldRetryVerifyOffer(error: unknown): boolean {
  const raw = (error as { code?: unknown } | null)?.code;
  if (typeof raw !== "string") return true; // 네트워크 실패 등 코드가 없는 실패 — 재시도 가능
  // Firebase 콜러블은 `functions/failed-precondition` 형태로 준다.
  const code = raw.includes("/") ? raw.slice(raw.indexOf("/") + 1) : raw;
  return !["failed-precondition", "invalid-argument", "permission-denied"].includes(code);
}

// ⭐ T110(§22.1 C10) — `spellOutDisplayNumber`는 **삭제**했다. 호 전환 모델에는 번호 카드가 없어
// 호출부가 사라졌고, 쓰는 곳이 없는 export는 죽은 코드다(G77 취지). 스크린리더가 번호를 수사로
// 읽는 위험 자체가 "읽어 줄 번호가 없다"로 소멸했다.
