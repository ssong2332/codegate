// 복제 합성 서비스 미리 띄우기(Architecture.md §143.5 W1 · W3 · §143.22) — 녹음 화면 진입 · 챌린지 링크가 열린 순간(동의 전)에 부른다.
// §143.22 — 응답에 서버 기동 단계(phase)를 싣는다. 받는 사람 대기 화면이 2초 간격으로 다시 불러 단계를 보여 준다(가짜 진행 0).
// 동의 전 경로(challengeToken)는 로그인 없이 부른다 — 서버 GPU를 켜기만 한다(녹음 · 개인정보 · 참가자 데이터 0 · 통화 시작 아님).
//
// 판정표 WT(키 = uid 또는 챌린지 · `gsvWarm/{uid | c_<challengeId>}` 문서):
// | 행  | 조건                                                       | 동작 |
// | WT1 | 서비스 미설정(주소 · 키 없음)                                | phase "off" · 쓰기 0 · 외부 호출 0 |
// | WT0 | 대상 아님 — sessionId: 본인 세션 아님 · voiceId가 gsv 아님 / challengeToken: 링크 무효 · 만료 · 끝난 챌린지 · 메신저 · voiceId가 gsv 아님 / 익명인데 둘 다 없음 | phase "off" · 외부 호출 0 |
// | WT2 | 마지막 호출 < 1.5초 전                                       | 기록된 phase(없으면 "booting") · 외부 호출 0 |
// | WT5 | 앞 호출이 아직 Modal 응답을 기다리는 중                        | 기록된 phase(없으면 "booting") · 외부 호출 0 — 같은 대상에 Modal 요청은 늘 1개(동시 요청 = 컨테이너 추가 기동 방지) |
// | WT6 | 데우기 창(첫 호출 뒤 5분) 안의 다시 부르기                      | Modal /warm 호출 · 횟수 안 셈(대기 화면 단계 확인) |
// | WT3 | 새 데우기인데 오늘(UTC) ≥ 20회                               | phase "off" · 외부 호출 0 |
// | WT4 | 그 밖(새 데우기)                                             | 횟수 +1 → Modal /warm 호출 |
// Modal 응답 → phase: 200 + phase(loading · warming · ready · failed) = 그대로 · 200 + phase 없음(§143.22 전 서비스 = 기동이 끝나야 답함) = "ready" · 그 밖 · 실패 = "failed".
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { GSV_TOKEN_KEY } from "../shared/config";
import { isDocId } from "../shared/requestValidation";
import { isAnonymousCaller } from "../shared/anonymousGate";
import { hashToken, isWellFormedShareToken } from "../challenge/token";
import { resolveChallengeByTokenHash } from "../challenge/index";
import { isGsvVoiceId } from "./gsvProvider";
import { gsvExp, sealGsvToken } from "./gsvToken";
import { gsvEndpoint } from "./gsvRuntime";
import { gsvKey } from "./gsvKey";

ensureFirebaseAdminApp();

export const WARM_DAILY_LIMIT = 20;
export const WARM_WINDOW_MS = 5 * 60_000;
export const WARM_POLL_MIN_MS = 1_500;
const WARM_CALL_TIMEOUT_MS = 110_000;

export type WarmPhase = "off" | "booting" | "loading" | "warming" | "ready" | "failed";
export type WarmRecord = { startAtMs?: number; lastAtMs: number; day: string; count: number; phase?: WarmPhase; inflightUntilMs?: number };
export type WarmPlan =
  | { act: "cached"; phase: WarmPhase } // WT2 · WT5
  | { act: "refuse" } // WT3
  | { act: "call"; record: WarmRecord }; // WT4 · WT6

/** 판정표 WT2 ~ WT6 — 순수 판정. */
export function planWarm(prev: WarmRecord | undefined, nowMs: number): WarmPlan {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const inflightUntilMs = nowMs + WARM_CALL_TIMEOUT_MS;
  if (prev) {
    const phase = prev.phase ?? "booting";
    if (nowMs - prev.lastAtMs < WARM_POLL_MIN_MS) return { act: "cached", phase }; // WT2
    if ((prev.inflightUntilMs ?? 0) > nowMs) return { act: "cached", phase }; // WT5
    if (prev.startAtMs !== undefined && nowMs - prev.startAtMs < WARM_WINDOW_MS) {
      return { act: "call", record: { ...prev, lastAtMs: nowMs, inflightUntilMs } }; // WT6
    }
  }
  const count = prev && prev.day === day ? prev.count : 0;
  if (count >= WARM_DAILY_LIMIT) return { act: "refuse" }; // WT3
  return { act: "call", record: { startAtMs: nowMs, lastAtMs: nowMs, day, count: count + 1, phase: "booting", inflightUntilMs } }; // WT4
}

