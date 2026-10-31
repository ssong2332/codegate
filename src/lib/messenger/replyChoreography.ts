// 실기 신고(2026-10-21 · 갤럭시 S25 · 라이브 f5af50a) — 메신저 대화방의 "보냄 → 읽음 → 입력 중 → 답장" 순서(UX D-137 ·
// docs/Architecture.md §94). 화면 파생만 한다 — 저장 0 · 서버 계약 변경 0 · 안전 판정 0.
//
// 신고 원문 요지: "내가 보낸 메시지에 안 읽음 1이 있는데 상대는 입력 중 표시가 떠 있다" · "보내는데도 지연이 있다".
// 원인: 화면이 ① 서버 왕복이 끝나야 내 말풍선을 그렸고(서버가 쓴 문서가 구독으로 올 때) ② 전송 순간부터 입력 중 점을 띄웠다.
//
// 순서 판정표(시각 t = 전송 시각 기준 경과) — 화면은 이 함수의 결과만 그린다.
// ⭐ 실기 신고 2(2026-10-21 · 라이브 eacf9af · UX D-138 · §95): *"입력 중 표시가 상당히 짧다 · 1이 사라지고 입력 중이 나오는 걸
// 앞당겨 달라 · ai가 읽고 판단하고 입력하는 것과 별개처럼 작동한다"* ⇒ 읽음 · 입력 중 시작은 **서버 응답과 무관한 고정 시각**이고,
// 서버 응답(답을 안 시각)은 **입력 중이 끝나는 시각만** 늦출 수 있다.
// | 조건 | 단계 | 내 말풍선 "1" | 입력 중 점 | 상대 답장 |
// |---|---|---|---|---|
// | t < readAt | unread | 있음 | 없음 | 숨김 |
// | readAt ≤ t < typingAt | read | 없음 | 없음 | 숨김 |
// | typingAt ≤ t · 답을 아직 모름 | typing | 없음 | 있음(서버가 늦으면 계속) | 숨김 |
// | typingAt ≤ t < revealAt · 답을 앎 | typing | 없음 | 있음 | 숨김 |
// | revealAt ≤ t | revealed | 없음 | (답장 문서가 아직 안 왔으면 있음) | 보임 |
// | 서버 실패 · 내 메시지 미저장 | unread | 실패 표시("1" 없음) | 없음 | — |
// | 서버 실패 · 내 메시지 저장됨 | read 이하 | 없음 | 없음 | — |
//
// readAt   = 전송 + READ_DELAY_MS                                — 서버를 기다리지 않는다
// typingAt = readAt + READ_TO_TYPING_MS                          — "읽고 판단하는" 짧은 틈
// revealAt = max(typingAt + typingDurationMs(답 길이), 답을 안 시각) — 길이 비례(하한 · 상한) · 서버가 늦으면 입력 중 유지
// 답 길이가 0(답 없이 끝남)이면 revealAt = max(readAt, 답을 안 시각)이고, 그 전에 입력 중이 시작됐을 때만 점이 보인다.
// 턴당 상대 문서는 1건이다(서버 계약 — `functions/src/roleplay/index.ts`) ⇒ "메시지 사이 입력 중"은 해당 없음(§95.3).

export const READ_DELAY_MS = 900;
export const READ_TO_TYPING_MS = 600;
export const TYPING_MIN_MS = 1800;
export const TYPING_MAX_MS = 6500;
/** 휴대폰 한글 입력 근사(분당 약 700타 ≈ 글자당 85ms). 실제 사람보다 빠르다 — 훈련 대기 시간과의 절충. */
export const TYPING_MS_PER_CHAR = 85;
/** 공개 시각이 지났는데 답장 문서가 구독으로 오지 않을 때, 종료 · 통화 전환을 더 미루지 않는 여유(구독 끊김 대비). */
export const REVEAL_DOC_GRACE_MS = 3000;

export type ReplyPhase = "unread" | "read" | "typing" | "revealed";

