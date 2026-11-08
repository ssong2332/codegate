// ⭐ 2026-11-08(#538 발견 1 · 사용자 결정 "고치기") — 실시간 모델 도구 경로의 문자 앵커 입력(`scammerTranscriptTurns`)은 세션 누적값이어야 한다.
// 서버 앵커 = 1 + 그 값(`realtimeAnchorScammerTurn`) → 리포트는 세션 전체 사기범 메시지 중 N번째로 푼다(`resolveAnchor` — 통화 구분 없음).
// 종전 화면은 Live 컴포넌트가 새 연결(다음 통화 · 재연결)마다 다시 마운트되며 0부터 센 값을 보냈다 → 통화 2 · 3 문자가 세션 맨 앞에 찍혔다.
//
// | # | 루트 · 상황 | 문자 | 종전 값(연결 안 수) → 순간 turnIndex | 고친 값(세션 누적) → 순간 turnIndex |
// |---|---|---|---|---|
// | M1 | 기관 사칭 고급 fv-c5fj 통화 3(대출금 보관 이체) — 에뮬레이터 실측(#538 스모크 A)과 같은 배치 | institution-loan-safe-account | 1 → **1**(통화 1) | 12 → **23**(통화 3 첫 턴) |
// | M2 | 카드사 고급 R1 fv-k3dn 통화 2(원격 지원 앱 설치) | card-remote-support-link | 연결 안 수 → 통화 2보다 앞 | 세션 누적 → 통화 2 |
// | M3 | 카드사 고급 R1 fv-k3dn 통화 4(안전계좌 이체) | card-safe-account | 연결 안 수 → 통화 4보다 앞 | 세션 누적 → 통화 4 |
// | M4 | 같은 통화 안 연결 끊김 다시 잇기(화면 꺼짐 · 10분 이어받기) | 재연결 뒤 문자 | 0부터 → 재연결 전 앞쪽 | 세션 누적 → 재연결 뒤 |
// | M5 | 세션 첫 연결(대조) | 첫 통화 문자 | 같음 | 같음(동작 변화 0) |
// 클라 쪽 값이 실제로 세션 누적인지는 루트 `src/lib/realtime/sessionScammerAnchor.test.ts`가 배선으로 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { promoteSmsLandingSubmits, resolveAnchor, type SmsTimelineMessage, type SmsTimelineSource } from "../smsTimeline";
import { realtimeAnchorScammerTurn } from "../../inCallSms/buildDoc";
import { MOCK_SCREENS } from "../../scenarios/mockScreens";
import { findInCallSmsItem } from "../../scenarios/inCallSms";

const CREATED = 1_000_000;

/** 통화(연결)별 사기범 · 참가자 번갈이 대화. turnIndex 0 = 세션 오프닝(사기범 — 에뮬레이터 세션과 같은 모양). 연결 경계마다 그 연결의 사기범 flush 수를 함께 돌려준다. */
function layout(perConnection: readonly number[]): { messages: SmsTimelineMessage[]; ranges: [number, number][] } {
  const messages: SmsTimelineMessage[] = [{ role: "scammer", turnIndex: 0, createdAtMs: CREATED }];
  const ranges: [number, number][] = [];
  let turn = 1;
  for (const pairs of perConnection) {
    const from = turn;
    for (let i = 0; i < pairs; i += 1) {
      messages.push({ role: "scammer", turnIndex: turn, createdAtMs: CREATED + turn * 1000 });
      turn += 1;
      messages.push({ role: "user", turnIndex: turn, createdAtMs: CREATED + turn * 1000 });
      turn += 1;
    }
    ranges.push([from, turn - 1]);
  }
  return { messages, ranges };
}

/** 그 연결의 k번째 사기범 전사(1부터)까지 flush된 뒤 도구가 불렸을 때 — 종전(연결 안 수) · 고친(세션 누적) 클라 값. */
function claims(perConnection: readonly number[], connection: number, k: number): { old: number; fixed: number } {
  const before = perConnection.slice(0, connection).reduce((a, b) => a + b, 0);
  return { old: k, fixed: before + k };
}

function landingMomentTurn(scenarioId: string, smsId: string, anchorScammerTurn: number, messages: SmsTimelineMessage[]): number | undefined {
  const item = findInCallSmsItem(scenarioId, smsId);
  assert.ok(item?.fakeLandingId, `${smsId} = 화면 링크 문자`);
  const doc: SmsTimelineSource = {
    smsId,
    kind: item!.kind,
    senderLabel: item!.senderLabel,
    body: item!.body,
    anchorScammerTurn,
    arrivedAtMs: CREATED + 60_000,
    landingSubmittedAtMs: CREATED + 61_000,
    fakeLandingId: item!.fakeLandingId,
  };
  const result = promoteSmsLandingSubmits([doc], [], messages, CREATED, MOCK_SCREENS[scenarioId] ?? []);
  return result.deceivedMoments[0]?.turnIndex;
}

