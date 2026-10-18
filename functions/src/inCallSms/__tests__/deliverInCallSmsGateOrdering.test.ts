// 문자 발송 배선 — 소스 스캔(G486 세 호출부 단일 함수 · G489 고정 턴 자동 발송 0 · 거부 시 쓰기 0).
//
// ⚠️ **관측 불가 지점 방어**(`feedback_unobservable_behavior_gates`) — `deliverInCallSms`·`sendMessage`는 `onCall`
// 핸들러라 에뮬레이터 없이 유닛 계층에서 직접 호출·관측할 수 없다. 판정(`resolveSmsGate`)과 실행
// (`deliverSmsThroughGate`)은 `smsGate.test.ts`가 진리표 · 메모리 가짜 저장소로 고정하고, 여기서는 "호출부가 정말 그
// 통로만 쓰는가"를 소스로 고정한다.
//
// T191(문자 도달 조건) 이전의 이 파일은 `resolveModelToolSmsGate`(폐기)가 `smsRef.create` 앞에 있는지를 봤다 — 같은
// 취지(거부 시 쓰기 0)를 이제 단일 통로 안에서 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";

// 테스트는 컴파일된 lib/에서 돈다(functions/lib/inCallSms/__tests__/) — 소스 경로를 명시적으로 잡는다.
const SRC_ROOT = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC_ROOT, rel), "utf8");

/** 주석 줄을 뺀 코드(주석의 설명 문구가 스캔에 걸리지 않게 — 저장소 관례 `codeOnly`). */
function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__") continue;
      out.push(...listSourceFiles(full));
    } else if (name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

const DELIVERY = codeOnly(read("inCallSms/smsDelivery.ts"));
const CALLABLE = codeOnly(read("inCallSms/index.ts"));
const FALLBACK = codeOnly(read("roleplay/index.ts"));

test("[G486] 단일 통로 — smsDelivery.ts만 resolveSmsGate를 부른 뒤 문서를 만든다(거부면 create 전에 return)", () => {
  const gateIdx = DELIVERY.indexOf("resolveSmsGate(");
  const createIdx = DELIVERY.indexOf("tx.create(");
  assert.ok(gateIdx > -1 && createIdx > -1, "판정 호출과 create가 둘 다 있어야 한다");
  assert.ok(gateIdx < createIdx, "판정이 create보다 앞에 있어야 한다");
  assert.match(
    DELIVERY.slice(gateIdx, createIdx),
    /if \(gate\.status !== "allowed"\) \{\s*return /,
    "불허면 create 전에 즉시 return하는 형태가 아니다(G387 — 거부 시 쓰기 0)",
  );
});

test("[G486] 세 호출부(실시간 도구 · 폴백 마커 · 백스톱)가 전부 deliverSmsThroughGate를 지난다", () => {
  // 실시간 콜러블: model_tool과 backstop이 같은 호출 1곳을 공유한다(purpose만 다르다).
  assert.equal(CALLABLE.split("deliverSmsThroughGate(").length - 1, 1, "콜러블의 발송 호출은 1곳");
  // 폴백: 백스톱(응답 전) 1곳 + 마커(응답 저장 뒤) 1곳.
  assert.equal(FALLBACK.split("deliverSmsThroughGate(").length - 1, 2, "sendMessage의 발송 호출은 2곳");
  assert.match(FALLBACK, /trigger: "backstop"/);
  assert.match(FALLBACK, /trigger: "model_marker"/);
});

test("[G486/X4] inCallSms 문서를 만드는 코드는 smsDelivery.ts 한 곳뿐이다(경로별 판정 분기 0)", () => {
  const offenders: string[] = [];
  for (const file of listSourceFiles(SRC_ROOT)) {
    const rel = path.relative(SRC_ROOT, file).replace(/\\/g, "/");
    // smsDelivery.ts = 유일한 생성 지점 · buildDoc.ts = 문서 모양 정의(쓰지 않는다).
    if (rel === "inCallSms/smsDelivery.ts" || rel === "inCallSms/buildDoc.ts") continue;
    const code = codeOnly(readFileSync(file, "utf8"));
    if (/collection\("inCallSms"\)[\s\S]{0,120}?\.create\(/.test(code) || /buildInCallSmsDoc\(/.test(code)) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [], "inCallSms 문서를 직접 만드는 다른 경로가 생겼다");
});

test("[G489] 고정 턴 자동 발송 경로 0 — findDueInCallSms · listInCallSmsTriggers · fallbackAnchorScammerTurn · resolveModelToolSmsGate 정의·호출 0", () => {
  const banned = ["findDueInCallSms", "listInCallSmsTriggers", "fallbackAnchorScammerTurn", "resolveModelToolSmsGate"];
  const offenders: string[] = [];
  for (const file of listSourceFiles(SRC_ROOT)) {
    const code = codeOnly(readFileSync(file, "utf8"));
    for (const name of banned) {
      if (code.includes(`${name}(`) || code.includes(`function ${name}`)) {
        offenders.push(`${path.relative(SRC_ROOT, file)}: ${name}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("[G489] afterScammerTurns가 발송 판정 코드(smsGate · smsDelivery · 콜러블 · sendMessage)에 등장하지 않는다", () => {
  const gate = codeOnly(read("inCallSms/smsGate.ts"));
  for (const [name, code] of [
    ["smsGate.ts", gate],
    ["smsDelivery.ts", DELIVERY],
    ["inCallSms/index.ts", CALLABLE],
    ["roleplay/index.ts", FALLBACK],
  ] as const) {
    assert.equal(code.includes("afterScammerTurns"), false, `${name}가 고정 턴을 판정 입력으로 읽는다`);
  }
});

test("[G489 역검증] 고정 턴 비교를 되살린 오염본은 같은 검사식에 걸린다", () => {
  const poisoned = `${FALLBACK}\nconst due = IN_CALL_SMS[id].find((i) => i.afterScammerTurns === n);`;
  assert.equal(poisoned.includes("afterScammerTurns"), true, "오염본은 실패해야 한다");
  assert.equal(FALLBACK.includes("afterScammerTurns"), false, "정상본은 통과");
});
