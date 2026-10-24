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
//
// ⭐ §131(3)(메인 세션 라이브 확인 2026-10-24 — 자녀 사칭 카톡 고급 · 보이스톡 텍스트 폴백) — 위 Minor 3 예외 때문에 링크가 붙은 통화 턴은
// **대사째** 말풍선(시각 없음)으로 남았고, 대화방 복귀 메시지가 같은 링크를 다시 붙여 링크가 두 번 나왔다. 판정표 F:
// | # | If | Then |
// |---|---|---|
// | F1 | `channel === "voice"` | 통화 줄로 접는다(링크 유무와 무관 — 대사는 리포트에만) |
// | F2 | F1 턴의 링크 첨부 | 통화 줄 아래 링크 카드로만 남긴다(`call.attachments`) — 누를 수 있던 링크 보존 |
// | F3 | F2 링크와 같은 `fakeLandingId` 링크가 목록의 **뒤** 메시지(메신저)에 있다 | F2에서 뺀다(같은 링크 한 번만 — 뒤 메시지 쪽이 남는다) |
// | F4 | `channel` 부재 · `"messenger"` | 말풍선 그대로(종전) |

export type ThreadMessage = {
  id: string;
  role: "scammer" | "user";
  turnIndex: number;
  channel?: string;
  attachments?: readonly { fakeLandingId?: string }[];
};

export type ThreadItem<M extends ThreadMessage> =
  | { kind: "message"; message: M }
  /** 연속한 통화 구간 하나. `id`는 구간 첫 문서 id(React key 안정). */
  | { kind: "call"; id: string; turnCount: number; attachments: NonNullable<M["attachments"]>[number][] };

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

/** turnIndex 순으로 정렬된 메시지에서 연속한 `channel:"voice"` 구간을 통화 항목 1개로 접는다(위 판정표 F). */
export function foldCallSegments<M extends ThreadMessage>(messages: readonly M[]): ThreadItem<M>[] {
  const items: ThreadItem<M>[] = [];
  messages.forEach((message, index) => {
    if (message.channel === "voice") {
      // F3 — 뒤 메시지(통화 밖)에 같은 링크가 있으면 통화 줄 쪽은 뺀다.
      const later = messages.slice(index + 1).filter((m) => m.channel !== "voice");
      const links = (message.attachments ?? []).filter(
        (a) => !later.some((m) => (m.attachments ?? []).some((b) => b.fakeLandingId !== undefined && b.fakeLandingId === a.fakeLandingId)),
      );
      const last = items[items.length - 1];
      if (last && last.kind === "call") {
        last.turnCount += 1;
        last.attachments.push(...links);
      } else {
        items.push({ kind: "call", id: message.id, turnCount: 1, attachments: [...links] });
      }
      return;
    }
    items.push({ kind: "message", message });
  });
  return items;
}
