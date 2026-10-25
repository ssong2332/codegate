// §129.10(메인 라이브 재테스트 2026-10-24 · 기관 사칭 고급 — "2분 16초 문자 도착"이 "2분 15초 속음"보다 위) — 리포트 타임라인 정렬.
//
// §129.8에서 사건 시각을 실제 시각으로 바꾼 뒤(사용자 결정 N3), 앵커 대사 순(종전 정렬)과 표시 시각이 어긋날 수 있다.
// | # | If | 순서 |
// |---|---|---|
// | O1 | 두 항목 모두 표시 시각("N초 시점")이 있다 | 시각이 이른 쪽이 먼저 |
// | O2 | 같은 초 · 한쪽만 시각이 있음 · 둘 다 없음 | 종전 키(앵커 turnIndex → 종류 순 → 원래 순서) |
// ⚠️ 한쪽만 시각이 있을 때 종전 키로 가르는 것은 전순서를 깨지 않기 위해서다 — 시각 없는 항목(앵커 미해결 · 옛 리포트)은
//    종전 위치를 지키고, 시각 있는 항목끼리만 시각 순으로 맞춘다. 실제 표에서는 대부분 모두 시각이 있다.
// ⛔ 되감기 딥링크는 항목 순서가 아니라 원래 `deceivedMoments` 인덱스를 쓴다(이 정렬과 무관).
// ⚠️ 값 import 없는 잎 모듈로 둔다(`detectSkin.ts` 머리말과 같은 판단) — 앱 빌드(`tsc`)는 `.ts` 확장자 값 import를
//    거부하고(`allowImportingTsExtensions` 꺼짐), 루트 테스트 러너(`node --experimental-strip-types`)는 확장자 없는
//    상대 import를 풀지 못한다. ⇒ `../design/e2Layout.ts`의 `parseMomentSeconds`를 미러링한다(일치는 테스트가 지킨다).
function parseMomentSeconds(timeLabel: string | null | undefined): number | null {
  const m = typeof timeLabel === "string" ? timeLabel.trim().match(/^(\d+)초 시점$/) : null;
  return m ? Number(m[1]) : null;
}

export type TimelineSortable = {
  /** 표시 시각("N초 시점") — 부재 = 시각 없음. */
  timeLabel?: string;
  /** 종전 정렬 키 [앵커 turnIndex, 종류 순, 원래 순서]. */
  sortKey: readonly [number, number, number];
};

function legacyCompare(a: TimelineSortable, b: TimelineSortable): number {
  return a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1] || a.sortKey[2] - b.sortKey[2];
}

/** O1 · O2. */
export function compareTimelineEntries(a: TimelineSortable, b: TimelineSortable): number {
  const ta = parseMomentSeconds(a.timeLabel);
  const tb = parseMomentSeconds(b.timeLabel);
  if (ta !== null && tb !== null && ta !== tb) return ta - tb; // O1
  return legacyCompare(a, b); // O2
}
