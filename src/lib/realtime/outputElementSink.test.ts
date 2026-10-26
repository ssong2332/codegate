// ⭐ §137(2026-10-26 실기 신고 · 안드로이드 Chrome 155 · 라이브 main 203578f) — 볼륨 키가 '통화' 음량을 바꾸지 않고 미디어 볼륨이 바꾼다.
// 가설(추정): `ctx.destination` 출력이 때로는 '미디어' 스트림으로 나간다 ⇒ `?outelement=1`일 때만 최종 노드를 숨긴 `<audio>`로 내보낸다
// (`callAudio.ts` 표 E1 ~ E4 · 기본 = 끔). 재생이 안 되면 즉시 `ctx.destination`으로 되돌린다(무음 결함 §57 재발 방지).
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 이 파일 안에서만 `\r\n`→`\n`으로 정규화해 읽는다(`callAudio.test.ts` 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OUTPUT_ELEMENT_PLAY_TIMEOUT_MS,
  connectOutputElementSink,
  pickOutputSink,
  readOutputElementFlag,
  type OutputElementLike,
  type OutputSink,
} from "./callAudio.ts";
import { resolveDebugFlags } from "./debugFlags.ts";
import { AUDIO_DIAG_KEYS, buildAudioDiagRows, noteOutputSink, readAudioDiag, resetAudioDiagForTest } from "./audioDiagnostics.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

type Fake = {
  sinks: OutputSink[];
  links: Set<string>;
  element: (OutputElementLike & { paused: boolean; removed: boolean; fireError: () => void }) | null;
  timers: Array<{ fn: () => void; ms: number; cleared: boolean }>;
  settlePlay: { resolve: () => void; reject: () => void } | null;
  release: () => void;
};

