// 세션의 첫 사용자 턴 판정(2026-10-18, 사용자 결정 C — `llm/index.ts`의 `LLM_FIRST_TURN_TIMEOUT_MS`).
//
// sendMessage는 트랜잭션에서 **이번 사용자 메시지를 쓰기 전**의 이력을 읽는다(roleplay/index.ts 턴 확보
// 트랜잭션). 그 이력에 `role:"user"` 메시지가 0건이면 이번 턴이 그 세션의 첫 사용자 턴이다 —
// 오프닝 대사(role:"scammer")만 있거나 이력이 비어 있는 경우다.
import type { MessageDoc } from "../shared/types";

export function isFirstUserTurn(history: readonly Pick<MessageDoc, "role">[]): boolean {
  return !history.some((message) => message.role === "user");
}
