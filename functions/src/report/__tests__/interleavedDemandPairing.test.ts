// 2026-11-08 Edge 재시험(라이브 main `1d61b7b5` · 보이스피싱 › 국세청 환급금 사칭 › 고급 · 대화 되짚어보기 순서 그대로) — 리포트 짝짓기 고정.
// (1) 이름 · 생년월일 요구 뒤에 사기범 줄("네, 반갑습니다.")이 끼고 답이 두 줄로 나뉘면 속은 순간 0 — 짝 대사 P1 · P2(`analyzeConversation`)
// (2) 수수료 요구에 "말씀하신 대로 할게요"의 라벨이 최종 폴백 '본인확인 빙자 정보 수집' — 돈 문맥 M1("수수료")
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, type AnalysisMessage } from "../analyzeConversation";
import { buildTacticPremiseText } from "../tacticPremise";
import { FLOW_VARIANTS, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";

const t0 = 1_000_000;
const SCENARIO = "tax-refund-scam";
const msg = (turnIndex: number, role: "scammer" | "user", textMasked: string, sec: number, legIndex?: number): AnalysisMessage => ({
  role,
  textMasked,
  turnIndex,
  createdAtMs: t0 + sec * 1000,
  ...(legIndex === undefined ? {} : { legIndex }),
});

function advancedTactics(): string[] {
  const variant = FLOW_VARIANTS.find((v) => v.scenarioId === SCENARIO && v.level === "advanced");
  assert.ok(variant, "국세청 환급 고급 변형이 카탈로그에 없다");
  return resolveSessionScenarioPrompt(variant.scenarioId, variant.variantId)?.weakenedTactics ?? [];
}

function analyze(messages: AnalysisMessage[]) {
  return analyzeConversation(messages, t0, advancedTactics(), [], undefined, buildTacticPremiseText(SCENARIO));
}

const NAME_BIRTH_REQUEST = "본인 확인을 위해 성함이랑 생년월일 말씀해 주시겠어요?";
const BIRTH_REPLY = "생년 68년 3월 2일이 해당 은행 계좌는 있는데요. 번호는 지금 기억이 안 나요. 환급금은 어떻게 받으면 되지요?";

/** 메인이 되짚어보기에서 읽은 순서(문면은 메인 전달 그대로 · 생략된 "…" 부분은 넣지 않았다). */
function replaySequence(): AnalysisMessage[] {
  return [
    msg(0, "scammer", "안녕하세요, 국세청 환급 담당입니다. 고객님 앞으로 미수령 환급금이 남아 있어 연락드렸습니다.", 5),
    msg(1, "user", "네, 안녕하세요.", 15),
    msg(2, "scammer", NAME_BIRTH_REQUEST, 40),
    msg(3, "scammer", "네, 반갑습니다.", 45),
    msg(4, "user", "제 이름은 김영희고요.", 60),
    msg(5, "user", BIRTH_REPLY, 75),
    msg(6, "scammer", "생년월일 확인했습니다. 계좌는 본인 명의로 된 것이 맞으시죠?", 110),
    msg(7, "user", "시키는 대로 할게요.", 122),
    msg(8, "scammer", "처리 수수료를 먼저 납부하셔야 합니다.", 300),
    msg(9, "user", "네, 말씀하신 대로 할게요. 다음엔 뭘 하면 되나요?", 309),
    msg(10, "scammer", "네, 입금 확인되었습니다.", 320),
  ];
}

test("(1) P1 — 요구 대사 뒤에 사기범 줄이 끼고 답이 두 줄로 나뉘어도 생년월일 답이 속은 순간이다(라벨은 요구 대사에서)", () => {
  const result = analyze(replaySequence());
  const moment = result.deceivedMoments.find((m) => m.turnIndex === 5);
  assert.ok(moment, `생년월일 답(턴 5)에 속은 순간이 없다: ${JSON.stringify(result.deceivedMoments)}`);
  assert.equal(moment.timeLabel, "75초 시점");
  assert.equal(moment.tactic, "확인질문 재촉");
  // 답 묶음 하나에 순간은 1개(이름 줄 · 생년월일 줄 중 처음 응한 줄).
  assert.equal(result.deceivedMoments.filter((m) => m.turnIndex === 4 || m.turnIndex === 5).length, 1);
});

test("(1) 대조 — 사기범 줄이 끼지 않은 같은 대화는 원래도 속은 순간이었다(원인 = 끼어든 줄)", () => {
  const withoutFiller = replaySequence().filter((m) => m.turnIndex !== 3);
  assert.ok(analyze(withoutFiller).deceivedMoments.some((m) => m.turnIndex === 5));
});

test("(2) M1 — '처리 수수료를 먼저 납부하셔야 합니다' 뒤 따름 약속의 라벨은 '환급 수수료 요구'다(최종 폴백 '본인확인 빙자 정보 수집' 아님)", () => {
  const result = analyze(replaySequence());
  const moment = result.deceivedMoments.find((m) => m.turnIndex === 9);
  assert.ok(moment, "수수료 요구 뒤 따름 약속은 속은 순간이다(종전과 같음)");
  assert.equal(moment.tactic, "환급 수수료 요구");
  assert.equal(moment.tacticCategory, "payment_demand");
  // 이 대화에서 '본인확인 빙자 정보 수집' 문구는 나오지 않았다 — 목록에도 오르지 않는다.
  assert.ok(!result.tacticsUsed.includes("본인확인 빙자 정보 수집"), JSON.stringify(result.tacticsUsed));
});

test("P2 — 끼어든 줄에 요구가 있으면 그 줄 기준(종전): 설치 요구 뒤 날짜만 말한 답은 생년월일 공개로 보지 않는다", () => {
  const messages = [
    msg(0, "scammer", NAME_BIRTH_REQUEST, 10),
    msg(1, "scammer", "그리고 환급 조회 앱 하나만 설치해 주세요.", 15),
    msg(2, "user", "3월 2일이요.", 30),
  ];
  assert.equal(analyze(messages).deceivedMoments.length, 0);
});

test("P2 — 통화가 다르면 앞 통화의 요구를 끌어오지 않는다", () => {
  const messages = [
    msg(0, "scammer", NAME_BIRTH_REQUEST, 10, 0),
    msg(1, "scammer", "네, 반갑습니다.", 15, 1),
    msg(2, "user", BIRTH_REPLY, 30, 1),
  ];
  assert.equal(analyze(messages).deceivedMoments.length, 0);
  // 같은 통화면 P1.
  const sameLeg = messages.map((m) => ({ ...m, legIndex: 0 }));
  assert.equal(analyze(sameLeg).deceivedMoments.length, 1);
});

test("P2 — 이어진 사기범 줄에 요구가 없으면 종전: 따름 약속만으로는 속은 순간이 아니다(C5)", () => {
  const messages = [
    msg(0, "scammer", "고객님 앞으로 환급금이 남아 있어요.", 10),
    msg(1, "scammer", "네, 반갑습니다.", 15),
    msg(2, "user", "시키는 대로 할게요.", 30),
  ];
  assert.equal(analyze(messages).deceivedMoments.length, 0);
});
