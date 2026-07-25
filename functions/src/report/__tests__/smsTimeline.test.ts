// T89 — 통화 중 문자 이벤트의 리포트 스냅샷 (Architecture.md §15.1.5, AC-059).
//
// 이 파일이 고정하는 것은 세 가지다:
//   ① 앵커 해결 규칙표(§15.1.5 (4))가 규칙표 그대로 동작한다 — 특히 **턴 앵커로 병합**하며
//      시각(arrivedAt)은 정렬 tie-break에만 쓰인다(§15.6 G15).
//   ② 이벤트 파생 규칙표(§15.1.5 (5))가 규칙표 그대로 동작하고, 저장 필드가 늘지 않는다.
//   ③ 스냅샷에 금지 필드(fakeLandingId·otpCode·원시 타임스탬프·url)가 **절대 실리지 않는다**(G19).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSmsTimeline, type SmsTimelineMessage, type SmsTimelineSource } from "../smsTimeline";
import { analyzeConversation, buildPreventionAdvice } from "../analyzeConversation";

/** 사기범/사용자가 번갈아 말한 6턴 대화(turnIndex 0..5, 세션 시작 후 1초 간격). */
const SESSION_CREATED_MS = 1_000_000;
const messages: SmsTimelineMessage[] = [
  { role: "scammer", turnIndex: 0, createdAtMs: SESSION_CREATED_MS + 1_000 }, // 사기범 #1(오프닝)
  { role: "user", turnIndex: 1, createdAtMs: SESSION_CREATED_MS + 2_000 },
  { role: "scammer", turnIndex: 2, createdAtMs: SESSION_CREATED_MS + 3_000 }, // 사기범 #2
  { role: "user", turnIndex: 3, createdAtMs: SESSION_CREATED_MS + 4_000 },
  { role: "scammer", turnIndex: 4, createdAtMs: SESSION_CREATED_MS + 5_000 }, // 사기범 #3
  { role: "user", turnIndex: 5, createdAtMs: SESSION_CREATED_MS + 6_000 },
];

function sms(overrides: Partial<SmsTimelineSource> = {}): SmsTimelineSource {
  return {
    smsId: "sms-1",
    kind: "account",
    senderLabel: "0507-000-0000",
    body: "안내드린 계좌입니다.",
    anchorScammerTurn: 2,
    arrivedAtMs: SESSION_CREATED_MS + 3_500,
    ...overrides,
  };
}

test("[§15.1.5 (4) 규칙 2] 앵커 N = N번째 사기범 메시지의 turnIndex로 해결된다", () => {
  const [entry] = buildSmsTimeline([sms({ anchorScammerTurn: 2 })], messages, SESSION_CREATED_MS);
  assert.equal(entry.anchorTurnIndex, 2, "사기범 #2의 turnIndex");
  assert.equal(entry.anchorResolved, true);
});

test("[§15.1.5 (4) 규칙 1] 앵커 0 이하 = 대화 맨 앞(-1), 해결됨", () => {
  const [entry] = buildSmsTimeline([sms({ anchorScammerTurn: 0 })], messages, SESSION_CREATED_MS);
  assert.equal(entry.anchorTurnIndex, -1);
  assert.equal(entry.anchorResolved, true);
  assert.equal(entry.timeLabel, undefined, "앵커 메시지가 없으면 시각 라벨도 없다");
});

test("[§15.1.5 (4) 규칙 3] 전사가 짧아 앵커를 못 찾으면 조용히 버리지 않고 미해결로 표기한다(P-4)", () => {
  const [entry] = buildSmsTimeline([sms({ anchorScammerTurn: 99 })], messages, SESSION_CREATED_MS);
  assert.equal(entry.anchorResolved, false);
  assert.equal(entry.anchorTurnIndex, 5, "마지막 메시지 뒤에 놓는다");
  assert.equal(entry.timeLabel, undefined, "미해결이면 시각 라벨을 만들지 않는다");
  assert.equal(entry.events.length >= 1, true, "미해결이어도 항목 자체는 사라지지 않는다");
});

