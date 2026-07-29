import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSecretSymbolTable,
  computeImportClosure,
  computeReadSecrets,
  describeMismatch,
  findSecretMismatches,
  listEntryPoints,
  readDeclaredSecrets,
} from "../secretDeclarationScan";
import { classifySecret } from "../../realtime/provider";
import * as callables from "../../index";

// T133 / AC-081 — "읽는 자격증명 = 선언한 자격증명"을 **기계적으로** 대조하는 하드 계약.
// Architecture.md §41.4 ⓐ(테스트 스위트 안의 정적 폐포 검사) 단독 채택 — 빌드 체인·pre-commit·
// 배포 시 검사·손 목록은 §41.4에서 전부 기각됐다(⛔ 되살리지 말 것).
//
// ⭐ 이 게이트가 보증하는 것과 보증하지 않는 것(§41.10 — ⛔ 지우지 말 것):
//   보증한다     : "선언 누락"이라는 원인의 재발 불가(선언-사용 정합).
//   보증하지 않는다: **배포 환경에서 실제로 미주입이 일어나는가.** 아무도 배포하지 않았고 재현
//                  하지 못했다. ⛔ 이 게이트가 초록이라고 *"이제 조용한 통과가 불가능하다"* 로
//                  읽지 마라(G209).

const table = buildSecretSymbolTable();

const entries = listEntryPoints().map((entry) => ({
  ...entry,
  read: computeReadSecrets(entry.file, table),
}));

const declaredByName: Record<string, readonly string[]> = {};
for (const entry of entries) {
  const declared = readDeclaredSecrets((callables as Record<string, unknown>)[entry.name]);
  // ⛔ 판독 불가(`__endpoint`가 @alpha라 SDK 업그레이드로 사라질 수 있다 — G207)를 조용히 빈
  // 배열로 떨어뜨리면 **전부 초록**이 된다. 아래 별도 단언이 그것을 실패로 만든다.
  if (declared !== null) declaredByName[entry.name] = declared;
}

test("[T133/AC-081 전제] 시크릿 심볼 표가 shared/config.ts에서 실제로 파싱된다(손 목록 0건)", () => {
  // ⛔ 심볼 목록을 테스트에 손으로 적지 않는다 — AC-081 (a)가 금지한 형태다.
  assert.ok(
    Object.keys(table).length >= 2,
    "shared/config.ts에서 defineSecret 심볼을 하나도 파싱하지 못했다 — 파서가 깨졌다(거짓 초록).",
  );
  assert.deepEqual(
    table["GEMINI_KEY_SECRETS"],
    ["GEMINI_API_KEY", "GEMINI_API_KEY2"],
    "`...GEMINI_KEY_SECRETS` 스프레드가 해석되지 않으면 선언 집합을 과소평가한다(§41.8 강등표 1행).",
  );
});

test("[T133/AC-081 전제] `__endpoint.secretEnvironmentVariables`로 선언 집합을 판독할 수 있다(G207)", () => {
  // P-1. 판독이 불가능해지면 소스 리터럴 파싱으로 강등해야 한다 — 조용히 통과시키지 않는다.
  for (const entry of entries) {
    assert.ok(
      entry.name in declaredByName,
      `${entry.name}: __endpoint에서 선언 집합을 판독하지 못했다. SDK 업그레이드로 @alpha API가 ` +
        `바뀌었을 수 있다 — 조용히 통과시키지 말고 소스 리터럴 파싱으로 강등하라(§41.8 강등표 1~2행).`,
    );
  }
  assert.deepEqual(
    readDeclaredSecrets(callables.createRealtimeCall),
    ["ELEVENLABS_API_KEY", "GEMINI_API_KEY", "GEMINI_API_KEY2"],
    "판독 수단 자체의 기준점(선언이 확실히 있는 콜러블)이 무너졌다.",
  );
  assert.equal(
    readDeclaredSecrets(() => undefined),
    null,
    "__endpoint가 없는 대상은 빈 배열이 아니라 null(판독 불가)이어야 한다.",
  );
});

