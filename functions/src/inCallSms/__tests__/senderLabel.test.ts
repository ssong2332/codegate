// ⭐ 2026-11-08(사용자 결정 "고치기") — 같은 발신 번호는 한 세션에서 이름 하나(판정표 L · `senderLabel.ts`).
// 실측: 기관 사칭 고급 `02-0731-5402` = "본인확인 안내"(문자함 목록) · "자산검수 안내"(배너) · "자산보호 안내",
//       카드사 `02-0762-4180` = "카드 승인취소 인증" · "피해금 이관 안내".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { priorSenderLabelOf, senderNumberOf, sessionSenderLabel } from "../senderLabel";
import { deliverSmsThroughGate, type SmsStore } from "../smsDelivery";
import type { FlowVariantSms } from "../../scenarios/flowVariants";
import { IN_CALL_SMS, SMS_SENDER_NUMBER } from "../../scenarios/inCallSms";
import type { InCallSmsDoc } from "../../shared/types";

const SRC = path.resolve(__dirname, "../../../src");
const read = (file: string) => readFileSync(path.join(SRC, file), "utf8").replace(/\r\n/g, "\n");

const INST = SMS_SENDER_NUMBER["institutional-impersonation"]!;
const CARD = SMS_SENDER_NUMBER["card-company-impersonation"]!;

test("[판정표 L] 같은 번호로 먼저 온 문자가 있으면 그 이름 · 없거나 번호가 다르면 카탈로그 라벨", () => {
  assert.equal(senderNumberOf(`${INST} (본인확인 안내)`), INST);
  assert.equal(senderNumberOf("070-0462-1593"), "070-0462-1593", "번호뿐인 라벨");
  // L2 — 처음 오는 문자
  assert.equal(sessionSenderLabel(`${INST} (자산검수 안내)`, []), `${INST} (자산검수 안내)`);
  // L1 — 실측 두 사례
  assert.equal(sessionSenderLabel(`${INST} (자산검수 안내)`, [{ senderLabel: `${INST} (본인확인 안내)`, arrivedAtMs: 1 }]), `${INST} (본인확인 안내)`);
  assert.equal(sessionSenderLabel(`${CARD} (피해금 이관 안내)`, [{ senderLabel: `${CARD} (카드 승인취소 인증)`, arrivedAtMs: 1 }]), `${CARD} (카드 승인취소 인증)`);
  // 가장 먼저 도착한 것 · 도착 시각 없는 옛 문서는 뒤로
  assert.equal(
    sessionSenderLabel(`${INST} (자산보호 안내)`, [
      { senderLabel: `${INST} (자산예탁 안내)` },
      { senderLabel: `${INST} (본인확인 안내)`, arrivedAtMs: 5 },
      { senderLabel: `${INST} (자산검수 안내)`, arrivedAtMs: 2 },
    ]),
    `${INST} (자산검수 안내)`,
  );
  // 번호가 다르면 따로(카드사 R1 보낸 곳마다 다른 번호 · 대출 안내 문자 등)
  assert.equal(sessionSenderLabel("070-0462-1593", [{ senderLabel: "02-0767-3051", arrivedAtMs: 1 }]), "070-0462-1593");
  assert.equal(sessionSenderLabel(`${INST} (자산보호 안내)`, [{ senderLabel: `${CARD} (카드 승인취소 인증)`, arrivedAtMs: 1 }]), `${INST} (자산보호 안내)`);
  // 라벨 없는 기록은 무시
  assert.equal(sessionSenderLabel(`${INST} (자산보호 안내)`, [{ arrivedAtMs: 1 }]), `${INST} (자산보호 안내)`);
});

test("[판정표 L] Firestore 문서 읽기 — 라벨 · 도착 시각만 · 값 밖은 키 없음", () => {
  const doc: Record<string, unknown> = { senderLabel: `${INST} (본인확인 안내)`, arrivedAt: { toMillis: () => 42 } };
  assert.deepEqual(priorSenderLabelOf((f) => doc[f]), { senderLabel: `${INST} (본인확인 안내)`, arrivedAtMs: 42 });
  assert.deepEqual(priorSenderLabelOf(() => undefined), {});
});

