// §132.7~§132.9(DECISIONS #248 · 실 키 회귀 프로브 2026-10-24b N3 · N4 · D12) — 화면 쪽: 한국어 외 문자 지우기 · 이체 화면 제출 맥락 주입 배선 ·
// 하한 전 "보냈다" 주장 정정 1회 배선(소스 스캔).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripLeakedThought } from "./thoughtLeak.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("[§132.8 N3] 한국어 대사에 섞인 데바나가리 · 키릴 · 태국 · 아랍 · 가나 글자는 지운다 · 한자 · 짧은 영어 · 숫자는 그대로", () => {
  const devanagari = String.fromCodePoint(0x092e, 0x093e); // 실측 "मा"
  assert.equal(stripLeakedThought(`다른 사람에겐 절대 말하지 ${devanagari}세요.`), "다른 사람에겐 절대 말하지 세요.");
  for (const cp of [0x0434, 0x0e01, 0x0627, 0x3042, 0x30a2]) {
    assert.equal(stripLeakedThought(`확인${String.fromCodePoint(cp)}했습니다.`), "확인했습니다.", cp.toString(16));
  }
  for (const keep of ["OTP 번호 불러 주세요.", "金 시세 확인하세요.", "210-3391-5540-08 계좌입니다."]) {
    assert.equal(stripLeakedThought(keep), keep);
  }
});

test("[§132.7 N4] 이체 화면 제출 — 서버가 돌려준 맥락 1줄을 실시간 통화에서만 주입한다(새 전달 방식 landingSubmitted)", () => {
  const page = read("../../app/session/play/page.tsx");
  assert.match(
    page,
    /if \(callMode === "realtime" && res\.contextInstruction\) pushContextTurn\(res\.contextInstruction, "landingSubmitted"\);/,
  );
  assert.ok(read("./contextInjection.ts").includes('| "landingSubmitted";'));
  assert.ok(read("./GeminiVoiceSession.tsx").includes('"confirmResult" | "verifyReconnectFailed" | "chatDuringCall" | "landingSubmitted"'));
});

test("[§132.9 D12] 하한 전 '보냈다' 주장 — 서버 정정 1줄을 주장 1건당 1회만 넣고, 주장이 내려가면 다시 열린다", () => {
  const page = read("../../app/session/play/page.tsx");
  assert.match(page, /result\.status === "waiting" && result\.claimNotYetInstruction && !smsClaimCorrectedRef\.current/);
  assert.ok(page.includes("if (!smsClaimPendingRef.current) smsClaimCorrectedRef.current = false;"));
});

test("[§132.12] Live 자막 — 동그라미 자리표시('○○ 씨' · '○○경찰서')만 지우고 가린 학원 표기는 그대로", () => {
  assert.equal(
    stripLeakedThought("거기 혹시 ○○ 씨 본인 맞으세요? 저는 시내 ○○경찰서 수사과 소속입니다."),
    "거기 혹시 본인 맞으세요? 저는 시내 경찰서 수사과 소속입니다.",
  );
  assert.equal(stripLeakedThought("○○학원 앞이에요."), "○○학원 앞이에요.");
});
