// Edge 라이브 재시험 19 관찰 ③(2026-11-09 · 기관 사칭 고급 `fv-c5fj` 3통화) — 통화 1 사기범은 "금융감독원 계좌안전점검팀 권도하 조사관"으로 시작했는데
// 통화 3(같은 인물 · 같은 번호)에서 "한빛지방검찰청 금융범죄조사부 정하람 수사관"으로 소개했다.
// 원인: 기관 사칭 페르소나가 검찰 · 금감원 두 신분을 다 허용하고(`institutionalImpersonation.prompt.ts`), 통화 3 맥락(`buildLegLoanReviewContext`)은
// "같은 사람"이라고만 하고 통화 1에서 밝힌 소속 · 이름을 싣지 않았다. 통화 3 첫 단계 문면도 "같은 검사로서"였다.
//
// 판정표 I — 통화 1 신분 이어 쓰기(`legPriorIdentity`): 같은 `speakerId`의 앞 사기범 레그 대사(낭독 안 된 줄 제외 · 띄어쓰기 무시)에서
// 고정 이름표 이름이 처음 나온 것.
// | # | If | Then |
// |---|---|---|
// | I1 | 처음 나온 이름 = 권도하(금감원 조사관) | "금융감독원 계좌안전점검팀 권도하 조사관" |
// | I2 | 처음 나온 이름 = 정하람(검찰 수사관) | "한빛지방검찰청 금융범죄조사부 정하람 수사관" |
// | I3 | 처음 나온 이름 = 윤서진(검사) | "한빛지방검찰청 금융범죄조사부 윤서진 검사" |
// | I4 | 이름 0 · 메시지 미제공 | undefined(신분 줄 0 — "앞 통화에서 밝힌 소속 · 이름 그대로" 문장만) |
// | I5 | 그 이름이 참가자 줄 · 다른 레그(상담원 통화 · 통화 3 자신) · 낭독 안 된 줄에만 있다 | 세지 않는다 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLegLoanReviewContext, legPriorIdentity, type LegRejoinMessage } from "../legPlan";
import { findFlowVariant } from "../../scenarios/flowVariants";

const c5fj = findFlowVariant("fv-c5fj")!;
const FSS = "금융감독원 계좌안전점검팀 권도하 조사관";
const PROSECUTION = "한빛지방검찰청 금융범죄조사부 정하람 수사관";

// 재시험 19 I4 판 재현(대사 요지 — 통화 1 = 금감원 조사관 · 통화 2 = 캐피탈 상담원 · 통화 3 시작 전).
const RETEST19: LegRejoinMessage[] = [
  { role: "scammer", text: "여보세요, 금융감독원 계좌안전점검팀 권도하 조사관입니다. 고객님 명의가 범죄에 쓰인 정황이 있습니다.", legIndex: 0 },
  { role: "user", text: "네? 무슨 일이요?", legIndex: 0 },
  { role: "scammer", text: "한빛지방검찰청에서 수사 중인 사건이라 협조해 주셔야 합니다.", legIndex: 0 },
  { role: "scammer", text: "네, 고객님. 마노캐피탈 비대면 대출센터입니다. 본인이 직접 신청하셨나요?", legIndex: 1 },
  { role: "user", text: "네 제가 했어요.", legIndex: 1 },
];

test("[재시험 19 ③ 재현] 통화 1이 금감원 조사관이면 통화 3 맥락에 그 소속 · 이름이 실린다(검찰 수사관으로 바꾸지 않는다)", () => {
  const context = buildLegLoanReviewContext(c5fj, 2, "approved", RETEST19)!;
  assert.ok(context.includes(`"${FSS}"`), context);
  assert.equal(context.includes("정하람"), false);
  assert.ok(context.includes("다른 기관 · 이름으로 바꾸지 않는다"));
  assert.ok(context.includes("대출금이 상대 계좌에 입금됐다"), "확인 결과 줄은 종전 그대로");
  // 앞 통화 대화 원문은 싣지 않는다(카드사 R1 사용자 지적 "a와 이야기 한 내용을 b나 c가 알면 안되지" — 이름표 값만).
  for (const m of RETEST19) {
    const clause = (m.text ?? "").split(/[,.?]/)[0]!.trim();
    if (clause.length >= 5 && !FSS.includes(clause)) assert.equal(context.includes(clause), false, clause);
  }
  assert.equal(context.includes("마노캐피탈"), false);
});

