// T83 / AC-071·AC-019·AC-006 구조 불변식 회귀 방어 (Architecture.md §16.2 · §16.6 G26,
// `src/lib/incallsms/callContinuity.test.ts`와 **같은 방식·같은 이유**).
//
// **왜 소스 텍스트를 검사하는가**: 이 태스크의 하드 요구 세 가지는 렌더 **구조**로만 지켜진다.
//   (1) 확인 화면을 보는 동안 통화가 끊기지 않는다 — 오버레이를 early return하거나 라우트로 옮기면
//       세션 컴포넌트가 언마운트된다(§15.6 G10).
//   (2) 두 오버레이가 **동시에 열리지 않는다** — 중첩 aria-modal은 포커스 트랩이 겹쳐 "훈련 종료"
//       도달성이 깨진다(§16.6 G26 / AC-006).
//   (3) **실 발신 경로가 존재하지 않는다**(AC-019) — "안 하도록 조심한다"가 아니라 **경로가 없어서
//       불가능**해야 한다는 것이 UX-031 P-24 (6)의 완료 판정 문면이다.
// 이 저장소에는 React 렌더러 테스트 러너가 없어 마운트 유지를 런타임으로 관측할 수 없으므로,
// **깨지는 방식이 정해져 있는** 이 불변식들을 소스 수준에서 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync("src/app/session/play/page.tsx", "utf8");
const overlay = readFileSync("src/components/VerifyCallOverlay.tsx", "utf8");
const lib = readFileSync("src/lib/verifyintercept/verifyIntercept.ts", "utf8");
const apiTypes = readFileSync("src/lib/api/types.ts", "utf8");

/**
 * 주석을 걷어낸 **실제 코드·렌더 문자열만** 남긴다. 이 파일들의 주석에는 "…를 두지 않는다"처럼
 * 금지 대상 단어가 근거 서술로 등장하므로(설계 근거를 지우지 않기 위해 그대로 둔다), 금지 검사는
 * 렌더·실행되는 부분만 대상으로 한다.
 */
function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

test("[§16.2/G10] 확인 오버레이는 세션 컴포넌트의 형제 노드로, 그 뒤에 조건부 렌더된다", () => {
  const gemini = page.indexOf("<GeminiVoiceSession");
  const elevenlabs = page.indexOf("<RealtimeVoiceSession");
  const overlayRender = page.indexOf("<VerifyCallOverlay");
  assert.ok(gemini > 0 && elevenlabs > 0, "세션 컴포넌트가 이 화면에 있어야 한다");
  assert.ok(overlayRender > gemini && overlayRender > elevenlabs, "오버레이는 형제로 뒤에 온다");
  assert.ok(
    !/if\s*\(\s*verifyOverlayOpen\s*\)\s*return/.test(page),
    "오버레이를 early return으로 렌더하면 통화가 끊긴다(§15.6 G10)",
  );
  assert.ok(page.includes("{verifyOverlayOpen && verifyOffer && ("), "조건부 형제 렌더여야 한다");
});

test("[D-35] 확인 오버레이는 라우트가 아니다 — 신규 라우트도, 오버레이 경로의 router.push도 없다", () => {
  const routeDirs: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        routeDirs.push(full.replace(/\\/g, "/"));
        walk(full);
      }
    }
  };
  walk("src/app");
  assert.ok(
    !routeDirs.some((d) => /session\/verify|verify-call|confirm-call/.test(d)),
    `확인 전용 라우트를 만들면 통화가 끊긴다(D-35): ${routeDirs.join(", ")}`,
  );
  assert.ok(!overlay.includes("useRouter"), "오버레이는 라우터를 쓰지 않는다");
  assert.ok(!overlay.includes("router.push("), "오버레이에서 라우팅하면 통화가 끊긴다");
});

