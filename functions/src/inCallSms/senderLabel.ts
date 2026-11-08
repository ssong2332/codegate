// ⭐ 2026-11-08(사용자 결정 "고치기" · Edge 실측) — 같은 발신 번호인데 문자마다 이름이 달랐다. 기관 사칭 고급 `02-0731-5402`가 문자함 목록은
// "본인확인 안내" · 배너는 "자산검수 안내" · 또 "자산보호 안내", 카드사 `02-0762-4180`이 "카드 승인취소 인증"과 "피해금 이관 안내".
// 원인: 문자마다 카탈로그 라벨(`${번호} (${안내 이름})`)을 그대로 저장한다 — 문자함 목록 제목은 그 번호 대화방의 첫 문자 라벨,
// 배너 · 알림 문장은 가장 최근 문자 라벨, 리포트 · 다시보기는 문자마다의 라벨을 읽는다.
// 현실: 휴대폰은 한 번호에 저장된 이름(또는 번호) 하나만 보여 준다.
// ⇒ 저장하는 순간 한 번 맞춘다(배너 · 문자함 목록 · 대화방 머리 · 리포트 · 다시보기가 모두 저장값을 읽으므로 한 곳이면 된다).
//
// 판정표 L(문자 문서를 만드는 지점 — `smsDelivery.ts` 세 함수):
// | # | If | Then |
// |---|---|---|
// | L1 | 이 세션에 같은 번호(라벨의 " (" 앞)로 이미 도착한 문자가 있다 | 그중 가장 먼저 도착한 문자의 라벨을 그대로 저장한다 |
// | L2 | 그 밖 | 카탈로그 라벨(가상 은행명 치환 포함 — 종전) |
// ⛔ 번호가 다르면 이름도 따로다(카드사 R1처럼 보낸 곳마다 다른 번호는 종전대로 다른 대화방). 카탈로그 · 프롬프트 문면은 무변경(바이트 고정 변형 무관).

/** 라벨의 번호 부분 — `${번호} (${이름})`이면 번호, 번호뿐이면 그대로(클라 `src/lib/incallsms/inCallSms.ts` `senderNumberOf`와 같은 규칙). */
export function senderNumberOf(senderLabel: string): string {
  const cut = senderLabel.indexOf(" (");
  return (cut >= 0 ? senderLabel.slice(0, cut) : senderLabel).trim();
}

/** 이미 도착한 문자의 라벨 · 도착 시각(ms — 부재면 순서를 모르는 것으로 보고 뒤로). */
export type PriorSenderLabel = { senderLabel?: string; arrivedAtMs?: number };

/** 판정표 L. */
export function sessionSenderLabel(catalogLabel: string, prior: readonly PriorSenderLabel[]): string {
  const number = senderNumberOf(catalogLabel);
  const sameNumber = prior
    .filter((p): p is { senderLabel: string; arrivedAtMs?: number } => typeof p.senderLabel === "string" && senderNumberOf(p.senderLabel) === number)
    .sort((a, b) => (a.arrivedAtMs ?? Number.MAX_SAFE_INTEGER) - (b.arrivedAtMs ?? Number.MAX_SAFE_INTEGER));
  return sameNumber[0]?.senderLabel ?? catalogLabel; // L1 · L2
}

/** Firestore 문서에서 라벨 · 도착 시각을 읽는다(값 밖 = 키 없음). */
export function priorSenderLabelOf(get: (field: string) => unknown): PriorSenderLabel {
  const label = get("senderLabel");
  const arrivedAt = get("arrivedAt") as { toMillis?: () => number } | undefined;
  const ms = typeof arrivedAt?.toMillis === "function" ? arrivedAt.toMillis() : undefined;
  return {
    ...(typeof label === "string" ? { senderLabel: label } : {}),
    ...(typeof ms === "number" ? { arrivedAtMs: ms } : {}),
  };
}
