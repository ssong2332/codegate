// D-61 / P-29 (8) — 모의 화면 항목 표시 문구 3분기 고정.
//
// **이 테스트가 막는 회귀**: 폼을 제출한 참가자(= `consented:false` + 같은 순간에 승격된
// `deceivedMoment` 있음)에게 리포트가 *"잘 대응한 지점입니다"* 라고 말하는 것. 그 상태는
// **위쪽의 승격된 "속은 시점" 카드와 정면으로 모순**돼 한 리포트가 자기모순이 된다.
//
// ⭐ reviewer 인계(D-61 Impact) — **`consented:false`에 부정 문구가 무조건 붙는 구현은 반려 사유**다.
// 그래서 아래 (2)는 "분기 나에 부정 서술 0건"을, (3)은 "분기 다는 살아 있다"를 **둘 다** 단언한다.
// 한쪽만 있으면 반대 방향 고장(칭찬 전멸)을 못 잡는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MOCK_SCREEN_COPY_TABLE,
  resolveMockScreenBranch,
  resolveMockScreenCopy,
  type MockScreenCopyEntry,
  type MockScreenCopySurface,
} from "./mockScreenTimelineCopy.ts";

const SURFACES: MockScreenCopySurface[] = ["report", "replay"];

/** "응하지 않았다/닫았다"류 = 참가자를 "안 속았다"로 낙인찍는 서술. */
const NEGATIVE_PHRASES = ["응하지 않", "닫았", "잘 대응"];

/** 분기 "나"(제출) 샘플 — 승격된 순간이 항목의 앵커 턴에 있다. */
const SUBMITTED: MockScreenCopyEntry = {
  anchorTurnIndex: 2,
  anchorResolved: true,
  consented: false,
};

test("[D-61/1-가] consented:true → 사실 1줄(교육 문구는 속은 순간 카드 전담)", () => {
  const entry: MockScreenCopyEntry = { anchorTurnIndex: 2, anchorResolved: true, consented: true };
  // 승격 여부와 무관하게 "가"다 — consented가 곧 응낙이다.
  for (const moments of [[], [{ turnIndex: 2 }]]) {
    assert.equal(resolveMockScreenBranch(entry, moments), "consented");
  }
  for (const surface of SURFACES) {
    const copy = resolveMockScreenCopy(entry, [{ turnIndex: 2 }], surface);
    assert.equal(copy.tone, "caution");
    assert.match(copy.text, /권한 허용에 응했습니다/);
  }
});

test("[D-61/2-나] consented:false + 같은 턴에 승격된 순간 있음 → '열었습니다'에서 멈춘다", () => {
  assert.equal(resolveMockScreenBranch(SUBMITTED, [{ turnIndex: 2 }]), "submitted");
  for (const surface of SURFACES) {
    const copy = resolveMockScreenCopy(SUBMITTED, [{ turnIndex: 2 }], surface);
    assert.equal(copy.text, "이 화면을 열었습니다.");
    assert.equal(copy.tone, "neutral");
    // 리플레이의 "잘 대응한 지점" 소제목도 붙지 않는다(중복 카드 금지 + 낙인 금지).
    assert.equal(copy.heading, undefined);
  }
});

test("[D-61/2-나] 분기 '나'의 문구에 부정 서술이 0건이다(기계 단언)", () => {
  for (const surface of SURFACES) {
    const copy = resolveMockScreenCopy(SUBMITTED, [{ turnIndex: 2 }], surface);
    const rendered = `${copy.heading ?? ""} ${copy.text}`;
    for (const phrase of NEGATIVE_PHRASES) {
      assert.ok(
        !rendered.includes(phrase),
        `분기 "나"(제출)에서 금지 문구 "${phrase}"가 ${surface} 표면에 렌더된다: ${rendered}`,
      );
    }
  }
});

test("[D-61/3-다] consented:false + 승격된 순간 없음 → D-51 ③ 칭찬 문구는 **살아 있다**", () => {
  const entry: MockScreenCopyEntry = { anchorTurnIndex: 2, anchorResolved: true, consented: false };
  // 다른 턴의 순간은 이 항목의 근거가 아니다.
  assert.equal(resolveMockScreenBranch(entry, [{ turnIndex: 5 }]), "declined");
  assert.equal(resolveMockScreenBranch(entry, []), "declined");
  for (const surface of SURFACES) {
    const copy = resolveMockScreenCopy(entry, [], surface);
    assert.equal(copy.tone, "praise");
    assert.match(copy.text, /응하지 않았습니다/);
  }
  // 열어보고 닫은 사람에게 "잘 대응했다"는 여전히 맞는 말이다 — 사라지면 반대 방향 고장이다.
  assert.match(MOCK_SCREEN_COPY_TABLE.report.declined.text, /잘 대응한 지점입니다/);
  assert.equal(MOCK_SCREEN_COPY_TABLE.replay.declined.heading, "잘 대응한 지점");
});

