// 카탈로그 항목 → Firestore 문서 변환 (T68). 부수효과 없는 순수 함수라 단위 테스트 대상이다.
import type { InCallSmsItem } from "../scenarios/inCallSms";
import { DEFAULT_MOCK_SCREEN_KIND, resolveMockScreenKind } from "../scenarios/mockScreens";
import type { InCallSmsDoc } from "../shared/types";

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
): InCallSmsDoc {
  // T104(§19.4 #2) — 링크형 문자가 여는 랜딩의 **목업 종류를 서버가 확정해 실어 보낸다**
  // (§15.9.1 R3 — 클라가 `fakeLandingId` 문자열로 kind를 추론하지 않는다).
  const landingKind =
    item.kind === "link" && item.fakeLandingId
      ? resolveMockScreenKind(scenarioId, item.fakeLandingId)
      : DEFAULT_MOCK_SCREEN_KIND;
  return {
    smsId: item.smsId,
    kind: item.kind,
    senderLabel: item.senderLabel,
    body: item.body,
    // 종류별 필드는 해당 kind일 때만 채운다(부재를 판별자로 오버로드하지 않되, 무의미한 빈 값도
    // 만들지 않는다 — kind가 유일한 판별자다, §14.9.1 원칙).
    ...(item.kind === "otp" && item.otpCode ? { otpCode: item.otpCode } : {}),
    // §51.6 R10/G317 — kind가 아니라 필드 존재로 판정한다("account"도 이제 링크를 병기할 수
    // 있다). kind로 링크 부착 여부를 추론하는 코드를 두지 않는다(R10 양방향 금지).
    ...(item.linkDisplayText ? { linkDisplayText: item.linkDisplayText } : {}),
    ...(item.fakeLandingId ? { fakeLandingId: item.fakeLandingId } : {}),
    // 기본값이면 **키 자체를 만들지 않는다** — `extractLinkMarker`의 생략 규칙과 동일하며,
    // 같은 개념에 생략 규칙이 두 벌이면 그게 드리프트다(§19.4 #3).
    ...(landingKind === DEFAULT_MOCK_SCREEN_KIND ? {} : { landingKind }),
    arrivedAt,
    anchorScammerTurn,
  };
}

// ── 앵커 값(§15.1.5 (4) / §15.6 G21) ──────────────────────────────────────────────
// 두 경로에서 **의미는 하나**다 — "이 문자가 도착한 시점까지 `messages`에 존재하는
// `role==="scammer"` 문서 수". 경로마다 카탈로그 값(`afterScammerTurns`)의 기준점이 달라 값만
// 갈라지므로, 그 ±보정을 아래 두 헬퍼에 **가둬 둔다**(리졸버는 단 하나로 유지 — §15.1.5 (6)).

/**
 * 실시간(Gemini Live) 경로의 앵커 = `afterScammerTurns + 1`.
 *
 * ⚠️ **+1의 실측 근거(G21이 "실측하고 어긋나면 write 지점 값을 ±1 하라"고 지목한 지점)**:
 * 클라의 `scammerTurns`는 **Live 세션의 `turnComplete`만** 센다
 * (`src/lib/realtime/GeminiVoiceSession.tsx` `onScammerTurnComplete`). 그런데 `messages`에는
 * 그보다 **먼저** `createSession`이 쓴 오프닝 사기범 행이 turnIndex 0으로 이미 존재하고
 * (`functions/src/session/index.ts` `sessionRef.collection("messages").add({role:"scammer",…,turnIndex:0})`),
 * 실시간 전사는 그 **뒤에** append된다(`realtime/submitTranscript.ts` `nextIndex = historySnap.size`).
 * 즉 Live 턴 N개가 끝난 시점의 사기범 문서 수는 N이 아니라 **1 + N**이다. 보정하지 않으면 앵커가
 * 한 턴 앞으로 밀려 문자가 announce 대사보다 두 턴 앞에 놓인다.
 */
export function realtimeAnchorScammerTurn(item: InCallSmsItem): number {
  return item.afterScammerTurns + 1;
}

/**
 * 폴백(텍스트) 경로의 앵커 = `afterScammerTurns - 1`.
 *
 * 이 경로는 **N번째 사기범 응답을 만들기 직전**에 write한다
 * (`functions/src/roleplay/index.ts` `scammerTurnNumber = storedHistory.filter(scammer).length + 1`
 * 가 카탈로그의 `afterScammerTurns`와 같을 때 도착) → 그 순간 완료된 사기범 발화는 N-1개다.
 * 여기서는 `createSession` 오프닝 행이 이미 `storedHistory`에 포함돼 세어지므로 추가 보정이 없다.
 */
export function fallbackAnchorScammerTurn(item: InCallSmsItem): number {
  return item.afterScammerTurns - 1;
}
