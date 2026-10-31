// ⭐ P0(2026-10-31 · docs/research/in-service-experience-plan-2026-10-31.md · 부록 out-of-service-actions-inventory-2026-10-31.md) —
// "서비스 밖 행동 유도 0건" 회귀 게이트. 사용자 원칙: *"외부에서 대출을 받아라, 금을 환전해라 라는 실제 상황으로 번지면 안된다"*.
//
// 판정표(아래 `JUDGEMENT_TABLE` — 문서 §0.1 + D9 3행). 문장 단위로 본다.
// | # | If (문장) | Then |
// |---|---|---|
// | J0 | 같은 문장에 금지 · 부정 표현(않는다 · 않게 · 말라고 하지 · 금지 …) | 규칙 문장 — 세지 않는다 |
// | J0_LABEL | 짧은 "…하기" 이름표(앱 안 화면 버튼 · 링크 칩) | O4 — 세지 않는다 |
// | J1~J11 | 아래 행의 패턴에 맞음 | 그 행으로 센다 |
// | J12 (D9 i) | 통화 · 대화 안에서 말로 불러 달라는 요구 | O4(서비스 안) — 세지 않는다 |
// | J13 (D9 ii) | 확인 차단 · 통화 유지 요구 | O5 — 세지 않는다 |
// | J14 (D9 iii) | 기기 실제 사진첩 · 신분증 사진 | O1-device — J9 패턴으로 센다 |
//
// 두 겹:
//  ① 공통 표면(`COMMON_FILES` — 모든 시나리오 프롬프트 · 클라 주입 문면) = **0건**(장부 없음). 새 문면이 서비스 밖 행동을 예시로 들면 실패한다.
//  ② 루트 표면(시나리오 프롬프트 · 흐름 변형 · 문자 · 모의 화면 · 화면 문구) = **장부와 정확히 같아야 한다**. 장부는 P2~P6에서 앱 안 화면으로
//     옮길 남은 목록이다 — 늘면 실패(새 유도 금지), 줄면 실패(장부를 같이 줄여 진척을 기록). 행별 담당 단계는 `ROW_PLAN`.
//  ③ 계좌만 있고 이체 화면 링크가 없는 문자(X6) = 장부 0건(P2에서 5 → 0).
// ⚠️ 표기를 본다(의미 아님) — 패턴 밖 표현은 못 잡는다. 문면 원천은 TypeScript 문자열 리터럴 · 템플릿 조각(주석 제외)이다.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { IN_CALL_SMS, findInCallSmsItem } from "../../scenarios/inCallSms";
import { FLOW_VARIANTS, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { isBankTransferLanding } from "../../scenarios/mockScreens";
import { sessionReachableLandingIds } from "../../scenarios/reachability";
import { OUT_OF_SERVICE_SENTENCE } from "../promptAssembly";

const FN_SRC = path.resolve(__dirname, "../../../src");
const ROOT_SRC = path.resolve(__dirname, "../../../../src");

type RowId =
  | "J1_LOAN"
  | "J2_CASH"
  | "J3_GOLD"
  | "J4_VOUCHER"
  | "J5_COIN"
  | "J6_INSTALL"
  | "J7_APP_DELETE"
  | "J8_ATM"
  | "J9_PHOTO"
  | "J10_PLACE"
  | "J11_COVER_STORY";

interface JudgementRow {
  id: RowId | "J0_RULE" | "J0_LABEL" | "J12_VERBAL" | "J13_BLOCK";
  type: string;
  pattern?: RegExp;
}

/** 문서 §0.1 판정표 + D9(2026-10-31 사용자 결정 "권고대로"). ⛔ 행을 빼거나 패턴을 넓히지 말고 바꿀 때는 문서 판정표와 같이 바꾼다. */
export const JUDGEMENT_TABLE: readonly JudgementRow[] = [
  { id: "J0_RULE", type: "규칙 문장(제외)", pattern: /않는다|않게|않고|않도록|않으면|말라고 하지|하지 마|(?<!현)금지(?!급)|쓰지 않/ },
  // "현금지급기"의 "금지"를 규칙 낱말로 오인하지 않는다(자가 검증 2번이 잡은 결함).
  { id: "J0_LABEL", type: "앱 안 화면 이름표(…하기 버튼 · 링크 칩) — O4, 세지 않음", pattern: /^[^.!?]{0,24}하기$/ },
  { id: "J1_LOAN", type: "O1-money", pattern: /대출을?\s?(받|신청|실행)|대출금|대출 가능액|대출처럼/ },
  { id: "J2_CASH", type: "O1-money", pattern: /(현금|수표)(으로|이나|을)?\s?(찾|인출|뽑)|예금을 찾/ },
  { id: "J3_GOLD", type: "O1-money", pattern: /금을 사|금으로 바꿔|금 거래소|골드바/ },
  { id: "J4_VOUCHER", type: "O1-money", pattern: /상품권을?\s?(사|구매)|핀 번호/ },
  { id: "J5_COIN", type: "O1-money", pattern: /거래소 계좌|코인으로 바꿔|코인을 사/ },
  { id: "J6_INSTALL", type: "O1-device", pattern: /앱을?\s?(하나만\s)?(설치하|깔)|조회용 앱 설치|앱스토어|플레이스토어/ },
  { id: "J7_APP_DELETE", type: "O1-device", pattern: /앱(은|을)?\s?(잠시\s)?(지우|삭제)/ },
  { id: "J8_ATM", type: "O1-physical", pattern: /현금지급기|현금인출기|ATM/ },
  { id: "J9_PHOTO", type: "O1-device (D9 iii)", pattern: /신분증.{0,6}사진|사진첩/ },
  { id: "J10_PLACE", type: "O1-physical", pattern: /(창구|지점|편의점|금은방|모텔|숙소)(에|로)\s?(가|방문|들러)/ },
  { id: "J11_COVER_STORY", type: "O1-physical", pattern: /(직원|창구).{0,15}(물으면|묻거든)/ },
  { id: "J12_VERBAL", type: "O4 (D9 i) — 통화 안 말 요구, 세지 않음" },
  { id: "J13_BLOCK", type: "O5 (D9 ii) — 확인 차단 · 통화 유지, 세지 않음" },
];

/** 장부 행 → 앱 안으로 옮길 단계(문서 §5). J8은 D7로 0건이어야 한다. */
const ROW_PLAN: Readonly<Record<RowId, string>> = {
  J1_LOAN: "P4 대출 체험",
  J2_CASH: "P5 현금 인출(문진표)",
  J3_GOLD: "P5 금",
  J4_VOUCHER: "P5 상품권",
  J5_COIN: "O4 확인(검찰 자산 검수 사이트 안) · 은퇴 변형 원문",
  J6_INSTALL: "P6 설치 화면",
  J7_APP_DELETE: "P6",
  J8_ATM: "D7 — 0건",
  J9_PHOTO: "P6 가짜 신분증 시트(D5)",
  J10_PLACE: "P5 창구 · 제3자 통화(K2)",
  J11_COVER_STORY: "P5 창구 · 제3자 통화(K2)",
};

const COUNTED = JUDGEMENT_TABLE.filter((r): r is JudgementRow & { id: RowId; pattern: RegExp } =>
  r.pattern !== undefined && r.id !== "J0_RULE" && r.id !== "J0_LABEL",
);
const RULE = JUDGEMENT_TABLE.find((r) => r.id === "J0_RULE")!.pattern!;
const LABEL = JUDGEMENT_TABLE.find((r) => r.id === "J0_LABEL")!.pattern!;

/** 문자열 리터럴 · 템플릿 조각만 모은다(주석 · 식별자 제외). */
function literalTexts(absPath: string): string[] {
  const source = readFileSync(absPath, "utf8");
  const file = ts.createSourceFile(absPath, source, ts.ScriptTarget.ES2020, true, absPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) out.push(node.text);
    else if (ts.isJsxText(node)) out.push(node.text);
    // import 경로 · 정규식은 문면이 아니다.
    if (ts.isImportDeclaration(node)) return;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n/).map((s) => s.trim()).filter(Boolean);
}