test("[§16.6 G26] 두 오버레이는 동시에 열리지 않는다 — 여는 쪽이 상대를 닫는다(AC-006 도달성)", () => {
  const openVerify = page.slice(
    page.indexOf("const handleOpenVerifyOverlay"),
    page.indexOf("const handleCloseVerifyOverlay"),
  );
  assert.ok(openVerify.length > 0, "확인 오버레이 열기 핸들러를 찾을 수 있어야 한다");
  assert.ok(
    openVerify.includes("setSmsOverlayOpen(false)"),
    "확인 오버레이를 열 때 문자 오버레이를 닫아야 한다(중첩 포커스 트랩 금지)",
  );
  const openSms = page.slice(
    page.indexOf("const handleOpenSmsOverlay"),
    page.indexOf("const handleCloseSmsOverlay"),
  );
  assert.ok(
    openSms.includes("setVerifyOverlayOpen(false)"),
    "반대 방향도 같은 규칙이어야 한다",
  );
});

test("[AC-006] 오버레이 안에 자체 '훈련 종료'가 있고, 한도 도달·종료 시 먼저 닫힌다", () => {
  assert.ok(overlay.includes("EndTrainingButton"), "포커스 트랩 안에 종료 컨트롤이 있어야 한다");
  assert.ok(overlay.includes('aria-modal="true"'), "다이얼로그 관례는 UX-027과 동일하다");
  const autoEndStart = page.indexOf("const autoEndedRef");
  const autoEndBlock = page.slice(
    autoEndStart,
    page.indexOf("}, [callMode, phase, elapsedSec", autoEndStart),
  );
  assert.ok(
    autoEndBlock.includes("setVerifyOverlayOpen(false)"),
    "한도 도달 시 확인 오버레이도 먼저 내린다(종료 고지가 가려지지 않게)",
  );
  assert.ok(
    !/if\s*\([^)]*verifyOverlayOpen/.test(autoEndBlock),
    "오버레이 상태가 한도 종료를 게이팅하면 안 된다(§15.1.1)",
  );
  const endTraining = page.slice(
    page.indexOf("const handleEndTraining"),
    page.indexOf("const handleRequestReverseEscalation"),
  );
  assert.ok(endTraining.includes("setVerifyOverlayOpen(false)"), "종료 시에도 먼저 닫는다");
});

test("[AC-019 하드] 실 발신·외부 이동 경로가 **코드에 존재하지 않는다**(조심이 아니라 부재)", () => {
  for (const [name, raw] of [
    ["VerifyCallOverlay.tsx", overlay],
    ["verifyIntercept.ts", lib],
  ] as const) {
    const source = codeOnly(raw);
    assert.ok(!/tel:/.test(source), `tel: 스킴이 있으면 안 된다: ${name}`);
    assert.ok(!/href=/.test(source), `외부 링크가 있으면 안 된다: ${name}`);
    assert.ok(!/window\.open|location\.(href|assign|replace)/.test(source), `외부 이동 금지: ${name}`);
    assert.ok(!/<input/.test(source), `자유 입력 필드가 있으면 안 된다(번호 입력 금지): ${name}`);
    assert.ok(!/navigator\.clipboard/.test(source), `번호 복사 동선을 대신 만들지 않는다: ${name}`);
  }
});

