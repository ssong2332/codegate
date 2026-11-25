// 2026-11-26 사용자 결정 — UX-002 녹음은 최대 1분 · 1분 안에서 상황을 최대한 다양하게 담은 대본.
// 판정표(대본 줄 cue): 평서 · 질문 · 다급 · 걱정 · 기쁨 · 부탁 · 놀람 · 화남 · 숫자 · 짧은 대답 · 차분한 다짐.
// 화면은 이 러너에서 렌더할 수 없어 소스를 읽어 대본 줄을 뽑는다(voiceSelectOptions.test.ts와 같은 방식).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE = fs.readFileSync(path.join(REPO_ROOT, "src/app/onboarding/record/page.tsx"), "utf8");
// 훅 파일은 react를 import해 이 러너에서 불러올 수 없다 — 상수 줄만 읽는다.
const RECORDER = fs.readFileSync(path.join(REPO_ROOT, "src/lib/recording/useVoiceRecorder.ts"), "utf8");
const constOf = (name: string) => Number(RECORDER.match(new RegExp(`export const ${name} = (\\d+);`))?.[1]);
const MAX_RECORDING_SECONDS = constOf("MAX_RECORDING_SECONDS");
const MIN_RECORDING_SECONDS = constOf("MIN_RECORDING_SECONDS");
const LINES = [...PAGE.matchAll(/\{ cue: "([^"]+)", text: "([^"]+)" \}/g)].map((m) => ({ cue: m[1], text: m[2] }));
const syllables = (s: string) => s.replace(/[^가-힣0-9]/g, "").length;

test("[UX-002 1분] 녹음 상한 60초 · 최소 길이는 상한보다 짧다", () => {
  assert.equal(MAX_RECORDING_SECONDS, 60);
  assert.ok(MIN_RECORDING_SECONDS < MAX_RECORDING_SECONDS);
});

test("[UX-002 1분] 대본 = 말투가 다른 11줄 · 질문 · 감탄 · 숫자가 모두 있다", () => {
  assert.equal(LINES.length, 11);
  assert.equal(new Set(LINES.map((l) => l.cue)).size, 11, "말투 안내(cue)가 줄마다 다르다");
  const all = LINES.map((l) => l.text).join(" ");
  assert.ok((all.match(/\?/g) ?? []).length >= 3, "끝 올림 질문문이 있다");
  assert.ok((all.match(/!/g) ?? []).length >= 3, "감탄 · 다급한 문장이 있다");
  assert.match(all, /공일공/, "숫자 낭독 줄이 있다");
});

test("[UX-002 1분] 느리게 읽어도 1분 안 — 초당 4음절 + 줄 사이 0.6초", () => {
  const total = LINES.reduce((sum, l) => sum + syllables(l.text), 0);
  const slowSec = total / 4 + LINES.length * 0.6;
  assert.ok(slowSec < MAX_RECORDING_SECONDS, `느린 낭독 추정 ${slowSec.toFixed(1)}초`);
  assert.ok(total / 5.16 >= 30, "보통 속도로 30초 이상 — 복제에 쓸 분량"); // 5.16 = 실측 낭독 속도(2026-11-24)
});

test("[UX-002 1분] ⛔ 본인 목소리로 돈 · 이체 · 계좌 · 인증 요구를 녹음시키지 않는다", () => {
  for (const l of LINES) {
    assert.doesNotMatch(l.text, /(송금|이체|입금|계좌|돈|비밀번호|인증번호|카드번호|보내 ?줘|보내 ?줄)/, l.text);
  }
});