function setup(opts: { streamDest?: boolean; element?: boolean; playThrows?: boolean } = {}): Fake {
  const fake: Fake = { sinks: [], links: new Set(), element: null, timers: [], settlePlay: null, release: () => {} };
  const destination = { id: "destination" };
  const streamDest = {
    stream: { id: "stream" },
    connect() {},
    disconnect() {
      fake.links.add("streamDest-disconnected");
    },
  };
  const source = {
    connect(dest: never) {
      fake.links.add(dest === (destination as never) ? "destination" : "streamDest");
    },
    disconnect(dest?: never) {
      if (dest === (streamDest as never)) fake.links.delete("streamDest");
    },
  };
  let errorListener: (() => void) | null = null;
  const handle = connectOutputElementSink({
    source,
    context: {
      destination,
      createMediaStreamDestination: opts.streamDest === false ? undefined : () => streamDest,
    },
    createElement: () => {
      if (opts.element === false) return null;
      const el = {
        srcObject: null as unknown,
        paused: true,
        removed: false,
        play: () => {
          if (opts.playThrows) throw new Error("NotAllowedError");
          return new Promise<void>((resolve, reject) => {
            fake.settlePlay = { resolve, reject: () => reject(new Error("NotAllowedError")) };
          });
        },
        pause() {
          el.paused = true;
        },
        addEventListener(_type: "error", fn: () => void) {
          errorListener = fn;
        },
        remove() {
          el.removed = true;
        },
        fireError: () => errorListener?.(),
      };
      fake.element = el;
      return el;
    },
    onSink: (sink) => fake.sinks.push(sink),
    setTimer: (fn, ms) => {
      const t = { fn, ms, cleared: false };
      fake.timers.push(t);
      return t;
    },
    clearTimer: (h) => {
      (h as { cleared: boolean }).cleared = true;
    },
  });
  fake.release = handle.release;
  return fake;
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("[§139 플래그] 기본 켬 · `outelement=0`만 끈다 · 탭 안 유지(F3 · F4) · `=off`(F2) · `debugflags=off`(F1)는 기본(켬)으로", () => {
  assert.equal(readOutputElementFlag(""), true);
  assert.equal(readOutputElementFlag("?outelement=1"), true);
  assert.equal(readOutputElementFlag("?outelement=true"), true);
  assert.equal(readOutputElementFlag("?outelement=0"), false);
  const first = resolveDebugFlags("?outelement=0", null);
  assert.deepEqual(first.stored, { outelement: "0" });
  assert.equal(readOutputElementFlag(resolveDebugFlags("", JSON.stringify(first.stored)).effectiveSearch), false);
  const off = resolveDebugFlags("?outelement=off", JSON.stringify(first.stored));
  assert.deepEqual(off.stored, {});
  assert.equal(readOutputElementFlag(off.effectiveSearch), true);
  assert.equal(readOutputElementFlag(resolveDebugFlags("?debugflags=off", JSON.stringify(first.stored)).effectiveSearch), true);
});

test("[§137 E1 ~ E4] 판정 순수 함수", () => {
  assert.equal(pickOutputSink({ flagOn: false, created: true, play: "ok" }), "context"); // E1
  assert.equal(pickOutputSink({ flagOn: true, created: false, play: null }), "element-failed"); // E2
  assert.equal(pickOutputSink({ flagOn: true, created: true, play: "ok" }), "element"); // E3
  for (const play of ["rejected", "timeout", "error"] as const) {
    assert.equal(pickOutputSink({ flagOn: true, created: true, play }), "element-failed"); // E4
  }
});

test("[§137 E3] play() 성공 — 스트림 목적지에만 연결 · srcObject = 스트림 · 상한 타이머 해제", async () => {
  const f = setup();
  assert.deepEqual([...f.links], ["streamDest"]);
  assert.deepEqual(f.element?.srcObject, { id: "stream" });
  assert.equal(f.timers[0].ms, OUTPUT_ELEMENT_PLAY_TIMEOUT_MS);
  f.settlePlay?.resolve();
  await flush();
  assert.deepEqual(f.sinks, ["element"]);
  assert.equal(f.timers[0].cleared, true);
  assert.equal(f.links.has("destination"), false, "이중 출력 0");
});

test("[§137 E4] play() reject · 상한 초과 · 재생 중 error — 즉시 ctx.destination · 요소 정리", async () => {
  const rejected = setup();
  rejected.settlePlay?.reject();
  await flush();
  assert.deepEqual(rejected.sinks, ["element-failed"]);
  assert.deepEqual([...rejected.links].filter((l) => l !== "streamDest-disconnected"), ["destination"]);
  assert.equal(rejected.element?.srcObject, null);
  assert.equal(rejected.element?.removed, true);

  const timedOut = setup();
  timedOut.timers[0].fn();
  timedOut.settlePlay?.resolve(); // 늦게 온 성공은 무시한다
  await flush();
  assert.deepEqual(timedOut.sinks, ["element-failed"]);
  assert.equal(timedOut.links.has("destination"), true);
  assert.equal(timedOut.links.has("streamDest"), false);

  const thrown = setup({ playThrows: true });
  await flush();
  assert.deepEqual(thrown.sinks, ["element-failed"]);
  assert.equal(thrown.links.has("destination"), true);

  const lateError = setup();
  lateError.settlePlay?.resolve();
  await flush();
  lateError.element?.fireError();
  assert.deepEqual(lateError.sinks, ["element", "element-failed"]);
  assert.equal(lateError.links.has("destination"), true);
  assert.equal(lateError.links.has("streamDest"), false);
});

test("[§137 E2] 스트림 목적지 · 요소를 만들 수 없으면 ctx.destination", () => {
  const noDest = setup({ streamDest: false });
  assert.deepEqual(noDest.sinks, ["element-failed"]);
  assert.deepEqual([...noDest.links], ["destination"]);
  const noElement = setup({ element: false });
  assert.deepEqual(noElement.sinks, ["element-failed"]);
  assert.equal(noElement.links.has("destination"), true);
  assert.equal(noElement.links.has("streamDest"), false);
});

test("[§137 정리] release — 요소 정지 · srcObject 해제 · 제거 · 멱등 · 그 뒤 재생 결과로 되돌리지 않는다", async () => {
  const f = setup();
  f.release();
  f.release();
  assert.equal(f.element?.srcObject, null);
  assert.equal(f.element?.removed, true);
  assert.equal(f.element?.paused, true);
  assert.equal(f.timers[0].cleared, true);
  f.settlePlay?.reject();
  await flush();
  assert.deepEqual(f.sinks, [], "정리 뒤에는 판정 0");
  assert.equal(f.links.has("destination"), false, "정리 뒤 다시 연결 0");
});

test("[§137 진단] flag.outelement · out.sink 행", () => {
  resetAudioDiagForTest();
  const rows = (outputElement?: boolean) =>
    Object.fromEntries(
      buildAudioDiagRows({
        snapshot: readAudioDiag(),
        callMode: "live",
        status: "active",
        provider: "gemini",
        audioRoute: "call",
        credentialsPrefetched: true,
        acceptToCredentialsMs: 0,
        userActivation: null,
        browser: "Chrome 155 · Android",
        flags: { audioPrime: true, ringCloseImmediate: false, outputElement },
      }),
    );
  assert.equal(rows()["flag.outelement"], "-");
  assert.equal(rows(false)["flag.outelement"], "off");
  assert.equal(rows(true)["out.sink"], "-");
  noteOutputSink("element");
  assert.equal(rows(true)["flag.outelement"], "on");
  assert.equal(rows(true)["out.sink"], "element");
  const i = AUDIO_DIAG_KEYS.indexOf("flag.voicetrim");
  assert.deepEqual(AUDIO_DIAG_KEYS.slice(i, i + 3), ["flag.voicetrim", "flag.outelement", "flag.saved"]);
  const j = AUDIO_DIAG_KEYS.indexOf("out.trimDb");
  assert.deepEqual(AUDIO_DIAG_KEYS.slice(j, j + 2), ["out.trimDb", "out.sink"]);
});

test("[§137 배선] 꺼져 있으면 종전 직결 그대로 · 켜면 리미터(또는 폴백 게인)만 요소로 · 정리에서 release · 패널이 플래그를 읽는다", () => {
  const s = read("./GeminiVoiceSession.tsx");
  assert.ok(s.includes("const outputElementFlag = readOutputElementFlag(readDebugFlagSearch());"));
  assert.ok(s.includes("if (outputElementFlag) outputSink = connectFinalToElement(outputContext, limiter);\n          else limiter.connect(outputContext.destination);"));
  assert.ok(s.includes("if (outputElementFlag) outputSink = connectFinalToElement(outputContext, outputGain);\n          else outputGain.connect(outputContext.destination);"));
  assert.ok(s.includes('if (!outputElementFlag) noteOutputSink("context"); // §137 E1'));
  assert.equal(s.split("connectOutputElementSink(").length - 1, 1, "요소 연결은 한 곳뿐");
  const cleanup = s.indexOf("const cleanup = ");
  const release = s.indexOf("outputSink?.release(); // §137", cleanup);
  assert.ok(cleanup > 0 && release > cleanup, "통화 종료 · 끊기 · 재연결 정리에서 요소를 푼다");
  assert.ok(release < s.indexOf("void outputContext?.close().catch(() => {});", cleanup), "컨텍스트를 닫기 전에");
  const panel = read("../../components/AudioDebugPanel.tsx");
  assert.ok(panel.includes("outputElement: readOutputElementFlag(debugSearch),"));
});
