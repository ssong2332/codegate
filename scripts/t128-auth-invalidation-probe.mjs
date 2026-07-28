// T128 — 인증 무효화 감지의 **라이브 역검증** (Architecture.md §34.7 프로브 · §34.8 ①).
//
// ⛔ 이 스크립트가 증명하는 것을 정확히 적는다: **토큰 무효화를 막지 않는다**(§34.10 (a)). 여기서
//    확인하는 것은 (1) 무효화 상태에서 감지 경로가 **실제로 발화**하고, (2) **정상 상태 전 구간에서는
//    0회**라는 두 가지를, **같은 실행 출력에** 나란히 남기는 것이다. 오탐이 나면 이 저장소는 장치를
//    삭제한다(§24.4/§34.6) — 그래서 (2)가 (1)보다 중요하다.
//
// 실행(에뮬레이터가 떠 있어야 한다):
//   node --experimental-strip-types scripts/t128-auth-invalidation-probe.mjs
//
// ⚠️ 공유 에뮬레이터를 파괴하지 않는다 — `DELETE .../accounts`(전체 말소)를 쓰지 않고 이 스크립트가
//    만든 uid 1개만 관리자 엔드포인트로 건드리며, 콜러블도 쓰기 없는 `listMyChallenges`만 쓴다.
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInAnonymously, signOut } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

import {
  isUnauthenticatedCallableError,
  resolveAuthInvalidationMode,
} from "../src/lib/authinvalidation/authInvalidation.ts";

const PROJECT_ID = "demo-test";
const AUTH_HOST = "http://127.0.0.1:9099";
const FUNCTIONS_PORT = 5001;

const ROUTES = [
  "/",
  "/challenge/create",
  "/challenge/join",
  "/challenge/results",
  "/clone/wait",
  "/grade",
  "/history",
  "/login",
  "/onboarding/age-gate",
  "/onboarding/consent",
  "/onboarding/record",
  "/report",
  "/report/archive",
  "/report/replay",
  "/report/rewind",
  "/scenarios",
  "/scenarios/difficulty",
  "/scenarios/experience-select",
  "/scenarios/messenger",
  "/scenarios/messenger/voice-select",
  "/scenarios/voice",
  "/scenarios/voice/clone",
  "/scenarios/voice/generic",
  "/session/chat",
  "/session/end",
  "/session/messenger",
  "/session/play",
];

const log = (s) => console.log(s);

// ── ⓪ 에뮬레이터 최신성(T115 · §34.8 ⑤) — 낡은 에뮬레이터 위의 결과는 통과해도 무효다 ──
const backends = await fetch(`http://127.0.0.1:${FUNCTIONS_PORT}/backends`).then((r) => r.json());
for (const b of backends.backends) {
  log(`[0] emulator backend dir=${b.directory} functions=${b.functionTriggers.length}`);
}
log(
  "[0] ⚠️ T128은 functions/ 를 한 줄도 바꾸지 않는다 — 이 프로브가 의존하는 서버 동작은 " +
    "`request.auth` 부재 시의 unauthenticated 거절 하나뿐이다.",
);

const app = initializeApp({
  apiKey: "demo-emulator-key",
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  storageBucket: `${PROJECT_ID}.appspot.com`,
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:t128probe",
});
const auth = getAuth(app);
connectAuthEmulator(auth, AUTH_HOST, { disableWarnings: true });
const fns = getFunctions(app);
connectFunctionsEmulator(fns, "127.0.0.1", FUNCTIONS_PORT);

// 클라이언트 단일 래퍼(`src/lib/api/callable.ts`)와 **같은 판정 함수**를 쓴다 — 여기서만 참인
// 별도 규칙을 만들면 이 프로브는 아무것도 증명하지 못한다.
let detectorFires = 0;
async function call(name, payload) {
  try {
    const { data } = await httpsCallable(fns, name)(payload);
    return { ok: true, data };
  } catch (err) {
    if (isUnauthenticatedCallableError(err)) detectorFires += 1;
    return { ok: false, code: err?.code };
  }
}

