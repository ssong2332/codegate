// 2026-11-17 저장소 감사 2 · 4 — 리포트가 통화 전사보다 먼저 굳음(표 R) · 세션 전사 총량 상한(표 C).
// [재현] 테스트는 옛 규칙(리포트 있으면 무조건 반환 · 세션 총량 검사 없음)을 같은 입력에 돌려 결함을 먼저 보인다.
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 CRLF→LF로 정규화해 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { decideReportRegeneration } from "../../report/reportRegeneration";
import {
  exceedsSessionTranscriptCap,
  prepareTranscriptTurns,
  SESSION_VOICE_MAX_CHARS,
  SESSION_VOICE_MAX_TURNS,
  TRANSCRIPT_MAX_TURNS,
} from "../transcriptRequest";

const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

// ── 감사 2 · 표 R ──
test("[감사 2 재현] 서버가 먼저 끝내 리포트(메시지 4개)를 만든 뒤 통화 전사 6줄이 늦게 쓰이면 — 옛 규칙은 그대로, 새 규칙은 다시 계산", () => {
  const oldRule = (reportExists: boolean) => (reportExists ? "keep" : "generate");
  assert.equal(oldRule(true), "keep", "옛 규칙: 늦게 쓰인 6줄이 리포트에 영영 안 들어간다");
  assert.equal(decideReportRegeneration({ storedCount: 4, currentCount: 10, rewindStarted: false }), "regenerate");
});

test("[감사 2] 판정표 R1 ~ R4", () => {
  assert.equal(decideReportRegeneration({ storedCount: undefined, currentCount: 10, rewindStarted: false }), "keep", "R1 옛 리포트 무백필");
  assert.equal(decideReportRegeneration({ storedCount: "4", currentCount: 10, rewindStarted: false }), "keep", "R1 깨진 값");
  assert.equal(decideReportRegeneration({ storedCount: 10, currentCount: 10, rewindStarted: false }), "keep", "R2 같음");
  assert.equal(decideReportRegeneration({ storedCount: 10, currentCount: 9, rewindStarted: false }), "keep", "R2 줄어듦");
  assert.equal(decideReportRegeneration({ storedCount: 4, currentCount: 10, rewindStarted: true }), "keep", "R3 되감기 시작 뒤");
  assert.equal(decideReportRegeneration({ storedCount: 4, currentCount: 5, rewindStarted: false }), "regenerate", "R4");
});

test("[감사 2 배선] 리포트 있음 = 표 R로 판정 · 읽은 messages 수 저장 · 생성 시각 유지 · 무조건 반환 0", () => {
  const core = read("report/generateReportCore.ts");
  assert.equal(/if \(existingReport\.exists\) \{\n\s*return \{ reportId: sessionId \};/.test(core), false, "옛 무조건 반환이 남아 있다");
  assert.match(core, /decideReportRegeneration\(\{/);
  assert.match(core, /currentCount: \(await sessionRef\.collection\("messages"\)\.count\(\)\.get\(\)\)\.data\(\)\.count/);
  assert.match(core, /rewindStarted: \(await reportRef\.collection\("limits"\)\.doc\("rewind"\)\.get\(\)\)\.exists/);
  assert.match(core, /sourceMessageCount: messagesSnap\.size,/);
  assert.match(core, /createdAt: existingReport\.exists \? \(existingReport\.get\("createdAt"\) as Timestamp\) : Timestamp\.now\(\),/);
  // 되감기 슬롯 문서 경로가 판정이 보는 경로와 같다.
  assert.match(read("rewind/attemptSlot.ts"), /reportRef\.collection\("limits"\)\.doc\("rewind"\)/);
});

// ── 감사 4 · 표 C ──
const voiceDocs = (n: number, text = "네") => Array.from({ length: n }, () => ({ channel: "voice", textMasked: text }));
const added = (n: number, text = "네 알겠습니다") => prepareTranscriptTurns(Array.from({ length: n }, () => ({ role: "user" as const, text })));

test("[감사 4 재현] 호출당 200턴씩 7번(1,400턴) — 옛 검사는 매번 통과, 새 상한은 1,200턴을 넘는 제출을 거절", () => {
  let stored: { channel: string; textMasked: string }[] = [];
  let rejectedAt = -1;
  for (let call = 0; call < 7; call += 1) {
    const turns = added(TRANSCRIPT_MAX_TURNS);
    assert.ok(turns.length <= TRANSCRIPT_MAX_TURNS, "옛 검사(호출당 200턴)는 매번 통과");
    if (rejectedAt < 0 && exceedsSessionTranscriptCap(stored, turns)) rejectedAt = call;
    stored = [...stored, ...turns.map((t) => ({ channel: "voice", textMasked: t.textMasked }))];
  }
  assert.equal(rejectedAt, 6, "1,200턴까지는 받고 그다음 제출을 거절");
});

test("[감사 4] 판정표 C — 턴 · 글자 경계 · voice만 센다(channel 부재 = voice)", () => {
  assert.equal(SESSION_VOICE_MAX_TURNS, 1200);
  assert.equal(SESSION_VOICE_MAX_CHARS, 60_000);
  assert.equal(exceedsSessionTranscriptCap(voiceDocs(1199), added(1)), false, "C2 1,200턴 = 허용");
  assert.equal(exceedsSessionTranscriptCap(voiceDocs(1200), added(1)), true, "C1 1,201턴");
  assert.equal(exceedsSessionTranscriptCap([{ textMasked: "네" }, ...voiceDocs(1199)], added(1)), true, "channel 부재도 voice로 센다");
  assert.equal(exceedsSessionTranscriptCap([{ channel: "messenger", textMasked: "네" }, ...voiceDocs(1199)], added(1)), false, "메신저 채널은 안 센다");
  const long = "가".repeat(2000);
  assert.equal(exceedsSessionTranscriptCap(voiceDocs(29, long), added(1, long)), false, "C2 60,000자 = 허용");
  assert.equal(exceedsSessionTranscriptCap(voiceDocs(29, long), added(1, long).concat(added(1, "나"))), true, "C1 60,000자 초과");
});

test("[감사 4 배선] 트랜잭션에서 저장 전에 상한을 보고 resource-exhausted로 거절(추가 read 0 — 이미 읽은 historySnap)", () => {
  const src = read("realtime/submitTranscript.ts");
  const check = src.indexOf("exceedsSessionTranscriptCap(historySnap.docs.map((doc) => doc.data() as MessageDoc), prepared)");
  assert.ok(check > 0, "상한 검사 배선이 없다");
  assert.ok(check < src.indexOf("tx.create(messagesRef.doc()"), "저장보다 앞");
  assert.ok(check < src.indexOf("tx.update(historySnap.docs[openingPos].ref"), "오프닝 표시보다 앞");
  assert.match(src.slice(check, check + 300), /throw new HttpsError\("resource-exhausted"/);
});
