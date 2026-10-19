// T192 C6-R · G589(Architecture.md §79.20 (3) ④ · (11)) — `transferReach.ts` 진리표 6행의 **클라 전제** 트립와이어.
//
// 6행(폴백 ∧ 계열 B ∧ 오퍼 문서 없음 → transferReachable=false)은 *"폴백 계열 B는 오퍼가 열릴 수 없다"* 에 기대며,
// 그 전제는 **클라 코드**(G393 — 참가자 의사 setter 0)가 보장한다. 서버 함수는 그것을 볼 수 없으므로 여기서 고정한다.
// ⛔ 계약이 아니라 트립와이어다 — 빨개지면 처방은 실패 메시지에 있다. `play/page.tsx`는 **읽기만** 한다.
// 앵커 형태는 G393 회귀 게이트(`verifyCallContinuity.test.ts` — `rendered.includes("intentExpressed: verifyIntentExpressed")`)와 같다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const PAGE = "src/app/session/play/page.tsx";
const LIB = "src/lib/verifyintercept/verifyIntercept.ts";
const TRANSFER_REACH = "functions/src/scammerHangup/transferReach.ts";

const PREMISE_BROKEN =
  "폴백 계열 B 오퍼 개시 경로가 생겼다 — transferReach 6행(R4) 전제가 무너졌다. architect 재소집 · 6행을 지우기 전엔 병합 금지";

