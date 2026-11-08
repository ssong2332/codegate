// ⭐ 2026-11-08 웹 안의 웹 PR-1 — 가짜 사이트 랜딩 바깥 틀(브라우저 틀) 판정표 · 렌더 · 역검증.
// 사용자 승인 계획(시안 8절 PR-1): 판정표 (진입 표면 × 스킨) → 틀 종류 · 틀 안 단추 = 뒤로/닫기만 · 자물쇠 · ⚠ 0 · 역검증.
// ⚠️ 렌더는 `renderToStaticMarkup`(문자열)이다 — 실제 배치 · 애니메이션 · sticky는 브라우저 확인이 따로 본다(renderHarness 한계 고지).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANDING_CHROME_RULES, landingChromeFor, type LandingChromeInput, type LandingFrame } from "./landingChrome.ts";
import { extractText, poisonedComponentSource, renderLandingScreen } from "../mockscreenrender/renderHarness.ts";

// ── ① 판정표 LC — 입력 전수(진입 2 × 메신저 표면 3 × 스킨 3 × 통화 표시줄 2) ────────────────────────────────────

type Expected = { rule: string; frame: LandingFrame; control: "back-sms" | "close"; messagesStrip: boolean; siteInfoIcon: boolean };

/** 사람이 적은 기대값 — 코드의 표를 다시 계산하지 않는다(표와 기대값이 함께 틀리는 공회전 방지). */
function expectedFor(i: LandingChromeInput): Expected {
  const top: Omit<Expected, "rule"> = { frame: "device-top", control: "back-sms", messagesStrip: false, siteInfoIcon: true };
  if (i.entrySurface === "in-call-sms") {
    if (i.skin === "ios") {
      return i.callBarShown
        ? { rule: "LC1", frame: "device-bottom", control: "back-sms", messagesStrip: false, siteInfoIcon: false }
        : { rule: "LC2", frame: "device-bottom", control: "back-sms", messagesStrip: true, siteInfoIcon: false };
    }
    return { rule: "LC3", ...top };
  }
  if (i.messengerSurface === "sms") {
    return i.skin === "ios"
      ? { rule: "LC4", frame: "device-bottom", control: "back-sms", messagesStrip: true, siteInfoIcon: false }
      : { rule: "LC5", ...top };
  }
  return { rule: "LC6", frame: "in-app", control: "close", messagesStrip: false, siteInfoIcon: false };
}

function allInputs(): LandingChromeInput[] {
  const out: LandingChromeInput[] = [];
  for (const entrySurface of ["messenger", "in-call-sms"] as const) {
    for (const messengerSurface of ["sms", "kakao", undefined] as const) {
      for (const skin of ["ios", "samsung", "default"] as const) {
        for (const callBarShown of [true, false]) out.push({ entrySurface, messengerSurface, skin, callBarShown });
      }
    }
  }
  return out;
}

function tableMismatches(rules = LANDING_CHROME_RULES): string[] {
  return allInputs().flatMap((input) => {
    const got = landingChromeFor(input, rules);
    const want = expectedFor(input);
    return JSON.stringify(got) === JSON.stringify(want) ? [] : [`${JSON.stringify(input)} → ${got.rule}/${got.frame} (기대 ${want.rule}/${want.frame})`];
  });
}

test("[PR-1 판정표 LC] 입력 36가지 전부가 사람이 적은 기대값과 같다 · 행 6개가 모두 쓰인다", (t) => {
  assert.deepEqual(tableMismatches(), []);
  const used = new Set(allInputs().map((input) => landingChromeFor(input).rule));
  assert.deepEqual([...used].sort(), ["LC1", "LC2", "LC3", "LC4", "LC5", "LC6"]);
  t.diagnostic(`[LC] 입력 ${allInputs().length}가지 · 행 ${used.size}개 사용`);
});

