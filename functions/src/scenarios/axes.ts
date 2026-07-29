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
  BANK_SECURITY_VERIFY_SCAM_SCENARIO_ID,
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
// ⚠️ **이 표가 증명하는 것과 증명하지 못하는 것(정직 고지, §15.10.4 계승).** `deepEqual` 키 게이트는
// 시나리오가 축 값을 **가졌다**는 사실만 고정한다. 값이 **맞다**는 사실은 고정하지 못한다 — 표를
// 갱신하는 사람의 판단이다. 그래서 실제로 **표가 콘텐츠보다 좁은 자리가 있었다**(T82 실측 3건 →
// architect 전수 대조에서 **9/13행 언더카운트**로 확대, Architecture.md §17.1.1, 갭 **G60**).
//
// **✅ D 좌표(`exitBlock`)는 T102에서 정정됐다(2026-07-27).** 아래 각 행의 D 값은 전부
// `*.prompt.ts`의 `weakenedTactics` 라벨을 근거로 달았고 **근거를 파일:줄로 함께 적었다** — 이 표의
// 실패 양식이 *"근거 없이 손으로 유지된 것"* 이었기 때문이다. 정정 범위는 **D 좌표뿐**이다:
//   - 신규 축 값 0건 / 시나리오 추가·삭제·개명 0건(AC-077).
//   - **A4·E4·E5의 0건은 좌표 재해석으로 채우지 않았다** — 콘텐츠 부재이지 태깅 누락이 아니다
//     (각각 OQ-43 · OQ-39 · MVP #32(T88) 소관).
//   - `tax-refund-scam`의 "앱 설치 지시"(E3 후보)는 **정정하지 않았다** — `docs/PRD.md:253`이
//     *"E3 0건(요구 문구로만 언급, **단계 미구현**)"* 이라고 이미 판정했고, 그 판정은 D 좌표
//     정정의 대상이 아니다(§17.1.1 경고 그대로).
//
// ⚠️ **재발 방지 게이트**: `__tests__/exitBlockEvidence.test.ts`가 `weakenedTactics` ↔ 이 표의
// `exitBlock`을 **양방향으로** 대조한다(누락도 허위 추가도 빨개진다). 콘텐츠에 이탈 차단 라벨을
// 추가·삭제하면 그 테스트가 먼저 깨지는 것이 정상이며, 이 표를 맞추는 것이 해소다.
// ⚠️ **난이도(L3)는 여전히 이 표를 읽지 않는다**(DECISIONS **#43**) — 이 정정은 그 결정을 되돌리는
// 근거가 아니라, 표가 *손으로 유지되는 요약*이라는 사실의 재확인이다.
export const SCENARIO_AXES: Record<string, ScenarioAxes> = {
  // A1 전화 수신 · B4 "엄마, 나야..."(딥보이스 line-1) · C5 "가족애·죄책감 이용" C3 "다급함 조성"
  // · D2 "확인 전화 차단 유도"(familyAccidentDeepvoice.prompt.ts:76) "확인 차단 지시"(:88)
  //   D5 "전화 끊음 저지"(:89) · E1 "합의금 송금 요구"
  [FAMILY_ACCIDENT_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B4_family"],
    pressure: ["C5_attachment_guilt", "C3_urgency_time"],
    exitBlock: ["D2_secrecy", "D5_call_retention"],
    demand: ["E1_transfer_demand"],
  },
  // A1 전화 수신 · B1 "수사관입니다"(line-1) · C1 "불이익 암시" C6 "권위 암시" C3 "긴급성 조성"
  // · D2 "확인 절차 차단"(institutionalImpersonation.prompt.ts:48) "비밀 유지 요구"(:61)
  //   D5 "전화 끊음 저지"(:62) · E1 "안전계좌 이체 요구" E2 "신원정보 직접 요구"
  [INSTITUTIONAL_IMPERSONATION_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B1_authority"],
    pressure: ["C1_fear_punishment", "C6_authority_obedience", "C3_urgency_time"],
    exitBlock: ["D2_secrecy", "D5_call_retention"],
    demand: ["E1_transfer_demand", "E2_credential_demand"],
  },
  // A1 전화 수신 · B2 "○○캐피탈 상담원"(callerLabel) · C2 "이익 유혹" C3 "마감 압박"
  // · D1 "마감 압박"(loanScam.prompt.ts:42 — 시간으로 이탈을 막는다) **D2 "확인 차단"(:60, T102 정정)**
  //   **D4 "절차·서류 정당화"(:59, T85)** **D5 "전화 끊음 저지"(:61, T102 정정)**
  // · E1 "선상환 송금 요구"
  //
  // ⚠️ **D4는 T85가 채운 콘텐츠 태깅이다**(Architecture.md §17.9, AC-076). 근거는 이 시나리오의
  // `weakenedTactics`에 추가된 `"절차·서류 정당화 — '접수번호 하나 남겨드릴게요' …"` 항목이며,
  // PRD 근거 데이터 #5가 이 시나리오를 D4의 원형("실제 상담처럼 서류까지 갖춰")으로 이름 지어
  // 지목했다. `DECLARED_COVERAGE_GAPS`의 D4 행 삭제가 그 해소 기록이다(axisCoverage.ts 규약).
  // ⚠️ **난이도 레버로서의 D4와는 다른 사안이다**(§17.9): 고급 프롬프트가 얹는 D4 오버레이는
  // `roleplay/l3Depth.ts`가 담당하며 **이 표에 써 넣지 않는다** — 이 표는 *중급 기준선* 좌표표다.
  // ⚠️ ~~다른 행의 D 좌표는 이 태스크에서 건드리지 않았다~~(§17.10 계약 13항) → **그 별건이 T102이며
  // 이 커밋이 9/13행 언더카운트를 정정한 것이다.** T85 시점에 섞지 않은 판단은 유지된다(AC-074 증거
  // 오염 방지 — 두 변인을 동시에 움직이지 않았다).
  [LOAN_SCAM_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B2_financial"],
    pressure: ["C2_benefit_gain", "C3_urgency_time"],
    exitBlock: [
      "D1_time_pressure",
      "D2_secrecy",
      "D4_procedural_legitimacy",
      "D5_call_retention",
    ],
    demand: ["E1_transfer_demand"],
  },
  // A1 전화 수신 · B1 "국세청 환급 담당"(line-1) · C2 "공짜 돈 유혹" C6 "권위 포장"
  // · D2 "확인 차단"(taxRefundScam.prompt.ts:54 — "다른 데 문의하시면 처리가 지연돼요")
  //   **D5 "전화 끊음 저지"(:55, T102 정정)** · E2 "본인확인 빙자 정보 수집"
  [TAX_REFUND_SCAM_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B1_authority"],
    pressure: ["C2_benefit_gain", "C6_authority_obedience"],
    exitBlock: ["D2_secrecy", "D5_call_retention"],
    demand: ["E2_credential_demand"],
  },
  // A1 전화 수신 · B4 "할머니, 나예요"(line-1) · C5 "애정·죄책감 이용" C3 "다급함 조성"
  // · D2 "확인 차단"(grandchildImpersonation.prompt.ts:65) "비밀 유지 요구"(:69)
  //   **D5 "전화 끊음 저지"(:70, T102 정정)** · E1 "송금 직접 요구"
  [GRANDCHILD_IMPERSONATION_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B4_family"],
    pressure: ["C5_attachment_guilt", "C3_urgency_time"],
    exitBlock: ["D2_secrecy", "D5_call_retention"],
    demand: ["E1_transfer_demand"],
  },
  // A1 전화 수신 · B2 "카드사 보안팀"(line-1) · C1 "놀람 유발"(부정결제 공포) C3 "긴급성 조성"
  // · **D2 "확인 절차 차단"(cardCompanyImpersonation.prompt.ts:47, T102 정정)**
  //   D5 "전화 끊음 저지"(:61) · E2 "카드정보 직접 요구"
  [CARD_COMPANY_IMPERSONATION_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B2_financial"],
    pressure: ["C1_fear_punishment", "C3_urgency_time"],
    exitBlock: ["D2_secrecy", "D5_call_retention"],
    demand: ["E2_credential_demand"],
  },
  // A1 전화 수신 · B3 "택배 고객센터"(line-1) · C3 "긴급성 조성"
  // · D2 "확인 절차 차단"(courierCustomsScam.prompt.ts:41) D5 "전화 끊음 저지"(:47)
  // · E1 "통관비 결제 요구" E2 "개인정보 직접 요구"
  //
  // ⚠️ **T102 정정 — 여기가 `D0_none`이던 것은 "이탈 차단 수법이 없다"는 적극적 주장이라
  // 사실과 달랐다**(§17.1.1: *"`D0`가 사실과 다르다"*). PRD 표 D열의 "(없음)"을 그대로 옮긴 것이
  // 원인이며, 콘텐츠에는 확인 차단·통화 유지 수법이 둘 다 실재한다.
  [COURIER_CUSTOMS_SCAM_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B3_service"],
    pressure: ["C3_urgency_time"],
    exitBlock: ["D2_secrecy", "D5_call_retention"],
    demand: ["E1_transfer_demand", "E2_credential_demand"],
  },
  // A1 전화 수신 · B6 "신원 불상 (협박범)"(callerLabel) · C1 "여지를 남긴 경고"·명령조
  // · **D2 "고립 유도"(kidnappingThreat.prompt.ts:42) "확인 차단"(:44) — T102 정정**
  //   D5 "전화 끊음 저지"(:57) D6 "신고 차단 지시"(:56) · E1 "즉시 송금 요구"
  //
  // ⚠️ **"촉박한 결정 압박"(:58)은 D1로 세지 않는다** — §17.1.1 전수 대조가 이 라벨을 D 계열로
  // 계수하지 않았고(막연한 시간 제한이라 C축 압박에 가깝다), 재판정은 이 태스크 범위 밖이다.
  [KIDNAPPING_THREAT_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B6_unknown_threatener"],
    pressure: ["C1_fear_punishment"],
    exitBlock: ["D2_secrecy", "D5_call_retention", "D6_report_blocking"],
    demand: ["E1_transfer_demand"],
  },
  // A1 전화 수신 · B6 "신원 불상 (협박범)" · C4 "수치심 자극" C1 "가족·회사에 알려지길 원치 않으면"
  // · **D1 "노골적 시간 압박"(reputationBlackmailScam.prompt.ts:37, T102 정정)**
  //   D2 "비밀 유지 미끼"(:36) "확인 차단"(:38) "주변 확인 차단"(:41)
  //   **D5 "전화 끊음 저지"(:42, T102 정정)** · E1 "입막음 송금 요구"
  [REPUTATION_BLACKMAIL_SCAM_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B6_unknown_threatener"],
    pressure: ["C4_shame_reputation", "C1_fear_punishment"],
    exitBlock: ["D1_time_pressure", "D2_secrecy", "D5_call_retention"],
    demand: ["E1_transfer_demand"],
  },
  // A2 메신저 선접촉 · B4 "엄마, 나야"(line-1) · C5 "가족애·죄책감 이용"
  // · D2 "확인 전화 차단 유도"(messengerChildImpersonationKakao.prompt.ts:56) "원격 확인 차단"(:59)
  // · E1 "송금 직접 요구"
  //
  // ⚠️ D5는 없다 — 이 시나리오에는 "전화 끊음 저지" 라벨이 없다(§17.1.1 "일치" 4행 중 하나).
  [MESSENGER_CHILD_IMPERSONATION_KAKAO_SCENARIO_ID]: {
    access: ["A2_smishing_lure"],
    impersonation: ["B4_family"],
    pressure: ["C5_attachment_guilt"],
    exitBlock: ["D2_secrecy"],
    demand: ["E1_transfer_demand"],
  },
  // A2 메신저 선접촉 · B5 "지인 (사칭)"(callerLabel) · C5 "친분 이용"
  // · D0 이탈 차단 수법 **없음** · E1 "송금 직접 요구"
  //
  // ⚠️ **T102에서 `D0_none`이 유지된 유일한 행이다.** `messengerFriendLoanKakao.prompt.ts`의
  // `weakenedTactics` 6개(:33~:45)에 D 계열 라벨이 하나도 없다는 것이 근거다(§17.1.1 "D 계열 라벨
  // 없음" — 나머지 3행의 `D0_none`은 사실과 달라 정정됐다).
  [MESSENGER_FRIEND_LOAN_KAKAO_SCENARIO_ID]: {
    access: ["A2_smishing_lure"],
    impersonation: ["B5_acquaintance"],
    pressure: ["C5_attachment_guilt"],
    exitBlock: ["D0_none"],
    demand: ["E1_transfer_demand"],
  },
  // A2 스미싱 문자 · B3 "[국제택배]"(line-1) · C3 "긴급성 조성"
  // · D2 "확인 절차 차단"(messengerParcelSmishingSms.prompt.ts:39) · E6 "링크 클릭 유도"
  //
  // ⚠️ **T102 정정 — `D0_none`이 사실과 달랐다**(§17.1.1). D5는 없다(문자 채널이라 "전화 끊음
  // 저지" 라벨 자체가 없다) — 정정은 콘텐츠에 실재하는 D2 하나뿐이다.
  [MESSENGER_PARCEL_SMISHING_SMS_SCENARIO_ID]: {
    access: ["A2_smishing_lure"],
    impersonation: ["B3_service"],
    pressure: ["C3_urgency_time"],
    exitBlock: ["D2_secrecy"],
    demand: ["E6_link_entry_demand"],
  },
  // A2 스미싱 문자 · B1 "[지원금 안내] ... 정부 지원금 대상자"(line-1) · C2 "이익 유혹"
  // · D2 "확인 절차 차단"(messengerSubsidySmishingSms.prompt.ts:66) · E6 "링크 클릭 유도"
  //
  // ⚠️ **T102 정정 — `D0_none`이 사실과 달랐다**(§17.1.1). parcel과 같은 이유로 D5는 없다.
  //
  // ⚠️ **T84 증분(3단계 결합 — AC-072/AC-073/AC-076, OQ-42 확정 "(b) 지원금 문자 확장")**:
  // 이 시나리오가 ① 미끼 문자 → ② 모의 앱 설치 → ③ 통화로 확장되면서 두 축 값이 채워진다.
  //   - **E3**: weakenedTactics의 "앱 설치·권한 허용 유도"(`[[LINK:subsidy-install]]` → UX-023
  //     kind=`app-install`)가 최종 요구 형태로 추가됐다. 기존 E6(링크 클릭)는 그대로 성립한다 —
  //     설치 링크를 누르는 행위 자체는 여전히 링크 진입이다.
  //   - **A3**: PRD의 3단계 결합 정의가 `A2→E3→A1/A3 통화`이고 A3는 *"악성앱이 이미 깔린
  //     상태에서의 통화·알림"*이다(PRD "축 체계" A열). 이 시나리오의 3단계 통화는 설치·권한
  //     허용을 마친 **뒤에** 걸려오므로 A3에 해당한다. 진입 경로 A2는 그대로 유지한다(둘 다 참).
  // 두 값이 채워지면 `DECLARED_COVERAGE_GAPS`의 해당 행을 삭제하는 것이 "해소 기록"이다
  // (axisCoverage.ts 주석 — T83~T85 규약).
  [MESSENGER_SUBSIDY_SMISHING_SMS_SCENARIO_ID]: {
    access: ["A2_smishing_lure", "A3_post_install_contact"],
    impersonation: ["B1_authority"],
    pressure: ["C2_benefit_gain"],
    exitBlock: ["D2_secrecy"],
    demand: ["E6_link_entry_demand", "E3_install_remote_demand"],
  },
  // ── T95 신규(14번째) — 확인 시도 무력화(D3) 전용 시나리오 ────────────────────
  //
  // ⚠️ **이 행의 좌표는 PRD 표에서 옮겨온 것이 아니다.** PRD v1.6의 "현재 13종 축 매핑" 표는
  // 이름 그대로 **기존 13종**의 정본이고, 이 시나리오는 그 표가 작성된 뒤 OQ-41 확정("레버 +
  // 전용 1종")에 따라 신설됐다. 좌표는 아래 근거대로 **저작 시점에 결정**했으며, PRD 표에 14번째
  // 행을 추가하는 것은 planner 소관이다(implementer는 PRD를 수정하지 않는다 — 보고에 요청으로 남김).
  //
  // A1 전화 수신(콜드콜) · B2 "○○은행 금융사고대응팀"(line-1 — 기관이 아니라 금융기관 사칭이라
  // B1이 아니다) · C1 "비정상 출금 시도" 공포 C3 "몇 분 안에 결정하셔야" · **D3 "확인 시도
  // 무력화"**(이 시나리오의 존재 이유 — bankSecurityVerifyScam.prompt.ts:54 + verifyIntercept.ts 카탈로그
  // `bank-security-verify-desk`) · E2 "본인확인 정보 직접 요구" E1 "보호계좌 이체 요구"
  //
  // ⚠️ **D열에 D3만 있는 것은 누락이 아니라 설계다.** 확인을 *막는* 수법(D2 비밀유지·D5 전화 끊음
  // 저지)을 함께 태깅하려면 콘텐츠에 그 수법이 있어야 하는데, 이 시나리오는 정반대로 확인을
  // 권하는 캐릭터라 두 수법이 한 통화 안에서 서로를 부정한다(bankSecurityVerifyScam.prompt.ts
  // 상단 근거). 그래서 프롬프트에도 넣지 않았고 여기에도 넣지 않았다.
  // ⚠️ **D4(절차·서류 정당화)는 태깅하지 않는다** — 아직 0건이며 MVP #31(T85) 몫이다. 여기서
  // 임의로 채우면 T85의 범위를 앞당겨 먹는 스코프 크립이고, `DECLARED_COVERAGE_GAPS`의 D4 행과도
  // 어긋난다.
  // ⚠️ **T102 무변경 행이다.** 이 시나리오는 §17.1.1 전수 대조(13종) 대상이 아니었으나 재대조 결과
  // `weakenedTactics`(:54~:64)에 D2·D5 계열 라벨이 **0건**이라 위 저작 시점 근거를 뒤집을 실측이
  // 없다 — 그래서 건드리지 않았다(Tasks.md T102 C항 ①).
  [BANK_SECURITY_VERIFY_SCAM_SCENARIO_ID]: {
    access: ["A1_cold_call"],
    impersonation: ["B2_financial"],
    pressure: ["C1_fear_punishment", "C3_urgency_time"],
    exitBlock: ["D3_verification_hijack"],
    demand: ["E2_credential_demand", "E1_transfer_demand"],
  },
};
