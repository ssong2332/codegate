// T187 — 메신저 시작 전 고지(UX-022 `start-notice`)의 순서·잔존·확인 기록 게이트
// (docs/Architecture.md §72.5 D2 · §72.7 G444 · G450 · PRD v1.18 AC-087 · AC-088 — "PRD v1.18 AC-088 · T187 · §72").
//
// ⚠️ 이 저장소에는 React 렌더러 테스트 러너가 없어 "확인 전에는 첫 메시지가 그려지지 않는다"를 런타임으로
// 관측할 수 없다. 그래서 (1) 판정은 순수 함수로 내려 진리표로 고정하고 (2) 구독·렌더 배선은 소스 구조로
// 고정한다. 실제 화면 순서는 브라우저 확인(UX P-36 (8))이 진다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { decideMessengerStartNotice, type MessengerStartNoticeInput } from "./startNoticeGate.ts";
import { MESSENGER_START_NOTICE, PREROLL_NOTICE } from "./preSessionCopy.ts";

const read = (file: string) => readFileSync(file, "utf8");
/** 주석 제외 코드 — 이 저장소는 "왜 하지 않는가"를 주석에 적는다(그 서술이 금지 낱말을 담는다). */
const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const MESSENGER = "src/app/session/messenger/page.tsx";
const PLAY = "src/app/session/play/page.tsx";

// ── G444 ① 진리표 N-1~N-4(입력 8조합 전수) ─────────────────────────────────────────────────
type Decide = (input: MessengerStartNoticeInput) => string;

/** UX-022 v1.29 (3) 표를 그대로 옮긴 기대값 — 위에서부터 첫 매치. */
function expected(input: MessengerStartNoticeInput): string {
  if (input.acknowledged || input.answeredInThisTab) return "skip"; // N-2
  if (input.sessionEnded) return "ended-footer"; // N-4
  return "show"; // N-1 · N-3
}

function truthTableMismatches(decide: Decide): string[] {
  const out: string[] = [];
  for (const acknowledged of [false, true]) {
    for (const answeredInThisTab of [false, true]) {
      for (const sessionEnded of [false, true]) {
        const input = { acknowledged, answeredInThisTab, sessionEnded };
        const got = decide(input);
        if (got !== expected(input)) out.push(`${JSON.stringify(input)} → ${got}(기대 ${expected(input)})`);
      }
    }
  }
  return out;
}

test("[T187/G444 ①] decideMessengerStartNotice 진리표 N-1~N-4 — 입력 8조합 전수", (t) => {
  assert.deepEqual(truthTableMismatches(decideMessengerStartNotice), []);
  assert.equal(decideMessengerStartNotice({ acknowledged: false, answeredInThisTab: false, sessionEnded: false }), "show");
  assert.equal(decideMessengerStartNotice({ acknowledged: false, answeredInThisTab: false, sessionEnded: true }), "ended-footer");
  t.diagnostic("G444 ①: 8조합 일치 — 기록 없음·유실(N-3)은 show, 확인/받기 기록 있음(N-2)은 skip, 종료+기록 없음(N-4)은 ended-footer");
});

test("[T187/G444 ① 역검증] 항상 \"skip\"인 대역 함수는 진리표에서 실패한다", () => {
  const alwaysSkip: Decide = () => "skip";
  assert.ok(truthTableMismatches(alwaysSkip).length >= 1);
});

// ── G444 ② 구독 가드 · ③ 채팅 return 잔존 0 ───────────────────────────────────────────────
/** 메시지 구독 effect에서 `onSnapshot(` 앞에 `startNotice !== "skip"` 조기 반환 가드가 있는가. */
function subscriptionGuarded(source: string): boolean {
  const at = source.indexOf("onSnapshot(messagesQuery");
  if (at < 0) return false;
  const effectStart = source.lastIndexOf("useEffect(", at);
  const before = source.slice(effectStart, at);
  return /if \([^)]*startNotice !== "skip"[^)]*\) return;/.test(before);
}

function lastReturnText(source: string): string {
  const sf = ts.createSourceFile("m.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let component: ts.FunctionDeclaration | undefined;
  sf.forEachChild((n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === "MessengerSessionPage") component = n;
  });
  const last = component?.body?.statements.filter(ts.isReturnStatement).at(-1);
  assert.ok(last, "채팅 화면의 마지막 return을 찾지 못했다");
  return last.getText(sf);
}

