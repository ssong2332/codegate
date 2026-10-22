// §89.5 ⓐ(UX D-132 (5) ⓐ) — 메신저형 대화방(카카오 표면)의 표시 규칙. 화면 파생만 한다 — 저장 0 · 안전 판정 0.
//
// ① 이름 · 프로필은 상대의 **연속 메시지 중 첫 말풍선**에만 붙는다(내 메시지에는 이름 없음).
// ② 시각은 같은 쪽 **연속 메시지의 마지막**에만 붙는다.
// ③ 숫자 "1"은 내 메시지 뒤에 상대 메시지가 **아직 없을 때만** 붙는다(상대가 답하면 읽은 것으로 본다).
// 통화 구간 줄(`kind:"call"`)은 연속을 끊는다.
import type { ThreadItem, ThreadMessage } from "./threadItems.ts";

type Role = ThreadMessage["role"];

function roleAt<M extends ThreadMessage>(items: readonly ThreadItem<M>[], index: number): Role | null {
  const item = items[index];
  return item && item.kind === "message" ? item.message.role : null;
}

/** ① 상대 메시지이고, 바로 앞 항목이 상대 메시지가 아니면 참. */
export function startsPeerRun<M extends ThreadMessage>(items: readonly ThreadItem<M>[], index: number): boolean {
  return roleAt(items, index) === "scammer" && roleAt(items, index - 1) !== "scammer";
}

/** ② 바로 뒤 항목이 같은 쪽 메시지가 아니면 참. */
export function endsRun<M extends ThreadMessage>(items: readonly ThreadItem<M>[], index: number): boolean {
  const role = roleAt(items, index);
  return role !== null && roleAt(items, index + 1) !== role;
}

/** ③ 내 메시지이고, 뒤에 상대 메시지가 하나도 없으면 참. */
export function isUnreadByPeer<M extends ThreadMessage>(items: readonly ThreadItem<M>[], index: number): boolean {
  if (roleAt(items, index) !== "user") return false;
  for (let i = index + 1; i < items.length; i += 1) if (roleAt(items, i) === "scammer") return false;
  return true;
}

/** "오후 2:14" 형식(기기 시간대). 시각이 없으면 빈 문자열 — 화면은 그리지 않는다. */
/**
 * §104.9 · UX D-145 (2) — 대화 종료 상태 줄(입력 바 자리 · `role="status"`). 사기범이 메신저 단계를 끝냈으면(서버 `endReason: "scammer_ended"`)
 * 실제 앱처럼 보이는 시스템 줄, 그 밖(턴 한도 · 세션 시간)은 종전 문구.
 * | # | 사기범 종료 | 표면 | 문구 |
 * |---|---|---|---|
 * | E-1 | 예 | 카톡형 | `상대방이 채팅방을 나갔습니다.` |
 * | E-2 | 예 | 문자형 | `상대가 더 이상 답장하지 않습니다.` (문자에는 "나가기"가 없다 — 답장이 끊기는 것이 실제 모습) |
 * | E-3 | 아니오 | (무관) | `대화가 종료되었습니다.` (**무변경**) |
 * ⛔ 사기범 대사에 "[훈련 종료]" 같은 표식을 쓰지 않는다 — 종료는 서버 신호(`[[SIGNAL:END_CALL_*]]` → `scammer_ended`)로만 오고, 대사의
 *    메타 표식은 서버가 지운다(#368 `replyMarkup.ts` 4행). 이 줄은 앱이 그리는 시스템 줄이다.
 */
export function chatEndedNotice(scammerEnded: boolean, surface: "kakao" | "sms"): string {
  if (!scammerEnded) return "대화가 종료되었습니다."; // E-3
  return surface === "sms" ? "상대가 더 이상 답장하지 않습니다." : "상대방이 채팅방을 나갔습니다."; // E-2 · E-1
}

export function formatChatTime(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${m}`;
}
