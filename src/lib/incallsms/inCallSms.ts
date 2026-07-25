// 통화 중 문자(UX-027/UF-008) 클라 순수 로직 (T68, AC-059/060/061).
//
// 브라우저 API·React에 의존하지 않는 부분만 여기 모아 단위 테스트로 고정한다 — 화면 쪽(page.tsx)은
// 이 함수들의 결과를 그리기만 한다.
//
// ⚠️ 이 파일은 **트리거(언제)만** 다룬다. 문자 **내용**은 어디에도 없다 — 본문·인증번호·발신번호는
// 100% 서버 카탈로그가 원천이며 Firestore 구독으로만 화면에 들어온다(AC-060).
import type { InCallSmsTrigger } from "@/lib/api";

/** Firestore `sessions/{sid}/inCallSms/{smsId}` 문서의 클라 표현(읽기 전용). */
export type InCallSmsView = {
  smsId: string;
  kind: "account" | "link" | "otp";
  senderLabel: string;
  body: string;
  otpCode?: string;
  linkDisplayText?: string;
  fakeLandingId?: string;
  /** 도착 순서 정렬용(ms). 서버 Timestamp가 아직 반영되기 전이면 0. */
  arrivedAtMs: number;
  openedAtMs?: number;
};

/**
 * 지금 도착시켜야 할 문자 1건을 고른다.
 *
 * 규칙(결정론적): "아직 도착하지 않았고 `afterScammerTurns <= 완료된 사기범 턴 수`인 것 중 **가장
 * 이른 것**". 가장 이른 것을 고르는 이유는 턴 경계 이벤트를 한 번 놓쳐도(재연결·중복 이벤트) 문자가
 * 조용히 건너뛰어지지 않게 하기 위해서다 — 늦게라도 순서대로 전부 도착한다(P-4 조용한 실패 금지).
 */
export function pickDueInCallSms(input: {
  triggers: InCallSmsTrigger[];
  scammerTurns: number;
  deliveredSmsIds: readonly string[];
}): string | null {
  const delivered = new Set(input.deliveredSmsIds);
  const due = input.triggers
    .filter((t) => !delivered.has(t.smsId) && t.afterScammerTurns <= input.scammerTurns)
    .sort((a, b) => a.afterScammerTurns - b.afterScammerTurns);
  return due[0]?.smsId ?? null;
}

/**
 * 인증번호를 스크린리더가 한 자씩 읽도록 띄어 쓴다(UX-027 Accessibility — "인증번호 4 8 2 9 1 7").
 * 붙여 쓰면 "사만 팔천이백..."처럼 수사로 읽혀 사용자가 받아 적을 수 없다.
 */
export function spellOutOtp(code: string): string {
  return code.split("").join(" ");
}

/** 도착 순 정렬(오래된 것부터). 같은 시각이면 smsId로 안정 정렬한다. */
export function sortByArrival(items: readonly InCallSmsView[]): InCallSmsView[] {
  return [...items].sort(
    (a, b) => a.arrivedAtMs - b.arrivedAtMs || a.smsId.localeCompare(b.smsId),
  );
}

/** 배너·"문자함" 배지에 쓰는 미확인 건수(아직 열어보지 않은 문자). */
export function countUnread(items: readonly InCallSmsView[]): number {
  return items.filter((item) => item.openedAtMs === undefined).length;
}

/** 문자함 목록에서 기본으로 펼칠 문자 = 가장 최근 도착 건(UX-027 States "Arrived"). */
export function latestSmsId(items: readonly InCallSmsView[]): string | null {
  const sorted = sortByArrival(items);
  return sorted.length > 0 ? sorted[sorted.length - 1].smsId : null;
}
