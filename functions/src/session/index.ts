// 세션 라이프사이클 (Track B, T8). API.md `createSession`/`endSession` 1:1. AC-003/006/007/021.
//
// ⚠️ createSession은 원래 Architecture.md §4/API.md가 Track B·T8 소유로 지정한 파일이다. T7(역할극
// 엔진) 태스크 지시가 "AC-003(세션 시작 시 인격으로 대화 시작) 검증을 위해 createSession도 지금
// 구현하라"고 명시적으로 요청해 T7이 앞당겨 구현했다 — src/lib/api/createSession.ts의 기존 주석은
// "T8에서 실호출로 교체"였지만, 이 콜러블 본문은 이미 실호출이다. T8은 이 구현을 처음부터 다시
// 만들 필요 없이 세션 라이프사이클의 나머지 부분(endSession 본문, AC-006/015/023 — 상시 종료·
// 디스컬레이션·"훈련이었습니다" 고지)에 집중하면 된다(구현 보고서에 크로스트랙 노트로 남김).
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { assertAnonymousChallengeScope, denyAnonymous } from "../shared/anonymousGate";
import { generateOpeningLine } from "../roleplay";
import { triggerReportGeneration } from "../report";
import { SCENARIO_PROMPTS } from "../scenarios";
import { PUBLIC_SCENARIOS } from "../scenarios/publicMeta";
import { resolveScenarioEscalation, resolveSessionEscalation } from "../scenarios/escalation";
import {
  CREATE_SESSION_WINDOW_MAX,
  MAX_SESSION_MS,
  MAX_USER_TURNS,
  MESSENGER_ESCALATION_MAX_USER_TURNS,
} from "../shared/constants";
import { isCreateSessionRateLimited } from "./rateLimit";
import { FALLBACK_VOICE_FEMALE_ID, FALLBACK_VOICE_MALE_ID, LLM_TEXT_SECRETS, isDevRouteOverrideEnabled } from "../shared/config";
import { normalizeDifficultyLevel } from "../shared/difficulty";
import { getVoiceProvider } from "../voice/provider";
import { transitionChannel } from "./channelTransition";
import { recordVoiceTalkUnanswered } from "./voiceTalkUnanswered";
import { applyCallReturnSessionUpdate, decideCallReturn, recordCallReturnLine } from "./callReturn";
import { readEndSessionReason, resolveRecordedEndReason } from "./endReason";
import { shouldMarkOpeningUnheard } from "./unheardOpening";
import { assertDifficultyAllowed } from "./difficultyAllowance";
import { assertScenarioNotMerged } from "./mergedScenario";
import { assertVoiceSelectionSourceAllowed } from "./voiceSelectionAllowance";
import { assignFlowVariantForSession, commitSessionWithVariant } from "./variantAssignment";
import { resolveDevRouteOverride } from "./devRouteOverride";
import type { MessageDoc, MessengerSkin, MessengerSkinSource, SessionDoc } from "../shared/types";
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  EndSessionRequest,
  EndSessionResponse,
  RequestEscalationRequest,
  RequestEscalationResponse,
  RequestReverseEscalationRequest,
  RequestReverseEscalationResponse,
  UpdateMessengerSkinRequest,
  UpdateMessengerSkinResponse,
} from "./types";
import { pickSessionBankName } from "../inCallSms/smsGate";
import { resolvePersonaCardRequest } from "./personaCard";
import { FAMILY_ADDRESS_INVALID_REASON, readFamilyAddress } from "../scenarios/familyAddress";
import { emitPrepStage, type CreateSessionPrepChunk } from "./prepStages";

ensureFirebaseAdminApp();

/** defineString은 바인딩되지 않은 컨텍스트(단위 테스트 등)에서 throw할 수 있으므로 안전하게
 * 감싼다(functions/src/realtime/provider.ts의 readSecret과 동일한 패턴). placeholder(.env.example의
 * "YOUR_" 접두) 값도 "미설정"으로 본다. */
function readOptionalConfigString(param: { value: () => string }): string {
  try {
    const value = param.value();
    return !value || value.startsWith("YOUR_") ? "" : value;
  } catch {
    return "";
  }
}

/**
 * 신고 항목 4 — `updateMessengerSkin`의 enum 런타임 검증(§60의 `turn.role` 신뢰 경계 판정과 동일
 * 함정: 클라 TS 타입은 컴파일 시점 계약일 뿐, 실제로는 JSON 페이로드가 임의 문자열을 실어 나를 수
 * 있다). 알 수 없는 값을 조용히 통과시키지 않는다 — verifyIntercept/index.ts의
 * `readOfferStage`/`readTrigger`와 동일한 패턴(선례 재사용, architect 설계 불요).
 */
function readMessengerSkin(value: unknown): MessengerSkin {
  if (value === "ios" || value === "samsung" || value === "default") return value;
  throw new HttpsError("invalid-argument", "messengerSkin은 ios·samsung·default 중 하나여야 합니다.");
}

function readSkinSource(value: unknown): MessengerSkinSource {
  if (value === "auto" || value === "manual" || value === "fallback") return value;
  throw new HttpsError("invalid-argument", "skinSource는 auto·manual·fallback 중 하나여야 합니다.");
}

