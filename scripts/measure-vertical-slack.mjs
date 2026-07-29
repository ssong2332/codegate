#!/usr/bin/env node
// 세로 여백 실측 하네스 — UX.md P-30 (5) 증거표를 **누구나 재생성할 수 있게** 하는 도구.
//
// ════════════════════════════════════════════════════════════════════════════════════
// ⭐ 왜 이 파일이 존재하는가
// ════════════════════════════════════════════════════════════════════════════════════
// `docs/UX.md` OQ-U34가 *"이 저장소에는 픽셀을 기계로 잴 수단이 없다"* 로 열려 있고, P-30 (5)는
// *"완료 판정은 사람이 브라우저에서 읽은 값으로만 성립한다"* 고 못 박는다. 그 결과 D-62/D-63
// 구현의 증거표(273.02 / 534.52 / 320 …)가 **한 사람의 1회 세션 안에서만 재현 가능**해지는
// 문제가 있었다(PR #180 reviewer Critical C1). 이 스크립트는 그 값을 만든 절차를 그대로 담는다.
// ⛔ **이 도구가 OQ-U34를 닫지는 않는다** — 신규 의존성 없이 되는 범위만 담았고, 도입 판단
//    (jsdom-layout·Playwright 등)은 architect 소관이다. 여기서는 **Node에 이미 있는 것만** 쓴다.
//
// ════════════════════════════════════════════════════════════════════════════════════
// ⛔ 무엇을 측정하는가 — `out/` **정적 프로덕션 빌드**다. `npm run dev`가 아니다.
// ════════════════════════════════════════════════════════════════════════════════════
// (1) **`next dev`(Next 16 / Turbopack)는 헤드리스 Chrome에서 앱 루트가 하이드레이트되지 않는다.**
//     2026-07-29 실측: 청크 26개 전부 HTTP 200 · JS 예외 0건 · dev 오버레이(`nextjs-portal`)는
//     렌더되는데 `document.querySelector('main')`은 끝까지 **null**. 격리 워크트리 서버와 다른
//     체크아웃의 서버 **양쪽에서 동일 재현**되므로 트리 문제가 아니다. ⇒ dev 경로는 못 쓴다.
// (2) **프로덕션 빌드가 오히려 정확하다** — 배포본과 같은 조건이다. `src/app/(auth)/login/page.tsx`
//     의 "개발 전용 빠른 로그인" 블록은 `NODE_ENV !== "production"` 게이팅이라 dev에서만 렌더되고
//     **하단 높이를 바꾼다**. (`NODE_ENV` 의존 마크업은 실측상 그 한 곳뿐이라 다른 화면은 무관.)
//
// 사전 준비:
//   1) 워크트리에 `.env`(+ 배포본과 맞추려면 `.env.production`)가 있어야 한다. 없으면 TS 컴파일은
//      성공한 뒤 정적 생성 단계에서 `auth/invalid-api-key`로 죽는다(CLAUDE.md 빌드 행 참조).
//   2) `npm run build`
//   3) `node scripts/measure-vertical-slack.mjs --screen=all`
//
// ════════════════════════════════════════════════════════════════════════════════════
// ⚠️ Chrome 실행 경로는 환경 의존이다
// ════════════════════════════════════════════════════════════════════════════════════
// 아래 CANDIDATES를 순서대로 확인하고, 못 찾으면 **에러로 멈춘다**(조용히 다른 브라우저를 쓰지
// 않는다). 대체 방법 3가지:
//   ㄱ. `--chrome="C:\path\to\chrome.exe"` 인자
//   ㄴ. `CHROME_PATH` 환경변수
//   ㄷ. Chromium 계열이면 무엇이든 된다(Edge `msedge.exe`도 CDP 동일) — 경로만 넘기면 된다.
// 이 스크립트는 Node 22+ 전역 `WebSocket`(CDP 연결)과 `fetch`만 쓴다. **의존성 0건**이며
// 어떤 npm 스크립트·빌드·테스트 체인에도 끼어들지 않는다(수동 실행 전용).
//
// ════════════════════════════════════════════════════════════════════════════════════
// 사용법
// ════════════════════════════════════════════════════════════════════════════════════
//   --screen=ux-013|ux-003|all      측정 대상(기본 all)
//   --viewports=375x812,720x1335    측정 뷰포트(기본은 화면별 기본 목록 = 증거표의 그 목록)
//   --out=out                       정적 빌드 디렉터리
//   --chrome=<path>                 Chrome 실행 파일
//   --json                          표 대신 원본 JSON
//   --probe=apply|revert|status     UX-003 측정용 소스 프로브(아래 참조)
//
// ⛔ **UX-003(/clone/wait)은 프로브 없이는 못 잰다** — 이 화면은 ① RouteGuard 인증 게이트 뒤에
//    있고 ② `cloneStatus` 구독이 pending을 내려줘야 진행 카드가 렌더된다. 프로덕션 정적 빌드에는
//    둘 다 없다. `--probe=apply`가 **소스 2줄**(PUBLIC_PATHS에 경로 추가 · 초기 state 고정)을
//    바꿔 그 상태를 만든다. **before/after 양쪽에 똑같이 적용해야** 비교가 성립하고, 끝나면
//    반드시 `--probe=revert` 후 `git status`로 원복을 확인한다(프로브는 절대 커밋하지 않는다).
//
//   예) 증거표 재생성
//       npm run build && node scripts/measure-vertical-slack.mjs --screen=ux-013
//       node scripts/measure-vertical-slack.mjs --probe=apply && npm run build \
//         && node scripts/measure-vertical-slack.mjs --screen=ux-003 \
//         && node scripts/measure-vertical-slack.mjs --probe=revert
//
//   예) 역검증(상한을 지우면 여백이 다시 커지는가)
//       소스에서 `max-h-[256px] ` 한 토큰만 지우고 → npm run build → 같은 명령 → 값 복귀 확인 → 원복

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, statSync, createReadStream } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