test("[PR-1 판정표 LC 역검증] 행 하나를 뺀 사본은 기대값과 어긋난다(LC2 · LC4 · LC1)", () => {
  const without = (id: string) => LANDING_CHROME_RULES.filter((rule) => rule.id !== id);
  // LC2를 빼면 통화 없는 iOS 문자함이 LC3(위 주소 막대)로 떨어진다.
  assert.ok(tableMismatches(without("LC2")).length > 0, "LC2를 빼도 표가 그대로다 — 기대값이 공회전한다");
  // LC4를 빼면 iOS 문자형 메신저가 LC5(위 주소 막대)로 떨어진다.
  assert.ok(tableMismatches(without("LC4")).length > 0, "LC4를 빼도 표가 그대로다");
  // LC1을 빼면 통화 중 iOS 문자함에 '◀ 메시지'가 생긴다(LC2가 잡는다) — 통화 표시줄과 겹친다.
  const leaked = allInputs()
    .filter((i) => i.entrySurface === "in-call-sms" && i.skin === "ios" && i.callBarShown)
    .map((i) => landingChromeFor(i, without("LC1")));
  assert.ok(leaked.every((c) => c.messagesStrip), "LC1을 뺀 사본이 통화 중 '◀ 메시지'를 만들지 않는다 — 역검증이 공회전한다");
});

// ── ② 렌더 — 틀 종류 · 틀 안 단추 집합(동작하는 단추만 — O1 b) · 자물쇠 · ⚠ 0 ───────────────────────────────────

const LANDING_ID = "parcel-redelivery";
const HOST = "parcel-resend-desk.invalid";
const SITE_NAME = "종합물류 재배송 접수처";
const TUNE_GLYPH = '<circle cx="16" cy="7" r="2"';
const GLOBE_GLYPH = '<circle cx="12" cy="12" r="8.5"';
const G437_WORDS = ["모의", "훈련용", "AI 훈련용", "가상", "재현"];

type Case = { label: string; props: Record<string, unknown>; frame: LandingFrame; buttons: string[] };

const BASE = { title: "ZZ-TITLE-ZZ", landingKind: "credential-form", landingId: LANDING_ID, onClose: () => {} };
const CASES: Case[] = [
  { label: "LC3 문자함 · 기본", props: { ...BASE, entrySurface: "in-call-sms", onHide: () => {} }, frame: "device-top", buttons: ["문자"] },
  { label: "LC3 문자함 · 삼성", props: { ...BASE, entrySurface: "in-call-sms", skin: "samsung", onHide: () => {} }, frame: "device-top", buttons: ["문자"] },
  { label: "LC1 문자함 · iOS · 통화 중", props: { ...BASE, entrySurface: "in-call-sms", skin: "ios", onHide: () => {} }, frame: "device-bottom", buttons: ["문자"] },
  {
    label: "LC2 문자함 · iOS · 통화 없음",
    props: { ...BASE, entrySurface: "in-call-sms", skin: "ios", callBarShown: false, onHide: () => {} },
    frame: "device-bottom",
    buttons: ["메시지", "문자"],
  },
  { label: "LC5 문자형 메신저 · 삼성", props: { ...BASE, messengerSurface: "sms", skin: "samsung" }, frame: "device-top", buttons: ["문자"] },
  { label: "LC4 문자형 메신저 · iOS", props: { ...BASE, messengerSurface: "sms", skin: "ios" }, frame: "device-bottom", buttons: ["메시지", "문자"] },
  { label: "LC6 대화방형 메신저", props: { ...BASE, messengerSurface: "kakao" }, frame: "in-app", buttons: ["닫기"] },
  { label: "LC6 메신저 표면 부재(종전 호출부)", props: { ...BASE }, frame: "in-app", buttons: ["닫기"] },
];

/** 틀 마크업 = 본문 래퍼 앞(위 막대 · '◀ 메시지') + 아래 떠 있는 막대. 본문 안 폼 단추는 틀이 아니다. */
function frameMarkup(markup: string): string {
  const body = markup.indexOf('class="mx-auto flex');
  assert.ok(body > 0, "본문 래퍼를 찾지 못했다 — 틀/본문 경계 판정이 공회전한다");
  const pill = markup.indexOf('class="sticky bottom-0');
  return markup.slice(0, body) + (pill > body ? markup.slice(pill) : "");
}

function buttonNames(markup: string): string[] {
  return [...markup.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map(([, attrs, inner]) => {
    const label = /aria-label="([^"]*)"/.exec(attrs)?.[1];
    return label ?? extractText(inner).split("\n").filter((line) => line !== "◀").join(" ");
  });
}

