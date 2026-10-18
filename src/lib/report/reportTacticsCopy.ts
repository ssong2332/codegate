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
