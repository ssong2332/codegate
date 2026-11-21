// 2026-11-22 자녀 납치 고급 실측(fv-k268 · 7세션 중 고급 2세션) — 사기범이 "링크 화면에서 이체 완료하세요"를 말만 바꿔 6~8턴 되풀이했고
// 참가자가 "그 다음엔 어떻게 해요?"라고 물어도 같은 재촉으로 답했다. 반복 차단 3행(2-gram 유사도)은 한 번도 걸리지 않았다 ⇒ 판정표 2-c행(`transfer`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideRepeatBreak, isTransferDemand, repeatBreakInstruction, REPEAT_BREAK_TRANSFER_INSTRUCTION } from "../repeatBreak";

/** 실측 대본(verbalTransfer · 사기범 대사만 · 원문). */
const KIDNAP_ADVANCED_VERBAL = [
  "당신 아이 지금 저희 쪽에 있어요. 옆에서 아이가 울고 있는데, 시키는 대로 하세요.",
  "누구인지는 중요하지 않고, 아이가 울고 있으니 시키는 대로만 해요. 쓸데없는 소리 말고 들어요.",
  "문자로 계좌 보냈으니, 지금 바로 링크 눌러서 이체하세요. 시간 없어요, 빨리 하세요.",
  "아직 입금 확인 안 됐어요. 링크 화면에서 직접 이체 완료하세요. 어서 빨리 진행해요.",
  "아직 이체 기록이 안 떴습니다. 지금 화면에서 이체를 끝내지 않으면 아이는 위험할 수 있어요. 빨리 처리하세요.",
  "이미 보낸 계좌로 빨리 이체 완료해요. 다른 생각 말고 시키는 대로만 하란 말이에요.",
  "지금 당장 이체 안 끝내면 나중에 후회할 수도 있어요. 빨리 송금해요.",
  "문자로 보낸 링크 열어서 금액 넣고 바로 전송하세요. 시간 지체되면 상황은 더 악화됩니다.",
];

function marks(script: readonly string[]): (string | null)[] {
  return script.map((_, i) => decideRepeatBreak(script.slice(0, i + 1)));
}

test("[2-c 재현] 수정 전 판정표(3행 유사도만)로는 실측 대본에서 반복 차단이 0회였다", () => {
  for (let i = 1; i < KIDNAP_ADVANCED_VERBAL.length; i += 1) {
    const kind = decideRepeatBreak(KIDNAP_ADVANCED_VERBAL.slice(0, i + 1));
    assert.notEqual(kind, "similar", `턴 ${i + 1}`);
    assert.notEqual(kind, "identity", `턴 ${i + 1}`);
  }
});

test("[2-c] 송금 재촉이 두 대답 이어지면 transfer — 첫 경계는 재촉 둘째 대답 직후", () => {
  const m = marks(KIDNAP_ADVANCED_VERBAL);
  assert.deepEqual(m, [null, null, null, "transfer", null, null, "transfer", "transfer"]);
  assert.equal(repeatBreakInstruction("transfer"), REPEAT_BREAK_TRANSFER_INSTRUCTION);
  assert.ok(REPEAT_BREAK_TRANSFER_INSTRUCTION.includes("상대의 마지막 말에 맞게 답하라"));
});

test("[2-c 판정표] 진술 · 확인 · 한 번의 요구는 송금 재촉이 아니다", () => {
  assert.equal(isTransferDemand("문자로 계좌 보냈으니까 확인해 보세요."), false, "보냈으니까 = 진술");
  assert.equal(isTransferDemand("돈 들어왔네요. 누구한테도 알리지 마세요."), false);
  assert.equal(isTransferDemand("지금 바로 100만 원 보내요. 한결은행 948-2716-5093-27."), true);
  assert.equal(isTransferDemand("지금 바로 백만 원 준비해서 불러주는 계좌로 바로 넣어요."), true);
  // 실측 초급 거절형 — 재촉 뒤 다른 카드로 넘어간 흐름은 그대로(주입 0).
  assert.equal(
    decideRepeatBreak(["그런 거 물어볼 시간 없어요. 지금 바로 백만 원 준비해서 불러주는 계좌로 바로 넣어요.", "네, 그럼 직접 확인해 보세요."]),
    null,
  );
});

test("[2-c 순서] 인적사항 반복(2행) · 자금 소진(1-b행)이 먼저 이긴다", () => {
  const pay = "링크 눌러서 이체하세요. 성함 불러주세요.";
  assert.equal(decideRepeatBreak([pay, pay]), "identity");
  assert.equal(decideRepeatBreak([pay, pay], "돈 없어요"), "exhausted");
});
