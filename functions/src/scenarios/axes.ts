// 수법 축(A~E) 데이터 모델 — T82 / AC-070 · AC-077, Architecture.md §15.10(ADR-0010, DECISIONS #41).
//
// **이 파일이 유일한 소스다(미러 0벌).** 축 태깅은 `ScenarioMeta`(publicMeta.ts)에도
// `ScenarioDoc`(src/content/scenarios/*.ts)에도 Firestore `scenarios/{}` 문서에도 클라 계약에도
// 들어가지 않는다(§15.10.2). 근거 요약:
//   - `scenarios/{}`는 클라 read 허용 문서(firestore.rules)라 거기 넣는 순간 축이 "화면에 갈 수
//     있는 값"이 된다. UX v1.12 **D-46**은 축을 사용자 화면 어디에도 표기하지 않는다고 확정했다 —
//     안 그리는 것보다 **계약에 아예 넣지 않는 것**이 강한 보장이다.
//   - 미러 드리프트 방어는 실제로 1/13 시나리오 × 3필드밖에 없고(scenarios.test.ts), 이미
//     `callerLabel`이 13/13 드리프트해 있다(§15.10.9 G38). 존재하지 않는 방어 위에 5축을 얹지 않는다.
//   - Firestore에 필드를 넣지 않으므로 **재시딩이 필요 없고**, 커버리지 산출이 배포 상태와 무관하게
//     항상 정확하다.
//
// **⚠️ 역방향 규칙(§15.10.9 G37)**: 클라(`src/`)가 축 값을 필요로 하는 순간은 D-46 위반이 논의되고
// 있다는 신호다. 미러를 만들지 말고 멈추고 ux-design에 확인한다.
//
// **⚠️ `tacticCategory`(functions/src/report/tacticCategory.ts)와는 직교다(OQ-U25 확정, §15.10.5).**
// 이 파일은 그 파일을 import하지 않고, 그 파일도 이 파일을 import하지 않는다. 축은 *콘텐츠의 설계
// 좌표*(저작 시점 상수)이고 `tacticCategory`는 *한 세션의 관측값*(런타임 분류)이라 부착 대상·기수·
// 정규화 방향이 전부 다르다. 명명 규칙으로 혼동을 막는다 — **축 값은 항상 코드 접두사를 갖고
// (`E2_credential_demand`), `tacticCategory` 값은 절대 갖지 않는다(`personal_info_demand`).**

import {
  FAMILY_ACCIDENT_SCENARIO_ID,
  INSTITUTIONAL_IMPERSONATION_SCENARIO_ID,
  LOAN_SCAM_SCENARIO_ID,
  TAX_REFUND_SCAM_SCENARIO_ID,
  GRANDCHILD_IMPERSONATION_SCENARIO_ID,
  CARD_COMPANY_IMPERSONATION_SCENARIO_ID,
  COURIER_CUSTOMS_SCAM_SCENARIO_ID,
  KIDNAPPING_THREAT_SCENARIO_ID,
  REPUTATION_BLACKMAIL_SCAM_SCENARIO_ID,
  MESSENGER_CHILD_IMPERSONATION_KAKAO_SCENARIO_ID,
  MESSENGER_FRIEND_LOAN_KAKAO_SCENARIO_ID,
  MESSENGER_PARCEL_SMISHING_SMS_SCENARIO_ID,
  MESSENGER_SUBSIDY_SMISHING_SMS_SCENARIO_ID,
} from "./publicMeta";

// ── (a) 축 값의 고정 열거형 5벌 (§15.10.1) ───────────────────────────────────
//
// **자유 문자열이 아니다**(AC-070). 자유 문자열이면 같은 축 값이 표기 차이로 흩어져 커버리지 산출과
// AC-068 수법 묶기가 동시에 무너진다 — T74에서 이미 확인된 실패 양식이다.
// **`other` 폴백을 두지 않는다** — 있으면 "태깅 없으면 등록 불가"가 무력화된다(§15.10.0-1).
// 값 이름은 `<PRD코드>_<의미>` 고정 형식이다: 코드만이면 오타(`D2`↔`D3`)가 눈에 안 보이고, 의미만이면
// PRD 표·AC-076 문면("A3·D3·D4·E3")과 대조할 때 매번 번역해야 한다.

/** A 접근 경로 — 사기범이 참가자에게 닿는 경로. */
export const AXIS_ACCESS = [
  "A1_cold_call",
  "A2_smishing_lure",
  "A3_post_install_contact",
  "A4_account_takeover",
] as const;

