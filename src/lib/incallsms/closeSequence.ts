// UX-027/T103 — 문자함 **퇴장 시퀀스**의 순수 상태 기계.
//
// **왜 컴포넌트 밖으로 뺐는가(그리고 왜 이것이 "신규 컴포넌트 파일"이 아닌가).**
// 2026-07-27 라이브 검증에서 **문자함이 닫히지 않는 병합 차단급 결함**이 나왔다. 퇴장 연출이
// `state: "finished"` 로 끝났는데도 오버레이가 언마운트되지 않아, `fixed inset-0` 레이어가
// opacity 0으로 화면 전체를 계속 덮은 채 참가자가 통화 화면에 손을 못 대는 상태가 됐다.
// 원인은 **언마운트가 `onAnimationEnd`(React 합성 이벤트) 단 하나에 걸려 있었다**는 것이고,
// 그 이벤트는 이 저장소의 어떤 테스트로도 관측할 수 없어 T103 불변식 6건이 전부 통과하는 채로
// 결함이 통과했다. ⇒ **관측 가능한 순수 함수로 내려 회귀를 기계로 고정한다.**
//
// ⚠️ **이 파일은 JSX를 한 줄도 갖지 않는다.** `src/components/*.tsx` 개수는 그대로이고
// (화면 등록부 `harmlessnessScreens.test.ts` 무변경), **G80의 스캔 대상
// `src/components/InCallSmsOverlay.tsx`에서 화면 코드가 한 줄도 빠져나오지 않았다** —
// 입력 어포던스가 살 수 있는 표면은 늘지 않았다(§23.3 (2) 가가 막으려는 것은 **화면 코드의
// 이주**이며, 타이밍 헬퍼는 그 대상이 아니다). 테스트 러너가 JSX를 못 읽어(`node
// --experimental-strip-types`) 동작 검증을 하려면 `.ts`여야 한다는 제약도 같은 결론을 가리킨다.

/**
 * 퇴장 연출 완료를 기다리는 **상한**(ms). CSS 퇴장 지속시간(globals.css `.sms-surface-exit`
 * = 0.18s)보다 넉넉히 길어야 하며, 그 관계는 `closeSequence.test.ts`가 globals.css를 직접
 * 파싱해 대조한다(둘이 어긋나면 실패한다).
 *
 * ⚠️ **이 상한은 "원인" 이 아니라 "안전망" 이다.** 정상 경로는 아래 `animations[].finished`
 * 이며, 상한은 그것이 어떤 이유로든(이벤트 미전달·연출 미시작·CSS 변경) 완료 신호를 주지
 * 못했을 때 **참가자가 절대 갇히지 않게** 하는 마지막 방어선이다.
 */
export const EXIT_ANIMATION_FALLBACK_MS = 400;

/** `Animation` 중 이 모듈이 실제로 쓰는 부분만(테스트에서 가짜로 대체할 수 있게 최소화). */
export type FinishableAnimation = { readonly finished: Promise<unknown> };

export type ExitSequenceOptions = {
  /** 퇴장 연출이 실제로 도는 애니메이션들(`element.getAnimations()`). */
  animations: readonly FinishableAnimation[];
  schedule: (fn: () => void, ms: number) => unknown;
  cancelScheduled: (handle: unknown) => void;
  /** 완료 시 정확히 1회 호출된다. */
  onDone: () => void;
  fallbackMs?: number;
};

/**
 * 퇴장 시퀀스를 시작한다. **`onDone`은 어떤 경로로도 최대 1회** 호출되며, 아래 세 경로 중
 * 가장 먼저 도달한 것이 이긴다.
 *
 *  1. **연출 완료**(정상) — 모든 애니메이션의 `finished`가 정착(resolve/reject 무관)했을 때.
 *     ⚠️ 취소된 애니메이션의 `finished`는 **reject**되므로 반드시 흡수해야 한다. 흡수하지 않으면
 *     `Promise.all`이 거부되어 정상 경로가 통째로 사라지고 상한까지 화면이 남는다.
 *  2. **연출 부재** — 애니메이션이 0건이면(연출이 시작되지 못했거나 CSS가 꺼져 있으면)
 *     기다릴 것이 없으므로 **즉시** 완료한다.
 *  3. **상한**(안전망) — 위 둘이 신호를 주지 못해도 `fallbackMs`에서 반드시 완료한다.
 *
 * @returns 취소 함수. 호출하면 **이후 어떤 경로로도 `onDone`이 호출되지 않는다** —
 *   호스트가 먼저 언마운트하는 경로(한도 자동 종료·훈련 종료, §23.6 A5)에서 필요하다.
 */
export function runExitSequence(options: ExitSequenceOptions): () => void {
  const { animations, schedule, cancelScheduled, onDone } = options;
  const fallbackMs = options.fallbackMs ?? EXIT_ANIMATION_FALLBACK_MS;

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    onDone();
  };

  // 연출이 하나도 없으면 기다릴 이유가 없다 — 즉시 닫는다(경로 2).
  if (animations.length === 0) {
    finish();
    return () => {
      settled = true;
    };
  }

  const handle = schedule(finish, fallbackMs); // 경로 3(안전망)
  void Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(
    finish, // 경로 1(정상)
  );

  return () => {
    settled = true;
    cancelScheduled(handle);
  };
}
