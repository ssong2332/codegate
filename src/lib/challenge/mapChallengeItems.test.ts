// node:test 단위 테스트 (Track A/C, T36, AC-043) — src/lib/history/mapHistoryItems.test.ts와 동일한
// 이유로 node --experimental-strip-types로 컴파일 없이 이 순수 .ts 파일을 직접 실행한다.
// 실행: `npm test` (package.json 참고).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapChallengesToListItems } from "./mapChallengeItems.ts";
import type { ChallengeSource } from "./mapChallengeItems.ts";

test("AC-043: 미완료(pending/consented/in_progress) 챌린지는 '아직 해보지 않았습니다'만 표시한다", () => {
  const items = mapChallengesToListItems([
    {
      challengeId: "c1",
      displayName: "엄마",
      status: "pending",
      resultSharingConsented: false,
      suspicionTimeLabel: null,
      createdAt: new Date("2026-07-24T10:00:00+09:00"),
    },
  ]);
  assert.equal(items[0].statusLabel, "상대가 아직 해보지 않았습니다");
});

test("AC-043: 완료+미동의는 상세를 감추고 미동의 안내만 표시한다(대화 전문/의심 시점 노출 금지)", () => {
  const items = mapChallengesToListItems([
    {
      challengeId: "c2",
      displayName: "친구",
      status: "completed",
      resultSharingConsented: false,
      suspicionTimeLabel: "40초",
      createdAt: new Date("2026-07-24T10:00:00+09:00"),
    },
  ]);
  assert.equal(items[0].statusLabel, "상대가 완료했지만 결과 공유에 동의하지 않았습니다");
});

test("AC-043: 완료+동의+의심 시점 있음 → '완료 · 의심 시점: 약 N초' 요약만 표시한다", () => {
  const items = mapChallengesToListItems([
    {
      challengeId: "c3",
      displayName: "동생",
      status: "completed",
      resultSharingConsented: true,
      suspicionTimeLabel: "30초",
      createdAt: new Date("2026-07-24T10:00:00+09:00"),
    },
  ]);
  assert.equal(items[0].statusLabel, "완료 · 의심 시점: 약 30초");
});

test("AC-043: 완료+동의+의심 시점 없음 → '완료'만 표시한다", () => {
  const items = mapChallengesToListItems([
    {
      challengeId: "c4",
      displayName: "언니",
      status: "reported",
      resultSharingConsented: true,
      suspicionTimeLabel: null,
      createdAt: null,
    },
  ]);
  assert.equal(items[0].statusLabel, "완료");
  assert.equal(items[0].dateLabel, "날짜 미상");
});

test("AC-041: status가 deleted인 챌린지는 목록에서 제외한다(삭제는 되돌릴 수 없다)", () => {
  const items = mapChallengesToListItems([
    {
      challengeId: "c5",
      displayName: "삭제됨",
      status: "deleted",
      resultSharingConsented: false,
      suspicionTimeLabel: null,
      createdAt: new Date("2026-07-24T10:00:00+09:00"),
    },
  ]);
  assert.deepEqual(items, []);
});

test("빈 배열이면 빈 목록(Empty 상태 판단은 화면이 함)", () => {
  assert.deepEqual(mapChallengesToListItems([]), []);
});

test("AC-055/OQ-31: 메신저 챌린지는 완료+동의라도 의심 시점을 절대 노출하지 않고 '완료 · 상대가 체험을 마침'만 표시한다", () => {
  const items = mapChallengesToListItems([
    {
      challengeId: "c6",
      displayName: "동료",
      status: "completed",
      resultSharingConsented: true,
      // 서버가 원래 채우지 않는 값이지만, 화면 쪽 방어(2차 하드닝)도 채널로 무시함을 검증한다.
      suspicionTimeLabel: "12초",
      createdAt: new Date("2026-07-24T10:00:00+09:00"),
      channel: "messenger",
    },
  ]);
  assert.equal(items[0].statusLabel, "완료 · 상대가 체험을 마침");
});

test("channel 생략(부재) → 보이스 챌린지와 동일하게 기존 라벨을 그대로 유지한다(하위호환)", () => {
  const items = mapChallengesToListItems([
    {
      challengeId: "c7",
      displayName: "이모",
      status: "completed",
      resultSharingConsented: true,
      suspicionTimeLabel: null,
      createdAt: new Date("2026-07-24T10:00:00+09:00"),
    },
  ]);
  assert.equal(items[0].statusLabel, "완료");
});

test("AC-058/OQ-32: generic 보이스 챌린지는 완료+동의라도 의심 시점을 절대 노출하지 않고 '완료 · 상대가 체험을 마침'만 표시한다(D-34)", () => {
  const items = mapChallengesToListItems([
    {
      challengeId: "c8",
      displayName: "삼촌",
      status: "completed",
      resultSharingConsented: true,
      // 서버가 원래 채우지 않는 값이지만, 화면 쪽 방어(2차 하드닝)도 voiceMode로 무시함을 검증한다.
      suspicionTimeLabel: "20초",
      createdAt: new Date("2026-07-24T10:00:00+09:00"),
      channel: "voice",
      voiceMode: "generic",
    },
  ]);
  assert.equal(items[0].statusLabel, "완료 · 상대가 체험을 마침");
});

test("voiceMode 생략(부재→clone) → 기존 clone 챌린지 라벨을 그대로 유지한다(하위호환)", () => {
  const items = mapChallengesToListItems([
    {
      challengeId: "c9",
      displayName: "조카",
      status: "completed",
      resultSharingConsented: true,
      suspicionTimeLabel: "15초",
      createdAt: new Date("2026-07-24T10:00:00+09:00"),
      channel: "voice",
    },
  ]);
  assert.equal(items[0].statusLabel, "완료 · 의심 시점: 약 15초");
});

