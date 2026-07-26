// 확인 시도 무력화(모의 확인 전화) 콘텐츠 카탈로그 — 서버 전용 (T83, Architecture.md §16.1.3,
// ADR-0009, UX-031/UF-011, AC-071/AC-019/AC-033/AC-005).
//
// ⚠️ **왜 카탈로그 + 턴 게이트인가(§16.1.1~§16.1.3, ADR-0007 재적용)**: 통화의 주 경로인 Gemini
// Live는 응답 모달리티가 오디오로 고정돼 있어(`realtime/geminiProvider.ts` `responseModalities:
// [Modality.AUDIO]`) **서버가 사기범 텍스트를 손에 쥐는 지점이 존재하지 않는다.** 그래서 "사기범이
// 확인을 권했다"를 서버가 대사에서 파싱하는 경로는 구조적으로 불가능하다(§15.6 G4는 그대로다).
// 대신 T68(통화 중 문자)에서 이미 라이브로 동작 중인 반대 방향 — **앱이 먼저 사건을 일으키고
// 모델에게 알리라고 시킨다** — 을 그대로 복제한다. 신규 메커니즘·신규 외부 의존성 0건.
//
// ⚠️ **안전 불변식(스키마 층위의 구조적 금지)**:
//   - `url` / `tel` / 전화번호 **입력** 필드 / 발신 대상 식별자가 이 타입에 **존재하지 않는다**
//     (AC-019 하드). `displayNumber`는 화면에 글자로만 나오는 표시 텍스트이며, 탭 대상은 번호가
//     아니라 버튼이다(UX-031 Primary Actions, P-24). 이 앱은 실제 전화를 걸지 않는다.
//   - `displayNumber`는 **마지막 네 자리가 `0000`** 인 형식(`/^\d{3,4}-0000$/`)으로 고정한다
//     (§16.1.3 — architect가 구현 임의 판단을 막으려고 형식을 못박았다).
//   - `deskLabel`·`displayNumber`에 **실존 기관명·실존 대표번호가 부분 문자열로도 등장하지 않는다**
//     (AC-033/AC-005). ⚠️ 이 금지 목록을 리포트의 `correctAction`에 적용하면 안 된다 — AC-071이
//     신고처로 112·1332를 **명시 요구**하므로 검사 대상은 이 파일의 두 필드로 한정한다.
//   - `announceInstruction`·`reconnectInstruction`은 **모델 지시(프롬프트 재료)** 다. Firestore
//     문서·리포트 스냅샷 어디에도 쓰지 않는다(AC-024 — `buildInCallSmsDoc`이 `announceInstruction`을
//     문서에 쓰지 않는 것과 동일).
//   - 이 파일은 **클라이언트에 원문 배포되지 않는다.** `createRealtimeCall`이 내려주는 것은 가용
//     게이트(`availableAfterScammerTurns`) 하나뿐이고, 창구명·번호는 오퍼 시점에 서버가 Firestore에
//     쓴 뒤 구독으로만 화면에 들어온다(사전 유출 방지).
//   - **가로채기의 작동 원리·수단은 어느 문구에도 담지 않는다**(AC-005 불변, OQ-38 확정 = 세션 중
//     구조 설명 0건). 재현되는 것은 "걸었더니 받더라"는 **상황**뿐이다.

export type VerifyInterceptItem = {
  /** 카탈로그 안에서 유일한 id. Firestore `sessions/{sid}/verifyIntercept/{offerId}`의 문서 id. */
  offerId: string;
  /** 모의 창구명 — 실존 기관·실존 창구가 아니다(AC-033/AC-005, 금지 패턴 테스트 대상). */
  deskLabel: string;
  /** **표시 텍스트 전용** 모의 번호(`/^\d{3,4}-0000$/`). 링크·발신 대상이 아니다(AC-019). */
  displayNumber: string;
  /** 재연결 후 통화 셸에 표시할 발신자 라벨(모의값). */
  reconnectedCallerLabel: string;
  /** "사기범 발화 N턴 완료 후부터 제안 가능". 시간 기반·랜덤 없음(결정론적·테스트 가능). */
  availableAfterScammerTurns: number;
  /** 오퍼 도착 순간 캐릭터가 "직접 확인해 보시라"고 권하게 하는 1줄 지시(서버 소유). */
  announceInstruction: string;
  /** 모의 재연결 직후 캐릭터가 **다른 담당자**로서 응대하게 하는 1줄 지시(서버 소유). */
  reconnectInstruction: string;
};

