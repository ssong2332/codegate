// G649~G651 — 시안 E2 P2 선택 화면 배선(UX D-141 · docs/Architecture.md §97). 화면은 이 러너에서 렌더할 수 없어 소스로 본다.
//   G649 선택 화면 5곳은 판(PanelList)을 쓰고 옛 카드(DrilldownOptionCard · SelectableCard)는 쓰지 않는다
//   G650 시나리오 목록은 판 1탭으로 난이도 화면에 간다(옛 "다음 — 난이도 고르기" 하단 버튼 0)
//   G651 난이도 = choose 판 + 설명 시트(sticky) + "이걸로 시작" — 고르기 전 진행 버튼 0(AC-064) · 안전 고지 그대로
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const codeOnly = (file: string) =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SELECT_SCREENS = [
  "src/app/scenarios/page.tsx",
  "src/app/scenarios/experience-select/page.tsx",
  "src/app/scenarios/voice/page.tsx",
  "src/components/ScenarioPanelGroups.tsx",
  "src/app/scenarios/difficulty/page.tsx",
];
const SCENARIO_LISTS = ["src/app/scenarios/voice/ScenarioListView.tsx", "src/app/scenarios/messenger/page.tsx"];

test("[G649] 선택 화면은 판(PanelList)을 쓰고 옛 카드는 쓰지 않는다 · 머리는 SelectScreenHeader(단계 표시 글자 · aria-current)", () => {
  for (const file of SELECT_SCREENS) {
    const code = codeOnly(file);
    assert.ok(code.includes("<PanelList"), `${file}: PanelList 없음`);
    assert.ok(!/DrilldownOptionCard|SelectableCard/.test(code), `${file}: 옛 카드가 남았다`);
  }
  for (const file of [...SELECT_SCREENS.filter((f) => !f.includes("ScenarioPanelGroups")), ...SCENARIO_LISTS]) {
    assert.ok(codeOnly(file).includes("<SelectScreenHeader"), `${file}: 머리 컴포넌트 없음`);
  }
  assert.ok(readFileSync("src/components/SelectScreenHeader.tsx", "utf8").includes('aria-current="step"'));
});

test("[G650] 시나리오 목록 — 판을 누르면 시나리오를 확정하고 난이도 화면으로 간다 · 하단 '다음' 버튼 0", () => {
  for (const file of SCENARIO_LISTS) {
    const code = codeOnly(file);
    assert.ok(code.includes("<ScenarioPanelGroups"), `${file}: 판 묶음 없음`);
    const handler = code.slice(code.indexOf("const handleSelectScenario"), code.indexOf("const toItem"));
    assert.match(handler, /router\.push\("\/scenarios\/difficulty"\)/, `${file}: 판 탭이 난이도로 가지 않는다`);
    assert.ok(!code.includes("다음 — 난이도 고르기"), `${file}: 옛 하단 버튼이 남았다`);
    assert.ok(code.includes("SCENARIO_TRAIT_LABEL"), `${file}: AC-067 성향 표기가 빠졌다`);
  }
  // 미리 지목(T74)은 자동 시작하지 않는다 — 스크롤만.
  const groups = codeOnly("src/components/ScenarioPanelGroups.tsx");
  assert.ok(groups.includes("scrollIntoView") && !groups.includes("router"), "지목된 판은 보이게만 한다");
});

test("[G651] 난이도 — choose 판 + sticky 설명 시트 + '이걸로 시작' · 고르기 전 시트(진행 버튼) 0 · 안전 고지 유지", () => {
  const code = codeOnly("src/app/scenarios/difficulty/page.tsx");
  assert.ok(code.includes('mode="choose"'));
  assert.match(code, /<BottomSheet open=\{selected !== null\} placement="sticky"/);
  assert.ok(code.includes('"이걸로 시작"'));
  assert.ok(!code.includes("이 난이도로 시작"), "옛 버튼 문구가 남았다");
  assert.match(code, /disabled=\{!selected \|\| state === "starting" \|\| state === "difficulty-fallback"\}/);
  // 안전 고지 · 내 정보 · 미리 보기 · 대기 문구(D-134)는 그대로 있다.
  for (const needle of ["{PRE_SESSION_BURDEN_NOTICE}", "<PersonaCardInputFields", "위험 신호 미리 보기", "<TrainingPrepScreen", "advancedNotice"]) {
    assert.ok(code.includes(needle), needle);
  }
  // 대기 문구(D-134)는 준비 화면이 그린다.
  assert.ok(codeOnly("src/components/TrainingPrepScreen.tsx").includes("useLoadingHint(SESSION_PREP_HINTS)"));
});

