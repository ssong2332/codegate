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