function countRows(absPath: string): Partial<Record<RowId, number>> {
  const counts: Partial<Record<RowId, number>> = {};
  for (const text of literalTexts(absPath)) {
    for (const sentence of sentences(text)) {
      if (RULE.test(sentence) || LABEL.test(sentence)) continue; // J0 · J0_LABEL
      for (const row of COUNTED) {
        if (row.pattern.test(sentence)) counts[row.id] = (counts[row.id] ?? 0) + 1;
      }
    }
  }
  return counts;
}

const sourceFiles = (dir: string, filter: (name: string) => boolean) =>
  readdirSync(dir)
    .filter((n) => /\.tsx?$/.test(n) && !n.endsWith(".test.ts") && !n.endsWith(".test.tsx") && filter(n))
    .map((n) => path.join(dir, n));

/** ① 공통 표면 — 모든 시나리오 프롬프트에 실리거나 클라가 주입하는 문면. 0건. */
const COMMON_FILES: readonly string[] = [
  ...sourceFiles(path.join(FN_SRC, "roleplay"), () => true),
  ...sourceFiles(path.join(FN_SRC, "inCallSms"), () => true),
  ...sourceFiles(path.join(FN_SRC, "verifyIntercept"), () => true),
  ...sourceFiles(path.join(FN_SRC, "scammerHangup"), () => true),
  ...["tacticFlavor.ts", "axes.ts", "verifyIntercept.ts", "escalation.ts"].map((n) => path.join(FN_SRC, "scenarios", n)),
  path.join(ROOT_SRC, "lib", "realtime", "stallRecovery.ts"),
];

