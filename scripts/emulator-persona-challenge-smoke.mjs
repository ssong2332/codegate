#!/usr/bin/env node
// §88(DECISIONS #199 · UX D-131) — "다른 사람에게 보내기" 챌린지의 받는 분 정보(가상 신상 카드) 에뮬레이터 스모크.
// ⛔ 측정 전용 — 앱 코드를 바꾸지 않는다. 에뮬레이터(auth + firestore + functions · 프로젝트 demo-test)에만 쓴다.
// ⛔ 라이브 프로젝트에 쓰지 않는다(PROJECT 상수 고정 · 호스트 127.0.0.1 고정). 키 값은 다루지 않는다 — LLM 키가 없으면
//    서버가 Mock LLM으로 강등되며, 이 스크립트의 단언은 LLM 응답 내용에 기대지 않는다.
//
// 사전: npm --prefix functions run build → (다른 셸) FUNCTIONS_DISCOVERY_TIMEOUT=120 firebase emulators:start
//       --only auth,firestore,functions --project demo-test
// 사용법: node scripts/emulator-persona-challenge-smoke.mjs [--out <file>] [--scenario card-company-impersonation]
//
// (A) 카드 입력 챌린지: createChallenge(고급 + personaCardInput) → 챌린지 문서 카드(v2 · sender) → 랜딩 응답에 카드 0 →
//     consentChallenge(익명) → 챌린지 문서 카드 삭제 · 세션 문서에 같은 카드 → 프롬프트 조립(functions/lib) 카드 블록 →
//     sendMessage 1턴 → endSession → 리포트 personaBlock(inputBy sender) → 같은 수신자 재동의 = 같은 세션(resume)
// (B) 빈 카드 챌린지: 카드 필드 0(챌린지 · 세션 · 리포트) · 프롬프트에 카드 블록 0 · 시나리오 프롬프트의 성함 · 생년월일 요구 문면 존재
// (C) 폐기: 카드 챌린지를 동의 전에 deleteChallenge → status deleted · 카드 삭제
// (D) 거부: 중급 + 카드 = persona-card-not-applicable · 규칙 밖 이름 = persona-card-invalid · 챌린지 문서 0
//     §92 — 다른 종류의 칸(기관형에 자녀 이름 · 협박형에 다른 칸) = persona-card-not-applicable
// (E) §92 자가 세션: createSession(고급 + personaCardInput) → 세션 문서 카드(v2 · self) → 프롬프트(카드 종류별 블록 · 요구 예시 0)
//     ⭐ 고급 전용 2종(asset-protection-notice-call · prosecution-cooperation-call)은 챌린지를 만들 수 없어
//        (A)~(D)를 건너뛰고 (E)만 돈다.
// §92 대상 확대 — 카드 종류(기관형 · 본인 협박형 · 자녀 협박형)마다 입력 · 기대 값이 다르다(아래 CARD_BY_KIND).
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PROJECT = "demo-test";
const AUTH = "http://127.0.0.1:9099";
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const outFile = argVal("--out", "emulator-persona-challenge-result.json");
const SCENARIO_ID = argVal("--scenario", "card-company-impersonation");

// 프롬프트 조립은 서버와 같은 컴파일 산출물을 쓴다(G568 — 텍스트 턴 호출부가 넘기는 값 = 세션 문서 personaCard.items).
const require = createRequire(import.meta.url);
const LIB = join(dirname(fileURLToPath(import.meta.url)), "..", "functions", "lib");
const { buildSystemPrompt, PERSONA_CARD_BLOCK_HEAD, PERSONA_CARD_BLOCK_HEAD_THREAT } = require(join(LIB, "roleplay", "promptAssembly.js"));
const { SCENARIO_PROMPTS } = require(join(LIB, "scenarios", "index.js"));
const { asksIdentityCheck } = require(join(LIB, "roleplay", "personaAuthority.js"));
const { personaCardKind } = require(join(LIB, "scenarios", "personaCardCatalog.js"));
const { ANONYMOUS_NAME_CLAUSE } = require(join(LIB, "roleplay", "personaCardIdentity.js"));