// GEMINI_API_KEY 선언(2026-07-24) — generateOpeningLine()이 getLlmClient()를 통해 실 Gemini로
// 격상될 수 있어(llm/index.ts 참고) Functions v2가 배포 환경에서 이 secret을 주입하도록 명시한다.
// §100(UX D-143) — 둘째 인자 `response`로 준비 단계 조각을 보낸다(prepStages.ts). 스트리밍을 받지 않는 호출에는 SDK가 보내지 않는다.
export const createSession = onCall<CreateSessionRequest, Promise<CreateSessionResponse>, CreateSessionPrepChunk>(
  { secrets: [...LLM_TEXT_SECRETS] },
  async (request, response) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    denyAnonymous(request.auth);
    const {
      scenarioId,
      voiceId,
      sessionId,
      channel,
      surface,
      messengerSkin,
      skinSource,
      voiceSelectionSource,
      difficultyLevel,
      familyAddress: familyAddressRaw,
      forceVariantId,
      personaCardInput,
    } = request.data ?? {};
    if (!scenarioId || !voiceId) {
      throw new HttpsError("invalid-argument", "scenarioId와 voiceId가 필요합니다.");
    }
    if (!SCENARIO_PROMPTS[scenarioId]) {
      throw new HttpsError("invalid-argument", `존재하지 않는 scenarioId입니다: ${scenarioId}`);
    }
    // T191 S5(PRD AC-097 (b) · UX 계약 C-2) — 고급 전용 시나리오를 초급 · 중급 · **난이도 미전달**로
    // 만드는 요청을 거부한다. ⛔ 위치가 설계다: 정규화(아래 normalizeDifficultyLevel) **전** 원값으로,
    // 어떤 Firestore 읽기 · 쓰기 · LLM · 음성 호출보다 앞(거부는 그 호출 0회로 일어난다).
    // §92(DECISIONS #206) — 합쳐진 시나리오(카드 배송)는 새 세션을 만들지 않는다(같은 자리 · 쓰기 · LLM 0회).
    assertScenarioNotMerged(scenarioId);
    assertDifficultyAllowed(scenarioId, difficultyLevel);
    // §87(DECISIONS #198 · UX D-130) — 이 콜러블은 자가 세션만 만든다. 자가 체험에서 사기범이 참가자 본인 목소리로
    // 말하는 경로(recorded · reused)는 거부한다(UX-025 self 모드 화면 숨김의 2중 방어). 위치 = 위 난이도 게이트와 같은 이유.
    assertVoiceSelectionSourceAllowed(voiceSelectionSource);

    // T72(§15.3.2, UX-029/AC-064) — 난이도는 enum 검증 후에만 기록한다. 부재·enum 밖이면 조용히
    // 임의 난이도로 진행하지 않고 "intermediate"로 확정하며, 응답에 그 확정값을 실어 클라가 폴백
    // 사실을 사용자에게 알릴 수 있게 한다. **난이도는 이 콜러블의 어떤 게이트(동의 확인·세션 한도·
    // 소유권 검증)도 바꾸지 않는다**(AC-065/D-42) — 아래 게이트들은 세 난이도에서 완전히 동일하다.
    const resolvedDifficultyLevel = normalizeDifficultyLevel(difficultyLevel);

    // ⭐ §88(DECISIONS #199 · UX D-131) — 훈련용 가상 신상 카드는 참가자가 **선택으로** 넣은 원값으로만 만든다(비면 카드 0 — 사기범은
    // 시나리오 프롬프트대로 성함 · 생년월일을 묻는다). 검증 실패 · 대상 밖 입력은 조용히 버리지 않고 거부한다. ⛔ 위치가 설계다:
    // 난이도 확정 직후 · 어떤 Firestore 읽기 · 쓰기 · LLM 호출보다 앞(거부는 그 호출 0회로 일어난다). 결과는 세션 문서
    // `personaCard`의 존재/부재로만 남는다(§84.3.1). ⛔ 요청의 완성 카드(`personaCard`)는 읽지 않는다(G627).
    const personaCardResult = resolvePersonaCardRequest(
      personaCardInput,
      { scenarioId, difficultyLevel: resolvedDifficultyLevel, channel },
      "self",
    );
    if (!personaCardResult.ok) {
      throw new HttpsError("invalid-argument", "훈련 속 내 정보를 확인해 주세요.", { reason: personaCardResult.reason });
    }
    const personaCard = personaCardResult.personaCard;
    // §110.5(실기 신고 14) — 호칭 선택(선택 · 부재 = 종전). 카드와 같은 자리 · 같은 원칙(거부는 쓰기 · LLM 0회로).
    const familyAddressResult = readFamilyAddress(familyAddressRaw, scenarioId);
    if (!familyAddressResult.ok) {
      throw new HttpsError("invalid-argument", "부를 호칭을 다시 골라 주세요.", { reason: FAMILY_ADDRESS_INVALID_REASON });
    }
    const familyAddress = familyAddressResult.term;

    // 교차채널 세션 총 한도(T30, Architecture.md §13.3, PoC 전 가정치) — 에스컬레이션 가능
    // 시나리오는 두 채널을 합쳐도 기존 10턴 안에 다 담기 어려워
    // maxUserTurns를 상향 발급한다.
    // ⭐ T194-a(§84.4.1 S-1) — "에스컬레이션 가능"은 (시나리오 × 난이도) 술어다(parcel은 고급만). 난이도는 위에서 이미 확정됐다.
    // 이 콜러블은 자가 세션만 만든다(챌린지 수신자 세션은 consentChallenge가 만든다).
    const isEscalationCapable =
      resolveScenarioEscalation(PUBLIC_SCENARIOS[scenarioId], resolvedDifficultyLevel) !== undefined;

    // UX-025(§13.6) "남/여 기본 보이스" 폴백 — 클라는 실제 ElevenLabs voiceId를 모르므로(서버
    // 전용 설정), voiceSelectionSource로 요청하면 서버가 FALLBACK_VOICE_MALE_ID/FEMALE_ID로
    // 재해석한다. 미설정(placeholder)이면 클라가 보낸 값을 그대로 쓴다(조용한 실패 없음 — 다만
    // 실 ElevenLabs 통화에서는 유효하지 않은 voiceId라 Mock/일반 강등으로 이어질 수 있다).
    let resolvedVoiceId = voiceId;
    if (voiceSelectionSource === "fallback_male") {
      const configured = readOptionalConfigString(FALLBACK_VOICE_MALE_ID);
      if (configured) resolvedVoiceId = configured;
    } else if (voiceSelectionSource === "fallback_female") {
      const configured = readOptionalConfigString(FALLBACK_VOICE_FEMALE_ID);
      if (configured) resolvedVoiceId = configured;
    }

    const db = getFirestore();
    // §100 — 단계별 소요(ms) 로그. 다음 라이브 측정에서 준비 대기의 어느 구간이 긴지 가린다(ID · 내용 0).
    const prepStartedAt = Date.now();
    const prepMs: Record<string, number> = {};

    // AC-017 서버측 동의 게이팅(#4 보안 하드닝, 2026-07-22) — 그동안 동의 확인은 클라 라우팅
    // (RouteGuard·consent 페이지)에만 의존했다. 콜러블을 직접 호출하면 동의 없이 세션이 생성될 수
    // 있어, 서버에서도 users/{uid}/consents(granted:true)를 1건 이상 확인한다(클라 hasGrantedConsent와
    // 동일 기준). 동의 없으면 세션 생성을 거부한다.
    const consentSnap = await db
      .collection("users")
      .doc(request.auth.uid)
      .collection("consents")
      .where("granted", "==", true)
      .limit(1)
      .get();
    if (consentSnap.empty) {
      throw new HttpsError("failed-precondition", "훈련 참여 동의가 필요합니다.");
    }

    // §66.3 — createSession 롤링 윈도우(폭주 백스톱, G180 승계). ⛔ 위치가 설계다: 동의 게이트
    // 뒤(동의 오류가 먼저 나와야 한다) · generateOpeningLine 앞(이 게이트의 존재 이유가 그 LLM
    // 호출을 막는 것이다, challenge/index.ts:108-110과 동일 원칙) · 세션 문서 write 앞(거절된
    // 시도가 창을 더럽히지 않는다).
    const recentSnap = await db
      .collection("sessions")
      .where("uid", "==", request.auth.uid)
      .orderBy("createdAt", "desc")
      .limit(CREATE_SESSION_WINDOW_MAX + 1)
      .get();
    const nowMs = Date.now();
    if (
      isCreateSessionRateLimited({
        // ⛔ createdAt 부재 문서는 세지 않는다 — "값이 없으니 기본이겠지"를 판정 근거로 삼지 않는다
        // (§15.0-4 승계, §66.3).
        recentCreatedAtMs: recentSnap.docs
          .map((d) => (d.get("createdAt") as FirebaseFirestore.Timestamp | undefined)?.toMillis())
          .filter((t): t is number => typeof t === "number"),
        nowMs,
      })
    ) {
      throw new HttpsError(
        "resource-exhausted",
        "짧은 시간에 너무 많이 시작했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }

    // roleplay 모듈(트랙 A 내부 계약, Architecture.md §4)에 오프닝 사기범 대사 생성을 위임한다.
    // LLM 호출 지점은 functions/src/llm 어댑터를 거친다(sendMessage와 동일 구조, T7 태스크 지시).
    // isMock은 generateOpeningLine이 실제로 관측한 값을 그대로 쓴다(별도 isUsingMockLlm() 사전
    // 확인과 분리 — completeWithFallback 도입 후 그 둘이 다른 사실이 될 수 있음, openingLine.ts
    // 주석 참고. 사용자 실측 신고로 발견된 정합성 버그 수정, 2026-07-24).
    // T72(§15.3.3 호출부 3곳 중 "오프닝 대사") — 세션 문서 write 전이라 요청값(정규화 완료)을 직접
    // 넘긴다. 여기서 빠뜨리면 오프닝 첫 마디만 중급으로 나오는 비대칭이 생긴다(§15.6 G5).
    // T191 S5(PRD AC-096 (e) · D6) — 흐름 변형 배정. 오프닝 대사도 배정된 변형으로 조립해야 하므로
    // generateOpeningLine 앞이다. Firestore 접근은 회전 문서 키 조회 1건뿐(인덱스 0 — 설계 금지 X6).
    // 동의 · 한도 게이트 뒤라 거절된 시도는 회전 문서를 읽지도 쓰지도 않는다.
    // 개발 단계 루트 강제 지정(`devRouteOverride.ts` 판정표) — 적용되면 회전 덱을 읽지도 쓰지도 않는다(후보 1개 = 회전 문서 0).
    const routeOverride = resolveDevRouteOverride({
      enabled: isDevRouteOverrideEnabled(),
      requested: forceVariantId,
      scenarioId,
      level: resolvedDifficultyLevel,
    });
    const variantAssignment = routeOverride.applied
      ? { flowVariantId: routeOverride.variantId, candidates: [routeOverride.variantId] }
      : await assignFlowVariantForSession(db, request.auth.uid, scenarioId, resolvedDifficultyLevel);
    // §81 — 세션 가상 은행명을 오프닝 전에 고른다(오프닝 대사와 세션 문서가 같은 이름을 쓴다).
    // U3 — 변형 배정 뒤로 옮겼다: 예금주가 보이는 계좌면 그 묶음의 고정 은행(`smsGate.ts` `pickSessionBankName`).
    const fictionalBankName = pickSessionBankName(scenarioId, variantAssignment.flowVariantId);
    // T4: sessionId(온보딩 "사전 세션 id")가 넘어오면 createVoiceClone이 만들어 둔 pending
    // sessions/{sid} 문서를 새로 만들지 않고 채택한다 — sessionId 불일치 갭 해소. 넘어오지 않으면
    // 기존과 동일하게 새 id를 발급한다(하위호환). ID 생성/채택 로직만 바꿨고, 그 외 인격유지·
    // 가드레일·프롬프트 조립 로직은 그대로다.
    let sessionRef = db.collection("sessions").doc();
    if (sessionId) {
      const candidateRef = db.collection("sessions").doc(sessionId);
      const candidateSnap = await candidateRef.get();
      if (candidateSnap.exists) {
        const candidate = candidateSnap.data();
        if (candidate?.uid !== request.auth.uid) {
          throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
        }
        // #1 치명 버그 차단(2026-07-22): 같은 사전 id로 이미 시작(active)되었거나 종료(ended)된
        // 세션을 되살려 쓰지 못하게 막는다. 정상 클론 경로의 pending 문서는 status:"created"라
        // 통과한다. 클라(session/end)가 종료 시 사전 id를 비우므로 정상 흐름에선 이 경로에 안 걸리며,
        // 이 가드는 클라 클리어가 누락된 경우의 서버측 이중 방어다.
        if (candidate?.status === "active" || candidate?.status === "ended") {
          throw new HttpsError(
            "failed-precondition",
            "이미 사용된 세션입니다. 시나리오 선택부터 다시 시작해 주세요.",
          );
        }
      }
      sessionRef = candidateRef;
    }
    // §100 ① "훈련 내용" — 동의 · 한도 게이트 통과 + 흐름 변형 배정 + 사전 세션 id 확인이 끝났다.
    prepMs.scenarioMs = Date.now() - prepStartedAt;
    await emitPrepStage(response, "scenario");
    // T194-b(§84.3.4) — 오프닝 대사도 카드를 알아야 한다(§81과 같은 이유). 카드는 위(§88)에서 이미 확정됐다.
    const { message: openingMessage, isMock } = await generateOpeningLine(
      scenarioId,
      resolvedDifficultyLevel,
      variantAssignment.flowVariantId,
      { fictionalBankName, challengeId: undefined, personaCard: personaCard?.items, voiceSelectionSource, familyAddress },
    );
    // §100 ② "첫마디" — 오프닝 대사 생성(LLM)이 끝났다.
    prepMs.openingMs = Date.now() - prepStartedAt - prepMs.scenarioMs;
    await emitPrepStage(response, "opening");

    const now = Timestamp.now();

    // NOTE(T3/T8 후속): identitySelfConfirmed는 CreateSessionRequest 계약에 없다(API.md). voiceId가
    // 전달됐다는 것은 이미 본인 확인 게이트(ADR-0002)를 통과해 createVoiceClone까지 마쳤다는 뜻이라
    // true로 간주한다 — T3(온보딩)이 별도 소스(예: consents 문서)를 명시적으로 넘기고 싶다면 이
    // 가정을 교체하면 된다.
    const sessionDoc: SessionDoc = {
      sessionId: sessionRef.id,
      uid: request.auth.uid,
      scenarioId,
      status: "active",
      voiceId: resolvedVoiceId,
      cloneStatus: "ready",
      identitySelfConfirmed: true,
      turnCount: 0,
      maxUserTurns: isEscalationCapable ? MESSENGER_ESCALATION_MAX_USER_TURNS : MAX_USER_TURNS,
      maxSessionMs: MAX_SESSION_MS,
      createdAt: now,
      // T30 추가(§13.1) — 세션이 처음 시작된 채널. 생성 시 1회만 기록(이후 전이와 무관하게 불변).
      entryChannel: channel ?? "voice",
      // Firestore admin SDK는 필드값 undefined를 기본적으로 거부하므로(ignoreUndefinedProperties
      // 미설정), Mock이 아닐 때는 llmProvider 필드 자체를 생략한다.
      ...(isMock ? { llmProvider: "mock" as const } : {}),
      // 메신저피싱 확장(T29) — UX-024가 넘긴 경우에만 채운다. 부재 시 기존과 동일하게 voice
      // 세션으로 생성된다(Migration Policy, Architecture.md §13.1/13.4).
      ...(channel ? { channel } : {}),
      ...(surface ? { surface } : {}),
      ...(messengerSkin ? { messengerSkin } : {}),
      ...(skinSource ? { skinSource } : {}),
      // UX-025(§13.6) — 에스컬레이션 가능 메신저 시나리오에서만 채워진다.
      ...(voiceSelectionSource ? { voiceSelectionSource } : {}),
      // T72(§15.3.2) — 항상 확정값을 기록한다(부재 문서는 하위호환 읽기로만 처리하고, 새 문서는
      // 명시 필드를 남긴다 — "값이 없으니 기본이겠지"를 판정 근거로 삼지 않는다는 §15.0-4 원칙).
      difficultyLevel: resolvedDifficultyLevel,
      fictionalBankName,
      // T191 S5(AC-096 (e)) — 배정된 흐름 변형의 **불투명 ID**만 기록한다(수법 · 흐름 0 — X1 · C-4).
      // 여기 값은 미리보기이고, 아래 트랜잭션이 회전 문서를 다시 읽어 확정값으로 덮어 쓴다.
      // 응답에는 싣지 않는다(세션 전 화면에 변형 정보 0 — 아래 return 참고).
      flowVariantId: variantAssignment.flowVariantId,
      ...(routeOverride.applied ? { routeOverride: "forced" as const } : {}),
      // T194-b(§84.3.2) — 대상 세션에만 필드가 생긴다(대상 밖 = 부재 · 빈 값 0). 오프닝에 넘긴 것과 같은 객체다.
      ...(personaCard ? { personaCard } : {}),
      // §110.5 — 고른 경우에만(부재 = 종전 문면).
      ...(familyAddress ? { familyAddress } : {}),
    };
    // merge:true — sessionId를 채택한 경우 pending 문서(createVoiceClone이 만든 voiceProvider 등
    // 부가 필드)를 지우지 않고 scenarioId/status 등을 덧씌운다. 새 문서인 경우는 기존과 동일.
    // T191 S5 — 회전 문서(`users/{uid}/variantRotation/{scenarioId}__{level}`)와 세션 문서를 **한
    // 트랜잭션**으로 쓴다(회전 문서를 다시 읽어 확정 → 둘을 같은 커밋). 동시 생성 경합에서도 연속 배정 0.
    // 후보가 1개면 회전 문서를 읽지도 쓰지도 않는다.
    sessionDoc.flowVariantId = await commitSessionWithVariant(
      db,
      sessionRef,
      sessionDoc,
      variantAssignment,
      now,
    );

    await sessionRef.collection("messages").add({
      role: "scammer",
      textMasked: openingMessage.text,
      turnIndex: 0,
      createdAt: now,
      // PR-A3(감사 B 1일차 #11) — 오프닝 대사에 실린 링크 칩도 저장한다. 빠져 있으면 리포트 앵커(첫 칩 메시지 ·
      // mockScreenTimeline.ts)가 첫 응답으로 밀린다. 칩이 없으면 필드 부재(종전 그대로).
      ...(openingMessage.attachments ? { attachments: openingMessage.attachments } : {}),
      // T30 추가(§13.1) — 교차채널 타임라인(AC-037)용 채널 표기. 보이스 전용 세션은 기존과 동일하게
      // 필드 부재.
      ...(channel ? { channel } : {}),
    } satisfies MessageDoc);

    // 실시간 음성 통화 전환(2026-07-22 사용자 결정) — sendMessage.audioUrl과 동일 패턴으로 오프닝
    // 대사도 합성한다. 실패해도 세션 생성 자체는 막지 않는다(P-4 비차단 원칙).
    // T29 reviewer Major #2: channel="messenger"는 UI가 audioUrl을 아예 재생하지 않으므로(채팅은
    // 텍스트 전용, 에스컬레이션 전까지 TTS 불필요) 합성 자체를 건너뛴다 — Mock에서는 무해하지만
    // 실 ElevenLabs 연동 후 턴마다 불필요한 비용·지연·Storage 산출물(AC-021 폐기 대상)이 쌓이는
    // 것을 막는다.
    let openingAudioUrl: string | undefined;
    if (channel !== "messenger") {
      try {
        const synthesis = await getVoiceProvider().synthesize({
          sessionId: sessionRef.id,
          voiceId,
          text: openingMessage.text,
        });
        openingAudioUrl = synthesis.audioUrl;
      } catch {
        // 합성 실패는 무시 — 클라는 openingAudioUrl 없으면 텍스트만 표시(폴백).
      }
    }
    // §100 ③ "저장" — 세션 문서 · 오프닝 메시지 커밋(+ 보이스면 오프닝 합성 시도)이 끝났다. 바로 아래가 응답이다.
    prepMs.savedMs = Date.now() - prepStartedAt - prepMs.scenarioMs - prepMs.openingMs;
    await emitPrepStage(response, "saved");
    logger.info("[session-prep] createSession", {
      ...prepMs,
      totalMs: Date.now() - prepStartedAt,
      streaming: request.acceptsStreaming === true,
      channel: channel ?? "voice",
    });

    return {
      sessionId: sessionRef.id,
      openingMessage,
      // T30 버그 수정(에뮬레이터 검증 중 발견): sessionDoc.maxUserTurns는 이미 에스컬레이션 여부에
      // 따라 분기했는데 이 응답 값은 MAX_USER_TURNS를 그대로 하드코딩해 응답과 저장값이 어긋나 있었다.
      maxUserTurns: sessionDoc.maxUserTurns,
      maxSessionMs: MAX_SESSION_MS,
      isMock,
      ...(openingAudioUrl ? { openingAudioUrl } : {}),
      // T72 — 실제로 적용된 난이도(폴백 감지용, §15.3.2).
      difficultyLevel: resolvedDifficultyLevel,
    };
  },
);

// ⚠️ T133/AC-081 — 이 파일은 `../roleplay`→`../llm` 경로로 GEMINI 키를 읽으므로, 이 파일의
// **모든** 콜러블이 같은 시크릿을 선언한다(비교 단위 = 파일 폐포, Architecture.md §41.5).
// ⛔ "이 핸들러가 직접 읽는다"는 뜻이 아니다(§41.10 (6)). 선언 프로필이 다른 콜러블을 이 파일에
// 새로 추가하지 말 것 — 파일을 나눠라(G212).
export const endSession = onCall<EndSessionRequest, Promise<EndSessionResponse>>(
  { secrets: [...LLM_TEXT_SECRETS] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { sessionId, endReason } = request.data ?? {};
    if (!sessionId || !endReason) {
      throw new HttpsError("invalid-argument", "sessionId와 endReason이 필요합니다.");
    }
    // T192 C1(§79.5 ① · G508) — 사유 허용목록. 그 밖의 문자열은 기록하지 않는다.
    const requestedReason = readEndSessionReason(endReason);
    if (!requestedReason) {
      throw new HttpsError(
        "invalid-argument",
        "endReason은 user_ended · limit_reached · scammer_ended 중 하나여야 합니다.",
      );
    }

    const db = getFirestore();
    const sessionRef = db.collection("sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
    }
    const session = sessionSnap.data() as SessionDoc;
    if (session.uid !== request.auth.uid) {
      throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
    }
    assertAnonymousChallengeScope(request.auth, session);

    // 멱등 처리(API.md endSession Errors 절: "이미 ended면 멱등 처리") — 이미 종료된 세션이면
    // status/endReason/endedAt을 재작성하지 않고 동일 응답만 반환한다. sendMessage의 한도 도달
    // 자동 종료 경로가 먼저 status=ended를 썼을 수도 있으므로(AC-007), 여기서 재작성하면
    // endReason이 덮어써지고 리포트 생성 트리거가 중복 호출될 위험이 있다(AC-007 "정확히 1개
    // 리포트" 불변식 보호).
    if (session.status === "ended") {
      return { status: "ended", reportPending: true };
    }

    // T192 C1(§79.5 ② · G508) — 서버 승인 표식 없는 `scammer_ended`는 `user_ended`로 기록한다(거절 0 —
    // AC-006 "종료는 항상 성공"). 멱등 반환(위)보다 **뒤**라 먼저 쓴 사유는 그대로 남는다.
    const recordedReason = resolveRecordedEndReason(requestedReason, session);
    if (recordedReason !== requestedReason) {
      logger.info("endSession 사유 강등 — 끊기 승인 표식 없음", {
        requested: requestedReason,
        recorded: recordedReason,
      });
    }

    // §129 에뮬 D1 — 받기 전에 끝난 통화의 오프닝은 들린 적이 없다(`unheardOpening.ts` 표). 리포트 트리거보다 **앞**에서 표시한다.
    // 실패해도 종료는 막지 않는다(AC-006 "종료는 항상 성공").
    try {
      const userProbe = await sessionRef.collection("messages").where("role", "==", "user").limit(1).get();
      if (shouldMarkOpeningUnheard(session, userProbe.size)) {
        const openingSnap = await sessionRef.collection("messages").where("turnIndex", "==", 0).limit(1).get();
        const opening = openingSnap.docs[0];
        if (opening && (opening.data() as MessageDoc).role === "scammer" && (opening.data() as MessageDoc).notSpoken !== true) {
          await opening.ref.update({ notSpoken: true });
          logger.info("[§129] 받기 전 종료 — 오프닝 낭독 안 됨 표시", { sessionId });
        }
      }
    } catch {
      // 표시 실패는 리포트에 들린 적 없는 첫마디가 남는 정도의 열화다(종전 동작).
    }

    await sessionRef.update({
      status: "ended",
      endReason: recordedReason,
      endedAt: Timestamp.now(),
    } satisfies Partial<SessionDoc>);

    // 이 write 자체가 Firestore 트리거 onSessionEnded(T10, 생성물 즉시 폐기)를 유발한다
    // (Architecture.md §5/§6.2) — 여기서 별도로 호출할 필요 없다(T10 소관, 이번 태스크가 신경 쓸
    // 부분 아님). 리포트 생성은 endSession이 직접 개시한다(Architecture.md §5 다이어그램의
    // "endSession → generateReport" 화살표). 실제 생성 로직은 아직 없지만(T9), 트리거 지점은 여기다
    // — 실패해도 세션 종료 응답 자체를 막지 않는다(triggerReportGeneration이 내부에서 에러를
    // 흡수한다, functions/src/report/index.ts 참고).
    await triggerReportGeneration(sessionId);

    return { status: "ended", reportPending: true };
  },
);

// 메신저 채팅(UX-022) 스킨 감지/수동 전환 결과 지속(T29, P-16, AC-031). endSession과 동일한
// 패턴(인증·존재확인·소유 uid 검증)을 쓴다 — firestore.rules가 sessions/{sessionId} 클라 write를
// 전부 거부하므로(#3 보안 하드닝) 콜러블 없이는 클라가 스킨 선택을 지속시킬 방법이 없다.
export const updateMessengerSkin = onCall<
  UpdateMessengerSkinRequest,
  Promise<UpdateMessengerSkinResponse>
>({ secrets: [...LLM_TEXT_SECRETS] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId } = request.data ?? {};
  if (!sessionId || !request.data?.messengerSkin || !request.data?.skinSource) {
    throw new HttpsError("invalid-argument", "sessionId·messengerSkin·skinSource가 필요합니다.");
  }
  // 신고 항목 4 — truthy 체크만으로는 임의 문자열("SAMSUNG" 대소문자 오탈자 등)이 조용히 통과해
  // Firestore에 잘못된 값으로 저장될 수 있었다. enum 값인지 실제로 검증한다.
  const messengerSkin = readMessengerSkin(request.data.messengerSkin);
  const skinSource = readSkinSource(request.data.skinSource);

  const db = getFirestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
  }
  const session = sessionSnap.data() as SessionDoc;
  if (session.uid !== request.auth.uid) {
    throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
  }
  assertAnonymousChallengeScope(request.auth, session);

  await sessionRef.update({ messengerSkin, skinSource } satisfies Partial<SessionDoc>);
  return { messengerSkin, skinSource };
});

