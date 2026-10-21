// 리포트 내용 검수(2026-10-22) — 표시 문면 판정표 A1~A7(`reportSummaryCopy.ts` 머리 표).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deceivedSummaryTitle,
  displayTactic,
  FALLBACK_TACTIC_LABEL,
  formatMomentLabel,
  NEXT_ACTION_FALLBACK,
  pickNextAction,
  REAL_DAMAGE_STEPS,
  replayMomentNote,
} from "./reportSummaryCopy.ts";

const CLOSING_DECEIVED =
  "오늘 놓쳤던 순간을 기억해 두면 다음엔 더 빨리 알아챌 수 있습니다. 이건 한 번에 사라지는 게 아니라 계속 연습해야 하는 개선 영역입니다.";
const CLOSING_SAFE =
  "이번엔 상대의 요구에 응하지 않았습니다. 다만 사기 수법은 계속 진화하므로, 오늘처럼 전화를 끊고 직접 확인하는 습관을 계속 유지하는 것이 중요합니다.";
const CLOSING_SAFE_MESSENGER =
  "이번엔 상대의 요구에 응하지 않았습니다. 다만 사기 수법은 계속 진화하므로, 오늘처럼 대화를 멈추고 직접 확인하는 습관을 계속 유지하는 것이 중요합니다.";
const AUTHORITY = "전화로 신원(경찰·기관 등)을 주장해도 그 자리에서 믿지 말고, 공식 대표번호로 직접 걸어 확인하세요.";
const URGENCY = "아무리 다급해 보여도 그 자리에서 결정하지 말고, 일단 전화를 끊고 잠시 시간을 두어 사실관계를 확인하세요.";

test("A1 — 서버 폴백 라벨 · 빈 값은 그리지 않는다", () => {
  assert.equal(displayTactic(FALLBACK_TACTIC_LABEL), null);
  assert.equal(displayTactic(" 약화된 사기 수법 "), null);
  assert.equal(displayTactic(""), null);
  assert.equal(displayTactic(undefined), null);
  assert.equal(displayTactic("권위 암시"), "권위 암시");
});

test("A2 · A3 — 요약 제목은 상대 수법에 '응함'으로 읽힌다", () => {
  assert.equal(deceivedSummaryTitle("거래 은행·자산 정보 수집"), "개선 영역 · '거래 은행·자산 정보 수집'에 응함");
  assert.equal(deceivedSummaryTitle(FALLBACK_TACTIC_LABEL), "개선 영역 · 상대의 요구에 응함");
});

test("A4 — 첫 속은 순간 대처와 같은 문장 · 마무리 문장은 건너뛴다", () => {
  assert.equal(pickNextAction([AUTHORITY, URGENCY, CLOSING_DECEIVED], AUTHORITY), URGENCY);
  assert.equal(pickNextAction([AUTHORITY, CLOSING_SAFE], null), AUTHORITY);
});

test("A5 — 고를 문장이 없으면 행동 문장 폴백(마무리 문장을 '다음에 해볼 것'으로 내지 않는다)", () => {
  assert.equal(pickNextAction([CLOSING_DECEIVED], "x"), NEXT_ACTION_FALLBACK);
  assert.equal(pickNextAction([CLOSING_SAFE], null), NEXT_ACTION_FALLBACK);
  assert.equal(pickNextAction([CLOSING_SAFE_MESSENGER], null), NEXT_ACTION_FALLBACK);
  assert.equal(pickNextAction([AUTHORITY, CLOSING_DECEIVED], AUTHORITY), NEXT_ACTION_FALLBACK);
  assert.equal(pickNextAction([], null), NEXT_ACTION_FALLBACK);
});

test("A6 · A7 — 60초 이상만 분 단위로 읽기 쉽게 바꾼다", () => {
  assert.equal(formatMomentLabel("15초 시점"), "15초 시점");
  assert.equal(formatMomentLabel("59초 시점"), "59초 시점");
  assert.equal(formatMomentLabel("60초 시점"), "1분 시점");
  assert.equal(formatMomentLabel("754초 시점"), "12분 34초 시점");
  assert.equal(formatMomentLabel("알 수 없음"), "알 수 없음");
});

test("실제 피해 대처 — 공식 창구(112 · 은행 지급정지 · 1332)를 모두 담고 무력감 표현이 없다", () => {
  const all = REAL_DAMAGE_STEPS.join(" ");
  for (const must of ["112", "지급정지", "1332", "pd.fss.or.kr", "msafer.or.kr"]) {
    assert.ok(all.includes(must), must);
  }
  assert.equal(/소용없|막을 수 없|어차피|방법이 없/.test(all), false);
});

test("되짚어보기 주석 — 내 말을 '신호'로 부르지 않고 응한 순간으로 부른다 · 폴백 라벨 0", () => {
  assert.equal(replayMomentNote("15초 시점", "권위 암시"), "15초 시점: 여기서 상대의 '권위 암시' 수법에 응했습니다.");
  assert.equal(replayMomentNote("754초 시점", FALLBACK_TACTIC_LABEL), "12분 34초 시점: 여기서 상대의 요구에 응했습니다.");
});
