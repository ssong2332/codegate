// 실시간 음성 대화 프로바이더 교체점(단일화) — voice/provider.ts·llm/index.ts와 동일 패턴.
//
// 선택 순서와 근거(2026-07-22):
//   ① ElevenLabs — `ELEVENLABS_API_KEY` + 해당 시나리오의 `ELEVENLABS_AGENT_IDS` 매핑이 둘 다
//      있을 때. 유료지만 **런타임에 임의 클론 voice를 지정할 수 있는 유일한 경로**라, 이 앱의
//      1번 차별점인 "본인 목소리로 걸려오는 전화"(AC-018/019)를 만족한다. clone 시나리오는
//      사실상 이 경로에서만 제대로 성립한다.
//   ② Gemini Live — `GEMINI_API_KEY`가 있고 **generic 시나리오일 때만**. 무료 티어로 쓸 수 있는
//      speech-to-speech지만 고정 프리셋 음성만 지원한다. clone 시나리오에 붙이면 "본인 목소리로
//      합성됐다"는 화면 표기가 사실과 달라지므로(근거 없는 표기 금지) 의도적으로 제외한다.
//   ③ Mock — 위 조건이 안 맞으면 텍스트 폴백으로 강등하고 `isMock:true`로 클라에 알린다.
//
// "키는 있는데 이 시나리오만 설정이 없는" 경우도 강등 대상이라, 시나리오를 새로 추가하고 설정을
// 빠뜨렸을 때 조용히 엉뚱한 에이전트로 연결되는 사고가 나지 않는다.
import { ELEVENLABS_API_KEY, GEMINI_API_KEY, getElevenLabsAgentIds } from "../shared/config";
import { PUBLIC_SCENARIOS, type VoiceMode } from "../scenarios/publicMeta";
import { parseAgentMap } from "./agentMap";
import { ElevenLabsRealtimeProvider } from "./elevenLabsProvider";
import { GeminiRealtimeProvider } from "./geminiProvider";
import { MockRealtimeProvider } from "./mockProvider";
import type { RealtimeProviderName, RealtimeVoiceProvider } from "./types";

/**
 * 자격증명 판독 상태 3값(T133/AC-081 (c), Architecture.md §41.6 (나)).
 *   - `set`    : 쓸 수 있는 값이 있다
 *   - `empty`  : 주입은 됐지만 빈 문자열이거나 `.env.example`의 `YOUR_` placeholder다
 *   - `absent` : `process.env`에 키 자체가 없다(= 미주입)
 * ⛔ 값·길이·접두·해시는 어디에도 싣지 않는다 — 드러내는 것은 **이름과 이 판별 결과**까지다(G211).
 */
export type SecretReadState = "set" | "empty" | "absent";

export type SecretParamLike = { readonly name?: string; value: () => string };

/**
 * ⭐⭐ 전제 정정(G203) — 아래 `catch`는 **런타임에 발동하지 않는다.**
 * `firebase-functions@7.3.0`의 `SecretParam.value()`는 `process.env.FUNCTIONS_CONTROL_API === "true"`
 * (배포 **분석** 단계)일 때만 throw하고, 그 밖에서는 `runtimeValue()`가 `process.env[name]`을 읽어
 * 없으면 `logger.warn` 1줄을 남기고 `""` 를 돌려준다(`node_modules/firebase-functions/lib/params/
 * types.js`의 `SecretParam.runtimeValue`/`value`). ⇒ 배포·에뮬레이터·단위테스트에서 `""` 를 만드는
 * 것은 catch가 아니라 `!value` 분기다. ⛔ *"throw를 catch가 삼킨다"* 로 읽지 말 것 — 다음 사람이
 * catch를 지워 고쳤다고 믿게 된다. catch는 배포 분석 단계 대비로만 남긴다.
 *
 * ⛔ `param.value()`는 **1회만** 부른다 — SDK가 미주입 시 호출마다 경고를 찍으므로 두 번 부르면
 * 관측 신호가 그대로 2배가 된다(§41.6 (나)가 피하려는 중복 로그).
 */
function readSecretDetail(
  param: SecretParamLike,
  env: NodeJS.ProcessEnv = process.env,
): { readonly state: SecretReadState; readonly value: string } {
  let value: string;
  try {
    value = param.value();
  } catch {
    return { state: "absent", value: "" };
  }
  if (value && !value.startsWith("YOUR_")) return { state: "set", value };
  // 빈 문자열이 "미주입"인지 "빈 값 주입"인지는 process.env 존재 여부로만 갈린다.
  const name = param.name;
  if (name !== undefined && env[name] === undefined) return { state: "absent", value: "" };
  return { state: "empty", value: "" };
}

export function classifySecret(
  param: SecretParamLike,
  env: NodeJS.ProcessEnv = process.env,
): SecretReadState {
  return readSecretDetail(param, env).state;
}

/**
 * ⚠️ 반환 계약은 종전과 동일한 **문자열**이다(§41.8 강등표 8행) — 3값 구분은 내부에만 둔다.
 *
 * ⭐ **`absent`에 대한 신호는 새로 만들지 않는다.** P-3 실측에서 SDK가 이미 같은 조건
 * (`process.env[name] === undefined`)에 정확히 그 처방까지 담은 경고를 낸다:
 *   *"No value found for secret parameter "{name}". A function can only access a secret if you
 *    include the secret in the function's dependency array."*
 * 호출 1회당 읽는 시크릿 수만큼(실측 2줄) 나오므로, 여기서 또 찍으면 **중복 로그**다.
 * ⇒ AC-081 (c)가 요구하는 *"거부되거나 관측 가능한 신호로 드러난다"* 중 **후자**를 SDK 경고가
 *    담당한다. ⛔ **차단하지 않는다** — 키 없는 개발·격리 워크트리의 Mock 강등은 **정당한 동작**이고
 *    `__tests__/provider.test.ts`가 그것을 단언한다(G210).
 * ⚠️ 잔여 한계: `empty`(빈 값·placeholder 주입)에는 SDK 경고가 **나지 않는다** — 관측되지 않는다.
 */
