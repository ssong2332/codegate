// 감지 지점 ③(콜러블 `functions/unauthenticated`)과 배너 사이의 **유일한** 연결선 (T128, §34.3 ③).
//
// ⛔ **상태를 영속화하지 않는다**(G158) — `sessionStorage`·`localStorage`·전역 스토어 0건. 여기 있는
//    것은 (1) 구독자 집합과 (2) "지금 배너가 떠 있는가" **불리언 하나**뿐이고, 둘 다 메모리에만 살아
//    새로고침하면 사라진다. 영속화하면 재인증 후에도 남는 유령 배너가 생긴다.
// ⛔ **타이머·폴링 0건**(G157). 이 모듈은 스스로 아무것도 하지 않고, 콜러블이 실패할 때만 깨어난다.

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * 배너가 떠 있는 동안 새 콜러블을 시작하지 못하게 하는 잠금(§34.4 U1).
 * ⭐ 이것이 **AC-007(세션당 정확히 1리포트)** 불변식을 지키는 방법이다 — 배너 상태에서
 *    `createSession`·`endSession`·`generateReport`가 새로 시작될 수 있는 경로가 아예 닫힌다.
 *    동시에 **AC-027**과도 부딪히지 않는다(다음 단계로 진행하는 길이 전부 막히고, 유지되는 것은
 *    이미 그 참가자에게 열려 있던 화면 하나뿐 — §34.4 U2).
 */
let callablesBlocked = false;

/** 콜러블 단일 래퍼(`src/lib/api/callable.ts`)만 호출한다. */
export function notifyUnauthenticatedCallable(): void {
  for (const listener of listeners) listener();
}

export function subscribeUnauthenticatedCallable(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 배너 훅만 호출한다(배너 상태의 단일 소유자). */
export function setCallablesBlocked(blocked: boolean): void {
  callablesBlocked = blocked;
}

export function areCallablesBlocked(): boolean {
  return callablesBlocked;
}

/** 테스트 전용 초기화 — 모듈 상태가 케이스 간에 새지 않게 한다. */
export function resetUnauthenticatedSignalForTest(): void {
  listeners.clear();
  callablesBlocked = false;
}
