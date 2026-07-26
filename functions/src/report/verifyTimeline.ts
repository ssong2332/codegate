// 확인 시도 무력화 → 리포트 표시 전용 스냅샷 + **기존 순간 주석** (T83, Architecture.md §16.3,
// ADR-0009, D-51 판정표, AC-071).
//
// 부수효과 없는 순수 함수다(analyzeConversation.ts·smsTimeline.ts와 동일 관례) — Firestore 접근은
// 호출부(generateReportCore.ts)가 하고 여기서는 값 변환만 한다.
//
// ⚠️ 이 모듈이 **하지 않는 것**(리뷰 체크포인트 — 위반 시 연쇄 파손, §16.3.3 금지 표):
//   - `deceivedMoments`에 **항목을 추가·삭제**하기 (같은 응낙이 두 번 계상돼 아카이브 항목 수
//     [AC-068]·방어등급[AC-010/011]이 부풀고, `getAnnotatedTurnIndexes`↔`deceivedMoments` 1:1
//     전제가 깨져 되감기가 엉뚱한 순간을 연다 — §15.6 G16)
//   - `wasDeceived`·`turnIndex`·`timeLabel` 뒤집기 (AC-062: 속은 순간 0건이면 되감기 진입점 없음)
//   - `analyzeConversation`의 시그니처·짝짓기 루프 수정 (§15.6 G3 재발 금지 — 주석은 **산출 뒤에**
//     도는 순수 함수다)
//   - 가로채기의 **수단·작동 원리** 서술 (AC-005 불변 — 전달되는 것은 결과 상황과 대처뿐)
import type { DeceivedMomentResult } from "./analyzeConversation";
import { resolveAnchor, type SmsTimelineMessage } from "./smsTimeline";
import type { VerifyTimelineEntry, VerifyTimelineEvent, VerifyTimelineOutcome } from "../shared/types";

/** `sessions/{sid}/verifyIntercept/{offerId}` 1건의 순수값 표현(Timestamp → 존재 여부/ms). */
export type VerifyTimelineSource = {
  offerId: string;
  deskLabel: string;
  displayNumber: string;
  offerAnchorScammerTurn?: number;
  offeredAtMs: number;
  /** 존재 = 참가자가 "확인 전화 걸기"를 눌렀다(D-51 ①과 ②/⑤를 가르는 유일한 조건). */
  placedAtMs?: number;
  reconnectAnchorScammerTurn?: number;
};

/**
 * **AC-071이 명문 요구하는 "실제로 유효한 대처"**(§16.4). 서버 소유 상수 1개를 두고
 * ① `verifyTimeline` 이벤트와 ② 주석된 `deceivedMoment.correctAction` **양쪽이 이것을 쓴다**
 * (문구가 두 벌로 갈라지지 않게).
 *
 * ⚠️ **덮어쓰기는 선택이 아니라 안전 요건이다(§16.6 G27, 실측)**: `pickCorrectAction`의 **첫 번째**
 * 규칙이 `/확인|전화/`이고 그 반환값은 *"상대가 확인 전화를 막으려 해도 반드시 알고 있는 번호로
 * 직접 전화해 사실을 확인하세요."* 다(`analyzeConversation.ts`). 확인 무력화 순간에 이 문구가
 * 붙으면 **방금 "확인 전화를 걸었는데 소용없었던" 참가자에게 "확인 전화를 걸라"고 답하는 꼴**이
 * 되어 AC-071의 무력감 방지 요건을 정면으로 훼손한다.
 *
 * 문구 규칙(D-52/P-25): **유효 대처가 먼저·크게**, 구조 설명은 뒤에 짧게, 가로채기의 **수단은
 * 설명하지 않는다**. "소용없다"·"막을 수 없다"·"어차피"·"방법이 없다" 류 무력감 표현을 쓰지
 * 않는다(금지 표현 테스트가 이 상수와 아래 `what` 문구를 함께 훑는다).
 * ⚠️ 112·1332는 **AC-071이 신고처로 명시 요구**한 값이라 여기서는 실번호를 그대로 쓴다 — 실존
 * 번호 금지는 **카탈로그의 `deskLabel`/`displayNumber`에만** 적용되는 규칙이다(§16.1.3).
 *
 * 확정 카피는 ux-design(OQ-A5)이며, 아래는 architect가 §16.4에 고정한 참고값 그대로다.
 */