function readSecret(param: SecretParamLike): string {
  return readSecretDetail(param).value;
}

/**
 * effectiveVoiceMode(T30 추가, 옵셔널, Architecture.md §13.6 통합 버그 수정) — 에스컬레이션된 세션
 * (메신저→보이스 전이)의 scenarioId는 **메신저 시나리오 ID**(예: messenger-subsidy-smishing-sms)라
 * `PUBLIC_SCENARIOS[scenarioId].voiceMode`가 의도적으로 undefined다(T27, 메신저 시나리오엔
 * voiceMode 개념이 없음). 그대로 두면 에스컬레이션 세션은 이 조건을 절대 만족하지 못해 Gemini
 * 경로를 못 타고 Mock으로 강등된다. 호출부(functions/src/realtime/index.ts)가
 * session.voiceSelectionSource로부터 유추한 값을 넘기면 그 값을 우선 쓰고, 넘기지 않으면(기존
 * 순수 보이스 세션) 기존과 동일하게 PUBLIC_SCENARIOS를 그대로 참조한다(하위호환).
 */
export function getRealtimeProvider(
  scenarioId: string,
  effectiveVoiceMode?: VoiceMode,
  options: { relayVariant?: boolean } = {},
): RealtimeVoiceProvider {
  const voiceMode = effectiveVoiceMode ?? PUBLIC_SCENARIOS[scenarioId]?.voiceMode;

  // ① ElevenLabs — 클론 가능 경로 우선. (판정 순서 · 조건은 아래 순수 함수 하나가 진다 — 종전과 같은 순서.)
  const elevenLabsKey = readSecret(ELEVENLABS_API_KEY);
  const agentMap = elevenLabsKey ? parseAgentMap(getElevenLabsAgentIds()) : {};
  // ② Gemini Live — 무료 경로. 고정 음성만 되므로 generic 시나리오에만 붙인다.
  const geminiKey = readSecret(GEMINI_API_KEY);
  const name = selectRealtimeProviderName({
    elevenLabsReady: Boolean(elevenLabsKey) && Boolean(agentMap[scenarioId]),
    geminiReady: Boolean(geminiKey),
    voiceMode,
    relayVariant: options.relayVariant === true,
  });
  if (name === "elevenlabs") return new ElevenLabsRealtimeProvider(elevenLabsKey, agentMap);
  if (name === "gemini") return new GeminiRealtimeProvider(geminiKey);
  // ③ 텍스트 폴백.
  return new MockRealtimeProvider();
}

/**
 * ⭐ T191 릴레이 라우팅 허용목록(G495 · DECISIONS #139 — User: 릴레이가 있는 흐름은 ElevenLabs로 보내지 않는다).
 * ElevenLabs 경로에는 통화 중 서버 측 인계문 주입 통로가 없고, 클라 경유 동적 변수는 가드레일 우회 통로가 된다
 * (T191 릴레이 설계 "ElevenLabs — 안전 조건 하 불가"). ⛔ **차단목록(`!== "elevenlabs"`)으로 쓰지 말 것** —
 * 새 외부 에이전트 프로바이더가 기본 통과가 된다(G233 관례 — `TURN_INSTRUCTION_CAPABLE_PROVIDERS`와 같은 형태).
 */
export const RELAY_CAPABLE_PROVIDERS: readonly RealtimeProviderName[] = ["gemini", "none"];

/** ⚠️ `allowlist`는 테스트 주입용(역검증이 이 함수 자신으로 서야 한다 — G234 관례). 호출부는 넘기지 않는다. */
export function isRelayCapable(
  provider: RealtimeProviderName,
  allowlist: readonly RealtimeProviderName[] = RELAY_CAPABLE_PROVIDERS,
): boolean {
  return allowlist.includes(provider);
}

/**
 * 프로바이더 선택(순수) — ① ElevenLabs(키 + 이 시나리오 에이전트) ② Gemini(키 + generic) ③ 텍스트 폴백.
 * 릴레이 변형 세션은 허용목록 밖 프로바이더를 건너뛰고 다음 순위로 간다(조용한 미적용이 아니라 라우팅 —
 * 클론 시나리오면 Gemini 조건(generic)이 안 맞아 텍스트 폴백이 된다).
 */
export function selectRealtimeProviderName(
  input: { elevenLabsReady: boolean; geminiReady: boolean; voiceMode?: VoiceMode; relayVariant?: boolean },
  relayAllowlist: readonly RealtimeProviderName[] = RELAY_CAPABLE_PROVIDERS,
): RealtimeProviderName {
  const allowed = (provider: RealtimeProviderName): boolean =>
    !input.relayVariant || isRelayCapable(provider, relayAllowlist);
  if (input.elevenLabsReady && allowed("elevenlabs")) return "elevenlabs";
  if (input.geminiReady && input.voiceMode === "generic" && allowed("gemini")) return "gemini";
  return "none";
}
