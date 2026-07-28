// 모의 화면(가짜 랜딩) → 리포트 표시 전용 스냅샷 + **신규 순간 합성** + 3단계 파생
// (T84, Architecture.md §15.9.5, DECISIONS #42, D-51 판정표, AC-072/AC-073).
//
// 부수효과 없는 순수 함수다(analyzeConversation.ts·smsTimeline.ts·verifyTimeline.ts와 동일 관례)
// — Firestore 접근은 호출부(generateReportCore.ts)가 하고 여기서는 값 변환만 한다.
//
// ⚠️ **T83(verifyTimeline.ts)과 합치지 말 것 — 입력이 다르다**(§15.9.9 OQ-A7 정정):
//   - T83은 **기존 순간에 주석**을 얹는다(map, 배열 길이 불변). 확인 무력화의 응낙은 참가자의
//     대화 발화라 `analyzeConversation`이 이미 순간으로 잡았기 때문이다.
//   - T84는 **신규 순간을 합성**한다(push, 배열 길이 증가). 설치 응낙은 UI 클릭이라 대응하는
//     사용자 발화가 아예 없기 때문이다.
//   두 방식이 공유하는 것은 메커니즘이 아니라 **불변식**이다: (1) AC-007 리포트 1건,
//   (2) AC-062 응낙 없으면 승격 없음, (3) `deceivedMoments`가 `turnIndex` 오름차순 유지.
//
// ⚠️ **적용 순서(§15.9.9 확정)**: `analyzeConversation` → **T83 주석**(길이 불변) →
//   **T84 push + 재정렬**(길이 증가). 역순이면 T84의 삽입으로 인덱스가 밀려 T83이 엉뚱한 순간에
//   주석을 단다.
//
// ⚠️ 이 모듈이 **하지 않는 것**:
//   - `analyzeConversation`의 시그니처·입력·짝짓기 루프 수정 (§15.6 G3 재발 금지 — 승격은
//     **산출 뒤에** 도는 후처리다)
//   - `pickCorrectAction`에 `/설치|앱/` 분기 추가 (다른 시나리오의 preventionAdvice까지 바뀐다 —
//     §15.9.5 e-1. `correctAction`은 카탈로그가 저작한 문구를 그대로 쓴다)
//   - 화면이 뜬 것·닫은 것의 승격 (D-51 ③ — **응낙만** 속은 순간이다, AC-062 불변식 보호)
//   - 화면 콘텐츠 원문(headline/bodyLines/consentLabel)을 스냅샷에 싣기 (§15.9.5 e-4)
import type { MockScreenItem, MockScreenKind } from "../scenarios/mockScreens";
import type { DeceivedMomentResult } from "./analyzeConversation";
import { resolveTacticCategory } from "./tacticCategory";
import type { MockScreenTimelineEntry, ReportStage, ReportStageName } from "../shared/types";

/** `sessions/{sid}/mockScreens/{landingId}` 1건의 순수값 표현(Timestamp → 존재 여부/ms). */
export type MockScreenSource = {
  landingId: string;
  kind: MockScreenKind;
  shownAtMs: number;
  /** 존재 = 참가자가 가짜 "권한 허용"에 응했다(D-51 ③과 ④를 가르는 유일한 조건). */
  consentedAtMs?: number;
};

/**
 * 앵커 해결에 필요한 최소 메시지 정보. `SmsTimelineMessage`와 같은 모양에 **attachment의
 * landingId 목록**이 더해진다 — 설치 순간의 앵커는 "N번째 사기범 턴"이 아니라 **그 링크를 실은
 * 사기범 메시지**이므로(§15.9.5 e-2) 리졸버의 입력 자체가 다르다.
 */
export type MockScreenMessage = {
  role: "scammer" | "user";
  turnIndex: number;
  createdAtMs: number;
  /** 이 메시지의 `attachments[].fakeLandingId` 목록(없으면 빈 배열·부재). */
  landingIds?: readonly string[];
};

export type MockScreenAnchor = {
  anchorTurnIndex: number;
  anchorResolved: boolean;
  timeLabel?: string;
};

/**
 * 앵커 해결(§15.9.5 e-2) — `attachments[].fakeLandingId === landingId`인 **가장 이른
 * `role==="scammer"` 메시지**의 `turnIndex`.
 *
 * `timeLabel`은 그 메시지의 경과 초에서 파생한다 — `deceivedMoments`·`smsTimeline`과 **같은
 * 시간축**이라 라벨이 서로 어긋나지 않는다(§15.1.5 (4) 동형).
 *
 * 미해결(링크 메시지를 찾지 못함)이면 `smsTimeline.resolveAnchor` 규칙 3과 같은 형태로
 * "마지막 메시지 뒤 + `anchorResolved:false`"를 돌려준다 — **조용히 버리지 않기 위한 것**이며
 * (P-4), 이 경우 **승격하지 않는다**(아래 `applyMockScreens` — 인덱스 정합 보호, e-2 규칙 3).
 */