test("[판정표 I] 처음 나온 이름 · 세지 않는 줄", () => {
  const scammer = (text: string, legIndex = 0): LegRejoinMessage => ({ role: "scammer", text, legIndex });
  // I1 · I2 · I3
  assert.equal(legPriorIdentity(c5fj, 2, RETEST19), FSS);
  assert.equal(legPriorIdentity(c5fj, 2, [scammer("한빛지방검찰청 금융범죄조사부 정하람 수사관입니다. 담당 윤서진 검사님 지시로 연락드렸습니다.")]), PROSECUTION);
  assert.equal(
    legPriorIdentity(c5fj, 2, [scammer("저는 한빛지방검찰청 윤서진 검사입니다. 정하람 수사관이 곧 연락드릴 겁니다.")]),
    "한빛지방검찰청 금융범죄조사부 윤서진 검사",
  );
  // 띄어쓰기 무시(실시간 전사가 이름을 띄워 적는 경우)
  assert.equal(legPriorIdentity(c5fj, 2, [scammer("금융감독원 권 도하 조사관입니다.")]), FSS);
  // legIndex 부재 = 레그 0(종전 관례 — `buildLegRejoinContext`와 같다)
  assert.equal(legPriorIdentity(c5fj, 2, [{ role: "scammer", text: "정하람 수사관입니다." }]), PROSECUTION);
  // I4
  assert.equal(legPriorIdentity(c5fj, 2, [scammer("검찰입니다. 명의가 도용됐습니다.")]), undefined);
  assert.equal(legPriorIdentity(c5fj, 2, []), undefined);
  // I5 — 참가자 줄 · 상담원 통화 · 통화 3 자신 · 낭독 안 된 줄
  assert.equal(legPriorIdentity(c5fj, 2, [{ role: "user", text: "권도하 조사관님 맞으세요?", legIndex: 0 }]), undefined);
  assert.equal(legPriorIdentity(c5fj, 2, [scammer("권도하 조사관 말씀 들으셨죠?", 1)]), undefined);
  assert.equal(legPriorIdentity(c5fj, 2, [scammer("정하람 수사관입니다.", 2)]), undefined);
  assert.equal(legPriorIdentity(c5fj, 2, [{ role: "scammer", text: "권도하 조사관입니다.", legIndex: 0, notSpoken: true }]), undefined);
  // 상담원 레그(같은 화자 앞 레그 없음) · 첫 레그 = 신분 없음
  assert.equal(legPriorIdentity(c5fj, 1, RETEST19), undefined);
  assert.equal(legPriorIdentity(c5fj, 0, RETEST19), undefined);
});

test("[판정표 I · K] 메시지 미제공 · 이름 0 = 신분 줄 0, 종전 K1 ~ K4 판정 그대로", () => {
  const plain = buildLegLoanReviewContext(c5fj, 2, "held")!;
  assert.equal(plain.includes("밝혔다"), false);
  assert.ok(plain.includes("앞 통화에서 밝힌 소속 · 이름 그대로"), "이름을 모를 때도 바꾸지 말라는 문장은 싣는다");
  assert.equal(buildLegLoanReviewContext(c5fj, 2, "held", [])!, plain);
  assert.equal(buildLegLoanReviewContext(c5fj, 1, "approved", RETEST19), undefined, "상담원 통화에는 싣지 않는다(K1)");
  assert.equal(buildLegLoanReviewContext(findFlowVariant("fv-k3dn")!, 1, "approved", RETEST19), undefined, "정당한 제3자 레그 없는 변형(K1)");
});

test("[재시험 19 ③] 통화 3 첫 단계 문면 = 소속을 정하지 않는 '같은 사람'(종전 '같은 검사로서'가 검찰 신분을 끌어왔다)", () => {
  const recall = c5fj.legs[2];
  assert.equal(recall.speakerId, c5fj.legs[0].speakerId);
  const first = recall.stages?.[0] ?? "";
  assert.equal(first.includes("같은 검사"), false, first);
  assert.ok(first.includes("앞 통화에서 밝힌 소속 · 이름 그대로"), first);
});