const MODAL_PHASES = new Set<WarmPhase>(["loading", "warming", "ready", "failed"]);

/** Modal /warm 응답 → phase(위 표 마지막 줄). */
export function phaseFromModal(ok: boolean, body: unknown): WarmPhase {
  if (!ok) return "failed";
  const p = (body as { phase?: unknown } | null)?.phase;
  if (p === undefined) return "ready";
  return typeof p === "string" && MODAL_PHASES.has(p as WarmPhase) ? (p as WarmPhase) : "failed";
}

/** WT0 — sessionId가 있으면 그 세션(챌린지 세션은 챌린지 문서)의 voiceId가 복제 목소리일 때만. */
async function sessionUsesCloneVoice(uid: string, sessionId: string): Promise<boolean> {
  const db = getFirestore();
  const s = (await db.collection("sessions").doc(sessionId).get()).data() as { uid?: string; voiceId?: string; challengeId?: string } | undefined;
  if (!s || s.uid !== uid) return false;
  if (s.challengeId) {
    const c = (await db.collection("challenges").doc(s.challengeId).get()).data() as { voiceId?: string } | undefined;
    return isGsvVoiceId(c?.voiceId);
  }
  return isGsvVoiceId(s.voiceId);
}

/** WT0 — 링크 토큰(동의 전): 살아 있는 음성 챌린지이고 voiceId가 복제 목소리일 때만 그 챌린지 id. */
async function cloneChallengeIdFromToken(token: string): Promise<string | null> {
  const r = await resolveChallengeByTokenHash(hashToken(token));
  if (!r || r.expired || r.channel !== "voice") return null;
  if (r.status !== "pending" && r.status !== "consented" && r.status !== "in_progress") return null;
  const c = (await getFirestore().collection("challenges").doc(r.challengeId).get()).data() as { voiceId?: string } | undefined;
  return isGsvVoiceId(c?.voiceId) ? r.challengeId : null;
}

type WarmRequest = { sessionId?: string; challengeToken?: string };
type WarmResponse = { warmed: boolean; phase: WarmPhase };

export const warmCloneEngine = onCall<WarmRequest, Promise<WarmResponse>>(
  { secrets: [GSV_TOKEN_KEY], timeoutSeconds: 120 },
  async (request) => {
    const off: WarmResponse = { warmed: false, phase: "off" };
    const endpoint = gsvEndpoint();
    const key = gsvKey();
    const { sessionId, challengeToken } = request.data ?? {};
    let docId: string;
    if (challengeToken !== undefined) {
      // 받는 사람이 링크를 연 순간(동의 전 · 로그인 없음) — 링크 토큰으로만 판정한다.
      if (!isWellFormedShareToken(challengeToken)) throw new HttpsError("invalid-argument", "token이 필요합니다.");
      if (!endpoint || !key) return off; // WT1
      const challengeId = await cloneChallengeIdFromToken(challengeToken);
      if (!challengeId) return off; // WT0
      docId = `c_${challengeId}`;
    } else {
      if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
      if (!endpoint || !key) return off; // WT1
      if (sessionId === undefined && isAnonymousCaller(request.auth)) return off; // WT0 — 녹음 화면(W1)은 로그인 사용자만
      if (sessionId !== undefined && (!isDocId(sessionId) || !(await sessionUsesCloneVoice(request.auth.uid, sessionId)))) {
        return off; // WT0
      }
      docId = request.auth.uid;
    }
    const nowMs = Date.now();
    const ref = getFirestore().collection("gsvWarm").doc(docId);
    const plan = await getFirestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const p = planWarm(snap.exists ? (snap.data() as WarmRecord) : undefined, nowMs);
      if (p.act === "call") tx.set(ref, { ...p.record, updatedAt: Timestamp.fromMillis(nowMs) });
      return p;
    });
    if (plan.act === "refuse") return off; // WT3
    if (plan.act === "cached") return { warmed: false, phase: plan.phase }; // WT2 · WT5
    let phase: WarmPhase = "failed";
    let warmed = false;
    try {
      const token = sealGsvToken({ kind: "warm", exp: gsvExp(nowMs, 5 * 60_000) }, key);
      const res = await fetch(`${endpoint}/warm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(WARM_CALL_TIMEOUT_MS),
      });
      warmed = res.ok;
      phase = phaseFromModal(res.ok, res.ok ? await res.json().catch(() => null) : null);
      logger.info("[§143] warm", { status: res.status, phase, sec: Math.round((Date.now() - nowMs) / 100) / 10 });
    } catch (e) {
      logger.warn("[§143] warm 실패", { name: (e as Error).name });
    }
    await ref.update({ phase, inflightUntilMs: 0 }).catch(() => {});
    return { warmed, phase };
  },
);
