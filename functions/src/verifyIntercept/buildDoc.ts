// 카탈로그 항목 → Firestore 문서 변환 + 앵커 계산 + 오퍼 응답 조립 (T83 · T118, §16.3.1/§16.3.2/
// §25.5 (4)). 부수효과 없는 순수 함수라 단위 테스트 대상이다(`inCallSms/buildDoc.ts`와 동형).
import type { VerifyInterceptItem } from "../scenarios/verifyIntercept";
import type { VerifyInterceptDoc } from "../shared/types";
import type { DeliverVerifyOfferResponse, VerifyOfferStage } from "./types";

/**
 * ⚠️ **여기서 나가는 필드가 곧 클라가 볼 수 있는 전부다**(AC-019/AC-024 구조적 금지의 마지막 관문).
 * `url`·`tel`·발신 대상 필드는 소스 타입(`VerifyInterceptItem`)에도 없고 여기서도 만들지 않는다.
 * ⭐ **T110(§22.3)**: 호 전환 모델에서 참가자는 번호를 받지 않으므로 `displayNumber`는 카탈로그에서
 * 사라졌고 **신규 문서에는 기록되지 않는다**(문서 타입에서는 옵셔널로 남아 과거 문서를 무백필로
 * 읽는다 — 백필 0건·마이그레이션 0건). `announceInstruction`/`reconnectInstruction`
 * (모델용 지시)은 **문서에 쓰지 않는다** — 그건 프롬프트 재료이지 사용자가 볼 내용이 아니다
 * (`buildInCallSmsDoc`이 `announceInstruction`을 문서에 쓰지 않는 것과 동일한 규칙).
 */
export function buildVerifyInterceptDoc(
  item: VerifyInterceptItem,
  offeredAt: FirebaseFirestore.Timestamp,
  offerAnchorScammerTurn: number,
): VerifyInterceptDoc {
  return {
    offerId: item.offerId,
    deskLabel: item.deskLabel,
    offeredAt,
    offerAnchorScammerTurn,
  };
}

/**
 * ⭐ **T118 / R-1(§25.5 (4))** — 오퍼 응답을 조립한다. **호 전환이 이미 끝난 오퍼(`placed`)에는
 * `announceInstruction`을 싣지 않는다.**
 *
 * 왜 응답에서 빼는가(코드 실측이 근거이지 이번 재발화의 원인 확정이 근거가 아니다 — §25.5 (3) 1):
 * 종전 구현은 오퍼 문서가 **이미 존재해도**(=`placedAt`이 찍혀 전환이 끝난 뒤여도) 지시를 **무조건**
 * 돌려줬고, 클라의 실패 롤백(`requestedVerifyRef`)과 맞물리면 **전환 이후에 확인 권유가 다시 주입될
 * 수 있는 경로**가 열려 있었다. 전환이 끝난 뒤의 확인 권유는 참가자가 겪은 사실과 모순이다.
 *
 * ⛔ 이 함수는 (나)(모델이 컨텍스트에 남은 지시를 스스로 반복)를 **대체하지 않는다** — 그쪽은 층 A5의
 * 소관이고 둘은 독립이다(**G102**).
 *
 * ⭐ **§38.4 E 추가(2026-07-29)** — `stage`가 함께 곱해진다. 판정은 `resolveVerifyOfferPlan` **한
 * 곳**이 소유하고 이 함수는 그 결과를 조립만 한다(§38.7 5 — 분기가 흩어지지 않게).
 */
export function buildVerifyOfferResponse(
  item: VerifyInterceptItem,
  input: { placed: boolean; stage?: VerifyOfferStage },
): DeliverVerifyOfferResponse {
  const plan = resolveVerifyOfferPlan({ placed: input.placed, ...(input.stage ? { stage: input.stage } : {}) });
  if (!plan.includeInstruction) return { offerId: item.offerId };
  return { offerId: item.offerId, announceInstruction: item.announceInstruction };
}

