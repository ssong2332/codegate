// LLM 예비 요청(hedged request) 데코레이터 — 텍스트 경로의 Gemini 꼬리 지연 완화.
//
// ⭐ 근거(2026-10-18 조정 세션, 라이브 로그): 2026-10-17T07:58:14Z·2026-10-18T02:20:34Z sendMessage가
// `elapsedMs:10002`로 타임아웃 → Mock 강등됐다. 같은 요청의 Gemini 호출은 응답을 돌려준 뒤에야 끝나
// `elapsedMs:30711`·`63801`로 "성공" 로그를 남겼다(응답 뒤 CPU가 줄어든 상태의 수치라 실제 지연은 알 수
// 없음 — 추정). `totalTokenCount`는 평소와 같은 3.6k대이고 추론 토큰 필드가 없어 thinking 원인이 아니다.
// 최근 성공 호출 약 26건 중 대부분 0.7~3.5초, 4초 초과 약 6건(약 23%) — 콜드스타트 단독 원인이 아니고
// Gemini 꼬리 지연으로 판단(추정).
//
// 동작:
//   - 요청 A를 보낸다. `hedgeDelayMs` 안에 A가 끝나면(성공·실패 모두) 그 결과를 그대로 돌려준다.
//     ⛔ A가 그 안에 **실패하면 예비 요청을 보내지 않고 그대로 던진다**(503 등 즉시 실패에 호출을 늘리지
//     않는다 — 기존 동작 유지).
//   - `hedgeDelayMs`가 지나도 A가 미결이면 같은 입력으로 B를 **딱 1번** 보내고, 먼저 **성공**한 쪽을
//     돌려준다. 한쪽이 실패하면 다른 쪽을 기다리고, 둘 다 실패하면 **마지막 실패**를 던진다(에러 객체는
//     손대지 않으므로 순환기가 붙인 `attemptedKeys` 태그가 그대로 남는다).
//   - 총 시간 상한은 바깥 `withTimeout`(LLM_TIMEOUT_MS)이 쥔다 — 이 데코레이터는 시간 상한을 두지 않는다.
//
// 비용: `hedgeDelayMs`를 넘긴 호출에만 Gemini 호출이 1회 추가된다(표본상 약 20%대).
// ⚠️ 한계: 진 쪽 요청은 **취소하지 않는다**(SDK 취소 배선은 범위 밖) — 끝까지 돌고 결과는 버려진다.
// 로그는 숫자만 싣는다(G170 — 프롬프트·응답 본문·키 정보 금지).
import { logger } from "firebase-functions";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "./types";

/** `fn`을 `ms` 뒤에 한 번 실행하도록 예약하고 취소 함수를 돌려준다(테스트에서 주입). */
export type HedgeSchedule = (fn: () => void, ms: number) => () => void;

export type WithHedgeOptions = {
  schedule?: HedgeSchedule;
  now?: () => number;
};

const defaultSchedule: HedgeSchedule = (fn, ms) => {
  const timer = setTimeout(fn, ms);
  return () => clearTimeout(timer);
};

type Winner = "primary" | "hedge" | "none";

export function withHedge(
  client: LlmClient,
  hedgeDelayMs: number,
  opts: WithHedgeOptions = {},
): LlmClient {
  const schedule = opts.schedule ?? defaultSchedule;
  const now = opts.now ?? Date.now;

  /** 동기 throw도 거부된 Promise로 바꾼다. */
  const invoke = (input: LlmCompletionInput): Promise<LlmCompletionResult> => {
    try {
      return Promise.resolve(client.complete(input));
    } catch (error) {
      return Promise.reject(error);
    }
  };

  return {
    // G176 — 바깥(로그·isMock 판정)에서 보이는 이름은 내부 클라이언트 것 그대로("gemini").
    providerName: client.providerName,
    complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
      const startedAt = now();
      return new Promise<LlmCompletionResult>((resolve, reject) => {
        let settled = false;
        let hedgeFired = false;
        let pending = 0;
        let cancelHedge: () => void = () => {};

        const logResult = (winner: Winner): void => {
          if (hedgeFired) {
            logger.info("LLM 예비 요청 결과", { winner, elapsedMs: now() - startedAt });
          }
        };

        const track = (promise: Promise<LlmCompletionResult>, who: "primary" | "hedge"): void => {
          pending += 1;
          promise.then(
            (result) => {
              if (settled) return;
              settled = true;
              cancelHedge();
              logResult(who);
              resolve(result);
            },
            (error: unknown) => {
              pending -= 1;
              if (settled) return;
              // 예비 요청 전에 실패 → 그대로 던진다(호출을 늘리지 않는다).
              // 예비 요청 후 → 남은 쪽이 없을 때만 던진다(마지막 실패).
              if (!hedgeFired || pending === 0) {
                settled = true;
                cancelHedge();
                logResult("none");
                reject(error);
              }
            },
          );
        };

        // A를 먼저 보낸 뒤 예비 요청을 예약한다(결과 콜백은 항상 비동기라 cancelHedge는 그 전에 정해진다).
        track(invoke(input), "primary");
        cancelHedge = schedule(() => {
          if (settled) return;
          hedgeFired = true;
          logger.info("LLM 예비 요청 발사", { hedgeDelayMs });
          track(invoke(input), "hedge");
        }, hedgeDelayMs);
      });
    },
  };
}
