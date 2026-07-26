// T86 — 클라이언트 **화면**(모의 사기 표면)의 무해화 금지 패턴 스캔 + 신규 화면 우회 방지 게이트
// (AC-075 (b)(c), AC-072/AC-032/AC-045).
//
// **왜 별도 파일인가.** `mockScreenCopy.test.ts`(T84)는 `MessengerFakeLanding.tsx` **한 파일**의
// 구조 불변식과 카탈로그 문구 드리프트를 고정한다. 이 파일이 채우는 것은 두 가지다:
//   ① 그 파일의 실존 앱명 목록이 **8개짜리 사본**이라 서버 정본(31개)과 드리프트한다.
//   ② `src/components`에 **새 화면 파일**이 생겨도 아무 검사도 타지 않는다(기존 형제 파일 검사는
//      `/landing|install|mockup/` 이름 규칙에 걸리는 것만 본다).
//
// **왜 소스 텍스트를 읽는가.** `functions/`와 `src/`는 별도 TS 빌드 루트라 import로 공유할 수 없다
// (publicMeta 미러·mockScreenCopy 드리프트 검사와 같은 상황). 그래서 서버의 정본 목록을 **소스
// 텍스트에서 파싱해** 쓴다 — 사본을 하나 더 만들지 않기 위해서다.
//
// ⚠️ 이 테스트가 실패하면 검사를 완화하지 말고 화면 문구·코드를 고쳐라.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const CANONICAL_PATH = "functions/src/scenarios/__tests__/harmlessnessPatterns.ts";
const canonicalSource = readFileSync(CANONICAL_PATH, "utf8");

/** 주석을 제외한 실제 코드만 본다 — 이 저장소는 "왜 하면 안 되는가"를 주석에 금지어로 적는다. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** 서버 정본 파일에서 `export const NAME ... = [ ... ];` 배열 블록의 소스 텍스트를 잘라낸다. */
function canonicalArrayBlock(constName: string): string {
  const start = canonicalSource.indexOf(`export const ${constName}`);
  assert.ok(start > 0, `${CANONICAL_PATH}에 ${constName}이 없다 — 정본이 옮겨졌는지 확인하라`);
  const open = canonicalSource.indexOf("[", start);
  const close = canonicalSource.indexOf("];", open);
  assert.ok(open > 0 && close > open, `${constName} 배열 리터럴을 파싱하지 못했다`);
  return codeOnly(canonicalSource.slice(open, close));
}

