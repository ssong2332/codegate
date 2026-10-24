// §128(6)(2026-10-24 메인 세션 라이브 실측 · UX D-159) — 대화방에서 보낸 사진의 화면 메모리 보관소.
// 재현: 사진을 보낸 뒤 보이스톡으로 통화 화면에 갔다가 '채팅으로'(통화 겹침)로 대화방을 다시 열면 보낸 사진 말풍선이 회색 '사진' 자리표시로 바뀌었다.
// 원인: objectURL을 대화방 컴포넌트 상태에만 두고 언마운트 때 revoke했다 — 대화방 라우트 → 통화 화면 → 겹친 대화방은 서로 다른 컴포넌트 인스턴스다.
//
// 판정표:
// | 상황 | 사진 |
// |---|---|
// | 같은 세션에서 대화방을 떠났다 돌아옴(통화 전환 · 통화 겹침 · 클라 이동) | 그대로 보인다 — 이 모듈 메모리에 세션 id로 남는다 |
// | 다른 세션을 연다 · 훈련 종료 화면(`releaseSessionPhotos`) | 앞 세션 URL을 전부 revoke |
// | 새로고침 · 탭 닫기 | 메모리가 사라진다 → 빈 사진 칸(§113.2 종전) |
// ⛔ 서버 · Storage · Firestore · localStorage 0(§113 결정 — 이미지는 기기 메모리에만). 서버에는 "사진을 보냈다"는 사실만 간다.
// ⚠️ 잎 모듈(import 0) — 루트 테스트 러너가 직접 단위 테스트한다.

export type PendingPhoto = { url: string; minTurnIndex: number };

export type SessionPhotoStore = {
  sessionId: string;
  /** 서버 사진 턴 문서(turnIndex)에 붙은 URL. */
  byTurn: Record<number, string>;
  /** 보냈지만 아직 서버 문서에 붙지 않은 URL(보낸 순서). */
  queue: PendingPhoto[];
  /** 이 세션에서 만든 모든 URL(정리용). */
  all: string[];
};

let current: SessionPhotoStore | null = null;

function revokeAll(store: SessionPhotoStore, revoke: (url: string) => void) {
  for (const url of store.all) revoke(url);
}

const defaultRevoke = (url: string) => {
  try {
    URL.revokeObjectURL(url);
  } catch {
    // 이미 정리된 URL — 무시.
  }
};

/** 이 세션의 보관소(없으면 만든다 · 다른 세션 것이 있으면 그 URL을 정리하고 바꾼다). */
export function sessionPhotoStore(sessionId: string, revoke: (url: string) => void = defaultRevoke): SessionPhotoStore {
  if (current && current.sessionId === sessionId) return current;
  if (current) revokeAll(current, revoke);
  current = { sessionId, byTurn: {}, queue: [], all: [] };
  return current;
}

/** 훈련이 끝났을 때 — 보관한 URL을 전부 정리한다(세션 id를 주면 그 세션일 때만). */
export function releaseSessionPhotos(sessionId?: string, revoke: (url: string) => void = defaultRevoke): void {
  if (!current) return;
  if (sessionId !== undefined && current.sessionId !== sessionId) return;
  revokeAll(current, revoke);
  current = null;
}

/** 새 서버 문서 목록에서 아직 URL이 없는 사진 턴에 대기열의 URL을 보낸 순서대로 붙인다(붙인 게 있으면 `true`). */
export function attachQueuedPhotos(store: SessionPhotoStore, photoTurnIndexes: readonly number[]): boolean {
  let changed = false;
  for (const turnIndex of photoTurnIndexes) {
    if (store.byTurn[turnIndex]) continue;
    const at = store.queue.findIndex((entry) => turnIndex >= entry.minTurnIndex);
    if (at < 0) continue;
    const [entry] = store.queue.splice(at, 1);
    store.byTurn[turnIndex] = entry.url;
    changed = true;
  }
  return changed;
}
