// T187 — 메신저 시작 전 고지(UX-022 `start-notice`)의 순서·잔존·확인 기록 게이트
// (docs/Architecture.md §72.5 D2 · §72.7 G444 · G450 · PRD v1.18 AC-087 · AC-088 — "PRD v1.18 AC-088 · T187 · §72").
//
// ⚠️ 이 저장소에는 React 렌더러 테스트 러너가 없어 "확인 전에는 첫 메시지가 그려지지 않는다"를 런타임으로
// 관측할 수 없다. 그래서 (1) 판정은 순수 함수로 내려 진리표로 고정하고 (2) 구독·렌더 배선은 소스 구조로
// 고정한다. 실제 화면 순서는 브라우저 확인(UX P-36 (8))이 진다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import {
  decideInitialCallPhase,
  decideMessengerStartNotice,
  type InitialCallPhaseInput,
  type MessengerStartNoticeInput,
} from "./startNoticeGate.ts";
import {
  MESSENGER_START_NOTICE,
  MESSENGER_START_NOTICE_WITH_CALL,
  PRE_CALL_NOTICE,
  PREROLL_NOTICE,
} from "./preSessionCopy.ts";

const read = (file: string) => readFileSync(file, "utf8");
/** 주석 제외 코드 — 이 저장소는 "왜 하지 않는가"를 주석에 적는다(그 서술이 금지 낱말을 담는다). */
const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const MESSENGER = "src/components/MessengerChatRoom.tsx";
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
    if (ts.isFunctionDeclaration(n) && n.name?.text === "MessengerChatRoom") component = n;
  });
  const last = component?.body?.statements.filter(ts.isReturnStatement).at(-1);
  assert.ok(last, "채팅 화면의 마지막 return을 찾지 못했다");
  return last.getText(sf);
}

function chatReturnResidue(source: string): string[] {
  const chat = lastReturnText(source);
  // T190-8a(§74.22 (2) G462 ⚠️) — 변형 객체 값도 **명시적으로** 더한다(안 더하면 새 문면이 채팅 return 안으로 새도 잡히지 않는다).
  return [
    "MESSENGER_START_NOTICE",
    "MessengerStartNotice",
    ...Object.values(MESSENGER_START_NOTICE),
    ...Object.values(MESSENGER_START_NOTICE_WITH_CALL),
  ].filter((token) => chat.includes(token));
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

  // 2026-10-20 — 대화 목록은 통화 구간을 접는 `foldCallSegments(messages).map(`로 그린다(lib/messenger/threadItems.ts).
  // §89.5 ⓐ — 접힌 목록(`threadItems = foldCallSegments(messages)`)을 그리는 자리가 앵커다.
  const anchor = messenger.lastIndexOf("{threadItems.map((item, index) => {");
  assert.ok(anchor > 0);
  const leaked =
    messenger.slice(0, anchor) + "<li>{MESSENGER_START_NOTICE.notice}</li>\n" + messenger.slice(anchor);
  assert.ok(chatReturnResidue(leaked).includes("MESSENGER_START_NOTICE"));
});

