// §144(DECISIONS #257) 목소리 프로필 — 판정표 VS · VU · VD + 배선 스캔.
// 콜러블 본체는 Firestore · Storage에 기대 유닛에서 실행할 수 없다(이 디렉터리 관례) → 판정은 순수 함수로,
// 배선(순서 · 호출 유무)은 소스 스캔으로 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  VOICE_PROFILE_CAP,
  VOICE_PROFILE_CONSENT_VERSION,
  checkProfileForChallenge,
  checkSaveInput,
  checkSourceSession,
  liveProfileCount,
  retentionDeleteAtMs,
  selectChallengesForProfile,
  voiceProfileRecordingPath,
} from "../voiceProfileRules";

const SRC_DIR = path.resolve(__dirname, "../../../src/challenge");
const read = (f: string) => readFileSync(path.join(SRC_DIR, f), "utf-8");
const DAY = 24 * 60 * 60 * 1000;
const ok = { label: "내 목소리", retentionDays: 30, consented: true, consentTextVersion: VOICE_PROFILE_CONSENT_VERSION };

test("[VS1] 동의 · 기간 · 이름 형식", () => {
  assert.deepEqual(checkSaveInput(ok), { ok: true, label: "내 목소리", retentionDays: 30 });
  assert.equal(checkSaveInput({ ...ok, retentionDays: 7 }).ok, true);
  assert.equal(checkSaveInput({ ...ok, consented: false }).ok, false, "동의 없음");
  assert.equal(checkSaveInput({ ...ok, consentTextVersion: "v0" }).ok, false, "다른 동의 문구 버전");
  for (const d of [0, 14, 90, "30"]) assert.equal(checkSaveInput({ ...ok, retentionDays: d }).ok, false, `기간 ${d}`);
  assert.equal(checkSaveInput({ ...ok, label: "  " }).ok, false, "빈 이름");
  assert.equal(checkSaveInput({ ...ok, label: "가".repeat(21) }).ok, false, "21자");
  assert.deepEqual(checkSaveInput({ ...ok, label: " 엄마 " }), { ok: true, label: "엄마", retentionDays: 30 });
});

test("[VS2] 저장 가능한 사전 세션 = 본인 · created · 클론 준비 완료", () => {
  assert.equal(checkSourceSession({ uid: "u", status: "created", cloneStatus: "ready" }, "u"), null);
  assert.notEqual(checkSourceSession(undefined, "u"), null);
  assert.notEqual(checkSourceSession({ uid: "x", status: "created", cloneStatus: "ready" }, "u"), null);
  assert.notEqual(checkSourceSession({ uid: "u", status: "active", cloneStatus: "ready" }, "u"), null, "시작한 훈련");
  assert.notEqual(checkSourceSession({ uid: "u", status: "created", cloneStatus: "failed" }, "u"), null);
});

test("[VS3] 상한 3 · 만료된 프로필은 자리를 잡지 않는다", () => {
  const now = 1_000 * DAY;
  assert.equal(VOICE_PROFILE_CAP, 3);
  assert.equal(liveProfileCount([now + DAY, now + 2 * DAY, now - 1], now), 2);
  assert.equal(liveProfileCount([now + DAY, now + DAY, now + DAY], now), 3);
  assert.equal(liveProfileCount([now], now), 0, "정확히 만료 시각 = 만료");
});

test("[보존] 7일 · 30일", () => {
  assert.equal(retentionDeleteAtMs(0, 7), 7 * DAY);
  assert.equal(retentionDeleteAtMs(0, 30), 30 * DAY);
});

test("[VU1] 챌린지에 쓸 프로필 — 없음 · 만료면 거절", () => {
  assert.equal(checkProfileForChallenge({ retentionDeleteAtMs: 2 }, 1), null);
  assert.notEqual(checkProfileForChallenge(undefined, 1), null);
  assert.notEqual(checkProfileForChallenge({ retentionDeleteAtMs: 1 }, 1), null);
});

