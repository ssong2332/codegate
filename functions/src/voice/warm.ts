// 복제 합성 서비스 미리 띄우기(Architecture.md §143.5 W1 · W3 · 결정 D2) — 녹음 화면 진입 · 챌린지 입장 화면에서 클라가 기다리지 않고 부른다.
// 콜드 스타트(실측 76초) 동안 이 함수가 Modal 응답을 기다린다(클라는 기다리지 않음). 서비스 미설정 = 아무것도 안 함.
//
// 판정표 WT(uid당 · `gsvWarm/{uid}` 문서):
// | 행  | 조건                                | 동작 |
// | WT1 | 서비스 미설정(주소 · 키 없음)        | { warmed:false } · 쓰기 0 · 외부 호출 0 |
// | WT0 | sessionId를 줬는데 본인 세션 아님 · 그 세션(챌린지면 챌린지)의 voiceId가 gsv가 아님 | { warmed:false } · 외부 호출 0 (generic 챌린지는 데우지 않는다) · 익명인데 sessionId 없음도 같다 |
// | WT2 | 마지막 데우기 < 120초 전             | { warmed:false } · 외부 호출 0 |
// | WT3 | 오늘(UTC) 데우기 ≥ 20회              | { warmed:false } · 외부 호출 0 |
// | WT4 | 그 밖                                | 기록 갱신 → Modal /warm 호출(실패해도 오류 없이 { warmed:false }) |
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { GSV_TOKEN_KEY } from "../shared/config";
import { isDocId } from "../shared/requestValidation";
import { isAnonymousCaller } from "../shared/anonymousGate";
import { isGsvVoiceId } from "./gsvProvider";
import { gsvExp, sealGsvToken } from "./gsvToken";
import { gsvEndpoint } from "./gsvRuntime";
import { gsvKey } from "./gsvKey";

ensureFirebaseAdminApp();

export const WARM_MIN_INTERVAL_MS = 120_000;
export const WARM_DAILY_LIMIT = 20;

export type WarmRecord = { lastAtMs: number; day: string; count: number };

/** WT2 · WT3 — 순수 판정. 반환 null = 데우지 않음, 아니면 새 기록. */
export function nextWarmRecord(prev: WarmRecord | undefined, nowMs: number): WarmRecord | null {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  if (prev && nowMs - prev.lastAtMs < WARM_MIN_INTERVAL_MS) return null;
  const count = prev && prev.day === day ? prev.count : 0;
  if (count >= WARM_DAILY_LIMIT) return null;
  return { lastAtMs: nowMs, day, count: count + 1 };
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

export const warmCloneEngine = onCall<{ sessionId?: string }, Promise<{ warmed: boolean }>>(
  { secrets: [GSV_TOKEN_KEY], timeoutSeconds: 120 },
  async (request) => {
    // 익명(챌린지 받는 사람)도 허용 — W3. 데우기는 참가자 데이터를 다루지 않는다.
    if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    const endpoint = gsvEndpoint();
    const key = gsvKey();
    if (!endpoint || !key) return { warmed: false }; // WT1
    const sessionId = request.data?.sessionId;
    if (sessionId === undefined && isAnonymousCaller(request.auth)) return { warmed: false }; // WT0 — 녹음 화면(W1)은 로그인 사용자만
    if (sessionId !== undefined && (!isDocId(sessionId) || !(await sessionUsesCloneVoice(request.auth.uid, sessionId)))) {
      return { warmed: false }; // WT0
    }
    const nowMs = Date.now();
    const ref = getFirestore().collection("gsvWarm").doc(request.auth.uid);
    const next = await getFirestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const n = nextWarmRecord(snap.exists ? (snap.data() as WarmRecord) : undefined, nowMs);
      if (n) tx.set(ref, { ...n, updatedAt: Timestamp.fromMillis(nowMs) });
      return n;
    });
    if (!next) return { warmed: false }; // WT2 · WT3
    try {
      const token = sealGsvToken({ kind: "warm", exp: gsvExp(nowMs, 5 * 60_000) }, key);
      const res = await fetch(`${endpoint}/warm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(110_000),
      });
      logger.info("[§143] warm", { status: res.status, sec: Math.round((Date.now() - nowMs) / 100) / 10 });
      return { warmed: res.ok };
    } catch (e) {
      logger.warn("[§143] warm 실패", { name: (e as Error).name });
      return { warmed: false };
    }
  },
);
