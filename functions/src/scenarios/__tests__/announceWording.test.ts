// T191 S3 · G541 — 문자 도착 안내 · 확인 권유 안내의 문면 규칙(docs/Architecture.md §82.4.3 · AC-099 (g) · AC-098).
//
// 왜: 실시간 경로는 이 문자열을 이제 **맥락 주입**(`turnComplete:false`)으로 넣는다(§82.4.1 A안 — 클라
// `src/lib/realtime/contextInjection.ts`). 문면이 "지금 캐릭터로서 … 알려라"면 주입의 의미(응답을 유발하지 않는다)와
// 정면으로 충돌한다. 또 인용 예시 대사는 모델이 거의 그대로 낭독했다(S1 §3.4 — 5/13) ⇒ 예시 0건.
//
// ⚠️ 같은 문자열이 텍스트 폴백에서는 **이번 사용자 메시지에 대한 응답의 턴 지시**로 실린다(`roleplay/index.ts`
// `turnInstruction`, §82.5 "같은 응답"). 그래서 어미를 "상대가 다음에 말하면"이 아니라 두 경로 모두에서 참인
// **"상대의 말에 대답할 때 그 대답 안에서"** 로 고정한다 — 실시간: 참가자가 말한 뒤의 응답, 폴백: 지금 만드는 응답.
// 판정은 표기 검사다(의미가 아니다) — 효과는 AC-098 (d) 라이브 before/after로만 판정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { IN_CALL_SMS } from "../inCallSms";
import { VERIFY_INTERCEPT } from "../verifyIntercept";

const OPEN = "상대의 말에 대답할 때 그 대답 안에서";
const HOLD = "이것만 말하려고 지금 따로 말을 꺼내지는 마라.";

/** G541 위반 목록(빈 배열 = 통과). 실제 카탈로그와 테스트 안에서만 오염시킨 샘플에 같은 함수를 돌린다. */
function g490Violations(where: string, text: string): string[] {
  const out: string[] = [];
  if (/재촉|다급/.test(text)) out.push(`${where}: 재촉·다급`);
  if (/예:\s*\\?["“]/.test(text)) out.push(`${where}: 인용 예시`);
  if (text.includes("지금 캐릭터로서")) out.push(`${where}: 즉시 발화 어미("지금 캐릭터로서")`);
  if (!text.includes(OPEN)) out.push(`${where}: 대답 안에서 말하기 어미 없음`);
  if (!text.includes(HOLD)) out.push(`${where}: 따로 말 꺼내기 금지 없음`);
  return out;
}

function catalogTexts(): [string, string][] {
  const texts: [string, string][] = [];
  for (const [scenarioId, items] of Object.entries(IN_CALL_SMS)) {
    for (const item of items) texts.push([`sms ${scenarioId}/${item.smsId}`, item.announceInstruction]);
  }
  for (const [scenarioId, item] of Object.entries(VERIFY_INTERCEPT)) {
    texts.push([`verify ${scenarioId}/${item.offerId}`, item.announceInstruction]);
  }
  return texts;
}

// T191 S5 — 확인 권유는 card-delivery-call(고급 전용 ①, AC-071 메커닉 재사용) 1건이 늘어 7건이다.
// T194-c-1(§84.5.2) — Q2 설치 안내 문자 3건(card-delivery · card-company · loan)이 늘어 문자 안내가 14건, §92.3 고급 전용 2종으로 16건이다(같은 규칙을 받는다).
test("[T191/S3 · G541] 문자 안내 25건 + 확인 권유 7건 — 재촉·다급 0 · 인용 예시 0 · 대답 안에서 말하기 · 따로 말 꺼내기 금지", () => {
  const texts = catalogTexts();
  assert.equal(texts.filter(([w]) => w.startsWith("sms ")).length, 25, "문자 안내 건수(§142 — 카드사 고급 재구성 발급 · 번호 · 원격 지원 · 안전계좌 +4 · P2-d — 환급 수수료 +1 · §92.3 — 고급 전용 2종 +2 · §98 — 검찰 보관 지갑 +1 · §101 — 검찰 자산 검수 사이트 +1 · §124 — 택배 국가 안전계좌 +1 · §125 — 자산 보호 공탁금 +1)(카탈로그가 바뀌면 이 숫자를 확인하고 갱신)");
  assert.equal(texts.filter(([w]) => w.startsWith("verify ")).length, 7, "확인 권유 건수");
  const violations = texts.flatMap(([where, text]) => g490Violations(where, text));
  assert.deepEqual(violations, []);
});

test("[T191/S3 · G541] 인증번호 안내 2건도 같은 어미 — 번호 요구 · 번호 창작 금지는 남는다", () => {
  const otp = Object.values(IN_CALL_SMS)
    .flat()
    .filter((item) => item.kind === "otp");
  assert.equal(otp.length, 2);
  for (const item of otp) {
    assert.ok(item.announceInstruction.includes(OPEN), item.smsId);
    assert.ok(item.announceInstruction.includes("번호를 불러 달라고 요구하라"), item.smsId);
    assert.ok(item.announceInstruction.includes("번호를 네가 지어내서 말하지 마라"), item.smsId);
  }
});

test("[T191/S3 · G541 역방향 ⓓ] 옛 문면(지금 캐릭터로서 · 예시 · 재촉)으로 오염시킨 샘플은 같은 검사에서 실패한다", (t) => {
  const [where, clean] = catalogTexts()[0];
  const contaminated = clean
    .replace(OPEN, "지금 캐릭터로서")
    .replace(HOLD, '— 예: "방금 문자 보내드렸어요, 빨리 확인해 주세요." 확인을 재촉하라.');
  const normal = g490Violations(where, clean);
  const bad = g490Violations(where, contaminated);
  t.diagnostic(`정상 위반 ${normal.length}건 · 오염 위반 ${bad.length}건: ${bad.join(" / ")}`);
  assert.deepEqual(normal, []);
  assert.equal(bad.length, 5, "다섯 규칙 모두 오염 샘플을 잡아야 한다(죽은 규칙 0)");
});
