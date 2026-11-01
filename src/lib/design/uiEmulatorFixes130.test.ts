// §130(2026-10-24 에뮬레이터 전 화면 점검 결함 — docs/research/ui-emulator-check-2026-10-24.md §5) — 화면 결함 수정의 배선을 고정한다.
// 넘침 px 실측(수정 전 → 후)은 docs/Architecture.md §130 표가 정본이다. 여기는 그 수정이 소스에서 사라지지 않게만 막는다.
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다(callAudio.test.ts 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VOICE_TALK_RECORD_NOTE, VOICE_TALK_RECORD_TITLE } from "../messenger/threadItems.ts";
import { CHAT_INPUT_MAX_PX, CHAT_INPUT_MIN_PX, chatInputHeight } from "../messenger/chatInputHeight.ts";
import { SCREEN_OFF_COPY } from "../realtime/backgroundCall.ts";
import { josa, withJosa } from "../text/josa.ts";
import { clearVoiceTalkDial, peekVoiceTalkDial, refreshVoiceTalkDial, stashVoiceTalkDial, VOICE_TALK_HANDOFF_TTL_MS } from "../messenger/voiceTalkDial.ts";
import { AVATAR_BLOCK_PX, shouldHideCallAvatar } from "../phone/callCrowding.ts";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const play = read("src/app/session/play/page.tsx");

