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
// | J16 (2026-11-07 · 사용자 결정 D-G1 ~ D-G6 — 설계안 §6) | 서비스 안 금 거래소 화면 문면(`IN_APP_GOLD_SURFACES` 등록 영역 — 지정 거래소 문자 · 앱 안 금 구매 화면 · 그 흐름의 단계 · 수법 · 페르소나 · 결제 · 보류 뒤 지시) | O4 — J3 금 행으로 세지 않음. ⚠️ 그 안에서도 밖 행동 표현(`IN_APP_GOLD_OUTSIDE`)이 있으면 센다 |
// | J15 (D-L9) | 서비스 안 대출 화면 문면(`IN_APP_LOAN_SURFACES` 등록 영역 — 앱 안 대출 신청 · 대출금 보관 이체 화면 · 그 화면을 여는 문자 · 그 흐름의 수법 · 상담원 통화 · 리포트 교육점) | O4 — J1 대출 행으로 세지 않음. ⚠️ 그 안에서도 밖 행동 표현(`IN_APP_LOAN_OUTSIDE`)이 있으면 센다 |
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
  id: RowId | "J0_RULE" | "J0_LABEL" | "J12_VERBAL" | "J13_BLOCK" | "J15_IN_APP_LOAN" | "J16_IN_APP_GOLD";
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
  // ⭐ D-L9(2026-11-07 사용자 결정 "앱 안 대출은 예외 (권장)") — 영역으로 판정한다(아래 `IN_APP_LOAN_SURFACES`). 패턴 없음 = 제외 행.
  { id: "J15_IN_APP_LOAN", type: "O4 (D-L9) — 서비스 안 대출 화면 안내, J1로 세지 않음(밖 행동 표현은 셈)" },
  // ⭐ 2026-11-07(사용자 결정 D-G1 ~ D-G6 — 설계안 §6) — 영역으로 판정한다(아래 `IN_APP_GOLD_SURFACES`). 패턴 없음 = 제외 행.
  { id: "J16_IN_APP_GOLD", type: "O4 (D-G) — 서비스 안 금 거래소 화면 안내, J3로 세지 않음(밖 행동 표현은 셈)" },
];

/**
 * ⭐ D-L9 — 서비스 안 대출 문면 등록부. 문자열 리터럴의 조상이 아래 중 하나면 그 문장은 J1_LOAN으로 세지 않는다.
 * ⛔ 접두사로 넓히지 않는다 — 은퇴 `fv-pgqt`의 `INSTITUTION_LOAN_DEMAND`("금융회사에서 대출을 받아" = 밖 대출)는 계속 센다(아래 역검증).
 * | 종류 | 무엇 |
 * |---|---|
 * | 변수 | 기관 고급 3통화(fv-c5fj) 수법 · 단계 · 레그 · 상담원 페르소나 · 결정 순간 · 교육점 · 대출 신청 제출 맥락 지시 |
 * | 문자 | `smsId` = 대출 안내(앱 안 신청 화면 링크) · 입금 안내(가상 캐피탈) · 대출금 보관 계좌(앱 안 이체 화면 링크) |
 * | 화면 | `landingId` · 화면 문구 표 키 = `loan-apply` · `loan-safe-transfer` · 클라 서브 컴포넌트 `LoanApplyMockup` |
 */