// G652~G653 — P3 준비 화면 · 경계 판(§97.7 · OQ-U106 Resolved 2026-10-21).
test("[G652] 준비 화면 — 큰 표시는 경과 초 · '보통 10~15초' · 진행률/단계 표기 0(D-134)", async () => {
  const { formatElapsed, PREP_USUAL_LINE, PREP_TIPS, prepTipIndex, PREP_TIP_INTERVAL_MS } = await import("./e2Prep.ts");
  assert.equal(formatElapsed(8400), "8초");
  assert.equal(formatElapsed(0), "0초");
  assert.equal(formatElapsed(-5), "0초");
  assert.equal(formatElapsed(65000), "1분 5초");
  assert.equal(formatElapsed(120000), "2분");
  assert.equal(PREP_USUAL_LINE, "보통 10~15초 걸려요");
  assert.equal(prepTipIndex(0), 0);
  assert.equal(prepTipIndex(PREP_TIP_INTERVAL_MS * PREP_TIPS.length), 0, "요령은 돌아가며 보인다");
  const screen = codeOnly("src/components/TrainingPrepScreen.tsx");
  for (const banned of [/\/3/, /단계 완료/, /%/, /진행률/]) assert.doesNotMatch(screen, banned, `준비 화면에 ${banned}`);
  assert.match(screen, /aria-hidden="true" className="font-display text-\[96px\]/, "1초마다 바뀌는 큰 숫자는 낭독하지 않는다");
});

test("[G653] 경계 판 — 진입은 세션 생성 뒤(훈련 화면 코드 무변경) · 종료는 사실 공개 문장과 함께", async () => {
  const { entryBoardCopy, EXIT_BOARD, ENTRY_BOARD_MS } = await import("./e2Prep.ts");
  assert.equal(entryBoardCopy("voice").title, "지금부터 훈련");
  assert.ok(entryBoardCopy("messenger").lines[0].includes("메신저"));
  assert.ok(ENTRY_BOARD_MS <= 1500, "진입 판이 너무 오래 머문다");
  const difficulty = codeOnly("src/app/scenarios/difficulty/page.tsx");
  assert.match(difficulty, /setEntryBoardTo\(destination\);/, "세션 생성 성공 뒤 판을 보인다");
  const startSelf = difficulty.slice(difficulty.indexOf("const startSelfSession"), difficulty.indexOf("const handleStart"));
  assert.ok(!/router\.push\(/.test(startSelf), "판 없이 바로 가는 옛 경로가 남았다");
  // 판은 "바로 시작"과 타이머가 겹쳐도 한 번만 이동한다 · 판으로 포커스를 옮긴다.
  assert.match(difficulty, /if \(enteredRef\.current\) return;/);
  assert.match(difficulty, /focusOnMount/);
  // 통화 · 메신저 화면에는 경계 판을 넣지 않는다(받기 탭 오디오 잠금 해제 경로 무변경).
  for (const f of ["src/app/session/play/page.tsx", "src/app/session/messenger/page.tsx", "src/components/CallStartNotice.tsx"]) {
    assert.ok(!readFileSync(f, "utf8").includes("BoundaryPanel"), f);
  }
  const end = readFileSync("src/app/session/end/page.tsx", "utf8");
  assert.ok(end.includes("{EXIT_BOARD.title}") && end.includes("{POST_SESSION_FACT_DISCLOSURE}"));
  assert.equal(EXIT_BOARD.title, "끝.");
  assert.match(readFileSync("src/app/globals.css", "utf8"), /\.end-compact > div:first-of-type \{/, "종료 판이 첫 자식이어도 아이콘 축소가 아이콘에 걸린다");
});

// G654~G655 — P4 리포트 머리 · 랜딩 · 로그인 · 챌린지(§97.8).
test("[G654] 리포트 큰 시계 — 서버 표기 'N초 시점'만 읽는다 · 다른 꼴이면 시계 0 · 안 속으면 '끝까지 지켰어요'", async () => {
  const { parseMomentSeconds } = await import("./e2Layout.ts");
  assert.equal(parseMomentSeconds("101초 시점"), 101);
  assert.equal(parseMomentSeconds(" 0초 시점 "), 0);
  assert.equal(parseMomentSeconds("1분 41초"), null);
  assert.equal(parseMomentSeconds(undefined), null);
  const server = readFileSync("functions/src/report/analyzeConversation.ts", "utf8");
  assert.ok(server.includes("return `${elapsedSec}초 시점`;"), "서버 표기 꼴이 바뀌면 화면 파서도 같이 바꿀 것");
  const report = codeOnly("src/app/report/page.tsx");
  assert.match(report, /<BigClock seconds=\{firstDeceivedSeconds\}/);
  assert.ok(report.includes("끝까지 지켰어요"));
  // AC-009 · AC-008 문장은 그대로 있다.
  assert.ok(report.includes("이번 훈련에서는 속지 않았습니다. 아래는 시도된 수법입니다."));
  assert.ok(report.includes("에 속았습니다. {firstDeceivedMoment.correctAction}"));
});

test("[G655] 랜딩 · 로그인 · 챌린지 — 함렛 큰 제목 · 랜딩 CTA 판 · 법적 링크 스위치 유지 · Google 버튼은 흰 바탕", () => {
  const landing = codeOnly("src/app/page.tsx");
  assert.ok(landing.includes('<CtaPanel') && landing.includes('href="/login"'));
  assert.ok(landing.includes("<LegalLinks"), "법적 링크 자리(SHOW_LEGAL_LINKS)가 빠졌다");
  assert.ok(landing.includes("진짜 전화 · 문자는 오지 않습니다"), "앱 안 체험 고지가 빠졌다");
  const login = codeOnly("src/app/(auth)/login/page.tsx");
  assert.match(login, /<DisplayTitle as="h1" size="xl"[^>]*>훈련 기록을 남기려면 로그인이 필요합니다<\/DisplayTitle>/);
  assert.ok(login.includes("bg-white") && login.includes("Google로 로그인"));
  const challenge = codeOnly("src/app/challenge/create/page.tsx");
  assert.ok(challenge.includes("e2-fill-up") && challenge.includes("챌린지가 만들어졌습니다"));
  assert.ok(!challenge.includes("보냈어요"), "앱은 링크를 만들 뿐 보내지 않는다");
});
