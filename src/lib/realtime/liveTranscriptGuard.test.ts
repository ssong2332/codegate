// 2026-11-07(Edge 시나리오 시험 판 3 · 16 · 23) — 실시간 통화 자막 거르기: 서버 사본 일치 · 판정표(S1 · S2 · U1) · 화면 배선(소스 스캔).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guardLiveScammerLine, guardLiveUserLine, PASSWORD_MASK } from "./liveTranscriptGuard.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const copyOf = (s: string) => s.slice(s.indexOf("// ── 사본 시작 ──"), s.indexOf("// ── 사본 끝 ──"));
/** 화면 = "회사명 표 사본" 표지 사이 · 서버 = 표 첫 줄부터 파일 끝. */
const clientCompanyTable = (s: string) =>
  s.slice(s.indexOf("// ── 회사명 표 사본 시작 ──") + "// ── 회사명 표 사본 시작 ──".length, s.indexOf("// ── 회사명 표 사본 끝 ──")).trim();
const serverCompanyTable = (s: string) => s.slice(s.search(/^export const GENERIC_COURIER/m)).trim();

test("[판 23 · 16 · 3] 판정 구간은 서버 사본과 글자까지 같다", () => {
  const client = copyOf(read("./liveTranscriptGuard.ts"));
  const server = copyOf(read("../../../functions/src/realtime/liveTranscriptGuard.ts"));
  assert.ok(client.length > 200, "사본 표지를 못 찾았다 — 조용한 건너뜀 금지");
  assert.equal(client, server);
});

test("[판 16] 실존 회사명 표는 서버 파일과 글자까지 같다", () => {
  const client = clientCompanyTable(read("./liveTranscriptGuard.ts"));
  const server = serverCompanyTable(read("../../../functions/src/guardrails/realCompanyNames.ts"));
  assert.ok(client.length > 2000, "표 시작 줄을 못 찾았다 — 조용한 건너뜀 금지");
  assert.equal(client, server);
});

test("[판 23 · 16] 사기범 자막 — 표식을 지우고 실존 택배사 이름을 업종 이름으로", () => {
  assert.equal(guardLiveScammerLine("링크 보내드릴 테니 확인 부탁드립니다. [[LINK:parcel-install]]"), "링크 보내드릴 테니 확인 부탁드립니다.");
  assert.equal(guardLiveScammerLine("상담 연결해 드릴게요. [[SIGNAL:ESCALATE_VOICE]]"), "상담 연결해 드릴게요.");
  assert.equal(guardLiveScammerLine("한진택배 고객센터 김민지 팀장입니다."), "택배사 고객센터 김민지 팀장입니다.");
  assert.equal(guardLiveScammerLine("금융감독원 조사관입니다."), "금융감독원 조사관입니다.");
});

test("[판 3] 참가자 자막 — 비밀번호를 물은 바로 뒤의 숫자 묶음만 가린다", () => {
  assert.equal(guardLiveUserLine("일 이 삼 사", "계좌 비밀번호 네 자리 말씀해 주세요."), PASSWORD_MASK);
  assert.equal(guardLiveUserLine("일 이 삼 사", "생년월일 말씀해 주세요."), "일 이 삼 사");
});

test("[배선] 통화 전사를 내보내는 두 자리(턴 끝 · 끼어들기)가 같은 거르기를 거치고, 참가자 줄은 바로 앞 사기범 줄을 본다", () => {
  const src = read("./GeminiVoiceSession.tsx");
  assert.match(src, /import \{ guardLiveScammerLine, guardLiveUserLine \} from "\.\/liveTranscriptGuard";/);
  const flush = src.slice(src.indexOf("const flushTranscript = () => {"), src.indexOf("const flushScammerTurn = () => {"));
  const flushScammer = src.slice(src.indexOf("const flushScammerTurn = () => {"), src.indexOf("const flushScammerTurn = () => {") + 900);
  assert.match(flush, /const u = guardLiveUserLine\(userBuffer, lastEmittedScammerLine\)\.trim\(\);/);
  assert.match(flush, /const s = guardScammer\(scammerBuffer\);/);
  assert.match(flush, /lastEmittedScammerLine = s;/);
  assert.match(flushScammer, /const s = guardScammer\(scammerBuffer\);/);
  assert.match(flushScammer, /lastEmittedScammerLine = s;/);
  assert.match(src, /const guardScammer = \(raw: string\) => guardLiveScammerLine\(stripLeakedThought\(raw\)\)\.trim\(\);/);
});
