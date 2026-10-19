import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
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

// ── T194-a G582 — 도달 불가 설치 마커 강등 (docs/Architecture.md §84.4.4 · PRD AC-106 (f)(h) ⓐ) ──
//
// 초급 · 중급 parcel 세션의 모델이 `[[LINK:parcel-install]]`을 지어내도 설치 화면이 열리면 안 된다(AC-106 (f) — 그 세션에는
// 3단계가 없다). 강등 대상은 그 시나리오의 기본 credential 랜딩(`parcel-redelivery`)이고 경고 1줄을 남긴다.

/** console.warn을 잠시 가로채 강등 로그를 모은다(로그 형식까지 단언 — 조용한 임의 동작 0). */
function captureWarnings(run: () => void): string[] {
  const original = console.warn;
  const lines: string[] = [];
  console.warn = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    run();
  } finally {
    console.warn = original;
  }
  return lines;
}

test("[T194-a G582] 초급 · 중급 · 챌린지 parcel 세션의 설치 마커는 재배송 폼으로 강등되고 경고를 남긴다 · 고급 자가 세션은 설치 화면 그대로", (t) => {
  const reply = "재배송 접수는 배송 확인 앱을 설치하셔야 진행됩니다 [[LINK:parcel-install]]";
  const rows: [string, { difficultyLevel?: string; challengeId?: string; flowVariantId?: string } | undefined, string, string | undefined][] = [
    ["초급", { difficultyLevel: "beginner" }, "parcel-redelivery", undefined],
    ["중급", { difficultyLevel: "intermediate" }, "parcel-redelivery", undefined],
    ["세션 부재(닫힌 쪽)", undefined, "parcel-redelivery", undefined],
    ["고급 챌린지(AC-106 (g))", { difficultyLevel: "advanced", challengeId: "c1" }, "parcel-redelivery", undefined],
    ["고급 자가", { difficultyLevel: "advanced", flowVariantId: "fv-g454" }, "parcel-install", "app-install"],
  ];
  const lines: string[] = [];
  for (const [label, session, landingId, kind] of rows) {
    let result: ReturnType<typeof extractLinkMarker> | undefined;
    const warnings = captureWarnings(() => {
      result = extractLinkMarker(reply, "messenger-parcel-smishing-sms", session);
    });
    const attachment = result?.attachments?.[0];
    lines.push(`${label}: ${attachment?.fakeLandingId}/${attachment?.landingKind ?? "credential-form"} 경고 ${warnings.length}`);
    assert.equal(attachment?.fakeLandingId, landingId, label);
    assert.equal(attachment?.landingKind, kind, label);
    assert.equal(result?.text.includes("[[LINK:"), false, `${label}: 마커 원문이 남았다`);
    if (landingId === "parcel-redelivery") {
      assert.equal(attachment?.displayText, "재배송 신청 확인하기", `${label}: 칩 라벨도 강등된 랜딩의 것`);
      assert.equal(warnings.length, 1, `${label}: 강등은 경고 1줄을 남긴다`);
      assert.deepEqual(JSON.parse(warnings[0]), {
        event: "mock_screen_link_demoted",
        scenarioId: "messenger-parcel-smishing-sms",
        from: "parcel-install",
        to: "parcel-redelivery",
      });
    } else {
      assert.equal(attachment?.displayText, "배송 확인 앱 설치하기");
      assert.equal(warnings.length, 0, `${label}: 도달 가능하면 경고 0`);
    }
  }
  t.diagnostic(`[G582 · AC-106 (h) ⓐ] ${lines.join(" | ")}`);
});

test("[T194-a G582] 지원금 설치 마커는 세 난이도 · 챌린지 모두 강등되지 않는다(현행 무변경) · 마커 없는 텍스트는 원문 그대로", () => {
  for (const session of [{ difficultyLevel: "beginner" }, { difficultyLevel: "intermediate" }, { difficultyLevel: "advanced" }, { challengeId: "c1" }, undefined]) {
    const warnings = captureWarnings(() => {
      const result = extractLinkMarker("[[LINK:subsidy-install]]", "messenger-subsidy-smishing-sms", session);
      assert.equal(result.attachments?.[0].landingKind, "app-install", JSON.stringify(session));
    });
    assert.deepEqual(warnings, []);
  }
  const plain = "  두 칸  공백이  있는 원문  ";
  assert.equal(extractLinkMarker(plain, "messenger-parcel-smishing-sms", { difficultyLevel: "beginner" }).text, plain);
});

test("[T194-a G582] 호출부 2곳(sendMessage · 오프닝)이 세션 술어 입력을 extractLinkMarker에 넘긴다(소스 스캔)", () => {
  const read = (rel: string) =>
    fs.readFileSync(path.resolve(__dirname, "../../../src/roleplay", rel), "utf8").replace(/\r\n/g, "\n");
  assert.match(read("index.ts"), /extractLinkMarker\(\n\s*completion\.text,\n\s*session\.scenarioId,\n\s*session,\n\s*\)/);
  assert.match(read("openingLine.ts"), /extractLinkMarker\(completion\.text, scenarioId, sessionView\)/);
});
