// 모의 화면 타임라인 항목의 **표시 문구 판정** — 순수 함수 (D-61 · P-29 (8), UX-008/UX-018).
//
// **왜 이 파일이 있는가**: 화면이 `consented` 한 필드로 "응함/응하지 않음"을 이분하면
// **제출한 참가자에게 리포트가 거짓을 말한다.** `MockScreenTimelineEntry.consented`
// (`functions/src/shared/types.ts:317`)는 **가짜 "권한 허용"에 응했다** 전용이고 제출 축을 담지
// 않는다 — T123/AC-080이 `submittedAt`을 **별도 필드**로 신설했기 때문이다
// (`functions/src/report/mockScreenTimeline.ts:36-46`). 그래서 **제출은 했는데
// `consented:false`** 인 항목이 실제로 생기고, 같은 리포트 위쪽에는 승격된 "속은 시점" 카드가
// 뜬다 ⇒ 한 리포트가 자기모순이 된다.
//
// ⚠️ **분기 판정에 쓰는 것은 `consented`가 아니라 "같은 순간의 승격 여부"** 다(D-61 implementer
// 인계). `consented:false`를 **단독 근거로** 부정 서술을 렌더하는 것은 금지다.
//
// ⛔ **이 파일이 하지 않는 것**:
//   - 스키마 확장 요구(§18.1 죽은 필드 — 화면이 필요한 정보는 **이미 있다**)
//   - 리포트 표시 이벤트 신설(§31.5 (2) 기각 — 같은 순간이 두 번 렌더된다)
//   - `consented`의 의미 변경(권한 허용 전용)
//   - 서버 파생 로직 변경(이건 **표시 층** 판정이다)
//   - D-51 ③의 문구 삭제 — 분기 "다"에 **한정**할 뿐이다(열어 보고 닫은 참가자에게
//     "잘 대응했다"는 여전히 맞는 말이고, 그것을 지우면 반대 방향 고장이다)

/** 판정에 실제로 쓰는 필드만 받는다 — 리포트·리플레이 두 표면의 타입이 여기서 만난다. */
export type MockScreenCopyEntry = {
  anchorTurnIndex: number;
  anchorResolved: boolean;
  consented: boolean;
};

/** 승격 여부 대조에 쓰는 `deceivedMoments` 항목의 최소 모양. */
export type MockScreenCopyMoment = { turnIndex: number };

/**
 * P-29 (8) 3분기.
 * - `consented`  = 가: 가짜 "권한 허용"에 응함
 * - `submitted`  = 나: 같은 순간에 승격된 `deceivedMoment`가 있다(= 제출함) **또는 대조 불성립**
 * - `declined`   = 다: 열었지만 응하지 않고 닫았다(D-51 ③)
 */
export type MockScreenCopyBranch = "consented" | "submitted" | "declined";

export type MockScreenCopySurface = "report" | "replay";

export type MockScreenCopy = {
  branch: MockScreenCopyBranch;
  /** 화면이 이 항목을 어떤 톤으로 그릴지. `neutral` = 사실 서술만(칭찬도 경고도 아니다). */
  tone: "caution" | "neutral" | "praise";
  /** 리플레이 주석 상자의 소제목. 분기 "나"에는 **없다**(사실 1줄에서 멈춘다). */
  heading?: string;
  text: string;
};

/**
 * ⭐ **OQ-U32 — 두 항목을 "같은 순간"으로 묶는 키**: `deceivedMoment.turnIndex` ↔
 * `MockScreenTimelineEntry.anchorTurnIndex`.
 *
 * 근거는 승격을 조립하는 **단 한 곳**이다 —
 * `buildLandingSubmitMoment(item, anchor.anchorTurnIndex, anchor.timeLabel)`
 * (`functions/src/report/mockScreenTimeline.ts:113-129` · 호출부 195). 승격된 순간의
 * `turnIndex`는 **정의상** 그 항목의 `anchorTurnIndex`이고 `timeLabel`도 같은 값이 복사된다
 * (그래서 `timeLabel`은 중복 확인일 뿐 판정에 더 보태지 않는다).
 *
 * ⛔ **안전 폴백은 분기 "나"** 다. 서버는 `anchorResolved && anchorTurnIndex >= 0`일 때만
 * 승격한다(같은 파일 189-193, §31.6 G135) ⇒ 그 조건이 깨진 항목은 **제출했더라도 승격이 없다**.
 * 그때 "승격 없음"을 "응하지 않았다"로 읽으면 제출한 참가자를 낙인찍는다. 그래서 **대조가
 * 성립하지 않는 경로는 전부 "나"로 떨어뜨린다** — 틀려도 참가자를 낙인찍지 않는 쪽이다.
 */
export function resolveMockScreenBranch(
  entry: MockScreenCopyEntry,
  deceivedMoments: readonly MockScreenCopyMoment[],
): MockScreenCopyBranch {
  if (entry.consented) return "consented";
  // 승격이 구조적으로 불가능한 경로 = 대조 불성립 → 안전 폴백(나).
  if (!entry.anchorResolved || entry.anchorTurnIndex < 0) return "submitted";
  if (deceivedMoments.some((moment) => moment.turnIndex === entry.anchorTurnIndex)) {
    return "submitted";
  }
  return "declined";
}

/**
 * 분기 → 표면별 문구. 표면마다 "어디를 보라"는 지시만 다르고 **판정은 한 벌**이다.
 *
 * ⚠️ 분기 "나"에는 부정 서술("응하지 않았습니다"·"닫았습니다")도 응낙 서술도 없다 — 응낙 서술은
 * **속은 순간 카드(P-23)가 전담**하고(중복 카드 금지, §15.9.5 e-4) 이 항목은 사실 1줄에서 멈춘다.
 */
const COPY: Record<MockScreenCopySurface, Record<MockScreenCopyBranch, MockScreenCopy>> = {
  report: {
    consented: {
      branch: "consented",
      tone: "caution",
      text: "이 화면에서 권한 허용에 응했습니다 — 위의 속은 시점 카드에서 자세히 볼 수 있습니다.",
    },
    submitted: {
      branch: "submitted",
      tone: "neutral",
      text: "이 화면을 열었습니다.",
    },
    declined: {
      branch: "declined",
      tone: "praise",
      text: "잘 대응한 지점입니다 — 권한 허용에 응하지 않았습니다.",
    },
  },
  replay: {
    consented: {
      branch: "consented",
      tone: "caution",
      heading: "⚠️ 여기가 신호였어요",
      text: "이 화면에서 권한 허용에 응했습니다 — 대처 방법은 위 말풍선의 주석에 있습니다.",
    },
    submitted: {
      branch: "submitted",
      tone: "neutral",
      text: "이 화면을 열었습니다.",
    },
    declined: {
      branch: "declined",
      tone: "praise",
      heading: "잘 대응한 지점",
      text: "화면이 떴지만 권한 허용에 응하지 않았습니다.",
    },
  },
};

export function resolveMockScreenCopy(
  entry: MockScreenCopyEntry,
  deceivedMoments: readonly MockScreenCopyMoment[],
  surface: MockScreenCopySurface,
): MockScreenCopy {
  return COPY[surface][resolveMockScreenBranch(entry, deceivedMoments)];
}

/** 테스트가 문구 표 전체를 훑을 수 있게 열어 둔다(부정 서술 0건 단언 — D-61 reviewer 인계). */
export const MOCK_SCREEN_COPY_TABLE = COPY;