/** ② 루트 표면 — 시나리오별 문면. 장부와 같아야 한다. */
const ROUTE_FILES: readonly string[] = [
  ...sourceFiles(path.join(FN_SRC, "scenarios"), (n) => n.endsWith(".prompt.ts")),
  ...["flowVariants.ts", "inCallSms.ts", "mockScreens.ts"].map((n) => path.join(FN_SRC, "scenarios", n)),
  ...sourceFiles(path.join(ROOT_SRC, "content", "scenarios"), (n) => n !== "index.ts"),
  path.join(ROOT_SRC, "components", "MessengerFakeLanding.tsx"),
];

const rel = (abs: string) => path.relative(path.resolve(FN_SRC, "../.."), abs).replace(/\\/g, "/");

/**
 * 장부(2026-10-31 · main `5cec2fb3` + P0). 키 = `파일#행`, 값 = 문장 수. ⛔ 늘리지 않는다 — 새 유도는 앱 안 화면으로 만든다.
 * 줄이면(앱 안으로 옮기면) 이 표도 같이 줄인다.
 */
const ROUTE_LEDGER: Readonly<Record<string, number>> = {
  "functions/src/scenarios/flowVariants.ts#J1_LOAN": 16, // P4
  "functions/src/scenarios/flowVariants.ts#J11_COVER_STORY": 8, // P5
  "functions/src/scenarios/flowVariants.ts#J2_CASH": 9, // P5
  "functions/src/scenarios/flowVariants.ts#J3_GOLD": 5, // P5
  "functions/src/scenarios/flowVariants.ts#J4_VOUCHER": 5, // P5
  "functions/src/scenarios/flowVariants.ts#J5_COIN": 2, // O4 확인
  "functions/src/scenarios/flowVariants.ts#J6_INSTALL": 9, // P6
  "functions/src/scenarios/flowVariants.ts#J7_APP_DELETE": 4, // P6
  "functions/src/scenarios/flowVariants.ts#J9_PHOTO": 2, // P6
  "functions/src/scenarios/grandchildImpersonation.prompt.ts#J4_VOUCHER": 1, // P5
  "functions/src/scenarios/loanScam.prompt.ts#J1_LOAN": 2, // P4
  "functions/src/scenarios/messengerParcelSmishingSms.prompt.ts#J6_INSTALL": 1, // P6
  "functions/src/scenarios/mockScreens.ts#J1_LOAN": 1, // P4
  "functions/src/scenarios/mockScreens.ts#J11_COVER_STORY": 1, // P5
  "functions/src/scenarios/mockScreens.ts#J2_CASH": 1, // P5
  "functions/src/scenarios/mockScreens.ts#J5_COIN": 2, // O4 확인
  "functions/src/scenarios/mockScreens.ts#J6_INSTALL": 3, // P6
  "functions/src/scenarios/prosecutionCooperationCall.prompt.ts#J1_LOAN": 2, // P4
  "functions/src/scenarios/prosecutionCooperationCall.prompt.ts#J5_COIN": 3, // O4 확인
  "functions/src/scenarios/taxRefundScam.prompt.ts#J6_INSTALL": 1, // P6
  "src/components/MessengerFakeLanding.tsx#J1_LOAN": 1, // P4
};

/**
 * ③ X6 — 계좌만 있고 이체 화면 링크(`fakeLandingId`)가 없는 문자. ⭐ P2(2026-10-31)에서 5건 → 0건(계좌 문자 5종이 훈련용 이체 화면 링크를 병기했다 —
 * `loan-account` · `asset-deposit-account` · `blackmail-hush-account` · `courier-customs-fee` · `courier-safe-account`). ⛔ 늘리지 않는다 — 새 계좌 문자는
 * 이체 화면 링크와 함께 만든다(참가자가 실제 뱅킹 앱을 열 이유를 만들지 않는다).
 */