function detectedFrame(frame: string): LandingFrame | "unknown" {
  if (frame.includes('class="sticky bottom-0')) return "device-bottom";
  if (frame.includes(TUNE_GLYPH)) return "device-top";
  if (frame.includes('aria-label="닫기"')) return "in-app";
  return "unknown";
}

/** 한 렌더의 틀 위반 — 본 단언과 역검증이 같은 함수를 쓴다. */
function frameViolations(markup: string, want: Case): string[] {
  const out: string[] = [];
  const frame = frameMarkup(markup);
  const text = extractText(frame);
  const got = detectedFrame(frame);
  if (got !== want.frame) out.push(`틀 ${got} (기대 ${want.frame})`);
  const names = buttonNames(frame);
  if (JSON.stringify(names) !== JSON.stringify(want.buttons)) out.push(`틀 단추 [${names.join(", ")}] (기대 [${want.buttons.join(", ")}])`);
  if (!text.includes(HOST)) out.push("주소(가짜 호스트)가 틀에 없다");
  for (const mark of ["🔒", "⚠", "안전한 연결", "보안 연결"]) if (text.includes(mark)) out.push(`자물쇠/경고 표시: ${mark}`);
  if (frame.includes(GLOBE_GLYPH)) out.push("옛 지구본 아이콘이 남았다");
  if (/font-mono/.test(frame)) out.push("모노 글꼴");
  for (const word of G437_WORDS) if (text.includes(word)) out.push(`G437 낱말: ${word}`);
  if (want.frame === "in-app" && !text.split("\n").includes(SITE_NAME)) out.push("메신저 안 브라우저 제목(사이트 이름)이 없다");
  if (want.frame !== "device-top" && frame.includes(TUNE_GLYPH)) out.push("안드로이드형이 아닌데 사이트 정보 아이콘이 있다");
  return out;
}

test("[PR-1 렌더] 진입 × 스킨 8갈래 — 틀 종류 · 틀 안 단추(동작하는 것만) · 주소 · 자물쇠/⚠/지구본 0 · G437 0", (t) => {
  const rows: string[] = [];
  for (const c of CASES) {
    const { markup } = renderLandingScreen(c.props);
    assert.deepEqual(frameViolations(markup, c), [], c.label);
    rows.push(`${c.label}=${c.frame}[${c.buttons.join("·")}]`);
  }
  t.diagnostic(`[PR-1 렌더] ${rows.join(" / ")}`);
});

test("[PR-1 렌더] 메신저 안 브라우저 = ✕ 다음 제목 · 주소 두 줄(제목이 주소보다 앞) · iOS형 주소는 떠 있는 막대 안", () => {
  const inApp = renderLandingScreen({ ...BASE, messengerSurface: "kakao" }).markup;
  const frame = frameMarkup(inApp);
  assert.ok(frame.indexOf('aria-label="닫기"') < frame.indexOf(SITE_NAME), "✕가 제목보다 앞이 아니다");
  assert.ok(frame.indexOf(SITE_NAME) < frame.indexOf(HOST), "제목이 주소보다 앞이 아니다");
  const ios = renderLandingScreen({ ...BASE, entrySurface: "in-call-sms", skin: "ios", onHide: () => {} }).markup;
  const pill = ios.slice(ios.indexOf('class="sticky bottom-0'));
  assert.ok(pill.includes(HOST), "iOS형 주소가 아래 떠 있는 막대 안에 없다");
  assert.equal(ios.slice(0, ios.indexOf('class="mx-auto flex')).includes(HOST), false, "iOS형인데 위에도 주소 막대가 있다");
});

// ── ③ 렌더 역검증 — 같은 하네스 · 같은 렌더 경로(G139)로 오염 사본을 그린다 ─────────────────────────────────

