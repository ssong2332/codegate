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

// ══════════════════════════════════════════════════════════════════════════════
// ⭐ T118 / §25.3 — **층 A5-α 배선의 소스 수준 고정**
//
// ⚠️ **왜 소스를 보는가**: A5의 발동 **판정**은 순수 함수로 내려 단위 테스트로 고정했지만
// (`verifyIntercept.test.ts`), 그 판정을 **어디에 걸었는지**(턴 경계 · turnComplete:false · 전사
// 미기록)는 브라우저 이벤트 위에서만 관측된다. 이 저장소에는 React 렌더러 러너가 없으므로 —
// 이 파일이 이미 그 이유로 존재한다 — **깨지는 방식이 정해져 있는** 배선을 소스로 못박는다.
// ══════════════════════════════════════════════════════════════════════════════

const geminiSession = readFileSync("src/lib/realtime/GeminiVoiceSession.tsx", "utf8");

test("[T118/A5-α] 전환 상태 단언은 `turnComplete: false`로 나간다(턴 슬롯 소비 0)", () => {
  const source = codeOnly(geminiSession);
  const effect = source.slice(source.indexOf("personaStateTurn.text.trim()"));
  assert.ok(effect.length > 0, "personaStateTurn effect가 있어야 한다");
  assert.ok(
    /sendClientContent\(\{\s*turns: personaStateTurn\.text,\s*turnComplete: false\s*\}\)/.test(
      effect.slice(0, 400),
    ),
    "true로 바꾸면 주입이 곧 발화를 유발해 사기범이 한 턴에 두 번 말한다(§25.3 (4) P-1 실측)",
  );
});

test("[T118/G105] A5 주입은 전사에 기록되지 않는다(리포트가 '사용자가 말했다'고 오판하지 않게)", () => {
  const source = codeOnly(geminiSession);
  const effect = source.slice(source.indexOf("personaStateTurn.text.trim()"), source.length);
  const body = effect.slice(0, effect.indexOf("}, [personaStateTurn?.seq]"));
  assert.ok(body.length > 0, "effect 본문을 잘라낼 수 있어야 한다");
  assert.ok(!/onTranscriptTurn/.test(body), "오케스트레이션 신호는 전사가 아니다(G105)");
});

test("[T118/§25.4] 같은 렌더에서 겹치면 `instructionTurn`이 먼저 나간다(effect 선언 순서로 강제)", () => {
  const source = codeOnly(geminiSession);
  assert.ok(
    source.indexOf("}, [instructionTurn?.seq]") < source.indexOf("}, [personaStateTurn?.seq]"),
    "순서가 정해져 있지 않으면 재현 불가능한 관찰이 생긴다(A5-α 결정론 계약)",
  );
});

test("[T118/G99] 재주입은 **사기범 턴 경계**에서 순수 함수 판정을 거쳐서만 일어난다", () => {
  const rendered = codeOnly(page);
  const handler = rendered.slice(
    rendered.indexOf("const handleScammerTurnComplete"),
    rendered.indexOf("// 통화 경과 타이머"),
  );
  assert.ok(handler.includes("shouldReinjectTransferState("), "판정을 호출부에 인라인하지 않는다");
  assert.ok(
    handler.includes("userTurnsSinceLastInjection: userTurnsSinceInjectionRef.current"),
    "사용자 발화 카운터를 넘기지 않으면 자기 구동 루프가 된다(G99)",
  );
  assert.ok(
    handler.includes("userTurnsSinceInjectionRef.current = 0"),
    "주입 직후 카운터를 0으로 되돌리지 않으면 매 턴 재주입이 된다(G99)",
  );
  // 카운터를 올리는 자리는 사용자 전사 턴 하나뿐이다(관측 지점 §25.3 (3)).
  assert.ok(rendered.includes("userTurnsSinceInjectionRef.current += 1"));
});

