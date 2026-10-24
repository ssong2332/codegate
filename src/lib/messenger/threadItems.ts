// 메신저 대화창의 표시 항목(2026-10-20 사용자 실기 신고 — child-kakao: 통화 중 AI 발화가 메신저 말풍선으로 남았다).
//
// 왜: 세션의 messages 컬렉션은 채널을 섞어 담는다 — 실시간 통화 전사(`realtime/submitTranscript.ts`)와 폴백 통화 턴
// (`roleplay/index.ts`)은 `channel:"voice"`로 저장된다. 통화에서 "메시지로 전환"으로 돌아오면 메신저 화면이 그 문서들을
// 채팅 말풍선으로 그려 "통화에서 한 말이 메시지로 보낸 것처럼" 보였다. ⇒ 연속한 통화 구간을 **시스템 줄 1개**로 접는다
// (오케스트레이터 승인 2026-10-20 — 권장안 (a)). 통화 내용은 리포트·다시보기가 따로 보여 준다(그 화면들은 채널을 보존해 그린다).
//
// 규칙: `channel === "voice"` 문서만 접는다. `channel` 부재(메신저 전용 옛 세션) · `"messenger"`는 말풍선 그대로다(회귀 0).
// ⚠️ 리뷰 Minor 3 — 통화 턴에 링크 칩(attachments)이 붙은 문서는 접지 않는다(폴백 통화 턴도 링크를 저장할 수 있다 —
// `roleplay/index.ts`). 접으면 참가자가 누를 수 있던 링크가 사라진다. (다시보기와 달리 channel 부재를 voice로 보지 않는 것은
// 이 화면이 메신저 화면이기 때문이다 — 옛 메신저 세션의 문서에는 channel이 없다.)

export type ThreadMessage = {
  id: string;
  role: "scammer" | "user";
  turnIndex: number;
  channel?: string;
  attachments?: readonly unknown[];
};

export type ThreadItem<M extends ThreadMessage> =
  | { kind: "message"; message: M }
  /** 연속한 통화 구간 하나. `id`는 구간 첫 문서 id(React key 안정). */
  | { kind: "call"; id: string; turnCount: number };

/** 시스템 줄 아이콘 — 화면에서는 `aria-hidden`으로 따로 그린다(스크린리더가 이모지를 읽지 않게 — 리뷰 Minor 2). */
export const CALL_SEGMENT_ICON = "📞";
/** 시스템 줄 문구(말풍선이 아니다 — 누가 보낸 메시지가 아님). */
export const CALL_SEGMENT_LINE = "통화 — 통화 내용은 리포트에서 볼 수 있어요";

/**
 * §130(UX D-161 (11)) — 카톡형 대화방에서는 같은 통화 구간을 카톡의 통화 기록 말풍선("보이스톡")처럼 보인다(문자형은 위 시스템 줄 그대로).
 * ⚠️ 통화 시간은 적지 않는다 — 화면이 아는 시각은 전사 문서 시각뿐이라 실제 통화 길이와 다르다(서버에 통화 끝 시각 칸이 없다).
 */
export const VOICE_TALK_RECORD_TITLE = "보이스톡";
export const VOICE_TALK_RECORD_NOTE = "통화 내용은 리포트에서 볼 수 있어요";

const hasAttachments = (message: ThreadMessage): boolean => (message.attachments?.length ?? 0) > 0;

/** turnIndex 순으로 정렬된 메시지에서 연속한 `channel:"voice"` 구간을 통화 항목 1개로 접는다. */
export function foldCallSegments<M extends ThreadMessage>(messages: readonly M[]): ThreadItem<M>[] {
  const items: ThreadItem<M>[] = [];
  for (const message of messages) {
    if (message.channel === "voice" && !hasAttachments(message)) {
      const last = items[items.length - 1];
      if (last && last.kind === "call") {
        last.turnCount += 1;
      } else {
        items.push({ kind: "call", id: message.id, turnCount: 1 });
      }
      continue;
    }
    items.push({ kind: "message", message });
  }
  return items;
}
