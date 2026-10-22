// §106 — 가짜 사건 기록 열람본의 피의자 칸 값(`recordDocument.ts`) — 입력값이 라벨 순서대로 들어가는지 · 잎 모듈인지.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recordSubjectRows } from "./recordDocument.ts";

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