test("[AC-019 하드] 콜러블 요청 계약에 번호·URL·발신 대상 필드가 없다", () => {
  const block = apiTypes.slice(
    apiTypes.indexOf("export type VerifyCallMode"),
    apiTypes.indexOf("DeliverVerifyReconnectResponse") + 80,
  );
  assert.ok(block.length > 0, "확인 콜러블 계약 블록을 찾을 수 있어야 한다");
  for (const banned of ["url", "tel", "phoneNumber", "dialTarget", "displayNumber"]) {
    assert.ok(
      !new RegExp(`\\b${banned}\\??:`).test(block),
      `요청/응답 계약에 ${banned} 필드가 있으면 안 된다`,
    );
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ⭐ T110 / §22.6 5단계 — **G85-UI: 화면에서 번호가 되살아나지 못하게 한다**
//
// 통화→통화는 **호 전환(넘겨주기)** 이므로 참가자는 번호를 받지 않는다(ADR-0013). 카탈로그에서
// `displayNumber`를 지웠어도 **화면 코드가 값을 되살릴 여지**가 남으면 다음 사람이 그 값을 근거로
// 번호를 화면에 되돌린다 = 결함 재발 경로(§22.7 G85). 그래서 소스 수준에서 못박는다.
// ══════════════════════════════════════════════════════════════════════════════
test("[T110/G85-UI] 확인 표면 소스에 `displayNumber` 참조가 0건이다", () => {
  for (const [name, raw] of [
    ["VerifyCallOverlay.tsx", overlay],
    ["session/play/page.tsx", page],
    ["lib/verifyintercept/verifyIntercept.ts", lib],
  ] as const) {
    assert.ok(
      !/displayNumber/.test(codeOnly(raw)),
      `호 전환 모델에는 안내 번호가 없다 — 참조가 남으면 화면에 번호가 되돌아온다: ${name}`,
    );
  }
});

test("[T110/G85-UI] 확인 오버레이의 렌더 문자열에 '번호'가 0건이다", () => {
  const rendered = codeOnly(overlay);
  assert.ok(!/번호/.test(rendered), "번호 카드는 통째로 제거됐다(§22.1 C4)");
  assert.ok(!/걸기|걸어보기/.test(rendered), "발신 은유('걸기')는 쓰지 않는다(§22.1 C5)");
  assert.ok(
    !/같은 통화가 이어집니다/.test(rendered),
    "전환 모델에서 그 문장은 **화자 잔류**를 암시한다(§22.1 C3 하드)",
  );
  assert.ok(rendered.includes("연결해 달라고 하기"), "주 버튼은 연결 요청이다(C5)");
});

test("[T110/G85-UI] 통화 셸의 트리거 컨트롤에도 번호 은유가 없다 — 단, C8 발신자 라벨은 무변경", () => {
  const rendered = codeOnly(page);
  assert.ok(!/안내받은 번호/.test(rendered), "'안내받은 번호'는 폐기된 dial-out 모델의 문구다");
  assert.ok(rendered.includes("확인 부서로 연결해 달라고 하기"), "트리거 문구는 전환 요청이다(C1)");
  // ⚠️ **여기서 '번호' 전면 금지를 걸지 않는 이유(근거를 남긴다)**: 이 화면에는 확인 흐름과 무관한
  // '번호' 문자열이 정당하게 존재한다 — 다이얼패드(AC-026)와 **C8 발신자 라벨 폴백**이다.
  // C8은 §22.1이 **무변경**으로 못박은 값이고, 그 라벨 전환이 원 화자 퇴장의 **유일한 시각적
  // 보증**이다(G87 — T103도 이 우선순위를 그대로 계승해야 한다).
  assert.ok(
    rendered.includes('verifyOffer?.reconnectedCallerLabel ?? scenario.callerLabel ?? "발신번호 표시제한"'),
    "C8 우선순위가 깨지면 전환 후에도 필에 원 화자가 남아 겹침이 UI로 재현된다(G87)",
  );
});

test("[D-48] 오버레이에 '유효 대처' 선택지를 두지 않는다(무력감·정답 유출 동시 방지)", () => {
  // 세션 중에 "내가 아는 번호로 걸기"·"다른 기기로 걸기"를 시뮬레이션하면 (ㄱ) 무력감을 남기거나
  // (ㄴ) 정답을 세션 중에 알려 주게 된다 — 둘 중 하나가 반드시 발생한다(D-48).
  const rendered = codeOnly(overlay);
  assert.ok(!/다른 기기/.test(rendered), "유효 대처는 리포트에서만 제시된다");
  assert.ok(!/알고 있는 번호/.test(rendered), "유효 대처는 리포트에서만 제시된다");
  assert.ok(!/112|1332/.test(rendered), "신고처 안내도 세션 중이 아니라 리포트에서 나온다");
});

test("[OQ-38/D-6] 세션 중 구조 설명이 화면 어디에도 없다", () => {
  for (const [name, raw] of [
    ["VerifyCallOverlay.tsx", overlay],
    ["session/play/page.tsx", page],
  ] as const) {
    const rendered = codeOnly(raw);
    assert.ok(
      !/같은 곳으로 이어졌|같은 조직입니다|같은 사기범/.test(rendered),
      `세션 중 구조 설명은 리포트로 미룬다(OQ-38 확정): ${name}`,
    );
  }
});