export function resolveMockScreenAnchor(
  landingId: string,
  sortedMessages: readonly MockScreenMessage[],
  sessionCreatedAtMs: number,
): MockScreenAnchor {
  const anchorMessage = sortedMessages.find(
    (m) => m.role === "scammer" && (m.landingIds ?? []).includes(landingId),
  );
  if (!anchorMessage) {
    const lastTurnIndex =
      sortedMessages.length > 0 ? sortedMessages[sortedMessages.length - 1].turnIndex : -1;
    return { anchorTurnIndex: lastTurnIndex, anchorResolved: false };
  }
  const elapsedSec = Math.max(0, Math.round((anchorMessage.createdAtMs - sessionCreatedAtMs) / 1000));
  return {
    anchorTurnIndex: anchorMessage.turnIndex,
    anchorResolved: true,
    timeLabel: `${elapsedSec}초 시점`,
  };
}

/**
 * 가짜 랜딩 응낙 1건 → **속은 순간 1건**(T84 설치 응낙 · T123 폼 제출 공용).
 *
 * ⭐ **두 경로가 같은 승격 규칙을 쓰게 하는 단일 지점이다**(§31.6 G137). 표면마다 조립을 복제하면
 * "속은 순간"의 문면 규칙이 조용히 갈라져 **리포트가 같은 행위를 채널마다 다르게 말한다**
 * (§15.6 G7 "패턴 상수를 복제하지 말고 export"와 동일 판단).
 *
 * - `tactic`/`correctAction`은 **서버 카탈로그가 저작한 문자열 그대로**다 — 참가자 입력이 개입하는
 *   자리가 없다(AC-024/AC-026/AC-069). 추정(`findMatchedTactic`)에 맡기지 않는 이유는 카탈로그가
 *   만든 상황이라 수법을 **이미 알고 있고**, 대응하는 사용자 발화가 아예 없어 매칭이 성립하지
 *   않기 때문이다.
 * - `tacticCategory`는 기존 고정 10종을 그대로 통과시킨다 — **신규 카테고리 0건**.
 */
export function buildLandingSubmitMoment(
  // 조립에 실제로 쓰는 두 필드만 받는다 — 경로 A(`smsTimeline.ts`)는 `MockScreenItem` 전체를
  // 넘기지만 이 함수가 그 이상을 보지 않는다는 것이 타입으로 고정된다.
  item: Pick<MockScreenItem, "momentTactic" | "correctAction">,
  anchorTurnIndex: number,
  timeLabel?: string,
): DeceivedMomentResult {
  return {
    turnIndex: anchorTurnIndex,
    timeLabel: timeLabel ?? "",
    tactic: item.momentTactic,
    correctAction: item.correctAction,
    tacticCategory: resolveTacticCategory(item.momentTactic),
  };
}

export type ApplyMockScreensResult = {
  /** 표시 전용 스냅샷. 문서가 0건이면 빈 배열(호출부가 필드 자체를 만들지 않는다). */
  mockScreenTimeline: MockScreenTimelineEntry[];
  /** 승격 항목이 병합되고 **turnIndex 오름차순으로 재정렬된** 순간 배열. */
  deceivedMoments: DeceivedMomentResult[];
  /** 승격된 순간 수(로그·테스트용 — 저장되지 않는다). */
  promotedCount: number;
};

/**
 * D-51 판정표(§15.9.5 e-1)를 **데이터 규칙으로** 옮긴 단일 진입점.
 *
 * | D-51 행 | 데이터 조건 | mockScreenTimeline | deceivedMoments |
 * |---|---|---|---|
 * | ③ 화면이 떴으나 닫음 | `shownAt` only | `consented:false` 항목 1건 | **추가 안 함** |
 * | ④ 가짜 "권한 허용"에 응함 | `shownAt` + `consentedAt` | `consented:true` 항목 1건 | **1건 추가** |
 * | — 링크를 아예 안 누름 | 문서 없음 | 항목 없음 | 추가 안 함 |
 *
 * ⚠️ 문서가 0건이면 `deceivedMoments`를 **입력 그대로** 돌려준다 — 리포트 산출이 이 기능 도입
 * 전과 완전히 동일해야 한다(회귀 0, 테스트로 고정).
 * ⚠️ **앵커 미해결이면 승격하지 않는다**(e-2 규칙 3): 어떤 메시지에도 주석이 붙지 않아
 * `getAnnotatedTurnIndexes`↔`deceivedMoments` 1:1 전제가 깨지고 되감기가 엉뚱한 순간을 연다.
 * 그 경우 표시 전용 항목으로만 남기고 화면이 정직하게 고지한다.
 */