export type PendingTurn = {
  /** 낙관적 말풍선 key. */
  localId: string;
  text: string;
  sentAtMs: number;
  /** 보낼 때 화면이 알던 가장 큰 turnIndex(없으면 -1). 이보다 큰 문서가 이번 턴의 것이다. */
  baseTurnIndex: number;
  /** 상대 답을 처음 안 시각(답장 문서 도착 또는 서버 응답 중 이른 쪽). */
  replyKnownAtMs?: number;
  /** 답 글자 수(0 = 답 없음). */
  replyLength?: number;
  /** 서버 호출이 끝났다(성공). */
  serverDone?: boolean;
  /** 서버 호출이 실패했다. 내 메시지 문서가 구독에 없으면 실패 말풍선(다시 보내기 · 삭제)으로 그린다. */
  failed?: boolean;
  /** §113.2 — 사진 턴이면 이 화면 메모리의 objectURL(낙관적 말풍선 · 다시 보내기). 연출 판정에는 쓰지 않는다. */
  photoUrl?: string;
  /** D-e — 사진 턴 종류(`"transfer-receipt"` = 앱이 만든 이체 완료 화면 캡처). 연출 판정에는 쓰지 않는다. */
  photoKind?: "transfer-receipt";
  /** 공개가 끝난 뒤 적용할 결과 — 답장이 보인 다음에 종료 · 통화 전환으로 넘어간다. */
  // §104.9 — `scammerEnded` = 서버 `endReason: "scammer_ended"`(사기범이 메신저 단계를 끝냈다 · 종료 문구 E-1/E-2).
  outcome?: { ended?: boolean; escalate?: boolean; scammerEnded?: boolean };
};

export type ReplyTimeline = { readAt: number; typingAt: number; revealAt: number };

export function typingDurationMs(replyLength: number): number {
  if (replyLength <= 0) return 0;
  return Math.max(TYPING_MIN_MS, Math.min(TYPING_MAX_MS, replyLength * TYPING_MS_PER_CHAR));
}

/** revealAt은 답을 모르면 무한대(입력 중 유지). 서버 실패는 `viewReply`가 따로 다룬다. */
export function replyTimeline(p: PendingTurn): ReplyTimeline {
  const readAt = p.sentAtMs + READ_DELAY_MS;
  const typingStart = readAt + READ_TO_TYPING_MS;
  if (p.replyKnownAtMs === undefined) return { readAt, typingAt: typingStart, revealAt: Number.POSITIVE_INFINITY };
  const length = p.replyLength ?? 0;
  if (length <= 0) {
    const revealAt = Math.max(readAt, p.replyKnownAtMs);
    return { readAt, typingAt: Math.min(typingStart, revealAt), revealAt };
  }
  return { readAt, typingAt: typingStart, revealAt: Math.max(typingStart + typingDurationMs(length), p.replyKnownAtMs) };
}

export function replyPhaseAt(p: PendingTurn, nowMs: number): ReplyPhase {
  const t = replyTimeline(p);
  if (nowMs < t.readAt) return "unread";
  if (nowMs < t.typingAt) return "read";
  if (nowMs < t.revealAt) return "typing";
  return "revealed";
}

/** 서버가 실패했고 답도 모른다 — 연출을 멈춘다(늦게라도 답장 문서가 오면 `noteSnapshot`이 풀어 준다). */
function stalledByFailure(p: PendingTurn): boolean {
  return p.failed === true && p.replyKnownAtMs === undefined;
}

/** 다음으로 단계가 바뀌는 시각(타이머용). 더 바뀔 것이 없으면 null. */
export function nextChangeAt(p: PendingTurn, nowMs: number): number | null {
  if (stalledByFailure(p)) return null;
  const t = replyTimeline(p);
  for (const at of [t.readAt, t.typingAt, t.revealAt, t.revealAt + REVEAL_DOC_GRACE_MS]) if (Number.isFinite(at) && at > nowMs) return at;
  return null;
}