test("[VD2] 함께 폐기할 챌린지 = 이미 지운 것 제외", () => {
  assert.deepEqual(
    selectChallengesForProfile([
      { id: "a", status: "pending" },
      { id: "b", status: "deleted" },
      { id: "c", status: "completed" },
    ]),
    ["a", "c"],
  );
});

test("[경로] 프로필 녹음은 Storage 규칙이 허용하는 세션 경로 밖(서버 전용)", () => {
  const p = voiceProfileRecordingPath("u1", "p1");
  assert.equal(p, "users/u1/voiceProfiles/p1/voice_input.webm");
  assert.ok(!p.includes("/sessions/"));
  const rules = readFileSync(path.resolve(__dirname, "../../../../storage.rules"), "utf-8");
  assert.ok(!rules.includes("voiceProfiles"), "storage.rules에 프로필 경로 허용 규칙이 생기면 안 된다(기본 거부 = 다운로드 0)");
  assert.match(rules, /match \/\{allPaths=\*\*\} \{\s*allow read, write: if false;/);
});

test("[VU 배선] createChallenge는 프로필 녹음을 쓰고 '최근 ready 세션' 탐색을 하지 않는다", () => {
  const src = read("index.ts");
  assert.ok(!src.includes('collection("sessions")'), "종전 최근 세션 탐색이 남아 있다");
  assert.ok(!src.includes("voiceInputStoragePath("), "세션 녹음 경로를 소스로 쓰면 안 된다");
  const profileAt = src.indexOf("checkProfileForChallenge(");
  const cloneAt = src.indexOf("provider.createClone(");
  assert.ok(profileAt > 0 && cloneAt > profileAt, "프로필 판정이 클론 발급보다 앞");
  assert.match(src, /voiceInputStoragePath: storagePath/);
  assert.match(src, /storagePath = voiceProfileRecordingPath\(uid,/);
  assert.match(src, /voiceProfileId: usedProfileId/);
});

test("[VS4 · Q3 배선] 저장 = 트랜잭션 상한 → 복사 → 사전 세션 폐기 순서", () => {
  const body = read("voiceProfiles.ts").split("export const deleteVoiceProfile")[0]!;
  const tx = body.indexOf("runTransaction(");
  const copy = body.indexOf(".copy(");
  const purge = body.indexOf("purgeSession(");
  assert.ok(tx > 0 && copy > tx && purge > copy, `순서 tx ${tx} · copy ${copy} · purge ${purge}`);
  assert.match(body, /await profileRef\.delete\(\)/, "복사 실패 때 자리 반환");
});

test("[VD 배선] 수동 · 자동 삭제 모두 같은 폐기 함수 → 챌린지 함께 폐기", () => {
  const src = read("voiceProfiles.ts");
  assert.equal(src.split("purgeVoiceProfile(uid, profileId)").length - 1, 1, "수동 삭제");
  assert.match(src, /purgeVoiceProfile\(uid, doc\.id\)/, "자동 삭제");
  assert.match(src, /where\("voiceProfileId", "==", profileId\)/);
  assert.match(src, /purgeChallenge\(id, uid, c\.voiceId\)/);
  const indexes = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../firestore.indexes.json"), "utf-8"));
  assert.ok(
    indexes.fieldOverrides.some(
      (o: { collectionGroup: string; fieldPath: string; indexes: { queryScope: string }[] }) =>
        o.collectionGroup === "voices" &&
        o.fieldPath === "retentionDeleteAt" &&
        o.indexes.some((i) => i.queryScope === "COLLECTION_GROUP"),
    ),
    "자동 삭제 collectionGroup 범위 쿼리 색인",
  );
});

test("[동의 버전] 서버 · 클라 상수가 같다", () => {
  const client = readFileSync(path.resolve(__dirname, "../../../../src/lib/voices/voiceProfileConsent.ts"), "utf-8");
  assert.ok(client.includes(`"${VOICE_PROFILE_CONSENT_VERSION}"`));
});
