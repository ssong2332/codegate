// createRealtimeCall 처리 시간 분해 (2026-10-21, 받기→첫소리 10.2초 조사).
//
// 받기 시점에 미리 받기가 아직 진행 중이거나(`inflight`) 새로 발급하면(`mint`) 이 콜러블의 처리 시간이 그대로 첫소리
// 지연에 더해진다. 어느 구간(콜드 스타트 · Firestore 읽기 · 토큰 발급)이 긴지 라이브 로그로 가르기 위한 1줄 계측이다.
// ⚠️ 숫자 · 종류만 싣는다 — sessionId · uid · 토큰 · 프롬프트는 이 레코드에 들어가지 않는다(테스트로 고정).

export const REALTIME_SETUP_LOG_MESSAGE = "[realtime-setup] createRealtimeCall";

export type RealtimeSetupTiming = {
  /** 이 인스턴스의 첫 호출인가(콜드 스타트 근사 — 인스턴스 기동 뒤 첫 요청). */
  coldStart: boolean;
  /** 요청 진입 → 세션 · 챌린지 문서 읽기 완료. */
  firestoreMs: number | null;
  /** 프롬프트 조립 + 토큰 발급(`provider.createCallCredentials`). */
  credentialsMs: number | null;
  totalMs: number;
  provider: string;
  isMock: boolean;
};

let servedOnThisInstance = 0;

/** 인스턴스 첫 호출이면 true(모듈 상태 — 인스턴스가 살아 있는 동안 1회). */
export function takeColdStartFlag(): boolean {
  servedOnThisInstance += 1;
  return servedOnThisInstance === 1;
}

/** 구간 표시를 모아 레코드로 만든다. `now`는 주입한다(테스트). */
export function startSetupTiming(now: () => number, coldStart: boolean) {
  const begin = now();
  const marks: { firestore?: number; credentials?: number } = {};
  return {
    mark(name: "firestore" | "credentials") {
      if (marks[name] === undefined) marks[name] = now();
    },
    finish(result: { provider: string; isMock: boolean }): RealtimeSetupTiming {
      const end = now();
      const firestoreAt = marks.firestore;
      return {
        coldStart,
        firestoreMs: firestoreAt === undefined ? null : Math.round(firestoreAt - begin),
        credentialsMs:
          marks.credentials === undefined || firestoreAt === undefined ? null : Math.round(marks.credentials - firestoreAt),
        totalMs: Math.round(end - begin),
        provider: result.provider,
        isMock: result.isMock,
      };
    },
  };
}
