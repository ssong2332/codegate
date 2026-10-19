// T194-a G584(docs/Architecture.md §83.13.2) — **세션 단위** 도달 가능 랜딩 집합.
//
// 왜 필요한가: §35 G159는 "한 시나리오의 도달 가능 랜딩 ≥ 2"를 셌다. 그 단위는 "한 세션이 볼 수 있는 프롬프트 집합"의 대리값이었는데,
// 흐름 변형 이후 세션 프롬프트는 (시나리오 × 변형)이 정한다(`resolveSessionScenarioPrompt`). §83.13은 G159의 단위를
// (시나리오 × 변형)으로 바꾸고(G585), 그 단위가 **런타임에서 참이 되도록** 기록 층이 이 집합 밖 랜딩을 거부하게 했다
// (`recordMockScreenEvent` — kind 무관). 이 함수가 그 두 곳(테스트 · 소스)의 **단일 원천**이다(테스트에 정규식 사본 0).
//
// 입력: 세션 변형 프롬프트(persona · tactics · guardrail · suspicionKeywords) + 그 변형의 **모든 leg** 페르소나(S7 대비) 속
// `[[LINK:id]]` ∪ 그 변형이 **선언한** 문자(`resolveDeclaredSms`)의 `fakeLandingId`. 변형 없는 세션은 원본 프롬프트 마커만
// (선언 문자 0 — 같은 함수가 `no_variant`로 빈 선언을 준다).
// ⛔ `extractLinkMarker`는 이 집합으로 마커를 거르지 않는다(G161 — 다중 마커 능력 유지). 거부는 기록 층에서만 한다.
// ⚠️ 이 집합은 "도달할 수 **있는**" 랜딩이다 — 한 변형 안에 2건이면 그것은 §35.6 1행(T129 (b) 선행) 대상이다(G159가 알린다).
import { findFlowVariant, resolveSessionScenarioPrompt } from "./flowVariants";
import { findInCallSmsItem } from "./inCallSms";
import { resolveDeclaredSms } from "../inCallSms/smsGate";

const LINK_MARKER = /\[\[LINK:([a-zA-Z0-9_-]+)\]\]/g;

/** 그 세션(시나리오 × 변형 · 변형 부재 = 원본)이 도달할 수 있는 랜딩 id 집합(정렬된 배열 · 중복 0). */
export function sessionReachableLandingIds(scenarioId: string, flowVariantId: string | undefined): string[] {
  const prompt = resolveSessionScenarioPrompt(scenarioId, flowVariantId);
  if (!prompt) return [];
  const texts: string[] = [
    prompt.personaPrompt,
    prompt.guardrailPreamble,
    ...prompt.weakenedTactics,
    ...(prompt.suspicionKeywords ?? []),
  ];
  const variant = findFlowVariant(flowVariantId);
  if (variant && variant.scenarioId === scenarioId) {
    for (const leg of variant.legs) if (leg.personaPrompt) texts.push(leg.personaPrompt);
  }
  const ids = new Set<string>();
  for (const [, landingId] of texts.join("\n").matchAll(LINK_MARKER)) ids.add(landingId);
  for (const sms of resolveDeclaredSms(scenarioId, flowVariantId).declared) {
    const item = findInCallSmsItem(scenarioId, sms.smsId);
    if (item?.fakeLandingId) ids.add(item.fakeLandingId);
  }
  return [...ids].sort();
}
