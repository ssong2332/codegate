// 인증번호 서버 대조(2026-10-18, Architecture §78 — #300 회귀 수정) 회귀 테스트.
//
// #300 회귀(scenario-review R8, 텍스트 폴백·고급·기관 사칭, 커밋당 7세션): ① 계좌 문자 뒤에도 인증번호만 다시 요구
// 세션 0/7 → 6/7 ② 모델이 번호를 먼저 말함 0/7 → 3/7. 원인 후보: 문자 도착 이후 매 턴 "실제 번호 + 진행 차단 규칙"을
// 프롬프트에 실은 것. ⇒ 서버 대조로 바꾸고, 아래 테스트가 "번호가 모델 입력에 0회"·"계좌 문자 뒤 0건"을 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { logger } from "firebase-functions";
import { buildOtpCompareInstruction, findInCallSmsItem, IN_CALL_SMS, listOtpItems } from "../../scenarios/inCallSms";
import { buildInCallSmsResponse } from "../../inCallSms/buildDoc";
import { buildSystemPrompt } from "../promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { extractSpokenCodes } from "../../shared/spokenDigits";
import { resolveOtpCheckInstruction } from "../otpCheck";

const SCENARIO = "institutional-impersonation";
const OTP = findInCallSmsItem(SCENARIO, "institution-otp")!;
const ACCOUNT = findInCallSmsItem(SCENARIO, "institution-safe-account")!;
const ALL_OTP_CODES = Object.values(IN_CALL_SMS)
  .flat()
  .map((item) => item.otpCode)
  .filter((code): code is string => Boolean(code));

function quietLogs<T>(fn: () => Promise<T>): Promise<T> {
  const original = { warn: logger.warn };
  (logger as { warn: unknown }).warn = () => undefined;
  return fn().finally(() => {
    (logger as { warn: unknown }).warn = original.warn;
  });
}

/** 도착 집합을 흉내 낸다. reads로 Firestore 조회 횟수를 센다. */
function store(deliveredIds: string[]) {
  const counter = { reads: 0 };
  return {
    counter,
    isDelivered: async (smsId: string) => {
      counter.reads += 1;
      return deliveredIds.includes(smsId);
    },
  };
}

// ── 숫자 추출(리포트 (D3)·(D4)와 같은 규칙) ──────────────────────────────────────────
test("[OTP] 숫자 추출 — 아라비아·띄어 부르기·하이픈·한글 숫자(붙여·띄어·묶음)를 6자리 문자열로", () => {
  const cases: [string, string][] = [
    ["048231이요", "048231"],
    ["0 4 8 2 3 1", "048231"],
    ["048-231 입니다", "048231"],
    ["공사팔이삼일이요", "048231"],
    ["공 사 팔 이 삼 일", "048231"],
    ["공사팔 이삼일이요", "048231"],
    ["123456이요", "123456"],
  ];
  for (const [text, expected] of cases) assert.ok(extractSpokenCodes(text).includes(expected), `${text} → ${JSON.stringify(extractSpokenCodes(text))}`);
  // 한글 숫자 끝 "이"+"요"는 어미일 수도 숫자 2일 수도 있어 두 후보를 함께 낸다("공사팔이삼일이요").
  assert.deepEqual(extractSpokenCodes("공사팔이삼일이요"), ["0482312", "048231"]);
});

test("[OTP] 숫자 추출 — 번호가 아닌 숫자·일반 문장은 잡지 않는다", () => {
  for (const text of ["1332로 전화해 볼게요", "300만원 정도 있어요", "인증번호는 못 알려 드려요", "사이사이 이삼일 걸려요", "네 누구세요?", "2024년에요"]) {
    assert.deepEqual(extractSpokenCodes(text), [], text);
  }
});

test("[OTP] 리포트 판정과 같은 정규식을 쓴다 — analyzeConversation.ts가 shared/spokenDigits에서 import(사본 금지)", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/report/analyzeConversation.ts"), "utf8");
  assert.match(src, /import \{ CODE_DIGITS_WITH_ENDING, CODE_HANGUL_DIGITS \} from "\.\.\/shared\/spokenDigits";/);
  assert.doesNotMatch(src, /const CODE_DIGITS_WITH_ENDING =/, "정규식 사본이 남으면 두 규칙이 갈라진다");
});

// ── 판정표 ─────────────────────────────────────────────────────────────────────────
test("[OTP] 맞는 번호를 부른 턴 → '일치' 1줄, 틀린 번호 → '다름' 1줄 (인증번호 도착 후·계좌 문자 전)", async () => {
  for (const [userText, result] of [
    ["048231이요", "match"],
    ["공 사 팔 이 삼 일", "match"],
    ["123456이요", "mismatch"],
    ["04823 1 이요", "match"],
  ] as const) {
    const s = store([OTP.smsId]);
    const got = await resolveOtpCheckInstruction({ scenarioId: SCENARIO, userText, scammerTurnNumber: OTP.afterScammerTurns + 1, isDelivered: s.isDelivered });
    assert.equal(got, buildOtpCompareInstruction(result), userText);
  }
});

