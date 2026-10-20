// D-130 · §87 — UX-025 목소리 선택 화면의 self/send 경로 노출(DECISIONS #198 · PRD AC-046 갱신 고지 v1.29).
// ⓐ 판정(순수 함수) ⓑ 화면 배선(소스 스캔 — 화면은 이 러너에서 렌더할 수 없다): ①·② 렌더 · 녹음 트립 · 복귀 처리가
// 모두 같은 술어에 묶여 있는가.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shouldShowCloneVoiceOptions } from "./voiceSelectOptions.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE = fs.readFileSync(path.join(REPO_ROOT, "src/app/scenarios/messenger/voice-select/page.tsx"), "utf8");

test("[D-130] 진리표 — send만 ①·②를 보인다 · self · 힌트 부재는 숨긴다", () => {
  assert.equal(shouldShowCloneVoiceOptions("send"), true);
  assert.equal(shouldShowCloneVoiceOptions("self"), false);
  assert.equal(shouldShowCloneVoiceOptions(null), false);
});

test("[D-130] 화면 — 노출 술어는 getExperienceMode()로 정해진다", () => {
  assert.match(PAGE, /useState<boolean>\(\(\) => shouldShowCloneVoiceOptions\(getExperienceMode\(\)\)\)/);
});

test("[D-130] 화면 — ①'지금 30초 녹음' · ②'저장된 내 목소리 사용' 블록이 showCloneOptions 조건 안에 있다", () => {
  const recordLabel = PAGE.indexOf("지금 30초 녹음</span>");
  const storedLabel = PAGE.indexOf("저장된 내 목소리 사용</span>");
  const fallbackLabel = PAGE.indexOf("기본 남성·여성 목소리</span>");
  assert.ok(recordLabel > -1 && storedLabel > -1 && fallbackLabel > -1, "카드 라벨을 찾지 못했다");
  const recordGate = PAGE.lastIndexOf("{showCloneOptions && (", recordLabel);
  assert.ok(recordGate > -1, "① 카드가 showCloneOptions 조건 밖이다");
  // ① 조건 블록이 ① 라벨 앞에서 닫히지 않았는가(조건과 라벨 사이에 다른 JSX 닫힘 `)}` 없음).
  assert.ok(!PAGE.slice(recordGate, recordLabel).includes(")}"), "① 조건이 라벨 전에 닫혔다");
  assert.ok(
    PAGE.slice(Math.max(0, storedLabel - 2000), storedLabel).includes(
      "{showCloneOptions && storedVoices.length > 0 && (",
    ),
    "② 블록이 showCloneOptions 조건 밖이다",
  );
  // ③은 조건 없이 늘 보인다 — ③ 라벨 직전 블록에 showCloneOptions가 없어야 한다.
  const fallbackBlockStart = PAGE.lastIndexOf('<div className="flex flex-col gap-3 rounded-[8px]', fallbackLabel);
  assert.ok(fallbackBlockStart > storedLabel, "③ 블록 위치가 예상과 다르다");
  assert.ok(!PAGE.slice(fallbackBlockStart - 80, fallbackLabel).includes("showCloneOptions"), "③이 모드에 묶였다");
});

test("[D-130] 화면 — self에서는 녹음 트립을 만들지 않고 복귀 트립도 처리하지 않는다", () => {
  // 녹음 시작 핸들러의 첫 가드
  assert.match(PAGE, /const handleStartRecording = \(\) => \{[\s\S]{0,200}?if \(!showCloneOptions \|\| !scenarioId \|\| starting\) return;/);
  // setMessengerVoiceSelectReturn 호출은 handleStartRecording 안 1곳뿐
  const calls = PAGE.match(/setMessengerVoiceSelectReturn\(\)/g) ?? [];
  assert.equal(calls.length, 1);
  assert.ok(PAGE.indexOf("setMessengerVoiceSelectReturn()") > PAGE.indexOf("const handleStartRecording"));
  // 복귀 트립 처리(recorded로 createSession)는 showCloneOptions가 참일 때만
  assert.match(PAGE, /useState<boolean>\(\(\) => showCloneOptions && hasMessengerVoiceSelectReturn\(\)\)/);
  // 보관 목소리 조회도 self에서는 하지 않는다
  assert.match(PAGE, /if \(!user \|\| !showCloneOptions\) return;/);
});
