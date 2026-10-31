// T190-2 — G453 가짜 주소 형식 게이트 (docs/Architecture.md §74.9 · §74.14 G453 · UX D-101 · PRD AC-094 (b)(g)).
//
// 대상: 모든 `MOCK_SCREENS[*].mockHost` · 모든 `IN_CALL_SMS[*].linkAddress`. (클라 범용·설치 호스트는
// 루트 `src/components/mockScreenCopy.test.ts`가 컴포넌트 소스에서 같은 함수를 다시 적용한다 — 두 패키지라
// import로 공유할 수 없어 규칙만 같은 정규식으로 둔다.)
//
// 규칙(D-101 정본 — OQ-A96 판정 반영):
//   ① 호스트 = 영문 소문자·숫자·하이픈 레이블 + **마지막 레이블 `.invalid`**(TLD는 `.invalid` 하나로 고정 —
//      `.example`·`.test` 불허, §74.9)
//   ② `http://`·`https://`·`www.`·`href` 0
//   ③ 경로 = 구획 1~2개 · 각 `/` + 영문·숫자 2~12자 · 경로 전체 24자 이하
//   ④ 연속 숫자 3자리 이하
//   ⑤ `linkAddress`는 그 문자의 `fakeLandingId` 랜딩의 `mockHost + "/"`로 시작한다
// ⚠️ 실존 기관 도메인 꼴(`go.kr`·`or.kr`)·실존 브랜드 낱말은 ①(TLD 고정)과 무해화 게이트
// (`harmlessnessGate.test.ts` — `mockSurface` 프로파일에 두 필드 등록)가 함께 막는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_SCREENS } from "../mockScreens";
import { IN_CALL_SMS } from "../inCallSms";

