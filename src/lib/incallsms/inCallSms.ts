// 통화 중 문자(UX-027/UF-008) 클라 순수 로직 (T68, AC-059/060/061).
//
// 브라우저 API·React에 의존하지 않는 부분만 여기 모아 단위 테스트로 고정한다 — 화면 쪽(page.tsx)은
// 이 함수들의 결과를 그리기만 한다.
//
// ⚠️ 이 파일은 문자 **내용**을 다루지 않는다 — 본문·인증번호·발신번호는 100% 서버 카탈로그가 원천이며
// Firestore 구독으로만 화면에 들어온다(AC-060).

/** Firestore `sessions/{sid}/inCallSms/{smsId}` 문서의 클라 표현(읽기 전용). */
export type InCallSmsView = {
  smsId: string;
  kind: "account" | "link" | "otp";
  senderLabel: string;
  body: string;
  otpCode?: string;
  linkDisplayText?: string;
  /** T190-2(§74.9 · D-101) — 말풍선 링크 줄에 보일 **가짜 주소**(`.invalid` 호스트 + 경로, 스킴 0). 서버가
   *  `fakeLandingId`와 짝으로만 싣는다. 부재(옛 문서) → 화면은 `linkDisplayText`로 읽는다(`linkAddress ?? linkDisplayText`). */
  linkAddress?: string;
  fakeLandingId?: string;
  /** T104 — 그 랜딩의 목업 종류. **서버가 확정해 내려준 값**이며 클라가 문자열로 추론하지 않는다
   *  (§15.9.1 R3). 부재 → `credential-form`(하위호환 읽기 규칙, §15.9.1 R2). */
  landingKind?: "credential-form" | "app-install";
  /** 도착 순서 정렬용(ms). 서버 Timestamp가 아직 반영되기 전이면 0. */
  arrivedAtMs: number;
  openedAtMs?: number;
  /**
   * §101 추가 · UX D-115 — 문자 본문 계좌 줄의 세션 은행명 · 계좌번호(서버 `buildDoc.ts`가 실은 구조화 필드 — 둘 다 있을 때만 짝으로).
   * 이 문자가 연 이체 랜딩의 수취 계좌 칸을 미리 채우는 원천이다(두 번째 리터럴 0).
   */
  bankName?: string;
  accountNumber?: string;
  /** ⭐ P2(X6) — 훈련용 이체 화면(`bank-transfer`)의 받는 분 이름 · 금액(숫자만). 서버가 그 화면을 여는 계좌 문자에만 싣는다. */
  accountHolder?: string;
  transferAmount?: string;
};

/** §101 추가 · D-115 — 이 문자의 수취 계좌 표기("{은행명} {계좌번호}"). 둘 중 하나라도 없으면 미리 채우지 않는다. */
/** ⭐ P2(X6) — 훈련용 이체 화면의 미리 채움(받는 분 · 은행 · 금액). 은행명이 없으면(옛 문서) 미리 채우지 않는다. */
export function prefilledTransferOf(
  sms: Pick<InCallSmsView, "bankName" | "accountHolder" | "transferAmount">,
): { bankName: string; holder?: string; amount?: string } | undefined {
  if (!sms.bankName) return undefined;
  return {
    bankName: sms.bankName,
    ...(sms.accountHolder ? { holder: sms.accountHolder } : {}),
    ...(sms.transferAmount ? { amount: sms.transferAmount } : {}),
  };
}

export function prefilledAccountOf(sms: Pick<InCallSmsView, "bankName" | "accountNumber">): string | undefined {
  return sms.bankName && sms.accountNumber ? `${sms.bankName} ${sms.accountNumber}` : undefined;
}

// ⛔ T191(문자 도달 조건 · PRD AC-099 (d)) — 예전 `pickDueInCallSms`(카탈로그 고정 턴 `afterScammerTurns <= 사기범 턴`
// 이면 화면이 발송을 요청)는 폐기했다. 발송 판정은 전부 서버(`functions/src/inCallSms/smsGate.ts`)이고, 화면은 사용자
// 발화 flush마다 백스톱을 물어볼 뿐이다(`src/lib/realtime/toolWindow.ts` `shouldRequestSmsBackstop`).

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

/** `IntersectionObserverEntry` 중 이 판정이 실제로 쓰는 부분만(테스트에서 가짜로 대체 가능하게). */
export type SmsVisibilityEntry = {
  readonly isIntersecting: boolean;
  readonly smsId: string | undefined;
};

/**
 * **실제로 뷰포트에 들어온** 문자 id만 골라낸다(T103 QA 지적 — AC-026 과다 기록).
 *
 * **왜 필요한가.** 아코디언을 없애면서 "화면에 그려진 문자 전부"를 열람으로 기록했더니,
 * 문자함을 한 번 열기만 해도 **스크롤을 전혀 하지 않은 하단의 문자까지** `openedAt`이 박혔다.
 * 서버는 `openedAt`을 **최초 1회만 세팅하고 되돌리지 않으며**(설계상 옳다), 리포트·리플레이는
 * 그 값만 보고 *"문자를 열어 확인했습니다"*·*"화면에 인증번호가 표시됐습니다"* 캡션을 만든다.
 * ⇒ 보지도 못한 인증번호에 "표시됐다"가 붙어 **훈련 피드백이 거짓을 말한다.**
 *
 * ⚠️ **판정 기준은 "뷰포트에 들어왔는가" 하나다.** "몇 초 이상 보였는가"·"읽음 확인" 같은
 * 새 개념을 만들지 않는다(범위 밖). 서버 계약(`recordInCallSmsEvent`의 1회성 기록)도 무변경 —
 * 고치는 것은 **언제 부르는가** 뿐이다.
 *
 * @param alreadyRecorded 이미 기록을 보낸 id — 같은 문자를 두 번 보내지 않는다.
 */
