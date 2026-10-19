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
  if (!code.includes("const [verifyIntentExpressed] = useState(false);")) return false;
  // 같은 이름을 setter와 함께 다시 선언한 줄이 생기면 전제가 깨진다.
  return !/const\s*\[\s*verifyIntentExpressed\s*,/.test(code);
}

/** ⓑ `shouldAnnounceVerifyOffer`의 B 분기는 참가자 의사를 그대로 반환한다(계열 A만 도달 = 개시). */
function premiseSeriesBNeedsIntent(lib: string): boolean {
  const code = codeOnly(lib);
  const start = code.indexOf("export function shouldAnnounceVerifyOffer(");
  if (start < 0) return false;
  // 입력 타입 리터럴의 닫는 `}`(`}): boolean {`)를 지나 본문만 자른다.
  const bodyStart = code.indexOf("): boolean {", start);
  if (bodyStart < 0) return false;
  const end = code.indexOf("\n}", bodyStart);
  const body = code.slice(bodyStart, end);
  return (
    body.includes("if (!input.gateReached) return false;") &&
    body.includes('if (input.series === "A") return true;') &&
    body.includes("return input.intentExpressed;")
  );
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
});