// 게이트 단일 통로(실 카탈로그 · 메모리 저장소 — `smsGate.test.ts`와 같은 꼴 + 라벨 · 도착 시각).
function memoryStore(): SmsStore & { docs: Map<string, InCallSmsDoc> } {
  const docs = new Map<string, InCallSmsDoc>();
  return {
    docs,
    transact: async (fn) =>
      fn({
        listDelivered: async () =>
          [...docs.values()].map((d) => ({
            smsId: d.smsId,
            userTurnsAtArrival: d.userTurnsAtArrival,
            senderLabel: d.senderLabel,
            arrivedAtMs: (d.arrivedAt as unknown as { toMillis: () => number }).toMillis(),
          })),
        create: (smsId, doc) => {
          if (docs.has(smsId)) throw new Error("ALREADY_EXISTS");
          docs.set(smsId, doc);
        },
      }),
  };
}
const ts = (ms: number) => ({ toMillis: () => ms }) as unknown as FirebaseFirestore.Timestamp;

test("[판정표 L · 게이트 실경로] 기관 사칭 — 본인확인 문자 뒤 자산보호 문자도 같은 이름으로 저장(배너 · 목록 · 대화방 머리 · 리포트가 같은 값)", async () => {
  const ID: FlowVariantSms = { purpose: "identity", smsId: "institution-otp", required: false, notBeforeUserTurns: 2 };
  const TR: FlowVariantSms = { purpose: "transfer", smsId: "institution-safe-account", required: true, notBeforeUserTurns: 3 };
  const catalog = (smsId: string) => IN_CALL_SMS["institutional-impersonation"]!.find((i) => i.smsId === smsId)!.senderLabel;
  assert.notEqual(catalog(ID.smsId), catalog(TR.smsId), "전제 — 카탈로그 이름이 다르다");
  const store = memoryStore();
  const base = { scenarioId: "institutional-impersonation", declared: [ID, TR] };
  const first = await deliverSmsThroughGate(store, { ...base, purpose: "identity", userTurns: 2, anchorScammerTurn: 3, trigger: "model_tool", now: () => ts(1000) });
  assert.equal(first.status, "delivered");
  const second = await deliverSmsThroughGate(store, { ...base, purpose: "transfer", userTurns: 6, anchorScammerTurn: 7, trigger: "model_tool", now: () => ts(2000) });
  assert.equal(second.status, "delivered");
  assert.equal(store.docs.get(ID.smsId)!.senderLabel, catalog(ID.smsId), "첫 문자 = 카탈로그");
  assert.equal(store.docs.get(TR.smsId)!.senderLabel, catalog(ID.smsId), "둘째 문자 = 첫 문자 이름");
  assert.equal(store.docs.get(TR.smsId)!.body, IN_CALL_SMS["institutional-impersonation"]!.find((i) => i.smsId === TR.smsId)!.body, "본문은 그대로");
});

test("[판정표 L 배선] 문자 문서를 만드는 세 지점이 모두 맞춘 라벨을 쓴다 · 게이트 기록이 라벨 · 도착 시각을 읽는다", () => {
  const src = read("inCallSms/smsDelivery.ts");
  assert.equal(src.split("buildInCallSmsDoc(").length - 1, 3, "문서 생성 지점 3곳 그대로");
  assert.match(src, /senderLabel: sessionSenderLabel\(doc\.senderLabel, delivered\),/, "게이트 통로(트랜잭션 안 목록)");
  assert.equal(src.split("senderLabel: await alignedSenderLabel(sessionRef, doc.senderLabel)").length - 1, 2, "시작 문자 · 안내 문자");
  assert.match(src, /\.\.\.priorSenderLabelOf\(\(field\) => doc\.get\(field\)\),/, "toDeliveredRecord");
});
