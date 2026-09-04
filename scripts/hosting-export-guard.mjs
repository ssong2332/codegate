// Firebase Hosting ↔ Next.js 정적 export 정합 가드.
//
// 배경 (2026-09-04 배포본 결함) — `next.config.ts`가 `output: "export"` 라 페이지가
// `out/scenarios.html` 형태로 떨어지는데 `firebase.json`의 hosting에 `cleanUrls`가 없어서
// `/scenarios` 요청이 정적 파일로 매핑되지 않고 catch-all rewrite(`** → /404.html`)로 떨어졌다.
// ⇒ **루트(`/`) 외 전 경로가 404 본문**이었다(새로고침·북마크·공유 링크·OAuth 리다이렉트 전부 파손).
// 상태 코드는 rewrite 때문에 200이라 상태만 보면 정상으로 보인다 — 그래서 오래 살아남았다.
//
// 이 가드는 그 조합이 다시 어긋나면 테스트를 빨간불로 만든다. ⛔ 라우팅을 "고치지" 않는다 —
// 알릴 뿐이다(`local-dep-guard.mjs`와 같은 트립와이어 관례).
//
// ⭐ 과차단 금지: 정상 설정에서 1건도 보고하면 안 된다(§ local-dep-guard G166과 같은 사망 조건).

/** @typedef {{ id: string, message: string }} Problem */

/**
 * `next.config.ts` 소스에서 정적 export 관련 설정만 읽는다(실행하지 않는다 — TS라 import 불가).
 * @param {string} nextConfigSource
 */
export function readNextExportSettings(nextConfigSource) {
  const source = nextConfigSource.replace(/\/\/[^\n]*/g, "");
  return {
    staticExport: /\boutput\s*:\s*["']export["']/.test(source),
    trailingSlash: /\btrailingSlash\s*:\s*true\b/.test(source),
  };
}

/**
 * @param {{ firebaseConfig: unknown, nextConfigSource: string }} input
 * @returns {Problem[]} 발견된 문제(정상이면 빈 배열)
 */
export function evaluateHostingExportConfig({ firebaseConfig, nextConfigSource }) {
  /** @type {Problem[]} */
  const problems = [];
  const hosting = /** @type {Record<string, unknown> | undefined} */ (
    /** @type {Record<string, unknown>} */ (firebaseConfig)?.["hosting"]
  );
  const next = readNextExportSettings(nextConfigSource);

  if (!next.staticExport) {
    // 정적 export가 아니면 이 가드의 전제가 통째로 바뀐다(SSR 호스팅은 규칙이 다르다).
    return [
      {
        id: "next-output-not-export",
        message:
          "next.config.ts가 더 이상 output:\"export\"가 아니다. hosting 라우팅 전제가 바뀌었으니 firebase.json을 다시 실측하고 이 가드를 갱신하라.",
      },
    ];
  }

  if (next.trailingSlash) {
    // trailingSlash:true면 export가 `scenarios/index.html`을 낸다 ⇒ cleanUrls 전제가 성립하지 않는다.
    problems.push({
      id: "next-trailing-slash-unreviewed",
      message:
        "next.config.ts에 trailingSlash:true가 생겼다. 산출물이 `<경로>/index.html` 형태로 바뀌므로 아래 hosting 규칙을 그대로 두면 안 된다 — 에뮬레이터로 다시 실측하라.",
    });
    return problems;
  }

  if (hosting?.["cleanUrls"] !== true) {
    problems.push({
      id: "hosting-missing-clean-urls",
      message:
        'firebase.json hosting에 "cleanUrls": true 가 없다. 정적 export는 `out/<경로>.html`을 내므로 이것이 없으면 `/scenarios` 같은 경로가 전부 404.html로 떨어진다(2026-09-04 배포본 결함).',
    });
  }

  if (hosting?.["trailingSlash"] !== false) {
    problems.push({
      id: "hosting-missing-trailing-slash-false",
      message:
        'firebase.json hosting에 "trailingSlash": false 가 없다. 이것이 없으면 `/scenarios/`처럼 슬래시가 붙은 URL이 404가 된다(실측: cleanUrls만으로는 안 고쳐진다).',
    });
  }

  return problems;
}
