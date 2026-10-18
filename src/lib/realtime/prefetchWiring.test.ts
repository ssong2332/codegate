// 미리 받기 경합 수정(2026-10-18, 라이브 d13e718 회귀) — 배선 소스 단언. 판단 자체(②③)는
// `prefetchFreshness.test.ts`의 `createPrefetchSlot` 단위 테스트가 실제 실행으로 고정한다.
//
// ⚠️ CRLF 체크아웃(core.autocrlf=true)에서도 맞도록 소스는 **이 파일 안에서만** `\r\n`→`\n`으로 정규화해 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readLf = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const play = readLf("src/app/session/play/page.tsx");
const hook = readLf("src/lib/realtime/useRealtimeCall.ts");

/** `realtime.prefetch(`를 감싼 useEffect 본문(콜백 시작 ~ 의존성 배열 직전). */
function prefetchEffectBody(code: string): string {
  const call = code.indexOf("realtime.prefetch(sessionId);");
  if (call < 0) return "";
  const start = code.lastIndexOf("useEffect(() => {", call);
  const end = code.indexOf("}, [", call);
  return start >= 0 && end > call ? code.slice(start, end) : "";
}

/** ① 고지 화면에서 시작 + `incoming` 유지 · ④ 마이크·받기 소비 0. */
function prefetchEffectViolations(code: string): string[] {
  const out: string[] = [];
  if ((code.match(/realtime\.prefetch\(/g) ?? []).length !== 1) out.push("realtime.prefetch 호출이 정확히 1회가 아니다");
  const body = prefetchEffectBody(code);
  if (!body) return [...out, "미리 받기 effect를 찾지 못했다"];
  if (!body.includes('if (phase !== "pre-call-notice" && phase !== "incoming") return;')) {
    out.push("미리 받기가 pre-call-notice·incoming 두 단계에서 시작하지 않는다");
  }
  if (!body.includes('if (pageState !== "ready" || !sessionId) return;')) out.push("세션 로드 전에도 미리 받기를 건다");
  // ④ — "받기 전엔 아무 것도 새지 않는다": 마이크 · 받기 기록 · 연결 시작 · 오디오 · phase 전이 0.
  for (const forbidden of [
    "getUserMedia",
    "markSessionAnswered",
    "realtime.start",
    "setPhase",
    "setCallMode",
    "AudioContext",
    "primeCallAudio",
  ]) {
    if (body.includes(forbidden)) out.push(`미리 받기 effect가 ${forbidden}를 쓴다`);
  }
  return out;
}

test("①④ 미리 받기는 고지 화면(pre-call-notice)부터 시작하고(incoming 유지), 마이크·받기 소비를 하지 않는다", () => {
  assert.deepEqual(prefetchEffectViolations(play), []);
});

test("①④ 역검증 — incoming만 보는 옛 조건 사본 · 마이크를 여는 사본은 각각 실패한다(정상은 통과)", (t) => {
  const cond = '    if (phase !== "pre-call-notice" && phase !== "incoming") return;\n';
  assert.ok(play.includes(cond), "오염 지점(미리 받기 phase 조건)을 찾지 못했다 — 역검증이 공회전한다");
  const oldCond = prefetchEffectViolations(play.replace(cond, '    if (phase !== "incoming") return;\n'));
  const leak = prefetchEffectViolations(
    play.replace(cond, `${cond}    void navigator.mediaDevices.getUserMedia({ audio: true });\n`),
  );
  t.diagnostic(`[prefetch] 정상 0 / 옛 조건 ${JSON.stringify(oldCond)} / 마이크 ${JSON.stringify(leak)}`);
  assert.deepEqual(oldCond, ["미리 받기가 pre-call-notice·incoming 두 단계에서 시작하지 않는다"]);
  assert.deepEqual(leak, ["미리 받기 effect가 getUserMedia를 쓴다"]);
});

function between(code: string, start: string, end: string): string {
  const i = code.indexOf(start);
  const j = i >= 0 ? code.indexOf(end, i + start.length) : -1;
  return i >= 0 && j > i ? code.slice(i, j) : "";
}

/** ② 받기·폴백 보관 모두 슬롯에서 먼저 꺼내고(진행 중이면 기다린다), 없을 때만 새로 발급한다. */
function hookViolations(code: string): string[] {
  const out: string[] = [];
  const start = between(code, "const start = useCallback(async (sessionId: string) => {", "const stop = useCallback");
  const retain = between(code, "const retainFallbackCredentials = useCallback(", "const start = useCallback");
  for (const [name, body] of [
    ["start", start],
    ["retainFallbackCredentials", retain],
  ] as const) {
    if (!body) {
      out.push(`${name}를 찾지 못했다`);
      continue;
    }
    const take = body.indexOf("await getPrefetchSlot().take(sessionId)");
    const mint = body.indexOf("createRealtimeCall({ sessionId })");
    if (take < 0) out.push(`${name}가 슬롯에서 꺼내지 않는다(진행 중 요청을 못 본다)`);
    if (mint < 0 || (take >= 0 && mint < take)) out.push(`${name}가 슬롯보다 먼저 새로 발급한다`);
    if ((body.match(/createRealtimeCall\(/g) ?? []).length !== 1) out.push(`${name}의 발급 지점이 1곳이 아니다`);
  }
  if (!start.includes("if (taken.issued) {")) out.push("start가 꺼낸 결과가 있을 때 새 발급을 건너뛰지 않는다");
  // 미리 받기는 슬롯으로만 건다(직접 발급 0).
  const prefetch = between(code, "const prefetch = useCallback(", "const retainFallbackCredentials");
  if (!prefetch.includes("getPrefetchSlot().prefetch(sessionId)")) out.push("prefetch가 슬롯을 거치지 않는다");
  if (prefetch.includes("createRealtimeCall(")) out.push("prefetch가 슬롯 밖에서 직접 발급한다");
  // 계측 — 재사용(진행 중 대기 포함)이면 true.
  if (!start.includes("markCredentialsPrefetched(taken.issued !== null, taken.source);")) {
    out.push("계측이 재사용 여부·출처를 기록하지 않는다");
  }
  return out;
}

test("② 받기(start)·폴백 보관은 진행 중 미리 받기를 기다려 쓰고, 없을 때만 새로 발급한다", () => {
  assert.deepEqual(hookViolations(hook), []);
});

test("② 역검증 — 슬롯을 건너뛰고 바로 발급하는 옛 start 사본은 실패한다", (t) => {
  const anchor = "    const taken = await getPrefetchSlot().take(sessionId);\n    noteCredentialSource(taken.source);";
  assert.ok(hook.includes(anchor), "오염 지점(start의 슬롯 꺼내기)을 찾지 못했다 — 역검증이 공회전한다");
  const poisoned = hookViolations(
    hook.replace(anchor, '    const taken = { issued: null, source: "mint" as const };\n    noteCredentialSource(taken.source);'),
  );
  t.diagnostic(`[start] 정상 0 / 슬롯 건너뜀 ${JSON.stringify(poisoned)}`);
  assert.deepEqual(poisoned, ["start가 슬롯에서 꺼내지 않는다(진행 중 요청을 못 본다)"]);
});