export function applyMockScreens(
  docs: readonly MockScreenSource[],
  deceivedMoments: readonly DeceivedMomentResult[],
  messages: readonly MockScreenMessage[],
  sessionCreatedAtMs: number,
  catalog: readonly MockScreenItem[] = [],
): ApplyMockScreensResult {
  if (docs.length === 0) {
    return { mockScreenTimeline: [], deceivedMoments: [...deceivedMoments], promotedCount: 0 };
  }
  const sortedMessages = [...messages].sort((a, b) => a.turnIndex - b.turnIndex);

  const entries: MockScreenTimelineEntry[] = [];
  const promoted: DeceivedMomentResult[] = [];

  for (const doc of docs) {
    const anchor = resolveMockScreenAnchor(doc.landingId, sortedMessages, sessionCreatedAtMs);
    const item = catalog.find((c) => c.landingId === doc.landingId);
    const consented = doc.consentedAtMs !== undefined && anchor.anchorResolved && item !== undefined;

    entries.push({
      landingId: doc.landingId,
      kind: doc.kind,
      anchorTurnIndex: anchor.anchorTurnIndex,
      anchorResolved: anchor.anchorResolved,
      ...(anchor.timeLabel ? { timeLabel: anchor.timeLabel } : {}),
      consented,
    });

    if (!consented || !item) continue;
    // 조립은 `buildLandingSubmitMoment` **한 곳**이 소유한다(§31.6 G137 — 동작 무변경 추출).
    promoted.push(buildLandingSubmitMoment(item, anchor.anchorTurnIndex, anchor.timeLabel));
  }

  // ⚠️ **push + 재정렬이다 — map이 아니다.** `getAnnotatedTurnIndexes`(리플레이)는 주석이 달린
  // 메시지를 타임라인 순서(=turnIndex 오름차순)로 내므로, 저장되는 배열도 같은 순서여야
  // `indexOf`/되감기 딥링크가 올바른 순간을 연다(§15.9.5 e-2 규칙 2).
  // Array.prototype.sort는 안정 정렬이므로(ES2019+) 같은 turnIndex의 상대 순서는 보존된다.
  const merged = [...deceivedMoments, ...promoted].sort((a, b) => a.turnIndex - b.turnIndex);

  return {
    mockScreenTimeline: entries.sort(
      (a, b) => a.anchorTurnIndex - b.anchorTurnIndex || a.landingId.localeCompare(b.landingId),
    ),
    deceivedMoments: merged,
    promotedCount: promoted.length,
  };
}

/** 단계 도달 판정(§15.9.5 e-3)의 입력 — **전부 기존 값에서 파생**된다(신규 세션 필드 0건). */
export type StageDerivationInput = {
  /** `session.entryChannel`(부재 시 `session.channel` 폴백). */
  entryChannel?: "voice" | "messenger";
  /** 이 시나리오 카탈로그에 `kind==="app-install"` 항목이 1개 이상 있는가. */
  installIntended: boolean;
  /** `sessions/{sid}/mockScreens`에 존재하는 문서의 landingId 집합. */
  reachedLandingIds: readonly string[];
  /** 카탈로그의 `app-install` landingId 목록. */
  installLandingIds: readonly string[];
  /** `PUBLIC_SCENARIOS[scenarioId].escalation`이 존재하는가. */
  voiceIntended: boolean;
  /** `session.channelHistory`에 `{from:"messenger", to:"voice"}` 항목이 1건 이상 있는가. */
  voiceReached: boolean;
};

/**
 * 단계 도달 판정표(§15.9.5 e-3) — **임의 판단 금지**. 전부 파생이며 신규 세션 필드가 0건이다.
 *
 * | 단계 | 의도됐는가 | 도달했는가 |
 * |---|---|---|
 * | `messenger` | `entryChannel === "messenger"` | 의도됐으면 **항상 true**(메신저 세션은 채팅으로 시작한다) |
 * | `mock_install` | 카탈로그에 `app-install` 항목 ≥1 | `mockScreens`에 그 landingId 문서가 **존재** |
 * | `voice` | `PUBLIC_SCENARIOS[sid].escalation` 존재 | `channelHistory`에 messenger→voice 1건 이상 |
 *
 * **미도달 단계도 `{reached:false}`로 싣는다**(OQ-U24 판정) — 데이터에서 빼면 "미도달"과 "그런
 * 단계가 애초에 없었다"를 영영 구분할 수 없다. 화면은 도달 단계만 그린다.
 *
 * ⚠️ **의도된 단계가 2개 미만이면 빈 배열**을 돌려준다 → 호출부가 필드 자체를 만들지 않아
 * 기존 12개 시나리오 리포트가 한 글자도 바뀌지 않는다(무백필).
 * ⚠️ 표에 없는 케이스(예: 보이스로 시작해 메신저로 역전이한 세션)는 `messenger`가 의도되지 않아
 * 자연히 빈 배열로 떨어진다 — **임의 판단하지 않는다**(행 추가는 architect 소관).
 */
export function deriveReportStages(input: StageDerivationInput): ReportStage[] {
  const messengerIntended = input.entryChannel === "messenger";
  if (!messengerIntended) return [];

  const reached = new Set(input.reachedLandingIds);
  const stages: { stage: ReportStageName; intended: boolean; reached: boolean }[] = [
    { stage: "messenger", intended: true, reached: true },
    {
      stage: "mock_install",
      intended: input.installIntended,
      reached: input.installLandingIds.some((id) => reached.has(id)),
    },
    { stage: "voice", intended: input.voiceIntended, reached: input.voiceReached },
  ];

  const intended = stages.filter((s) => s.intended);
  if (intended.length < 2) return [];
  return intended.map(({ stage, reached: isReached }) => ({ stage, reached: isReached }));
}
