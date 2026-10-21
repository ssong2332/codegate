// 카탈로그 항목 → Firestore 문서 변환 (T68). 부수효과 없는 순수 함수라 단위 테스트 대상이다.
import { buildOtpLiveCompareLine, type InCallSmsItem } from "../scenarios/inCallSms";
import type { FlowVariantSms } from "../scenarios/flowVariants";
import { buildLiveConfirmResultInstruction, confirmResultPurposeFor } from "./confirmResult";
import { DEFAULT_MOCK_SCREEN_KIND, resolveMockScreenKind } from "../scenarios/mockScreens";
import type { DeliverInCallSmsResponse } from "./types";
import type { InCallSmsDoc } from "../shared/types";
import { applyFictionalBank, extractAccountNumber, hasBankPlaceholder } from "../shared/fictionalBank";

/**
 * ⚠️ **여기서 나가는 필드가 곧 클라가 볼 수 있는 전부다**(AC-060 구조적 금지의 마지막 관문).
 * `url` 같은 실 네비게이션 필드는 소스 타입(`InCallSmsItem`)에도 없고 여기서도 만들지 않는다 —
 * 링크는 `linkDisplayText` + `fakeLandingId`(기존 인앱 가짜 랜딩 참조)로만 표현된다.
 * `announceInstruction`(모델용 지시)은 **문서에 쓰지 않는다** — 그건 프롬프트 재료이지 사용자가
 * 볼 문자 내용이 아니다(AC-024 "프롬프트 클라 미노출" 계승).
 */
export function buildInCallSmsDoc(
  item: InCallSmsItem,
  arrivedAt: FirebaseFirestore.Timestamp,
  anchorScammerTurn: number,
  scenarioId: string,
  // §81 — 세션 가상 은행명. 카탈로그 본문의 자리표시자 "OO은행"을 이 이름으로 바꿔 **저장한다**(문자함·리포트·
  // 다시보기가 같은 이름을 본다). 부재면 카탈로그 원문 그대로(종전).
  fictionalBankName?: string,
): InCallSmsDoc {
  // §81.6 — 가상 은행 자리표시자 줄의 계좌번호(없으면 undefined). 아래 accountNumber 필드에서 한 번만 쓴다.
  const accountNumber = extractAccountNumber(item.body);
  // T104(§19.4 #2) — 링크형 문자가 여는 랜딩의 **목업 종류를 서버가 확정해 실어 보낸다**
  // (§15.9.1 R3 — 클라가 `fakeLandingId` 문자열로 kind를 추론하지 않는다).
  const landingKind =
    item.kind === "link" && item.fakeLandingId
      ? resolveMockScreenKind(scenarioId, item.fakeLandingId)
      : DEFAULT_MOCK_SCREEN_KIND;
  return {
    smsId: item.smsId,
    kind: item.kind,
    // §83 — 발신자 표시의 "○○캐피탈" 등도 세션 이름으로(본문과 같은 이름).
    senderLabel: fictionalBankName ? applyFictionalBank(item.senderLabel, fictionalBankName) : item.senderLabel,
    body: fictionalBankName ? applyFictionalBank(item.body, fictionalBankName) : item.body,
    // §81 — 본문에 자리표시자가 있었던 문자만 은행명을 구조화 필드로도 싣는다(가짜 랜딩 미리 채움 D-115의 원천).
    // §83 — 카드·캐피탈 자리표시자만 있는 문자는 은행명을 싣지 않는다(은행 자리표시자 기준으로 판정).
    ...(fictionalBankName && hasBankPlaceholder(item.body) ? { bankName: fictionalBankName } : {}),
    // §81.6 — 같은 줄의 계좌번호도 구조화 필드로(D-115 랜딩 미리 채움 원천 — 은행명과 한 쌍).
    ...(fictionalBankName && accountNumber ? { accountNumber } : {}),
    // 종류별 필드는 해당 kind일 때만 채운다(부재를 판별자로 오버로드하지 않되, 무의미한 빈 값도
    // 만들지 않는다 — kind가 유일한 판별자다, §14.9.1 원칙).
    ...(item.kind === "otp" && item.otpCode ? { otpCode: item.otpCode } : {}),
    // §51.6 R10/G317 — kind가 아니라 필드 존재로 판정한다("account"도 이제 링크를 병기할 수
    // 있다). kind로 링크 부착 여부를 추론하는 코드를 두지 않는다(R10 양방향 금지).
    ...(item.linkDisplayText ? { linkDisplayText: item.linkDisplayText } : {}),
    ...(item.fakeLandingId ? { fakeLandingId: item.fakeLandingId } : {}),
    // T190-2(docs/Architecture.md §74.9) — 말풍선 링크 줄의 가짜 주소(`.invalid` 호스트 + 경로). 위 두 필드와
    // 3자 쌍으로만 존재한다(G111). 부재면 키를 만들지 않는다 — 옛 문서와 같은 모양(클라는 `?? linkDisplayText`).
    ...(item.linkAddress ? { linkAddress: item.linkAddress } : {}),
    // 기본값이면 **키 자체를 만들지 않는다** — `extractLinkMarker`의 생략 규칙과 동일하며,
    // 같은 개념에 생략 규칙이 두 벌이면 그게 드리프트다(§19.4 #3).
    ...(landingKind === DEFAULT_MOCK_SCREEN_KIND ? {} : { landingKind }),
    arrivedAt,
    anchorScammerTurn,
  };
}

