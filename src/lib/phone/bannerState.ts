// T190-1 — 떠 있는 문자 도착 배너의 표시 판정 (UX D-91 · UX-014 v1.33 (6) · docs/Architecture.md §73.4 · §73.6 (6)).
//
// 규칙(정본 UX-014 v1.33 (6)):
//   ① **최신 1건**만 보인다 — 새 문자가 오면 최신으로 교체된다(UF-008 Alternative (b) 무변경).
//   ② 표시 후 **6초** 뒤 사라진다 · 키보드 포커스·마우스가 배너 위에 있는 동안은 타이머가 멈춘다(WCAG 2.2.1).
//   ③ 문자함을 한 번 열면 **그때까지 온 건**의 배너는 다시 뜨지 않는다(현행 `smsBannerDismissed` 의미 유지).
//   ④ 문자함이 열려 있는 동안·`ended`에서는 0.
//
// ⭐ 예전 boolean(`smsBannerDismissed`)을 "확인한 마지막 smsId"로 바꾼 이유(§73.6 (6)): boolean은 새 문자가
// 올 때마다 누군가 `false`로 되돌려야 했고, 모델 도구 경로로 도착한 문자에는 그 되돌림이 없어 한 번 닫은
// 뒤 배너가 다시 안 뜰 수 있었다(설계가 지목한 **추정 결함**). id로 비교하면 새 문자는 경로와 무관하게
// 자동으로 "아직 확인 안 함"이다 — 되돌리는 쓰기 지점 자체가 필요 없다.
//
// 잎(leaf) 모듈 — import 0. 타이머(setTimeout)는 화면(`play/page.tsx`)이 소유하고, 이 파일은 판정만 한다.

/** UX D-91 — 본문 2줄을 읽을 시간으로 잡은 **설계 추정값**(확인: 사용성 관찰 · §73.17 P-5). */
export const BANNER_VISIBLE_MS = 6000;

export type BannerInput = {
  /** 도착 순 정렬의 마지막(최신) 문자 id. 없으면 null. */
  latestSmsId: string | null;
  /** 문자함을 닫을 때 확인 처리한 마지막 id(③). */
  ackSmsId: string | null;
  /** 6초가 지나 접힌 배너의 id(②). 같은 문자가 다시 떠오르지 않게 한다. */
  expiredSmsId: string | null;
  overlayOpen: boolean;
  ended: boolean;
};

/** 지금 배너로 보일 문자 id — 보이지 않으면 null. */
export function visibleBannerSmsId(input: BannerInput): string | null {
  const { latestSmsId } = input;
  if (latestSmsId === null) return null;
  if (input.overlayOpen || input.ended) return null;
  if (latestSmsId === input.ackSmsId) return null;
  if (latestSmsId === input.expiredSmsId) return null;
  return latestSmsId;
}

/** 문자함을 닫을 때의 확인 id(③) — 그 순간의 최신 id. 최신이 없으면 기존 값을 유지한다. */
export function ackOnOverlayClose(latestSmsId: string | null, currentAck: string | null): string | null {
  return latestSmsId ?? currentAck;
}

/**
 * 6초 타이머를 돌려야 하는가(②). 배너가 보이고 · 포커스/호버로 멈춰 있지 않을 때만.
 * ⚠️ 정지 후 재개는 **처음부터 6초**다(남은 시간을 이어 세지 않는다 — 단순화, 사라지는 시점이 늦어질 뿐
 * 정보가 사라지지 않는다).
 */
export function shouldRunBannerTimer(visibleSmsId: string | null, paused: boolean): boolean {
  return visibleSmsId !== null && !paused;
}
