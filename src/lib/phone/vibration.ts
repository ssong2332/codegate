// T190-1 — 수신 진동 패턴 (UX D-97 · docs/Architecture.md §74.4 · §74.7).
//
// ⛔ **iOS형 = 진동 없음**(D-97 — iOS Safari는 Vibration API가 없다, §74.2 ③-a 문서 확인). One UI형·기본만
// 벨 주기마다 패턴을 반복한다(Vibration API를 지원하는 브라우저에서만 — 미지원이면 0회 · 오류 문구 0).
// 패턴 값은 자체 설계값이다(OS 진동 패턴을 옮기지 않았다 · 근사 — 실기 확인 §74.17 P-2).
//
// 잎(leaf) 모듈 — 타입 import만. 실제 `navigator.vibrate` 호출은 `ringtonePlayer.ts`가 한다.
import type { MessengerSkin } from "../messenger/detectSkin";

/** ms 단위 [진동, 쉼, 진동, …]. `null` = 진동하지 않는다. */
export const VIBRATION_PATTERNS: Readonly<Record<MessengerSkin, readonly number[] | null>> = {
  ios: null,
  samsung: [800, 400, 800],
  default: [800, 400, 800],
};

export function vibrationPatternFor(skin: MessengerSkin): readonly number[] | null {
  return VIBRATION_PATTERNS[skin];
}

/** `navigator`에서 이 판정이 쓰는 부분만 — `"vibrate" in navigator`가 거짓이면 0회(§74.7). */
export function canVibrate(nav: object | undefined): boolean {
  return nav !== undefined && "vibrate" in nav;
}
