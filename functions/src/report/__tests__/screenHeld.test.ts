// 사용자 결정 2026-11-07 "잘 대처함 칸 추가 (권장)"(메인 전달) — 거래 화면 확인 질문에 사실대로 답해 보류된 사실 = 리포트 잘 대처함 한 줄.
// `screenHeld.ts` Q1 ~ Q5 고정 + 판정 무변경(G511 · G138) 배선 고정.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveScreenHeld } from "../screenHeld";

const base = 1_000_000;
const src = (rel: string) => readFileSync(path.join(__dirname, "..", "..", "..", "src", rel), "utf8").replace(/\r\n/g, "\n");

test("[Q1 · Q3] 보류 시각만 있는 문자 문서 → 가장 이른 보류 시각(N초 시점)", () => {
  assert.deepEqual(resolveScreenHeld([{ landingHeldAtMs: base + 95_400 }], base), { timeLabel: "95초 시점" });
  assert.deepEqual(
    resolveScreenHeld([{}, { landingHeldAtMs: base + 300_000 }, { landingHeldAtMs: base + 120_000 }], base),
    { timeLabel: "120초 시점" },
    "보류 문서가 여럿이면 가장 이른 시각",
  );
});

test("[Q2] 보류한 뒤 같은 화면에서 다시 결제했으면 그 문서는 세지 않는다(결제가 속은 순간으로 승격된다)", () => {
  assert.equal(resolveScreenHeld([{ landingHeldAtMs: base + 100_000, landingSubmittedAtMs: base + 160_000 }], base), undefined);
  assert.deepEqual(
    resolveScreenHeld([{ landingHeldAtMs: base + 100_000, landingSubmittedAtMs: base + 160_000 }, { landingHeldAtMs: base + 200_000 }], base),
    { timeLabel: "200초 시점" },
  );
});

test("[Q4] 보류 없음 · 결제만 · 문자 0건 → 칸 0", () => {
  assert.equal(resolveScreenHeld([], base), undefined);
  assert.equal(resolveScreenHeld([{}, { landingSubmittedAtMs: base + 50_000 }], base), undefined);
});

test("[Q3] 기준점보다 이른 보류 시각은 0초로(음수 표기 0)", () => {
  assert.deepEqual(resolveScreenHeld([{ landingHeldAtMs: base - 5_000 }], base), { timeLabel: "0초 시점" });
});

test("[G511 · G138 판정 동일] 칸 값은 판정에 들어가지 않고 · 문자 문서 시각 두 개만 읽는다", () => {
  const core = src("report/generateReportCore.ts");
  const useLines = core
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /\bscreenHeld\b/.test(line) && !line.startsWith("//") && !line.startsWith("import "));
  assert.deepEqual(useLines, ["const screenHeld = resolveScreenHeld(", "...(screenHeld ? { screenHeld } : {}),"], "리포트 필드로만 쓴다");
  // 입력 블록이 읽는 문서 필드 = landingHeldAt · landingSubmittedAt 두 개(답 · 목적 · 금액 0).
  const block = core.slice(core.indexOf("const screenHeld = resolveScreenHeld("), core.indexOf("reportTimeBaseMs,\n  );", core.indexOf("const screenHeld = resolveScreenHeld(")));
  const fields = [...new Set([...block.matchAll(/data\.(\w+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(fields, ["landingHeldAt", "landingSubmittedAt"]);
  const analyze = src("report/analyzeConversation.ts");
  assert.equal(/screenHeld|landingHeld/.test(analyze), false, "판정 모듈이 보류를 읽으면 안 된다");
  const timeline = src("report/smsTimeline.ts");
  assert.equal(/landingHeld/.test(timeline), false, "문자 타임라인 · 승격 입력에 보류가 없다(속은 순간 0)");
  const mod = src("report/screenHeld.ts");
  assert.equal(/\bendReason\b|\bscammerHangup\b|resistedMoments\s*[:=]/.test(mod.replace(/^\/\/.*$/gm, "")), false);
});
