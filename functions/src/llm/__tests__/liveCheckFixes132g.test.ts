// §132.15(메인 라이브 2026-10-25 main `454a927` · 기관 사칭 고급 · 텍스트 대체) — "김민수고요 …" → 사기범 "김민수고 고객님".
import { test } from "node:test";
import assert from "node:assert/strict";
import { pseudonymizeForGroq } from "../piiPseudonymizer";
import { wrapUserInputAsData } from "../../roleplay/promptAssembly";
import type { LlmMessage } from "../types";

const ask: LlmMessage = { role: "assistant", content: "본인 확인을 위해 성함이랑 생년월일 불러주십시오." };
const user = (text: string): LlmMessage => ({ role: "user", content: wrapUserInputAsData(text) });
const joined = (messages: LlmMessage[]) => messages.map((m) => m.content).join("\n");

test("[§132.15] 라이브 재현 — '김민수고요'의 '고요'는 어미 · 되부른 가명은 '김민수'로 복원 · 연도 복원 그대로", () => {
  const r = pseudonymizeForGroq([ask, user("김민수고요 1970년 3월 5일생이에요")]);
  assert.ok(!joined(r.messages).includes("김민수"), "원래 이름이 전송되지 않는다");
  assert.ok(r.messages[1].content.includes("정하윤고요"), "어미는 그대로 남는다");
  assert.equal(r.nameCount, 1);
  assert.equal(
    r.restore("네, 정하윤 고객님, 1971년 3월 14일생 확인했습니다."),
    "네, 김민수 고객님, 1970년 3월 5일생 확인했습니다.",
  );
});

test("[§132.15] N1 — 같은 계열 어미 전부: 이름만 잡고 어미는 남긴다", () => {
  for (const ending of ["고요", "구요", "이고요", "예요", "이에요", "입니다", "인데요", "라고요", "라구요", "거든요", "요"]) {
    const name = ending.startsWith("이") || ending === "입니다" || ending === "인데요" ? "박지훈" : "김민수";
    const r = pseudonymizeForGroq([ask, user(`${name}${ending}`)]);
    assert.equal(r.nameCount, 1, ending);
    assert.ok(!joined(r.messages).includes(name), `${ending}: 원래 이름 전송 0`);
    assert.equal(r.restore("정하윤 고객님"), `${name} 고객님`, ending);
  }
});

test("[§132.15] N2 — 3글자 → 2글자 → 4글자 순 · 끝이 '요'인 3글자는 버린다 · 흔한 말 + 어미 첫 글자는 이름 아님", () => {
  for (const [said, name] of [
    ["박정구요", "박정구"],
    ["김구요", "김구"],
    ["남궁민수예요", "남궁민수"],
    ["이제훈이에요", "이제훈"],
  ] as const) {
    const r = pseudonymizeForGroq([ask, user(said)]);
    assert.equal(r.restore("정하윤 고객님"), `${name} 고객님`, said);
  }
  for (const said of ["한번이요", "진짜요", "정말요"]) {
    assert.equal(pseudonymizeForGroq([ask, user(said)]).nameCount, 0, said);
  }
});
