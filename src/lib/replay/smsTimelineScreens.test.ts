// T89 / AC-059 — 리포트·리플레이 화면의 구조 불변식 회귀 방어 (Architecture.md §15.1.5, G16/G18/G19).
//
// **왜 소스 텍스트를 검사하는가**: 이 저장소에는 React 렌더러 테스트 러너가 없어(T19 known gap)
// "안 속은 세션에서 문자 카드가 보인다" 같은 렌더 결과를 런타임으로 관측할 수 없다. 반면 이 세 갭은
// **깨지는 방식이 정해져 있다** — 조건을 wasDeceived로 되돌리거나(G18), 스냅샷 필드를 화면이
// 참조하거나(G19), 되감기 인덱스를 병합 목록 위치로 바꾸면(G16 동류) 그 순간 회귀한다.
// callContinuity.test.ts와 같은 최소 방어이며, 아래 buildReplayTimeline.test.ts의 동작 테스트와
// 라이브 검증을 대체하지 않는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const reportPage = readFileSync("src/app/report/page.tsx", "utf8");
const replayPage = readFileSync("src/app/report/replay/page.tsx", "utf8");
const timelineLib = readFileSync("src/lib/replay/buildReplayTimeline.ts", "utf8");

/** 금지 토큰 검사는 **주석을 제외한 실제 코드**만 본다 — 이 저장소는 "왜 하지 않는가"를 주석에
 * 길게 남기는 관례라(§15.6 갭 인용 포함), 주석까지 세면 근거를 적었다는 이유로 테스트가 깨진다. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const reportCode = codeOnly(reportPage);
const replayCode = codeOnly(replayPage);

test("[G18] 리포트 타임라인이 wasDeceived로 게이팅되지 않는다(안 속은 세션의 문자 이벤트 보존)", () => {
  const sectionStart = reportPage.indexOf('aria-label="속은 시점 타임라인"');
  assert.ok(sectionStart > 0, "타임라인 섹션을 찾을 수 있어야 한다");
  const section = reportPage.slice(sectionStart, reportPage.indexOf("</section>", sectionStart));
  assert.ok(
    !/\{report\.wasDeceived \?/.test(section),
    "wasDeceived로 목록 전체를 감싸면 안 속은 세션의 문자 이벤트가 통째로 사라진다(§15.6 G18)",
  );
  assert.ok(section.includes("timelineEntries.map"), "속은 순간과 문자를 한 목록으로 낸다");
});

test("[G16 동류] 되감기 딥링크는 병합 목록 위치가 아니라 deceivedMoments 배열 인덱스를 넘긴다", () => {
  // 병합 목록을 map할 때 `index` 파라미터를 그대로 goToRewind에 넘기면 문자가 섞인 순서가 들어가
  // 엉뚱한 순간이 열린다. 원본 인덱스(momentIndex)를 항목에 실어 두고 그것만 넘겨야 한다.
  assert.ok(reportPage.includes("goToRewind(entry.momentIndex)"), "원본 인덱스를 넘겨야 한다");
  // 되감기 진입 조건도 deceivedMoments 길이로만 판정한다(문자 건수가 섞이면 AC-062가 깨진다).
  assert.ok(
    reportPage.includes("deceivedMomentCount: report.deceivedMoments.length"),
    "진입 조건에 문자 건수가 섞이면 안 속은 세션에 되감기 진입점이 뜬다(AC-062)",
  );
  assert.ok(
    replayPage.includes("deceivedMomentCount: annotatedTurnIndexes.length"),
    "리플레이도 주석(=속은 순간) 목록 길이로만 판정한다",
  );
});

test("[G16] getAnnotatedTurnIndexes는 메시지 항목만 통과시킨다(되감기 인덱스 1:1 전제)", () => {
  const fnStart = timelineLib.indexOf("export function getAnnotatedTurnIndexes");
  const fn = timelineLib.slice(fnStart);
  assert.ok(fnStart > 0);
  assert.ok(
    fn.includes('item.kind === "message"'),
    "문자 항목이 이 목록에 섞이면 되감기가 엉뚱한 순간을 연다(§15.6 G16)",
  );
});

test("[G19] 사후 화면 어디에도 가짜 랜딩 재진입 컨트롤·인증번호 필드 참조가 없다", () => {
  for (const forbidden of [
    "fakeLandingId",
    "MessengerFakeLanding",
    "otpCode",
    "clipboard",
    // 실 URL·외부 이동 경로도 없다(AC-032/045 계승).
    "href=",
    "window.open",
    "http://",
    "https://",
  ]) {
    assert.ok(!reportCode.includes(forbidden), `리포트(열람 화면)에 있으면 안 되는 것: ${forbidden}`);
    assert.ok(!replayCode.includes(forbidden), `리플레이(열람 화면)에 있으면 안 되는 것: ${forbidden}`);
  }
});

test("[§15.1.5 (1)] 사후 화면은 inCallSms 서브컬렉션을 직접 구독하지 않는다(해석 로직 단일화)", () => {
  for (const [name, source] of [
    ["리포트", reportCode],
    ["리플레이", replayCode],
  ] as const) {
    assert.ok(
      !source.includes('"inCallSms"'),
      `${name} 화면이 서브컬렉션을 직접 읽으면 앵커 해석이 화면마다 갈라진다(§15.1.5 (1))`,
    );
    assert.ok(source.includes("smsTimeline"), `${name} 화면은 리포트 스냅샷만 읽는다`);
  }
});