// ── ⭐⭐ §38.4 후보 E — **2단 오퍼**(실시간 경로 전용) ────────────────────────────
//
// **왜**: 컨트롤 가시성의 유일한 조건이 **오퍼 문서의 존재**인데(`session/play/page.tsx`), 그 문서는
// 예고 지시가 **큐에 들어가기도 전에** 쓰였다 ⇒ *"아무도 연결해 준다고 말하지 않았는데 '연결해
// 달라고 하기' 버튼이 떠 있는 창"* 이 구조적으로 존재했다(§38.1 (3), 사용자 신고의 런타임 층).
//
// **어떻게**: 요청에 판별자 1개(`stage`)를 더해 write 시점만 뒤로 옮긴다.
//   - `announce` : 재검증 5종을 **전부 그대로** 통과시키고 지시만 돌려준다. **문서 write 0건.**
//   - `commit`   : 예고 턴이 **끝난 뒤**(첫 `turnComplete`) 문서를 만든다 ⇒ **문서 존재 = 예고 완료.**
//
// ⭐ **④ 새로고침 생존이 이 후보를 고른 이유다**(§38.4 D의 ④열 · **G184**) — 판별자가 클라 ref가
// 아니라 **문서 존재**라 새로고침·재마운트를 그대로 넘긴다(§16.2 "문서 구독이 단일 렌더 소스").
// ⭐ **부수 이득**: 앵커가 **예고 턴에서** 계산돼(`realtimeVerifyAnchor`가 commit 시점의
// `scammerTurns`를 받는다) 오퍼 카드가 예고 대사 **자리**에 놓인다.
// ⛔ **폴백 경로에 쓰지 말 것 — 순환한다.** 폴백은 **문서가 곧 announce 트리거**이므로
// (`roleplay/index.ts`가 문서를 읽어 `verify_announce`를 고르고 `announcedAt`을 마크한다) 문서를
// 미루면 예고가 영영 안 나온다. 폴백은 **후보 C**(`announcedAt`을 컨트롤 선행 조건으로 **읽기만**)를
// 쓴다 — 마킹 지점은 **0줄** 그대로다(**G188**).
/**
 * ⭐ **§38.7 5 — `stage` 판별자와 `placed` 판별자가 곱해지는 4칸을 이 함수 하나에 가둔다**(G187 인접).
 * 호출부에 흩으면 *"1단계는 R-1을 보는데 2단계는 안 본다"* 같은 비대칭이 **에러 없이** 생긴다.
 *
 * | stage | placed | persist | instruction | 근거 |
 * |---|---|---|---|---|
 * | 부재(폴백·레거시) | false | ✅ | ✅ | 종전 동작 그대로 — 폴백은 문서가 announce 트리거다 |
 * | 부재            | true  | ❌ | ❌ | R-1(전환 후 재권유 금지) |
 * | `announce`      | false | ❌ | ✅ | ⭐ **write를 미룬다**(E의 본체) |
 * | `announce`      | true  | ❌ | ❌ | R-1 |
 * | `commit`        | false | ✅ | ❌ | 지시는 1단계에서 이미 받았다 — 다시 주면 **중복 주입**이다 |
 * | `commit`        | true  | ❌ | ❌ | R-1 |
 *
 * ⚠️ `persist`는 *"쓰기를 시도해도 되는가"* 다. 실제 write는 **문서 부재일 때만**(멱등 — `create`)
 * 일어나며 그 판정은 호출부의 기존 규칙 그대로다.
 */
export function resolveVerifyOfferPlan(input: {
  stage?: VerifyOfferStage;
  placed: boolean;
}): { persist: boolean; includeInstruction: boolean } {
  if (input.placed) return { persist: false, includeInstruction: false };
  if (input.stage === "announce") return { persist: false, includeInstruction: true };
  if (input.stage === "commit") return { persist: true, includeInstruction: false };
  return { persist: true, includeInstruction: true };
}

