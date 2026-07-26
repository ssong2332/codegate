import { test } from "node:test";
import assert from "node:assert/strict";
import { extractLinkMarker } from "../linkMarker";

test("extractLinkMarker(): 마커가 없으면 원문을 그대로 반환하고 attachments가 없다", () => {
  const result = extractLinkMarker("안녕하세요, 확인 부탁드립니다.");
  assert.equal(result.text, "안녕하세요, 확인 부탁드립니다.");
  assert.equal(result.attachments, undefined);
});

test("extractLinkMarker(): 알려진 fakeLandingId면 고정 라벨로 매핑하고 마커를 제거한다(AC-045)", () => {
  const result = extractLinkMarker("여기서 확인해 주세요 [[LINK:parcel-redelivery]]");
  assert.equal(result.text, "여기서 확인해 주세요");
  assert.ok(result.attachments);
  assert.equal(result.attachments!.length, 1);
  assert.deepEqual(result.attachments![0], {
    kind: "link",
    displayText: "재배송 신청 확인하기",
    fakeLandingId: "parcel-redelivery",
    harmless: true,
  });
  // 사용자에게 마커 원문이 노출되지 않는다.
  assert.ok(!result.text.includes("[[LINK"));
});

test("extractLinkMarker(): 매핑에 없는 fakeLandingId는 기본 라벨로 대체한다(조용한 실패 금지)", () => {
  const result = extractLinkMarker("[[LINK:unknown-id]] 확인하세요");
  assert.ok(result.attachments);
  assert.equal(result.attachments![0].displayText, "확인하기");
  assert.equal(result.attachments![0].fakeLandingId, "unknown-id");
});

test("extractLinkMarker(): 여러 마커가 있으면 각각 attachments 항목으로 변환한다", () => {
  const result = extractLinkMarker(
    "먼저 [[LINK:parcel-redelivery]] 확인하시고, 이어서 [[LINK:subsidy-apply]]도 확인하세요.",
  );
  assert.ok(result.attachments);
  assert.equal(result.attachments!.length, 2);
  assert.equal(result.attachments![0].fakeLandingId, "parcel-redelivery");
  assert.equal(result.attachments![1].fakeLandingId, "subsidy-apply");
  assert.ok(!result.text.includes("[[LINK"));
});

// ── T84(§15.9.1 R2~R5) — landingKind 부착 ────────────────────────────────────

test("[R4] 카탈로그의 app-install 랜딩이면 landingKind를 싣는다(서버가 정한다 — 클라 분류 금지)", () => {
  const result = extractLinkMarker(
    "신청 접수는 확인 앱을 설치하셔야 진행됩니다 [[LINK:subsidy-install]]",
    "messenger-subsidy-smishing-sms",
  );
  assert.ok(result.attachments);
  assert.deepEqual(result.attachments![0], {
    kind: "link",
    displayText: "지원금 신청 앱 설치하기",
    fakeLandingId: "subsidy-install",
    harmless: true,
    landingKind: "app-install",
  });
});

test("[R2 회귀 0] 기본 kind(credential-form)면 키 자체를 만들지 않는다 — 기존 12개 시나리오 attachment 무변경", () => {
  const withScenario = extractLinkMarker(
    "여기서 확인해 주세요 [[LINK:parcel-redelivery]]",
    "messenger-parcel-smishing-sms",
  );
  const withoutScenario = extractLinkMarker("여기서 확인해 주세요 [[LINK:parcel-redelivery]]");
  assert.deepEqual(withScenario.attachments, withoutScenario.attachments);
  assert.equal("landingKind" in withScenario.attachments![0], false);
});

test("[R5] 미상 id·다른 시나리오의 id는 app-install로 폴백하지 않는다(사고 개방 금지)", () => {
  // 같은 landingId라도 **다른 시나리오**에서는 카탈로그 소속이 아니다.
  const otherScenario = extractLinkMarker(
    "[[LINK:subsidy-install]]",
    "messenger-parcel-smishing-sms",
  );
  assert.equal("landingKind" in otherScenario.attachments![0], false);

  const unknownId = extractLinkMarker("[[LINK:unknown-id]]", "messenger-subsidy-smishing-sms");
  assert.equal("landingKind" in unknownId.attachments![0], false);
});