test("[T133/AC-081 전제] 검사 대상이 0건이 아니다(대상 0건은 거짓 초록의 전형 — §41.8 강등표 5행)", () => {
  assert.ok(entries.length >= 20, `서버 진입점 수집이 ${entries.length}건이다 — 스캐너가 깨졌다.`);
  const withSecrets = entries.filter((entry) => entry.read.length > 0);
  assert.ok(
    withSecrets.length >= 1,
    "자격증명을 읽는 진입점이 0건으로 나왔다 — 폐포 계산이 아무것도 보지 못하고 있다(G140형 거짓 초록).",
  );
});

test("[T133/AC-081 (a)] 모든 서버 진입점에서 읽는 자격증명과 선언한 자격증명이 양방향으로 일치한다", () => {
  const mismatches = findSecretMismatches(entries, declaredByName);
  assert.deepEqual(
    mismatches.map((m) => m.name),
    [],
    "\n" + mismatches.map(describeMismatch).join("\n\n"),
  );
});

test("[T133/AC-081 (b) 역방향 확인] 선언만 지운 오염 샘플에서 이 게이트가 실제로 실패한다", () => {
  // ⛔ 오염은 **테스트 코드 안에서만** 만든다(실제 소스를 고쳤다 되돌리지 않는다 —
  //    callContinuity.test.ts:161-162가 세운 관례). ⛔ 선언과 읽기를 **같이** 지우면 양쪽이 비어
  //    일치해서 통과한다(거짓 초록) — 그래서 **선언만** 지우고 읽는 집합의 불변을 함께 단언한다(G208).
  const target = "deliverVerifyOffer";
  const clean = entries.find((entry) => entry.name === target);
  assert.ok(clean, `${target}을 진입점 수집에서 찾지 못했다.`);
  assert.ok(
    clean.read.includes("GEMINI_API_KEY"),
    "오염 대상이 실재 심볼을 읽고 있어야 한다 — 이름 해석 실패가 아니라 집합 불일치로 실패해야 한다.",
  );

  // ── 정상 샘플: 통과한다 ──────────────────────────────────────────────
  assert.deepEqual(
    findSecretMismatches([clean], declaredByName).map((m) => m.name),
    [],
    "정상 샘플이 실패하면 역방향 확인이 성립하지 않는다.",
  );

  // ── 오염 샘플(선언 집합에서 GEMINI_API_KEY 1건만 제거): 실패한다 ────
  const polluted = {
    ...declaredByName,
    [target]: (declaredByName[target] ?? []).filter((key) => key !== "GEMINI_API_KEY"),
  };
  const mismatches = findSecretMismatches([clean], polluted);
  assert.deepEqual(mismatches.map((m) => m.name), [target], "오염 샘플에서 게이트가 실패하지 않았다.");
  assert.deepEqual(mismatches[0]!.missingDeclaration, ["GEMINI_API_KEY"]);
  // 실패 메시지가 처방을 담는가(§41.5 (4) — "불일치"만 적지 않는다).
  const message = describeMismatch(mismatches[0]!);
  assert.match(message, /선언 누락/);
  assert.match(message, /G212/);

  // ── 입력 불변 단언: 오염 전후로 "읽는 집합"은 동일하다 ───────────────
  assert.deepEqual(
    computeReadSecrets(clean.file, table),
    clean.read,
    "오염이 읽는 집합까지 바꿨다면 이 역검증은 무효다(양쪽을 지운 거짓 초록).",
  );

  // ── 반대 방향(잉여 선언)도 잡는가 ────────────────────────────────────
  const overDeclared = findSecretMismatches([{ ...clean, read: [] }], declaredByName);
  assert.deepEqual(overDeclared.map((m) => m.name), [target]);
  assert.ok(overDeclared[0]!.unusedDeclaration.length > 0, "양방향 중 한쪽만 잡으면 (a) 미충족이다.");
});

