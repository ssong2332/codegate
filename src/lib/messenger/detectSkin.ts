// UA 기반 메신저 문자형(surface="sms") 스킨 자동 감지 (T29) — Architecture.md §13.5가 고정한
// 판정 규칙표를 순서대로 그대로 구현한다(임의 판단 금지). 스킨은 **프레젠테이션 전용**이라 어떤
// 안전 판정도 게이팅하지 않는다(§13.5) — 이 함수가 오판정해도 영향은 "채팅 외형이 기기와 다르게
// 보임"뿐이다(그래서 UX-022가 상시 수동 전환 토글을 함께 제공한다, AC-031).
//
// 순수 함수라 프론트 테스트 프레임워크 부재(T14/T15가 도입한 `node --experimental-strip-types`
// 워크어라운드, package.json test 참고) 상태에서도 UA 문자열만으로 직접 단위 검증할 수 있다
// (./detectSkin.test.ts).
export type MessengerSkin = "ios" | "samsung" | "default";
export type MessengerSkinSource = "auto" | "fallback";

export type DetectedMessengerSkin = {
  skin: MessengerSkin;
  source: MessengerSkinSource;
};

/**
 * Architecture.md §13.5 판정 규칙표(순서대로 첫 매치):
 * 1. iPhone|iPad|iPod|iOS 표식 → ios (auto)
 * 2. Android + (SM-|SamsungBrowser|Samsung) → samsung (auto)
 * 3. Android(삼성 외) → default (auto)
 * 4. 데스크톱·미상·판정 실패 → default (fallback)
 */
export function detectMessengerSkin(userAgent: string | undefined | null): DetectedMessengerSkin {
  const ua = userAgent ?? "";
  if (!ua) {
    return { skin: "default", source: "fallback" };
  }
  if (/iPhone|iPad|iPod|iOS/.test(ua)) {
    return { skin: "ios", source: "auto" };
  }
  const isAndroid = /Android/.test(ua);
  if (isAndroid && /SM-|SamsungBrowser|Samsung/.test(ua)) {
    return { skin: "samsung", source: "auto" };
  }
  if (isAndroid) {
    return { skin: "default", source: "auto" };
  }
  return { skin: "default", source: "fallback" };
}