export const VERIFY_INTERCEPT_CORRECT_ACTION =
  "확인은 지금 통화를 끊고 하세요. ① 다른 기기(가족의 전화 등)로 걸어 확인하기 ② 내가 이미 알고 있는 번호로 직접 걸기 ③ 가까운 창구에서 직접 확인하기 ④ 의심되면 112(경찰)·1332(금융감독원)에 신고하기.";

/** 주석된 순간이 갖는 고정 라벨(§16.3.3 "덮어쓰는 값") — 추정에 맡기지 않는다. */
export const VERIFY_INTERCEPT_TACTIC = "확인 시도 무력화";

/**
 * **판정 앵커**(§16.3.2 — 표시 앵커와 다르다, ±1 추측 금지).
 *
 * `judgmentTurnIndex = scammers[reconnectAnchorScammerTurn]?.turnIndex ?? null` — **재연결 대사
 * 자체의 turnIndex**다. `reconnectAnchorScammerTurn`은 재연결 시점의 "사기범 문서 **수**"이므로,
 * 0-기반 인덱스로 쓰면 정확히 **그 다음에 나올 사기범 대사**(=재연결 대사)를 가리킨다.
 *
 * ⚠️ **왜 표시 앵커로 자르면 안 되는가**: 폴백 경로에서는 참가자가 말을 해야 재연결 대사가 나오므로
 * 재연결 **앞**에 오는 참가자 발화가 존재한다. 표시 앵커로 잘라내면 **재연결 전 순응까지 "확인했는데도
 * 속은 순간"으로 오분류**된다(§16.6 G28).
 *
 * 구현 노트: 리졸버를 복제하지 않으려고 `resolveAnchor(N + 1)`을 쓴다 — 그 리졸버는 1-기반이라
 * `scammers[(N+1)-1] = scammers[N]`으로 **같은 메시지**를 돌려준다. 재연결 대사가 아직 없으면
 * (재연결 직후 통화 종료 등) 미해결로 떨어져 `null`이 되고, 그 경우 **주석은 0건**이다.
 */
export function resolveJudgmentAnchor(
  reconnectAnchorScammerTurn: number | undefined,
  sortedMessages: readonly SmsTimelineMessage[],
  sessionCreatedAtMs: number,
): { judgmentTurnIndex: number | null; reconnectTimeLabel?: string } {
  if (
    reconnectAnchorScammerTurn === undefined ||
    !Number.isFinite(reconnectAnchorScammerTurn) ||
    reconnectAnchorScammerTurn < 0
  ) {
    return { judgmentTurnIndex: null };
  }
  const resolved = resolveAnchor(reconnectAnchorScammerTurn + 1, sortedMessages, sessionCreatedAtMs);
  if (!resolved.anchorResolved) return { judgmentTurnIndex: null };
  return {
    judgmentTurnIndex: resolved.anchorTurnIndex,
    ...(resolved.timeLabel ? { reconnectTimeLabel: resolved.timeLabel } : {}),
  };
}

/**
 * D-51 판정표(§16.3.3) — **위에서 첫 매치**. 참가자가 **실제로 응했을 때만** 속은 순간이다.
 *
 * | D-51 행 | 데이터 조건 | outcome | deceivedMoments 영향 |
 * |---|---|---|---|
 * | ① 권했으나 걸지 않음 | `placedAt` 부재 | offered_not_placed | **없음**(AC-062 보호) |
 * | ⑤ 걸었으나 응하지 않음 | `placedAt` 존재 && 판정 앵커 뒤 순간 0건 | placed_not_complied | **없음** — 리포트는 이를 **"잘 대응한 지점"**으로 다룬다(AC-009/AC-038) |
 * | ② 걸고 응함 | `placedAt` 존재 && 판정 앵커 뒤 순간 ≥1건 | placed_and_complied | 해당 순간(들)에 **주석·덮어쓰기만** |
 */