test("[OTP] 숫자를 부르지 않은 턴에는 지시가 없고 Firestore 읽기도 0회 — R8 대본 문장들", async () => {
  const s = store([OTP.smsId]);
  for (const userText of ["네 누구세요?", "인증번호요? 왜 필요하죠?", "인증번호는 못 알려 드려요", "번호는 안 불러요. 다른 방법 없어요?", "계좌요? 어디로요?"]) {
    assert.equal(
      await resolveOtpCheckInstruction({ scenarioId: SCENARIO, userText, scammerTurnNumber: 5, isDelivered: s.isDelivered }),
      undefined,
      userText,
    );
  }
  assert.equal(s.counter.reads, 0);
});

test("[OTP] ⭐ 계좌 문자가 도착한 뒤에는 번호를 불러도 대조 지시 0건(R8 회귀 ①) — 같은 턴 도착 포함", async () => {
  // 이후 턴: 계좌 문자 도착 기록 있음
  const s1 = store([OTP.smsId, ACCOUNT.smsId]);
  for (let turn = ACCOUNT.afterScammerTurns; turn <= 9; turn += 1) {
    assert.equal(
      await resolveOtpCheckInstruction({ scenarioId: SCENARIO, userText: "048231이요", scammerTurnNumber: turn, isDelivered: s1.isDelivered }),
      undefined,
      `turn ${turn}`,
    );
  }
  // 계좌 문자가 바로 이번 턴에 도착
  const s2 = store([OTP.smsId]);
  assert.equal(
    await resolveOtpCheckInstruction({
      scenarioId: SCENARIO,
      userText: "123456이요",
      scammerTurnNumber: ACCOUNT.afterScammerTurns,
      deliveredThisTurn: ACCOUNT.smsId,
      isDelivered: s2.isDelivered,
    }),
    undefined,
  );
});

test("[OTP] 도착 전·미도착·호 전환 뒤·조회 실패·비해당 시나리오는 지시 없음", async () => {
  const none = async (args: Partial<Parameters<typeof resolveOtpCheckInstruction>[0]>) =>
    quietLogs(() =>
      resolveOtpCheckInstruction({
        scenarioId: SCENARIO,
        userText: "123456이요",
        scammerTurnNumber: 5,
        isDelivered: async () => true,
        ...args,
      }),
    );
  assert.equal(await none({ scammerTurnNumber: OTP.afterScammerTurns - 1 }), undefined, "도착 전");
  assert.equal(await none({ isDelivered: async () => false }), undefined, "미도착");
  assert.equal(await none({ callTransferred: true }), undefined, "호 전환 뒤");
  assert.equal(
    await none({
      isDelivered: async () => {
        throw new Error("down");
      },
    }),
    undefined,
    "조회 실패",
  );
  assert.equal(await none({ scenarioId: "family-accident-deepvoice" }), undefined, "인증번호 문자 없는 시나리오");
});

test("[OTP] 인증번호 문자가 **이번 턴에** 막 도착했으면 대조하지 않는다 — 참가자가 아직 문자를 못 봤다(리뷰 #1)", async () => {
  const s = store([]);
  assert.equal(
    await resolveOtpCheckInstruction({
      scenarioId: SCENARIO,
      userText: "123456이요",
      scammerTurnNumber: OTP.afterScammerTurns,
      deliveredThisTurn: OTP.smsId,
      isDelivered: s.isDelivered,
    }),
    undefined,
  );
});

test("[OTP] 정답과 자릿수가 다른 숫자(전화·금액·4자리·계좌)는 대조하지 않는다 — '번호가 안 맞는다' 과발동 방지(리뷰 #2)", async () => {
  for (const userText of ["010 1234 5678이요", "3000이요", "1234요", "110-123-456789이요", "35 048231이요"]) {
    const s = store([OTP.smsId]);
    assert.equal(
      await resolveOtpCheckInstruction({ scenarioId: SCENARIO, userText, scammerTurnNumber: OTP.afterScammerTurns + 1, isDelivered: s.isDelivered }),
      undefined,
      userText,
    );
  }
});

test("[OTP] 불변식 — 인증번호 문자가 있는 시나리오에는 그보다 늦게 오는 다음 문자가 있다('다음 문자 뒤 0건' 판정의 전제, 리뷰 #6)", () => {
  const otpScenarios = Object.keys(IN_CALL_SMS).filter((id) => listOtpItems(id).length > 0);
  assert.ok(otpScenarios.length >= 2);
  for (const id of otpScenarios) {
    for (const otp of listOtpItems(id)) {
      const later = (IN_CALL_SMS[id] ?? []).filter((item) => item.afterScammerTurns > otp.afterScammerTurns && item.kind !== "otp");
      assert.ok(later.length > 0, `${id}: 인증번호 뒤에 오는 문자가 없다 — '다음 문자 뒤 0건' 판정을 다시 설계하라`);
    }
  }
});

