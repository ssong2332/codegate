// L3(이탈 차단 깊이) 모드 판정 — 순수 상수 + 순수 함수 (T85, Architecture.md §17.3/§17.5,
// ADR-0011, DECISIONS #43~#45, AC-074/AC-075).
//
// ⚠️ **이 파일은 `scenarios/axes.ts`를 import하지 않는다(ADR-0011 (A) 하드 제약, D-46).**
// §15.10.8은 원래 `SCENARIO_AXES[scenarioId].exitBlock`을 L3의 입력으로 인계했으나, T81이 전수
// 대조해 그 표가 **콘텐츠보다 좁다**는 것을 확인했다(D1·D2·D5에 걸쳐 9/13행 언더카운트, §17.1.1).
// 표의 오류는 전부 **누락**이고 허위 추가는 0건이라, 위험한 규칙은 정확히 하나 — **"D가 몇 개인가"를
// 세는 규칙**이다(누락 = 과소 계수 → 경계에서 오분류). 이 설계는 그 규칙을 제거한다:
//   - 초급은 **상한**(능력을 뺀다) → 시나리오가 무엇을 가졌는지 알 필요가 없다.
//   - 고급은 **하한**(능력을 더한다) → 표에 묻는 대신 **부여한다**.
// 그래서 축 표를 커버리지 목적으로 정정해도 **라이브 프롬프트가 조용히 바뀌지 않는다**(그 역도 성립).
//
// ⚠️ **이 표는 처방(prescription)이지 서술(description)이 아니다**(§17.5 정직 고지). "이 시나리오가
// D4를 *갖고 있다*"가 아니라 "이 시나리오의 고급에 D4를 *얹는다*"는 설계 결정이다. 각 행의 페르소나
// 적합성 판단이 맞다는 것은 여전히 사람의 판단이며 라이브 대조(T87)로만 확인된다.
import { hasVerifyIntercept } from "../scenarios/verifyIntercept";
import type { DifficultyLevel } from "../shared/difficulty";

/**
 * 고급에서 이 시나리오가 받는 L3 깊이.
 * - `d3_and_d4` — 확인 시도 무력화 메커닉(T83) + 절차·서류 정당화(D4) 블록
 * - `d4_only`   — 절차·서류 정당화(D4) 블록만(메커닉 없음)
 * - `reduced`   — L3 지시를 내지 않는다(L1·L2·L4는 그대로 적용된다, §17.7 옵션 A)
 */
export type L3DepthMode = "d3_and_d4" | "d4_only" | "reduced";

/**
 * **판정 질문은 오직 하나(§17.5)**: *"이 페르소나가 접수번호·처리 단계·기한·담당 부서를 말해도
 * 캐릭터가 무너지지 않는가."* 콘텐츠의 수법 수를 세지 않고, 축 표를 읽지 않는다.
 *
 * `procedural` = 고급에서 D4(절차·서류 정당화)를 얹는다 / `reduced` = 얹지 않는다.
 *
 * ⚠️ 키는 `PUBLIC_SCENARIOS`와 **1:1이어야 한다**(`__tests__/l3Depth.test.ts`의 `deepEqual` 게이트).
 * 시나리오가 추가되면 이 표를 채우기 전까지 테스트가 실패한다 — 조용한 누락 불가(기본값 `reduced`는
 * "에러 없이 고급이 축소되는" 실패 양식이라, 게이트가 없으면 아무도 모른다).
 */