const inRange = (turn: number | undefined, [from, to]: [number, number]) => turn !== undefined && turn >= from && turn <= to;

test("[M1] 기관 고급 통화 3 대출금 보관 이체 — 종전 1 → turnIndex 1 · 고친 값 12 → turnIndex 23(#538 실측 재현)", () => {
  // 통화 1 사기범 7 · 통화 2 상담원 4 · 통화 3 첫 사기범 줄 뒤 문자(에뮬레이터 스모크 A 배치 — 통화 2 끝에 참가자 한 줄은 판정에 영향 없음).
  const perConnection = [7, 4, 1];
  const { messages, ranges } = layout(perConnection);
  const { old, fixed } = claims(perConnection, 2, 1);
  assert.deepEqual({ old, fixed }, { old: 1, fixed: 12 });
  const before = landingMomentTurn("institutional-impersonation", "institution-loan-safe-account", realtimeAnchorScammerTurn(old), messages);
  const after = landingMomentTurn("institutional-impersonation", "institution-loan-safe-account", realtimeAnchorScammerTurn(fixed), messages);
  assert.equal(before, 1, "종전 — 세션 맨 앞(통화 1)");
  assert.equal(after, 23, "고친 값 — 통화 3 첫 턴");
  assert.ok(inRange(after, ranges[2]!) && !inRange(before, ranges[2]!));
});

test("[M2 · M3] 카드사 고급 R1 — 통화 2 원격 지원 앱 · 통화 4 안전계좌 문자가 그 통화 안에 앵커된다", () => {
  // 통화 1 배송원 3 · 통화 2 상담원 5 · 통화 3 감독기관 3 · 통화 4 검사 6(판단값 — 숫자는 결과에 영향 없고 통화 경계만 본다).
  const perConnection = [3, 5, 3, 6];
  const { messages, ranges } = layout(perConnection);
  // M2 — 통화 2의 3번째 사기범 줄 뒤 원격 지원 링크(설치 화면 문서는 문자 문서의 앵커를 복사해 같은 리졸버로 푼다 — generateReportCore `explicitAnchor`).
  const m2 = claims(perConnection, 1, 3);
  const m2Old = resolveAnchor(realtimeAnchorScammerTurn(m2.old), messages, CREATED).anchorTurnIndex;
  const m2Fixed = resolveAnchor(realtimeAnchorScammerTurn(m2.fixed), messages, CREATED).anchorTurnIndex;
  assert.ok(findInCallSmsItem("card-company-impersonation", "card-remote-support-link")?.fakeLandingId, "원격 지원 문자 = 화면 링크");
  assert.ok(m2Old < ranges[1]![0], `종전 = 통화 2보다 앞(${m2Old})`);
  assert.ok(inRange(m2Fixed, ranges[1]!), `고친 값 = 통화 2(${m2Fixed})`);
  // M3 — 통화 4의 4번째 사기범 줄 뒤 안전계좌 문자 → 이체 화면 제출 = 속은 순간.
  const m3 = claims(perConnection, 3, 4);
  const m3Old = landingMomentTurn("card-company-impersonation", "card-safe-account", realtimeAnchorScammerTurn(m3.old), messages);
  const m3Fixed = landingMomentTurn("card-company-impersonation", "card-safe-account", realtimeAnchorScammerTurn(m3.fixed), messages);
  assert.ok(m3Old !== undefined && m3Old < ranges[3]![0], `종전 = 통화 4보다 앞(${m3Old})`);
  assert.ok(inRange(m3Fixed, ranges[3]!), `고친 값 = 통화 4(${m3Fixed})`);
});

test("[M4 · M5] 같은 통화 재연결 뒤 문자 · 첫 연결(대조)", () => {
  // 한 통화를 연결 둘로 — 앞 연결 사기범 6 · 끊김 다시 잇기 뒤 4번째 사기범 줄 다음 문자.
  const perConnection = [6, 5];
  const { messages, ranges } = layout(perConnection);
  const m4 = claims(perConnection, 1, 4);
  const m4Old = landingMomentTurn("institutional-impersonation", "institution-asset-safe-account", realtimeAnchorScammerTurn(m4.old), messages);
  const m4Fixed = landingMomentTurn("institutional-impersonation", "institution-asset-safe-account", realtimeAnchorScammerTurn(m4.fixed), messages);
  assert.ok(m4Old !== undefined && m4Old < ranges[1]![0], `종전 = 재연결 전(${m4Old})`);
  assert.ok(inRange(m4Fixed, ranges[1]!), `고친 값 = 재연결 뒤(${m4Fixed})`);
  // M5 — 첫 연결은 두 값이 같다(동작 변화 0).
  const m5 = claims(perConnection, 0, 5);
  assert.equal(m5.old, m5.fixed);
});
