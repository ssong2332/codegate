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
import { evaluateOtpCheck, otpCheckInputsFromHistory, resolveOtpCheckInstruction } from "../otpCheck";

const SCENARIO = "institutional-impersonation";
/** 대조는 직전 사기범 발화가 인증번호를 물었을 때만 한다(QA M2) — 판정표 테스트의 기본 직전 발화. */
const ASK_OTP = "방금 문자로 인증번호 갔죠? 화면에 뜬 여섯 자리 그대로 불러 주세요.";
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
    const got = await resolveOtpCheckInstruction({ lastScammerText: ASK_OTP, scenarioId: SCENARIO, userText, scammerTurnNumber: OTP.afterScammerTurns + 1, isDelivered: s.isDelivered });
    assert.equal(got, buildOtpCompareInstruction(result), userText);
  }
});

test("[OTP] 숫자를 부르지 않은 턴에는 지시가 없고 Firestore 읽기도 0회 — R8 대본 문장들", async () => {
  const s = store([OTP.smsId]);
  for (const userText of ["네 누구세요?", "인증번호요? 왜 필요하죠?", "인증번호는 못 알려 드려요", "번호는 안 불러요. 다른 방법 없어요?", "계좌요? 어디로요?"]) {
    assert.equal(
      await resolveOtpCheckInstruction({ lastScammerText: ASK_OTP, scenarioId: SCENARIO, userText, scammerTurnNumber: 5, isDelivered: s.isDelivered }),
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
      await resolveOtpCheckInstruction({ lastScammerText: ASK_OTP, scenarioId: SCENARIO, userText: "048231이요", scammerTurnNumber: turn, isDelivered: s1.isDelivered }),
      undefined,
      `turn ${turn}`,
    );
  }
  // 계좌 문자가 바로 이번 턴에 도착
  const s2 = store([OTP.smsId]);
  assert.equal(
    await resolveOtpCheckInstruction({ lastScammerText: ASK_OTP,
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
      resolveOtpCheckInstruction({ lastScammerText: ASK_OTP,
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
    await resolveOtpCheckInstruction({ lastScammerText: ASK_OTP,
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
      await resolveOtpCheckInstruction({ lastScammerText: ASK_OTP, scenarioId: SCENARIO, userText, scammerTurnNumber: OTP.afterScammerTurns + 1, isDelivered: s.isDelivered }),
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

test("[OTP] QA M2 — 직전 사기범 발화가 인증번호를 묻지 않았거나(생년월일 6자리 요구 등) 발화가 생년월일이면 대조하지 않는다", async () => {
  const base = { scenarioId: SCENARIO, scammerTurnNumber: OTP.afterScammerTurns + 1, isDelivered: async (id: string) => id === OTP.smsId };
  // 사기범이 생년월일 6자리를 물었고 참가자가 6자리로 답함 → 대조 없음(옛 동작은 "번호가 다르다")
  assert.equal(await resolveOtpCheckInstruction({ ...base, lastScammerText: "본인 확인 위해 성함과 생년월일 6자리 말씀해 주세요.", userText: "900101이요" }), undefined);
  // 직전 사기범 발화 없음 → 대조 없음
  assert.equal(await resolveOtpCheckInstruction({ ...base, userText: "123456이요" }), undefined);
  // 인증번호를 물었어도 답에 생년월일 단서가 있으면 대조 없음
  assert.equal(await resolveOtpCheckInstruction({ ...base, lastScammerText: ASK_OTP, userText: "생년월일은 900101이요" }), undefined);
  // 인증번호를 물은 직후 6자리 → 대조함("인증 번호" 띄어쓰기도)
  assert.equal(
    await resolveOtpCheckInstruction({ ...base, lastScammerText: "문자로 간 인증 번호 불러 주세요.", userText: "123456이요" }),
    buildOtpCompareInstruction("mismatch"),
  );
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
      const check = await resolveOtpCheckInstruction({ lastScammerText: ASK_OTP,
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
  assert.match(src, /const otpInputs = otpCheckInputsFromHistory\(storedHistory\);/);
  assert.match(src, /const otpCheck = await evaluateOtpCheck\(\{\n\s*scenarioId: session\.scenarioId,\n\s*userText,/);
  assert.match(src, /const otpCheckInstruction = otpCheck\.instruction;/);
  assert.match(src, /logger\.info\("인증번호 대조 판정", \{\n\s*sessionId,\n\s*scenarioId: session\.scenarioId,\n\s*scammerTurnNumber,\n\s*outcome: otpCheck\.outcome,\n\s*reason: otpCheck\.reason,\n\s*\}\);/);
  assert.match(src, /callTransferred: verifyState\?\.placed === true,/);
  assert.match(src, /\[turnInstruction, otpCheckInstruction\]\.filter\(Boolean\)\.join\("\\n"\)/);
});

// ── §80 라이브 재현(2026-10-18T14:28Z, institutional-impersonation · 중급 · 통화 화면 "텍스트로 진행") ────────────
// 판정은 정상(mismatch)이었고 지시도 실렸지만 Gemini가 옛 문면을 무시하고 "인증번호 확인되었습니다"로 넘어갔다(실호출 3/3).
// 이 테스트는 그 대화를 sendMessage와 같은 함수(otpCheckInputsFromHistory → evaluateOtpCheck)로 재생해 **판정 행**을 고정한다.
// 모델이 따르는지는 단위 테스트로 보증할 수 없다 — 문면 강화의 실측은 Architecture §80.2.
const LIVE_HISTORY: Array<{ role: "user" | "scammer"; textMasked: string }> = [
  { role: "scammer", textMasked: "안녕하십니까, 서울중앙지검 수사과입니다. 고객님 명의 계좌가 금융범죄에 연루돼 확인차 연락드렸습니다." },
  { role: "user", textMasked: "creo?" },
  { role: "scammer", textMasked: "네? 잘 안 들렸는데요. 본인 확인을 위해 성함과 생년월일을 말씀해 주시겠습니까?" },
  { role: "user", textMasked: "홍길동이고 80년 1월 1일생이에요. 어떻게 하면 되죠?" },
  // 이 사기범 턴(#3)에서 인증번호 문자가 도착했다(afterScammerTurns 3 — sendMessage가 같은 요청에서 도착 처리).
  { role: "scammer", textMasked: "네, 홍길동 선생님 확인되셨습니다. 지금 휴대폰으로 인증번호 6자리가 담긴 문자를 하나 보내드렸습니다." },
];

test("[OTP] §80 라이브 재현 — 문자 도착 다음 턴에 틀린 번호 → mismatch(compared), 맞는 번호 → match", async () => {
  const inputs = otpCheckInputsFromHistory(LIVE_HISTORY);
  assert.equal(inputs.scammerTurnNumber, OTP.afterScammerTurns + 1, "번호를 부른 턴은 문자 도착 다음 사기범 턴(#4)");
  assert.match(inputs.lastScammerText ?? "", /인증번호/);
  const run = (userText: string) =>
    evaluateOtpCheck({
      scenarioId: SCENARIO,
      userText,
      ...inputs,
      isDelivered: async (smsId) => smsId === OTP.smsId,
    });
  const wrong = await run("123456이요");
  assert.deepEqual([wrong.outcome, wrong.reason], ["mismatch", "compared"]);
  assert.equal(wrong.instruction, buildOtpCompareInstruction("mismatch"));
  const right = await run("048231이요");
  assert.deepEqual([right.outcome, right.reason], ["match", "compared"]);
  // 같은 대화에서 문자가 "이번 턴 도착"으로 처리되는 턴(#3)의 숫자는 대조하지 않는다 — 사유가 남는다.
  const sameTurn = await evaluateOtpCheck({
    scenarioId: SCENARIO,
    userText: "123456이요",
    lastScammerText: "인증번호 불러 주세요",
    scammerTurnNumber: OTP.afterScammerTurns,
    deliveredThisTurn: OTP.smsId,
    isDelivered: async () => true,
  });
  assert.deepEqual([sameTurn.outcome, sameTurn.reason], ["none", "arrived-this-turn"]);
});

test("[OTP] §80 리뷰 #1 — 틀린 번호 → 되묻기(대사에 '인증번호'가 없어도) → 다시 틀린 번호도 대조된다(재시도 재생)", async () => {
  for (const reask of [
    "번호가 일치하지 않는데요. 다시 한번 문자를 정확히 확인해서 불러 주십시오.",
    "번호가 안 맞는데요. 제가 보낸 문자를 다시 한번 정확히 확인해서 불러주십시오.",
    "번호가 저희 쪽으로 확인되는 정보와 일치하지 않는데요. 다시 한번 문자 메시지 확인하셔서 정확하게 말씀해 주십시오.",
  ]) {
    const history = [...LIVE_HISTORY, { role: "user" as const, textMasked: "123456이요" }, { role: "scammer" as const, textMasked: reask }];
    const inputs = otpCheckInputsFromHistory(history);
    const retry = await evaluateOtpCheck({ scenarioId: SCENARIO, userText: "654321이요", ...inputs, isDelivered: async (id) => id === OTP.smsId });
    assert.deepEqual([retry.outcome, retry.reason], ["mismatch", "compared"], reask);
    const fixed = await evaluateOtpCheck({ scenarioId: SCENARIO, userText: "048231이요", ...inputs, isDelivered: async (id) => id === OTP.smsId });
    assert.deepEqual([fixed.outcome, fixed.reason], ["match", "compared"], reask);
  }
  // 되묻기 예시 대사 자체에도 "인증번호"가 들어 있다(지시 쪽 보강).
  assert.match(buildOtpCompareInstruction("mismatch"), /"인증번호가 안 맞는데요, 문자 다시 확인해서 불러 주세요\."/);
});

test("[OTP] §80 판정 사유 — 빠진 행이 reason으로 남는다(라이브 로그 해석용)", async () => {
  const base = { scenarioId: SCENARIO, lastScammerText: ASK_OTP, scammerTurnNumber: OTP.afterScammerTurns + 1, isDelivered: async (id: string) => id === OTP.smsId };
  const cases: Array<[Partial<Parameters<typeof evaluateOtpCheck>[0]>, string]> = [
    [{ scenarioId: "family-accident-deepvoice", userText: "123456이요" }, "no-otp-scenario"],
    [{ userText: "네 알겠어요" }, "no-digits"],
    [{ userText: "123456이요", lastScammerText: "성함이 어떻게 되세요?" }, "not-asked"],
    [{ userText: "생년월일은 800101이요" }, "birthdate"],
    [{ userText: "123456이요", callTransferred: true }, "transferred"],
    [{ userText: "123456이요", scammerTurnNumber: OTP.afterScammerTurns - 1 }, "before-arrival"],
    [{ userText: "123456이요", scammerTurnNumber: ACCOUNT.afterScammerTurns, isDelivered: async () => true }, "later-sms-arrived"],
    [{ userText: "123456이요", isDelivered: async () => false }, "not-delivered"],
    [{ userText: "1234요" }, "no-same-length"],
  ];
  for (const [override, reason] of cases) {
    const got = await evaluateOtpCheck({ ...base, userText: "", ...override } as Parameters<typeof evaluateOtpCheck>[0]);
    assert.deepEqual([got.outcome, got.reason], ["none", reason], reason);
  }
});

test("[OTP] §80 문면 — 'mismatch'는 '확인했습니다' 금지·첫 문장 지정·서버 확인 결과 명시, 진행 차단 표현·번호 없음", () => {
  const text = buildOtpCompareInstruction("mismatch");
  assert.match(text, /서버 확인 결과/);
  assert.match(text, /"확인했습니다"·"확인됐습니다"라고 말하지 마라/);
  assert.match(text, /첫 문장에서 인증번호가 맞지 않는다고 말하고/);
  assert.doesNotMatch(text, /넘어가지 말/);
  for (const code of ALL_OTP_CODES) assert.ok(!text.includes(code));
});
