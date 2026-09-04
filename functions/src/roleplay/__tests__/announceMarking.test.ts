// D2/F2(docs/Architecture.md §54.2 (3) · §54.9 (4) 4·5·6 · **G343**, 프로브 P-1) —
// **Mock 강등 턴에서 "예고 완료"를 기록하지 않는다.**
//
// 이 파일이 증명하는 것은 세 겹이다:
//   ① P-1 — `MockLlmClient`가 `systemPrompt`를 **정말로 읽지 않는다**(주석이 아니라 실행으로).
//   ② 차단 — 판정자가 `isMock:true`에서 false, `isMock:false`에서 true다(회귀 0 대조 포함).
//   ③ 배선 — `roleplay/index.ts`가 마킹을 **LLM 호출 뒤**에서 그 판정자로 감싸 부른다. 이 저장소에는
//      Firestore 콜러블을 통째로 도는 러너가 없어 배선은 소스 수준으로 고정한다(같은 관례:
//      `src/lib/verifyintercept/verifyCallContinuity.test.ts` 헤더 주석).
//   ⭐ ③에는 **역검증**을 붙인다 — 조건을 되돌린(마킹을 호출 앞으로 옮긴) 오염본을 같은 검사식이
//      실제로 빨간불로 잡는지 이 파일 안에서 보인다(소스는 무편집).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MockLlmClient } from "../../llm/mockClient";
import { wasTurnInstructionSpoken } from "../announceMarking";

// --- ① P-1: Mock은 systemPrompt를 반영하지 않는다(§54.2 (3) ②) ---

test("[P-1] MockLlmClient는 systemPrompt를 읽지 않는다 — 턴 지시가 대사에 0효과다", async () => {
  const instruction = "(지시) 지금 고객확인 데스크로 연결해 드리겠다고 반드시 말하라";
  const result = await new MockLlmClient().complete({
    systemPrompt: `기본 프롬프트\n${instruction}`,
    messages: [{ role: "user", content: "네 알겠습니다" }],
    mockTacticHints: ["안심 유도 — \"저희가 보호해 드립니다\""],
  });

  assert.equal(result.isMock, true);
  assert.ok(
    !result.text.includes(instruction) && !result.text.includes("고객확인 데스크"),
    `Mock 대사에 지시가 반영되면 안 된다(반영됐다면 G343의 전제가 바뀐 것이다): ${result.text}`,
  );
});

test("[P-1 대조] systemPrompt를 통째로 바꿔도 Mock 대사는 동일하다(= 입력으로 쓰이지 않는다)", async () => {
  const client = new MockLlmClient();
  const messages = [{ role: "user" as const, content: "무슨 일이시죠" }];
  const hints = ["긴급성 — \"지금 처리하지 않으면\""];

  const a = await client.complete({ systemPrompt: "A", messages, mockTacticHints: hints });
  const b = await client.complete({ systemPrompt: "B(전혀 다른 지시)", messages, mockTacticHints: hints });

  assert.equal(a.text, b.text);
});

// --- ② 차단 + 회귀 0 대조(§54.9 (4) 5·6) ---

test("[G343] Mock 강등 응답(isMock:true)은 '발화됨'이 아니다 — 마킹이 일어나면 안 된다", () => {
  assert.equal(wasTurnInstructionSpoken({ isMock: true }), false);
});

test("[G343 역방향] 실 LLM 응답(isMock:false)은 종전대로 '발화됨'이다 — 회귀 0", () => {
  assert.equal(wasTurnInstructionSpoken({ isMock: false }), true);
});

// --- ③ 배선: 마킹은 LLM 호출 **뒤**에, 판정자 안에서만 일어난다 ---

const roleplay = readFileSync("src/roleplay/index.ts", "utf8");

/** 주석을 걷어낸 실행 코드만 남긴다(이 파일들의 주석에는 근거 서술로 같은 토큰이 등장한다). */
function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

/** 마킹 write 2종이 전부 `completeWithFallback` 호출 **뒤**이고 판정자 블록 **안**인가. */
function markingIsGuarded(source: string): boolean {
  const code = codeOnly(source);
  const llmCall = code.indexOf("await completeWithFallback(");
  const guard = code.indexOf("if (wasTurnInstructionSpoken(completion))");
  if (llmCall < 0 || guard < 0 || guard < llmCall) return false;
  const marks = ["announcedAt: Timestamp.now()", "consentAnnouncedAt: Timestamp.now()"];
  return marks.every((mark) => {
    const at = code.indexOf(mark);
    return at > guard;
  });
}

test("[G343 배선] announcedAt·consentAnnouncedAt 마킹이 LLM 호출 뒤 판정자 블록 안에 있다", () => {
  const code = codeOnly(roleplay);
  assert.ok(
    code.includes("wasTurnInstructionSpoken(completion)"),
    "마킹이 completion.isMock에 종속돼야 한다(G343)",
  );
  assert.ok(
    code.includes("announcedAt: Timestamp.now()") && code.includes("consentAnnouncedAt: Timestamp.now()"),
    "마킹 write 2종이 실재해야 대조가 성립한다",
  );
  assert.equal(markingIsGuarded(roleplay), true);
});

test("[G343 배선 역검증] 마킹을 LLM 호출 앞으로 되돌린 오염본은 같은 검사식이 잡아낸다", () => {
  // 오염: 판정자 블록 전체를 지우고 마킹만 호출 앞에 남긴 형태(= 이 커밋 이전의 구조).
  const poisoned = [
    "const turnChoice = pick();",
    "if (turnChoice === \"verify_announce\") {",
    "  await verifyOfferRef.update({ announcedAt: Timestamp.now() });",
    "  await mockConsentRef.update({ consentAnnouncedAt: Timestamp.now() });",
    "}",
    "const completion = await completeWithFallback(client, input);",
  ].join("\n");

  assert.equal(markingIsGuarded(poisoned), false, "오염본을 통과시키면 이 게이트는 공회전이다");
  assert.equal(markingIsGuarded(roleplay), true, "정본은 같은 검사식을 통과한다");
});
