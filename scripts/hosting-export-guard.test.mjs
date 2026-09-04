// scripts/hosting-export-guard.mjs 회귀 테스트 — 2026-09-04 배포 라우팅 결함의 재발 방지선.
//
// 이 파일이 지키는 것은 셋이다.
//  1. ⭐ **현재 저장소의 실제 firebase.json + next.config.ts 조합이 통과한다**(문제 0건).
//  2. 결함 형태(= 결함 당시의 firebase.json)를 실제로 잡는다.
//  3. next.config.ts 쪽 전제가 바뀌면(export 해제 · trailingSlash:true) 조용히 넘어가지 않는다.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateHostingExportConfig, readNextExportSettings } from "./hosting-export-guard.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "firebase.json"), "utf8"));
const nextConfigSource = fs.readFileSync(path.join(REPO_ROOT, "next.config.ts"), "utf8");

test("⭐ 현행 저장소 설정은 문제 0건이다", () => {
  const problems = evaluateHostingExportConfig({ firebaseConfig, nextConfigSource });
  assert.deepEqual(
    problems.map((p) => p.id),
    [],
    `현행 설정이 걸렸다: ${problems.map((p) => p.message).join(" | ")}`,
  );
});

test("전제 판독 — 현행 next.config.ts는 정적 export이고 trailingSlash를 켜지 않는다", () => {
  assert.deepEqual(readNextExportSettings(nextConfigSource), {
    staticExport: true,
    trailingSlash: false,
  });
});

test("역검증 — 결함 당시의 firebase.json(=cleanUrls 없음)을 실제로 잡는다", () => {
  // 2026-09-04 이전의 실제 hosting 블록 그대로.
  const brokenConfig = {
    hosting: {
      public: "out",
      ignore: ["firebase.json", "**/.*", "**/node_modules/**"],
      rewrites: [{ source: "**", destination: "/404.html" }],
    },
  };
  const problems = evaluateHostingExportConfig({
    firebaseConfig: brokenConfig,
    nextConfigSource,
  });
  assert.deepEqual(problems.map((p) => p.id), [
    "hosting-missing-clean-urls",
    "hosting-missing-trailing-slash-false",
  ]);
});

test("역검증 — cleanUrls만 있고 trailingSlash:false가 없으면 슬래시 경로 결함을 잡는다", () => {
  // 실측: 이 조합에서 `/scenarios/`는 404.html이 나온다(`/scenarios`는 정상).
  const partialConfig = { hosting: { public: "out", cleanUrls: true } };
  const problems = evaluateHostingExportConfig({
    firebaseConfig: partialConfig,
    nextConfigSource,
  });
  assert.deepEqual(problems.map((p) => p.id), ["hosting-missing-trailing-slash-false"]);
});

test("역검증 — next.config.ts 전제가 바뀌면 hosting 규칙을 그대로 적용하지 않고 재실측을 요구한다", () => {
  const withoutExport = evaluateHostingExportConfig({
    firebaseConfig,
    nextConfigSource: 'const c = { images: { unoptimized: true } };',
  });
  assert.deepEqual(withoutExport.map((p) => p.id), ["next-output-not-export"]);

  const withTrailingSlash = evaluateHostingExportConfig({
    firebaseConfig,
    nextConfigSource: 'const c = { output: "export", trailingSlash: true };',
  });
  assert.deepEqual(withTrailingSlash.map((p) => p.id), ["next-trailing-slash-unreviewed"]);
});

test("⭐ 과차단 0건 — 주석에 적힌 문구를 설정으로 오독하지 않는다", () => {
  // next.config.ts는 주석이 길다. 주석 안의 `trailingSlash: true` 같은 서술이 판독을 오염시키면 안 된다.
  const commentedSource = [
    "// trailingSlash: true 로 바꾸면 산출물 형태가 달라진다(설명용 주석일 뿐이다).",
    "// output: \"standalone\" 도 후보였다.",
    'const nextConfig = { output: "export", images: { unoptimized: true } };',
  ].join("\n");
  assert.deepEqual(readNextExportSettings(commentedSource), {
    staticExport: true,
    trailingSlash: false,
  });
  assert.deepEqual(
    evaluateHostingExportConfig({ firebaseConfig, nextConfigSource: commentedSource }),
    [],
  );
});
