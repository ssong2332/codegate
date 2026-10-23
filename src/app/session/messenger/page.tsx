"use client";

// UX-022 메신저 채팅 화면 라우트. 본문은 `src/components/MessengerChatRoom.tsx`(§121.4 PR-2 — 통화 화면 겹침 준비로 옮김 · 동작 변경 0).
import MessengerChatRoom from "@/components/MessengerChatRoom";

export default function MessengerSessionPage() {
  return <MessengerChatRoom />;
}
