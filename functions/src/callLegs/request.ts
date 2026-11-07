// §142(PR-3) — `startCallLeg` 요청 판독 · 응답 타입 · 가로채기 화면 해석(잎 모듈 — Firestore · onCall 0, 테스트가 직접 부른다).
import { HttpsError } from "firebase-functions/v2/https";
import { isDocId } from "../shared/requestValidation";
import { findInCallSmsItem } from "../scenarios/inCallSms";
import { findMockScreenItem } from "../scenarios/mockScreens";
import type { LegNotReadyReason, LegStartAction, MultiCallVariant } from "./legPlan";

/** 2026-11-07 — `hangup` = 참가자가 통화를 먼저 끊었다(레그 끝 · 세션 계속 — `planLegHangup`). */
export type StartCallLegAction = LegStartAction | "hangup";
export type StartCallLegRequest = { sessionId: string; action: StartCallLegAction; dialed?: string };
export type StartCallLegResponse =
  | { status: "connected"; legIndex: number; callerLabel: string; entry: "dial" | "transfer" | "incoming"; rejoin?: "redial" | "callback" }
  | { status: "ended"; legIndex: number }
  | { status: "genuine"; number: string; contactLabel?: string; notice: readonly string[] }
  | { status: "unknown_number" }
  | { status: "not_ready"; reason: LegNotReadyReason };

const ACTIONS: readonly StartCallLegAction[] = ["dial", "transfer", "callback", "hangup"];
const MAX_DIALED_LENGTH = 20;

/** 요청 판독(순수 · 세션 read 앞 — 무효 요청이 read 비용을 태우지 않는다). */
export function readStartCallLegRequest(data: unknown): StartCallLegRequest {
  const raw = (data ?? {}) as Record<string, unknown>;
  const sessionId = raw.sessionId;
  if (!isDocId(sessionId)) {
    throw new HttpsError("invalid-argument", "sessionId가 올바르지 않습니다.");
  }
  const action = raw.action;
  if (typeof action !== "string" || !(ACTIONS as readonly string[]).includes(action)) {
    throw new HttpsError("invalid-argument", "action이 올바르지 않습니다.");
  }
  if (action !== "dial") return { sessionId, action: action as StartCallLegAction };
  const dialed = raw.dialed;
  if (typeof dialed !== "string" || dialed.length === 0 || dialed.length > MAX_DIALED_LENGTH) {
    throw new HttpsError("invalid-argument", "dialed가 올바르지 않습니다.");
  }
  return { sessionId, action: "dial", dialed };
}

/** ⭐ PR-B — 다음 통화 조건 화면(레그 `opensNextAfterLanding`)과 그 화면을 여는 선언 문자 id(중복 0 · 문자 없는 화면 = 빈 목록). */
export function nextLegLandingIds(
  variant: Pick<MultiCallVariant, "legs" | "scenarioId"> & { sms: readonly { smsId: string }[] },
): { landingId: string; smsIds: string[] }[] {
  const landingIds = [...new Set(variant.legs.map((leg) => leg.opensNextAfterLanding).filter((id): id is string => typeof id === "string"))];
  return landingIds.map((landingId) => ({
    landingId,
    smsIds: [...new Set(variant.sms.map((s) => s.smsId))].filter((smsId) => findInCallSmsItem(variant.scenarioId, smsId)?.fakeLandingId === landingId),
  }));
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