function chatReturnResidue(source: string): string[] {
  const chat = lastReturnText(source);
  return ["MESSENGER_START_NOTICE", "MessengerStartNotice", ...Object.values(MESSENGER_START_NOTICE)].filter((token) =>
    chat.includes(token),
  );
}

test("[T187/G444 ②③] 구독은 확인 뒤에만 · 채팅 return에 시작 고지 잔존 0(AC-088 (b)(e))", () => {
  const messenger = read(MESSENGER);
  assert.equal(subscriptionGuarded(messenger), true, "확인 전에 대화 목록을 구독한다 — 첫 메시지가 고지보다 먼저 그려질 수 있다");
  assert.deepEqual(chatReturnResidue(messenger), [], "첫 메시지 뒤에도 시작 고지가 남는다(AC-088 (e))");
});

test("[T187/G444 ②③ 역검증 — AC-088 (f)] ⓐ 가드 없는 구독 사본 · ⓑ 채팅 목록에 고지를 넣은 사본은 실패한다", () => {
  const messenger = read(MESSENGER);
  const unguarded = messenger.replace(' || startNotice !== "skip") return;', ") return;");
  assert.notEqual(unguarded, messenger, "오염 지점을 찾지 못했다");
  assert.equal(subscriptionGuarded(unguarded), false);

  const anchor = messenger.lastIndexOf("{messages.map((message) => (");
  assert.ok(anchor > 0);
  const leaked =
    messenger.slice(0, anchor) + "<li>{MESSENGER_START_NOTICE.notice}</li>\n" + messenger.slice(anchor);
  assert.ok(chatReturnResidue(leaked).includes("MESSENGER_START_NOTICE"));
});

// ── G444 ④ 통화 구독 가드 · ⑤ 정본 문면 · ⑥ 컴포넌트 · ⑦ 난이도 화면 ─────────────────────
test("[T187/G444 ④] 통화 화면은 \"받기\" 전(incoming·connecting)에 대화를 구독하지 않는다", () => {
  assert.ok(read(PLAY).includes('if (!sessionId || phase === "incoming" || phase === "connecting") return;'));
});

test("[T187/G444 ⑤] 세션 전 문면 = UX 정본(글자 단위) · PREROLL_NOTICE 바이트 무변경", () => {
  assert.equal(PREROLL_NOTICE, "지금부터 재생되는 음성은 실제 전화가 아니라 AI로 합성된 훈련용 음성입니다.");
  assert.deepEqual(
    { ...MESSENGER_START_NOTICE },
    {
      title: "메시지 훈련을 시작합니다",
      notice: "지금부터 받는 메시지는 실제 연락이 아니라 AI 훈련 프로그램이 보내는 훈련용 메시지입니다.",
      kakaoDisclaimer: "카카오톡 실제 서비스와 무관한 훈련용 재현입니다.",
      stopHint: "언제든 '훈련 종료'로 멈출 수 있습니다.",
      confirmLabel: "메시지 보기",
    },
  );
});