/** B 사칭 주체 — 사기범이 자처하는 신분. */
export const AXIS_IMPERSONATION = [
  "B1_authority",
  "B2_financial",
  "B3_service",
  "B4_family",
  "B5_acquaintance",
  "B6_unknown_threatener",
] as const;

/** C 압박 기제 — 판단을 흐리는 심리 지렛대. */
export const AXIS_PRESSURE = [
  "C1_fear_punishment",
  "C2_benefit_gain",
  "C3_urgency_time",
  "C4_shame_reputation",
  "C5_attachment_guilt",
  "C6_authority_obedience",
] as const;

/** D 이탈 차단 — 참가자가 확인·중단하러 나가는 것을 막는 수법.
 *  `D0_none`은 **"이탈 차단 수법이 없다"의 표현형**이다(§15.10.1). PRD 매핑 표가 D열에 "(없음)"이라
 *  적은 4종을 인코딩한 것이지 새 수법이 아니다. 빈 배열로 두면 **"수법 없음"과 "아직 태깅 안 함"을
 *  구분할 수 없게 되고**, 그 구분 불가가 정확히 AC-070이 막으려는 상태다. */
export const AXIS_EXIT_BLOCK = [
  "D0_none",
  "D1_time_pressure",
  "D2_secrecy",
  "D3_verification_hijack",
  "D4_procedural_legitimacy",
  "D5_call_retention",
  "D6_report_blocking",
] as const;

/** E 요구 형태 — 참가자에게 최종적으로 시키는 행동. */
export const AXIS_DEMAND = [
  "E1_transfer_demand",
  "E2_credential_demand",
  "E3_install_remote_demand",
  "E4_in_person_cash_demand",
  "E5_giftcard_crypto_demand",
  "E6_link_entry_demand",
] as const;

export type AxisAccess = (typeof AXIS_ACCESS)[number];
export type AxisImpersonation = (typeof AXIS_IMPERSONATION)[number];
export type AxisPressure = (typeof AXIS_PRESSURE)[number];
export type AxisExitBlock = (typeof AXIS_EXIT_BLOCK)[number];
export type AxisDemand = (typeof AXIS_DEMAND)[number];

/** 5축 전체 값의 합집합. 커버리지 산출·공백 선언이 이 타입을 키로 쓴다. */
export type AxisValue = AxisAccess | AxisImpersonation | AxisPressure | AxisExitBlock | AxisDemand;

export const AXIS_KEYS = ["access", "impersonation", "pressure", "exitBlock", "demand"] as const;
export type AxisKey = (typeof AXIS_KEYS)[number];

/** 축 키 → 그 축의 **전(全) 도메인**. 커버리지는 이 도메인을 순회한다(태깅된 값이 아니라).
 *  ⚠️ 이게 AC-076의 유일한 성립 조건이다 — 데이터를 순회하며 카운트를 올리면 0건 값은 키 자체가
 *  생기지 않아 **E4가 결과에서 조용히 사라진다**(§15.10.9 G39). */
export const AXIS_DOMAINS = {
  access: AXIS_ACCESS,
  impersonation: AXIS_IMPERSONATION,
  pressure: AXIS_PRESSURE,
  exitBlock: AXIS_EXIT_BLOCK,
  demand: AXIS_DEMAND,
} as const satisfies { readonly [K in AxisKey]: readonly AxisValue[] };

/** 리포트 스크립트(사람이 읽는 출력) 전용 축 이름. ⚠️ **사용자 화면 문구가 아니다** — D-46에 따라
 *  축은 값도 이름도 앱 화면 어디에도 표기하지 않는다. */
export const AXIS_LABEL: { readonly [K in AxisKey]: string } = {
  access: "A 접근 경로",
  impersonation: "B 사칭 주체",
  pressure: "C 압박 기제",
  exitBlock: "D 이탈 차단",
  demand: "E 요구 형태",
};

// ── (d) 태깅 누락 강제 1겹: 타입 (§15.10.4) ──────────────────────────────────
//
// 5축 **전부 required** + 각 축이 **비어 있지 않은 배열**(`readonly [T, ...T[]]`)이라 축을 통째로
// 빠뜨리거나 `exitBlock: []`로 두면 컴파일이 실패한다.
// 타입이 못 잡는 것은 "시나리오 **행 자체**를 안 만든 경우"다 — `PUBLIC_SCENARIOS`가
// `Record<string, ScenarioMeta>`라 TS가 망라성을 검사할 수 없다. 그 구멍은 2겹째인
// `deepEqual` 키 게이트(axisCoverage.test.ts)가 메운다.
export type ScenarioAxes = {
  readonly access: readonly [AxisAccess, ...AxisAccess[]];
  readonly impersonation: readonly [AxisImpersonation, ...AxisImpersonation[]];
  readonly pressure: readonly [AxisPressure, ...AxisPressure[]];
  readonly exitBlock: readonly [AxisExitBlock, ...AxisExitBlock[]];
  readonly demand: readonly [AxisDemand, ...AxisDemand[]];
};