// 명시 전환 버튼("전화로 확인", T30, UX-022·§13.3/AC-034) — 사용자가 1턴부터 언제든 수동으로
// 메신저→보이스 전이를 요청한다. endSession/updateMessengerSkin과 동일한 인증·존재확인·소유uid·
// 상태 검증 패턴을 쓴다. 에스컬레이션이 불가능한 시나리오·이미 voice로 전이된 세션에 대한 요청은
// 조용히 무시하지 않고 명시적으로 거부한다(AC-039 "조용한 실패 금지").
export const requestEscalation = onCall<
  RequestEscalationRequest,
  Promise<RequestEscalationResponse>
>({ secrets: [...LLM_TEXT_SECRETS] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId, via } = request.data ?? {};
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "sessionId가 필요합니다.");
  }

  const db = getFirestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
  }
  const session = sessionSnap.data() as SessionDoc;
  if (session.uid !== request.auth.uid) {
    throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
  }
  assertAnonymousChallengeScope(request.auth, session);
  if (session.status !== "active") {
    throw new HttpsError("failed-precondition", "이미 종료되었거나 활성 상태가 아닌 세션입니다.");
  }
  if (session.channel !== "messenger") {
    throw new HttpsError("failed-precondition", "메신저 채널 세션에서만 요청할 수 있습니다.");
  }
  // T194-a(§84.4.1 S-2) — 세션 술어(sendMessage 자동 전이 · 클라 버튼 · 시작 고지 열과 같은 술어).
  if (!resolveSessionEscalation(session, PUBLIC_SCENARIOS)) {
    // 실기 신고 4(2026-10-21) — 카톡형 프로필 시트 "보이스톡"은 통화로 이어지지 않는 세션에도 있다. 사기범은 받지 않고
    // 채팅으로 돌린다(`voiceTalkUnanswered.ts` 표 2행). 문자형 · `via` 없음은 종전대로 거부(3행).
    if (via === "voice_talk" && PUBLIC_SCENARIOS[session.scenarioId]?.surface === "kakao") {
      const turnIndex = await recordVoiceTalkUnanswered(db, sessionId);
      return { voiceTalk: "unanswered", turnIndex };
    }
    throw new HttpsError("failed-precondition", "이 시나리오는 통화 전이를 지원하지 않습니다.");
  }

  // §123 — 대화방 보이스톡 발신이면 참가자가 건 통화로 기록한다(통화 첫마디 · Live 맥락이 본다).
  await transitionChannel(
    sessionId,
    "messenger",
    "voice",
    "manual_button",
    undefined,
    via === "voice_talk_dial" ? { caller: "participant" } : undefined,
  );
  return { escalation: { toChannel: "voice" } };
});

