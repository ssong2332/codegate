// 실시간 통화 사기범 전사의 영어 사고 문장 제거(2026-10-23, Architecture.md §116 · DECISIONS #231).
//
// 실 키 프로브(PR #386 확인 ②, gemini-3.8-live · fv-c5fj) 사기범 3턴 전사가 영어 사고 문단 + 한국어 대사로 왔다.
// 이 파일은 판정표 행 1~4 · 정상 대사 바이트 동일 · 저장(submitTranscript) · 리포트 · 되감기 배선을 고정한다.
// ⛔ 라이브 호출 0건.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { THOUGHT_SPAN_MIN_WORDS, hasThoughtMarker, stripLeakedThought } from "../thoughtLeak";
import { pickScammerLineForMoment } from "../../rewind/scammerLine";

/** 프로브 원본 전사(확인 ② 사기범 3턴) 그대로. */
const LIVE_LEAK =
  "thought\nThe user asked, \"Oh, is that so? What should I do?\" which means they are accepting the premise and asking for the next steps. \n" +
  "According to the call flow, I need to assure them, state that the Financial Supervisory Service will help protect their assets, and then ask about their current transaction bank and asset size (step 2 & 3). \n" +
  "My persona is a male investigator from the OO District Prosecutor's Office.\nI must sound authoritative, calm, yet urgent.\n" +
  "I will tell them to cooperate for a quick resolution and mention the Financial Supervisory Service is assisting. Then I'll ask about their main bank and approximate asset size." +
  "협조해 주시면 약식으로 조용히 끝날 수 있는 사안입니다. 금융감독원 보안팀에서 자산 보호를 도와드릴 테니, 우선 성함과 생년월일을 말씀해 주시겠습니까?";
const LIVE_KOREAN =
  "협조해 주시면 약식으로 조용히 끝날 수 있는 사안입니다. 금융감독원 보안팀에서 자산 보호를 도와드릴 테니, 우선 성함과 생년월일을 말씀해 주시겠습니까?";

const src = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8").replace(/\r\n/g, "\n");

test("[§116 행 1] 실측 전사 — thought 표지 ~ 영어 문단을 지우고 한국어 대사만 남긴다", () => {
  assert.equal(hasThoughtMarker(LIVE_LEAK), true);
  assert.equal(stripLeakedThought(LIVE_LEAK), LIVE_KOREAN);
});

test("[§116 행 1] 표지 변형(대문자 · 콜론 · 별표 · 앞 공백)도 같은 규칙", () => {
  for (const head of ["Thought: ", "  thought\n", "**thought**\n", "THOUGHT "]) {
    assert.equal(stripLeakedThought(`${head}Need to ask the bank.네, 거래 은행이 어디세요?`), "네, 거래 은행이 어디세요?", head);
  }
  // 한국어가 없으면 남는 것이 없다(행 4).
  assert.equal(stripLeakedThought("thought\nOK."), "");
  assert.equal(stripLeakedThought("thought"), "");
  // "thoughtful" 같은 낱말은 표지가 아니다.
  assert.equal(hasThoughtMarker("thoughtful 고객님"), false);
});

test("[§116 행 2] 표지 없는 영어 문단(라틴 단어 8개 이상)은 지우고 앞 문장부호는 남긴다", () => {
  const mid = "확인 감사합니다. The user is hesitating so I should reassure them now please. 걱정하지 마세요.";
  assert.equal(stripLeakedThought(mid), "확인 감사합니다. 걱정하지 마세요.");
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${"abcdefghij"[i]}`).join(" ");
  assert.equal(THOUGHT_SPAN_MIN_WORDS, 8);
  const below = `잠시만요 ${words(THOUGHT_SPAN_MIN_WORDS - 1)} 기다리세요`;
  assert.equal(stripLeakedThought(below), below, "7단어는 원문 그대로");
  assert.equal(stripLeakedThought(`잠시만요 ${words(THOUGHT_SPAN_MIN_WORDS)} 기다리세요`), "잠시만요 기다리세요");
});

test("[§116 행 3] 정상 대사 — 영문 약어 · 숫자 · 공백이 있어도 바이트 동일", () => {
  const lines = [
    "고객님, 방금 SMS로 보내드린 OTP 번호 여섯 자리 불러 주시겠어요?",
    "ATM 앞에 도착하시면 바로 전화 주세요.",
    "보담은행 210-3391-5540-08, 예금주 국민안전지원센터입니다.",
    "  앞뒤 공백도  그대로 둡니다  ",
    "아, 그러니까 KB 말고 NH 계좌요.",
    "",
  ];
  for (const line of lines) assert.equal(stripLeakedThought(line), line);
});

test("[§116 행 1 한계] 사고 문단 안의 한글 인용은 남고, 그 뒤 영어 문단은 행 2가 지운다", () => {
  const quoted = 'thought\nThe user said "네" which means they agree with me and want to hear the next step.자, 그럼 다음 단계 안내드릴게요.';
  assert.equal(stripLeakedThought(quoted), "네 자, 그럼 다음 단계 안내드릴게요.");
});

test("[§116 배선] 저장 — submitTranscript는 사기범 줄만 마스킹 전에 거른다", () => {
  // SEC-07(외부 보안 점검 2차) — 저장 전 정규화를 판독 모듈(`transcriptRequest.ts` `prepareTranscriptTurns`)로 옮겼다(규칙 그대로).
  const s = src("realtime/transcriptRequest.ts");
  assert.match(s, /import \{ stripLeakedThought \} from "\.\/thoughtLeak";/);
  assert.match(s, /const raw = turn\.role === "scammer" \? stripLeakedThought\(submitted\) : submitted;/);
  assert.ok(s.indexOf("stripLeakedThought(submitted)") < s.indexOf("maskPII(raw)"), "마스킹 전에 거른다");
  assert.match(src("realtime/submitTranscript.ts"), /const prepared = prepareTranscriptTurns\(turns\);/);
});

test("[§116 배선] 이미 저장된 전사 — 리포트 판정 입력은 사기범 줄을 거른다", () => {
  const s = src("report/generateReportCore.ts");
  assert.match(s, /textMasked: data\.role === "scammer" \? stripLeakedThought\(data\.textMasked\) : data\.textMasked,/);
});

test("[§116 배선] 이미 저장된 전사 — 되감기 '그 순간 사기범이 한 말'은 사고 문장 없이 나온다", () => {
  const line = pickScammerLineForMoment(
    [
      { role: "scammer", textMasked: LIVE_LEAK, turnIndex: 3 },
      { role: "user", textMasked: "61년 3월 2일이요.", turnIndex: 4 },
    ],
    4,
  );
  assert.equal(line, LIVE_KOREAN);
});
