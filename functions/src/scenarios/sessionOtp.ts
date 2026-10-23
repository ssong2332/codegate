// §114(2026-10-23 실기 신고 *"본인확인 인증번호가 매번 똑같은데, 변수값으로 변경되게 하자"* · DECISIONS #229) — 세션별 인증번호.
//
// 카탈로그(`inCallSms.ts`)의 `otpCode`는 여전히 고정 리터럴이다(테스트 · 문면 원천). 이 파일이 그 값을 **세션 id 해시로 바꾼 6자리**로
// 갈아 끼운다. 난수가 아니라 해시라서 저장 필드가 따로 없어도 아래 네 곳이 같은 번호를 다시 계산한다:
//
// | 쓰는 곳 | 호출 | 결과 |
// |---|---|---|
// | 문자 문서(문자함 본문 · `otpCode` 필드) | `smsDelivery.ts` `deliverSmsThroughGate` | 본문의 `[카탈로그 번호]` → `[세션 번호]` |
// | Live 대조 1줄(사기범 모델이 아는 번호) | 같은 함수가 돌려준 `item` → `buildInCallSmsResponse` | 세션 번호 |
// | 텍스트 폴백 서버 대조(일치 · 다름 지시) | `otpCheck.ts` `evaluateOtpCheck` | 세션 번호 |
// | 리포트 오답 = 위험 신호(DECISIONS #216) | `generateReportCore.ts` | 세션 번호 |
//
// 재발송 정책(판정표 — 오늘 재발송 문자는 없다. 생기면 이 표를 따른다):
// | If | Then |
// |---|---|
// | 같은 세션 · 같은 `smsId` | 같은 번호(해시 입력이 같다 — 세션 안에서 고정) |
// | 같은 세션 · 다른 인증번호 문자(새 `smsId`) | 다른 번호(해시 입력에 `smsId`가 들어간다) |
// | 문자 문서는 `smsId`가 문서 id라 두 번 만들어지지 않는다 | 재도착 0 — 번호가 바뀌는 경우 없음 |
// | `sessionId`가 빈 값(옛 호출 · 테스트) | 카탈로그 리터럴 그대로(종전 동작) |
//
// ⚠️ 잎 모듈(같은 폴더 타입 외 import 0) — 서버 전용. 번호는 클라에 문자 문서로만 나간다(종전과 같은 경로).
import type { InCallSmsItem } from "./inCallSms";

/** FNV-1a 32비트(`shared/fictionalBank.ts` `hash`와 같은 식 — 잎 모듈이라 복사했다). */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** 사람이 "가짜 같다"고 느끼는 번호(한 숫자 반복 · 오름 · 내림 연속)인가. */
export function isTrivialOtp(code: string): boolean {
  if (/^(\d)\1+$/.test(code)) return true;
  const digits = code.split("").map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]!);
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

/**
 * 세션 · 문자별 인증번호(같은 자릿수 · 앞자리 0 허용). `sessionId`가 비면 카탈로그 값 그대로.
 * 해시가 쉬운 번호를 내면 입력에 꼬리표를 붙여 다시 뽑는다(결정적).
 */
export function sessionOtpCode(sessionId: string | undefined, smsId: string, catalogCode: string): string {
  if (!sessionId) return catalogCode;
  const length = catalogCode.length;
  const mod = 10 ** length;
  for (let salt = 0; ; salt += 1) {
    const code = String(fnv1a(`${sessionId}:${smsId}:${salt}`) % mod).padStart(length, "0");
    if (!isTrivialOtp(code)) return code;
  }
}

/**
 * 카탈로그 항목을 이 세션의 번호로 바꾼 복사본. 인증번호 문자가 아니면 원본 그대로.
 * 본문 속 카탈로그 번호(모든 곳)를 세션 번호로 바꾼다 — 문자함 · 리포트 · 다시보기가 같은 본문을 본다.
 */
export function withSessionOtp(item: InCallSmsItem, sessionId: string | undefined): InCallSmsItem {
  if (item.kind !== "otp" || !item.otpCode || !sessionId) return item;
  const code = sessionOtpCode(sessionId, item.smsId, item.otpCode);
  return { ...item, otpCode: code, body: item.body.split(item.otpCode).join(code) };
}
