// §66.3 — createSession 롤링 윈도우 판정(순수 함수). ⛔ 서버 SDK·런타임 패키지(Admin/Functions)
// import 금지 — 호출부(session/index.ts)가 Firestore에서 읽은 값을 넘긴다(emptyPromiseMetric.ts와
// 동일 관례).
//
// ⛔ 이 게이트는 쿼터 보호가 아니라 폭주 백스톱이다(G180 승계, §66.0 3) — 한 사람의 초 단위 폭주
// (연타·다중 탭·클라 루프)만 막는다.
import { CREATE_SESSION_WINDOW_MAX, CREATE_SESSION_WINDOW_MS } from "../shared/constants";

/**
 * 최근 10분 내 세션 생성이 6회 이상이면 true(=거부). 호출부는 `sessions.where("uid","==",uid)
 * .orderBy("createdAt","desc").limit(CREATE_SESSION_WINDOW_MAX + 1)` 결과의 createdAt(ms) 배열을
 * 순서 무관으로 넘긴다.
 */
export function isCreateSessionRateLimited(input: {
  /** 이 uid의 최근 세션 문서 createdAt(ms). 순서 무관. 호출부가 Firestore에서 읽어 넘긴다. */
  recentCreatedAtMs: readonly number[];
  nowMs: number;
}): boolean {
  const cutoff = input.nowMs - CREATE_SESSION_WINDOW_MS;
  const inWindow = input.recentCreatedAtMs.filter((t) => t > cutoff).length;
  return inWindow >= CREATE_SESSION_WINDOW_MAX;
}