const KIND = personaCardKind(SCENARIO_ID);
if (!KIND) throw new Error(`카드 대상 시나리오가 아니다: ${SCENARIO_ID}`);
const ADVANCED_ONLY = ["card-delivery-call", "asset-protection-notice-call", "prosecution-cooperation-call"].includes(SCENARIO_ID);
const IDENTITY = asksIdentityCheck(SCENARIO_ID);
const CARD_BY_KIND = {
  identity: { input: { name: "김가상", birthYear: 1961, region: "부산광역시" }, values: ["김가상", "1961년생", "부산광역시"] },
  "self-threat": {
    input: { name: "김가상", birthYear: 1961, region: "부산광역시", job: "회사원" },
    values: ["김가상", "1961년생", "부산광역시", "회사원"],
  },
  "child-threat": {
    input: { childName: "김민준", childGrade: "초등학교 3학년", childAcademy: "영어학원" },
    values: ["김민준", "초등학교 3학년", "영어학원"],
  },
};
const CARD_INPUT = CARD_BY_KIND[KIND].input;
const CARD_VALUES = CARD_BY_KIND[KIND].values;
/** 다른 종류의 칸(서버 = not-applicable). */
const WRONG_KIND_INPUT = KIND === "child-threat" ? { name: "김가상" } : { childName: "김민준" };
const BLOCK_HEAD = IDENTITY ? PERSONA_CARD_BLOCK_HEAD : PERSONA_CARD_BLOCK_HEAD_THREAT;
/** 카드가 있으면 사라져야 하는 원천(기관형 = 성함 요구 예시 · 협박형 = 이름 단정 금지 원문). */
const DEMAND_PATTERN = /성함(이랑 (생년월일|주소))?(부터)? 불러주/;

async function signUp(body) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
  });
  const json = await res.json();
  if (!json.idToken) throw new Error(`signUp 실패: ${JSON.stringify(json).slice(0, 200)}`);
  return { idToken: json.idToken, uid: json.localId };
}
/** 비익명 발신자(password 제공자 — 서버 익명 게이트 통과). 비밀번호는 매번 무작위(하드코딩 0). */
const signUpSender = () => signUp({ email: `sender-${crypto.randomUUID()}@example.com`, password: crypto.randomUUID() });
const signUpAnon = () => signUp({});

function fromValue(v) {
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fromValue(x)]));
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(fromValue);
  return v;
}
async function fsRead(docPath) {
  const res = await fetch(`${FS}/${docPath}`, { headers: { Authorization: "Bearer owner" } });
  if (res.status === 404) return null;
  const json = await res.json();
  return Object.fromEntries(Object.entries(json.fields ?? {}).map(([k, v]) => [k, fromValue(v)]));
}
async function fsList(collectionPath) {
  const res = await fetch(`${FS}/${collectionPath}?pageSize=300`, { headers: { Authorization: "Bearer owner" } });
  const json = await res.json();
  return (json.documents ?? []).map((d) => Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, fromValue(v)])));
}
function toValue(v) {
  if (v === null) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  throw new Error(`지원하지 않는 값: ${typeof v}`);
}
async function fsWrite(docPath, data) {
  const res = await fetch(`${FS}/${docPath}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)])) }),
  });
  if (!res.ok) throw new Error(`Firestore write 실패 ${docPath}: ${res.status}`);
}
async function call(fn, data, idToken) {
  const res = await fetch(`${FN}/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ data }),
  });
  const json = await res.json().catch(() => ({}));
  if (json.error) return { ok: false, status: json.error.status, message: json.error.message, details: json.error.details };
  return { ok: true, result: json.result };
}
async function mustCall(fn, data, idToken) {
  const r = await call(fn, data, idToken);
  if (!r.ok) throw new Error(`${fn} 실패: ${JSON.stringify(r)}`);
  return r.result;
}

const results = { scenarioId: SCENARIO_ID, kind: KIND, checks: [] };
let failCount = 0;
function check(part, name, pass, detail = {}) {
  results.checks.push({ part, name, pass, ...detail });
  if (!pass) failCount += 1;
  console.log(`[${part}] ${name}: ${pass ? "PASS" : "FAIL"} ${JSON.stringify(detail)}`);
}
const values = (card) => (card?.items ?? []).map((i) => i.value);
const sameValues = (card) => JSON.stringify(values(card)) === JSON.stringify(CARD_VALUES);

