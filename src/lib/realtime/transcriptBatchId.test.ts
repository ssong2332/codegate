// 전사 재전송 · SEC-08(외부 보안 점검 2차 · 2026-11-02) — 클라 쪽 고정.
// ① 제출마다 서버 형식(8~64자 `[A-Za-z0-9_-]`)의 새 batch ID가 붙는다 ② 10분 재연결 · 핸들 이어받기는 발급(`createRealtimeCall`)을 쓰지 않는다
// — 서버 발급 예산(통화 구간별 6회)이 정상 재연결을 깎지 않는다는 근거.
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 CRLF→LF로 정규화해 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withTranscriptBatchId } from "./transcriptBatchId.ts";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

test("[전사 재전송] 제출마다 새 batch ID(서버 허용 형식) · 이미 있으면 그대로", () => {
  const base = { sessionId: "s1", turns: [{ role: "user" as const, text: "네" }] };
  const a = withTranscriptBatchId(base);
  const b = withTranscriptBatchId(base);
  assert.match(a.batchId ?? "", /^[A-Za-z0-9_-]{8,64}$/);
  assert.notEqual(a.batchId, b.batchId, "제출마다 다른 값");
  assert.equal(withTranscriptBatchId({ ...base, batchId: "keepme0001" }).batchId, "keepme0001");
  assert.equal(base.hasOwnProperty("batchId"), false, "원래 요청 객체는 바꾸지 않는다");
  assert.match(read("src/lib/api/submitRealtimeTranscript.ts"), /withTranscriptBatchId\(request\)/);
});

test("[SEC-08] 10분 재연결 · 이어받기는 새 발급을 쓰지 않는다 — 발급 호출부는 useRealtimeCall 5곳뿐(미리 받기 · 받기 · 폴백 보관 · 화면 복귀 · 다음 레그)", () => {
  for (const p of ["src/lib/realtime/GeminiVoiceSession.tsx", "src/lib/realtime/liveResume.ts"]) {
    // 주석 언급은 제외 — import · 호출만 본다.
    assert.equal(/createRealtimeCall\(|import \{[^}]*createRealtimeCall/.test(read(p)), false, `${p}가 발급을 부른다`);
  }
  const hook = read("src/lib/realtime/useRealtimeCall.ts");
  assert.equal(hook.match(/createRealtimeCall\(\{ sessionId \}\)/g)?.length, 5);
});
