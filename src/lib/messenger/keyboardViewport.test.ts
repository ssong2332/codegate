// G639 · G640 — 카톡형 대화방 키보드 처리 · 머리줄 · 상대 프로필 시트(UX D-138 · docs/Architecture.md §95 · 실기 신고 9 · 11 — 2026-10-21).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { chatBoxStyle, isNearBottom, parseSnapshot, snapshotOf, STICK_TO_BOTTOM_PX } from "./keyboardViewport.ts";

const PAGE = "src/components/MessengerChatRoom.tsx";
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

test("[G639] 보이는 영역 스냅샷 — 키보드가 열려 visualViewport가 줄면 상자도 그 높이 · 위치를 따른다", () => {
  assert.equal(snapshotOf({ height: 812, offsetTop: 0 }), "812|0");
  assert.equal(snapshotOf({ height: 431.6, offsetTop: 120.4 }), "432|120", "iOS — 문서가 밀린 만큼 top을 내린다");
  assert.equal(snapshotOf({ height: 500, offsetTop: -3 }), "500|0");
  assert.equal(snapshotOf(null), "");
  assert.equal(snapshotOf({ height: 0, offsetTop: 0 }), "");
  assert.deepEqual(parseSnapshot("432|120"), { heightPx: 432, offsetTopPx: 120 });
  assert.equal(parseSnapshot(""), null);
  assert.deepEqual(chatBoxStyle({ heightPx: 432, offsetTopPx: 120 }), { top: "120px", height: "432px" });
  assert.deepEqual(chatBoxStyle(null), { top: "0px", height: "100dvh" }, "서버 렌더 · visualViewport 없음 = CSS 단위");
});

test("[G639] 맨 아래 붙음 판정 — 그 안이면 키보드가 열려도 마지막 메시지를 입력줄 바로 위에 둔다", () => {
  assert.equal(isNearBottom({ scrollHeight: 2000, scrollTop: 1400, clientHeight: 600 }), true);
  assert.equal(isNearBottom({ scrollHeight: 2000, scrollTop: 1400 - STICK_TO_BOTTOM_PX, clientHeight: 600 }), true);
  assert.equal(isNearBottom({ scrollHeight: 2000, scrollTop: 1400 - STICK_TO_BOTTOM_PX - 1, clientHeight: 600 }), false);
});

test("[G639] 대화방 배선 — 고정 상자 + 목록만 스크롤 · 문서 끌어올리기(scrollIntoView · min-h-screen · sticky) 0", () => {
  const code = codeOnly(readFileSync(PAGE, "utf8"));
  const start = code.indexOf('className="fixed inset-x-0 flex flex-col overflow-hidden"');
  assert.ok(start > 0, "대화 화면 고정 상자가 없다");
  const chatReturn = code.slice(start); // 대화 화면(마지막 return)
  assert.ok(code.includes("useKeyboardViewport(pageState === \"ready\" && startNotice === \"skip\")"), "대화 화면일 때만 훅을 켠다");
  assert.match(chatReturn.slice(0, 400), /chatBoxStyle\(keyboardBox\)/);
  assert.match(chatReturn, /ref=\{scrollBoxRef\}[\s\S]*?overflow-y-auto/, "대화 목록 상자가 유일한 스크롤이어야 한다");
  assert.doesNotMatch(chatReturn, /min-h-screen/, "문서 높이로 늘어나면 브라우저가 문서를 끌어올린다");
  assert.doesNotMatch(chatReturn, /\bsticky\b/, "고정 상자 안에서는 sticky가 필요 없다(문서 스크롤 0)");
  assert.doesNotMatch(code, /scrollIntoView\(/, "scrollIntoView는 문서까지 끌어올릴 수 있다");
  const hook = readFileSync("src/lib/messenger/useKeyboardViewport.ts", "utf8");
  for (const needle of ['addEventListener("resize"', 'addEventListener("scroll"', 'html.style.overflow = "hidden"', "html.style.overflow = prev.html"]) {
    assert.ok(hook.includes(needle), `훅에 ${needle} 이 없다`);
  }
  assert.doesNotMatch(hook, /transform/, "transform은 안쪽 fixed 오버레이의 기준 상자를 바꾼다");
});

test("[G639 역검증] 상자를 문서 흐름(min-h-screen)으로 되돌리거나 입력칸 scrollIntoView를 되살린 사본은 실패한다", () => {
  const src = readFileSync(PAGE, "utf8");
  const poisonedBox = src.replace('className="fixed inset-x-0 flex flex-col overflow-hidden"', 'className="flex min-h-screen flex-col"');
  assert.notEqual(poisonedBox, src, "오염 지점(고정 상자)을 찾지 못했다");
  assert.throws(() => assert.match(codeOnly(poisonedBox), /className="fixed inset-x-0 flex flex-col overflow-hidden"/));
  const poisonedFocus = src.replace("onChange={(event) => setInput(event.target.value)}", "onChange={(event) => setInput(event.target.value)}\n onFocus={(e) => e.currentTarget.scrollIntoView()}");
  assert.notEqual(poisonedFocus, src, "오염 지점(입력칸)을 찾지 못했다");
  assert.match(codeOnly(poisonedFocus), /scrollIntoView\(/);
});

test("[G640] 카톡형 머리줄 = 상대 이름(번호 아님) · 친구 아님 띠 · 카톡형 시나리오 전부 이름이 있다", () => {
  const dir = "src/content/scenarios";
  const metas = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => ({ f, src: codeOnly(readFileSync(`${dir}/${f}`, "utf8")) }))
    .filter(({ src }) => /callerLabel: "/.test(src));
  const kakao = metas.filter(({ src }) => src.includes('surface: "kakao"'));
  assert.ok(kakao.length >= 2);
  for (const { f, src } of kakao) {
    const name = /chatDisplayName: "([^"]+)"/.exec(src)?.[1];
    const number = /callerLabel: "([^"]+)"/.exec(src)?.[1];
    assert.ok(name && !/\d{3}-\d{3,4}-\d{4}/.test(name), `${f} 카톡형 이름이 없거나 번호다`);
    assert.notEqual(name, number);
  }
  for (const { f, src } of metas) {
    if (!src.includes('surface: "kakao"')) assert.doesNotMatch(src, /chatDisplayName:/, `${f} — 카톡형 밖에서는 쓰지 않는다(통화 · 문자는 번호)`);
  }
  const code = codeOnly(readFileSync(PAGE, "utf8"));
  assert.ok(code.includes("const peerName = isSms ? scenario.callerLabel : (scenario.chatDisplayName ?? scenario.callerLabel);"));
  assert.ok(code.includes("{!isSms && scenario.chatNonFriend && ("), "친구 아님 띠는 카톡형 · 해당 시나리오만");
});

