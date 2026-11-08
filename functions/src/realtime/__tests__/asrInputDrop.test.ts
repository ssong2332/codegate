// ⭐ 2026-11-08(Edge 재시험 7 ~ 10 — 관찰 e · 사용자 결정 "전부 수정") — Live 입력 음성 인식의 두 결함 재현 · 역검증.
// 원인 · 측정 원문 = `docs/research/asr-digits-drop-2026-11-08.md`. 측정 도구 = `scripts/asr-pause-measure.mjs`(실 키 0).
//
// 판정표 E
// | # | 관찰 | 원인(근거) | 조치 | 이 파일 |
// |---|---|---|---|---|
// | E1 | 두 문장 중 뒷문장 통째 누락 | 문장 사이 쉼(Heami 860~870ms) > 발화 끝 침묵 400ms → 턴 종료 → 응답 오디오가 오면 반이중 게이트가 뒷문장을 버림 | `silenceDurationMs` 1000(실 키: 버림 2/2 → 0/2) | [E1] |
// | E2 | 띄어 읽은 숫자 → "6요" | 시작 문턱 추정(음절 200~330ms < 300ms)은 실 키 실측에서 기각 — 400/300에서도 6자리 전부 전사. Edge 원인 미확정 | 조치 없음 · `prefixPaddingMs` 300 유지 | [E2] |
// | E3 | "칠팔오일삼육이요" → 전사 "7851362" · "번호가 일치하지 않습니다" | 말끝 "이요"의 "이"를 숫자 2로 받아씀(어미 "요"도 사라짐) | 대조 후보 C2(끝 2 뺀 L자리) · Live 대조 1줄 문장 | [E3-*] |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { otpCandidatesForLength, extractSpokenCodes } from "../../shared/spokenDigits";
import { evaluateOtpCheck } from "../../roleplay/otpCheck";
import { analyzeConversation, type AnalysisMessage } from "../../report/analyzeConversation";
import { buildOtpLiveCompareLine, findInCallSmsItem } from "../../scenarios/inCallSms";

/**
 * Heami(Windows 한국어 TTS · Edge 재시험의 가짜 마이크와 같은 음성) 16kHz 클립의 말소리 구간 · 쉼(ms) — 2026-11-08 측정값.
 * 재측정: 문서의 PowerShell 생성 명령 → `node scripts/asr-pause-measure.mjs <클립 폴더>`(10ms 프레임 RMS · 클립 최대의 -35dB · 60ms 미만 틈 병합).
 */
const HEAMI = {
  twoSentencesName: { text: "제 이름은 김영희고요. 생년월일은 1968년 3월 2일이에요.", speechMs: [1390, 1750, 1530], pausesMs: [870, 90] },
  twoSentencesBank: { text: "거래 은행은 국민은행이고요. 1,200만 원쯤 있어요.", speechMs: [1790, 1700], pausesMs: [860] },
  spacedDigits: { text: "칠, 팔, 오, 일, 삼, 육이요", speechMs: [280, 270, 200, 240, 330, 440], pausesMs: [580, 520, 500, 540, 520] },
  joinedDigits: { text: "칠팔오일삼육이요", speechMs: [1270], pausesMs: [] as number[] },
} as const;