// ── 앵커 값(§15.1.5 (4) / §15.6 G21 · T191 문자 도달 조건 설계 "계수 규칙") ─────────────────────────
// 의미는 하나다 — "이 문자가 도착한 시점까지 `messages`에 존재하는 `role==="scammer"` 문서 수". T191부터 도착
// 시점이 카탈로그 고정 턴이 아니라 게이트 통과 순간이라, 앵커도 카탈로그 값이 아니라 **관측값**으로 계산한다.

/**
 * 실시간(Gemini Live) 경로의 앵커 = `1 + scammerTranscriptTurns`.
 * 1 = `createSession`이 쓴 오프닝 사기범 문서(turnIndex 0 — 실시간 전사는 그 **뒤에** append된다,
 * `realtime/submitTranscript.ts`). `scammerTranscriptTurns`는 클라의 **비어 있지 않은 사기범 전사 flush 수**라
 * 빈 `turnComplete`·지시 턴을 세지 않으므로 제출될 전사 문서 수와 1:1이다.
 */
export function realtimeAnchorScammerTurn(scammerTranscriptTurns: number): number {
  return 1 + scammerTranscriptTurns;
}

/**
 * 텍스트 폴백 경로의 앵커 = 쓰는 순간 `messages`에 있는 사기범 문서 수 그대로(오프닝 포함 — 서버가 직접 센다).
 * 마커 경로는 응답을 저장한 **뒤**에 쓰므로 그 응답이 포함되고, 백스톱은 응답 **전**에 쓰므로 포함되지 않는다.
 * (옛 `fallbackAnchorScammerTurn` = `afterScammerTurns - 1`은 카탈로그 고정 턴 전제라 폐기했다.)
 */
export function textPathAnchorScammerTurn(scammerDocsAtWrite: number): number {
  return scammerDocsAtWrite;
}

// ── §53.6 (3) — 전환(호 전환) 이후에는 announceInstruction을 싣지 않는다 ─────────────────────
// `verifyIntercept/buildDoc.ts`의 `resolveVerifyOfferPlan`/`buildVerifyOfferResponse`(T118/R-1)와
// **같은 형태·같은 자리**다. 왜 필요한가: 이 문자가 연 확인 시도 무력화 오퍼가 이미 `placedAt`을
// 가졌으면(=참가자가 확인 데스크로 넘어간 뒤) 그 시점부터는 원 사기범이 아니라 **다른 담당자**만
// 남아 있다. 그 화자가 "제가 방금 이 문자를 보냈습니다"라고 말하면 참가자가 실제로 겪은 사실
// (담당자가 바뀌었다)과 모순된다(§53.6 (2) — ⓒ를 턴 숫자가 아니라 이 서버 게이트로 닫는다).
//
// ⛔ 이 게이트는 **문서 write·멱등 로직을 건드리지 않는다** — 문자는 전환 여부와 무관하게 항상
// 도착하고 문자함·랜딩 경로도 그대로다(AC-080 판정 지점 불변). 사라지는 것은 모델 지시 1줄뿐이다.

