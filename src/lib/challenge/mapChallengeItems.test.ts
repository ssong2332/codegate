// node:test 단위 테스트 (Track A/C, T36, AC-043) — src/lib/history/mapHistoryItems.test.ts와 동일한
// 이유로 node --experimental-strip-types로 컴파일 없이 이 순수 .ts 파일을 직접 실행한다.
// 실행: `npm test` (package.json 참고).
import test from "node:test";
import assert from "node:assert/strict";
import { mapChallengesToListItems } from "./mapChallengeItems.ts";

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