const ACCOUNT_SMS_WITHOUT_SCREEN_LEDGER: readonly string[] = [];

/**
 * ④ X6 — 계좌를 **말로 불러** 송금을 요구하는데 이체 화면을 선언하지 않은 현행 변형(P2-b · 2026-10-31). 판정 = 그 변형의 조립 수법에 계좌 낭독 지시
 * (`ACCOUNT_READOUT`)가 있고 선언 문자 중 이체 화면(`fakeLandingId`)이 있는 `transfer` 문자가 없음. 남은 행마다 이유가 있다(사용자 결정 "권고대로" · 2026-10-31):
 * | 행 | 이유 |
 * |---|---|
 * | 납치 4 | G306 유지 — 실제 사례는 계좌를 전화로 부르고 문자로 보낸 사례를 찾지 못했다. 서비스 밖 위험은 D1 (b)(가상 은행 앱)로 넘긴다 |
 * | 가족 사고 4 · 손주 3 | 보류 — clone 시나리오는 Gemini Live를 타지 않아(ElevenLabs = 고정 에이전트 프롬프트 · 문자 도구 0 / 폴백 = 변형 적용) 운영 경로 확인 전 |
 * | 카드사 `fv-akj5` | #192 — 2인 챌린지 수신자 고급 조립 바이트 고정 |
 * | 환급 3 | P2-b에서 찾음(P0 실측 F2 — 수수료 선입금 계좌 낭독) · 메인 결정 전(범위 밖으로 남김) |
 * ⛔ 늘리지 않는다. P2-b에서 카드사 자가 고급 `fv-x7ue` · `fv-w3dq`가 빠졌다(피해금 이관 문자 · 화면 선언) · P2-c에서 메신저 6이 빠졌다(칩).
 */
const VERBAL_ACCOUNT_WITHOUT_SCREEN_LEDGER: readonly string[] = [
  "card-company-impersonation#fv-akj5",
  "family-accident-deepvoice#fv-4dy4",
  "family-accident-deepvoice#fv-66hh",
  "family-accident-deepvoice#fv-h5sz",
  "family-accident-deepvoice#fv-krq3",
  "grandchild-impersonation#fv-brcb",
  "grandchild-impersonation#fv-cx5y",
  "grandchild-impersonation#fv-mabg",
  "kidnapping-threat#fv-c5ih",
  "kidnapping-threat#fv-dxwu",
  "kidnapping-threat#fv-k268",
  "kidnapping-threat#fv-w7tb",
  "tax-refund-scam#fv-aqx2",
  "tax-refund-scam#fv-uk7m",
  "tax-refund-scam#fv-vtq7",
];
/** smsDeclarationConsistency.test.ts의 계좌 낭독 지시 패턴 + "부른다"(완성형 음절이라 "부르"에 안 걸린다 — 환급 문면) + "불러주는 계좌"(납치 · 손주 문면). */
const ACCOUNT_READOUT = /계좌\s*불러\s*(?:줄게|드릴게)|계좌는\s*'[^']+'\s*(?:같은|처럼)[^.]*(?:부르|부른)|불러주는 계좌/;

describe("P0 서비스 밖 행동 유도 — 판정표 고정", () => {
  it("판정표: 세는 행 11개 · 제외 행 4개(J0 규칙 · J0 이름표 · D9 i · D9 ii) · D9 iii은 세는 행", () => {
    assert.equal(COUNTED.length, 11);
    assert.deepEqual(
      JUDGEMENT_TABLE.filter((r) => r.pattern === undefined).map((r) => r.id),
      ["J12_VERBAL", "J13_BLOCK"],
    );
    assert.equal(JUDGEMENT_TABLE.find((r) => r.id === "J9_PHOTO")?.type.startsWith("O1-device"), true);
    for (const row of COUNTED) assert.ok(ROW_PLAN[row.id], `${row.id}: 담당 단계`);
  });

  it("판정표 자가 검증 — 알려진 유도 문장은 걸리고, 금지 규칙 문장은 걸리지 않는다", () => {
    const hit = (s: string) => !RULE.test(s) && !LABEL.test(s) && COUNTED.some((r) => r.pattern.test(s));
    for (const s of [
      "예: 현금을 찾아 어디로 가라, 앱을 설치하라 등",
      "지금 가까운 현금지급기로 가세요",
      "대출처럼 아직 권하지 않은 다른 수단이 있으면 그것만 권하고",
      "남은 돈이나 다른 계좌·적금·대출 가능액 같은 추가 요구",
      "그럼 편의점 가서 문화상품권 사서 뒷면 번호만 사진 찍어 보내주세요",
      "은행 직원이 용도를 물으면 생활비라고만 하라고 시킨다",
    ]) {
      assert.equal(hit(s), true, s);
    }
    assert.equal(hit(OUT_OF_SERVICE_SENTENCE.trim()), false, "공통 금지 문장 자체는 규칙 문장");
    assert.equal(hit("은행 앱·창구·ATM에서 따로 보내라고 하지 않는다"), false);
    assert.equal(hit("배송 확인 앱 설치하기"), false, "앱 안 설치 화면 링크 칩");
  });
});

