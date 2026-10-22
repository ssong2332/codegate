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
//
// ⭐ §109(2026-10-22 사용자 실기 요청 — *"담당 부서나 담당 검사가 'OO수사본부'처럼 적혀 있는데 … 더 사실적인 문서로"*) — 가림 표시 → 가상 고유명.
// | # | 무엇을 보나 | 기대 |
// |---|---|---|
// | N1 | 문서 = 통화 이름 | 문서 기관명 · 담당 부서 · 담당 검사 · 담당 수사관 · 결재 성 = `CASE_RECORD_NAMES` · 문서 문자열에 "OO" 0 |
// | N2 | 실존과 겹침 0 | 가상 기관명의 지역 자리("한빛")가 실존 지방검찰청 · 지청 지역명 표에 없음 · 인물 이름이 알려진 실존 사례 표에 없음 |
// | N3 | 허용 예외가 좁다 | 정확 일치 1벌만 가린다 — 다른 지역명 + "지방검찰청" · "검찰청" 단독은 그대로 걸린다(역검증) |
// | N4 | 통화 문면 | 현행 fv-h3vn 조립 프롬프트 = 같은 이름 · "OO지방검찰청" 명칭 줄 0 · 같은 라벨 "권위 암시" 교체 · 은퇴 변형 · 다른 시나리오는 종전 OO 규칙 |
// | N5 | 문서 칸 | 반 칸 라벨 ⊂ 입력 칸 · 발급 정보 라벨 3개 · 결재란 3칸 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { findFlowVariant, resolveSessionScenarioPrompt } from "../flowVariants";
import { findMockScreenItem, MOCK_SCREENS } from "../mockScreens";
import { sessionReachableLandingIds } from "../reachability";
import { extractTacticLabel } from "../tacticFlavor";
import {
  CASE_RECORD_NAMES,
  PROSECUTION_CASE_LINK_PERSONA,
  PROSECUTION_CASE_LINK_TACTIC,
  PROSECUTION_CASE_RECORD_AUTHORITY_TACTIC,
  PROSECUTION_CASE_RECORD_TACTIC,
  PROSECUTION_SITE_PERSONA,
} from "../prosecutionCooperationCall.prompt";
import { resolveLandingSubmitMomentItem } from "../../report/smsTimeline";
import { buildSystemPrompt } from "../../roleplay/promptAssembly";
import {
  FICTIONAL_INSTITUTION_NAMES,
  LONG_DIGIT_SEQUENCE,
  maskFictionalInstitutionNames,
  REAL_WORLD_INSTITUTION_NAMES,
  scanText,
} from "./harmlessnessPatterns";

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
    doc.issuer,
    doc.title,
    doc.documentNumber,
    doc.subjectHeading,
    doc.stampLabel,
    doc.sealLabel,
    doc.footerNotice,
    ...doc.issueLabels,
    ...doc.noticeLines,
    ...[...doc.caseRows, ...doc.subjectRows, ...doc.approvalRows].flatMap((row) => [row.label, row.value]),
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
  // §109 — 허용 목록의 가상 기관명(정확 일치)만 가리고 본다(아래 N3이 예외의 폭을 고정한다).
  assert.deepEqual(
    texts.filter((t) => REAL_WORLD_INSTITUTION_NAMES.some((name) => maskFictionalInstitutionNames(t).includes(name))),
    [],
    "실존 기관명",
  );
  assert.deepEqual(texts.flatMap((t) => scanText(t, "mockSurface")), [], "mockSurface 프로파일 전체");
  assert.deepEqual(texts.filter((t) => LONG_DIGIT_SEQUENCE.test(t)), [], "8자리 이상 연속 숫자");
  assert.deepEqual(texts.filter((t) => /https?:\/\/|www\.|\.(kr|com|go)\b/.test(t)), [], "주소 꼴");
  assert.deepEqual(
    item().recordDocument!.caseRows.map((row) => row.label),
    ["사건번호", "진행 상태", "죄명", "담당 부서", "담당 검사", "담당 수사관"],
  );
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

// ── §109 — 가상 고유명 · 공문서 양식 ─────────────────────────────────────────────────────────────

/**
 * 실존 지방검찰청(현 지방공소청) · 지청의 지역 자리. 출처 = 공소청(옛 대검찰청) 공식 누리집 spo.go.kr 첫 화면의 "전국공소청 바로가기"
 * (조회 2026-10-23 · 광역 6 · 지방 18 · 지청 42 — 대구 · 부산의 "서부지청" · "동부지청"은 상위 청 지역명을 붙여 적었다). 이름 체계가
 * "지방공소청"으로 바뀌었어도 지역 자리는 같으므로 옛 "지방검찰청" 이름과의 겹침도 이 표로 본다.
 */
