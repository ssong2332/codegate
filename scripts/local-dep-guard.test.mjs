// (T130) scripts/local-dep-guard.mjs 판정 규칙 회귀 테스트 — docs/Architecture.md §36.4.
//
// 이 파일이 지키는 것은 두 가지다.
//  1. 오염 형태(`"file:.."` · 락의 `".."` 블록)를 실제로 잡는다.
//  2. ⭐ **정상 필드를 하나도 잡지 않는다** — 특히 `"name": "fraud-vaccine-web"`(G166).
//     과차단은 이 방식의 사망 조건이다(§36.5 강등표 5): 오탐이 한 번 나면 다음 사람이 검사를 지운다.
import test from "node:test";
import assert from "node:assert/strict";

import { matchRule } from "./local-dep-guard.mjs";

test("오염 — file:/link:/portal: 지정자를 값 위치에서 잡는다", () => {
  assert.equal(matchRule('    "fraud-vaccine-web": "file:.."')?.id, "local-path-specifier");
  assert.equal(matchRule('    "fraud-vaccine-web": "file:"')?.id, "local-path-specifier");
  assert.equal(matchRule('    "some-pkg": "link:../shared"')?.id, "local-path-specifier");
  assert.equal(matchRule('    "some-pkg": "portal:../shared"')?.id, "local-path-specifier");
});

test("오염 — 락파일의 상대 경로 packages 키를 잡는다", () => {
  assert.equal(matchRule('    "..": {')?.id, "relative-packages-key");
  assert.equal(matchRule('    "../shared": {')?.id, "relative-packages-key");
});

test("⭐ 과차단 0건 — 정상 필드를 하나도 잡지 않는다(G166)", () => {
  const benign = [
    '  "name": "fraud-vaccine-web",', // ⛔ G166 — 정상 필드다. 이름으로 걸면 정상 커밋이 막힌다.
    '      "name": "fraud-vaccine-web",',
    '    "": {',
    '    "node_modules/fraud-vaccine-web": {',
    '      "resolved": "https://registry.npmjs.org/next/-/next-16.2.10.tgz",',
    '      "link": true',
    '    "firebase-functions": "^7.3.0"',
    '  "description": "Cloud Functions — 안 당해본 사기는 못 막는다",',
    '  "main": "lib/index.js",',
    '    "profile": "file-upload"',
  ];
  for (const line of benign) {
    assert.equal(matchRule(line), null, `정상 줄을 오염으로 판정했다: ${line}`);
  }
});
