// §130(2026-10-24 에뮬레이터 전 화면 점검 결함 — docs/research/ui-emulator-check-2026-10-24.md §5) — 화면 결함 수정의 배선을 고정한다.
// 넘침 px 실측(수정 전 → 후)은 docs/Architecture.md §130 표가 정본이다. 여기는 그 수정이 소스에서 사라지지 않게만 막는다.
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다(callAudio.test.ts 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VOICE_TALK_RECORD_NOTE, VOICE_TALK_RECORD_TITLE } from "../messenger/threadItems.ts";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const play = read("src/app/session/play/page.tsx");

test("[§130 D3] 키패드: 높이 상한 대신 남은 높이 · 아바타 · 여백 접기 · 대화 묶음은 영역 아래에 붙는다", () => {
  assert.ok(!play.includes("max-h-[56dvh]"), "키패드 영역 높이 상한(56dvh)이 되살아났다 — 412×915에서도 입력줄이 숨었다");
  assert.ok(play.includes("{callTokens.hasAvatar && !showTextInput && ("), "키패드가 열려도 아바타가 자리를 차지한다");
  assert.ok(play.includes('maxHeight: showTextInput ? "0px"'), "키패드가 열려도 위 여백이 남는다");
  assert.equal((play.match(/<div className="sticky bottom-0 pb-1 pt-2" style=\{keypadInputBackground\}>/g) ?? []).length, 2);
  // 입력칸이 제 글자 폭(size=20)만큼 버티면 360폭에서 전송 버튼이 오른쪽 여백을 넘는다(실측).
  assert.equal((play.match(/className="min-h-\[50px\] min-w-0 flex-1 rounded-full/g) ?? []).length, 2);
});

test("[§130 D7] 통화 하단 판은 화면 아래에 붙는다 · 바탕은 셸과 같은 그라데이션(화면 높이 · 아래 맞춤)", () => {
  assert.match(play, /className=\{`call-compact-bottom sticky bottom-0 z-10 flex flex-col/);
  assert.match(play, /style=\{bottomPanelBackground\}/);
  assert.match(play, /backgroundSize: "100% 100dvh", backgroundPosition: "center bottom"/);
  // 역검증 — 그냥 이어받기(`inherit`)는 판 안에서 그라데이션을 처음부터 다시 그려 경계가 보였다(보이스톡 셸 실측).
  assert.ok(!play.includes('style={{ background: "inherit" }}'));
});

test("[§130 D11] 문자함 · 대화방이 덮으면 통화 셸은 inert · 문자함을 닫으면 inert가 풀린 뒤 초점을 옮긴다", () => {
  assert.ok(play.includes("inert={chatOpen || smsOverlayOpen ? true : undefined}"));
  assert.ok(play.includes("requestAnimationFrame(() => smsTriggerRef.current?.focus());"));
  assert.ok(!/inert=\{[^}]*verifyOverlayOpen/.test(play), "확인 시트(UX-031)는 비모달 — 셸을 막지 않는다");
});

test("[§130 D12] 종료 버튼의 접근 이름 = 보이는 글자(WCAG 2.5.3)", () => {
  const button = read("src/components/EndTrainingButton.tsx");
  assert.equal((button.match(/aria-label="훈련 종료"/g) ?? []).length, 2);
  assert.ok(!button.includes("훈련 즉시 종료"), "보이는 글자를 담지 못한 옛 이름이 남았다");
});

test("[§130 D5] 종료 화면 축소 기준 980px(펼친 모양 967px)", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /@media \(max-height: 980px\) \{\n {2}\/\* 종료 화면\(UX-007\)/);
  assert.ok(!css.includes("@media (max-height: 860px)"));
});

test("[§130 D7 · D8] 난이도 시트 높이 상한 40dvh · 설명만 시트 안에서 스크롤 · 시작 버튼은 줄지 않는다", () => {
  const page = read("src/app/scenarios/difficulty/page.tsx");
  assert.ok(page.includes('label="고른 난이도" className="max-h-[40dvh]"'));
  assert.ok(page.includes('className="flex min-h-0 flex-col gap-1 overflow-y-auto px-[22px] pt-4"'));
  assert.ok(page.includes('className="mt-3 shrink-0"'));
});

test("[§130 D16] 동의 화면: 빈 칸 div 대신 mt-auto · 간격 24px · 글자 크기 무변경", () => {
  const page = read("src/app/onboarding/consent/page.tsx");
  assert.ok(!page.includes('<div className="flex-1" />'));
  assert.ok(page.includes('<label className="mt-auto flex cursor-pointer select-none items-start gap-3 py-2">'));
  assert.ok(page.includes('className="flex flex-1 flex-col gap-6 pb-6 pt-6"'));
  assert.ok(page.includes('<p className="text-[18px] leading-[1.55] text-ink">{point}</p>'), "카드 글자 크기는 그대로");
});

test("[§130 D9 · D10] 열람본 생년월일은 하이픈에서 끊기지 않는다 · 이체 확인 화면은 넣은 금액을 다시 보인다", () => {
  const landing = read("src/components/MessengerFakeLanding.tsx");
  assert.ok(landing.includes("const birthdate = /^(\\d{6})-(\\d)(●+)$/.exec(value);"));
  assert.ok(landing.includes('{"\\u2011"}'), "줄 안 바뀜 하이픈");
  assert.ok(landing.includes("<wbr />"), "가림 표시 앞에서만 줄바꿈");
  assert.ok(landing.includes("{recordValueNode(row.value)}"));
  // D10 — 마지막(이체 확인) 화면에서만 · 앞 화면 금액 칸의 한글 표기.
  assert.ok(landing.includes("stepScreens && stepIndex === stepScreens.length && amountField ? amountHint(values[amountField.label] ?? \"\") : undefined"));
  assert.ok(landing.includes('<h1 className="text-xl font-bold leading-snug [word-break:keep-all]"'));
  // 완료 분기는 여전히 입력값을 읽지 않는다(G255 — mockScreenCopy.test.ts §106 ②가 정본 단언).
  const done = landing.slice(landing.search(/^ {2}if \(submitted\) \{$/m));
  const doneBranch = done.slice(0, done.search(/^ {2}return \($/m));
  assert.equal(/confirmAmount|\bvalues\b/.test(doneBranch), false);
});

test("[§130 D14] 되짚어보기: 참가자 말풍선도 줄바꿈 유지 · 사진 턴은 사진 칸", () => {
  const replay = read("src/app/report/replay/page.tsx");
  assert.ok(replay.includes('<p className="whitespace-pre-line text-[17px] leading-[1.55] text-white">{item.textMasked}</p>'));
  assert.ok(replay.includes("...(data.photo === true ? { photo: true as const } : {}),"));
  assert.match(replay, /\{item\.photo \? \(\n[\s\S]*?role="img"\n\s*aria-label="보낸 사진"/);
});

test("[§130 D19] 카톡형 대화방의 통화 구간 = '보이스톡' 통화 기록 말풍선(통화 시간은 적지 않는다) · 문자형은 시스템 줄 그대로", () => {
  assert.equal(VOICE_TALK_RECORD_TITLE, "보이스톡");
  assert.equal(VOICE_TALK_RECORD_NOTE, "통화 내용은 리포트에서 볼 수 있어요");
  const room = read("src/components/MessengerChatRoom.tsx");
  assert.ok(room.includes('if (item.kind === "call" && !isSms) {'));
  assert.ok(room.includes("{VOICE_TALK_RECORD_TITLE}") && room.includes("{CALL_SEGMENT_LINE}"));
  assert.ok(!/보이스톡 \d+:\d{2}/.test(room), "근거 없는 통화 시간을 지어 쓰지 않는다");
});