const REAL_PROSECUTION_OFFICE_REGIONS = [
  "서울중앙", "서울동부", "서울남부", "서울북부", "서울서부", "의정부", "인천", "수원", "춘천", "대전", "청주", "대구", "부산", "울산",
  "창원", "광주", "전주", "제주",
  "고양", "남양주", "부천", "성남", "여주", "평택", "안산", "안양", "강릉", "원주", "속초", "영월", "홍성", "공주", "논산", "서산",
  "천안", "충주", "제천", "영동", "안동", "경주", "포항", "김천", "상주", "의성", "영덕", "대구서부", "부산동부", "부산서부", "마산",
  "진주", "통영", "밀양", "거창", "목포", "장흥", "순천", "해남", "군산", "정읍", "남원", "서울",
];
/** 웹 검색으로 같은 이름의 현직 검사가 나온 이름(2026-10-22 — 사용 금지 표 · 근거 docs/Architecture.md §109). */
const KNOWN_REAL_PROSECUTOR_NAMES = ["김도윤"];
/**
 * 실존 공식 부서명 표본 — 금융 · 경제 사건을 맡는 두 청의 "조직 및 업무" 페이지(spo.go.kr · 조회 2026-10-23 — 서울중앙지방공소청 ·
 * 서울남부지방공소청)와 옛 직제 이름(메인 세션이 물은 "금융조사2부" 등). 가상 부서명은 이 표와 정확히 같으면 안 된다.
 */
const KNOWN_REAL_DEPARTMENT_NAMES = [
  "조세범죄조사부", "중요범죄조사부", "공정거래조사부", "중요경제범죄조사단", "범죄수익환수부", "국제범죄수사부", "정보기술범죄수사부",
  "강력범죄수사부", "금융·기업범죄전담부", "금융·교육범죄전담부", "기업·금융공정거래범죄전담부", "조세·유사수신·가상자산관련범죄전담부",
  "중요경제범죄대응단", "금융조사부", "금융조사1부", "금융조사2부", "금융범죄수사부", "금융·증권범죄합동수사단",
];

test("[§109 N1] 문서의 기관명 · 담당 부서 · 담당 검사 · 담당 수사관 · 결재 성 = 통화 이름 상수 · 가림 표시 0", () => {
  const doc = item().recordDocument!;
  const value = (label: string) => doc.caseRows.find((row) => row.label === label)?.value;
  assert.equal(doc.issuer, CASE_RECORD_NAMES.office);
  assert.equal(value("담당 부서"), CASE_RECORD_NAMES.department);
  assert.equal(value("담당 검사"), CASE_RECORD_NAMES.prosecutor);
  assert.equal(value("담당 수사관"), CASE_RECORD_NAMES.investigator);
  assert.deepEqual(
    doc.approvalRows.map((row) => row.value),
    [CASE_RECORD_NAMES.investigator[0], CASE_RECORD_NAMES.prosecutor[0], "전결"],
  );
  assert.deepEqual(documentTexts().filter((t) => /OO|○○/.test(t)), [], "가림 표시");
});

test("[§109 N2] 가상 이름이 실존 청 · 지청 · 알려진 실존 인물과 겹치지 않는다", () => {
  assert.deepEqual(FICTIONAL_INSTITUTION_NAMES, [CASE_RECORD_NAMES.office]);
  const region = CASE_RECORD_NAMES.office.replace("지방검찰청", "");
  assert.equal(region, "한빛");
  assert.equal(REAL_PROSECUTION_OFFICE_REGIONS.includes(region), false);
  assert.deepEqual(REAL_PROSECUTION_OFFICE_REGIONS.filter((real) => CASE_RECORD_NAMES.office.startsWith(real)), []);
  for (const name of [CASE_RECORD_NAMES.prosecutor, CASE_RECORD_NAMES.investigator]) {
    assert.equal(KNOWN_REAL_PROSECUTOR_NAMES.includes(name), false, name);
  }
  assert.equal(KNOWN_REAL_DEPARTMENT_NAMES.includes(CASE_RECORD_NAMES.department), false, "실존 공식 부서명");
  // 역검증 — 표가 실제로 실존 이름을 잡는다(메인 세션이 물은 예).
  assert.ok(KNOWN_REAL_DEPARTMENT_NAMES.includes("금융조사2부"));
  assert.ok(REAL_PROSECUTION_OFFICE_REGIONS.includes("서울남부"));
});