const IN_APP_LOAN_SURFACES = {
  variables: [
    "INSTITUTION_LOAN_APPLY_STAGE",
    "INSTITUTION_LOAN_COACH_STAGE",
    "INSTITUTION_LOAN_APPLY_DEMAND",
    "INSTITUTION_LOAN_COACH_DEMAND",
    "INSTITUTION_LOAN_TRANSFER_DEMAND",
    "INSTITUTION_LOAN_RECALL_DEMAND",
    "INSTITUTION_LOAN_LEG_PROSECUTOR",
    "INSTITUTION_LOAN_OFFICER_PERSONA",
    "INSTITUTION_LOAN_LEG_OFFICER",
    "INSTITUTION_LOAN_LEG_RECALL",
    "INSTITUTION_LOAN_DECISION_MOMENT",
    "INSTITUTION_LOAN_REPORT_LESSONS",
    "LOAN_APPLY_SUBMITTED_INSTRUCTION",
  ],
  smsIds: ["institution-loan-guide", "institution-loan-disbursed", "institution-loan-safe-account"],
  landingIds: ["loan-apply", "loan-safe-transfer"],
  functions: ["LoanApplyMockup"],
} as const;
/** 등록 영역 안에서도 세는 밖 행동 표현(창구 · 지점 방문 · 다른 앱 · 다른 금융회사 · 은행 · 금융회사에서 대출). "금융회사에서 확인 전화가 간다"(앱 안 통화)는 밖 행동이 아니다. */
const IN_APP_LOAN_OUTSIDE = /창구|지점|영업점|방문|다른\s?(앱|금융|은행|캐피탈)|(은행|금융회사)에서\s?(직접\s?)?대출을?\s?(받|신청)/;

/**
 * ⭐ J16(2026-11-07 · 사용자 결정 D-G1 ~ D-G6 "앱 안 화면으로 바꾸기" — 설계안 §6) — 서비스 안 금 거래소 문면 등록부(J15와 같은 방식). 문자열 리터럴의 조상이 아래 중
 * 하나면 그 문장은 J3_GOLD로 세지 않는다. ⛔ 접두사로 넓히지 않는다. 영역 안에서도 밖 행동 표현(`IN_APP_GOLD_OUTSIDE`)은 센다.
 * | 종류 | 무엇 |
 * |---|---|
 * | 변수 | 금 구매형 단계 · 수법 · 자산 보호 금형 페르소나 · 결정 순간 · 결제 · 보류 뒤 실시간 지시 |
 * | 문자 | `smsId` = 지정 거래소 안내(기관 고급 · 자산 보호 고급) |
 * | 화면 | `landingId` · 화면 문구 표 키 = `gold-buy` · `asset-gold-buy` · 클라 서브 컴포넌트 `GoldBuyMockup` |
 */
const IN_APP_GOLD_SURFACES = {
  variables: ["INSTITUTION_GOLD_STAGE", "INSTITUTION_GOLD_DEMAND", "ASSET_GOLD_PERSONA", "GOLD_DECISION_MOMENT", "GOLD_PURCHASED_INSTRUCTION", "GOLD_HELD_INSTRUCTION"],
  smsIds: ["institution-gold-shop", "asset-gold-shop"],
  landingIds: ["gold-buy", "asset-gold-buy"],
  functions: ["GoldBuyMockup"],
} as const;
/** 등록 영역 안에서도 세는 밖 행동 표현(창구 · 지점 · 금은방 · 매장 방문 · 다른 거래소 · 앱 · 현금 인출 · 직원 대면 제출). */
const IN_APP_GOLD_OUTSIDE = /창구|지점|영업점|방문|금은방|다른\s?(앱|거래소|매장|은행)|(현금|수표)(으로|을)?\s?(찾|인출|뽑)|직원에게\s?(제출|맡기|건네)/;

type SurfaceRegistry = { variables: readonly string[]; smsIds: readonly string[]; landingIds: readonly string[]; functions: readonly string[] };

function inSurfaceRegion(node: ts.Node, surfaces: SurfaceRegistry): boolean {
  const stringValue = (e: ts.Expression | undefined) => (e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text : undefined);
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && surfaces.variables.includes(n.name.text)) return true;
    if (ts.isFunctionDeclaration(n) && n.name && surfaces.functions.includes(n.name.text)) return true;
    if (ts.isPropertyAssignment(n) && ts.isStringLiteral(n.name) && surfaces.landingIds.includes(n.name.text)) return true;
    if (ts.isObjectLiteralExpression(n)) {
      for (const prop of n.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
        const value = stringValue(prop.initializer);
        if (prop.name.text === "smsId" && value && surfaces.smsIds.includes(value)) return true;
        if (prop.name.text === "landingId" && value && surfaces.landingIds.includes(value)) return true;
      }
    }
  }
  return false;
}

