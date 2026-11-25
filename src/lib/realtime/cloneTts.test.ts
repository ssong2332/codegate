// §143 — 복제 합성 스트림: 자르기 판정표 C · 한 번에 한 조각 · 취소 뒤 늦은 PCM 버림 · 재연결 1회 뒤 실패(D5) · 문구 · 대본 대조.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CloneTtsStream, takeTtsChunk } from "./cloneTts.ts";
import { CLONE_CALL_FAILED_MESSAGE, isCloneCallFailedError } from "./cloneCallFailed.ts";

test("[§143 판정표 C] 첫 조각 · 다음 조각 · 턴 끝 · 기다림", () => {
  assert.deepEqual(takeTtsChunk("엄마, 나 지금 급해. 빨리", true, false), { chunk: "엄마, 나 지금 급해.", rest: " 빨리" }); // 쉼표가 8자 전 → 마침표
  assert.deepEqual(takeTtsChunk("어머니 저 지금 경찰서에요, 사고가 나서", true, false)?.chunk, "어머니 저 지금 경찰서에요,"); // C1 8자 이상 쉼표
  assert.equal(takeTtsChunk("어머니 저 지금", true, false), null); // C4
  assert.deepEqual(takeTtsChunk("어머니 저 지금", true, true), { chunk: "어머니 저 지금", rest: "" }); // C3
  const long = "가나다 라마바 사아자 차카타 파하가 나다라 마바사";
  assert.equal(takeTtsChunk(long, true, false)?.chunk, "가나다 라마바 사아자 차카타 파하가 나다라"); // C1 25자째(마)에서 · 낱말 경계로 물림
  assert.equal(takeTtsChunk("정말이요?! 그러면", false, false)?.chunk, "정말이요?!"); // 부호 여럿은 한 덩어리
  assert.equal(takeTtsChunk("   ", false, true), null);
});

class FakeSock {
  static all: FakeSock[] = [];
  sent: string[] = [];
  readyState = 1;
  binaryType: BinaryType = "blob";
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  constructor() {
    FakeSock.all.push(this);
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.onclose?.({} as CloseEvent);
  }
  msg(o: unknown) {
    this.onmessage?.({ data: JSON.stringify(o) } as MessageEvent);
  }
  pcm(id: number, samples: number[]) {
    const buf = new ArrayBuffer(4 + samples.length * 2);
    new DataView(buf).setUint32(0, id, true);
    samples.forEach((v, i) => new DataView(buf).setInt16(4 + i * 2, v, true));
    this.onmessage?.({ data: buf } as MessageEvent);
  }
  says() {
    return this.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "say");
  }
}

function make() {
  FakeSock.all = [];
  const got: number[][] = [];
  const events: string[] = [];
  const s = new CloneTtsStream("wss://x/ws", "TOKEN", {
    onPcm: (f) => got.push([...f].map((v) => Math.round(v * 32768))),
    onFatal: (why) => events.push(`fatal:${why}`),
    onIdle: () => events.push("idle"),
    guard: (t) => t.replace("국민은행", "OO은행"),
  }, () => new FakeSock() as never);
  return { s, got, events };
}

test("[§143 CloneTtsStream] 인증 → ready → 한 번에 한 조각 · 가드 적용 · done 뒤 다음 · 끝나면 idle", async () => {
  const { s, got, events } = make();
  const opened = s.open(1000);
  const sock = FakeSock.all[0];
  sock.onopen?.({} as Event);
  assert.deepEqual(JSON.parse(sock.sent[0]), { type: "auth", token: "TOKEN" });
  sock.msg({ type: "ready", sr: 32000 });
  assert.equal(await opened, true);
  s.push("국민은행입니다. 고객님 맞으시죠? 확인");
  assert.deepEqual(sock.says().map((m) => m.text), ["OO은행입니다."]);
  sock.pcm(1, [100, -100]);
  assert.deepEqual(got, [[100, -100]]);
  sock.msg({ type: "done", id: 1 });
  assert.deepEqual(sock.says().map((m) => m.text), ["OO은행입니다.", "고객님 맞으시죠?"]);
  s.endTurn();
  sock.msg({ type: "done", id: 2 });
  assert.deepEqual(sock.says().map((m) => m.text).at(-1), "확인"); // C3 — 부호 없는 꼬리
  assert.equal(s.busy(), true);
  sock.msg({ type: "done", id: 3 });
  assert.equal(s.busy(), false);
  assert.equal(events.at(-1), "idle");
});

test("[§143 UI4] 취소 = cancel 전송 · 늦게 온 PCM 버림 · idle", async () => {
  const { s, got, events } = make();
  const opened = s.open(1000);
  const sock = FakeSock.all[0];
  sock.msg({ type: "ready", sr: 32000 });
  await opened;
  s.push("여보세요? ");
  s.cancel();
  assert.equal(JSON.parse(sock.sent.at(-1)!).type, "cancel");
  sock.pcm(1, [5]);
  assert.deepEqual(got, []);
  assert.deepEqual(events, ["idle"]);
});

test("[§143 UI5 · D5] 통화 중 끊김 = 1회 재연결, 두 번째 끊김 = 실패 · 시작 상한 초과 = false", async () => {
  const { s, events } = make();
  const opened = s.open(1000);
  FakeSock.all[0].msg({ type: "ready", sr: 32000 });
  await opened;
  FakeSock.all[0].close();
  assert.equal(FakeSock.all.length, 2);
  assert.deepEqual(events, []);
  FakeSock.all[1].msg({ type: "ready", sr: 32000 });
  FakeSock.all[1].close();
  assert.deepEqual(events, ["fatal:closed"]);

  const t = make();
  assert.equal(await t.s.open(10), false);
});

test("[§143 D5] 실패 문구 = 서버 문구 · 판별은 failed-precondition + 문구", () => {
  const server = readFileSync(new URL("../../../functions/src/realtime/index.ts", import.meta.url), "utf8");
  assert.ok(server.includes(`CLONE_CALL_FAILED_MESSAGE = "${CLONE_CALL_FAILED_MESSAGE}"`));
  assert.equal(isCloneCallFailedError({ code: "functions/failed-precondition", message: CLONE_CALL_FAILED_MESSAGE }), true);
  assert.equal(isCloneCallFailedError({ code: "functions/failed-precondition", message: "다른 오류" }), false);
  assert.equal(isCloneCallFailedError(null), false);
});

test("[§143.3] 합성 서비스의 대본 = 녹음 화면 대본(줄 순서 · 글 같음)", () => {
  const page = readFileSync(new URL("../../app/onboarding/record/page.tsx", import.meta.url), "utf8");
  const svc = readFileSync(new URL("../../../services/gsv/app.py", import.meta.url), "utf8");
  const pageLines = [...page.matchAll(/\{ cue: "([^"]+)", text: "([^"]+)" \}/g)].map((m) => `${m[1]}|${m[2]}`);
  const svcLines = [...svc.matchAll(/\("([^"]+)", "([^"]+)"\),/g)].map((m) => `${m[1]}|${m[2]}`);
  assert.equal(pageLines.length, 11);
  assert.deepEqual(svcLines, pageLines);
});