test("[§109 N3] 허용 예외는 정확 일치 1벌 — 다른 지역명 + 지방검찰청 · 검찰청 단독은 그대로 걸린다(역검증)", () => {
  // scenarioDefectsRound2.test.ts §104 결함7과 같은 정규식.
  const REAL_INSTITUTION = /서울중앙지|중앙지검|대검찰청|[가-힣]{2}지방검찰청|[가-힣]{2}지검|금융범죄수사부|사이버수사대|[가-힣]{2}경찰서/;
  assert.equal(maskFictionalInstitutionNames(`${CASE_RECORD_NAMES.office} ${CASE_RECORD_NAMES.department}`).match(REAL_INSTITUTION), null);
  for (const real of ["부산지방검찰청", "한빛지검", "대검찰청"]) {
    assert.notEqual(maskFictionalInstitutionNames(real).match(REAL_INSTITUTION), null, real);
  }
  assert.deepEqual(scanText(CASE_RECORD_NAMES.office, "mockSurface"), []);
  assert.notDeepEqual(scanText("부산지방검찰청", "mockSurface"), [], "다른 지역명은 걸린다");
  assert.notDeepEqual(scanText("검찰청 안내", "mockSurface"), [], "검찰청 단독은 걸린다");
  // 가린 뒤에도 길이가 같다(발췌 위치 보존).
  assert.equal(maskFictionalInstitutionNames(`가${CASE_RECORD_NAMES.office}나`).length, CASE_RECORD_NAMES.office.length + 2);
});

test("[§109 N4] 통화 문면 — 현행 fv-h3vn = 문서와 같은 이름 · 은퇴 변형과 다른 시나리오는 종전 OO 규칙", () => {
  const ooLine = '기관 이름을 말할 때는 "OO지방검찰청"·"OO수사본부"처럼 앞에 OO를 붙인 이름으로만 말한다.';
  assert.ok(PROSECUTION_CASE_LINK_PERSONA.includes(ooLine), "은퇴 변형 원천은 그대로");
  assert.equal(PROSECUTION_SITE_PERSONA.includes(ooLine), false);
  const self = `${CASE_RECORD_NAMES.office} ${CASE_RECORD_NAMES.department} ${CASE_RECORD_NAMES.investigator} 수사관`;
  assert.ok(PROSECUTION_SITE_PERSONA.includes(self));
  assert.ok(PROSECUTION_SITE_PERSONA.includes(`${CASE_RECORD_NAMES.prosecutor} 검사`));
  assert.ok(PROSECUTION_CASE_RECORD_AUTHORITY_TACTIC.includes(self));
  assert.equal(extractTacticLabel(PROSECUTION_CASE_RECORD_AUTHORITY_TACTIC), "권위 암시");
  const current = findFlowVariant("fv-h3vn")!;
  assert.ok(current.tactics.includes(PROSECUTION_CASE_RECORD_AUTHORITY_TACTIC));
  assert.equal(current.tactics.filter((t) => extractTacticLabel(t) === "권위 암시").length, 1, "같은 라벨 1개");
  const prompt = resolveSessionScenarioPrompt(PROS, "fv-h3vn");
  assert.ok(prompt);
  const assembled = buildSystemPrompt(prompt, { difficultyLevel: "advanced", liveSpeechStyle: true, toolDrivenTiming: true });
  assert.ok(assembled.includes(self), "조립 프롬프트에 문서와 같은 이름");
  for (const retired of ["fv-p4hz", "fv-c8wq"]) {
    assert.equal(findFlowVariant(retired)!.tactics.includes(PROSECUTION_CASE_RECORD_AUTHORITY_TACTIC), false, retired);
  }
});

test("[§109 N5] 문서 칸 — 반 칸 라벨 ⊂ 입력 칸 · 발급 정보 라벨 3개 · 결재란 3칸 · 반 칸은 둘씩 짝", () => {
  const doc = item().recordDocument!;
  assert.deepEqual(doc.subjectHalfLabels.filter((label) => !(item().fields ?? []).includes(label)), []);
  assert.deepEqual(doc.issueLabels, ["열람 신청 번호", "발급 일시", "열람 만료"]);
  assert.deepEqual(doc.approvalRows.map((row) => row.label), ["수사관", "검사", "부장검사"]);
  assert.equal(doc.sealLabel.includes(CASE_RECORD_NAMES.office), false, "관인 안에 기관명(실제 관인 문안 꼴) 0");
  const halves = doc.caseRows.map((row) => row.half === true);
  for (let i = 0; i < halves.length; i += 1) {
    if (halves[i]) {
      assert.equal(halves[i + 1], true, `${doc.caseRows[i].label}의 짝`);
      i += 1;
    }
  }
});