// ── Chrome 탐색 ────────────────────────────────────────────────────────────────────
const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

function resolveChrome(explicit) {
  const list = explicit ? [explicit, ...CANDIDATES] : CANDIDATES;
  const hit = list.find((p) => existsSync(p));
  if (!hit) {
    throw new Error(
      "Chrome/Chromium 실행 파일을 찾지 못했다. `--chrome=<path>` 또는 `CHROME_PATH` 환경변수로 " +
        `지정하라. 확인한 후보: ${list.join(" | ")}`,
    );
  }
  return hit;
}

// ── 최소 CDP 클라이언트(전역 WebSocket) ─────────────────────────────────────────────
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.handlers = [];
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === undefined) {
        for (const h of this.handlers) h(msg);
        return;
      }
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", rej, { once: true });
    });
    return new Cdp(ws);
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  onEvent(fn) {
    this.handlers.push(fn);
  }
}

async function launchChrome(chromePath, port) {
  const profile = mkdtempSync(join(tmpdir(), "slackcap-"));
  const proc = spawn(
    chromePath,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  for (let i = 0; i < 100; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return proc;
    } catch {
      /* 아직 안 떴다 */
    }
    await sleep(200);
  }
  proc.kill();
  throw new Error(`Chrome CDP(:${port}) 기동 실패`);
}

async function openTab(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  const target = await res.json();
  return Cdp.connect(target.webSocketDebuggerUrl);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(cdp, expression) {
  const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

async function navigate(cdp, url) {
  await cdp.send("Page.enable");
  const loaded = new Promise((res) => cdp.onEvent((m) => m.method === "Page.loadEventFired" && res()));
  await cdp.send("Page.navigate", { url });
  await loaded;
}

async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  });
}

// ── 정적 서버(빌드 산출물 그대로 서빙) ───────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
};

