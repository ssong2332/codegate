// §110(실기 신고 9 · 10 · 12 · 13 · 14 — 2026-10-22 갤럭시 S25 · 웨일) — 화면 쪽 판정 · 배선 고정.
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다(callAudio.test.ts 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ESCALATED_CALL_OPENING_TURN, openingTurnFor } from "../realtime/escalatedOpening.ts";
import { FAMILY_ADDRESS_OPTIONS, familyAddressOptionsFor } from "../familyAddress.ts";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

// ── 신고 12 — 메신저발 통화의 첫 턴 신호 ──
test("[§110.3] 첫 턴 신호 — 재연결 = 종전 resumeTurn · 메신저발 첫 연결 = 이어받기 신호 · 그 밖 = null(종전 오프닝)", () => {
  assert.equal(openingTurnFor({ connectionSeq: 1, resumeTurn: "R", escalatedFromMessenger: true }), "R");
  assert.equal(openingTurnFor({ connectionSeq: 2, resumeTurn: null, escalatedFromMessenger: false }), null);
  assert.equal(openingTurnFor({ connectionSeq: 0, resumeTurn: "R", escalatedFromMessenger: true }), ESCALATED_CALL_OPENING_TURN);
  assert.equal(openingTurnFor({ connectionSeq: 0, resumeTurn: null, escalatedFromMessenger: false }), null);
  assert.match(ESCALATED_CALL_OPENING_TURN, /처음부터 다시 소개하거나 같은 사정을 다시 설명하지 말고/);
});

// ── 신고 13 — 통화 끊기 = 대화방 복귀 ──
test("[§110.4] 통화 화면 — 빨간 종료 · 수신 거절은 메신저발 통화면 대화방 복귀(전사 제출 → followUp 전환 → 대화방) · 실패면 훈련 종료", () => {
  const play = read("src/app/session/play/page.tsx");
  assert.match(play, /const returnsToMessengerOnHangup = scenario\?\.channel === "messenger";/);
  assert.match(play, /onClick=\{\(\) => void handleHangup\(\)\}/);
  // 순서: 전사 제출이 전환보다 먼저(대화방 · 복귀 메시지 · 리포트가 통화 내용을 안다).
  const body = play.slice(play.indexOf("const handleRequestReverseEscalation"), play.indexOf("const handleToggleMute"));
  assert.ok(body.indexOf("await flushTranscript()") < body.indexOf("requestReverseEscalation({ sessionId, followUp: true })"));
  assert.match(body, /if \(via === "hangup"\) \{\s*await endCall\("user"\);/);
  const decline = play.slice(play.indexOf("const handleDecline"), play.indexOf("const handleOpenSmsOverlay"));
  assert.match(decline, /if \(returnsToMessengerOnHangup\) \{\s*void handleRequestReverseEscalation\("hangup"\);/);
});

// ── 신고 9 — 키보드 위 자동 채우기 줄 ──
test("[§110.1] 메신저 입력칸은 한 줄 textarea(자동 채우기 액세서리 줄 회피) · Enter = 전송 · 한글 조합 중 Enter는 전송하지 않는다", () => {
  const src = read("src/app/session/messenger/page.tsx");
  const at = src.indexOf('id="messenger-chat-input"');
  const tagStart = src.lastIndexOf("<", at);
  assert.equal(src.slice(tagStart, tagStart + 9), "<textarea");
  const tag = src.slice(at, src.indexOf("/>", at));
  assert.match(tag, /rows=\{1\}/);
  assert.match(tag, /event\.nativeEvent\.isComposing \|\| event\.keyCode === 229\) return;/);
  assert.match(tag, /resize-none/);
});

// ── 신고 14 — 호칭 ──
test("[§110.5] 호칭 표 — 클라 표 = 서버 표(시나리오 · 선택지 · 순서)", () => {
  const server = read("functions/src/scenarios/familyAddress.ts");
  assert.match(server, /const PARENT_ROW: FamilyAddressRow = \{ options: \["엄마", "아빠"\], promptDefault: "엄마" \};/);
  assert.match(server, /const GRANDPARENT_ROW: FamilyAddressRow = \{ options: \["할머니", "할아버지"\], promptDefault: "할머니" \};/);
  const serverRows = [...server.matchAll(/\[([A-Z_]+_SCENARIO_ID)\]: (PARENT_ROW|GRANDPARENT_ROW)/g)].map((m) => m[2]);
  assert.deepEqual(serverRows, ["PARENT_ROW", "PARENT_ROW", "GRANDPARENT_ROW"]);
  assert.deepEqual(FAMILY_ADDRESS_OPTIONS, {
    "messenger-child-impersonation-kakao": ["엄마", "아빠"],
    "family-accident-deepvoice": ["엄마", "아빠"],
    "grandchild-impersonation": ["할머니", "할아버지"],
  });
  assert.equal(familyAddressOptionsFor("institutional-impersonation"), undefined);
  assert.equal(familyAddressOptionsFor(null), undefined);
});

test("[§110.5] 세션 생성 3곳이 고른 호칭을 싣는다 · 난이도 화면은 고르기 전 시작 불가(성별 짐작 0)", () => {
  const difficulty = read("src/app/scenarios/difficulty/page.tsx");
  assert.match(difficulty, /if \(familyAddressOptions && !familyAddress\) \{\s*setStartError\(FAMILY_ADDRESS_REQUIRED_LINE\);\s*return;/);
  assert.match(difficulty, /\.\.\.\(familyAddressOptions && familyAddress \? \{ familyAddress \} : \{\}\)/);
  assert.match(difficulty, /useState<FamilyAddressTerm \| null>\(null\)/);
  for (const file of ["src/app/scenarios/messenger/voice-select/page.tsx", "src/app/clone/wait/page.tsx"]) {
    assert.match(read(file), /\.\.\.familyAddressRequestField\(scenarioId\)/, file);
  }
});
