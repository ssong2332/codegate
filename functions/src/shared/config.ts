// Functions 런타임 시크릿 접근(Architecture.md §8, API.md Conventions).
// 값은 functions/.env(로컬, 커밋 금지) 또는 배포 환경변수/시크릿으로 주입한다.
// 절대 클라이언트 번들에 포함되지 않는다 — functions/ 패키지 내부에서만 import.
import { defineSecret, defineString } from "firebase-functions/params";

export const ELEVENLABS_API_KEY = defineSecret("ELEVENLABS_API_KEY");
export const LLM_API_KEY = defineSecret("LLM_API_KEY");
export const LLM_PROVIDER = defineString("LLM_PROVIDER", { default: "claude" });
export const FALLBACK_VOICE_ID = defineString("FALLBACK_VOICE_ID");
