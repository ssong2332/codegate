// G649~G651 — 시안 E2 P2 선택 화면 배선(UX D-141 · docs/Architecture.md §97). 화면은 이 러너에서 렌더할 수 없어 소스로 본다.
//   G649 선택 화면 5곳은 판(PanelList)을 쓰고 옛 카드(DrilldownOptionCard · SelectableCard)는 쓰지 않는다
//   G650 시나리오 목록은 판 1탭으로 난이도 화면에 간다(옛 "다음 — 난이도 고르기" 하단 버튼 0)
//   G651 난이도 = choose 판 + 설명 시트(sticky) + "이걸로 시작" — 고르기 전 진행 버튼 0(AC-064) · 안전 고지 그대로
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

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
  // 대기 문구(D-134)는 준비 화면이 그린다 — §100부터는 오래 걸릴 때의 안심 문구만(0초 문구는 단계 목록이 대신한다).
  assert.ok(codeOnly("src/components/TrainingPrepScreen.tsx").includes("slowPrepHints(SESSION_PREP_HINTS)"));
});

// G652~G653 — P3 준비 화면 · 경계 판(§97.7). G652는 §100(UX D-143 · 2026-10-22)에서 "경과 초 · 보통 10~15초"를
// "서버가 실제로 끝낸 준비 단계만 체크"로 바꿨다(사용자 원문 "보통 10~15초가 나오는데, 다른 방식으로 전환").
test("[G652] 준비 화면 — 실제 준비 단계만 체크 · 경과 초 · 예상 시간 · 진행률 · 숫자 단계 표기 0(D-143 · D-134)", async () => {
  const { prepStepsFor, PREP_STAGE_ORDER, PREP_ALL_DONE, advancePrepDone, prepStepState, prepAnnouncement, slowPrepHints, PREP_TIPS, prepTipIndex, PREP_TIP_INTERVAL_MS } =
    await import("./e2Prep.ts");
  const mod = await import("./e2Prep.ts");
  assert.ok(!("formatElapsed" in mod) && !("PREP_USUAL_LINE" in mod), "경과 초 · '보통 10~15초' 규칙이 남았다");
  // 단계 — 서버 순서 그대로 3개 · 채널마다 둘째 단계 말만 다르다.
  assert.deepEqual([...PREP_STAGE_ORDER], ["scenario", "opening", "saved"]);
  assert.equal(PREP_ALL_DONE, 3);
  for (const channel of ["voice", "messenger"] as const) {
    const steps = prepStepsFor(channel);
    assert.deepEqual(steps.map((s) => s.stage), [...PREP_STAGE_ORDER], channel);
    for (const s of steps) {
      assert.match(s.active, /있어요$/, s.active);
      assert.doesNotMatch(s.waiting, /있어요|했어요|끝났어요/, "대기 줄이 이미 하는 중 · 끝난 것처럼 읽힌다");
      assert.doesNotMatch(`${s.waiting}${s.active}${s.done}`, /\d|초|%|단계/, "문면에 숫자 · 시간 · 단계 번호가 들어갔다");
    }
  }
  assert.ok(prepStepsFor("voice")[1].active.includes("첫마디"));
  assert.ok(prepStepsFor("messenger")[1].active.includes("첫 메시지"));
  // 체크는 신호로만 오른다 — 모르는 값 무시 · 줄지 않음 · 뒤 단계 신호는 앞 단계도 끝났다는 뜻.
  assert.equal(advancePrepDone(0, "scenario"), 1);
  assert.equal(advancePrepDone(1, "opening"), 2);
  assert.equal(advancePrepDone(0, "saved"), 3);
  assert.equal(advancePrepDone(2, "scenario"), 2, "늦게 온 앞 단계 신호가 체크를 지웠다");
  assert.equal(advancePrepDone(1, "bogus"), 1);
  assert.equal(advancePrepDone(1, undefined), 1);
  assert.deepEqual([0, 1, 2].map((i) => prepStepState(i, 1)), ["done", "active", "waiting"]);
  assert.deepEqual([0, 1, 2].map((i) => prepStepState(i, 3)), ["done", "done", "done"]);
  // 낭독 — 방금 끝난 단계 + 지금 하는 단계.
  const voice = prepStepsFor("voice");
  assert.equal(prepAnnouncement(voice, 0), "지금은 훈련 내용을 고르고 있어요.");
  assert.equal(prepAnnouncement(voice, 1), "훈련 내용을 골랐어요. 지금은 상대가 할 첫마디를 만들고 있어요.");
  assert.equal(prepAnnouncement(voice, 3), "훈련을 열 준비가 끝났어요.");
  // 안심 문구는 오래 걸릴 때만.
  assert.ok(slowPrepHints([{ afterMs: 0, text: "a" }, { afterMs: 8000, text: "b" }]).every((h) => h.afterMs > 0));
  assert.equal(prepTipIndex(0), 0);
  assert.equal(prepTipIndex(PREP_TIP_INTERVAL_MS * PREP_TIPS.length), 0, "요령은 돌아가며 보인다");
  assert.equal(prepTipIndex(PREP_TIP_INTERVAL_MS * 2, 2), 0, "요령 개수만큼 돈다");
  const screen = codeOnly("src/components/TrainingPrepScreen.tsx");
  for (const banned of [/\/3/, /%/, /진행률/, /formatElapsed/, /PREP_USUAL_LINE/, /e2-wait-bar/, /text-\[96px\]/]) {
    assert.doesNotMatch(screen, banned, `준비 화면에 ${banned}`);
  }
  assert.match(screen, /role="status" aria-live="polite" className="sr-only"/, "단계 변화를 낭독하는 라이브 영역이 없다");
  assert.match(screen, /prepAnnouncement\(steps, doneCount\)/);
  assert.match(screen, /prepStepState\(index, doneCount\)/, "체크는 서버 신호(doneCount)로만 정한다");
  assert.match(screen, /state === "active" \? step\.active : step\.waiting/, "대기 줄에 '…하고 있어요'를 쓰면 하지 않는 일을 한다고 말한다");
  assert.match(screen, /state === "active" \? step\.active : step\.waiting/, "대기 줄에 '…하고 있어요'를 쓰면 하지 않는 일을 한다고 말한다");
});

