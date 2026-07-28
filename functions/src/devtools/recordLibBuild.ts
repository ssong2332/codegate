// 빌드 직후 `lib` 내용 해시를 기록한다(T115). `package.json`의 `build`·`test`가 `tsc` **직후**에
// 부른다 — 테스트가 실패해도 기록은 남아야 하므로 `node --test`보다 앞이다.
//
// ⛔ **이 스크립트는 절대 빌드를 실패시키지 않는다.** 기록은 관측용 보조 자료일 뿐이라, 여기서
// 터져서 빌드를 막으면 다음 사람이 이 단계를 지운다(그러면 장치 전체가 죽는다).

import * as path from "node:path";
import { appendBuildRecord } from "./libBuildHistory";

function main(): void {
  try {
    const functionsDir = path.resolve(__dirname, "../..");
    const record = appendBuildRecord(functionsDir);
    if (record === null) {
      console.log("[lib-build] lib을 찾지 못해 기록을 건너뛴다.");
      return;
    }
    console.log(`[lib-build] ${record.at} hash ${record.hash.slice(0, 12)}`);
  } catch (error) {
    console.log(`[lib-build] 기록 실패(무시하고 계속한다): ${String(error)}`);
  }
}

main();
