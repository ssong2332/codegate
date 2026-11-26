// 복제 목소리 합성 스트림(Architecture.md §143.6 · §143.10) — Live 출력 전사를 조각으로 잘라 GPT-SoVITS(Modal WSS)에 보내고 PCM을 받는다.
// 재생 · 반이중 · 끊기 대기는 GeminiVoiceSession의 기존 재생 큐가 맡는다(이 모듈은 받은 PCM을 넘기기만 한다).
//
// 자르기 판정표 C(§143.6):
// | 행 | 조건 | 자르는 곳 |
// | C1 | 이 턴 첫 조각 | 첫 `.?!` · (8자 이상이면) 첫 `,` · 25자 중 먼저 |
// | C2 | 다음 조각 | 첫 `.?!` · 60자 중 먼저 |
// | C3 | 턴 끝(`final`) | 남은 글 전부 |
// | C4 | 위 어디에도 안 닿음 | 자르지 않고 기다린다 |
export const CLONE_TTS_SAMPLE_RATE = 32000;
// 연결 대기 판정표 CW(§143.18 · 메인 결정 (b) "대기 150초+화면" — 콜드 스타트 실측 134초):
// | 행 | 조건 | 동작 |
// | CW1 | 복제 통화 · 합성 준비 전 | 화면 = 종전 "연결 중…"(status connecting) · 오프닝 · 마이크 전송 보류 |
// | CW2 | 상한 안에 준비 | 통화 연결(onActive) · 오프닝을 보낸다 |
// | CW3 | 상한(150초) 지남 | D5 — 통화를 끝내고 재시도 안내(기본 음성 · 텍스트로 넘어가지 않음) |
// | CW4 | 대기 중 참가자가 끊음 | 종전 끊기(언제든 — 연결 중 화면의 종료 버튼) |
// | CW5 | 준비 전 소켓 닫힘(기동 중 거절 등) | 상한 안이면 2초 뒤 다시 연결 · 상한 넘으면 CW3 |
// | CW6 | 복제 아닌 통화 | 종전 연결 상한 12초 |
export const CLONE_TTS_READY_TIMEOUT_MS = 150_000; // CW3
export const CLONE_TTS_RETRY_MS = 2_000; // CW5
/** 일반 통화의 "연결 중" 상한(종전 값 — CW6). */
export const CALL_CONNECT_TIMEOUT_MS = 12_000;
/** 화면 "연결 중" 상한 — 복제 통화는 합성 상한(CW3)보다 길게 둔다(그 전에 D5 안내가 먼저 나가게). */
export function connectTimeoutMs(cloneCall: boolean): number {
  return cloneCall ? CLONE_TTS_READY_TIMEOUT_MS + 15_000 : CALL_CONNECT_TIMEOUT_MS;
}

const END = /[.?!…。？！]/;

/** 버퍼에서 보낼 조각 하나를 떼어 낸다. null = 아직 보낼 것 없음. */
export function takeTtsChunk(buffer: string, firstOfTurn: boolean, final: boolean): { chunk: string; rest: string } | null {
  const text = buffer.replace(/^\s+/, "");
  if (!text) return null;
  const limit = firstOfTurn ? 25 : 60;
  let cut = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (END.test(ch)) {
      // 마침표 여럿(…, ?!)은 한 덩어리로
      while (i + 1 < text.length && END.test(text[i + 1])) i++;
      cut = i + 1;
      break;
    }
    if (firstOfTurn && ch === "," && i + 1 >= 8) {
      cut = i + 1;
      break;
    }
    if (i + 1 >= limit) {
      // 낱말 중간에서 자르지 않는다 — 마지막 공백까지
      const sp = text.lastIndexOf(" ", i);
      cut = sp > 0 ? sp : i + 1;
      break;
    }
  }
  if (cut < 0) return final ? { chunk: text.trim(), rest: "" } : null;
  const chunk = text.slice(0, cut).trim();
  return chunk ? { chunk, rest: text.slice(cut) } : null;
}

export type CloneTtsHandlers = {
  onPcm: (samples: Float32Array) => void;
  /** D5 — 연결 실패 · 끊김(재연결 1회 뒤). 통화를 끝내고 재시도를 안내한다. */
  onFatal: (why: string) => void;
  /** 대기 조각 0이 됐다(마지막 PCM 뒤). 끊기 대기 · 마이크 게이트가 다시 판정한다. */
  onIdle: () => void;
  /** 보내기 직전 글 가드(실존 기관명 등 — 클라 Live 가드). 빈 문자열이면 보내지 않는다. */
  guard: (text: string) => string;
};

type Sock = Pick<WebSocket, "send" | "close" | "readyState"> & {
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  binaryType: BinaryType;
};

export class CloneTtsStream {
  private sock: Sock | null = null;
  private ready = false;
  private buffer = "";
  private firstOfTurn = true;
  /** 턴이 끝났는데 아직 못 보낸 꼬리가 있다 — 앞 조각이 끝나면 문장부호 없이도 보낸다(C3). */
  private flushTail = false;
  private nextId = 1;
  /** 보냈지만 `done`이 안 온 조각 id. */
  private inFlight = new Set<number>();
  /** 지금 받아 들이는 id(취소 뒤 늦게 온 PCM은 버린다). */
  private acceptFrom = 1;
  private reconnects = 0;
  private closed = false;
  private readyWaiters: ((ok: boolean) => void)[] = [];
  /** CW5 — 준비 전 닫힘을 다시 연결해도 되는 마지막 시각(open이 정한다). */
  private openDeadline = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly url: string;
  private readonly token: string;
  private readonly handlers: CloneTtsHandlers;
  private readonly makeSocket: (url: string) => Sock;
  private readonly now: () => number;