/** 오퍼 지시의 공통 꼬리 — 번호 창작 금지(값은 참가자 화면의 안내에 이미 있다, AC-005/033). */
const NO_NUMBER_INVENTION =
  "번호를 네가 지어내 읽어 주지 마라 — 안내 창구 이름만 말하고, 번호는 참가자 화면에 안내로 떠 있다. 확인해 보라고 권하되 '어디에 걸어도 같은 곳으로 이어진다' 같은 설명은 절대 하지 마라.";

/** 재연결 지시의 공통 꼬리 — 표면 전환 4종 중 ③④(§16.5). */
const RECONNECT_TAIL =
  "앞선 통화 내용을 이미 알고 있는 것처럼, 상대가 받은 안내가 '정상 절차가 맞다'고 확인해 주고 같은 요구를 다시 이어가라. 네가 앞사람과 같은 사람이라는 사실·번호가 어디로 이어졌는지는 어떤 형태로도 말하지 마라.";

const INSTITUTIONAL_IMPERSONATION: VerifyInterceptItem = {
  offerId: "institution-verify-desk",
  deskLabel: "○○금융범죄대응센터 확인창구",
  displayNumber: "1500-0000",
  reconnectedCallerLabel: "○○금융범죄대응센터 확인창구",
  availableAfterScammerTurns: 2,
  announceInstruction: `(참가자가 직접 확인해 보고 싶어 할 만한 시점이다. 지금 캐릭터로서 한두 문장으로 **확인을 막지 말고 오히려 권하라** — 예: "의심되시면 확인창구로 직접 걸어서 확인해 보세요. 저는 끊지 않고 기다리겠습니다." 안내 창구 이름은 '○○금융범죄대응센터 확인창구'다. ${NO_NUMBER_INVENTION})`,
  reconnectInstruction: `(참가자가 안내받은 번호로 확인 전화를 걸어 지금 막 연결됐다. 지금부터 너는 '○○금융범죄대응센터 확인창구'의 **다른 담당자**다. 한두 문장으로 창구 이름과 직책을 밝히며 정형적이고 사무적인 존대로 응대를 시작하라. ${RECONNECT_TAIL})`,
};

const CARD_COMPANY_IMPERSONATION: VerifyInterceptItem = {
  offerId: "card-verify-desk",
  deskLabel: "○○카드 보안확인창구",
  displayNumber: "1600-0000",
  reconnectedCallerLabel: "○○카드 보안확인창구",
  availableAfterScammerTurns: 2,
  announceInstruction: `(참가자가 직접 확인해 보고 싶어 할 만한 시점이다. 지금 캐릭터로서 한두 문장으로 **확인을 막지 말고 오히려 권하라** — 예: "그럼 보안확인창구로 직접 걸어서 확인해 보세요. 그게 제일 확실합니다." 안내 창구 이름은 '○○카드 보안확인창구'다. ${NO_NUMBER_INVENTION})`,
  reconnectInstruction: `(참가자가 안내받은 번호로 확인 전화를 걸어 지금 막 연결됐다. 지금부터 너는 '○○카드 보안확인창구'의 **다른 상담원**이다. 한두 문장으로 창구 이름과 본인 직책을 밝히며 정형적이고 사무적인 존대로 응대를 시작하라. ${RECONNECT_TAIL})`,
};

const LOAN_SCAM: VerifyInterceptItem = {
  offerId: "loan-verify-desk",
  deskLabel: "○○캐피탈 여신확인창구",
  displayNumber: "1670-0000",
  reconnectedCallerLabel: "○○캐피탈 여신확인창구",
  availableAfterScammerTurns: 3,
  announceInstruction: `(참가자가 직접 확인해 보고 싶어 할 만한 시점이다. 지금 캐릭터로서 한두 문장으로 **확인을 막지 말고 오히려 권하라** — 예: "확인해 보시는 게 맞습니다. 여신확인창구로 직접 걸어서 조회해 보세요." 안내 창구 이름은 '○○캐피탈 여신확인창구'다. ${NO_NUMBER_INVENTION})`,
  reconnectInstruction: `(참가자가 안내받은 번호로 확인 전화를 걸어 지금 막 연결됐다. 지금부터 너는 '○○캐피탈 여신확인창구'의 **다른 담당자**다. 한두 문장으로 창구 이름과 직책을 밝히며 정형적이고 사무적인 존대로 응대를 시작하라. ${RECONNECT_TAIL})`,
};