function serve(root, port) {
  const server = createServer((req, res) => {
    let file = join(root, decodeURIComponent(req.url.split("?")[0]));
    if (!existsSync(file) || statSync(file).isDirectory()) {
      if (existsSync(`${file}.html`)) file = `${file}.html`;
      else if (existsSync(join(file, "index.html"))) file = join(file, "index.html");
      else {
        res.writeHead(404).end("not found");
        return;
      }
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(port, "127.0.0.1", () => r(server)));
}

// ── 화면 정의 ──────────────────────────────────────────────────────────────────────
// ⛔ 측정 축은 UX.md가 정한 것을 그대로 쓴다. UX-013 = "뷰포트 상단 → 아이콘 박스 상단"
//    (UX-013 v1.18 노트 수용 기준 서문), UX-003 = "제목 문단 하단 → 진행 카드 상단"(UX-003 노트).
const RECT = `(el)=>{const b=el.getBoundingClientRect();const n=(v)=>Math.round(v*100)/100;
  return {top:n(b.top),bottom:n(b.bottom),width:n(b.width),height:n(b.height)};}`;

const SCREENS = {
  "ux-013": {
    label: "UX-013 로그인",
    path: "/login",
    defaultViewports: ["375x812", "720x1335", "1440x2000", "582x678", "375x906", "430x932"],
    needsProbe: false,
    columns: [
      ["아이콘 위 여백", "iconTop"],
      ["버튼하단→뷰포트하단", "buttonBottomGap"],
      ["main 폭", "mainWidth"],
      ["스크롤", "scrollable"],
    ],
    probe: `(() => {
      const r = ${RECT};
      const icon = [...document.querySelectorAll('div')].find(d => typeof d.className === 'string' && d.className.includes('h-[72px]'));
      const btn = document.querySelector('button[aria-label="Google 계정으로 로그인"]');
      const main = document.querySelector('main');
      if (!icon || !btn || !main) return { error: 'UX-013 요소를 찾지 못했다(빌드가 최신인가? /login이 렌더됐는가?)' };
      return {
        iconTop: r(icon).top,
        buttonBottomGap: Math.round((window.innerHeight - r(btn).bottom) * 100) / 100,
        mainWidth: r(main).width,
        scrollable: document.documentElement.scrollHeight > window.innerHeight + 1,
        // 배포본과 같은 조건인지 자기 확인 — 둘 다 false여야 한다.
        devOnlyBlockPresent: [...document.querySelectorAll('p')].some(p => p.textContent.includes('개발 전용')),
        errorAlertPresent: !!document.querySelector('[role="alert"]'),
      };
    })()`,
  },
  "ux-003": {
    label: "UX-003 클론 생성 대기",
    path: "/clone/wait",
    defaultViewports: ["375x812", "720x1335", "1440x2000", "582x678", "375x906", "375x500"],
    needsProbe: true,
    columns: [
      ["제목→카드 거리", "titleToCard"],
      ["카드→상태문구 거리", "cardToStatus"],
      ["main 폭", "mainWidth"],
      ["스크롤", "scrollable"],
    ],
    probe: `(() => {
      const r = ${RECT};
      const divs = [...document.querySelectorAll('div')];
      const title = divs.find(d => typeof d.className === 'string' && /flex flex-col gap-3/.test(d.className) && d.querySelector('h1'));
      const card = divs.find(d => typeof d.className === 'string' && d.className.includes('rounded-[20px]') && d.className.includes('border-[1.5px]') && d.className.includes('bg-white'));
      const status = [...document.querySelectorAll('p')].find(p => p.textContent.includes('내 목소리로 클론을'));
      const main = document.querySelector('main');
      if (!title || !card || !status || !main) {
        return { error: 'UX-003 요소를 찾지 못했다 — --probe=apply 후 npm run build 를 했는가? (인증 게이트/구독 상태가 필요하다)' };
      }
      return {
        titleToCard: Math.round((r(card).top - r(title).bottom) * 100) / 100,
        cardToStatus: Math.round((r(status).top - r(card).bottom) * 100) / 100,
        mainWidth: r(main).width,
        scrollable: document.documentElement.scrollHeight > window.innerHeight + 1,
      };
    })()`,
  },
};

// ── UX-003 전용 소스 프로브(측정 조건을 만드는 2줄) ────────────────────────────────
// ⛔ 이것은 **측정 도구지 제품 변경이 아니다.** apply 후 반드시 revert하고 `git status`로 확인하라.
const PROBE_EDITS = [
  {
    file: "src/lib/auth/RouteGuard.tsx",
    from: 'const PUBLIC_PATHS = ["/login", "/challenge/join"];',
    to: 'const PUBLIC_PATHS = ["/login", "/challenge/join", "/clone/wait"]; /* PROBE-ONLY */',
    why: "정적 빌드에는 로그인 세션이 없어 RouteGuard가 /clone/wait를 렌더 전에 잘라낸다.",
  },
  {
    file: "src/app/clone/wait/page.tsx",
    from: 'useState<CloneState>(sessionId ? "checking" : "no-session")',
    to: 'useState<CloneState>("pending") /* PROBE-ONLY */',
    why: "진행 카드는 cloneStatus 구독이 pending을 내려줄 때만 렌더된다(측정 대상 상태).",
  },
];

function runProbe(mode) {
  if (mode === "status") {
    for (const e of PROBE_EDITS) {
      const src = readFileSync(e.file, "utf8");
      console.log(`${src.includes("PROBE-ONLY") ? "APPLIED " : "clean   "} ${e.file}`);
    }
    return;
  }
  const apply = mode === "apply";
  for (const e of PROBE_EDITS) {
    const src = readFileSync(e.file, "utf8");
    const [from, to] = apply ? [e.from, e.to] : [e.to, e.from];
    if (!src.includes(from)) {
      throw new Error(
        `${e.file}: 기대한 문자열을 찾지 못했다(이미 ${apply ? "적용" : "복구"}됐거나 소스가 바뀌었다).\n  찾은 문자열: ${from}`,
      );
    }
    writeFileSync(e.file, src.replace(from, to));
    console.log(`${apply ? "apply " : "revert"} ${e.file} — ${e.why}`);
  }
  console.log(
    apply
      ? "\n⛔ 다음: `npm run build` 후 --screen=ux-003 로 측정하고, 끝나면 반드시 `--probe=revert`."
      : "\n✅ 원복 완료. `git status` 로 확인하라(프로브는 절대 커밋하지 않는다).",
  );
}

// ── 실행 ───────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] ?? true;
  }
  return out;
}

