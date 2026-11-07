// ⭐ 이체 생체 인증 시트(2026-11-07 실기기 신고 — "생체인식 관련 화면에서도 별 모션 없이 그냥 넘어가잖아").
// 두 이체 화면(`MessengerFakeLanding` 훈련용 이체 · `BankAppOverlay` 내 은행 송금)이 같은 시트(`BankAuthSheet`)를 쓰고, 단계는 이 표 하나로만 정한다.
//
// | 항목 | 정책 |
// |---|---|
// | 인증 수단 | 기기 스킨 iOS형 = 얼굴(Face ID형 가운데 표시 — 열리면 바로 스캔) · 그 밖(One UI형 · 기본) = 지문(화면 아래 센서 자리를 길게 누름) |
// | 지문 | 누르고 있으면 스캔 고리가 차오르고(`FINGERPRINT_HOLD_MS`) 다 차면 성공 · 그 전에 떼면 실패(흔들림 + 안내) |
// | 실패 | `MAX_BIOMETRIC_FAILS`번 실패하면 생체 인증을 막는다(locked — 취소만 남는다) |
// | 성공 | 체크 표시를 `SUCCESS_HOLD_MS` 보여 준 뒤 송금 완료(= 기존 제출 콜백 한 번) |
// | 취소 | 시트 닫기 = 확인 화면으로 돌아간다(기록 0) |
// | 움직임 줄이기 | `prefers-reduced-motion` — 애니메이션 0(CSS) · 대기 시간은 `REDUCED_*`로 줄인다(흐름 · 컨트롤은 같다) |
// | 입력 | ⛔ 숫자 · 비밀번호 입력 0(BA3) — 인증은 누름 · 자동 스캔뿐 |
//
// 판정표 B(지금 · 사건 → 다음). 표에 없는 조합 = 그대로.
// | # | If | Then |
// |---|---|---|
// | B1 | prompt · failed · 손가락 댐(touch-start) | scanning |
// | B2 | scanning · 다 차기 전 뗌(touch-end) | failed(실패 +1) — 실패가 `MAX_BIOMETRIC_FAILS`에 닿으면 locked |
// | B3 | scanning · 스캔 끝(scan-complete) | success |
// | B4 | locked · 무엇이든 | locked(취소만 — 호출부 `onCancel`) |
// | B5 | success · 무엇이든 | success(완료 콜백은 호출부가 한 번만) |
//
// ⚠️ 잎 모듈(값 import 0 · 타입 import만).
import type { MessengerSkin } from "../messenger/detectSkin";

export type AuthMethod = "fingerprint" | "face";

/** 기기 스킨 → 인증 수단(위 표 '인증 수단'). */
export function authMethodForSkin(skin: MessengerSkin): AuthMethod {
  return skin === "ios" ? "face" : "fingerprint";
}

export type AuthPhase = "prompt" | "scanning" | "failed" | "locked" | "success";
export type AuthEvent = "touch-start" | "touch-end" | "scan-complete";
export type AuthState = { phase: AuthPhase; fails: number };

export const MAX_BIOMETRIC_FAILS = 3;
/** 지문을 대고 있어야 하는 시간(ms) — 실기기 초음파 센서 체감 근사(추정 · 실측 아님). */
export const FINGERPRINT_HOLD_MS = 650;
/** 얼굴 스캔 표시 시간(ms). */
export const FACE_SCAN_MS = 1100;
/** 성공 체크를 보여 주는 시간(ms). */
export const SUCCESS_HOLD_MS = 700;
/** 움직임 줄이기 — 대기 시간만 줄인다(단계는 같다). */
export const REDUCED_FACE_SCAN_MS = 300;
export const REDUCED_SUCCESS_HOLD_MS = 300;
export const REDUCED_FINGERPRINT_HOLD_MS = 300;

export const INITIAL_AUTH_STATE: AuthState = { phase: "prompt", fails: 0 };

/** 판정표 B1 ~ B5. */
export function nextAuthState(state: AuthState, event: AuthEvent): AuthState {
  if (state.phase === "locked" || state.phase === "success") return state; // B4 · B5
  if (event === "touch-start" && (state.phase === "prompt" || state.phase === "failed")) return { ...state, phase: "scanning" }; // B1
  if (event === "touch-end" && state.phase === "scanning") {
    const fails = state.fails + 1; // B2
    return { phase: fails >= MAX_BIOMETRIC_FAILS ? "locked" : "failed", fails };
  }
  if (event === "scan-complete" && state.phase === "scanning") return { ...state, phase: "success" }; // B3
  return state;
}

/** 단계별 대기 시간(움직임 줄이기 반영). */
export function authTimings(reducedMotion: boolean): { fingerprintHoldMs: number; faceScanMs: number; successHoldMs: number } {
  return reducedMotion
    ? { fingerprintHoldMs: REDUCED_FINGERPRINT_HOLD_MS, faceScanMs: REDUCED_FACE_SCAN_MS, successHoldMs: REDUCED_SUCCESS_HOLD_MS }
    : { fingerprintHoldMs: FINGERPRINT_HOLD_MS, faceScanMs: FACE_SCAN_MS, successHoldMs: SUCCESS_HOLD_MS };
}

/** 시트 문구(한 곳에서 관리 — 테스트가 '모의' · '훈련용' · 비밀번호 요구 문구를 스캔한다). */
export const BANK_AUTH_COPY = {
  title: "생체 인증",
  fingerprintPrompt: "지문 인식 센서에 손가락을 대 주세요",
  fingerprintScanning: "손가락을 떼지 마세요",
  fingerprintFailed: "지문이 일치하지 않습니다. 다시 시도해 주세요.",
  faceScanning: "Face ID",
  locked: "생체 인증을 너무 많이 시도했습니다. 잠시 후 다시 시도해 주세요.",
  success: "인증되었습니다",
  sensorLabel: "지문 인식 센서",
  cancel: "취소",
} as const;