test("[§15.1.5 (4) 규칙 3] T89 이전 문서(anchorScammerTurn 부재)도 미해결로 정직하게 표기된다(무백필)", () => {
  const legacy = sms();
  delete legacy.anchorScammerTurn;
  const [entry] = buildSmsTimeline([legacy], messages, SESSION_CREATED_MS);
  assert.equal(entry.anchorResolved, false);
});

test("[§15.1.5 (4)] 메시지가 0건이면 앵커는 -1이고 미해결이다", () => {
  const [entry] = buildSmsTimeline([sms({ anchorScammerTurn: 2 })], [], SESSION_CREATED_MS);
  assert.equal(entry.anchorTurnIndex, -1);
  assert.equal(entry.anchorResolved, false);
});

test("[§15.1.5 (4)] timeLabel은 **앵커 메시지의 경과 초**에서 파생한다 — arrivedAt이 아니다(G15)", () => {
  // arrivedAt을 통화 시작 0.1초로 두어도(실시간 경로의 실제 시각처럼) 라벨은 앵커 메시지 기준이다.
  const [entry] = buildSmsTimeline(
    [sms({ anchorScammerTurn: 3, arrivedAtMs: SESSION_CREATED_MS + 100 })],
    messages,
    SESSION_CREATED_MS,
  );
  assert.equal(entry.anchorTurnIndex, 4, "사기범 #3");
  assert.equal(entry.timeLabel, "5초 시점", "deceivedMoments와 같은 `N초 시점` 포맷·같은 시간축");
});

test("[§15.6 G15] 병합 축이 시계가 아니다 — arrivedAt이 모든 메시지보다 앞서도 문자가 맨 앞으로 몰리지 않는다", () => {
  // 실시간 경로 재현: messages.createdAt은 통화 **종료 시점** 합성값이라 arrivedAt보다 훨씬 크다.
  const realtimeMessages: SmsTimelineMessage[] = messages.map((m) => ({
    ...m,
    createdAtMs: SESSION_CREATED_MS + 600_000 + m.turnIndex * 1_000,
  }));
  const entries = buildSmsTimeline(
    [
      sms({ smsId: "a", anchorScammerTurn: 3, arrivedAtMs: SESSION_CREATED_MS + 10 }),
      sms({ smsId: "b", anchorScammerTurn: 1, arrivedAtMs: SESSION_CREATED_MS + 20 }),
    ],
    realtimeMessages,
    SESSION_CREATED_MS,
  );
  assert.deepEqual(
    entries.map((e) => [e.smsId, e.anchorTurnIndex]),
    [
      ["b", 0],
      ["a", 4],
    ],
    "턴 앵커 순서로 정렬된다(시각순이면 a가 먼저이고 둘 다 대화 맨 앞에 몰렸을 것)",
  );
});

test("[§15.1.5 (4)] 같은 앵커의 문자는 arrivedAt 오름차순, 동률이면 smsId 사전순", () => {
  const entries = buildSmsTimeline(
    [
      sms({ smsId: "z", anchorScammerTurn: 2, arrivedAtMs: 500 }),
      sms({ smsId: "b", anchorScammerTurn: 2, arrivedAtMs: 100 }),
      sms({ smsId: "a", anchorScammerTurn: 2, arrivedAtMs: 500 }),
    ],
    messages,
    SESSION_CREATED_MS,
  );
  assert.deepEqual(entries.map((e) => e.smsId), ["b", "a", "z"]);
});

// ── 이벤트 파생 규칙표(§15.1.5 (5)) ──────────────────────────────────────────────
test("[규칙 1] 열지 않은 문자도 sms_received 1건은 항상 남는다(도착은 사용자 행위가 아니라 correctAction 없음)", () => {
  const [entry] = buildSmsTimeline([sms()], messages, SESSION_CREATED_MS);
  assert.deepEqual(entry.events.map((e) => e.event), ["sms_received"]);
  assert.equal(entry.events[0].correctAction, undefined);
});