type TurnDoc = { role: "scammer" | "user"; turnIndex: number; text: string };

/** 이번 턴의 내 메시지가 서버에 저장돼 구독으로 왔는가. */
export function persistedUserMessage<M extends TurnDoc>(messages: readonly M[], p: PendingTurn): M | undefined {
  return messages.find((m) => m.role === "user" && m.turnIndex > p.baseTurnIndex);
}

/** 이번 턴의 상대 답장(첫 문서). */
export function replyMessage<M extends TurnDoc>(messages: readonly M[], p: PendingTurn): M | undefined {
  return messages.find((m) => m.role === "scammer" && m.turnIndex > p.baseTurnIndex);
}

/** 구독 갱신 — 답장 문서가 처음 보이면 "답을 안 시각"을 적는다(서버 응답보다 먼저 올 수 있다). */
export function noteSnapshot<M extends TurnDoc>(p: PendingTurn, messages: readonly M[], nowMs: number): PendingTurn {
  if (p.replyKnownAtMs !== undefined) return p;
  const reply = replyMessage(messages, p);
  return reply ? { ...p, replyKnownAtMs: nowMs, replyLength: reply.text.length } : p;
}

/** 서버 응답 성공 — 답장 문서가 아직 안 왔으면 응답의 답 글자 수로 시각을 정한다. */
export function noteServerDone(
  p: PendingTurn,
  replyText: string | undefined,
  outcome: PendingTurn["outcome"],
  nowMs: number,
): PendingTurn {
  const known = p.replyKnownAtMs !== undefined ? {} : { replyKnownAtMs: nowMs, replyLength: replyText?.length ?? 0 };
  return { ...p, ...known, serverDone: true, outcome };
}

export type ReplyView = {
  phase: ReplyPhase;
  /** 상대가 읽었다(내 메시지의 "1"을 지운다). */
  peerHasRead: boolean;
  /** 입력 중 점을 그린다. */
  showTyping: boolean;
  /** 이번 턴의 상대 문서(turnIndex > base)를 숨긴다. */
  hideReply: boolean;
  /** 낙관적 말풍선을 그린다(서버 문서가 아직 안 왔다). */
  showOptimistic: boolean;
  /** 서버 호출이 진행 중이다(새 전송을 막는다 — 서버는 한 번에 한 턴만 처리한다). */
  inFlight: boolean;
  /** 답장이 보였고 결과(종료 · 통화 전환)를 적용해도 된다. */
  settled: boolean;
};

export function viewReply<M extends TurnDoc>(p: PendingTurn | null, messages: readonly M[], nowMs: number): ReplyView {
  if (!p) {
    return { phase: "revealed", peerHasRead: false, showTyping: false, hideReply: false, showOptimistic: false, inFlight: false, settled: true };
  }
  const persisted = persistedUserMessage(messages, p) !== undefined;
  const timedPhase = replyPhaseAt(p, nowMs);
  // 실패 — 미저장이면 "1" 대신 실패 표시(unread), 저장됐으면 읽음까지만(입력 중 없음).
  const phase: ReplyPhase = !stalledByFailure(p)
    ? timedPhase
    : !persisted || timedPhase === "unread"
      ? "unread"
      : "read";
  const replyExpected = (p.replyLength ?? 0) > 0;
  const docPresent = replyMessage(messages, p) !== undefined;
  const t = replyTimeline(p);
  const awaitingDoc = phase === "revealed" && replyExpected && !docPresent;
  const graceOver = nowMs >= t.revealAt + REVEAL_DOC_GRACE_MS;
  return {
    phase,
    peerHasRead: phase !== "unread",
    showTyping: phase === "typing" || (awaitingDoc && !graceOver),
    hideReply: phase !== "revealed",
    showOptimistic: !persisted,
    inFlight: !p.serverDone && !p.failed,
    settled: p.serverDone === true && phase === "revealed" && (!awaitingDoc || graceOver),
  };
}