export function resolveVerifyOutcome(
  placed: boolean,
  momentsAfterReconnect: number,
): VerifyTimelineOutcome {
  if (!placed) return "offered_not_placed";
  return momentsAfterReconnect > 0 ? "placed_and_complied" : "placed_not_complied";
}

/**
 * 이벤트 파생 규칙표(§16.3.4) — **저장 필드 추가 0건**. 문서에 이미 있는 값만 보고 계산한다.
 *
 * | # | 조건(위에서 첫 매치) | event |
 * |---|---|---|
 * | 1 | 문서 존재(항상)                                  | `verify_offer_shown` |
 * | 2 | `placedAt` 존재 && outcome==="placed_and_complied" | `verify_reconnected` |
 * | 3 | `placedAt` 존재(그 외)                            | `verify_reconnected`(응하지 않음) |
 *
 * 2와 3은 상호배타, 1은 항상. `verify_call_opened`·`verify_call_abandoned`는 **저장하지 않는다**
 * (UX-031 Events Emitted는 분석 이벤트 명세이지 저장 요건이 아니다 — §15.1.5 (5)가
 * `sms_overlay_closed`에 내린 것과 같은 판정. "열었다가 닫음"은 `placedAt` 부재와 학습상 구별되지
 * 않는다).
 *
 * ③에도 `correctAction`을 싣는 이유: AC-071은 *"리포트는 반드시 실제로 유효한 대처를 함께
 * 제시한다"* 를 **속았는지와 무관하게** 요구한다(칭찬이 아니라 대처 제시라 AC-009와 충돌하지 않는다).
 * 문구는 Architecture.md §16.3.4의 참고 문구 그대로다(확정 카피는 OQ-A5 — ux-design).
 */
export function deriveVerifyEvents(
  doc: VerifyTimelineSource,
  outcome: VerifyTimelineOutcome,
): VerifyTimelineEvent[] {
  const events: VerifyTimelineEvent[] = [
    {
      event: "verify_offer_shown",
      what: `상대가 '직접 확인해 보시라'며 ${doc.deskLabel}(${doc.displayNumber})로 걸어 보라고 했습니다.`,
    },
  ];
  if (doc.placedAtMs === undefined) return events;
  events.push({
    event: "verify_reconnected",
    what:
      outcome === "placed_and_complied"
        ? "안내받은 번호로 확인 전화를 걸었고, 같은 요구가 '확인해 드렸다'는 형태로 이어졌습니다."
        : "안내받은 번호로 확인 전화를 걸었지만, 요구에 응하지 않았습니다.",
    correctAction: VERIFY_INTERCEPT_CORRECT_ACTION,
  });
  return events;
}

/**
 * 주석이 얹힌 순간 — **`analyzeConversation.ts`는 0줄도 고치지 않는다**(§15.6 G3 재발 금지, ADR-0009
 * 부수결정 4). 주석 필드는 여기서 교차 타입으로만 얹는다.
 */
export type AnnotatedDeceivedMoment = DeceivedMomentResult & { afterVerifyReconnect?: true };

export type ApplyVerifyInterceptResult = {
  /** 표시 전용 스냅샷. 문서가 0건이면 빈 배열(호출부가 필드 자체를 만들지 않는다). */
  verifyTimeline: VerifyTimelineEntry[];
  /** **개수·turnIndex·timeLabel이 입력과 동일한** 순간 배열. 일부 항목에 주석·덮어쓰기만 얹힌다. */
  deceivedMoments: AnnotatedDeceivedMoment[];
  /** 주석된 순간 수(로그·테스트용 — 저장되지 않는다). */
  annotatedCount: number;
};