/** `[ "a", "b" ]` 형태의 문자열 리터럴 목록. */
function canonicalStringList(constName: string): string[] {
  return [...canonicalArrayBlock(constName).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * `[ /x/i, /y/ ]` 형태의 **정규식 리터럴** 목록.
 *
 * ⚠️ **왜 파싱해서 쓰는가(T86 reviewer Minor 1)**: 최초 작성에서는 이 배열을 손으로 베껴 뒀는데,
 * 그러면 정본에 규칙이 늘어도 **클라 화면 스캔만 조용히 뒤처진다**(`REAL_WORLD_APP_NAMES`에는
 * 상위집합 검사를 붙여 놓고 정작 정규식 쪽엔 없었다). `functions/`와 `src/`는 별도 TS 빌드 루트라
 * import로 공유할 수 없으므로(publicMeta 미러·mockScreenCopy 드리프트 검사와 같은 상황),
 * **소스 텍스트에서 파싱해 그대로 쓴다** — 사본이 아예 존재하지 않으므로 드리프트도 없다.
 */
function canonicalPatternList(constName: string): RegExp[] {
  const patterns: RegExp[] = [];
  for (const line of canonicalArrayBlock(constName).split(/\r?\n/)) {
    const m = /^\s*\/(.+)\/([a-z]*),\s*$/.exec(line);
    if (m === null) continue;
    patterns.push(new RegExp(m[1], m[2]));
  }
  return patterns;
}

const REAL_WORLD_APP_NAMES = canonicalStringList("REAL_WORLD_APP_NAMES");

/**
 * 화면 코드에 나타나면 안 되는 스토어·설치·원격제어·가로채기 표기 — **정본에서 그대로 가져온다.**
 * 정본에 규칙이 하나 늘면 클라 화면 스캔도 같은 순간 넓어진다(손으로 갱신할 자리 없음).
 *
 * ⚠️ 정본의 나머지 두 패턴군은 여기 쓰지 않는다: `operationalPayload`(8자리+ 숫자)는 React 코드의
 * 타임스탬프·해시에 우연히 걸리고, 실존 앱명·기관명은 위 `REAL_WORLD_APP_NAMES` 스캔이 맡는다
 * (기관명은 클라 코드에서 금지 대상이 아니다 — 사칭 대상 라벨은 서버 카탈로그에서 내려온다).
 */
const SCREEN_FORBIDDEN_PATTERNS: RegExp[] = [
  ...canonicalPatternList("STORE_AND_INSTALL_PATTERNS"),
  ...canonicalPatternList("REMOTE_CONTROL_PROCEDURE_PATTERNS"),
  ...canonicalPatternList("INTERCEPTION_MEANS_PATTERNS"),
];

// ── (c) 화면 등록부 게이트 ───────────────────────────────────────────────────
//
// `src/components/*.tsx`가 늘면 여기서 걸린다. 값이 `true`면 위 금지 패턴 스캔을 탄다.
// `false`면 **왜 모의 사기 표면이 아닌지**를 이름 옆 주석으로 남긴다.
const CLIENT_SCREEN_INVENTORY: Record<string, boolean> = {
  // 참가자에게 "사기 상황"을 그리는 화면 — 전부 스캔 대상이다.
  "MessengerFakeLanding.tsx": true, // 가짜 랜딩 + 모의 앱 설치(UX-023, T84)
  "InCallSmsOverlay.tsx": true, // 통화 중 문자 오버레이(UX-027, T68)
  "VerifyCallOverlay.tsx": true, // 확인 전화 오버레이(UX-031, T83)
  "SpoofImage.tsx": true, // 발신번호 위조 카드(T12)
  // 사기 표면이 아닌 공용 컨트롤·표식 — 문구 스캔 대상이 아니다(그래도 등록은 강제한다).
  "AgeGate.tsx": false, // 연령 확인 게이트
  "CallWaveform.tsx": false, // 통화 파형 시각화
  "DrilldownOptionCard.tsx": false, // 드릴다운 선택 카드
  "EndTrainingButton.tsx": false, // 상시 종료 버튼
  "SyntheticLabel.tsx": false, // 합성 음성 표식
};

test("[T86/(c)] src/components에 화면이 추가되면 등록 없이 검사를 우회하지 못한다", () => {
  const files = readdirSync("src/components")
    .filter((name) => name.endsWith(".tsx"))
    .sort();
  assert.deepEqual(
    files,
    Object.keys(CLIENT_SCREEN_INVENTORY).sort(),
    "src/components에 화면 파일이 추가·삭제됐다. CLIENT_SCREEN_INVENTORY에 등재하라 — " +
      "모의 사기 표면이면 true(금지 패턴 스캔 대상), 아니면 false + 사유 주석. " +
      "등재하지 않으면 새 화면 문구만 무해화 검사를 안 탄다(AC-075 (c)).",
  );
});

test("[T86/(b)] 모의 사기 표면 화면 전부가 실존 앱명·스토어 표기·원격제어 절차를 담지 않는다", () => {
  const scanned = Object.entries(CLIENT_SCREEN_INVENTORY).filter(([, isSurface]) => isSurface);
  assert.ok(scanned.length >= 4, `스캔 대상 화면이 4개 이상이어야 한다(현재 ${scanned.length})`);

  for (const [fileName] of scanned) {
    const code = codeOnly(readFileSync(`src/components/${fileName}`, "utf8"));
    for (const name of REAL_WORLD_APP_NAMES) {
      assert.equal(
        code.toLowerCase().includes(name.toLowerCase()),
        false,
        `${fileName}: 실존 앱·서비스명이 화면 코드에 있으면 안 된다: ${name}`,
      );
    }
    for (const pattern of SCREEN_FORBIDDEN_PATTERNS) {
      assert.equal(
        pattern.test(code),
        false,
        `${fileName}: 금지 패턴이 화면 코드에 있으면 안 된다: ${pattern}`,
      );
    }
  }
});

test("[T86/(c)] 서버 정본 앱명 목록이 T84 사본을 포함한다(두 목록 드리프트 차단)", () => {
  // `mockScreenCopy.test.ts`가 갖고 있는 8개짜리 사본은 정본의 부분집합이어야 한다 — 정본에서
  // 이름이 사라지면 사본만 남아 "정본이 정본이 아닌" 상태가 된다.
  const copySource = readFileSync("src/components/mockScreenCopy.test.ts", "utf8");
  const start = copySource.indexOf('for (const forbidden of ["카카오뱅크"');
  assert.ok(start > 0, "T84 사본 목록을 찾지 못했다 — 위치가 바뀌었으면 이 검사를 갱신하라");
  const block = copySource.slice(start, copySource.indexOf("]", start));
  const copied = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(copied.length >= 6, `사본 목록 파싱 결과가 비었다(${copied.length}개)`);

  const canonicalLower = REAL_WORLD_APP_NAMES.map((n) => n.toLowerCase());
  for (const name of copied) {
    // 사본은 "플레이스토어"·"앱스토어"처럼 스토어 표기도 함께 갖고 있다 — 그건 패턴군 소관이다.
    if (/스토어/.test(name)) continue;
    assert.ok(
      canonicalLower.includes(name.toLowerCase()),
      `정본(${CANONICAL_PATH})에 없는 이름이 사본에만 있다: ${name} — 정본에 추가하라`,
    );
  }
  assert.ok(
    REAL_WORLD_APP_NAMES.length > copied.length,
    `정본이 사본보다 넓어야 한다(정본 ${REAL_WORLD_APP_NAMES.length} / 사본 ${copied.length})`,
  );
});

test("[T86/역검증] 금지 패턴이 화면 코드에 섞이면 위 스캔이 실제로 실패한다", () => {
  // ⚠️ 실제 컴포넌트를 오염시켰다 되돌리는 방식은 쓰지 않는다(되돌리기를 잊으면 그대로 남는다).
  const poisoned =
    'const label = "토스 앱을 앱 스토어에서 설치하고 접근성 서비스를 켜세요";\n' +
    'const url = "https://example.com/app.apk";';
  assert.ok(
    REAL_WORLD_APP_NAMES.some((n) => poisoned.toLowerCase().includes(n.toLowerCase())),
    "실존 앱명 스캔이 오염 샘플을 잡아야 한다",
  );
  const hits = SCREEN_FORBIDDEN_PATTERNS.filter((p) => p.test(poisoned));
  assert.ok(hits.length >= 4, `패턴 스캔이 4개 이상 잡아야 한다(실제 ${hits.length})`);

  // 정본 파싱이 실패해도 조용히 통과하지 않는다(빈 목록이면 스캔이 무의미해진다).
  assert.ok(REAL_WORLD_APP_NAMES.length >= 20, `정본 앱명 목록(${REAL_WORLD_APP_NAMES.length}개)`);
});

// ── T86 reviewer Minor 1 — 정본↔클라 정규식 드리프트 차단 ────────────────────

test("[T86/(c)] 화면 스캔 패턴이 정본에서 **파싱돼** 온다(손으로 베낀 사본 0건)", () => {
  // 파싱이 조용히 실패하면 `SCREEN_FORBIDDEN_PATTERNS`가 비어 스캔이 무의미해진다 — 그 상태를
  // "통과"로 읽지 않도록 세 배열 각각의 하한을 둔다(정본이 규칙을 지우면 여기서 먼저 걸린다).
  const store = canonicalPatternList("STORE_AND_INSTALL_PATTERNS");
  const remote = canonicalPatternList("REMOTE_CONTROL_PROCEDURE_PATTERNS");
  const intercept = canonicalPatternList("INTERCEPTION_MEANS_PATTERNS");
  assert.ok(store.length >= 14, `스토어·설치 패턴(${store.length}개)`);
  assert.ok(remote.length >= 10, `원격제어 절차 패턴(${remote.length}개)`);
  assert.ok(intercept.length >= 5, `가로채기 수단 패턴(${intercept.length}개)`);
  assert.equal(SCREEN_FORBIDDEN_PATTERNS.length, store.length + remote.length + intercept.length);

  // 파싱된 것이 **정본 소스의 정규식과 문자 그대로 같은가** — 파서가 일부를 흘리면 여기서 걸린다.
  for (const pattern of SCREEN_FORBIDDEN_PATTERNS) {
    assert.ok(
      canonicalSource.includes(String(pattern)),
      `파싱 결과가 정본 소스에 없다(파서 결함): ${pattern}`,
    );
  }
});

test("[T86/생존] 화면 스캔 패턴 중 검출력 0인 것이 없다(한글에 닿는 `\\b` 재발 차단)", () => {
  // reviewer Major 1과 같은 부류의 버그가 **클라 쪽으로 흘러들어오는 것**도 막는다. 서버에서는
  // 양성 샘플 1:1 등록으로 잡지만, 여기는 정본을 그대로 쓰므로 정적 검사로 충분하다.
  const offenders = SCREEN_FORBIDDEN_PATTERNS.filter((pattern) =>
    /[가-힣][^\\]{0,2}\\b|\\b[^가-힣]{0,2}[가-힣]/.test(pattern.source),
  ).map(String);
  assert.deepEqual(
    offenders,
    [],
    "한글에 닿는 `\\b`는 ASCII 단어 경계라 매치되지 않는다 — 정본에서 `\\b`를 빼라:\n" +
      offenders.join("\n"),
  );
});