// ── G444 ④ 통화 구독 가드 · ⑤ 정본 문면 · ⑥ 컴포넌트 · ⑦ 난이도 화면 ─────────────────────
test("[T187/G444 ④ · T190-8b] 통화 화면은 \"받기\" 전(pre-call-notice·incoming·connecting)에 대화를 구독하지 않는다", () => {
  // T190-8b(§74.22 (4) #3) — 벨 직전 고지 상태가 더해져 가드 문자열을 같은 커밋에 갱신했다(구독 effect 3곳 모두).
  const guard = 'if (!sessionId || phase === "pre-call-notice" || phase === "incoming" || phase === "connecting") return;';
  // 실기기 신고 F1(2026-11-02) — 문자 구독만 §142 R2 시작 문자 세션(`smsStart`)에서 받기 전에도 연다(첫 통화를 그 문자 속 번호로 건다).
  // 벨 직전 고지(pre-call-notice) 전에는 그 세션도 구독하지 않는다 — 고지가 먼저라는 G444 ④의 뜻은 그대로다.
  const smsGuard = 'if (!sessionId || phase === "pre-call-notice" || ((phase === "incoming" || phase === "connecting") && !smsStart)) return;';
  const play = read(PLAY);
  assert.equal(play.split(guard).length - 1, 2, "대화 · 확인 오퍼 구독 2곳은 같은 가드여야 한다");
  assert.equal(play.split(smsGuard).length - 1, 1, "문자 구독은 R2 시작 문자 예외 가드 1곳");
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
  // T190-8a(G462 ③ · UX-022 v1.33 (7) 정본) — 에스컬레이션 가능 시나리오 변형.
  assert.deepEqual(
    { ...MESSENGER_START_NOTICE_WITH_CALL },
    {
      title: "훈련을 시작합니다",
      notice: "지금부터 받는 메시지와 전화는 실제 연락이 아니라 AI 훈련 프로그램이 보내는 훈련용 연락입니다.",
      callVoiceNotice: "전화로 이어지면 그 목소리도 AI로 합성된 훈련용 음성입니다.",
    },
  );
  // T190-8b(UX-014 v1.33 (11) ① 정본) — 벨 직전 고지. 고지 ①은 PREROLL_NOTICE 재사용(위 단언), 고지 ②는 같은 문장.
  assert.deepEqual(
    { ...PRE_CALL_NOTICE },
    { title: "곧 훈련 전화가 걸려 옵니다", stopHint: "언제든 '훈련 종료'로 멈출 수 있습니다.", confirmLabel: "준비됐어요" },
  );
  assert.equal(PRE_CALL_NOTICE.stopHint, MESSENGER_START_NOTICE.stopHint);
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
  if (/difficult|level|challenge|channel|recipient/i.test(propsType)) out.push("props에 난이도·채널 입력이 있다(AC-065 · D-80)");
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

test("[T187/G444 ⑦] 난이도 선택 화면 머리글 — '모의 표식' 0 · 넷째 항목 = 끝난 뒤 '훈련이었습니다' 안내(AC-087 (e) · UX D-85)", () => {
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

// ── G462 — 에스컬레이션 시나리오의 시작 전 고지 확장(docs/Architecture.md §74.22 (2) · OQ-52 (ㄴ) · PRD AC-091 (g)) ──────────

/** ① 변형 세 필드가 컴포넌트에서 각각 정확히 1회 · 제목·고지 ①은 `includesCall ?` 삼항 · 고지 ①-2는 `includesCall &&`. */
function withCallComponentViolations(source: string): string[] {
  const sf = ts.createSourceFile("n.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  for (const field of ["title", "notice", "callVoiceNotice"] as const) {
    const uses: ts.Node[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isPropertyAccessExpression(n) && n.getText(sf) === `MESSENGER_START_NOTICE_WITH_CALL.${field}`) uses.push(n);
      ts.forEachChild(n, visit);
    };
    visit(sf);
    if (uses.length !== 1) {
      out.push(`${field} 사용처 ${uses.length}회`);
      continue;
    }
    const parent = uses[0].parent;
    if (field === "callVoiceNotice") {
      let node: ts.Node | undefined = parent;
      while (node && !(ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)) {
        node = node.parent;
      }
      const left = node ? (node as ts.BinaryExpression).left.getText(sf) : "";
      if (left !== "includesCall") out.push(`callVoiceNotice 조건이 "${left}"다`);
    } else if (!(ts.isConditionalExpression(parent) && parent.condition.getText(sf) === "includesCall" && parent.whenTrue === uses[0])) {
      out.push(`${field}가 includesCall 삼항의 참 쪽이 아니다`);
    }
  }
  return out;
}

// ⚠️ T194-a(docs/Architecture.md §84.4.1 · G580 "대체" — X8: 같은 커밋에 대체 단언) — 아래 3개 테스트의 **리터럴**을 새 술어
// 문자열로 바꿨다. 단언 내용("버튼 · 고지 · 서버 전이가 같은 술어")은 그대로다: 예전 술어는 시나리오 속성
// (`scenario.escalation`)이었고, 이제 (시나리오 × 난이도) 세션 술어 `resolveSessionEscalation`이다(택배 문자는 고급 세션만 참 —
// UX D-124 ② · PRD AC-106 (i)).
// A2 ㉢(2026-11-01) — 대화방 값은 실제 전환 판정(세션 술어 + 목소리 복제 · 1회)에서 온다.
const PAGE_PREDICATE_STATE = "resolveTransitionNow(";
const PAGE_NOTICE_PROP = "includesCall={sessionEscalates}";
// §94 — 종료 판정이 답장 공개 뒤로 미뤄져 `chatEnded`(= ended ∨ 공개된 종료 결과)를 쓴다. 술어(sessionEscalates)는 같다.
// §95(UX D-138) — 카톡형은 "전화로 확인"이 프로필 시트의 "보이스톡"으로 옮겨 갔다. 두 자리(문자형 머리줄 버튼 · 시트)가 같은 값 하나를 쓴다.
// §121.7(메인 결정 ⓑ) — 통화 위에 겹친 대화방(`inCall`)은 이미 통화 중이라 두 자리를 함께 숨긴다(같은 값 하나 — 술어는 그대로).
// A2 ㉢(2026-11-01) — 목소리 복제 짧은 통화 시나리오는 보이스톡을 받지 않는다(술어 값 sessionEscalates는 그대로 같다).
const PAGE_BUTTON_GUARD = "const canVoiceTalk = sessionEscalates && !chatEnded && !inCall && scenario?.escalationCloneOnly !== true;";

test("[T190-8a/G462 ①②] 시작 전 고지 변형 — 컴포넌트는 includesCall로만 고르고 페이지는 '전화로 확인' 버튼과 같은 세션 술어 값을 넘긴다", () => {
  assert.deepEqual(withCallComponentViolations(read("src/components/MessengerStartNotice.tsx")), []);
  const page = codeOnly(read(MESSENGER));
  assert.ok(page.includes(PAGE_NOTICE_PROP), "페이지가 '전화로 확인' 버튼과 같은 술어 값(sessionEscalates)을 넘겨야 한다");
  assert.ok(page.includes(PAGE_BUTTON_GUARD), "'전화로 확인' 버튼이 같은 값(sessionEscalates)으로 게이팅돼야 한다");
  // 리뷰 M3(§95) — 두 사용처(문자형 머리줄 버튼 · 카톡형 프로필 시트 "보이스톡")가 모두 그 값 하나를 쓴다.
  assert.ok(page.includes("{isSms && canVoiceTalk && ("), "문자형 '전화로 확인'이 canVoiceTalk로 게이팅돼야 한다");
  // 실기 신고 4(2026-10-21) — 시트 "보이스톡"은 모든 카톡형 세션에 보이고(대화 종료 전), **통화 전이**만 canVoiceTalk로 고른다.
  assert.match(page, /voiceTalk=\{\s*chatEnded(?: \|\| inCall)?\s*\?\s*undefined\s*:\s*canVoiceTalk\s*\?/, "프로필 시트 '보이스톡'의 통화 전이가 canVoiceTalk로 게이팅돼야 한다");
  assert.ok(page.includes(PAGE_PREDICATE_STATE), "그 값은 전환 판정(resolveTransitionNow)에서 와야 한다");
  // 시나리오 속성 직접 읽기가 고지 · 버튼 자리에 남지 않았다(택배 초급 · 중급에 '전화' 예고 0 — UX-022 v1.33 (7) 원칙).
  assert.equal(page.includes("Boolean(scenario.escalation)"), false);
  assert.equal(/\{scenario\.escalation && !ended/.test(page), false);
});

test("[T190-8a/G462 ④ 역검증 — AC-091 (f)ⓓ] 조건을 true로 바꾼 사본 · 고지 ①-2를 조건 없이 그린 사본 · 페이지가 전화 고지를 끈 사본은 각각 실패한다", (t) => {
  const source = read("src/components/MessengerStartNotice.tsx");
  const alwaysTrue = source.replace("{includesCall ? MESSENGER_START_NOTICE_WITH_CALL.title", "{true ? MESSENGER_START_NOTICE_WITH_CALL.title");
  assert.notEqual(alwaysTrue, source, "오염 지점(제목 삼항)을 찾지 못했다");
  const unconditional = source.replace("{includesCall && (", "{(");
  assert.notEqual(unconditional, source, "오염 지점(고지 ①-2)을 찾지 못했다");
  const a = withCallComponentViolations(alwaysTrue);
  const b = withCallComponentViolations(unconditional);
  const pageOff = codeOnly(read(MESSENGER)).replace(PAGE_NOTICE_PROP, "includesCall={false}");
  const c = pageOff.includes(PAGE_NOTICE_PROP);
  t.diagnostic(`[G462] 정상 0 / 조건 true ${JSON.stringify(a)} / ①-2 무조건 ${JSON.stringify(b)} / 페이지 끔 → 술어 존재 ${c}`);
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(c, false);
});

test("[T190-8a/G462 ⑤] 에스컬레이션 집합 = 서버 두 전이 경로의 술어 · 클라 보유 수 = 서버 보유 수", () => {
  const session = codeOnly(read("functions/src/session/index.ts"));
  const roleplay = codeOnly(read("functions/src/roleplay/index.ts"));
  // A2 ㉢(2026-11-01) — 실제 전환 지점은 세션 술어 위에 목소리 복제 · 1회 판정을 얹은 `resolveTransitionNow`(대화방 sessionEscalates도 같은 함수).
  assert.ok(session.includes("!resolveTransitionNow(session, PUBLIC_SCENARIOS)"), "requestEscalation이 같은 판정을 쓰지 않는다");
  assert.ok(roleplay.includes("resolveTransitionNow(session, PUBLIC_SCENARIOS) !== undefined"), "sendMessage 자동 전이가 같은 판정을 쓰지 않는다");
  const serverCount = (codeOnly(read("functions/src/scenarios/publicMeta.ts")).match(/^\s*escalation:\s*\{/gm) ?? []).length;
  const clientCount = readdirSync("src/content/scenarios")
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => /^\s*escalation:\s*\{/m.test(codeOnly(read(`src/content/scenarios/${f}`)))).length;
  assert.ok(serverCount >= 2, `서버 에스컬레이션 시나리오가 ${serverCount}개뿐이다 — 파서가 죽었다`);
  assert.equal(clientCount, serverCount, "클라 escalation 보유 수와 서버 PUBLIC_SCENARIOS 보유 수가 다르다 — 고지 문면이 갈라진다");
  // T194-a — 고급 전용 전이 설정도 같은 방식으로 센다(값 대조는 src/content/scenarios/escalation.test.ts).
  const serverAdvanced = (codeOnly(read("functions/src/scenarios/publicMeta.ts")).match(/^\s*advancedEscalation:\s*\{/gm) ?? []).length;
  const clientAdvanced = readdirSync("src/content/scenarios")
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => /^\s*advancedEscalation:\s*\{/m.test(codeOnly(read(`src/content/scenarios/${f}`)))).length;
  assert.equal(serverAdvanced, 1, "고급 전용 전이 시나리오 = 택배 문자 1종(AC-106 · #162 이 시나리오 한정 예외)");
  assert.equal(clientAdvanced, serverAdvanced);
});

// ── G463 — 통화 초기 phase 진리표(docs/Architecture.md §74.22 (3) · PRD AC-091 (b)(f)ⓑ · (g)) ──────────────────────────
type DecidePhase = (input: InitialCallPhaseInput) => string;

/** §74.22 (3) 표를 그대로 옮긴 기대값(위에서부터 첫 매치). */
function expectedPhase(input: InitialCallPhaseInput): string {
  if (input.status === "ended") return "ended";
  if (input.status === "active" && input.answered) return "live";
  if (input.isEscalated) return "incoming";
  if (input.preCallNoticeSeen || input.answered) return "incoming";
  return "pre-call-notice";
}

function phaseMismatches(decide: DecidePhase): string[] {
  const out: string[] = [];
  for (const status of ["active", "ended", "pending", undefined]) {
    for (const answered of [false, true]) {
      for (const isEscalated of [false, true]) {
        for (const preCallNoticeSeen of [false, true]) {
          const input = { status, answered, isEscalated, preCallNoticeSeen };
          if (decide(input) !== expectedPhase(input)) out.push(`${JSON.stringify(input)} → ${decide(input)}(기대 ${expectedPhase(input)})`);
        }
      }
    }
  }
  return out;
}

test("[T190-8b/G463] decideInitialCallPhase 진리표 — 32조합 전수 · 표의 다섯 행 대표값", () => {
  assert.deepEqual(phaseMismatches(decideInitialCallPhase), []);
  const base = { status: "active", answered: false, isEscalated: false, preCallNoticeSeen: false };
  assert.equal(decideInitialCallPhase({ ...base, status: "ended" }), "ended");
  assert.equal(decideInitialCallPhase({ ...base, answered: true }), "live");
  assert.equal(decideInitialCallPhase({ ...base, isEscalated: true }), "incoming", "에스컬레이션 = pre-call-notice 미경유(OQ-52 (ㄴ))");
  assert.equal(decideInitialCallPhase(base), "pre-call-notice", "경로 ①③ 첫 진입 = 벨 직전 고지");
  assert.equal(decideInitialCallPhase({ ...base, preCallNoticeSeen: true }), "incoming", "같은 세션 새로고침 = 생략(AC-087 (c))");
});

test("[T190-8b/G463 역검증 — AC-091 (f)ⓑ] 에스컬레이션이 pre-call-notice를 내는 사본 · 미확인 비에스컬레이션이 incoming을 내는 사본은 각각 실패한다", () => {
  const escalationShowsNotice: DecidePhase = (input) =>
    input.isEscalated && input.status !== "ended" && !(input.status === "active" && input.answered)
      ? "pre-call-notice"
      : decideInitialCallPhase(input);
  const skipsNotice: DecidePhase = (input) => {
    const got = decideInitialCallPhase(input);
    return got === "pre-call-notice" ? "incoming" : got;
  };
  assert.ok(phaseMismatches(escalationShowsNotice).length >= 1);
  assert.ok(phaseMismatches(skipsNotice).length >= 1);
});

test("[T190-8b/G463 배선] play는 초기 phase를 decideInitialCallPhase 하나로 정하고, 확인 기록은 '준비됐어요' 핸들러에서만 쓴다", () => {
  const play = codeOnly(read(PLAY));
  assert.ok(play.includes("const initialPhase = decideInitialCallPhase({"));
  assert.ok(play.includes("setPhase(initialPhase);"));
  assert.ok(play.includes("preCallNoticeSeen: isPreCallNoticeSeen(sessionId)"));
  assert.equal((play.match(/markPreCallNoticeSeen\(/g) ?? []).length, 1, "확인 기록 지점은 하나여야 한다");
  const handler = play.slice(play.indexOf("const handleConfirmPreCallNotice"), play.indexOf("const handleChooseCallSkin"));
  assert.ok(handler.includes("markPreCallNoticeSeen(sessionId)"), "확인 기록은 '준비됐어요' 핸들러 안이어야 한다");
  assert.ok(handler.includes("primeIncomingAlertAudio()"), "벨 오디오 준비는 사용자 제스처(핸들러) 안이어야 한다(OQ-A95 ⓐ)");
  // 받기 기록과 키를 공유하지 않는다(G450과 같은 축).
  assert.equal(play.includes("markSessionAnswered(sessionId);\n    markPreCallNoticeSeen"), false);
});

// ── reviewer Minor(AC-006) — "준비됐어요" 뒤 짧은 정적에도 "훈련 종료" 1탭 ─────────────────────────────────────────
function preCallGapViolations(play: string): string[] {
  const code = codeOnly(play);
  const start = code.indexOf("if (preCallLeaving) {");
  if (start < 0) return ["정적 구간 분기를 찾지 못했다"];
  const block = code.slice(start, code.indexOf("return (\n      <CallStartNotice", start));
  const out: string[] = [];
  if (!block.includes("<EndTrainingButton onClick={() => void handleEndTraining()} />")) out.push("정적 구간에 훈련 종료가 없다(AC-006)");
  return out;
}

test("[T190/reviewer Minor · AC-006] pre-call-notice 뒤 정적 구간에도 '훈련 종료'가 있다", () => {
  assert.deepEqual(preCallGapViolations(read(PLAY)), []);
});

test("[T190/reviewer Minor 역검증] 정적 구간의 훈련 종료를 지운 사본은 실패한다", () => {
  const play = read(PLAY).replace(/\r\n/g, "\n"); // CRLF 체크아웃 대응
  const anchor = "          <div className=\"flex justify-end px-4 py-2.5\">\n            <EndTrainingButton onClick={() => void handleEndTraining()} />\n          </div>\n";
  assert.ok(play.includes(anchor), "오염 지점을 찾지 못했다");
  assert.deepEqual(preCallGapViolations(play.replace(anchor, "")), ["정적 구간에 훈련 종료가 없다(AC-006)"]);
});
