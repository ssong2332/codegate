// 초급 사전 브리핑 신호 목록 (T72, Architecture.md §15.3.4, UX-029/D-43, AC-066).
//
// **왜 신규 콘텐츠를 저작하지 않는가(§15.3.4)**: 시나리오마다 브리핑 문구를 따로 쓰면 13벌이
// 늘어나고(드리프트 위험), 무엇보다 그 문구가 프롬프트와 어긋날 수 있다. 이미 존재하는
// `weakenedTactics`에서 **라벨만** 뽑으면 "실제로 이 대화에서 쓰이는 수법"과 브리핑이 구조적으로
// 같은 원천을 갖는다.
//
// ⚠️ **ADR-0004 경계(무엇을 내보내고 무엇을 내보내지 않는가)**: 노출되는 것은 **수법 라벨**뿐이다
// (예: "긴급성 조성"). 페르소나 프롬프트·가드레일 원문·설명부·인용구(캐릭터가 실제로 말할 대사)는
// 어떤 경우에도 클라로 나가지 않는다 — `extractTacticFlavor`(인용구 추출)를 여기서 **쓰지 않는
// 것이 의도**다. 같은 라벨 값은 이미 리포트가 `tacticsUsed`로 클라에 보여주고 있어(analyzeConversation
// → extractTacticLabel) 노출 면이 새로 열리지 않는다. 새로운 것은 "세션 시작 전에 본다"는 시점뿐이며
// 그것이 초급의 학습 설계 자체다(D-43).
//
// ⚠️ **AC-066 경계**: 이 신호 목록은 **세션 시작 전 화면(UX-029)에서만** 소비된다. 대화 진행 중
// 실시간으로 "지금 이것이 사기 신호입니다"를 표시하는 경로는 만들지 않는다(D-6 유지) — 실시간 판정
// 파이프라인 자체가 신설되지 않았다.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { SCENARIO_PROMPTS } from "./index";
import { extractTacticLabel } from "./tacticFlavor";
import type {
  GetBeginnerBriefingRequest,
  GetBeginnerBriefingResponse,
} from "./briefingTypes";

/** weakenedTactics → 중복 없는 수법 라벨 목록(입력 순서 유지). 빈 라벨은 버린다. */
export function buildBeginnerBriefingSignals(weakenedTactics: string[]): string[] {
  const signals: string[] = [];
  for (const tactic of weakenedTactics) {
    const label = extractTacticLabel(tactic);
    if (!label) continue;
    if (!signals.includes(label)) signals.push(label);
  }
  return signals;
}

/**
 * getBeginnerBriefing — UX-029에서 초급을 고른 사용자에게 "이 대화에서 나올 수 있는 위험 신호"를
 * 미리 보여주기 위한 조회(§15.3.4 계약 그대로: `{ scenarioId } → { signals: string[] }`).
 * 인증 필수(다른 콜러블과 동일 기준) — 시나리오 프롬프트 원천은 클라가 직접 read할 수 없으므로
 * (firestore.rules) 이 콜러블만이 라벨을 얻는 경로다.
 */
export const getBeginnerBriefing = onCall<
  GetBeginnerBriefingRequest,
  Promise<GetBeginnerBriefingResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { scenarioId } = request.data ?? {};
  if (!scenarioId) {
    throw new HttpsError("invalid-argument", "scenarioId가 필요합니다.");
  }
  const scenarioPrompt = SCENARIO_PROMPTS[scenarioId];
  if (!scenarioPrompt) {
    throw new HttpsError("invalid-argument", `존재하지 않는 scenarioId입니다: ${scenarioId}`);
  }
  return { signals: buildBeginnerBriefingSignals(scenarioPrompt.weakenedTactics) };
});