function assemble(items) {
  // §92 — 운영 호출부와 같은 판별자(identityCheckAllowed = asksIdentityCheck)를 넘긴다(협박형 블록 · 이름 단정 원문이 여기로 갈린다).
  return buildSystemPrompt(SCENARIO_PROMPTS[SCENARIO_ID], {
    difficultyLevel: "advanced",
    identityCheckAllowed: IDENTITY,
    personaCard: items,
  });
}
/** §92 — 카드가 있는 조립에서 "먼저 말하지 않고 묻기"의 원천이 남았는가(기관형 = 성함 요구 · 협박형 = 이름 단정 금지 원문). */
const demandLeft = (prompt) => (IDENTITY ? DEMAND_PATTERN.test(prompt) : prompt.includes(ANONYMOUS_NAME_CLAUSE));

async function partA() {
  const sender = await signUpSender();
  const created = await mustCall(
    "createChallenge",
    { scenarioId: SCENARIO_ID, displayName: "E2E 발신자", difficultyLevel: "advanced", personaCardInput: CARD_INPUT },
    sender.idToken,
  );
  const { challengeId, shareToken } = created;
  results.A = { challengeId };

  const ch1 = await fsRead(`challenges/${challengeId}`);
  check("A", `1 챌린지 문서 카드 = v2 · sender · 입력 ${CARD_VALUES.length}항목`, ch1?.personaCard?.v === 2 && ch1.personaCard.inputBy === "sender" && sameValues(ch1.personaCard), {
    personaCard: ch1?.personaCard,
    status: ch1?.status,
  });

  const landing = await mustCall("getChallengeLanding", { token: shareToken });
  const landingJson = JSON.stringify(landing);
  check("A", "2 수신 랜딩 응답에 카드 값 0", !CARD_VALUES.some((v) => landingJson.includes(v)) && !("personaCard" in landing), {
    landingKeys: Object.keys(landing),
  });

  const receiver = await signUpAnon();
  const consent = await mustCall("consentChallenge", { token: shareToken }, receiver.idToken);
  const sessionId = consent.sessionId;
  results.A.sessionId = sessionId;

  const ch2 = await fsRead(`challenges/${challengeId}`);
  // consentChallenge는 커밋 뒤 같은 호출 안에서 consented → in_progress로 넘긴다(userAccess.ts markChallengeInProgressIfConsented).
  check("A", "3 동의 뒤 챌린지 문서 카드 삭제 · status consented|in_progress", ch2 && !("personaCard" in ch2) && ["consented", "in_progress"].includes(ch2.status), {
    status: ch2?.status,
    hasPersonaCard: ch2 ? "personaCard" in ch2 : null,
  });
  const s1 = await fsRead(`sessions/${sessionId}`);
  check(
    "A",
    "4 수신자 세션 문서 카드 = 같은 값(v2 · sender) · 고급",
    s1?.personaCard?.v === 2 && s1.personaCard.inputBy === "sender" && sameValues(s1.personaCard) && s1.difficultyLevel === "advanced" && s1.uid === receiver.uid,
    { personaCard: s1?.personaCard, difficultyLevel: s1?.difficultyLevel, llmProvider: s1?.llmProvider ?? "(부재 = 실 LLM)" },
  );

  const prompt = assemble(s1?.personaCard?.items);
  check("A", `5 프롬프트 조립(텍스트 턴 호출부 입력)에 카드 블록(${KIND}) + ${CARD_VALUES.length}값 · 요구 원천 0`, prompt.includes(BLOCK_HEAD) && CARD_VALUES.every((v) => prompt.includes(v)) && !demandLeft(prompt), {
    blockExcerpt: prompt.slice(prompt.indexOf("[미리 확보한 상대 정보"), prompt.indexOf("[미리 확보한 상대 정보") + 260),
    demandLeft: demandLeft(prompt),
  });

  const opening = (await fsList(`sessions/${sessionId}/messages`)).find((m) => m.turnIndex === 0);
  results.A.openingText = opening?.textMasked;

  const turn = await call("sendMessage", { sessionId, userText: "네 여보세요? 누구시죠?" }, receiver.idToken);
  check("A", "6 sendMessage 1턴(수신자)", turn.ok, { scammerText: turn.result?.message?.text ?? turn.result?.scammerMessage?.text, err: turn.ok ? undefined : turn });

  const ended = await call("endSession", { sessionId, endReason: "user_ended" }, receiver.idToken);
  check("A", "7 endSession", ended.ok, { result: ended.result ?? ended });
  let report = await fsRead(`reports/${sessionId}`);
  if (!report) {
    await call("generateReport", { sessionId }, receiver.idToken);
    report = await fsRead(`reports/${sessionId}`);
  }
  // §92 — 협박형은 교훈 문면 분기용 context(= 카드 종류) · 기관형은 부재.
  const expectContext = KIND === "identity" ? undefined : KIND;
  check(
    "A",
    `8 리포트 personaBlock = inputBy sender · ${CARD_VALUES.length}값 · context ${expectContext ?? "부재"}`,
    report?.personaBlock?.inputBy === "sender" &&
      JSON.stringify((report.personaBlock.items ?? []).map((i) => i.value).sort()) === JSON.stringify([...CARD_VALUES].sort()) &&
      report.personaBlock.context === expectContext,
    { personaBlock: report?.personaBlock },
  );

  const again = await call("consentChallenge", { token: shareToken }, receiver.idToken);
  check("A", "9 같은 수신자 재동의 = 같은 세션(resume) · 챌린지 카드 여전히 0", again.ok && again.result.sessionId === sessionId, {
    again: again.result ?? again,
    hasPersonaCard: "personaCard" in ((await fsRead(`challenges/${challengeId}`)) ?? {}),
  });
}

