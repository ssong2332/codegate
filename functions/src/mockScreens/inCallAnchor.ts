// T194-c-1(docs/Architecture.md §84.5.3 · §84.15.3 · ADR-0022 Addendum 2 · G584 · G606) — 통화 중 문자로 연 설치 화면(Q2)의 **도착 검증 +
// 명시 앵커** 순수 판정. `recordMockScreenEvent`(`./index.ts`)가 Firestore get 1회 결과를 넘겨 이 함수들로 판정한다(콜러블 직접 실행 없이
// 단위 테스트가 같은 함수를 부른다).
//
// ── 판정표(⛔ 이 순서 그대로 — 통화 중 문자 표면 항목에만 적용) ─────────────────────────────────────────
// | # | If | Then |
// |---|---|---|
// | 1 | `callMode`가 "realtime" · "fallback"이 아니다(부재 포함) | `invalid-argument` |
// | 2 | 그 랜딩을 `fakeLandingId`로 가진 **선언 문자**가 세션 변형에 없다 | `failed-precondition`(도달 술어가 이미 막지만 이중 방어) |
// | 3 | 그 문자의 도착 문서(`inCallSms/{smsId}`)가 없다 | `failed-precondition`(문자 미도착 — 응낙 기록 0) |
// | 4 | 그 외 | 앵커 = 문자 문서의 `anchorScammerTurn` 그대로(정수가 아니면 `undefined` = 미해결 · 승격 0) |
// ⛔ 응낙 시점의 클라 계수(`scammerTurns`)는 입력이 아니다(Q-X5) — 요청 타입에 그 필드가 없다.
import { HttpsError } from "firebase-functions/v2/https";
import { findInCallSmsItem } from "../scenarios/inCallSms";
import { resolveDeclaredSms } from "../inCallSms/smsGate";
import type { MockScreenCallMode } from "./types";

/** 판정표 1행. */
export function readMockScreenCallMode(value: unknown): MockScreenCallMode {
  if (value === "realtime" || value === "fallback") return value;
  throw new HttpsError("invalid-argument", "통화 중 화면 기록에는 callMode(realtime · fallback)가 필요합니다.");
}

/** 판정표 2행 — 세션 변형이 선언한 문자 중 그 랜딩을 여는 문자(없으면 `undefined`). */
export function findDeclaredSmsIdForLanding(
  scenarioId: string,
  flowVariantId: string | undefined,
  landingId: string,
): string | undefined {
  return resolveDeclaredSms(scenarioId, flowVariantId).declared.find(
    (declared) => findInCallSmsItem(scenarioId, declared.smsId)?.fakeLandingId === landingId,
  )?.smsId;
}

/** 판정표 3 · 4행 — 문자 도착 문서 get 결과 → 앵커. */
export function anchorFromInCallSmsDoc(arrival: { exists: boolean; anchorScammerTurn?: unknown }): number | undefined {
  if (!arrival.exists) {
    throw new HttpsError("failed-precondition", "아직 도착하지 않은 문자의 화면입니다.");
  }
  const anchor = arrival.anchorScammerTurn;
  return typeof anchor === "number" && Number.isInteger(anchor) && anchor >= 0 ? anchor : undefined;
}
