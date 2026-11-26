// §144(DECISIONS #257) 목소리 프로필 — 화면 판정표 VI · 녹음 → 저장 → 만들기 복귀 배선.
// 화면은 이 러너에서 렌더할 수 없다 → 판정은 순수 함수, 배선은 소스 스캔(cloneReadyRoute.test.ts와 같은 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  VOICE_PROFILE_CAP,
  VOICE_PROFILE_CONSENT_VERSION,
  daysLeftLabel,
  readPendingVoiceProfileSave,
  resolveVoiceSlot,
  voiceProfileConsentText,
  voiceUsageCounts,
} from "./voiceProfileConsent.ts";
import { withVoiceProfile } from "../recording/cloneReadyRoute.ts";
import { isAnonymousOutsideRecipientFlow } from "../auth/anonymousScope.ts";
import { DISALLOW_PREFIXES, isKnownAppPath } from "../seo/publicPages.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;
const p = (profileId: string, days: number) => ({ profileId, label: profileId, retentionDeleteAtMs: NOW + days * DAY });

test("[VI1~VI3] 개수에 따라 새로 녹음 가능 여부 · 만료된 프로필 숨김", () => {
  assert.deepEqual(resolveVoiceSlot([], null, NOW), { profiles: [], canRecordNew: true, selectedId: null });
  assert.equal(resolveVoiceSlot([p("a", 3), p("b", 3)], null, NOW).canRecordNew, true);
  const full = resolveVoiceSlot([p("a", 3), p("b", 3), p("c", 3)], null, NOW);
  assert.equal(VOICE_PROFILE_CAP, 3);
  assert.equal(full.canRecordNew, false);
  const withExpired = resolveVoiceSlot([p("a", 3), p("b", 3), p("old", 0)], "old", NOW);
  assert.deepEqual(withExpired.profiles.map((x) => x.profileId), ["a", "b"], "만료 = 숨김");
  assert.equal(withExpired.canRecordNew, true, "만료된 것은 자리를 잡지 않는다(서버 VS3과 같은 규칙)");
  assert.equal(withExpired.selectedId, null, "만료된 프로필은 고를 수 없다");
});

test("[VI4 · VI5] 녹음에서 돌아온 id가 골라진다 · 목록에 없으면 선택 없음", () => {
  assert.equal(resolveVoiceSlot([p("a", 3), p("new", 30)], "new", NOW).selectedId, "new");
  assert.equal(resolveVoiceSlot([p("a", 3)], "other", NOW).selectedId, null);
});

test("[표시] 남은 기간 · 동의 문구에 기간과 함께 폐기가 들어 있다", () => {
  assert.equal(daysLeftLabel(NOW + 30 * DAY, NOW), "30일 뒤 삭제");
  assert.equal(daysLeftLabel(NOW + DAY / 2, NOW), "오늘 삭제");
  assert.match(voiceProfileConsentText(7), /7일/);
  assert.match(voiceProfileConsentText(30), /챌린지 링크도 함께 사라집니다/);
});

test("[저장 값] 녹음 화면 → clone/wait 탭 힌트는 형식이 맞을 때만 쓴다", () => {
  assert.deepEqual(readPendingVoiceProfileSave(JSON.stringify({ label: " 평소 ", retentionDays: 7 })), {
    label: "평소",
    retentionDays: 7,
  });
  for (const bad of [null, "{", JSON.stringify({ label: "", retentionDays: 30 }), JSON.stringify({ label: "a", retentionDays: 14 })]) {
    assert.equal(readPendingVoiceProfileSave(bad), null, String(bad));
  }
});

test("[복귀 주소] 저장한 목소리가 골라진 만들기 화면", () => {
  assert.equal(
    withVoiceProfile("/challenge/create?scenarioId=family-accident-deepvoice", "p 1"),
    "/challenge/create?scenarioId=family-accident-deepvoice&voiceProfileId=p%201",
  );
});