/**
 * 확인 무력화 반영의 **단일 진입점** — 표시 스냅샷과 순간 주석을 같은 판정으로 함께 만든다
 * (두 곳에서 각자 outcome을 계산하면 화면과 판정이 갈라진다).
 *
 * ⚠️ 문서가 0건이면 `deceivedMoments`를 **입력 그대로** 돌려준다 — 리포트 산출이 이 기능 도입 전과
 * **완전히 동일**해야 한다(§16.3.3 필수 회귀 테스트 ①).
 */
export function applyVerifyIntercept(
  docs: readonly VerifyTimelineSource[],
  deceivedMoments: readonly DeceivedMomentResult[],
  messages: readonly SmsTimelineMessage[],
  sessionCreatedAtMs: number,
): ApplyVerifyInterceptResult {
  if (docs.length === 0) {
    return { verifyTimeline: [], deceivedMoments: [...deceivedMoments], annotatedCount: 0 };
  }
  const sortedMessages = [...messages].sort((a, b) => a.turnIndex - b.turnIndex);

  // 주석 대상 turnIndex 집합 — 문서가 여러 건이어도(스키마상 최대 1건) 합집합으로 다룬다.
  const annotatedTurnIndexes = new Set<number>();
  const entries: VerifyTimelineEntry[] = [];

  for (const doc of docs) {
    const anchor = resolveAnchor(doc.offerAnchorScammerTurn, sortedMessages, sessionCreatedAtMs);
    const placed = doc.placedAtMs !== undefined;
    const { judgmentTurnIndex, reconnectTimeLabel } = placed
      ? resolveJudgmentAnchor(doc.reconnectAnchorScammerTurn, sortedMessages, sessionCreatedAtMs)
      : { judgmentTurnIndex: null, reconnectTimeLabel: undefined };

    const momentsAfter =
      judgmentTurnIndex === null
        ? []
        : deceivedMoments.filter((moment) => moment.turnIndex > judgmentTurnIndex);
    for (const moment of momentsAfter) annotatedTurnIndexes.add(moment.turnIndex);

    const outcome = resolveVerifyOutcome(placed, momentsAfter.length);
    entries.push({
      offerId: doc.offerId,
      deskLabel: doc.deskLabel,
      displayNumber: doc.displayNumber,
      anchorTurnIndex: anchor.anchorTurnIndex,
      anchorResolved: anchor.anchorResolved,
      ...(anchor.timeLabel ? { timeLabel: anchor.timeLabel } : {}),
      ...(reconnectTimeLabel ? { reconnectTimeLabel } : {}),
      outcome,
      events: deriveVerifyEvents(doc, outcome),
    });
  }

  // ⚠️ **주석은 map이다 — filter도 push도 아니다.** 배열 길이·순서·turnIndex·timeLabel·
  // wasDeceived가 구조적으로 불변이어야 AC-062/AC-007/AC-010/011/AC-068이 함께 보호된다.
  const annotated = deceivedMoments.map((moment) =>
    annotatedTurnIndexes.has(moment.turnIndex)
      ? {
          ...moment,
          tactic: VERIFY_INTERCEPT_TACTIC,
          // 카탈로그가 만든 상황이라 수법을 **이미 알고 있으므로** 추정(findMatchedTactic)에
          // 맡기지 않는다 — 실시간 경로의 자유 생성 대사는 매칭이 보장되지 않아 "약화된 사기
          // 수법"/other로 떨어진다(§16.3.3).
          tacticCategory: "verification_block" as const,
          correctAction: VERIFY_INTERCEPT_CORRECT_ACTION,
          afterVerifyReconnect: true as const,
        }
      : moment,
  );

  return {
    verifyTimeline: entries.sort(
      (a, b) => a.anchorTurnIndex - b.anchorTurnIndex || a.offerId.localeCompare(b.offerId),
    ),
    deceivedMoments: annotated,
    annotatedCount: annotatedTurnIndexes.size,
  };
}