test("[OTP] 정적 스캔 — 프롬프트·LLM·실시간 소스는 otpCode를 참조하지 않는다(대조 모듈 otpCheck.ts만 예외, 리뷰 #3)", () => {
  const srcRoot = path.resolve(__dirname, "../../../src");
  const dirs = ["llm", "roleplay", "realtime"];
  const offenders: string[] = [];
  for (const dir of dirs) {
    for (const name of readdirSync(path.join(srcRoot, dir))) {
      if (!name.endsWith(".ts") || name === "otpCheck.ts") continue;
      if (readFileSync(path.join(srcRoot, dir, name), "utf8").includes("otpCode")) offenders.push(`${dir}/${name}`);
    }
  }
  assert.deepEqual(offenders, [], "모델 입력을 만드는 소스가 인증번호를 읽으면 유출 경로가 된다");
});

// ── ⭐ 번호(정답)가 모델 입력에 0회 ─────────────────────────────────────────────────
test("[OTP] ⭐ 번호 미노출 — 대조 결과 지시 2종·도착 응답(실시간)·카탈로그 도착 지시·조립 프롬프트 어디에도 인증번호가 없다(R8 회귀 ②)", async () => {
  assert.ok(ALL_OTP_CODES.length >= 2, "인증번호 카탈로그 수집 실패(거짓 초록 방지)");
  const modelInputs: string[] = [buildOtpCompareInstruction("match"), buildOtpCompareInstruction("mismatch")];
  for (const item of Object.values(IN_CALL_SMS).flat()) {
    modelInputs.push(item.announceInstruction);
    const res = buildInCallSmsResponse(item, { placed: false });
    if (res.announceInstruction) modelInputs.push(res.announceInstruction);
  }
  // 텍스트 경로가 실제로 조립하는 시스템 프롬프트(턴 지시 = 도착 지시 + 대조 결과)
  for (const [scenarioId, smsId] of [
    ["institutional-impersonation", "institution-otp"],
    ["card-company-impersonation", "card-otp"],
  ] as const) {
    const item = findInCallSmsItem(scenarioId, smsId)!;
    for (const userText of [`${item.otpCode}이요`, "123456이요"]) {
      const check = await resolveOtpCheckInstruction({
        scenarioId,
        userText,
        scammerTurnNumber: item.afterScammerTurns + 1,
        isDelivered: async (smsId) => smsId === item.smsId,
      });
      assert.ok(check, `${scenarioId}: 대조 지시가 붙어야 이 검사가 의미 있다`);
      modelInputs.push(
        buildSystemPrompt(SCENARIO_PROMPTS[scenarioId]!, {
          difficultyLevel: "advanced",
          inCallSmsEnabled: true,
          turnInstruction: [item.announceInstruction, check].join("\n"),
        }),
      );
    }
  }
  for (const input of modelInputs) {
    for (const code of ALL_OTP_CODES) assert.ok(!input.includes(code), `모델 입력에 인증번호 ${code}가 들어갔다`);
  }
  // 진행 차단 표현(고착 원인 후보)도 없다
  for (const text of [buildOtpCompareInstruction("match"), buildOtpCompareInstruction("mismatch")]) {
    assert.doesNotMatch(text, /넘어가지 말/);
  }
  assert.match(buildOtpCompareInstruction("mismatch"), /한 번만 요구/);
  assert.match(buildOtpCompareInstruction("mismatch"), /번호가 안 맞는데요, 문자 다시 확인해서 불러 주세요/);
});

test("[OTP] 실시간 도착 응답은 #300 이전과 같다 — 카탈로그 도착 지시 그대로(전 항목)", () => {
  for (const item of Object.values(IN_CALL_SMS).flat()) {
    assert.deepEqual(buildInCallSmsResponse(item, { placed: false }), { smsId: item.smsId, announceInstruction: item.announceInstruction });
  }
  assert.equal(listOtpItems(SCENARIO).length, 1);
});

test("[OTP] sendMessage 배선 — 원문 userText를 넘기고 턴 지시와 합친다(소스 스캔)", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/roleplay/index.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /const otpCheckInstruction = await resolveOtpCheckInstruction\(\{\n\s*scenarioId: session\.scenarioId,\n\s*userText,/);
  assert.match(src, /callTransferred: verifyState\?\.placed === true,/);
  assert.match(src, /\[turnInstruction, otpCheckInstruction\]\.filter\(Boolean\)\.join\("\\n"\)/);
});
