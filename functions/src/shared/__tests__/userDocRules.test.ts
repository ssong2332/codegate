// SEC-03(외부 보안 점검 2026-11-01) — firestore.rules `users/{uid}` 클라 쓰기 필드 허용 목록.
//
// 규칙 동작 자체는 이 계층에서 실행할 수 없어(에뮬레이터 필요) 규칙 원문을 고정한다. 동작 검증은 PR 본문의
// 에뮬레이터 실측(허용 · 거부 케이스)을 본다. 이 테스트는 ① 서버 전용 필드가 허용 목록에 끼어드는 회귀,
// ② 클라 쓰기 경로가 늘었는데 허용 목록이 그대로인 회귀를 막는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

function usersBlock(): string {
  const rules = fs.readFileSync(path.join(REPO_ROOT, "firestore.rules"), "utf-8").replace(/\r\n/g, "\n");
  const start = rules.indexOf("match /users/{uid} {");
  const end = rules.indexOf("match /consents/{consentId}", start);
  assert.ok(start > -1 && end > start, "users/{uid} 규칙 블록을 찾지 못했다");
  return rules.slice(start, end).replace(/\/\/[^\n]*/g, "");
}

function listAfter(block: string, marker: string): string[] {
  const idx = block.indexOf(marker);
  assert.ok(idx > -1, `${marker} 가 없다`);
  const m = block.slice(idx).match(/hasOnly\(\s*\[([^\]]*)\]\s*\)/);
  assert.ok(m, `${marker} 뒤에 hasOnly([...]) 가 없다`);
  return m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean).sort();
}

test("[SEC-03] 통째 write 허용이 사라지고 read · create · update · delete로 나뉘었다", () => {
  const block = usersBlock();
  assert.doesNotMatch(block, /allow read, write/);
  assert.doesNotMatch(block, /allow write/);
  assert.match(block, /allow read: if request\.auth != null && request\.auth\.uid == uid;/);
  assert.match(block, /allow delete: if false;/);
});

test("[SEC-03] create 허용 키 = 클라 쓰기 경로가 쓰는 필드 정확히", () => {
  assert.deepEqual(listAfter(usersBlock(), "allow create:"), [
    "ageVerified",
    "createdAt",
    "displayName",
    "email",
    "lastLoginAt",
    "uid",
  ]);
});

test("[SEC-03] update 변경 키 — uid · createdAt 불변, 서버 전용 필드 제외", () => {
  const block = usersBlock();
  assert.match(block, /request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(/);
  assert.deepEqual(listAfter(block, "allow update:"), ["ageVerified", "displayName", "email", "lastLoginAt"]);
});

test("[SEC-03] 서버 전용 defenseGrade · sessionCount는 어떤 클라 허용 목록에도 없다", () => {
  const block = usersBlock();
  assert.doesNotMatch(block, /defenseGrade|sessionCount/);
});

test("[SEC-03] 클라 쓰기 경로 전수 — users/{uid} 최상위 문서를 쓰는 곳은 두 파일, 쓰는 키는 허용 목록 안", () => {
  const srcRoot = path.join(REPO_ROOT, "src");
  const writers: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        const code = fs.readFileSync(p, "utf-8");
        if (/\b(setDoc|updateDoc|deleteDoc)\(/.test(code) && /doc\(db, "users"/.test(code)) {
          writers.push(path.relative(REPO_ROOT, p).replace(/\\/g, "/"));
        }
      }
    }
  };
  walk(srcRoot);
  assert.deepEqual(writers.sort(), ["src/lib/age/verifyAge.ts", "src/lib/auth/userProfile.ts"]);
  const profile = fs.readFileSync(path.join(REPO_ROOT, "src/lib/auth/userProfile.ts"), "utf-8");
  assert.match(profile, /setDoc\(ref, \{\s*uid: user\.uid,\s*displayName: [^,]+,\s*email: [^,]+,\s*createdAt: lastLoginAt,\s*lastLoginAt,\s*\}\)/);
  assert.match(profile, /setDoc\(ref, \{ lastLoginAt \}, \{ merge: true \}\)/);
  const age = fs.readFileSync(path.join(REPO_ROOT, "src/lib/age/verifyAge.ts"), "utf-8");
  assert.match(age, /setDoc\(doc\(db, "users", uid\), \{ ageVerified: true \}, \{ merge: true \}\)/);
});