/** 주석을 걷어낸다 — 주석 속 문구가 앵커를 대신 채우지 않게. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** ⓐ 참가자 의사 상태가 setter 없는 상수다(오퍼 개시 경로 0). */
function premiseNoIntentSetter(page: string): boolean {
  const code = codeOnly(page);
  // 형식(공백 · 타입 인자 `<boolean>`)은 느슨하게, 의미(구조분해 1원소 · 초기값 false)는 엄격하게.
  if (!/const\s*\[\s*verifyIntentExpressed\s*\]\s*=\s*useState(\s*<\s*boolean\s*>)?\(\s*false\s*\)/.test(code)) return false;
  // 같은 이름을 setter와 함께 다시 선언한 줄이 생기면 전제가 깨진다.
  return !/const\s*\[\s*verifyIntentExpressed\s*,/.test(code);
}

/** ⓑ 문장 매칭 — 공백 · 중괄호 블록 · 세미콜론 유무를 허용한다. */
const GATE_FALSE = /if\s*\(\s*!\s*input\.gateReached\s*\)\s*\{?\s*return\s+false\s*;?\s*\}?/;
const SERIES_A_TRUE = /if\s*\(\s*input\.series\s*===\s*["']A["']\s*\)\s*\{?\s*return\s+true\s*;?\s*\}?/;
/** B 분기 = 본문의 **마지막** 문장이 `return input.intentExpressed`(뒤에 닫는 중괄호만 허용). */
const SERIES_B_INTENT = /return\s+input\.intentExpressed\s*;?(\s*\})*\s*$/;

/** ⓑ `shouldAnnounceVerifyOffer`의 B 분기는 참가자 의사를 그대로 반환한다(계열 A만 도달 = 개시). */
function premiseSeriesBNeedsIntent(lib: string): boolean {
  const code = codeOnly(lib);
  const start = code.indexOf("export function shouldAnnounceVerifyOffer(");
  if (start < 0) return false;
  // 입력 타입 리터럴의 닫는 `}`(`}): boolean {`)를 지나 본문만 자른다.
  const sig = /\)\s*:\s*boolean\s*\{/.exec(code.slice(start));
  if (!sig) return false;
  const bodyStart = start + sig.index + sig[0].length;
  const end = code.indexOf("\n}", bodyStart);
  if (end < 0) return false;
  const body = code.slice(bodyStart, end);
  return GATE_FALSE.test(body) && SERIES_A_TRUE.test(body) && SERIES_B_INTENT.test(body);
}

test("[G589] 폴백 계열 B 오퍼 개시 경로 0 — ⓐ 의사 setter 0 · ⓑ B 분기 = intentExpressed · ⓒ transferReach.ts 존재", () => {
  assert.ok(existsSync(TRANSFER_REACH), "ⓒ transferReach.ts가 없다 — 이 트립와이어의 보호 대상이 사라졌다(6행을 지웠다면 이 테스트도 함께 지운다)");
  assert.ok(premiseNoIntentSetter(readFileSync(PAGE, "utf8")), `ⓐ ${PREMISE_BROKEN}`);
  assert.ok(premiseSeriesBNeedsIntent(readFileSync(LIB, "utf8")), `ⓑ ${PREMISE_BROKEN}`);
});

test("[G589 역검증] setter 있는 사본 · B 분기를 바꾼 사본 · 주석으로만 남긴 사본은 전제 판정에 걸린다", () => {
  const page = readFileSync(PAGE, "utf8");
  const lib = readFileSync(LIB, "utf8");
  const withSetter = page.replace(
    "const [verifyIntentExpressed] = useState(false);",
    "const [verifyIntentExpressed, setVerifyIntentExpressed] = useState(false);",
  );
  assert.notEqual(withSetter, page, "역검증 사본이 원본과 같다 — 앵커가 원본에 없다");
  assert.equal(premiseNoIntentSetter(withSetter), false, "setter 있는 사본이 통과했다 — ⓐ 단언이 죽었다");
  const commentedOnly = page.replace(
    "const [verifyIntentExpressed] = useState(false);",
    "// const [verifyIntentExpressed] = useState(false);\n  const [verifyIntentExpressed, setVerifyIntentExpressed] = useState(false);",
  );
  assert.equal(premiseNoIntentSetter(commentedOnly), false, "주석 속 앵커가 ⓐ를 채웠다");

  const bOpens = lib.replace("return input.intentExpressed;", "return true;");
  assert.notEqual(bOpens, lib, "역검증 사본이 원본과 같다 — ⓑ 앵커가 원본에 없다");
  assert.equal(premiseSeriesBNeedsIntent(bOpens), false, "B 분기가 무조건 개시인 사본이 통과했다 — ⓑ 단언이 죽었다");
  const bWidened = lib.replace("return input.intentExpressed;", "return input.intentExpressed || input.gateReached;");
  assert.notEqual(bWidened, lib);
  assert.equal(premiseSeriesBNeedsIntent(bWidened), false, "B 분기에 다른 개시 조건을 덧붙인 사본이 통과했다");
  const withTypedSetter = page.replace(
    "const [verifyIntentExpressed] = useState(false);",
    "const [verifyIntentExpressed, setVerifyIntentExpressed] = useState<boolean>(false);",
  );
  assert.equal(premiseNoIntentSetter(withTypedSetter), false, "타입 인자 있는 setter 사본이 통과했다");
  const trueInit = page.replace("const [verifyIntentExpressed] = useState(false);", "const [verifyIntentExpressed] = useState(true);");
  assert.equal(premiseNoIntentSetter(trueInit), false, "초기값 true 사본이 통과했다");
});

test("[G589 역검증 · 형식 무관] 의미는 같고 형식만 바꾼 사본(`useState<boolean>(false)` · 중괄호 블록 · 공백)은 통과한다", () => {
  const page = readFileSync(PAGE, "utf8");
  const lib = readFileSync(LIB, "utf8");
  for (const variant of [
    "const [verifyIntentExpressed] = useState<boolean>(false);",
    "const [ verifyIntentExpressed ] = useState( false )",
  ]) {
    const copy = page.replace("const [verifyIntentExpressed] = useState(false);", variant);
    assert.notEqual(copy, page, "역검증 사본이 원본과 같다 — 앵커가 원본에 없다");
    assert.equal(premiseNoIntentSetter(copy), true, `형식만 바꾼 사본이 오탐됐다: ${variant}`);
  }
  const braced = lib
    .replace("if (!input.gateReached) return false;", "if (!input.gateReached) {\n    return false;\n  }")
    .replace('if (input.series === "A") return true;', 'if (input.series === "A") {\n    return true;\n  }')
    .replace("return input.intentExpressed;", "return input.intentExpressed");
  assert.notEqual(braced, lib);
  assert.equal(premiseSeriesBNeedsIntent(braced), true, "중괄호 블록으로 바꾼 사본이 오탐됐다");
  const typedSig = lib.replace(/\}\): boolean \{/, "})  :  boolean  {");
  assert.notEqual(typedSig, lib);
  assert.equal(premiseSeriesBNeedsIntent(typedSig), true, "반환 타입 주변 공백만 바꾼 사본이 오탐됐다");
});