test("[D-61/폴백] 승격이 구조적으로 불가능한 경로는 전부 '나'로 떨어진다(낙인 금지)", () => {
  // 서버는 `anchorResolved && anchorTurnIndex >= 0`일 때만 승격한다
  // (functions/src/report/mockScreenTimeline.ts:189-193, §31.6 G135) — 그 조건이 깨진 항목은
  // **제출했더라도** 대조할 순간이 없다. 그때 "다"로 읽으면 제출한 참가자를 낙인찍는다.
  const unresolved: MockScreenCopyEntry = {
    anchorTurnIndex: 7,
    anchorResolved: false,
    consented: false,
  };
  const negativeIndex: MockScreenCopyEntry = {
    anchorTurnIndex: -1,
    anchorResolved: true,
    consented: false,
  };
  for (const entry of [unresolved, negativeIndex]) {
    assert.equal(resolveMockScreenBranch(entry, []), "submitted");
    for (const surface of SURFACES) {
      assert.equal(resolveMockScreenCopy(entry, [], surface).text, "이 화면을 열었습니다.");
    }
  }
});

test("[D-61] 어떤 분기도 `consented` 한 필드만으로 갈리지 않는다", () => {
  // 같은 `consented:false` 항목이 승격 유무에 따라 **다른 문구**를 낸다 — 이분 구현이면 이 단언이
  // 깨진다(두 경우가 같은 문구가 된다).
  const withMoment = resolveMockScreenCopy(SUBMITTED, [{ turnIndex: 2 }], "report");
  const withoutMoment = resolveMockScreenCopy(SUBMITTED, [], "report");
  assert.notEqual(withMoment.text, withoutMoment.text);
  assert.notEqual(withMoment.branch, withoutMoment.branch);
});

// 두 표면(UX-008·UX-018)이 이 규칙을 **우회해 스스로 이분하는 것**을 막는다. 순수 함수만
// 고정하면 화면이 다시 `mockScreen.consented ? … : …`를 쓰는 회귀를 못 잡는다 —
// 이 저장소에는 React 렌더러 테스트 러너가 없어(T19 known gap) 렌더 결과를 관측할 수 없기
// 때문이다(src/components/mockScreenCopy.test.ts와 같은 최소 방어).
const SURFACE_FILES = ["src/app/report/page.tsx", "src/app/report/replay/page.tsx"];

/** 주석은 제외한다 — 이 저장소는 "왜 하지 않는가"를 주석으로 길게 남기는 관례다. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("[D-61] 화면이 `consented` 한 필드로 직접 이분하지 않는다(두 표면 모두)", () => {
  for (const path of SURFACE_FILES) {
    const code = codeOnly(readFileSync(path, "utf8"));
    assert.ok(
      !/mockScreen\.consented/.test(code),
      `${path}가 mockScreen.consented로 직접 분기한다 — 판정은 resolveMockScreenCopy가 소유한다`,
    );
    assert.ok(
      /resolveMockScreenCopy\(/.test(code),
      `${path}가 공용 판정 함수를 쓰지 않는다`,
    );
  }
});

test("[AC-062 무회귀] 제출 0건·승격 0건 세션의 문구는 도입 전과 같다", () => {
  // 되감기 진입점은 `deceivedMoments` 개수로만 정해진다(rewindEntry.ts) — 이 파일은 그 배열을
  // **읽기만** 하고 늘리거나 줄이지 않는다. 순간 0건이면 모든 항목이 "다"로 남는다.
  const entries: MockScreenCopyEntry[] = [
    { anchorTurnIndex: 0, anchorResolved: true, consented: false },
    { anchorTurnIndex: 4, anchorResolved: true, consented: false },
  ];
  for (const entry of entries) {
    assert.equal(resolveMockScreenBranch(entry, []), "declined");
    assert.equal(
      resolveMockScreenCopy(entry, [], "report").text,
      "잘 대응한 지점입니다 — 권한 허용에 응하지 않았습니다.",
    );
  }
});