async function admin(path, body) {
  const res = await fetch(
    `${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:${path}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
      body: JSON.stringify(body),
    },
  );
  return res.status;
}

function bannerCount(state) {
  let fired = 0;
  for (const pathname of ROUTES) {
    if (resolveAuthInvalidationMode({ ...state, pathname }) !== "none") fired += 1;
  }
  return fired;
}

// ── ① 대조군 — 정상 세션 전 구간 ──────────────────────────────────────────────────────
log("");
log("===== ① 대조군(정상) — 배너 발화가 0회여야 한다 =====");
await signOut(auth).catch(() => {});
const healthy = await signInAnonymously(auth);
log(`[1] 익명 로그인 uid=${healthy.user.uid} isAnonymous=${healthy.user.isAnonymous}`);

detectorFires = 0;
for (let i = 0; i < 5; i += 1) {
  const r = await call("listMyChallenges", {});
  if (!r.ok) log(`[1] ⚠️ 정상 상태 호출이 실패했다: ${r.code}`);
}
const healthyState = {
  signedOut: auth.currentUser === null,
  hadUser: true,
  unauthenticatedCallable: detectorFires > 0,
  wasAnonymous: true,
};
log(`[1] 콜러블 5회 → 감지 발화 ${detectorFires}회 (기대 0)`);
log(`[1] 라우트 ${ROUTES.length}곳 판정 → 배너 발화 ${bannerCount(healthyState)}회 (기대 0)`);
log(
  `[1] 같은 상태를 계정형(wasAnonymous=false)으로 봐도 → 배너 발화 ${bannerCount({
    ...healthyState,
    wasAnonymous: false,
  })}회 (기대 0)`,
);
const controlOk = detectorFires === 0 && bannerCount(healthyState) === 0;

// ── ② 실험군 A — 계정 비활성(무효화 3종 중 1) ────────────────────────────────────────
log("");
log("===== ② 실험군 A — 계정 비활성(USER_DISABLED) =====");
detectorFires = 0;
const disabledStatus = await admin("update", { localId: healthy.user.uid, disableUser: true });
log(`[2] accounts:update(disableUser=true) → HTTP ${disabledStatus}`);
let idTokenCode = null;
try {
  await healthy.user.getIdToken(true);
} catch (err) {
  idTokenCode = err?.code;
}
await new Promise((r) => setTimeout(r, 500));
const autoSignedOut = auth.currentUser === null;
log(`[2] getIdToken(true) → ${idTokenCode} / SDK 자동 signOut ${autoSignedOut ? "발생" : "없음"}`);
const afterDisable = await call("listMyChallenges", {});
log(`[2] 콜러블 → ${afterDisable.code ?? "성공"} / 감지 발화 ${detectorFires}회 (기대 1 이상)`);
const stateA = {
  signedOut: autoSignedOut,
  hadUser: true,
  unauthenticatedCallable: detectorFires > 0,
  wasAnonymous: true,
};
log(`[2] /session/play 판정 = ${resolveAuthInvalidationMode({ ...stateA, pathname: "/session/play" })}`);
log(
  `[2] 같은 상태 계정형 = ${resolveAuthInvalidationMode({
    ...stateA,
    wasAnonymous: false,
    pathname: "/session/play",
  })}`,
);
log(`[2] 훈련 밖(/scenarios) 판정 = ${resolveAuthInvalidationMode({ ...stateA, pathname: "/scenarios" })} (기대 none)`);
const expAOk =
  detectorFires >= 1 &&
  resolveAuthInvalidationMode({ ...stateA, pathname: "/session/play" }) === "banner-anonymous";

// ── ③ 실험군 B — 조용히 죽는 경로(§34.2 (C)) ─────────────────────────────────────────
log("");
log("===== ③ 실험군 B — refreshToken 훼손(자동 signOut이 일어나지 않는 경로) =====");
detectorFires = 0;
await signOut(auth).catch(() => {});
const silent = await signInAnonymously(auth);
log(`[3] 익명 로그인 uid=${silent.user.uid}`);
const pre = await call("listMyChallenges", {});
log(`[3] [사전 대조] 콜러블 → ${pre.ok ? "성공" : pre.code} / 감지 발화 ${detectorFires}회 (기대 0)`);
const preFires = detectorFires;

silent.user.stsTokenManager.refreshToken = "CORRUPTED_REFRESH_TOKEN_T128_PROBE";
silent.user.stsTokenManager.expirationTime = Date.now() - 1000;
let silentCode = null;
try {
  await silent.user.getIdToken(true);
} catch (err) {
  silentCode = err?.code;
}
await new Promise((r) => setTimeout(r, 500));
log(
  `[3] getIdToken(true) → ${silentCode} / SDK 자동 signOut ${auth.currentUser === null ? "발생" : "없음(= §34.2 (C) 그대로)"}`,
);
const after = await call("listMyChallenges", {});
log(`[3] 콜러블 → ${after.code ?? "성공"} / 감지 발화 ${detectorFires}회 (기대 1)`);
const stateB = {
  signedOut: auth.currentUser === null,
  hadUser: true,
  unauthenticatedCallable: detectorFires > preFires,
  wasAnonymous: false,
};
log(`[3] /session/play 판정 = ${resolveAuthInvalidationMode({ ...stateB, pathname: "/session/play" })}`);
log(`[3] /report 판정 = ${resolveAuthInvalidationMode({ ...stateB, pathname: "/report" })}`);
log(`[3] 훈련 밖(/scenarios) 판정 = ${resolveAuthInvalidationMode({ ...stateB, pathname: "/scenarios" })} (기대 none)`);
const expBOk =
  detectorFires > preFires &&
  resolveAuthInvalidationMode({ ...stateB, pathname: "/session/play" }) === "banner-reauth";

// ── 정리 ────────────────────────────────────────────────────────────────────────────
log("");
log(`요약: 대조군(정상=0회) ${controlOk ? "PASS" : "FAIL"} / 실험군A(비활성) ${expAOk ? "PASS" : "FAIL"} / 실험군B(조용한 경로) ${expBOk ? "PASS" : "FAIL"}`);
log("⚠️ 미검증으로 남은 것: §34.4 U4(무효화 중 실시간 통화가 계속되는가) — §34.7 P-3 미실행.");
process.exit(controlOk && expAOk && expBOk ? 0 : 1);