function vadOf(src: string): { silenceDurationMs: number; prefixPaddingMs: number } {
  const block = src.match(/automaticActivityDetection:\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const num = (key: string) => Number(block.match(new RegExp(`${key}:\\s*(\\d+)`))?.[1]);
  return { silenceDurationMs: num("silenceDurationMs"), prefixPaddingMs: num("prefixPaddingMs") };
}
const PROVIDER_SRC = readFileSync(path.resolve(__dirname, "../../../src/realtime/geminiProvider.ts"), "utf8");
const NOW = vadOf(PROVIDER_SRC);
const BEFORE = { silenceDurationMs: 400, prefixPaddingMs: 300 } as const; // main 5eeb0e79

/** E1 — 한 발화 안의 쉼이 하나라도 발화 끝 침묵 이상이면 그 자리에서 턴이 끝난다(뒤는 반이중 게이트가 버릴 수 있다). */
const splitsTurn = (pausesMs: readonly number[], silenceMs: number) => pausesMs.some((p) => p >= silenceMs);
/** E2 — 발화 시작 문턱보다 짧은 음절(앞에 쉼이 있는 낱 음절)은 시작으로 확정되지 않는다(추정 규칙). */
const shortSyllables = (speechMs: readonly number[], prefixMs: number) => speechMs.filter((s) => s < prefixMs).length;

test("[E1] 문장 사이 쉼 — 운영값 400ms는 두 문장을 가르고(재현) · 1000ms는 가르지 않는다", () => {
  assert.equal(NOW.silenceDurationMs, 1000, "토큰 값(소스) — geminiProvider.test.ts가 실제 발급 요청으로도 고정");
  for (const clip of [HEAMI.twoSentencesName, HEAMI.twoSentencesBank]) {
    assert.equal(splitsTurn(clip.pausesMs, BEFORE.silenceDurationMs), true, `재현(수정 전): ${clip.text}`);
    assert.equal(splitsTurn(clip.pausesMs, NOW.silenceDurationMs), false, `수정 뒤: ${clip.text}`);
  }
  // 역검증 — 2026-11-02에 검토한 800ms로는 이번 Heami 문장 쉼(860 · 870ms)을 못 막는다(그래서 1000).
  assert.equal(splitsTurn(HEAMI.twoSentencesName.pausesMs, 800), true);
  // 여유 — 측정 최대 쉼보다 100ms 이상 길다(측정 임계 · 서버 판정 차이 몫).
  assert.ok(NOW.silenceDurationMs - Math.max(...HEAMI.twoSentencesName.pausesMs, ...HEAMI.twoSentencesBank.pausesMs) >= 100);
});

// 2026-11-08 실 키 실측(`live-mic-probe` 3세션 · 같은 Heami 클립) — 띄어 읽은 숫자 전사: 400/300 "7 8 5 1 3 6" · 1000/300 "7 8 5 1 3 6" · 1000/150 "785136".
// ⇒ 300ms 미만 음절 4개가 있어도 시작 문턱은 인식을 막지 않았다(추정 기각) — 문턱은 바꾸지 않는다.
test("[E2] 띄어 읽은 숫자 — 시작 문턱 추정은 실측에서 기각 · 300 유지 · 1000ms 침묵은 음절 사이 쉼을 한 턴으로 묶는다", () => {
  const clip = HEAMI.spacedDigits;
  assert.equal(NOW.prefixPaddingMs, BEFORE.prefixPaddingMs, "근거 없는 변경 0 — 300 유지");
  assert.equal(shortSyllables(clip.speechMs, BEFORE.prefixPaddingMs), 4, "300ms 미만 음절 4개(그래도 실측 전사 6자리 — 추정 기각의 근거)");
  assert.equal(splitsTurn(clip.pausesMs, BEFORE.silenceDurationMs), true, "수정 전 — 쉼 500~580ms ≥ 400ms");
  assert.equal(splitsTurn(clip.pausesMs, NOW.silenceDurationMs), false, "수정 뒤 — 쉼 580ms < 1000ms");
  // 붙여 읽기는 쉼이 없어 E1 · E2와 무관하다(그 결함은 E3).
  assert.deepEqual(HEAMI.joinedDigits.pausesMs, []);
});

test("[E3-a] 대조 후보 판정표 C1 ~ C3", () => {
  assert.deepEqual(otpCandidatesForLength(["785136"], 6), ["785136"], "C1");
  assert.deepEqual(otpCandidatesForLength(["7851362"], 6), ["785136"], "C2 — 말끝 '이'가 2로 붙음");
  assert.deepEqual(otpCandidatesForLength(["7851363"], 6), [], "C3 — 끝이 2가 아니면 후보 아님");
  assert.deepEqual(otpCandidatesForLength(["78513622"], 6), [], "C3 — 두 자리 더 길면 후보 아님");
  assert.deepEqual(otpCandidatesForLength(["78513"], 6), [], "C3 — 짧으면 후보 아님");
  assert.deepEqual(otpCandidatesForLength(["0482312", "048231"], 6), ["048231"], "한글 숫자 추출의 두 후보가 같은 값으로 모인다(중복 0)");
  // 재시험 원문 전사가 아라비아 숫자로 와서 "이"+"요" 처리(`extractSpokenCodes`)가 닿지 않는 것 = 이 규칙이 필요한 이유.
  assert.deepEqual(extractSpokenCodes("7851362"), ["7851362"]);
});

const OTP_ITEM = findInCallSmsItem("institutional-impersonation", "institution-otp")!;
const ASK = "방금 문자로 인증번호 갔죠? 화면에 뜬 여섯 자리 그대로 불러 주세요.";
const evaluate = (userText: string) =>
  evaluateOtpCheck({
    scenarioId: "institutional-impersonation",
    userText,
    lastScammerText: ASK,
    scammerTurnNumber: OTP_ITEM.afterScammerTurns + 1,
    isDelivered: async (smsId) => smsId === OTP_ITEM.smsId,
  });

test("[E3-b] 서버 대조(텍스트 폴백) — 정답 + 말끝 '이'(전사 끝 2)는 일치 · 오답 + 말끝 '이'는 불일치(수정 전 둘 다 대조 안 함)", async () => {
  assert.equal(OTP_ITEM.otpCode, "048231", "전제 — 카탈로그 정답");
  const right = await evaluate("0482312");
  assert.deepEqual([right.outcome, right.reason], ["match", "compared"]);
  const wrong = await evaluate("1234562");
  assert.deepEqual([wrong.outcome, wrong.reason], ["mismatch", "compared"]);
  // 역검증 — 끝이 2가 아닌 7자리는 종전처럼 대조하지 않는다(전화 · 금액 등 과발동 0).
  const other = await evaluate("1234567");
  assert.deepEqual([other.outcome, other.reason], ["none", "no-same-length"]);
});

const msg = (role: "scammer" | "user", textMasked: string, turnIndex: number): AnalysisMessage => ({
  role,
  textMasked,
  turnIndex,
  createdAtMs: 1000 * (turnIndex + 1),
});
const judge = (reply: string) =>
  analyzeConversation([msg("scammer", "인증번호 여섯 자리 불러 주십시오.", 0), msg("user", reply, 1)], 0, [], ["048231"]);

test("[E3-c] 리포트 — 오답 + 말끝 '이'(전사 '1234562')는 위험 신호 fake_info(수정 전 = 속음) · 정답 + '이'는 속음 그대로", () => {
  const wrong = judge("1234562");
  assert.equal(wrong.wasDeceived, false);
  assert.deepEqual(wrong.riskSignals.map((s) => s.kind), ["fake_info"]);
  const right = judge("0482312");
  assert.equal(right.wasDeceived, true);
  assert.deepEqual(right.riskSignals, []);
});

test("[E3-d] Live 대조 1줄 — 말끝 '이(요)'는 숫자 2가 아니라는 문장 · 정답은 여전히 한 번만", () => {
  const line = buildOtpLiveCompareLine("785136");
  assert.match(line, /번호 끝에 붙는 "이요"·"이에요"의 "이"는 숫자 2가 아니라 말끝이다/);
  assert.match(line, /한 자리가 더 들리고 그 마지막이 2\(이\)면 그 마지막 자리를 빼고 비교한다/);
  assert.equal(line.split("7 8 5 1 3 6").length, 2, "정답 등장 1회(§101)");
});