const TAX_REFUND_SCAM: VerifyInterceptItem = {
  offerId: "tax-verify-desk",
  deskLabel: "○○환급지원센터 확인창구",
  displayNumber: "1580-0000",
  reconnectedCallerLabel: "○○환급지원센터 확인창구",
  availableAfterScammerTurns: 2,
  announceInstruction: `(참가자가 직접 확인해 보고 싶어 할 만한 시점이다. 지금 캐릭터로서 한두 문장으로 **확인을 막지 말고 오히려 권하라** — 예: "확인하고 오셔도 됩니다. 환급 확인창구로 직접 걸어서 대상자 조회부터 해보세요." 안내 창구 이름은 '○○환급지원센터 확인창구'다. ${NO_NUMBER_INVENTION})`,
  reconnectInstruction: `(참가자가 안내받은 번호로 확인 전화를 걸어 지금 막 연결됐다. 지금부터 너는 '○○환급지원센터 확인창구'의 **다른 담당자**다. 한두 문장으로 창구 이름과 직책을 밝히며 정형적이고 사무적인 존대로 응대를 시작하라. ${RECONNECT_TAIL})`,
};

const COURIER_CUSTOMS_SCAM: VerifyInterceptItem = {
  offerId: "courier-verify-desk",
  deskLabel: "○○통관지원센터 확인창구",
  displayNumber: "1610-0000",
  reconnectedCallerLabel: "○○통관지원센터 확인창구",
  availableAfterScammerTurns: 2,
  announceInstruction: `(참가자가 직접 확인해 보고 싶어 할 만한 시점이다. 지금 캐릭터로서 한두 문장으로 **확인을 막지 말고 오히려 권하라** — 예: "확인해 보셔도 됩니다. 통관 확인창구로 직접 걸어서 조회해 보세요." 안내 창구 이름은 '○○통관지원센터 확인창구'다. ${NO_NUMBER_INVENTION})`,
  reconnectInstruction: `(참가자가 안내받은 번호로 확인 전화를 걸어 지금 막 연결됐다. 지금부터 너는 '○○통관지원센터 확인창구'의 **다른 담당자**다. 한두 문장으로 창구 이름과 직책을 밝히며 정형적이고 사무적인 존대로 응대를 시작하라. ${RECONNECT_TAIL})`,
};

/**
 * T95 신규 — **확인 무력화 전용 시나리오**(`bank-security-verify-scam`)의 항목.
 *
 * 위 5종은 "기관·금융 사칭 계열에 확인 무력화를 얹은" 것이고, 이 항목은 **시나리오 자체가 이 흐름을
 * 위해 저작된** 유일한 항목이다(OQ-41 확정 "레버 + 전용 1종"의 전용 1종). 그래서 게이트가 **2턴**으로
 * 가장 이르다 — 확인 우회로가 이 훈련의 본론이라 참가자가 확인을 시도할 시간을 넉넉히 줘야 한다
 * (§16.1.4 권고 범위 2~3 안).
 */
const BANK_SECURITY_VERIFY_SCAM: VerifyInterceptItem = {
  offerId: "bank-security-verify-desk",
  deskLabel: "○○은행 금융사고대응 확인창구",
  displayNumber: "1620-0000",
  reconnectedCallerLabel: "○○은행 금융사고대응 확인창구",
  availableAfterScammerTurns: 2,
  announceInstruction: `(참가자가 직접 확인해 보고 싶어 할 만한 시점이다. 지금 캐릭터로서 한두 문장으로 **확인을 막지 말고 오히려 권하라** — 예: "의심하시는 게 정상입니다. 금융사고대응 확인창구로 직접 걸어서 확인해 보세요. 저는 끊지 않고 기다리겠습니다." 안내 창구 이름은 '○○은행 금융사고대응 확인창구'다. ${NO_NUMBER_INVENTION})`,
  reconnectInstruction: `(참가자가 안내받은 번호로 확인 전화를 걸어 지금 막 연결됐다. 지금부터 너는 '○○은행 금융사고대응 확인창구'의 **다른 담당자**다. 한두 문장으로 창구 이름과 직책을 밝히며 정형적이고 사무적인 존대로 응대를 시작하라. ${RECONNECT_TAIL})`,
};