test("[PR-1 렌더 역검증] 동작 없는 단추 추가 · 통화 중 '◀ 메시지' · 자물쇠 아이콘을 넣은 사본은 각각 실패한다", () => {
  const top = CASES[0];
  const onCall = CASES[2];

  const extraButton = poisonedComponentSource("{backButton}", '{backButton}<button type="button" aria-label="새로고침">↻</button>');
  assert.notEqual(extraButton.poisoned, extraButton.original, "오염 지점(위 주소 막대 단추)을 찾지 못했다");
  const v1 = frameViolations(renderLandingScreen(top.props, extraButton.overrides).markup, top);
  assert.deepEqual(v1, ["틀 단추 [문자, 새로고침] (기대 [문자])"]);

  const stripOnCall = poisonedComponentSource("{chrome.messagesStrip && backAction && (", "{backAction && (");
  assert.notEqual(stripOnCall.poisoned, stripOnCall.original, "오염 지점('◀ 메시지' 조건)을 찾지 못했다");
  const v2 = frameViolations(renderLandingScreen(onCall.props, stripOnCall.overrides).markup, onCall);
  assert.deepEqual(v2, ["틀 단추 [메시지, 문자] (기대 [문자])"]);

  const lock = poisonedComponentSource('<PhoneIcon name="tune" size={16} />', "<span>🔒</span>");
  assert.notEqual(lock.poisoned, lock.original, "오염 지점(사이트 정보 아이콘)을 찾지 못했다");
  const v3 = frameViolations(renderLandingScreen(top.props, lock.overrides).markup, top);
  assert.ok(v3.includes("자물쇠/경고 표시: 🔒"), `자물쇠를 못 잡았다: ${v3.join(" · ")}`);
});

// ── ④ 배선 — 호출부가 판정표 입력을 넘긴다 · 넘어가는 순간 연출이 움직임 줄이기에서 꺼진다 ──────────────────────

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

function wiringViolations(overlay: string, chat: string, css: string): string[] {
  const out: string[] = [];
  if (!overlay.includes("callBarShown={!noActiveCall}")) out.push("문자함이 통화 표시줄 여부를 넘기지 않는다(LC1/LC2)");
  if (!/view === "landing" \? "landing-page-enter /.test(overlay)) out.push("문자함 랜딩 보기에 넘어가는 연출이 없다");
  if (!chat.includes("messengerSurface={surface}")) out.push("메신저가 문자형/대화방형을 넘기지 않는다(LC4~LC6)");
  const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
  for (const cls of [".landing-page-enter", ".landing-progress"]) {
    if (!css.includes(`${cls} {`)) out.push(`${cls} 규칙이 없다`);
    if (!reduced.includes(cls)) out.push(`${cls}가 움직임 줄이기에서 꺼지지 않는다`);
  }
  return out;
}

test("[PR-1 배선] 문자함 · 메신저가 판정표 입력을 넘기고 넘어가는 연출은 움직임 줄이기에서 꺼진다", () => {
  assert.deepEqual(
    wiringViolations(read("../../components/InCallSmsOverlay.tsx"), read("../../components/MessengerChatRoom.tsx"), read("../../app/globals.css")),
    [],
  );
});

test("[PR-1 배선 역검증] 입력을 안 넘기거나 움직임 줄이기 규칙을 지운 사본은 각각 실패한다", () => {
  const overlay = read("../../components/InCallSmsOverlay.tsx");
  const chat = read("../../components/MessengerChatRoom.tsx");
  const css = read("../../app/globals.css");
  const noCallBar = overlay.replace("callBarShown={!noActiveCall}", "");
  const noSurface = chat.replace("messengerSurface={surface}", "");
  const noReduce = css.replace(/\.landing-page-enter,\s*\n\s*\.landing-progress \{\s*\n\s*animation: none;/, "");
  assert.notEqual(noCallBar, overlay);
  assert.notEqual(noSurface, chat);
  assert.notEqual(noReduce, css, "오염 지점(움직임 줄이기 블록)을 찾지 못했다");
  assert.deepEqual(wiringViolations(noCallBar, chat, css), ["문자함이 통화 표시줄 여부를 넘기지 않는다(LC1/LC2)"]);
  assert.deepEqual(wiringViolations(overlay, noSurface, css), ["메신저가 문자형/대화방형을 넘기지 않는다(LC4~LC6)"]);
  assert.deepEqual(wiringViolations(overlay, chat, noReduce), [
    ".landing-page-enter가 움직임 줄이기에서 꺼지지 않는다",
    ".landing-progress가 움직임 줄이기에서 꺼지지 않는다",
  ]);
});