test("[§130 D3] 키패드: 높이 상한 대신 남은 높이 · 아바타 · 여백 접기 · 대화 묶음은 영역 아래에 붙는다", () => {
  assert.ok(!play.includes("max-h-[56dvh]"), "키패드 영역 높이 상한(56dvh)이 되살아났다 — 412×915에서도 입력줄이 숨었다");
  assert.ok(play.includes("{callTokens.hasAvatar && !showTextInput && !avatarCrowded && ("), "키패드가 열려도 아바타가 자리를 차지한다");
  assert.ok(play.includes('maxHeight: showTextInput ? "0px"'), "키패드가 열려도 위 여백이 남는다");
  assert.equal((play.match(/<div className="sticky bottom-0 pb-1 pt-1" style=\{keypadInputBackground\}>/g) ?? []).length, 2);
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
  // BA-1(2026-11-01) — 훈련용 홈 · 내 은행 앱(`bankAppOpen`)도 통화 셸을 덮는 모달이라 같은 줄에 더했다.
  assert.ok(play.includes("inert={chatOpen || smsOverlayOpen || bankAppOpen ? true : undefined}"));
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
  // §130.6(D16 남은 부분) — 동의 묶음은 화면 아래에 붙는다(360 · 375에서 체크 · 버튼이 첫 화면 안).
  assert.ok(page.includes('<div className="sticky bottom-0 -mx-6 mt-auto flex flex-col gap-3 bg-page px-6'));
  assert.ok(page.includes('<label className="flex cursor-pointer select-none items-start gap-3 py-2">'));
  assert.ok(page.includes('className="flex flex-1 flex-col gap-6 pt-6"'));
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

test("[§130 D4 표] 메신저 입력칸 높이 — 한 줄 48px에서 시작 · 내용만큼 · 4줄(126px)에서 멈춤", () => {
  assert.equal(CHAT_INPUT_MIN_PX, 48);
  assert.equal(CHAT_INPUT_MAX_PX, 126);
  assert.equal(chatInputHeight(30), 48, "한 줄보다 작게 재도 48px");
  assert.equal(chatInputHeight(48), 48);
  assert.equal(chatInputHeight(73.5), 74, "두 줄 = 내용 높이(올림)");
  assert.equal(chatInputHeight(400), 126, "5줄 이상은 4줄에서 멈춘다");
  assert.equal(chatInputHeight(Number.NaN), 48);
});

test("[§130 D4 배선] 한 줄 textarea(§110.1)는 그대로 · 높이 고정 대신 자동 높이 · 버튼은 아래 줄에 맞춘다", () => {
  const room = read("src/components/MessengerChatRoom.tsx");
  const tag = room.slice(room.indexOf('id="messenger-chat-input"'), room.indexOf("/>", room.indexOf('id="messenger-chat-input"')));
  assert.ok(tag.includes("rows={1}"));
  assert.ok(!tag.includes('"h-[48px]'), "높이 고정이 되살아났다 — 긴 글의 윗줄이 잘린다");
  assert.equal(tag.split('"min-h-[48px] min-w-0 flex-1').length - 1, 2);
  assert.ok(room.includes("box.style.height = `${chatInputHeight(box.scrollHeight)}px`;"));
  assert.ok(room.includes('className="flex items-end gap-2.5"'));
});

test("[§130 D15] 랜딩 3단계 목록은 높이 700px 이하에서만 화면에서 숨긴다 · 문면 · 스크린리더는 그대로", () => {
  const page = read("src/app/page.tsx");
  assert.ok(page.includes('className="landing-steps e2-rise"'));
  const css = read("src/app/globals.css");
  const block = css.match(/@media \(max-height: 700px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(block, /\.landing-steps \{[^}]*clip: rect\(0, 0, 0, 0\);/);
  assert.ok(!/\.landing-steps \{[^}]*display: none/.test(css), "display:none이면 스크린리더도 못 읽는다");
  assert.ok(!/^\.landing-steps/m.test(css), "700px 밖에서도 숨는다");
});

test("[§130 D17] 통화 전 안내는 스피커를 선택으로 안내한다(기본값 꺼짐 D-98과 맞춤)", () => {
  assert.equal(SCREEN_OFF_COPY.preCallHint, "통화하는 동안에는 화면을 켜 두세요. 필요하면 스피커를 켜 주세요.");
  assert.ok(!SCREEN_OFF_COPY.preCallHint.includes("스피커로 들어"));
  assert.ok(play.includes('const [audioRoute, setAudioRoute] = useState<AudioRoute>("call");'), "스피커 기본값 = 꺼짐(D-98)");
});

// ── §130.6(2026-10-24b 재측정 — docs/research/ui-emulator-check-2026-10-24b.md §4) ──

test("[§130.6 N5 표] 조사 — 받침 · 숫자 읽기에 맞춘다 · 모르면 종전 괄호 표기", () => {
  assert.equal(withJosa("이지수", "이/가"), "이지수가");
  assert.equal(withJosa("한결", "이/가"), "한결이");
  assert.equal(withJosa("010-4471-2298", "으로/로"), "010-4471-2298로", "8(팔) — ㄹ받침 → 로");
  assert.equal(withJosa("1666-3390", "으로/로"), "1666-3390으로", "0(영) → 으로");
  assert.equal(withJosa("070-7731-4401", "으로/로"), "070-7731-4401로", "1(일) — ㄹ받침 → 로");
  assert.equal(withJosa("서울", "으로/로"), "서울로", "ㄹ받침 → 로");
  assert.equal(withJosa("검찰청", "으로/로"), "검찰청으로");
  assert.equal(josa("Kim", "이/가"), "이(가)");
  assert.equal(josa("", "으로/로"), "(으)로");
  const room = read("src/components/MessengerChatRoom.tsx");
  assert.ok(room.includes('{withJosa(peerName, "이/가")} 입력 중입니다.'));
  for (const file of ["src/components/MessengerChatRoom.tsx", "src/app/scenarios/messenger/page.tsx"]) {
    assert.ok(!/\}\(으\)로|\}이\(가\)/.test(read(file)), `${file}: 변수 뒤 고정 괄호 조사가 남았다`);
  }
});

test("[§130.6 N1] 보이스톡 맡김 유효 시간은 통화 화면으로 넘어가는 순간부터 — 전환 요청이 30초를 넘겨도 발신 화면", () => {
  const audio = { tag: "a" };
  stashVoiceTalkDial({ sessionId: "s1", audio, atMs: 0 });
  const slow = VOICE_TALK_HANDOFF_TTL_MS + 5_000;
  assert.equal(peekVoiceTalkDial("s1", slow), null, "수정 전 조건 — 탭 시각 기준이면 버려진다(재측정 N1)");
  refreshVoiceTalkDial("s1", slow);
  assert.equal(peekVoiceTalkDial("s1", slow + 1_000)?.audio, audio, "넘어가는 순간 다시 찍으면 이어진다");
  refreshVoiceTalkDial("other", slow + 99_000);
  assert.equal(peekVoiceTalkDial("s1", slow + 1_000)?.audio, audio, "다른 세션의 갱신은 무시");
  clearVoiceTalkDial();
  refreshVoiceTalkDial("s1", slow);
  assert.equal(peekVoiceTalkDial("s1", slow), null, "맡긴 값이 없으면 갱신도 없다");
  const room = read("src/components/MessengerChatRoom.tsx");
  assert.match(room, /refreshVoiceTalkDial\(sessionId, Date\.now\(\)\);\s*router\.push\("\/session\/play"\);/);
});

test("[§130.6 N4] 키패드: 지우기 · 번호 전송은 번호 표시 줄 · 숫자판은 800px 이하에서 높이만 줄인다 · 상태 줄은 붙은 묶음 밖", () => {
  assert.ok(!play.includes("keypad-actions"), "별도 지우기 · 전송 줄이 되살아났다");
  const display = play.slice(play.indexOf('<div className="keypad-display'), play.indexOf("{/* 2026-10-21(실기 신고) — iOS형 = 큰 원 키"));
  assert.ok(display.includes("← 지우기") && display.includes("번호 전송") && display.includes('aria-label="입력한 번호"'));
  const css = read("src/app/globals.css");
  const block = css.match(/@media \(max-height: 800px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(block, /\.keypad-key \{\s*height: 44px;\s*\}/, "키 높이 44px(터치 하한)");
  assert.ok(!/font-size/.test(block), "짧은 화면에서도 글자 크기는 줄이지 않는다(G-VU5)");
  assert.ok(play.includes("compact={showTextInput}"), "키패드가 열리면 파형 막대만 접는다(상태 글은 그대로 — G289)");
  // 늘 같은 폴백 안내는 묶음 밖 · 전송 오류는 묶음 안.
  const fallbackInfo = play.indexOf('{callMode === "fallback" && !sendError && (');
  const stickyFallback = play.indexOf('<div className="sticky bottom-0 pb-1 pt-1" style={keypadInputBackground}>', fallbackInfo);
  assert.ok(fallbackInfo > 0 && stickyFallback > fallbackInfo, "폴백 안내가 붙은 묶음 앞(밖)에 있다");
  assert.ok(play.includes("{(sendError || (callMode !== \"fallback\" && speech.errorMessage)) && ("));
});

test("[§130.6 N7 표] 번호 · 시간 묶음이 하단 판에 덮이면 아바타를 접는다 · 되돌려도 겹치지 않을 때만 다시 보인다", () => {
  assert.equal(AVATAR_BLOCK_PX, 108);
  assert.equal(shouldHideCallAvatar({ hidden: false, infoBottom: 300, panelTop: 400 }), false, "글자 100% — 종전 그대로");
  assert.equal(shouldHideCallAvatar({ hidden: false, infoBottom: 434, panelTop: 400 }), true, "200% 360×640 — 34px 겹침");
  assert.equal(shouldHideCallAvatar({ hidden: true, infoBottom: 326, panelTop: 400 }), true, "되돌리면 34px 겹침 — 접힌 채");
  assert.equal(shouldHideCallAvatar({ hidden: true, infoBottom: 250, panelTop: 400 }), false, "충분히 넓어짐 — 다시 보인다");
  assert.equal(shouldHideCallAvatar({ hidden: true, infoBottom: Number.NaN, panelTop: 400 }), true, "못 재면 그대로");
  assert.ok(play.includes("shouldHideCallAvatar({ hidden, infoBottom: info.bottom, panelTop: panel.top })"));
});

test("[§130.6 D10 남은 부분] 사이트 본문도 낱말 단위 줄바꿈", () => {
  const landing = read("src/components/MessengerFakeLanding.tsx");
  assert.ok(landing.includes('<p key={line} className="text-[15px] leading-relaxed [word-break:keep-all]" style={{ color: page.body }}>'));
});