/**
 * 시나리오별 확인 무력화 카탈로그 — **시나리오당 최대 1건**(이 흐름은 세션에서 한 번만 일어난다,
 * §16.1.3). 카탈로그가 없는 시나리오는 이 기능이 아예 켜지지 않는다(프롬프트의 조건형 블록도 함께
 * 꺼져 기존 동작이 한 글자도 바뀌지 않는다 — 회귀 0).
 *
 * **왜 이 5종인가(범위 판단, 근거를 남긴다)**:
 *   - AC-071의 주 대상은 *"기관·금융 사칭 계열"*(§16.1.5)이고, 이 5종이 정확히 그 계열이면서
 *     `voiceMode:"generic"`(=Gemini Live 경로 = 지시 주입 지점이 있는 경로)이다.
 *   - `family-accident-deepvoice`·`grandchild-impersonation`은 `voiceMode:"clone"`이라 ElevenLabs
 *     경로이며 **지시 주입 지점이 구조적으로 없다**(§16.6 G23). 카탈로그를 넣어도 대사가 나오지
 *     않으므로 넣지 않는다.
 *   - `kidnapping-threat`·`reputation-blackmail-scam`은 협박 계열이라 사기범이 "직접 확인해
 *     보시라"고 권하는 것 자체가 캐릭터와 모순된다(그 시나리오의 수법은 **확인 차단**이다).
 *     확인 무력화(D3)를 억지로 얹으면 두 수법이 한 통화 안에서 서로를 부정한다.
 *   - 메신저 채널 시나리오는 통화 셸이 없어 오버레이 계층 자체가 성립하지 않는다.
 *
 * **T95 증분(2026-07-26)**: 위 5종에 더해 **확인 무력화 전용 시나리오 1종**이 들어왔다
 * (`bank-security-verify-scam`). 5종은 "다른 수법의 시나리오에 이 흐름을 얹은" 것이고 전용 1종은
 * "이 흐름을 겪으려고 고르는" 것이라는 점이 다르다 — 사용자가 *"확인 전화도 가로채진다"* 를
 * **목적의식적으로 골라 훈련**할 수 있어야 한다는 OQ-41 확정 근거가 그 차이다.
 */
export const VERIFY_INTERCEPT: Record<string, VerifyInterceptItem> = {
  "institutional-impersonation": INSTITUTIONAL_IMPERSONATION,
  "card-company-impersonation": CARD_COMPANY_IMPERSONATION,
  "loan-refinance-scam": LOAN_SCAM,
  "tax-refund-scam": TAX_REFUND_SCAM,
  "courier-customs-scam": COURIER_CUSTOMS_SCAM,
  "bank-security-verify-scam": BANK_SECURITY_VERIFY_SCAM,
};

/** 이 시나리오가 확인 무력화를 쓰는가(프롬프트 조건형 블록·오퍼 게이트 노출의 단일 판정). */
export function hasVerifyIntercept(scenarioId: string): boolean {
  return VERIFY_INTERCEPT[scenarioId] !== undefined;
}

/**
 * ⚠️ G24 방어 — 오퍼가 **이 시나리오 카탈로그 소속인지** 확인하는 유일한 지점. 이걸 빼면 위조
 * 호출로 "일어나지 않은 확인 권유"가 리포트 타임라인에 남는다(기록 무결성, §16.1.5).
 */
export function findVerifyInterceptItem(
  scenarioId: string,
  offerId?: string,
): VerifyInterceptItem | undefined {
  const item = VERIFY_INTERCEPT[scenarioId];
  if (!item) return undefined;
  if (offerId !== undefined && item.offerId !== offerId) return undefined;
  return item;
}

/**
 * 클라(양 경로)에 내려보내는 **가용 게이트만** — 창구명·번호·모델 지시는 포함하지 않는다
 * (사전 유출 방지, API.md `createRealtimeCall` T79 증분). 클라는 사기범 턴만 세어
 * `deliverVerifyOffer`를 부르며, 실제 렌더는 Firestore 구독이 담당한다.
 */
export function getVerifyOfferTrigger(
  scenarioId: string,
): { availableAfterScammerTurns: number } | undefined {
  const item = VERIFY_INTERCEPT[scenarioId];
  return item ? { availableAfterScammerTurns: item.availableAfterScammerTurns } : undefined;
}
