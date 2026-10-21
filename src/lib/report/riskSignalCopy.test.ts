// 사용자 결정 2026-10-21 ② — 위험 신호 표기 문면 · 읽기.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readRiskSignals, riskSignalCopy, RISK_SIGNAL_HEADING } from "./riskSignalCopy.ts";
import { SIGNAL_CARD_HEADING } from "./reportTacticsCopy.ts";

test("부재 · 배열 아님 = 빈 배열(무백필)", () => {
  assert.deepEqual(readRiskSignals(undefined), []);
  assert.deepEqual(readRiskSignals({}), []);
});

test("모양이 맞는 항목만 읽는다", () => {
  const raw = [
    { turnIndex: 3, timeLabel: "40초 시점", kind: "secrecy_promise" },
    { turnIndex: "3", timeLabel: "40초 시점", kind: "secrecy_promise" },
    { turnIndex: 5, timeLabel: "50초 시점", kind: "unknown" },
    null,
    { turnIndex: 7, timeLabel: "70초 시점", kind: "fake_info" },
  ];
  assert.deepEqual(readRiskSignals(raw), [
    { turnIndex: 3, timeLabel: "40초 시점", kind: "secrecy_promise" },
    { turnIndex: 7, timeLabel: "70초 시점", kind: "fake_info" },
  ]);
});

test("세 종류 모두 제목 · 설명이 있고 질책 · 과신 표현이 없다", () => {
  for (const kind of ["secrecy_promise", "bank_disclosed", "fake_info"] as const) {
    const copy = riskSignalCopy(kind);
    assert.ok(copy.title.length > 0 && copy.explanation.length > 0);
    assert.equal(/속았|틀렸|면역|이제 안전/.test(copy.title + copy.explanation), false);
  }
});

test("소제목은 속은 순간 신호 카드와 다르다(카드 수 · 되감기 진입과 섞이지 않는다)", () => {
  assert.notEqual(RISK_SIGNAL_HEADING, SIGNAL_CARD_HEADING);
});