test("[G702] 난이도 화면 — 준비 단계는 createSession 스트리밍 신호와 최종 응답으로만 오른다(시간으로 올리지 않는다)", () => {
  const code = codeOnly("src/app/scenarios/difficulty/page.tsx");
  assert.match(code, /\(stage\) => setPrepDone\(\(done\) => advancePrepDone\(done, stage\)\)/);
  assert.match(code, /setPrepDone\(PREP_ALL_DONE\);/);
  assert.match(code, /setPrepDone\(0\);/, "다시 시작할 때 체크를 비운다");
  const setters = code.match(/setPrepDone\(/g) ?? [];
  assert.equal(setters.length, 3, "setPrepDone 호출이 늘었다 — 신호 아닌 곳에서 체크를 올리지 않는지 확인하라");
  assert.doesNotMatch(code, /setInterval\([^)]*setPrepDone|setTimeout\([^)]*setPrepDone/, "시간으로 체크를 올린다");
  assert.match(code, /doneCount=\{prepDone\}/);
  // 클라 래퍼는 onPrepStage가 있을 때만 스트리밍으로 부르고, 단일 헬퍼(callable.ts)를 거친다(G155).
  const wrapper = codeOnly("src/lib/api/createSession.ts");
  assert.match(wrapper, /callCallableStream</);
  const callable = codeOnly("src/lib/api/callable.ts");
  assert.match(callable, /callable\.stream\(request, \{ signal: abort\.signal \}\)/);
  assert.equal((callable.match(/rethrowAfterSignal\(err\)/g) ?? []).length, 2, "두 호출 모두 같은 감지 지점(G156)을 거친다");
  // 서버 단계 이름과 클라 단계 이름이 같다(G700 짝).
  const server = readFileSync("functions/src/session/prepStages.ts", "utf8");
  assert.match(server, /CREATE_SESSION_PREP_STAGES = \["scenario", "opening", "saved"\] as const/);
});

// G703 — §100.5(2026-10-22 실기 신고: 카드사 부정결제 사칭 × 초급 준비 화면에 "검찰·경찰·금감원은…"이 먼저 나왔다).
test("[G703] 준비 화면 요령 — 시나리오 사칭 유형에 맞고 · 문장은 앱 안 기존 문구 그대로 · 메신저에 '전화를 끊' 0", async () => {
  const { prepTipsFor, PREP_TIP_KIND_BY_SCENARIO, PREP_TIPS } = await import("./e2Prep.ts");
  const report = readFileSync("functions/src/report/analyzeConversation.ts", "utf8");
  const dir = "src/content/scenarios";
  const ids: { id: string; channel: "voice" | "messenger" }[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts") && !["index.ts", "escalation.ts"].includes(x))) {
    const src = readFileSync(`${dir}/${f}`, "utf8");
    const id = src.match(/_SCENARIO_ID = "([^"]+)"/)?.[1];
    if (id) ids.push({ id, channel: /channel: "messenger"/.test(src) ? "messenger" : "voice" });
  }
  assert.ok(ids.length >= 17, `시나리오가 ${ids.length}개뿐이다`);
  const rows: string[] = [];
  for (const { id, channel } of ids) {
    assert.ok(PREP_TIP_KIND_BY_SCENARIO[id], `${id}: 요령 유형 판정표에 없다 — 판정표에 한 줄을 더할 것`);
    const tips = prepTipsFor(id, channel);
    assert.ok(tips.length >= 2, id);
    for (const tip of tips) {
      assert.ok(PREP_TIPS.includes(tip) || report.includes(`"${tip}"`), `${id}: 앱 안 기존 문구가 아닌 요령 — ${tip}`);
      if (channel === "messenger") assert.ok(!tip.includes("전화를 끊"), `${id}: 메신저에 통화 전용 행동`);
    }
    const kind = PREP_TIP_KIND_BY_SCENARIO[id];
    // 기관(검찰 · 경찰 · 금감원) 문장은 그 기관 사칭에만.
    assert.equal(tips.includes(PREP_TIPS[0]), kind === "institution", `${id}: 기관 요령이 맞지 않는 시나리오에 나온다`);
    if (kind === "family") assert.ok(tips[0].includes("그 사람이 맞는지"), id);
    if (kind === "smishing") assert.equal(tips[0], PREP_TIPS[1], id);
    rows.push(`${id} | ${kind} | ${tips[0]}`);
  }
  // 신고 재현 — 카드사 시나리오의 첫 요령은 기관 문장이 아니다.
  assert.notEqual(prepTipsFor("card-company-impersonation", "voice")[0], PREP_TIPS[0]);
  // 표에 없는 시나리오는 공통 요령만(기관 · 링크 문장 0).
  assert.ok(!prepTipsFor("unknown-scenario", "voice").includes(PREP_TIPS[0]));
  console.log(`[G703] 시나리오 ${ids.length}개\n${rows.join("\n")}`);
  const screen = codeOnly("src/components/TrainingPrepScreen.tsx");
  assert.match(screen, /prepTipsFor\(scenarioId, channel\)/, "준비 화면이 시나리오에 맞춘 요령을 쓰지 않는다");
  assert.match(codeOnly("src/app/scenarios/difficulty/page.tsx"), /scenarioId=\{scenarioId\}/);
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
  const { formatClockSpoken } = await import("./e2Layout.ts");
  assert.equal(formatClockSpoken(101), "1분 41초");
  assert.equal(formatClockSpoken(45), "45초");
  assert.equal(formatClockSpoken(120), "2분");
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
