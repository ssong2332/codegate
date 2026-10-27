// §117(DECISIONS #232 · UX D-153) — 같은 모델 턴 안 도구 호출 앞뒤 두 발화의 전사 문단 경계(판정표 = `toolTurnTranscript.ts`) + 배선(소스 스캔).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appendScammerChunk, shouldMarkToolBoundary } from "./toolTurnTranscript.ts";

/** 한 턴의 이벤트를 차례로 넣어 flush 직전 버퍼를 얻는다(호출부 `GeminiVoiceSession`과 같은 순서). */
function runTurn(events: Array<{ chunk: string } | { tool: true }>): string {
  let buffer = "";
  let pending = false;
  for (const e of events) {
    if ("tool" in e) {
      if (shouldMarkToolBoundary(buffer)) pending = true;
      continue;
    }
    ({ buffer, boundaryPending: pending } = appendScammerChunk(buffer, e.chunk, pending));
  }
  return buffer.trim();
}

test("[§117 판정표] 운영 세션 f7047187 재현 — 도구 앞 · 뒤 두 발화가 같은 턴 안의 두 문단으로 남는다(둘 다 남김)", () => {
  const text = runTurn([
    { chunk: "네, 알겠습니다. 본인 확인 마지막 절차로, " },
    { chunk: "문자 메시지로 발송해 드린 인증번호 여섯 자리를 불러 주시기 바랍니다." },
    { tool: true },
    { chunk: " 네, 문자로 발송해 드린 " },
    { chunk: "인증번호 여섯 자리를 불러주십시오." },
  ]);
  assert.equal(
    text,
    "네, 알겠습니다. 본인 확인 마지막 절차로, 문자 메시지로 발송해 드린 인증번호 여섯 자리를 불러 주시기 바랍니다.\n네, 문자로 발송해 드린 인증번호 여섯 자리를 불러주십시오.",
  );
});

test("[§117 판정표] 1행 — 도구 앞에 말이 없으면 표시 없음(종전과 바이트 동일)", () => {
  assert.equal(runTurn([{ tool: true }, { chunk: "문자 보내 드렸습니다." }, { chunk: " 확인해 주십시오." }]), "문자 보내 드렸습니다. 확인해 주십시오.");
  assert.equal(shouldMarkToolBoundary("   "), false, "공백뿐인 전사는 말이 아니다");
});

test("[§117 판정표] 3행 — 공백 조각은 표시를 소비하지 않는다 · 4행 — 도구 뒤 말이 없으면 꼬리 줄바꿈 0", () => {
  assert.equal(runTurn([{ chunk: "잠시만요." }, { tool: true }, { chunk: " " }, { chunk: "보냈습니다." }]), "잠시만요.\n보냈습니다.");
  assert.equal(runTurn([{ chunk: "잠시만요." }, { tool: true }]), "잠시만요.");
  const step = appendScammerChunk("가", " ", true);
  assert.deepEqual(step, { buffer: "가 ", boundaryPending: true });
});

test("[§117 판정표] 도구가 두 번이면 경계도 두 번 · 표시가 없을 때는 종전의 단순 이어 붙이기", () => {
  assert.equal(runTurn([{ chunk: "하나." }, { tool: true }, { chunk: "둘." }, { tool: true }, { chunk: "셋." }]), "하나.\n둘.\n셋.");
  assert.deepEqual(appendScammerChunk("가", "나", false), { buffer: "가나", boundaryPending: false });
});

test("[§117 배선] GeminiVoiceSession — 도구 호출에서 표시 · 출력 전사는 판정 함수로 적립 · flush 두 곳에서 초기화", () => {
  const src = readFileSync("src/lib/realtime/GeminiVoiceSession.tsx", "utf8").replace(/\r\n/g, "\n");
  assert.ok(src.includes("if (shouldMarkToolBoundary(scammerBuffer)) scammerToolBoundary = true;"), "toolCall 분기");
  assert.ok(
    src.includes(
      "({ buffer: scammerBuffer, boundaryPending: scammerToolBoundary } = appendScammerChunk(\n            scammerBuffer,\n            sc.outputTranscription.text,\n            scammerToolBoundary,\n          ));",
    ),
    "출력 전사 적립",
  );
  assert.equal(src.split("scammerBuffer += ").length - 1, 0, "판정 함수를 거치지 않는 직접 적립 0");
  assert.equal((src.match(/^\s+scammerToolBoundary = false;$/gm) ?? []).length, 2, "flushTranscript · flushScammerTurn 두 곳에서 초기화(선언 제외)");
  // 문단이 화면에서 보이도록 — 되짚어보기 · 그 순간 다시 해보기 사기범 말풍선
  const replay = readFileSync("src/app/report/replay/page.tsx", "utf8");
  assert.ok(replay.includes('<p className="whitespace-pre-line text-[17px] leading-[1.55] text-ink">{item.textMasked}</p>'));
  const rewind = readFileSync("src/app/report/rewind/page.tsx", "utf8");
  assert.ok(rewind.includes("className={`whitespace-pre-line rounded-[8px] px-4 py-3 text-[17px] leading-[1.55] ${"));
});