/** 판정만 소유하는 순수 함수(§53.8 3) — `resolveVerifyOfferPlan`과 동형. */
export function resolveInCallSmsPlan(input: { placed: boolean }): { includeInstruction: boolean } {
  return { includeInstruction: !input.placed };
}

/**
 * 응답 조립(§53.8 3) — `buildVerifyOfferResponse`와 동형. 판정은 `resolveInCallSmsPlan` 한 곳이
 * 소유하고 이 함수는 그 결과를 조립만 한다(호출부에 `if`를 흩지 않는다).
 *
 * ⚠️ **§59.6 — `status`는 여기서 붙이지 않는다.** 이 함수는 `placed` 게이트(§53.6 (3))만 알고
 * "이 호출이 신규 create였는가/이미 있었는가"는 모른다(그건 호출부 `deliverInCallSms`가 Firestore
 * 조회 결과로 안다) — 그래서 반환 타입은 `status`를 뺀 부분집합이고, 호출부가 그 값을 얹는다.
 */
export function buildInCallSmsResponse(
  item: InCallSmsItem,
  input: { placed: boolean; fictionalBankName?: string },
): Omit<DeliverInCallSmsResponse, "status" | "declineInstruction"> {
  const plan = resolveInCallSmsPlan(input);
  if (!plan.includeInstruction) return { smsId: item.smsId };
  // ⛔ 2026-10-18(§78) — 인증번호(정답)를 여기 싣지 않는다. #300이 실었다가 실시간 경로에서 모델이 번호를 먼저 말할
  // 위험을 만들었다(텍스트 폴백에서 3/7 실측). Live는 서버가 참가자 발화를 실시간으로 보지 못해 서버 대조도 할 수 없다
  // ⇒ 실시간 경로의 대조는 이번 수정에서 뺐다(대안 비교는 §78.4). 응답은 #300 이전과 같다.
  // §81 — 도착 지시에 자리표시자가 있으면 세션 은행명으로(실시간 경로는 이 문자열이 그대로 모델에 간다).
  const announce = input.fictionalBankName
    ? applyFictionalBank(item.announceInstruction, input.fictionalBankName)
    : item.announceInstruction;
  // ⭐ §99 추가(사용자 실기 신고 — Live에서 틀린 인증번호를 "확인됐다"고 넘김) — 위 ⛔(§78 · L1)를 바꾼다: 이 응답은 Live 경로(`deliverInCallSms`)만
  // 받으므로 인증번호 문자에 한해 대조 1줄을 **도착 때 한 번** 덧붙인다. 텍스트 폴백은 이 함수를 거치지 않는다(서버 대조 `otpCheck.ts` 그대로).
  const announceInstruction =
    item.kind === "otp" && item.otpCode ? `${announce} ${buildOtpLiveCompareLine(item.otpCode)}` : announce;
  return { smsId: item.smsId, announceInstruction };
}

/**
 * A-1 ⑦(2026-10-19) — `deliverInCallSms` 도착 응답에 덧붙일 결과 신호 필드(조건형 1줄 · `inCallSms/confirmResult.ts`).
 * 판정은 announce와 **같은 게이트**(`resolveInCallSmsPlan` — 전환 뒤 생략)에 곱해지고, 대상은 변형 선언의 **필수** 계좌·링크
 * 문자뿐이다(`confirmResultPurposeFor`). 해당 없으면 빈 객체(= 종전 응답 그대로). ⚠️ 클라 주입 배선은 A-2.
 * T194-c-1 G608 — 설치 화면을 여는 문자(Q2)는 대상이 아니다(폴백 `planConfirmResult`와 **같은 함수** · `scenarioId`로 판별).
 */
export function buildConfirmResultField(
  input: { placed: boolean; scenarioId: string },
  declaredItem: FlowVariantSms | undefined,
): Pick<DeliverInCallSmsResponse, "confirmResultInstruction"> {
  if (!resolveInCallSmsPlan(input).includeInstruction) return {};
  const purpose = confirmResultPurposeFor(declaredItem, input.scenarioId);
  return purpose ? { confirmResultInstruction: buildLiveConfirmResultInstruction(purpose) } : {};
}