/** 컴포넌트 구조 위반 — 카카오 면책은 `surface === "kakao" &&` 아래에서만 · props에 난이도/채널 0. */
function startNoticeComponentViolations(source: string): string[] {
  const out: string[] = [];
  const sf = ts.createSourceFile("n.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const uses: ts.Node[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isPropertyAccessExpression(n) && n.getText(sf) === "MESSENGER_START_NOTICE.kakaoDisclaimer") uses.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (uses.length !== 1) out.push(`kakaoDisclaimer 사용처 ${uses.length}회`);
  for (const use of uses) {
    let node: ts.Node | undefined = use.parent;
    while (node && !(ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)) {
      node = node.parent;
    }
    const left = node ? (node as ts.BinaryExpression).left.getText(sf) : "";
    if (left !== 'surface === "kakao"') out.push(`kakaoDisclaimer 조건이 "${left}"다`);
  }
  const propsType = /type MessengerStartNoticeProps = \{([\s\S]*?)\};/.exec(source)?.[1] ?? "";
  if (/difficult|level|challenge|channel|recipient/i.test(propsType)) out.push("props에 난이도·채널 입력이 있다(AC-065 · D-79)");
  if (/role="alert"/.test(codeOnly(source))) out.push('role="alert"(경고 표현 금지)');
  return out;
}

test("[T187/G444 ⑥] MessengerStartNotice — 카카오 면책은 카카오 표면에서만 · props에 난이도·채널 0 · 경고 표현 0", () => {
  assert.deepEqual(startNoticeComponentViolations(read("src/components/MessengerStartNotice.tsx")), []);
});

test("[T187/G444 ⑥ 역검증] 면책을 조건 없이 그리거나 props에 난이도를 더한 사본은 실패한다", () => {
  const source = read("src/components/MessengerStartNotice.tsx");
  const unconditional = source.replace('surface === "kakao" && (', "true && (");
  assert.notEqual(unconditional, source);
  assert.ok(startNoticeComponentViolations(unconditional).some((v) => v.includes("kakaoDisclaimer 조건")));
  const withLevel = source.replace("surface: \"kakao\" | \"sms\";", "surface: \"kakao\" | \"sms\";\n  difficultyLevel?: string;");
  assert.notEqual(withLevel, source);
  assert.ok(startNoticeComponentViolations(withLevel).some((v) => v.includes("AC-065")));
});

const DIFFICULTY_PAGE = "src/app/scenarios/difficulty/page.tsx";

test("[T187/G444 ⑦] 난이도 선택 화면 머리글 — '모의 표식' 0 · 넷째 항목 = 끝난 뒤 '훈련이었습니다' 안내(AC-087 (e) · UX D-84)", () => {
  const page = read(DIFFICULTY_PAGE);
  assert.equal(codeOnly(page).includes("모의 표식"), false);
  assert.ok(page.includes("사전 고지·동의·언제든 훈련 종료·끝난 뒤 &apos;훈련이었습니다&apos; 안내는 똑같이 적용"));
});

// ── G450 — 확인 기록 키를 통화 "받기" 기록과 공유하지 않는다(T30 회귀 재발 방지) ───────────
const PENDING = "src/lib/recording/pendingSession.ts";

function keyValue(source: string, name: string): string | undefined {
  return new RegExp(`const ${name} = "([^"]+)";`).exec(source)?.[1];
}

function keySharingViolations(pending: string, messenger: string, play: string): string[] {
  const out: string[] = [];
  const ack = keyValue(pending, "START_NOTICE_ACK_SESSION_KEY");
  const answered = keyValue(pending, "ANSWERED_SESSION_KEY");
  if (!ack || !answered) out.push("키 정의를 찾지 못했다");
  else if (ack === answered) out.push("확인 기록 키 = 받기 기록 키");
  const clearStart = pending.indexOf("export function clearPendingSession");
  const clearBody = pending.slice(clearStart, pending.indexOf("\n}", clearStart));
  for (const key of ["ANSWERED_SESSION_KEY", "START_NOTICE_ACK_SESSION_KEY"]) {
    if (!clearBody.includes(`removeItem(${key})`)) out.push(`clearPendingSession이 ${key}를 지우지 않는다`);
  }
  if (messenger.includes("markSessionAnswered(")) out.push("messenger가 markSessionAnswered를 부른다");
  if (play.includes("StartNoticeAcknowledged(")) out.push("play가 시작 고지 확인 기록을 읽거나 쓴다");
  return out;
}

test("[T187/G450] 시작 고지 확인 키 ≠ 받기 키 · clearPendingSession이 둘 다 지운다 · messenger는 받기 기록에 쓰지 않는다", () => {
  assert.deepEqual(keySharingViolations(read(PENDING), read(MESSENGER), read(PLAY)), []);
});

test("[T187/G450 역검증] messenger에 markSessionAnswered(sessionId)를 넣은 사본은 실패한다", () => {
  const messenger = read(MESSENGER).replace(
    "if (sessionId) markStartNoticeAcknowledged(sessionId);",
    "if (sessionId) { markStartNoticeAcknowledged(sessionId); markSessionAnswered(sessionId); }",
  );
  assert.notEqual(messenger, read(MESSENGER), "오염 지점을 찾지 못했다");
  assert.deepEqual(keySharingViolations(read(PENDING), messenger, read(PLAY)), [
    "messenger가 markSessionAnswered를 부른다",
  ]);
});
