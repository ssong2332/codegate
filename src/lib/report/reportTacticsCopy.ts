// 리포트·리플레이 "수법을 찾지 못함" 표시 문면 판정 — 순수 함수 (T189 · D-78 · AC-083 (b)·(e)).
//
// 정본: docs/UX.md UX-008 v1.31 노트 (1) 판정표 TB-1~TB-10 · (2) 용어 정의 · (3) 금지 문면.
// 수법 추정기가 **찾지 못한** 상태(`tacticsUsed` 빈 배열)를 "0가지"·"없습니다"로 말하지 않는다.
// 수법이 1개 이상이면 기존 문면·목록·숫자는 무변경이다(AC-083 (c)).
//
// ⛔ 이 파일이 하지 않는 것: 판정 로직·데이터 필드 신설, `getAnnotatedTurnIndexes` 변경(G16),
//    실패 아카이브(UX-030) 문면 변경(TB-10 무변경). 화면이 이미 가진 값만으로 가른다.

import type { ReplayTimelineItem } from "../replay/buildReplayTimeline";

/** TB-4 / TB-7 — 리포트 아코디언 본문과 리플레이 상단 상자가 **같은 문장**을 쓴다(AC-083 (e)). */
export const TACTICS_NOT_FOUND_TEXT =
  "이번 대화에서 시도된 수법을 이름으로 찾아내지 못했습니다. 수법이 없었다는 뜻은 아닙니다.";

/** 리플레이 타임라인의 "신호 카드" 소제목 — 렌더 코드와 같은 문자열(UX-008 v1.31 (2)). */
export const SIGNAL_CARD_HEADING = "⚠️ 여기가 신호였어요";

/**
 * UX-008 "시도된 수법" 아코디언 버튼 문면.
 * - TB-1: `tacticCount ≥ 1` → `시도된 수법 {n}가지` (무변경)
 * - TB-3: `tacticCount = 0` → `시도된 수법 · 이름을 찾지 못함`
 */
export function tacticsAccordionLabel(tacticCount: number): string {
  if (tacticCount >= 1) return `시도된 수법 ${tacticCount}가지`;
  return "시도된 수법 · 이름을 찾지 못함";
}

/**
 * §104 · UX D-145 — UX-008 "속지 않음" 상태 줄(AC-009, 요약 카드 위 `role="status"`). 2026-10-22 라이브: 대화 0턴(바로 끊음) ·
 * 수법 0개 세션에서 *"아래는 시도된 수법입니다."* 바로 아래 아코디언이 TB-3 *"시도된 수법 · 이름을 찾지 못함"* 이라 앞뒤가 맞지 않았다.
 * ⇒ 둘째 문장은 수법 목록이 실제로 있을 때만 붙인다(⛔ 이 표 밖 상태 줄 0 · `wasDeceived = true`면 호출하지 않는다).
 *
 * | # | `tacticCount` | `userTurnCount` | 문면 |
 * |---|---|---|---|
 * | NS-1 | ≥ 1 | (무관) | `이번 훈련에서는 속지 않았습니다. 아래는 시도된 수법입니다.` (**무변경**) |
 * | NS-2 | 0 | 0 | `이번 훈련에서는 속지 않았습니다. 상대의 말에 답하기 전에 대화를 마쳤습니다.` |
 * | NS-3 | 0 | ≥ 1 · 부재(필드 이전 리포트) | `이번 훈련에서는 속지 않았습니다.` |
 * - ⛔ TB 금지 문면(*"0가지"* · *"없습니다"*)을 쓰지 않는다 — 수법을 이름으로 못 찾은 것이지 없었다는 뜻이 아니다(D-78).
 * - "통화"가 아니라 "대화" — 메신저 세션에도 같은 줄이 나온다.
 */
export const NOT_DECEIVED_HEAD = "이번 훈련에서는 속지 않았습니다.";
/**
 * §129.6 · UX D-160 확장(메인 라이브 확인 2026-10-24 — 지인 사칭 카톡 초급 · 첫 메시지만 받고 답 0으로 종료 → "끝까지 지켰어요 · 잘 대처함 · 시도된 수법 1가지").
 * 메신저는 첫 말풍선이 보였으므로 수법이 1개 이상일 수 있다 ⇒ NS-0 행을 NS-1 앞에 둔다.
 * | # | `tacticCount` | `userTurnCount` | 문면 |
 * |---|---|---|---|
 * | NS-0 | ≥ 1 | 0 | `이번 훈련에서는 속지 않았습니다. 상대의 말에 답하기 전에 대화를 마쳤습니다. 아래는 시도된 수법입니다.` |
 */
export const NOT_ANSWERED_SENTENCE = "상대의 말에 답하기 전에 대화를 마쳤습니다.";
export function notDeceivedStatusText(tacticCount: number, userTurnCount: number | undefined): string {
  if (tacticCount >= 1 && userTurnCount === 0) return `${NOT_DECEIVED_HEAD} ${NOT_ANSWERED_SENTENCE} 아래는 시도된 수법입니다.`; // NS-0
  if (tacticCount >= 1) return `${NOT_DECEIVED_HEAD} 아래는 시도된 수법입니다.`; // NS-1
  if (userTurnCount === 0) return `${NOT_DECEIVED_HEAD} ${NOT_ANSWERED_SENTENCE}`; // NS-2
  return NOT_DECEIVED_HEAD; // NS-3
}