function formatTable(screen, rows) {
  const header = ["뷰포트", ...screen.columns.map(([label]) => label)];
  const body = rows.map((row) => [row.viewport, ...screen.columns.map(([, key]) => String(row[key]))]);
  const widths = header.map((h, i) =>
    Math.max(width(h), ...body.map((r) => width(r[i] ?? ""))),
  );
  const line = (cells) => "| " + cells.map((c, i) => pad(c, widths[i])).join(" | ") + " |";
  return [line(header), "|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|", ...body.map(line)].join("\n");
}
// 한글은 폭 2로 세어야 표가 어긋나지 않는다.
const width = (s) => [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
const pad = (s, w) => s + " ".repeat(Math.max(0, w - width(s)));

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.probe) {
    runProbe(String(args.probe));
    return;
  }

  const outDir = String(args.out ?? "out");
  if (!existsSync(join(outDir, "login.html"))) {
    throw new Error(
      `\`${outDir}/login.html\` 이 없다. 먼저 \`npm run build\` 를 실행하라(이 하네스는 정적 ` +
        `프로덕션 빌드를 측정한다 — 파일 머리말의 "왜 dev가 아닌가" 참조).`,
    );
  }

  const which = String(args.screen ?? "all");
  const targets = which === "all" ? Object.keys(SCREENS) : [which];
  for (const key of targets) {
    if (!SCREENS[key]) throw new Error(`알 수 없는 --screen=${key} (가능: ${Object.keys(SCREENS).join(", ")}, all)`);
  }

  const chrome = resolveChrome(args.chrome === true ? undefined : args.chrome);
  const httpPort = Number(args.port ?? 5731);
  const cdpPort = Number(args.cdpPort ?? 9422);

  const server = await serve(outDir, httpPort);
  const proc = await launchChrome(chrome, cdpPort);
  const cdp = await openTab(cdpPort);
  const result = {};

  try {
    for (const key of targets) {
      const screen = SCREENS[key];
      const viewports = String(args.viewports ?? screen.defaultViewports.join(",")).split(",");
      const rows = [];
      for (const vp of viewports) {
        const [w, h] = vp.trim().split("x").map(Number);
        if (!w || !h) throw new Error(`뷰포트 형식은 WxH 다: "${vp}"`);
        await setViewport(cdp, w, h);
        await navigate(cdp, `http://127.0.0.1:${httpPort}${screen.path}`);
        await sleep(1200); // 하이드레이션 + effect 안정화
        await setViewport(cdp, w, h); // 네비게이션 후 재적용해야 값이 안정된다
        await sleep(300);
        const measured = await evaluate(cdp, screen.probe);
        if (measured?.error) throw new Error(`${screen.label} @ ${vp}: ${measured.error}`);
        rows.push({ viewport: `${w}x${h}`, ...measured });
      }
      result[key] = rows;
      if (!args.json) {
        console.log(`\n### ${screen.label} (${screen.path}${screen.needsProbe ? " · PROBE 필요" : ""})`);
        console.log(formatTable(screen, rows));
        if (key === "ux-013") {
          const bad = rows.filter((r) => r.devOnlyBlockPresent || r.errorAlertPresent);
          console.log(
            bad.length === 0
              ? "자기 확인: 개발 전용 블록 0건 · 오류 배너 0건 ⇒ 배포본과 같은 조건이다."
              : `⚠️ 자기 확인 실패 — 개발 전용 블록/오류 배너가 렌더됐다(${bad.map((r) => r.viewport).join(", ")}). 프로덕션 빌드가 맞는가?`,
          );
        }
      }
    }
    if (args.json) console.log(JSON.stringify(result, null, 2));
  } finally {
    proc.kill();
    server.close();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`\n[measure-vertical-slack] ${err.message}`);
    process.exit(1);
  },
);
