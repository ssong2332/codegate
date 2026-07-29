// 배포 산출물에 개발 전용 인증 우회가 남지 않았는지 검증한다 (reviewer Major #1, 2026-07-25).
//
// 배경: 개발용 빠른 로그인(src/lib/auth/devSignIn.ts)은 프로덕션 빌드에서 데드코드로 제거되는 것을
// 전제로 한다. 그런데 이 보장은 호출부의 **인라인** `process.env.NODE_ENV !== "production"` 검사에
// 달려 있고(모듈 경계를 넘는 const는 번들러가 접지 못한다 — 첫 구현이 실제로 이 함정에 빠져 버튼
// 문구가 산출물에 남았다), 그걸 강제하는 자동 장치가 없었다.
//
// 사용법: `npx next build` 후 `node scripts/verify-no-dev-auth-in-build.mjs`
// (소스 레벨 회귀는 src/lib/auth/devSignIn.guard.test.ts가 `npm test`에서 함께 잡는다.)
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "out";

// 산출물에 절대 남아서는 안 되는 문자열 — 개발용 로그인 UI와 실제 사인인 호출.
//
// T116(2026-07-29) — **층 2 확장 1건.** 렌더 검증 하네스(`src/lib/mockscreenrender/renderHarness.ts`)는
// `typescript`와 Node 내장을 쓰는 **테스트 전용** 모듈이라, 앱 코드가 실수로 import하면 테스트
// 도구가 제품 번들에 실린다. 소스 레벨 회귀는 `src/lib/mockscreenrender/harnessIsolation.test.ts`가
// `npm test`에서 항상 잡고(층 1), 이쪽은 **최종 산출물**로 실제 결과를 확인한다 — 위 devSignIn
// 2층 분업과 같은 형태다. ⚠️ 센티널 문자열 기반이라 번들러가 문자열을 변형하면 조용히 통과한다
// (그래서 `transpileModule` 토큰을 함께 본다. 그래도 완전하지 않으며 층 1이 그 구멍을 받는다).
const FORBIDDEN = [
  "익명 계정으로 빠른 로그인",
  "개발 전용 · 배포 빌드에는",
  "signInAnonymously",
  // T116 층 2 — 렌더 하네스 격리(Architecture.md §39.4)
  "T116-RENDER-HARNESS-TEST-ONLY",
  "transpileModule",
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

if (!existsSync(OUT_DIR)) {
  console.error(`FAIL: '${OUT_DIR}/' 가 없습니다. 먼저 \`npx next build\` 를 실행하세요.`);
  process.exit(1);
}

const files = walk(OUT_DIR);
let failed = false;

for (const needle of FORBIDDEN) {
  const hits = files.filter((f) => {
    try {
      return readFileSync(f, "utf8").includes(needle);
    } catch {
      return false; // 바이너리 등 읽기 실패는 무시
    }
  });
  if (hits.length > 0) {
    failed = true;
    console.error(`FAIL: 배포 산출물에 "${needle}" 가 남아 있습니다:`);
    hits.slice(0, 5).forEach((h) => console.error("   - " + h));
    if (hits.length > 5) console.error(`   ...외 ${hits.length - 5}건`);
  } else {
    console.log(`OK: "${needle}" 없음`);
  }
}

// 소스맵이 생기면 위 검사를 우회해 원본이 노출될 수 있으므로 함께 확인한다.
const maps = files.filter((f) => f.endsWith(".map"));
if (maps.length > 0) {
  failed = true;
  console.error(`FAIL: 소스맵 ${maps.length}건이 산출물에 포함돼 원본이 노출될 수 있습니다.`);
} else {
  console.log("OK: 소스맵 없음");
}

if (failed) {
  console.error("\n=> 개발용 인증 우회가 배포 산출물에 노출될 수 있습니다. 병합하지 마세요.");
  process.exit(1);
}
console.log("\nPASS: 배포 산출물에 개발 전용 인증 우회 흔적이 없습니다.");