test("[T118/G101] 클라는 전환 상태 문자열을 **만들지 않는다** — 서버 응답을 그대로 쥔다", () => {
  const rendered = codeOnly(page);
  assert.ok(
    rendered.includes("transferStateLineRef.current = result.transferStateLine"),
    "카탈로그가 소유해야 G86 전 필드 순회 검사망(번호·실존 기관명·url/tel)에 들어온다",
  );
  assert.ok(
    !/transferStateLineRef\.current\s*=\s*["'`(]/.test(rendered),
    "클라에서 문자열을 조립하면 그 값이 서버 검사망 밖으로 빠진다",
  );
});

test("[T118/R-1·R-2] 전환 이후 재주입 경로가 클라에서도 닫혀 있다", () => {
  const rendered = codeOnly(page);
  assert.ok(
    rendered.includes("requestCallMode === \"realtime\" && result.announceInstruction"),
    "R-1 — 서버가 지시를 생략하면 클라도 주입하지 않는다",
  );
  // ⭐ **§38.7 6 / G187 갱신(2026-07-29)** — 종전에는 이 자리가
  // `if (shouldRetryVerifyOffer(error)) requestedVerifyRef.current = false` 한 줄을 문자열로
  // 못박고 있었다. 2단 오퍼(§38.4 E)가 들어오면서 boolean이 **단계 상태**로 바뀌었으므로 같은
  // 보호를 새 모양으로 옮긴다 — ⛔ **검사를 지운 것이 아니다**(R-2의 취지 3건을 모두 유지한다).
  assert.ok(
    rendered.includes("retryable: shouldRetryVerifyOffer(error)"),
    "R-2 — 되돌림을 오류 코드로 좁힌다(재시도가 곧 중복 주입 경로)",
  );
  assert.ok(
    rendered.includes("rollbackVerifyOfferPhase({"),
    "R-2 — 롤백 판정은 순수 함수가 소유한다(호출부에 조건을 흩지 않는다)",
  );
  assert.ok(
    !/catch\s*\{\s*\n\s*verify(OfferPhase|AnnounceTurns)Ref\.current\s*=/.test(rendered),
    "무조건 롤백이 남아 있으면 R-2가 무력화된다",
  );
  // ⭐ **G187** — boolean으로 되돌아오면 *"1단계 성공 · 2단계 실패"* 가 **재시도 불가**로 굳어
  // 오퍼가 영영 안 뜬다(T118 R-2가 막으려던 바로 그 실패 방향).
  assert.ok(
    !/requestedVerifyRef/.test(rendered),
    "⛔ 단계 상태를 boolean으로 되돌리지 말 것(G187)",
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ §38 런타임 층 — **컨트롤 가시성이 화면에서 재판정되지 않는다**(관측 불가 지점 방지)
// ══════════════════════════════════════════════════════════════════════════════
test("[§38 / G184] 컨트롤 가시성은 순수 함수가 판정하고 클라 ref 단독 게이팅이 아니다", () => {
  const rendered = codeOnly(page);
  assert.ok(
    rendered.includes("shouldRevealVerifyOffer({"),
    "판정을 화면에 직접 쓰면 브라우저 이벤트 위에서만 관측돼 게이트가 조용히 틀려도 안 잡힌다",
  );
  // ⛔ 종전 조건(문서 존재만 보면 열림)이 화면에 되살아나면 여기서 걸린다.
  assert.ok(
    !/showVerifyTrigger\s*=\s*\n?\s*verifyOffer !== null/.test(rendered),
    "⛔ '문서만 있으면 연다'로 되돌리면 버튼이 다시 예고보다 먼저 뜬다",
  );
  // ⭐ 가시성 판정 입력에 ref가 섞이면 새로고침에서 무너진다(§38.4 D의 ④열).
  assert.ok(
    !/shouldRevealVerifyOffer\(\{[^}]*Ref\.current/.test(rendered),
    "⛔ 컨트롤 가시성을 클라 ref로 게이팅하지 말 것(G184)",
  );
});

test("[§38 / G188] 실시간 경로에 announcedAt을 **찍지** 않는다 — 읽기만 추가했다", () => {
  const rendered = codeOnly(page);
  assert.ok(rendered.includes("data.announcedAt"), "폴백 판정(후보 C)의 읽기 지점");
  assert.ok(
    !/announcedAt\s*:\s*(Timestamp|serverTimestamp|new Date)/.test(rendered),
    "⛔ 클라가 announcedAt을 쓰면 §25.6의 의미 오버로드 기각이 뒤집힌다",
  );
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
