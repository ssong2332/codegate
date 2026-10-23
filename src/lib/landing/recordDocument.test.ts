// §106 — 가짜 사건 기록 열람본의 피의자 칸 값(`recordDocument.ts`) — 입력값이 라벨 순서대로 들어가는지 · 잎 모듈인지.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RECORD_VIEW_MINUTES, recordIssueInfo, recordSubjectRows } from "./recordDocument.ts";

const FIELDS = ["성명", "생년월일", "휴대전화 번호"];
const FIXED = [{ label: "구분", value: "피의자(명의 도용 피해 여부 조사 중)" }];

test("[§106] 방금 넣은 값이 라벨 순서대로 피의자 칸에 들어가고 고정 칸이 뒤에 붙는다", () => {
  const rows = recordSubjectRows(FIELDS, { 휴대전화_번호: "x", "휴대전화 번호": "010-1234-5678", 성명: "  홍길동 ", 생년월일: "900101" }, FIXED);
  assert.deepEqual(rows, [
    { label: "성명", value: "홍길동" },
    { label: "생년월일", value: "900101" },
    { label: "휴대전화 번호", value: "010-1234-5678" },
    FIXED[0],
  ]);
});

test("[§106] 빈 칸은 '-' · 입력값 자체는 바꾸지 않는다(자동 서식 0)", () => {
  const rows = recordSubjectRows(FIELDS, { 성명: "김 철수" }, []);
  assert.deepEqual(rows.map((r) => r.value), ["김 철수", "-", "-"]);
});

test("[§106] 잎 모듈 — import 0 · 네트워크 · 저장 경로 0", () => {
  const source = readFileSync("src/lib/landing/recordDocument.ts", "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.equal(/^\s*import\s/m.test(source), false);
  for (const token of ["fetch(", "httpsCallable", "localStorage", "sessionStorage", "indexedDB", "firebase"]) {
    assert.equal(source.includes(token), false, token);
  }
});

// §109 — 반 칸 표시 · 발급 정보(제출 시각만으로 만든다 · 입력값 0).
test("[§109] 반 칸 라벨의 입력 칸에만 half · 고정 칸은 그대로", () => {
  const rows = recordSubjectRows(FIELDS, { 성명: "홍길동", 생년월일: "900101", "휴대전화 번호": "01012345678" }, FIXED, ["성명", "생년월일"]);
  assert.deepEqual(rows.map((r) => r.half === true), [true, true, false, false]);
  assert.deepEqual(rows[3], FIXED[0]);
});

test("[§109] 발급 정보 — 발급 일시 · 30분 뒤 만료 · 신청 번호(8자리 연속 숫자 0)", () => {
  const info = recordIssueInfo(new Date(2026, 9, 22, 23, 41, 30));
  assert.deepEqual(info, { requestNo: "2026-1022-2341", issuedAt: "2026. 10. 22. 23:41", expiresAt: "2026. 10. 23. 00:11" });
  assert.equal(RECORD_VIEW_MINUTES, 30);
  assert.equal(/\d{8,}/.test(Object.values(info).join(" ")), false);
  // 같은 시각이면 같은 값(무작위 0).
  assert.deepEqual(recordIssueInfo(new Date(2026, 0, 2, 3, 4)), recordIssueInfo(new Date(2026, 0, 2, 3, 4)));
});
