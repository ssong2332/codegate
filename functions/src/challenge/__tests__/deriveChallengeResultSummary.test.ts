// U03(2026-11-26) — 받은 사람이 결과 공유에 동의했을 때 만든 사람에게 보일 요약(판정표 RS · userAccess.ts deriveChallengeResultSummary).
// 재현: 종전 함수는 어떤 리포트든 {completed:true}만 돌려줘, 만든 사람 화면에 "완료" 외에 보이는 것이 없었다.
// 사용자 결정: "확대 (B)" · "①~④ 모두" · "세 종류 모두 동일"(clone · generic · 메신저 같은 요약).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { deriveChallengeResultSummary } from "../userAccess";
import type { DeceivedMoment, ReportDoc } from "../../shared/types";

const moment = (turnIndex: number, tactic: string, tacticCategory?: DeceivedMoment["tacticCategory"]): DeceivedMoment => ({
  turnIndex,
  timeLabel: `${turnIndex * 10}초 시점`,
  tactic,
  correctAction: "끊고 확인",
  ...(tacticCategory ? { tacticCategory } : {}),
});
type R = Parameters<typeof deriveChallengeResultSummary>[0];
const base: R = { wasDeceived: false, deceivedMoments: [] };

test("[U03 재현] 끝까지 속지 않고 먼저 끊은 리포트 → 결과 · 대처 시점이 요약에 실린다(종전 {completed:true}만)", () => {
  const s = deriveChallengeResultSummary({ ...base, participantHangup: { legIndex: 0, timeLabel: "130초 시점" } });
  assert.deepEqual(s, { completed: true, outcome: "held", defenseAction: "hangup", suspicionTimeLabel: "130초 시점" });
});

test("[RS ① ② ④] 넘어간 순간 · 송금 요구 응함 · 놓친 신호 = 수법이 다른 앞 2개(시각 포함)", () => {
  const s = deriveChallengeResultSummary({
    wasDeceived: true,
    deceivedMoments: [
      moment(8, "다급함 조성", "urgency"),
      moment(9, "다급함 조성", "urgency"),
      moment(18, "송금 요구", "payment_demand"),
      moment(25, "앱 설치 유도", "link_or_install"),
    ],
  });
  assert.deepEqual(s, {
    completed: true,
    outcome: "deceived",
    paymentComplied: true,
    missedSignals: [
      { tactic: "다급함 조성", timeLabel: "80초 시점" },
      { tactic: "송금 요구", timeLabel: "180초 시점" },
    ],
  });
});

test("[RS ③] 대처 시각은 끊기 · 화면 보류 중 가장 이른 것 · 둘 다 없으면 진짜 번호 확인(시각 없음)", () => {
  const both = deriveChallengeResultSummary({
    ...base,
    participantHangup: { legIndex: 0, timeLabel: "300초 시점" },
    screenHeld: { timeLabel: "95초 시점" },
  });
  assert.equal(both.defenseAction, "screen_held");
  assert.equal(both.suspicionTimeLabel, "95초 시점");
  const official = deriveChallengeResultSummary({ ...base, officialCheck: { label: "카드사", number: "1588-0000" } });
  assert.equal(official.defenseAction, "official_check");
  assert.equal("suspicionTimeLabel" in official, false);
  assert.equal(JSON.stringify(official).includes("1588"), false, "확인한 번호 값은 싣지 않는다");
});

test("[RS ⛔] 대화 · 금액 · 위험 신호 · 카드 값은 요약에 0 — 허용 키만", () => {
  const report = {
    wasDeceived: true,
    deceivedMoments: [{ ...moment(3, "송금 요구", "payment_demand"), amountComparison: "more" as const }],
    riskSignals: [{ turnIndex: 2, timeLabel: "20초 시점", kind: "bank_disclosed" as const }],
    personaBlock: { state: "R-1", items: [{ label: "이름", value: "김가상" }] },
  } as unknown as ReportDoc;
  const s = deriveChallengeResultSummary(report);
  const allowed = ["completed", "outcome", "paymentComplied", "defenseAction", "suspicionTimeLabel", "missedSignals"];
  assert.deepEqual(Object.keys(s).filter((k) => !allowed.includes(k)), []);
  assert.deepEqual(Object.keys(s.missedSignals![0]).sort(), ["tactic", "timeLabel"]);
  assert.equal(JSON.stringify(s).includes("김가상"), false);
});

// 배선 — 채널 · 음성 모드로 갈리지 않고(사용자 결정 "세 종류 모두 동일") · 거부하면 요약을 지우고 · 목록은 동의할 때만 싣는다.
const SRC = readFileSync(path.join(__dirname, "../../../src/challenge/userAccess.ts"), "utf8");
const INDEX = readFileSync(path.join(__dirname, "../../../src/challenge/index.ts"), "utf8");

test("[U03 배선] setChallengeResultSharing — 리포트 하나로만 파생 · 거부 = resultSummary 삭제", () => {
  assert.match(SRC, /deriveChallengeResultSummary\(report\);/);
  assert.match(SRC, /resultSharingConsented: false, resultSummary: FieldValue\.delete\(\)/);
});

test("[U03 배선] listMyChallenges — 동의할 때만 요약 · 채널로 의심 시점을 숨기는 분기 0", () => {
  assert.match(INDEX, /resultSummary: data\.resultSharingConsented \? \(data\.resultSummary \?\? null\) : null/);
  assert.doesNotMatch(INDEX, /suppressSuspicion/);
});