async function partB() {
  const sender = await signUpSender();
  const { challengeId, shareToken } = await mustCall(
    "createChallenge",
    { scenarioId: SCENARIO_ID, displayName: "E2E 발신자(빈 카드)", difficultyLevel: "advanced" },
    sender.idToken,
  );
  results.B = { challengeId };
  const ch = await fsRead(`challenges/${challengeId}`);
  check("B", "1 빈 입력 챌린지 문서에 카드 필드 0", ch && !("personaCard" in ch), { status: ch?.status });

  const receiver = await signUpAnon();
  const { sessionId } = await mustCall("consentChallenge", { token: shareToken }, receiver.idToken);
  results.B.sessionId = sessionId;
  const s = await fsRead(`sessions/${sessionId}`);
  check("B", "2 수신자 세션에 카드 필드 0 · 고급", s && !("personaCard" in s) && s.difficultyLevel === "advanced", { difficultyLevel: s?.difficultyLevel });

  const prompt = assemble(s?.personaCard?.items);
  check("B", "3 프롬프트에 카드 블록 0", !prompt.includes("[미리 확보한 상대 정보"), {});
  if (IDENTITY) {
    const asks = ["성함", "생년월일"].filter((w) => prompt.includes(w));
    check("B", "4 시나리오 프롬프트에 성함 · 생년월일 요구 문면 존재", asks.length === 2, { found: asks });
  } else {
    // §92 — 협박형 빈 카드 = 종전 그대로 "상대 이름을 먼저 말하지 않는다"(자녀 납치 = 이름을 먼저 말하게 유도).
    check("B", "4 협박형 빈 카드 = 이름 단정 금지 원문 그대로", prompt.includes(ANONYMOUS_NAME_CLAUSE), {});
  }

  const opening = (await fsList(`sessions/${sessionId}/messages`)).find((m) => m.turnIndex === 0);
  results.B.openingText = opening?.textMasked;
  await call("sendMessage", { sessionId, userText: "여보세요?" }, receiver.idToken);
  await call("endSession", { sessionId, endReason: "user_ended" }, receiver.idToken);
  let report = await fsRead(`reports/${sessionId}`);
  if (!report) {
    await call("generateReport", { sessionId }, receiver.idToken);
    report = await fsRead(`reports/${sessionId}`);
  }
  check("B", "5 리포트에 personaBlock 0", report !== null && !("personaBlock" in report), { reportExists: report !== null });
}

async function partC() {
  const sender = await signUpSender();
  const { challengeId } = await mustCall(
    "createChallenge",
    { scenarioId: SCENARIO_ID, displayName: "E2E 발신자(폐기)", difficultyLevel: "advanced", personaCardInput: CARD_INPUT },
    sender.idToken,
  );
  const before = await fsRead(`challenges/${challengeId}`);
  const del = await call("deleteChallenge", { challengeId }, sender.idToken);
  const after = await fsRead(`challenges/${challengeId}`);
  check("C", "1 동의 전 폐기(deleteChallenge) = status deleted · 카드 삭제", del.ok && after?.status === "deleted" && !("personaCard" in after) && sameValues(before?.personaCard), {
    del: del.result ?? del,
    statusAfter: after?.status,
    hadCardBefore: before ? "personaCard" in before : null,
    hasCardAfter: after ? "personaCard" in after : null,
  });
}

