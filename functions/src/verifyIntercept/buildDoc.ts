// 카탈로그 항목 → Firestore 문서 변환 + 앵커 계산 + 오퍼 응답 조립 (T83 · T118, §16.3.1/§16.3.2/
// §25.5 (4)). 부수효과 없는 순수 함수라 단위 테스트 대상이다(`inCallSms/buildDoc.ts`와 동형).
import type { VerifyInterceptItem } from "../scenarios/verifyIntercept";
import type { VerifyInterceptDoc } from "../shared/types";
import type { DeliverVerifyOfferResponse } from "./types";

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
 */
export function buildVerifyOfferResponse(
  item: VerifyInterceptItem,
  input: { placed: boolean },
): DeliverVerifyOfferResponse {
  if (input.placed) return { offerId: item.offerId };
  return { offerId: item.offerId, announceInstruction: item.announceInstruction };
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