export const L3_DEPTH_TABLE: Record<string, "procedural" | "reduced"> = {
  // ── procedural 10종 — "절차"를 말해도 캐릭터가 성립하는 페르소나 ──────────────
  // 기관·금융·서비스 사칭 6종(전부 hasVerifyIntercept=true → d3_and_d4)
  "institutional-impersonation": "procedural", // 수사·감독 기관: 사건번호·조사 절차가 페르소나 그 자체
  "card-company-impersonation": "procedural", // 카드사 보안팀: 접수번호·심사 단계가 자연스럽다
  "loan-refinance-scam": "procedural", // 캐피탈 상담원: PRD 근거 #5가 지목한 D4의 원형("서류까지 갖춰")
  "tax-refund-scam": "procedural", // 국세청 환급 담당: 접수·환급 절차
  "courier-customs-scam": "procedural", // 택배 고객센터: 운송장·통관 접수 절차
  // T95 신규(§17.10 계약 14항이 예고한 행) — 확인 무력화 전용 시나리오. `hasVerifyIntercept`가
  // true이므로 일관성 단언상 `procedural`이어야 한다(D3를 가졌는데 D4를 못 쓸 이유가 없다).
  "bank-security-verify-scam": "procedural", // 은행 금융사고대응팀: 사고 접수·처리 단계
  // 협박 2종 — 메커닉이 없어 d4_only. ⚠️ 기관 사칭이 아니므로 **공문·서류 톤은 쓰지 않는다**
  // (블록 안에 페르소나 조건형으로 명문화돼 있다, §17.6.1).
  "kidnapping-threat": "procedural", // 협박범도 "처리 기한·입금 확인" 형식은 쓴다
  "reputation-blackmail-scam": "procedural", // 동일. 이미 "노골적 시간 압박"이 절차형 기한 압박이다
  // 메신저 스미싱 2종 — 통화 셸이 없어 메커닉이 성립하지 않는다(d4_only).
  "messenger-parcel-smishing-sms": "procedural", // 국제택배: 운송장·반송 처리 절차
  "messenger-subsidy-smishing-sms": "procedural", // 지원금 안내: 신청 접수 절차(§17.6.2 G64 특례 대상)
  // ── reduced 4종 — 가족·지인 사칭 ─────────────────────────────────────────────
  // ⚠️ 아들·손주·친구가 접수번호를 부르면 **페르소나가 무너진다.** 이 4종의 고급은 L1·L2·L4만
  // 받으며(중급처럼 동작하지 않는다, §17.7), 축소 사실을 프롬프트 문자열에 쓰지 않는다(§17.6.3 —
  // 문구를 저작하면 모델이 훈련 내부 사정을 대사로 흘릴 위험이 있다). 기록은 `isL3Applied` + 테스트.
  "family-accident-deepvoice": "reduced",
  "grandchild-impersonation": "reduced",
  "messenger-child-impersonation-kakao": "reduced",
  "messenger-friend-loan-kakao": "reduced",
};

/**
 * 고급에서 이 시나리오가 받는 L3 깊이(§17.5 결정 규칙 — 순서 있는 if/then, 임의 판단 0).
 *
 * 1. `hasVerifyIntercept(id)` → `d3_and_d4`(D3 메커닉은 T83이 이미 배선했다 — 신규 게이트 0건)
 * 2. 아니고 `L3_DEPTH_TABLE[id] === "procedural"` → `d4_only`
 * 3. 아니면 → `reduced`
 *
 * ⚠️ 이 함수는 **난이도를 보지 않는다.** "고급일 때 무엇을 얹는가"만 정하며, 실제 적용 여부는
 * 조립 함수가 `difficultyLevel === "advanced"`일 때만 블록을 내보내는 것으로 결정된다.
 */
export function l3DepthMode(scenarioId: string): L3DepthMode {
  if (hasVerifyIntercept(scenarioId)) return "d3_and_d4";
  return L3_DEPTH_TABLE[scenarioId] === "procedural" ? "d4_only" : "reduced";
}

/**
 * 고급 프롬프트에 D4(절차·서류 정당화) 블록을 얹는가 = `buildSystemPrompt`의 `l3Procedural` 값.
 * **호출부 3곳(sendMessage·오프닝·Gemini Live 토큰)이 전부 이 함수를 써야 한다** — 한 곳이라도
 * 빠지면 그 경로에서만 고급이 조용히 축소된다(§17.11 G63, 기본값이 `reduced`라 에러가 나지 않는다).
 */
export function isL3Procedural(scenarioId: string): boolean {
  return l3DepthMode(scenarioId) !== "reduced";
}

/**
 * **파생 순수 함수 — 저장 필드가 아니다**(§17.7, AC-077 무스키마 유지). 이 세션의 고급에 L3가
 * 실제로 적용됐는가를 `(scenarioId, difficultyLevel)` 두 기존 값만으로 되돌려준다. `sessions/{}`에
 * 저장하면 파생 가능한 값이 두 곳에 살아 드리프트 원천이 된다(§15.4.1과 같은 논리).
 *
 * ⚠️ **G65 — 이 함수는 "어느 경로로 통화했는가"를 모른다.** ElevenLabs 실시간 경로(clone 2종)는
 * 난이도 자체가 미적용이라(§15.3.3, `difficultyApplied:false`) `isL3Applied`가 false인 이유가
 * "L3 축소"가 아니라 "난이도 전체 미적용"일 수 있다. 두 사실을 함께 읽어야 한다.
 */
export function isL3Applied(scenarioId: string, level: DifficultyLevel): boolean {
  return level === "advanced" && isL3Procedural(scenarioId);
}