/**
 * §129.6 · UX D-160 확장 — 속지 않았고 참가자 답이 0인 리포트의 머리 · 요약 줄(종료 화면 D-160 Z1과 같은 판정 — `userTurnCount === 0`).
 * 통화(벨 전 종료 — 오프닝 `notSpoken`) · 메신저(첫 메시지만 받고 종료) 공통. 부재(옛 리포트) · 1 이상 = 종전 "끝까지 지켰어요 · 잘 대처함".
 * ⛔ 속은 세션(`wasDeceived`)에는 쓰지 않는다 — 답 없이 링크 화면에서 응낙한 메신저 세션은 속음이다.
 */
export function isUnansweredReport(wasDeceived: boolean, userTurnCount: number | undefined): boolean {
  return !wasDeceived && userTurnCount === 0;
}
export const UNANSWERED_HEADLINE = "답하기 전에 마쳤어요";
export const UNANSWERED_SUMMARY_TITLE = "대화 전에 마침";
export const UNANSWERED_SUMMARY_BODY = "상대의 말에 답하기 전에 훈련을 마쳤습니다. 수상한 연락은 이렇게 바로 끊어도 됩니다.";
/**
 * §129.8 · D-160 확장(에뮬 재점검 2026-10-24b N8) — 되짚어보기(UX-018)의 답 0 문면. 종전 일반 문구("오늘 시도된 수법을 다시 확인하고 … 어떻게 대응했는지" ·
 * "이번에 놓쳤을 수 있는 부분은 …")는 대화가 없는 세션에서 맞지 않는다. 판정은 리포트와 같은 `isUnansweredReport`.
 */
export const UNANSWERED_REPLAY_STATUS = `${NOT_DECEIVED_HEAD} ${NOT_ANSWERED_SENTENCE}`;
export const UNANSWERED_REPLAY_INTRO = "아래에서 상대가 처음 보낸 말과 그 안에 담긴 수법을 확인해 보세요.";
export const UNANSWERED_REPLAY_FOOTER = "답하기 전에 끝낸 훈련이에요. 다음 훈련에서는 상대가 어떤 말로 압박하는지 듣고, 어디가 수상한지 직접 찾아보세요.";

/**
 * 리플레이 타임라인에서 **말풍선 주석 밖**에 그려지는 "⚠️ 여기가 신호였어요" 카드 수
 * (UX-008 v1.31 (2) `신호카드수`). 렌더와 **같은 배열**에서 센다:
 * - `sms` 항목: `sms.events` 1건당 카드 1장(`ReplaySmsItem`이 events 전부를 카드로 그린다)
 * - `verify` 항목: `verify.events` 1건당 카드 1장(`ReplayVerifyItem` 동일)
 * - `mockScreen` 항목: 렌더가 쓰는 문구 판정 결과의 `heading`이 신호 카드 소제목일 때만 1장
 *   ("잘 대응한 지점"(분기 다)·소제목 없음(분기 나)은 세지 않는다)
 * - `message` 항목의 주석(속은 순간)은 세지 않는다 — 그것은 `annotatedTurnIndexes`의 몫이다.
 *
 * `resolveMockScreenHeading`은 화면이 렌더에 쓰는 것과 같은 판정 함수
 * (`resolveMockScreenCopy(mockScreen, deceivedMoments, "replay")`)를 넘긴다 — 판정이 두 벌이 되지 않게.
 */
export function countReplaySignalCards(
  timeline: readonly ReplayTimelineItem[],
  resolveMockScreenHeading: (
    mockScreen: Extract<ReplayTimelineItem, { kind: "mockScreen" }>["mockScreen"],
  ) => { heading?: string },
): number {
  let count = 0;
  for (const item of timeline) {
    if (item.kind === "sms") count += item.sms.events.length;
    else if (item.kind === "verify") count += item.verify.events.length;
    else if (item.kind === "mockScreen") {
      if (resolveMockScreenHeading(item.mockScreen).heading === SIGNAL_CARD_HEADING) count += 1;
    }
  }
  return count;
}

/**
 * UX-018 스텝 내비게이션의 0건 문면(`annotatedTurnIndexes.length = 0`일 때만 호출).
 * TB-9a~d — 첫 문장은 `wasDeceived`, 둘째 문장은 `signalCardCount`로 갈린다. 한 문단 두 문장.
 */
export function replayNavEmptyText(wasDeceived: boolean, signalCardCount: number): string {
  const first = wasDeceived
    ? "속은 순간이 대화의 어느 말인지 확인하지 못해 바로 이동할 수 없습니다."
    : "속은 순간이 없어 바로 이동할 지점이 없습니다.";
  const second =
    signalCardCount >= 1
      ? "아래 대화의 '여기가 신호였어요' 표시를 읽어 보세요."
      : "아래 대화를 처음부터 읽어 보세요.";
  return `${first} ${second}`;
}
