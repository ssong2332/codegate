#!/usr/bin/env node
/**
 * (T101) `functions/lib` 전량 삭제 — 스테일 컴파일 산출물 차단.
 *
 * 설계 근거: docs/Architecture.md §20 · docs/DECISIONS.md #50.
 * `test`·`build` 스크립트 **본문 안**에서 호출된다(`pretest`/`prebuild` 훅이 아니다 —
 * `npm run test --ignore-scripts`로 건너뛸 수 있는 자리에 두지 않는다, §20.0 (1)).
 *
 * 계약(§20.4):
 *  1. 대상 경로는 **이 파일 위치 기준**으로 계산한다(`process.cwd()`에 의존하지 않는다).
 *     firebase predeploy가 `npm --prefix "$RESOURCE_DIR" run build` 형태로 부른다(firebase.json:17).
 *  2. 가드 — basename이 `lib`이고 부모에 `package.json`이 있을 때만 삭제, 아니면 exit 1.
 *  3. `rmSync(recursive, force)` — 대상이 없으면 조용히 성공(첫 실행·새 clone).
 *  4. 표준출력 1줄로 결과를 남긴다(완료 증거 ⓓ).
 *  5. 예외를 삼키지 않는다 — 실패 시 비-0 종료로 뒤 단계(tsc·테스트)까지 중단.
 *  6. `.mjs` — functions/package.json에 `"type"` 키가 없어 `.js`는 CommonJS로 해석된다.
 *     `functions/scripts/`는 tsconfig `include`(src/**\/*.ts)와 `lint`(eslint src) 양쪽을 비켜간다(§20.5).
 *
 * ⚠️ 자기 고지 — 이 스크립트가 **못 막는 것**(§20.7 (1)):
 *   `npm`을 거치지 않는 실행(예: `npx tsc && node --test lib/**\/__tests__/*.test.js`를 손으로 입력)은
 *   이 clean을 타지 않으므로 **여전히 스테일 산출물로 오염된다**. 커밋 훅(.githooks)은 테스트 실행을
 *   가로챌 수 없어 기계적 강제가 불가능하다. 완화 수단은 CLAUDE.md "Verified Commands"에 기록된
 *   명령(`npm --prefix functions test` / `npm --prefix functions run build`)을 변형 없이 쓰는 습관뿐이다.
 */
import { existsSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const target = join(packageDir, "lib");

// 가드(§20.0 (3)) — 이 저장소에서 폭발 반경이 가장 큰 한 줄이므로 무조건 검사한다.
if (basename(target) !== "lib" || !existsSync(join(packageDir, "package.json"))) {
  console.error(`[clean] refused: not a functions package lib directory: ${target}`);
  process.exit(1);
}

try {
  const existed = existsSync(target);
  rmSync(target, { recursive: true, force: true });
  if (existed && existsSync(target)) {
    // 삭제가 부분적으로 실패한 경우(예: Windows 파일 잠금)를 조용히 넘기지 않는다.
    throw new Error("directory still exists after removal");
  }
  console.log(existed ? `[clean] removed ${target}` : `[clean] nothing to remove: ${target}`);
} catch (error) {
  console.error(`[clean] failed to remove ${target}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
