// Functions 런타임 시크릿 접근(Architecture.md §8, API.md Conventions).
// 값은 functions/.env(로컬, 커밋 금지) 또는 배포 환경변수/시크릿으로 주입한다.
// 절대 클라이언트 번들에 포함되지 않는다 — functions/ 패키지 내부에서만 import.
import { defineSecret, defineString } from "firebase-functions/params";

export const ELEVENLABS_API_KEY = defineSecret("ELEVENLABS_API_KEY");

/**
 * 실시간 음성 대화용 시나리오별 에이전트 매핑(2026-07-22) — `scenarioId:agentId` 쉼표 구분.
 * 페르소나 프롬프트는 이 에이전트들에 저장하고 클라로 내려보내지 않는다(ADR-0004,
 * functions/src/realtime/agentMap.ts 주석 참고).
 *
 * defineString이 아니라 process.env를 직접 읽는다 — defineString은 기본값이 빈 문자열이면
 * "기본값 없음"으로 보고 배포/에뮬레이터 기동 시 값을 대화형으로 물어 멈춰 세운다(실측 확인).
 * 이 값은 시크릿이 아닌 단순 식별자 목록이고 미설정이 정상 상태(→ 목업 강등)라 env로 충분하다.
 */
export function getElevenLabsAgentIds(): string {
  return process.env.ELEVENLABS_AGENT_IDS ?? "";
}
export const LLM_API_KEY = defineSecret("LLM_API_KEY");
export const LLM_PROVIDER = defineString("LLM_PROVIDER", { default: "claude" });
export const FALLBACK_VOICE_ID = defineString("FALLBACK_VOICE_ID");