// ── 13종 축 태깅 정본 표 (§15.10.7) ──────────────────────────────────────────
//
// 출처: PRD v1.6 "현재 13종 축 매핑" 표를 Architecture.md §15.10.7이 옮긴 것. **D열 "(없음)" 4종을
// `D0_none`으로 인코딩한 것이 유일한 차이**다. 좌표는 implementer가 추론하지 않았다 — 표 그대로다.
//
// 각 행의 주석은 그 좌표의 **근거**(어느 대사·어느 weakenedTactics 라벨)를 남긴 것이다(§15.10.4).
//
// ⚠️ **이 표가 증명하는 것과 증명하지 못하는 것(정직 고지, §15.10.4 계승).** `deepEqual` 게이트는
// 시나리오가 축 값을 **가졌다**는 사실만 고정한다. 값이 **맞다**는 사실은 고정하지 못한다 — 표를
// 갱신하는 사람의 판단이다. 실제로 **표가 콘텐츠보다 좁은 자리가 있다**(T82 실측, 아래 3건). 이는
// 콘텐츠 저작(T83~T85)·PRD 표 정정(planner) 소관이라 implementer가 임의로 좌표를 바꾸지 않았다:
//   1. `tax-refund-scam`의 weakenedTactics에 **"앱 설치 지시"**(taxRefundScam.prompt.ts:35)가 이미
//      있는데 표의 E열은 E2뿐이다. 문면대로면 E3(앱 설치·원격제어 요구)의 근거가 될 수 있다.
//   2. `courier-customs-scam`에 **"확인 절차 차단"** 라벨이 있는데 D열은 "(없음)" → `D0_none`이다.
//   3. `loan-refinance-scam`·`tax-refund-scam` 등 다수에 **"전화 끊음 저지"**(D5 계열)가 있으나
//      표는 D5를 싣지 않았다.
// → 즉 이 표는 시나리오의 **주된** 좌표를 적은 것이지 콘텐츠의 모든 수법을 망라한 것이 아니다.
//   커버리지 공백(특히 E3=0)을 읽을 때 이 사실을 함께 읽어야 한다.
export const SCENARIO_AXES: Record<string, ScenarioAxes> = {
  // A1 전화 수신 · B4 "엄마, 나야..."(딥보이스 line-1) · C5 "가족애·죄책감 이용" C3 "다급함 조성"
  // · D2 "아빠한테는 아직 말하지 말고"(line-3) D5 "전화 끊음 저지" · E1 "합의금 송금 요구"
  [FAMILY_ACCIDENT_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B4_family"],
    pressure: ["C5_attachment_guilt", "C3_urgency_time"],
    exitBlock: ["D2_secrecy", "D5_call_retention"],
    demand: ["E1_transfer_demand"],
  },
  // A1 전화 수신 · B1 "수사관입니다"(line-1) · C1 "불이익 암시" C6 "권위 암시" C3 "긴급성 조성"
  // · D2 "비밀 유지 요구" D5 "전화 끊음 저지" · E1 "안전계좌 이체 요구" E2 "신원정보 직접 요구"
  [INSTITUTIONAL_IMPERSONATION_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B1_authority"],
    pressure: ["C1_fear_punishment", "C6_authority_obedience", "C3_urgency_time"],
    exitBlock: ["D2_secrecy", "D5_call_retention"],
    demand: ["E1_transfer_demand", "E2_credential_demand"],
  },
  // A1 전화 수신 · B2 "○○캐피탈 상담원"(callerLabel) · C2 "이익 유혹" C3 "마감 압박"
  // · D1 "오늘까지만 신청 가능"(line-2, 시간으로 이탈을 막는다) · E1 "선상환 송금 요구"
  [LOAN_SCAM_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B2_financial"],
    pressure: ["C2_benefit_gain", "C3_urgency_time"],
    exitBlock: ["D1_time_pressure"],
    demand: ["E1_transfer_demand"],
  },
  // A1 전화 수신 · B1 "국세청 환급 담당"(line-1) · C2 "공짜 돈 유혹" C6 "권위 포장"
  // · D2 "다른 곳에 문의하시면 처리가 지연돼요"(line-3) · E2 "본인확인 빙자 정보 수집"
  [TAX_REFUND_SCAM_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B1_authority"],
    pressure: ["C2_benefit_gain", "C6_authority_obedience"],
    exitBlock: ["D2_secrecy"],
    demand: ["E2_credential_demand"],
  },
  // A1 전화 수신 · B4 "할머니, 나예요"(line-1) · C5 "애정·죄책감 이용" C3 "다급함 조성"
  // · D2 "비밀 유지 요구" · E1 "송금 직접 요구"
  [GRANDCHILD_IMPERSONATION_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B4_family"],
    pressure: ["C5_attachment_guilt", "C3_urgency_time"],
    exitBlock: ["D2_secrecy"],
    demand: ["E1_transfer_demand"],
  },
  // A1 전화 수신 · B2 "카드사 보안팀"(line-1) · C1 "놀람 유발"(부정결제 공포) C3 "긴급성 조성"
  // · D5 "전화 끊음 저지" · E2 "카드정보 직접 요구"
  [CARD_COMPANY_IMPERSONATION_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B2_financial"],
    pressure: ["C1_fear_punishment", "C3_urgency_time"],
    exitBlock: ["D5_call_retention"],
    demand: ["E2_credential_demand"],
  },
  // A1 전화 수신 · B3 "택배 고객센터"(line-1) · C3 "긴급성 조성"
  // · D0 PRD 표 D열 "(없음)" · E1 "통관비 결제 요구" E2 "개인정보 직접 요구"
  [COURIER_CUSTOMS_SCAM_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B3_service"],
    pressure: ["C3_urgency_time"],
    exitBlock: ["D0_none"],
    demand: ["E1_transfer_demand", "E2_credential_demand"],
  },
  // A1 전화 수신 · B6 "신원 불상 (협박범)"(callerLabel) · C1 "여지를 남긴 경고"·명령조
  // · D5 "전화 끊음 저지" D6 "신고 차단 지시" · E1 "즉시 송금 요구"
  [KIDNAPPING_THREAT_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B6_unknown_threatener"],
    pressure: ["C1_fear_punishment"],
    exitBlock: ["D5_call_retention", "D6_report_blocking"],
    demand: ["E1_transfer_demand"],
  },
  // A1 전화 수신 · B6 "신원 불상 (협박범)" · C4 "수치심 자극" C1 "가족·회사에 알려지길 원치 않으면"
  // · D2 "비밀 유지 미끼" · E1 "입막음 송금 요구"
  [REPUTATION_BLACKMAIL_SCAM_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B6_unknown_threatener"],
    pressure: ["C4_shame_reputation", "C1_fear_punishment"],
    exitBlock: ["D2_secrecy"],
    demand: ["E1_transfer_demand"],
  },
  // A2 메신저 선접촉 · B4 "엄마, 나야"(line-1) · C5 "가족애·죄책감 이용"
  // · D2 PRD 표 D열 D2 · E1 "송금 직접 요구"
  [MESSENGER_CHILD_IMPERSONATION_KAKAO_SCENARIO_ID]: {
    access: ["A2_smishing_lure"],
    impersonation: ["B4_family"],
    pressure: ["C5_attachment_guilt"],
    exitBlock: ["D2_secrecy"],
    demand: ["E1_transfer_demand"],
  },
  // A2 메신저 선접촉 · B5 "지인 (사칭)"(callerLabel) · C5 "친분 이용"
  // · D0 PRD 표 D열 "(없음)" · E1 "송금 직접 요구"
  [MESSENGER_FRIEND_LOAN_KAKAO_SCENARIO_ID]: {
    access: ["A2_smishing_lure"],
    impersonation: ["B5_acquaintance"],
    pressure: ["C5_attachment_guilt"],
    exitBlock: ["D0_none"],
    demand: ["E1_transfer_demand"],
  },
  // A2 스미싱 문자 · B3 "[국제택배]"(line-1) · C3 "긴급성 조성"
  // · D0 PRD 표 D열 "(없음)" · E6 "링크 클릭 유도"
  [MESSENGER_PARCEL_SMISHING_SMS_SCENARIO_ID]: {
    access: ["A2_smishing_lure"],
    impersonation: ["B3_service"],
    pressure: ["C3_urgency_time"],
    exitBlock: ["D0_none"],
    demand: ["E6_link_entry_demand"],
  },
  // A2 스미싱 문자 · B1 "[지원금 안내] ... 정부 지원금 대상자"(line-1) · C2 "이익 유혹"
  // · D0 PRD 표 D열 "(없음)" · E6 "링크 클릭 유도"
  [MESSENGER_SUBSIDY_SMISHING_SMS_SCENARIO_ID]: {
    access: ["A2_smishing_lure"],
    impersonation: ["B1_authority"],
    pressure: ["C2_benefit_gain"],
    exitBlock: ["D0_none"],
    demand: ["E6_link_entry_demand"],
  },
};