describe("P0 서비스 밖 행동 유도 — ① 공통 표면 0건", () => {
  it("공통 블록 · 클라 주입 문면에 서비스 밖 행동 예시가 없다", () => {
    const found: string[] = [];
    for (const file of COMMON_FILES) {
      for (const [row, n] of Object.entries(countRows(file))) found.push(`${rel(file)}#${row}=${n}`);
    }
    assert.deepEqual(found, [], `공통 표면 유도 ${found.length}건`);
  });

  it("공통 금지 문장은 [진행 강제]에 실리는 상수다(숫자 0 · 끊기 어휘 0)", () => {
    assert.equal(/[0-9]/.test(OUT_OF_SERVICE_SENTENCE), false);
    assert.equal(/끊|종료하|마무리/.test(OUT_OF_SERVICE_SENTENCE), false);
    const source = readFileSync(path.join(FN_SRC, "roleplay", "promptAssembly.ts"), "utf8");
    assert.equal(source.split("${OUT_OF_SERVICE_SENTENCE}").length - 1, 1, "[진행 강제] 템플릿에 1회");
  });

  it("D7 — ATM · 현금지급기 이동 지시는 어디에도 없다(공통 · 루트 모두)", () => {
    for (const file of [...COMMON_FILES, ...ROUTE_FILES]) {
      assert.equal(countRows(file).J8_ATM ?? 0, 0, rel(file));
    }
  });
});

describe("P0 서비스 밖 행동 유도 — ② 루트 표면 장부", () => {
  it("루트 표면의 남은 유도 = 장부(늘면 새 유도 · 줄면 장부 갱신)", () => {
    const actual: Record<string, number> = {};
    for (const file of ROUTE_FILES) {
      for (const [row, n] of Object.entries(countRows(file))) actual[`${rel(file)}#${row}`] = n as number;
    }
    const sorted = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
    assert.deepEqual(sorted(actual), sorted({ ...ROUTE_LEDGER }), JSON.stringify(sorted(actual), null, 2));
  });

  it("③ X6 — 계좌만 있고 이체 화면 링크가 없는 문자 = 장부(P2 뒤 0건)", () => {
    const actual = Object.values(IN_CALL_SMS)
      .flat()
      .filter((item) => item.kind === "account" && !item.fakeLandingId)
      .map((item) => item.smsId)
      .sort();
    assert.deepEqual(actual, [...ACCOUNT_SMS_WITHOUT_SCREEN_LEDGER].sort());
  });

  it("④ X6 — 계좌를 말로 부르고 이체 화면이 없는 현행 변형 = 장부(P2-b 뒤 15)", () => {
    const actual = FLOW_VARIANTS.filter((v) => v.retired !== true)
      .filter((v) => {
        const prompt = resolveSessionScenarioPrompt(v.scenarioId, v.variantId);
        if (!prompt || !ACCOUNT_READOUT.test(prompt.weakenedTactics.join("\n"))) return false;
        // 이체 화면 = 선언 문자의 화면(통화) 또는 링크 칩으로 닿는 훈련용 이체 화면(메신저 — P2-c).
        if (sessionReachableLandingIds(v.scenarioId, v.variantId).some(isBankTransferLanding)) return false;
        return !v.sms.some((d) => d.purpose === "transfer" && findInCallSmsItem(v.scenarioId, d.smsId)?.fakeLandingId !== undefined);
      })
      .map((v) => `${v.scenarioId}#${v.variantId}`)
      .sort();
    assert.deepEqual(actual, [...VERBAL_ACCOUNT_WITHOUT_SCREEN_LEDGER].sort());
  });
});