test("[T133 G205] `import type`은 폐포에서 제외된다(rewind/judge.ts가 거짓 양성이 되지 않는다)", () => {
  const closure = computeImportClosure(
    listEntryPoints().find((entry) => entry.name === "judgeRewindAnswer")!.file,
  );
  const viaJudgeOnly = closure.filter((file) => file.replace(/\\/g, "/").endsWith("/llm/index.ts"));
  // judgeRewindAnswer는 `getLlmClient()`를 값으로 부르므로 ../llm은 폐포에 **있어야** 한다.
  assert.equal(viaJudgeOnly.length, 1);
  // 반면 rewind/judge.ts는 타입만 가져온다 — 그 파일 단독 폐포에는 ../llm이 없어야 한다.
  const judgeClosure = computeImportClosure(
    closure.find((file) => file.replace(/\\/g, "/").endsWith("/rewind/judge.ts"))!,
  );
  assert.equal(
    judgeClosure.some((file) => file.replace(/\\/g, "/").endsWith("/llm/index.ts")),
    false,
    "`import type { LlmClient } from \"../llm\"`를 따라가면 거짓 양성이 난다(G205).",
  );
});

test("[T133 G206] functions/src/index.ts(전 모듈 배럴)는 폐포에서 제외된다", () => {
  for (const entry of entries) {
    const closure = computeImportClosure(entry.file);
    assert.equal(
      closure.some((file) => /[\\/]src[\\/]index\.ts$/.test(file)),
      false,
      `${entry.name}: 배럴이 폐포에 들어가면 모든 콜러블의 폐포가 전체가 된다(G206).`,
    );
  }
});

// ── AC-081 (c) — "못 읽은 상태"의 관측 가능성 ────────────────────────────────
//
// ⛔ 이 절이 만드는 것은 **차단이 아니다.** AC-081 (c)는 *"거부되거나 관측 가능한 신호로
//    드러난다"* 로 둘 중 하나를 요구하며 여기서는 **후자**를 택했다(§41.6 (3)).
//    "Mock이면 차단"은 기각됐다 — 키 없는 환경의 Mock 강등은 정당한 동작이고 realtime/__tests__/
//    provider.test.ts가 그것을 단언한다(G210).

test("[T133/AC-081 (c)] classifySecret이 미주입(absent)과 빈 값 주입(empty)을 구분한다", () => {
  const absent = classifySecret({ name: "T133_ABSENT_FIXTURE", value: () => "" }, {});
  assert.equal(absent, "absent", "process.env에 키 자체가 없으면 absent다 — SDK 경고가 나는 조건.");

  const empty = classifySecret(
    { name: "T133_EMPTY_FIXTURE", value: () => "" },
    { T133_EMPTY_FIXTURE: "" },
  );
  assert.equal(empty, "empty", "빈 값 주입은 absent와 다르다 — SDK 경고가 나지 않는 사각지대다.");

  const placeholder = classifySecret(
    { name: "T133_PLACEHOLDER_FIXTURE", value: () => "YOUR_API_KEY" },
    { T133_PLACEHOLDER_FIXTURE: "YOUR_API_KEY" },
  );
  assert.equal(placeholder, "empty", ".env.example placeholder는 '미설정'으로 본다(종전 규칙 유지).");

  // ⛔ 값은 어떤 단언에도 싣지 않는다(G211) — 여기서 확인하는 것은 "set이라는 판별 결과"뿐이다.
  const set = classifySecret(
    { name: "T133_SET_FIXTURE", value: () => "x" },
    { T133_SET_FIXTURE: "x" },
  );
  assert.equal(set, "set");

  // 배포 분석 단계(FUNCTIONS_CONTROL_API)의 throw는 absent로 떨어진다 — 종전 catch 동작 유지.
  assert.equal(
    classifySecret(
      {
        name: "T133_THROW_FIXTURE",
        value: () => {
          throw new Error("Cannot access the value of secret during function deployment.");
        },
      },
      {},
    ),
    "absent",
  );
});