test("[규칙 2] kind==='otp' + openedAt → sms_otp_shown(파생 표기, 저장 이벤트 아님) + correctAction", () => {
  const [entry] = buildSmsTimeline(
    [sms({ kind: "otp", openedAtMs: 1 })],
    messages,
    SESSION_CREATED_MS,
  );
  assert.deepEqual(entry.events.map((e) => e.event), ["sms_received", "sms_otp_shown"]);
  assert.match(entry.events[1].correctAction ?? "", /인증번호/);
});

test("[규칙 2·3 상호배타] otp가 아닌 문자를 열면 sms_opened이고 otp 표기는 나오지 않는다", () => {
  const [entry] = buildSmsTimeline(
    [sms({ kind: "link", openedAtMs: 1 })],
    messages,
    SESSION_CREATED_MS,
  );
  assert.deepEqual(entry.events.map((e) => e.event), ["sms_received", "sms_opened"]);
  assert.equal(entry.events[1].correctAction, undefined, "확인 자체는 위험 행동이 아니다");
});

test("[규칙 4 가산] 링크 탭은 열람 이벤트 뒤에 더해지고 correctAction을 가진다", () => {
  const [entry] = buildSmsTimeline(
    [sms({ kind: "link", openedAtMs: 1, linkTappedAtMs: 2 })],
    messages,
    SESSION_CREATED_MS,
  );
  assert.deepEqual(entry.events.map((e) => e.event), [
    "sms_received",
    "sms_opened",
    "sms_link_tapped",
  ]);
  assert.match(entry.events[2].correctAction ?? "", /링크/);
});

test("[§15.1.5 (5)] sms_overlay_closed는 어떤 조합에서도 생성되지 않는다(명시적 범위 밖)", () => {
  const [entry] = buildSmsTimeline(
    [sms({ kind: "otp", openedAtMs: 1, linkTappedAtMs: 2 })],
    messages,
    SESSION_CREATED_MS,
  );
  assert.equal(
    entry.events.some((e) => (e.event as string) === "sms_overlay_closed"),
    false,
  );
});

// ── 스냅샷 금지 필드(§15.1.5 (3) 표 / §15.6 G19) ────────────────────────────────
test("[G19] 스냅샷에 fakeLandingId·otpCode·원시 타임스탬프·url이 실리지 않는다(사후 화면 재진입 표면 금지)", () => {
  const source = {
    ...sms({ kind: "link", openedAtMs: 111, linkTappedAtMs: 222 }),
    linkDisplayText: "본인확인 안내",
    // 소스에 있더라도(장래 타입이 넓어져도) 스냅샷으로 새어 나가면 안 된다.
    fakeLandingId: "bank-verify",
    otpCode: "482917",
  } as SmsTimelineSource & Record<string, unknown>;
  const [entry] = buildSmsTimeline([source], messages, SESSION_CREATED_MS);
  const record = entry as unknown as Record<string, unknown>;
  for (const forbidden of [
    "fakeLandingId",
    "otpCode",
    "url",
    "arrivedAt",
    "arrivedAtMs",
    "openedAt",
    "openedAtMs",
    "linkTappedAt",
    "linkTappedAtMs",
  ]) {
    assert.equal(record[forbidden], undefined, `금지 필드가 스냅샷에 실렸다: ${forbidden}`);
  }
  assert.equal(entry.linkDisplayText, "본인확인 안내", "표시용 텍스트는 남는다(컨트롤 아님)");
});

test("[§15.1.5 (1)] 문자가 0건이면 빈 배열이다(필드 자체를 만들지 않는 호출부 조건과 정합)", () => {
  assert.deepEqual(buildSmsTimeline([], messages, SESSION_CREATED_MS), []);
});