// ─────────────────────────────────────────────────────────────────────────────
// T181 C-1 · C-1b · C-1c(docs/Architecture.md §69.8 · G428) — 서버 → 클라 연결 증거.
// ⭐ 이번 결함은 위 테스트들이 **서버가 만들지 않는 상태값**을 손으로 넣어 초록이었던 데서 숨었다
// (서버에 그 값을 쓰는 코드가 0건이었다 — §69.2). 그래서 아래 C-1은 상태값을 손으로 쓰지 않고, 서버
// 전이 모듈(functions/src/shared/challengeCompletion.ts)의 export 리터럴을 **소스에서 읽어** 그대로
// 매퍼에 넣는다. 사슬: 서버가 쓰는 리터럴(functions S-3) → listMyChallenges 통과(functions S-5) →
// fetchMyChallenges 통과(C-1b) → 매퍼(C-1). 어느 고리가 바뀌어도 테스트 하나가 빨개진다.
// ─────────────────────────────────────────────────────────────────────────────

const SERVER_COMPLETION_SOURCE = "functions/src/shared/challengeCompletion.ts";

/** 서버가 체험 종료 시 챌린지에 쓰는 status 리터럴. 못 찾으면 실패한다(조용한 건너뜀 금지). */
function serverCompletionStatus(): ChallengeSource["status"] {
  const source = readFileSync(SERVER_COMPLETION_SOURCE, "utf8");
  const match = /^export const CHALLENGE_STATUS_ON_EXPERIENCE_END = "([^"]+)"/m.exec(source);
  assert.ok(
    match,
    `${SERVER_COMPLETION_SOURCE}에서 CHALLENGE_STATUS_ON_EXPERIENCE_END 리터럴을 찾지 못했다 — 서버→클라 연결 증거를 낼 수 없다`,
  );
  // fetchChallenges.ts와 같은 타입 단언(값 변환 0) — 실제 클라 경로가 하는 일 그대로다.
  return match[1] as ChallengeSource["status"];
}

function oneItem(source: Partial<ChallengeSource> & Pick<ChallengeSource, "status">): string {
  const items = mapChallengesToListItems([
    {
      challengeId: "t181",
      displayName: "작성자가 보낸 상대",
      resultSharingConsented: false,
      suspicionTimeLabel: null,
      createdAt: new Date("2026-10-02T10:00:00+09:00"),
      ...source,
    },
  ]);
  assert.equal(items.length, 1, "서버가 쓰는 완료 값이 목록에서 사라졌다(삭제 필터에 걸렸다)");
  return items[0].statusLabel;
}

test("[T181 C-1] 서버 전이 리터럴 + 결과 공유 미동의 ⇒ UX-020 (b) '상대가 완료했지만 결과 공유에 동의하지 않았습니다'", () => {
  const status = serverCompletionStatus();
  assert.equal(oneItem({ status, resultSharingConsented: false }), "상대가 완료했지만 결과 공유에 동의하지 않았습니다");
  // 대기 문구로 떨어지지 않는다 — 결함 기간의 증상(T181 A) 그 자체를 역으로 단언한다.
  assert.notEqual(oneItem({ status, resultSharingConsented: false }), "상대가 아직 해보지 않았습니다");
});

test("[T181 C-1] 서버 전이 리터럴 + 공유 동의 ⇒ 메신저·generic은 (c) '완료 · 상대가 체험을 마침', clone + 의심 시점 없음은 '완료'", () => {
  const status = serverCompletionStatus();
  assert.equal(
    oneItem({ status, resultSharingConsented: true, channel: "messenger" }),
    "완료 · 상대가 체험을 마침",
  );
  assert.equal(
    oneItem({ status, resultSharingConsented: true, channel: "voice", voiceMode: "generic" }),
    "완료 · 상대가 체험을 마침",
  );
  assert.equal(
    oneItem({ status, resultSharingConsented: true, channel: "voice", voiceMode: "clone", suspicionTimeLabel: null }),
    "완료",
  );
});

test("[T181 C-1b] fetchMyChallenges가 서버 status를 값 변환 없이 넘긴다(통과 고리)", () => {
  const source = readFileSync("src/lib/challenge/fetchChallenges.ts", "utf8");
  assert.match(
    source,
    /^\s*status: item\.status(?: as ChallengeSource\["status"\])?,\s*$/m,
    "fetchChallenges.ts의 status 통과가 바뀌었다 — 서버가 쓴 값이 매퍼에 그대로 닿는다는 보장이 깨진다",
  );
});

test("[T181 C-1c 역방향] 동의만 하고 종료 전(consented · in_progress)은 (a) '상대가 아직 해보지 않았습니다'를 유지한다", () => {
  for (const status of ["consented", "in_progress"] as const) {
    assert.equal(oneItem({ status, resultSharingConsented: false }), "상대가 아직 해보지 않았습니다", `status=${status}`);
    assert.equal(oneItem({ status, resultSharingConsented: true }), "상대가 아직 해보지 않았습니다", `status=${status}`);
  }
});

test("[T181 C-1c 역방향] 메신저·generic은 완료 + 공유 동의 + suspicionTimeLabel이 있어도 '의심 시점' 문자열 0건(AC-055)", () => {
  const status = serverCompletionStatus();
  for (const extra of [{ channel: "messenger" }, { channel: "voice", voiceMode: "generic" }] as const) {
    const label = oneItem({ status, resultSharingConsented: true, suspicionTimeLabel: "40초", ...extra });
    assert.equal(label.includes("의심 시점"), false, `${JSON.stringify(extra)}: '${label}'`);
  }
});