// 역방향 명시 전환 버튼("메시지로 전환", T40 fast-follow, UX-014 통화 화면·§13.1/13.0/AC-039) —
// 통화 중인 사용자가 언제든 수동으로 보이스→메신저 전이를 요청한다. requestEscalation과 동일한
// 인증·존재확인·소유uid·상태 검증 패턴을 쓰되 방향과 채널 사전조건이 반대다.
//
// **스코프 축소(T40 판단, docs/Tasks.md T40 행에 상세 근거)**: 정방향(structured_signal/
// maxturn_fallback, T25/T26/T30)과 달리 역방향에는 그 트리거에 대응하는 UX/Architecture 설계
// 문서가 없다(무엇을 신호로 볼지 정의된 바 없음) — 이 태스크는 명시 버튼(manual_button)만 배선한다.
//
// **시나리오 게이팅(판단 근거)**: transitionChannel 자체는 channel 필드만 뒤집을 뿐 시나리오별
// 메신저 콘텐츠 존재를 요구하지 않는다. 하지만 클라 `/session/messenger`
// (src/app/session/messenger/page.tsx)는 `scenarios[scenarioId].channel !== "messenger"`면
// "시나리오 정보를 찾을 수 없습니다"로 막아 렌더링하지 않는다(순수 보이스 시나리오는 애초에
// `channel:"messenger"` 메타가 없다 — functions/src/scenarios/publicMeta.ts 확인). 서버가 채널
// 플래그만 뒤집고 실제로는 아무 데도 못 가는 상태를 만드는 대신, 메신저 콘텐츠가 존재하는
// 시나리오(현재는 메신저→보이스로 정방향 에스컬레이션된 세션뿐)에서만 명시적으로 허용한다
// (AC-039 "조용한 실패 금지" — 여기서는 "성공한 척하고 화면만 막힘"을 피하는 형태로 적용).
export const requestReverseEscalation = onCall<
  RequestReverseEscalationRequest,
  Promise<RequestReverseEscalationResponse>
