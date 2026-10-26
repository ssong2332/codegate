// 2026-10-27(사용자 지시) — 통화 화면 "모양만 있던" 버튼의 대략적인 기능(`callExtras.ts` 판정표).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CALL_EXTRA_COPY, captionLine, recordingElapsedSec } from "./callExtras.ts";

const play = readFileSync("src/app/session/play/page.tsx", "utf8");
const controls = readFileSync("src/components/OneUiCallControls.tsx", "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("[통화 부가 기능] 녹음 경과 · 자막 줄 — 순수 함수", () => {
  assert.equal(recordingElapsedSec(null, 5), null);
  assert.equal(recordingElapsedSec(10, 15), 5);
  assert.equal(recordingElapsedSec(9, 1), 0);
  assert.equal(captionLine(null), null);
  assert.equal(captionLine("   "), null);
  assert.equal(captionLine(" 고객님 "), "고객님");
});

test("[통화 부가 기능] 판정표 배선 — 자막은 사기범 대사(pillCaption)만 · 녹음은 표시만 · 영상통화는 토스트", () => {
  assert.match(play, /captionLine\(pillCaption\)/);
  // ⛔ G79/G93 — 참가자 말(사용자 턴)을 자막에 쓰지 않는다.
  assert.ok(!/captionLine\([^)]*user/i.test(play));
  assert.match(play, /onToggleRecording=\{\(\) => setRecordingStartedAt\(\(at\) => \(at === null \? elapsedSec : null\)\)\}/);
  assert.match(play, /onClick=\{\(\) => setCallToast\(CALL_EXTRA_COPY\.videoUnavailable\)\}/);
  // 통화 대기는 구현하지 않는다(토스트만) — 음소거 · 출력 음량 · 세션을 건드리지 않는다.
  assert.match(controls, /onClick=\{\(\) => toast\(COPY\.holdUnavailable\)\}/);
  assert.match(controls, /onClick=\{\(\) => toast\(COPY\.translateUnavailable\)\}/);
});

test("[통화 부가 기능] 개인정보 · 녹음 파일 · 외부 전송 0 — 새 표면에 저장소 · 네트워크 · 미디어 녹음 API 없음", () => {
  for (const [name, src] of [
    ["OneUiCallControls.tsx", strip(controls)],
    ["callExtras.ts", strip(readFileSync("src/lib/phone/callExtras.ts", "utf8"))],
  ] as const) {
    for (const api of ["localStorage", "sessionStorage", "indexedDB", "fetch(", "MediaRecorder", "getUserMedia", "sendBeacon", "httpsCallable"]) {
      assert.ok(!src.includes(api), `${name}에 ${api}`);
    }
  }
  assert.ok(!play.includes("MediaRecorder"), "play에 녹음 API");
});

test("[통화 부가 기능] 문구에 세션 표식 낱말 0(G437 · 세션 중 문면)", () => {
  const all = Object.values(CALL_EXTRA_COPY).join(" ");
  for (const word of ["모의", "훈련용", "가상", "재현"]) assert.ok(!all.includes(word), word);
});