// ── 앵커 값(§16.3.2 / §16.6 G28) ────────────────────────────────────────────────
// 두 경로에서 **의미는 하나**다 — "이 시점까지 `messages`에 존재하는 `role==="scammer"` 문서 수".
// 경로마다 셀 수 있는 값이 달라 공식만 갈라지므로, 그 보정을 아래 두 헬퍼에 **가둬 둔다**
// (리졸버는 단 하나로 유지 — `report/smsTimeline.ts`의 `resolveAnchor`를 공유한다, §16.3.2).

/**
 * 실시간(Gemini Live) 경로의 앵커 = 클라가 센 `scammerTurns + 1`.
 *
 * ⚠️ **+1의 실측 근거(§16.3.2, T89/G21이 문자에서 이미 확인한 것과 같은 사실)**: 클라의
 * `scammerTurns`는 **Live 세션의 `turnComplete`만** 센다(`src/lib/realtime/GeminiVoiceSession.tsx`
 * `onScammerTurnComplete`). 그런데 `messages`에는 그보다 **먼저** `createSession`이 쓴 오프닝
 * 사기범 행이 turnIndex 0으로 이미 존재하고(`functions/src/session/index.ts`), 실시간 전사는 그
 * **뒤에** append된다(`realtime/submitTranscript.ts` `nextIndex = historySnap.size`). 즉 Live 턴
 * N개가 끝난 시점의 사기범 문서 수는 N이 아니라 **1 + N**이다.
 */
export function realtimeVerifyAnchor(scammerTurns: number): number {
  return Math.max(0, Math.trunc(scammerTurns)) + 1;
}

/**
 * 폴백(텍스트) 경로의 앵커 = **서버가 지금 센 `messages`의 `role==="scammer"` 문서 수**(보정 없음).
 *
 * 이 경로에는 실제 메시지가 이미 존재하므로 클라 값을 믿을 필요가 없다(§16.3.2). 오프닝 사기범
 * 행도 이미 그 안에 포함돼 세어지므로 추가 보정이 없다.
 */
export function fallbackVerifyAnchor(scammerDocCount: number): number {
  return Math.max(0, Math.trunc(scammerDocCount));
}

/**
 * ⭐⭐ **§45.7 V1 — 폴백 경로의 앵커 *재계산*(예고를 실제로 말하는 턴).**
 *
 * **왜 필요한가(§45.6 F2-b · P-2로 100% 재현)**: `fallbackVerifyAnchor`는 `deliverVerifyOffer`가
 * 호출된 **그 시점**의 사기범 문서 수를 쓴다. 그런데 폴백에서 예고 대사는 그 **뒤** `sendMessage`
 * 턴에서 주입되므로(`roleplay/index.ts`의 `verify_announce` 분기), 앵커는 **항상 한 턴 이르다** —
 * 리포트 리플레이에서 확인 오퍼 카드가 예고 대사보다 **앞에** 놓인다(구조적 · 간헐 아님).
 *
 * **무엇을 받는가**: 이번 응답을 만들기 **전**의 사기범 문서 수(`scammerDocCount`). 이번 턴에
 * 생성될 사기범 응답이 곧 예고 대사이므로 그 응답의 **1-기반 순번**은 `scammerDocCount + 1`이다.
 * 리졸버(`report/smsTimeline.ts`의 `resolveAnchor`)가 1-기반이라 그대로 넘긴다.
 *
 * ⛔ **새 리졸버도 새 필드도 아니다(G252)** — 기존 `offerAnchorScammerTurn` **한 필드의 값을**
 * announce 시점에 1회 갱신할 뿐이다. `announcedAt`이 한 번만 마크되므로 갱신도 1회 = 멱등이다.
 * ⛔ **실시간 경로에 쓰지 말 것** — 그쪽은 `realtimeVerifyAnchor`(+1 보정)와 후보 E의 commit
 * 시점이 소유한다(§45.7 V2).
 */
export function announcedVerifyAnchor(scammerDocCount: number): number {
  return Math.max(0, Math.trunc(scammerDocCount)) + 1;
}