>({ secrets: [...LLM_TEXT_SECRETS] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId } = request.data ?? {};
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "sessionId가 필요합니다.");
  }

  const db = getFirestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
  }
  const session = sessionSnap.data() as SessionDoc;
  if (session.uid !== request.auth.uid) {
    throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
  }
  assertAnonymousChallengeScope(request.auth, session);
  if (session.status !== "active") {
    throw new HttpsError("failed-precondition", "이미 종료되었거나 활성 상태가 아닌 세션입니다.");
  }
  // 부재 시 "voice"로 간주(Migration Policy, shared/types.ts SessionDoc.channel 주석과 동일 기준).
  if ((session.channel ?? "voice") !== "voice") {
    throw new HttpsError("failed-precondition", "보이스 채널 세션에서만 요청할 수 있습니다.");
  }
  if (PUBLIC_SCENARIOS[session.scenarioId]?.channel !== "messenger") {
    throw new HttpsError("failed-precondition", "이 시나리오는 메시지 전환을 지원하지 않습니다.");
  }

  // reviewer 리뷰 Major #2 수정 — 이 시점의 누적 turnCount를 기준점으로 함께 기록해, sendMessage의
  // max-turn 폴백이 "메신저 재진입 이후 턴 수"만 보게 한다(channelTransition.ts 헤더 주석 참고).
  await transitionChannel(sessionId, "voice", "messenger", "manual_button", session.turnCount);
  // §112 — 사기범이 통화를 끊고 돌아온 경우(표식 있음)는 종류로 정한다(`callReturn.ts` `decideCallReturn` 판정표).
  const callReturn = decideCallReturn(session.scammerHangup);
  if (callReturn !== "follow_up_user") {
    const endedNow = await applyCallReturnSessionUpdate(db, sessionId, callReturn);
    if (callReturn === "scammer_left") {
      // 목표 달성 끊기 — 대화방은 "상대방이 채팅방을 나갔습니다"로 끝난다. 이 경로가 세션을 끝냈으면 리포트 트리거(sendMessage 끊기와 같은 지점).
      if (endedNow) await triggerReportGeneration(sessionId);
      return { escalation: { toChannel: "messenger" }, scammerLeft: true };
    }
  }
  // §110.4(실기 신고 13) — 통화를 끊고 돌아온 경우 사기범이 통화 내용을 반영해 먼저 메시지를 보낸다. 실패는 전환을 막지 않는다(P-4).
  if (request.data?.followUp === true) {
    try {
      const followUpTurnIndex = await recordCallReturnLine(db, sessionId, callReturn === "follow_up_scammer" ? "scammer" : "user");
      if (followUpTurnIndex !== undefined) return { escalation: { toChannel: "messenger" }, followUpTurnIndex };
    } catch (err) {
      logger.warn("통화 복귀 메시지 생성 실패(전환은 완료)", { sessionId, err: err instanceof Error ? err.message : "unknown" });
    }
  }
  return { escalation: { toChannel: "messenger" } };
});
