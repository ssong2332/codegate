"use client";

// `?themedebug=1` 화면 색 진단 패널(2026-10-21 · S25 웨일 다크 실기 신고). 판정표 = `src/lib/phone/themeDiagnostics.ts` 머리.
//
// ⛔ 주소 쿼리에 `themedebug=1`이 없으면 **아무것도 그리지 않는다**(DOM 0 — 아래 첫 분기). 운영 빌드에서도 같은 규칙이다.
// ⛔ 관찰만 한다 — 페이지 색 · 속성 · 시트를 **읽기만** 한다. ⛔ 비밀값 · 세션 id · uid · 대화 내용을 싣지 않는다.
// ⚠️ 탭을 가로채지 않는다(`pointer-events-none`) — 종료 버튼 등 컨트롤 도달성(AC-006)에 영향 0. 문구는 영문 키 이름뿐이다.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { summarizeBrowser } from "@/lib/realtime/audioDiagnostics";
import { MESSENGER_CHAT_TOKENS, callTokensFor } from "@/lib/phone/skinTokens";
import {
  SWATCH_METHODS,
  describeAttributes,
  describeSheet,
  isThemeDebugEnabled,
  themeSwatches,
  whaleMajorVersion,
} from "@/lib/phone/themeDiagnostics";

const THEME_SWATCHES = themeSwatches(MESSENGER_CHAT_TOKENS, callTokensFor("samsung", "light"));

const POLL_MS = 1000;
const SWATCH_PX = 22;

const noopSubscribe = () => () => {};
const readEnabled = () => isThemeDebugEnabled(window.location.search);
const readEnabledOnServer = () => false;

type NavigatorWithBrands = Navigator & {
  userAgentData?: { brands?: Array<{ brand: string; version: string }>; platform?: string };
};

function mq(query: string): string {
  try {
    return window.matchMedia(query).matches ? "Y" : "n";
  } catch {
    return "?";
  }
}

function collectRows(mutations: number): Array<[string, string]> {
  const nav = navigator as NavigatorWithBrands;
  const html = document.documentElement;
  const body = document.body;
  const phone = document.querySelector<HTMLElement>(".font-phone");
  const cs = (el: Element | null) => (el ? getComputedStyle(el) : null);
  const rows: Array<[string, string]> = [
    ["browser", summarizeBrowser({ brands: nav.userAgentData?.brands ?? null, platform: nav.userAgentData?.platform ?? null, userAgent: nav.userAgent })],
    ["whale", whaleMajorVersion(nav.userAgent) ?? "-"],
    [
      "mq",
      `dark=${mq("(prefers-color-scheme: dark)")} light=${mq("(prefers-color-scheme: light)")} forced=${mq("(forced-colors: active)")} inverted=${mq("(inverted-colors: inverted)")} contrast=${mq("(prefers-contrast: more)")}`,
    ],
    ["scheme", `html=${cs(html)?.colorScheme ?? "?"} meta=${document.querySelector('meta[name="color-scheme"]')?.getAttribute("content") ?? "-"}`],
    ["filter", `html=${cs(html)?.filter ?? "?"} body=${cs(body)?.filter ?? "?"} phone=${cs(phone)?.filter ?? "-"}`],
    ["bg", `html=${cs(html)?.backgroundColor ?? "?"} body=${cs(body)?.backgroundColor ?? "?"} phone=${cs(phone)?.backgroundColor ?? "-"}`],
    ["htmlAttr", describeAttributes(Array.from(html.attributes))],
    ["bodyAttr", describeAttributes(Array.from(body.attributes))],
    ["mutations", String(mutations)],
  ];
  const sheets = Array.from(document.styleSheets);
  rows.push(["sheets", String(sheets.length)]);
  sheets.slice(0, 10).forEach((sheet, i) => {
    const node = sheet.ownerNode as HTMLElement | null;
    rows.push([
      `s${i}`,
      describeSheet(
        { tag: node?.tagName.toLowerCase() ?? "?", href: sheet.href, id: node?.id || null, text: node?.tagName === "STYLE" ? node.textContent : null },
        window.location.origin,
      ),
    ]);
  });
  return rows;
}

function pngDataUrl(hex: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = SWATCH_PX;
  canvas.height = SWATCH_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, SWATCH_PX, SWATCH_PX);
  return canvas.toDataURL("image/png");
}

function CanvasSwatch({ hex }: { hex: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, SWATCH_PX, SWATCH_PX);
  }, [hex]);
  return <canvas ref={ref} width={SWATCH_PX} height={SWATCH_PX} style={{ width: SWATCH_PX, height: SWATCH_PX }} />;
}

export default function ThemeDebugPanel() {
  const enabled = useSyncExternalStore(noopSubscribe, readEnabled, readEnabledOnServer);
  const [rows, setRows] = useState<Array<[string, string]>>([]);
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!enabled) return;
    let mutations = 0;
    const observer = new MutationObserver((list) => {
      mutations += list.length;
    });
    observer.observe(document.documentElement, { attributes: true, childList: true, subtree: false });
    observer.observe(document.head, { childList: true });
    observer.observe(document.body, { attributes: true });
    const refresh = () => setRows(collectRows(mutations));
    const first = setTimeout(() => {
      refresh();
      setImages(Object.fromEntries(THEME_SWATCHES.map((s) => [s.key, pngDataUrl(s.hex)])));
    }, 0);
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      observer.disconnect();
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-1 z-[60] max-w-[96vw] rounded px-1.5 py-1 font-mono text-[9px] leading-tight"
      style={{ top: "calc(env(safe-area-inset-top) + 60px)", backgroundColor: "rgba(0,0,0,0.6)", color: "#FFFFFF" }}
    >
      <table style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td />
            {THEME_SWATCHES.map((s) => (
              <td key={s.key} className="px-0.5 text-center">
                {s.key}
                <br />
                {s.hex}
              </td>
            ))}
          </tr>
          {SWATCH_METHODS.map((method) => (
            <tr key={method}>
              <td className="pr-1">{method}</td>
              {THEME_SWATCHES.map((s) => (
                <td key={s.key} className="px-0.5 py-0.5 text-center">
                  {method === "css" && <div style={{ width: SWATCH_PX, height: SWATCH_PX, margin: "0 auto", backgroundColor: s.hex }} />}
                  {method === "svg" && (
                    <svg width={SWATCH_PX} height={SWATCH_PX} style={{ margin: "0 auto", display: "block" }}>
                      <rect width={SWATCH_PX} height={SWATCH_PX} fill={s.hex} />
                    </svg>
                  )}
                  {method === "canvas" && <CanvasSwatch hex={s.hex} />}
                  {method === "img" &&
                    (images[s.key] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 진단 견본(데이터 URL PNG) — 최적화 대상 아님
                      <img src={images[s.key]} alt="" width={SWATCH_PX} height={SWATCH_PX} style={{ margin: "0 auto", display: "block" }} />
                    ) : null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.map(([key, value]) => (
        <div key={key} className="break-all">
          {key}={value}
        </div>
      ))}
    </div>
  );
}
