import { test } from "node:test";
import assert from "node:assert/strict";
import { transitionChannel, isSupportedChannelTransition } from "../channelTransition";

// MVP 계약 검증(Architecture.md §13.1, AC-039 "조용한 실패 금지") — 허용되지 않은 조합은 Firestore를
// 건드리기 전에 동기적으로 거부되므로 firebase-admin 초기화 없이도 이 가드를 단위 테스트할 수 있다.
// T40(fast-follow, 2026-07-24)이 voice→messenger를 허용으로 뒤집으면서, 방향 판정 자체를
// `isSupportedChannelTransition`(순수 함수, analyzeConversation.ts/purge.ts류와 동일한 관례)로
// 분리했다 — "이 방향이 지금 지원되는지"는 이걸로 직접 단위 테스트하고, "지원되는 방향을 실제로
// 호출했을 때 Firestore가 정확히 어떻게 바뀌는지"(channel 필드·channelHistory append)는 이 저장소의
// 다른 세션 콜러블(createSession/endSession)과 동일하게 에뮬레이터 실호출로 검증한다(node:test로는
// firebase-admin 앱을 띄우지 않는다는 기존 관례 — functions/src/session/__tests__에 다른
// firestore-touching 단위테스트가 없다, T40 done() 노트에 에뮬레이터 검증 근거 별도 기록).
test("isSupportedChannelTransition: messenger→voice(정방향, T30)는 지원한다", () => {
  assert.equal(isSupportedChannelTransition("messenger", "voice"), true);
});

test("isSupportedChannelTransition: voice→messenger(역방향, T40 fast-follow)는 지원한다", () => {
  assert.equal(isSupportedChannelTransition("voice", "messenger"), true);
});

test("isSupportedChannelTransition: 동일 채널(messenger→messenger)은 지원하지 않는다", () => {
  assert.equal(isSupportedChannelTransition("messenger", "messenger"), false);
});

test("isSupportedChannelTransition: 동일 채널(voice→voice)은 지원하지 않는다", () => {
  assert.equal(isSupportedChannelTransition("voice", "voice"), false);
});

test("transitionChannel: messenger→messenger(동일 채널)는 여전히 unimplemented로 명시 거부한다", async () => {
  await assert.rejects(
    () => transitionChannel("s1", "messenger", "messenger", "structured_signal"),
    (err: unknown) => {
      assert.match((err as Error).message, /지원하지 않는 채널 전이/);
      assert.equal((err as { code?: string }).code, "unimplemented");
      return true;
    },
  );
});
