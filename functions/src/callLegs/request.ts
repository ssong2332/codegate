// §142(PR-3) — `startCallLeg` 요청 판독 · 응답 타입 · 가로채기 화면 해석(잎 모듈 — Firestore · onCall 0, 테스트가 직접 부른다).
import { HttpsError } from "firebase-functions/v2/https";
import { findInCallSmsItem } from "../scenarios/inCallSms";
import { findMockScreenItem } from "../scenarios/mockScreens";
import type { LegStartAction, MultiCallVariant } from "./legPlan";

export type StartCallLegRequest = { sessionId: string; action: LegStartAction; dialed?: string };
export type StartCallLegResponse =
  | { status: "connected"; legIndex: number; callerLabel: string; entry: "dial" | "transfer" | "incoming" }
  | { status: "genuine"; number: string; contactLabel?: string; notice: readonly string[] }
  | { status: "unknown_number" }
  | { status: "not_ready"; reason: "not_multi_call" | "leg_in_progress" | "no_next_leg" | "wrong_action" };

const ACTIONS: readonly LegStartAction[] = ["dial", "transfer", "callback"];
const MAX_DIALED_LENGTH = 20;

/** 요청 판독(순수 · 세션 read 앞 — 무효 요청이 read 비용을 태우지 않는다). */
export function readStartCallLegRequest(data: unknown): StartCallLegRequest {
  const raw = (data ?? {}) as Record<string, unknown>;
  const sessionId = raw.sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0 || sessionId.length > 128) {
    throw new HttpsError("invalid-argument", "sessionId가 올바르지 않습니다.");
  }
  const action = raw.action;
  if (typeof action !== "string" || !(ACTIONS as readonly string[]).includes(action)) {
    throw new HttpsError("invalid-argument", "action이 올바르지 않습니다.");
  }
  if (action !== "dial") return { sessionId, action: action as LegStartAction };
  const dialed = raw.dialed;
  if (typeof dialed !== "string" || dialed.length === 0 || dialed.length > MAX_DIALED_LENGTH) {
    throw new HttpsError("invalid-argument", "dialed가 올바르지 않습니다.");
  }
  return { sessionId, action: "dial", dialed };
}

/** 가로채기 조건(원격 지원 앱 설치 응낙)을 보는 화면 = 변형이 선언한 문자 중 설치 화면으로 이어지는 것. */
export function installLandingIds(variant: Pick<MultiCallVariant, "scenarioId"> & { sms: readonly { smsId: string }[] }): string[] {
  const ids: string[] = [];
  for (const item of variant.sms) {
    const landingId = findInCallSmsItem(variant.scenarioId, item.smsId)?.fakeLandingId;
    if (landingId && findMockScreenItem(variant.scenarioId, landingId)?.kind === "app-install") ids.push(landingId);
  }
  return ids;
}