// ── §15.1.5 (2) 필수 회귀 테스트 ① — G3/G22 재발 금지 ────────────────────────────
// "문자 N건 세션과 0건 세션에서 wasDeceived/deceivedMoments/tacticsUsed/preventionAdvice가 **완전히
// 동일**". 문자를 messages에 끼워 넣었다면 scammer(i)↔user(i+1) 짝짓기가 어긋나 이 등식이 깨진다.
test("[필수 회귀 §15.1.5 (2)①] 문자 N건과 0건의 판정 산출이 완전히 동일하다(G3/G22)", () => {
  const analysisInput = messages.map((m, i) => ({
    role: m.role,
    // 사기범 #2가 수법을 쓰고 사용자가 인증번호를 불러 준 대화(속은 순간 1건이 나오는 형태).
    textMasked: m.role === "scammer" ? `지금 바로 확인해야 합니다 ${i}` : i === 3 ? "482917" : `네 ${i}`,
    turnIndex: m.turnIndex,
    createdAtMs: m.createdAtMs,
  }));
  const tactics = ["긴급성 조성 — 지금 바로"];

  const withoutSms = analyzeConversation(analysisInput, SESSION_CREATED_MS, tactics);
  const smsTimeline = buildSmsTimeline(
    [
      sms({ smsId: "otp-1", kind: "otp", anchorScammerTurn: 2, openedAtMs: 1 }),
      sms({ smsId: "link-1", kind: "link", anchorScammerTurn: 3, openedAtMs: 2, linkTappedAtMs: 3 }),
    ],
    messages,
    SESSION_CREATED_MS,
  );
  const withSms = analyzeConversation(analysisInput, SESSION_CREATED_MS, tactics);

  assert.equal(smsTimeline.length, 2, "문자가 실제로 스냅샷된 상태에서 비교해야 의미가 있다");
  assert.deepEqual(withSms, withoutSms, "문자 스냅샷은 판정 산출을 한 글자도 바꾸지 않는다");
  assert.deepEqual(
    buildPreventionAdvice(withSms.tacticsUsed, withSms.wasDeceived),
    buildPreventionAdvice(withoutSms.tacticsUsed, withoutSms.wasDeceived),
  );
  // G22 — 링크 탭 1건이 있어도 deceivedMoments 개수가 늘지 않는다(승격 금지).
  assert.equal(withSms.deceivedMoments.length, withoutSms.deceivedMoments.length);
});

test("[필수 회귀 §15.1.5 (2)①·G22] 속은 순간 0건 세션은 문자가 있어도 wasDeceived가 false로 남는다", () => {
  // 사용자가 전부 거절한 대화 — 문자를 열고 링크까지 눌러도 판정은 뒤집히지 않는다(AC-062 보호).
  const resisting = messages.map((m, i) => ({
    role: m.role,
    textMasked: m.role === "scammer" ? `지금 바로 확인해야 합니다 ${i}` : "아니요, 직접 확인하고 다시 연락드릴게요",
    turnIndex: m.turnIndex,
    createdAtMs: m.createdAtMs,
  }));
  const analysis = analyzeConversation(resisting, SESSION_CREATED_MS, ["긴급성 조성 — 지금 바로"]);
  const smsTimeline = buildSmsTimeline(
    [sms({ smsId: "link-1", kind: "link", openedAtMs: 1, linkTappedAtMs: 2 })],
    messages,
    SESSION_CREATED_MS,
  );
  assert.equal(analysis.wasDeceived, false);
  assert.equal(analysis.deceivedMoments.length, 0);
  assert.equal(smsTimeline.length, 1, "그럼에도 문자 이벤트는 표시용으로 남는다(G18 — 화면이 감추지 않도록)");
  assert.equal(smsTimeline[0].events.some((e) => e.event === "sms_link_tapped"), true);
});
