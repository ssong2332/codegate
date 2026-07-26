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
  /** **표시 텍스트 전용** 모의 번호. 링크·복사·재발신 컨트롤로 렌더하지 않는다(P-24). */
  displayNumber: string;
  /** 존재 = 참가자가 이미 확인 전화를 걸었다(재연결 완료 상태). */
  placedAtMs?: number;
  /** 재연결 후 통화 셸에 표시할 발신자 라벨(모의값). */
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

/**
 * 모의 번호를 스크린리더가 **한 자씩** 읽도록 띄어 쓴다(UX-031 Accessibility — "모의 번호 1 5 0 0,
 * 0 0 0 0"). 붙여 쓰면 "천오백..."처럼 수사로 읽혀 실제 번호로 오인될 수 있다(P-17/UX-027 인증번호
 * 관례 계승). 하이픈은 쉼표로 바꿔 자연스러운 쉼을 만든다.
 */
export function spellOutDisplayNumber(displayNumber: string): string {
  return displayNumber
    .split("")
    .map((char) => (char === "-" ? "," : char))
    .join(" ")
    .replace(/\s+,/g, ",");
}
