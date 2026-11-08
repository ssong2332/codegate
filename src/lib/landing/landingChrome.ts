// ⭐ 2026-11-08 웹 안의 웹 PR-1(사용자 승인 계획 · 시안 1절 · 8절) — 가짜 사이트 랜딩의 **바깥 틀**(브라우저 틀) 판정표.
//
// 실제로는 문자 링크가 기기 기본 브라우저로, 메신저 대화방 링크가 메신저 안 브라우저로 열린다. 지금까지는 모든 진입이
// 같은 흰 막대(지구본 + 주소)였다. 이 표가 (진입 표면 × 메신저 표면 × 스킨 × 통화 표시줄)로 틀 하나를 고른다.
// ⛔ 표 밖 판단 금지 — 첫 매치 행만 쓴다. 행을 바꾸면 `landingChrome.test.ts`의 표 단언 · 역검증이 함께 바뀌어야 한다.
// ⛔ 틀 안 단추는 **실제로 동작하는 것만**(사용자 결정 O1 = (b)): 뒤로(문자로) · 닫기(대화로) · '◀ 메시지'(문자로).
//    아래 툴바 · ⋯ · 탭 · 공유 · 새로고침 · 자물쇠 · ⚠는 그리지 않는다(D-92 · D-6).
// ⚠️ 잎 모듈(값 import 0) — 렌더 하네스가 CommonJS require로 불러 `@/` 별칭을 풀지 못한다(상대 경로 · 타입 import만).
import type { MessengerSkin } from "../messenger/detectSkin";

/** 틀 종류 — 위 주소 막대(안드로이드형) · 아래 떠 있는 주소 막대(iOS형) · 메신저 안 브라우저(✕ · 제목 · 주소 두 줄). */
export type LandingFrame = "device-top" | "device-bottom" | "in-app";

/** 틀 왼쪽(또는 떠 있는 막대 왼쪽)의 단추 — 문자로 돌아가기("‹ 문자") 또는 닫기(✕). */
export type LandingFrameControl = "back-sms" | "close";

export type LandingChromeInput = {
  /** 랜딩을 연 표면 — `MessengerFakeLanding`의 `entrySurface`와 같은 두 값. */
  entrySurface: "messenger" | "in-call-sms";
  /** 메신저 진입일 때 그 화면이 문자형(`sms`)인지 대화방형(`kakao`)인지. 부재 = 대화방형(종전 호출부 · 렌더 하네스). */
  messengerSurface?: "sms" | "kakao";
  skin: MessengerSkin;
  /** 문자함이 맨 위에 초록 통화 표시줄을 그리는가(문자함 진입 전용 — 통화 없는 문자함이면 false). */
  callBarShown: boolean;
};

export type LandingChrome = {
  /** 고른 행 번호(표 LC1 ~ LC6). */
  rule: string;
  frame: LandingFrame;
  control: LandingFrameControl;
  /** iOS형 맨 위 24px '◀ 메시지' 줄(누르면 문자로). 통화 표시줄이 그 자리를 차지하면 그리지 않는다(사용자 확정 2026-11-08). */
  messagesStrip: boolean;
  /** 주소 왼쪽 사이트 정보 아이콘(조정 막대 모양) — 안드로이드형만. iOS형 · 메신저 안 브라우저는 아이콘 없이 주소만. */
  siteInfoIcon: boolean;
};

type LandingChromeRule = {
  id: string;
  matches: (input: LandingChromeInput) => boolean;
  frame: LandingFrame;
  control: LandingFrameControl;
  messagesStrip: boolean;
};

const isSmsEntry = (i: LandingChromeInput) =>
  i.entrySurface === "in-call-sms" || (i.entrySurface === "messenger" && i.messengerSurface === "sms");

/**
 * 판정표 LC(순서대로 첫 매치):
 * | #   | 진입               | 스킨              | 통화 표시줄 | 틀             | 단추     | '◀ 메시지' |
 * | LC1 | 통화 중 문자함      | ios               | 있음        | 아래 떠 있는 막대 | ‹ 문자   | 없음        |
 * | LC2 | 통화 중 문자함      | ios               | 없음        | 아래 떠 있는 막대 | ‹ 문자   | 있음        |
 * | LC3 | 통화 중 문자함      | samsung · default | —           | 위 주소 막대     | ‹ 문자   | 없음        |
 * | LC4 | 문자형 메신저       | ios               | —           | 아래 떠 있는 막대 | ‹ 문자   | 있음        |
 * | LC5 | 문자형 메신저       | samsung · default | —           | 위 주소 막대     | ‹ 문자   | 없음        |
 * | LC6 | 대화방형 메신저 · 부재 | 모두           | —           | 메신저 안 브라우저 | ✕ 닫기  | 없음        |
 */
export const LANDING_CHROME_RULES: readonly LandingChromeRule[] = [
  { id: "LC1", matches: (i) => i.entrySurface === "in-call-sms" && i.skin === "ios" && i.callBarShown, frame: "device-bottom", control: "back-sms", messagesStrip: false },
  { id: "LC2", matches: (i) => i.entrySurface === "in-call-sms" && i.skin === "ios", frame: "device-bottom", control: "back-sms", messagesStrip: true },
  { id: "LC3", matches: (i) => i.entrySurface === "in-call-sms", frame: "device-top", control: "back-sms", messagesStrip: false },
  { id: "LC4", matches: (i) => isSmsEntry(i) && i.skin === "ios", frame: "device-bottom", control: "back-sms", messagesStrip: true },
  { id: "LC5", matches: (i) => isSmsEntry(i), frame: "device-top", control: "back-sms", messagesStrip: false },
  { id: "LC6", matches: () => true, frame: "in-app", control: "close", messagesStrip: false },
];

/** 판정표를 적용한다. `rules`는 역검증이 행을 뺀 사본을 넣을 때만 쓴다. 매치 0(표가 깨진 사본) = 메신저 안 브라우저(종전 ✕ 동작). */
export function landingChromeFor(input: LandingChromeInput, rules: readonly LandingChromeRule[] = LANDING_CHROME_RULES): LandingChrome {
  const hit = rules.find((rule) => rule.matches(input));
  const frame = hit?.frame ?? "in-app";
  return {
    rule: hit?.id ?? "none",
    frame,
    control: hit?.control ?? "close",
    messagesStrip: hit?.messagesStrip ?? false,
    siteInfoIcon: frame === "device-top",
  };
}

/** 틀 안 단추 이름 집합 — 동작하는 단추만(O1 b). 테스트가 렌더 결과와 대조한다. */
export const LANDING_FRAME_BUTTON_NAMES = {
  close: "닫기",
  backSms: "문자",
  messagesStrip: "메시지",
} as const;
