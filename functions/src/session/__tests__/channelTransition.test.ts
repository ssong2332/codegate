import { test } from "node:test";
import assert from "node:assert/strict";
import { transitionChannel } from "../channelTransition";

// MVP 계약 검증(Architecture.md §13.1, AC-039 "조용한 실패 금지") — 허용되지 않은 조합은 Firestore를
// 건드리기 전에 동기적으로 거부되므로 firebase-admin 초기화 없이도 이 가드를 단위 테스트할 수 있다.
// `messenger→voice` 성공 경로(Firestore write)는 이 저장소의 다른 세션 콜러블(createSession/
// endSession)과 동일하게 에뮬레이터 실호출로 검증한다(node:test로는 firebase-admin 앱을 띄우지
// 않는다는 기존 관례 — functions/src/session/__tests__에 다른 firestore-touching 단위테스트가 없다).
test("transitionChannel: voice→messenger(역방향)는 unimplemented로 명시 거부한다", async () => {
  await assert.rejects(
    () => transitionChannel("s1", "voice", "messenger", "manual_button"),
    (err: unknown) => {
      assert.match((err as Error).message, /지원하지 않는 채널 전이/);
      assert.equal((err as { code?: string }).code, "unimplemented");
      return true;
    },
  );
});

test("transitionChannel: messenger→messenger(동일 채널)도 명시 거부한다", async () => {
  await assert.rejects(
    () => transitionChannel("s1", "messenger", "messenger", "structured_signal"),
    /지원하지 않는 채널 전이/,
  );
});