async function partD() {
  const sender = await signUpSender();
  const r1 = await call(
    "createChallenge",
    { scenarioId: SCENARIO_ID, displayName: "E2E 중급", difficultyLevel: "intermediate", personaCardInput: CARD_INPUT },
    sender.idToken,
  );
  check("D", "1 중급 + 카드 = invalid-argument · persona-card-not-applicable", !r1.ok && r1.status === "INVALID_ARGUMENT" && r1.details?.reason === "persona-card-not-applicable", { r1 });
  const r2 = await call(
    "createChallenge",
    { scenarioId: SCENARIO_ID, displayName: "E2E 잘못된 이름", difficultyLevel: "advanced", personaCardInput: { name: "김1" } },
    sender.idToken,
  );
  check("D", "2 규칙 밖 이름 = invalid-argument · persona-card-invalid", !r2.ok && r2.status === "INVALID_ARGUMENT" && r2.details?.reason === "persona-card-invalid", { r2 });
  // §92 — 대상이어도 다른 종류의 칸이면 거부(조용히 버리지 않는다).
  const r3 = await call(
    "createChallenge",
    { scenarioId: SCENARIO_ID, displayName: "E2E 다른 종류 칸", difficultyLevel: "advanced", personaCardInput: WRONG_KIND_INPUT },
    sender.idToken,
  );
  check("D", "4 다른 종류의 칸 = invalid-argument · persona-card-not-applicable", !r3.ok && r3.status === "INVALID_ARGUMENT" && r3.details?.reason === "persona-card-not-applicable", { r3, sent: WRONG_KIND_INPUT });
  const mine = await mustCall("listMyChallenges", {}, sender.idToken);
  const count = (mine.challenges ?? mine.items ?? []).length;
  check("D", "3 거부된 요청은 챌린지 문서를 만들지 않는다", count === 0, { count });
}

async function partE() {
  const user = await signUpSender();
  await fsWrite(`users/${user.uid}/consents/c1`, { granted: true, createdAt: new Date() });
  const created = await mustCall(
    "createSession",
    { scenarioId: SCENARIO_ID, voiceId: "generic-voice", difficultyLevel: "advanced", personaCardInput: CARD_INPUT },
    user.idToken,
  );
  const sessionId = created.sessionId;
  results.E = { sessionId };
  const s = await fsRead(`sessions/${sessionId}`);
  check("E", `1 자가 세션 카드 = v2 · self · 입력 ${CARD_VALUES.length}항목 · 고급`, s?.personaCard?.v === 2 && s.personaCard.inputBy === "self" && sameValues(s.personaCard) && s.difficultyLevel === "advanced", {
    personaCard: s?.personaCard,
  });
  const prompt = assemble(s?.personaCard?.items);
  check("E", `2 프롬프트에 카드 블록(${KIND}) · 요구 원천 0`, prompt.includes(BLOCK_HEAD) && !demandLeft(prompt), { demandLeft: demandLeft(prompt) });
  const opening = (await fsList(`sessions/${sessionId}/messages`)).find((m) => m.turnIndex === 0);
  results.E.openingText = opening?.textMasked;
  const wrong = await call(
    "createSession",
    { scenarioId: SCENARIO_ID, voiceId: "generic-voice", difficultyLevel: "advanced", personaCardInput: WRONG_KIND_INPUT },
    user.idToken,
  );
  check("E", "3 자가 세션 · 다른 종류의 칸 = persona-card-not-applicable", !wrong.ok && wrong.details?.reason === "persona-card-not-applicable", { wrong });
}

try {
  const parts = ADVANCED_ONLY ? [["E", partE]] : [["A", partA], ["B", partB], ["C", partC], ["D", partD], ["E", partE]];
  for (const [name, fn] of parts) {
    try {
      await fn();
    } catch (err) {
      check(name, "예외", false, { error: String(err?.message ?? err) });
    }
  }
} finally {
  results.failCount = failCount;
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\n결과: ${results.checks.length - failCount}/${results.checks.length} PASS → ${outFile}`);
  process.exitCode = failCount > 0 ? 1 : 0;
}