  // 매개변수 속성은 쓰지 않는다 — 루트 시험이 Node 타입 지우기(--experimental-strip-types)로 돈다.
  constructor(url: string, token: string, handlers: CloneTtsHandlers, makeSocket?: (url: string) => Sock, now: () => number = Date.now) {
    this.url = url;
    this.token = token;
    this.handlers = handlers;
    this.makeSocket = makeSocket ?? ((u) => new WebSocket(u) as unknown as Sock);
    this.now = now;
  }

  /** 연결 · 인증 · 참조 준비까지. 상한 안에 못 끝내면 false(D5 · CW3). */
  open(timeoutMs = CLONE_TTS_READY_TIMEOUT_MS): Promise<boolean> {
    this.openDeadline = this.now() + timeoutMs;
    this.connect();
    return new Promise((resolve) => {
      if (this.ready) return resolve(true);
      const waiter = (ok: boolean) => {
        clearTimeout(t);
        resolve(ok);
      };
      // CW3 — 상한: 기다리던 연결을 접는다(늦게 준비돼도 쓰지 않는다 · 닫힘이 onFatal을 다시 부르지 않게 closed 먼저).
      const t = setTimeout(() => {
        this.readyWaiters = this.readyWaiters.filter((w) => w !== waiter);
        this.close();
        resolve(false);
      }, timeoutMs);
      this.readyWaiters.push(waiter);
    });
  }

  private connect() {
    const s = this.makeSocket(this.url);
    this.sock = s;
    s.binaryType = "arraybuffer";
    s.onopen = () => s.send(JSON.stringify({ type: "auth", token: this.token }));
    s.onmessage = (ev) => this.onMessage(ev.data);
    s.onclose = () => this.onClose();
    s.onerror = () => {};
  }

  private onMessage(data: unknown) {
    if (typeof data === "string") {
      const m = JSON.parse(data) as { type: string; id?: number };
      if (m.type === "ready") {
        this.ready = true;
        this.readyWaiters.splice(0).forEach((w) => w(true));
        this.pump(false);
      } else if (m.type === "done" || m.type === "rejected") {
        if (m.id !== undefined) this.inFlight.delete(m.id);
        this.pump(false);
        if (!this.busy()) this.handlers.onIdle();
      }
      return;
    }
    const buf = data as ArrayBuffer;
    if (buf.byteLength < 6) return;
    const id = new DataView(buf).getUint32(0, true);
    if (id < this.acceptFrom || !this.inFlight.has(id)) return;
    const pcm = new Int16Array(buf.slice(4));
    const out = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
    this.handlers.onPcm(out);
  }

  private onClose() {
    const wasReady = this.ready;
    this.ready = false;
    this.sock = null;
    if (this.closed) return;
    this.inFlight.clear();
    if (wasReady && this.reconnects < 1) {
      this.reconnects++; // UI5 — 통화 중 1회 재연결(같은 토큰)
      this.connect();
      return;
    }
    // CW5 — 아직 준비 전(콜드 기동 중 거절 등)이면 상한 안에서 다시 잇는다(상한은 open의 타이머가 맡는다).
    if (!wasReady && this.readyWaiters.length > 0 && this.now() + CLONE_TTS_RETRY_MS < this.openDeadline) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (!this.closed) this.connect();
      }, CLONE_TTS_RETRY_MS);
      return;
    }
    this.readyWaiters.splice(0).forEach((w) => w(false));
    this.closed = true;
    this.handlers.onFatal(wasReady ? "closed" : "connect");
  }

  /** Live 출력 전사 조각. */
  push(text: string) {
    this.buffer += text;
    this.pump(false);
  }

  /** Live 턴 끝 — 남은 글을 다 보낸다(C3). */
  endTurn() {
    this.flushTail = true;
    this.pump(false);
  }

  /** 끼어들기 · 사고 문장 차단 — 대기 · 진행 중 합성 전부 버린다. */
  cancel() {
    this.buffer = "";
    this.firstOfTurn = true;
    this.flushTail = false;
    this.acceptFrom = this.nextId;
    const had = this.inFlight.size > 0;
    this.inFlight.clear();
    if (this.sock && this.ready) this.sock.send(JSON.stringify({ type: "cancel" }));
    if (had) this.handlers.onIdle();
  }

  /** 합성 대기 · 진행 중 조각이 있는가(Live 턴이 끝나도 사기범이 아직 말하는 중). */
  busy(): boolean {
    return this.inFlight.size > 0 || this.buffer.trim() !== "";
  }

  close() {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.sock?.close();
    this.sock = null;
  }

  // C4 — 한 번에 한 조각만 보낸다(앞 조각 합성이 끝나면 다음).
  private pump(final: boolean) {
    if (!this.ready || !this.sock) return;
    while (this.inFlight.size === 0) {
      const t = takeTtsChunk(this.buffer, this.firstOfTurn, final || this.flushTail);
      if (!t) {
        if (this.flushTail && !this.buffer.trim()) {
          this.flushTail = false;
          this.firstOfTurn = true; // 다음 턴은 다시 C1
        }
        return;
      }
      this.buffer = t.rest;
      this.firstOfTurn = false;
      const text = this.handlers.guard(t.chunk);
      if (!text) continue;
      const id = this.nextId++;
      this.inFlight.add(id);
      this.sock.send(JSON.stringify({ type: "say", id, text }));
    }
  }
}
