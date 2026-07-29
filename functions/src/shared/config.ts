// Functions 런타임 시크릿 접근(Architecture.md §8, API.md Conventions).
// 값은 functions/.env(로컬, 커밋 금지) 또는 배포 환경변수/시크릿으로 주입한다.
// 절대 클라이언트 번들에 포함되지 않는다 — functions/ 패키지 내부에서만 import.
import { defineSecret, defineString } from "firebase-functions/params";

export const ELEVENLABS_API_KEY = defineSecret("ELEVENLABS_API_KEY");

/**
 * Gemini Live API 키(2026-07-22) — 무료 티어로 쓸 수 있는 실시간 음성 대화 경로.
 * ElevenLabs와 달리 고정 프리셋 음성만 지원하므로 generic 시나리오에만 붙인다
 * (functions/src/realtime/provider.ts 선택 순서 주석 참고).
 */
export const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

/**
 * 키 순환(failover)용 2번 이후 슬롯(T132, Architecture.md §37.5 (2)).
 *
 * ⛔ 1번 키를 `GEMINI_API_KEY1`로 개명하지 말 것(G178) — `.env`·배포 시크릿·README·핸들러 5곳이
 * 전부 기존 이름에 묶여 있고, 개명은 순환과 무관한 파괴적 변경이다.
 * ⚠️ **추가하는 키는 반드시 다른 GCP 프로젝트의 것이어야 한다** — 같은 프로젝트 키를 넣으면 쿼터를
 * 공유하므로 순환이 무효가 되는데, **코드는 그것을 감지할 방법이 없다**(429가 오기 전까지 구분
 * 불가). 운영 규칙으로만 보장된다(§37.8 (f), functions/.env.example·README 참고).
 */
export const GEMINI_API_KEY2 = defineSecret("GEMINI_API_KEY2");

/**
 * ⭐ 텍스트 LLM 경로가 **순서대로** 시도하는 Gemini 키 슬롯 목록 — 이 배열이 유일한 정본이다.
 *
 * 키를 늘릴 때 고치는 자리는 **이 파일 한 줄**이다(`defineSecret` 선언 + 이 배열에 추가).
 * 모든 onCall 핸들러는 `{ secrets: [...GEMINI_KEY_SECRETS] }` 로 **스프레드**하므로 핸들러는
 * 한 곳도 손대지 않는다 — 손으로 유지하던 목록이 실제로 드리프트를 낳았기 때문이다
 * (llm/index.ts의 주석이 "3곳"이라 적는 동안 실제 선언은 5곳이었다, §37.5 (4) A).
 *
 * ⛔ 개수를 2로 못박은 것이 아니다(G171) — 슬롯을 더 선언해 이 배열에 이어 붙이면 되고,
 * **값이 없는 슬롯은 읽기 단계(llm/index.ts의 readSecret)가 조용히 걸러낸다**. 슬롯이 선언만
 * 되고 값이 없어도 빌드·에뮬레이터 기동을 막지 않는다(T132 P-1 실측 — 대화형 프롬프트 0건).
 */
export const GEMINI_KEY_SECRETS = [GEMINI_API_KEY, GEMINI_API_KEY2] as const;

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

/**
 * UX-025 조건부 목소리 선택(T30, Architecture.md §13.6) — "남/여 기본 보이스" 최종 폴백 경로가
 * 쓸 ElevenLabs 스톡 voiceId. 기존 FALLBACK_VOICE_ID와 동일한 defineString 패턴을 따른다.
 * ⚠️ FALLBACK_VOICE_ID는 그동안 어디서도 실제로 소비되지 않던 죽은 설정이었다(T30 발견) — 이 두
 * 값은 functions/src/session/index.ts(createSession)가 voiceSelectionSource==="fallback_male"|
 * "fallback_female"일 때 실제로 읽어 session.voiceId를 해석한다(같은 실수 반복 방지).
 */
export const FALLBACK_VOICE_MALE_ID = defineString("FALLBACK_VOICE_MALE_ID");
export const FALLBACK_VOICE_FEMALE_ID = defineString("FALLBACK_VOICE_FEMALE_ID");
