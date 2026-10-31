// 스미싱 링크 마커 파싱 (T29, Architecture.md §13.2/13.4, AC-032/045).
//
// **왜 sentinel 토큰과 같은 패턴을 재사용하는가(판단 근거, 신규 메커니즘 아님)**: T26 architect가
// 확정한 `[[SIGNAL:ESCALATE_VOICE]]` 처리 방식 — 역할극 LLM의 **어시스턴트 출력에만** 있는 고정
// 제어 마커를 서버가 스캔·파싱한 뒤 **텍스트에서 제거**하고, 사용자에게는 마커 원문을 노출하지
// 않은 채 구조화된 의미(여기서는 attachments)로 변환해 클라에 돌려준다(§13.2) — 를 스미싱 링크
// 표현에도 그대로 적용한 것이다. 사용자 입력은 절대 신호로 해석하지 않는다는 원칙(AC-024)도
// 동일하게 적용된다 — 이 함수는 LLM 완성 텍스트(오프닝 대사·sendMessage 응답)에만 호출되고,
// 사용자 입력에는 호출되지 않는다(functions/src/roleplay/openingLine.ts·index.ts 참고).
import {
  DEFAULT_MOCK_SCREEN_KIND,
  findDefaultCredentialLanding,
  findMockScreenItem,
  isBankTransferLanding,
  isMockScreenReachable,
  resolveMockScreenKind,
} from "../scenarios/mockScreens";
import type { EscalationSessionView } from "../scenarios/escalation";
import type { MessengerAttachment } from "../shared/types";

const LINK_MARKER_PATTERN = /\[\[LINK:([a-zA-Z0-9_-]+)\]\]/g;

// 콘텐츠(T27)가 정의한 고정 라벨 맵 — scenarioPrompts가 사용하는 fakeLandingId와 1:1.
// 매핑에 없는 id가 나오면(콘텐츠 오탈자 등) 조용히 실패하지 않고 기본 라벨로 대체한다.
//
// ⚠️ T84(§15.9.7 G53) — `MOCK_SCREENS`의 landingId가 여기 없으면 칩 라벨이 "확인하기" 기본값으로
// 떠 유도가 무의미해진다. 두 맵의 집합 정합은 드리프트 테스트가 고정한다. 이 맵은 **칩 라벨의
// 진실 원천 그대로**이고(§15.9.1 R4 "LINK_LABELS는 무변경"), 카탈로그는 kind·화면 콘텐츠만 소유한다.
const LINK_LABELS: Record<string, string> = {
  "parcel-redelivery": "재배송 신청 확인하기",
  "subsidy-apply": "지원금 신청하기",
  "subsidy-install": "지원금 신청 앱 설치하기",
  // T194-a(§84.4.3 · G53) — parcel 고급의 모의 앱 설치 칩.
  "parcel-install": "배송 확인 앱 설치하기",
  // §110.2(실기 신고 10) — 자녀 사칭 카톡 고급의 모의 보험 접수 앱 설치 칩.
  "child-insurance-install": "보험 접수 앱 설치하기",
  // ⭐ P2-c(X6) — 자녀 · 지인 사칭의 훈련용 이체 화면 칩(실제 뱅킹 앱을 열 이유를 없앤다).
  "child-bank-transfer": "이체하기",
  "friend-bank-transfer": "송금하기",
};
const DEFAULT_LINK_LABEL = "확인하기";

/** 마커 자리 표식(PR-A3) — 정리 직후 전부 지워져 반환 텍스트에 남지 않는다. 모델 출력에 나올 수 없는 제어 문자다. */
const MARKER_GAP = "\u0000";
/** 마커 바로 뒤에 붙으면 앞 공백을 지우는 조사(PR-A3 · 리뷰 Minor 2). 조사 뒤에 한글이 더 붙으면 조사가 아니다("이용" · "가입"). */
const MARKER_PARTICLE = "(?:에서|에게|으로|에|로|을|를|이|가|은|는|의|도|와|과|만)(?![가-힣])";

/**
 * 어시스턴트 완성 텍스트에서 `[[LINK:id]]` 마커를 찾아 attachments로 변환하고, 텍스트에서는
 * 마커 자체를 제거한다(사용자는 마커 원문을 보지 않는다). 마커가 없으면 원문을 그대로 반환한다
 * (attachments 필드 없음).
 *
 * T84(§15.9.1 R4) — attachment에 `landingKind`를 싣는 **유일 지점**이다. 시나리오 스코프 조회가
 * 필요해 `scenarioId`를 받으며(호출부 2곳: `roleplay/index.ts`·`roleplay/openingLine.ts`),
 * 기본값(`credential-form`)일 때는 **키 자체를 만들지 않는다** — 카탈로그가 없는 12개 시나리오의
 * attachment 문서가 도입 전과 완전히 동일하게 유지된다(무백필·회귀 0, §15.0.4 하위호환 읽기 규칙).
 *
 * ⭐ T194-a(docs/Architecture.md §84.4.4 · G582) — `session`(세션의 시나리오 · 난이도 · 챌린지 여부)을 받아 **이 세션에서 도달할 수
 * 없는 `app-install` 마커**(예: 초급 parcel 모델이 `[[LINK:parcel-install]]`을 지어냄)를 그 시나리오의 기본 credential 랜딩으로
 * 강등하고 경고 1줄을 남긴다(조용한 임의 동작 0 — `flowVariants.ts` `flow_variant_unresolved` 관례). 기본 랜딩이 없으면 첨부를
 * 만들지 않는다(마커는 텍스트에서 지워진다). ⛔ `app-install` 방향 폴백은 여전히 0이다(R5).
 * `session` 부재는 **고급 아님 · 챌린지 아님**으로 본다(닫힌 쪽 — `advancedEscalation`만 가진 시나리오의 설치 마커는 강등된다).
 * 호출부 2곳(`roleplay/index.ts` · `roleplay/openingLine.ts`)은 항상 넘긴다(`linkMarker.test.ts` 소스 스캔).
 */
