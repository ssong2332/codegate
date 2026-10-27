// 2026-10-27(실기 신고 — 첫 발화까지 17초) — Live 연결을 통화 출력 준비(마이크 대기 → 출력 컨텍스트)와 병렬로 돌리면서,
// 출력이 준비되기 전에 온 서버 메시지를 버리지 않고 받은 순서대로 쌓아 두는 문(`GeminiVoiceSession`이 쓴다).
//
// | # | If | Then |
// |---|---|---|
// | G1 | 문이 닫혀 있다(출력 준비 전) | 메시지를 받은 순서대로 쌓는다 — 처리하지 않는다 |
// | G2 | `open()` | 쌓인 것을 받은 순서대로 **같은 동기 구간에서** 모두 처리한 뒤 연다(그 사이 새 메시지가 끼어들 틈이 없다) |
// | G3 | 문이 열려 있다 | 바로 처리한다 |
// | G4 | `open()`을 다시 부른다 | 아무것도 하지 않는다(멱등) |

export type EarlyMessageGate<T> = {
  push: (message: T) => void;
  open: () => void;
  readonly isOpen: boolean;
  readonly pending: number;
};

export function createEarlyMessageGate<T>(handle: (message: T) => void): EarlyMessageGate<T> {
  const queued: T[] = [];
  let opened = false;
  let draining = false;
  return {
    push(message: T) {
      if (opened) handle(message); // G3
      else queued.push(message); // G1
    },
    open() {
      if (opened || draining) return; // G4
      // G2 — 다 비울 때까지 닫힌 채로 둔다: 처리 도중 들어온 메시지도 줄 뒤에 붙어 순서가 뒤바뀌지 않는다.
      draining = true;
      while (queued.length > 0) handle(queued.shift() as T);
      opened = true;
      draining = false;
    },
    get isOpen() {
      return opened;
    },
    get pending() {
      return queued.length;
    },
  };
}