test("[G640 · AC-006 R-4] 머리줄 '전화로 확인'은 문자형만 · 카톡형은 프로필 시트 '보이스톡' · 대화 화면 종료는 상시 1탭으로 남는다", () => {
  const code = codeOnly(readFileSync(PAGE, "utf8"));
  assert.ok(code.includes("{isSms && canVoiceTalk && ("), "카톡형 머리줄에 '전화로 확인'이 남았다");
  assert.ok(code.includes("<EndTrainingButton onClick={handleEndTraining} compact={!isSms} />"), "대화 화면 상시 종료가 없다(AC-006 R-4)");
  assert.match(code, /\{!isSms && profileOpen && \([\s\S]*?<MessengerProfileSheet[\s\S]*?canVoiceTalk[\s\S]*?void handleVoiceTalkDial\(\)[\s\S]*?onEndTraining=\{handleEndTraining\}/);
  assert.equal((code.match(/onClick=\{\(\) => setProfileOpen\(true\)\}/g) ?? []).length, 2, "이름 · 프로필 사진 두 곳에서 연다");
  const sheet = readFileSync("src/components/MessengerProfileSheet.tsx", "utf8");
  for (const needle of ['role="dialog"', 'aria-modal="true"', "보이스톡", "훈련 종료", '"Escape"', "opener.focus()"]) {
    assert.ok(sheet.includes(needle), `프로필 시트에 ${needle} 이 없다`);
  }
  // 실기 신고 4(2026-10-21) — 페이지는 대화 종료 전이면 늘 넘긴다(통화 전이 또는 응답 없음 연출 — 동작 없는 버튼 0).
  assert.match(sheet, /\{voiceTalk && \(/, "대화가 끝난 뒤에도 '보이스톡'(동작 없는 버튼)이 남는다");
  assert.doesNotMatch(codeOnly(sheet), /window\.confirm|확인하시겠/, "종료는 1탭 즉시(확인 대화상자 0)");
  const button = readFileSync("src/components/EndTrainingButton.tsx", "utf8");
  // §130(UX D-161 (4)) — 접근 이름 = 보이는 글자 "훈련 종료"(WCAG 2.5.3 · 작은 모양의 보이는 글자 "종료"도 이름 안에 있다).
  assert.equal((button.match(/aria-label="훈련 종료"/g) ?? []).length, 2, "작은 모양도 같은 이름");
  assert.match(button, /compact[\s\S]*?min-h-\[44px\]/, "작은 모양도 터치 영역 44px");
});