export function takeNewlyVisibleSmsIds(
  entries: readonly SmsVisibilityEntry[],
  alreadyRecorded: ReadonlySet<string>,
): string[] {
  const picked: string[] = [];
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const { smsId } = entry;
    if (!smsId) continue;
    if (alreadyRecorded.has(smsId) || picked.includes(smsId)) continue;
    picked.push(smsId);
  }
  return picked;
}

// ── T190-1(docs/Architecture.md §74.4 · G459 · UX D-89/D-90 · UX-027 v1.33 (3)(4)) ───────────────

/**
 * 본문 안 인증번호를 **정확 일치 첫 1회**로 갈라낸다(D-90 — 본문 안에서 강조 표시하고 큰 박스를 따로 두지
 * 않는다). 본문에 코드가 없으면(또는 코드가 비면) `null` → 화면은 기존 인증번호 박스로 폴백한다 —
 * **인증번호가 화면 어디에도 없는 상태 0**(AC-061 · G459).
 * ⛔ 정규식·부분 패턴으로 "숫자처럼 보이는 것"을 찾지 않는다 — 서버가 준 `otpCode` 문자열 그대로만 찾는다.
 */
export function splitBodyAtOtp(
  body: string,
  otpCode: string | undefined,
): { before: string; code: string; after: string } | null {
  if (!otpCode) return null;
  const at = body.indexOf(otpCode);
  if (at < 0) return null;
  return { before: body.slice(0, at), code: otpCode, after: body.slice(at + otpCode.length) };
}

/** 여러 발신처가 섞인 스레드의 헤더 라벨(UX-027 v1.33 (3)) — 이 낱말 외의 새 문구를 만들지 않는다. */
export const MIXED_THREAD_HEADER_LABEL = "메시지";

/**
 * 문자함 헤더 라벨 — 전부 같은 `senderLabel`이면 그 값, 아니면 `"메시지"`(이때 말풍선마다 발신처를 따로
 * 표기한다 — UX-027 v1.33 (3)). 빈 목록이면 `"메시지"`.
 */
export function threadHeaderLabel(sorted: readonly InCallSmsView[]): string {
  const first = sorted[0]?.senderLabel;
  if (first === undefined) return MIXED_THREAD_HEADER_LABEL;
  // S3(실기기 확인 2026-11-01) — 같은 번호면 문자마다 붙은 안내 이름이 달라도 한 방이다(실제 휴대폰) — 제목은 첫 문자의 발신 라벨로 고정한다.
  return sorted.every((item) => sameSenderNumber(item.senderLabel, first)) ? first : MIXED_THREAD_HEADER_LABEL;
}

/**
 * S3 — 발신 라벨의 번호 부분(`"02-0762-4180 (카드 명의보호 안내)"` → `"02-0762-4180"`). 괄호 안내 이름이 없으면 라벨 그대로.
 * 서버 라벨 꼴 = `${번호} (${안내 이름})`(`functions/src/scenarios/inCallSms.ts` senderLabel).
 */
export function senderNumberOf(senderLabel: string): string {
  const cut = senderLabel.indexOf(" (");
  return (cut >= 0 ? senderLabel.slice(0, cut) : senderLabel).trim();
}

/** S3 — 두 발신 라벨이 같은 번호인가(같은 방 · 같은 제목 · 말풍선 위 발신처 반복 0). */
export function sameSenderNumber(a: string, b: string): boolean {
  return senderNumberOf(a) === senderNumberOf(b);
}

// ── T190-5(UX-027 v1.33 (4) — 스레드 시각) ────────────────────────────────────────────────────────

/** iOS형 구분줄을 다시 넣는 간격(UX-027 v1.33 (4) — 앞 문자와 5분 이상 떨어질 때만). */
export const TIME_SEPARATOR_GAP_MS = 5 * 60 * 1000;

/**
 * 도착 시각 → `"오후 3:05"` 꼴(기기 현지 시각 · 신규 데이터 0 — `arrivedAtMs`만 쓴다). 서버 시각이 아직 반영되지
 * 않았으면(`arrivedAtMs` 0 이하) `null` — 화면은 시각을 그리지 않는다(지어내지 않는다).
 * @param tzOffsetMinutes 테스트용 고정 오프셋(`Date#getTimezoneOffset`과 같은 부호). 생략하면 기기 현지 시각.
 */
export function formatSmsClock(arrivedAtMs: number, tzOffsetMinutes?: number): string | null {
  if (!(arrivedAtMs > 0)) return null;
  const date = new Date(arrivedAtMs);
  const offset = tzOffsetMinutes ?? date.getTimezoneOffset();
  const local = new Date(arrivedAtMs - offset * 60 * 1000);
  const hours24 = local.getUTCHours();
  const minutes = local.getUTCMinutes();
  const period = hours24 < 12 ? "오전" : "오후";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${period} ${hours12}:${minutes.toString().padStart(2, "0")}`;
}

/** iOS형 구분줄 판정 — 첫 문자이거나 앞 문자와 5분 이상 떨어졌을 때(시각을 모르면 그리지 않는다). */
export function needsTimeSeparator(previousArrivedAtMs: number | null, arrivedAtMs: number): boolean {
  if (!(arrivedAtMs > 0)) return false;
  if (previousArrivedAtMs === null || !(previousArrivedAtMs > 0)) return true;
  return arrivedAtMs - previousArrivedAtMs >= TIME_SEPARATOR_GAP_MS;
}