test("[배선 · 만들기] 목소리 필요 안내 → 녹음 우회(error-clone)가 없고, 프로필 id를 보낸다", () => {
  const page = read("src/app/challenge/create/page.tsx");
  assert.doesNotMatch(page, /setState\("error-clone"\)/, "예전 우회 경로가 남아 있다");
  assert.doesNotMatch(page, /목소리 클론하러 가기/);
  assert.match(page, /voiceProfileId: voiceSlot\.selectedId/);
  assert.match(page, /reason === "voice_profile_required"/);
  assert.equal(page.split('router.push("/onboarding/record")').length - 1, 1, "녹음 진입은 '새로 녹음' 한 곳");
  assert.match(page, /disabled=\{!voiceSlot\.canRecordNew/);
});

test("[배선 · clone/wait] 보내기 = 프로필 저장이 끝난 뒤 그 id로 만들기에 돌아간다 · 세션 생성 0", () => {
  const page = read("src/app/clone/wait/page.tsx");
  const challengeAt = page.indexOf('route.kind === "challenge"');
  const saveAt = page.indexOf("await saveVoiceProfile(");
  const backAt = page.indexOf("withVoiceProfile(route.href, profileId)");
  const createAt = page.indexOf("await createSession(");
  assert.ok(challengeAt > 0 && saveAt > challengeAt && backAt > saveAt, "challenge → 저장 → 복귀");
  assert.ok(createAt > backAt, "본인 세션 생성은 challenge 분기 뒤");
  assert.match(page, /consentTextVersion: VOICE_PROFILE_CONSENT_VERSION/);
});

test("[배선 · 녹음] 보내기 녹음은 이름 · 보관 동의 없이 녹음할 수 없다", () => {
  const page = read("src/app/onboarding/record/page.tsx");
  assert.match(page, /const canRecord = identityChecked && profileFormOk;/);
  assert.match(page, /!isSendRecording \|\| \(retentionConsented && profileLabel\.trim\(\)\.length > 0\)/);
  assert.match(page, /setPendingVoiceProfileSave\(/);
});

test("[동의 버전] 서버 상수와 같다", () => {
  assert.ok(read("functions/src/challenge/voiceProfileRules.ts").includes(`"${VOICE_PROFILE_CONSENT_VERSION}"`));
});

// ── '내 정보' 허브(/me · §144 · UX D-164) ──────────────────────────────────────────────

test("[허브] 목소리별 사용처 수 — 사용자가 지운 챌린지 · 프로필 없는 챌린지는 세지 않는다", () => {
  assert.deepEqual(
    voiceUsageCounts([
      { voiceProfileId: "a", status: "completed" },
      { voiceProfileId: "a", status: "pending" },
      { voiceProfileId: "a", status: "deleted" },
      { voiceProfileId: "b", status: "expired" },
      { voiceProfileId: null, status: "completed" },
      { status: "completed" },
    ]),
    { a: 2, b: 1 },
  );
});

test("[허브 · AC-090] 익명(받는 사람)은 /me 밖으로(로그인 안내) · 로그인 사용자는 그대로 · 있는 라우트 · 검색 제외", () => {
  assert.equal(isAnonymousOutsideRecipientFlow(true, "/me"), true);
  assert.equal(isAnonymousOutsideRecipientFlow(false, "/me"), false);
  assert.equal(isKnownAppPath("/me"), true, "없는 주소(404)로 판정되면 RouteGuard가 공개로 둔다");
  assert.ok((DISALLOW_PREFIXES as readonly string[]).includes("/me"));
});

test("[허브 배선] 요약 + 기존 화면 진입만 · 진입점 2곳", () => {
  const hub = read("src/app/me/page.tsx");
  for (const route of ['"/challenge/results"', '"/history"', '"/report/archive"', '"/grade"']) {
    assert.ok(hub.includes(`router.push(${route})`), `허브 → ${route}`);
  }
  assert.match(hub, /fetchMyChallenges\(\)/);
  assert.match(hub, /fetchReportHistory\(user\.uid\)/);
  assert.match(hub, /fetchVoiceProfiles\(user\.uid\)/);
  assert.match(hub, /<VoiceProfileList/);
  assert.match(read("src/app/scenarios/page.tsx"), /router\.push\("\/me"\)/);
  assert.match(read("src/app/challenge/create/page.tsx"), /router\.push\("\/me"\)/);
  assert.match(read("src/app/challenge/create/page.tsx"), /<VoiceProfileList/, "목록 컴포넌트를 두 곳이 같이 쓴다");
});