const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)*\.invalid$/;
const PATH_PATTERN = /^(\/[A-Za-z0-9]{2,12}){1,2}$/;
const MAX_PATH_LENGTH = 24;
const FORBIDDEN_FRAGMENTS = [/https?:\/\//i, /\bwww\./i, /href/i];
const LONG_DIGITS = /\d{4,}/;

/** 호스트 하나의 위반 목록 — 본 게이트와 역검증이 **같은 함수**를 쓴다. */
function mockHostViolations(host: string): string[] {
  const out: string[] = [];
  if (!HOST_PATTERN.test(host)) out.push(`호스트 형식(.invalid 끝 · 소문자·숫자·하이픈): ${host}`);
  for (const pattern of FORBIDDEN_FRAGMENTS) {
    if (pattern.test(host)) out.push(`금지 표기 ${pattern}: ${host}`);
  }
  if (LONG_DIGITS.test(host)) out.push(`연속 숫자 4자리 이상: ${host}`);
  return out;
}

/** `linkAddress` 하나의 위반 목록(⑤ 접두 포함). */
function linkAddressViolations(address: string, landingHost: string | undefined): string[] {
  const out: string[] = [];
  for (const pattern of FORBIDDEN_FRAGMENTS) {
    if (pattern.test(address)) out.push(`금지 표기 ${pattern}: ${address}`);
  }
  if (LONG_DIGITS.test(address)) out.push(`연속 숫자 4자리 이상: ${address}`);
  if (!landingHost) {
    out.push(`fakeLandingId 랜딩의 mockHost를 찾지 못했다: ${address}`);
    return out;
  }
  if (!address.startsWith(`${landingHost}/`)) {
    out.push(`그 랜딩의 호스트(${landingHost}/)로 시작하지 않는다: ${address}`);
    return out;
  }
  const path = address.slice(landingHost.length);
  if (!PATH_PATTERN.test(path)) out.push(`경로 형식(구획 1~2개 · 각 2~12자): ${path}`);
  if (path.length > MAX_PATH_LENGTH) out.push(`경로 ${path.length}자 > ${MAX_PATH_LENGTH}자: ${path}`);
  return out;
}

const allScreens = Object.values(MOCK_SCREENS).flat();
const hostByLanding = new Map(allScreens.map((item) => [item.landingId, item.mockHost]));
const linkedSms = Object.values(IN_CALL_SMS)
  .flat()
  .filter((item) => item.linkAddress !== undefined);

test("[T190/G453] 모든 mockHost가 .invalid 가짜 호스트 규칙을 지키고 서로 다르다", (t) => {
  assert.equal(allScreens.length, 25, "도달 가능 랜딩은 25종이다(credential-form 19 + app-install 6 — P2-d 환급 수수료 이체 화면 · P2-c 메신저 이체 화면 2종 · P2 훈련용 이체 화면 5종 · T194-a parcel-install · T194-c-1 Q2 3종 · §110.2 자녀 보험 접수 앱 · §92.3 고급 전용 2종 · §98 검찰 보관 지갑 · §101 검찰 자산 검수 사이트)");
  const violations = allScreens.flatMap((item) => mockHostViolations(item.mockHost));
  t.diagnostic(`[G453] 호스트 ${allScreens.length}개: ${allScreens.map((i) => i.mockHost).join(" · ")}`);
  assert.deepEqual(violations, []);
  assert.equal(new Set(allScreens.map((item) => item.mockHost)).size, allScreens.length, "호스트가 겹치면 두 랜딩이 같은 사이트로 보인다");
});

test("[T190/G453] D-101 정본 3종은 글자 그대로다(이체형 랜딩 + 문자 줄)", () => {
  assert.equal(hostByLanding.get("safe-account-transfer"), "jasan-boho-center.invalid");
  assert.equal(hostByLanding.get("card-relief-transfer"), "card-relief-desk.invalid");
  assert.equal(hostByLanding.get("protect-account-transfer"), "acct-protect-desk.invalid");
  const byLanding = new Map(linkedSms.map((item) => [item.fakeLandingId, item.linkAddress]));
  assert.equal(byLanding.get("safe-account-transfer"), "jasan-boho-center.invalid/transfer/a7Kq");
  assert.equal(byLanding.get("card-relief-transfer"), "card-relief-desk.invalid/move/R3xp");
  assert.equal(byLanding.get("protect-account-transfer"), "acct-protect-desk.invalid/shield/Bq4t");
});

test("[T190/G453] 모든 linkAddress = 그 fakeLandingId 랜딩의 mockHost + 경로(규칙 ③④⑤)", (t) => {
  const withLanding = Object.values(IN_CALL_SMS)
    .flat()
    .filter((item) => item.fakeLandingId !== undefined);
  assert.equal(linkedSms.length, withLanding.length, "링크형 문자 전부가 linkAddress를 가져야 한다(G111 3자 쌍)");
  assert.ok(linkedSms.length >= 6, `linkAddress 항목이 ${linkedSms.length}건뿐이다`);
  const violations = linkedSms.flatMap((item) =>
    linkAddressViolations(item.linkAddress!, hostByLanding.get(item.fakeLandingId!)),
  );
  t.diagnostic(`[G453] 문자 줄 ${linkedSms.length}건: ${linkedSms.map((i) => i.linkAddress).join(" · ")}`);
  assert.deepEqual(violations, []);
});

test("[T190/G453 역검증 — AC-094 (g)] .com 호스트 · https:// 접두 · 숫자 4연속 샘플은 각각 실패하고 정본은 통과한다", (t) => {
  const canonicalHost = "jasan-boho-center.invalid";
  const canonicalAddress = "jasan-boho-center.invalid/transfer/a7Kq";
  const samples: Array<[string, string[]]> = [
    ["정본 호스트", mockHostViolations(canonicalHost)],
    ["정본 문자 줄", linkAddressViolations(canonicalAddress, canonicalHost)],
    [".com 호스트", mockHostViolations("jasan-boho-center.com")],
    ["https:// 접두 호스트", mockHostViolations("https://jasan-boho-center.invalid")],
    ["https:// 접두 문자 줄", linkAddressViolations(`https://${canonicalAddress}`, canonicalHost)],
    ["숫자 4연속 호스트", mockHostViolations("desk1234.invalid")],
    ["숫자 4연속 경로", linkAddressViolations("jasan-boho-center.invalid/transfer/a1234", canonicalHost)],
    ["다른 랜딩 호스트로 시작", linkAddressViolations("card-relief-desk.invalid/move/R3xp", canonicalHost)],
    ["www. 호스트", mockHostViolations("www.jasan-boho-center.invalid")],
  ];
  t.diagnostic(samples.map(([label, v]) => `${label}: 위반 ${v.length}건`).join(" / "));
  assert.deepEqual(samples[0][1], []);
  assert.deepEqual(samples[1][1], []);
  for (const [label, violations] of samples.slice(2)) {
    assert.ok(violations.length >= 1, `${label} 샘플이 통과했다 — G453이 공회전한다`);
  }
});
