// §106(2026-10-22 사용자 실기 요청) — *"사건 기록 열람을 신청하는데, 해도 본인 확인이 완료되었다고 뜨는데, 이 경우는 실제 사건 기록을 사용자가 입력한
// 값대로 들어간 기록서가 있어야 할 거 같은데"*. 검찰 고급 `case-record-view` 제출 뒤 가짜 사건 기록 열람본을 데이터 · 무해성 · 판정 · 통화 문면 층에서 고정한다
// (화면에 입력값이 찍히는지는 클라 `src/lib/landing/recordDocument.test.ts` · `src/components/mockScreenCopy.test.ts` §106).
//
// | # | 무엇을 보나 | 기대 |
// |---|---|---|
// | R1 | 문서 위치 · 범위(G255 좁은 예외 — #221) | `recordDocument`가 있는 항목 = `case-record-view` 1건 · 그 입력 칸 = 신원 칸뿐(계좌 · 금액 0) · 현행 변형 fv-h3vn에서 도달 가능 |
// | R2 | 무해성 | 실존 기관명(검찰청 등) 0 · 8자리+ 숫자 0 · 실제 주소 0 · 공문서 칸(사건번호 · 죄명 · 담당 부서 · 담당 검사 · 진행 상태) 있음 |
// | R3 | 판정(§101 판정표 6행) | 문서를 본 것은 새 순간 0 — 제출 시각이 있으면 항목 본체 1건 · 없으면 0건(링크만 열고 닫음과 같다) |
// | R4 | 통화 문면 | fv-h3vn = 문서를 근거로 압박하는 같은 라벨 문면 · 은퇴 변형 fv-p4hz · fv-c8wq = 원문 그대로 |
// | R5 | 대처 문구 | 이름이 찍힌 기록도 방금 넣은 정보로 만든 가짜라는 줄 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { findFlowVariant } from "../flowVariants";
import { findMockScreenItem, MOCK_SCREENS } from "../mockScreens";
import { sessionReachableLandingIds } from "../reachability";
import { extractTacticLabel } from "../tacticFlavor";
import { PROSECUTION_CASE_LINK_TACTIC, PROSECUTION_CASE_RECORD_TACTIC } from "../prosecutionCooperationCall.prompt";
import { resolveLandingSubmitMomentItem } from "../../report/smsTimeline";
import { LONG_DIGIT_SEQUENCE, REAL_WORLD_INSTITUTION_NAMES } from "./harmlessnessPatterns";

const PROS = "prosecution-cooperation-call";
const LANDING = "case-record-view";

function item() {
  const found = findMockScreenItem(PROS, LANDING);
  assert.ok(found, "case-record-view 카탈로그 항목");
  return found;
}

function documentTexts(): string[] {
  const doc = item().recordDocument!;
  return [
    doc.title,
    doc.subjectHeading,
    doc.stampLabel,
    ...doc.noticeLines,
    ...[...doc.caseRows, ...doc.subjectRows].flatMap((row) => [row.label, row.value]),
  ];
}

test("[§106 R1] 열람본은 case-record-view 1건 · 입력 칸은 신원 칸뿐 · 현행 변형에서 도달 가능", () => {
  const withDoc = Object.values(MOCK_SCREENS)
    .flat()
    .filter((i) => i.recordDocument !== undefined)
    .map((i) => i.landingId);
  assert.deepEqual(withDoc, [LANDING]);
  assert.deepEqual(item().fields, ["성명", "생년월일", "휴대전화 번호"]);
  // G255 좁은 예외의 경계 — 계좌 · 금액 · 지갑 칸이 있는 항목에는 열람본을 둘 수 없다.
  assert.deepEqual(
    (item().fields ?? []).filter((label) => /계좌|금액|지갑/.test(label)),
    [],
  );
  assert.ok(sessionReachableLandingIds(PROS, "fv-h3vn").includes(LANDING));
});

test("[§106 R2] 무해성 — 실존 기관명 · 긴 숫자열 0 · 공문서 칸 있음", () => {
  const texts = documentTexts();
  assert.deepEqual(
    texts.filter((t) => REAL_WORLD_INSTITUTION_NAMES.some((name) => t.includes(name))),
    [],
    "실존 기관명",
  );
  assert.deepEqual(texts.filter((t) => LONG_DIGIT_SEQUENCE.test(t)), [], "8자리 이상 연속 숫자");
  assert.deepEqual(texts.filter((t) => /https?:\/\/|www\.|\.(kr|com|go)\b/.test(t)), [], "주소 꼴");
  assert.deepEqual(
    item().recordDocument!.caseRows.map((row) => row.label),
    ["사건번호", "죄명", "담당 부서", "담당 검사", "진행 상태"],
  );
  // 이름 칸은 가상 표기("OO")뿐 — 실존 인물 이름을 넣지 않는다.
  assert.ok(item().recordDocument!.caseRows.find((r) => r.label === "담당 검사")!.value.includes("OOO"));
  // 역검증 — 같은 검사식이 실존 기관명을 실제로 잡는다.
  assert.ok(REAL_WORLD_INSTITUTION_NAMES.some((name) => "OO지방검찰청".includes(name)));
});

test("[§106 R3] 판정 — 문서를 본 것은 새 순간이 아니다(제출이 곧 가장 깊은 단계)", () => {
  const submitted = resolveLandingSubmitMomentItem({ landingSubmittedAtMs: 1000 }, item());
  assert.deepEqual(submitted, { landingId: LANDING, momentTactic: item().momentTactic, correctAction: item().correctAction });
  // 링크만 열고 닫음 = 문서를 볼 수도 없다 → 0건(종전 5행).
  assert.equal(resolveLandingSubmitMomentItem({}, item()), undefined);
  // 한 화면 폼은 progressMoments가 없어 단계 시각이 있어도 문서 노출로 승격하지 않는다.
  assert.equal(item().progressMoments, undefined);
  assert.equal(resolveLandingSubmitMomentItem({ landingIdentityAtMs: 1000 }, item()), undefined);
});

test("[§106 R4] 통화 문면 — 현행 fv-h3vn만 열람본 근거 압박 · 은퇴 변형은 원문 · 라벨 동일", () => {
  assert.equal(extractTacticLabel(PROSECUTION_CASE_RECORD_TACTIC), extractTacticLabel(PROSECUTION_CASE_LINK_TACTIC));
  assert.ok(PROSECUTION_CASE_RECORD_TACTIC.includes("방금 보신 기록에 본인 명의로"));
  assert.ok(PROSECUTION_CASE_RECORD_TACTIC.includes("지어내 읽어 주지 않고"));
  assert.ok(findFlowVariant("fv-h3vn")!.tactics.includes(PROSECUTION_CASE_RECORD_TACTIC));
  assert.ok(!findFlowVariant("fv-h3vn")!.tactics.includes(PROSECUTION_CASE_LINK_TACTIC));
  for (const retired of ["fv-p4hz", "fv-c8wq"]) {
    const v = findFlowVariant(retired)!;
    assert.equal(v.retired, true);
    assert.ok(v.tactics.includes(PROSECUTION_CASE_LINK_TACTIC), `${retired}는 원문 유지`);
    assert.ok(!v.tactics.includes(PROSECUTION_CASE_RECORD_TACTIC));
  }
});

test("[§106 R5] 대처 문구 — 이름이 찍힌 기록도 방금 넣은 정보로 만든 가짜", () => {
  assert.ok(item().correctAction.includes("방금 입력한 정보를 그대로 찍어 보여 준 가짜 문서"));
});