export function extractLinkMarker(
  text: string,
  scenarioId?: string,
  session?: Omit<EscalationSessionView, "scenarioId"> & { flowVariantId?: string },
): {
  text: string;
  attachments?: MessengerAttachment[];
} {
  const attachments: MessengerAttachment[] = [];
  let markerCount = 0;

  const cleaned = text
    .replace(LINK_MARKER_PATTERN, (_match, markerLandingId: string) => {
      markerCount += 1;
      const fakeLandingId =
        scenarioId === undefined ? markerLandingId : reachableLandingIdFor(scenarioId, markerLandingId, session);
      if (fakeLandingId === undefined) return MARKER_GAP;
      const landingKind =
        scenarioId === undefined
          ? DEFAULT_MOCK_SCREEN_KIND
          : resolveMockScreenKind(scenarioId, fakeLandingId);
      attachments.push({
        kind: "link",
        displayText: LINK_LABELS[fakeLandingId] ?? DEFAULT_LINK_LABEL,
        fakeLandingId,
        harmless: true,
        ...(landingKind === DEFAULT_MOCK_SCREEN_KIND ? {} : { landingKind }),
      });
      return MARKER_GAP;
    })
    // PR-A3(감사 B 1일차 #6 · #10) — 마커가 있던 **자리**에서만 생기는 잔재 2종을 지운다(자리 표식 MARKER_GAP 기준이라
    // 마커가 없던 곳의 백틱 · 띄어쓰기는 건드리지 않는다). ① 모델이 마커를 백틱으로 감쌌으면("`[[LINK:id]]`") 빈 백틱 "``"이
    // 남는다 → 백틱째 지운다. ② 마커 바로 뒤에 조사가 붙어 있으면("링크 [[LINK:id]]에") "링크 에"가 남는다 → 마커 앞 공백을 지운다.
    .replace(new RegExp(`\`${MARKER_GAP}\``, "g"), MARKER_GAP)
    // 리뷰 Minor 2 — 마커 뒤가 **조사 목록**(뒤에 한글이 더 붙지 않는 꼴)일 때만이다. "아래 [[LINK:x]]확인"은 "아래 확인"으로 둔다.
    .replace(new RegExp(`[ \\t]*${MARKER_GAP}(?=${MARKER_PARTICLE})`, "g"), "")
    .replace(new RegExp(MARKER_GAP, "g"), "")
    // 마커 제거로 생긴 연속 공백·구두점 앞 공백만 정리한다(문장 구조 자체는 건드리지 않음).
    // 마커가 문장 끝("...확인해 주세요 [[LINK:id]].")에 있으면 제거 후 "확인해 주세요 ."처럼
    // 구두점 앞에 공백이 남는데, 이걸 마저 지운다.
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([.,!?])/g, "$1")
    .trim();

  if (markerCount === 0) {
    return { text };
  }
  // T194-a — 마커는 있었으나 전부 강등 대상(기본 랜딩 없음)이면 첨부 없이 마커만 지운 텍스트를 돌려준다(마커 원문 노출 0).
  if (attachments.length === 0) {
    return { text: cleaned };
  }
  return { text: cleaned, attachments };
}

/**
 * 마커 id → 이 세션에서 실제로 열 랜딩 id(§84.4.4). 카탈로그에 없는 id · `credential-form` · 도달 가능한 `app-install`은 그대로,
 * 도달 불가 `app-install`은 기본 credential 랜딩 id(없으면 `undefined` = 첨부 없음).
 */
function reachableLandingIdFor(
  scenarioId: string,
  markerLandingId: string,
  session: (Omit<EscalationSessionView, "scenarioId"> & { flowVariantId?: string }) | undefined,
): string | undefined {
  const item = findMockScreenItem(scenarioId, markerLandingId);
  // ⛔ §84.13.2 G161 — 이 함수는 세션 도달 집합으로 마커를 거르지 않는다(다중 마커 능력 유지 · 거부는 기록 층 G588). 강등은
  // §84.4.4의 "도달 불가 `app-install`" 한 경우뿐이다 — credential-form · 카탈로그 밖 id는 종전 그대로 통과한다.
  if (!item || item.kind !== "app-install" || isMockScreenReachable({ ...session, scenarioId }, item)) return markerLandingId;
  const fallback = findDefaultCredentialLanding(scenarioId);
  console.warn(
    JSON.stringify({
      event: "mock_screen_link_demoted",
      scenarioId,
      from: markerLandingId,
      to: fallback?.landingId ?? null,
    }),
  );
  return fallback?.landingId;
}

/**
 * ⭐ P2-c(2026-10-31 · X6) — 훈련용 이체 화면 칩(`BANK_TRANSFER_LANDINGS`)에만 세션 가상 은행명 · 세션 계좌를 싣는다(받는 계좌 미리 채움 원천 —
 * 통화 중 문자의 `bankName` · `accountNumber`와 같은 역할). 그 밖 칩은 그대로 돌려준다(첨부 문서 모양 무변경). 입력이 `undefined`면 `undefined`.
 */
export function withBankTransferPrefill(
  attachments: MessengerAttachment[] | undefined,
  bankName: string,
  accountNumber: string,
): MessengerAttachment[] | undefined {
  return attachments?.map((attachment) =>
    isBankTransferLanding(attachment.fakeLandingId) ? { ...attachment, bankName, accountNumber } : attachment,
  );
}
