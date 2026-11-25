// 2026-11-26 사용자 신고 — "지인에게 보내기"에서 녹음하면 본인 체험 통화로 넘어갔다(clone/wait가 send 모드를 몰랐다).
// ⓐ 판정표(순수 함수) ⓑ 화면 배선(소스 스캔 — 화면은 이 러너에서 렌더할 수 없다): send 분기가 세션 생성보다 앞이다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCloneReadyRoute } from "./cloneReadyRoute.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE = fs.readFileSync(path.join(REPO_ROOT, "src/app/clone/wait/page.tsx"), "utf8");

test("[재현] send + 시나리오 → 챌린지 만들기로 복귀(본인 세션 0)", () => {
  assert.deepEqual(resolveCloneReadyRoute({ messengerVoiceSelectReturn: false, experienceMode: "send", scenarioId: "family-accident-deepvoice" }), {
    kind: "challenge",
    href: "/challenge/create?scenarioId=family-accident-deepvoice",
  });
});

test("[판정표] 메신저 복귀 우선 · self/없음은 기존 흐름 · send인데 시나리오 없음은 기존 안내", () => {
  const r = (messengerVoiceSelectReturn: boolean, experienceMode: "self" | "send" | null, scenarioId: string | null) =>
    resolveCloneReadyRoute({ messengerVoiceSelectReturn, experienceMode, scenarioId }).kind;
  assert.equal(r(true, "send", "x"), "voice-select");
  assert.equal(r(true, "self", "x"), "voice-select");
  assert.equal(r(false, "self", "x"), "self-session");
  assert.equal(r(false, null, "x"), "self-session");
  assert.equal(r(false, "send", null), "self-session");
  assert.equal(
    resolveCloneReadyRoute({ messengerVoiceSelectReturn: false, experienceMode: "send", scenarioId: "a b&c" }).kind === "challenge" &&
      (resolveCloneReadyRoute({ messengerVoiceSelectReturn: false, experienceMode: "send", scenarioId: "a b&c" }) as { href: string }).href,
    "/challenge/create?scenarioId=a%20b%26c",
    "시나리오 id는 인코딩한다",
  );
});

test("[배선] clone/wait — 판정 결과 challenge면 세션 생성 전에 이동한다 · 체험 모드를 읽는다", () => {
  const routeAt = PAGE.indexOf("resolveCloneReadyRoute({");
  const challengeAt = PAGE.indexOf('route.kind === "challenge"');
  const createAt = PAGE.indexOf("await createSession(");
  assert.ok(routeAt > 0 && challengeAt > routeAt, "판정 → challenge 분기");
  assert.ok(createAt > challengeAt, "challenge 분기가 createSession보다 앞");
  assert.match(PAGE, /experienceMode: getExperienceMode\(\)/);
  // 역검증: 예전 배선(메신저만 검사)이 남아 있지 않다.
  assert.doesNotMatch(PAGE, /if \(hasMessengerVoiceSelectReturn\(\)\) \{/);
});
