// 통화 중 문자 **발송 실행** — 세 호출부(실시간 도구 · 텍스트 폴백 마커 · 백스톱)의 단일 통로(T191 문자 도달 조건
// 설계 · AC-099 (f) "3경로 동일" · 설계 금지 X4).
//
// 판정은 `smsGate.ts`의 `resolveSmsGate` 하나이고, 이 파일은 그 판정을 **도착 기록을 읽은 같은 트랜잭션 안에서**
// 돌린 뒤 허용일 때만 문서를 만든다. 트랜잭션인 이유: 모델 도구 호출과 백스톱 호출이 같은 순간에 서로 다른
// 목적으로 들어오면, 따로 읽고 따로 쓸 경우 둘 다 "직전 문자 없음"으로 판정해 간격(사용자 발화 ≥ 2)을 깬다.
//
// ⛔ 이 파일 밖에서 `inCallSms` 문서를 `create`하지 않는다(소스 스캔 — `deliverInCallSmsGateOrdering.test.ts`).
import { Timestamp } from "firebase-admin/firestore";
import type { InCallSmsItem } from "../scenarios/inCallSms";
import { findInCallSmsItem } from "../scenarios/inCallSms";
import type { FlowVariantSms } from "../scenarios/flowVariants";
import type { InCallSmsDoc, InCallSmsTriggerKind } from "../shared/types";
import { buildInCallSmsDoc } from "./buildDoc";
import type { DeliveredSmsRecord, SmsGateStatus } from "./smsGate";
import { resolveSmsGate } from "./smsGate";

/** 트랜잭션 안에서 할 수 있는 일 2가지(테스트가 메모리 가짜로 대체한다). */
export type SmsStoreTx = {
  listDelivered(): Promise<DeliveredSmsRecord[]>;
  create(smsId: string, doc: InCallSmsDoc): void;
};
export type SmsStore = {
  transact<T>(fn: (tx: SmsStoreTx) => Promise<T>): Promise<T>;
};

export type SmsDeliveryInput = {
  scenarioId: string;
  declared: readonly FlowVariantSms[];
  purpose: unknown;
  userTurns: number;
  /** "도착 시점까지 `messages`에 있는 scammer 문서 수"(`buildDoc.ts` 앵커 함수가 경로별로 계산한 값). */
  anchorScammerTurn: number;
  trigger: InCallSmsTriggerKind;
  /** §81 — 세션 가상 은행명(`resolveFictionalBankName`). 본문 자리표시자 치환 · `bankName`/`accountNumber` 필드의 원천. */
  fictionalBankName?: string;
  /** 테스트 주입용(기본 `Timestamp.now()`). */
  now?: () => FirebaseFirestore.Timestamp;
};

export type SmsDeliveryResult =
  | { status: "delivered"; item: InCallSmsItem; declared: FlowVariantSms }
  | { status: Exclude<SmsGateStatus, "allowed">; declared?: FlowVariantSms };

/**
 * 판정 → (허용이면) 문서 생성. 문서에는 카탈로그 본문(`buildInCallSmsDoc`) 위에 기록 필드 3개
 * (`purpose`·`trigger`·`userTurnsAtArrival` — AC-099 (h))를 얹는다. 거부는 문서 0(호출부가 로그 1줄).
 */
export async function deliverSmsThroughGate(
  store: SmsStore,
  input: SmsDeliveryInput,
): Promise<SmsDeliveryResult> {
  return store.transact(async (tx) => {
    const delivered = await tx.listDelivered();
    const gate = resolveSmsGate({
      purpose: input.purpose,
      declared: input.declared,
      delivered,
      userTurns: input.userTurns,
    });
    if (gate.status !== "allowed") {
      return { status: gate.status, ...(gate.item ? { declared: gate.item } : {}) };
    }
    const item = findInCallSmsItem(input.scenarioId, gate.item.smsId);
    // 선언이 카탈로그에 없으면 `resolveDeclaredSms`가 이미 걸렀다 — 방어적으로 거부(문서 0).
    if (!item) return { status: "not_allowed" };
    const arrivedAt = (input.now ?? Timestamp.now)();
    tx.create(item.smsId, {
      ...buildInCallSmsDoc(item, arrivedAt, input.anchorScammerTurn, input.scenarioId, input.fictionalBankName),
      purpose: gate.item.purpose,
      trigger: input.trigger,
      userTurnsAtArrival: input.userTurns,
    });
    return { status: "delivered", item, declared: gate.item };
  });
}

/** Firestore 어댑터 — `sessions/{sid}/inCallSms` 전체(세션당 ≤3건)를 트랜잭션으로 읽는다(조회 1회 · 인덱스 0). */
export function firestoreSmsStore(
  db: FirebaseFirestore.Firestore,
  sessionRef: FirebaseFirestore.DocumentReference,
): SmsStore {
  const collection = sessionRef.collection("inCallSms");
  return {
    transact: (fn) =>
      db.runTransaction(async (transaction) =>
        fn({
          listDelivered: async () => {
            const snap = await transaction.get(collection);
            return snap.docs.map(toDeliveredRecord);
          },
          create: (smsId, doc) => {
            transaction.create(collection.doc(smsId), doc);
          },
        }),
      ),
  };
}

/** 트랜잭션 밖 단순 조회(백스톱 계획 · 폴백 제시 목록용). 판정 자체는 `deliverSmsThroughGate`가 다시 한다. */
export async function readDeliveredSms(
  sessionRef: FirebaseFirestore.DocumentReference,
): Promise<DeliveredSmsRecord[]> {
  const snap = await sessionRef.collection("inCallSms").get();
  return snap.docs.map(toDeliveredRecord);
}

function toDeliveredRecord(doc: FirebaseFirestore.QueryDocumentSnapshot): DeliveredSmsRecord {
  const at = doc.get("userTurnsAtArrival");
  return { smsId: doc.id, ...(typeof at === "number" ? { userTurnsAtArrival: at } : {}) };
}