function inAppLoanRegion(node: ts.Node): boolean {
  return inSurfaceRegion(node, IN_APP_LOAN_SURFACES);
}

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

/** 문자열 리터럴 · 템플릿 조각만 모은다(주석 · 식별자 제외). `inAppLoan` = D-L9 등록 영역 안. */
function literalTexts(absPath: string, source = readFileSync(absPath, "utf8")): { text: string; inAppLoan: boolean; inAppGold: boolean }[] {
  const file = ts.createSourceFile(absPath, source, ts.ScriptTarget.ES2020, true, absPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: { text: string; inAppLoan: boolean; inAppGold: boolean }[] = [];
  const push = (node: ts.Node, text: string) => out.push({ text, inAppLoan: inAppLoanRegion(node), inAppGold: inSurfaceRegion(node, IN_APP_GOLD_SURFACES) });
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) push(node, node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) push(node, node.text);
    else if (ts.isJsxText(node)) push(node, node.text);
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

function countRows(absPath: string, source?: string): Partial<Record<RowId, number>> {
  const counts: Partial<Record<RowId, number>> = {};
  for (const { text, inAppLoan, inAppGold } of literalTexts(absPath, source)) {
    for (const sentence of sentences(text)) {
      if (RULE.test(sentence) || LABEL.test(sentence)) continue; // J0 · J0_LABEL
      for (const row of COUNTED) {
        // J15(D-L9) — 서비스 안 대출 문면은 J1로 세지 않는다 · 밖 행동 표현이 섞이면 센다.
        if (row.id === "J1_LOAN" && inAppLoan && !IN_APP_LOAN_OUTSIDE.test(sentence)) continue;
        // J16 — 서비스 안 금 거래소 문면은 J3로 세지 않는다 · 밖 행동 표현이 섞이면 센다.
        if (row.id === "J3_GOLD" && inAppGold && !IN_APP_GOLD_OUTSIDE.test(sentence)) continue;
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
  // PR-B(2026-11-07) — 기관 고급 fv-c5fj가 3통화 앱 안 대출 체험으로 바뀌어 밖 대출 유도 2문장(통화 중 "금융회사에서 대출을 받아" · 은행 직원 둘러대기)이
  // 빠졌다(16 → 14 · J11 8 → 6). 새 대출 문면은 J15 등록 영역이라 세지 않는다. 은퇴 fv-pgqt 원문은 그대로 센다.
  "functions/src/scenarios/flowVariants.ts#J1_LOAN": 14, // P4
  // ⭐ 2026-11-07(Edge 재시험 2 S7 · 사용자 결정 D-G1 ~ D-G6) — 금 구매형 결말(기관 고급 fv-g2ld · 자산 보호 고급 fv-t8ga)이 앱 안 금 거래소 화면 구매로 바뀌었다.
  // 금 문면은 J16 등록 영역이라 세지 않고(J3 5 → 0), 종전 "예금 · 적금을 찾아" 2문장(J2 9 → 7) · "판매점 직원이 용도를 물으면" 코칭 1문장(J11 6 → 5)이 빠졌다.
  // 같은 날(사용자 결정 D-G2 E1-b) — 현금 예탁형 fv-q7cn이 앱 안 출금 예약 화면으로 바뀌어 "은행 직원이 이유를 물으면 개인 용도" 코칭 1문장이 빠졌다(J11 5 → 4 —
  // 문진표 코칭으로 대체). 새 출금 예약 문면은 J2 패턴(현금으로 찾 · 인출)에 걸리지 않아 J2는 그대로(7).
  "functions/src/scenarios/flowVariants.ts#J11_COVER_STORY": 4, // P5
  "functions/src/scenarios/flowVariants.ts#J2_CASH": 7, // P5
  // 2026-11-07(Edge 시험 판 12 · 사용자 결정 "앱 안 화면 추가") — 검찰 상품권형 fv-v2mk의 상품권 문면은 이제 앱 안 구매 화면(`voucher-purchase`)을 가리킨다
  // (문자 속 구매 화면에서 사고 화면에 뜬 핀을 불러 달라 — J12 통화 안 말 요구 · O4). 패턴은 표기만 봐서 계속 센다(5 → 6 · 문자 · 화면 · 화면 문구 · 결제 뒤 지시 새 항목).
  "functions/src/scenarios/flowVariants.ts#J4_VOUCHER": 6, // O4 확인(상품권 구매 화면 안)
  "functions/src/scenarios/flowVariants.ts#J5_COIN": 2, // O4 확인
  // U7(2026-11-01) — 대환대출 설치 수법 2벌(fv-d8pw · fv-r4hc 인라인)을 상수 `LOAN_APP_INSTALL_VIA_SMS` 1개로 합쳤다(9 → 7 · 4 → 3).
  // 조립 결과의 유도 문장 수는 같다(fv-m3hd · fv-d8pw · fv-r4hc가 같은 상수 · fv-6s5p 원문 유지) — 소스 문장만 줄었다.
  // §142 PR-4 — 리포트 교육 포인트 "전화로 앱 설치를 요구받으면 그 자체로 사기"(예방 문장 · 세션 밖 리포트) +1.
  "functions/src/scenarios/flowVariants.ts#J6_INSTALL": 8, // P6
  "functions/src/scenarios/flowVariants.ts#J7_APP_DELETE": 3, // P6
  "functions/src/scenarios/flowVariants.ts#J9_PHOTO": 2, // P6
  "functions/src/scenarios/grandchildImpersonation.prompt.ts#J4_VOUCHER": 1, // P5
  "functions/src/scenarios/inCallSms.ts#J4_VOUCHER": 4, // O4 확인(상품권 구매 안내 문자 — 앱 안 구매 화면 링크)
  "functions/src/scenarios/loanScam.prompt.ts#J1_LOAN": 2, // P4
  "functions/src/scenarios/messengerParcelSmishingSms.prompt.ts#J6_INSTALL": 1, // P6
  "functions/src/scenarios/mockScreens.ts#J1_LOAN": 1, // P4
  "functions/src/scenarios/mockScreens.ts#J11_COVER_STORY": 1, // P5
  "functions/src/scenarios/mockScreens.ts#J2_CASH": 1, // P5
  "functions/src/scenarios/mockScreens.ts#J4_VOUCHER": 8, // O4 확인(상품권 구매 화면 카탈로그 · 결제 뒤 지시)
  "functions/src/scenarios/mockScreens.ts#J5_COIN": 2, // O4 확인
  // §142 — 카드사 고급 재구성 원격 지원 앱 설치 화면(서비스 안 모의 설치 화면 · P6 — 설치 화면 문면 2문장).
  "functions/src/scenarios/mockScreens.ts#J6_INSTALL": 5, // P6
  "functions/src/scenarios/prosecutionCooperationCall.prompt.ts#J1_LOAN": 2, // P4
  "functions/src/scenarios/prosecutionCooperationCall.prompt.ts#J5_COIN": 3, // O4 확인
  "functions/src/scenarios/taxRefundScam.prompt.ts#J6_INSTALL": 1, // P6
  "src/components/MessengerFakeLanding.tsx#J1_LOAN": 1, // P4
  "src/components/MessengerFakeLanding.tsx#J4_VOUCHER": 3, // O4 확인(상품권 구매 화면 문구)
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
 * | 납치 초 · 중급 2 | 2026-11-07 — 고급 2(fv-k268 · fv-w7tb)는 계좌 문자 + 이체 화면을 선언해 빠졌다(Edge 시험 판 7 · 사용자 결정 "앱 안 화면 추가"). 초 · 중급은 이번 범위 밖(시험에서 앱 밖 유도가 관측된 것은 고급) |
 * | 가족 사고 4 · 손주 3 | 보류 — clone 시나리오는 Gemini Live를 타지 않아(ElevenLabs = 고정 에이전트 프롬프트 · 문자 도구 0 / 폴백 = 변형 적용) 운영 경로 확인 전 |
 * | 카드사 `fv-akj5` | #192 — 2인 챌린지 수신자 고급 조립 바이트 고정 |
 * ⛔ 늘리지 않는다. P2-d에서 환급 3이 빠졌다(수수료 계좌 문자 · 이체 화면 — 메인 "권고대로"). P2-b에서 카드사 자가 고급 `fv-x7ue` · `fv-w3dq`가 빠졌다(피해금 이관 문자 · 화면 선언) · P2-c에서 메신저 6이 빠졌다(칩).
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
];
/** smsDeclarationConsistency.test.ts의 계좌 낭독 지시 패턴 + "부른다"(완성형 음절이라 "부르"에 안 걸린다 — 환급 문면) + "불러주는 계좌"(납치 · 손주 문면). */
const ACCOUNT_READOUT = /계좌\s*불러\s*(?:줄게|드릴게)|계좌는\s*'[^']+'\s*(?:같은|처럼)[^.]*(?:부르|부른)|불러주는 계좌/;

describe("P0 서비스 밖 행동 유도 — 판정표 고정", () => {
  it("판정표: 세는 행 11개 · 제외 행 6개(J0 규칙 · J0 이름표 · D9 i · D9 ii · D-L9 서비스 안 대출 · D-G 서비스 안 금 거래소) · D9 iii은 세는 행", () => {
    assert.equal(COUNTED.length, 11);
    assert.deepEqual(
      JUDGEMENT_TABLE.filter((r) => r.pattern === undefined).map((r) => r.id),
      ["J12_VERBAL", "J13_BLOCK", "J15_IN_APP_LOAN", "J16_IN_APP_GOLD"],
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

describe("P0 서비스 밖 행동 유도 — J15 서비스 안 대출 예외(D-L9)", () => {
  const fvPath = path.join(FN_SRC, "scenarios", "flowVariants.ts");
  it("등록부의 이름 · id가 실제로 있다(조용한 공회전 방지)", () => {
    const fv = readFileSync(fvPath, "utf8");
    const confirm = readFileSync(path.join(FN_SRC, "inCallSms", "confirmResult.ts"), "utf8");
    for (const name of IN_APP_LOAN_SURFACES.variables) assert.ok(new RegExp(`const ${name}\\b`).test(fv + confirm), name);
    for (const smsId of IN_APP_LOAN_SURFACES.smsIds) assert.ok(findInCallSmsItem("institutional-impersonation", smsId), smsId);
    const landing = readFileSync(path.join(ROOT_SRC, "components", "MessengerFakeLanding.tsx"), "utf8");
    assert.ok(landing.includes("function LoanApplyMockup("));
  });

  it("'실제 대출 받아 오라' 류는 계속 잡힌다 — 등록 영역 밖 · 영역 안 밖 행동 표현 · 은퇴 fv-pgqt 원문", () => {
    const j1 = (source: string) => countRows("sample.ts", source).J1_LOAN ?? 0;
    assert.equal(j1(`const OTHER = "금융회사에서 대출을 받아 그 돈도 안전계좌로 옮기세요.";`), 1, "등록 영역 밖");
    assert.equal(j1(`const INSTITUTION_LOAN_APPLY_STAGE = "가까운 은행 창구에 가서 대출을 받아 오세요.";`), 1, "영역 안이어도 창구");
    assert.equal(j1(`const INSTITUTION_LOAN_APPLY_STAGE = "다른 앱에서 대출을 받아 오세요.";`), 1, "영역 안이어도 다른 앱");
    assert.equal(j1(`const INSTITUTION_LOAN_APPLY_STAGE = "은행에서 대출을 받아 오세요.";`), 1, "영역 안이어도 은행에서 대출");
    assert.equal(j1(`const INSTITUTION_LOAN_COACH_STAGE = "대출 신청을 마쳤다고 하면 곧 금융회사에서 대출 실행 확인 전화가 갈 거라고 알린다.";`), 0, "앱 안 확인 전화 안내 = 예외");
    assert.equal(j1(`const INSTITUTION_LOAN_APPLY_STAGE = "문자 속 링크의 대출 신청 화면에서 대출을 신청하게 한다.";`), 0, "앱 안 화면 안내 = 예외");
    assert.equal(j1(`const INSTITUTION_LOAN_DEMAND = "그다음 금융회사에서 대출을 받아 오게 한다.";`), 1, "접두사가 같아도 등록 안 된 이름은 센다");
    // 은퇴 fv-pgqt가 쓰는 원문(바이트 고정)은 그대로 센다.
    const fv = readFileSync(fvPath, "utf8");
    const at = fv.indexOf("const INSTITUTION_LOAN_DEMAND =");
    assert.ok(at > 0);
    // 줄 끝(LF · CRLF) 무관 — 선언 끝 세미콜론까지.
    const end = fv.slice(at).search(/;\r?\n/);
    assert.ok(end > 0);
    const declaration = fv.slice(at, at + end + 1);
    assert.ok(j1(declaration) >= 1, "fv-pgqt 대출 유도 원문");
  });
});

describe("P0 서비스 밖 행동 유도 — J16 서비스 안 금 거래소 예외(D-G1 ~ D-G6)", () => {
  it("등록부의 이름 · id가 실제로 있다(조용한 공회전 방지)", () => {
    const fv = readFileSync(path.join(FN_SRC, "scenarios", "flowVariants.ts"), "utf8");
    const screens = readFileSync(path.join(FN_SRC, "scenarios", "mockScreens.ts"), "utf8");
    for (const name of IN_APP_GOLD_SURFACES.variables) assert.ok(new RegExp(`const ${name}\\b`).test(fv + screens), name);
    assert.ok(findInCallSmsItem("institutional-impersonation", "institution-gold-shop"));
    assert.ok(findInCallSmsItem("asset-protection-notice-call", "asset-gold-shop"));
    assert.ok(readFileSync(path.join(ROOT_SRC, "components", "MessengerFakeLanding.tsx"), "utf8").includes("function GoldBuyMockup("));
  });

  it("'금은방 · 다른 거래소 · 직원에게 제출' 류는 계속 잡힌다 — 등록 영역 밖 · 영역 안 밖 행동 표현", () => {
    const j3 = (source: string) => countRows("sample.ts", source).J3_GOLD ?? 0;
    assert.equal(j3(`const OTHER = "예금을 찾아 금을 사서 담당 직원에게 제출하세요.";`), 1, "등록 영역 밖");
    assert.equal(j3(`const INSTITUTION_GOLD_STAGE = "가까운 금은방에 가서 골드바를 사 오세요.";`), 1, "영역 안이어도 금은방");
    assert.equal(j3(`const INSTITUTION_GOLD_DEMAND = "다른 거래소에서 골드바를 사 두세요.";`), 1, "영역 안이어도 다른 거래소");
    assert.equal(j3(`const INSTITUTION_GOLD_STAGE = "금을 사서 담당 직원에게 제출하게 한다.";`), 1, "영역 안이어도 직원 대면 제출");
    assert.equal(j3(`const INSTITUTION_GOLD_STAGE = "문자 속 링크의 거래소 화면에서 예금으로 금을 사게 한다.";`), 0, "앱 안 화면 안내 = 예외");
    assert.equal(j3(`const INSTITUTION_GOLD_PLAN = "문자 속 링크의 거래소 화면에서 예금으로 금을 사게 한다.";`), 1, "접두사가 같아도 등록 안 된 이름은 센다");
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

  it("④ X6 — 계좌를 말로 부르고 이체 화면이 없는 현행 변형 = 장부(P2-d 뒤 12)", () => {
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
