// 3단계 구조 고지 1줄 — OQ-U24 판정의 화면 쪽 절반 (T84, §15.9.5 e-3, D-50, AC-073).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStageNotice, reachedStages, type ReportStage } from "./stageNotice.ts";

const fullChain: ReportStage[] = [
  { stage: "messenger", reached: true },
  { stage: "mock_install", reached: true },
  { stage: "voice", reached: true },
];

test("3단계 세션은 구조를 한 줄로 고지한다(단계 번호·카운터를 쓰지 않는다 — D-50)", () => {
  const notice = buildStageNotice(fullChain);
  assert.equal(notice, "이번 훈련은 문자 → 앱 설치 → 전화로 이어지는 수법이었습니다.");
  assert.equal(/1\/3|1단계|2단계|3단계/.test(notice ?? ""), false, "단계 카운터 표기 금지(D-50)");
});

test("미도달 단계도 **구조 고지에는 포함**된다 — 무엇이 일어날 수법이었는지가 사후 정보다", () => {
  const notReached: ReportStage[] = [
    { stage: "messenger", reached: true },
    { stage: "mock_install", reached: false },
    { stage: "voice", reached: false },
  ];
  assert.equal(buildStageNotice(notReached), "이번 훈련은 문자 → 앱 설치 → 전화로 이어지는 수법이었습니다.");
});

test("단계가 2개면 2개짜리 문장을 만든다(설치 카탈로그가 없는 기존 에스컬레이션 세션)", () => {
  assert.equal(
    buildStageNotice([
      { stage: "messenger", reached: true },
      { stage: "voice", reached: true },
    ]),
    "이번 훈련은 문자 → 전화로 이어지는 수법이었습니다.",
  );
});

test("[회귀 0] stages가 없거나 1개면 null — 기존 단일 표면 리포트는 한 글자도 바뀌지 않는다", () => {
  assert.equal(buildStageNotice([]), null);
  assert.equal(buildStageNotice([{ stage: "messenger", reached: true }]), null);
});

test("reachedStages: 화면은 도달 단계만 그린다(데이터에서는 빼지 않는다)", () => {
  const stages: ReportStage[] = [
    { stage: "messenger", reached: true },
    { stage: "mock_install", reached: true },
    { stage: "voice", reached: false },
  ];
  assert.deepEqual(
    reachedStages(stages).map((s) => s.stage),
    ["messenger", "mock_install"],
  );
  assert.equal(stages.length, 3, "원본 배열은 변형되지 않는다(미도달 단계가 데이터에 남는다)");
});
